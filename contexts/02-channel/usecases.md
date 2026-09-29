# Channel & Gateway — Danh Tả Use Cases & User Stories (BDD Specification)

> **Bounded Context:** `internal/channel`  
> **Phạm vi:** 95 Endpoints (Quản trị Zalo cá nhân, Zalo OA, Telegram Personal/Bot, WhatsApp Gateway, Pancake POS Sync, SOCKS5 Proxy Pool, Session Watchdog).  
> **Định dạng:** Chuẩn BDD (`Given - When - Then`) & Jobs-to-Be-Done (JTBD).

---

## Danh Mục Use Cases (Actors & Boundaries)

| Use Case ID | Nhóm Nghiệp Vụ | Actor Chính | Mục Tiêu Nghiệp Vụ |
|---|---|---|---|
| **UC-CHAN-01** | Multi-Protocol Account Login | Nhân viên Kinh doanh / Admin | Đăng nhập tài khoản mạng xã hội (QR code Zalo/WhatsApp, Telegram MTProto/Bot, Meta OAuth) |
| **UC-CHAN-02** | SOCKS5 Proxy Sticky Assignment | Hệ thống Gateway | Gán cố định IP Proxy cho từng tài khoản mạng xã hội để chống khóa tài khoản do đổi IP |
| **UC-CHAN-03** | Gateway Session Watchdog | Background Worker | Giám sát trạng thái Online/Offline, tự động tái kết nối hoặc cảnh báo khi bị đăng xuất |
| **UC-CHAN-04** | Inbound Event Dispatching | Channel Gateway Adapters | Nhận diện tin nhắn/sự kiện từ kênh, chuẩn hóa thành Domain Event đẩy vào Event Bus |
| **UC-CHAN-05** | Outbound Message Rate-Limiting | Rate Limiter Engine | Giới hạn tốc độ gửi tin ra ngoài kênh (Throttle/Backpressure) để tránh bị cấm tài khoản |
| **UC-CHAN-06** | Pancake POS Realtime Sync | Pancake Adapter | Đồng bộ 2 chiều đơn hàng, tồn kho, khách hàng từ Pancake POS về hệ thống |
| **UC-CHAN-07** | Dual-Mode Channel Routing | Dispatcher Engine | Điều phối tin nhắn thông minh theo 2 hướng: Official (OpenAPI/Webhook) và Unofficial (Session/Daemon) |

---

## 1. UC-CHAN-01: Multi-Protocol Account Login & Pairing

### User Story
**As a** Nhân viên kinh doanh,  
**I want** liên kết tài khoản Zalo cá nhân hoặc Telegram của mình vào CRM thông qua quét mã QR hoặc mã xác nhận,  
**So that** hệ thống có thể nhận và gửi tin nhắn trực tiếp với khách hàng dưới danh nghĩa tài khoản của tôi.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Đăng nhập Zalo cá nhân qua QR Code
- **Given:** Nhân viên chọn chức năng thêm tài khoản Zalo cá nhân.
- **When:** Gọi `POST /api/v1/zalo-accounts/qr-init`.
- **Then:** Gateway sinh mã QR (chuỗi base64 hoặc SVG) kèm thời hạn hiệu lực 120 giây.
- **When:** Nhân viên dùng ứng dụng Zalo trên điện thoại quét mã và nhấn xác nhận đăng nhập.
- **Then:** Gateway nhận callback xác thực thành công từ máy chủ Zalo.
- **And:** Lưu trữ Session Secret an toàn (mã hóa AES-256) vào bảng `channel_accounts`.
- **And:** Kích hoạt Session Watchdog và thông báo trạng thái `Connected` qua WebSocket.

---

## 2. UC-CHAN-02: SOCKS5 Proxy Sticky Pool & Anti-Ban

### User Story
**As a** Quản trị viên Kỹ thuật,  
**I want** mỗi tài khoản mạng xã hội khi chạy qua Gateway được gán cố định vào một IP Proxy SOCKS5 riêng biệt,  
**So that** tài khoản không bị các nền tảng (Zalo, Telegram) khóa do nhảy địa chỉ IP bất thường.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Gán Sticky Proxy khi khởi tạo kết nối
- **Given:** Pool proxy của Tenant có 5 địa chỉ SOCKS5 đang hoạt động (`status = healthy`).
- **When:** Tài khoản Zalo `zalo_acc_01` được kết nối lần đầu.
- **Then:** Hệ thống chọn Proxy có số lượng tài khoản liên kết thấp nhất (Least-Connected).
- **And:** Khóa cố định (`sticky_proxy_id`) proxy này cho `zalo_acc_01`.
- **And:** Mọi kết nối socket và HTTP request của tài khoản này bắt buộc đi qua Proxy được gán.

#### Kịch bản 2: Tự động đổi Proxy dự phòng khi Proxy chính bị hỏng (Failover)
- **Given:** Proxy `proxy_01` bị mất kết nối (Ping timeout > 5000ms).
- **When:** Worker kiểm tra sức khỏe proxy phát hiện sự cố.
- **Then:** Đánh dấu `proxy_01` là `unhealthy`.
- **And:** Chuyển các tài khoản đang gắn với `proxy_01` sang một Proxy dự phòng còn sống.
- **And:** Ghi nhật ký cảnh báo và gửi thông báo cho quản trị viên.

---

## 3. UC-CHAN-05: Giới Hạn Tốc Độ Gửi Tin Nhắn (Outbound Rate Limiting)

### User Story
**As a** Hệ thống CRM,  
**I want** các lệnh gửi tin nhắn ra kênh ngoại vi phải tuân thủ nghiêm ngặt hạn mức tốc độ (VD: Tối đa 1 tin/2 giây cho Zalo cá nhân),  
**So that** tài khoản của nhân viên không bị AI của nền tảng phát hiện hành vi spam dẫn đến khóa tài khoản vĩnh viễn.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Gửi tin nhắn có khoảng đệm thời gian (Delay & Backpressure)
- **Given:** Chiến dịch gửi tin có 50 tin nhắn cần gửi qua tài khoản Zalo `zalo_acc_02`.
- **When:** Lệnh gửi được đẩy vào hàng đợi Outbound Queue.
- **Then:** Rate Limiter áp dụng thuật toán Leaky Bucket / Token Bucket.
- **And:** Các tin nhắn được gửi cách nhau ngẫu nhiên từ 3 đến 7 giây (Human-like behavior).
- **And:** Tuyệt đối không gửi đồng loạt (Burst) cùng một lúc.

---

## 4. UC-CHAN-07: Điều Phối Đa Hướng Official & Unofficial (Dual-Mode Channel Routing)

### User Story
**As a** Hệ thống Omni Core,  
**I want** điều phối việc nhận và gửi tin nhắn linh hoạt giữa 2 hướng Official (Zalo OA, Meta Cloud API, Telegram Bot) và Unofficial (Zalo Cá nhân, Baileys WhatsApp, Telegram MTProto, Instagram Private),  
**So that** tối ưu hóa chi phí gửi tin, không phụ thuộc duy nhất vào một phương thức và giảm thiểu tối đa nguy cơ khóa tài khoản.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Nhận tin nhắn từ Webhook Official (Meta/Zalo OA/Telegram Bot)
- **Given:** Kênh được cấu hình ở chế độ `OFFICIAL`.
- **When:** Webhook của nền tảng (VD: Meta Graph Webhook) đẩy payload JSON về endpoint `/api/v1/integrations/meta/webhook`.
- **Then:** Gateway xác thực chữ ký số HMAC-SHA256 (`X-Hub-Signature-256`) từ Secret Key.
- **And:** Trích xuất định danh khách hàng, nội dung tin nhắn, bọc thành `ChannelMessageReceivedEvent`.
- **And:** Đẩy vào internal Event Bus mà không cần qua Proxy.

#### Kịch bản 2: Gửi tin nhắn qua tài khoản Unofficial (Zalo Cá nhân / WhatsApp Baileys)
- **Given:** Kênh được cấu hình ở chế độ `UNOFFICIAL`.
- **When:** Lệnh `SendMessageCommand` được kích hoạt từ CRM.
- **Then:** Router kiểm tra trạng thái Session (`status = Connected`) và Proxy gắn kèm (`sticky_proxy_id`).
- **And:** Chuyển qua Rate Limiter kiểm tra hạn mức an toàn (Jitter delay 3-7s).
- **And:** Gửi gói tin qua WebSocket/TCP Socket đi xuyên qua SOCKS5 Proxy dân cư tương ứng tới máy chủ mạng xã hội.
- **And:** Cập nhật trạng thái `Sent` / `Failed` về Message Store.

