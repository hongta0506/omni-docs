# Đặc Tả Nghiệp Vụ Chi Tiết: Customer & Lead Bounded Context (92 Endpoints)

> **Bounded Context:** `internal/customer`  
> **Phạm vi quản lý:** Quản lý Danh bạ khách hàng đa kênh (Contacts & Unified Profiles), Hồ sơ Khách hàng tiềm năng (Leads & Lifecycle Stages), Bể chìa khóa/kho lead dùng chung (Lead Pool & Round-Robin Allocation), Phân đoạn tệp khách hàng (Customer Lists & Dynamic Segments), Tính điểm tiềm năng tự động (Lead Scoring Rules), và Hệ thống nhãn dán thông minh (CRM Tags).

---

## 1. Domain Model, Aggregates & Invariants (Quy Tắc Bất Biến Nghiệp Vụ)

### 1.1 Aggregate Root: `Contact` (Hồ Sơ Khách Hàng Thống Nhất)
- **Cấu trúc liên kết:** Một `Contact` có thể sở hữu nhiều `ChannelProfile` (Zalo Personal UID, Telegram ChatID, WhatsApp Phone, Facebook PSID).
- **Invariants:**
  1. **Số điện thoại định dạng chuẩn E.164:** `primary_phone` nếu có phải được chuẩn hóa về định dạng quốc tế chuẩn (VD: `+84912345678`).
  2. **Smart Merge Invariant:**
     - Khi thực hiện gộp khách hàng `Merge(sourceContact, targetContact)`:
       - `sourceContact` chuyển sang `is_merged = true`, `merged_into_id = targetContact.id`.
       - Mọi đơn hàng (`orders`), ghi chú (`notes`), lịch hẹn (`appointments`), và deal đàm phán (`deals`) chuyển toàn bộ quyền sở hữu sang `targetContact`.
       - Tổng chi tiêu (`total_spent`) và số lần mua (`purchase_count`) của `targetContact` được tính toán lại ngay lập tức trong cùng 1 transaction (hỗ trợ locking).
       - Hành động gộp không thể hoàn tác (`irreversible`), bắt buộc phải ghi log kiểm toán chi tiết.
  3. **Data Masking Compliance:** Khi trả dữ liệu Contact qua REST/gRPC, nếu người dùng không sở hữu quyền `privacy:unmask`, các trường `primary_phone`, `primary_email`, `id_card_number` bắt buộc phải chạy qua hàm mặt nạ trước khi serialize ra JSON/Protobuf.

### 1.2 Aggregate Root: `Lead` & `LeadPool` (Kho Khách Hàng Tiềm Năng)
- **Quy tắc phân định cốt lõi (ADR-ARCH-009):** Mọi thành viên cào được từ Nhóm/Kênh/Danh bạ mạng xã hội (Zalo, Telegram, WhatsApp, Meta) mặc định 100% được nạp vào đây dưới dạng `Lead` (`contacts.status = 'lead'`, `leads.stage = 'new'`). Chỉ được chuyển thành Khách Hàng (`customer`) sau khi phát sinh đơn hàng hoặc Deal thành công.
- **Vòng đời Lead (`LeadStage`):** `new` -> `contacted` -> `qualified` -> `unqualified` -> `converted_to_deal` -> `lost`.
- **Invariants:**
  1. **Round-Robin Phân Bổ Công Bằng:** Khi Lead mới đổ về từ Webform, Ads, hoặc Chatbot, Lead Pool phân bổ lần lượt cho nhân viên trong nhóm trực theo thuật toán xoay vòng (Round-Robin có trọng số theo ca trực).
  2. **Thu Hồi Lead Tự Động (Auto-Recycle Invariant):** Nếu một Lead được giao cho nhân viên sau `N` giờ (mặc định 24h) mà nhân viên không có bất kỳ tương tác nào (không gọi điện, không gửi tin nhắn, không đổi stage), hệ thống tự động thu hồi Lead về Bể chung (`LeadPool`) và trừ điểm KPI hoặc khóa hạn mức nhận Lead của nhân viên đó.
  3. **Hạn Mức Nhận Lead (Lead Quota):** Mỗi nhân viên chỉ được giữ tối đa `X` Lead ở trạng thái `new`/`contacted` tại một thời điểm (ví dụ: tối đa 30 lead). Nếu vượt quá hạn mức, nhân viên không được hệ thống chia thêm lead mới cho đến khi xử lý dứt điểm các lead cũ.

### 1.3 Aggregate Root: `CustomerList` (Tệp Khách Hàng Phân Đoạn)
- **Phân loại:** `static` (tệp cố định do người dùng tạo thủ công hoặc import file) và `dynamic` (tệp động dựa trên bộ lọc điều kiện).
- **Invariants:**
  1. Tệp động (`dynamic`) không lưu cứng danh sách ID khách hàng trong DB. Khi truy vấn hoặc sử dụng tệp để gửi chiến dịch marketing, hệ thống thực thi biểu thức truy vấn SQL/Elasticsearch theo thời gian thực (Real-time Evaluation) dựa trên các tiêu chí: ngày mua gần nhất (RFM), tổng tiền đã chi, số điện thoại mạng Viettel/Vina, độ tuổi, tag gắn kèm.

---

## 2. Chi Tiết Nghiệp Vụ & BDD Cho Từng Phân Hệ Endpoints

### 2.1 Phân Hệ Quản Lý Danh Bạ & Hồ Sơ (Contacts - 38 Endpoints)

#### EP 01-05: CRUD Danh Bạ & Tìm Kiếm Nhanh
- **GET `/api/v1/contacts`**:
  - **Nghiệp vụ:** Truy vấn danh bạ khách hàng có phân trang (`page`, `limit`). Hỗ trợ bộ lọc phức tạp: `keyword` (tìm tên, SĐT, email), `tag_ids`, `assigned_user_id`, `created_at_range`, `lead_score_min`. Trả về JSON chuẩn Pagination.
- **POST `/api/v1/contacts`**:
  - **Nghiệp vụ:** Tạo hồ sơ khách hàng mới. Kiểm tra trùng lặp SĐT trong cùng Tenant. Nếu đã tồn tại khách hàng có cùng SĐT, trả về cảnh báo trùng lặp kèm gợi ý xem hồ sơ cũ.
- **GET `/api/v1/contacts/{id}`**: Lấy chi tiết hồ sơ: thông tin cá nhân, các nick Zalo/Facebook liên kết, tổng giá trị mua hàng (LTV), số đơn hàng thành công, lịch sử tương tác gần nhất.
- **PUT `/api/v1/contacts/{id}`**: Cập nhật thông tin khách hàng: họ tên, địa chỉ giao hàng, ngày sinh, công ty, ghi chú đặc biệt.
- **DELETE `/api/v1/contacts/{id}`**: Xóa mềm hồ sơ khách hàng (`soft_delete`). Toàn bộ lịch sử chat vẫn được lưu trữ nhưng ẩn khỏi danh sách tra cứu thông thường.

#### EP 06-10: Gộp Khách Hàng Trùng Lặp & Liên Kết Kênh (Merge & Profiles)
- **POST `/api/v1/contacts/{id}/merge-into`**:
  - **Nghiệp vụ:** Gộp khách hàng hiện tại vào khách hàng đích (`target_id`).
  - **BDD Scenario:**
    - *Given:* Khách A (ID 1, có 2 đơn hàng, 1 nick Zalo) và Khách B (ID 2, có 1 đơn hàng).
    - *When:* Gửi POST tới `/api/v1/contacts/1/merge-into` với body `{"targetId": 2}`.
    - *Then:* Khách A chuyển `is_merged=true`, Khách B sở hữu cả 3 đơn hàng và nick Zalo của A, tính lại tổng chi tiêu LTV của B, trả về HTTP 200 kèm log kiểm toán.
- **POST `/api/v1/contacts/{id}/profiles`**: Gắn thêm một định danh kênh mới vào khách hàng (ví dụ: khách đang chat bằng Zalo gửi thêm số điện thoại WhatsApp).
- **DELETE `/api/v1/contacts/{id}/profiles/{profileId}`**: Tháo gỡ liên kết tài khoản mạng xã hội khỏi hồ sơ khách.
- **GET `/api/v1/contacts/by-zalo-uid/{uid}`**: Tìm kiếm cực nhanh hồ sơ khách hàng bằng Zalo UID phục vụ popup thông tin khi có cuộc gọi/tin nhắn đến trên Web.
- **GET `/api/v1/contacts/by-phone/{phone}`**: Tìm kiếm hồ sơ khách hàng bằng số điện thoại.
