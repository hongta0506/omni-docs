# Đặc Tả Nghiệp Vụ Chi Tiết: Service API & Gateway Bounded Context (40 Endpoints)

> **Bounded Context:** `internal/serviceapi`  
> **Phạm vi quản lý:** Cổng giao tiếp lập trình bên ngoài (External Service API for 3rd Parties), Xác thực khóa máy-đến-máy (Machine-to-Machine Service Keys & Scopes), Cổng phát sự kiện ra ngoài (Outbound Webhooks Delivery & Dead Letter Queue), và Giám sát lưu lượng & Thống kê lưu lượng API (API Traffic & Analytics).

---

## 1. Domain Model, Aggregates & Invariants (Quy Tắc Bất Biến Nghiệp Vụ)

### 1.1 Aggregate Root: `ServiceKey` (Khóa Lập Trình Máy-Đến-Máy)
- **Cấu trúc:** Khóa API có tiền tố nhận diện môi trường (`sk_live_...` hoặc `sk_test_...`).
- **Invariants:**
  1. **Khóa API mã hóa một chiều:** Chuỗi bí mật thô (`raw_secret`) chỉ hiển thị duy nhất 1 lần khi tạo. Hệ thống chỉ lưu trữ mã băm SHA-256 (`secret_hash`) trong database.
  2. **Ranh Giới Quyền Hạn Tối Thiểu (Least Privilege Scopes):** Mỗi Service Key bắt buộc phải gán danh sách phạm vi quyền hạn cụ thể (ví dụ: `messages:send`, `leads:write`, `contacts:read`). Tuyệt đối cấm cấp quyền vượt quá phạm vi được khai báo.
  3. **Thu Hồi Tức Thì (Instant Revocation Invariant):** Khi một Service Key bị xóa hoặc vô hiệu hóa, Redis Cache lưu token hash phải bị xóa ngay lập tức để ngắt quyền truy cập của ứng dụng bên thứ 3 trong vòng dưới 1 giây.

### 1.2 Aggregate Root: `WebhookSubscription` & Outbound Dispatcher
- **Invariants:**
  1. **Ký Chữ Ký Số Bảo Mật (HMAC SHA-256 Signature):** Mọi payload sự kiện đẩy ra ngoài qua webhook bắt buộc phải kèm chữ ký bảo mật ở header `X-Omni-Signature = hmac_sha256(payload, webhook_secret)` để bên nhận xác minh tính toàn vẹn dữ liệu.
  2. **Cơ Chế Thử Lại & Hàng Đợi Chết (Exponential Backoff & DLQ Invariant):**
     - Khi endpoint đối tác trả về mã lỗi (HTTP 5xx hoặc timeout > 10s), hệ thống tự động thử lại 5 lần theo chu kỳ dãn cách: 30s, 2m, 15m, 1h, 6h.
     - Sau 5 lần thất bại, sự kiện được chuyển vào Hàng đợi chết (Dead Letter Queue - DLQ) và gửi email cảnh báo cho quản trị viên hệ thống của đối tác.

---

## 2. Chi Tiết Nghiệp Vụ & BDD Cho Từng Phân Hệ Endpoints

### 2.1 Phân Hệ Cổng Lập Trình Service API (M2M APIs - 15 Endpoints)

#### EP 01-05: Xác Thực & Tra Cứu Danh Tính Máy (Whoami & Rate Limits)
- **GET `/api/v1/service/whoami`**:
  - **Nghiệp vụ:** Trả về thông tin Tenant, ID của Service Key, danh sách scopes được phép gọi, hạn mức gọi API còn lại trong phút.
  - **BDD Scenario:**
    - *Given:* Header `Authorization: Bearer sk_live_xyz123...`.
    - *When:* Gửi GET tới `/api/v1/service/whoami`.
    - *Then:* Trả về HTTP 200, mã Tenant, danh sách Scopes, và headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`.
- **GET `/api/v1/service/quotas`**: Kiểm tra tổng số lượt gọi API trong tháng so với gói cước đăng ký.

#### EP 06-15: Các Hành Động Lập Trình Phổ Biến (Headless Actions)
- **POST `/api/v1/service/messages/send`**: Gửi tin nhắn đa kênh (Zalo, WhatsApp, Telegram) trực tiếp từ hệ thống ERP, CRM ngoài qua API.
- **POST `/api/v1/service/contacts/upsert`**: Tạo mới hoặc cập nhật hồ sơ khách hàng theo số điện thoại từ hệ thống bán lẻ POS.
- **POST `/api/v1/service/leads/assign`**: Đẩy Lead từ Landing Page bên thứ 3 vào hệ thống và kích hoạt thuật toán chia Lead tự động.
- **POST `/api/v1/service/deals/create`**: Tạo cơ hội bán hàng trực tiếp từ hệ thống kế toán hoặc hợp đồng điện tử.

---

## 2.2 Phân Hệ Outbound Webhooks & Dead Letter Queue (15 Endpoints)

#### EP 16-22: Quản Lý Đăng Ký Nhận Webhook (Subscriptions CRUD)
- **GET `/api/v1/service/webhooks`**: Danh sách tất cả các webhook đối tác đã đăng ký nhận sự kiện (URL nhận tin, danh sách sự kiện, trạng thái `active`/`disabled`).
- **POST `/api/v1/service/webhooks`**: Đăng ký webhook endpoint mới: URL đối tác, chọn sự kiện (`contact.created`, `message.received`, `deal.won`, `call.ended`), sinh `webhook_secret`.
- **GET `/api/v1/service/webhooks/{id}`**: Lấy chi tiết cấu hình và tỷ lệ gửi thành công của webhook.
- **PUT `/api/v1/service/webhooks/{id}`**: Cập nhật URL nhận tin hoặc thay đổi danh sách sự kiện cần nghe.
- **DELETE `/api/v1/service/webhooks/{id}`**: Hủy đăng ký webhook.

#### EP 23-30: Kiểm Thử, Lịch Sử Giao Tin & DLQ (Deliveries & Retries)
- **POST `/api/v1/service/webhooks/{id}/ping`**: Gửi một gói tin sự kiện thử nghiệm (`ping` event) để đối tác kiểm tra kết nối server.
- **GET `/api/v1/service/webhooks/{id}/deliveries`**: Danh sách lịch sử các lần đẩy tin: HTTP status trả về từ đối tác, thời gian phản hồi (ms), số lần đã retry.
- **GET `/api/v1/service/webhooks/dlq`**: Danh sách các sự kiện rơi vào hàng đợi chết do đối tác sập server quá 5 lần retry.
- **POST `/api/v1/service/webhooks/dlq/{eventId}/replay`**: Kích hoạt gửi lại thủ công một sự kiện từ hàng đợi chết sau khi đối tác đã khắc phục xong sự cố.

---

## 2.3 Phân Hệ Giám Sát Lưu Lượng & Thống Kê API (API Analytics - 10 Endpoints)

#### EP 31-40: Thống Kê Băng Thông & Tỷ Lệ Lỗi (Traffic & Errors)
- **GET `/api/v1/service/analytics/requests`**: Thống kê số lượng request theo thời gian thực (RPS - Requests Per Second).
- **GET `/api/v1/service/analytics/errors`**: Thống kê tỷ lệ lỗi HTTP 4xx (Sai auth, Bad Request) và HTTP 5xx (Lỗi hệ thống).
- **GET `/api/v1/service/analytics/top-endpoints`**: Danh sách các endpoint được bên thứ 3 gọi nhiều nhất trong tháng.
- **GET `/api/v1/service/analytics/ip-allowlist`**: Quản lý danh sách IP được phép gọi API (IP Whitelist) tăng cường an ninh.
- **PUT `/api/v1/service/analytics/ip-allowlist`**: Cập nhật dải IP tin cậy.

---

## 3. Ma Trận Observability, Logging & Exception Chuẩn

| Nhóm Ngoại Lệ | Danh Sách Lỗi Kỹ Thuật / Domain | Phân Loại `pkg/errors` | Hành Động Hệ Thống | Event Log `pkg/logger` |
|---|---|---|---|---|
| **Khóa API sai** | API key không tồn tại, hết hạn hoặc bị thu hồi | `CodeUnauthorized` (Terminal) | Trả về 401 Unauthorized ngay lập tức | `SERVICE_KEY_UNAUTHORIZED` |
| **Vượt phạm vi quyền** | Key chỉ có quyền đọc nhưng gọi API ghi dữ liệu | `CodeForbidden` (SecurityPolicy) | Trả về 403 Forbidden, ghi log xâm nhập | `SERVICE_SCOPE_FORBIDDEN` |
| **Vượt Rate Limit** | Gọi vượt quá 100 requests/giây của Service Key | `CodeInvalidInput` (RateLimit) | Trả về 429 Too Many Requests | `SERVICE_RATE_LIMIT_EXCEEDED` |
| **Webhook timeout** | Server đối tác không phản hồi sau 10 giây | `CodeInternal` (Transient) | Lên lịch retry tự động với Exponential Backoff | `WEBHOOK_DELIVERY_TIMEOUT` |
| **DLQ Event** | Hết 5 lần retry đối tác vẫn lỗi | Cảnh báo hệ thống | Chuyển sự kiện vào Dead Letter Queue | `WEBHOOK_MOVED_TO_DLQ` |
| **Không tìm thấy** | Không tìm thấy Webhook, Service Key | `CodeNotFound` (Terminal) | Trả về HTTP 404 Not Found | `SERVICE_API_NOT_FOUND` |
