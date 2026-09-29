# Service API & External Gateway Bounded Context — Nghiệp Vụ & BDD User Stories

> Tài liệu mô tả các kịch bản nghiệp vụ của Service API Public, GoClaw Daemon/Bot Ingestion, HMAC-SHA256 Request Signing, Chống Replay Attack, IP Whitelisting, Webhook Dispatching và SLA Analytics.

---

## 1. Danh Mục Tác Nhân (Actors)

| Actor | Vai Trò & Trách Nhiệm |
|---|---|
| **External System / Bot / GoClaw** | Hệ thống đối tác, webhook gateway hoặc GoClaw AI runner gọi API bên ngoài vào Omni Core. |
| **Tenant Admin** | Nhà quản trị doanh nghiệp tạo Service API Key, cấu hình IP Whitelist, Scopes và Webhook URLs. |
| **Service API Middleware** | Bộ lọc kiểm tra HMAC Signature, Replay timestamp, IP CIDR và Token Bucket Rate Limiting. |
| **Webhook Delivery Engine** | Worker nền dispatch sự kiện outbound tới URL đã đăng ký của đối tác kèm cơ chế retry. |
| **SLA Analytics Engine** | Dịch vụ tính toán thời gian phản hồi (FRT - First Response Time) và phát hiện vi phạm SLA. |

---

## 2. Danh Sách User Stories & BDD Scenarios

### US-SERV-01: Xác Thực Ký Số HMAC-SHA256 & Chống Tấn Công Replay Attack
- **As a** Kỹ sư bảo mật hệ thống
- **I want** mọi request gọi vào `/api/v1/service/*` phải có chữ ký số HMAC-SHA256 hợp lệ và kiểm tra dấu thời gian
- **So that** tin nhắn hoặc lệnh điều khiển từ bên thứ ba không bị nghe lén, sửa đổi hoặc gửi lại trái phép.

#### Scenario 1: Request ký đúng chuẩn HMAC-SHA256 và timestamp hợp lệ
- **Given** Đối tác sở hữu `ServiceApiKey: "key_prod_888"` và `Secret: "secret_sec_999"`
- **And** Đối tác chuẩn bị gửi POST `/api/v1/service/messages/send` với payload JSON `{"recipient": "0988888888", "text": "Ma OTP"}`
- **And** Timestamp hiện tại là `1727500000` (chênh lệch 2 giây so với máy chủ)
- **When** Đối tác tính toán `Signature = HMAC-SHA256(Secret, "POST\n/api/v1/service/messages/send\n1727500000\n" + Body)`
- **And** Gửi kèm các HTTP Headers: `X-Service-Key`, `X-Timestamp`, `X-Signature`
- **Then** Middleware giải mã Key, tính toán lại chữ ký bằng Constant-Time Comparison (`subtle.ConstantTimeCompare`)
- **And** Xác nhận chữ ký khớp hoàn toàn và cho phép request đi tiếp vào Application Layer.

#### Scenario 2: Chặn đứng tấn công Replay Attack khi gửi lại request cũ
- **Given** Một kẻ tấn công bắt được gói tin hợp lệ từ đường truyền mạng với timestamp `1727400000` (cách đây 10 phút)
- **When** Kẻ tấn công gửi lại nguyên vẹn request đó vào `/api/v1/service/messages/send`
- **Then** Middleware kiểm tra: `|ServerTime - RequestTimestamp| = 600s > 300s (Ngưỡng 5 phút)`
- **And** Lập tức trả về HTTP 401 Unauthorized kèm mã lỗi `ErrTimestampExpired`
- **And** Ghi log cảnh báo xâm nhập, không xử lý lệnh gửi tin.

---

### US-SERV-02: Kiểm Soát Truy Cập Qua IP Whitelist & Quản Trị Scopes
- **As a** Tenant Administrator
- **I want** giới hạn dải địa chỉ IP (CIDR) và phạm vi quyền hạn (Scopes) cho từng Service API Key
- **So that** ngay cả khi Secret bị lộ, hacker từ mạng ngoài vẫn không thể khai thác API của doanh nghiệp.

#### Scenario 1: Gọi API từ IP nằm trong danh sách Whitelist
- **Given** `ServiceApiKey` được cấu hình `IPWhitelist: ["103.56.12.0/24", "118.69.180.12"]` và Scopes `["messages:write", "contacts:read"]`
- **When** Máy chủ bot đối tác có IP `103.56.12.44` gọi endpoint `/api/v1/service/messages/send`
- **Then** Middleware so khớp IP thành công và kiểm tra scope `messages:write` tồn tại
- **And** Request được thực thi thành công (HTTP 200).

#### Scenario 2: Chặn truy cập từ địa chỉ IP lạ
- **Given** `ServiceApiKey` có IP Whitelist như trên
- **When** Một request sử dụng Key này nhưng xuất phát từ IP `1.55.22.88`
- **Then** Middleware lập tức từ chối và trả về HTTP 403 Forbidden kèm mã lỗi `ErrIPNotAllowed`
- **And** Ngắt kết nối ngay trước khi tốn tài nguyên truy vấn cơ sở dữ liệu.

---

### US-SERV-03: Webhook Outbound Delivery Đảm Bảo Giao Nhận & Backoff Retry
- **As a** Nhà phát triển tích hợp hệ thống bên ngoài
- **I want** nhận thông báo webhook ngay khi có sự kiện khách hàng tạo mới hoặc tin nhắn mới
- **So that** hệ thống ERP/CRM bên ngoài tự động đồng bộ tức thời.

#### Scenario 1: Giao webhook thành công lần đầu
- **Given** Đối tác đăng ký webhook nhận sự kiện `contact.created` với URL `https://partner-erp.vn/webhooks`
- **When** Một khách hàng mới được tạo trong Omni Core
- **Then** Webhook Dispatcher gửi POST request kèm signature `X-Omni-Signature` tới URL của đối tác
- **And** Đối tác trả về HTTP 200 trong vòng 3 giây
- **And** Hệ thống ghi nhận `DeliveryLog` trạng thái `SUCCESS` và không cần thử lại.

#### Scenario 2: Webhook Endpoint đối tác bị sập & Kích hoạt Exponential Backoff Retry
- **Given** Máy chủ webhook của đối tác đang bảo trì và trả về HTTP 503 hoặc Connection Timeout
- **When** Dispatcher gửi sự kiện bất thành
- **Then** Hệ thống đánh dấu trạng thái sự kiện là `RETRYING`
- **And** Lên lịch retry tự động 5 lần theo công thức Exponential Backoff: 30s, 2m, 10m, 1h, 6h
- **And** Nếu sau 5 lần vẫn thất bại, chuyển trạng thái `FAILED` và gửi thông báo cảnh báo qua email/telegram cho Quản trị viên.

---

### US-SERV-04: Đo Lường & Cảnh Báo Vi Phạm Thời Gian Phản Hồi Đầu Tiên (SLA Breach)
- **As a** Giám đốc Dịch vụ Khách hàng (Customer Success Manager)
- **I want** hệ thống tự động đo thời gian nhân viên phản hồi tin nhắn đầu tiên của khách (First Response Time)
- **So that** kiểm soát chất lượng chăm sóc khách hàng và cảnh báo khi nhân viên bỏ quên khách quá 15 phút.

#### Scenario 1: Phát hiện và ghi nhận vi phạm SLA (First Response Time Breach)
- **Given** Khách hàng tiềm năng mới gửi tin nhắn đầu tiên lúc 09:00:00 (SLA ngưỡng phản hồi là 15 phút)
- **When** Đến 09:15:01 nhân viên phụ trách vẫn chưa gửi tin nhắn phản hồi nào
- **Then** SLA Engine phát hiện vi phạm và kích hoạt sự kiện `SLABreachEvent`
- **And** Ghi bản ghi vào `sla_performance_records` đánh dấu `is_breached = true`, `delay_seconds = 901`
- **And** Bắn thông báo khẩn cấp tới kênh Telegram nội bộ của Trưởng nhóm Sales/Support.
