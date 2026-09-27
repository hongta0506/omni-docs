# [Kế Hoạch Kiến Trúc] Tích Hợp WhatsApp Gateway Qua gRPC & whatsmeow (Issue #59)

## 1. Bối cảnh & Mục tiêu
- Tích hợp kênh WhatsApp vào hệ thống `omni-core` dựa trên thư viện Go thuần `go.mau.fi/whatsmeow`.
- Thay thế hoàn toàn cơ chế HTTP Webhook đơn tuyến bằng hợp đồng gRPC chuẩn hóa: `ChannelGatewayService` (`api/proto/channel/v1/gateway.proto`).
- Hỗ trợ đầy đủ:
  1. **Đồng bộ lịch sử & Inbound Events**: gRPC Server-streaming `StreamChannelEvents` đẩy realtime tin nhắn nhận được (`MessageReceivedEvent`), tin nhắn lịch sử (`HistorySyncEvent`), trạng thái session (`SessionStatusEvent`), mã QR quét pairing (`QRStatusEvent`).
  2. **Gửi tin nhắn đi (Outbound)**: Unary gRPC `SendMessage` hỗ trợ text và file đính kèm đa phương tiện (`AttachmentKind`).
  3. **Lấy mã QR kết nối (Pairing)**: `GetLoginQR`.
  4. **Tải & giải mã media**: Tự động giải mã file đa phương tiện từ CDN WhatsApp bằng mediaKey / SHA256.

## 2. Ranh giới Bounded Context & Layer
- **Contract Boundary**: Mở rộng `gateway.proto` bổ sung `HistorySyncEvent` (hỗ trợ sync hàng loạt tin nhắn lịch sử) và `DownloadMedia` RPC.
- **Channel BC Adapter (`internal/channel/infrastructure/whatsapp/`)**:
  - `GRPCClient`: Hiện thực `ChannelProviderClient`, kết nối gRPC Client tới `whatsapp-gateway` daemon.
  - `EventSubscriber`: Lắng nghe stream `StreamChannelEvents`, ánh xạ và dispatch vào `InboundEventForwarder` trong Go Core.
- **Sidecar Daemon (`gateways/whatsapp/`)**:
  - Ứng dụng Go độc lập dùng `whatsmeow` + SQLite / Postgres session storage.
  - Hiện thực gRPC Server cho `ChannelGatewayService`.

## 3. Quy trình thực hiện (Ordered Checklist)
- [ ] **Bước 1**: Cập nhật hợp đồng `api/proto/channel/v1/gateway.proto` (thêm payload đồng bộ lịch sử tin nhắn `history_sync`).
- [ ] **Bước 2**: Chạy `buf generate` cập nhật Go gRPC stubs.
- [ ] **Bước 3**: Xây dựng gRPC Client adapter trong `internal/channel/infrastructure/whatsapp/grpc_client.go`.
- [ ] **Bước 4**: Xây dựng service streaming subscriber trong `internal/channel/infrastructure/whatsapp/event_subscriber.go`.
- [ ] **Bước 5**: Xây dựng mã nguồn hoàn chỉnh WhatsApp Gateway Sidecar tại `gateways/whatsapp/` (main.go, server.go, store.go, Dockerfile).
- [ ] **Bước 6**: Wire các thành phần vào `cmd/server/main.go` và kiểm tra toàn diện với unit/integration tests qua Docker.
