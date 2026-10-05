# GOSO Bridge & Webhook Contract Specification

> **ĐẶC TẢ KIẾN TRÚC & HỢP ĐỒNG GIAO TIẾP GIAO THỨC GIỮA OMNI-CORE VÀ GOSO ENGINE**  
> **Mã tài liệu:** `SPEC-ARCH-GOSO-001`  
> **Bounded Contexts liên quan:**  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge)  
> - `internal/conversation` (BC 4 — Conversation & Media)  
> - `internal/channel` (BC 2 — Channel & Gateway)  
> **Trạng thái:** DRAFT / APPROVED FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ code, identifier, endpoint, payload giữ nguyên Tiếng Anh)  

---

## 1. Mục tiêu & Bối cảnh Nghiệp vụ (Context & Goal)

GOSO (tiền thân là GoClaw Engine) đóng vai trò là não bộ AI Agent điều phối hội thoại thông minh, truy xuất Knowledge Vault và kích hoạt Tools (Agent Hands) cho hệ thống CRM đa kênh.

Hệ thống `omni-core` (viết bằng Golang theo chuẩn Domain-Driven Design) đóng vai trò là:
1. **Lớp Gateway Hội Thoại (Channel Ingestion & Egress):** Tiếp nhận tin nhắn người dùng từ các kênh (Zalo cá nhân, Zalo OA, Telegram, Facebook), làm giàu ngữ cảnh (Customer context) và đẩy sự kiện Inbound sang GOSO.
2. **Lớp Thực Thi Cầu Nối (Bridge Webhook Endpoints):** Tiếp nhận phản hồi từ GOSO (`reply`), phục vụ truy vấn lịch sử hội thoại (`context`), và proxy streaming tập tin đính kèm từ MinIO (`media`).
3. **Lớp Bảo Vệ & Điều Phối (Gatekeeper & Safety):** Xác thực chữ ký mã hóa HMAC SHA-256, chống tấn công Replay Attack qua Nonce + Timestamp skew, giới hạn tốc độ (Rate limiting) và ngắt bot khi nhân viên can thiệp (Human Takeover).

---

## 2. Kiến trúc Luồng Dữ Liệu 2 Chiều (Bi-Directional Pipeline)

```
 [Người dùng Zalo/OA/Telegram]
              │
              ▼
   [internal/channel] (Channel Adapter)
              │
              ▼ (Save raw message)
 [internal/conversation] (Conversation BC)
              │
              ▼ (Domain Event: MessageReceived)
  [Ingest Pipeline / Gate Filter]
  - Kiểm tra Blacklist / Group Mention Gate
  - Kiểm tra Conversation Lease (Human Takeover)
  - Kiểm tra Daily Reply Cap
              │
   (Hợp lệ)   ▼
 [internal/aiagent/infrastructure/harness] (GOSO Adapter)
              │
              ▼ (HTTP POST kèm HMAC SHA-256)
     =======================================
               GOSO AGENT ENGINE
     (LLM Orchestration, Memory, Vault, Tools)
     =======================================
              │
              ▼ (HTTP Webhook Callback)
 [internal/aiagent/interfaces/http/goclaw_bridge.go]
  - Verify HMAC, Timestamp, Nonce
  - Idempotency Deduplication
              │
              ├─────────────────────────────┬─────────────────────────────┐
              ▼                             ▼                             ▼
    POST /reply                   POST /context                 POST /media
    (Gửi tin nhắn trả lời)       (Kéo 50 tin nhắn cũ)          (Stream MinIO proxy)
              │                             │                             │
              ▼                             ▼                             ▼
     [internal/channel]          [internal/conversation]         [MinIO Storage Engine]
 (Bắn tin ra Zalo/Telegram)     (Đọc Read Projection DTO)       (Stream file binary)
```

---

## 3. Đặc tả Giao Thức Bảo Mật (Security & Wire Protocol)

Mọi yêu cầu HTTP giữa GOSO và `omni-core` (cả chiều Inbound lẫn Outbound) bắt buộc phải tuân thủ nghiêm ngặt mô hình xác thực Zero-Trust thông qua HMAC SHA-256.

### 3.1 HTTP Headers Quy Định

| Header Name | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `x-goclaw-signature` | `string` | **Có** | Chữ ký HMAC SHA-256 (hex-encoded lower-case). |
| `x-goclaw-timestamp` | `string` | **Có** | Unix Timestamp thời điểm tạo request (tính bằng giây hoặc mili-giây). |
| `x-goclaw-nonce` | `string` | **Có** | Chuỗi ngẫu nhiên (UUID v4 hoặc nano-id) dùng 1 lần chống Replay Attack. |
| `x-goclaw-tenant` | `string` | **Có** | `tenant_id` của tổ chức trong `omni-core`. |
| `x-goclaw-version` | `string` | Không | Phiên bản giao thức Bridge. Mặc định `1`. |
| `Content-Type` | `string` | **Có** | `application/json` (Payload JSON UTF-8). |

### 3.2 Thuật toán Ký & Xác Thực (HMAC Signature Algorithm)

1. **Chuỗi dữ liệu ký (Signing String):**
   ```
   signing_payload = timestamp + "." + nonce + "." + raw_request_body_bytes
   ```
   *Lưu ý:* `raw_request_body_bytes` phải là chuỗi byte thô nguyên bản của body HTTP, không được parse qua struct rồi serialize lại để tránh sai lệch ký tự khoảng trắng hoặc thứ tự thuộc tính JSON.

2. **Khóa bí mật (Shared Secret):**
   - Mỗi `tenant_id` sở hữu một khóa bí mật `bridge_hmac_secret` được cấu hình tại bảng `goclaw_providers` hoặc `ai_agent_bindings`.
   - Nếu `tenant_id` không có secret trong DB: Hệ thống từ chối `401 Unauthorized` ngay lập tức (không cho phép silent bypass ở môi trường production).

3. **Chống Replay Attack & Timestamp Skew:**
   - **Độ lệch thời gian cho phép:** `|server_time - timestamp| <= 300 giây` (5 phút). Quá 300s -> Trả mã `401 Unauthorized: timestamp expired`.
   - **Kiểm tra Nonce (Idempotency Cache):**
     - Nonce được lưu trong Redis hoặc In-memory TTL Ring Buffer (`ttl = 10 phút`).
     - Nếu Nonce đã tồn tại trong khoảng thời gian TTL -> Trả mã `409 Conflict: Duplicate bridge request`.

4. **Rate Limiting chống Brute-Force Auth:**
   - Nếu một IP gửi sai chữ ký HMAC 5 lần liên tiếp trong 60 giây -> Chặn IP trong 15 phút (`429 Too Many Requests`).

---

## 4. Chi tiết Hợp Đồng Webhook Endpoints (Bridge Endpoints)

Lớp HTTP Server: `internal/aiagent/interfaces/http/goclaw_bridge.go`

### 4.1 Endpoint 1: Tiếp nhận câu trả lời (`POST /api/integrations/goclaw/reply`)

Được GOSO gọi khi AI Agent hoàn thành quá trình suy luận và sinh ra câu trả lời cho khách hàng.

#### Request Headers:
```http
POST /api/integrations/goclaw/reply HTTP/1.1
Host: api.admatrix.vn
Content-Type: application/json
x-goclaw-tenant: ten_01J8F3G9V0123456789ABCDEF0
x-goclaw-timestamp: 1728100000
x-goclaw-nonce: 550e8400-e29b-41d4-a716-446655440000
x-goclaw-signature: 4a2b9f68e3d5c7a10982348576abcdef1234567890abcdef1234567890abcdef
```

#### Request Payload JSON:
```json
{
  "request_id": "req_01J8F3H5001122334455667788",
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "channel_type": "zalo_personal",
  "channel_account_id": "acc_01J8F100112233445566778899",
  "external_conversation_id": "zalo_thread_987654321",
  "external_sender_id": "zalo_user_123456789",
  "sender_display_name": "Nguyễn Văn A",
  "reply_text": "Dạ em chào anh! Em là trợ lý AI từ Admatrix. Em có thể tư vấn gói dịch vụ tự động hóa Zalo cho anh ạ.",
  "attachments": [
    {
      "type": "image",
      "url": "https://storage.admatrix.vn/attachments/quote_preview.png",
      "mime_type": "image/png",
      "file_name": "quote_preview.png",
      "size_bytes": 1048576
    }
  ],
  "suggested_actions": ["Xem báo giá", "Gặp tư vấn viên"],
  "estimated_typing_delay_ms": 1500,
  "metadata": {
    "agent_id": "ag_01J8F0123456789",
    "prompt_tokens": 420,
    "completion_tokens": 58,
    "model": "goso-omni-v2"
  }
}
```

#### Xử lý tại `omni-core`:
1. Kiểm tra chữ ký HMAC và Tenant ID.
2. Kiểm tra `ConversationLease` tại `internal/conversation`: Nếu trong lúc GOSO sinh câu trả lời mà nhân viên đã gửi tin nhắn chiếm quyền (`HumanTakeoverActive == true`) -> Huỷ lệnh trả lời, trả về `409 Conflict: Human has taken over conversation`.
3. Dispatch lệnh `SendMessageCommand` tới `internal/channel` để đẩy tin nhắn qua Zalo/Telegram.
4. Ghi nhận tin nhắn vào bảng `messages` với `sender_type = 'ai_assistant'`.
5. Bắn sự kiện Audit qua `pkg/logger.LogAudit` với action `AI_AGENT_REPLY_DISPATCHED`.

#### Response JSON:
```json
{
  "success": true,
  "message_id": "msg_01J8F3J9998877665544332211",
  "status": "QUEUED_FOR_DELIVERY",
  "dispatched_at": "2026-10-05T10:00:01.500Z"
}
```

---

### 4.2 Endpoint 2: Kéo ngữ cảnh lịch sử (`POST /api/integrations/goclaw/context`)

GOSO gọi endpoint này để tải tối đa 50 tin nhắn gần nhất kèm thông tin Customer Lead để nạp vào Context Window của LLM.

#### Request Payload JSON:
```json
{
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "limit": 50,
  "include_customer_profile": true,
  "include_media_metadata": true
}
```

#### Xử lý tại `omni-core` (Pragmatic CQRS Projection):
- **Không hydrate Domain Aggregate** `Conversation` đầy đủ vào bộ nhớ.
- Dùng Query Handler `GetConversationContextQuery` quét trực tiếp từ bảng `messages` và `contacts` (sử dụng batch join hoặc projection struct).
- Đảo thứ tự tin nhắn thành Chronological (tin cũ trước, tin mới nhất sau) để đưa vào context LLM.

#### Response JSON:
```json
{
  "conversation": {
    "id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
    "channel_type": "zalo_personal",
    "external_thread_id": "zalo_thread_987654321",
    "created_at": "2026-10-01T08:00:00Z",
    "contact": {
      "id": "ct_01J8F1AAAAABBBBBCCCCCDDDDD",
      "display_name": "Anh Hoàng",
      "phone": "0912345678",
      "lead_status": "POTENTIAL",
      "lifecycle_stage": "OPPORTUNITY",
      "tags": ["Quan_Tam_CRM", "Ngan_Sach_Cao"]
    }
  },
  "messages": [
    {
      "id": "msg_01J8F200000000000000000001",
      "sender_type": "contact",
      "sender_name": "Anh Hoàng",
      "content": "Bên em có hỗ trợ tích hợp Zalo cá nhân không?",
      "content_type": "text",
      "sent_at": "2026-10-05T09:55:00Z"
    },
    {
      "id": "msg_01J8F200000000000000000002",
      "sender_type": "ai_assistant",
      "sender_name": "AI Bot",
      "content": "Dạ chào anh, bên em có sẵn giải pháp kết nối Zalo cá nhân đa tài khoản ạ.",
      "content_type": "text",
      "sent_at": "2026-10-05T09:55:05Z"
    }
  ],
  "total_returned": 2
}
```

---

### 4.3 Endpoint 3: Proxy truyền phát tập tin đa phương tiện (`POST /api/integrations/goclaw/media`)

Các liên kết media từ Zalo CDN thường hết hạn sau vài giờ đến vài ngày. Endpoint này nhận yêu cầu từ GOSO và stream binary từ kho lưu trữ nội bộ (MinIO S3 Object Storage) của CRM.

#### Request Payload JSON:
```json
{
  "message_id": "msg_01J8F200000000000000000001",
  "media_id": "med_01J8F2M1M2M3M4M5M6M7M8M9M0",
  "preferred_format": "original"
}
```

#### Xử lý tại `omni-core`:
1. Kiểm tra quyền sở hữu `tenant_id` của tập tin.
2. Tra cứu bucket và object key trong MinIO qua `internal/conversation/infrastructure/media`.
3. Thiết lập Header HTTP trả về:
   - `Content-Type: image/jpeg` (hoặc `audio/mp4`, `application/pdf`)
   - `Content-Disposition: inline; filename="..."`
   - `Content-Length: <size>`
4. Dùng `io.Copy(w, minioObjectReader)` để stream dữ liệu với bộ đệm `32KB`, không nạp toàn bộ file vào RAM để bảo vệ Garbage Collector.

---

## 5. Luồng Inbound Dispatch từ Omni-Core sang GOSO

Khi có tin nhắn đến từ khách hàng qua webhook Zalo, `omni-core` sẽ thực hiện gửi sang GOSO theo quy trình:

```
[Tin nhắn Zalo đến] 
   └── Ingest Worker kiểm tra Invariant:
        ├── Channel Account đã được liên kết với Agent? (Query ai_agent_bindings)
        ├── Conversation Lease có đang ở trạng thái BOT_ACTIVE?
        ├── Có bị chặn bởi Group Mention Gate? (Nếu là group chat thì có @bot không?)
        └── Có vượt hạn mức ngày (daily_reply_cap)?
   └── NẾU THỎA MÃN TẤT CẢ:
        └── Đẩy Job vào Outbound Worker Pool
             └── Gửi HTTP POST sang GOSO Engine: {GOSO_BASE_URL}/api/v1/inbound/events
                  └── Ký Header HMAC SHA-256 (x-goclaw-signature)
```

#### Inbound Event Payload JSON:
```json
{
  "event_id": "evt_01J8F3K0K1K2K3K4K5K6K7K8K9",
  "tenant_id": "ten_01J8F3G9V0123456789ABCDEF0",
  "agent_id": "ag_01J8F0123456789",
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "channel_type": "zalo_personal",
  "channel_account_id": "acc_01J8F100112233445566778899",
  "external_sender_id": "zalo_user_123456789",
  "sender_display_name": "Nguyễn Văn A",
  "message": {
    "id": "msg_01J8F3M0M1M2M3M4M5M6M7M8M9",
    "content": "Giá gói cước nâng cao 5 tài khoản là bao nhiêu em?",
    "content_type": "text",
    "sent_at": "2026-10-05T10:00:00Z"
  }
}
```

---

## 6. Khả Năng Phục Hồi & Xử Lý Sự Cố (Resilience & Error Taxonomy)

Tuân thủ nghiêm ngặt chuẩn hệ thống tại `omni-core/pkg/resilience` và `omni-core/pkg/errors`:

| Nhóm lỗi (Classification) | Trường hợp cụ thể | Hành vi hệ thống | Chiến lược phục hồi |
|---|---|---|---|
| **Transient** | GOSO trả về HTTP 429, 502, 503, 504 hoặc TCP Dial Timeout | Đưa job vào hàng đợi thử lại | Exponential Backoff with Jitter (Thử lại 3 lần: 1s, 3s, 9s) |
| **Terminal** | Payload sai JSON, Agent ID không tồn tại, Tenant bị khóa | Huỷ bỏ request ngay lập tức | Ghi log Terminal qua `pkg/logger`, đẩy vào bảng `system_outbound_dlq` |
| **SecurityPolicy** | Sai chữ ký HMAC SHA-256, Nonce trùng lặp, Timestamp skew > 5 phút | Từ chối kết nối, ngắt session | Ghi log Security Alert, mở Circuit Breaker nếu vượt ngưỡng cảnh báo |

### Chiến lược Circuit Breaker cho GOSO:
- Nếu tỷ lệ gọi GOSO bị timeout hoặc lỗi 5xx vượt quá **40% trong 60 giây**:
  - Trạng thái Circuit Breaker chuyển sang `OPEN`.
  - Tạm dừng gửi tin nhắn sang GOSO, tự động kích hoạt chế độ Fallback: Báo trạng thái "Hệ thống AI đang bảo trì" hoặc chuyển hướng trực tiếp cho nhân viên chăm sóc.
  - Sau 30 giây, chuyển trạng thái `HALF-OPEN` để thăm dò kiểm tra với 5% lưu lượng.

---

## 7. Tiêu Chuẩn Giám Sát & Logging (Observability Standard)

Mọi yêu cầu gửi và nhận qua Cầu nối GOSO bắt buộc phải phát sinh Structured Log JSON ra `stdout` phục vụ lưu trữ tại Grafana Loki:

```json
{
  "timestamp": "2026-10-05T10:00:01.520Z",
  "level": "INFO",
  "trace_id": "tr_01J8F3N0N1N2N3N4N5N6N7N8N9",
  "tenant_id": "ten_01J8F3G9V0123456789ABCDEF0",
  "bounded_context": "aiagent",
  "submodule": "goclaw_bridge",
  "action_taken": "GOCLAW_BRIDGE_REPLY_PROCESSED",
  "duration_ms": 42,
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "status_code": 200,
  "agent_id": "ag_01J8F0123456789"
}
```

---

## 8. Danh Sách Kiểm Tra Khi Triển Khai (Go DDD Checklist)

- [ ] Lớp `goclaw_bridge.go` nằm tại `internal/aiagent/interfaces/http/`.
- [ ] Không import ngược từ `internal/conversation` vào domain của `internal/aiagent` (Dùng Domain Service / Port Interface).
- [ ] Xác thực chữ ký HMAC chạy trên slice byte thô (`io.LimitReader(r.Body, 1MB)`).
- [ ] Nonce được kiểm tra O(1) chống replay attack với TTL bộ nhớ đệm tự dọn dẹp.
- [ ] Toàn bộ lỗi được map sang `pkg/errors` với phân loại rõ ràng (`Transient`, `Terminal`, `SecurityPolicy`).
