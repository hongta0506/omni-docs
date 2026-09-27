# Omni Core Architecture Documentation

Hệ thống tài liệu kiến trúc kỹ thuật của nền tảng **Omni Core** (Go Backend Clean DDD + Connect-RPC).

---

## Danh Mục Tài Liệu Kiến Trúc Chuẩn Hóa

### 1. Kiến Trúc Cốt Lõi & Bounded Contexts
- **[FULL-600-ENDPOINTS-BUSINESS-BLUEPRINT-AND-MIGRATION-MATRIX.md](./FULL-600-ENDPOINTS-BUSINESS-BLUEPRINT-AND-MIGRATION-MATRIX.md)**  
  *Master Blueprint*: Ánh xạ toàn bộ 615 endpoints từ giao diện `omni-web` và 442 endpoints kế thừa từ ZaloCRM sang 8 Bounded Contexts chuẩn Go DDD.
- **[FULL-615-ENDPOINTS-DDD-ARCHITECTURE.md](./FULL-615-ENDPOINTS-DDD-ARCHITECTURE.md)**  
  *Context Map & Submodule Layout*: Đặc tả phân tầng 4 lớp (`domain/`, `application/`, `infrastructure/`, `interfaces/`), quy tắc sub-module directory layout và phân công Sprint.
- **[NEXTGEN-GOLANG-DDD-SPEC.md](./NEXTGEN-GOLANG-DDD-SPEC.md)**  
  *Technical Specification*: Quy chuẩn Clean Architecture, ValidatedAggregate Pattern, Connect-RPC Protobuf, Transactional Outbox và Bun ORM.

### 2. Tích Hợp Kênh & Đa Giao Thức (Channel Gateways & Protocols)
- **[CHANNEL-GATEWAYS-ARCHITECTURE.md](./CHANNEL-GATEWAYS-ARCHITECTURE.md)**  
  *Unified Channel Gateways*: Kiến trúc Hexagonal tích hợp Zalo Dual-Channel (Official OA vs Personal zca-js daemon), WhatsApp Gateway (gRPC), Telegram MTProto và Egress Proxy pool.
- **[MULTI-PROTOCOL-DELIVERY-ARCHITECTURE.md](./MULTI-PROTOCOL-DELIVERY-ARCHITECTURE.md)**  
  *Multi-Protocol Serving*: Cơ chế phục vụ đồng thời 3 giao thức trên Go ServeMux (Go 1.22+): RESTful API, Connect-RPC (HTTP/2) và Realtime SSE/WebSocket.

### 3. Lưu Trữ & Phân Quyền (Storage & Security)
- **[STORAGE-STRATEGY-AND-ORM.md](./STORAGE-STRATEGY-AND-ORM.md)**  
  *ADR Storage*: Quyết định kiến trúc lựa chọn PostgreSQL (Bun ORM) cho quan hệ CRM nghiệp vụ, phân tầng lưu trữ tin nhắn lịch sử và Transactional Outbox.
- **[RBAC-UI-PERMISSION-MATRIX.md](./RBAC-UI-PERMISSION-MATRIX.md)**  
  *Security & Permissions*: Ma trận phân quyền RBAC đa cấp (Super Admin, Admin, Manager, Sale) trên giao diện `omni-web` và Go Middleware.

### 4. Tài Liệu Tham Chiếu Hệ Thống Tiền Nhiệm (Reference Catalog)
- **[CURRENT-ARCHITECTURE-AUDIT.md](./CURRENT-ARCHITECTURE-AUDIT.md)**: Khảo sát hiện trạng hệ thống cũ.
- **[ZALOCRM-FUNCTIONAL-CATALOG.md](./ZALOCRM-FUNCTIONAL-CATALOG.md)**: Danh mục toàn bộ 442 API endpoints và 13 workers của ZaloCRM làm tham chiếu nghiệp vụ.
