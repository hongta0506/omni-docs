# Đặc Tả Nghiệp Vụ Chi Tiết: Marketing & Automation Bounded Context (84 Endpoints)

> **Bounded Context:** `internal/marketing`  
> **Phạm vi quản lý:** Chiến dịch gửi tin hàng loạt đa kênh (Broadcasts & Outbound Campaigns), Phễu nuôi dưỡng & Tự động hóa tiếp thị (Marketing Sequences & Workflows), Hệ thống kích hoạt hành vi & Sự kiện tự động (Triggers & Event-driven Automation), và Quản trị nhãn dán tiếp thị đa kênh (Marketing Tags & Customer Audiences).

---

## 1. Domain Model, Aggregates & Invariants (Quy Tắc Bất Biến Nghiệp Vụ)

### 1.1 Aggregate Root: `BroadcastCampaign` (Chiến Dịch Gửi Tin Hàng Loạt)
- **Kênh hỗ trợ:** `zalo_personal`, `whatsapp_official`, `facebook_fanpage`, `telegram_channel`.
- **Invariants:**
  1. **Tốc độ gửi & Khoảng giãn cách an toàn (Anti-Spam & Jitter Guard):**
     - Với kênh Zalo Personal: Khoảng cách giữa 2 tin nhắn liên tiếp tối thiểu `random(15s, 45s)`. Tối đa 200 tin nhắn/ngày/nick để chống Zalo khóa tài khoản (checkpoint).
     - Với kênh WhatsApp Official WABA: Giới hạn theo hạn mức Tier của Meta (1K, 10K, 100K tin/ngày).
  2. **Trạng thái vòng đời chiến dịch:** `draft` -> `scheduled` -> `running` -> `paused` -> `completed` / `failed`.
     - Chỉ được chỉnh sửa nội dung khi ở trạng thái `draft`.
     - Khi đang `running`, chỉ được thực hiện lệnh `pause` hoặc `abort`. Không được sửa danh sách người nhận.
  3. **Tự Động Tạm Dừng Khi Tỷ Lệ Lỗi Cao (Circuit Breaker Invariant):**
     - Trong quá trình gửi, nếu tỷ lệ gửi thất bại (`failed_count / total_recipients`) vượt quá 15% hoặc có 3 tài khoản gửi liên tiếp bị checkpoint, hệ thống lập tức chuyển chiến dịch sang `paused` và gửi thông báo khẩn cấp cho nhân viên quản trị.

### 1.2 Aggregate Root: `Sequence` & `AutomationFlow` (Phễu Nuôi Dưỡng Tự Động)
- **Cấu trúc luồng:** Gồm các node: `Trigger` (Sự kiện kích hoạt) -> `Wait` (Thời gian chờ/Trì hoãn) -> `Condition` (Rẽ nhánh điều kiện) -> `Action` (Hành động: Gửi tin nhắn, Gán tag, Chia lead, Tạo Deal).
- **Invariants:**
  1. **Khử vòng lặp vô tận (DAG Invariant):** Cấu hình luồng tự động bắt buộc phải là một Đồ thị có hướng không có chu trình (Directed Acyclic Graph - DAG). Tuyệt đối cấm các nhánh nối ngược tạo vòng lặp vô tận khiến hệ thống spam tin nhắn đến khách hàng.
  2. **Thời gian gửi hợp lệ (Quiet Hours Compliance):** Tin nhắn tự động từ Sequences chỉ được gửi trong khung giờ quy định (mặc định 08:00 - 20:00). Mọi hành động gửi rơi vào khung giờ đêm phải được hoãn (`delayed`) sang đầu giờ sáng hôm sau.

---

## 2. Chi Tiết Nghiệp Vụ & BDD Cho Từng Phân Hệ Endpoints

### 2.1 Phân Hệ Gửi Tin Hàng Loạt (Broadcasts - 28 Endpoints)

#### EP 01-08: Soạn Thảo & Lập Lịch Chiến Dịch Gửi Tin
- **GET `/api/v1/broadcasts`**:
  - **Nghiệp vụ:** Truy vấn danh sách chiến dịch gửi tin hàng loạt: lọc theo kênh (`channel`), trạng thái, người tạo, khoảng thời gian thực thi.
- **POST `/api/v1/broadcasts`**:
  - **Nghiệp vụ:** Tạo mới dự thảo chiến dịch: chọn danh sách tài khoản gửi (sender accounts), chọn tệp khách hàng mục tiêu (`customer_list_id`), nội dung tin nhắn (hỗ trợ biến cá nhân hóa `{name}`, `{phone}`).
- **GET `/api/v1/broadcasts/{id}`**: Lấy chi tiết chiến dịch: tiến độ gửi thực tế, tổng tin gửi, số tin thành công, số tin thất bại, tỷ lệ mở.
- **PUT `/api/v1/broadcasts/{id}`**: Sửa đổi nội dung chiến dịch nháp.
- **DELETE `/api/v1/broadcasts/{id}`**: Hủy bỏ chiến dịch nháp.

#### EP 09-16: Điều Khiển Thực Thi Chiến Dịch (Schedule, Pause, Resume, Abort)
- **POST `/api/v1/broadcasts/{id}/schedule`**: Đặt lịch chạy chiến dịch vào một thời điểm cụ thể trong tương lai.
- **POST `/api/v1/broadcasts/{id}/start`**: Kích hoạt gửi tin ngay lập tức.
- **POST `/api/v1/broadcasts/{id}/pause`**: Tạm dừng khẩn cấp quá trình gửi tin.
- **POST `/api/v1/broadcasts/{id}/resume`**: Tiếp tục gửi tin từ vị trí khách hàng bị tạm dừng.
- **POST `/api/v1/broadcasts/{id}/abort`**: Hủy hoàn toàn chiến dịch đang chạy, thu hồi các tác vụ đang chờ trong queue.

#### EP 17-22: Quản Lý Danh Sách Người Nhận & Nhật Ký Gửi
- **GET `/api/v1/broadcasts/{id}/recipients`**: Danh sách chi tiết từng khách hàng nhận tin kèm trạng thái (`pending`, `sent`, `delivered`, `read`, `failed`, `error_reason`).
- **POST `/api/v1/broadcasts/{id}/recipients/retry-failed`**: Chạy lại tiến trình gửi cho riêng danh sách các khách hàng bị lỗi trước đó.
- **GET `/api/v1/broadcasts/{id}/preview-audience`**: Xem trước danh sách khách hàng và nội dung cá nhân hóa mẫu trước khi bấm gửi thật.

#### EP 23-28: Báo Cáo & Phân Tích Hiệu Quả Gửi Tin
- **GET `/api/v1/broadcasts/analytics/delivery-rates`**: Tỷ lệ gửi thành công của từng kênh xã hội (Zalo vs WhatsApp vs Facebook).
- **GET `/api/v1/broadcasts/{id}/stats`**: Báo cáo tổng kết: số phản hồi nhận được từ chiến dịch, số lead chuyển đổi phát sinh từ chiến dịch.

---

## 2.2 Phân Hệ Tự Động Hóa & Phễu Chăm Sóc (Automation & Sequences - 32 Endpoints)

#### EP 29-38: Quản Trị Kịch Bản Chăm Sóc Tự Động (Sequences CRUD)
- **GET `/api/v1/marketing/sequences`**: Danh sách các phễu nuôi dưỡng khách hàng tự động (chuỗi tin nhắn sau bán, chuỗi nhắc lịch hẹn).
- **POST `/api/v1/marketing/sequences`**: Tạo mới kịch bản nuôi dưỡng.
- **GET `/api/v1/marketing/sequences/{id}`**: Chi tiết kịch bản: sơ đồ các bước, số khách hàng đang nằm ở từng bước.
- **PUT `/api/v1/marketing/sequences/{id}`**: Sửa đổi cấu trúc các bước trong kịch bản.
- **DELETE `/api/v1/marketing/sequences/{id}`**: Xóa kịch bản nuôi dưỡng.

#### EP 39-48: Trình Thiết Kế Luồng Tự Động (Flow Canvas & Actions)
- **GET `/api/v1/automation/flows`**: Danh sách luồng xử lý tự động sự kiện (Event-driven Flows).
- **POST `/api/v1/automation/flows`**: Tạo luồng tự động mới từ mẫu (Templates) hoặc tạo mới trên Canvas.
- **PUT `/api/v1/automation/flows/{id}/canvas`**: Lưu cấu trúc đồ thị JSON kết nối giữa các Node (Trigger, Filter, Action).
- **POST `/api/v1/automation/flows/{id}/publish`**: Kiểm tra tính hợp lệ của đồ thị DAG và kích hoạt chạy luồng vào môi trường thực tế.
- **POST `/api/v1/automation/flows/{id}/unpublish`**: Tạm dừng luồng tự động.

#### EP 49-55: Quản Lý Khách Hàng Trong Phễu (Enrollment & Progress)
- **POST `/api/v1/marketing/sequences/{id}/enroll`**: Đưa thủ công một hoặc nhiều khách hàng vào phễu chăm sóc tự động.
- **POST `/api/v1/marketing/sequences/{id}/unenroll`**: Bỏ khách hàng ra khỏi phễu.
- **GET `/api/v1/marketing/sequences/{id}/subscribers`**: Danh sách khách hàng đang tham gia phễu và lịch gửi bước tiếp theo.

#### EP 56-60: Lịch Sử Kích Hoạt Tự Động (Execution Logs)
- **GET `/api/v1/automation/logs`**: Nhật ký thực thi tự động theo thời gian thực: khách hàng nào kích hoạt trigger, điều kiện rẽ nhánh nào thỏa mãn, hành động nào đã được thực thi.
- **GET `/api/v1/automation/logs/{id}/trace`**: Xem chi tiết đường đi của một phiên thực thi tự động.

---

## 2.3 Phân Hệ Kích Hoạt & Nhãn Dán Tiếp Thị (Triggers & Marketing Tags - 24 Endpoints)

#### EP 61-72: Sự Kiện Kích Hoạt Tiếp Thị (Marketing Triggers)
- **GET `/api/v1/marketing/triggers`**: Danh mục các trigger có sẵn: `contact_created`, `deal_won`, `tag_added`, `missed_call`, `webform_submitted`, `birthday`.
- **POST `/api/v1/marketing/triggers/custom`**: Định nghĩa trigger tùy biến dựa trên webhook từ phần mềm bên ngoài.
- **GET & PUT `/api/v1/marketing/triggers/{id}/settings`**: Cấu hình bộ lọc điều kiện tiên quyết cho trigger (ví dụ: chỉ kích hoạt khi deal_value > 10 triệu).

#### EP 73-84: Quản Trị Nhãn Tiếp Thị & Phân Loại Chiến Dịch (Marketing Tags)
- **GET `/api/v1/tags`**: Toàn bộ nhãn dán phục vụ phân loại chiến dịch và hành vi khách hàng.
- **POST `/api/v1/tags`**: Tạo nhãn tiếp thị mới.
- **PUT & DELETE `/api/v1/tags/{id}`**: Sửa đổi và xóa nhãn tiếp thị.
- **POST `/api/v1/tags/batch-assign`**: Gắn nhãn tự động cho hàng loạt khách hàng tương tác với chiến dịch.

---

## 3. Ma Trận Observability, Logging & Exception Chuẩn

| Nhóm Ngoại Lệ | Danh Sách Lỗi Kỹ Thuật / Domain | Phân Loại `pkg/errors` | Hành Động Hệ Thống | Event Log `pkg/logger` |
|---|---|---|---|---|
| **Chống checkpoint** | Phát hiện tỷ lệ gửi lỗi > 15% trên Zalo | `CodeInternal` (CircuitBreaker) | Tự động pause chiến dịch, gửi cảnh báo | `BROADCAST_CIRCUIT_BREAKER_TRIGGERED` |
| **Giờ yên tĩnh** | Gửi tin nhắn tự động vào ban đêm | `CodeInvalidInput` (BusinessRule) | Hoãn job gửi sang 08:00 sáng hôm sau | `MARKETING_QUIET_HOURS_DELAYED` |
| **Vòng lặp tự động** | Phát hiện vòng lặp vô tận trong DAG | `CodeInvalidInput` (Terminal) | Chặn kích hoạt luồng, báo lỗi thiết kế | `AUTOMATION_DAG_CYCLE_DETECTED` |
| **Hạn mức tin nhắn** | Vượt quota tin nhắn WhatsApp WABA trong ngày | `CodeForbidden` (QuotaExceeded) | Dừng gửi các tin vượt mức, thông báo nạp tiền | `WABA_TIER_LIMIT_REACHED` |
| **Trạng thái chiến dịch**| Sửa nội dung khi campaign đang chạy | `CodeConflict` (Terminal) | Từ chối sửa, yêu cầu Pause trước | `CAMPAIGN_IMMUTABLE_WHILE_RUNNING` |
| **Không tìm thấy** | Không tìm thấy Broadcast, Flow, Sequence | `CodeNotFound` (Terminal) | Trả về HTTP 404 Not Found | `MARKETING_NOT_FOUND` |
