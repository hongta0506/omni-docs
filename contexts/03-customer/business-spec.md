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

#### EP 11-18: Sub-resource: Ghi Chú, Lịch Hẹn, Dòng Thời Gian (Notes, Appointments, Timeline)
- **GET & POST `/api/v1/contacts/{id}/notes`**: Xem và thêm ghi chú nội bộ về thói quen, sở thích của khách hàng (chỉ nhân viên nội bộ thấy).
- **PUT & DELETE `/api/v1/contacts/{id}/notes/{noteId}`**: Sửa và xóa ghi chú (chỉ tác giả ghi chú hoặc Admin mới có quyền).
- **GET & POST `/api/v1/contacts/{id}/appointments`**: Đặt lịch hẹn gặp, tư vấn hoặc gọi điện chăm sóc khách hàng. Tự động đồng bộ vào lịch làm việc cá nhân của nhân viên.
- **PUT `/api/v1/contacts/{id}/appointments/{appId}`**: Đổi giờ hẹn hoặc cập nhật kết quả cuộc hẹn (`completed`, `cancelled`, `no_show`).
- **GET `/api/v1/contacts/{id}/timeline`**: Dòng thời gian hợp nhất toàn bộ hành vi của khách hàng: thời điểm nhận tin nhắn, đơn hàng đã đặt, cuộc gọi đã thực hiện, deal đã tạo, link đã bấm trong email marketing.

#### EP 19-25: Phát Hiện Trùng Lặp & Quản Trị Nhãn (Duplicates & Tags)
- **GET `/api/v1/contacts/duplicates/scan`**: Quét toàn bộ hệ thống để phát hiện các cặp khách hàng có nguy cơ trùng lặp (trùng SĐT, trùng họ tên + địa chỉ, trùng link Facebook cá nhân).
- **POST `/api/v1/contacts/duplicates/{groupId}/merge`**: Duyệt gộp nhanh một nhóm khách trùng lặp được gợi ý.
- **POST `/api/v1/contacts/duplicates/{groupId}/dismiss`**: Bỏ qua cảnh báo trùng lặp (xác nhận đây là 2 khách hàng khác nhau).
- **GET `/api/v1/contacts/{id}/tags`**: Xem các nhãn dán đang gắn trên khách hàng.
- **POST `/api/v1/contacts/{id}/tags`**: Gán thêm danh sách nhãn (`tag_ids: []`) cho khách hàng.
- **DELETE `/api/v1/contacts/{id}/tags/{tagId}`**: Tháo nhãn khỏi khách hàng.
- **POST `/api/v1/contacts/batch-tag`**: Gán hoặc tháo nhãn hàng loạt cho hàng ngàn khách hàng được chọn theo bộ lọc.

#### EP 26-32: Import & Export Dữ Liệu Khách Hàng
- **POST `/api/v1/contacts/import/upload`**: Tải file Excel/CSV lên server, đọc trước 5 dòng đầu và trả về danh sách các cột để người dùng thực hiện ánh xạ trường (`Column Mapping`).
- **POST `/api/v1/contacts/import/execute`**: Thực thi import hàng loạt trong background: tự động chuẩn hóa SĐT, kiểm tra trùng lặp (bỏ qua / cập nhật đè / tạo mới theo cấu hình).
- **GET `/api/v1/contacts/import/{jobId}/progress`**: Theo dõi tiến độ import (% hoàn thành, số dòng thành công, số dòng lỗi có link tải file lỗi).
- **POST `/api/v1/contacts/export`**: Khởi tạo job xuất danh sách khách hàng ra file Excel. Kiểm tra quyền tải dữ liệu và giới hạn số dòng xuất để chống lộ lọt data.
- **GET `/api/v1/contacts/export/{jobId}/download`**: Tải file Excel danh bạ đã xuất xong (link có thời hạn 30 phút).
- **POST `/api/v1/contacts/quick-create`**: Tạo nhanh khách hàng chỉ với Tên và SĐT ngay trên cửa sổ chat.
- **PUT `/api/v1/contacts/{id}/assign`**: Chuyển giao khách hàng cho sale khác phụ trách.

#### EP 33-38: Tương Tác & Lịch Sử Đơn Hàng Của Khách (Orders & Activities)
- **GET `/api/v1/contacts/{id}/orders`**: Xem toàn bộ lịch sử mua hàng, trạng thái vận chuyển từ module Deal & E-commerce.
- **GET `/api/v1/contacts/{id}/deals`**: Danh sách cơ hội bán hàng đang mở với khách hàng này.
- **GET `/api/v1/contacts/{id}/conversations`**: Danh sách tất cả các cuộc hội thoại đa kênh cũ của khách hàng.
- **POST `/api/v1/contacts/{id}/block`**: Chặn khách hàng (đưa vào danh sách đen chống quấy phá).
- **POST `/api/v1/contacts/{id}/unblock`**: Mở chặn khách hàng.
- **GET `/api/v1/contacts/analytics/growth`**: Thống kê số lượng khách hàng mới theo ngày/tuần/tháng và kênh nguồn phát sinh.

---

### 2.2 Phân Hệ Leads & Bể Lead Dùng Chung (Lead Pool - 26 Endpoints)

#### EP 39-44: Quản Lý Khách Hàng Tiềm Năng (Leads)
- **GET `/api/v1/leads`**: Danh sách Leads: lọc theo nguồn (`source`), giai đoạn (`stage`), sale phụ trách, điểm tiềm năng (`score`).
- **POST `/api/v1/leads`**: Tạo Lead thủ công từ cuộc gọi đến, sự kiện hội thảo hoặc giới thiệu.
- **GET `/api/v1/leads/{id}`**: Chi tiết Lead: nhu cầu sản phẩm quan tâm, ngân sách dự kiến, thời gian dự kiến mua.
- **PUT `/api/v1/leads/{id}`**: Sửa thông tin Lead, cập nhật ngân sách.
- **PUT `/api/v1/leads/{id}/stage`**: Đổi giai đoạn Lead (ví dụ: từ `new` lên `qualified`).
- **POST `/api/v1/leads/{id}/convert-to-deal`**: Chuyển đổi Lead thành Deal/Cơ hội bán hàng chính thức khi khách hàng đã có nhu cầu rõ ràng.

#### EP 45-52: Bể Lead Dùng Chung & Phân Bổ (Lead Pool Allocation)
- **GET `/api/v1/lead-pool/leads`**: Danh sách các Lead đang nằm trong bể chung (chưa có ai nhận hoặc bị hệ thống thu hồi).
- **POST `/api/v1/lead-pool/claim`**: Nhân viên tự nhận một hoặc nhiều Lead từ bể về danh sách cá nhân để chăm sóc (kiểm tra hạn mức quota của nhân viên).
- **POST `/api/v1/lead-pool/return`**: Nhân viên chủ động trả Lead về bể chung vì không liên hệ được hoặc không đúng chuyên môn.
- **POST `/api/v1/lead-pool/auto-distribute`**: Kích hoạt phân bổ tự động các Lead mới về nhân viên theo thuật toán Round-Robin.
- **GET `/api/v1/lead-pool/rules`**: Danh sách các quy tắc phân bổ Lead (ví dụ: Lead từ TP.HCM giao cho team miền Nam, Lead ngân sách > 50tr giao cho Senior Sales).
- **POST `/api/v1/lead-pool/rules`**: Tạo quy tắc phân bổ Lead mới.
- **PUT & DELETE `/api/v1/lead-pool/rules/{id}`**: Sửa và xóa quy tắc phân bổ.

#### EP 53-58: Quy Tắc Thu Hồi Lead & Hạn Mức (Recycle & Quotas)
- **GET & PUT `/api/v1/lead-pool/settings/recycle`**: Cấu hình thời gian tự động thu hồi Lead: sau bao nhiêu giờ không gọi điện thì thu hồi về bể chung.
- **GET `/api/v1/lead-pool/admin/quotas`**: Xem bảng hạn mức nhận lead của từng nhân viên trong phòng ban.
- **PUT `/api/v1/lead-pool/admin/quotas/{userId}`**: Cài đặt số lượng lead tối đa một nhân viên được phép giữ.
- **POST `/api/v1/lead-pool/admin/reset-quota`**: Mở lại quyền nhận lead cho nhân viên bị phạt tạm khóa do để lead quá hạn.
- **GET `/api/v1/lead-pool/stats/conversion`**: Thống kê tỷ lệ chuyển đổi Lead của từng nhân viên và từng kênh nguồn.
- **GET `/api/v1/lead-pool/stats/pool-velocity`**: Tốc độ xử lý lead trong bể: thời gian trung bình từ lúc lead vào bể đến khi có sale tiếp cận lần đầu.

#### EP 59-64: Nhận Lead Webhook & Tích Hợp Landing Page
- **POST `/api/v1/leads/public/webhook`**: Endpoint công khai nhận lead từ Landing Page, Facebook Lead Ads, TikTok Lead Generation, Google Forms (kèm xác thực Webhook Token).
- **POST `/api/v1/leads/public/form-submit`**: Nhận dữ liệu submit trực tiếp từ form nhúng trên website công ty.
- **GET `/api/v1/leads/sources`**: Danh mục các nguồn đổ lead (Facebook Ads, Website, Giới thiệu, Hotline).
- **POST `/api/v1/leads/sources`**: Tạo nguồn lead mới để theo dõi hiệu quả kênh marketing.
- **PUT & DELETE `/api/v1/leads/sources/{id}`**: Sửa và xóa nguồn lead.
- **POST `/api/v1/leads/batch-delete`**: Xóa hàng loạt lead rác/spam.

---

### 2.3 Phân Hệ Phân Đoạn Tệp Khách Hàng (Customer Lists - 14 Endpoints)

#### EP 65-71: Quản Trị Tệp Khách Hàng
- **GET `/api/v1/customer-lists`**: Danh sách các tệp khách hàng trong workspace (phân loại tệp tĩnh vs tệp động).
- **POST `/api/v1/customer-lists`**: Tạo tệp mới (đặt tên, mô tả, chọn loại tĩnh hay động).
- **GET `/api/v1/customer-lists/{id}`**: Chi tiết tệp: số lượng khách hàng thực tế, tiêu chí bộ lọc (nếu là tệp động).
- **PUT `/api/v1/customer-lists/{id}`**: Đổi tên hoặc chỉnh sửa điều kiện bộ lọc của tệp.
- **DELETE `/api/v1/customer-lists/{id}`**: Xóa tệp khách hàng (không xóa dữ liệu khách hàng gốc).
- **GET `/api/v1/customer-lists/{id}/contacts`**: Danh sách khách hàng thuộc tệp này (có phân trang và tìm kiếm).
- **POST `/api/v1/customer-lists/{id}/contacts`**: Thêm thủ công danh sách khách hàng vào tệp tĩnh.

#### EP 72-78: Xử Lý Tệp Động & Xuất Dữ Liệu Chiến Dịch
- **DELETE `/api/v1/customer-lists/{id}/contacts/{contactId}`**: Bỏ bớt khách hàng ra khỏi tệp tĩnh.
- **POST `/api/v1/customer-lists/{id}/refresh`**: Buộc tính toán lại danh sách khách hàng cho tệp động ngay lập tức.
- **POST `/api/v1/customer-lists/{id}/duplicate`**: Nhân bản cấu hình tệp.
- **POST `/api/v1/customer-lists/{id}/export`**: Xuất danh sách khách hàng trong tệp ra file Excel để chạy quảng cáo Custom Audience.
- **GET `/api/v1/customer-lists/filters/supported-attributes`**: Danh mục các trường dữ liệu hỗ trợ làm tiêu chí lọc (tuổi, vị trí địa lý, tổng tiền mua, số ngày chưa tương tác).
- **POST `/api/v1/customer-lists/preview-count`**: Xem trước số lượng khách hàng sẽ thỏa mãn bộ lọc trước khi lưu tệp.
- **POST `/api/v1/customer-lists/{id}/share`**: Chia sẻ tệp khách hàng cho phòng ban khác hoặc nhân viên cụ thể.

---

### 2.4 Phân Hệ Điểm Tiềm Năng & Nhãn Dán CRM (Scoring & CRM Tags - 14 Endpoints)

#### EP 79-85: Quy Tắc Tính Điểm Tiềm Năng (Scoring Rules)
- **GET `/api/v1/scoring/rules`**: Danh sách các quy tắc chấm điểm tiềm năng (Lead Scoring).
- **POST `/api/v1/scoring/rules`**: Tạo quy tắc cộng/trừ điểm: Tiêu chí (ví dụ: mở tin nhắn +5đ, xem báo giá +10đ, không phản hồi sau 7 ngày -5đ, có số điện thoại hợp lệ +20đ).
- **GET & PUT `/api/v1/scoring/rules/{id}`**: Xem chi tiết và sửa điều kiện quy tắc tính điểm.
- **DELETE `/api/v1/scoring/rules/{id}`**: Xóa quy tắc tính điểm.
- **POST `/api/v1/scoring/recalculate-all`**: Chạy batch job tính lại toàn bộ điểm số khách hàng trong toàn workspace.
- **GET `/api/v1/scoring/models`**: Danh mục thang phân loại điểm (ví dụ: 0-30 điểm: Cold, 31-70: Warm, >70: Hot Lead).
- **PUT `/api/v1/scoring/models`**: Điều chỉnh ngưỡng phân loại Warm/Hot.

#### EP 86-92: Danh Mục Nhãn Dán CRM (CRM Tags)
- **GET `/api/v1/crm-tags`**: Danh sách toàn bộ nhãn dán trong hệ thống (Tên nhãn, Mã màu HEX, Số lượng khách đang gắn nhãn).
- **POST `/api/v1/crm-tags`**: Tạo nhãn dán mới: Tên nhãn (không trùng lặp), Mã màu phân loại.
- **GET `/api/v1/crm-tags/{id}`**: Chi tiết nhãn và danh sách khách hàng đang mang nhãn đó.
- **PUT `/api/v1/crm-tags/{id}`**: Đổi tên nhãn hoặc đổi màu hiển thị.
- **DELETE `/api/v1/crm-tags/{id}`**: Xóa nhãn (hệ thống tự động gỡ nhãn này khỏi toàn bộ khách hàng liên quan).
- **POST `/api/v1/crm-tags/merge`**: Gộp 2 nhãn trùng nghĩa thành một nhãn duy nhất.
- **GET `/api/v1/crm-tags/stats/usage`**: Báo cáo thống kê tần suất sử dụng các nhãn của nhân viên chăm sóc khách hàng.

---

## 3. Ma Trận Observability, Logging & Exception Chuẩn

| Nhóm Ngoại Lệ | Danh Sách Lỗi Kỹ Thuật / Domain | Phân Loại `pkg/errors` | Hành Động Hệ Thống | Event Log `pkg/logger` |
|---|---|---|---|---|
| **Trùng lặp** | Trùng số điện thoại khi tạo mới Contact | `CodeConflict` (Terminal) | Trả về 409 Conflict kèm `existingContactId` | `CUSTOMER_DUPLICATE_PHONE` |
| **Bảo mật dữ liệu** | Nhân viên không có quyền `privacy:unmask` | `CodeForbidden` (SecurityPolicy) | Tự động trả về số điện thoại đã che | `CUSTOMER_DATA_MASKED` |
| **Gộp dữ liệu lỗi** | Gộp khách vào chính nó (`target = source`) | `CodeInvalidInput` (Terminal) | Chặn thao tác, trả về lỗi 400 | `CUSTOMER_MERGE_INVALID` |
| **Hạn mức Lead** | Nhân viên vượt quá hạn mức nhận Lead | `CodeForbidden` (Terminal) | Từ chối claim, yêu cầu giải phóng lead cũ | `LEAD_POOL_QUOTA_EXCEEDED` |
| **Thu hồi tự động** | Quá hạn 24h không có tương tác | Sự kiện Background Job | Thu hồi về bể chung, trừ điểm KPI | `LEAD_POOL_AUTO_RECYCLED` |
| **Không tìm thấy** | Không tìm thấy Contact, Lead, List | `CodeNotFound` (Terminal) | Trả về 404 Not Found | `CUSTOMER_NOT_FOUND` |
