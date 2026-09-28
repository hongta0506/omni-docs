# Customer & Lead Bounded Context (`internal/customer`)

> Bounded Context phụ trách quản lý Khách hàng hợp nhất (**Unified Golden Contact Record**), Khách hàng tiềm năng (Leads), Kho chia Lead tự động (Lead Pool), Phân nhóm (Segments), Lịch hẹn (Appointments), Ghi chú (Notes), và Chấm điểm tương tác (Scoring).

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/customer` |
| **Tổng số Endpoints** | **92** (16 Core + 7 B2B Accounts + 69 Extended/Submodules) |
| **Aggregate Roots** | `Contact` (Golden Record), `Account` (B2B Enterprise), `LeadPool`, `CustomerList` (Segment), `Appointment` |
| **Entities con** | `ChannelProfile` (Zalo/Telegram/WhatsApp/FB profiles), `ContactNote`, `LeadScoreRule` |
| **Value Objects** | `ContactID`, `AccountID`, `TenantID`, `TaxCodeVO`, `PhoneVO`, `EmailVO`, `LeadScoreVO`, `LifecycleStage` |
| **Giao thức** | Connect-RPC (`customer.v1.CustomerService`), REST (`/api/v1/contacts/*`, `/api/v1/accounts/*`, `/api/v1/lead-pool/*`, ...) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`api-mapping-core.md`](./api-mapping-core.md) | Ánh xạ 16 endpoints cốt lõi `contacts`: CRUD, Filter, Search, Quick-create, Export, Profile timeline. |
| [`mapping-accounts.md`](./mapping-accounts.md) | Ánh xạ 7 endpoints B2B `accounts`: Pháp nhân doanh nghiệp, thông tin thuế, gán liên kết danh bạ đại diện. |
| [`mapping-customer-ext.md`](./mapping-customer-ext.md) | Ánh xạ các endpoints mở rộng: Lead Pool (Claim/Return/Reassign), Customer Lists (Dynamic Segments), Appointments, Notes, Scoring. |
| [`repository-port.md`](./repository-port.md) | Đặc tả tầng Repository Port: `ValidatedContact`, mô hình 2 cuốn sổ, truy vấn Bun ORM và pgx/v5. |

---

## 3. Kiến Trúc Domain "2 Cuốn Sổ" (Unified Contact Record)

```
┌──────────────────────────────────────────────────────────┐
│                   Contact (Aggregate Root)               │
│ - ID: ContactID                                          │
│ - TenantID: TenantID                                     │
│ - FullName: string                                       │
│ - PrimaryPhone: PhoneVO (E.164 verified)                 │
│ - PrimaryEmail: EmailVO                                  │
│ - LifecycleStage: Lead | Customer | Churned              │
│ - AssignedUserID: *UserID                                │
│ - TotalScore: int                                        │
└────────┬─────────────────────┬─────────────────────┬─────┘
         │ 1                   │ 1                   │ 1
         │                     │                     │
         ▼ *                   ▼ *                   ▼ *
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ ZaloProfile     │   │ TelegramProfile │   │ WhatsAppProfile │
│ - ZaloUID       │   │ - TelegramUID   │   │ - PhoneJID      │
│ - AccountID     │   │ - Username      │   │ - AccountID     │
│ - Alias / Tags  │   │ - Phone         │   │ - VerifiedName  │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

---

## 4. Invariants & Nghiệp Vụ Cốt Lõi

1. **Two-Ledger Contact Immutability**:
   - Cuốn sổ mạng xã hội (Zalo/Telegram Profile) không được phép sửa đổi thủ công từ CRM. Chỉ cập nhật khi nhận sync event từ Gateway.
   - Cuốn sổ CRM (CRM Ledger) do nhân viên kinh doanh quản trị, ghi đè hiển thị hợp nhất (Merged View).
2. **SLA Auto-Revoke trong Lead Pool**:
   - Lead phân bổ cho Sales nếu không phát sinh tương tác trong vòng cấu hình SLA (mặc định 24h) sẽ tự động thu hồi về Pool chung và phạt trừ quota của nhân viên.
3. **Phone Uniqueness per Tenant**:
   - Số điện thoại sau khi chuẩn hóa quốc tế (E.164 / +84) là duy nhất cho mỗi Contact trong cùng 1 Tenant.

---

## 5. Thành Phần Dùng Chung & Phụ Thuộc (Shared & Dependencies)

### 5.1 Thành phần dùng chung nội bộ (Internal BC Common)
- `internal/customer/domain/errors.go`: Sentinel errors (`ErrContactNotFound`, `ErrPhoneInvalid`, `ErrLeadAlreadyAssigned`, `ErrLeadPoolCapacityExceeded`).
- `internal/customer/application/common/`:
  - `phone_normalizer.go`: Bộ chuẩn hóa số điện thoại E.164 dùng chung giữa các submodules (contact, leadpool).
  - `pagination.go`: ContactFilter, LeadFilter, AppointmentFilter DTOs.
  - `scoring_helper.go`: Helper tính toán thang điểm tiềm năng RFM nội bộ.

### 5.2 Thành phần phụ thuộc dùng chung toàn hệ thống (Cross-BC Shared Kernel)
- `pkg/context/`: TenantID, UserID context extraction.
- `pkg/events/`: Publish Domain Events (`ContactCreatedEvent`, `LeadAssignedEvent`, `LeadRevokedEvent`). Lắng nghe `ChannelMessageReceivedEvent` để auto-create contact.
- `pkg/pagination/`: PageRequest, PageResponse chuẩn hóa.
- `pkg/errors/`: System error codes & HTTP/RPC status mapper.

