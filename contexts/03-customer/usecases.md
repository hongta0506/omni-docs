# Customer & Lead — Danh Tả Use Cases & User Stories (BDD Specification)

> **Bounded Context:** `internal/customer`  
> **Nguyên tắc:** Omni-channel Core. Tâm điểm là Contact Golden Record và Lead Pool, kênh giao tiếp (Zalo, Telegram, WhatsApp, FB, Pancake) chỉ là Channel Adapter ngoại vi.  
> **Định dạng:** Chuẩn BDD (`Given - When - Then`) kết hợp Jobs-to-Be-Done (JTBD).

---

## Danh Mục Use Cases (Actors & Boundaries)

| Use Case ID | Nhóm Nghiệp Vụ | Actor Chính | Mục Tiêu Nghiệp Vụ |
|---|---|---|---|
| **UC-CUST-01** | Omni-Channel Inbound | Channel Gateway (System) | Tự động phân giải danh tính, match Phone E.164, tạo mới hoặc gộp vào Golden Record |
| **UC-CUST-02** | Contact Management | Nhân viên Kinh doanh (Sales) | Cập nhật hồ sơ CRM mà không làm sai lệch hồ sơ gốc mạng xã hội (Two-Ledger) |
| **UC-CUST-03** | Lead Pool Routing | Hệ thống / Trưởng nhóm | Chia Lead tự động theo vòng lặp (Round-robin) hoặc trọng số năng lực Sales |
| **UC-CUST-04** | Lead SLA Auto-Revoke | Background Worker | Tự động thu hồi Lead về Pool khi Sales không tương tác trong vòng SLA (24h) |
| **UC-CUST-05** | Smart Merge & Deduplication | Quản trị viên / Sales | Hợp nhất 2 liên hệ trùng lặp, chuyển giao toàn bộ đơn hàng và lịch sử tương tác |
| **UC-CUST-06** | Dynamic Customer Segmentation | Marketing / Quản lý | Tự động phân nhóm khách hàng theo điều kiện chi tiêu, điểm tương tác, thẻ gắn |
| **UC-CUST-07** | B2B Account & Enterprise | Sales B2B / Kế toán | Quản lý thông tin pháp nhân doanh nghiệp, mã số thuế, liên kết danh bạ đại diện |

---

## 1. UC-CUST-01: Omni-Channel Identity Inbound & Auto-Link

### User Story
**As a** Hệ thống CRM đa kênh,  
**I want** khi nhận được tin nhắn hoặc tương tác từ một kênh mới (Zalo cá nhân, Zalo OA, Telegram, Facebook Fanpage, Pancake POS), hệ thống tự động tìm kiếm Contact đã có theo Số điện thoại chuẩn E.164 hoặc liên kết mạng xã hội,  
**So that** tạo ra một Golden Record duy nhất của khách hàng mà không bị phân mảnh hay trùng lặp dữ liệu trên các kênh khác nhau.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Khách hàng mới chưa từng có trong hệ thống (Auto-create Golden Record)
- **Given:** Khách hàng có Zalo UID `zalo_9988` nhắn tin vào Zalo cá nhân của nhân viên, số điện thoại `0912345678`, Tenant ID `tenant_vn_01`.
- **And:** Trong cơ sở dữ liệu của Tenant `tenant_vn_01` chưa có Contact nào mang số điện thoại `+84912345678` hoặc liên kết `zalo_9988`.
- **When:** Sự kiện `ChannelMessageReceivedEvent` được gửi tới Customer Bounded Context.
- **Then:** Hệ thống chuẩn hóa số điện thoại sang chuẩn E.164: `+84912345678`.
- **And:** Tạo một `Contact` mới (Aggregate Root) với `LifecycleStage = Lead`, `PrimaryPhone = +84912345678`.
- **And:** Tạo một `ChannelProfile` con gắn với Contact này: `Channel = ZaloPersonal`, `AccountID = acc_123`, `ChannelUID = zalo_9988`.
- **And:** Phát hành sự kiện `ContactCreatedEvent` cho Transactional Outbox.

#### Kịch bản 2: Khách hàng cũ nhắn qua kênh mới (Auto-link Channel Profile)
- **Given:** Contact ID `cust_abc` đã tồn tại trên hệ thống với `PrimaryPhone = +84912345678`.
- **And:** Khách hàng này lần đầu tiên nhắn tin qua Telegram với Username `@johndoe` và Telegram UID `tg_5566`, kèm số điện thoại chia sẻ `+84912345678`.
- **When:** Hệ thống xử lý thông điệp nhận từ Telegram Gateway.
- **Then:** Hệ thống match được `Contact` `cust_abc` thông qua số điện thoại `+84912345678`.
- **And:** Thêm `ChannelProfile` mới vào `cust_abc`: `Channel = Telegram`, `ChannelUID = tg_5566`.
- **And:** Tuyệt đối không tạo mới Contact trùng lặp.
- **And:** Phát hành sự kiện `ChannelProfileLinkedEvent`.

---

## 2. UC-CUST-02: Nguyên Tắc 2 Cuốn Sổ (Two-Ledger Contact Immutability)

### User Story
**As a** Nhân viên kinh doanh (Sales),  
**I want** chỉnh sửa tên hiển thị, ghi chú và thông tin cá nhân của khách hàng trên CRM để dễ quản lý,  
**So that** tên ghi đè trên CRM phục vụ công việc kinh doanh nội bộ nhưng không làm mất hoặc sai lệch tên gốc, avatar gốc của khách hàng trên Zalo/Telegram.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Nhân viên cập nhật tên hiển thị trên CRM
- **Given:** Contact có Social Profile (Cuốn sổ mạng xã hội) là `Zalo Nick: Bé Heo Cute`, Avatar Zalo: `avatar_zalo.jpg`.
- **When:** Nhân viên cập nhật trên CRM thành `Chị Lan - Giám Đốc Cty Thuận Phát` qua API `PATCH /api/v1/contacts/:id`.
- **Then:** Trường `CRM DisplayName` được cập nhật thành `Chị Lan - Giám Đốc Cty Thuận Phát`.
- **And:** Dữ liệu trong `ChannelProfile` (ZaloProfile) vẫn giữ nguyên `DisplayName = Bé Heo Cute`.
- **And:** Mọi lượt sync từ Zalo Gateway trong tương lai không được phép ghi đè trường `CRM DisplayName`.

#### Kịch bản 2: Ngăn chặn sửa đổi thủ công cuốn sổ mạng xã hội
- **Given:** Nhân viên gọi trực tiếp API cố gắng cập nhật `ZaloUID` hoặc `ZaloName` trong `ChannelProfile`.
- **When:** Request được gửi tới `CustomerService`.
- **Then:** Hệ thống trả về lỗi `403 Forbidden` hoặc `ErrSocialProfileImmutable`.
- **And:** Chỉ chấp nhận payload cập nhật Social Profile khi có chữ ký định danh nội bộ từ Channel Gateway Service.

---

## 3. UC-CUST-03: Phân Bổ Lead Tự Động (Lead Pool Routing)

### User Story
**As a** Trưởng phòng kinh doanh,  
**I want** khách hàng tiềm năng mới phát sinh được tự động chia cho nhân viên theo thuật toán xoay vòng (Round-Robin) hoặc theo hạn mức (Quota),  
**So that** Lead được tiếp cận nhanh nhất, tránh tình trạng nhân viên ôm dồn Lead hoặc bỏ sót khách hàng.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Phân bổ Lead theo cơ chế Round-Robin còn hạn mức
- **Given:** Lead Pool của Tenant đang có 3 Sales online: Sales A (đang nhận 5/10 Lead), Sales B (đang nhận 2/10 Lead), Sales C (đã đầy 10/10 Lead).
- **And:** Thứ tự xoay vòng hiện tại đến lượt Sales C, tiếp theo là Sales B.
- **When:** Một Lead mới đổ vào hệ thống từ Form đăng ký website hoặc Webhook Pancake.
- **Then:** Hệ thống bỏ qua Sales C vì đã đạt tối đa hạn mức Quota (10/10).
- **And:** Hệ thống chọn Sales B là người tiếp theo hợp lệ.
- **And:** Cập nhật `AssignedUserID = Sales B` và `AssignedAt = Now()`.
- **And:** Gửi thông báo Push Notification / WebSocket đến client của Sales B.

#### Kịch bản 2: Tất cả nhân viên đều hết hạn mức tiếp nhận (Lead đọng tại Pool)
- **Given:** Tất cả Sales trong nhóm đều đã đạt 100% hạn mức nhận Lead tối đa.
- **When:** Có Lead mới phát sinh.
- **Then:** Lead được lưu ở trạng thái `Unassigned` tại Kho Lead chung (`LeadPool`).
- **And:** Gửi cảnh báo về màn hình quản trị của Trưởng nhóm Sales.

---

## 4. UC-CUST-04: Thu Hồi Lead Quá Hạn Tương Tác (SLA Auto-Revoke)

### User Story
**As a** Giám đốc Kinh doanh,  
**I want** nếu nhân viên kinh doanh được giao Lead nhưng không thực hiện cuộc gọi, gửi tin nhắn hoặc ghi nhận tương tác trong vòng thời hạn cam kết (mặc định 24h), Lead sẽ bị tự động thu hồi về Kho chung,  
**So that** khách hàng tiềm năng được chuyển giao cho người khác chăm sóc, tối đa hóa tỷ lệ chuyển đổi.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Quá hạn 24h không có hoạt động tương tác (Revoke & Phạt)
- **Given:** Lead `lead_101` được gán cho Sales A vào lúc `2026-09-27 08:00:00`.
- **And:** Cấu hình SLA của Tenant là `24 hours`.
- **And:** Tính đến `2026-09-28 08:00:01`, không có bất kỳ tin nhắn gửi đi, cuộc gọi, hoặc ghi chú (`ContactNote`) nào được tạo bởi Sales A cho `lead_101`.
- **When:** Background Worker `lead-sla-watcher` quét định kỳ.
- **Then:** Cập nhật `lead_101.AssignedUserID = NULL` và chuyển về `LeadPool`.
- **And:** Ghi lịch sử `ContactActivity`: `Type = ActivityLeadRevoked`, `Reason = SLA Violation (No interaction within 24h)`.
- **And:** Giảm điểm uy tín nhận Lead của Sales A trong thuật toán phân bổ.
- **And:** Phát hành sự kiện `LeadRevokedEvent`.

#### Kịch bản 2: Sales có phát sinh tương tác trước hạn SLA (Keep Lead)
- **Given:** Lead `lead_102` được gán cho Sales A lúc `08:00:00`.
- **When:** Lúc `10:30:00`, Sales A gửi một tin nhắn Zalo hoặc tạo một `Appointment` với khách hàng.
- **Then:** Hệ thống cập nhật trường `LastInteractedAt = 10:30:00`.
- **And:** Worker quét SLA nhận diện tương tác hợp lệ, không thực hiện thu hồi.

---

## 5. UC-CUST-05: Hợp Nhất Trùng Lặp Thông Minh (Smart Merge & Order Transfer)

### User Story
**As a** Nhân viên CRM hoặc Trưởng nhóm,  
**I want** gộp hai hồ sơ khách hàng bị trùng lặp (ví dụ khách nhắn từ 2 số Zalo khác nhau hoặc mua hàng qua 2 kênh khác nhau) thành một Golden Record duy nhất,  
**So that** toàn bộ lịch sử hội thoại, đơn hàng, công nợ và ghi chú được bảo toàn nguyên vẹn về một mối.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Hợp nhất thành công và chuyển giao toàn bộ đơn hàng
- **Given:** 
  - Khách hàng nguồn `Source Contact` (ID: `cust_old`) có 2 đơn hàng Pancake, 3 ghi chú, tổng chi tiêu 5.000.000 VNĐ.
  - Khách hàng đích `Target Contact` (ID: `cust_new`) có 1 đơn hàng, tổng chi tiêu 2.000.000 VNĐ.
- **When:** Quản trị viên gọi lệnh gộp `POST /api/v1/contacts/cust_old/merge-into` với target `cust_new`.
- **Then:** Hệ thống mở một Database Transaction với pessimistic lock trên cả 2 bản ghi.
- **And:** Đánh dấu `cust_old.is_merged = true` và `cust_old.merged_into_id = cust_new`.
- **And:** Chuyển toàn bộ các đơn hàng (`mirrored_orders`), lịch hẹn (`appointments`), ghi chú (`notes`) từ `cust_old` sang `cust_new`.
- **And:** Tính toán lại tổng chi tiêu của `cust_new` thành `7.000.000 VNĐ` (`purchase_count = 3`).
- **And:** Chuyển tất cả `ChannelProfile` của `cust_old` sang `cust_new`.
- **And:** Nếu có ai truy vấn vào `cust_old`, API tự động redirect hoặc trả về dữ liệu của `cust_new`.

#### Kịch bản 2: Ngăn chặn vòng lặp hợp nhất (Circular Merge Prevention)
- **Given:** Contact A đã được gộp vào Contact B.
- **When:** Người dùng cố tình gọi API gộp Contact B vào Contact A.
- **Then:** Hệ thống kiểm tra Invariant và từ chối request với mã lỗi `ErrCircularMergeDetected` (HTTP 400).

---

## 6. UC-CUST-06: Phân Nhóm Khách Hàng Động (Dynamic Customer Segmentation)

### User Story
**As a** Chuyên viên Marketing,  
**I want** tạo các bộ lọc phân nhóm khách hàng động (VD: Khách hàng VIP chi tiêu > 10 triệu và có tương tác trong 30 ngày qua),  
**So that** các chiến dịch gửi tin nhắn hàng loạt hoặc chăm sóc tự động luôn nhắm đúng đối tượng mục tiêu theo thời gian thực.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Đánh giá phân nhóm động theo tiêu chí RFM
- **Given:** Một bộ lọc danh khúc `Segment VIP 2026` với điều kiện: `TotalSpent >= 10,000,000` AND `LastInteractedAt >= Now() - 30 days`.
- **When:** Khách hàng C hoàn tất đơn hàng mới trị giá 4.000.000 VNĐ, nâng tổng chi tiêu từ 8.000.000 lên 12.000.000 VNĐ.
- **Then:** Sự kiện `OrderCompletedEvent` kích hoạt bộ tính toán điểm và phân nhóm.
- **And:** Khách hàng C tự động được gắn vào danh sách `Segment VIP 2026`.
- **And:** Phát hành sự kiện `CustomerSegmentJoinedEvent` để kích hoạt chiến dịch chào mừng VIP.

---

## 7. UC-CUST-07: Quản Lý Pháp Nhân Khách Hàng Doanh Nghiệp (B2B Accounts)

### User Story
**As a** Nhân viên kinh doanh B2B,  
**I want** quản lý thông tin Công ty (Mã số thuế, Địa chỉ xuất hóa đơn, Tài khoản ngân hàng) và liên kết nhiều người liên hệ (Contacts) vào Công ty đó,  
**So that** theo dõi được hợp đồng, báo giá cấp doanh nghiệp và lịch sử làm việc với từng đầu mối nhân sự.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Tạo mới pháp nhân và chuẩn hóa Mã số thuế
- **Given:** Nhân viên nhập thông tin Công ty: Mã số thuế `0101234567`, Tên công ty: `Công ty TNHH Giải Pháp Công Nghệ Omni`.
- **When:** Gọi `POST /api/v1/accounts`.
- **Then:** Value Object `TaxCodeVO` kiểm tra định dạng MST Việt Nam (10 hoặc 13 số hợp lệ).
- **And:** Kiểm tra tính duy nhất của MST trong cùng Tenant.
- **And:** Tạo bản ghi `Account` với trạng thái `active`.

#### Kịch bản 2: Gán người liên hệ đại diện (Contact Linkage)
- **Given:** Doanh nghiệp `Account` `acc_omni` và liên hệ `Contact` `cust_an` (Giám đốc mua hàng).
- **When:** Gọi `POST /api/v1/accounts/acc_omni/contacts` gán `cust_an` với vai trò `Primary Decision Maker`.
- **Then:** Lưu liên kết vào bảng liên kết `account_contacts`.
- **And:** Khi xem chi tiết `acc_omni`, danh sách liên hệ hiển thị `cust_an` là người đại diện chính.
