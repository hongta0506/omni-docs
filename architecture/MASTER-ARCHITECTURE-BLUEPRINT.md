# Master Blueprint: Go Clean DDD Architecture & Migration Matrix

> **Tài liệu duy nhất hợp nhất toàn diện kiến trúc hệ thống Omni Core:**
> - Bản đồ 8 Bounded Contexts & 615 endpoints đối chiếu di trú từ ZaloCRM
> - Đặc tả phân tầng Clean Architecture & Sub-module Directory Layout
> - Đa giao thức truy cập (Connect-RPC, RESTful HTTP, WebSocket/SSE)
> - Chiến lược lưu trữ PostgreSQL + Bun ORM và Transactional Outbox
> - Ma trận phân quyền RBAC & UI Permissions
> - Hiện trạng audit hệ thống cũ và lộ trình chuyển đổi

---

# FULL 600+ ENDPOINTS BUSINESS BLUEPRINT & DDD MIGRATION MATRIX
## Kiến Trúc Chuyển Đổi ZaloCRM (Fastify/Node.js/Prisma) Sang Omni-Core (Golang DDD)

> **Tài liệu tham chiếu kiến trúc toàn diện (Architectural Master Blueprint & Traceability Matrix)**  
> Dành cho toàn bộ kỹ sư và AI Coding Agents triển khai chuẩn hóa hệ thống Backend `omni-core`.

---

## 1. TỔNG QUAN ĐỊNH HƯỚNG KIẾN TRÚC & TRIẾT LÝ THIẾT KẾ

### 1.1. Bản chất cốt lõi: Zalo chỉ là một Kênh (Channel), Tâm điểm là Contact
Trong phiên bản cũ (`ZaloCRM`), mã nguồn ban đầu được xây dựng xoay quanh Zalo cá nhân. Tuy nhiên, khi hệ thống mở rộng đa kênh (Omni-channel CRM), **Zalo thực chất chỉ đóng vai trò là một Channel Adapter (Kênh giao tiếp)** ngang hàng với Telegram, Facebook Messenger, Zalo OA, Pancake POS hay WhatsApp.

* **Trọng tâm bất biến (Core Ubiquitous Domain):** Aggregate Root trung tâm của toàn bộ hệ sinh thái là **`Contact` (Khách hàng)** và **`Conversation` (Hội thoại)**.
* Cho dù khách hàng đến từ Zalo cá nhân, Zalo OA, Facebook Fanpage hay Webhook Pancake, mọi dữ liệu đều quy về định danh duy nhất: `ContactID` và `ConversationID` thuộc sở hữu của một `TenantID`.
* **Zero Zalo-Coupling ở Domain:** Domain layer (`internal/customer`, `internal/conversation`) tuyệt đối không phụ thuộc vào Zalo SDK, Zalo API hay cấu trúc dữ liệu riêng của Zalo. Toàn bộ logic giao tiếp với Zalo được đóng gói tại Bounded Context **`Channel & Gateway`** (`internal/channel`).

---

### 1.2. Bản đồ 6 Nhóm Phân Hệ Lớn Tương Ứng 8 Bounded Contexts DDD

Dựa trên phân tích 508 route controllers và 600+ endpoint thực tế ở bản production của ZaloCRM, hệ thống được quy hoạch chuẩn xác vào 8 Bounded Contexts tự chủ:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OMNI-CORE DDD BACKEND                                │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ 1. Identity & Access     │ 2. Channel & Gateway        │ 3. CRM Core (Customer & Chat) │
│    [internal/identity]   │    [internal/channel]       │    [internal/customer]        │
│    • Auth & Security     │    • Zalo Personal (QR/DB)  │    • Contact & Customer Profile│
│    • RBAC & Departments  │    • Zalo OA & Zalo Bot     │    • Lead Pool & Distribution │
│    • User Preferences    │    • Telegram Personal/Bot  │    • Customer Lists & Segment │
│    • Privacy & Audit Log │    • Proxy Egress & Gateway │    • Appointments & Notes     │
│                          │    • External Inboxes       │    [internal/conversation]    │
│                          │                             │    • Multi-channel Chat Engine│
│                          │                             │    • Messages & Realtime WS   │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ 4. Deal & E-Commerce     │ 5. Growth & Intelligence    │ 6. Reporting & Analytics      │
│    [internal/deal]       │    [internal/marketing]     │    [internal/analytics]       │
│    • Deals & Kanban      │    • Tags & CRM Tag Groups  │    • Dashboard Overview       │
│    • Quotes & PDF Engine │    • Campaigns & Broadcasts │    • Response Time & SLA      │
│    • Products & Pricebook│    • Automation & Sequences │    • Conversion Funnels       │
│    • Order Store & POS   │    [internal/aiagent]       │    • Custom Saved Reports     │
│    • Pancake Sync        │    • AI Agents & Providers  │                               │
│                          │    • Knowledge Base (RAG)   │ 7. Platform & Service API     │
│                          │    • Ops Radar Anomaly      │    [internal/serviceapi]      │
│                          │    • Scoring & Engagement   │    • Public OpenAPI & Webhook │
│                          │                             │    • GoClaw External Daemon   │
│                          │                             │    • Media & Watermark S3     │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 2. CHI TIẾT TỪNG MODULE NGHIỆP VỤ & KẾ HOẠCH MIGRATE

---

### PHÂN HỆ 1: IDENTITY & ACCESS CONTROL (`internal/identity`)

#### A. Nghiệp vụ & Giao diện Frontend
* **Frontend Screens:** Màn hình Đăng nhập (`/login`), Quản lý tài khoản cá nhân (`/profile`), Phân quyền nhân viên (`/settings/users`), Cây sơ đồ phòng ban (`/settings/departments`), Cấu hình bảo mật 2FA và chính sách quyền riêng tư (`/settings/privacy`).
* **Trọng tâm nghiệp vụ:** Quản lý vòng đời User, Tenant (Tổ chức), Department, Permission Group (RBAC), User Assignment (phân bổ nhân sự trực chat/bán hàng).

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Xác thực đăng nhập email/password, cấp JWT pair | `modules/auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/refresh` | Xoay vòng Refresh Token (Single-flight) | `modules/auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/logout` | Thu hồi token, xóa session trên Redis | `modules/auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/2fa/setup` | Sinh mã QR TOTP (Google Authenticator) | `modules/auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/2fa/verify` | Xác thực OTP 6 số để kích hoạt 2FA | `modules/auth/auth-routes.ts` |
| `GET` | `/api/v1/me` | Lấy profile, quyền hạn và tổ chức của user hiện tại | `modules/auth/user-routes.ts` |
| `PATCH`| `/api/v1/me` | Cập nhật thông tin cá nhân, avatar, số điện thoại | `modules/auth/user-routes.ts` |
| `GET` | `/api/v1/me/preferences` | Lấy cấu hình cá nhân (theme, âm thanh thông báo) | `modules/auth/user-preference-routes.ts` |
| `PATCH`| `/api/v1/me/preferences` | Lưu cấu hình giao diện của từng user | `modules/auth/user-preference-routes.ts` |
| `GET` | `/api/v1/users` | Danh sách nhân viên trong Tenant (kèm lọc theo phòng ban) | `modules/users/user-routes.ts` |
| `POST` | `/api/v1/users` | Tạo mới nhân viên, gán vai trò ban đầu | `modules/users/user-routes.ts` |
| `POST` | `/api/v1/users/provision`| Cấp tài khoản hàng loạt cho nhân sự | `modules/users/user-routes.ts` |
| `PATCH`| `/api/v1/users/:id` | Cập nhật quyền, trạng thái Active/Suspended | `modules/users/user-routes.ts` |
| `DELETE`| `/api/v1/users/:id` | Xóa mềm hoặc vô hiệu hóa nhân viên | `modules/users/user-routes.ts` |
| `GET` | `/api/v1/departments` | Lấy cây phân cấp phòng ban (Tree structure) | `modules/rbac/department-routes.ts` |
| `POST` | `/api/v1/departments` | Tạo phòng ban mới, chỉ định trưởng phòng | `modules/rbac/department-routes.ts` |
| `PATCH`| `/api/v1/departments/:id` | Cập nhật tên, phòng ban cha (parent_id) | `modules/rbac/department-routes.ts` |
| `DELETE`| `/api/v1/departments/:id` | Xóa phòng ban (kiểm tra ràng buộc nhân sự con) | `modules/rbac/department-routes.ts` |
| `POST` | `/api/v1/departments/:id/members` | Thêm nhân viên vào phòng ban | `modules/rbac/department-routes.ts` |
| `DELETE`| `/api/v1/departments/:id/members/:userId` | Rút nhân viên khỏi phòng ban | `modules/rbac/department-routes.ts` |
| `GET` | `/api/v1/permission-groups` | Danh sách nhóm quyền phân quyền theo ma trận | `modules/rbac/permission-group-routes.ts` |
| `POST` | `/api/v1/permission-groups` | Tạo nhóm quyền tùy biến | `modules/rbac/permission-group-routes.ts` |
| `PUT` | `/api/v1/permission-groups/:id` | Cập nhật chi tiết các quyền CRUD | `modules/rbac/permission-group-routes.ts` |
| `DELETE`| `/api/v1/permission-groups/:id` | Xóa nhóm quyền | `modules/rbac/permission-group-routes.ts` |
| `GET` | `/api/v1/privacy/audit-logs` | Truy vấn nhật ký thao tác dữ liệu nhạy cảm | `modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/data-masking` | Cấu hình ẩn số điện thoại / email nhân sự | `modules/privacy/privacy-routes.ts` |

#### C. Dữ liệu Liên quan & Phụ thuộc (Relations)
* **Bảng Database Postgres:** `users`, `tenants`, `departments`, `department_members`, `permission_groups`, `role_permissions`, `audit_logs`, `user_preferences`.
* **Ràng buộc Invariants (Domain):**
  * Không bao giờ được phép xóa phòng ban nếu vẫn còn nhân sự hoặc phòng ban con đang trực thuộc.
  * Mỗi Tenant bắt buộc phải có tối thiểu một `Owner` hoặc `SuperAdmin`.
  * Token xoay vòng (refresh) sử dụng cơ chế phát hiện tái sử dụng (reuse detection) thông qua Redis whitelist/blacklist.
* **Migration Strategy:**
  * Dữ liệu User và Department từ bảng `users`, `departments` cũ được trích xuất trực tiếp.
  * Mật khẩu hash Bcrypt giữ nguyên độ dài salt để bảo đảm người dùng không bị mất đăng nhập sau khi chuyển giao Go backend.

---

### PHÂN HỆ 2: CHANNEL & GATEWAY (`internal/channel`)

#### A. Nghiệp vụ & Giao diện Frontend
* **Frontend Screens:** Màn hình Quản lý tài khoản Zalo (`/settings/accounts`), Quản lý tài khoản Telegram cá nhân (`/settings/telegram`), Cấu hình Zalo Official Account (`/settings/zalo-oa`), Quản trị Proxy & Egress IP (`/settings/egress-proxy`), Danh mục Webhook tích hợp ngoài (`/settings/integrations`).
* **Trọng tâm nghiệp vụ:** Đóng vai trò là Adapter kết nối thế giới bên ngoài vào hệ thống. Chịu trách nhiệm giữ session đăng nhập Zalo (QR code login, cookie/session refresh), Telegram MTProto session, quản lý cụm proxy xoay vòng để tránh checkpoint/block IP, thu thập tin nhắn thô chuyển thành Domain Event chuẩn.

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
| `GET` | `/api/v1/zalo-accounts` | Danh sách tài khoản Zalo cá nhân đang kết nối | `modules/zalo/account-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/qr` | Khởi tạo phiên quét mã QR đăng nhập Zalo | `modules/zalo/zalo-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/qr/:sessionId` | Long-polling / SSE trạng thái quét mã QR | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/sync` | Kích hoạt quét đồng bộ danh bạ bạn bè từ Zalo | `modules/zalo/zalo-sync-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/labels` | Lấy danh sách nhãn phân loại nội bộ của Zalo | `modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels` | Tạo nhãn đồng bộ lên Zalo Server | `modules/zalo/zalo-labels-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/groups` | Danh sách nhóm chat Zalo mà nick tham gia | `modules/zalo/group-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/groups/scan` | Quét phân tích thành viên trong nhóm Zalo | `modules/zalo/group-scan-routes.ts` |
| `PATCH`| `/api/v1/zalo-accounts/:id/status` | Tạm ngưng hoặc bật kết nối tài khoản | `modules/zalo/account-routes.ts` |
| `DELETE`| `/api/v1/zalo-accounts/:id` | Đăng xuất và gỡ bỏ tài khoản khỏi hệ thống | `modules/zalo/account-routes.ts` |
| `GET` | `/api/v1/telegram-personal/accounts?page=&page_size=` | Danh sách tài khoản Telegram kết nối (Chuẩn `pkg/pagination`) | SPEC-CHANNEL-TG-001 |
| `POST` | `/api/v1/telegram-personal/accounts/init` | Khởi tạo phiên kết nối nick mới và cấp phát proxy SOCKS5 | SPEC-CHANNEL-TG-001 |
| `GET` | `/api/v1/telegram-personal/accounts/:id/qr` | Lấy mã QR Base64 native để quét bằng Telegram app | SPEC-CHANNEL-TG-001 |
| `DELETE` | `/api/v1/telegram-personal/accounts/:id` | Hủy phiên đăng nhập và giải phóng proxy | SPEC-CHANNEL-TG-001 |
| `GET` | `/api/v1/telegram-personal/dialogs?page=&page_size=` | Danh sách hội thoại/nhóm/kênh nick đang tham gia (Phân trang) | SPEC-CHANNEL-TG-001 |
| `POST` | `/api/v1/telegram-personal/groups/:id/sync` | Kích hoạt cào thành viên nhóm nạp vào Lead Pool (ADR-ARCH-009) | SPEC-CHANNEL-TG-001 |
| `GET` | `/api/v1/telegram-personal/groups/:id/members?page=&page_size=` | Danh sách thành viên đã cào kèm phân trang chuẩn | SPEC-CHANNEL-TG-001 |
| `POST` | `/api/v1/telegram-personal/messages/send` | Gửi tin nhắn outbound kèm safety jitter 3s-7s | SPEC-CHANNEL-TG-001 |
| `GET` | `/api/v1/integrations/zalo-oa` | Danh sách các Zalo OA đã liên kết | `modules/integrations/providers/zalo-oa/account-routes.ts` |
| `GET` | `/api/v1/integrations/zalo-oa/oauth`| Sinh URL xác thực OAuth2 Zalo OA | `modules/integrations/providers/zalo-oa/oauth-routes.ts` |
| `POST` | `/api/v1/integrations/zalo-oa/webhook`| Tiếp nhận Webhook tin nhắn từ Zalo OA | `modules/integrations/providers/zalo-oa/webhook-routes.ts` |
| `GET` | `/api/v1/admin/egress` | Danh sách Proxy gán cho các tài khoản | `modules/zalo/egress-admin-routes.ts` |
| `POST` | `/api/v1/admin/egress` | Thêm Proxy mới (HTTP/SOCKS5 có xác thực) | `modules/zalo/egress-admin-routes.ts` |
| `POST` | `/api/v1/admin/egress/test`| Kiểm tra độ trễ (ping) và IP rò rỉ của Proxy | `modules/zalo/egress-routes.ts` |
| `POST` | `/api/v1/admin/egress/bind` | Gán cố định IP Proxy cho một tài khoản cụ thể | `modules/zalo/egress-admin-routes.ts` |

#### C. Dữ liệu Liên quan & Phụ thuộc
* **Bảng Database Postgres:** `channel_accounts`, `zalo_sessions`, `zalo_labels`, `egress_proxies`, `proxy_bindings`, `channel_sync_logs`.
* **Ràng buộc Invariants:**
  * Mỗi tài khoản Zalo cá nhân phải duy trì kết nối qua đúng 1 Proxy duy nhất trong suốt phiên để tránh bị hệ thống Zalo phát hiện bất thường về địa lý và khóa tài khoản.
  * Phiên đồng bộ danh bạ không được gọi liên tục vượt quá 1 lần / 15 phút trên mỗi nick.
* **Migration Strategy:**
  * Toàn bộ mã nguồn kết nối Zalo cũ phụ thuộc vào thư viện `zalo-sdk` NodeJS được tách thành dịch vụ gateway hoặc chuẩn hóa thành connector qua Go runtime (tận dụng kiến trúc goroutine per account giúp tiết kiệm 80% RAM so với Node.js cluster).

---

### PHÂN HỆ 3: CRM CORE — CUSTOMER & CONVERSATION (`internal/customer` & `internal/conversation`)

#### A. Nghiệp vụ & Giao diện Frontend
* **Frontend Screens:** 
  * **Customer Hub:** Danh bạ khách hàng (`/contacts`), Chi tiết khách hàng 360 độ (`/contacts/:id`), Lịch hẹn tương tác (`/contacts/:id/appointments`), Dòng thời gian lịch sử hoạt động (`/contacts/:id/timeline`).
  * **B2B Accounts (Khách hàng Doanh nghiệp):** Danh sách tổ chức/doanh nghiệp (`/accounts`), Chi tiết doanh nghiệp 360 độ (`/accounts/:id`), Liên kết người liên hệ đại diện (Account Contacts).
  * **Lead Pool (Kho Lead):** Sàn nhận Lead tự do (`/lead-pool`), Bảng thống kê phân phối lead cho sale (`/lead-pool/stats`), Cấu hình quy tắc chia chìa khóa trao tay (`/lead-pool/config`).
  * **Chat Console (Trung tâm tin nhắn):** Màn hình Chat đa kênh (`/chat`), Bộ lọc hội thoại nâng cao (`/chat/folders`), Thư viện tin nhắn mẫu (`/chat/presets`), Xử lý tệp đính kèm và gắn watermark chống lộ dữ liệu (`/chat/media`).
* **Trọng tâm nghiệp vụ:** 
  * `Contact` là Aggregate Root tối thượng: Quản lý họ tên, số điện thoại, danh sách mạng xã hội liên kết (Zalo UserID, Telegram ID, Facebook PSID), điểm số quan tâm (Lead Score).
  * `Lead Pool`: Phân phối khách hàng tiềm năng cho đội ngũ Telesale/Tư vấn theo thuật toán Round-Robin hoặc nhận thủ công (Claim Lead).
  * `Conversation & Message`: Hội thoại tập trung, streaming realtime qua WebSocket, lưu vết đọc tin nhắn, gắn nhãn tin nhắn và trích xuất lịch sử tương tác.

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
| `GET` | `/api/v1/accounts` | Danh sách khách hàng doanh nghiệp (B2B Accounts) kèm phân trang, tìm kiếm | `modules/accounts/account-routes.ts` |
| `POST` | `/api/v1/accounts` | Tạo mới khách hàng doanh nghiệp | `modules/accounts/account-routes.ts` |
| `GET` | `/api/v1/accounts/:id` | Thông tin chi tiết hồ sơ doanh nghiệp, mã số thuế, website | `modules/accounts/account-routes.ts` |
| `PUT`  | `/api/v1/accounts/:id` | Cập nhật thông tin doanh nghiệp, địa chỉ, người đại diện | `modules/accounts/account-routes.ts` |
| `DELETE`| `/api/v1/accounts/:id` | Xóa doanh nghiệp (khi không còn Deal hoặc hợp đồng hoạt động) | `modules/accounts/account-routes.ts` |
| `GET` | `/api/v1/accounts/:id/contacts` | Danh sách người liên hệ (Contact) thuộc doanh nghiệp | `modules/accounts/account-routes.ts` |
| `POST` | `/api/v1/accounts/:id/contacts` | Gán người liên hệ vào doanh nghiệp | `modules/accounts/account-routes.ts` |
| `GET` | `/api/v1/contacts` | Danh sách khách hàng kèm phân trang, tìm kiếm đa tiêu chí | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts` | Tạo mới khách hàng thủ công | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id` | Thông tin chi tiết hồ sơ 360 độ của một khách hàng | `modules/contacts/contact-routes.ts` |
| `PATCH`| `/api/v1/contacts/:id` | Cập nhật thông tin khách hàng, số điện thoại, email | `modules/contacts/contact-routes.ts` |
| `DELETE`| `/api/v1/contacts/:id` | Xóa mềm khách hàng | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/merge` | Hợp nhất 2 khách hàng trùng số điện thoại/Zalo | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id/notes` | Lấy danh sách ghi chú nội bộ của sale | `modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/contacts/:id/notes` | Thêm ghi chú mới kèm nhắc tên (@mention) | `modules/contacts/notes-routes.ts` |
| `DELETE`| `/api/v1/notes/:id` | Xóa ghi chú | `modules/contacts/notes-routes.ts` |
| `GET` | `/api/v1/contacts/:id/appointments` | Danh sách lịch hẹn gặp/gọi điện tư vấn | `modules/contacts/appointment-routes.ts` |
| `POST` | `/api/v1/contacts/:id/appointments`| Lên lịch hẹn mới, gửi thông báo nhắc lịch | `modules/contacts/appointment-routes.ts` |
| `PATCH`| `/api/v1/appointments/:id` | Đổi trạng thái lịch hẹn (Hoàn thành / Hủy) | `modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/contacts/:id/timeline` | Lấy dòng thời gian mọi tương tác của khách | `modules/activity/timeline-routes.ts` |
| `GET` | `/api/v1/lead-pool` | Danh sách Lead trong bể chưa được phân bổ | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/claim` | Sale bấm nút nhận Lead vào danh sách cá nhân | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/distribute` | Admin kích hoạt phân bổ tự động theo hạn ngạch | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/stats` | Thống kê số lượng lead tồn, lead đã nhận theo ca | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/customer-lists` | Danh sách các tệp khách hàng phân khúc | `modules/lists/list-routes.ts` |
| `POST` | `/api/v1/customer-lists` | Tạo tệp khách hàng (theo điều kiện lọc hoặc tĩnh) | `modules/lists/list-routes.ts` |