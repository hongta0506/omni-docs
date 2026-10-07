# WhatsApp Personal Connection Wizard Specification

## 1. Context & Business Goals

### 1.1 Mục Tiêu Nghiệp Vụ
WhatsApp Personal (Unofficial) cho phép doanh nghiệp kết nối trực tiếp số điện thoại WhatsApp cá nhân của nhân viên bán hàng/CSKH vào hệ thống Omni Core thông qua giao thức WhatsApp Multi-Device. Khác với WhatsApp Official Cloud API (WABA) đòi hỏi duyệt doanh nghiệp và trả phí theo phiên hội thoại (Conversation-based pricing), WhatsApp Personal cho phép:
- Gửi nhận tin nhắn 2 chiều tự do không phụ thuộc 24h Service Window.
- Giữ nguyên danh bạ và các cuộc trò chuyện lịch sử trên điện thoại của nhân viên.
- Chi phí vận hành thấp (chỉ bao gồm hạ tầng container và Egress Proxy).

### 1.2 Kiến Trúc Go Native In-Process & whatsmeow
Hệ thống tuân thủ **Universal Social Gateway Architecture** của Omni Core, tương tự Zalo (`zcago`) và Telegram (`gotd/td`):
- **Core Application (`omni-core`)**: Chứa logic nghiệp vụ, quản lý tài khoản (`ChannelAccount`), phân quyền Tenant và định tuyến tin nhắn.
- **WhatsApp Native Driver (`internal/channel/infrastructure/whatsapp/`)**: Nhúng trực tiếp thư viện Go thuần [`go.mau.fi/whatsmeow`](https://github.com/tulir/whatsmeow) chạy in-process trong `omni-core`, loại bỏ hoàn toàn daemon sidecar/container Node.js độc lập.
- **Quản lý Phiên (Session Store)**: Sử dụng `whatsmeow/store/sqlstore` gắn trực tiếp vào PostgreSQL backend hoặc mã hóa lưu trong `channel_accounts.credentials`.
- **Giao Tiếp Inter-Process**: Gọi trực tiếp in-memory thông qua interface `WhatsAppGatewayPort`, zero độ trễ RPC và tiết kiệm tài nguyên RAM.

```
┌────────────────────────────────────────────────────────┐
│               Frontend Web (omni-web)                  │
│             WhatsApp Connection Wizard                 │
└───────────────────────────┬────────────────────────────┘
                            │ REST / SSE
┌───────────────────────────▼────────────────────────────┐
│              Omni Core (omni-core:8080)                │
│       Bounded Context: Channel & Gateway               │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ NativeWhatsmeowClient Engine (go.mau.fi/whatsmeow)│  │
│  │ - In-Process Multi-Account Instance Manager      │  │
│  │ - Persistent SQL Store (PostgreSQL sqlstore)     │  │
│  │ - Dedicated Residential SOCKS5 Proxy Allocation  │  │
│  └────────────────────────┬─────────────────────────┘  │
└───────────────────────────┼────────────────────────────┘
                            │ Noise Protocol over WS (TLS 443)
┌───────────────────────────▼────────────────────────────┐
│           WhatsApp Web Server (c.whatsapp.net)         │
└────────────────────────────────────────────────────────┘
```

---

## 2. Quy Trình 4 Bước (Given / When / Then - BDD Specification)

### Bước 1: Nhập Số Điện Thoại & Pre-check (Chống Trùng Lặp & Thu Hồi Nick Cũ)
Hệ thống bắt buộc chuẩn hóa số điện thoại theo chuẩn quốc tế E.164 (VD: `+84901234567` hoặc `84901234567`) và kiểm tra tính toàn vẹn trước khi cho phép quét mã QR.

- **Given**: Người dùng (Saler/Admin) đang ở màn hình kết nối kênh WhatsApp của Tenant `tenant_id`.
- **When**: Người dùng nhập số điện thoại dự kiến kết nối và bấm "Tiếp tục".
- **Then**: Hệ thống kiểm tra trong cơ sở dữ liệu `channel_accounts`:
  - *Trường hợp 1 (Tài khoản đang hoạt động)*: Nếu số điện thoại đã tồn tại ở trạng thái `ACTIVE` trong cùng Tenant, từ chối với lỗi `CONFLICT` (`409 Conflict: Phone already connected`).
  - *Trường hợp 2 (Khác Tenant)*: Nếu số điện thoại đang hoạt động ở Tenant khác, từ chối với lỗi bảo mật `ACCOUNT_CLAIMED_BY_ANOTHER_TENANT`.
  - *Trường hợp 3 (Tái kết nối - Revive)*: Nếu số điện thoại đã từng kết nối nhưng đang ở trạng thái `DISCONNECTED` hoặc `LOGGED_OUT`, hệ thống trả về thông tin tài khoản cũ kèm cờ `reviveAccountId` để tái kích hoạt phiên, không tạo mới record rác.
  - *Trường hợp 4 (Tài khoản mới hoàn toàn)*: Hệ thống cấp phát một SOCKS5 Proxy từ Egress Proxy Pool và chuyển sang Bước 2.

### Bước 2: Khởi Tạo Phiên Pairing QR & Cấp Phát SOCKS5 Proxy
- **Given**: Pre-check số điện thoại thành công.
- **When**: Frontend gọi lệnh khởi tạo phiên đăng nhập QR (`POST /api/v1/whatsapp-personal/qr`).
- **Then**:
  1. Core kiểm tra pool proxy và gán một SOCKS5 Egress Proxy cố định (`sticky_proxy_id`) cho tài khoản.
  2. Core gọi Gateway Daemon qua RPC `GetLoginQR(account_id, phone, proxy_url)`.
  3. Gateway Daemon khởi tạo instance `whatsmeow.Client`, thiết lập kết nối Noise Protocol qua Proxy tới server WhatsApp và đăng ký kênh nhận mã QR.
  4. Gateway trả về chuỗi mã QR raw (chuỗi text base64) kèm thời hạn hiệu lực (TTL 20 - 40 giây theo chu kỳ refresh của WhatsApp Web).
  5. Core lưu `WhatsAppSession` tạm vào bộ nhớ/Redis với trạng thái `qr_pending`.

### Bước 3: Quét QR Trên Ứng Dụng WhatsApp Điện Thoại & Xác Thực Phiên
- **Given**: Mã QR đang hiển thị trên giao diện kết nối của người dùng.
- **When**: Người dùng mở ứng dụng WhatsApp trên điện thoại -> Cài đặt (Settings) -> Thiết bị liên kết (Linked Devices) -> Quét mã QR trên màn hình.
- **Then**:
  1. Ứng dụng điện thoại đàm phán cặp khóa Noise Protocol và gửi xác nhận về server WhatsApp.
  2. Daemon `whatsmeow` nhận sự kiện `events.PairSuccess` hoặc `events.Connected`:
     - Trích xuất thông tin JID người dùng (dạng `84901234567@s.whatsapp.net`).
     - Trích xuất tên hiển thị (PushName) và thông tin nền tảng điện thoại.
     - Lưu trữ khóa mã hóa phiên đăng nhập vào SQLite Store (`/data/sessions.db`).
  3. Gateway Daemon bắn sự kiện `StreamChannelEventsResponse` mang cờ trạng thái kết nối thành công về Core.
  4. Core cập nhật trạng thái `ChannelAccount` sang `ACTIVE`, cập nhật `account_uid = JID` và gửi thông báo WebSocket về Frontend để đóng Wizard.

### Bước 4: Bàn Giao Inbound Worker & Đồng Bộ Lịch Sử (History Sync)
- **Given**: Tài khoản đã xác thực thành công.
- **When**: Phiên kết nối duy trì ổn định.
- **Then**:
  1. **Kích hoạt Worker Inbound**: Core gắn kết luồng stream Connect-RPC `StreamChannelEvents` của tài khoản vào `InboundEventForwarder`.
  2. **Tiếp nhận Tin nhắn Realtime**: Mọi tin nhắn đến từ WhatsApp được giải mã và chuyển hóa thành `InboundMessageDTO` đưa vào hội thoại của hệ thống.
  3. **History Sync Handling**:
     - WhatsApp Web tự động bắn sự kiện `HistorySync` chứa các cuộc trò chuyện gần nhất.
     - Gateway Daemon chuẩn hóa sự kiện thành `HistorySyncEvent` và stream về Core.
     - Core kiểm tra và cập nhật thông tin khách hàng vào Bounded Context Customer (`internal/customer`) mà không kích hoạt AI Auto-Reply (tránh spam khách hàng với tin nhắn cũ).

---

## 3. Kiến Trúc Dữ Liệu & State Machine

### 3.1 Vòng Đời Trạng Thái Phiên (Session State Machine)

```
 [INIT] 
   │ (Pre-check SĐT thành công)
   ▼
[QR_PENDING] ◄────────────────┐ (Hết hạn 20s, tự động refresh QR mới)
   │                           │
   ├─► [EXPIRED] ──────────────┘ (Quá 3 lần retry -> Báo lỗi Timeout)
   │
   │ (Người dùng quét trên điện thoại)
   ▼
[SCANNED]
   │ (Điện thoại xác nhận thành công)
   ▼
[CONNECTED / ACTIVE] ◄────────┐
   │                           │ (Tự động Reconnect mạng)
   ├─► [DISCONNECTED] ─────────┘
   │
   │ (User chủ động ngắt trên app điện thoại hoặc Web)
   ▼
[LOGGED_OUT]
```

### 3.2 Đặc Tả Trạng Thái Chi Tiết

| Trạng thái | Mô tả | Hành vi hệ thống |
|---|---|---|
| `qr_pending` | Mã QR đang hiển thị trên Web, chờ quét. | Polling hoặc SSE đẩy QR, đếm lùi thời gian TTL. |
| `scanned` | Ứng dụng điện thoại đã nhận diện QR. | Chờ điện thoại hoàn tất đàm phán cặp khóa. |
| `connected` | Kết nối thành công, thiết bị đã liên kết. | Kích hoạt worker stream tin nhắn, cập nhật DB sang `ACTIVE`. |
| `expired` | Quá thời hạn quét QR (thường sau 2-3 phút không quét). | Thông báo nút "Lấy mã mới" cho người dùng. |
| `disconnected` | Mất kết nối mạng tạm thời giữa Daemon và WhatsApp. | Tự động thử kết nối lại (Auto-reconnect with exponential backoff). |
| `logged_out` | Thiết bị bị hủy liên kết từ điện thoại (Unlinked). | Chuyển trạng thái sang `DISCONNECTED`, ngắt worker, yêu cầu quét lại từ đầu. |

---

## 4. API Endpoints Contract (Core & Frontend)

### 4.1 Danh Sách Endpoints REST

| Method | Endpoint | Mô tả | Query / Body Params | Response DTO |
|---|---|---|---|---|
| `POST` | `/api/v1/whatsapp-personal/check-phone` | Pre-check số điện thoại & chống trùng | `{ "phone": "84901234567" }` | `{ "status": "ok", "canConnect": true, "reviveAccountId": null }` |
| `POST` | `/api/v1/whatsapp-personal/qr/start` | Khởi tạo phiên pairing QR mới | `{ "phone": "84901234567", "accountId": "uuid-optional" }` | `{ "sessionId": "uuid", "qrCode": "base64...", "expiresIn": 20 }` |
| `GET` | `/api/v1/whatsapp-personal/qr/:sessionId/status` | Polling trạng thái quét QR | Không | `{ "status": "qr_pending" \| "connected", "account": { ... } }` |
| `POST` | `/api/v1/whatsapp-personal/:id/reconnect` | Tái kết nối tài khoản bị rớt mạng | Không | `{ "status": "reconnecting" }` |
| `DELETE`| `/api/v1/whatsapp-personal/:id` | Ngắt kết nối và hủy session | Không | `{ "status": "disconnected" }` |

### 4.2 Chi Tiết Request & Response DTOs

#### Pre-check Phone (`POST /api/v1/whatsapp-personal/check-phone`)
- **Request**:
```json
{
  "phone": "+84901234567"
}
```
- **Response (Cho phép kết nối mới)**:
```json
{
  "status": "available",
  "phone": "84901234567",
  "reviveAccountId": null
}
```
- **Response (Tài khoản cũ cần Revive)**:
```json
{
  "status": "revivable",
  "phone": "84901234567",
  "reviveAccountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "message": "Số điện thoại đã từng kết nối. Bấm tiếp tục để liên kết lại phiên cũ."
}
```

#### Start QR (`POST /api/v1/whatsapp-personal/qr/start`)
- **Request**:
```json
{
  "phone": "84901234567",
  "reviveAccountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```
- **Response**:
```json
{
  "sessionId": "a9b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d",
  "qrCode": "2@ABC...XYZ==",
  "qrImage": "data:image/png;base64,iVBORw0KGgo...",
  "expiresIn": 25
}
```

---

## 5. Hướng Dẫn Vận Hành & Chống Khóa Số (Anti-Ban & Resilience)

1. **Gán Cố Định Egress Sticky Proxy**:
   - Bắt buộc mỗi tài khoản WhatsApp cá nhân phải đi qua một địa chỉ Residential / Mobile Proxy cố định trong suốt vòng đời.
   - Tuyệt đối không để tài khoản nhảy IP liên tục giữa các quốc gia hoặc ASN datacenter (dễ bị WhatsApp tự động gắn cờ spam).
2. **Warm-up Tài Khoản Mới Kết Nối**:
   - Đối với tài khoản mới liên kết lần đầu vào hệ thống, giới hạn gửi tối đa 30 - 50 tin nhắn outbound mỗi ngày trong 3 ngày đầu tiên.
   - Thêm khoảng nghỉ ngẫu nhiên (Jitter delay) từ 3 giây đến 10 giây giữa các tin nhắn gửi đi tự động.
3. **Quản Lý Lưu Trữ SQLite An Toàn**:
   - Thư mục dữ liệu `/data/whatsapp/` chứa file `sessions.db` bắt buộc phải được mount persistent volume trên máy chủ host hoặc cloud storage có cơ chế snapshot hàng ngày.
   - Mã hóa khóa phiên ở mức database hoặc file storage.
4. **Xử Lý Sự Kiện Ngắt Kết Nối Bất Thường**:
   - Nếu nhận mã lỗi `401 Unauthorized` từ WhatsApp: Tài khoản đã bị người dùng chủ động bấm Log out trên điện thoại. Chuyển trạng thái sang `DISCONNECTED` và cảnh báo người dùng kết nối lại.
   - Nếu nhận mã lỗi `515 Stream Restart`: Gateway Daemon tự động thực hiện reconnect mà không hủy session credentials trong SQLite.
