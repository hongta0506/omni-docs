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

---

## 3. Invariants & Nghiệp Vụ Cốt Lõi

1. **Bảo mật HMAC-SHA256**:
   - Tất cả request gọi vào `/api/v1/service/*` bắt buộc có header `X-Service-Key`, `X-Timestamp`, và `X-Signature` (tính từ HTTP method + URI + timestamp + body với secret key).
   - Chặn Replay Attack: Từ chối request có timestamp chênh lệch quá ±300 giây so với server clock.
2. **IP Whitelist Enforcement**:
   - Mỗi `ServiceApiKey` có thể gắn danh sách CIDR IP được phép gọi. Nếu cấu hình, IP ngoài dải bị từ chối ngay ở interface middleware (403 Forbidden).
3. **SLA Breach Detection**:
   - Khi thời gian phản hồi tin nhắn đầu tiên của nhân viên cho khách hàng mới vượt quá ngưỡng SLA của Tenant (mặc định 15 phút), tự động ghi nhận `SLABreachEvent` và gửi cảnh báo Ops Radar.
