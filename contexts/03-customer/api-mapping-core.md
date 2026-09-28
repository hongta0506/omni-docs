# Customer API Migration & Frontend Compatibility Mapping

> **Tài liệu chuyển dịch:** ZaloCRM Legacy (Node.js/Fastify/Prisma) ➔ Omni-Core (Golang/DDD/Connect-RPC)  
> **Mục tiêu:** Giữ nguyên contract với Frontend, ánh xạ trực tiếp sang CQRS Application Handlers và Domain Repository.

---

## 1. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Flat handlers per resource phục vụ Frontend Web/SPA (`/api/v1/contacts/*`):
  - `contacts_handler.go`: CRUD, phân trang, lọc bộ nhớ đệm, tìm kiếm nhanh danh bạ.
  - `contact_merge_handler.go`: Hợp nhất thông minh duplicate profile & chuyển đơn hàng.
  - `contact_export_handler.go`: Xuất danh bạ ra Excel/CSV theo stream.
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `CustomerService` cho inter-service communication (Deal, Marketing, Service-API).

---

## 2. Bảng Ánh Xạ Chi Tiết: Legacy API ➔ Go DDD

| # | Phương thức & URL Cũ | Node.js Fastify Handler & Prisma Model | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Go Repository Port | Connect-RPC Proto Equivalent |
|---|---|---|---|---|---|---|
| **1** | `GET /api/v1/contacts` | `contact-routes.ts`<br>`prisma.contact.findMany({ skip, take, where })` | `contacts_handler.go:List` | `queries.ListContactsHandler` | `repo.ListContacts(ctx, params)` | `rpc ListContacts(ListContactsRequest) returns (ListContactsResponse)` |
| **2** | `GET /api/v1/contacts/:id` | `contact-routes.ts`<br>`prisma.contact.findUnique({ where: { id } })` | `contacts_handler.go:Get` | `queries.GetContactHandler` | `repo.FindByID(ctx, id)` | `rpc GetContact(GetContactRequest) returns (GetContactResponse)` |
| **3** | `POST /api/v1/contacts` | `contact-routes.ts`<br>`prisma.contact.create({ data })` | `contacts_handler.go:Create` | `commands.CreateContactHandler` | `repo.FindByPhone(...)`<br>`repo.Save(ctx, vc)` | `rpc CreateContact(CreateContactRequest) returns (CreateContactResponse)` |
| **4** | `POST /api/v1/contacts/:id/merge-into` | `contact-routes.ts`<br>`prisma.$transaction([...])` | `contact_merge_handler.go:Merge` | `commands.MergeContactHandler` | `repo.FindByID(...)`<br>`repo.Save(ctx, vsource)`<br>`repo.Save(ctx, vtarget)` | `rpc MergeContact(MergeContactRequest) returns (MergeContactResponse)` |
| **5** | `POST /api/v1/contacts/:id/profiles` | `contact-routes.ts`<br>`prisma.friend.update({ contactId })` | `contacts_handler.go:LinkProfile` | `commands.LinkChannelProfileHandler` | `repo.FindByID(...)`<br>`repo.Save(ctx, vc)` | `rpc LinkProfile(LinkProfileRequest) returns (LinkProfileResponse)` |
| **6** | `GET /api/v1/contacts/by-zalo-uid/:uid` | `contact-sub-resource-routes.ts`<br>`prisma.friend.findFirst({ where: { zaloUid } })` | `contacts_handler.go:GetByZaloUID` | `queries.GetContactByChannelQuery` | `repo.FindByChannelProfile(ctx, ChannelZalo, accountID, uid)` | `rpc GetContactByProfile(...)` |

---

## 3. Chuyển đổi Model Dữ Liệu (Prisma Schema ➔ Go Aggregate)

### Prisma Model Cũ (`schema.prisma`):
```prisma
model Contact {
  id           String   @id @default(uuid())
  displayName  String
  primaryPhone String?
  primaryEmail String?
  leadScore    Int      @default(0)
  isMerged     Boolean  @default(false)
  mergedIntoId String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  // Relations
  friends      Friend[] // Đại diện cho các profile Zalo
}
```

### Go Domain Aggregate Mới:
```go
// Contact là Aggregate Root độc lập, bảo vệ toàn vẹn Invariants
type Contact struct {
    id           uuid.UUID
    displayName  string
    primaryPhone string
    primaryEmail string
    leadScore    LeadScore          // Invariant: MAX(profiles)
    profiles     []*ChannelProfile  // Entities con thuộc Aggregate
    isMerged     bool               // Invariant: Merged contact không được thêm profile
    mergedIntoID *uuid.UUID
    events       []DomainEvent      // Transactional Outbox
}
```

---

## 4. Danh sách các bước Migrate cho Developer

1. **Bước 1 — Repository SQL Implementation (`sqlc`):**
   - Viết các câu query SQL trong `internal/customer/infrastructure/postgres/queries.sql`.
   - Sinh code `sqlc` để có type-safe SQL không dùng ORM.
   - Viết `PostgresContactRepository` cài đặt interface `ContactRepository`.

2. **Bước 2 — Connect-RPC Handler:**
   - Cài đặt `CustomerServiceServer` từ `gen/go/customer/v1/customerv1connect`.
   - Map request từ gRPC/JSON sang CQRS Commands/Queries.
   - Map domain aggregate sang response Protobuf.

3. **Bước 3 — Đăng ký Route:**
   - Mount Connect-RPC handler vào `pkg/httpserver` mux:
     ```go
     path, handler := customerv1connect.NewCustomerServiceHandler(customerServer)
     mux.Handle(path, handler)
     ```
