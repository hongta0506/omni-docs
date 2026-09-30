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


---

## 4. Quy Trình Kỹ Thuật Đăng Nhập Zalo Cá Nhân (Zalo Personal QR Login Sequence Diagram)

Sơ đồ tuần tự phối hợp 5 thành phần: **Trình duyệt (Vue 3 Client)**, **Omni Core (Go Backend)**, **ZCA Gateway Daemon (Node.js `zca-js`)**, **SOCKS5 Sticky Proxy**, và **Zalo Platform Server**.

```mermaid
sequenceDiagram
    autonumber
    actor User as Nhân viên kinh doanh
    participant Web as Omni Web (Vue 3 Client)
    participant Core as Omni Core (Go DDD Backend)
    participant ZCA as ZCA Gateway (Node.js Daemon)
    participant Proxy as SOCKS5 Proxy
    participant Zalo as Zalo Web Server

    Note over User,Zalo: BƯỚC 1 & 2: KIỂM TRA SĐT & NICK ZALO (LOOKUP)
    User->>Web: Nhập SĐT & bấm "Kiểm tra"
    Web->>Core: POST /api/v1/zalo-accounts/check-phone {phone}
    Core->>ZCA: gRPC LookupUser(system_nick_id, phone)
    ZCA->>Proxy: Outbound TLS request
    Proxy->>Zalo: api.findUser(phone)
    Zalo-->>Proxy: Trả về Profile (displayName, avatar, uid)
    Proxy-->>ZCA: Trả về kết quả
    ZCA-->>Core: Response {displayName, avatarUrl, zaloUid}
    Core->>Core: Kiểm tra trùng nick (Tenant & Owner filter)
    Core-->>Web: Trả về {found, info, duplicate}
    Web->>User: Hiển thị Avatar + Tên nick Zalo để xác nhận

    Note over User,Zalo: BƯỚC 3: KHỞI TẠO QR & QUÉT MÃ (PAIRING)
    User->>Web: Bấm "Xác nhận, quét QR"
    Web->>Core: POST /api/v1/zalo-accounts (Tạo record qr_pending)
    Web->>Core: Join Socket.IO room "account:{accountId}"
    Web->>Core: POST /api/v1/zalo-accounts/{id}/login
    Core->>ZCA: gRPC StartQRLogin(accountId, proxyUrl)
    ZCA->>Proxy: Khởi tạo Zalo instance qua Proxy SOCKS5
    ZCA->>Zalo: zalo.loginQR()
    Zalo-->>ZCA: Event QRCodeGenerated (Image Data)
    ZCA-->>Core: Stream Event QR_GENERATED (Base64)
    Core-->>Web: Socket.IO emit 'zalo:qr' {accountId, qrImage} & HTTP response
    Web->>User: Hiển thị hình ảnh mã QR (render trong modal)

    Note over User,Zalo: QUÉT MÃ & DUYỆT ĐĂNG NHẬP
    User->>Zalo: Dùng app Zalo trên điện thoại quét mã QR
    Zalo-->>ZCA: Event QRCodeScanned {displayName, avatar}
    ZCA-->>Core: Stream Event QR_SCANNED
    Core-->>Web: Socket.IO emit 'zalo:scanned' {displayName}
    Web->>User: Đổi UI: "Đã quét! Đang xác nhận trên điện thoại…"

    User->>Zalo: Bấm "Đăng nhập" xác nhận trên điện thoại
    Zalo-->>ZCA: Event GotLoginInfo {cookie, imei, userAgent}
    ZCA-->>Core: Stream Event LOGIN_SUCCESS {cookies, imei}
    Core->>Core: Mã hóa AES-GCM-256 (Cookie + IMEI)
    Core->>Core: Cập nhật DB: status = 'connected', lastConnectedAt = NOW()
    Core-->>Web: Socket.IO emit 'zalo:connected' {accountId}
    Web->>User: Bước 4 Hoàn tất & Cảnh báo không dùng Zalo Web
```

---

## 5. Quy Trình Kỹ Thuật Đăng Nhập WhatsApp Cá Nhân (WhatsApp Personal QR Multi-Device Sequence Diagram)

Sơ đồ tuần tự phối hợp 5 thành phần: **Trình duyệt (Web Client)**, **Omni Core (Go Backend)**, **WhatsApp Gateway Daemon (Go `whatsmeow`)**, **SOCKS5 Sticky Proxy**, và **WhatsApp Server (`c.whatsapp.net`)**.

```mermaid
sequenceDiagram
    autonumber
    actor User as Nhân viên CSKH/Sale
    participant Web as Omni Web (Frontend Client)
    participant Core as Omni Core (Go DDD Backend)
    participant WA as WhatsApp Gateway (whatsmeow Daemon)
    participant Proxy as SOCKS5 Sticky Proxy
    participant WhatsApp as WhatsApp Server (c.whatsapp.net)

    Note over User,WhatsApp: BƯỚC 1: PRE-CHECK SỐ ĐIỆN THOẠI & PHÂN BỔ PROXY
    User->>Web: Nhập số điện thoại (E.164: +84...) & bấm "Tiếp tục"
    Web->>Core: POST /api/v1/whatsapp-personal/check-phone {phone}
    Core->>Core: Kiểm tra trùng lặp trong Tenant & tra cứu reviveAccountId
    Core->>Core: Cấp phát SOCKS5 Sticky Proxy từ Egress Proxy Pool
    Core-->>Web: Trả về {status: "available", phone, canConnect: true}

    Note over User,WhatsApp: BƯỚC 2: KHỞI TẠO PHIÊN PAIRING QR
    Web->>Core: POST /api/v1/whatsapp-personal/qr/start {phone}
    Core->>WA: Connect-RPC GetLoginQR(accountId, phone, proxyUrl)
    WA->>Proxy: Mở kết nối TCP/TLS qua SOCKS5
    Proxy->>WhatsApp: Thiết lập kết nối Noise Protocol WebSocket
    WhatsApp-->>WA: Noise Pairing Key & QR Payload
    WA-->>Core: Response {sessionId, qrCode, expiresIn: 20}
    Core-->>Web: Trả về {sessionId, qrCode, qrImage, expiresIn}
    Web->>User: Hiển thị mã QR lên giao diện kèm bộ đếm lùi

    Note over User,WhatsApp: BƯỚC 3: QUÉT MÃ QR TRÊN WHATSAPP ĐIỆN THOẠI
    User->>WhatsApp: Mở WhatsApp Mobile -> Linked Devices -> Quét mã QR
    WhatsApp-->>WA: Noise Handshake Confirm & PairSuccess Event
    WA->>WA: Lưu thông tin khóa phiên vào SQLite (/data/sessions.db)
    WA-->>Core: StreamChannelEvents Event: MessageReceived / Connected {jid, pushName}
    Core->>Core: Cập nhật ChannelAccount (status: "ACTIVE", account_uid: JID)
    Core-->>Web: WebSocket/SSE emit 'whatsapp:connected' {accountId, jid}
    Web->>User: Thông báo liên kết thành công & Chuyển sang màn hình quản lý

    Note over User,WhatsApp: BƯỚC 4: BÀN GIAO INBOUND WORKER & HISTORY SYNC
    WA->>WhatsApp: Lắng nghe tin nhắn inbound thời gian thực
    WhatsApp-->>WA: Event MessageReceived (Inbound Message)
    WA-->>Core: StreamChannelEvents: MessageReceivedEvent {sender, content, timestamp}
    Core->>Core: Forward vào Conversation Bounded Context (Không trigger AI nếu Human Mode)
```

---

## 5. Máy Trạng Thái Phiên Đăng Nhập QR (Zalo QR Session State Machine)

```mermaid
stateDiagram-v2
    [*] --> Idle: Mở modal nhập SĐT
    Idle --> LookingUp: Bấm "Kiểm tra" (check-phone)
    LookingUp --> Confirming: Tra cứu thành công (Found/Fallback)
    LookingUp --> Blocked: Trùng nick người khác (Owned by other)
    Blocked --> [*]: Đóng modal

    Confirming --> GeneratingQR: Bấm "Xác nhận, quét QR"
    GeneratingQR --> QRDisplayed: Nhận mã QR (zalo:qr)
    QRDisplayed --> Scanned: Người dùng quét mã (zalo:scanned)
    
    QRDisplayed --> QRExpired: Quá hạn 120s (zalo:qr-expired)
    QRExpired --> GeneratingQR: Tự động retry (< 3 lần)
    QRExpired --> QRDead: Vượt quá 3 lần retry (zalo:qr-session-dead)
    QRDead --> GeneratingQR: Người dùng bấm "Tạo QR mới"

    Scanned --> Connected: Xác nhận trên điện thoại (zalo:connected)
    Connected --> [*]: Hoàn tất (Done)
```
