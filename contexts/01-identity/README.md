# Identity & Settings Bounded Context (`internal/identity`)

> Bounded Context nền tảng phụ trách Xác thực (Authentication), Phân quyền người dùng (RBAC 4 cấp), Quản trị cấu trúc tổ chức phòng ban (Departments), Hồ sơ nhân viên (Users) và Cấu hình hệ thống Tenant (Tenant Settings).

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/identity` |
| **Tổng số Endpoints** | **72** (Auth: 35, RBAC: 18, Privacy/Masking: 9, Users/Depts/Settings: 10) |
| **Aggregate Roots** | `User`, `Role`, `Tenant`, `Department` |
| **Entities con** | `DeviceSession`, `Permission`, `ApiKey`, `AuditLogEntry`, `DataMaskingRule` |
| **Value Objects** | `UserID`, `TenantID`, `RoleID`, `EmailVO`, `HashedPasswordVO`, `UserRole`, `PermissionScope` |
| **Giao thức** | Connect-RPC (`identity.v1.IdentityService`), REST (`/api/v1/auth/*`, `/api/v1/users/*`, `/api/v1/rbac/*`, `/api/v1/settings/*`) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`api-mapping.md`](./api-mapping.md) | Ánh xạ toàn bộ 72 endpoints từ Fastify (`auth`, `rbac`, `privacy`, `users`, `departments`, `settings`) sang Go Handlers & Connect-RPC. |
| [`repository-port.md`](./repository-port.md) | Đặc tả Interface Repository tầng Domain: `ValidatedUser`, `ValidatedRole`, `TenantContext` và Bun ORM implementations. |

---

## 3. Kiến Trúc Phân Quyền RBAC 4 Cấp (Hierarchical RBAC)

Mô hình phân quyền đa cấp độ đảm bảo cách ly dữ liệu giữa các chi nhánh và nhân viên:

```
┌────────────────────────────────────────────────────────┐
│               Tenant (Organization Root)               │
│ - ID: TenantID                                         │
│ - Plan: Free | Pro | Enterprise                        │
│ - DataIsolation: Multi-tenant Row-Level Security (RLS) │
└───────────────────────────┬────────────────────────────┘
                            │ 1
                            ▼ *
┌────────────────────────────────────────────────────────┐
│                   Department / Team                    │
│ - ID: DepartmentID                                     │
│ - ParentDepartmentID: *DepartmentID (Cây phân cấp)     │
│ - ManagerUserID: UserID                                │
└───────────────────────────┬────────────────────────────┘
                            │ 1
                            ▼ *
┌────────────────────────────────────────────────────────┐
│                  User (Aggregate Root)                 │
│ - ID: UserID                                           │
│ - Email: EmailVO                                       │
│ - PasswordHash: HashedPasswordVO (Argon2id / bcrypt)   │
│ - Status: Active | Suspended | Inactive                │
│ - AssignedRoleIDs: []RoleID                            │
└───────────────────────────┬────────────────────────────┘
                            │ *
                            ▼ *
┌────────────────────────────────────────────────────────┐
│                  Role & Permissions                    │
│ - System Roles: SuperAdmin, OrgAdmin, Manager, Staff   │
│ - Scope Levels:                                        │
│   1. Global (Toàn hệ thống - SuperAdmin)               │
│   2. Tenant (Toàn công ty - OrgAdmin)                  │
│   3. Department (Phòng ban - Manager)                  │
│   4. Personal (Chỉ dữ liệu do mình tạo/phụ trách)      │
└────────────────────────────────────────────────────────┘
```

---

## 4. Invariants & Business Rules Cốt Lõi

1. **Email Unique per Tenant**: Không cho phép 2 tài khoản trùng email trong cùng 1 Tenant (hỗ trợ 1 email tham gia nhiều Tenant qua Tenant Switcher).
2. **SuperAdmin Immutable**: Không được phép xóa hoặc hạ quyền tài khoản `Owner` ban đầu của Tenant.
3. **Session Revocation (Single Sign-On / Force Logout)**: Khi User đổi mật khẩu hoặc bị vô hiệu hóa, toàn bộ JWT token và `DeviceSession` đang lưu trong Redis phải bị revoke ngay lập tức (Blacklist qua Token JTI).
4. **Data Masking (Quyền riêng tư)**: Nhân viên cấp Staff chỉ được thấy số điện thoại đã che (`0987***321`), trừ khi có quyền `privacy.unmask_phone` và hành động unmask phải được ghi `AuditLog`.

---

## 5. Thành Phần Dùng Chung & Phụ Thuộc (Shared & Dependencies)

### 5.1 Thành phần dùng chung nội bộ (Internal BC Common)
- `internal/identity/domain/errors.go`: Sentinel errors cho Identity (`ErrUserNotFound`, `ErrEmailAlreadyExists`, `ErrInvalidPassword`, `ErrTenantSuspended`).
- `internal/identity/application/common/`:
  - `claims.go`: Struct DTO claims trích xuất sau khi verify token nội bộ.
  - `filters.go`: `UserFilter`, `TenantFilter`, `DepartmentFilter` DTOs nhúng `pkg/pagination.PaginationParam`.
  - `password.go`: Port PasswordHasher interface nội bộ.
- `internal/identity/interfaces/http/middleware/`: AuthMiddleware, RequireRoleMiddleware, TenantExtractor nội bộ.

### 5.2 Thành phần phụ thuộc dùng chung toàn hệ thống (Cross-BC Shared Kernel)
- `pkg/auth/`: JWT token generator & validator, RBAC permission evaluator (`UserClaims`, `Role`, `TokenService`).
- `pkg/context/`: TenantID, UserID context injection cho HTTP/RPC handlers.
- `pkg/events/`: Publish các Domain Events (`UserCreatedEvent`, `UserPasswordChangedEvent`, `TenantSuspendedEvent`).
- `pkg/pagination/`: `PaginationParam`, `PageResult[T]` chuẩn hóa toàn hệ thống.
- `pkg/errors/`: System error codes (`ErrorCode`, `AppError`) & HTTP/RPC status mapper.

---

## 6. Quy Chuẩn Phân Trang & Bộ Lọc (Pagination & Filter Specification)

Tất cả các endpoint danh sách (GetList/Query) trong Identity Bounded Context tuân thủ quy chuẩn:

1. **Bộ lọc tầng Application (`application/common/filters.go`)**:
   - Mọi DTO lọc nghiệp vụ (`UserFilter`, `DepartmentFilter`, `TenantFilter`) **bắt buộc nhúng (embed)** `pagination.PaginationParam`.
   - Cung cấp sẵn các phương thức `Offset()`, `Limit()`, `Normalize()`.

2. **Query Handlers (`application/<submodule>/queries.go`)**:
   - Struct Query nhúng Filter hoặc nhận trực tiếp Filter DTO:
     ```go
     type ListUsersQuery struct {
         common.UserFilter
     }
     ```
   - Handler tính `offset` và `limit` qua `q.Offset()`, `q.Limit()` sau khi `Normalize()`, không tính toán thủ công.
   - Kết quả trả về dùng generic `pagination.PageResult[*domain.User]`.

3. **HTTP Delivery (`interfaces/http/`)**:
   - Query params chuẩn: `?page=1&limit=20&query=...&role=...`.
   - Parse `page`, `limit` vào `PaginationParam` nhúng trong Filter.
   - Response JSON cấu trúc đồng nhất:
     ```json
     {
       "items": [...],
       "total": 100,
       "page": 1,
       "pageSize": 20,
       "totalPages": 5,
       "hasNext": true
     }
     ```

