# Service API & External Gateway Bounded Context — Sơ Đồ Luồng Nghiệp Vụ (Workflows & UML)

> Mô hình hóa các luồng bảo mật HMAC-SHA256, Xác thực IP Whitelist, Chống Replay Attack, Webhook Outbound Delivery với Exponential Backoff và SLA Breach Engine.

---

## 1. Sơ Đồ Tuần Tự: Xác Thực Chữ Ký Số HMAC & Chống Tấn Công Replay Attack

Quy trình lọc và kiểm tra tính toàn vẹn của request từ bên thứ ba trước khi đưa vào Domain logic:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Partner App / GoClaw Bot
    participant Mux as HTTP ServeMux (Go 1.22+)
    participant SecMW as HMAC & Security Middleware
    participant Redis as Redis Cache (Nonce / Clock)
    participant App as Service API Application (CQRS)
    participant CoreBC as Customer/Conversation BC

    Client->>Mux: POST /api/v1/service/messages/send
    Note over Client,Mux: Headers: X-Service-Key, X-Timestamp, X-Signature<br/>Body: {"recipient":"0988...","text":"..."}

    Mux->>SecMW: Chuyển tiếp request
    
    rect rgb(255, 245, 245)
    Note over SecMW: Bước 1: Kiểm tra Timestamp (Anti-Replay)
    SecMW->>SecMW: Delta = |ServerClock - X-Timestamp|
    alt Delta > 300 giây (5 phút)
        SecMW-->>Client: 401 Unauthorized (ErrTimestampExpired)
    end
    end

    rect rgb(245, 255, 245)
    Note over SecMW: Bước 2: Kiểm tra IP Whitelist
    SecMW->>SecMW: Match Client IP with CIDR List
    alt IP không nằm trong Whitelist
        SecMW-->>Client: 403 Forbidden (ErrIPNotAllowed)
    end
    end

    rect rgb(240, 248, 255)
    Note over SecMW: Bước 3: Tính toán & So sánh Chữ Ký HMAC-SHA256
    SecMW->>SecMW: Message = Method + "\n" + URI + "\n" + Timestamp + "\n" + Body
    SecMW->>SecMW: ExpectedSig = HMAC_SHA256(SecretKey, Message)
    SecMW->>SecMW: ConstantTimeCompare(ExpectedSig, X-Signature)
    alt Chữ ký không khớp
        SecMW-->>Client: 401 Unauthorized (ErrInvalidHMACSignature)
    end
    end

    SecMW->>App: Cho phép đi tiếp (Inject ServiceKeyClaims to Context)
    App->>CoreBC: Thực thi nghiệp vụ gửi tin nhắn
    CoreBC-->>App: Result Message Sent
    App-->>Client: 200 OK {"success": true, "message_id": "msg_123"}
```

---

## 2. Sơ Đồ Tuần Tự: Giao Nhận Webhook Outbound & Exponential Backoff Retry

Cơ chế gửi sự kiện ra ngoài hệ thống đối tác kèm khả năng chịu lỗi mạng:

```mermaid
sequenceDiagram
    autonumber
    participant EventBus as Domain Event Bus
    participant HookEng as Webhook Delivery Engine
    participant DB as PostgreSQL (Bun ORM)
    participant Partner as Partner Webhook Endpoint

    EventBus->>HookEng: Sự kiện: ContactCreatedEvent / MessageReceivedEvent
    HookEng->>DB: Lấy danh sách WebhookSubscription đang ACTIVE theo TenantID & EventType
    
    loop Duyệt từng Subscriber
        HookEng->>Partner: POST Payload (Headers: X-Omni-Signature, X-Delivery-ID)
        
        alt Đối tác phản hồi 200 OK trong < 5s
            Partner-->>HookEng: 200 OK
            HookEng->>DB: INSERT delivery_logs (Status: SUCCESS, Attempt: 1)
        else Đối tác timeout hoặc trả lỗi 5xx
            Partner-->>HookEng: 503 Service Unavailable / Timeout
            HookEng->>DB: INSERT delivery_logs (Status: RETRYING, Attempt: 1, NextRetryAt: NOW + 30s)
            
            Note over HookEng,Partner: Retry lần 2 (sau 30s), lần 3 (sau 2m), lần 4 (sau 10m)...
            alt Thành công ở lần retry tiếp theo
                HookEng->>Partner: Retry POST Payload
                Partner-->>HookEng: 200 OK
                HookEng->>DB: UPDATE delivery_logs (Status: SUCCESS)
            else Thất bại sau 5 lần retry (Max Attempts)
                HookEng->>DB: UPDATE delivery_logs (Status: FAILED)
                HookEng->>EventBus: Publish WebhookDeliveryPermanentlyFailedEvent (Cảnh báo quản trị)
            end
        end
    end
```

---

## 3. Sơ Đồ Máy Trạng Thái: Đo Lường & Báo Cáo Vi Phạm SLA

Vòng đời theo dõi thời gian phản hồi (First Response Time) của cuộc hội thoại:

```mermaid
stateDiagram-v2
    [*] --> TrackingStarted : Khách hàng mới gửi tin nhắn đầu tiên
    
    TrackingStarted --> CompletedWithinSLA : Sales phản hồi trong thời hạn (< 15 phút)
    TrackingStarted --> Breached : Quá 15 phút không có tin nhắn phản hồi
    
    Breached --> Alerted : Gửi cảnh báo vi phạm tới Trưởng nhóm
    Alerted --> Escalated : Quá 30 phút vẫn chưa phản hồi (Báo động Giám đốc)
    Alerted --> ResolvedLate : Sales phản hồi sau khi vi phạm
    Escalated --> ResolvedLate : Sales phản hồi sau khi bị escalate
    
    CompletedWithinSLA --> [*] : Ghi nhận Performance Metrics tốt
    ResolvedLate --> [*] : Ghi nhận Vi Phạm SLA vào Báo cáo Hiệu Suất
```
