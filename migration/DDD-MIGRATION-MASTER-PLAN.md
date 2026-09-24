# Kế Hoạch Chuẩn Hóa DDD & Di Trú Omni Sang Golang (Master Plan)

> **Tầm nhìn Omni**: Xây dựng nền tảng CRM đa kênh thế hệ mới (Omni-channel CRM) hỗ trợ Zalo, Facebook Messenger, WhatsApp, Telegram và các nền tảng khác.  
> **Mục tiêu**: Chuyển đổi toàn diện từ Node.js Modular Monolith (Fastify/Prisma - 442 API endpoints, 23 modules, chỉ hỗ trợ Zalo) sang **Golang Clean Architecture + Domain-Driven Design (DDD) + Connect-RPC**, đảm bảo **Zero Downtime**, **kiến trúc mở rộng cắm/rút kênh nhắn tin (Pluggable Channel Gateways)** và **bảo toàn dữ liệu**.

---

## 1. Phân Tích & Tái Cấu Trúc Bounded Contexts (Omni DDD Mapping)

Hệ thống cũ phân mảnh thành 23 module tính năng Zalo-centric. Khi chuyển sang Omni DDD, toàn bộ nghiệp vụ được quy hoạch lại vào **7 Bounded Contexts (BC)** cốt lõi, hoàn toàn Channel-Agnostic (độc lập với nền tảng nhắn tin cụ thể):

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Omni Core System (Go)                                │
│                     (Channel-Agnostic Business Engine)                           │
├────────────────────┬────────────────────┬───────────────────┬────────────────────┤
│ 1. Identity &      │ 2. Unified         │ 3. Conversation & │ 4. Growth &        │
│    Access BC       │    Customer BC     │    Messaging BC   │    Engagement BC   │
│ (auth, rbac,       │ (contacts, tags,   │ (omni-chat, media,│ (scoring, campaign,│
│  privacy, devices) │  lists, lead-pool, │  search, folder)  │  automation,       │
│                    │  activity)         │                   │  engagement)       │
├────────────────────┴────────────────────┴───────────────────┴────────────────────┤
│ 5. Intelligence & AI BC (ai, suggest, summary, handoff — Dual-System Jev + LLM)  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 6. Reporting & Platform BC (analytics, dashboard, integrations, notifications)   │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ gRPC (Universal Channel Protocol)
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────────┐
│ 7a. Zalo Gateway     │  │ 7b. Facebook Gateway │  │ 7c. WhatsApp Gateway         │
│ (Node.js/zca-js)     │  │ (Go / Meta Graph API)│  │ (Go / Meta Cloud API)        │
│ - Zalo personal nicks│  │ - FB Pages & User IDs│  │ - WhatsApp Business & phones │
└──────────────────────┘  └──────────────────────┘  └──────────────────────────────┘
```

### Bảng đối chiếu 23 Modules cũ sang 7 Bounded Contexts Omni:

| Bounded Context | Modules cũ gộp vào | Số endpoint cũ | Aggregate Roots & Core Entities | Khả năng mở rộng đa kênh (Omni) |
|---|---|:---:|---|---|
| **1. Identity & Access** | `auth`, `rbac`, `privacy`, `devices` | 68 | `User`, `Role`, `Tenant`, `DeviceSession` | Phân quyền sale theo từng kênh hoặc toàn bộ kênh; masking SĐT độc lập kênh |
| **2. Unified Customer** | `contacts`, `tags`, `lists`, `lead-pool`, `activity` | 71 | **`Contact` (Root)**, `ChannelProfile` (Entity con: Zalo friend, FB psid, WA jid), `TagGroup`, `CustomerList` | **Golden Record**: 1 Khách hàng cha duy nhất liên kết N profile mạng xã hội (1 Zalo + 1 FB + 1 WhatsApp) |
| **3. Conversation & Messaging** | `chat`, `media`, `search` | 61 | **`Conversation` (Root)**, `Message` (Entity), `ChatFolder`, `Attachment` | Hộp thư hợp nhất: 1 inbox quản lý hội thoại Zalo, FB, WhatsApp song song |
| **4. Growth & Engagement** | `scoring`, `engagement`, `campaign`, `automation` | 74 | `LeadScoreRule`, `Campaign`, `AutomationFlow` | Chiến dịch gửi tin đa kênh (ví dụ: ưu tiên gửi Zalo, failover sang WhatsApp / SMS); chấm điểm tương tác gộp mọi kênh |
| **5. Intelligence & AI** | `ai` | 14 | `AIInteraction`, `PromptTemplate` | Phân loại intent (Jev), sinh gợi ý trả lời tự động áp dụng chung cho mọi kênh chat |
| **6. Reporting & Platform** | `analytics`, `dashboard`, `integrations`, `notifications`, `branding`, `config` | 72 | `ReportDefinition`, `IntegrationWebhook`, `SystemConfig` | Báo cáo so sánh hiệu quả giữa các kênh (Zalo vs FB vs WhatsApp), funnel chuyển đổi đa kênh |
| **7. Channel Gateways** | `zalo`, `system-notifications`, `push` (+ sau này FB, WA) | 82 | `ChannelAccount`, `ChannelSession`, `ChannelGroup` | Interface gRPC thống nhất: `StreamChannelEvents`, `SendMessage`, `SyncContacts` |
| **TỔNG CỘNG** | **23 modules** | **442** | — | — |

---

## 2. Thiết Kế Domain Model Đa Kênh (Omni "2 Cuốn Sổ")

Mô hình "2 cuốn sổ" của ZaloCRM được tổng quát hóa thành **Mô Hình Khách Hàng Thống Nhất Đa Kênh (Unified Golden Customer Record)**:

### 2.1 Invariant của Aggregate Root `Contact` & `ChannelProfile`

```
┌──────────────────────────────────────────────────────────┐
│                   Contact (Aggregate Root)               │
│ - ID: UUID                                               │
│ - FullName: string                                       │
│ - PrimaryPhone: PhoneVO                                  │
│ - PrimaryEmail: EmailVO                                  │
│ - LeadScore: LeadScoreVO (Aggregate MAX)                 │
│ - MergedInto: *UUID                                      │
└────────┬─────────────────────┬─────────────────────┬─────┘
         │ 1                   │ 1                   │ 1
         │                     │                     │
         ▼ *                   ▼ *                   ▼ *
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ ZaloProfile     │   │ FacebookProfile │   │ WhatsAppProfile │
│ (Channel: Zalo) │   │ (Channel: FB)   │   │ (Channel: WA)   │
│ - ZaloUID       │   │ - PageScopedID  │   │ - WhatsAppJID   │
│ - NickAccountID │   │ - PageID        │   │ - PhoneJID      │
│ - Alias / Labels│   │ - LeadScore     │   │ - LeadScore     │
│ - LeadScore     │   │                 │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

1. **Quy tắc danh tính thống nhất (Identity Resolution)**:
   - Khi có khách nhắn tin từ WhatsApp hoặc Facebook với số điện thoại đã tồn tại ở Contact Zalo, hệ thống tự động link `ChannelProfile` vào cùng 1 `Contact` cha.
2. **Quy tắc gộp (Merge Invariant)**:
   - Khi `Contact A` được merge vào `Contact B`, tất cả channel profiles (Zalo, FB, WhatsApp) của A chuyển quyền sở hữu sang B.
3. **Quy tắc điểm LeadScore Đa Kênh**:
   - Mỗi `ChannelProfile` có điểm tương tác riêng trên kênh đó.
   - `Contact.LeadScore = MAX(All ChannelProfiles.LeadScore)` kết hợp trọng số đa kênh.

### 2.2 Chuẩn Hóa Universal Channel Gateway Contract (Protobuf)

Mọi nền tảng chat đều implement chung một interface gRPC:

```protobuf
syntax = "proto3";
package omni.channel.v1;

service ChannelGatewayService {
  // Outbound: Core gửi lệnh ra nền tảng
  rpc SendMessage(SendMessageRequest) returns (SendMessageResponse);
  rpc SendMedia(SendMediaRequest) returns (SendMediaResponse);
  rpc SyncProfiles(SyncProfilesRequest) returns (SyncProfilesResponse);
  
  // Inbound: Gateway stream sự kiện realtime về Core
  rpc StreamEvents(StreamEventsRequest) returns (stream ChannelEvent);
  
  // Account management
  rpc GetAccountStatus(GetAccountStatusRequest) returns (AccountStatusResponse);
  rpc ReconnectAccount(ReconnectAccountRequest) returns (ReconnectAccountResponse);
}

message ChannelEvent {
  string channel_type = 1; // "zalo", "facebook", "whatsapp", "telegram"
  string channel_account_id = 2; // ID nick Zalo / Page ID / WhatsApp phone
  string event_id = 3;
  int64 timestamp = 4;
  oneof payload {
    MessageReceivedEvent message_received = 5;
    MessageStatusEvent message_status = 6;
    ProfileUpdatedEvent profile_updated = 7;
    AccountStatusChangedEvent account_status = 8;
  }
}
```

---

## 3. Lộ Trình Di Trú 4 Giai Đoạn (Strangler Fig Pattern)

Quy tắc bất biến: **Hệ thống cũ tiếp tục phục vụ người dùng bình thường trong suốt quá trình di trú.**

```
Tuần 1-2: Phase 0 (Contract Omni & Go Setup)
Tuần 3-4: Phase 1 (Tách Zalo Gateway thành Channel Adapter đầu tiên)
Tuần 5-8: Phase 2 (Go Core DDD Đa Kênh: Customer & Conversation)
Tuần 9-11: Phase 3 (Connect-RPC, Omni WebSocket & Chuyển Traffic Zalo)
Tuần 12-14: Phase 4 (Module Vệ Tinh, Cắt Fastify cũ & Mở cổng Facebook/WhatsApp)
```

---

### Phase 0: Chuẩn Hóa Contract Omni & Setup Môi Trường (Tuần 1-2)

1. **Khởi tạo repository**:
   - Tạo repo `omni-go` cấu trúc Clean Architecture DDD.
   - Toolchain: `buf` (Protobuf code-gen cho Go và TS), `sqlc` (PostgreSQL raw SQL to type-safe Go), `golangci-lint`.
2. **Soạn thảo Protobuf Contracts**:
   - `api/proto/channel/v1/gateway.proto` (Universal Channel Contract).
   - `api/proto/customer/v1/customer.proto` (Unified Contact + Profiles).
   - `api/proto/conversation/v1/conversation.proto` (Multi-channel Conversation).
3. **Thiết lập CI/CD**:
   - Kiểm tra backward-compatibility của Protobuf qua Buf breaking change detection.

---

### Phase 1: Tách Node.js Zalo Gateway (Channel Adapter #1) (Tuần 3-4)

Biến logic `zca-js` thành Channel Gateway đầu tiên theo đúng chuẩn `ChannelGatewayService`:

1. **Tách code**:
   - Chuyển `ZaloCRM/backend/src/modules/zalo` sang repo `omni-gateway-zalo` (Node.js).
2. **Implement Universal gRPC Server**:
   - Bọc các hàm `zca-js` (send message, receive message, friend sync) thành implementation của `omni.channel.v1.ChannelGatewayService`.
3. **Nối ngược vào backend cũ**:
   - Backend Fastify cũ gọi `omni-gateway-zalo` qua gRPC client. Đảm bảo toàn bộ 71 API zalo cũ hoạt động không gián đoạn.

---

### Phase 2: Dựng Go Core Đa Kênh & Kiểm Chứng Domain (Tuần 5-8)

1. **Database & SQLC**:
   - Chuẩn bị schema PostgreSQL: mở rộng `friends` thành cấu trúc hỗ trợ đa kênh (`channel_profiles`), thêm cột `channel_type` vào `conversations` và `messages`.
   - Kết nối DB qua **PgBouncer** để bảo vệ connection pool khi Go sinh hàng ngàn goroutines.
2. **Domain Layer Implementation**:
   - Cài đặt Aggregate `Contact` và `ChannelProfile` với đầy đủ business invariants.
   - Triển khai **Outbox Pattern**: Mọi event được ghi kèm DB transaction, đẩy vào Redis Streams.
3. **Channel Router Engine**:
   - Xây dựng tầng `ChannelRouter` trong Go Core: tự động phân loại request gửi tin tới đúng Gateway dựa trên `channel_type`.
4. **Shadow Testing**:
   - Chạy song song Go Core với Fastify Node.js trên traffic thật, so sánh tính toàn vẹn dữ liệu.

---

### Phase 3: Connect-RPC Interface & Cắt Traffic Core (Tuần 9-11)

1. **Triển khai Connect-RPC Handlers**:
   - Expose các service: `CustomerService`, `ConversationService`, `AuthService` trên Go Core qua cổng HTTP/2 Connect-RPC.
   - Sinh TypeScript client cho Frontend (Vue 3 hiện tại hoặc Next.js tương lai).
2. **Omni Realtime WebSocket Hub**:
   - Xây dựng WebSocket Hub bằng Go. Đẩy event tin nhắn mới từ mọi kênh (Zalo, FB, WA) xuống client qua 1 socket duy nhất.
3. **Chuyển đổi Frontend sang Go Core**:
   - Module chat và danh bạ trên giao diện chuyển sang kết nối Connect-RPC client và Go WebSocket.
   - Cắt traffic Zalo từ Node cũ sang Go Core.

---

### Phase 4: Module Vệ Tinh, Cắt Fastify & Cắm Thêm Kênh Mới (Tuần 12-14+)

1. **Port các module vệ tinh**:
   - **Growth**: Scoring đa kênh, Campaign gửi tin hàng loạt (hỗ trợ Zalo, sau đó FB/WhatsApp), Automation flow.
   - **Intelligence & AI**: Tích hợp Dual-System AI (Jev phân loại intent 70ms + GOSO/LangChainGo gợi ý trả lời).
2. **Hoàn tất Cutover**:
   - Tắt hoàn toàn backend Fastify cũ.
3. **Cắm thêm Channel Gateways mới (Facebook, WhatsApp)**:
   - **Facebook Messenger Gateway**: Kết nối Meta Graph API Webhook, stream tin nhắn về Go Core qua `ChannelGatewayService`.
   - **WhatsApp Gateway**: Kết nối WhatsApp Cloud API.
   - **Không cần sửa đổi Domain Core**: Vì Core đã hoàn toàn channel-agnostic từ Phase 0.

---

## 4. Ma Trận Đánh Giá Rủi Ro & Biện Pháp Kiểm Soát

| Rủi ro | Mức độ | Hậu quả | Giải pháp kiểm soát |
|---|:---:|---|---|
| **Rate-limit / Khóa tài khoản kênh** | Cao | Sale mất liên lạc với khách hàng | Mỗi Channel Gateway tự chịu trách nhiệm rate-limiting và backoff của kênh đó (Zalo: 15s delay, FB: token bucket); Go Core không can thiệp cơ chế vật lý |
| **Xung đột định danh khách hàng (Identity Conflict)** | Trung bình | Gộp nhầm khách từ các kênh khác nhau | Chỉ tự động link profile khi trùng số điện thoại đã xác thực (Verified Phone). Các trường hợp trùng tên hoặc nghi ngờ đưa vào danh sách đề xuất để Sale xác nhận thủ công |
| **Data drift giữa Node & Go** | Trung bình | Dữ liệu trên UI bị lệch trong giai đoạn chuyển đổi | Chạy Shadow Testing tối thiểu 1 tuần; so sánh checksum dữ liệu tự động giữa 2 hệ thống trước khi cutover |
| **Exhaustion kết nối PostgreSQL** | Cao | Toàn bộ hệ thống sập do Go mở quá nhiều kết nối | Bắt buộc sử dụng PgBouncer làm middleware connection pool trước PostgreSQL; cấu hình max pool Go `pgx` nghiêm ngặt |

---

## 5. Kế Hoạch Hành Động Ngay (Next Action Items)

- [ ] **Bước 1**: Khởi tạo thư mục dự án `omni-go` với `go.mod`, Makefile và cấu hình Buf/SQLC.
- [ ] **Bước 2**: Viết bộ hợp đồng Protobuf đa kênh đầu tiên (`api/proto/channel/v1/gateway.proto` và `customer/v1/customer.proto`).
- [ ] **Bước 3**: Tạo nhánh tách `zca-js` sang service `omni-gateway-zalo` độc lập theo chuẩn gRPC `ChannelGatewayService`.
