# Telegram Personal Gateway Specification (gotd/td MTProto Daemon)

> **ĐẶC TẢ KIẾN TRÚC CỔNG TELEGRAM CÁ NHÂN TỰ HOST (UNOFFICIAL MTPROTO GATEWAY)**  
> **Mã tài liệu:** `SPEC-CHANNEL-TG-001`  
> **Bounded Context:** `internal/channel` (BC 2 — Channel & Gateway)  
> **Container:** `telegram-gateway` (Daemon Go thuần độc lập, kết nối `omni-core` qua Connect-RPC/gRPC)  
> **Trạng thái:** APPROVED / READY FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ code, API, struct, Protobuf giữ nguyên Tiếng Anh).

---

## 1. Bối Cảnh & Mục Tiêu Nghiệp Vụ (Context & Goals)

Hệ thống Omni Platform cần mở rộng kết nối tài khoản **Telegram cá nhân (Personal / User Account)** cho nhân viên kinh doanh:
1. **Thu Lead Tự Động (Inbound Realtime):** Lắng nghe realtime các tin nhắn người dùng gửi tới nick cá nhân hoặc tin nhắn trong các Group thảo luận để tự động trích xuất thành **Lead mới** vào Lead Pool của CRM (`contacts.status = 'lead'`).
2. **Kịch Bản Nuôi Dưỡng Lead 1-1 (Low-frequency Sequence & Lead Nurturing):** Điều phối tin nhắn trả lời và kịch bản nuôi dưỡng lead với tần suất an toàn, có nhịp trễ Jitter (3s - 7s), chống checkpoint tài khoản.
3. **Đăng Nhập QR Code Native:** Nhân viên quét mã QR trực tiếp trên app Telegram điện thoại (`Settings` -> `Devices` -> `Link Desktop Device`), không cần nhập OTP thủ công qua SMS.
4. **Tự Chủ Hạ Tầng (Zero SaaS Cost):** Tự host 100% bằng thư viện Go thuần [`gotd/td`](https://github.com/gotd/td), không phụ thuộc bên thứ 3 và không tốn phí thuê bao hàng tháng.

---

## 2. Kiến Trúc Tổng Thể & Ranh Giới Daemon (System Architecture)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           OMNI CORE (internal/channel)                         │
│  - Bounded Context: Channel & Gateway                                          │
│  - Hợp đồng Outbound Port: ChannelAccountPort, OutboundMessageRouter          │
│  - Inbound Router: InboundEventForwarder (chuyển tin sang Conversation BC)     │
│  - Quản lý Egress Proxy Pool (SPEC 056): Cấp phát SOCKS5 riêng per-nick       │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
                      gRPC / Connect-RPC (Streaming & Unary)
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│              TELEGRAM GATEWAY DAEMON (Container: telegram-gateway)             │
│                                                                                │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────┐ │
│  │ QR Login Engine       │  │ Session Store         │  │ Safety Throttle    │ │
│  │ (auth/qrlogin)        │  │ (Postgres/Encrypted)  │  │ (Jitter 3s-7s)     │ │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │                     MTProto Client Manager (gotd/td)                     │ │
│  │  - Client Instance per Channel Account                                   │ │
│  │  - Updates Manager (Realtime Push Listener via TCP Socket)               │ │
│  │  - Proxy SOCKS5 Egress Emitter                                           │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │ MTProto Binary (TCP / TLS Port 443)
                                       │ Đi qua Residential Proxy SOCKS5
                                       ▼
                     TELEGRAM SERVERS (DC 1 - 5 Cluster)
```

---

## 3. Sơ Đồ Luồng Hoạt Động (Flow Diagrams)

### 3.1 Luồng 1: Đăng Nhập Tài Khoản Bằng Quét Mã QR (QR Login Flow)

```
[Sale / Frontend]          [Omni Core]             [TG Gateway Daemon]         [Telegram DC]
       │                         │                          │                        │
       │─── 1. Bấm Kết nối TG ──►│                          │                        │
       │                         │─── 2. StartQRLogin ─────►│                        │
       │                         │    (account_id, proxy)   │─── 3. auth.ExportLoginToken
       │                         │                          │◄─── Token URL tg://... │
       │                         │◄── 4. QR Image (Base64) ─│                        │
       │◄── 5. Render QR Code ───│                          │                        │
       │                         │                          │                        │
   [Quét App TG]                 │                          │                        │
       │────────────────────────────────────────────────────────────────────────────►│
       │                         │                          │◄── 6. Push Login Accept│
       │                         │                          │    (Updates auth ok)   │
       │                         │◄── 7. LoginSuccess ──────│                        │
       │                         │    (session_string, user)│                        │
       │                         │    [Lưu DB Encrypted]    │                        │
       │◄── 8. Status: CONNECTED │                          │                        │
```

---

### 3.2 Luồng 2: Nhận Tin Nhắn Realtime & Tự Động Thu Lead (Inbound Realtime & Lead Harvest)

```
[User / Lead TG]           [Telegram DC]        [TG Gateway Daemon]      [Omni Core (Channel/Customer)]
       │                         │                       │                         │
       │─── Gửi tin nhắn ───────►│                       │                         │
       │                         │─── Push tg.Updates ──►│                         │
       │                         │    (TCP Socket 24/7)  │                         │
       │                         │                       │─── Forward Inbound ────►│
       │                         │                       │    (gRPC Stream / Event)│
       │                         │                       │                         ├── 1. Ghi tin nhắn DB
       │                         │                       │                         ├── 2. Bắn Takeover WS Hub
       │                         │                       │                         │      (Web chat tức thì)
       │                         │                       │                         └── 3. Check Lead Pool:
       │                         │                       │                                Chưa có -> Nạp Lead mới (contacts.status='lead')
```

---

### 3.3 Luồng 3: Gửi Tin An Toàn, Giãn Cách & Kịch Bản Chăm Sóc (Outbound & Safety Jitter)

```
[Marketing Worker / Sale]       [Omni Core]             [TG Gateway Daemon]         [Telegram DC]
           │                         │                          │                        │
           │─── 1. Dispatch Msg ────►│                          │                        │
           │                         │─── 2. SendMessageRPC ───►│                        │
           │                         │                          ├── 3. Rate Limit Check: │
           │                         │                          │      Lead mới (chưa chat 2 chiều): <25/day │
           │                         │                          │      Lead đã tương tác: No cap  │
           │                         │                          ├── 4. Apply Jitter:     │
           │                         │                          │      Sleep 3s - 7s     │
           │                         │                          │─── 5. messages.Send ──►│
           │                         │◄── 6. Message Sent ACK ──│◄─── Msg ID: 123456 ────│
           │◄── 7. Status: DELIVERED─│                          │                        │
```

---

## 4. Đặc Tả Giao Diện API & Hợp Đồng Protobuf (Protobuf Contracts)

### 4.1 File Contract: `proto/omni/channel/v1/telegram_personal.proto`

```protobuf
syntax = "proto3";

package omni.channel.v1;

option go_package = "omni-core/gen/proto/omni/channel/v1;channelv1";

service TelegramPersonalService {
  // 1. Quản lý phiên và đăng nhập
  rpc StartQRLogin(StartQRLoginRequest) returns (stream QRLoginEvent);
  rpc DisconnectAccount(DisconnectAccountRequest) returns (DisconnectAccountResponse);
  rpc GetAccountHealth(GetAccountHealthRequest) returns (GetAccountHealthResponse);

  // 2. Gửi tin nhắn Outbound (Có Safety Throttle)
  rpc SendTextMessage(SendTextMessageRequest) returns (SendTextMessageResponse);
  rpc SendMediaMessage(SendMediaMessageRequest) returns (SendMediaMessageResponse);

  // 3. Luồng Streaming Inbound Realtime
  rpc StreamInboundEvents(StreamInboundEventsRequest) returns (stream InboundTelegramEvent);
}

message StartQRLoginRequest {
  string tenant_id = 1;
  string account_id = 2;
  string egress_proxy_url = 3; // SOCKS5 proxy per-nick (SPEC 056)
}

message QRLoginEvent {
  enum EventType {
    EVENT_TYPE_UNSPECIFIED = 0;
    EVENT_TYPE_QR_GENERATED = 1;
    EVENT_TYPE_QR_EXPIRED = 2;
    EVENT_TYPE_AUTHENTICATED = 3;
    EVENT_TYPE_FAILED = 4;
  }
  EventType event_type = 1;
  string qr_code_base64 = 2;
  string tg_user_id = 3;
  string username = 4;
  string session_encrypted = 5;
  string error_message = 6;
}

message SendTextMessageRequest {
  string tenant_id = 1;
  string account_id = 2;
  string peer_id = 3; // User ID / Chat ID
  string text = 4;
  bool is_nurturing_sequence = 5; // Cờ kịch bản tự động
}

message SendTextMessageResponse {
  int64 message_id = 1;
  int64 sent_at_unix = 2;
  int32 jitter_delay_ms = 3;
}

message InboundTelegramEvent {
  string tenant_id = 1;
  string account_id = 2;
  string sender_peer_id = 3;
  string sender_name = 4;
  string text = 5;
  int64 message_id = 6;
  int64 timestamp_unix = 7;
  bool is_group = 8;
  string group_id = 9;
}
```

---

## 5. Đặc Tả REST Endpoints & Luồng Điều Phối Outbound (interfaces/http)

### 5.1 Danh Sách Endpoints REST Chuẩn
Mọi endpoint danh sách bắt buộc tuân thủ chuẩn `pkg/pagination.PaginationParam` và `PageResult[T]`:

| Phương thức | Endpoint | Quyền (RBAC) | Mô tả chi tiết |
|---|---|---|---|
| `POST` | `/api/v1/telegram-personal/accounts/init` | `channel.manage` | Khởi tạo phiên kết nối nick mới và xin cấp proxy SOCKS5 |
| `GET` | `/api/v1/telegram-personal/accounts/:id/qr` | `channel.manage` | SSE stream hoặc polling nhận Base64 QR code đăng nhập |
| `DELETE` | `/api/v1/telegram-personal/accounts/:id` | `channel.manage` | Hủy phiên đăng nhập và giải phóng proxy |
| `GET` | `/api/v1/telegram-personal/accounts?page=&page_size=` | `channel.view` | Danh sách nick Telegram cá nhân (Chuẩn `pkg/pagination`: `{items, total, page, limit, totalPages, hasNext}`) |
| `GET` | `/api/v1/telegram-personal/dialogs?page=&page_size=` | `conversation.view` | Danh sách hội thoại/nhóm/kênh nick đang tham gia |
| `POST` | `/api/v1/telegram-personal/groups/:id/sync` | `channel.manage` | Kích hoạt cào thành viên nhóm nạp Lead vào Lead Pool (ADR-ARCH-009) |
| `GET` | `/api/v1/telegram-personal/groups/:id/members?page=&page_size=` | `channel.view` | Danh sách thành viên đã cào kèm phân trang chuẩn |
| `POST` | `/api/v1/telegram-personal/messages/send` | `conversation.send` | Gửi tin nhắn trực tiếp qua nick Telegram cá nhân (Dedicated Dispatch) |

### 5.2 Luồng Điều Phối Outbound Hợp Nhất trong Hộp Thư (`POST /api/v1/conversations/{id}/messages`)
Khi nhân viên chat trong giao diện Hộp thư Hợp nhất (`/chat` trên `omni-web`), frontend gọi endpoint `POST /api/v1/conversations/{id}/messages`. Backend (`internal/conversation/interfaces/http/handler.go`) phải điều phối Outbound theo loại kênh (`channel_type`):

1. **Nhận diện Kênh:**
   - Khi `conv.ChannelType() == "telegram"`:
     - Trích xuất: `account_id = conv.ChannelAccountID()`, `peer_id = conv.ExternalConversationID()`.
2. **Ghi nhận Outbox & Điều phối:**
   - Lưu sự kiện `TELEGRAM_MESSAGE_DISPATCH_REQUESTED` vào bảng `domain_events` (Transactional Outbox).
   - Đẩy thông điệp vào hàng đợi NSQ topic `telegram.outbound.messages` (`pkgnsq.TopicTelegramOutboundMessages`) hoặc gọi trực tiếp adapter `teleRepo.SendMessage` khi NSQ offline/fallback.
3. **Cập nhật Trạng thái:**
   - Khi tin nhắn được server Telegram tiếp nhận thành công (trả về `msg_id`), ghi nhận `UpdateChannelMessageID` thành `delivered`.

### 5.3 Đồng Bộ Hợp Đồng Payload Gửi Tin (`POST /api/v1/telegram-personal/messages/send`)
Đồng bộ nghiêm ngặt giữa Frontend (`omni-web/src/api/telegram-personal.ts`) và Backend (`internal/channel/interfaces/http/telegram/telegram_handler.go`):

```json
{
  "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "peer_id": "123456789",
  "text": "Chào bạn, mình liên hệ từ Omni CRM!",
  "parse_mode": "markdown",
  "media_type": "none",
  "media_url": "",
  "is_stranger": false
}
```
- `account_id` (UUID): ID tài khoản Telegram của nhân viên trong CRM.
- `peer_id` (string): UID người nhận hoặc Chat ID / Channel ID Telegram. Tuyệt đối không dùng `recipient_id`.
- `text` (string): Nội dung văn bản gửi. Tuyệt đối không dùng `content`.
- `is_stranger` (bool): Cờ đánh dấu người lạ để áp dụng hạn ngạch 25 tin/ngày (Anti-Ban Rule).

---

## 6. Chính Sách Phòng Chống Checkpoint & Khoá Tài Khoản (Anti-Ban Rules)

Triển khai nghiêm ngặt theo khuyến cáo từ [`gotd/td/SUPPORT.md`](https://github.com/gotd/td/blob/main/.github/SUPPORT.md#how-to-not-get-banned):

1. **Isolation Proxy Egress 1:1:**
   - Mỗi tài khoản Telegram kết nối qua 1 Residential Proxy SOCKS5 độc lập (lấy từ Master Proxy Pool SPEC 056).
   - Tuyệt đối cấm kết nối trực tiếp IP của server máy chủ backend.
2. **Safety Jitter Delay:**
   - Các kịch bản Sequence chăm khách tự động phải có độ trễ ngẫu nhiên: `time.Sleep(rand.Duration(3s, 7s))`.
3. **Daily Outbound Quota Guard:**
   - Lead mới (chưa từng có lịch sử hội thoại 2 chiều): Giới hạn tối đa **25 tin nhắn mới/ngày/nick**.
   - Lead/Contact đã tương tác (đã từng chat 2 chiều): Không giới hạn số lượng tin nhắn trao đổi 1-1.
4. **Session Encryption (At Rest):**
   - Dữ liệu auth MTProto token session được mã hoá bằng thuật toán **AES-256-GCM** trước khi lưu vào bảng `channel_accounts`.
---

## 7. Đồng Bộ Hội Thoại, Nhóm & Kênh (Dialogs, Groups & Channels Synchronization)

### 7.1 Phân Biệt Cơ Chế Quét Thành Viên: Supergroup vs Broadcast Channel

| Tiêu chí | Telegram Supergroup / Group (Nhóm chat) | Telegram Broadcast Channel (Kênh phát tin) |
|---|---|---|
| **Mục đích** | Thảo luận đa chiều giữa các thành viên | Phát thanh một chiều từ chủ kênh tới người đọc |
| **Quyền quét thành viên thường** | **CÀO ĐƯỢC.** Mọi thành viên trong nhóm đều duyệt được danh sách (trừ khi nhóm bật cờ `Hide Participants`). | **KHÔNG THỂ.** Người xem thông thường chỉ thấy số lượng subscriber, không xem được danh tính. |
| **Quyền quét khi là Admin** | Cào được 100% không giới hạn. | Cào được 100% toàn bộ Subscribers. |
| **Dữ liệu trích xuất (Lead)** | `user_id`, `username`, `first_name`, `last_name`, `role` (Admin/Member/Bot). | `user_id`, `username`, `first_name`, `last_name`. |
| **Chiến lược khai thác CRM** | Cào thành viên từ các nhóm đối thủ / nhóm cộng đồng để nạp vào Lead Pool. | Quét danh sách người theo dõi của kênh nội bộ để nuôi dưỡng khách tiềm năng. |

---

### 7.2 Sơ Đồ Luồng: Quét Thành Viên Nhóm & Tự Động Nạp Lead (Group Scraping & Lead Pipeline)

```
[Sale / Web UI]          [Omni Core (Channel)]      [TG Gateway Daemon]         [Telegram DC]
      │                         │                          │                        │
      │── 1. Quét thành viên ──►│                          │                        │
      │   (group_id, limit)     │── 2. SyncGroupMembers ──►│                        │
      │                         │   (group_id, batch_size) │── 3. channels.GetParticipants
      │                         │                          │◄── Batch 200 members ──│
      │                         │                          ├── 4. Sleep 2s (Anti-Flood)
      │                         │◄── 5. Member Stream/Batch│                        │
      │                         │    [Lưu DB group_members]│                        │
      │                         ├── 6. Ingest to Lead Pool │                        │
      │                         │    (Customer BC ADR-009) │                        │
      │◄── 7. Completed ACK ────│                          │                        │
```

---

## 8. Đối Soát Trạng Thái Implementation & Phân Tích Khoảng Trống (Audit Status & Gap Analysis)

Kiểm tra toàn diện source code `internal/channel/interfaces/http/telegram/telegram_handler.go`, `native_gotd_client.go`, `postgres_repository.go` và `telegram_sync_worker.go`:

| REST Endpoint / Nghiệp Vụ | DB Persistence (Bun ORM) | Call MTProto (gotd/td) | Trạng thái Hiện tại | Yêu Cầu Hoàn Thiện |
|---|---|---|---|---|
| `GET /api/v1/telegram-personal/accounts` | Đã xong (`channel_accounts`) | Không cần (chỉ đọc DB) | **READY** | Hỗ trợ phân trang chuẩn `pkg/pagination`. |
| `POST /api/v1/telegram-personal/accounts/init` | Đã xong (`channel_accounts`) | SOCKS5 proxy allocate | **READY** | Khởi tạo tài khoản trạng thái `INITIALIZED`. |
| `GET /api/v1/telegram-personal/accounts/{id}/qr` | Đã xong (lưu session token) | Đã gọi `client.QR().Export()` | **READY** | SSE / Polling Base64 QR code đăng nhập thật. |
| `DELETE /api/v1/telegram-personal/accounts/{id}` | Đã xong (Hard delete DB) | Đã gọi `gotdClient.Disconnect()` | **READY** | Hủy session và giải phóng kết nối TCP. |
| `GET /api/v1/telegram-personal/accounts/{id}/dialogs` | Đã xong (`conversations`) | Async sync qua NSQ | **READY** | Lấy danh sách hội thoại của 1 tài khoản chỉ định. |
| `GET /api/v1/telegram-personal/dialogs` | **CHƯA (STUB)** | Không | **GAP** | Handler đang trả về mảng rỗng `[]teledom.TelegramDialog{}`. Cần query DB `conversations` theo `tenant_id` và filter `channel_type = 'telegram'`. |
| `POST /api/v1/telegram-personal/accounts/{id}/sync` | Đã xong (NSQ Task enqueue) | Worker gọi `FetchDialogs` & `FetchHistory` | **READY** | Worker chạy nền cào lịch sử nạp vào DB. |
| `POST /api/v1/telegram-personal/groups/{id}/sync` | Đã lưu `group_members` | **CHƯA (THIẾU)** | **GAP** | Chưa gọi MTProto `channels.GetParticipants`. Đang nhận member từ HTTP body thay vì tự cào Telegram DC. |
| `GET /api/v1/telegram-personal/groups/{id}/members` | Đã xong (`group_members`) | Không cần (đọc DB) | **READY** | Danh sách thành viên nhóm đã cào kèm phân trang. |
| `POST /api/v1/telegram-personal/messages/send` | Đã lưu `messages` & update conv | Đã gọi `SendMessage` & `SendMediaPhoto` | **READY** | Gửi tin nhắn outbound trực tiếp qua MTProto gotd client. |
