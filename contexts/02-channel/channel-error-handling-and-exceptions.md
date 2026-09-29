# Quản Lý Lỗi, Ngoại Lệ & Nhật Ký Kênh Ngoại Vi (Channel Error Handling & Exceptions)

> **Bounded Context:** `internal/channel`  
> **Mục tiêu:** Chuẩn hóa toàn bộ danh mục lỗi (Error Codes), các ngoại lệ khi gọi API/Socket bên thứ 3 (Zalo, Meta, Telegram, WhatsApp), chiến lược xử lý ngoại lệ (Retry, Circuit Breaker, DLQ) và quy chuẩn Structured Audit Log.

---

## 1. Phân Loại Ngoại Lệ (Exception Taxonomy)

Mọi lỗi trả về từ kênh mạng xã hội (Official hoặc Unofficial) bắt buộc phải được Adapter chuyển đổi thành 1 trong 3 nhóm ngoại lệ:

```
                  ┌───────────────────────────────┐
                  │    Channel Third-Party Error  │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Transient Error │      │ Terminal Error  │      │ Security/Policy │
│ (Retryable)     │      │ (Non-Retryable) │      │ (Action Required│
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ - Network drop  │      │ - Invalid Phone │      │ - Checkpoint    │
│ - Rate Limit/429│      │ - User Blocked  │      │ - Account Banned│
│ - 502/503/504   │      │ - Invalid Param │      │ - Token Expired │
│ - Socket closed │      │ - Group Deleted │      │ - Policy Violate│
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

1. **Transient Exception (Lỗi tạm thời - Có thể thử lại)**:
   - *Đặc điểm:* Lỗi do mạng chập chờn, server bên thứ 3 quá tải tạm thời (502, 503, 504), rớt kết nối Socket, hoặc chạm trần Rate Limit (429, FloodWait).
   - *Hành động:* Hệ thống **tự động thử lại** theo cơ chế `Exponential Backoff with Jitter`. Không đánh dấu tài khoản bị chết.
2. **Terminal Exception (Lỗi kết thúc - Không thử lại)**:
   - *Đặc điểm:* Tham số không hợp lệ, người dùng đích không tồn tại, người dùng đã chặn tin nhắn, nhóm đã bị giải tán, tin nhắn trống.
   - *Hành động:* Hủy lệnh gửi tin ngay lập tức, chuyển trạng thái tin nhắn sang `Failed`, ghi log nguyên nhân cụ thể để phản hồi cho Sales.
3. **Security / Policy Exception (Lỗi bảo mật & Chính sách - Cần can thiệp)**:
   - *Đặc điểm:* Hết hạn OAuth Token, Cookie/Session bị hủy, tài khoản bị Checkpoint, dính SpamBot, hoặc bị khóa (Ban).
   - *Hành động:* **Ngắt kết nối ngay lập tức**, đổi trạng thái `AccountStatus = Checkpoint | Banned | Disconnected`, gửi thông báo khẩn cấp (Alert) cho người dùng/Admin yêu cầu quét lại QR hoặc làm mới token.

---

## 2. Bảng Tra Cứu Mã Lỗi & Ngoại Lệ Chi Tiết Theo Từng Kênh

### 2.1 Zalo Channel Exceptions

| Kênh & Mode | Mã Lỗi (Code) | Tên Lỗi / Mô Tả | Phân Loại | Hành Động Hệ Thống |
|---|---|---|---|---|
| **Zalo OA (Official)** | `-201` | Invalid Parameter (Tham số không hợp lệ) | Terminal | Hủy lệnh, ghi log chi tiết request |
| **Zalo OA (Official)** | `-216` | Access Token Expired (Token hết hạn) | Security | Tự động kích hoạt luồng `OAuth Refresh Token` |
| **Zalo OA (Official)** | `-221` | Out of quota / Rate limit | Transient | Hoãn gửi, xếp hàng đợi và retry sau 60s |
| **Zalo OA (Official)** | `-230` | User not respond within 48h (Quá 48h) | Policy | Chặn gửi tin tự do; bắt buộc chuyển sang ZNS Template |
| **Zalo Personal (Unofficial)** | `ERR_ZALO_CHECKPOINT` | Tài khoản bị bắt xác thực thiết bị mới / SMS | Security | Đổi `AccountStatus = Checkpoint`, báo Sale mở app xác thực |
| **Zalo Personal (Unofficial)** | `ERR_ZALO_QR_EXPIRED` | Mã QR hết hạn 120s | Terminal | Hủy phiên QR, kích hoạt tạo QR mới |
| **Zalo Personal (Unofficial)** | `ERR_ZALO_SOCKET_CLOSED` | Rớt socket với Zalo daemon | Transient | Tự động reconnect với Exponential Backoff (tối đa 5 lần) |
| **Zalo Personal (Unofficial)** | `ERR_ZALO_SPAM_BLOCK` | Bị Zalo chặn nhắn tin do spam người lạ | Policy | Khóa chức năng gửi tin trong 24h, cảnh báo Sale |

---

### 2.2 Meta (WhatsApp, Messenger, Instagram) Exceptions

| Kênh & Mode | Mã Lỗi (Meta Code) | Subcode / Message | Phân Loại | Hành Động Hệ Thống |
|---|---|---|---|---|
| **WhatsApp Cloud (Official)** | `130429` | Rate limit hit (Chạm trần Cloud API) | Transient | Xếp hàng hàng đợi, retry sau thời gian ghi trong header |
| **WhatsApp Cloud (Official)** | `131047` | Re-engagement message (Quá 24h) | Policy | Bắt buộc đổi sang gửi Template Message có duyệt trước |
| **WhatsApp Cloud (Official)** | `131026` | Message Undeliverable (Số không có WhatsApp) | Terminal | Đánh dấu số không hợp lệ, không retry |
| **WhatsApp Baileys (Unofficial)**| `401 / 403` | Logged out / Stream error | Security | Xóa session key, cập nhật `AccountStatus = Disconnected` |
| **WhatsApp Baileys (Unofficial)**| `428` | Precondition Required / Connection dropped | Transient | Reconnect socket qua SOCKS5 Sticky Proxy |
| **Messenger / Instagram (Official)**| `190` | Invalid OAuth 2.0 Access Token | Security | Gửi cảnh báo Admin kết nối lại Fanpage |
| **Messenger (Official)** | `2018001` | Outside 24-hour window | Policy | Chặn gửi thường, yêu cầu gắn Message Tag hợp lệ |
| **Messenger / Instagram** | `368` | Temporarily blocked for policies (Spam) | Policy | Tạm ngưng toàn bộ outbound của Page trong 12h |

---

### 2.3 Telegram Exceptions

| Kênh & Mode | Mã Lỗi (Code) | Chi Tiết Lỗi | Phân Loại | Hành Động Hệ Thống |
|---|---|---|---|---|
| **Telegram Bot (Official)** | `403` | Bot was blocked by the user | Terminal | Đánh dấu người dùng đã chặn bot, hủy tin |
| **Telegram Bot (Official)** | `429` | `Too Many Requests: retry after X` | Transient | Sleep đúng `X` giây theo chỉ định từ Telegram, sau đó retry |
| **Telegram Bot (Official)** | `400` | `Chat not found` (Chưa bấm /start) | Terminal | Báo lỗi: Khách chưa khởi động bot |
| **Telegram MTProto (Unofficial)**| `FLOOD_WAIT_X` | Gửi quá nhanh, phải chờ `X` giây | Transient | Đưa worker tài khoản vào trạng thái ngủ `X` giây |
| **Telegram MTProto (Unofficial)**| `USER_DEACTIVATED_BAN`| Số điện thoại bị Telegram ban vĩnh viễn | Security | Đổi `AccountStatus = Banned`, giải phóng Proxy |
| **Telegram MTProto (Unofficial)**| `SESSION_REVOKED` | Phiên đăng nhập bị hủy từ thiết bị khác | Security | Đổi `AccountStatus = Disconnected`, yêu cầu đăng nhập lại |

---

## 3. Chiến Lược Xử Lý Lỗi Tự Động (Fault-Tolerance Patterns)

### 3.1 Exponential Backoff with Jitter (Dành cho Transient Errors)
```
Thời gian chờ lần n: T(n) = Min(T_max, T_base * 2^(n-1)) + Random_Jitter
- T_base = 2 giây
- T_max = 60 giây
- Max_Retries = 3 lần
```
Sau 3 lần thử lại thất bại, gói tin được chuyển vào **Dead Letter Queue (DLQ)**.

### 3.2 Dead Letter Queue (DLQ) & Manual Resend
- Khi một lệnh gửi tin thất bại vĩnh viễn (hết số lần retry hoặc gặp Terminal Error), thông tin được lưu trữ vào bảng `channel_outbound_dlq`.
- Sales hoặc Admin có thể xem lý do thất bại trên giao diện Chat và bấm **"Thử lại" (Retry)** sau khi đã khắc phục nguyên nhân (ví dụ: đã quét lại QR hoặc bổ sung số điện thoại).

### 3.3 Circuit Breaker (Ngắt mạch tự động)
- Áp dụng trên từng tài khoản cá nhân (Unofficial) và từng Gateway:
  - Nếu tỷ lệ lỗi vượt quá **50% trong vòng 1 phút** (hoặc 5 lỗi liên tiếp), Circuit Breaker chuyển sang trạng thái `OPEN`.
  - Tạm dừng toàn bộ lệnh gửi của tài khoản đó trong vòng 5 phút để bảo vệ tài khoản khỏi bị cấm vĩnh viễn.

---

## 4. Chuẩn Hóa Nhật Ký Ghi Lỗi (Structured JSON Audit Log)

Mọi sự kiện gọi ra kênh bên thứ 3 và ngoại lệ phát sinh bắt buộc phải ghi log dưới dạng **Structured JSON** để phục vụ truy vết (Tracing) và cảnh báo:

### Cấu Trúc Log Chuẩn (Standard Schema)
```json
{
  "timestamp": "2026-09-28T14:32:10.123Z",
  "level": "ERROR",
  "trace_id": "c1f7a8b9-4321-4f11-9e22-89ab01234567",
  "tenant_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "bounded_context": "internal/channel",
  "submodule": "zalo_gateway",
  "channel_type": "zalo_personal",
  "channel_mode": "UNOFFICIAL",
  "account_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "recipient_id": "zalo_uid_8849102",
  "proxy_ip": "103.142.26.11:1080",
  "error_classification": "SECURITY_POLICY",
  "third_party_error": {
    "raw_code": "ERR_ZALO_CHECKPOINT",
    "raw_message": "Session invalidated, SMS challenge requested",
    "http_status": null
  },
  "action_taken": "ACCOUNT_MARKED_CHECKPOINT",
  "retry_count": 0,
  "execution_duration_ms": 420
}
```

### Các Trường Bắt Buộc:
- `trace_id`: ID xuyên suốt từ request của Sales đến khi ra đến mạng xã hội.
- `tenant_id`: Cô lập định danh doanh nghiệp.
- `channel_type` & `channel_mode`: Xác định rõ nền tảng và phương thức (`OFFICIAL` hay `UNOFFICIAL`).
- `error_classification`: `TRANSIENT`, `TERMINAL`, hoặc `SECURITY_POLICY`.
- `action_taken`: Hành động hệ thống đã xử lý (`RETRIED`, `SENT_TO_DLQ`, `CIRCUIT_BREAKER_TRIGGERED`, `ACCOUNT_MARKED_CHECKPOINT`).
