# Kế Hoạch Sprint & Lộ Trình Di Trú Nghiệp Vụ (Business-First Migration Roadmap)
## Từ ZaloCRM Production (`release/orbstack-mini-20260924`) Sang Omni-Core (Golang Clean DDD)

> **Mục tiêu:** Phân rã 573 endpoints và 34 modules thành **6 Sprint độc lập, rõ ràng về mặt nghiệp vụ (Business Boundaries)**. Mỗi Sprint có định nghĩa Invariants, luồng nghiệp vụ chi tiết, bảng rủi ro và tiêu chí nghiệm thu (Acceptance Criteria) để tránh miss bất kỳ logic nào từ bản Production.

---

## TỔNG QUAN 6 SPRINTS

```
[Sprint 1: Marketing & Automation (Spec 037b/061)]
   ├── Gửi tin hàng loạt thật qua Zalo Personal & OA
   └── Rate limiter, Template engine & Invariant Resume
         │
         ▼
[Sprint 2: Customer Core Extensions (Spec 057 P5)]
   ├── Notes, Appointments, Pipeline, Activity Timeline
   └── Smart Merge bảo toàn đơn hàng & tính lại tổng tiền mua
         │
         ▼
[Sprint 3: Sales Deals, Orders & Inventory (Spec 028b/041/050/057)]
   ├── Phễu cơ hội (Deals), Kho đơn hàng đa nguồn (KiotViet/Pancake)
   └── Báo giá dịch vụ (PDF, money-words) & Đồng bộ tồn kho không dấu
         │
         ▼
[Sprint 4: Conversation Advanced & Media Storage]
   ├── Chat Folders, Tin nhắn mẫu (Presets), Thu hồi tin & Reaction
   └── Media Service upload Cloudflare R2 / S3
         │
         ▼
[Sprint 5: Zalo Channel Deep Ops & Egress Proxy (Spec 056 P2c)]
   ├── Quét nhóm Zalo (Group Scan), Đồng bộ nhãn Zalo (Labels)
   └── Proxy SOCKS5h per-nick, Circuit-breaker ngắt cổng chết
         │
         ▼
[Sprint 6: Service-API, Analytics & Ops Radar (Spec 032/046)]
   ├── Cổng API cho AI Agent/Goclaw (API key, replay protection, write policy)
   └── Thống kê SLA phản hồi chat trong giờ làm việc, phát hiện sentiment
```

---

## CHI TIẾT TỪNG SPRINT & BẢN ĐỒ NGHIỆP VỤ (BUSINESS SPEC)

---

### SPRINT 1: [Marketing] Chiến Dịch Gửi Tin Hàng Loạt & Automation (Ưu Tiên Số 1)
- **Module nguồn**: `backend/src/modules/campaign` (và các file test `broadcast-*.test.ts`).
- **Issues GitHub tương ứng**: Issue #23 (`[Marketing] feat: Broadcast campaign & ZNS message dispatching`).
- **Đặc tả nghiệp vụ (Business Rules & Invariants)**:
  1. **Không dùng stub (Spec 061)**: Tuyệt đối không để lại code stub "giả lập không gửi Zalo thật". Phải phân phối gửi thật qua:
     - Zalo Personal Adapter (dành cho nick cá nhân).
     - Zalo OA / ZNS Adapter (dành cho Official Account).
  2. **Template Variable Interpolation**: Tự động thay thế chính xác các trường động:
     - `{name}`: Tên hiển thị của khách (hoặc "quý khách" nếu trống).
     - `{gender}`: "Anh" / "Chị" / "Bạn" dựa theo giới tính nhận diện.
     - `{sale}`: Tên của nhân viên phụ trách khách hàng.
  3. **Invariant Resume Paused Campaign (Spec 061)**: Khi người dùng tạm dừng chiến dịch rồi bấm gửi tiếp (`resume`), tổng số người nhận (`total_recipients`) phải giữ nguyên bất biến theo snapshot ban đầu, **không được cộng dồn trùng lặp**.
  4. **Rate Limiting & Safety Jitter**: Giữa mỗi tin nhắn gửi qua Zalo Personal phải có khoảng nghỉ ngẫu nhiên (3s - 7s) và kiểm soát số lượng tin/giờ/nick để tránh bị Zalo khóa tài khoản.

- **Checklist bàn giao**:
  - [ ] Domain Model: `Campaign`, `CampaignRecipient`, `MessageTemplate`.
  - [ ] CQRS Handlers: `CreateCampaign`, `StartCampaign`, `PauseCampaign`, `ResumeCampaign`, `GetCampaignProgress`.
  - [ ] Dispatch Worker ngầm chạy độc lập kiểm soát tần suất gửi.
  - [ ] Unit test cho bộ phân giải biến template và test case Invariant Resume.

---

### SPRINT 2: [Customer-Ext] Nghiệp Vụ Khách Hàng Nâng Cao & Gộp Hồ Sơ (Spec 057 P5)
- **Module nguồn**: `backend/src/modules/contacts` (73 routes con).
- **Đặc tả nghiệp vụ (Business Rules & Invariants)**:
  1. **Sub-resource Notes & Activity Timeline**:
     - Ghi chú (`ContactNote`) hỗ trợ markdown ngắn, đính kèm thông tin tác giả.
     - Dòng thời gian (`ContactActivity`) tự động ghi nhận mọi biến động: đổi nhân viên phụ trách, thêm nhãn, đặt lịch hẹn, tạo báo giá.
  2. **Lịch hẹn (`Appointment`) & Nhắc lịch**:
     - Quản lý trạng thái: `scheduled`, `confirmed`, `completed`, `cancelled`.
     - Job quét lịch hẹn sắp tới hạn để gửi thông báo cho nhân viên và khách qua Zalo.
  3. **Bảo toàn Invariant Gộp Khách Hàng (Spec 057 P5)**:
     - Khi gộp `Contact A` vào `Contact B`:
       - Chuyển toàn bộ `mirrored_orders.contact_id` từ A sang B.
       - Tính toán lại ngay lập tức `total_spent` (tổng chi tiêu) và `purchase_count` (số lần mua) của Contact B trong cùng transaction có database lock theo tenant.
       - Đánh dấu `is_merged = true`, `merged_into_id = B.id` trên Contact A.

- **Checklist bàn giao**:
  - [ ] Domain Model: `ContactNote`, `Appointment`, `ContactActivity`.
  - [ ] Repository: `NoteRepository`, `AppointmentRepository`, `ActivityRepository` trên Bun ORM.
  - [ ] CQRS Handlers đầy đủ cho Notes, Appointments, Pipeline summary.
  - [ ] Integration test xác nhận tính toán lại đơn hàng khi merge contact đúng như bản Spec 057 P5.

---

### SPRINT 3: [Deals-Orders] Quản Lý Cơ Hội Bán Hàng, Báo Giá & Kho Đơn Hàng
- **Module nguồn**: `deals`, `order-store`, `quotes`, `products`, `order-platform` (69 routes).
- **Đặc tả nghiệp vụ (Business Rules & Invariants)**:
  1. **Pipeline Cơ Hội Bán Hàng (`Deal`)**:
     - Các giai đoạn: `lead` ➔ `qualified` ➔ `proposal_sent` ➔ `negotiation` ➔ `won` / `lost`.
     - Khi deal chuyển sang `won`: Tự động nâng hạng khách hàng (`contact-won-promote`).
     - Tiền tệ lưu số nguyên `int64` (VND), không dùng float.
  2. **Kho Đơn Hàng Đa Nguồn & Quét Nợ (Spec 057)**:
     - Lưu trữ đơn từ KiotViet, Pancake, POS.
     - Kiểm soát `purchase_key` duy nhất để tránh lưu vết trùng.
     - Cron quét nợ (`order-debt-sweep`): khi khách thanh toán nốt phần nợ, cập nhật `paid_amount` và bắn sự kiện `OrderDebtSettledEvent`.
  3. **Báo Giá & Đọc Số Tiền Thành Chữ (Spec 041/041b)**:
     - Tạo báo giá dịch vụ theo tháng, có ngày hết hạn (`valid_until`).
     - Thuật toán đọc tiền thành chữ tiếng Việt (`money-words`) chính xác 100% (ví dụ: `15.500.000` ➔ "Mười lăm triệu năm trăm nghìn đồng").
     - Xuất file PDF theo mẫu in ấn cho khách.
  4. **Đồng Bộ Tồn Kho & Tìm Kiếm Không Dấu (Spec 042/050b)**:
     - Tìm kiếm sản phẩm chuẩn hóa bỏ dấu (unaccent) và ưu tiên khớp mã SKU.

- **Checklist bàn giao**:
  - [ ] Domain Model: `Deal`, `MirroredOrder`, `Quote`, `Product`.
  - [ ] Bộ thuật toán `MoneyWords` tiếng Việt có unit test độc lập.
  - [ ] CQRS Handlers quản lý Deal, Order và Quote.
  - [ ] API xuất PDF báo giá chuẩn tương thích frontend.

---

### SPRINT 4: [Conversation-Ext] Trò Chuyện Nâng Cao, Phím Tắt & Kho Media
- **Module nguồn**: `chat`, `media` (60 routes).
- **Đặc tả nghiệp vụ (Business Rules & Invariants)**:
  1. **Thư mục chat (`ChatFolder`)**: Nhân viên có thể nhóm các cuộc hội thoại theo mục đích cá nhân (ví dụ: "Cần gọi lại", "Khách VIP", "Đang khiếu nại").
  2. **Mẫu câu trả lời nhanh (`Preset`)**: Quản lý câu trả lời soạn sẵn kèm phím tắt (shortcut), hỗ trợ biến `{name}` và `{sale}`.
  3. **Bộ đệm chống Echo (`EchoCache`) & Thu hồi tin**:
     - Khi bot và nhân viên cùng trong 1 nhóm chat, chống vòng lặp xử lý tin nhắn của chính mình.
     - Hỗ trợ thao tác thu hồi / xóa tin nhắn.
  4. **Dịch vụ lưu trữ Media (Cloudflare R2 / S3)**:
     - Tạo Presigned URL cho phép frontend upload trực tiếp file nặng (ảnh, video, tệp tài liệu).
     - Quản lý vòng đời tệp và thùng rác dọn dẹp định kỳ (`trash-gc`).

- **Checklist bàn giao**:
  - [ ] Domain Model: `ChatFolder`, `ChatPreset`, `MediaAsset`.
  - [ ] Adapter Cloudflare R2 / S3 cho media upload.
  - [ ] CQRS Handlers cho Folder, Preset và Media.

---

### SPRINT 5: [Channel-Zalo-Ext] Nhóm Zalo, Nhãn Màu & Hạ Tầng Egress Proxy (Spec 056 P2c)
- **Module nguồn**: `zalo` (46 routes).
- **Đặc tả nghiệp vụ (Business Rules & Invariants)**:
  1. **Quét thành viên nhóm Zalo (`GroupScan`)**:
     - Lấy danh sách thành viên trong nhóm Zalo, lọc ra các số điện thoại/lead chưa có trong CRM để import tự động.
  2. **Đồng bộ nhãn Zalo (`ZaloLabels`)**:
     - Đồng bộ nhãn màu phân loại giữa Zalo máy khách và hệ thống CRM hai chiều.
  3. **Hạ tầng Egress Proxy SOCKS5h & Circuit Breaker (Spec 056 P2c)**:
     - Gán cố định IP proxy cho từng nick Zalo để giữ an toàn vị trí đăng nhập.
     - **Cơ chế ngắt cổng (Circuit Breaker)**: Nếu proxy SOCKS5h bị lỗi xác thực (`auth-fail`) hoặc đứt kết nối 3 lần liên tiếp, hệ thống lập tức ngắt cổng proxy đó và chuyển hướng xử lý, **không để treo tiến trình quét mã QR đăng nhập**.

- **Checklist bàn giao**:
  - [ ] Domain Model: `ZaloGroup`, `ZaloLabel`, `EgressBinding`.
  - [ ] Service quản lý Pool Proxy có Circuit Breaker.
  - [ ] CQRS Handlers quét nhóm, gắn nhãn và quản lý đường ra proxy.

---

### SPRINT 6: [Service-API, Analytics & Ops Radar] Cổng Tích Hợp AI & Giám Sát Vận Hành (Spec 032/046)
- **Module nguồn**: `service-api`, `analytics`, `ops-radar`, `privacy`, `rbac` (113 routes).
- **Đặc tả nghiệp vụ (Business Rules & Invariants)**:
  1. **Service API cho External AI & Goclaw (Spec 046)**:
     - Xác thực API key đa tenant qua SHA-256 token hash.
     - Chống replay attack bằng `X-Request-Fingerprint` lưu trên Redis.
     - **Quy tắc Agent-Hands**: AI Agent chỉ được đọc/ghi trong phạm vi khách hàng được cấp phép (`scope`).
  2. **Đo Lường SLA & Hiệu Suất Tư Vấn (Spec 032)**:
     - Tính thời gian phản hồi tin nhắn đầu tiên của nhân viên.
     - Chỉ tính giờ làm việc (`work-hours`) của tổ chức (loại trừ ban đêm và ngày nghỉ).
  3. **Ops Radar Quét Tín Hiệu Bất Thường**:
     - Quét từ khóa tiêu cực và độ trễ phản hồi của khách để cảnh báo lên Dashboard.
  4. **Privacy Leak Guard (Bảo vệ SĐT khách)**:
     - Che tự động số điện thoại (`0912***456`) trên giao diện, yêu cầu xác thực OTP/PIN khi mở xem số đầy đủ.

- **Checklist bàn giao**:
  - [ ] Domain Model: `ServiceCredential`, `AgentSLAMetric`, `RadarSignal`.
  - [ ] Middleware xác thực Fingerprint & phân quyền Agent Hands.
  - [ ] Bộ tính toán SLA trong khung giờ làm việc.
  - [ ] Middleware che giấu thông tin nhạy cảm (Phone Masking).

---

## MA TRẬN PHÂN CHIA TRÁCH NHIỆM & THỨ TỰ THỰC HIỆN

| Sprint | Bounded Context Go | Trọng Tâm Nghiệp Vụ | Mức Độ Ưu Tiên |
|---|---|---|:---:|
| **Sprint 1** | `internal/marketing` | Broadcast Campaign, ZNS, Template Engine (Spec 061) | **P0 (Làm ngay)** |
| **Sprint 2** | `internal/customer` | Notes, Appointments, Pipeline, Smart Merge (Spec 057 P5) | **P1** |
| **Sprint 3** | `internal/deal`, `internal/order` | Deals, Kho đơn hàng KiotViet/Pancake, Báo giá PDF | **P1** |
| **Sprint 4** | `internal/conversation`, `pkg/media` | Chat Folders, Presets, S3/R2 Media Storage | **P2** |
| **Sprint 5** | `internal/channel` | Nhóm Zalo, Nhãn màu, Egress SOCKS5h Pool (Spec 056 P2c) | **P2** |
| **Sprint 6** | `internal/serviceapi`, `internal/analytics` | Cổng Goclaw/AI (Spec 046), Radar SLA (Spec 032), Privacy | **P3** |
