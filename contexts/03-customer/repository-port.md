# Customer Repository Port Specification

> **Package:** `omni-core/internal/customer/domain`  
> **Interface:** `ContactRepository`  
> **Design Pattern:** ValidatedAggregate Pattern (`Save` chỉ nhận `*ValidatedContact`)

---

## 1. Interface Definition

```go
type ContactRepository interface {
    FindByID(ctx context.Context, id uuid.UUID) (*Contact, error)
    FindByPhone(ctx context.Context, phone string) (*Contact, error)
    FindByChannelProfile(ctx context.Context, channel ChannelType, channelAccountID, externalUserID string) (*Contact, error)
    Save(ctx context.Context, contact *ValidatedContact) error
    ListContacts(ctx context.Context, params ListContactsParams) ([]*Contact, int64, error)
}
```

---

## 2. Chi tiết từng phương thức

### `FindByID(ctx context.Context, id uuid.UUID) (*Contact, error)`
- **Mục đích:** Tải toàn bộ aggregate `Contact` cùng các `ChannelProfile` con theo UUID.
- **Invariants bảo đảm:** 
  - Trả về `*Contact` tái tạo đầy đủ state (bao gồm `profiles`, `leadScore`, `isMerged`).
  - Không gọi event khi tái tạo từ DB (sử dụng internal hydration, không emit `ContactCreatedEvent`).
- **Lỗi:** Trả về `common.NewNotFoundError` nếu không tìm thấy.

---

### `FindByPhone(ctx context.Context, phone string) (*Contact, error)`
- **Mục đích:** Tìm kiếm liên hệ duy nhất theo số điện thoại chính (`primary_phone`).
- **Index yêu cầu trong DB:** `CREATE UNIQUE INDEX idx_contacts_phone_tenant ON contacts(primary_phone, tenant_id) WHERE primary_phone != '';`
- **Lỗi:** Trả về `nil, nil` nếu không có (để handler kiểm tra trùng), lỗi nếu DB lỗi.

---

### `FindByChannelProfile(ctx context.Context, channel ChannelType, channelAccountID, externalUserID string) (*Contact, error)`
- **Mục đích:** Tra cứu Contact sở hữu profile mạng xã hội cụ thể (ví dụ: Zalo user ID trên 1 nick Zalo cụ thể).
- **Index yêu cầu trong DB:** `CREATE UNIQUE INDEX idx_channel_profiles_identity ON channel_profiles(channel_type, channel_account_id, external_user_id);`
- **Use case:** Webhook từ Zalo/Facebook/Telegram đến -> tra cứu ra ngay Contact tương ứng trong hệ thống.

---

### `Save(ctx context.Context, contact *ValidatedContact) error`
- **Mục đích:** Upsert `Contact` và các `ChannelProfile` liên quan, đồng thời lưu Domain Events vào Transactional Outbox trong **CÙNG MỘT TRANSACTION**.
- **Quy tắc an toàn (Invariant Gate):**
  - **CHỈ NHẬN `*ValidatedContact`**: Không có cách nào lưu một Contact chưa qua `contact.Validate()`. Trình biên dịch Go bảo vệ invariant này.
  - Xử lý atomic outbox:
    ```go
    events := contact.PullEvents()
    for _, ev := range events {
        outboxRepo.Insert(ctx, tx, ev)
    }
    ```
- **Xử lý Merge:**
  - Nếu `contact.IsMerged() == true`, cập nhật `merged_into_id`, xóa các profile cũ hoặc gán lại.

---

### `ListContacts(ctx context.Context, params ListContactsParams) ([]*Contact, int64, error)`
- **Mục đích:** Truy vấn danh sách phân trang theo Tenant, hỗ trợ lọc theo ChannelType và tìm kiếm text.
- **Tham số:**
  - `TenantID`: Bắt buộc để cô lập dữ liệu đa người thuê (Multi-tenancy).
  - `Search`: LIKE / Trigram search trên `display_name` và `primary_phone`.
  - `Limit` / `Offset`: Điều khiển phân trang từ `common.PaginationParam`.
