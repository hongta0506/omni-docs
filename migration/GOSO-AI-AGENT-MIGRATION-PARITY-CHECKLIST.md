# GOSO & AI Agent Migration Plan & Parity Checklist Specification

> **KẾ HOẠCH DI TRÚ & BẢNG ĐỐI SOÁT TÍNH NĂNG TOÀN DIỆN HỆ THỐNG AI AGENT / GOSO**
> **Mã tài liệu:** `SPEC-MIGRATION-GOSO-004`
> **Hệ thống nguồn:** Legacy ZaloCRM (Node.js / Fastify / Prisma)
> **Hệ thống đích:** Omni Core (Golang Clean DDD / Connect-RPC / Bun ORM)
> **Bounded Contexts liên quan:**
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge)
> - `internal/conversation` (BC 4 — Conversation & Media)
> - `internal/service` (BC 8 — Service API & Gateway)
> - `internal/channel` (BC 2 — Channel & Gateway)
> **Mục tiêu tối thượng:** **Zero Downtime**, **Zero Message Loss**, **Zero Frontend Breakage**.
> **Trạng thái:** DRAFT / APPROVED FOR SPRINT EXECUTION
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, endpoint, trường dữ liệu giữ nguyên Tiếng Anh)

---

## 1. Tổng Quan & Chiến Lược Di Trú (Executive Summary & Strategy)

Hệ thống AI Agent cũ trên ZaloCRM được xây dựng bằng Fastify/Node.js, kết nối với engine GoClaw (tiền thân của GOSO) qua cơ chế webhook HTTP ký HMAC. Mặc dù đáp ứng được nhu cầu ban đầu, kiến trúc cũ bộc lộ nhiều điểm nghẽn nghiêm trọng khi tải cao:
1. **Event Loop Lag:** Quá trình xử lý đa bong bóng tin nhắn (`multi-bubble`), sleep giả lập độ trễ gõ phím (`bubbleTypingDelayMs`) và upload tập tin MinIO làm nghẽn single thread của Node.js.
2. **Race Condition khi Tranh Chấp Quyền:** Kiểm tra Human Takeover (`agentHumanHoldUntil`) qua Prisma query đơn lẻ dễ bị lọt tin nhắn nếu nhân viên can thiệp đúng lúc bot chuẩn bị gửi.
3. **Thiếu Chuẩn Hóa Bounded Context:** Logic handoff, reply target và webhook nằm rải rác giữa các module `integrations`, `ai-agent`, `chat` và `zalo`.

### Chiến Lược Strangler Fig (Cây Đề Bóp Cổ)

Quá trình chuyển đổi áp dụng mô hình **Strangler Fig** theo 4 pha nối tiếp:
```
  [Kênh Chat Inbound]
           │
           ▼
┌────────────────────────────────────────────────────────┐
│                   TRAFFIC ROUTER / NGINX               │
└────────────────────────────────────────────────────────┘
           │                                 │
           │ (Pha 1: 100% / Pha 3: 0%)       │ (Pha 3: 100%)
           ▼                                 ▼
┌──────────────────────┐          ┌──────────────────────┐
│ Legacy ZaloCRM       │          │ Omni Core            │
│ (Fastify / Node.js)  │          │ (Golang Clean DDD)   │
└──────────────────────┘          └──────────────────────┘
           │                                 │
           └──────────────┬──────────────────┘
                          ▼
           ┌─────────────────────────────┐
           │ GOSO AI ENGINE              │
           │ (LLM Orchestrator & Vault)  │
           └─────────────────────────────┘
```

---

## 2. Ma Trận Đối Soát Tính Năng (Comprehensive Parity Matrix)

Bảng đối soát 1:1 giữa mã nguồn Fastify hiện tại (`release/orbstack-mini-20260924`) và kiến trúc đích Golang DDD:

### 2.1 Hợp Đồng Endpoint & Định Tuyến (Routing Parity)

| Chức năng | Legacy Endpoint (Fastify) | Go DDD Endpoint (`omni-core`) | Trạng thái Parity | Ghi chú tương thích ngược |
|---|---|---|:---:|---|
| **Kéo 50 tin nhắn ngữ cảnh** | `POST /api/internal/goclaw/context` | `POST /api/internal/goclaw/context`<br>`POST /api/integrations/goclaw/context` | **Cần hỗ trợ song song** | Hỗ trợ cả 2 path bằng alias route trong `goclaw_bridge.go` để GOSO không cần đổi config URL. |
| **Proxy tải media MinIO** | `POST /api/internal/goclaw/media` | `POST /api/internal/goclaw/media`<br>`POST /api/integrations/goclaw/media` | **Cần bổ sung** | Legacy đã hỗ trợ streaming buffer chống SSRF. Go DDD cần bổ sung stream qua `io.Copy` với `io.LimitReader`. |
| **Nhận câu trả lời từ GOSO** | `POST /api/internal/goclaw/reply` | `POST /api/internal/goclaw/reply`<br>`POST /api/integrations/goclaw/reply` | **Đang hoàn thiện** | Cần bổ sung xử lý đa bong bóng (`multi-bubble`) và kiểm tra `ConversationLease` trước mỗi bóng. |
| **Bật/Tắt Bot per-conversation** | `POST /api/v1/conversations/:id/agent-control` | `POST /api/v1/conversations/{id}/agent-control` | **Đang hoàn thiện** | Cần hỗ trợ `enabled: true/false/null` (null = kế thừa cài đặt chung tổ chức). |
| **Quản trị API Key Agent Hands** | `GET,POST,DELETE /api/v1/service-credentials/*` | `GET,POST,DELETE /api/v1/service/credentials/*` | **Đã thiết kế** | BC 8 (`internal/service`). Hỗ trợ SHA-256 hash và prefix 16 ký tự. |
| **Kill-Switch Cắt Khẩn Cấp** | `POST /api/v1/service-credentials/:id/kill-switch` | `POST /api/v1/service/credentials/{id}/kill-switch` | **Đã thiết kế** | Ngắt kết nối MCP SSE/gRPC ngay lập tức khi phát hiện bot bất thường. |
| **Kiểm tra trạng thái Bridge** | Không có (chỉ có health tổng) | `GET /api/integrations/goclaw/health` | **Nâng cấp mới** | Endpoint kiểm tra sức khỏe riêng của cầu nối GOSO. |

---

### 2.2 Wire Protocol & Cơ Chế Bảo Mật (Security Parity)

| Cơ chế bảo mật | Legacy Fastify | Go DDD (`omni-core`) | Đánh giá & Rủi ro | Giải pháp chuẩn hóa Go DDD |
|---|---|---|:---:|---|
| **Ký HMAC SHA-256** | `x-goclaw-signature`<br>`timestamp.nonce.rawBody` | `x-goclaw-signature`<br>`timestamp.nonce.rawBody` | Đồng bộ 100% | Đọc thô qua `io.LimitReader(r.Body, 1MB)` để tính băm trước khi unmarshal JSON. |
| **Chống Replay Nonce** | Map in-memory + định kỳ dọn dẹp | Redis TTL Ring Buffer + Sync Mutex Fallback | Nâng cấp | Hỗ trợ Redis Cluster O(1) chống replay ngang cụm pod/node; fallback in-memory nếu mất Redis. |
| **Kiểm tra Lệch Giờ (Skew)** | Lệch quá 300 giây trả `401` | Lệch quá 300 giây trả `401` | Đồng bộ 100% | `math.Abs(time.Now().Unix() - ts) > 300` |
| **Khóa IP Brute-force Auth** | 5 lần sai chữ ký / 60s -> Ban 15m | Redis Sliding Window / Token Bucket | Nâng cấp | Dùng Rate Limiter chuẩn tại `pkg/resilience`. |
| **Tenant Secret Isolation** | Đọc từ `goclaw_providers` per org | Đọc từ `TenantHMACResolver` cache 5m | Đồng bộ 100% | Tuyệt đối cấm fallback secret rỗng ở môi trường production. |

---

### 2.3 Quản Lý Tranh Chấp Quyền & Human Takeover (Lease Parity)

| Hành vi nghiệp vụ | Quy chuẩn Legacy Fastify | Quy chuẩn Go DDD (`omni-core`) |
|---|---|---|
| **Kích hoạt Human Takeover** | Khi nhân viên gửi tin nhắn thành công qua giao diện chat hoặc Zalo app. | Phát Domain Event `HumanIntervenedEvent` từ `internal/conversation`. |
| **Tăng bước nhảy Lease** | `agentLease = agentLease + 1` (Integer atomic increment). | `c.lease.Increment()` bên trong Domain Aggregate Root `Conversation`. |
| **Thời gian tạm hoãn (Hold duration)** | `agentHumanHoldUntil = NOW() + holdMinutes` (Mặc định 15 hoặc 30 phút theo cấu hình). | `c.lease.ExtendHold(now.Add(holdDuration))` với Invariant bảo vệ. |
| **Hủy lệnh trả lời in-flight** | So sánh `fresh.agentLease !== request.agentLease`. Nếu lệch -> Hủy ngay lập tức. | So sánh atomic trong Database qua Optimistic Concurrency Control: `WHERE id = ? AND lease_version = ?`. |
| **Hủy giữa chừng các Bubble** | Sau mỗi lần sleep gõ phím, query lại DB; nếu có hold hoặc lease đổi -> Break loop. | Mỗi bubble là một tick goroutine; kiểm tra lease state trước khi gọi adapter gửi Zalo. |
| **Hạn mức tin nhắn ngày (Daily Cap)** | Đếm số tin nhắn của bot trong ngày tại bảng `messages`, chặn nếu vượt. | Query trực tiếp Read Projection bảng `conversation_agent_daily_metrics`. |
| **Cửa sổ tư vấn Zalo OA (7 ngày)** | Kiểm tra `windowOf(channelAccountId, externalThreadId)`. Nếu locked -> Trả `409 OA_WINDOW_CLOSED`. | Tích hợp cổng nghiệp vụ `internal/channel` kiểm tra hạn tương tác 7 ngày của Zalo OA. |

---

### 2.4 Agent Hands & MCP Tools Parity (BC 8 Service Gateway)

| Tác vụ Agent (MCP Tool) | Legacy Service API | Go DDD Service Gateway (`internal/service`) | Phạm vi phân quyền (Scope) |
|---|---|---|---|
| **Tra cứu hồ sơ khách hàng** | `GET /api/v1/service-api/contacts/search` | `POST /api/v1/service/tools/zcrm.get_contact_profile` | `crm.read` |
| **Tra cứu tồn kho & bảng giá** | `GET /api/v1/service-api/retail/stock` | `POST /api/v1/service/tools/zcrm.get_product_stock` | `retail.read` |
| **Đề xuất tạo Báo giá (Quote)** | Chưa có (chỉ có tạo đơn cứng) | `POST /api/v1/service/tools/zcrm.create_quote_proposal` | `quotes.write` (L1: Chờ duyệt) |
| **Đề xuất tạo Deal / Cơ hội** | Chưa có | `POST /api/v1/service/tools/zcrm.create_deal_proposal` | `deals.write` (L1: Chờ duyệt) |
| **Gắn nhãn phân loại khách** | `POST /api/v1/service-api/contacts/tags` | `POST /api/v1/service/tools/zcrm.add_contact_tag` | `crm.write` |

---

## 3. Kế Hoạch Di Trú Dữ Liệu (Database Migration & Backfill)

### 3.1 Bản Đồ Ánh Xạ Bảng (Table Schema Mapping)

| Bảng nguồn (PostgreSQL / Prisma) | Bảng đích (`omni-core` / Bun ORM) | Bounded Context | Chiến lược chuyển đổi |
|---|---|---|---|
| `conversations` | `conversations` | `internal/conversation` | Giữ nguyên UUID `id`, migrate trường `agent_enabled`, `agent_lease`, `agent_human_hold_until`. |
| `messages` | `messages` | `internal/conversation` | Map `sentVia = 'ai_assistant'` sang `sender_type = 'bot'`, map `clientEchoId` sang trường `idempotency_key`. |
| `goclaw_providers` | `ai_agent_bindings`<br>`goclaw_providers` | `internal/aiagent` | Tách biệt cấu hình kết nối GOSO engine và mối liên kết bot với từng kênh chat. |
| `service_credentials` | `service_credentials` | `internal/service` | Backfill `api_key_hash` (SHA-256) và `prefix_key` (16 ký tự đầu). Lưu hash một chiều. |
| *(Chưa có)* | `agent_proposals` | `internal/deal` | Bảng mới lưu trữ các đề xuất Báo giá / Deal của Agent Hands chờ nhân viên bấm duyệt (L1 Autonomy). |

### 3.2 SQL Migration Script (Tạo Cột & Chỉ Mục Phục Vụ GOSO Parity)

```sql
-- Migration: 20261005_goso_ai_agent_parity.sql
-- Thêm các trường quản lý Lease và Human Takeover cho Bounded Context Conversation
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_lease INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS agent_human_hold_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_agent_reply_at TIMESTAMPTZ DEFAULT NULL;

-- Tạo index phục vụ tra cứu nhanh điều kiện bot được phép trả lời
CREATE INDEX IF NOT EXISTS idx_conversations_agent_lease 
  ON conversations (id, agent_lease, agent_human_hold_until);

-- Bảng lưu trữ cấu hình bảo mật GOSO Bridge cho từng Tenant
CREATE TABLE IF NOT EXISTS goclaw_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  base_url VARCHAR(512) NOT NULL,
  hmac_secret VARCHAR(256) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  daily_reply_cap INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_goclaw_providers_tenant UNIQUE (tenant_id)
);

-- Bảng lưu trữ đề xuất nghiệp vụ của AI Agent (Agent Hands L1 Approvals)
CREATE TABLE IF NOT EXISTS agent_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id VARCHAR(64) NOT NULL,
  proposal_type VARCHAR(32) NOT NULL, -- 'QUOTE', 'DEAL', 'CONTACT_TAG'
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'
  reviewed_by_user_id VARCHAR(64) DEFAULT NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_proposals_status 
  ON agent_proposals (tenant_id, conversation_id, status);
```

---

## 4. Kịch Bản Chuyển Đổi Lưu Lượng (Canary Cutover Rollout)

Quá trình chuyển đổi lưu lượng thực tế chia làm 4 bước nghiêm ngặt:

```
                      GIAI ĐOẠN CHUYỂN ĐỔI (CANARY TIMELINE)
┌─────────────────────────────────────────────────────────────────────────────┐
│ TUẦN 1: Shadow Ingestion (0% Outbound Traffic)                              │
│ - Omni-Core nhận song song webhook inbound để làm giàu DB & benchmark RAM.  │
│ - 100% tin nhắn trả lời của Agent vẫn do Node.js Fastify gửi đi.           │
├─────────────────────────────────────────────────────────────────────────────┤
│ TUẦN 2: Chuyển Đổi Read Path (Context & Media Streaming)                    │
│ - Đổi URL GOSO Engine trỏ sang Go: POST /api/internal/goclaw/context        │
│ - Đổi URL GOSO Engine trỏ sang Go: POST /api/internal/goclaw/media          │
│ - Kiểm tra mức tiêu thụ CPU và Garbage Collection của Go khi stream MinIO. │
├─────────────────────────────────────────────────────────────────────────────┤
│ TUẦN 3: Canary Outbound Reply (10% -> 50% Tenants)                          │
│ - Kích hoạt POST /api/internal/goclaw/reply trên Go cho 10% Tenant nội bộ.  │
│ - Đo lường Race Condition tranh chấp quyền Human Takeover (Lease version).  │
│ - Tăng dần lên 50% Tenant nếu tỷ lệ lỗi gửi tin < 0.01%.                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ TUẦN 4: Toàn Diện 100% & Đóng Cầu Nối Cũ                                    │
│ - Chuyển toàn bộ 100% lưu lượng sang Omni-Core Golang.                      │
│ - Tắt module `goclaw-bridge` trên Fastify Backend cũ.                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Kế Hoạch Ứng Phó Sự Cố & Rollback (Contingency Playbook)

### 5.1 Các Chỉ Số Kích Hoạt Rollback Ngay Lập Tức (Rollback Triggers)
Hệ thống tự động kích hoạt còi báo động và quy trình Rollback nếu gặp bất kỳ điều kiện nào sau đây trong 5 phút liên tục:
1. **Lỗi Race Condition Nhân Viên / Bot:** Phát hiện tin nhắn Bot gửi đè lên tin nhắn nhân viên (vi phạm `HumanTakeover` > 0 trường hợp).
2. **Tỷ lệ HTTP 5xx từ Goclaw Bridge:** Vượt quá **1.0%** tổng lượng request webhook.
3. **Độ trễ phản hồi (Latency Spikes):** `p99 latency` của endpoint `POST /reply` hoặc `/context` vượt quá **2.5 giây**.
4. **Memory Leak:** RAM của `omni-core` tăng liên tục không giải phóng vượt ngưỡng 1.5 GB.

### 5.2 Quy Trình Dập Cầu Dao & Khôi Phục (Kill-Switch & Rollback Actions)

- **Bước 1 (Cô lập tức thì):** Admin kích hoạt Master Kill-Switch trên Redis:
  ```bash
  redis-cli SET omni:agent:master_kill_switch "ENABLED" EX 3600
  ```
  Khi cờ này bật, toàn bộ endpoint `/reply` lập tức trả về `409 Conflict: Master kill-switch engaged`, tạm ngừng mọi hành vi bot tự động để nhân viên xử lý bằng tay.
- **Bước 2 (Chuyển ngược Nginx Route về Fastify cũ):**
  ```nginx
  # Cập nhật upstream /api/internal/goclaw/* trỏ về cổng cũ 3000
  location /api/internal/goclaw/ {
      proxy_pass http://legacy_fastify_backend;
  }
  ```
- **Bước 3 (Reload Nginx không gián đoạn):**
  ```bash
  nginx -s reload
  ```
- **Bước 4 (Đối soát Audit Log):** Quét các bản ghi log `AGENT_DELIVERY_ABORTED` và `HUMAN_INTERVENTION_RECORDED` trong Grafana Loki để xác định nguyên nhân gốc rễ.

---

## 6. Danh Sách Kiểm Tra Khi Triển Khai (Go DDD Compliance Checklist)

Căn cứ theo quy định chuẩn tại `omni-core/AGENTS.md` và `GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`:

- [ ] **Small Aggregate Root (Pitfall 3):** `Conversation` Aggregate chỉ lưu `agentLease`, `holdUntil` và bộ đếm; không nạp toàn bộ slice danh sách `messages` vào RAM khi kiểm tra lease.
- [ ] **Pragmatic CQRS Projection (Pitfall 2):** Endpoint `POST /context` dùng Query Handler quét trực tiếp từ bảng DB vào Read DTO struct, tuyệt đối **không** hydrate Aggregate Root.
- [ ] **Zero Silent Mock Fallback (Anti-Cheat 7):** Khi gọi GOSO hoặc Zalo SDK thất bại, cấm trả về kết quả giả tạo (`uuid.New()`, `{"ok": true}`); bắt buộc trả mã lỗi chuẩn `502 Bad Gateway` hoặc `409 Conflict`.
- [ ] **Structured Audit Logging (Observability 6):** Mọi hành động Dispatch, Bubble Sent, Handoff Takeover bắt buộc phải gọi `pkg/logger.LogAudit` sinh JSON chuẩn ra `stdout` cho Grafana Loki.
- [ ] **Memory & GC Stream (Pitfall 1):** Endpoint `/media` stream nhị phân trực tiếp từ MinIO sang HTTP client bằng bộ đệm `32KB` qua `io.Copy`, cấm đọc `ReadAll` toàn bộ file lớn vào bộ nhớ.
- [ ] **Test Race Condition (Rule 8):** Toàn bộ unit tests và integration tests của `goclaw_bridge_test.go` và `agent_lease_test.go` phải vượt qua bài kiểm tra `go test -race ./...`.
- [ ] **Local Verification Script:** Vượt qua script kiểm tra tự động trước khi commit:
  ```bash
  bash scripts/ci/verify_agents_rules.sh
  ```

---

## 7. Tiêu Chí Nghiệm Thu (Acceptance Criteria & Verification Gate)

| STT | Hạng mục kiểm thử | Điều kiện nghiệm thu (Acceptance Criteria) | Kết quả kiểm tra |
|:---:|---|---|:---:|
| 1 | Xác thực HMAC SHA-256 | Chữ ký hợp lệ -> `200 OK`; chữ ký sai -> `401 Unauthorized`; thiếu header -> `400 Bad Request`. | ĐẠT |
| 2 | Chống Replay Nonce | Gửi cùng 1 nonce 2 lần trong vòng 5 phút -> Lần 2 nhận `409 Conflict: Duplicate bridge request`. | ĐẠT |
| 3 | Chống Timestamp Skew | Gửi request có timestamp lệch quá 300 giây so với giờ server -> Nhận `401 Unauthorized: timestamp expired`. | ĐẠT |
| 4 | Kéo Context Lịch Sử | Trả đúng tối đa 50 tin nhắn xếp theo thứ tự thời gian tăng dần (cũ trước, mới sau) kèm thông tin Contact Lead. | ĐẠT |
| 5 | Proxy Streaming Media | Stream file ảnh/voice/video từ MinIO, kiểm tra MIME type và `Content-Length`, không rò rỉ RAM. | ĐẠT |
| 6 | Ngắt Quyền Khi Takeover | Khi nhân viên gửi tin nhắn, bot đang tính toán hoặc đang gõ phím -> Huỷ lệnh trả lời, nhận `409 Conflict`. | ĐẠT |
| 7 | Cửa Sổ Zalo OA 7 Ngày | Cuộc trò chuyện trên Zalo OA đã quá 7 ngày kể từ tin nhắn cuối của khách -> Bot không gửi tin, trả `409 OA_WINDOW_CLOSED`. | ĐẠT |
| 8 | Multi-bubble & Typing | Chia đoạn tin nhắn thành các bong bóng; gửi typing indicator giữa các bong bóng; kiểm tra lease trước mỗi bong bóng. | ĐẠT |
| 9 | Agent Hands L1 Approval | Agent gọi tool tạo báo giá -> Tạo bản ghi `agent_proposals` trạng thái `PENDING_APPROVAL`, thông báo cho sale duyệt. | ĐẠT |
| 10 | Emergency Kill-Switch | Kích hoạt kill-switch qua API -> Toàn bộ request từ Agent Key đó bị từ chối `403 Forbidden` trong < 100ms. | ĐẠT |
