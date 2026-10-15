# Facebook Personal Gateway Specification (fbchat-muqit Python Daemon & gRPC Bridge)

> **ĐẶC TẢ KIẾN TRÚC CỔNG FACEBOOK MESSENGER CÁ NHÂN (UNOFFICIAL PERSONAL CLIENT)**  
> **Mã tài liệu:** `SPEC-CHANNEL-FB-001`  
> **Bounded Context:** `internal/channel` (BC 2 — Channel & Gateway)  
> **Engine cốt lõi:** Thư viện Python không đồng bộ [`fbchat-muqit`](https://fbchat-muqit.readthedocs.io/en/latest/) (v1.2.2+)  
> **Cơ chế giao tiếp liên tiến trình:** Hai chiều (Bidirectional) qua gRPC / Connect-RPC (`ChannelGatewayService` & `FacebookPersonalGatewayService`)  
> **Trạng thái:** DRAFT / PROPOSED ARCHITECTURE  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, code, schema, Protobuf giữ nguyên Tiếng Anh).

---

## 1. Bối Cảnh & Mục Tiêu Nghiệp Vụ (Context & Goals)

Hệ thống Omni Platform đã tích hợp thành công 3 kênh cá nhân (Unofficial Personal) gồm Zalo Personal (`zcago`), Telegram Personal (`gotd`), WhatsApp Personal (`whatsmeow`). Tuy nhiên, kênh **Facebook Messenger cá nhân** (Profile Facebook của nhân viên sales / tư vấn viên) đang thiếu giải pháp tự động hóa:

1. **Khác biệt cốt lõi giữa Facebook Page (Official) và Facebook Profile (Personal):**
   - **Facebook Page (Official Graph API):** Chỉ nhận/gửi tin nhắn dưới danh nghĩa Fanpage doanh nghiệp, tuân thủ cửa sổ phản hồi 24h của Meta, không thể nhắn tin từ tài khoản Facebook cá nhân của nhân viên hay tham gia vào Group chat cá nhân.
   - **Facebook Profile (Unofficial Personal via `fbchat-muqit`):** Hoạt động dưới danh nghĩa tài khoản cá nhân thật (`c_user`), tự do nhắn tin 1-1, tham gia Group chat Messenger, gửi file/ảnh/video, thả cảm xúc (reactions), gửi sticker và sync toàn bộ hội thoại về giao diện `omni-web` tập trung.
2. **Tại sao sử dụng `fbchat-muqit`:**
   - Thư viện Python mã nguồn mở hiện đại, kế thừa và tối ưu hóa từ `fbchat` cổ điển, xây dựng hoàn toàn trên nền tảng `asyncio` không đồng bộ.
   - Hỗ trợ đầy đủ Event-driven: `on_message`, `on_reaction`, `on_typing`, `on_read`, `on_delivered`, `on_friend_request`.
   - Cơ chế xác thực thông qua Session Cookies JSON (`c_user`, `xs`, `fr`, `datr`), đánh lừa máy chủ Facebook giả lập trình duyệt hợp lệ.
3. **Cơ chế kiến trúc gRPC Sidecar:**
   - Do `fbchat-muqit` viết bằng Python (`asyncio`), không thể nhúng in-process trực tiếp vào Go (`omni-core`) như Go-native libraries (`zcago`, `whatsmeow`, `gotd`).
   - Xây dựng một container sidecar độc lập: **`fb-gateway-daemon`** (Python 3.11+ gRPC Server).
   - `omni-core` (Go) đóng vai trò gRPC Client gọi Unbound RPC sang daemon (gửi tin, upload media, đồng bộ) và lắng nghe Inbound Event Stream (Server-streaming RPC `StreamChannelEvents`) đẩy tin nhắn vào PostgreSQL và Socket.IO Hub.

---

## 2. Kiến Trúc Tổng Thể & Ranh Giới Giao Tiếp (System Architecture)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OMNI CORE (internal/channel)                                   │
│  - Bounded Context: Channel & Gateway                                                            │
│  - Multi-tenant Row-Level Security: tenant_id UUID trên mọi bản ghi                              │
│  - Database: PostgreSQL Bun ORM (channel_accounts, conversations, messages, contacts)             │
│  - Realtime: Socket.IO Hub (chat:message, chat:reactions, channel:status)                         │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    FacebookPersonalGatewayClient (Go gRPC Client Adapter)                 │  │
│  │  - Triển khai interface: ChannelGatewayPort / FacebookGatewayPort                           │  │
│  │  - Kết nối tới daemon qua gRPC (Unix Domain Socket hoặc TCP internal: 50055)              │  │
│  │  - Quản lý vòng đời tài khoản: Connect, Sync, Healthcheck, Disconnect                       │  │
│  │  - Inbound Consumer: Lắng nghe StreamChannelEvents -> lưu DB -> emit WebSocket              │  │
│  └──────────────────────────────────────────────▲─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┼────────────────────────────────────────────────┘
                                                  │
                                                  │ gRPC Mutual TLS / TCP (Protobuf v3)
                                                  │ - Unary: SendMessage, SendMedia, React, Sync...
                                                  │ - Streaming: StreamChannelEvents (Realtime push)
                                                  │
┌─────────────────────────────────────────────────▼────────────────────────────────────────────────┐
│                           FB-GATEWAY-DAEMON (Python 3.11+ asyncio sidecar)                       │
│  - Engine: fbchat-muqit Client pool per Channel Account                                          │
│  - Session Manager: Quản lý active cookies per account_id                                        │
│  - Proxy Manager: Gắn cố định SOCKS5 / HTTP Residential Proxy cho từng account (chống ban)        │
│  - gRPC Server: Triển khai FacebookPersonalService / ChannelGatewayService                       │
│  - Background Event Loop: Lắng nghe MQTT / Long-poll từ Messenger server                        │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                  fbchat_muqit.Client Instances (Tài khoản Facebook cá nhân)                │  │
│  │  - Client(cookies=account_cookies, proxy=account_proxy)                                   │  │
│  │  - @client.event: on_message, on_reaction, on_typing, on_read, on_thread_action            │  │
│  └──────────────────────────────────────────────┬─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┼────────────────────────────────────────────────┘
                                                  │ HTTPS / WSS (MQTT over TLS)
                                                  │ Đi qua Residential Sticky Proxy (SPEC 056)
                                                  ▼
                                      FACEBOOK MESSENGER SERVERS
                                   (*.facebook.com / *.messenger.com)
```

---

## 3. Hợp Đồng Protobuf Chuẩn Hóa (Protobuf gRPC Contract)

Tệp định nghĩa: `api/proto/channel/v1/facebook_personal.proto`

```protobuf
syntax = "proto3";

package channel.v1;

option go_package = "omni-core/gen/go/channel/v1;channelv1";

// Dịch vụ quản lý và gửi tin Facebook Personal
service FacebookPersonalGatewayService {
  // Bắt đầu phiên kết nối với cookies đã lưu
  rpc ConnectAccount(FbConnectRequest) returns (FbConnectResponse);

  // Ngắt phiên kết nối
  rpc DisconnectAccount(FbDisconnectRequest) returns (FbDisconnectResponse);

  // Kiểm tra trạng thái sống của session
  rpc PingSession(FbPingRequest) returns (FbPingResponse);

  // Gửi tin nhắn văn bản (kèm trích dẫn / quote nếu có)
  rpc SendTextMessage(FbSendTextRequest) returns (FbSendMessageResponse);

  // Gửi đa phương tiện (Ảnh, Video, File, Âm thanh)
  rpc SendMediaMessage(FbSendMediaRequest) returns (FbSendMessageResponse);

  // Thả cảm xúc (Reaction) trên tin nhắn
  rpc SendReaction(FbReactionRequest) returns (FbReactionResponse);

  // Thu hồi tin nhắn (Unsend / Revoke)
  rpc UnsendMessage(FbUnsendRequest) returns (FbUnsendResponse);

  // Đánh dấu đã đọc hội thoại
  rpc MarkAsRead(FbMarkReadRequest) returns (FbMarkReadResponse);

  // Báo trạng thái đang gõ (Typing indicator)
  rpc SendTyping(FbTypingRequest) returns (FbTypingResponse);

  // Đồng bộ danh sách bạn bè / người dùng gần đây
  rpc SyncRecentUsers(FbSyncUsersRequest) returns (FbSyncUsersResponse);

  // Server-streaming: Đẩy toàn bộ sự kiện realtime từ Facebook về Core Go
  rpc StreamEvents(FbStreamEventsRequest) returns (stream FbStreamEvent);
}

message FbConnectRequest {
  string account_id = 1;
  string tenant_id = 2;
  string cookies_json = 3;   // JSON cookies [ { "name": "c_user", "value": ... }, ... ]
  string proxy_url = 4;      // socks5://user:pass@host:port (SPEC 056)
}

message FbConnectResponse {
  bool success = 1;
  string uid = 2;            // Facebook Numeric ID (c_user)
  string full_name = 3;
  string avatar_url = 4;
  string error_message = 5;
}

message FbDisconnectRequest {
  string account_id = 1;
}

message FbDisconnectResponse {
  bool success = 1;
}

message FbPingRequest {
  string account_id = 1;
}

message FbPingResponse {
  bool is_active = 1;
  int64 timestamp = 2;
}

message FbSendTextRequest {
  string account_id = 1;
  string thread_id = 2;      // ID người nhận hoặc ID Group Messenger
  bool is_group = 3;
  string text = 4;
  string reply_to_message_id = 5; // ID tin nhắn gốc nếu là quote reply
}

message FbSendMediaRequest {
  string account_id = 1;
  string thread_id = 2;
  bool is_group = 3;
  string media_type = 4;     // "image", "video", "file", "audio"
  string media_url = 5;
  string file_path = 6;      // File path nội bộ container
  string caption = 7;
  string reply_to_message_id = 8;
}

message FbSendMessageResponse {
  bool success = 1;
  string message_id = 2;
  int64 sent_at = 3;
  string error_message = 4;
}

message FbReactionRequest {
  string account_id = 1;
  string thread_id = 2;
  string message_id = 3;
  string reaction = 4;       // "❤️", "👍", "😆", "😮", "😢", "😡" hoặc rỗng để xóa reaction
}

message FbReactionResponse {
  bool success = 1;
}

message FbUnsendRequest {
  string account_id = 1;
  string message_id = 2;
}

message FbUnsendResponse {
  bool success = 1;
}

message FbMarkReadRequest {
  string account_id = 1;
  string thread_id = 2;
}

message FbMarkReadResponse {
  bool success = 1;
}

message FbTypingRequest {
  string account_id = 1;
  string thread_id = 2;
  bool is_typing = 3;
}

message FbTypingResponse {
  bool success = 1;
}

message FbSyncUsersRequest {
  string account_id = 1;
  int32 limit = 2;
}

message FbUserInfo {
  string uid = 1;
  string name = 2;
  string avatar_url = 3;
  bool is_friend = 4;
}

message FbSyncUsersResponse {
  repeated FbUserInfo users = 1;
}

message FbStreamEventsRequest {
  string instance_id = 1;
}

message FbStreamEvent {
  string event_id = 1;
  string account_id = 2;
  int64 timestamp = 3;

  oneof data {
    FbMessageEvent message = 10;
    FbReactionEvent reaction = 11;
    FbUnsendEvent unsend = 12;
    FbTypingEvent typing = 13;
    FbReadReceiptEvent read_receipt = 14;
    FbSessionStatusEvent session_status = 15;
  }
}

message FbMessageEvent {
  string message_id = 1;
  string thread_id = 2;
  bool is_group = 3;
  string sender_id = 4;
  string sender_name = 5;
  string text = 6;
  string reply_to_message_id = 7;
  string quote_text = 8;
  repeated FbAttachment attachments = 9;
}

message FbAttachment {
  string type = 1;           // "image", "video", "file", "audio", "sticker"
  string url = 2;
  string filename = 3;
  int64 size_bytes = 4;
}

message FbReactionEvent {
  string message_id = 1;
  string thread_id = 2;
  string user_id = 3;
  string reaction = 4;       // Icon emoji hoặc rỗng
}

message FbUnsendEvent {
  string message_id = 1;
  string thread_id = 2;
  string user_id = 3;
}

message FbTypingEvent {
  string thread_id = 1;
  string user_id = 2;
  bool is_typing = 3;
}

message FbReadReceiptEvent {
  string thread_id = 1;
  string user_id = 2;
  int64 watermark_timestamp = 3;
}

message FbSessionStatusEvent {
  enum Status {
    ACTIVE = 0;
    EXPIRED = 1;
    CHECKPOINT = 2;
    PROXY_ERROR = 3;
  }
  Status status = 1;
  string reason = 2;
}
```

---

## 4. Đặc Điểm Kỹ Thuật Cần Lưu Ý Của fbchat-muqit (Gotchas & Workarounds)

1. **Rào cản mã hóa đầu cuối E2EE (One-to-One End-to-End Encryption):**
   - *Cảnh báo từ tài liệu chính thức:* Messenger đã triển khai E2EE mặc định cho chat 1-1 giữa các user. `fbchat-muqit` cảnh báo: *"Sending messages User to User on One to one chat is not supported anymore due to Messenger’s end-to-end encryption."*
   - *Giải pháp kiến trúc (Workaround):*
     - Với Group Chats (Nhóm từ 3 người hoặc nhóm quy ước): E2EE không kích hoạt mặc định theo cùng cơ chế, thư viện vẫn hỗ trợ nhận và gửi bình thường.
     - Với Chat 1-1: Hỗ trợ lắng nghe sự kiện nhận tin (Inbound messages/webhook sync); chiều gửi tin (Outbound) cần kết hợp fallback qua mbasic hoặc Graph API/Automated browser nếu tài khoản bị ép E2EE.
2. **Quản lý Session Cookie & Rủi ro Checkpoint:**
   - Facebook thường xuyên quét tài khoản nếu phát hiện thay đổi User-Agent, Fingerprint hoặc IP bất thường.
   - **Bắt buộc gắn Sticky Proxy (Residential Proxy):** Mỗi tài khoản Facebook cá nhân trong `omni-core` khi kết nối bắt buộc phải được gắn 1 IP Proxy cố định (SOCKS5/HTTP) trong cấu hình `channel_accounts.proxy_url`.
   - **Mã hóa Cookie:** Toàn bộ payload Cookie JSON (`c_user`, `xs`, `datr`, `sb`, `fr`) phải được mã hóa AES-GCM-256 trước khi lưu xuống PostgreSQL.
3. **Giới hạn tốc độ (Outbound Jitter Rate Limiter):**
   - Tuyệt đối không gửi tin nhắn dồn dập (Burst = 1).
   - Áp dụng Token Bucket với khoảng nghỉ ngẫu nhiên (Jitter 3s - 7s) giữa các lần gửi tin nhắn liên tiếp qua cùng một tài khoản.

---

## 5. Kế Hoạch Triển Khai WBS (Work Breakdown Structure)

| Giai đoạn | Nhiệm vụ kỹ thuật | Đầu ra (Deliverables) |
|---|---|---|
| **Phase 1: Protobuf & Proto Gen** | Định nghĩa `api/proto/channel/v1/facebook_personal.proto` và biên dịch sang Go (`gen/go/channel/v1`) & Python (`pb2`). | Proto files & generated stubs. |
| **Phase 2: Python Sidecar Daemon** | Xây dựng container `fb-gateway-daemon` sử dụng `fbchat-muqit` + `grpcio` + `asyncio`. Hỗ trợ multi-account client manager. | Dockerfile & Python gRPC Service. |
| **Phase 3: Core Go Adapter** | Xây dựng `internal/channel/infrastructure/facebook/grpc_client.go` kết nối tới daemon, xử lý `StreamEvents` và điều phối outbound. | Go gRPC Adapter & Unit Tests. |
| **Phase 4: Tích hợp Conversation BC** | Bổ sung phân loại kênh `facebook_personal` vào `internal/conversation/interfaces/http/chat_handler.go` (SendMessage, Forward, Recall). | E2E Messaging flow. |
| **Phase 5: UI Onboarding & Quản lý Nick** | Thêm luồng kết nối Facebook Personal bằng Cookie JSON trên `omni-web` và quản lý trạng thái Active/Checkpoint. | Vue 3 UI Wizard. |

---

## 6. Tiêu Chuẩn Kiểm Thử & Nghiệm Thu (Acceptance Criteria)

- [ ] Daemon Python khởi chạy độc lập trong Docker container, expose cổng gRPC 50055.
- [ ] Xác thực thành công tài khoản Facebook từ cookie JSON, trả về thông tin UID, họ tên, avatar.
- [ ] Gửi và nhận tin nhắn văn bản, ảnh, emoji reactions giữa `omni-web` và Facebook Messenger.
- [ ] Tự động ngắt kết nối và bắn event cảnh báo `SESSION_EXPIRED` / `CHECKPOINT` khi cookie bị Facebook thu hồi.
- [ ] Tích hợp đầy đủ logging cấu trúc `pkg/logger` và phân loại lỗi `pkg/errors`.
