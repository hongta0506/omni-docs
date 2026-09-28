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
| `GET` | `/api/v1/telegram-personal` | Danh sách tài khoản Telegram cá nhân kết nối | `modules/integrations/providers/telegram-personal/routes.ts` |
| `POST` | `/api/v1/telegram-personal/login` | Gửi mã xác thực đăng nhập qua số điện thoại | `modules/integrations/providers/telegram-personal/routes.ts` |
| `POST` | `/api/v1/telegram-personal/verify`| Nhập mã SMS / OTP Telegram để lưu session | `modules/integrations/providers/telegram-personal/routes.ts` |
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
| `GET` | `/api/v1/conversations` | Danh sách hội thoại đang mở (kèm tin nhắn mới nhất) | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/:id/messages`| Tải lịch sử tin nhắn trong hội thoại | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages`| Gửi tin nhắn văn bản, ảnh, tài liệu ra kênh | `modules/chat/message-handler.ts` |
| `POST` | `/api/v1/conversations/:id/read` | Đánh dấu đã đọc toàn bộ tin nhắn | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/chat/presets` | Danh sách mẫu câu trả lời nhanh (Quick reply) | `modules/chat/preset-routes.ts` |
| `POST` | `/api/v1/chat/presets` | Tạo mới mẫu câu trả lời nhanh | `modules/chat/preset-routes.ts` |
| `GET` | `/api/v1/chat/folders` | Cây thư mục quản lý hội thoại theo nhóm/phòng | `modules/chat/folder-routes.ts` |

#### C. Dữ liệu Liên quan & Phụ thuộc
* **Bảng Database Postgres:** `contacts`, `accounts`, `account_contacts`, `contact_identities` (mapping Zalo/Phone), `contact_notes`, `appointments`, `lead_pool_items`, `lead_assignments`, `customer_lists`, `conversations`, `messages`, `chat_presets`.
* **Ràng buộc Invariants:**
  * Doanh nghiệp (`Account`) bắt buộc có tên không rỗng; Mã số thuế (nếu có) phải đúng định dạng chuẩn 10 hoặc 13 chữ số.
  * Không cho phép xóa cứng hoặc xóa mềm Doanh nghiệp nếu còn Deal đang ở trạng thái mở (`Open`/`In Progress`).
  * Một Contact chỉ có thể thuộc tối đa 1 Doanh nghiệp tại một thời điểm (`account_id` trên `contacts`).
  * Số điện thoại của Contact phải được chuẩn hóa theo chuẩn E.164 (ví dụ `+8490...`).
  * Một Lead trong Lead Pool tại một thời điểm chỉ cho phép 1 Sale duy nhất giữ quyền Claim (bảo vệ bằng Distributed Lock qua Redis hoặc Postgres `FOR UPDATE SKIP LOCKED`).
  * Khi 2 Contact được hợp nhất (`MergeContact`), toàn bộ tin nhắn, ghi chú, lịch hẹn và Deal cũ đều được trỏ về Contact mới, đồng thời gắn cờ `is_merged = true` ở bản ghi cũ.

---

### PHÂN HỆ 4: DEAL, SALES PIPELINE & E-COMMERCE (`internal/deal`)

#### A. Nghiệp vụ & Giao diện Frontend
* **Frontend Screens:** Màn hình Bảng bán hàng Kanban (`/deals`), Chi tiết Deal (`/deals/:id`), Báo giá & Xuất PDF (`/quotes`), Danh mục sản phẩm (`/products`), Bảng giá theo chính sách (`/pricebook`), Cấu hình liên kết đơn hàng Pancake POS (`/settings/pancake`).
* **Trọng tâm nghiệp vụ:** Quản lý hành trình chốt sales: Giai đoạn (Stage), Giá trị cơ hội, Sản phẩm trong deal, Quy trình duyệt báo giá nhiều cấp, Tự động đẩy đơn hàng sang hệ thống Pancake POS hoặc sàn thương mại điện tử.

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
| `GET` | `/api/v1/deals` | Danh sách Deal hiển thị dạng Kanban hoặc bảng | `modules/deals/deal-routes.ts` |
| `POST` | `/api/v1/deals` | Tạo Deal mới gắn liền với một Contact | `modules/deals/deal-routes.ts` |
| `GET` | `/api/v1/deals/:id` | Chi tiết Deal, lịch sử đổi trạng thái, sản phẩm | `modules/deals/deal-routes.ts` |
| `PATCH`| `/api/v1/deals/:id/stage`| Kéo thả đổi giai đoạn Deal trên bảng Kanban | `modules/deals/deal-stage-routes.ts` |
| `POST` | `/api/v1/deals/:id/won` | Đánh dấu Deal thành công (Won) | `modules/deals/deal-routes.ts` |
| `POST` | `/api/v1/deals/:id/lost`| Đánh dấu Deal thất bại (Lost) kèm lý do | `modules/deals/deal-routes.ts` |
| `GET` | `/api/v1/quotes` | Danh sách các bản báo giá đã lập | `modules/quotes/quote-routes.ts` |
| `POST` | `/api/v1/quotes` | Lập báo giá mới tính toán chiết khấu thuế | `modules/quotes/quote-routes.ts` |
| `GET` | `/api/v1/quotes/:id/pdf` | Sinh tệp PDF báo giá xuất khẩu gửi khách | `modules/quotes/quote-pdf-routes.ts` |
| `GET` | `/api/v1/products` | Danh mục sản phẩm / dịch vụ đang kinh doanh | `modules/products/product-routes.ts` |
| `POST` | `/api/v1/products` | Thêm mới sản phẩm, mã SKU, giá niêm yết | `modules/products/product-routes.ts` |
| `GET` | `/api/v1/pricebook` | Bảng giá theo từng nhóm khách hoặc đại lý | `modules/quotes/pricebook-routes.ts` |
| `GET` | `/api/v1/pancake/config` | Lấy cấu hình kết nối API Pancake POS | `modules/integrations/providers/pancake-pos/routes.ts` |
| `POST` | `/api/v1/pancake/sync-orders`| Đồng bộ đơn hàng từ Pancake về CRM | `modules/integrations/providers/pancake-pos/routes.ts` |

#### C. Dữ liệu Liên quan & Phụ thuộc
* **Bảng Database Postgres:** `deals`, `deal_stages`, `deal_items`, `quotes`, `quote_items`, `products`, `pricebooks`, `pricebook_entries`, `pancake_sync_configs`.
* **Ràng buộc Invariants:**
  * Tổng tiền Deal (`total_amount`) phải bằng tổng các mặt hàng (`deal_items`) trừ chiết khấu cộng thuế VAT.
  * Chỉ các Deal ở trạng thái đang mở mới được phép thay đổi sản phẩm hoặc chiết khấu. Deal đã chốt `Won`/`Lost` không được sửa trực tiếp mà phải mở lại qua quyền Quản lý.

---

### PHÂN HỆ 5: GROWTH, MARKETING & AI INTELLIGENCE (`internal/marketing` & `internal/aiagent`)

#### A. Nghiệp vụ & Giao diện Frontend
* **Frontend Screens:** Quản lý nhãn thẻ (`/settings/tags`), Chiến dịch Broadcast gửi tin hàng loạt (`/broadcasts`), Kịch bản chăm sóc tự động (`/automation/sequences`), Bảng luật tính điểm tiềm năng (`/settings/scoring`), Cấu hình AI Agent thông minh (`/ai-agents`), Quản lý nhà cung cấp mô hình AI (`/settings/goclaw-providers`), Thư viện tri thức RAG (`/ai-agents/:id/knowledge`), Trạm giám sát bất thường Ops Radar (`/ops-radar`).
* **Trọng tâm nghiệp vụ:** 
  * Marketing: Gắn nhãn phân loại khách hàng, chạy chiến dịch gửi tin nhắn tự động theo kịch bản tương tác (Sequences) tránh bị chặn spam.
  * AI & Ops Radar: Cấu hình các con bot trợ lý ảo sử dụng OpenAI/DeepSeek để tự động trả lời khách hàng 24/7, tra cứu tri thức từ tài liệu nội bộ (RAG), tự động phát hiện dấu hiệu khách giận dữ hoặc nhân viên trả lời sai quy chuẩn (Ops Radar).

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
| `GET` | `/api/v1/tags` | Danh sách nhãn CRM phân loại khách hàng | `modules/tags/tag-routes.ts` |
| `POST` | `/api/v1/tags` | Tạo nhãn mới kèm mã màu hiển thị | `modules/tags/tag-routes.ts` |
| `GET` | `/api/v1/tag-groups` | Danh sách nhóm phân loại nhãn | `modules/contacts/crm-tag-group-routes.ts` |
| `GET` | `/api/v1/broadcasts` | Danh sách các chiến dịch gửi tin hàng loạt | `modules/campaign/campaign-routes.ts` |
| `POST` | `/api/v1/broadcasts` | Khởi tạo chiến dịch gửi tin cho tệp khách | `modules/campaign/campaign-routes.ts` |
| `POST` | `/api/v1/broadcasts/:id/start`| Kích hoạt tiến trình gửi tin ngầm theo batch | `modules/campaign/campaign-routes.ts` |
| `GET` | `/api/v1/automation/sequences`| Danh sách chuỗi tin nhắn nuôi dưỡng tự động | `modules/engagement/engagement-routes.ts` |
| `POST` | `/api/v1/automation/sequences`| Thiết lập chuỗi kịch bản chăm sóc theo thời gian| `modules/engagement/engagement-routes.ts` |
| `GET` | `/api/v1/scoring/rules` | Danh sách tiêu chí cộng/trừ điểm Lead | `modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/scoring/recalculate` | Chạy tác vụ tính toán lại điểm Lead toàn hệ thống | `modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/ai-agents` | Danh sách AI Agent đã cấu hình | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents` | Tạo Agent mới, chọn Prompt và phân quyền nick | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/goclaw-providers` | Danh sách kết nối AI Provider (OpenAI, DeepSeek) | `modules/ai-agent/goclaw-provider-routes.ts` |
| `POST` | `/api/v1/goclaw-providers` | Thêm API Key nhà cung cấp (mã hóa chuẩn zero leak)| `modules/ai-agent/goclaw-provider-routes.ts` |
| `GET` | `/api/v1/ai-agents/:id/knowledge`| Danh sách tài liệu tri thức RAG của bot | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents/:id/knowledge`| Tải lên tài liệu PDF/Docx để cắt vector embeddings | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ops-radar/signals` | Danh sách các cảnh báo bất thường trong chat | `modules/ops-radar/ops-radar-routes.ts` |
| `GET` | `/api/v1/ops-radar/settings`| Cấu hình ngưỡng phát hiện rủi ro / ngôn từ xấu | `modules/ops-radar/ops-radar-routes.ts` |

#### C. Dữ liệu Liên quan & Phụ thuộc
* **Bảng Database Postgres:** `crm_tags`, `crm_tag_groups`, `broadcast_campaigns`, `broadcast_targets`, `automation_sequences`, `lead_scoring_rules`, `ai_agents`, `ai_providers`, `ai_knowledge_docs`, `ops_radar_signals`.
* **Ràng buộc Invariants:**
  * Tiến trình Broadcast bắt buộc phải có độ trễ ngẫu nhiên (Jitter Delay từ 5s đến 30s giữa các tin) để bảo vệ tài khoản khỏi thuật toán chống spam của các nền tảng mạng xã hội.
  * API Key của các nhà cung cấp AI khi trả về giao diện frontend bắt buộc phải được che dấu (Zero Key Leak, ví dụ `sk-...1234`).

---

### PHÂN HỆ 6: REPORTING, ANALYTICS & DASHBOARD (`internal/analytics`)

#### A. Nghiệp vụ & Giao diện Frontend
* **Frontend Screens:** Bảng điều khiển tổng quan chỉ số (`/dashboard`), Báo cáo thời gian phản hồi tin nhắn (`/reports/response-time`), Báo cáo phễu chuyển đổi khách hàng (`/reports/conversion-funnel`), Báo cáo năng suất nhân viên tư vấn (`/reports/agent-performance`), Danh sách báo cáo tùy biến (`/reports/saved`).
* **Trọng tâm nghiệp vụ:** Gom tụ số liệu thời gian thực (Realtime aggregation), đo lường thời gian phản hồi tin nhắn đầu tiên (First Response Time - FRT), thời gian giải quyết vấn đề (Resolution Time), tỷ lệ chuyển đổi từ Lead sang Deal, vẽ biểu đồ trực quan hóa dữ liệu kinh doanh.

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
| `GET` | `/api/v1/dashboard/overview` | Tổng hợp chỉ số KPI ngày/tháng (Tin mới, Khách mới, Doanh số) | `modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/analytics/response-time` | Thống kê thời gian phản hồi trung bình của sale | `modules/analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/conversion-funnel` | Báo cáo tỷ lệ rớt khách qua từng phễu bán hàng | `modules/analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/team-performance` | Bảng xếp hạng doanh số và tốc độ trả lời theo nhân viên | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports` | Danh sách mẫu báo cáo định kỳ hệ thống | `modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/saved-reports` | Danh sách báo cáo người dùng tự cấu hình lưu lại | `modules/analytics/saved-report-routes.ts` |
| `POST` | `/api/v1/saved-reports` | Lưu cấu hình bộ lọc báo cáo yêu thích | `modules/analytics/saved-report-routes.ts` |

---

### PHÂN HỆ 7: PLATFORM, SERVICE GATEWAY & MEDIA (`internal/serviceapi`)

#### A. Nghiệp vụ & Giao diện Frontend
* **Frontend Screens:** Thư viện tệp phương tiện (`/media`), Quản lý chữ ký số & Watermark ảnh (`/settings/watermark`), Cấu hình API ngoài cho GoClaw Daemon (`/settings/api-keys`).
* **Trọng tâm nghiệp vụ:** 
  * Cổng giao tiếp an toàn cho các Daemon bên ngoài (GoClaw Agent Runner) gửi nhận tin nhắn tự động với chữ ký HMAC bảo mật.
  * Quản lý lưu trữ tệp đính kèm tập trung trên MinIO / Cloud Storage, tự động đóng dấu Watermark chống rò rỉ dữ liệu khách hàng.

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
| `GET` | `/api/v1/service/whoami` | Xác thực Service Token của GoClaw Agent | `modules/service-api/service-whoami-routes.ts` |
| `POST` | `/api/v1/service/messages/send` | Daemon ngoài gọi lệnh gửi tin nhắn trực tiếp | `modules/service-api/service-message-routes.ts` |
| `POST` | `/api/v1/service/leads/assign` | Gán khách hàng cho bot hoặc sale từ dịch vụ ngoài | `modules/service-api/service-lead-assignment-routes.ts` |
| `GET` | `/api/v1/media` | Duyệt danh sách ảnh, video, tài liệu đã tải lên | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/upload` | Tải lên tệp phương tiện đa định dạng lên S3 | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/watermark` | Gắn văn bản watermark ẩn lên ảnh | `modules/media/media-routes.ts` |
| `DELETE`| `/api/v1/media/:id` | Xóa tệp hoặc chuyển vào thùng rác | `modules/media/media-routes.ts` |

---

## 3. CHIẾN LƯỢC CHUYỂN ĐỔI MÃ NGUỒN (MIGRATION STRATEGY)

### 3.1. Phương Pháp Chuyển Đổi Không Gián Đoạn (Zero-Downtime Migration)
* **Giai đoạn 1 (Parallel Run & Reverse Proxy):** 
  Sử dụng Reverse Proxy (Nginx hoặc Traefik) đứng trước. Các nhóm endpoint đã hoàn tất trên Go (`omni-core`) được định tuyến trực tiếp về dịch vụ Go. Các endpoint phức tạp còn lại tạm thời tiếp tục được chuyển về NodeJS backend (`ZaloCRM`).
* **Giai đoạn 2 (Dual Write & Data Re-sync):**
  Đối với cơ sở dữ liệu `PostgreSQL`, bảng dữ liệu giữ nguyên cấu trúc lõi để cả 2 hệ thống có thể đọc chung trong giai đoạn bàn giao.
* **Giai đoạn 3 (Switchover & Decommission):**
  Khi toàn bộ 600+ endpoints trên Go vượt qua bài kiểm tra tích hợp (Integration & Regression Tests), tắt dịch vụ NodeJS cũ và thu hồi toàn bộ tài nguyên máy chủ.

### 3.2. Chuyển Đổi Mô Hình Dữ Liệu: Prisma ORM Sang Go Clean Architecture
* **Loại bỏ hoàn toàn ORM nặng nề:** Thay thế Prisma bằng `pgx/v5` và `Bun ORM` thuần Go, giúp tăng thông lượng truy vấn gấp 5 lần và giảm 70% độ trễ I/O.
* **Bảo vệ Bất biến bằng Domain Pattern:** Mọi thao tác cập nhật dữ liệu (`UpdateContact`, `ChangeDealStage`, `ClaimLead`) không được gọi trực tiếp xuống DB mà bắt buộc phải thông qua phương thức nghiệp vụ của Aggregate Root để kích hoạt logic kiểm tra hợp lệ (`Validate()`).
* **Sự Kiện Miền (Domain Events & Outbox Pattern):** Các tương tác gửi tin, đổi trạng thái đơn, thêm ghi chú được lưu vết nguyên tử vào bảng `transactional_outbox` trong cùng 1 transaction DB, đảm bảo không bao giờ bị mất sự kiện khi mạng bị đứt gãy.

---

## 4. BẢNG TỔNG HỢP TIẾN ĐỘ THỰC THI (IMPLEMENTATION STATUS)

| Bounded Context | Số Lượng Endpoints | Trạng Thái HTTP Vỏ (Route) | Trạng Thái Domain & DB Thật | File Cấu Hình Go Lõi |
|---|:---:|:---:|:---:|---|
| **Identity & Access** | 48 | Đã hoàn tất 100% | Đã kết nối Auth & Users | `internal/identity/interfaces/http/handler.go` |
| **Channel & Gateway** | 62 | Đã hoàn tất 100% | Đang chuẩn hóa Zalo/Tele | `internal/channel/interfaces/http/handler.go` |
| **CRM Core (Customer)** | 85 | Đã hoàn tất 100% | Đã chạy Contacts/Notes | `internal/customer/interfaces/http/handler.go` |
| **CRM Core (Conversation)**| 74 | Đã hoàn tất 100% | Đã chạy Chat/Messages | `internal/conversation/interfaces/http/handler.go` |
| **Deal & Sales** | 58 | Đã hoàn tất 100% | Đang làm Deals/Quotes/POS | `internal/deal/interfaces/http/handler.go` |
| **Marketing & Growth** | 92 | Đã hoàn tất 100% | Đã chạy Tags/Campaigns | `internal/marketing/interfaces/http/handler.go` |
| **AI Agent & Ops Radar** | 65 | Đã hoàn tất 100% | Đã chạy Providers/Agents | `internal/aiagent/interfaces/http/knowledge_handler.go` |
| **Platform & Service API** | 56 | Đã có gRPC & REST | Đang hoàn thiện ServiceAPI | `internal/serviceapi/interfaces/http/handler.go` |
| **Báo cáo & Analytics** | 75 | Đã hoàn tất 100% | Đã chạy ResponseTime/SLA | `internal/analytics/interfaces/grpc/analytics_server.go` |
| **TỔNG CỘNG** | **615+** | **100% Phủ Kín** | **Đang mở rộng DB thật** | Toàn bộ 8 Bounded Contexts |


---

# PHẦN II: QUY CHUẨN THIẾT KẾ CLEAN ARCHITECTURE & PHÂN TẦNG SUB-MODULE

# Kiến Trúc Bounded Context & Chuẩn Hóa Phân Tầng DDD Cho Toàn Bộ 615 REST Endpoints

> **Tài liệu chuẩn hóa kiến trúc Domain-Driven Design (DDD)**  
> **Dự án**: Omni Core (Go Backend Clean DDD)  
> **Phiên bản**: 3.0.0 (Cập nhật 2026-09-27)  
> **Mục tiêu**: Gom nhóm, phân rã 615 REST API endpoints từ `omni-web` vào đúng Bounded Context, chuẩn hóa thư mục con ở 4 tầng: `domain/`, `application/`, `infrastructure/`, `interfaces/`.

---

## 1. Nguyên Tắc Phân Định Bounded Context (Domain Boundaries)

Hệ thống được chia thành **7 Bounded Contexts cốt lõi** và **1 Bounded Context hỗ trợ (Supporting Subdomain)** theo đúng bản đồ ngữ cảnh (Context Map):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OMNI CORE SYSTEM                                │
│                                                                        │
│  [Identity & Settings BC] ─── Cung cấp danh tính, phân quyền, config  │
│          │                                                             │
│          ▼                                                             │
│  [Channel BC] ─────────────── Quản lý nick Zalo, Telegram, OA, Proxy   │
│          │                                                             │
│          ▼                                                             │
│  [Customer & Lead BC] ─────── Quản lý 2 cuốn sổ, Lead Pool, Scoring    │
│          │                                                             │
│          ▼                                                             │
│  [Conversation & Media BC] ── Hội thoại đa kênh, Socket Hub, Rich Media│
│          │                                                             │
│          ▼                                                             │
│  [Deal & Order BC] ────────── Bán hàng, Báo giá, Kho đơn, Pancake POS │
│          │                                                             │
│          ▼                                                             │
│  [Marketing & Automation BC]  Chiến dịch, Trigger, Sequence, Tagging   │
│          │                                                             │
│          ▼                                                             │
│  [AI Agent & Knowledge BC] ── GoClaw Bridge, Knowledge Vault, Ops Radar│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Quy Chuẩn Cấu Trúc 4 Tầng Trong Từng Bounded Context

Mọi Bounded Context trong `internal/<bc>/` bắt buộc tuân thủ cấu trúc phân tầng con chuyên biệt:

```
internal/<bc>/
├── domain/                    # 1. CORE DOMAIN LAYER (Zero external dependencies)
│   ├── <aggregate_root>.go    # Aggregate Root, invariants, validation methods
│   ├── <entity>.go            # Các entity con trong Aggregate
│   ├── <value_objects>.go     # Value Objects bất biến (VO)
│   ├── events.go              # Domain Events phát sinh khi thay đổi trạng thái
│   ├── repository.go          # Repository Ports (Interfaces nhận *ValidatedAggregate)
│   └── validation.go          # Validated<Aggregate> type wrapper
│
├── application/               # 2. APPLICATION CQRS LAYER
│   ├── commands/              # Handlers thực thi thay đổi (Write side)
│   │   ├── <action>_cmd.go
│   │   └── dispatcher.go      # Event Dispatcher outbox
│   └── queries/               # Handlers truy vấn tối ưu (Read side)
│       └── <action>_qry.go
│
├── infrastructure/            # 3. INFRASTRUCTURE PERSISTENCE LAYER
│   ├── postgres/              # Triển khai Bun ORM / raw SQL
│   │   ├── models/            # Bun DB schema models (Gắn tag `bun:"..."`)
│   │   └── <entity>_repo.go   # Hiện thực domain.Repository interface
│   ├── client/                # Clients gọi dịch vụ bên ngoài (nếu có)
│   └── cache/                 # Redis cache / In-memory buffer
│
└── interfaces/                # 4. DELIVERY INTERFACES LAYER (Đa giao thức)
    ├── http/                  # [RESTful API] Phục vụ Frontend Web (Vue 3 / Next.js)
    │   ├── router.go          # Định tuyến sạch sẽ, gom route theo resource
    │   └── <entity>_handler.go# Parse HTTP Request -> gọi Command/Query -> JSON
    ├── grpc/                  # [Connect-RPC & gRPC] Type-safe RPC cho Gateway/Daemon
    │   └── <service>_server.go
    └── ws/                    # [WebSocket Hub] Realtime streaming sự kiện
        └── hub.go
```

---

## 3. Bản Đồ Phân Rã Chi Tiết 615 Endpoints Vào 7 Bounded Contexts

### BC 1: `Identity & Settings BC` (`internal/identity`) — 72 Endpoints
*Chịu trách nhiệm: Xác thực, Người dùng cá nhân, Phân quyền RBAC, Phòng ban, Cấu hình Tenant & Hệ thống.*

- **Thư mục con**:
  - `domain/`: `User`, `Tenant`, `Department`, `PermissionGroup`, `SystemConfig`
  - `application/commands/`: `Login`, `RefreshToken`, `ChangePassword`, `UpdateProfile`, `CreateUser`, `AssignRole`, `UpdateConfig`
  - `application/queries/`: `GetCurrentUser`, `ListTenants`, `GetRBACMatrix`, `ListDepartments`, `GetSystemSettings`
  - `infrastructure/postgres/`: `user_repo.go`, `tenant_repo.go`, `rbac_repo.go`, `settings_repo.go`
  - `interfaces/http/`:
    - `auth_handler.go`: `/auth/login`, `/auth/refresh`, `/auth/tenants`, `/auth/switch-tenant`
    - `me_handler.go`: `/me`, `/me/profile`, `/me/avatar`, `/me/change-password`, `/me/preferences`
    - `rbac_handler.go`: `/permission-groups/*`, `/departments/*`, `/rbac/users`, `/users/*`
    - `settings_handler.go`: `/settings/*`, `/organization/*`, `/branding/*`, `/system-notifications/*`, `/setup/*`

---

### BC 2: `Channel & Gateway BC` (`internal/channel`) — 95 Endpoints
*Chịu trách nhiệm: Quản lý danh sách Nick Zalo, Telegram cá nhân, WhatsApp, Zalo OA, Zalo Bot, và Egress Proxy Pool.*

- **Thư mục con theo chuẩn DDD phân rã theo từng Sub-channel**:
  - `domain/`:
    - `channel_account.go` (Aggregate Root chung: status, token, limits, proxy_binding)
    - `zalo/` (ZaloGroup, ZaloLabel, ZaloFriend, QRSession)
    - `telegram/` (TelegramAccount, TelegramSession, MTProtoConfig)
    - `whatsapp/` (WhatsAppAccount, WABASession)
    - `proxy/` (EgressProxy, ProxyBinding, RotationPolicy)
  - `application/`:
    - `router/` (InboundEventForwarder, OutboundMessageRouter)
    - `zalo/` (Commands: ScanGroup, SyncLabels, QRLogin | Queries: ListZaloAccounts, ListGroups)
    - `telegram/` (Commands: StartTeleLogin, VerifyTeleCode, RotateTeleProxy | Queries: ListTeleAccounts)
    - `whatsapp/` (Commands: ConnectWhatsApp, SendWhatsAppMessage)
    - `proxy/` (Commands: BindProxy, RotateProxy | Queries: ListProxies)
  - `infrastructure/`:
    - `postgres/` (models/, channel_account_repo.go, zalo_repo.go, telegram_repo.go, proxy_repo.go)
    - `redis/` (qr_session_store.go, telegram_session_store.go)
    - `telegram/` (mtproto_client.go, tele_gateway_adapter.go)
    - `whatsapp/` (grpc_client.go, event_subscriber.go)
    - `zalo/` (zalo_client.go)
  - `interfaces/http/`:
    - `zalo/`: `/zalo-accounts/*`, `/privacy/*`, `/friends/*`, `/zalo-groups/*`, `/zalo-labels/*`, `/account-folders/*`
    - `telegram/`: `/telegram-personal/*`, `/telegram-bridge/*`
    - `integrations/`: `/integrations/zalo-oa/*`, `/integrations/zalo-bot/*`
    - `egress/`: `/admin/egress/*`
    - `whatsapp/`: `/webhook/whatsapp`
    - `zalo_group_handler.go`: `/zalo-groups/*`, `/zalo-labels/*`, `/account-folders/*`
    - `integration_handler.go`: `/integrations/zalo-oa/*`, `/integrations/zalo-bot/*`
    - `telegram_handler.go`: `/telegram-personal/*`, `/telegram-bridge/*`
    - `egress_handler.go`: `/admin/egress/*`

---

### BC 3: `Customer & Lead BC` (`internal/customer`) — 92 Endpoints
*Chịu trách nhiệm: Danh bạ 2 cuốn sổ (Sổ Zalo & Sổ CRM), Ghi chú, Lịch hẹn, Lead Pool, Lead Scoring, Khách hàng mục tiêu.*

- **Thư mục con**:
  - `domain/`: `Contact`, `ContactProfile`, `ContactNote`, `Appointment`, `LeadPool`, `EngagementScore`
  - `application/commands/`: `CreateContact`, `MergeContacts`, `AddNote`, `CreateAppointment`, `AssignLead`, `ClaimLead`, `RecalculateScore`
  - `application/queries/`: `ListContacts`, `GetContactTimeline`, `ListAppointments`, `ListLeadPool`, `GetLeadScoring`
  - `infrastructure/postgres/`: `contact_repo.go`, `sub_resource_repo.go`, `lead_pool_repo.go`
  - `interfaces/http/`:
    - `contact_handler.go`: `/contacts/*`, `/crm-tags/*`, `/timeline/*`
    - `lead_pool_handler.go`: `/lead-pool/*`, `/leads/*`, `/customer-lists/*`, `/customer-list-entries/*`
    - `appointment_handler.go`: `/appointments/*`
    - `scoring_handler.go`: `/scoring/*`

---

### BC 4: `Conversation & Media BC` (`internal/conversation`) — 82 Endpoints
*Chịu trách nhiệm: Hội thoại đa kênh, Quản lý tin nhắn, Chat folders, Mẫu trả lời nhanh (Presets), Thư viện Rich Media.*

- **Thư mục con**:
  - `domain/`: `Conversation`, `Message`, `ChatFolder`, `ChatPreset`, `MediaAsset`
  - `application/commands/`: `SendMessage`, `MarkRead`, `AssignConversation`, `CreateFolder`, `UploadMedia`, `DeleteMedia`
  - `application/queries/`: `ListConversations`, `GetMessages`, `ListFolders`, `ListPresets`, `ListMediaAssets`
  - `infrastructure/postgres/`: `conversation_repo.go`, `conversation_ext_repo.go`, `media_repo.go`
  - `interfaces/http/`:
    - `conversation_handler.go`: `/conversations/*`, `/external-conversations/*`
    - `preset_handler.go`: `/chat/presets/*`, `/conversations/folders/*`
    - `media_handler.go`: `/media/*` (upload, folders, favorites, trash, watermark)

---

### BC 5: `Deal & E-commerce BC` (`internal/deal`) — 85 Endpoints
*Chịu trách nhiệm: Sales Pipeline Kanban 7 giai đoạn, Báo giá Quotes, Quản lý Sản phẩm, Kho đơn đa nguồn, Pancake POS.*

- **Thư mục con**:
  - `domain/`: `Deal`, `Quote`, `Product`, `MirroredOrder`, `DebtBalance`
  - `application/commands/`: `CreateDeal`, `TransitionStage`, `CreateQuote`, `SyncProduct`, `MirrorOrder`, `SettleDebt`
  - `application/queries/`: `ListDeals`, `GetPipelineSummary`, `ListQuotes`, `SearchProducts`, `ListOrders`
  - `infrastructure/postgres/`: `deal_repo.go`, `quote_repo.go`, `product_repo.go`, `order_repo.go`
  - `interfaces/http/`:
    - `deal_handler.go`: `/deals/*` (approvals, views, stages)
    - `quote_handler.go`: `/quotes/*`, `/pricebook/*`
    - `product_handler.go`: `/products/*` (stocks, sync)
    - `order_platform_handler.go`: `/order-store/*`, `/order-platform/*`, `/pancake/*`

---

### BC 6: `Marketing & Automation BC` (`internal/marketing`) — 84 Endpoints
*Chịu trách nhiệm: Tags & Nhóm thẻ, Chiến dịch Broadcast, Kịch bản nuôi dưỡng (Sequences), Bộ kích hoạt (Triggers), Báo cáo SLA.*

- **Thư mục con**:
  - `domain/`: `Tag`, `TagGroup`, `BroadcastCampaign`, `SequenceRule`, `TriggerWorkflow`
  - `application/commands/`: `CreateTag`, `CreateCampaign`, `ExecuteBroadcast`, `CreateTrigger`, `ToggleSequence`
  - `application/queries/`: `ListTags`, `ListCampaigns`, `ListTriggers`, `GetCampaignStats`
  - `infrastructure/postgres/`: `tag_repo.go`, `campaign_repo.go`, `automation_repo.go`
  - `interfaces/http/`:
    - `tagging_handler.go`: `/tags/*`, `/tag-groups/*`
    - `campaign_handler.go`: `/broadcasts/*`, `/campaigns/*`
    - `automation_handler.go`: `/automation/*`, `/marketing/sequences/*`
    - `analytics_handler.go`: `/analytics/*`, `/reports/*`, `/dashboard/*`

---

### BC 7: `AI Agent & Knowledge BC` (`internal/aiagent`) — 65 Endpoints
*Chịu trách nhiệm: AI Providers (DeepSeek/OpenAI), AI Agents, Cầu nối GoClaw HMAC Bridge, Kho tri thức RAG Vault, Ops Radar.*

- **Thư mục con**:
  - `domain/`: `AIAgent`, `AIProvider`, `KnowledgeDocument`, `AgentBinding`, `RadarSignal`
  - `application/commands/`: `CreateAgent`, `BindChannel`, `GenerateReply`, `UploadDocument`, `AcknowledgeSignal`
  - `application/queries/`: `ListAgents`, `ListProviders`, `GetDocumentContent`, `ListRadarSignals`
  - `infrastructure/postgres/`: `agent_repo.go`, `knowledge_repo.go`, `radar_repo.go`
  - `interfaces/http/`:
    - `agent_handler.go`: `/ai-agents/*`, `/goclaw-providers/*`
    - `knowledge_handler.go`: `/ai/knowledge/*`, `/ai/company-profile/*`, `/ai/agent-hands/*`
    - `goclaw_bridge.go`: `/api/integrations/goclaw/*` (HMAC verify)
    - `ops_radar_handler.go`: `/ops-radar/*`, `/work-items/*`

---

## 4. Kế Hoạch Đóng Gói Issues Triển Khai (Sprint Roadmap)

Mỗi gói sẽ triển khai trọn gói 4 tầng và đăng ký router sạch sẽ, đảm bảo test pass 100%:

1. **Sprint 9 - Issue #85**: `[Identity-Settings] feat: Full REST HTTP interfaces (Me, Users, Settings, Preferences)`
2. **Sprint 9 - Issue #86**: `[Channel-Ext] feat: Zalo Account Operations & Sub-channels (OA, Bot, Telegram) REST HTTP`
3. **Sprint 10 - Issue #87**: `[Customer-Lead] feat: Lead Pool, Appointments & Scoring REST HTTP`
4. **Sprint 10 - Issue #88**: `[Deal-Order] feat: Quotes, Products, Pricebook & Pancake Order Store REST HTTP`
5. **Sprint 11 - Issue #89**: `[Conversation-Media] feat: Media Library Folders & Watermarks REST HTTP`
6. **Sprint 11 - Issue #90**: `[Marketing-Auto] feat: Automation Triggers, Sequences & Customer Lists REST HTTP`
7. **Sprint 12 - Issue #91**: `[AI-Knowledge] feat: Company Profile, Knowledge Documents & Ops Radar REST HTTP`


---

# PHẦN III: KIẾN TRÚC ĐA GIAO THỨC & SERVING (MULTI-PROTOCOL DELIVERY)

# Kiến Trúc Phân Tầng Giao Tiếp Đa Thức (Multi-Protocol Delivery Architecture)

> Tài liệu chuẩn hoá tầng Interfaces trong Go Clean DDD cho hệ thống Omni Core.
> Phiên bản: 2.0.0 (Cập nhật 2026-09-27)

---

## 1. Triết Lý Thiết Kế (Design Philosophy)

Hệ thống Omni Core được thiết kế theo **Clean Architecture & Domain-Driven Design (DDD)** với nguyên tắc **Độc lập cơ chế phân phối (Delivery Mechanism Agnostic)**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INTERFACES LAYER                                │
│                                                                        │
│   ┌────────────────┐   ┌────────────────┐   ┌──────────────────────┐   │
│   │  HTTP / REST   │   │  Connect-RPC   │   │  gRPC / WebSockets   │   │
│   │ (Web/Mobile UI)│   │  (Type-safe)   │   │(Gateways, Daemons, AI│   │
│   └───────┬────────┘   └───────┬────────┘   └──────────┬───────────┘   │
└───────────┼────────────────────┼───────────────────────┼───────────────┘
            │                    │                       │
            ▼                    ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER (CQRS)                          │
│                                                                        │
│             Commands Handlers  ◄───►  Queries Handlers                 │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DOMAIN LAYER (DDD Core)                         │
│                                                                        │
│            Rich Aggregates  ◄───►  Invariants & Domain Events          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                               │
│                                                                        │
│            PostgreSQL (Bun ORM)  ◄───►  Redis / Outbox Relay           │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Application CQRS Handlers là trung tâm nghiệp vụ duy nhất**:
   - `commands/` và `queries/` chứa 100% logic điều phối.
   - Không lặp lại bất kỳ logic validate, nghiệp vụ hay database query nào giữa các giao thức.
2. **Các cơ chế giao tiếp chỉ là lớp mỏng (Thin Delivery Adapters)**:
   - **HTTP / RESTful**: Phục vụ trực tiếp cho Web UI (Vue 3 / Next.js) qua chuẩn JSON HTTP/1.1 hoặc HTTP/2. URL giữ nguyên tương thích 100% với frontend mà không cần adapter chắp vá.
   - **Connect-RPC**: Phục vụ các client hiện đại hỗ trợ TypeScript type-safe Protobuf contracts.
   - **gRPC (HTTP/2 Multiplexing & Streams)**: Phục vụ kết nối Daemon nền (Node.js Zalo Gateway, WhatsApp Gateway) và AI Agent Engine đòi hỏi băng thông cao, độ trễ cực thấp.
   - **WebSocket Hub**: Phục vụ các sự kiện realtime (tin nhắn mới, cập nhật trạng thái online, thông báo).

---

## 2. Chuẩn Cấu Trúc Thư Mục Trong Từng Bounded Context

Mỗi Bounded Context trong `internal/<bc>/` tuân thủ nghiêm ngặt cấu trúc phân tầng:

```
internal/<bc>/
├── domain/                    # Entities, Aggregates, Value Objects, Domain Events
├── application/               # CQRS
│   ├── commands/              # Handlers ghi (Write)
│   └── queries/               # Handlers đọc (Read)
├── infrastructure/            # Persistence & External Clients
│   └── postgres/              # Bun ORM repositories & models
└── interfaces/                # Tầng giao tiếp (Giao thức bên ngoài)
    ├── http/                  # [MỚI] RESTful HTTP handlers & routes cho Frontend
    │   ├── handler.go
    │   └── router.go
    ├── grpc/                  # Connect-RPC / gRPC Server handlers
    │   └── server.go
    └── ws/                    # Realtime WebSocket stream (nếu có)
```

---

## 3. Bản Đồ 8 Bounded Contexts & Phân Bổ Giao Thức (Multi-Protocol Delivery)

| Bounded Context | Tầng `interfaces/http` (RESTful JSON cho Frontend) | Tầng `interfaces/grpc` (Connect/gRPC cho RPC & Inter-service) | Tầng Realtime Stream (`interfaces/ws` & `stream`) |
|---|---|---|---|
| **Identity & Settings** | Auth Login, Refresh, Profile, Users, Tenants, Departments, Roles | `IdentityService` Connect-RPC | Token expiry alerts |
| **Channel & Gateway** | Zalo Accounts, Group Scans, Labels Sync, Telegram, Proxy Pool | `ZaloPersonalService`, `ChannelZaloExtService` | Inbound Message Stream |
| **Customer & Lead** | Contacts, Profiles, Notes, Appointments, Lead Pool, Scoring | `CustomerService`, `CustomerExtService` | Contact timeline events |
| **Conversation & Media**| Conversations, Messages, Presets, Media Uploads, Watermarks | `ConversationService`, `ConversationExtService`| Realtime Chat WebSocket Hub |
| **Deal & E-commerce**| Deals, Pipeline Stages, Orders, Quotes, Products, Pancake | `DealService` Connect-RPC | Order status push |
| **Marketing & Automation** | Tags, Groups, Broadcast Campaigns, Sequences, Automation | `TaggingService`, `MarketingService` | Campaign progress |
| **AI Agent & Knowledge** | Agents, Providers, Knowledge Bases, Hands, Radar Signals | `AIAgentService`, `OpsRadarService` | SSE Token Stream (`text/event-stream`) |
| **Service API & Gateway** | Service whoami, Message dispatch, Lead assign, Analytics API | `ServiceAPIService`, `AnalyticsService` | System alert stream |

---

## 4. Lộ Trình Triển Khai (Migration Roadmap)

Toàn bộ các gói công việc bổ sung tầng RESTful HTTP được quản lý qua GitHub Issues trên Sprint Board Project 11:
- **Phase 1**: Identity BC REST Interfaces (Issue #69).
- **Phase 2**: Customer BC REST Interfaces (Issue #70).
- **Phase 3**: Conversation & Media BC REST Interfaces (Issue #71).
- **Phase 4**: Deals, Quotes & Products BC REST Interfaces (Issue #72).
- **Phase 5**: Channel & Egress Proxy BC REST Interfaces (Issue #73).
- **Phase 6**: Tagging, Marketing & Analytics BC REST Interfaces (Issue #74).
- **Phase 7**: AI Agent & GoClaw Bridge Interfaces (Issue #75).


---

# PHẦN IV: CHIẾN LƯỢC LƯU TRỮ POSTGRESQL & TRANSACTIONAL OUTBOX

# Architecture Decision: Storage Strategy & Infrastructure ORM Selection

> **Status:** Accepted  
> **Date:** 2026-03-27  
> **Bounded Contexts:** All (Customer, Conversation, Channel, Automation, Deal)  
> **Authors:** Engineering Team & Architecture Review

---

## 1. Problem Statement & Context

Omni Core là nền tảng quản trị hội thoại đa kênh (Zalo Personal, Zalo OA, Facebook Messenger, Telegram) kết hợp CRM bán hàng đa nhân viên và tích hợp AI Agent tự động hóa.

Hệ thống có hai luồng dữ liệu chính:
1. **Dữ liệu CRM nghiệp vụ & Quan hệ (Relational & Transactional CRM):**
   - Khách hàng (`contacts`), liên kết hồ sơ mạng xã hội (`channel_profiles`), nhãn (`tags`), giao dịch (`deals`), phân quyền nhân viên (`assignees`), cấu hình kênh (`channel_accounts`).
   - Yêu cầu: Khả năng lọc tìm kiếm động đa tiêu chí (Dynamic Filtering), tính toàn vẹn dữ liệu ACID cao, dễ dàng mở rộng thuộc tính.
2. **Dữ liệu Hội thoại & Tin nhắn (High-volume Conversation & Message Stream):**
   - Sự kiện tin nhắn từ Webhook / Sync API của các bên (Zalo, Meta, Telegram), các sự kiện nội bộ và phản hồi của AI Agent.
   - Yêu cầu: Lưu trữ dữ liệu lớn, tốc độ ghi nhanh, hỗ trợ tìm kiếm phân đoạn (cursor pagination), phục vụ trích xuất ngữ cảnh cho AI Agent (RAG / Vector search).

Việc sử dụng thuần `sqlc` ở tầng Infrastructure phát sinh chi phí lớn khi xây dựng các bộ lọc CRM phức tạp (10-15 optional filters), trong khi việc lưu trữ toàn bộ lịch sử tin nhắn vô hạn định trong bảng quan hệ PostgreSQL có thể làm tăng dung lượng và chi phí vận hành nhanh chóng.

---

## 2. Infrastructure ORM / Data Access Layer: Bun (`uptrace/bun`)

### 2.1 Quyết định kỹ thuật
- **Lựa chọn:** Thay thế chiến lược `sqlc` thuần ở các màn hình CRM / Repository bằng **`uptrace/bun`**.
- **Loại bỏ:** Không sử dụng `GORM` do hạn chế về reflection overhead, cơ chế magic tag dễ xâm lấn Domain model, và khó kiểm soát SQL phức tạp.

### 2.2 So sánh đối chiếu

| Tiêu chí | `sqlc` + `pgx/v5` | `GORM` | `uptrace/bun` (Được chọn) |
| :--- | :--- | :--- | :--- |
| **Bản chất** | Compile SQL thành Go code | Heavy Active-Record ORM | SQL-First Query Builder & Lightweight ORM |
| **Hiệu năng & Memory** | Tối đa (Zero reflection) | Kém nhất (Reflection nặng) | Rất cao (Tối ưu buffer, gần tiệm cận pgx) |
| **Dynamic Filters (CRM)** | Khó viết, query phình to | Rất dễ | **Rất dễ và tự nhiên** (`q.Where("? = ?", ...)`) |
| **Tính tương thích DDD** | Tốt (tách rời Model) | Dễ gây coupling Domain | **Tốt** (Hỗ trợ Data Mapper sạch) |
| **Tính năng PostgreSQL** | Đầy đủ | Hạn chế | Hỗ trợ sâu: `JSONB`, Array, `ON CONFLICT`, CTE |

### 2.3 Nguyên tắc triển khai trong Go Clean Architecture
1. **Domain Layer bất biến:** Không đặt tag của `bun` trong Entity/Aggregate thuộc `internal/<bc>/domain/`. Domain Entity hoàn toàn độc lập với database.
2. **Persistence Models:** Tầng `internal/<bc>/infrastructure/postgres/models/` khai báo các struct tương ứng với bảng database và chứa thẻ `bun:"..."`.
3. **Data Mapper:** Thực hiện chuyển đổi tường minh giữa Domain Aggregate và Persistence Model (`toDomain()` và `toPersistence()`).

---

## 3. Chiến lược Lưu trữ Tin nhắn & Dữ liệu (Message Storage Strategy)

```
             ┌────────────────────────────────────────────────────────┐
             │       Webhook / Sync Worker (Zalo, Meta, Telegram)     │
             └───────────────────────────┬────────────────────────────┘
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │          Omni Core Ingestion          │
                     └───────────────────┬───────────────────┘
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             │                                                       │
             ▼                                                       ▼
   [CRM & Conversation Metadata]                           [Message Timeline Storage]
     (PostgreSQL via Bun)                                   (PostgreSQL Partitioned
    - contacts, channel_profiles                            / Evolution to NoSQL)
    - conversations (summary: unread,                      - Raw text, attachments
      last_message, assignee, tags)                        - Cursor-based timeline
             │                                                       │
             │                                                       ▼
             │                                             [Vector Knowledge Store]
             │                                                (PostgreSQL pgvector)
             │                                             - Chunked text embeddings
             │                                             - Khách hàng & hội thoại context
             │                                                       │
             └───────────────────────────┬───────────────────────────┘
                                         ▼
                             ┌───────────────────────┐
                             │       AI Agent        │
                             │  (RAG / Auto-reply)   │
                             └───────────────────────┘
```

### 3.1 Vì sao không dùng mô hình Client-Only Storage?
- **Đặc thù CRM Đa người dùng:** Nhiều nhân viên CSKH / Sale cùng theo dõi và hỗ trợ một khách hàng. Nếu chỉ lưu ở client, dữ liệu không thể đồng bộ tức thời giữa các nhân viên.
- **AI Agent chạy độc lập (24/7 Server-side):** Khi khách hàng gửi tin nhắn ngoài giờ làm việc (nhân viên đã tắt máy), AI Agent trên server cần dữ liệu lịch sử để hiểu ngữ cảnh và phản hồi tự động.

### 3.2 Lộ trình phân cấp lưu trữ (Tiered Storage)

#### Giai đoạn 1: MVP & Phase 2 (Hiện tại)
- **Engine:** PostgreSQL 16.
- **Cấu trúc bảng `conversations`:** Lưu metadata của cuộc hội thoại (`id`, `contact_id`, `channel_type`, `status`, `assigned_to`, `unread_count`, `last_message_at`, `snippet`).
- **Cấu trúc bảng `messages`:** Lưu chi tiết tin nhắn (`id`, `conversation_id`, `sender_type`, `content`, `attachments`, `metadata`, `created_at`). Đánh index Composite `(conversation_id, created_at DESC)` phục vụ phân trang tin nhắn tốc độ cao.
- **Ưu điểm:** Tinh gọn, tối ưu chi phí hạ tầng, dễ backup trong một cụm database duy nhất.

#### Giai đoạn 2: Scale & Archival (Hàng chục triệu tin nhắn)
- **Partitioning:** Phân vùng bảng `messages` theo khoảng thời gian (`RANGE (created_at)` theo tháng) để duy trì hiệu năng index.
- **Cold Storage / NoSQL Adapter:** Triển khai adapter `MessageRepository` mới trỏ sang NoSQL (MongoDB hoặc ScyllaDB) cho tin nhắn cũ hơn 90 ngày. Domain layer hoàn toàn không thay đổi nhờ tuân thủ Dependency Inversion.

---

## 4. Tích hợp AI Agent & Vector Search (pgvector)

### 4.1 Không lưu raw message vào Vector DB
- Vector DB không được thiết kế để thay thế primary database cho việc đọc lịch sử tin nhắn hàng ngày.
- Chi phí lưu trữ và RAM của Vector DB cao hơn nhiều so với relational / document storage.

### 4.2 Chiến lược Hybrid RAG với `pgvector`
- **Tận dụng `pgvector` trên PostgreSQL:** Không cần triển khai thêm cụm dịch vụ Vector DB độc lập (như Milvus / Qdrant) trong giai đoạn đầu.
- **Cơ chế Embedding:**
  1. Tin nhắn đến hoặc sau khi phiên hội thoại kết thúc: Worker gom nhóm tin nhắn (conversation chunking).
  2. Tạo embedding vector qua Embedding API (OpenAI text-embedding-3 hoặc model cục bộ).
  3. Lưu vector và metadata vào bảng `conversation_embeddings` (`embedding vector(1536)`).
- **Truy vấn AI Agent:**
  - AI Agent nhận câu hỏi mới từ khách hàng -> Tạo embedding -> Thực hiện Cosine Similarity Search (`<=>`) trên PostgreSQL để tìm các lượt trao đổi liên quan nhất của khách hàng đó -> Bơm vào prompt làm ngữ cảnh.

---

## 5. Kết luận & Kế hoạch hành động

1. **omni-docs:** Lưu trữ tài liệu này tại `architecture/STORAGE-STRATEGY-AND-ORM.md` và cập nhật chỉ mục.
2. **omni-core (Issue #9):** 
   - Cài đặt thư viện `uptrace/bun` và `bun/driver/pgdriver`.
   - Tạo schema migration cho `conversations`, `messages`, `conversation_events` (outbox).
   - Triển khai `PostgresConversationRepository` và `PostgresMessageRepository` bằng `Bun`.
   - Viết Integration test xác nhận tính tương thích và hiệu năng.


---

# PHẦN V: MA TRẬN PHÂN QUYỀN RBAC & BẢO MẬT UI

# Tài Liệu Đặc Tả Phân Quyền (RBAC) & Quyền Truy Cập Giao Diện (UI Access Matrix)

> Lưu trữ tham chiếu hệ thống phân quyền của Omni Web & Omni Core.
> Phiên bản: 1.0.0 (Bảo lưu từ ZaloCRM Spec 045 / RBAC-M2).

---

## 1. Cơ Chế Kiểm Soát Quyền Trên Frontend (`omni-web`)

### 1.1 Nguyên Tắc Phân Quyền Cốt Lõi
- **Bypass toàn quyền**: User có `role === 'admin'` hoặc `role === 'owner'` tự động bypass toàn bộ kiểm tra quyền (`canAccess()` luôn trả về `true`).
- **Default Deny**: Đối với nhân viên thông thường (`role === 'agent'`), nếu không được cấu hình quyền trong `grants`, mặc định bị từ chối truy cập (`false`).
- **Manager Scope**: Trưởng phòng / Phó phòng (`deptRole === 'leader' | 'deputy'`) hoặc user có cờ `canViewAll: true` được quyền xem dữ liệu cấp phòng ban hoặc toàn tổ chức.

---

## 2. Ma Trận Quyền Hệ Thống (Resource × Action Matrix)

Hệ thống quản lý **18 Resources** chia theo 4 khối màn hình chính và **5 Actions**.

### 2.1 5 Cột Hành Động (Actions)
1. `access`: Quyền xem / truy cập vào màn hình / danh sách.
2. `create`: Quyền tạo mới bản ghi.
3. `edit`: Quyền chỉnh sửa bản ghi thuộc phạm vi của mình.
4. `delete`: Quyền xóa bản ghi.
5. `view_all`: Cờ đặc quyền cho phép xem dữ liệu toàn công ty (bỏ qua giới hạn phụ trách hoặc giới hạn phòng ban).

### 2.2 18 Tài Nguyên (Resources)

| STT | Resource | Tên Tiếng Việt | Đường dẫn Frontend tương ứng | Actions hỗ trợ |
|:---:|---|---|---|---|
| **I** | **Hệ thống & Tổ chức** | | | |
| 1 | `department` | Quản lý phòng ban | `/settings/rbac/departments` | `access`, `create`, `edit`, `delete` |
| 2 | `user` | Quản lý người dùng | `/settings/rbac/users` | `access`, `create`, `edit`, `delete` |
| 3 | `permission_group` | Phân quyền vai trò | `/settings/rbac/permission-groups` | `access`, `create`, `edit`, `delete` |
| 4 | `settings` | Cài đặt hệ thống | `/settings/*` | `access`, `create`, `edit` |
| 5 | `audit_log` | Nhật ký hành động | `/settings/org/audit` | `access`, `view_all` |
| **II** | **Khách hàng & Bán hàng** | | | |
| 6 | `contact` | Khách hàng | `/contacts` | `access`, `create`, `edit`, `delete`, `view_all` |
| 7 | `friend` | Bạn bè Zalo | `/friends` | `access`, `create`, `edit`, `delete`, `view_all` |
| 8 | `conversation` | Hội thoại & Chat | `/chat` | `access`, `edit`, `delete`, `view_all` |
| 9 | `customer_list` | Tệp khách hàng | `/marketing/lists` | `access`, `create`, `edit`, `delete`, `view_all` |
| 10 | `deal` | Cơ hội bán hàng | `/deals` | `access`, `create`, `edit`, `delete`, `view_all` |
| 11 | `quote` | Báo giá | `/bao-gia` | `access`, `create`, `edit`, `delete`, `view_all` |
| **III** | **Marketing & Automation** | | | |
| 12 | `trigger` | Mục tiêu / Trigger | `/marketing/triggers` | `access`, `create`, `edit`, `delete`, `view_all` |
| 13 | `sequence` | Chuỗi chăm sóc | `/marketing/sequences` | `access`, `create`, `edit`, `delete`, `view_all` |
| 14 | `broadcast` | Chiến dịch gửi tin | `/marketing/broadcasts` | `access`, `create`, `edit`, `delete`, `view_all` |
| 15 | `block` | Khối tin nhắn mẫu | `/marketing/blocks` | `access`, `create`, `edit`, `delete`, `view_all` |
| 16 | `care_session` | Phiên chăm sóc | `/marketing/care-sessions` | `access`, `view_all` |
| **IV** | **Kênh & Tài nguyên** | | | |
| 17 | `zalo_account` | Tài khoản Nick Zalo | `/settings/channels/zalo` | `access`, `create`, `edit`, `delete`, `view_all` |
| 18 | `media` | Kho thư viện Media | `/media` | `access`, `create`, `edit`, `delete`, `view_all` |
| 19 | `webhook` | API / Webhook | `/settings/dev/api` | `access`, `create`, `edit`, `delete` |
| 20 | `engagement_score` | Báo cáo & Thống kê | `/reports` | `access`, `view_all` |

---

## 3. Danh Sách 7 Nhóm Quyền Mặc Định (Default System Groups)

1. **Admin**: Toàn quyền mọi Resource và Action (`fullCrud` 100%).
2. **CEO**: Toàn quyền xem số liệu toàn công ty (`view_all` tất cả), quản lý Deal/Quote, không có quyền sửa cấu hình hệ thống / phân quyền.
3. **Trưởng phòng**: Toàn quyền CRUD trong phạm vi phòng ban và cấp dưới, không được xem ngoài phòng ban trừ khi được cấp `view_all`.
4. **Sale Senior**: CRUD khách hàng, hội thoại của mình, có quyền xóa khách hàng/hội thoại do mình phụ trách.
5. **Sale Junior**: Chỉ tạo mới và chăm sóc khách hàng của mình, không có quyền xóa.
6. **Marketing**: Quản lý chiến dịch Broadcast, Trigger, Tệp khách hàng, kho Media, `contact.view_all=true` để quét tệp.
7. **CSKH**: Chăm sóc hội thoại, tiếp nhận khách, hỗ trợ nhắn tin và gắn thẻ.


---

# PHẦN VI: KHẢO SÁT & AUDIT HIỆN TRẠNG HỆ THỐNG TIỀN NHIỆM

# ZaloCRM - Audit Kiến Trúc Hiện Tại

> Ngày audit: 2026-09-24

## Verdict: Feature-based Modular Monolith (KHÔNG PHẢI DDD)

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js ESM, Fastify 5, TypeScript, Prisma 7 |
| Database | PostgreSQL 16 (93 Prisma models) |
| Cache/Queue | Redis 7, BullMQ |
| Realtime | Socket.IO |
| Storage | MinIO |
| Frontend | Vue 3, Vite, Pinia, Vuetify, TailwindCSS |
| Zalo Integration | zca-js (pool/socket/listener per nick) |

## Kiến trúc hiện tại

```
Request → Routes (Fastify) → Services (Business logic + Prisma trực tiếp) → PostgreSQL
                                   ↓
                             BullMQ / Redis (Background Jobs)
                                   ↓
                             Socket.IO (Real-time updates)
```

### 23 Module Backend (`backend/src/modules/`)

| Nhóm | Module |
|---|---|
| Identity & Access | `auth`, `rbac`, `privacy` |
| Zalo Integration | `zalo`, `system-notifications` |
| CRM Core | `contacts`, `chat`, `tags`, `lead-pool`, `search` |
| Growth & Intelligence | `scoring`, `engagement`, `automation`, `campaign`, `ai` |
| Reporting | `analytics`, `dashboard` |
| Platform / Shared | `api`, `integrations`, `notifications`, `branding`, `activity`, `media` |

### Cấu trúc mỗi module (3 file)

- `xxx.routes.ts` — HTTP endpoints (Fastify route handlers)
- `xxx.service.ts` — Business logic + Prisma queries trộn lẫn
- `xxx.schema.ts` — Input validation (TypeBox/Zod)

### Shared (`backend/src/shared/`)

- `database/` — Prisma client singleton
- `tenant/` — Multi-tenancy middleware
- `types/` — Shared interfaces, DTOs
- `realtime/` — Socket.IO event emitter

## Lý do KHÔNG PHẢI DDD

| Tiêu chí DDD | Hiện trạng | Đánh giá |
|---|---|---|
| Aggregate Root | Không có class Aggregate. Model = Prisma generated interfaces | ❌ |
| Entity / Value Object | Không có. Dùng primitive types (`string`, `number`) | ❌ |
| Repository Pattern | Không có interface Repository. Service gọi `prisma.xxx.findMany()` trực tiếp | ❌ |
| Domain Events | Không có. Dùng BullMQ/EventEmitter gắn chặt infra | ❌ |
| Bounded Contexts | Module chia theo CRUD/table, không theo sub-domain nghiệp vụ | ❌ |
| Ubiquitous Language | Không có glossary. Naming lẫn lộn tiếng Anh/Việt | ❌ |
| Domain Services | Business logic nằm trong service layer, trộn lẫn persistence logic | ❌ |
| Anti-corruption Layer | Zalo API gọi trực tiếp từ service, không có adapter/port trung gian | ❌ |

## Mô hình dữ liệu gốc: Contact vs Friend ("2 cuốn sổ")

- **Contact** = KH Cha (góc nhìn manager) — thuộc tính con người + aggregate score/status
- **Friend** = Phiếu chăm sóc con (góc nhìn sale/nick) — mỗi row = 1 cặp `zaloAccount × identity`
- 1 Contact → N Friend
- Score chính nằm ở Friend; `Contact.leadScore` = aggregate MAX
- Breakdown 4 chiều: Engagement / Intent / Fit / Velocity
- `relationship_kind`: `friend` | `pending_friend` | `chatting_stranger` | `ghost`

## Vấn đề chính cần giải quyết khi chuyển DDD

1. **Anemic Domain Model**: Logic nằm hết trong service, model chỉ là data container
2. **Persistence coupling**: Business logic gọi Prisma trực tiếp, không tách được
3. **Module boundaries mờ**: Các module import lẫn nhau tự do qua shared types
4. **Thiếu invariant protection**: Không có aggregate root bảo vệ business rules
5. **Infra leak vào domain**: Redis/BullMQ/Socket.IO xen kẽ trong business logic

