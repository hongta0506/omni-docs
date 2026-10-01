# Kiến Trúc Tích Hợp Kênh Hội Thoại Đa Kênh (Channel Gateways Architecture)

> **Bounded Context:** `internal/channel` (Channel & Gateway BC)  
> **Tài liệu hợp nhất:** `ZALO-DUAL-CHANNEL-ARCHITECTURE.md`, `WHATSAPP-GATEWAY-GRPC-SPEC.md`, `OMNI-CHANNEL-GATEWAY-AND-AI-AGENT-ARCHITECTURE.md`.  
> **Nguyên tắc cốt lõi:** Hexagonal Architecture / Ports & Adapters, Unify Inbound/Outbound Interface, Sub-module Isolation.

---

## 1. Tổng Quan Kiến Trúc Channel Gateway

Hệ thống Omni Core hỗ trợ đa kênh (Zalo Personal, Zalo OA, Telegram, WhatsApp, Facebook Messenger) với mục tiêu:
1. Trừu tượng hóa khác biệt giữa các kênh thông qua một hợp đồng thống nhất (`ChannelAccountPort`, `InboundEventForwarder`, `OutboundMessageRouter`).
2. Tách biệt hoàn toàn tầng Domain Logic với các thư viện kết nối bên ngoài (REST API, WebSocket, gRPC daemon, MTProto).
3. Hỗ trợ cơ chế Failover Proxy Egress linh hoạt để đảm bảo an toàn tài khoản và chống rate limit.

```
                          ┌──────────────────────────┐
                          │   Inbound Webhook/Event   │
                          └─────────────┬────────────┘
                                        │
┌───────────────────────────────────────▼───────────────────────────────────────┐
│                          Channel Gateway Layer                                │
│                                                                               │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │ Zalo Personal (Node) │  │ Zalo OA / Bot (REST) │  │ WhatsApp Gateway    │  │
│  │ gRPC / zca-js Daemon │  │ Direct OpenAPI/Hook  │  │ gRPC Baileys Client │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬──────────┘  │
│             │                         │                         │             │
│             └───────────────────┐     │     ┌───────────────────┘             │
│                                 ▼     ▼     ▼                                 │
│                           ┌───────────────────────┐                           │
│                           │ InboundEventForwarder │                           │
│                           └───────────┬───────────┘                           │
└───────────────────────────────────────┼───────────────────────────────────────┘
                                        │
                                        ▼
                   ┌────────────────────────────────────────┐
                   │  Conversation BC / AI Agent BC / CRM   │
                   └────────────────────────────────────────┘
```

---

## 2. Zalo Dual-Channel Integration: Official OA vs Unofficial Personal (zca-js)

### 2.1 Bảng So Sánh & Ranh Giới Kỹ Thuật

| Đặc tính | Zalo Official Account (OA) | Zalo Personal (Unofficial - zca-js) |
| :--- | :--- | :--- |
| **Giao thức gốc** | HTTPS REST API & Webhook chính thức từ VNG | WebSocket / Long-polling qua Cookie & Cryptographic Keys của Zalo Web |
| **Bản chất xác thực** | OAuth 2.0 (App ID, Secret, Refresh Token, Access Token) | QR Code Scan / Cookies (`zpsid`, `zpw_sek`, `imei`) qua daemon Node.js |
| **Cơ chế Inbound** | Webhook HTTP POST từ Zalo Server về API Gateway | WebSocket realtime listener trong thư viện `zca-js` |
| **Cơ chế Outbound** | Direct HTTP request từ Go Core sang Zalo OpenAPI | gRPC Unary/Streaming request từ Go Core sang `zca-js` daemon |
| **Vòng đời tài khoản** | Token hết hạn -> Refresh tự động qua HTTP API | Phiên đăng nhập cookie -> Nguy cơ văng phiên -> Cần QR re-login |
| **Tỷ lệ hạn chế / Ban** | Không bị ban (tuân thủ chính sách VNG) | Rủi ro checkpoint / ban tài khoản nếu spam hoặc login bất thường |
| **Đơn vị định danh** | `oa_id`, `user_id_by_app` (App-scoped ID) | `zalo_user_id` (Zalo UID toàn cầu), Phone Number |

### 2.2 Quy Trình Quản Lý Vòng Đời Zalo Personal (Daemon Lifecycle)

1. **Khởi tạo & Quét mã QR**:
   - Go Core gọi `StartLogin(account_id)` qua gRPC tới Node.js `zca-js` daemon.
   - Daemon sinh mã QR từ Zalo Web API, đẩy event `QR_GENERATED` kèm Base64 Image/URL về Go Core.
   - Go Core đẩy mã QR qua WebSocket (`interfaces/ws`) cho Frontend `omni-web` hiển thị.
2. **Xác nhận đăng nhập & Lưu trữ Phiên**:
   - Khi người dùng quét và duyệt trên điện thoại, daemon nhận cookie, trích xuất `zpsid`, `zpw_sek`, `imei`.
   - Go Core lưu credentials đã mã hóa (AES-GCM-256) vào bảng `channel_accounts`.
3. **Giám Sát & Re-login (Keep-Alive & Session Guard)**:
   - Daemon duy trì heartbeat định kỳ tới Zalo Server.
   - Khi phát hiện session chết (mã 1001/cookie expired), daemon emit event `SESSION_EXPIRED`.
   - Go Core chuyển trạng thái tài khoản sang `NEEDS_RELOGIN`, bắn thông báo realtime cho Sale.

---

## 3. WhatsApp Dual-Channel Integration (Personal vs Official WABA)

Tương tự Zalo (Zalo Personal vs Zalo OA), WhatsApp được phân rã thành hai hình thái hoạt động độc lập về giao thức, rủi ro và cơ chế định tuyến:

```
                                  ┌────────────────────────┐
                                  │   Inbound Router       │
                                  └───────────┬────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                                                   │
         ┌──────────▼──────────┐                             ┌──────────▼──────────┐
         │  WhatsApp Personal  │                             │  WhatsApp Official  │
         │   (Unofficial)      │                             │     (Cloud API)     │
         └──────────┬──────────┘                             └──────────┬──────────┘
                    │                                                   │
         ┌──────────▼──────────┐                             ┌──────────▼──────────┐
         │ Baileys / whatsmeow │                             │ Meta Graph API v19+ │
         │ WebSocket Daemon    │                             │ Cloud Webhooks      │
         └──────────┬──────────┘                             └──────────┬──────────┘
                    │                                                   │
         ┌──────────▼──────────┐                             ┌──────────▼──────────┐
         │ QR Code Pairing     │                             │ WABA Embedded Signup│
         │ Multi-Device Sync   │                             │ Template Messages   │
         │ Proxy Egress Pool   │                             │ 24h Service Window  │
         └─────────────────────┘                             └─────────────────────┘
```

### 3.1 So Sánh Hai Mô Hình WhatsApp

| Đặc tính | WhatsApp Personal (Unofficial) | WhatsApp Official (Cloud API / WABA) |
|---|---|---|
| **Cơ chế xác thực** | Quét QR Code qua Web Multidevice (Baileys / whatsmeow) | Meta System User Token / WABA OAuth Signup |
| **Giao thức vận hành** | gRPC Daemon Sidecar + Noise Protocol over WS | HTTPS REST Meta Graph API + Webhook Inbound |
| **Chi phí gửi tin** | Miễn phí (chỉ tốn chi phí hạ tầng / Proxy) | Trả phí theo phiên hội thoại Meta (Conversation-based) |
| **Rủi ro vận hành** | Nguy cơ bị khóa số nếu gửi spam hoặc thiếu Proxy xoay IP | Không rủi ro khóa số, tuân thủ chính sách Meta |
| **Mẫu tin nhắn** | Gửi tự do văn bản, media không cần duyệt | Bắt buộc đăng ký và duyệt Template trước khi gửi |
| **Cửa sổ gửi tin** | Không giới hạn thời gian phản hồi | Giới hạn 24h kể từ tin nhắn cuối của khách hàng |

### 3.2 WhatsApp Personal Daemon (gRPC & Baileys / whatsmeow)

WhatsApp Personal được quản lý qua microservice daemon (Node.js/Baileys hoặc Go/whatsmeow), kết nối với Go Core qua gRPC hai chiều (Bi-directional gRPC Streaming):

```
[ Go Core: omni-core ]
       │
       │ (1) gRPC: StartInstance(instance_id)
       ▼
[ WhatsApp Gateway Service ]
       │
       │ (2) Generates QR / Session State
       ▼
[ Go Core: Inbound Event Subscriber ]
       │
       │ (3) Broadcasts via WebSocket
       ▼
[ Frontend: omni-web ] (Hiển thị QR để người dùng quét)
```

#### Protobuf Service Contract (Personal Daemon)

```protobuf
syntax = "proto3";

package whatsapp.v1;

option go_package = "omni-core/gen/whatsapp/v1;whatsappv1";

service WhatsAppGatewayService {
  rpc StartInstance(StartInstanceRequest) returns (StartInstanceResponse);
  rpc StopInstance(StopInstanceRequest) returns (StopInstanceResponse);
  rpc GetInstanceStatus(GetInstanceStatusRequest) returns (GetInstanceStatusResponse);
  rpc SubscribeEvents(SubscribeEventsRequest) returns (stream WhatsAppEvent);
  rpc SendMessage(SendMessageRequest) returns (SendMessageResponse);
}

message StartInstanceRequest {
  string instance_id = 1;
  string webhook_url = 2;
}

message WhatsAppEvent {
  string instance_id = 1;
  string event_type = 2; // QR_CODE, READY, MESSAGE_RECEIVED, DISCONNECTED
  bytes payload = 3;
}
```

### 3.3 WhatsApp Official Cloud API (WABA)

Dành cho doanh nghiệp sử dụng WhatsApp Business Account chính thống:
1. **Webhook Inbound Receiver**:
   - Xác thực Webhook qua Meta Token Challenge (`hub.verify_token`, `hub.challenge`).
   - Ký mã bảo mật payload qua `X-Hub-Signature-256` bằng App Secret.
   - Chuẩn hóa payload sự kiện sang `InboundEventDTO` chung của hệ thống.
2. **Outbound Cloud API Router**:
   - Tự động kiểm tra `24h Customer Service Window`: nếu quá 24h, bắt buộc sử dụng Template Message (`template_name`, `language`, `components`).
   - Gửi tin nhắn qua endpoint: `https://graph.facebook.com/v19.0/{phone_number_id}/messages`.
3. **Template Management**:
   - Đồng bộ danh sách mẫu tin WABA (APPROVED, REJECTED, PENDING).

---

## 4. Egress Proxy Management & Account Security

Nhằm tránh việc nhiều tài khoản Zalo/Telegram cùng phát sinh traffic từ một IP duy nhất của máy chủ trung tâm:
1. **Dynamic Proxy Binding**: Mỗi `channel_account` được liên kết với một Proxy cụ thể trong `admin/egress` (HTTP/SOCKS5 có xác thực).
2. **Health Check Worker**: Cron job định kỳ kiểm tra độ trễ (latency), tỷ lệ sống sót của danh sách proxy. Tự động chuyển fallback khi proxy bị lỗi.
3. **Rate Limiting & Anti-Spam Gate**:
   - Giới hạn tốc độ gửi tin nhắn tối đa theo từng tài khoản (ví dụ Zalo cá nhân: max 1 tin / 3-5 giây với người lạ, có jitter ngẫu nhiên).
   - Tự động ngắt kết nối tạm thời khi phát hiện cảnh báo mã Captcha hoặc rate-limit từ nền tảng.

---

## 5. Universal Channel QR Login & Realtime Session Handshake Standard (Zalo, WhatsApp, Telegram)

> **Mục tiêu kiến trúc:** Chuẩn hóa quy trình đăng nhập bằng mã QR giữa **Client Web (`omni-web`)**, **Core Backend (`omni-core`)**, và **Sidecar Gateway Daemon (`zca-js`, `Baileys`, `MTProto`)**. Đảm bảo trải nghiệm realtime liền mạch (Zero Polling Lag), không rò rỉ bộ nhớ (Zero Memory Leak) và tái sử dụng 100% mẫu thiết kế cho mọi kênh hội thoại không chính thức (Unofficial Channels).

### 5.1 Kiến Trúc Luồng Sự Kiện Đăng Nhập (Universal Sequence Flow)

```
[ Client: omni-web ]          [ Core: omni-core ]          [ Gateway Daemon ]          [ 3rd-party Platform ]
       │                             │                            │                             │
       │ 1. POST /zalo-accounts      │                            │                             │
       │    (Create account record)  │                            │                             │
       │────────────────────────────>│                            │                             │
       │    201 Created (accountId)  │                            │                             │
       │<────────────────────────────│                            │                             │
       │                             │                            │                             │
       │ 2. Socket.IO / WS Subscribe │                            │                             │
       │    emit('channel:subscribe')│                            │                             │
       │────────────────────────────>│                            │                             │
       │                             │                            │                             │
       │ 3. POST /:id/login          │                            │                             │
       │────────────────────────────>│ 4. Connect-RPC / gRPC      │                             │
       │                             │    GenerateLoginQR(id)     │                             │
       │                             │───────────────────────────>│ 5. Trigger SDK loginQR()   │
       │                             │                            │────────────────────────────>│
       │                             │                            │ 6. Event: QRCodeGenerated   │
       │                             │                            │<────────────────────────────│
       │                             │ 7. Return qrImage Base64   │                             │
       │                             │<───────────────────────────│                             │
       │ 8. Response { qrImage }     │                            │                             │
       │<────────────────────────────│                            │                             │
       │ (Hiển thị QR trên Modal)    │                            │                             │
       │                             │                            │ 9. User scans QR on Phone   │
       │                             │                            │<────────────────────────────│
       │                             │                            │ 10. Event: QRCodeScanned    │
       │                             │ 11. Connect-RPC stream/poll│<────────────────────────────│
       │                             │     CheckLoginStatus(id)   │                             │
       │                             │───────────────────────────>│                             │
       │ 12. emit('channel:scanned') │ 12. Response { Scanned }   │                             │
       │<────────────────────────────│<───────────────────────────│                             │
       │ (Modal: Đang xác thực...)   │                            │                             │
       │                             │                            │ 13. Event: GotLoginInfo     │
       │                             │                            │<────────────────────────────│
       │                             │ 14. Response { Connected,  │                             │
       │                             │     DisplayName, Token }   │                             │
       │                             │<───────────────────────────│                             │
       │                             │ 15. DB Update: status=active                             │
       │                             │     Save Encrypted Session │                             │
       │ 16. emit('channel:connected'│                            │                             │
       │<────────────────────────────│                            │                             │
       │ (Modal: Bước 4 Done! 🎉)    │                            │                             │
```

### 5.2 Ba Nguyên Tắc Thiết Kế Kỹ Thuật (Engineering Invariants)

1. **Dual Transport Compatibility (WebSocket Native & HTTP Long-Polling Fallback)**:
   - Client Web (`omni-web`) kết nối qua giao thức Socket.IO (hỗ trợ cả WebSocket nâng cấp và HTTP Long-Polling).
   - Core Backend (`omni-core`) duy trì In-Memory Session Event Hub để đẩy các gói tin chuẩn Engine.IO/Socket.IO v4:
     - Gói Scanned: `42["zalo:scanned", {"accountId": "...", "displayName": "..."}]`
     - Gói Connected: `42["zalo:connected", {"accountId": "..."}]`
   - Điều này đảm bảo khi hệ thống chạy qua các Reverse Proxy hạn chế WebSocket (Nginx, Cloudflare), kết nối vẫn tự động fallback qua HTTP Polling mà không làm đứt đoạn Wizard.

2. **On-Demand Lifecycle & Resource Safety (Zero Background Worker Leak)**:
   - Luồng đồng bộ trạng thái đăng nhập giữa Core và Gateway Sidecar CHỈ tồn tại khi có kết nối đăng nhập đang mở (`showQRDialog = true`).
   - Khi client hoàn tất kết nối hoặc người dùng bấm Hủy (`cancelQR` -> `channel:unsubscribe`), toàn bộ Context và Goroutine theo dõi trạng thái phải được hủy ngay lập tức (`cancel()`).
   - Tuyệt đối không chạy Background Polling vĩnh viễn trên các tài khoản chưa quét mã.

3. **Multi-Channel Extensibility (Zalo Personal, WhatsApp Web Multidevice, Telegram MTProto)**:
   - Cùng một cấu trúc được áp dụng đồng nhất cho các kênh:
     | Kênh | Thư viện Gateway | Sự kiện Scanned | Sự kiện Connected / Credentials |
     |---|---|---|---|
     | **Zalo Personal** | `zca-js` (Node.js) | `event.type === 2` (`QRCodeScanned`) | `event.type === 4` (`GotLoginInfo`: cookies + imei) |
     | **WhatsApp Personal** | `@whiskeysockets/baileys` (Node.js) hoặc `whatsmeow` (Go) | `connection.update` (qr scan confirmed) | `creds.update` (multi-device auth keys) |
     | **Telegram Personal** | MTProto / TDLib Sidecar | `updateAuthorizationStateWaitCode` | `updateAuthorizationStateReady` (session string) |
   - Tầng Core chỉ giao tiếp qua Connect-RPC chuẩn và ánh xạ Domain Aggregate `ChannelAccount` duy nhất.
---

## 6. Zalo Personal Realtime Messaging & Chat History Backfill Flow

### 6.1 Tổng Quan Luồng Tin Nhắn Hai Chiều (Inbound / Outbound) & Lịch Sử

Khác với Zalo OA sử dụng webhook HTTP từ Zalo Developer Portal, **Zalo Personal** (`zca-js`) chạy trên kết nối WebSocket socket-level.

```
[ omni-web ]                 [ omni-core ]               [ gateway-zalo ]             [ Zalo Server ]
     │                             │                             │                            │
     │ 1. POST /messages           │                             │                            │
     │    (Outbound Send)          │                             │                            │
     │────────────────────────────>│ 2. Connect-RPC / HTTP       │                            │
     │                             │    SendMessage(recipient,msg)│                            │
     │                             │────────────────────────────>│ 3. api.sendMessage()      │
     │                             │                             │───────────────────────────>│
     │                             │                             │ 4. Message Delivered Ack   │
     │                             │ 5. Return msgId + sentAt    │<───────────────────────────│
     │                             │<────────────────────────────│                            │
     │ 6. 201 Created (MessageDTO) │                             │                            │
     │<────────────────────────────│                             │                            │
     │                             │                             │                            │
     │                             │                             │ 7. Event: 'message'        │
     │                             │                             │    (Inbound Received)      │
     │                             │                             │<───────────────────────────│
     │                             │ 8. ForwardInboundMessage    │                            │
     │                             │    (InboundEventForwarder)  │                            │
     │                             │<────────────────────────────│                            │
     │                             │ 9. Save Message & Conv      │                            │
     │ 10. WebSocket Emit          │                             │                            │
     │     'chat:message'          │                             │                            │
     │<────────────────────────────│                             │                            │
     │                             │                             │                            │
     │                             │                             │ 11. Sync History Trigger   │
     │                             │                             │     (requestOldMessages)   │
     │                             │                             │───────────────────────────>│
     │                             │                             │ 12. Event: 'old_messages'  │
     │                             │                             │<───────────────────────────│
     │                             │ 13. Backfill Batch Persist  │                            │
     │                             │<────────────────────────────│                            │
```

### 6.2 Chi Tiết Kỹ Thuật (Implementation Specifics)

1. **Avatar & Contact Mapping Trong Hội Thoại (`conversationDTO`)**:
   - Khi tạo hoặc truy vấn hội thoại, `contact.avatarUrl` và `friendship.zaloAvatarUrl` bắt buộc lấy trực tiếp từ `channel_profiles.avatar_url` (CDN Zalo zadn.vn).
   - Tuyệt đối không fallback về giá trị giả lập tĩnh `https://res-zalo.zadn.vn/default`.

2. **Kéo Lịch Sử Tin Nhắn Cũ (Backfill via `pumpOldMessages`)**:
   - Trong `zca-js`, tin nhắn cũ được phân trang qua WebSocket con trỏ: `api.listener.requestOldMessages(threadType, cursor)`.
   - Gateway daemon lắng nghe sự kiện `old_messages`, trích xuất các trường:
     - `msgId` (ID tin nhắn Zalo)
     - `content` (Nội dung văn bản / attachment metadata)
     - `uidFrom` (UID người gửi)
     - `ts` (Timestamp gửi)
     - `threadId` / `toId` (UID hội thoại người nhận)
   - Lưu trữ idempotent vào PostgreSQL bảng `messages` và cập nhật `last_message_at` / `last_message_snippet` của `conversations`.

3. **Thu Thập Số Điện Thoại Bạn Bè Công Khai (Phone Capture Invariant)**:
   - Khi gọi `api.getAllFriends()`, trích xuất trường `phoneNumber` / `phone`.
   - Nếu bạn bè bật chia sẻ số điện thoại, lưu vào `contacts.primary_phone` (chuẩn hóa format 84xxx / 0xxx) và ánh xạ với khách hàng trong CRM.
---

## 7. Zalo Group Chat History Sync & Message Recall (Undo) Flow

### 7.1 Luồng Đồng Bộ Lịch Sử Nhóm & Cộng Đồng (Group & Community Sync)

Đối với tin nhắn nhóm và cộng đồng, `zca-js` phân biệt rõ với DM cá nhân:
1. **Phát hiện danh sách nhóm**: Gọi `api.getAllGroups()` để lấy danh sách nhóm tham gia (`gridInfoMap`).
2. **Kéo lịch sử tin nhắn nhóm**: Với mỗi `groupId`, gọi `api.getGroupChatHistory(groupId, limit)` trả về mảng `groupMsgs`.
3. **Lưu trữ hội thoại**: Đánh dấu `channel_type='zalo_personal'`, `thread_type='group'`, `external_conversation_id=groupId`. Cập nhật `group_name` và `group_avatar`.

### 7.2 Luồng Thu Hồi Tin Nhắn Hai Chiều (Bidirectional Message Recall / Undo)

```
[ User/Peer on Zalo ]       [ Zalo Server ]       [ Gateway Daemon ]       [ Go Core (omni-core) ]       [ Client Web UI ]
        │                          │                      │                         │                           │
        │ 1. Bấm 'Thu hồi'         │                      │                         │                           │
        │─────────────────────────>│                      │                         │                           │
        │                          │ 2. Event 'undo'      │                         │                           │
        │                          │    (globalMsgId,     │                         │                           │
        │                          │     cliMsgId)        │                         │                           │
        │                          │─────────────────────>│                         │                           │
        │                          │                      │ 3. Forward POST Webhook │                           │
        │                          │                      │    /webhook/zalo-personal│                          │
        │                          │                      │────────────────────────>│                           │
        │                          │                      │                         │ 4. UPDATE messages        │
        │                          │                      │                         │    SET status='recalled'  │
        │                          │                      │                         │ 5. Socket.IO Emit         │
        │                          │                      │                         │    'chat:recalled'        │
        │                          │                      │                         │──────────────────────────>│
        │                          │                      │                         │                           │ (Giao diện cập nhật:
        │                          │                      │                         │                           │  'Tin nhắn đã thu hồi')
        │                          │                      │                         │                           │
        │                          │                      │                         │ 6. Agent bấm Thu hồi CRM  │
        │                          │                      │                         │<──────────────────────────│
        │                          │                      │ 7. POST /undo           │                           │
        │                          │                      │<────────────────────────│                           │
        │                          │ 8. api.undoMessage   │                         │                           │
        │                          │    (msgId, cliMsgId) │                         │                           │
        │                          │<─────────────────────│                         │                           │
        │                          │ 9. Recall Broadcast  │                         │                           │
        │<─────────────────────────│────────────────────────────────────────────────│                           │
```

### 7.3 Bắt Buộc Kỹ Thuật (Engineering Invariants)
- **CliMsgId Invariant**: Zalo yêu cầu cả `msgId` (server global ID) và `cliMsgId` (client message ID) để thu hồi tin nhắn. Hệ thống bắt buộc lưu cả 2 ID này trong metadata của `messages`.
- **Idempotent Recall**: Sự kiện `undo` có thể nhận trùng lặp từ nhiều nick cùng ở trong nhóm; cập nhật trạng thái `status='recalled'` phải là thao tác an toàn (idempotent).

---

## 8. Zalo Native Driver (zcago) Ingestion, Deduplication & API Parity

### 8.1 Quy Chuẩn Timestamp & Định Danh Tin Nhắn (Timestamp & Message ID Invariant)
1. **Timestamp gốc từ Zalo**:
   - Mọi tin nhắn (lịch sử `OldMessages` và trực tiếp `Message`) bắt buộc trích xuất `ts` từ trường epoch millisecond `TMessage.TS` (`time.UnixMilli(ms)`).
   - Nghiêm cấm gán `time.Now()` cho tin nhắn lịch sử vì sẽ phá vỡ thứ tự thời gian (`ORDER BY sent_at ASC`) và vô hiệu hóa cơ chế chống trùng.
2. **Định danh kép (Dual Message ID)**:
   - `channel_message_id`: Lưu `TMessage.MsgID` (Zalo Server Snowflake ID). Nếu rỗng, fallback sang `TMessage.CliMsgID`.
   - Cột `channel_message_id` phải có ràng buộc duy nhất trên PostgreSQL:
     ```sql
     CREATE UNIQUE INDEX idx_messages_conv_channel_msg_id 
     ON messages (conversation_id, channel_message_id) 
     WHERE channel_message_id IS NOT NULL AND channel_message_id != '';
     ```
   - Mọi thao tác ghi `INSERT` phải bảo vệ bằng `ON CONFLICT (conversation_id, channel_message_id) DO NOTHING`.

### 8.2 Phân Loại Content-Type & Media Assets
1. **Nhận diện tự động Content-Type**:
   - `chat.photo` hoặc URL ảnh CDN Zalo (`photo-stal`, `zdn.vn/no/jpg`, `.jpg`, `.png`, `.webp`) phải được gán `content_type = 'image'`.
   - `chat.sticker` / `sticker` -> `content_type = 'sticker'`.
   - `chat.video` / `video` -> `content_type = 'video'`.
   - `chat.voice` / `voice` -> `content_type = 'voice'`.
2. **Mảng Attachments**:
   - Tin nhắn ảnh/tệp tin bắt buộc ghi cấu trúc mảng JSON vào cột `attachments`:
     ```json
     [{"url": "https://photo-stal-...", "type": "image"}]
     ```

### 8.3 Chuẩn Hóa Payload & API Parity với Node.js Cũ
Để đảm bảo Frontend Vue (`omni-web`) hoạt động chính xác 100% không bị miss field:
1. **Metadata Persistence**:
   - Lưu trữ `quote` (thông tin reply: `ownerId`, `msg`, `ts`, `globalMsgId`, `cliMsgId`).
   - Lưu trữ `mentions` (mảng vị trí @tag trong group: `[{ uid, pos, len, type }]`).
   - Lưu `metadata.sender = { kind: "user_native", name: "...", syncedFromNative: true }` cho tin nhắn do chính chủ gửi từ ứng dụng Zalo thật để `MessageSourceBadge.vue` render "👤 Sale CRM · {tên} 🔄".
2. **DTO Contract Endpoint `GET /api/v1/conversations/:id/messages`**:
   - Trả ra đầy đủ các trường: `id`, `conversationId`, `zaloMsgId` (chính là `channel_message_id`), `zaloCliMsgId`, `senderId`, `senderUid`, `senderType` (`self` | `contact`), `senderName`, `sentVia` (`user_native` | `user`), `content`, `contentType`, `status`, `sentAt`, `createdAt`, `quote`, `mentions`, `attachments`, `metadata`.