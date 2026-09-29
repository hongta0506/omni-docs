# Deal & E-commerce Bounded Context — Sơ Đồ Luồng Nghiệp Vụ (Workflows & UML)

> Mô hình hóa các luồng nghiệp vụ Phễu bán hàng (Kanban Deal Stages), Vòng đời Báo giá (Quote Lifecycle), và Đồng bộ Đơn hàng Đa kênh từ Pancake POS / KiotViet.

---

## 1. Sơ Đồ Máy Trạng Thái: Vòng Đời Deal Phễu Bán Hàng (Deal Pipeline State Machine)

Quy định các bước chuyển trạng thái hợp lệ và Invariant ràng buộc:

```mermaid
stateDiagram-v2
    [*] --> Lead : Khởi tạo Deal từ Inbound Chat/Web
    
    Lead --> Qualified : Đã xác nhận nhu cầu & ngân sách
    Lead --> Lost : Khách không phù hợp (Phải có LostReason)
    
    Qualified --> Proposal : Đã gửi Báo giá (Quote)
    Qualified --> Lost : Khách dừng nhu cầu
    
    Proposal --> Negotiation : Khách phản hồi đàm phán giá/hợp đồng
    Proposal --> Lost : Khách từ chối báo giá
    
    Negotiation --> Won : Chốt đơn thành công (Yêu cầu ContactID & Amount > 0)
    Negotiation --> Lost : Đàm phán thất bại (Phải có LostReason)
    
    Won --> [*] : Nâng hạng khách hàng trong Customer BC
    Lost --> [*] : Lưu lý do phân tích tỷ lệ rớt đơn
```

---

## 2. Sơ Đồ Tuần Tự: Đồng Bộ Đơn Hàng Pancake POS Về CRM (Pancake Sync Flow)

Luồng đối soát số điện thoại, liên kết đơn hàng với Golden Record và tự động đóng Deal:

```mermaid
sequenceDiagram
    autonumber
    participant Pancake as Pancake POS (Store/Live)
    participant API as Order Webhook Handler
    participant OrderApp as Order Application
    participant CustomerBC as Customer BC (Golden Record)
    participant DealBC as Deal Application
    participant DB as PostgreSQL (Bun ORM)

    Pancake->>API: POST /api/v1/order-store/webhooks/pancake (OrderPayload)
    API->>OrderApp: HandlePancakeOrderSync(Payload)
    
    rect rgb(240, 248, 255)
    Note over OrderApp,CustomerBC: Bước 1: Đối soát định danh khách hàng
    OrderApp->>CustomerBC: FindContactByPhone(E164(Payload.CustomerPhone))
    alt Tìm thấy Contact
        CustomerBC-->>OrderApp: ContactID: "ct_999"
    else Chưa có Contact
        OrderApp->>CustomerBC: QuickCreateContact(Phone, Name, Address)
        CustomerBC-->>OrderApp: ContactID: "ct_new_111"
    end
    end

    rect rgb(245, 255, 245)
    Note over OrderApp,DB: Bước 2: Lưu đơn hàng nguyên tử (Order Snapshot)
    OrderApp->>DB: INSERT order_stores (ID, TenantID, ContactID, TotalAmount, Status: Completed)
    OrderApp->>DB: INSERT order_line_items (Snapshot Product & Prices)
    end

    rect rgb(255, 250, 240)
    Note over OrderApp,DealBC: Bước 3: Tự động đối soát và chốt Deal đang mở
    OrderApp->>DealBC: FindActiveDeal(ContactID)
    alt Có Deal đang mở ở giai đoạn Proposal/Negotiation
        DealBC->>DB: UPDATE deals SET status = 'WON', actual_revenue = TotalAmount, closed_at = NOW()
        DealBC->>DealBC: Publish DealWonEvent
    end
    end

    OrderApp-->>Pancake: 200 OK {"success": true, "order_id": "ord_123"}
```

---

## 3. Sơ Đồ Máy Trạng Thái: Vòng Đời Báo Giá (Quote Lifecycle)

```mermaid
stateDiagram-v2
    [*] --> Draft : Sales tạo báo giá mới
    
    Draft --> PendingApproval : Chiết khấu vượt 10% (Cần Trưởng phòng duyệt)
    PendingApproval --> Approved : Trưởng phòng chấp thuận
    PendingApproval --> Rejected : Trưởng phòng từ chối (Về Draft chỉnh lại)
    
    Draft --> Sent : Gửi link/PDF báo giá cho khách
    Approved --> Sent : Gửi cho khách sau khi duyệt
    
    Sent --> Accepted : Khách đồng ý chốt đơn (Trigger tạo đơn hàng nháp)
    Sent --> RejectedByCustomer : Khách chê đắt / chọn đối thủ
    Sent --> Expired : Quá hạn hiệu lực báo giá (Default: 15 ngày)
    
    Accepted --> [*]
    RejectedByCustomer --> [*]
    Expired --> [*]
```
