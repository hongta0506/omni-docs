# Hướng Dẫn Phân Rã Modular Monolith Sang Microservices (Omni Core)

> Tài liệu hướng dẫn kỹ thuật chi tiết quy trình, nguyên tắc và các bước phân tách hệ thống **Omni Core** từ kiến trúc **Modular Monolith** hiện tại sang **Microservices** phân tán độc lập khi có nhu cầu mở rộng quy mô.

---

## 1. Hiện Trạng & Đánh Giá Khả Năng Tách (Readiness Assessment)

Hệ thống Omni Core hiện tại được thiết kế theo mô hình **Modular Monolith** tuân thủ triệt để Domain-Driven Design (DDD) 4 tầng và Clean Architecture.

| Tiêu Chí | Trạng Thái Hiện Tại | Độ Khó Khi Tách Microservices |
|---|---|:---:|
| **Ranh giới Domain (Domain Boundary)** | Tách biệt hoàn toàn thành 8 Bounded Contexts trong `internal/<bc>/`. Không có model domain dùng chung. | **Rất Dễ (1/5)** |
| **Giao diện RPC (Connect-RPC)** | Đã định nghĩa Protobuf và triển khai Connect-RPC server (`interfaces/grpc/`) sẵn cho từng BC. | **Rất Dễ (1/5)** |
| **Bất đồng bộ (Async Messaging)** | Đã tích hợp Message Broker (NSQ) và Transactional Outbox pattern (`pkg/nsq`, `pkg/events`). | **Dễ (2/5)** |
| **Cơ sở dữ liệu (Database)** | Đang dùng chung 1 DB PostgreSQL, 1 instance Bun DB. Chưa tách DB per service. | **Trung Bình (3/5)** |
| **Mã nguồn dùng chung (Shared Code)** | Đang nằm chung trong repo tại `pkg/` và `internal/shared/`. | **Dễ (2/5)** |

> **Kết luận**: Mức độ sẵn sàng phân rã đạt **90%**. Việc tách bất kỳ Bounded Context nào thành Microservice độc lập có thể hoàn tất trong 1-2 ngày làm việc mà không cần viết lại nghiệp vụ cốt lõi.

---

## 2. Chiến Lược Phân Rã: Khi Nào Nên Tách?

Tuân thủ nguyên tắc **"MonolithFirst"** & **"Lazy Senior"**:
- **Giai đoạn hiện tại (Tối ưu phát triển)**: Duy trì **Modular Monolith** (1 process Go duy nhất `cmd/server/main.go`, 1 DB). Lợi ích: zero network latency, deploy 1 container nhẹ (<50MB), dễ debug trace lỗi, chi phí hạ tầng tối thiểu.
- **Khi nào kích hoạt việc tách thành Microservice độc lập?**
  1. **Nghẽn tải I/O & Socket (Channel & Gateway BC)**: Khi số lượng tài khoản Zalo, Telegram kết nối đồng thời vượt ngưỡng hàng nghìn socket/webhook, cần tách `internal/channel` ra cụm máy chủ riêng biệt có IP pool và proxy egress độc lập.
  2. **Tải xử lý CPU/Memory cao (AI Agent & RAG BC)**: Khi nghiệp vụ vector search, chunking và gọi LLM stream cần scale container độc lập không làm ảnh hưởng đến luồng chat cốt lõi.
  3. **Chu kỳ phát hành độc lập theo Team (Team Topology)**: Khi team phụ trách `Deal & E-commerce` hoặc `Marketing` cần CI/CD release liên tục độc lập với team hạ tầng kênh.

---

## 3. Các Ràng Buộc Cần Gỡ Bỏ (Decoupling Checklist)

Để chuyển một Bounded Context từ module nội bộ thành Microservice độc lập, cần gỡ bỏ 4 điểm phụ thuộc sau:

### 3.1 Tách Cơ Sở Dữ Liệu (Database-per-Service)
- **Hiện tại**: Toàn bộ Bounded Contexts kết nối chung qua một instance Bun ORM DB trong `cmd/server/main.go`.
- **Khi tách**:
  - Mỗi service sở hữu cơ sở dữ liệu riêng (Postgres instance riêng hoặc Schema riêng biệt: `identity_db`, `channel_db`, `customer_db`).
  - **Cấm Foreign Key liên context**: Mọi liên kết chéo (ví dụ: `ContactID` trong Conversation, `DealID` trong Quote) chỉ lưu dưới dạng giá trị thô (`uuid.UUID`), không tạo foreign key constraint giữa 2 database.
  - Mỗi service có bảng `outbox_events` riêng để ghi nhận Domain Events cục bộ trong cùng transaction của service đó.

### 3.2 Chuẩn Hóa Giao Tiếp Liên Dịch Vụ (Cross-Service Communication)
Tuyệt đối loại bỏ mọi import Go chéo giữa các Bounded Context (ví dụ: `channel` không được import trực tiếp package của `conversation`):

```
┌─────────────────────────┐                                 ┌─────────────────────────┐
│     Channel Service     │                                 │  Conversation Service   │
│                         │                                 │                         │
│  [Inbound Webhook]      │──── Connect-RPC (Đồng bộ) ─────►│  [ReceiveInboundMessage]│
│                         │                                 │                         │
│  [AccountStatusChanged] │──── NSQ Message Broker (Async) ─►│  [Event Subscriber]     │
└─────────────────────────┘                                 └─────────────────────────┘
```

1. **Đồng bộ (Synchronous — High Performance RPC)**:
   - Gọi trực tiếp qua **Connect-RPC client** (`http.Client` chuẩn HTTP/2) sử dụng code sinh từ Protobuf schema (`gen/go/<bc>/v1/`).
   - Service gọi khởi tạo client trỏ đến địa chỉ DNS/Service Discovery của service đích (ví dụ: `http://conversation-service:8080`).
2. **Bất đồng bộ (Asynchronous — Event-Driven)**:
   - Service nguồn ghi Domain Event vào Transactional Outbox nội bộ.
   - Outbox Relayer đẩy event lên topic NSQ (`events.<bc_name>.<event_name>`).
   - Service đích đăng ký NSQ consumer để lắng nghe và xử lý sự kiện phản ứng.

### 3.3 Đóng Gói Shared Kernel (`pkg/`)
Khi tách thành multi-repo hoặc monorepo multi-services:
- Các package generic kỹ thuật trong `pkg/`:
  - `pkg/context`: Khai báo và trích xuất `TenantID`, `UserID`, `TraceID`.
  - `pkg/pagination`: Generic `PaginationParam`, `PageResult[T]`.
  - `pkg/errors`: Mã lỗi hệ thống và error mapper.
  - `pkg/logger`: Zap structured logger.
  - `pkg/nsq`: Wrapper producer/consumer.
- **Giải pháp đóng gói**:
  - *Phương án Monorepo (Khuyến nghị)*: Giữ nguyên cấu trúc monorepo Go, mỗi service là một binary trong `cmd/<service_name>/`, tất cả cùng import `omni-core/pkg/...`.
  - *Phương án Polyrepo*: Tách `pkg/` thành Go module riêng (`github.com/admatrix/omni-pkg`) và `go get` vào từng service.

### 3.4 Khởi Tạo Entrypoint Độc Lập (`cmd/<service>/main.go`)
- Thay thế file `cmd/server/main.go` tổng hợp bằng các entrypoint riêng:
  - `cmd/identity/main.go`
  - `cmd/channel/main.go`
  - `cmd/customer/main.go`
  - `cmd/conversation/main.go`
  - `cmd/deal/main.go`
  - `cmd/marketing/main.go`
  - `cmd/aiagent/main.go`
  - `cmd/serviceapi/main.go`
- Mỗi entrypoint chỉ khởi tạo pool DB riêng, cấu hình biến môi trường riêng, đăng ký RPC server và HTTP router của chính context đó.

---

## 4. Quy Trình 4 Bước Tách Một Bounded Context (Step-by-Step Runbook)

Giả sử cần tách **Channel Bounded Context** (`internal/channel`) thành Microservice độc lập:

### Bước 1: Khóa Contract Protobuf & Dọn Dẹp Import Chéo
1. Kiểm tra toàn bộ Protobuf service của context tại `api/proto/channel/v1/`. Đảm bảo đã có đầy đủ RPC methods cho các chức năng mà context khác cần gọi.
2. Kiểm tra mã nguồn `internal/channel`: Xóa bỏ mọi import trỏ đến các BC khác. Thay thế bằng interface client (Connect-RPC client hoặc NSQ producer).

### Bước 2: Tách DB Schema & Migration
1. Trích xuất các bảng dữ liệu của Channel từ `deploy/postgres/` thành migration script riêng của Channel:
   - `channel_accounts`, `zalo_accounts`, `telegram_sessions`, `whatsapp_configs`, `account_folders`.
   - Bảng `channel_outbox_events`.
2. Đảm bảo không còn bất kỳ câu lệnh SQL join nào trỏ sang bảng của context khác.

### Bước 3: Tạo File Bootstrap & Dockerfile Riêng
1. Tạo thư mục `cmd/channel/main.go`:
   ```go
   package main

   func main() {
       cfg := loadChannelConfig()
       db := initChannelPostgres(cfg.DatabaseURL)
       nsqProducer := initNSQ(cfg.NSQAddress)

       // Khởi tạo Channel Application & Repositories
       app := channelapp.New(db, nsqProducer)

       // Khởi tạo Connect-RPC Server & HTTP Gateway
       server := channelgrpc.NewServer(app)
       httpMux := channelhttp.NewRouter(app)

       startHTTPServer(cfg.Port, httpMux, server)
   }
   ```
2. Tạo `deploy/docker/Dockerfile.channel`:
   - Multi-stage build Go tối giản, xuất ra alpine/scratch container chứa duy nhất binary `channel-service`.

### Bước 4: Chuyển Đổi Điểm Gọi Từ Hệ Thống Sang Remote RPC
1. Tại các context còn lại cần giao tiếp với Channel (ví dụ: `cmd/server` hoặc API Gateway):
   - Thay thế việc gọi trực tiếp interface bộ nhớ bằng việc khởi tạo Connect-RPC client trỏ đến endpoint mạng của `channel-service` (ví dụ `http://channel-service.internal:8081`).
2. Cấu hình định tuyến reverse proxy (Traefik / Nginx / Envoy Gateway) điều hướng prefix route `/api/v1/zalo-*`, `/api/v1/channel-*` sang container mới.

---

## 5. Bảng Đối Soát Cấu Hình Hạ Tầng Khi Triển Khai Microservices

| Dịch Vụ | Cổng Gốc HTTP / RPC | Cơ Sở Dữ Liệu Riêng | Queue Topic Đăng Ký |
|---|:---:|---|---|
| **Identity Service** | `:8081` | `identity_db` | `events.identity.*` |
| **Channel Service** | `:8082` | `channel_db` | `events.channel.*`, `events.conversation.send` |
| **Customer Service** | `:8083` | `customer_db` | `events.customer.*`, `events.channel.sync` |
| **Conversation Service** | `:8084` | `conversation_db` | `events.conversation.*`, `events.channel.inbound` |
| **Deal Service** | `:8085` | `deal_db` | `events.deal.*`, `events.customer.contact_created` |
| **Marketing Service** | `:8086` | `marketing_db` | `events.marketing.*`, `events.deal.won` |
| **AIAgent Service** | `:8087` | `aiagent_db` (pgvector) | `events.aiagent.*`, `events.conversation.message` |
| **Service API Gateway** | `:8088` | `serviceapi_db` | `events.serviceapi.*` |

---

## 6. Lời Khuyên Kiến Trúc (Architecture Recommendation)

1. **Không phân rã sớm (Premature Decomposition)**: Tiếp tục hoàn thiện 100% nghiệp vụ 8 Bounded Contexts trong mô hình Modular Monolith hiện tại cho đến khi hệ thống vận hành trơn tru trên Production.
2. **Kỷ luật DDD là chìa khóa**: Chỉ cần giữ nghiêm ngặt nguyên tắc **CẤM IMPORT CHÉO DOMAIN/APPLICATION**, thì toàn bộ hệ thống luôn ở trạng thái "Microservice-ready" mà không tốn chi phí vận hành distributed systems phức tạp.
