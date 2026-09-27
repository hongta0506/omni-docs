# Kế Hoạch Di Trú Chi Tiết (Migration Work Breakdown Structure)
## Từ ZaloCRM Production (`release/orbstack-mini-20260924`) Sang Omni-Core (Golang Clean DDD)

> **Nguyên tắc cốt lõi:**
> 1. **Zero Frontend Breakage**: Giữ nguyên toàn bộ schema trường dữ liệu, path, query param và payload JSON của REST API để Frontend gọi trực tiếp không đổi code.
> 2. **Clean DDD Invariants**: Tầng Domain thuần túy (chỉ Go stdlib + uuid), bảo vệ bất biến qua `ValidatedAggregate`, tách CQRS Command/Query, Bun ORM tại Infra, Transactional Outbox ghi đồng thời vào `domain_events`.
> 3. **Production Parity**: Kế thừa 100% các bản vá lỗi quan trọng trên nhánh production (Spec 056 P2c, Spec 057 P5, Spec 061).

---

## Danh Sách 8 Gói Task (Epics) & Các Modules Tương Ứng

### Epic 1: [Customer-Ext] Bổ sung tính năng Khách hàng nâng cao (Module `contacts` - 73 routes còn lại)
*Mục tiêu: Đưa Customer Bounded Context từ mức CRUD cơ bản lên đầy đủ tính năng CRM bán hàng.*

- [ ] **Task 1.1: Sub-resource Contact Notes & Activity Timeline** (`/api/v1/contacts/:id/notes`, `/api/v1/contacts/:id/activities`)
  - Domain: Aggregate `ContactNote`, Value Object `ActivityType`.
  - Invariant: Note phải thuộc về đúng tenant & contact; activity ghi lại dấu vết chỉnh sửa (diff).
- [ ] **Task 1.2: Contact Appointments & Reminders** (`/api/v1/appointments`, `/api/v1/contacts/:id/appointments`)
  - Domain: Aggregate `Appointment` (thời gian, địa điểm, trạng thái: scheduled, completed, cancelled).
  - Background Job: Cron nhắc hẹn gửi qua tin nhắn Zalo/Notification trước giờ hẹn.
- [ ] **Task 1.3: Contact Pipeline, Statuses & Lead Assignment** (`/api/v1/contacts/pipeline`, `/api/v1/contacts/status`, `/assign`)
  - Domain: Value Object `ContactStatus`, Service `LeadAssignmentDomain`.
  - Invariant: Phân công sale phụ trách có ghi nhận lịch sử và chuyển quyền truy cập.
- [ ] **Task 1.4: Duplicate Detection & Smart Merging với Order Preservation (Spec 057 P5)**
  - Đảm bảo khi gộp 2 contact: dời toàn bộ `mirrored_orders.contact_id` sang contact chính, tính lại `total_spent` và `purchase_count` trong cùng transaction giữ lock theo tenant.

---

### Epic 2: [Conversation-Ext] Tính năng Trò chuyện nâng cao & Media (Module `chat` & `media` - 60 routes)
*Mục tiêu: Đưa hệ thống chat lên chuẩn realtime đa kênh hoàn chỉnh.*

- [ ] **Task 2.1: Chat Folders & Tagging Conversations** (`/api/v1/chat/folders`, `/conversations/:id/folder`)
  - Domain: Quản lý thư mục chat theo cá nhân hóa nhân viên.
- [ ] **Task 2.2: Preset Quick Replies** (`/api/v1/chat/presets`)
  - Domain: Quản lý tin nhắn mẫu, phím tắt trả lời nhanh kèm biến động `{name}`, `{sale}`.
- [ ] **Task 2.3: Media Storage & Upload Service (Cloudflare R2 / S3)** (`/api/v1/media/upload`, `/api/v1/media/:id`)
  - Infra: Presigned URL generator, R2 adapter, lưu trữ metadata tệp (ảnh, video, voice, tài liệu).
- [ ] **Task 2.4: Chat Reactions, Echo Cache & Message Revoke/Delete**
  - Chống echo lặp tin nhắn khi bot và người cùng online, hỗ trợ thu hồi tin nhắn trên Zalo.

---

### Epic 3: [Channel-Zalo-Ext] Quản lý Nhóm & Hạ tầng Egress Proxy (Module `zalo` - 46 routes)
*Mục tiêu: Quản lý toàn diện tài khoản Zalo, nhóm Zalo và pool proxy chống khóa nick.*

- [ ] **Task 3.1: Group Management & Group Scan Worker** (`/api/v1/zalo/groups`, `/scan`)
  - Quét danh sách thành viên nhóm Zalo, lọc lead tiềm năng vào CRM.
- [ ] **Task 3.2: Zalo Labels Sync** (`/api/v1/zalo/labels`)
  - Đồng bộ nhãn màu phân loại từ Zalo app về hệ thống CRM hai chiều.
- [ ] **Task 3.3: Egress Proxy Pool & Circuit Breaker (Spec 056 P2c)** (`/api/v1/zalo/egress/*`)
  - Quản lý pool proxy SOCKS5h per-nick, tự động phát hiện và ngắt cổng khi proxy hỏng (`auth-fail`), không làm nghẽn tiến trình sinh mã QR.

---

### Epic 4: [Marketing] Chiến dịch Gửi tin hàng loạt & ZNS (Module `campaign` - Issue #23 - Spec 037b & 061)
*Mục tiêu: Hệ thống gửi tin hàng loạt chuẩn production không dùng stub.*

- [ ] **Task 4.1: Campaign Aggregate & Target Audience Filter**
  - Lọc đối tượng gửi động theo Segment, Tag, hoặc danh sách tải lên.
- [ ] **Task 4.2: Template Engine & Variable Interpolation**
  - Thay thế chính xác các biến `{name}`, `{gender}`, `{sale}` theo dữ liệu contact thực tế.
- [ ] **Task 4.3: Real Dispatch Worker & Rate Limiter**
  - Điều phối gửi tin thật qua Zalo personal dispatch hoặc Zalo OA ZNS, kiểm soát tần suất tránh vi phạm chính sách Zalo.
- [ ] **Task 4.4: Invariant Resume Paused Campaigns**
  - Kích hoạt lại chiến dịch tạm dừng: tổng số người nhận phải giữ nguyên bất biến, không cộng dồn trùng lặp.

---

### Epic 5: [Deals-Orders] Bán hàng, Báo giá & Kho Đơn Hàng (Modules `deals`, `order-store`, `quotes`, `products` - 69 routes - Spec 028b, 041, 050, 057)
*Mục tiêu: Quản lý đơn hàng đa nguồn, đồng bộ KiotViet/Pancake và xuất báo giá PDF.*

- [ ] **Task 5.1: Sales Deals Pipeline & Stages** (`/api/v1/deals`)
  - Pipeline cơ hội bán hàng, chuyển đổi trạng thái (deal transition), tính xác suất thành công.
- [ ] **Task 5.2: Product Catalog & KiotViet Inventory Sync (Spec 042, 050b)** (`/api/v1/products`)
  - Đồng bộ sản phẩm từ KiotViet (full sync & delta sync theo webhook), chuẩn hóa tìm kiếm tên sản phẩm không dấu.
- [ ] **Task 5.3: Order Store & Debt Sweep (Spec 057)** (`/api/v1/order-store/*`)
  - Lưu trữ đơn hàng đa nguồn, tự động quét nợ và đối chiếu trạng thái giao hàng.
- [ ] **Task 5.4: Pricebook & Quote PDF Generator (Spec 041/041b)** (`/api/v1/quotes`)
  - Tạo bảng giá theo tháng, chuyển số thành chữ (`money-words`), sinh hóa đơn/báo giá PDF.

---

### Epic 6: [Service-API] Cổng Tích Hợp Đa Tenant Cho AI & Goclaw (Module `service-api` - 68 routes - Spec 046)
*Mục tiêu: Cung cấp API gateway chuẩn hóa cho các agent tự động bên ngoài tương tác với CRM.*

- [ ] **Task 6.1: Service Auth & Request Fingerprinting**
  - Xác thực API key theo từng tenant, chống replay request qua fingerprint.
- [ ] **Task 6.2: Agent Hands & Write Policies**
  - Phân quyền giới hạn phạm vi ghi của AI Agent (chỉ được sửa lead được giao, không can thiệp lead khác).
- [ ] **Task 6.3: Webhook Delivery Runner & Outbox Scheduler**
  - Đảm bảo gửi webhook sự kiện (at-least-once) ra bên ngoài khi có thay đổi trong CRM.

---

### Epic 7: [Analytics-Radar] Báo Cáo Hiệu Suất & Radar Vận Hành (Modules `analytics`, `dashboard`, `ops-radar` - 45 routes - Issue #24 - Spec 032)
*Mục tiêu: Báo cáo số liệu thời gian thực và giám sát bất thường.*

- [ ] **Task 7.1: Agent Performance & Chat SLA Metrics**
  - Đo thời gian phản hồi đầu tiên, thời gian xử lý trung bình của từng tư vấn viên.
- [ ] **Task 7.2: Ops Radar Signal Sweep & Anomaly Detection**
  - Quét tin nhắn tiêu cực (sentiment), phát hiện khách hàng bị bỏ quên trong giờ làm việc.
- [ ] **Task 7.3: Excel Report Exporter**
  - Xuất báo cáo doanh thu, tương tác và khách hàng dưới dạng file Excel chuẩn.

---

### Epic 8: [Privacy-Security] Bảo Vệ Thông Tin Nhạy Cảm & RBAC Sâu (Modules `privacy`, `rbac` - 27 routes)
*Mục tiêu: Bảo mật dữ liệu khách hàng tuyệt đối.*

- [ ] **Task 8.1: Privacy Leak Guard (Phone Masking)**
  - Tự động che số điện thoại trong giao diện và API đối với nhân viên không đủ thẩm quyền; mở khóa bằng OTP/PIN.
- [ ] **Task 8.2: Granular RBAC Permissions**
  - Phân quyền theo phòng ban (`departments`) và nhóm quyền linh hoạt (`permission-groups`).
