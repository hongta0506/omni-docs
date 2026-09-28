# Service API & External Gateway Bounded Context (`internal/serviceapi`)

> Bounded Context phụ trách Cung cấp Public API chuẩn bảo mật cao cho bên ngoài và Daemons (GoClaw Daemon, external bots, webhooks), Xác thực HMAC Request Signing, Đo lường hiệu suất và Báo cáo SLA Analytics.

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/serviceapi` |
| **Tổng số Endpoints** | **40** (Service API core 18, Analytics & SLA 22) |
| **Aggregate Roots** | `ServiceApiKey`, `WebhookSubscription`, `SLAPerformanceRecord` |
| **Entities con** | `ApiKeyScope`, `DeliveryLog`, `SLABreachEvent` |
| **Value Objects** | `HMACSignatureVO`, `IPWhitelistVO`, `RateLimitPolicyVO` |
| **Giao thức** | RESTful Public API (`/api/v1/service/*`), Connect-RPC (`serviceapi.v1.ServiceApiService`), Webhooks |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`mapping-service-api-and-analytics.md`](./mapping-service-api-and-analytics.md) | Ánh xạ chi tiết endpoints Service API (whoami, send message, assign leads, contact search), xác thực HMAC và chỉ số Analytics SLA. |
| [`usecases.md`](./usecases.md) | Đặc tả Use Cases & BDD Scenarios (Given-When-Then): HMAC-SHA256, Anti-Replay, IP Whitelist, Webhook Backoff, SLA Breach Engine. |
| [`workflows.md`](./workflows.md) | Sơ đồ luồng nghiệp vụ Mermaid: Sequence HMAC Ingestion, Sequence Webhook Outbound Retry, State Machine SLA First Response Time. |
| [`test-matrix.md`](./test-matrix.md) | Ma trận kiểm thử bảo mật: Constant-Time Compare chống Timing Attack, Token Bucket Rate Limiting và kiểm thử dung sai Timestamp. |

---

## 3. Invariants & Nghiệp Vụ Cốt Lõi

1. **Bảo mật HMAC-SHA256**:
   - Tất cả request gọi vào `/api/v1/service/*` bắt buộc có header `X-Service-Key`, `X-Timestamp`, và `X-Signature` (tính từ HTTP method + URI + timestamp + body với secret key).
   - Chặn Replay Attack: Từ chối request có timestamp chênh lệch quá ±300 giây so với server clock.
2. **IP Whitelist Enforcement**:
   - Mỗi `ServiceApiKey` có thể gắn danh sách CIDR IP được phép gọi. Nếu cấu hình, IP ngoài dải bị từ chối ngay ở interface middleware (403 Forbidden).
3. **SLA Breach Detection**:
   - Khi thời gian phản hồi tin nhắn đầu tiên của nhân viên cho khách hàng mới vượt quá ngưỡng SLA của Tenant (mặc định 15 phút), tự động ghi nhận `SLABreachEvent` và gửi cảnh báo Ops Radar.

---

## 4. Thành Phần Dùng Chung & Phụ Thuộc (Shared & Dependencies)

### 4.1 Thành phần dùng chung nội bộ (Internal BC Common)
- `internal/serviceapi/domain/errors.go`: Sentinel errors (`ErrInvalidApiKey`, `ErrInvalidHMACSignature`, `ErrIPNotAllowed`, `ErrTimestampExpired`).
- `internal/serviceapi/application/common/`:
  - `hmac_signer.go`: Bộ sinh và kiểm tra chữ ký số HMAC-SHA256 chống giả mạo request.
  - `ip_matcher.go`: Tiện ích so khớp địa chỉ IP gọi đến với CIDR dải mạng được whitelist.
  - `pagination.go`: ServiceKeyFilter, WebhookFilter, SLALogFilter DTOs.
- `internal/serviceapi/interfaces/http/middleware/`: HMACVerificationMiddleware, IPWhitelistMiddleware, ServiceRateLimiter.

### 4.2 Thành phần phụ thuộc dùng chung toàn hệ thống (Cross-BC Shared Kernel)
- `pkg/context/`: TenantID, CallerID context extraction.
- `pkg/events/`: Publish Domain Events (`ServiceMessageDispatchedEvent`, `SLABreachedEvent`). Lắng nghe `MessageReceivedEvent` và `ConversationAssignedEvent` để tính toán SLA response metrics.
- `pkg/pagination/`: PageRequest, PageResponse chuẩn hóa.
- `pkg/errors/`: System error codes & HTTP/RPC status mapper.

