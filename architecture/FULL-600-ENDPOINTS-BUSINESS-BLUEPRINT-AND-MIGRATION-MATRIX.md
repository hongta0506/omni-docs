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
| `GET` | `/api/v1/accounts` | Danh sách tài khoản Zalo cá nhân đang kết nối | `modules/accounts/account-routes.ts` |
| `POST` | `/api/v1/accounts/qr` | Khởi tạo phiên quét mã QR đăng nhập Zalo | `modules/zalo/zalo-routes.ts` |
| `GET` | `/api/v1/accounts/qr/:sessionId` | Long-polling / SSE trạng thái quét mã QR | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/accounts/:id/sync` | Kích hoạt quét đồng bộ danh bạ bạn bè từ Zalo | `modules/zalo/zalo-sync-routes.ts` |
| `GET` | `/api/v1/accounts/:id/labels` | Lấy danh sách nhãn phân loại nội bộ của Zalo | `modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/accounts/:id/labels` | Tạo nhãn đồng bộ lên Zalo Server | `modules/zalo/zalo-labels-routes.ts` |
| `GET` | `/api/v1/accounts/:id/groups` | Danh sách nhóm chat Zalo mà nick tham gia | `modules/zalo/group-routes.ts` |
| `POST` | `/api/v1/accounts/:id/groups/scan` | Quét phân tích thành viên trong nhóm Zalo | `modules/zalo/group-scan-routes.ts` |
| `PATCH`| `/api/v1/accounts/:id/status` | Tạm ngưng hoặc bật kết nối tài khoản | `modules/accounts/account-routes.ts` |
| `DELETE`| `/api/v1/accounts/:id` | Đăng xuất và gỡ bỏ tài khoản khỏi hệ thống | `modules/accounts/account-routes.ts` |
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
  * **Lead Pool (Kho Lead):** Sàn nhận Lead tự do (`/lead-pool`), Bảng thống kê phân phối lead cho sale (`/lead-pool/stats`), Cấu hình quy tắc chia chìa khóa trao tay (`/lead-pool/config`).
  * **Chat Console (Trung tâm tin nhắn):** Màn hình Chat đa kênh (`/chat`), Bộ lọc hội thoại nâng cao (`/chat/folders`), Thư viện tin nhắn mẫu (`/chat/presets`), Xử lý tệp đính kèm và gắn watermark chống lộ dữ liệu (`/chat/media`).
* **Trọng tâm nghiệp vụ:** 
  * `Contact` là Aggregate Root tối thượng: Quản lý họ tên, số điện thoại, danh sách mạng xã hội liên kết (Zalo UserID, Telegram ID, Facebook PSID), điểm số quan tâm (Lead Score).
  * `Lead Pool`: Phân phối khách hàng tiềm năng cho đội ngũ Telesale/Tư vấn theo thuật toán Round-Robin hoặc nhận thủ công (Claim Lead).
  * `Conversation & Message`: Hội thoại tập trung, streaming realtime qua WebSocket, lưu vết đọc tin nhắn, gắn nhãn tin nhắn và trích xuất lịch sử tương tác.

#### B. Danh mục Endpoints Tham Chiếu
| Method | Endpoint | Chức năng nghiệp vụ | Legacy Controller (ZaloCRM) |
|---|---|---|---|
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
* **Bảng Database Postgres:** `contacts`, `contact_identities` (mapping Zalo/Phone), `contact_notes`, `appointments`, `lead_pool_items`, `lead_assignments`, `customer_lists`, `conversations`, `messages`, `chat_presets`.
* **Ràng buộc Invariants:**
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
