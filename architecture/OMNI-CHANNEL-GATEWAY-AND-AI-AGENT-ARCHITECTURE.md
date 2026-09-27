# Kiến trúc Thống nhất Kênh Xã hội (Omni-Channel Gateways) & Tự động hóa AI Agent

Tài liệu này chuẩn hóa mô hình tích hợp tất cả các kênh mạng xã hội/tin nhắn (Zalo Personal, Zalo OA, WhatsApp, Facebook Messenger, Telegram) và cơ chế tự động kích hoạt AI Agents trò chuyện trong hệ sinh thái Omni.

---

## 1. Nguyên lý Kiến trúc Cốt lõi (Universal Social Gateway Architecture)

Tất cả các kênh giao tiếp mạng xã hội trong hệ thống đều tuân theo mô hình **Ports & Adapters (Hexagonal Architecture)** kết hợp **Sidecar Daemon Pattern**:

```
[Khách hàng]
     │
     ▼ (Giao thức mạng xã hội: Zalo/WhatsApp/FB/Telegram)
┌─────────────────────────────────────────────────────────────────────────┐
│                           CHANNEL GATEWAYS                              │
│                                                                         │
│  ┌─────────────────────────┐     ┌───────────────────────────────────┐  │
│  │   Zalo Daemon (Node.js) │     │  WhatsApp Daemon (Node.js/Baileys)│  │
│  │   (zca-js socket)       │     │  (Baileys socket)                 │  │
│  └───────────┬─────────────┘     └─────────────────┬─────────────────┘  │
│              │ gRPC / HTTP                         │ HTTP Webhook       │
│  ┌───────────┴─────────────┐     ┌─────────────────┴─────────────────┐  │
│  │ Facebook Webhook Router │     │     Telegram Bot Webhook Router   │  │
│  └───────────┬─────────────┘     └─────────────────┬─────────────────┘  │
└──────────────┼─────────────────────────────────────┼────────────────────┘
               │                                     │
               ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      OMNI-CORE (Golang DDD)                             │
│                                                                         │
│  1. Inbound Webhook / Stream Normalizer                                 │
│     - Chuyển đổi payload riêng của từng kênh thành Unified Domain Event │
│     - Tìm hoặc tạo Contact (Customer 360) và Conversation tương ứng     │
│     - Ghi nhận Message vào bảng `messages` (định danh tenant_id)         │
│                                                                         │
│  2. Domain Event: `MessageReceivedEvent`                                │
│                                                                         │
│  3. AI Agent Auto-Reply Router (internal/service)                       │
│     - Kiểm tra cờ AI Auto-Reply: ChannelAccount / Conversation          │
│     - Dispatch hội thoại sang External AI Agent (OpenAI/Claude/Dify)     │
│     - Nhận phản hồi câu trả lời từ LLM                                 │
│                                                                         │
│  4. Outbound Channel Router (`internal/channel/application`)            │
│     - Xác định đúng Channel Type & Gateway Target                       │
│     - Gọi `ChannelGateway.SendMessage(ctx, msg)`                        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼ (Gửi tin phản hồi)
                    [Channel Gateway -> Khách hàng]
```

---

## 2. Chuẩn hóa Cấu trúc Mã nguồn (Repository Layout)

Để không làm ô nhiễm môi trường biên dịch của Go Core (`internal/`), mã nguồn được phân định rõ:

| Thành phần | Vị trí thư mục | Công nghệ | Nhiệm vụ |
| :--- | :--- | :--- | :--- |
| **Omni Core** | `omni-core/internal/channel/` | Golang DDD | Chứa Interface (Ports), Inbound Normalizer, Outbound Router |
| **AI Agent BC** | `omni-core/internal/service/` | Golang DDD | Quản lý AI Agents, dispatching, execution logs |
| **Zalo Daemon** | `daemons/zalo-gateway/` | Node.js | Kết nối Zalo cá nhân qua WebSocket |
| **WhatsApp Daemon** | `gateways/whatsapp/` | Node.js / Baileys | Kết nối WhatsApp Web qua Baileys socket |
| **Telegram Adapter** | Tích hợp trực tiếp Go | Go stdlib / HTTP | Nhận webhook từ Telegram Bot API |
| **Facebook Adapter**| Tích hợp trực tiếp Go | Go stdlib / HTTP | Nhận webhook từ Meta Graph API |

---

## 3. Cơ chế Hoạt động Chung cho Mọi Kênh (Standard Lifecycle)

### Bước 1: Tiếp nhận tin nhắn (Inbound Message Ingestion)
Mọi Gateway khi nhận tin nhắn từ người dùng phải đẩy về endpoint nội bộ của `omni-core`:
- **Định dạng dữ liệu chuẩn hóa**:
  ```json
  {
    "tenant_id": "UUID",
    "channel_type": "whatsapp | zalo_personal | zalo_oa | facebook | telegram",
    "channel_account_id": "UUID",
    "sender_external_id": "string (Số điện thoại / Zalo UID / Facebook PSID)",
    "sender_name": "string",
    "external_message_id": "string",
    "content": "string",
    "attachments": [...]
  }
  ```

### Bước 2: Hợp nhất Định danh (Identity & Conversation Resolution)
- `omni-core` kiểm tra `sender_external_id` với bảng `channel_profiles`.
- Nếu chưa có: Tạo Contact mới trong Bounded Context `customer`.
- Tìm hoặc mở mới một `Conversation` tương ứng.
- Lưu tin nhắn vào cơ sở dữ liệu và phát sinh Domain Event `MessageReceivedEvent`.

### Bước 3: Định tuyến Phản hồi AI (AI Agent Auto-Dispatching)
1. **Kiểm tra Điều kiện**:
   - `channel_account.ai_auto_reply_enabled == true`
   - Hoặc `conversation.ai_mode == "AUTO"` (nhân viên chưa bấm Take Over thủ công).
2. **Kích hoạt AI Agent**:
   - Tải `system_prompt` và cấu hình từ bảng `external_agents`.
   - Trích xuất ngữ cảnh: 10-20 tin nhắn gần nhất của cuộc trò chuyện + thông tin khách hàng (Contact tags, custom fields).
   - Gọi LLM Provider (OpenAI, Claude, Dify, FastGPT).
3. **Xử lý Phản hồi**:
   - Nhận câu trả lời từ AI.
   - Ghi nhận lịch sử vào bảng `agent_executions`.
   - Tạo tin nhắn `Message` mới với loại `sender_type = "AI_AGENT"`.

### Bước 4: Định tuyến Gửi tin (Outbound Routing)
- `OutboundRouter` nhận tin nhắn cần gửi, dựa vào `channel_type` để gọi adapter tương ứng:
  - Nếu là `whatsapp`: Gọi API của `WhatsApp Baileys Gateway`.
  - Nếu là `zalo_personal`: Gọi RPC sang `Zalo Sidecar Daemon`.
  - Nếu là `facebook`: Gọi Graph API của Meta.
  - Nếu là `telegram`: Gọi Telegram Bot SendMessage API.

---

## 4. Các Invariants & Nguyên tắc Bảo vệ (Domain Safeguards)

1. **Human Takeover Invariant**: Khi nhân viên (Agent là người) chủ động gửi tin nhắn trong cuộc trò chuyện, cờ `ai_mode` của cuộc trò chuyện đó lập tức chuyển sang `HUMAN_CONTROL` trong một khoảng thời gian (ví dụ 30 phút), ngăn không cho AI xen ngang vào lúc con người đang tư vấn.
2. **Rate Limiting & Anti-Ban**: Mọi Gateway gửi tin ra ngoài đều phải đi qua hàng đợi (queue) và bộ kiểm soát tần suất để chống bị nhà mạng khóa tài khoản (WhatsApp ban, Zalo checkpoint).
3. **Tenant Data Isolation**: 100% payload, prompt, ngữ cảnh chat và logs của AI Agent đều gắn chặt với `tenant_id`, tuyệt đối không rò rỉ dữ liệu giữa các doanh nghiệp.
