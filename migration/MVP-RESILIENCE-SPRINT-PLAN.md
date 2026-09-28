# Kế Hoạch Sprint: Quản Trị Lỗi, Ngoại Lệ & Khả Năng Chống Chịu Cho MVP Release (MVP Resilience & Error Handling Sprint Plan)

> **Mục tiêu:** Bắt buộc toàn bộ 8 Bounded Contexts, nền tảng ứng dụng (API, Realtime, Workers), hạ tầng `pkg/` và Observability (Grafana Loki/Prometheus/DLQ) phải hoàn thành cơ chế xử lý lỗi, phân loại ngoại lệ và tự phục hồi trong bản phát hành **MVP Release**.

---

## 1. Bản Đồ Phân Phối Tác Vụ Theo Sprint (Sprint Mapping Overview)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 0: NỀN TẢNG DÙNG CHUNG (SHARED KERNEL PKG & OBSERVABILITY)          │
│ - pkg/errors: Taxonomy (Transient, Terminal, SecurityPolicy) & Wrapper      │
│ - pkg/resilience: Exponential Backoff, Jitter, Sliding-window Breaker       │
│ - pkg/dlq: PostgreSQL system_outbound_dlq schema & Redrive Engine           │
│ - pkg/logger: Structured JSON OpenTelemetry stream cho Grafana Loki         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ SPRINT 1-2: CORE BINDING│ │ SPRINT 3-4: DEAL & CHAT │ │ SPRINT 5-6: CHANNEL & AI│
│ - 01-Identity: Lockout  │ │ - 05-Deal: POS retry    │ │ - 02-Channel: Breaker   │
│ - 03-Customer: OCC/Race │ │ - 04-Conversation: WS   │ │ - 07-AIAgent: Fallback  │
│ - 06-Marketing: Quota   │ │ - Media: R2 chunk retry │ │ - 08-ServiceAPI: Replay │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 7: E2E INTEGRATION & GRAFANA OBSERVABILITY DASHBOARD                 │
│ - Promtail / Vector stream JSON log -> Grafana Loki & LogQL Alerting       │
│ - Grafana Dashboard: Circuit Breaker status, DLQ backlog, Error Rate        │
│ - API & UI: Nút "Thử lại" (Redrive) trên omni-web cho Sales / Admin         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Danh Mục Issues Chi Tiết Cần Triển Khai Cho MVP Release

### Nhóm 1: Tầng Dùng Chung (Shared Kernel & `pkg/`) — Sprint 0
| Mã Task | Bounded Context / Pkg | Nội Dung Chi Tiết | Độ Ưu Tiên | Tiêu Chí Nghiệm Thu (Acceptance Criteria) |
|---|---|---|---|---|
| **ISSUE-RES-01** | `pkg/errors` | Bổ sung `ExceptionClassification` (`Transient`, `Terminal`, `SecurityPolicy`), ánh xạ chuẩn HTTP/Connect-RPC code | P0 (Blocker) | 100% unit tests phân loại đúng từ raw error; ánh xạ chuẩn HTTP 4xx/5xx |
| **ISSUE-RES-02** | `pkg/resilience` | Hiện thực hóa `ExponentialBackoffWithJitter` và `SlidingWindowCircuitBreaker` (Closed/Open/Half-Open) | P0 (Blocker) | Benchmark và test concurrent safe; chuyển trạng thái OPEN sau 5 lỗi liên tiếp |
| **ISSUE-RES-03** | `pkg/dlq` | Tạo bảng DB `system_outbound_dlq`, Dispatcher và API `POST /api/v1/dlq/:id/redrive` | P0 (Blocker) | Ghi nhận payload lỗi khi retry thất bại; hỗ trợ query lọc theo tenant |
| **ISSUE-RES-04** | `pkg/logger` | Structured JSON log formatter ghi ra `stdout` chuẩn hóa `trace_id`, `tenant_id`, `duration_ms` cho Loki | P0 (Blocker) | Log JSON parse được ngay bởi Promtail / Grafana Loki không bị vỡ dòng |

---

### Nhóm 2: Áp Dụng Cho 8 Bounded Contexts — Sprint 1 Đến Sprint 6
| Mã Task | Bounded Context | Rủi Ro & Ngoại Lệ Xử Lý | Giải Pháp Kỹ Thuật Bắt Buộc | Sprint Áp Dụng |
|---|---|---|---|---|
| **ISSUE-RES-05** | `01-Identity` | Brute-force mật khẩu, Hết hạn JWT token | Rate limit IP 5 lần/phút, Refresh Token rotation với grace period 30s | Sprint 1 |
| **ISSUE-RES-06** | `06-Marketing` | Chạm trần quota ZNS/SMS, Tin nhắn vi phạm chính sách | Xếp hàng đợi hoãn gửi sang ngày hôm sau; Đánh dấu chiến dịch Terminal | Sprint 1 |
| **ISSUE-RES-07** | `03-Customer` | Trùng SĐT E.164, Xung đột gộp khách (Race condition) | Terminal báo lỗi validation; Optimistic Concurrency Control (OCC) retry 3 lần | Sprint 2 |
| **ISSUE-RES-08** | `05-Deal` | Đồng bộ KiotViet/Pancake lỗi mạng, Hết tồn kho lúc thanh toán | Đưa vào Outbox Worker retry 3 chu kỳ; Rollback đơn, chuyển trạng thái OutOfStock | Sprint 3 |
| **ISSUE-RES-09** | `04-Conversation` | Rớt socket realtime chat, Upload ảnh/file Cloudflare R2 fail | WebSocket reconnect jitter 1-5s; Multipart chunk upload retry 3 lần | Sprint 4 |
| **ISSUE-RES-10** | `02-Channel` | Checkpoint Zalo/Tele, Chạm rate limit 429 Meta/Telegram | Kích hoạt Circuit Breaker cho từng nick, ngủ theo header Telegram | Sprint 5 |
| **ISSUE-RES-11** | `07-AIAgent` | Quá quota OpenAI/Gemini (429), Context window tràn RAM | Tự động Fallback đa nhà cung cấp (OpenAI -> Gemini); Cắt tỉa lịch sử chat | Sprint 6 |
| **ISSUE-RES-12** | `08-ServiceAPI` | Tấn công Replay request, Quá tải API bên ngoài gọi vào | Chặn timestamp quá 5 phút; Token Bucket trả về HTTP 429 kèm `Retry-After` | Sprint 6 |

---

### Nhóm 3: Giám Sát Grafana & Giao Diện Người Dùng — Sprint 7
| Mã Task | Thành Phần | Nội Dung Triển Khai | Tiêu Chí Nghiệm Thu |
|---|---|---|---|
| **ISSUE-RES-13** | **Grafana Loki** | Cấu hình Promtail gom log `stdout` từ các containers Go. Thiết lập LogQL Alerting: cảnh báo lỗi Security/Policy vào Telegram Ops. | Alert bắn về Telegram trong vòng 30s kể từ khi phát sinh lỗi Checkpoint/Ban. |
| **ISSUE-RES-14** | **Grafana Dashboard** | Dashboard trực quan: Tỷ lệ lỗi theo Bounded Context, Danh sách Circuit Breaker đang OPEN, Số lượng thư mục DLQ chờ xử lý. | Hiển thị realtime 100% metrics sức khỏe hệ thống. |
| **ISSUE-RES-15** | **Frontend `omni-web`** | Tích hợp icon cảnh báo đỏ và nút **"Thử lại" (Redrive)** tại màn hình Chat & Đơn hàng cho phép Sales kích hoạt gửi lại từ DLQ. | Click "Thử lại" gọi API `POST /api/v1/dlq/:id/redrive`, cập nhật trạng thái ngay trên UI. |
