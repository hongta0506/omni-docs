# Marketing & Automation Bounded Context — Sơ Đồ Luồng Nghiệp Vụ (Workflows & UML)

> Mô hình hóa các luồng nghiệp vụ Chiến dịch gửi tin đa kênh (Anti-Ban Broadcast), Kịch bản nuôi dưỡng (Drip Sequence Engine) và Cơ chế Auto-Exit Condition khi nhận Domain Events.

---

## 1. Sơ Đồ Tuần Tự: Gửi Tin Hàng Loạt An Toàn (Anti-Ban Broadcast Dispatcher)

Quy trình điều phối tin nhắn qua Rate Limiter có chèn Random Jitter để bảo vệ tài khoản cá nhân:

```mermaid
sequenceDiagram
    autonumber
    actor Marketer as Chuyên Viên Marketing
    participant API as Campaign Handler
    participant Dispatcher as Campaign Dispatcher Worker
    participant RateLimiter as Account Safety Rate Limiter
    participant ConvBC as Conversation BC (Outbox)
    participant ChannelGW as Channel Gateway (Zalo Personal)

    Marketer->>API: POST /api/v1/campaigns/{id}/start
    API->>Dispatcher: TriggerCampaignExecution(CampaignID)
    
    rect rgb(240, 248, 255)
    Note over Dispatcher: Bước 1: Trích xuất Dynamic Segment tại thời điểm chạy
    Dispatcher->>Dispatcher: ResolveDynamicSegment(FilterCriteria)
    Note right of Dispatcher: Lấy 300 Contacts hợp lệ thời gian thực
    end

    loop Duyệt từng người nhận trong chiến dịch
        Dispatcher->>RateLimiter: RequestPermissionToSend(AccountID)
        
        Note over RateLimiter: Tính toán: Delay = Random(15s, 30s)<br/>Kiểm tra Quota: Max 50 tin/giờ/acc
        RateLimiter-->>Dispatcher: Cho phép gửi (sau khi sleep ngẫu nhiên)
        
        Dispatcher->>ConvBC: SendOutboundMessage(Recipient, TemplateContent)
        ConvBC->>ChannelGW: Dispatch Message to Gateway
        
        alt Gửi thành công
            ChannelGW-->>ConvBC: Success
            Dispatcher->>Dispatcher: UpdateCampaignProgress(SentCount + 1)
        else Kênh bị khóa / Checkpoint (ErrAccountRestricted)
            ChannelGW-->>ConvBC: Error (AccountRestricted)
            Dispatcher->>Dispatcher: PauseCampaign(Status: PAUSED)
            Dispatcher->>Marketer: Bắn cảnh báo khẩn cấp (Email / Telegram)
        end
    end
```

---

## 2. Sơ Đồ Máy Trạng Thái: Vòng Đời Khách Hàng Trong Drip Sequence

Minh họa việc di chuyển qua các bước (Steps) và điều kiện tự động thoát (Auto-Exit):

```mermaid
stateDiagram-v2
    [*] --> Enrolled : Thêm khách hàng vào kịch bản nuôi dưỡng
    
    Enrolled --> Waiting_Step_1 : Lên lịch bước 1 (Sau 1 ngày)
    Waiting_Step_1 --> Step_1_Sent : Gửi tin nhắn mở đầu
    
    Step_1_Sent --> Waiting_Step_2 : Chờ 3 ngày
    Waiting_Step_2 --> Step_2_Sent : Gửi ưu đãi giảm giá
    
    Step_2_Sent --> Completed : Hoàn tất toàn bộ chuỗi kịch bản
    
    Step_1_Sent --> Auto_Exited : Khách hàng nhắn lại tin nhắn (MessageReceived)
    Waiting_Step_2 --> Auto_Exited : Khách chốt đơn thành công (DealWon)
    Step_2_Sent --> Auto_Exited : Khách bấm hủy đăng ký (Unsubscribe)
    
    Auto_Exited --> [*] : Hủy các bước tương lai, cập nhật trạng thái kết thúc sớm
    Completed --> [*]
```

---

## 3. Sơ Đồ Khối: Động Cơ Tự Động Hóa (Automation Rule Engine)

```mermaid
flowchart TD
    InboundEvent[Nhận Domain Event từ EventBus: DealWon, MessageReceived, ContactCreated] --> MatchRule[Lọc Automation Rules đang ACTIVE theo Trigger Event]
    MatchRule --> EvalCondition{Đánh giá điều kiện Condition: Thỏa mãn không?}
    
    EvalCondition -- Không --> Drop[Bỏ qua - Không thực thi]
    EvalCondition -- Có --> ExecActions[Thực thi danh sách Action theo thứ tự]
    
    ExecActions --> Action1[Action 1: Gắn Tag 'VIP' vào Contact]
    ExecActions --> Action2[Action 2: Ghi chú timeline khách hàng]
    ExecActions --> Action3[Action 3: Thoát khỏi Sequence hiện tại]
    
    Action1 --> LogResult[Ghi nhật ký thực thi Automation Log]
    Action2 --> LogResult
    Action3 --> LogResult
```
