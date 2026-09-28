# B2B Account (Khách Hàng Doanh Nghiệp) API Migration & DDD Mapping

> **Tài liệu chuyển dịch:** ZaloCRM Legacy (Node.js/Fastify/Prisma) ➔ Omni-Core (Golang/DDD/Connect-RPC)  
> **Subdomain:** B2B Account / Doanh nghiệp (`internal/customer`)  
> **Mục tiêu:** Quản lý pháp nhân, thông tin doanh nghiệp (Verified Company), mã số thuế, liên kết danh bạ đại diện (Contacts) và bảo vệ toàn vẹn dữ liệu giao dịch (Deals/Contracts).

---

## 1. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Flat handlers per resource phục vụ Frontend Web/SPA (`/api/v1/accounts/*`):
  - `accounts_handler.go`: CRUD doanh nghiệp, phân trang, lọc theo ngành nghề, tìm kiếm tên công ty.
  - `account_contacts_handler.go`: Danh sách và liên kết/gỡ liên kết người đại diện (`/api/v1/accounts/:id/contacts`).
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `AccountService` cho inter-service communication (Deal, Contract, Billing).

---

## 2. Bảng Ánh Xạ Chi Tiết: Legacy API ➔ Go DDD

| # | Phương thức & URL | Node.js Fastify Handler (ZaloCRM) | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Go Repository Port | Connect-RPC Proto Equivalent |
|---|---|---|---|---|---|---|
| **1** | `GET /api/v1/accounts` | `modules/accounts/account-routes.ts`<br>`prisma.account.findMany({ skip, take, where })` | `accounts_handler.go:List` | `queries.ListAccountsHandler` | `repo.ListAccounts(ctx, params)` | `rpc ListAccounts(ListAccountsRequest) returns (ListAccountsResponse)` |
| **2** | `GET /api/v1/accounts/:id` | `modules/accounts/account-routes.ts`<br>`prisma.account.findFirst({ where: { id } })` | `accounts_handler.go:Get` | `queries.GetAccountHandler` | `repo.FindByID(ctx, id)` | `rpc GetAccount(GetAccountRequest) returns (GetAccountResponse)` |
| **3** | `POST /api/v1/accounts` | `modules/accounts/account-routes.ts`<br>`prisma.account.create({ data })` | `accounts_handler.go:Create` | `commands.CreateAccountHandler` | `repo.Save(ctx, va)` | `rpc CreateAccount(CreateAccountRequest) returns (CreateAccountResponse)` |
| **4** | `PUT /api/v1/accounts/:id` | `modules/accounts/account-routes.ts`<br>`prisma.account.update({ where: { id } })` | `accounts_handler.go:Update` | `commands.UpdateAccountHandler` | `repo.FindByID(ctx, id)`<br>`repo.Save(ctx, va)` | `rpc UpdateAccount(UpdateAccountRequest) returns (UpdateAccountResponse)` |
| **5** | `DELETE /api/v1/accounts/:id` | `modules/accounts/account-routes.ts`<br>`prisma.account.delete({ where: { id } })` | `accounts_handler.go:Delete` | `commands.DeleteAccountHandler` | `repo.CountActiveDeals(ctx, id)`<br>`repo.Delete(ctx, id)` | `rpc DeleteAccount(DeleteAccountRequest) returns (DeleteAccountResponse)` |
| **6** | `GET /api/v1/accounts/:id/contacts` | `modules/accounts/account-routes.ts`<br>`prisma.contact.findMany({ where: { accountId: id } })` | `account_contacts_handler.go:List` | `queries.ListAccountContactsHandler` | `repo.ListContactsByAccount(ctx, id, params)` | `rpc ListAccountContacts(...)` |
| **7** | `POST /api/v1/accounts/:id/contacts` | `modules/accounts/account-routes.ts`<br>`prisma.contact.updateMany(...)` | `account_contacts_handler.go:Link` | `commands.LinkAccountContactsHandler` | `repo.LinkContacts(ctx, id, contactIDs, action)` | `rpc LinkAccountContacts(...)` |

---

## 3. Chuyển đổi Model Dữ Liệu (Prisma Schema ➔ Go Aggregate)

### Prisma Model Cũ (`schema.prisma`):
```prisma
model Account {
  id          String    @id @default(uuid())
  orgId       String
  name        String
  taxCode     String?
  industry    String?
  companySize String?
  website     String?
  address     String?
  province    String?
  phone       String?
  email       String?
  notes       String?
  logoUrl     String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  contacts    Contact[]
  deals       Deal[]
  contracts   Contract[]
}
```

### Go Domain Model Mới (`internal/customer/domain/account/`):
```go
package account

import (
    "time"
    "github.com/google/uuid"
    "omni-core/pkg/errors"
)

type Account struct {
    id          uuid.UUID
    tenantID    uuid.UUID
    name        string
    taxCode     *TaxCode
    industry    string
    companySize string
    website     string
    address     *Address
    phone       string
    email       string
    notes       string
    logoURL     string
    createdAt   time.Time
    updatedAt   time.Time
}

type ValidatedAccount struct {
    account *Account
}

func (v *ValidatedAccount) Unwrap() *Account {
    return v.account
}
```

---

## 4. Các Domain Invariants Cần Bảo Vệ

1. **Tên Doanh Nghiệp (Name Invariant):**
   - Bắt buộc không được để trống hoặc chỉ chứa khoảng trắng.
   - Độ dài tối đa 255 ký tự.
2. **Mã Số Thuế (TaxCode Value Object):**
   - Nếu cung cấp, phải tuân thủ định dạng mã số thuế doanh nghiệp Việt Nam (10 chữ số hoặc 13 chữ số có dấu gạch ngang: `^\d{10}(-\d{3})?$|^\d{13}$`).
3. **Bảo Vệ Tính Toàn Vẹn Deal/Contract Khi Xóa (Deletion Invariant):**
   - Tuyệt đối không cho phép xóa doanh nghiệp nếu đang có Deal hoạt động (`activeDeals > 0`).
   - Phải xử lý, điều chuyển hoặc đóng các Deal trước khi xóa Account.
4. **Phân Quyền & Cô Lập Đa Khách Thuê (Multi-Tenant Invariant):**
   - Mọi thao tác truy vấn và biến đổi bắt buộc phải kiểm tra `tenant_id` từ auth context. Không tin tưởng `tenant_id` từ request body/params.
5. **Liên Kết Contact Đơn Nhất:**
   - Một Contact chỉ được liên kết với một Account tại một thời điểm (`account_id` trên `contacts`). Thao tác unlink đặt `account_id = NULL`.
