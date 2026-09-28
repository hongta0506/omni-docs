# Customer & Lead Bounded Context (`internal/customer`)

> Bounded Context phụ trách quản lý Khách hàng hợp nhất (**Unified Golden Contact Record**), Khách hàng tiềm năng (Leads), Kho chia Lead tự động (Lead Pool), Phân nhóm (Segments), Lịch hẹn (Appointments), Ghi chú (Notes), và Chấm điểm tương tác (Scoring).

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/customer` |
| **Tổng số Endpoints** | **92** (16 Core + 76 Extended/Submodules) |
| **Aggregate Roots** | `Contact` (Golden Record), `LeadPool`, `CustomerList` (Segment), `Appointment` |
| **Entities con** | `ChannelProfile` (Zalo/Telegram/WhatsApp/FB profiles), `ContactNote`, `LeadScoreRule` |
| **Value Objects** | `ContactID`, `TenantID`, `PhoneVO`, `EmailVO`, `LeadScoreVO`, `LifecycleStage` |
| **Giao thức** | Connect-RPC (`customer.v1.CustomerService`), REST (`/api/v1/contacts/*`, `/api/v1/lead-pool/*`, ...) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`api-mapping-core.md`](./api-mapping-core.md) | Ánh xạ 16 endpoints cốt lõi `contacts`: CRUD, Filter, Search, Quick-create, Export, Profile timeline. |
| [`mapping-customer-ext.md`](./mapping-customer-ext.md) | Ánh xạ 76 endpoints mở rộng: Lead Pool (Claim/Return/Reassign), Customer Lists (Dynamic Segments), Appointments, Notes, Scoring. |
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
