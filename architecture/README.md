# Omni Core Architecture Documentation

Hệ thống tài liệu kiến trúc kỹ thuật của nền tảng **Omni Core** (Go Backend Clean DDD + Connect-RPC).

---

## Cấu Trúc Tài Liệu Chuẩn Hóa

### 1. [MASTER-ARCHITECTURE-BLUEPRINT.md](./MASTER-ARCHITECTURE-BLUEPRINT.md) (Tài liệu gốc toàn diện)
Hợp nhất toàn bộ thiết kế kiến trúc và bản đồ chuyển đổi:
- **Bản đồ 8 Bounded Contexts & 615 Endpoints**: Danh mục đối chiếu chi tiết giữa giao diện `omni-web`, hệ thống tiền nhiệm ZaloCRM và các entity Go DDD.
- **Quy chuẩn thiết kế Clean Architecture & Sub-module Directory Layout**: Cấu trúc 4 tầng chuẩn hóa (`domain/`, `application/`, `infrastructure/`, `interfaces/`) và phân bổ sub-domain.
- **Kiến trúc Đa Giao Thức (Multi-Protocol Delivery)**: Phục vụ đồng thời Connect-RPC (gRPC/HTTP2), RESTful HTTP (ServeMux Go 1.22+) và SSE/WebSocket.
- **Chiến Lược Lưu Trữ & ORM**: PostgreSQL kết hợp Bun ORM, Transactional Outbox pattern cho Domain Events.
- **Ma trận Phân Quyền RBAC & UI Permissions**: Kiểm soát truy cập đa vai trò.
- **Audit Hiện Trạng Hệ Thống Cũ**: Khảo sát hiện trạng và kế hoạch thay thế.

### 2. [NEXTGEN-GOLANG-DDD-SPEC.md](./NEXTGEN-GOLANG-DDD-SPEC.md) (Quy Chuẩn Code Golang DDD)
- Nguyên tắc DDD thuần khiết: Zero external dependencies trong domain layer.
- `ValidatedAggregate` pattern bảo vệ invariants.
- CQRS commands/queries trong application layer.

### 3. [CHANNEL-GATEWAYS-ARCHITECTURE.md](./CHANNEL-GATEWAYS-ARCHITECTURE.md) (Tích Hợp Kênh Đa Kênh)
- Kiến trúc tích hợp Zalo Dual-Channel (Zalo OA chính thức vs Zalo cá nhân zca-js daemon).
- WhatsApp Gateway (gRPC service / Baileys).
- Telegram MTProto & Inbound Event Forwarder / Outbound Message Router.
- Quản lý Pool Proxy Egress và chống rate-limit.

### 4. [MODULAR-MONOLITH-TO-MICROSERVICES.md](./MODULAR-MONOLITH-TO-MICROSERVICES.md) (Chiến Lược Phân Rã Microservices)
- Đánh giá hiện trạng Modular Monolith và độ sẵn sàng phân rã (90% Microservice-ready).
- Điều kiện kích hoạt việc phân rã theo tải I/O (Channel) hoặc CPU/Memory (AIAgent).
- Kỹ thuật tách Database-per-Service, Connect-RPC client, NSQ Event Broker và Outbox per service.
- Quy trình 4 bước bốc một Bounded Context thành Microservice độc lập.

### 5. [ZALOCRM-FUNCTIONAL-CATALOG.md](./ZALOCRM-FUNCTIONAL-CATALOG.md) (Tham Chiếu Nghiệp Vụ ZaloCRM)
- Danh mục tra cứu 792 API endpoints và 27 background workers của hệ thống cũ.

### 6. [GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md](./GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md) (Quy Chuẩn Hiệu Năng & Chống Anti-Patterns Go DDD)
- Ngăn chặn 5 cạm bẫy thực chiến: Rò rỉ Memory/GC, Phình to kiến trúc, N+1 Query & Aggregate quá tải, Vòng đời Concurrency/Context, Tư duy Java/C# trong Go.
- Chiến lược Pragmatic CQRS: Read model chiếu thẳng DTO không re-hydrate Aggregate.
- Checklist kiểm tra bắt buộc cho mọi AI Coding Agent trước khi mở PR.

### 7. [CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md](./CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md) (Quản Trị Lỗi, Ngoại Lệ & Khả Năng Phục Hồi)
- Chuẩn hóa Exception Taxonomy toàn hệ thống (Transient, Terminal, Security/Policy).
- Ma trận mã lỗi và chiến lược tự chữa lành cho toàn bộ 8 Bounded Contexts.
- Cơ chế Exponential Backoff with Jitter, Sliding Window Circuit Breaker, và Dead Letter Queue (DLQ).
- Quy chuẩn 3 lớp Observability: Metric Prometheus, Structured JSON stream ra stdout cho Grafana Loki, và lưu DB PostgreSQL cho nút Redrive trên giao diện Web.

### 8. [PROTOBUF-CONNECT-RPC-SPEC.md](./PROTOBUF-CONNECT-RPC-SPEC.md) (Quy Chuẩn Protobuf & Connect-RPC)
- Chuẩn hóa quy trình thiết kế Protobuf schema cho 8 Bounded Contexts.
- Cấu hình công cụ Buf CLI (`buf.yaml`, `buf.gen.yaml`), linting và breaking change prevention.
- Cơ chế sinh mã tự động cho Go và Connect-RPC client/server.
- Quy chuẩn ánh xạ mã lỗi giữa domain `pkg/errors` và `connect.Code`.


