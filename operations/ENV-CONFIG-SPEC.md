# Đặc Tả Biến Môi Trường (Environment Configuration Specification)
## Omni Core Platform — Golang Clean DDD & Pluggable Gateways

> **Mục tiêu**: Chuẩn hóa toàn bộ cấu hình runtime qua biến môi trường (Environment Variables) tuân thủ nguyên tắc **12-Factor App**. Đảm bảo tính bảo mật, dễ dàng triển khai đa môi trường (`development`, `staging`, `production`), và phân định rõ ràng giữa các tầng dùng chung và 8 Bounded Contexts.

---

## 1. Nguyên Tắc Quản Trị Cấu Hình (Core Configuration Rules)

1. **Không Hardcode**: Tuyệt đối không hardcode IP, cổng, mật khẩu, API key, JWT secret trong mã nguồn Go.
2. **Fallbacks Hợp Lý Cho Local**: Các biến môi trường thiết yếu được cung cấp giá trị mặc định an toàn cho môi trường Local Docker (`localhost:5432`, `localhost:6379`). Trên môi trường `production`, thiếu biến bắt buộc phải dừng ứng dụng ngay (`fail-fast`).
3. **Phân Vùng Prefix Rõ Ràng**: Các biến đặc thù cho Bounded Context được đặt tiền tố riêng (ví dụ: `CHANNEL_*`, `AI_*`, `DEAL_*`) để tránh xung đột namespace khi chạy dạng Monolith hoặc tách Microservices.
4. **Bảo Mật Secrets**: Secret keys, Private keys, Database credentials không được commit vào git repository. File mẫu được lưu tại `.env.example`.

---

## 2. Bảng Danh Mục Biến Môi Trường Chi Tiết

### 2.1 Cấu Hình Hệ Thống & HTTP / Connect-RPC Server

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `ENV` / `ENVIRONMENT` | `development` | Có | Môi trường chạy: `development`, `staging`, `production`. |
| `PORT` | `8080` | Có | Cổng lắng nghe chính cho HTTP RESTful và Connect-RPC (HTTP/2 h2c). |
| `WS_PORT` | `8081` | Có | Cổng WebSocket chuyên biệt cho realtime messaging & notification hub. |
| `LOG_LEVEL` | `info` | Không | Mức log: `debug`, `info`, `warn`, `error`. (Prod luôn là `info`). |
| `LOG_FORMAT` | `json` | Có | Định dạng log: `json` (cho Grafana Loki) hoặc `text` (cho local dev). |
| `SERVICE_NAME` | `omni-core` | Không | Tên dịch vụ dùng để đánh nhãn OpenTelemetry tracing và Loki stream. |
| `SHUTDOWN_TIMEOUT_SEC`| `15` | Không | Thời gian chờ graceful shutdown hoàn tất các in-flight requests. |

---

### 2.2 Cơ Sở Dữ Liệu PostgreSQL & Bun ORM

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `DATABASE_URL` | `postgres://omni_user:omni_pass@localhost:5432/omni_db?sslmode=disable` | Có | Connection string PostgreSQL (hỗ trợ `sslmode=require` trên Prod). |
| `DB_MAX_OPEN_CONNS` | `50` | Không | Số kết nối tối đa mở đồng thời trong database pool. |
| `DB_MAX_IDLE_CONNS` | `10` | Không | Số kết nối idle tối thiểu duy trì sẵn sàng trong pool. |
| `DB_CONN_MAX_LIFETIME_SEC` | `1800` | Không | Thời gian sống tối đa của một kết nối (giây), mặc định 30 phút. |
| `DB_CONN_MAX_IDLE_TIME_SEC` | `300` | Không | Thời gian tối đa giải phóng kết nối idle không sử dụng (5 phút). |

---

### 2.3 Bộ Nhớ Tạm Redis (Session & Distributed Cache)

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Có | URI kết nối Redis, hỗ trợ auth `redis://:pass@host:port/db`. |
| `REDIS_POOL_SIZE` | `20` | Không | Kích thước connection pool giao tiếp Redis. |
| `REDIS_DIAL_TIMEOUT_MS` | `2000` | Không | Timeout tạo kết nối tới Redis (milliseconds). |
| `REDIS_READ_TIMEOUT_MS` | `1000` | Không | Timeout đọc dữ liệu cache từ Redis. |

---

### 2.4 Hàng Đợi Thông Điệp NSQ (Asynchronous Queue Engine)

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `NSQD_TCP_URL` | `127.0.0.1:4150` | Có | Địa chỉ TCP daemon NSQ dùng cho việc publish message. |
| `NSQLOOKUPD_HTTP_URL` | `127.0.0.1:4161` | Không | Địa chỉ HTTP của NSQ Lookupd phục vụ khám phá consumer nodes. |
| `NSQ_MAX_IN_FLIGHT` | `200` | Không | Số lượng job tối đa consumer tiếp nhận xử lý song song. |

---

### 2.5 Xác Thực, Bảo Mật & RBAC (01-Identity & Settings)

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `JWT_SECRET` | `dev-insecure-jwt-secret-min-32-chars-long!` | Có | Khóa bí mật ký HMAC-SHA256 Token (tối thiểu 32 ký tự). |
| `JWT_EXPIRATION_HOURS` | `24` | Không | Thời gian hiệu lực Access Token của người dùng. |
| `REFRESH_TOKEN_EXP_DAYS` | `30` | Không | Thời gian hiệu lực Refresh Token. |
| `BCRYPT_COST` | `10` | Không | Độ phức tạp băm mật khẩu người dùng (10 - 12). |
| `INTERNAL_API_KEY` | `dev-internal-service-secret-key` | Có | Khóa định danh cho các lời gọi nội bộ Service-to-Service. |

---

### 2.6 Kênh Truyền Thông & Cổng Proxy (02-Channel & Gateway)

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `SOCKS5_PROXY_POOL` | `""` | Không | Danh sách proxy cố định phân tách dấu phẩy: `user:pass@ip:port`. |
| `ZALO_ZCA_DAEMON_URL` | `http://127.0.0.1:50051` | Không | Địa chỉ gRPC daemon Node.js xử lý Zalo cá nhân (zca-js). |
| `ZALO_APP_ID` | `""` | Có | App ID Zalo Official Account (OA). |
| `ZALO_APP_SECRET` | `""` | Có | App Secret Zalo OA dùng lấy access token & webhook signature. |
| `ZALO_OA_WEBHOOK_SECRET` | `""` | Có | Secret xác thực webhook từ server Zalo OA gửi về. |
| `TELEGRAM_BOT_TOKEN` | `""` | Không | Token Telegram Bot dùng cho hệ thống cảnh báo vận hành. |
| `TELEGRAM_OPS_CHAT_ID` | `""` | Không | Chat ID tiếp nhận thông báo lỗi khẩn cấp (Security/Policy errors). |
| `WHATSAPP_GATEWAY_URL` | `127.0.0.1:50052` | Không | Địa chỉ gRPC gateway kết nối WhatsApp Baileys. |

---

### 2.7 Lưu Trữ Media & Tệp Tin (04-Conversation & Media)

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `STORAGE_PROVIDER` | `local` | Có | Nhà cung cấp lưu trữ: `local`, `s3`, `r2` (Cloudflare). |
| `STORAGE_ENDPOINT` | `""` | Có (R2/S3) | Endpoint S3 tương thích (vd: `https://<account>.r2.cloudflarestorage.com`). |
| `STORAGE_BUCKET` | `omni-media-dev` | Có | Tên bucket lưu trữ hình ảnh, video, âm thanh và file đính kèm. |
| `STORAGE_ACCESS_KEY` | `""` | Có (R2/S3) | Access Key ID kết nối kho lưu trữ Object Storage. |
| `STORAGE_SECRET_KEY` | `""` | Có (R2/S3) | Secret Access Key kết nối kho lưu trữ Object Storage. |
| `STORAGE_PUBLIC_BASE_URL` | `http://localhost:8080/media` | Có | URL công khai (CDN domain) trỏ tới file sau khi tải lên. |

---

### 2.8 Tích Hợp AI & LLM Providers (07-AIAgent & Knowledge)

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `OPENAI_API_KEY` | `""` | Không | API Key kết nối mô hình OpenAI GPT-4o / embeddings. |
| `GEMINI_API_KEY` | `""` | Không | API Key Google Gemini (mô hình dự phòng khi OpenAI gặp lỗi 429). |
| `AI_DEFAULT_PROVIDER` | `gemini` | Không | Provider mặc định: `gemini` hoặc `openai`. |
| `AI_MAX_CONTEXT_TOKENS` | `8192` | Không | Giới hạn context window tránh tràn RAM bộ nhớ đệm hội thoại. |

---

### 2.9 Tự Phục Hồi, Giám Sát & Observability (Sprint 7)

| Tên Biến | Mặc Định (Local) | Bắt Buộc Prod | Mô Tả & Định Dạng |
|---|---|:---:|---|
| `METRICS_PORT` | `9090` | Không | Cổng xuất metrics `/metrics` cho Prometheus scraper. |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD`| `5` | Không | Số lần lỗi liên tiếp để ngắt mạch sang trạng thái `OPEN`. |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_SEC`| `30` | Không | Thời gian mạch ở trạng thái `OPEN` trước khi thử lại `HALF-OPEN`. |
| `DLQ_MAX_RETRIES` | `3` | Không | Số lần tự động retry trước khi đưa task vào `system_outbound_dlq`. |

---

## 3. Mẫu File Môi Trường Cho Local Development (`.env.example`)

```bash
# Server & Logging
ENV=development
PORT=8080
WS_PORT=8081
LOG_LEVEL=debug
LOG_FORMAT=json

# Databases & Infrastructure
DATABASE_URL=postgres://omni_user:omni_pass@localhost:5432/omni_db?sslmode=disable
REDIS_URL=redis://localhost:6379/0
NSQD_TCP_URL=127.0.0.1:4150
NSQLOOKUPD_HTTP_URL=127.0.0.1:4161

# Security & Tokens
JWT_SECRET=super-secret-development-key-change-me-in-production-12345
INTERNAL_API_KEY=dev-internal-key-67890

# Media Storage (Local Mock)
STORAGE_PROVIDER=local
STORAGE_BUCKET=omni-media-dev
STORAGE_PUBLIC_BASE_URL=http://localhost:8080/media

# Observability
METRICS_PORT=9090
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
DLQ_MAX_RETRIES=3
```
