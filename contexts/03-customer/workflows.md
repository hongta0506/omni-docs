# Customer & Lead — Đặc Tả Luồng Nghiệp Vụ & Sơ Đồ UML (Workflows)

> **Bounded Context:** `internal/customer`  
> **Nguyên tắc:** Mô hình hóa trực quan bằng Mermaid UML (Sequence Diagrams, State Machine Diagrams, Activity Diagrams).  
> **Phạm vi:** Luồng định danh đa kênh, vòng đời Lead Pool, cơ chế Two-Ledger và Transactional Smart Merge.

---

## 1. Sơ Đồ Định Danh Đa Kênh & Đối Soát Golden Record (Sequence Diagram)

Quy trình giải quyết định danh khi tin nhắn từ một kênh bất kỳ (Zalo, Telegram, Facebook, Pancake) đổ về hệ thống:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Khách hàng
    participant GW as Channel Gateway (Zalo/Telegram/FB)
    participant CoreEvent as Event Bus (Kafka / Internal)
    participant CustApp as Customer Application (CQRS)
    participant CustRepo as Customer Repository (Bun ORM)
    participant Outbox as Transactional Outbox
    participant Sales as Nhân viên Kinh doanh (Web/WS)

    Customer->>GW: Gửi tin nhắn kèm Số điện thoại / UID
    GW->>CoreEvent: Publish ChannelMessageReceivedEvent(tenant_id, channel, uid, phone, payload)
    CoreEvent->>CustApp: Consume Event -> HandleInboundIdentityCommand
    
    rect rgb(240, 248, 255)
        Note over CustApp,CustRepo: Bước 1: Chuẩn hóa & Đối soát 2 cuốn sổ
        CustApp->>CustApp: phone_normalizer.NormalizeE164(phone) -> +84...
        CustApp->>CustRepo: FindByPhone(tenant_id, e164_phone)
        alt Đã tồn tại Contact với SĐT này
            CustRepo-->>CustApp: Return Existing ValidatedContact
            CustApp->>CustApp: LinkChannelProfile(channel, uid, raw_name)
            CustApp->>CustRepo: UpdateContact(vc)
        else Chưa tồn tại Contact
            CustApp->>CustRepo: FindByChannelUID(tenant_id, channel, uid)
            alt Đã có Profile kênh từ trước
                CustRepo-->>CustApp: Return Contact
            else Khách hàng hoàn toàn mới
                CustApp->>CustApp: NewContact(e164_phone, raw_name, Stage=Lead)
                CustApp->>CustRepo: InsertContact(new_vc)
            end
        end
    end

    rect rgb(255, 250, 240)
        Note over CustApp,Outbox: Bước 2: Lưu dữ liệu & Bắn Outbox Event
        CustApp->>Outbox: AppendEvent(ContactCreatedEvent / ChannelProfileLinkedEvent)
        CustApp->>CustRepo: Commit Transaction
    end

    CustApp-->>Sales: Realtime WebSocket Notification (Khách hàng mới / Tin nhắn mới)
```

---

## 2. Máy Trạng Thái Vòng Đời Khách Hàng (Customer Lifecycle State Machine)

Chuyển đổi trạng thái từ lúc là Khách hàng tiềm năng (Lead) đến khi trở thành Khách hàng chính thức (Customer), Trung thành (Loyal) hoặc Rời bỏ (Churned):

```mermaid
stateDiagram-v2
    [*] --> UnassignedLead: Khách hàng mới từ Kênh (Zalo/FB/Form)
    
    state "Kho Lead Chung (Lead Pool)" as Pool {
        UnassignedLead --> AssignedLead: Phân bổ tự động (Round-robin / Quota)
        AssignedLead --> UnassignedLead: Quá hạn SLA 24h không tương tác (SLA Revoked)
    }

    AssignedLead --> QualifiedLead: Sales tương tác hợp lệ (Gọi/Chat/Note/Đặt lịch)
    AssignedLead --> DisqualifiedLead: Khách sai số / Không có nhu cầu
    
    QualifiedLead --> Customer: Hoàn tất đơn hàng đầu tiên (First Order Completed)
    Customer --> LoyalCustomer: Chi tiêu > 10M hoặc mua hàng > 3 lần
    
    Customer --> AtRisk: Không có tương tác hoặc đơn hàng > 60 ngày
    AtRisk --> Churned: Không phản hồi > 120 ngày
    AtRisk --> Customer: Tương tác lại qua chiến dịch Marketing Re-engagement
    
    DisqualifiedLead --> [*]
    Churned --> [*]
```

---

## 3. Quy Trình Thu Hồi Lead Tự Động Theo SLA (Activity Diagram)

Worker kiểm tra vi phạm thời hạn cam kết chăm sóc khách hàng:

```mermaid
graph TD
    A[Start: Worker lead-sla-watcher chạy định kỳ mỗi 5 phút] --> B[Quét các Lead có AssignedUserID != NULL và Status = Assigned]
    B --> C{Thời gian từ lúc gán > SLA cấu hình? Mặc định 24h}
    C -- Không --> D[Bỏ qua, Lead vẫn trong hạn an toàn]
    C -- Có --> E{Có tương tác phát sinh? Ghi chú / Chat / Cuộc gọi / Lịch hẹn}
    E -- Có tương tác --> F[Cập nhật LastInteractedAt, gia hạn thời gian bảo lưu]
    E -- Không có tương tác --> G[Bắt đầu Transaction Thu Hồi Lead]
    G --> H[Set AssignedUserID = NULL, chuyển về Kho Pool]
    H --> I[Ghi ContactActivity: lead_revoked_sla_timeout]
    I --> J[Trừ quota uy tín của Sales vi phạm]
    J --> K[Gửi Push Notification thông báo thu hồi cho Sales & Quản lý]
    K --> L[Publish Domain Event: LeadRevokedEvent]
    L --> M[End]
    D --> M
```

---

## 4. Quy Trình Hợp Nhất Trùng Lặp Thông Minh (Smart Merge Flowchart)

Xử lý giao dịch nguyên tử (Atomic Transaction) khi gộp Source Contact vào Target Contact:

```mermaid
flowchart TD
    Start([Bắt đầu: Gọi POST /contacts/:id/merge-into]) --> CheckInput{Kiểm tra ID nguồn và đích}
    CheckInput -- ID nguồn trùng ID đích --> ErrSame[Lỗi 400: Không thể gộp chính nó]
    CheckInput -- Hợp lệ --> LockDB[Mở Transaction & Pessimistic Lock cả 2 Contact]
    
    LockDB --> CheckCircular{Target đã từng gộp vào Source?}
    CheckCircular -- Có --> ErrCircular[Lỗi 400: Phát hiện vòng lặp Circular Merge]
    
    CheckCircular -- Không --> ExecMerge[Thực thi Hợp Nhất Trong Transaction]
    
    subgraph Transaction [Giao Dịch Hợp Nhất Nguyên Tử]
        ExecMerge --> S1[Cập nhật Source: is_merged = true, merged_into_id = Target.ID]
        S1 --> S2[Chuyển toàn bộ Channel Profiles từ Source sang Target]
        S2 --> S3[Chuyển toàn bộ Đơn hàng Mirrored Orders sang Target]
        S3 --> S4[Chuyển toàn bộ Ghi chú Notes & Lịch hẹn Appointments]
        S4 --> S5[Chuyển toàn bộ Lịch sử hoạt động Contact Activities]
        S5 --> S6[Tính toán lại: Target.TotalSpent += Source.TotalSpent]
        S6 --> S7[Tính toán lại: Target.PurchaseCount += Source.PurchaseCount]
        S7 --> S8[Ghi Log Activity: contact_merged]
    end
    
    Transaction --> Commit[Commit Transaction]
    Commit --> PublishEvent[Publish ContactMergedEvent ra Outbox]
    PublishEvent --> RetSuccess([Trả về HTTP 200: Hợp nhất hoàn tất])
    
    ErrSame --> EndErr([Kết thúc có lỗi])
    ErrCircular --> EndErr
```

---

## 5. Mô Hình Kiến Trúc "Hai Cuốn Sổ" (Two-Ledger Architecture)

Cơ chế phân tách rõ ràng giữa dữ liệu mạng xã hội (bất biến từ Gateway) và dữ liệu quản trị doanh nghiệp (CRM Ledger):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CONTACT AGGREGATE ROOT                          │
│                                                                        │
│  [CRM LEDGER - Doanh Nghiệp Làm Chủ]                                   │
│  - FullName: "Chị Thảo Giám Đốc" (Được sửa đổi tự do)                  │
│  - PrimaryPhone: "+84912345678" (E.164 Duy nhất per Tenant)            │
│  - PrimaryEmail: "thao.tran@thuanphat.vn"                              │
│  - AssignedUserID: "sales_hoang"                                       │
│  - TotalSpent: 15,000,000 VNĐ                                          │
│  - LifecycleStage: Customer                                            │
│  - Tags: ["VIP", "B2B", "Q1-Target"]                                   │
│                                                                        │
│  [SOCIAL PROFILES LEDGER - Read-Only Sync từ Kênh Ngoại Vi]           │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────┐ │
│  │ ZaloProfile           │ │ TelegramProfile       │ │ FBProfile     │ │
│  │ - UID: 88991122       │ │ - UID: 776655         │ │ - PSID: 44332 │ │
│  │ - ZaloNick: Thảo Cute │ │ - Username: @thaotran │ │ - Name: ThaoT │ │
│  │ - Avatar: zalo.cdn/...│ │ - Phone: +84912345678 │ │ - Page: Omni │ │
│  └───────────────────────┘ └───────────────────────┘ └───────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```
