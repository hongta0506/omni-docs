# Quy Chuẩn Quản Trị Lỗi, Ngoại Lệ & Khả Năng Chống Chịu Toàn Hệ Thống (Cross-BC Resilience & Error Handling Spec)

> **Phạm vi áp dụng:** Toàn bộ 8 Bounded Contexts, Background Workers, Daemons, Shared Kernel (`pkg/errors`, `pkg/resilience`, `pkg/logger`) và External Integrations trong nền tảng Omni Core.  
> **Mục tiêu:** Chuẩn hóa toàn diện Exception Taxonomy (Transient, Terminal, Security/Policy), cơ chế tự phục hồi (Retry with Jitter, Circuit Breaker, DLQ), Structured Audit Log và quy định bắt buộc phải triển khai trong bản phát hành **MVP Release**.

---

## 1. Kiến Trúc Khả Năng Chống Chịu Tầng Dùng Chung (Shared Resilience Core: `pkg/`)

Mọi Bounded Context và Worker không được tự ý viết lại logic retry/circuit breaker phân tán mà bắt buộc phải sử dụng các gói dùng chung trong `pkg/`:

```
omni-core/pkg/
├── errors/
│   ├── errors.go                 # Sentinel error codes, Error struct, Wrapping, HTTP/gRPC status mapper
│   └── taxonomy.go               # ExceptionClassification: Transient, Terminal, SecurityPolicy
├── resilience/
│   ├── retry.go                  # Exponential Backoff with Full Jitter
│   ├── circuit_breaker.go        # Sliding Window Circuit Breaker (Closed, Open, Half-Open)
│   └── fallback.go               # Graceful degradation handlers
├── dlq/
│   ├── producer.go               # Dead Letter Queue Dispatcher (Lưu payload lỗi xuống PostgreSQL/Queue)
│   └── redrive.go                # API & CLI hỗ trợ nhân viên/Admin bấm "Thử lại" (Re-drive)
└── logger/
    └── audit.go                  # Structured JSON Audit Log formatter chuẩn OpenTelemetry
```

### 1.1 Phân Loại Ngoại Lệ Chuẩn (Unified Exception Taxonomy)

Mọi lỗi trả về từ Domain, Database, Network, hoặc Third-Party API bắt buộc phải gắn với 1 trong 3 nhóm ngoại lệ:

```
                            ┌───────────────────────────────┐
                            │      Omni System Exception    │
                            └───────────────┬───────────────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         ▼                                  ▼                                  ▼
┌───────────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│   Transient Exception │        │   Terminal Exception  │        │    Security / Policy  │
│      (Retryable)      │        │    (Non-Retryable)    │        │   (Action Required)   │
├───────────────────────┤        ├───────────────────────┤        ├───────────────────────┤
│ - Network Timeout     │        │ - Validation Error    │        │ - OAuth Token Expired │
│ - 502/503/504 Bad GW  │        │ - Entity Not Found    │        │ - Account Checkpoint  │
│ - Rate Limit / 429    │        │ - Domain Rule Violated│        │ - Account Banned      │
│ - DB Deadlock / 40001 │        │ - Blocked by User     │        │ - HMAC Replay Invalid │
│ - Socket Drop         │        │ - Invalid Phone / ID  │        │ - IP Fraud Flapping   │
├───────────────────────┤        ├───────────────────────┤        ├───────────────────────┤
│ Tự động Retry Backoff │        │ Hủy ngay, chuyển DLQ  │        │ Ngắt mạch, khóa nick  │
│ Không hạ trạng thái   │        │ Báo lỗi chi tiết DTO  │        │ Bắn Alert cho Admin   │
└───────────────────────┘        └───────────────────────┘        └───────────────────────┘
```

---

## 2. Danh Mục Lỗi & Chiến Lược Chống Chịu Cho 8 Bounded Contexts

| Bounded Context | Rủi Ro Vận Hành Chính | Ngoại Lệ Điển Hình | Phân Loại | Chiến Lược Xử Lý Tự Động |
|---|---|---|---|---|
| **01. Identity & Settings** | Hết hạn session, Brute-force mật khẩu, Quá tải LDAP | `ErrAccountLocked`<br>`ErrTokenExpired`<br>`ErrTenantSuspended` | Security<br>Security<br>Terminal | Khóa IP sau 5 lần thử sai; Tự động refresh JWT qua Refresh Token; Chặn gọi API tenant nếu quá hạn |
| **02. Channel & Gateway** | Checkpoint nick Zalo/Telegram, Lỗi 429 Meta/Telegram, Rớt Socket | `ERR_ZALO_CHECKPOINT`<br>`130429 (Meta RateLimit)`<br>`FLOOD_WAIT_X (Tele)`<br>`ErrSocketClosed` | Security<br>Transient<br>Transient<br>Transient | Ngắt mạch tài khoản ngay lập tức; Retry Exponential Backoff (3 lần); Ngủ `X` giây theo header Telegram; Tự reconnect socket qua Sticky Proxy |
| **03. Customer & Lead** | Xung đột ghi đồng thời gộp khách (Race condition), Trùng lặp SĐT | `ErrContactDuplicate`<br>`ErrConcurrentMerge`<br>`ErrInvalidPhoneNumber` | Terminal<br>Transient<br>Terminal | Chặn tạo mới, gợi ý gộp; Optimistic Concurrency Control (OCC) retry tối đa 3 lần; Báo lỗi định dạng E.164 |
| **04. Conversation & Media** | Đứt WebSocket realtime, Quá dung lượng file Cloudflare R2, Tin nhắn ngoài cửa sổ 24h | `ErrWsDisconnected`<br>`ErrMediaUploadTimeout`<br>`ErrOutsideWindow24h` | Transient<br>Transient<br>Policy | Client tự động reconnect với Jitter; Retry multipart upload 2 lần; Chặn gửi tin tự do, bắt buộc dùng Template/Tag |
| **05. Deal & E-commerce** | Đồng bộ POS KiotViet/Pancake lỗi mạng, Tồn kho không đủ lúc thanh toán | `ErrPosSyncTimeout`<br>`ErrOutOfStock`<br>`ErrPricebookChanged` | Transient<br>Terminal<br>Terminal | Đẩy vào Outbox Worker retry ngầm sau 30s; Rollback đơn, thông báo Sales hết hàng; Báo lỗi cập nhật giá mới |
| **06. Marketing & Automation** | Quá quota chiến dịch ZNS/SMS, Dính spam block Zalo | `ErrQuotaExceeded`<br>`ErrTemplateRejected`<br>`ErrZaloSpamBlock` | Transient<br>Terminal<br>Security | Tạm dừng hàng đợi gửi, resume vào ngày hôm sau; Đánh dấu chiến dịch Invalid; Đổi nick gửi sang nick dự phòng |
| **07. AI Agent & Knowledge** | Chạm trần Rate Limit OpenAI/Gemini (429), Context window quá lớn | `ErrAiProviderRateLimit`<br>`ErrContextLengthExceeded`<br>`ErrAiServiceUnavailable` | Transient<br>Terminal<br>Transient | Tự động Failover sang Provider dự phòng (OpenAI -> Gemini); Cắt tỉa ngữ cảnh hội thoại; Circuit Breaker tạm ngắt 1 phút |
| **08. Service API & Gateway** | Tấn công Replay Request, Chạm trần Rate Limit bên ngoài gọi vào | `ErrReplayDetected`<br>`ErrApiKeyInvalid`<br>`ErrServiceRateLimit` | Security<br>Security<br>Transient | Từ chối với mã 401/403, ghi Audit Log; Thu hồi API key; Trả về mã 429 kèm header `Retry-After` |

---

## 3. Các Mô Hình Phục Hồi & Tự Chữa Lành (Fault-Tolerance Patterns)

### 3.1 Exponential Backoff with Full Jitter (`pkg/resilience/retry.go`)
Áp dụng cho mọi tác vụ mạng nội bộ và gọi ra bên ngoài đối với lỗi `Transient`:

$$\text{Sleep} = \text{random}(0,\, \min(T_{\text{max}},\, T_{\text{base}} \times 2^{\text{attempt}}))$$

- **Tham số chuẩn MVP:**
  - $T_{\text{base}} = 500\text{ms}$ (giao tiếp nội bộ DB/gRPC) hoặc $2000\text{ms}$ (gọi kênh xã hội bên ngoài).
  - $T_{\text{max}} = 30\text{s}$.
  - $\text{Max Retries} = 3$ lần.

### 3.2 Circuit Breaker Cho Từng Tài Khoản & Gateway (`pkg/resilience/circuit_breaker.go`)
- **Trạng thái:** `CLOSED` (bình thường), `OPEN` (ngắt mạch, từ chối mọi yêu cầu), `HALF-OPEN` (thử nghiệm lưu lượng nhỏ).
- **Quy tắc ngắt:**
  - Nếu trong cửa sổ trượt 60 giây, tỷ lệ lỗi `Transient` liên tiếp đạt **5 lần** hoặc tỷ lệ lỗi $\ge 50\%$: Chuyển sang `OPEN`.
  - Nếu gặp lỗi `Security / Policy` (Checkpoint, Ban): Chuyển sang `OPEN` ngay lập tức trong lần gặp đầu tiên.
  - Thời gian chờ phục hồi (Cooldown): **5 phút**. Sau 5 phút chuyển sang `HALF-OPEN` cho phép 1 request đi qua để thăm dò.

### 3.3 Dead Letter Queue (DLQ) & Cơ Chế Redrive (`pkg/dlq/`)
- Mọi bản ghi thất bại sau khi hết số lần retry sẽ được chuyển xuống bảng `system_outbound_dlq`:
  - `id`: UUID
  - `tenant_id`: UUID
  - `bounded_context`: Tên BC phát sinh lỗi
  - `entity_type`: Ví dụ `Message`, `Campaign`, `PosOrder`
  - `entity_id`: Khóa ngoại thực thể
  - `payload`: JSON dữ liệu gửi ban đầu
  - `error_code`: Mã lỗi cuối cùng
  - `error_reason`: Chuỗi mô tả lỗi chi tiết
  - `retry_count`: Số lần đã thử
  - `status`: `PENDING_REVIEW`, `RETRYING`, `RESOLVED`, `ABANDONED`
- Cung cấp API endpoint chuẩn: `POST /api/v1/dlq/:id/redrive` cho phép người dùng/Admin bấm nút gửi lại trực tiếp từ giao diện CRM sau khi đã khắc phục sự cố (ví dụ đã quét lại QR hoặc nạp thêm tiền ZNS).

---

## 4. Chuẩn Hóa Nhật Ký Truy Vết Lỗi & Hạ Tầng Quan Sát (Observability & Grafana Stack)

Hệ thống xử lý log và lỗi theo mô hình **3 lớp chuyên biệt (Three-Pillar Observability)**:

```
                            ┌────────────────────────────────────────┐
                            │    Application / Worker Log & Error    │
                            └───────────────────┬────────────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         ▼                                      ▼                                      ▼
┌────────────────────────┐            ┌────────────────────────┐            ┌────────────────────────┐
│ 1. Telemetry / Metric  │            │  2. Structured Log     │            │ 3. Business Data / DLQ │
│ (Prometheus / Grafana) │            │ (Loki / Vector / Prom) │            │ (PostgreSQL Database)  │
├────────────────────────┤            ├────────────────────────┤            ├────────────────────────┤
│ - omni_errors_total    │            │ - Stdout JSON stream   │            │ - system_outbound_dlq  │
│ - omni_circuit_breaker │            │ - Loki LogQL cảnh báo  │            │ - Giao diện Web CRM    │
│ - Tỷ lệ lỗi theo BC    │            │ - Alert Telegram/Slack │            │ - Nút "Thử lại" Redrive│
└────────────────────────┘            └────────────────────────┘            └────────────────────────┘
```

1. **Grafana Loki (Bắt lỗi & Cảnh báo thời gian thực)**:
   - Toàn bộ service ghi log ra `stdout` dưới dạng JSON chuẩn OpenTelemetry.
   - Vector / Promtail thu thập stream này đẩy vào **Grafana Loki**.
   - Grafana Dashboard thiết lập Alert rule (qua LogQL): Khi tỷ lệ lỗi `SECURITY_POLICY` hoặc `TRANSIENT > 50%` lập tức bắn tin cảnh báo vào kênh Telegram On-call / Slack Ops.
2. **Prometheus Metrics (Đo lường & Giám sát sức khỏe)**:
   - Metric `omni_channel_circuit_breaker_state{bc, account_id}` hiển thị trực quan trạng thái CLOSED/OPEN trên Grafana.
   - Metric `omni_outbound_errors_total{bc, channel, classification}` giám sát số lượng lỗi tăng đột biến.
3. **PostgreSQL Database (`system_outbound_dlq`)**:
   - Dành riêng cho nghiệp vụ kinh doanh. Nhân viên Sales và Admin không thể vào Grafana đọc log.
   - Dữ liệu tin nhắn/đơn hàng lỗi được lưu trong DB để hiển thị icon cảnh báo màu đỏ trên giao diện chat `omni-web`, cho phép Sales xem lý do và bấm nút **"Thử lại" (Redrive)**.

---

### Cấu Trúc Log Chuẩn (Standard Schema Out to Stdout)

```json
{
  "timestamp": "2026-09-28T15:10:00.450Z",
  "level": "ERROR",
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "span_id": "b7ad6b7169203331",
  "tenant_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "bounded_context": "internal/deal",
  "submodule": "pos_integration",
  "operation": "SyncOrderToKiotViet",
  "exception_classification": "TRANSIENT",
  "error_code": "ERR_POS_SYNC_TIMEOUT",
  "error_message": "Post \"https://public.kiotapi.com/orders\": context deadline exceeded",
  "third_party": {
    "provider": "KiotViet",
    "http_status": 504,
    "raw_response": "Gateway Timeout"
  },
  "action_taken": "RETRIED_AND_SENT_TO_DLQ",
  "retry_attempt": 3,
  "execution_duration_ms": 5210
}
```

---

## 5. Quy Định Kiểm Thử Khả Năng Chống Chịu (Resilience Test Matrix)

Mọi PR liên quan đến tích hợp ngoại vi hoặc gọi DB/Queue bắt buộc phải có ít nhất 2 bài kiểm thử tự động:
1. **Unit Test Phân Loại Lỗi (Classification Test):** Đảm bảo mã lỗi từ bên thứ ba hoặc DB driver được map chính xác thành `Transient`, `Terminal`, hoặc `SecurityPolicy`.
2. **Resilience Execution Test:** Mô phỏng lỗi rớt mạng (sử dụng `httptest.Server` trả về 503 hoặc 429) và chứng minh logic Retry đã chờ đúng số chu kỳ hoặc Circuit Breaker đã chuyển sang trạng thái `OPEN`.
