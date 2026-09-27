# Omni Core Architecture Documentation

Hệ thống tài liệu kiến trúc kỹ thuật của nền tảng **Omni Core** (Go Backend Clean DDD + Connect-RPC).

---

## Cấu Trúc Tài Liệu Tinh Gọn (4 Tài Liệu Chuẩn Hóa Duy Nhất)

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

### 4. [ZALOCRM-FUNCTIONAL-CATALOG.md](./ZALOCRM-FUNCTIONAL-CATALOG.md) (Tham Chiếu Nghiệp Vụ ZaloCRM)
- Danh mục tra cứu 792 API endpoints và 27 background workers của hệ thống cũ.
