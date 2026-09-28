# Identity & Settings — Ánh Xạ Endpoint Chi Tiết (72 Routes)

> Tài liệu đối chiếu chi tiết 72 API routes từ module `auth`, `rbac`, `privacy`, `users`, `departments`, `settings` sang **Go Clean CQRS Handlers** và **Connect-RPC Services**.

---

## 0. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Flat HTTP Handlers per resource (`/api/v1/auth/*`, `/api/v1/users/*`, `/api/v1/departments/*`, `/api/v1/rbac/*`, `/api/v1/settings/*`):
  - `auth_handler.go`: Đăng nhập, đăng ký, refresh token, thu hồi phiên làm việc, MFA.
  - `users_handler.go`: CRUD người dùng, phân bổ phòng ban, reset mật khẩu nhân viên.
  - `departments_handler.go`: Cây cơ cấu tổ chức và phòng ban.
  - `rbac_handler.go`: Vai trò (roles), nhóm quyền hạn (permission groups), ma trận quyền.
  - `privacy_handler.go`: Mặt nạ dữ liệu khách hàng (data masking rules).
  - `settings_handler.go`: Cấu hình hệ thống Tenant.
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `IdentityService` cho Inter-service token verification và RPC callers.

---

## 1. Module Auth & Phiên Đăng Nhập (35 Endpoints)

| HTTP Method | Route Cũ (Fastify) | Go Handler (CQRS) | Connect-RPC Service & Method | Mô Tả Nghiệp Vụ |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | `commands.LoginHandler` | `IdentityService.Login` | Đăng nhập bằng Email/Password, cấp JWT Access + Refresh token |
| `POST` | `/api/v1/auth/register` | `commands.RegisterHandler` | `IdentityService.Register` | Đăng ký tài khoản và khởi tạo Tenant mới |
| `POST` | `/api/v1/auth/refresh-token` | `commands.RefreshTokenHandler` | `IdentityService.RefreshToken` | Cấp mới access token bằng refresh token (xoay vòng token) |
| `POST` | `/api/v1/auth/logout` | `commands.LogoutHandler` | `IdentityService.Logout` | Hủy session, đưa JWT JTI vào Redis blacklist |
| `POST` | `/api/v1/auth/forgot-password` | `commands.ForgotPasswordHandler` | `IdentityService.ForgotPassword` | Tạo reset token và gửi email khôi phục mật khẩu |
| `POST` | `/api/v1/auth/reset-password` | `commands.ResetPasswordHandler` | `IdentityService.ResetPassword` | Đặt lại mật khẩu mới với reset token |
| `POST` | `/api/v1/auth/change-password` | `commands.ChangePasswordHandler` | `IdentityService.ChangePassword` | Đổi mật khẩu cho user đang đăng nhập |
| `GET` | `/api/v1/auth/me` | `queries.GetCurrentUserHandler` | `IdentityService.GetCurrentUser` | Lấy profile và danh sách quyền của user hiện tại |
| `PUT` | `/api/v1/auth/me` | `commands.UpdateProfileHandler` | `IdentityService.UpdateProfile` | Cập nhật thông tin cá nhân (tên, avatar, điện thoại) |
| `POST` | `/api/v1/auth/mfa/enable` | `commands.EnableMFAHandler` | `IdentityService.EnableMFA` | Khởi tạo xác thực 2 yếu tố TOTP (QR code) |
| `POST` | `/api/v1/auth/mfa/verify` | `commands.VerifyMFAHandler` | `IdentityService.VerifyMFA` | Xác thực OTP TOTP để kích hoạt MFA |
| `POST` | `/api/v1/auth/mfa/disable` | `commands.DisableMFAHandler` | `IdentityService.DisableMFA` | Hủy xác thực 2 yếu tố (cần mật khẩu xác nhận) |
| `GET` | `/api/v1/auth/sessions` | `queries.ListSessionsHandler` | `IdentityService.ListSessions` | Danh sách các thiết bị đang đăng nhập |
| `DELETE` | `/api/v1/auth/sessions/:id` | `commands.RevokeSessionHandler` | `IdentityService.RevokeSession` | Đăng xuất thiết bị từ xa |
| `DELETE` | `/api/v1/auth/sessions/other` | `commands.RevokeOtherSessionsHandler` | `IdentityService.RevokeOtherSessions` | Đăng xuất khỏi tất cả các thiết bị khác |
| `GET` | `/api/v1/auth/api-keys` | `queries.ListApiKeysHandler` | `IdentityService.ListApiKeys` | Danh sách API Key của user/tenant |
| `POST` | `/api/v1/auth/api-keys` | `commands.CreateApiKeyHandler` | `IdentityService.CreateApiKey` | Tạo mới API Key có giới hạn quyền |
| `DELETE` | `/api/v1/auth/api-keys/:id` | `commands.RevokeApiKeyHandler` | `IdentityService.RevokeApiKey` | Thu hồi API Key |
| `POST` | `/api/v1/auth/switch-tenant` | `commands.SwitchTenantHandler` | `IdentityService.SwitchTenant` | Chuyển đổi workspace/tenant làm việc |
| `GET` | `/api/v1/auth/tenants` | `queries.ListUserTenantsHandler` | `IdentityService.ListUserTenants` | Danh sách các tenant mà user tham gia |
| `POST` | `/api/v1/auth/verify-email` | `commands.VerifyEmailHandler` | `IdentityService.VerifyEmail` | Xác nhận email tài khoản qua token |
| `POST` | `/api/v1/auth/resend-verification` | `commands.ResendVerificationHandler` | `IdentityService.ResendVerification` | Gửi lại email xác nhận tài khoản |
| `GET` | `/api/v1/auth/audit-logs` | `queries.ListAuthAuditLogsHandler` | `IdentityService.ListAuthAuditLogs` | Lịch sử đăng nhập, đổi mật khẩu, IP truy cập |
| `POST` | `/api/v1/auth/sso/google` | `commands.GoogleLoginHandler` | `IdentityService.SSOGoogle` | Đăng nhập SSO qua Google OAuth 2.0 |
| `POST` | `/api/v1/auth/sso/callback` | `commands.SSOCallbackHandler` | `IdentityService.SSOCallback` | Callback xử lý token SSO |
| `GET` | `/api/v1/auth/invitations/:token` | `queries.GetInvitationHandler` | `IdentityService.GetInvitation` | Kiểm tra tính hợp lệ của lời mời vào tenant |
| `POST` | `/api/v1/auth/invitations/accept` | `commands.AcceptInvitationHandler` | `IdentityService.AcceptInvitation` | Chấp nhận lời mời tham gia workspace |
| `POST` | `/api/v1/auth/invitations/reject` | `commands.RejectInvitationHandler` | `IdentityService.RejectInvitation` | Từ chối lời mời |
| `GET` | `/api/v1/auth/permissions/check` | `queries.CheckPermissionHandler` | `IdentityService.CheckPermission` | Kiểm tra nhanh quyền hạn cho UI feature flag |
| `POST` | `/api/v1/auth/lock-screen` | `commands.LockScreenHandler` | `IdentityService.LockScreen` | Khóa phiên màn hình tạm thời |
| `POST` | `/api/v1/auth/unlock-screen` | `commands.UnlockScreenHandler` | `IdentityService.UnlockScreen` | Mở khóa màn hình bằng mã PIN/mật khẩu |
| `GET` | `/api/v1/auth/security-settings`| `queries.GetSecuritySettingsHandler`| `IdentityService.GetSecuritySettings` | Xem chính sách mật khẩu, thời gian hết hạn session |
| `PUT` | `/api/v1/auth/security-settings`| `commands.UpdateSecuritySettingsHandler`| `IdentityService.UpdateSecuritySettings` | Cập nhật chính sách an toàn thông tin tenant |
| `POST` | `/api/v1/auth/impersonate` | `commands.ImpersonateUserHandler` | `IdentityService.Impersonate` | SuperAdmin đăng nhập giả lập hỗ trợ khách hàng |
| `POST` | `/api/v1/auth/stop-impersonate`| `commands.StopImpersonateHandler` | `IdentityService.StopImpersonate` | Thoát chế độ đăng nhập giả lập |

---

## 2. Module RBAC & Phân Quyền (18 Endpoints)

| HTTP Method | Route Cũ (Fastify) | Go Handler (CQRS) | Connect-RPC Service & Method | Mô Tả Nghiệp Vụ |
|---|---|---|---|---|
| `GET` | `/api/v1/rbac/roles` | `queries.ListRolesHandler` | `RBACService.ListRoles` | Lấy danh sách vai trò trong tenant |
| `POST` | `/api/v1/rbac/roles` | `commands.CreateRoleHandler` | `RBACService.CreateRole` | Tạo mới vai trò tùy chỉnh |
| `GET` | `/api/v1/rbac/roles/:id` | `queries.GetRoleHandler` | `RBACService.GetRole` | Xem chi tiết vai trò và danh mục quyền |
| `PUT` | `/api/v1/rbac/roles/:id` | `commands.UpdateRoleHandler` | `RBACService.UpdateRole` | Sửa tên, mô tả và cấp quyền cho vai trò |
| `DELETE` | `/api/v1/rbac/roles/:id` | `commands.DeleteRoleHandler` | `RBACService.DeleteRole` | Xóa vai trò tùy chỉnh (chặn xóa vai trò hệ thống) |
| `GET` | `/api/v1/rbac/permissions` | `queries.ListPermissionsHandler` | `RBACService.ListPermissions` | Danh mục toàn bộ quyền hệ thống phân theo nhóm |
| `GET` | `/api/v1/rbac/permission-groups` | `queries.ListPermGroupsHandler` | `RBACService.ListPermissionGroups` | Danh sách nhóm quyền nghiệp vụ |
| `POST` | `/api/v1/rbac/roles/:id/permissions` | `commands.AssignRolePermsHandler` | `RBACService.AssignPermissions` | Gán danh sách quyền cho vai trò |
| `DELETE` | `/api/v1/rbac/roles/:id/permissions` | `commands.RemoveRolePermsHandler` | `RBACService.RemovePermissions` | Thu hồi quyền khỏi vai trò |
| `GET` | `/api/v1/rbac/users/:id/roles` | `queries.GetUserRolesHandler` | `RBACService.GetUserRoles` | Lấy các vai trò của 1 nhân viên |
| `POST` | `/api/v1/rbac/users/:id/roles` | `commands.AssignUserRolesHandler` | `RBACService.AssignUserRoles` | Phân vai trò cho nhân viên |
| `DELETE` | `/api/v1/rbac/users/:id/roles/:role_id` | `commands.RemoveUserRoleHandler` | `RBACService.RemoveUserRole` | Xóa vai trò khỏi nhân viên |
| `GET` | `/api/v1/rbac/scopes` | `queries.ListScopesHandler` | `RBACService.ListScopes` | Danh sách phạm vi dữ liệu (Global/Tenant/Dept/Own) |
| `PUT` | `/api/v1/rbac/users/:id/scope` | `commands.UpdateUserScopeHandler` | `RBACService.UpdateUserScope` | Giới hạn phạm vi dữ liệu của nhân viên |
| `POST` | `/api/v1/rbac/roles/clone` | `commands.CloneRoleHandler` | `RBACService.CloneRole` | Sao chép nhanh một vai trò có sẵn |
| `GET` | `/api/v1/rbac/roles/:id/users` | `queries.ListUsersByRoleHandler` | `RBACService.ListUsersByRole` | Danh sách nhân viên đang giữ vai trò |
| `GET` | `/api/v1/rbac/matrix` | `queries.GetPermissionMatrixHandler` | `RBACService.GetMatrix` | Ma trận quyền tổng quan của toàn bộ roles |
| `POST` | `/api/v1/rbac/matrix/batch-update` | `commands.BatchUpdateMatrixHandler` | `RBACService.BatchUpdateMatrix` | Cập nhật ma trận phân quyền hàng loạt |

---

## 3. Module Privacy & Che Dữ Liệu (9 Endpoints)

| HTTP Method | Route Cũ (Fastify) | Go Handler (CQRS) | Connect-RPC Service & Method | Mô Tả Nghiệp Vụ |
|---|---|---|---|---|
| `GET` | `/api/v1/privacy/masking-rules` | `queries.ListMaskingRulesHandler` | `PrivacyService.ListMaskingRules` | Danh sách quy tắc che số điện thoại, CCCD, email |
| `POST` | `/api/v1/privacy/masking-rules` | `commands.CreateMaskingRuleHandler` | `PrivacyService.CreateMaskingRule` | Tạo quy tắc che dữ liệu mới |
| `PUT` | `/api/v1/privacy/masking-rules/:id`| `commands.UpdateMaskingRuleHandler` | `PrivacyService.UpdateMaskingRule` | Cập nhật phạm vi áp dụng quy tắc che |
| `DELETE`| `/api/v1/privacy/masking-rules/:id`| `commands.DeleteMaskingRuleHandler` | `PrivacyService.DeleteMaskingRule` | Xóa quy tắc che dữ liệu |
| `POST` | `/api/v1/privacy/unmask` | `commands.UnmaskDataHandler` | `PrivacyService.UnmaskData` | Giải mã hiển thị SĐT gốc (yêu cầu quyền + ghi audit) |
| `GET` | `/api/v1/privacy/audit-logs` | `queries.ListPrivacyAuditLogsHandler` | `PrivacyService.ListAuditLogs` | Lịch sử nhân viên đã unmask dữ liệu khách hàng |
| `GET` | `/api/v1/privacy/settings` | `queries.GetPrivacySettingsHandler` | `PrivacyService.GetSettings` | Xem cài đặt bảo mật và lưu vết cuộc gọi/chat |
| `PUT` | `/api/v1/privacy/settings` | `commands.UpdatePrivacySettingsHandler` | `PrivacyService.UpdateSettings` | Cấu hình bật/tắt ghi âm, thời gian lưu log |
| `POST` | `/api/v1/privacy/export-audit` | `commands.ExportPrivacyAuditHandler` | `PrivacyService.ExportAudit` | Xuất file báo cáo tuân thủ quyền riêng tư |

---

## 4. Module Users, Departments & Settings (10 Endpoints)

| HTTP Method | Route Cũ (Fastify) | Go Handler (CQRS) | Connect-RPC Service & Method | Mô Tả Nghiệp Vụ |
|---|---|---|---|---|
| `GET` | `/api/v1/users` | `queries.ListUsersHandler` | `IdentityService.ListUsers` | Danh sách nhân viên trong tenant (tìm kiếm, lọc) |
| `POST` | `/api/v1/users` | `commands.CreateUserHandler` | `IdentityService.CreateUser` | Thêm mới nhân viên, gửi email kích hoạt |
| `GET` | `/api/v1/users/:id` | `queries.GetUserHandler` | `IdentityService.GetUser` | Chi tiết hồ sơ nhân viên, phòng ban, vai trò |
| `PUT` | `/api/v1/users/:id` | `commands.UpdateUserHandler` | `IdentityService.UpdateUser` | Cập nhật chức danh, phòng ban, trạng thái |
| `DELETE` | `/api/v1/users/:id` | `commands.DeactivateUserHandler` | `IdentityService.DeactivateUser` | Vô hiệu hóa tài khoản nhân viên |
| `GET` | `/api/v1/departments` | `queries.ListDepartmentsHandler` | `OrganizationService.ListDepartments` | Cây sơ đồ phòng ban công ty |
| `POST` | `/api/v1/departments` | `commands.CreateDepartmentHandler` | `OrganizationService.CreateDepartment` | Tạo phòng ban mới |
| `PUT` | `/api/v1/departments/:id` | `commands.UpdateDepartmentHandler` | `OrganizationService.UpdateDepartment` | Sửa tên, đổi trưởng phòng, chuyển nhánh cấp trên |
| `DELETE` | `/api/v1/departments/:id` | `commands.DeleteDepartmentHandler` | `OrganizationService.DeleteDepartment` | Xóa phòng ban (chuyển nhân viên sang phòng khác) |
| `GET` | `/api/v1/settings/organization` | `queries.GetTenantSettingsHandler` | `OrganizationService.GetSettings` | Cấu hình chung của tenant: logo, múi giờ, định dạng tiền |
