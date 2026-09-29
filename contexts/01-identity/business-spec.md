# Đặc Tả Nghiệp Vụ Chi Tiết: Identity & Settings Bounded Context (72 Endpoints)

> **Bounded Context:** `internal/identity`  
> **Phạm vi quản lý:** Xác thực danh tính (Authentication), Phân quyền người dùng (RBAC), Cơ cấu phòng ban & tổ chức (Organization/Departments), Bảo vệ dữ liệu cá nhân (Privacy & Data Masking), Cấu hình Workspace (Tenant Settings).

---

## 1. Domain Model, Aggregates & Invariants (Quy Tắc Bất Biến Nghiệp Vụ)

### 1.1 Aggregate Root: `User`
- **Invariants:**
  1. `email` phải đúng chuẩn RFC 5322 và là duy nhất trong cùng một `tenant_id` (cho phép trùng email ở 2 workspace khác nhau).
  2. Mật khẩu (`password_hash`) được băm bằng bcrypt cost >= 12 hoặc Argon2id. Yêu cầu mật khẩu gốc tối thiểu 8 ký tự, gồm ít nhất 1 chữ hoa, 1 chữ số, 1 ký tự đặc biệt.
  3. Mỗi Tenant bắt buộc có ít nhất một tài khoản `super_admin`. Tài khoản `super_admin` gốc không thể bị xóa (`DELETE`), không thể bị chuyển trạng thái `suspended`, và không thể tự gỡ quyền admin của chính mình nếu là super admin duy nhất.
  4. Khi chuyển trạng thái sang `suspended` hoặc `deleted`, toàn bộ token (`access_token`, `refresh_token`), API keys, và các phiên làm việc chủ động (`DeviceSession`) phải bị thu hồi ngay lập tức (broadcast revocation qua Redis).

### 1.2 Entity: `DeviceSession` & `RefreshToken`
- **Invariants:**
  1. `DeviceSession` lưu trữ thông tin: `session_id`, `user_id`, `tenant_id`, `ip_address`, `user_agent`, `device_name`, `refresh_token_hash`, `expires_at`.
  2. Refresh Token Rotation (RTR): Mỗi lần gọi `/api/v1/auth/refresh-token`, Refresh Token cũ bị thu hồi và cấp một cặp Access/Refresh Token mới. Nếu phát hiện Refresh Token cũ đã từng sử dụng được gửi lại, hệ thống nhận diện là hành vi chiếm quyền (token theft) và lập tức thu hồi toàn bộ session của User đó.
  3. Thời hạn hiệu lực: `access_token` có TTL 15 phút; `refresh_token` có TTL 7 ngày (hoặc 30 ngày nếu chọn "Ghi nhớ đăng nhập").

### 1.3 Aggregate Root: `Role` & Phân Quyền `RBAC`
- **Invariants:**
  1. Vai trò mặc định của hệ thống (`system_default: true` như `super_admin`, `admin`, `member`) không thể bị xóa hoặc sửa đổi mã định danh (`role_code`).
  2. Quyền hạn (`Permission`) được phân cấp theo định dạng `<resource>:<action>` (ví dụ: `contacts:read`, `deals:delete`, `settings:manage`).
  3. Ma trận quyền phải tuân thủ tính cô lập phạm vi truy cập dữ liệu (`Scope`):
     - `global`: Toàn bộ workspace/tenant.
     - `department`: Chỉ các tài nguyên thuộc phòng ban của user hoặc phòng ban con.
     - `personal`: Chỉ các tài nguyên do chính user làm chủ sở hữu (`owner_id = user_id`).

### 1.4 Aggregate Root: `MaskingRule` & `Privacy`
- **Invariants:**
  1. Che số điện thoại (`phone_masking`): Định dạng chuẩn ẩn 4 số giữa hoặc chỉ hiển thị 3 số đầu + 3 số cuối (ví dụ: `091****888`).
  2. Hành động mở mặt nạ (`unmask`): Chỉ tài khoản có quyền `privacy:unmask` mới được phép gửi request giải mã SĐT gốc. Mọi lượt unmask bắt buộc phải ghi log kiểm toán (`AuditLog`) gồm: `user_id`, `contact_id`, `reason`, `ip_address`, `timestamp`. Tối đa 50 lần unmask/ngày/user để chống cào trộm data khách hàng.

---

## 2. Chi Tiết Nghiệp Vụ & BDD Cho Từng Phân Hệ Endpoints

### 2.1 Module Auth & Session (35 Endpoints)

#### EP 01-03: Đăng nhập, Đăng ký, Cấp lại Token
- **POST `/api/v1/auth/login`**:
  - **Nghiệp vụ:** Nhận `email`, `password`, `tenant_code` (tùy chọn), thông tin thiết bị (`device_name`). Kiểm tra rate-limit (tối đa 5 lần sai liên tiếp trong 15 phút, khóa IP 30 phút). Kiểm tra trạng thái tài khoản. Nếu kích hoạt MFA, trả về `mfa_required: true` và `temp_token` (TTL 5 phút), không trả JWT. Nếu thông thường, tạo `DeviceSession`, trả về `access_token`, `refresh_token`, `user_profile`.
  - **BDD Scenario:**
    - *Given:* User có email `sale@admatrix.vn` trạng thái `active`, mật khẩu chính xác.
    - *When:* Gửi POST tới `/api/v1/auth/login`.
    - *Then:* Trả về HTTP 200, JWT token hợp lệ, lưu `DeviceSession` mới vào DB và ghi log `AUTH_LOGIN_SUCCESS`.

- **POST `/api/v1/auth/register`**:
  - **Nghiệp vụ:** Tạo một Tenant mới đồng thời với tài khoản chủ sở hữu (`Owner` / `SuperAdmin`). Khởi tạo sẵn các vai trò mặc định (`super_admin`, `admin`, `agent`), phòng ban mặc định (`Phòng Kinh Doanh`, `Chăm Sóc Khách Hàng`), và gán gói dùng thử (Trial Plan).

- **POST `/api/v1/auth/refresh-token`**:
  - **Nghiệp vụ:** Nhận `refresh_token`. Xác thực chữ ký và kiểm tra trạng thái trong Redis/DB. Nếu hợp lệ, cấp `access_token` và `refresh_token` mới, đánh dấu token cũ đã dùng (Rotation).

- **POST `/api/v1/auth/logout`**:
  - **Nghiệp vụ:** Đọc JTI từ token hiện tại, đưa vào Redis Blacklist với TTL bằng thời gian sống còn lại của token. Đánh dấu `DeviceSession` tương ứng là `revoked`.

#### EP 05-07: Quên mật khẩu & Đổi mật khẩu
- **POST `/api/v1/auth/forgot-password`**: Tạo token reset có TTL 15 phút (one-time use), lưu mã băm trong DB, gửi link khôi phục qua email. Nếu email không tồn tại trong hệ thống, vẫn trả về HTTP 200 để chống enumeration attack.
- **POST `/api/v1/auth/reset-password`**: Nhận `token` và `new_password`. Kiểm tra hạn dùng, độ mạnh mật khẩu. Cập nhật `password_hash`, hủy toàn bộ `DeviceSession` hiện có của user.
- **POST `/api/v1/auth/change-password`**: Yêu cầu xác nhận lại `old_password`. Không cho phép đặt trùng mật khẩu hiện tại.

#### EP 08-09: Profile người dùng hiện tại
- **GET `/api/v1/auth/me`**: Trả về thông tin cá nhân, phòng ban, role, danh sách mã quyền hạn phẳng (`permissions: string[]`), và thông tin cấu hình workspace hiện tại.
- **PUT `/api/v1/auth/me`**: Cập nhật `full_name`, `avatar_url`, `phone_number`. Không cho phép tự đổi email hoặc tenant.

#### EP 10-12: Xác thực đa yếu tố (TOTP MFA)
- **POST `/api/v1/auth/mfa/enable`**: Sinh bí mật TOTP (Base32), tạo URL chuẩn `otpauth://totp/Omni:...` và ảnh QR code base64. Lưu tạm secret ở trạng thái `pending`.
- **POST `/api/v1/auth/mfa/verify`**: Nhận mã 6 số từ ứng dụng Authenticator (Google/Microsoft). Nếu khớp với bí mật đang pending, kích hoạt `mfa_enabled = true`, sinh 8 mã dự phòng (Backup Codes) một lần.
- **POST `/api/v1/auth/mfa/disable`**: Yêu cầu nhập mật khẩu tài khoản và mã OTP hợp lệ để hủy MFA.

#### EP 13-15: Quản lý thiết bị & Phiên làm việc (Sessions)
- **GET `/api/v1/auth/sessions`**: Danh sách tất cả session đang active của user, đánh dấu session hiện tại (`is_current: true`).
- **DELETE `/api/v1/auth/sessions/{id}`**: Thu hồi một session cụ thể (đăng xuất từ xa).
- **DELETE `/api/v1/auth/sessions/other`**: Thu hồi toàn bộ session trừ session đang gọi API.

#### EP 16-18: Quản lý API Keys
- **GET `/api/v1/auth/api-keys`**: Danh sách API Keys (chỉ hiển thị 6 ký tự đầu và 4 ký tự cuối của key, ví dụ `omni_live_abc123...xyz`).
- **POST `/api/v1/auth/api-keys`**: Tạo API Key mới với quyền hạn gán trước và thời hạn hết hạn. Token thô chỉ hiển thị một lần duy nhất lúc tạo.
- **DELETE `/api/v1/auth/api-keys/{id}`**: Vô hiệu hóa API Key ngay lập tức.

#### EP 19-20: Đa Tenant & Chuyển đổi Workspace
- **GET `/api/v1/auth/tenants`**: Trả về danh sách tất cả các Tenant/Workspace mà tài khoản có quyền truy cập.
- **POST `/api/v1/auth/switch-tenant`**: Cấp lại Access Token mới gắn với `tenant_id` được chọn sau khi kiểm tra quyền thành viên.

#### EP 21-22: Xác thực Email
- **POST `/api/v1/auth/verify-email`**: Xác thực email bằng mã token gửi trong hòm thư lúc đăng ký.
- **POST `/api/v1/auth/resend-verification`**: Gửi lại email xác thực, rate limit 60 giây/lần.

#### EP 23-25: Audit Logs & Đăng nhập SSO
- **GET `/api/v1/auth/audit-logs`**: Lịch sử đăng nhập, đổi mật khẩu, IP, thiết bị (hỗ trợ phân trang).
- **POST `/api/v1/auth/sso/google` & `/api/v1/auth/sso/callback`**: Tích hợp Google OpenID Connect. Tự động liên kết tài khoản nếu email đã tồn tại và đã xác minh.

#### EP 26-28: Lời mời tham gia Workspace (Invitations)
- **GET `/api/v1/auth/invitations/{token}`**: Kiểm tra lời mời còn hạn hay không.
- **POST `/api/v1/auth/invitations/accept`**: Chấp nhận lời mời, thêm user vào workspace với vai trò đã định sẵn.
- **POST `/api/v1/auth/invitations/reject`**: Từ chối lời mời.

#### EP 29-33: Màn hình khóa, Quyền & Cài đặt an toàn
- **GET `/api/v1/auth/permissions/check`**: Kiểm tra nhanh quyền cho UI (nhận query `perm=contacts:write`).
- **POST `/api/v1/auth/lock-screen` & `/api/v1/auth/unlock-screen`**: Khóa giao diện làm việc tạm thời khi rời máy mà không hủy phiên làm việc.
- **GET & PUT `/api/v1/auth/security-settings`**: Xem và sửa chính sách an ninh tenant: độ phức tạp mật khẩu, thời gian hết hạn session, bắt buộc MFA cho toàn công ty.

#### EP 34-35: Impersonate (Đăng nhập giả lập hỗ trợ)
- **POST `/api/v1/auth/impersonate`**: Chỉ dành cho SuperAdmin cấp hệ thống để đăng nhập vào tài khoản khách hàng xử lý sự cố. Mọi thao tác đều được gắn tag `impersonated_by`.
- **POST `/api/v1/auth/stop-impersonate`**: Trở về tài khoản SuperAdmin ban đầu.

---

### 2.2 Module RBAC & Phân Quyền (18 Endpoints)

#### EP 36-40: Quản lý Vai Trò (Roles)
- **GET `/api/v1/rbac/roles`**: Danh sách tất cả vai trò trong workspace (phân loại vai trò hệ thống vs vai trò tùy chỉnh).
- **POST `/api/v1/rbac/roles`**: Tạo vai trò mới. `role_name` không được rỗng, không được trùng tên trong tenant.
- **GET `/api/v1/rbac/roles/{id}`**: Lấy chi tiết vai trò cùng toàn bộ danh sách permissions đã gán.
- **PUT `/api/v1/rbac/roles/{id}`**: Cập nhật tên, mô tả và danh sách quyền của vai trò.
- **DELETE `/api/v1/rbac/roles/{id}`**: Xóa vai trò tùy chỉnh. Chặn xóa nếu còn ít nhất 1 user đang giữ vai trò này (yêu cầu di dời user trước).

#### EP 41-45: Danh Mục Quyền & Gán Quyền Cho Vai Trò
- **GET `/api/v1/rbac/permissions`**: Danh mục toàn bộ quyền chuẩn của nền tảng Omni (phân theo các Bounded Context: `identity`, `channel`, `customer`, `conversation`, `deal`, `marketing`, `aiagent`, `serviceapi`).
- **GET `/api/v1/rbac/permission-groups`**: Gom nhóm danh mục quyền phục vụ giao diện cây phân quyền trực quan.
- **POST `/api/v1/rbac/roles/{id}/permissions`**: Gán danh sách quyền cho vai trò (ghi đè hoặc bổ sung).
- **DELETE `/api/v1/rbac/roles/{id}/permissions`**: Thu hồi một số quyền khỏi vai trò.
- **GET `/api/v1/rbac/users/{id}/roles`**: Xem tất cả vai trò mà nhân viên đó đang nắm giữ.

#### EP 46-49: Phân Vai Trò Cho Nhân Viên & Phạm Vi Dữ Liệu
- **POST `/api/v1/rbac/users/{id}/roles`**: Phân vai trò cho nhân viên.
- **DELETE `/api/v1/rbac/users/{id}/roles/{role_id}`**: Xóa vai trò của nhân viên.
- **GET `/api/v1/rbac/scopes`**: Danh mục các phạm vi dữ liệu hỗ trợ (`global`, `department`, `personal`).
- **PUT `/api/v1/rbac/users/{id}/scope`**: Thiết lập giới hạn xem dữ liệu cho nhân viên (ví dụ sale chỉ được xem dữ liệu cá nhân).

#### EP 50-53: Sao Chép Vai Trò & Ma Trận Quyền
- **POST `/api/v1/rbac/roles/clone`**: Tạo nhanh một vai trò mới bằng cách sao chép nguyên trạng bộ quyền của một vai trò có sẵn.
- **GET `/api/v1/rbac/roles/{id}/users`**: Danh sách nhân viên đang thuộc vai trò này (hỗ trợ phân trang).
- **GET `/api/v1/rbac/matrix`**: Bảng ma trận tổng hợp: trục ngang là các Role, trục dọc là danh mục Permission.
- **POST `/api/v1/rbac/matrix/batch-update`**: Lưu cập nhật hàng loạt cho nhiều ô trong bảng ma trận quyền chỉ trong 1 transaction duy nhất.

---

### 2.3 Module Privacy & Che Dữ Liệu (9 Endpoints)

#### EP 54-57: Cấu Hình Mặt Nạ Dữ Liệu (Masking Rules)
- **GET `/api/v1/privacy/masking-rules`**: Danh sách các quy tắc che trường dữ liệu nhạy cảm (SĐT, Email, CMND/CCCD, Địa chỉ nhà).
- **POST `/api/v1/privacy/masking-rules`**: Thiết lập quy tắc che mới: chọn trường dữ liệu, kiểu che (giữa/đầu/đuôi), và vai trò được miễn trừ che.
- **PUT `/api/v1/privacy/masking-rules/{id}`**: Sửa đổi cấu hình quy tắc che.
- **DELETE `/api/v1/privacy/masking-rules/{id}`**: Xóa quy tắc che.

#### EP 58-62: Giải Mã & Kiểm Toán Quyền Riêng Tư
- **POST `/api/v1/privacy/unmask`**:
  - **Nghiệp vụ:** Nhận `target_entity_type` (ví dụ `contact`), `target_entity_id`, `field_name` (ví dụ `phone`), `reason` (lý do mở số điện thoại). Kiểm tra quyền hạn `privacy:unmask`. Kiểm tra hạn mức unmask trong ngày. Trả về dữ liệu gốc, đồng thời ghi log vào bảng kiểm toán.
- **GET `/api/v1/privacy/audit-logs`**: Lịch sử xem số điện thoại và thông tin nhạy cảm của toàn bộ nhân viên (ai xem, số nào, khách hàng nào, lúc mấy giờ, lý do gì).
- **GET & PUT `/api/v1/privacy/settings`**: Thiết lập thời gian lưu vết cuộc gọi, chat, và cơ chế tự động hủy dữ liệu sau N tháng tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
- **POST `/api/v1/privacy/export-audit`**: Xuất file Excel/CSV báo cáo tuân thủ quyền riêng tư phục vụ thanh tra an toàn thông tin.

---

### 2.4 Module Users, Departments & Settings (10 Endpoints)

#### EP 63-67: Quản Lý Nhân Viên (Users)
- **GET `/api/v1/users`**:
  - **Nghiệp vụ:** Danh sách nhân viên trong workspace. Query parameters: `page`, `limit`, `search` (tên/email/SĐT), `department_id`, `role_code`, `status`. Trả về JSON chuẩn Pagination: `{ "items": [...], "total": ..., "page": ..., "limit": ..., "totalPages": ..., "hasNext": ... }`.
- **POST `/api/v1/users`**:
  - **Nghiệp vụ:** Tạo hồ sơ nhân viên mới: `email`, `full_name`, `department_id`, `role_id`, `phone_number`. Tự động gửi email kích hoạt tài khoản thiết lập mật khẩu lần đầu.
- **GET `/api/v1/users/{id}`**: Chi tiết nhân viên: thông tin cá nhân, phòng ban, danh sách vai trò, danh sách kênh chat/zalo phụ trách.
- **PUT `/api/v1/users/{id}`**: Sửa thông tin nhân viên: phòng ban, chức danh, số điện thoại, đổi trạng thái.
- **DELETE `/api/v1/users/{id}`**: Vô hiệu hóa tài khoản nhân viên (soft delete/status=suspended). Thu hồi toàn bộ quyền và phiên làm việc, hỗ trợ chuyển giao toàn bộ khách hàng và deal đang phụ trách cho nhân viên khác.

#### EP 68-71: Cây Cơ Cấu Tổ Chức & Phòng Ban (Departments)
- **GET `/api/v1/departments`**: Trả về toàn bộ cây sơ đồ phòng ban dạng phân cấp đa tầng (`parent_id`, `children: []`). Lưu ý: Endpoint dạng cây này không phân trang (anti-pattern nếu chia trang cây).
- **POST `/api/v1/departments`**: Tạo phòng ban mới: `name`, `parent_id` (nếu là phòng ban con), `manager_user_id` (trưởng phòng).
- **PUT `/api/v1/departments/{id}`**: Đổi tên, thay đổi trưởng phòng, chuyển nhánh cấp trên (chặn trường hợp gán `parent_id` thành con cháu của chính nó gây vòng lặp vô tận trong cây).
- **DELETE `/api/v1/departments/{id}`**: Xóa phòng ban. Bắt buộc phòng ban đó không còn nhân viên nào và không còn phòng ban con trực thuộc.

#### EP 72: Cấu Hình Workspace Toàn Cục (Tenant Settings)
- **GET `/api/v1/settings/organization`**: Trả về các cấu hình workspace: tên công ty, logo URL, múi giờ (`timezone`), định dạng tiền tệ (`VND`/`USD`), ngày bắt đầu tuần, cấu hình tích hợp mặc định.

---

## 3. Ma Trận Observability, Logging & Exception Chuẩn

| Nhóm Ngoại Lệ | Danh Sách Lỗi Kỹ Thuật / Domain | Phân Loại `pkg/errors` | Hành Động Hệ Thống | Event Log `pkg/logger` |
|---|---|---|---|---|
| **Xác thực** | Sai mật khẩu, token hết hạn, session bị thu hồi | `CodeUnauthorized` (Terminal) | Chặn truy cập, hủy phiên | `AUTH_UNAUTHORIZED` |
| **Quyền hạn** | Không có permission, vượt phạm vi Scope | `CodeForbidden` (SecurityPolicy) | Trả về 403 Forbidden | `RBAC_ACCESS_DENIED` |
| **Trùng lặp** | Trùng email trong tenant, trùng mã role | `CodeConflict` (Terminal) | Trả về 409 Conflict | `IDENTITY_CONFLICT` |
| **Bảo vệ dữ liệu** | Vượt hạn mức unmask số điện thoại trong ngày | `CodeForbidden` (SecurityPolicy) | Chặn unmask, báo động Admin | `PRIVACY_RATE_LIMIT_EXCEEDED` |
| **Tồn tại** | Không tìm thấy User, Role, Department | `CodeNotFound` (Terminal) | Trả về 404 Not Found | `IDENTITY_NOT_FOUND` |
| **Hạ tầng** | Mất kết nối Redis, DB timeout | `CodeInternal` (Transient) | Tự động retry với backoff | `IDENTITY_DB_RETRY` |
