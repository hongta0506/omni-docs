# Conversation & Media Bounded Context — Sơ Đồ Luồng Nghiệp Vụ (Workflows & UML)

> Mô hình hóa các luồng nghiệp vụ thời gian thực, giao thức phân phối tin nhắn hai chiều, Outbox Pattern, Deduplication, và cấu trúc trạng thái vòng đời hội thoại.

---

## 1. Sơ Đồ Tương Tác: Tiếp Nhận Tin Nhắn Đa Kênh (Inbound Message Ingestion)

Luồng tiếp nhận tin nhắn từ Zalo/Telegram/WhatsApp Gateway vào hệ thống với cam kết Deduplication (Redis) và Broadcast tức thời (WebSocket Hub):

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Khách Hàng (Zalo/WA)
    participant GW as Channel Gateway
    participant Redis as Redis Cache (Dedup)
    participant App as Conversation App (CQRS)
    participant DB as PostgreSQL (Bun ORM)
    participant WSHub as WebSocket Hub
    actor Staff as Sales Agent (Web/App UI)

    Customer->>GW: Gửi tin nhắn mới (Văn bản / Ảnh)
    GW->>App: Event: ChannelMessageReceivedEvent (ChannelMsgID, PeerID, Payload)
    
    Note over App,Redis: Bước 1: Kiểm tra chống trùng lặp (Dedup)
    App->>Redis: SETNX msg:dedup:{AccountID}:{ChannelMsgID} 1 (TTL 24h)
    alt Đã tồn tại (Key exists - Trùng lặp)
        Redis-->>App: 0 (Duplicate)
        App-->>GW: ACK 200 (Already Processed - Bỏ qua)
    else Hợp lệ (Key created)
        Redis-->>App: 1 (OK)
        
        Note over App,DB: Bước 2: Ghi dữ liệu nguyên tử (Atomic DB Transaction)
        App->>DB: Tìm hoặc Tạo Conversation theo (TenantID, ChannelType, PeerID)
        App->>DB: INSERT Message (Status: Delivered, Direction: Inbound)
        App->>DB: UPDATE Conversation (LastMessageAt = NOW, UnreadCount = UnreadCount + 1)
        DB-->>App: Commit thành công
        
        App-->>GW: ACK 200 (Ingested)
        
        Note over App,WSHub: Bước 3: Phát tán thời gian thực (Realtime Fan-out)
        App->>WSHub: Broadcast(TenantID, ConversationID, MessageDTO)
        WSHub-->>Staff: WebSocket push event "chat.message.received" (< 50ms)
    end
```

---

## 2. Sơ Đồ Tương Tác: Gửi Tin Nhắn Outbound Qua Outbox Pattern

Đảm bảo nhân viên gửi tin không bị chặn giao diện và tin nhắn chắc chắn được chuyển tới Gateway ngay cả khi có sự cố mạng:

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Sales Agent (UI)
    participant API as HTTP / Connect-RPC Handler
    participant DB as PostgreSQL
    participant Worker as Outbox Dispatcher Worker
    participant GW as Channel Gateway (Zalo/WA Daemon)
    actor Customer as Khách Hàng (Mạng xã hội)

    Staff->>API: POST /api/v1/conversations/{id}/messages
    
    rect rgb(240, 248, 255)
    Note over API,DB: Giao dịch nguyên tử Outbox (Atomic Transaction)
    API->>DB: BEGIN TX
    API->>DB: INSERT Message (Status: Pending, Direction: Outbound)
    API->>DB: INSERT outbox_events (Aggregate: Conversation, Event: MessagePendingSend)
    API->>DB: UPDATE Conversation (LastMessageAt = NOW)
    API->>DB: COMMIT TX
    end

    API-->>Staff: 200 OK (MessageDTO: Pending - Hiện đồng hồ cát trên UI)

    loop Quét định kỳ hoặc nhận tín hiệu Notify (Postgres LISTEN/NOTIFY)
        Worker->>DB: SELECT * FROM outbox_events WHERE status = 'PENDING' LIMIT 50 FOR UPDATE SKIP LOCKED
        Worker->>GW: Call Gateway SendMessage(Payload, ChannelAccount)
        
        alt Gửi thành công sang mạng xã hội
            GW-->>Customer: Chuyển tiếp tin nhắn tới app Zalo/WA
            GW-->>Worker: Success (ChannelMsgID: "zmsg_555")
            Worker->>DB: UPDATE Message SET status = 'Sent', channel_msg_id = 'zmsg_555'
            Worker->>DB: UPDATE outbox_events SET status = 'PROCESSED'
            Worker->>API: Notify WS: "chat.message.sent" (UI đổi 1 tick xanh)
        else Gửi thất bại (Mạng đứt / Tài khoản bị ngắt)
            GW-->>Worker: Error (ErrDisconnected)
            Worker->>DB: UPDATE outbox_events SET retry_count = retry_count + 1, next_retry_at = NOW() + INTERVAL '10s'
            Note over Worker,DB: Quá 3 lần retry: Đánh dấu Failed và báo chuông đỏ cho Sales
        end
    end
```

---

## 3. Sơ Đồ Máy Trạng Thái: Vòng Đời Tin Nhắn (Message Lifecycle)

Trạng thái của một tin nhắn từ lúc khởi tạo đến khi hoàn tất hoặc thu hồi:

```mermaid
stateDiagram-v2
    [*] --> Inbound_Received : Nhận từ Gateway
    Inbound_Received --> Delivered : Đã lưu DB & Phân phối tới UI
    Delivered --> Read : Nhân viên mở xem hội thoại
    
    [*] --> Outbound_Pending : Nhân viên bấm Gửi
    Outbound_Pending --> Sent : Outbox Worker gửi thành công sang Gateway
    Outbound_Pending --> Failed : Lỗi kết nối kênh / Quá số lần retry
    Failed --> Outbound_Pending : Nhân viên bấm "Gửi lại" (Retry manual)
    
    Sent --> Delivered_To_Customer : Gateway nhận biên nhận đã đến máy khách
    Delivered_To_Customer --> Read_By_Customer : Khách đã xem (Kênh hỗ trợ Read Receipt)
    
    Sent --> Recalled : Yêu cầu thu hồi trong vòng 60 phút
    Delivered_To_Customer --> Recalled : Yêu cầu thu hồi thành công
    
    Recalled --> [*]
    Read --> [*]
```

---

## 4. Sơ Đồ Phân Trang Cursor-Based (High-Performance Chat History)

Minh họa cơ chế truy vấn Seek phân trang tin nhắn bằng B-Tree Index composite, triệt tiêu hoàn toàn `OFFSET`:

```mermaid
flowchart TD
    ClientReq["Client Request: GET /messages?cursor=Base64&limit=30"] --> ParseCursor["Decode Base64 Cursor -> timestamp & id"]
    ParseCursor --> CheckCursor{"Có cursor không?"}
    
    CheckCursor -- "Không (Trang đầu tiên)" --> Q1["SELECT * FROM messages<br/>WHERE conversation_id = :cid<br/>ORDER BY sent_at DESC, id DESC<br/>LIMIT 30"]
    CheckCursor -- "Có (Trang tiếp theo)" --> Q2["SELECT * FROM messages<br/>WHERE conversation_id = :cid<br/>AND (sent_at, id) < (:sent_at, :last_id)<br/>ORDER BY sent_at DESC, id DESC<br/>LIMIT 30"]
    
    Q1 --> IndexScan["Sử dụng Index: idx_messages_cursor<br/>(conversation_id, sent_at DESC, id DESC)"]
    Q2 --> IndexScan
    
    IndexScan --> ReturnData["Lấy 30 bản ghi & encode cursor từ phần tử cuối cùng"]
    ReturnData --> Resp["Trả về Client: items + next_cursor"]
```
