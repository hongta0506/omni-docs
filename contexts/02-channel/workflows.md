# Channel & Gateway — Đặc Tả Luồng Nghiệp Vụ & Sơ Đồ UML (Workflows)

> **Bounded Context:** `internal/channel`  
> **Phạm vi:** Luồng điều phối tin nhắn Inbound/Outbound, Cơ chế Sticky Proxy, và Watchdog giám sát phiên kết nối.

---

## 1. Sơ Đồ Điều Phối Tin Nhắn Vào / Ra (Inbound & Outbound Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor ExternalUser as Khách Ngoài Kênh (Zalo/Telegram/FB)
    participant ChannelNet as Máy Chủ Kênh Ngoại Vi
    participant Proxy as SOCKS5 Proxy Pool
    participant GatewayWorker as Channel Worker (Goroutine per Account)
    participant RateLimiter as Outbound Rate Limiter & Token Bucket
    participant EventBus as Internal Event Bus (Kafka / Go Channel)

    Note over ExternalUser,GatewayWorker: LUỒNG TIN NHẮN ĐẾN (INBOUND FLOW)
    ExternalUser->>ChannelNet: Gửi tin nhắn chat
    ChannelNet->>Proxy: WebSocket / TLS Traffic
    Proxy->>GatewayWorker: Forward Stream Data
    GatewayWorker->>GatewayWorker: Parse Protocol Payload & Normalize
    GatewayWorker->>EventBus: Publish ChannelMessageReceivedEvent
    Note over EventBus: Event chuyển tiếp sang Conversation & Customer BC

    Note over GatewayWorker,ExternalUser: LUỒNG TIN NHẮN ĐI (OUTBOUND FLOW)
    EventBus->>RateLimiter: Lệnh gửi tin từ CRM (SendMessageCommand)
    RateLimiter->>RateLimiter: Áp dụng Leaky Bucket (Delay 3-7s per msg)
    RateLimiter->>GatewayWorker: Dispatch Message to Account Worker
    GatewayWorker->>Proxy: Outbound Packet qua IP Sticky Proxy
    Proxy->>ChannelNet: Forward to Social Platform Server
    ChannelNet-->>ExternalUser: Tin nhắn xuất hiện trên máy khách hàng
```

---

## 2. Máy Trạng Thái Phiên Kết Nối Tài Khoản (Channel Session State Machine)

```mermaid
stateDiagram-v2
    [*] --> Disconnected: Tạo mới tài khoản
    
    Disconnected --> PairingQR: Khởi tạo mã QR đăng nhập
    PairingQR --> Connected: Người dùng quét mã và xác nhận thành công
    PairingQR --> Disconnected: Quá hạn 120s (Timeout)
    
    Connected --> Reconnecting: Mất kết nối mạng / Ping fail
    Reconnecting --> Connected: Tái kết nối thành công (trong 5 lần thử)
    Reconnecting --> SessionExpired: Máy chủ kênh trả về 401 Unauthorized / Token Expired
    
    Connected --> Banned: Bị nền tảng khóa tài khoản (Spam detection)
    
    SessionExpired --> PairingQR: Yêu cầu nhân viên quét lại QR
    Banned --> [*]
```

---

## 3. Sơ Đồ Điều Phối Kép: Official vs Unofficial Routing Flow

```mermaid
flowchart TD
    subgraph Inbound["LUỒNG TIN NHẮN VÀO (INBOUND)"]
        direction TB
        ExtMsg[Khách hàng gửi tin nhắn từ Social Network]
        ExtMsg --> CheckType{Loại Kênh & Chế Độ?}
        
        CheckType -->|Official: Zalo OA, Meta, Tele Bot| OffHook[HTTPS Webhook / Long Polling]
        CheckType -->|Unofficial: Zalo Cá nhân, WA Baileys, Tele MTProto| UnoffSocket[WebSocket / MTProto TCP qua Sticky Proxy]
        
        OffHook --> VerifySig[Xác thực HMAC Signature & OAuth Token]
        UnoffSocket --> DecryptPayload[Giải mã gói tin Session Secret AES]
        
        VerifySig --> Normalize[Chuẩn hóa thành ChannelMessageReceivedEvent]
        DecryptPayload --> Normalize
        
        Normalize --> InternalBus[(Internal Event Bus / Kafka)]
        InternalBus --> BCs[Conversation BC & Customer BC]
    end

    subgraph Outbound["LUỒNG TIN NHẮN RA (OUTBOUND)"]
        direction TB
        CRMSend[CRM Dispatch Outbound Message] --> CheckOutMode{Chế Độ Kênh?}
        
        CheckOutMode -->|Official| OffSend[Meta / Zalo Cloud API Client]
        CheckOutMode -->|Unofficial| JitterLimiter[Rate Limiter Token Bucket: Delay 3-7s + Jitter]
        
        OffSend --> HeaderCheck[Kiểm tra 24h/48h Messaging Window & Quota]
        HeaderCheck --> PostAPI[POST HTTPS Direct API]
        
        JitterLimiter --> ProxyRoute[SOCKS5 Residential Sticky Proxy]
        ProxyRoute --> SocketSend[Push WebSocket/TCP Packet to Platform]
        
        PostAPI --> DoneMsg[Message Delivered]
        SocketSend --> DoneMsg
    end
```

