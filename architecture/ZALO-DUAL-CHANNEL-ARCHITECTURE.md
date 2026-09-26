# Zalo Dual-Channel Integration Architecture: Official OA vs Unofficial Personal (zca-js)

Tài liệu này xác định kiến trúc chuẩn hóa cho việc tích hợp **Zalo** vào hệ thống **Omni Core**, phân tách rõ ràng giữa 2 hình thức:
1. **Zalo Official Account (Zalo OA)**: Kênh chính thống qua Zalo OpenAPI.
2. **Zalo Personal / Unofficial (Zalo Cá Nhân)**: Kênh phi chính thức qua thư viện reverse-engineered [`zca-js`](https://github.com/RFS-ADRENO/zca-js) chạy bằng Node.js daemon và giao tiếp qua gRPC.

---

## 1. So Sánh và Phân Định Ranh Giới (Bounded Context Boundaries)

| Đặc tính | Zalo Official Account (OA) | Zalo Personal (Unofficial - zca-js) |
| :--- | :--- | :--- |
| **Giao thức gốc** | HTTPS REST API & Webhook chính thức từ VNG | WebSocket / Long-polling qua Cookie & Cryptographic Keys của Zalo Web |
| **Bản chất xác thực** | OAuth 2.0 (App ID, Secret, Refresh Token, Access Token) | QR Code Scan / Cookies (`zpsid`, `zpw_sek`, `imei`) qua daemon Node.js |
| **Cơ chế Inbound** | Webhook HTTP POST từ Zalo Server về API Gateway | WebSocket realtime listener trong thư viện `zca-js` |
| **Cơ chế Outbound** | Direct HTTP request từ Go Core sang Zalo OpenAPI | gRPC Unary/Streaming request từ Go Core sang `zca-js` daemon |
| **Vòng đời tài khoản** | Token hết hạn -> Refresh tự động qua HTTP API | Phiên đăng nhập cookie -> Nguy cơ văng phiên -> Cần QR re-login |
| **Tỷ lệ hạn chế / Ban** | Không bị ban (tuân thủ chính sách VNG) | Rủi ro checkpoint / ban tài khoản nếu spam hoặc login bất thường |
| **Đơn vị định danh** | `oa_id`, `user_id_by_app` (App-scoped ID) | `zalo_user_id` (Zalo UID toàn cầu), Phone Number |

---

## 2. Kiến Trúc Universal Channel Gateway

Hệ thống Omni Core sử dụng mô hình **Hexagonal / Ports & Adapters** để trừu tượng hóa toàn bộ sự khác biệt của 2 loại kênh này:

```
                               ┌──────────────────────────────────────────────┐
                               │               omni-core (Go)                 │
                               │                                              │
                               │  ┌────────────────────────────────────────┐  │
                               │  │   internal/channel (Channel Gateway)   │  │
                               │  │   - ChannelAccount Aggregate           │  │
                               │  │   - Universal Event Ingress Pipeline   │  │
                               │  └───────▲────────────────────────▲───────┘  │
                               └──────────┼────────────────────────┼──────────┘
                                          │ gRPC / Connect-RPC     │ HTTP Webhook
                    ┌─────────────────────┴────────┐     ┌─────────┴─────────────┐
                    │                              │     │                       │
                    ▼                              ▼     ▼                       ▼
     ┌──────────────────────────────┐              ┌──────────────────────────────────┐
     │   omni-adapter-zalo-personal │              │      Zalo OA Ingress Adapter     │
     │      (Node.js Daemon)        │              │       (Built-in HTTP in Go)      │
     │   - Lib: zca-js              │              │   - Zalo OpenAPI Client          │
     │   - gRPC Server / Client     │              │   - OAuth2 Token Refresher       │
     │   - Cookie & Session Store   │              │   - Webhook Signature Verifier   │
     └──────────────┬───────────────┘              └─────────────────┬────────────────┘
                    │ Reverse-engineered                             │ Official OpenAPI
                    ▼                                                ▼
     ┌──────────────────────────────┐              ┌──────────────────────────────────┐
     │      Zalo Web Server         │              │        Zalo Open Platform        │
     │   (chat.zalo.me / api)       │              │       (openapi.zalo.me)          │
     └──────────────────────────────┘              └──────────────────────────────────┘
```

---

## 3. Chi Tiết Tích Hợp Từng Kênh

### 3.1 Zalo Official Account (Official API)
- **Tầng xử lý**: Tích hợp trực tiếp trong Go Core (`internal/channel/infrastructure/zalo_oa/`).
- **Gửi tin nhắn (Outbound)**: Sử dụng Go HTTP client gọi trực tiếp API `https://openapi.zalo.me/v3.0/oa/message/cs` với Bearer Token.
- **Nhận tin nhắn (Inbound)**: Router tiếp nhận webhook công khai `/api/v1/webhooks/zalo/oa`, kiểm tra chữ ký SHA256 MAC, giải mã payload và chuyển đổi thành `domain.InboundMessageReceived` event.

### 3.2 Zalo Personal (Unofficial qua `zca-js`)
- **Tầng xử lý**: Tách biệt thành micro-service/daemon riêng `omni-adapter-zalo-personal` viết bằng Node.js / TypeScript.
- **Thư viện lõi**: `zca-js` (Zalo Client API) đảm nhiệm việc giải mã giao thức, mã hóa E2EE/key của Zalo Web, duy trì kết nối WebSocket.
- **Cơ chế giao tiếp liên tiến trình (IPC / RPC)**:
  1. **gRPC Protocol**: Định nghĩa hợp đồng trong `api/proto/channel/v1/zalo_personal.proto`.
  2. **Inbound Streaming**: Daemon `zca-js` mở kết nối gRPC Client stream sự kiện liên tục (`StreamEvents`) về Go Core. Mọi tin nhắn gửi đến, tin nhắn nhóm, cập nhật trạng thái online được push ngay lập tức.
  3. **Outbound Commands**: Go Core gọi RPC `SendMessage`, `SendFile`, `SendSticker` sang daemon `zca-js`. Daemon nhận lệnh và gọi hàm tương ứng trong instance `zca-js`.
  4. **Authentication & Session Lifecycle**:
     - Go Core gọi RPC `GenerateLoginQR` -> Daemon trả về QR data/image base64.
     - User quét mã QR trên điện thoại -> Daemon phát hiện event login thành công -> Trả về cookies & keys.
     - Go Core lưu thông tin session bảo mật vào database (`channel_accounts.credentials`).

---

## 4. Chuẩn Hóa Domain Data Model

Tại tầng Domain của Omni Core (`internal/channel` và `internal/conversation`), dữ liệu của cả 2 nguồn được chuẩn hóa thành enum `ChannelType`:

```go
type ChannelType string

const (
    ChannelZaloPersonal ChannelType = "zalo_personal" // Unofficial qua zca-js
    ChannelZaloOA       ChannelType = "zalo_oa"       // Official Open API
    ChannelMessenger    ChannelType = "messenger"
    ChannelTelegram     ChannelType = "telegram"
)
```

Mỗi tin nhắn (`Message`) và hội thoại (`Conversation`) đều ghi nhận rõ ràng `ChannelType` và `ChannelAccountID` để định tuyến chính xác sang adapter tương ứng khi gửi outbound.

---

## 5. Quy Tắc Vận Hành & Bảo Mật Đối Với `zca-js`
1. **Cô lập tiến trình (Process Isolation)**: Worker chạy `zca-js` phải đặt trong container riêng biệt, không được chia sẻ bộ nhớ trực tiếp với Go Core để tránh rủi ro crash hoặc rò rỉ bộ nhớ từ Node.js.
2. **Cơ chế Reconnect Tự Động**: Khi Zalo hủy session (cookie expired), daemon `zca-js` phải phát domain event `ChannelAccountDisconnected` về Core để gửi thông báo cho nhân viên CRM quét lại mã QR.
3. **Rate Limiting & Anti-Spam**: Vì là unofficial API, hệ thống Go Core phải áp dụng Leaky Bucket / Token Bucket giới hạn tần suất gửi tin nhắn đối với `ChannelZaloPersonal` (tối đa 1 tin / 2 giây / account) để tránh bị Zalo checkpoint.
