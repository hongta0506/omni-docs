# Báo Cáo Đối Soát Production (Branch release/orbstack-mini-20260924) vs Omni Core (Golang DDD)

> **Mục tiêu tối thượng:** Đảm bảo **Zero Frontend Breakage**. Mọi API endpoints của Go backend sau khi migrate phải giữ nguyên 100% path, query params, request body, và response JSON structure để Frontend kết nối trực tiếp không bị vỡ.

---

## 1. Hiện Trạng Nhánh Production Thực Tế Của ZaloCRM

Qua kiểm tra remote `https://github.com/admatrixorg/ZaloCRM.git`, nhánh `main` hiện đang dừng ở commit `d352dd9e` (nhánh cũ/lỗi thời). Nhánh thực tế đang chạy trên môi trường production là:
- **Nhánh production**: `release/orbstack-mini-20260924` (hoặc `release/056-p2c-duong-ra` / commit head: `1cd368854e3ba2d4ac8a8bc8a3ec89145f5b8d74`).
- Chứa toàn bộ các gói tính năng từ Spec 028 đến 061 (bao gồm: `028b` Đơn hàng đa nguồn, `038` Zalo OA, `043/044` Zalo Bot & Chấm điểm, `046` Service API đa tenant, `050` Tồn kho & KiotViet/Pancake, `054` Egress proxy per-nick, `056 P2c` Cấp phát đường ra & SOCKS5h pool, `057` Kho đơn hàng, `058` Trang hướng dẫn, `060` Hành động đề xuất, `061` Sửa lỗi gửi tin hàng loạt thật thay vì stub).

---

## 2. Thống Kê Endpoints Thực Tế

- **Tổng số REST API endpoints trên nhánh Production (`release/orbstack-mini-20260924`)**: **614 endpoints** phân bổ trên 34 modules backend.
- **Tổng số RPCs hiện tại trong Omni Core (`omni-core`)**: **41 RPCs**.
- **Khoảng trống (Gap)**: Còn **~573 endpoints** chưa được di trú sang Golang hoặc cần đối soát trường dữ liệu.

### Bảng Thống Kê Endpoints Theo Module (Xếp theo số lượng giảm dần)

| # | Module Tên | Số Routes Prod | Trạng Thái Migration Sang Go | Ghi Chú & Bounded Context Tương Ứng |
|---|---|:---:|:---:|---|
| 1 | `contacts` | 78 | Đã migrate 5 RPCs | **Customer BC**: Đã có Contact CRUD & Link Profile. Còn thiếu: Appointments, Notes, Pipeline/Status, Lead Scoring, Duplicate Detect, Cockpit view, Merged stubs. |
| 2 | `service-api` | 68 | Chưa migrate (0) | **Service API / Integration BC**: Cung cấp API cho agent bên ngoài/Goclaw: messaging, lead assignment, sales write, birthday worker, webhook dispatch. |
| 3 | `integrations` | 54 | Chưa migrate (0) | **Channel Gateway BC / Integrations**: Facebook Messenger, Zalo OA OAuth, Zalo Bot Webhook, Telegram Personal & Bot, Pancake POS, KiotViet. |
| 4 | `zalo` | 51 | Đã migrate 5 RPCs | **Channel Gateway BC**: Đã có QR login & stream cơ bản. Còn thiếu: Group scan/moderation, friend sync, Zalo labels, status log checkpoint, proxy/egress per-nick. |
| 5 | `chat` | 39 | Đã migrate 3 RPCs | **Conversation BC**: Đã có list chat, xem tin nhắn, gửi tin text. Còn thiếu: Chat folders, attachments/media, preset quick replies, reaction echo cache, operations. |
| 6 | `auth` | 35 | Đã migrate 4 RPCs | **Identity & Access BC**: Đã có Login, RefreshToken, GetUser, Tenant. Còn thiếu: Auto-provisioning, onboarding flow, org/team management, security audit log. |
| 7 | `media` | 24 | Chưa migrate (0) | **Media / Storage Supporting Subdomain**: Upload media, Cloudflare R2 / S3 presigned URLs, thumbnail generator, media trash GC. |
| 8 | `dashboard` | 23 | Chưa migrate (0) | **Analytics & Reporting BC**: Overview metrics, Excel sheet builders, Action hub, report analytics. |
| 9 | `deals` | 23 | Chưa migrate (0) | **Sales / Order BC (Spec 028b & 057)**: Quản lý deal, deal stage, deal approval, contact won promote, deal timeline. |
| 10 | `ai` | 20 | Đã thiết kế Jev router | **AI & Intelligence BC**: AI ask, knowledge base, reply draft prompt, sentiment, virtual assistant, summary. |
| 11 | `system-notifications` | 19 | Chưa migrate (0) | **Notification Supporting Subdomain**: Welcome message builder, user create with zalo, internal contact handshake. |
| 12 | `rbac` | 18 | Một phần trong Identity | **Identity & Access BC**: Department routes, permission group CRUD, user assignment. |
| 13 | `order-store` | 17 | Chưa migrate (0) | **Order Store BC (Spec 057)**: Kho đơn hàng, order link routes, sync cron, debt sweep, return sweep, order totals. |
| 14 | `quotes` | 17 | Chưa migrate (0) | **Sales BC (Spec 041/041b)**: Bảng giá dịch vụ theo tháng, tạo quote PDF, quote approval flow, money words. |
| 15 | `ai-agent` | 15 | Chưa migrate (0) | **AI Agent / Goclaw Bridge**: Agent pick rule, goclaw provider routes, auto reply settings, retail channel routes. |
| 16 | `api` | 14 | Chưa migrate (0) | **Public API & Webhook BC**: Public API keys, webhook settings, webhook subscription. |
| 17 | `ops-radar` | 12 | Chưa migrate (0) | **Ops Radar BC (Spec 032)**: Radar vận hành, signal detector, sentiment sweep, work hours metrics. |
| 18 | `products` | 12 | Chưa migrate (0) | **Product Catalog BC (Spec 042/050b)**: Đồng bộ danh mục KiotViet, full sync & delta sync, product kinds. |
| 19 | `tags` | 12 | Đã migrate (19 RPCs) | **Tagging BC**: Tag, TagGroup, Cung cham tag, Zalo label sync. |
| 20 | `analytics` | 10 | Chưa migrate (0) | **Analytics BC**: Response time, team performance, conversion funnel, saved reports. |
| 21 | `scoring` | 10 | Chưa migrate (0) | **Customer BC / Scoring (Spec 044)**: Chấm điểm đa kênh, auto tag by score, decay cron, stuck detection. |
| 22 | `privacy` | 9 | Chưa migrate (0) | **Security / Privacy Subdomain**: Privacy leak guard (che SĐT/thông tin nhạy cảm), OTP service, session service. |
| 23 | `order-platform` | 8 | Chưa migrate (0) | **Order Platform Gateway**: Adapter KiotViet / Pancake POS. |
| 24 | `accounts` | 6 | Chưa migrate (0) | **Identity / Accounts**: Quản lý profile tài khoản nội bộ. |
| 25 | `work-items` | 4 | Chưa migrate (0) | **Task & Work Item Subdomain**: Công việc cần xử lý của nhân viên tư vấn. |
| 26 | `activity` | 3 | Chưa migrate (0) | **Activity Log Subdomain**: Timeline routes, activity logger. |
| 27 | `engagement` | 3 | Chưa migrate (0) | **Customer Engagement Subdomain**: Priority service, engagement cron, engagement tags. |
| 28 | `branding` | 2 | Chưa migrate (0) | **Tenant Branding Subdomain**: Logo, theme tổ chức. |
| 29 | `campaign` | 2 | Chưa migrate (Issue #23) | **Marketing BC (Spec 037/061)**: Broadcast campaign, gửi tin hàng loạt thật. |
| 30 | `entitlement` | 2 | Chưa migrate (0) | **Subscription & Entitlement**: Quản lý giới hạn nick, trial window, gói cước. |
| 31 | `config` | 1 | Chưa migrate (0) | Cấu hình hệ thống. |
| 32 | `notifications` | 1 | Chưa migrate (0) | Nhắc nhở tin chưa trả lời (Unanswered reminder). |
| 33 | `search` | 1 | Chưa migrate (0) | Tìm kiếm toàn cục đa đối tượng. |
| 34 | `users` | 1 | Đã migrate | User profile routes. |

---

## 3. Các Lỗi Sửa Trên Bản Node.js Prod Cần Được Đảm Bảo Tuyệt Đối Khi Sang Go

Qua rà soát commit history của `release/orbstack-mini-20260924`:

1. **Spec 061 (Gửi tin hàng loạt thật - Commit `39c2dc7`, `5f5e372`, `67d444c`)**:
   - Bản cũ từng có đoạn stub ghi cứng: "giả lập không gửi Zalo thật". Trên bản Prod đã được gỡ bỏ và kích hoạt gửi thật qua Zalo API.
   - Khi migrate sang Go (`internal/marketing`): **Tuyệt đối không để lại stub**, phải gửi qua Zalo personal dispatch hoặc OA dispatch, hỗ trợ biến thay thế template: `{name}`, `{gender}`, `{sale}`.
   - Xử lý kích hoạt lại lượt tạm dừng: tổng người nhận phải tính theo bất biến (`invariant`), không được cộng dồn trùng lặp.
2. **Spec 056 P2c (Cấp phát đường ra & SOCKS5h - Commit `bad7f78`, `1cd3688`)**:
   - Cơ chế proxy egress per-nick: Tách biệt pool SOCKS5h, cơ chế đánh chết cổng khi proxy hỏng (`circuit-breaker`), không để treo QR scan khi SOCKS auth-fail.
3. **Spec 057 P5 (Kho đơn hàng & Gộp khách hàng - Commit `551e814`, `216be40`)**:
   - Khi gộp khách hàng (`MergeContacts`): phải dời cả `mirrored_orders.contact_id`, tính lại `total_spent` và `purchase_count` ngay trong cùng transaction giữ lock theo tenant.
4. **Spec 044 (Chấm điểm đa kênh) & Spec 050 (Tồn kho KiotViet)**:
   - Tên sản phẩm tìm kiếm phải chuẩn hóa không dấu và đối chiếu chính xác mã code hàng hóa trước khi agent AI trả lời tồn kho.

---

## 4. Kế Hoạch Đóng Gói GitHub Issues Cho Các Bounded Context Còn Lại

Để giữ nguyên contract API và chuẩn bị cho việc ráp thẳng Frontend vào Omni Core:

- [ ] **Issue A: [Customer-Ext] Contacts Detail, Notes, Appointments, Pipeline & Activity Timeline** (Bao phủ 73 routes còn lại của `contacts`).
- [ ] **Issue B: [Conversation-Ext] Chat Folders, Media Attachments & Quick Presets** (Bao phủ 36 routes còn lại của `chat` & `media`).
- [ ] **Issue C: [Channel-Zalo-Ext] Group Scan, Moderation, Zalo Labels & Multi-account Proxy Egress** (Bao phủ 46 routes còn lại của `zalo`).
- [ ] **Issue D: [Marketing] Broadcast Campaign, ZNS & Batch Dispatching (Spec 037b & 061)** (Tương ứng Issue #23 hiện có).
- [ ] **Issue E: [Deals-Orders] Sales Deals & Order Store KiotViet/Pancake (Spec 028b, 050, 057)** (Bao phủ modules `deals`, `order-store`, `quotes`).
- [ ] **Issue F: [Analytics-Radar] Performance, Chat SLA, Dashboard & Ops-Radar (Spec 032)** (Tương ứng Issue #24 hiện có).
- [ ] **Issue G: [Service-API] Bounded Context for External Agents, Goclaw & Webhooks (Spec 046)** (Bao phủ module `service-api`).
- [ ] **Issue H: [Privacy-Security] Privacy Leak Guard (Phone Masking), OTP & RBAC Deep Scoping**.
