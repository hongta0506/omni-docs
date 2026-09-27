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

## 3. WhatsApp Gateway Integration (gRPC & Baileys / WPPConnect)

### 3.1 Mô Hình Tích Hợp

WhatsApp Personal/Business Unofficial được quản lý thông qua microservice WhatsApp Gateway (Node.js/Baileys hoặc Go/whatsmeow), kết nối với Go Core qua gRPC hai chiều (Bi-directional gRPC Streaming).

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

### 3.2 Protobuf Service Contract

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

---

## 4. Egress Proxy Management & Account Security

Nhằm tránh việc nhiều tài khoản Zalo/Telegram cùng phát sinh traffic từ một IP duy nhất của máy chủ trung tâm:
1. **Dynamic Proxy Binding**: Mỗi `channel_account` được liên kết với một Proxy cụ thể trong `admin/egress` (HTTP/SOCKS5 có xác thực).
2. **Health Check Worker**: Cron job định kỳ kiểm tra độ trễ (latency), tỷ lệ sống sót của danh sách proxy. Tự động chuyển fallback khi proxy bị lỗi.
3. **Rate Limiting & Anti-Spam Gate**:
   - Giới hạn tốc độ gửi tin nhắn tối đa theo từng tài khoản (ví dụ Zalo cá nhân: max 1 tin / 3-5 giây với người lạ, có jitter ngẫu nhiên).
   - Tự động ngắt kết nối tạm thời khi phát hiện cảnh báo mã Captcha hoặc rate-limit từ nền tảng.
