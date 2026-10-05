# Human Takeover & Conversation Lease Specification

> **ĐẶC TẢ KIẾN TRÚC & THUẬT TOÁN ĐỒNG BỘ QUYỀN KIỂM SOÁT HỘI THOẠI (HUMAN TAKEOVER & MONOTONIC LEASE)**  
> **Mã tài liệu:** `SPEC-ARCH-GOSO-002`  
> **Bounded Contexts liên quan:**  
> - `internal/conversation` (BC 4 — Conversation & Media)  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge)  
> - `internal/channel` (BC 2 — Channel & Gateway)  
> **Trạng thái:** DRAFT / APPROVED FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, tên biến, bảng DB, endpoint giữ nguyên Tiếng Anh)  

---

## 1. Mục Tiêu & Vấn Đề Nghiệp Vụ (Context & Problem Statement)

Trong hệ thống CRM đa kênh kết hợp AI Agent (GOSO Engine) và nhân viên trực bàn (Human Agents):
1. **Xung đột phát ngôn (Speech Collision):** Khách hàng nhắn tin, LLM mất 2s - 5s để suy luận. Trong thời gian này, nhân viên mở Zalo/CRM gõ trả lời khách. Nếu không có cơ chế chặn, bot sẽ gửi tin nhắn đè lên câu trả lời của nhân viên, gây rối loạn ngữ cảnh và trải nghiệm xấu cho khách hàng.
2. **Tin nhắn muộn (Late Bot Replies):** Network lag hoặc queue delay khiến câu trả lời của Bot đến sau khi nhân viên đã vào hỗ trợ.
3. **Mất quyền kiểm soát (Lost Control):** Nhân viên muốn bot tạm dừng hoàn toàn trong phiên hỗ trợ nhưng không có cơ chế giữ trạng thái phân tán tin cậy.

**Giải pháp:** Áp dụng thuật toán **Monotonic Conversation Lease** kết hợp **Grace Period Hold** tại tầng Domain Aggregate `Conversation` của `omni-core`.

---

## 2. Máy Trạng Thái Quyền Kiểm Soát (Conversation Control State Machine)

Một hội thoại chuyển đổi giữa 4 trạng thái kiểm soát sau:

```
                      ┌─────────────────────────┐
                      │       BOT_ACTIVE        │
                      │  (AI Agent toàn quyền)  │
                      └────────────┬────────────┘
                                   │
             Nhân viên gửi tin     │     Bot gọi tool Handover /
             hoặc ấn "Takeover"    │     Khách yêu cầu gặp người
                                   ▼
                      ┌─────────────────────────┐
                      │    HUMAN_TAKEN_OVER     │
                      │ (Hold 30m, Bot câm nín) │
                      └────────────┬────────────┘
                                   │
                 Hết 30m Grace     │     Nhân viên bấm
                 không ai chat     │     "Trả quyền cho Bot"
                                   ▼
                      ┌─────────────────────────┐
                      │       BOT_ACTIVE        │
                      └─────────────────────────┘
```

### Các trạng thái chi tiết:

| Trạng thái (`AgentControlStatus`) | Mô tả hành vi | Inbound Dispatch sang GOSO? | Cho phép GOSO Reply? |
|---|---|---|---|
| `BOT_ACTIVE` | Bot tự do phản hồi tin nhắn khách hàng. | **Có** | **Có** |
| `HUMAN_TAKEN_OVER` | Nhân viên đang kiểm soát. Mọi câu trả lời từ GOSO bị từ chối (`409 Conflict`). | **Không** | **Không** |
| `BOT_MUTED` | Bot bị tắt thủ công bởi Admin (bảo trì hoặc khách blacklist). | **Không** | **Không** |
| `HANDOFF_PENDING` | Bot đề xuất chuyển giao cho người (chờ nhân viên tiếp nhận). | **Có** (chỉ context) | **Không** |

---

## 3. Thuật Toán Monotonic Conversation Lease

Thuật toán bảo đảm tính đúng đắn đồng thời (concurrency correctness) bằng cách kết hợp 2 trường dữ liệu:

1. **`agent_lease` (`int64`):** Số nguyên tăng đơn điệu (Monotonic Version Number). Mỗi khi có sự kiện thay đổi quyền kiểm soát hoặc nhân viên can thiệp, `agent_lease` được tăng thêm `1`.
2. **`agent_human_hold_until` (`TIMESTAMPTZ`):** Mốc thời gian Grace Period. Mặc định `HUMAN_REPLY_GRACE_MS = 30 phút` (1.800.000 ms), reset trượt mỗi khi nhân viên gửi tin nhắn mới.

### 3.1 Quy Tắc Nguyên Tử (Atomic Invariants)

```
Invariant 1:
Khi nhân viên (sender_type = 'agent') gửi tin nhắn vào hội thoại:
    agent_lease = agent_lease + 1
    agent_human_hold_until = now() + 30 minutes
    control_status = 'HUMAN_TAKEN_OVER'

Invariant 2:
Khi GOSO gửi webhook callback reply:
    IF now() < agent_human_hold_until:
        REJECT: Human is currently holding conversation
    IF request.expected_lease != conversation.agent_lease:
        REJECT: Stale lease (bot reply is outdated)
    ELSE:
        ACCEPT: Dispatch message to Channel
```

### 3.2 Sơ Đồ Xung Đột Đồng Thời (Race Condition Resolution)

```
[Khách hàng]        [omni-core Inbound]         [GOSO Engine]         [Nhân viên bàn]
     │                       │                        │                       │
     │ 1. Tin nhắn đến       │                        │                       │
     ├──────────────────────►│ (lease = 4)            │                       │
     │                       │ 2. Đẩy sang GOSO       │                       │
     │                       ├───────────────────────►│                       │
     │                       │ (kèm lease: 4)         │                       │
     │                       │                        │ (LLM suy luận 3s...)  │
     │                       │                        │                       │
     │                       │ 3. Nhân viên gửi tin   │                       │
     │                       │◄───────────────────────────────────────────────┤
     │                       │    [Bump lease -> 5]   │                       │
     │                       │    [Hold -> now + 30m] │                       │
     │                       │                        │                       │
     │                       │ 4. GOSO gửi Reply      │                       │
     │                       │    (lease: 4)          │                       │
     │                       │◄───────────────────────┤                       │
     │                       │                        │                       │
     │                       │ 5. Kiểm tra Lease:     │                       │
     │                       │    - Lease nhận: 4     │                       │
     │                       │    - Lease DB: 5       │                       │
     │                       │    - HoldUntil: ACTIVE │                       │
     │                       │    ==> TỪ CHỐI 409!    │                       │
     │                       │───────────────────────►│                       │
     │                       │ (Hủy, không gửi Zalo)  │                       │
```

---

## 4. Đặc Tả Cơ Sở Dữ Liệu & Entity Go DDD

### 4.1 Schema Bảng `conversations` (PostgreSQL Migration)

Bổ sung các trường sau vào bảng `conversations`:

```sql
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS agent_control_status VARCHAR(32) NOT NULL DEFAULT 'BOT_ACTIVE',
ADD COLUMN IF NOT EXISTS agent_lease BIGINT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS agent_human_hold_until TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS last_takeover_agent_id VARCHAR(64) NULL,
ADD COLUMN IF NOT EXISTS last_takeover_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_agent_lease 
ON conversations (id, agent_lease);

CREATE INDEX IF NOT EXISTS idx_conversations_hold_until 
ON conversations (agent_control_status, agent_human_hold_until) 
WHERE agent_human_hold_until IS NOT NULL;
```

### 4.2 Thiết Kế Domain Aggregate (`internal/conversation/domain`)

```go
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrHumanTakeoverActive = errors.New("conversation is currently taken over by human")
	ErrStaleLease          = errors.New("stale lease version: bot reply superseded")
	ErrBotMuted            = errors.New("ai agent is muted for this conversation")
)

type AgentControlStatus string

const (
	ControlStatusBotActive       AgentControlStatus = "BOT_ACTIVE"
	ControlStatusHumanTakenOver  AgentControlStatus = "HUMAN_TAKEN_OVER"
	ControlStatusBotMuted        AgentControlStatus = "BOT_MUTED"
	ControlStatusHandoffPending  AgentControlStatus = "HANDOFF_PENDING"
)

const DefaultHumanGracePeriod = 30 * time.Minute

// RecordHumanTakeover ghi nhận sự can thiệp của nhân viên và nâng lease đơn điệu.
func (c *Conversation) RecordHumanTakeover(agentStaffID string, customGrace ...time.Duration) {
	grace := DefaultHumanGracePeriod
	if len(customGrace) > 0 && customGrace[0] > 0 {
		grace = customGrace[0]
	}

	now := time.Now()
	holdUntil := now.Add(grace)

	c.agentLease++
	c.agentControlStatus = ControlStatusHumanTakenOver
	c.agentHumanHoldUntil = &holdUntil
	c.lastTakeoverAgentID = agentStaffID
	c.lastTakeoverAt = &now
	c.updatedAt = now

	c.record(ConversationTakeoverTriggered{
		ConversationID: c.id,
		TenantID:       c.tenantID,
		AgentStaffID:   agentStaffID,
		NewLease:       c.agentLease,
		HoldUntil:      holdUntil,
	})
}

// CanAgentReply kiểm tra điều kiện để bot được quyền gửi tin nhắn.
func (c *Conversation) CanAgentReply(expectedLease int64) error {
	if c.agentControlStatus == ControlStatusBotMuted {
		return ErrBotMuted
	}

	now := time.Now()
	if c.agentHumanHoldUntil != nil && now.Before(*c.agentHumanHoldUntil) {
		return ErrHumanTakeoverActive
	}

	if expectedLease > 0 && c.agentLease != expectedLease {
		return ErrStaleLease
	}

	return nil
}

// ReleaseTakeover trả quyền kiểm soát lại cho bot.
func (c *Conversation) ReleaseTakeover(operatorID string) {
	now := time.Now()
	c.agentLease++
	c.agentControlStatus = ControlStatusBotActive
	c.agentHumanHoldUntil = nil
	c.updatedAt = now

	c.record(ConversationTakeoverReleased{
		ConversationID: c.id,
		TenantID:       c.tenantID,
		OperatorID:     operatorID,
		NewLease:       c.agentLease,
	})
}
```

---

## 5. Xử Lý Tại Lớp Application & Giao Tiếp GOSO

### 5.1 Xử Lý Inbound Event (Bắn sang GOSO)

Khi gửi `InboundEvent` từ `omni-core` sang GOSO Engine (xem `SPEC-ARCH-GOSO-001`), `omni-core` bắt buộc phải kèm theo trường `current_lease`:

```json
{
  "event_id": "evt_01J8F3K0K1K2K3K4K5K6K7K8K9",
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "current_lease": 4,
  "agent_control_status": "BOT_ACTIVE",
  "message": {
    "id": "msg_01J8F3M0M1M2M3M4M5M6M7M8M9",
    "content": "Giá gói cước là bao nhiêu?",
    "sent_at": "2026-10-05T10:00:00Z"
  }
}
```

### 5.2 Xử Lý Callback Reply từ GOSO (`POST /api/integrations/goclaw/reply`)

Trong payload trả lời từ GOSO, GOSO echo lại trường `expected_lease`:

```json
{
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "expected_lease": 4,
  "reply_text": "Dạ giá gói cước là 500.000đ/tháng ạ.",
  "metadata": {
    "agent_id": "ag_01J8F0123456789"
  }
}
```

**Optimistic Atomic CAS Query (Bun ORM / SQL thuần):**

Để triệt tiêu hoàn toàn race condition ở tầng DB mà không cần Distributed Lock (Redis Redlock), `omni-core` sử dụng câu truy vấn cập nhật nguyên tử:

```sql
UPDATE conversations
SET 
    last_message_at = NOW(),
    last_message_snippet = $1,
    updated_at = NOW()
WHERE id = $2 
  AND agent_lease = $3
  AND (agent_human_hold_until IS NULL OR agent_human_hold_until < NOW())
  AND agent_control_status = 'BOT_ACTIVE';
```

- Nếu số dòng ảnh hưởng (`RowsAffected == 0`):
  1. Đọc lại trạng thái hiện tại của conversation.
  2. Xác định nguyên nhân: Hoặc do `agent_lease` bị bump, hoặc do `agent_human_hold_until` đang kích hoạt.
  3. Trả về mã HTTP `409 Conflict`:
     ```json
     {
       "success": false,
       "error_code": "CONVERSATION_TAKEN_OVER",
       "message": "Bot reply rejected: Human has taken over conversation",
       "current_lease": 5,
       "hold_remaining_seconds": 842
     }
     ```
  4. Hủy bỏ tác vụ gửi tin nhắn ra cổng Zalo/Telegram.

---

## 6. Handoff Tự Động từ AI sang Người (Bot-Initiated Handoff)

Khi AI Agent phát hiện các tình huống cần người can thiệp:
1. Khách hàng sử dụng từ ngữ giận dữ (Sentiment = Negative).
2. Khách chủ động yêu cầu: "Gặp nhân viên", "Cho gặp người thật", "Gọi quản lý".
3. AI không tìm thấy câu trả lời trong Knowledge Vault sau 2 lượt đối thoại.

### Tool Call Contract: `request_human_handoff`

GOSO kích hoạt tool gọi về `omni-core`:

```http
POST /api/integrations/goclaw/tools/handoff
Content-Type: application/json
x-goclaw-signature: <HMAC_SHA256>

{
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "reason": "CUSTOMER_REQUESTED_STAFF",
  "note": "Khách cần hỏi về hợp đồng thanh toán doanh nghiệp có hóa đơn VAT",
  "priority": "HIGH"
}
```

**Xử lý tại `omni-core`:**
1. Cập nhật `agent_control_status = 'HANDOFF_PENDING'`.
2. Tạo vé công việc (Ticket/Task) hoặc bắn WebSocket notification tới Dashboard của nhân viên trực quầy.
3. Phản hồi cho khách hàng câu tin nhắn đệm: *"Dạ em đã chuyển thông tin của anh/chị tới chuyên viên tư vấn. Bạn sẽ liên hệ lại ngay ạ!"*

---

## 7. Đặc Tả Real-time WebSocket Event Schemas (Dashboard Synchronization)

Hệ thống WebSocket Gateway (`internal/conversation/interfaces/ws`) phát sóng (broadcast) các sự kiện thay đổi quyền kiểm soát hội thoại tới toàn bộ dashboard của nhân viên và người giám sát (Supervisor) theo room `tenant:{tenant_id}:conversation:{conversation_id}`.

### 7.1 Sự Kiện `takeover:acquired` (Nhân Viên Tiếp Quản)
- **Kích hoạt:** Khi nhân viên ấn nút "Tiếp quản" trên UI hoặc gửi tin nhắn thủ công đầu tiên vào hội thoại.
- **Payload Schema:**
```json
{
  "event": "takeover:acquired",
  "tenant_id": "01923e5a-7b3c-7000-8000-000000000001",
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "agent_staff_id": "usr_01J8F10011223344",
  "agent_staff_name": "Nguyễn Văn Chuyên Viên",
  "agent_lease": 5,
  "agent_control_status": "HUMAN_TAKEN_OVER",
  "hold_until": "2026-10-05T10:45:00Z",
  "grace_period_seconds": 1800,
  "timestamp": "2026-10-05T10:15:00Z"
}
```

### 7.2 Sự Kiện `takeover:extended` (Gia Hạn Cửa Sổ Trượt 30 Phút)
- **Kích hoạt:** Nhân viên gửi thêm tin nhắn khi đang trong trạng thái `HUMAN_TAKEN_OVER`, cửa sổ trượt 30 phút tự động reset.
- **Payload Schema:**
```json
{
  "event": "takeover:extended",
  "tenant_id": "01923e5a-7b3c-7000-8000-000000000001",
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "agent_staff_id": "usr_01J8F10011223344",
  "agent_lease": 6,
  "agent_control_status": "HUMAN_TAKEN_OVER",
  "hold_until": "2026-10-05T10:55:00Z",
  "remaining_seconds": 1800,
  "timestamp": "2026-10-05T10:25:00Z"
}
```

### 7.3 Sự Kiện `takeover:released` (Trả Quyền Cho Bot)
- **Kích hoạt:** Nhân viên bấm "Trả quyền cho Bot" hoặc hết 30 phút Grace Period mà không có tin nhắn mới.
- **Payload Schema:**
```json
{
  "event": "takeover:released",
  "tenant_id": "01923e5a-7b3c-7000-8000-000000000001",
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "operator_id": "usr_01J8F10011223344",
  "agent_lease": 7,
  "agent_control_status": "BOT_ACTIVE",
  "hold_until": null,
  "reason": "MANUAL_RELEASE",
  "timestamp": "2026-10-05T10:30:00Z"
}
```

### 7.4 Sự Kiện `handoff:requested` (Bot Yêu Cầu Người Can Thiệp)
- **Kích hoạt:** AI Agent phát hiện câu hỏi ngoài phạm vi hiểu biết hoặc khách giận dữ/yêu cầu gặp người.
- **Payload Schema:**
```json
{
  "event": "handoff:requested",
  "tenant_id": "01923e5a-7b3c-7000-8000-000000000001",
  "conversation_id": "conv_01J8F2A0B1C2D3E4F5G6H7J8K9",
  "agent_control_status": "HANDOFF_PENDING",
  "reason": "CUSTOMER_REQUESTED_STAFF",
  "priority": "HIGH",
  "summary": "Khách cần hỏi về hợp đồng thanh toán doanh nghiệp có hóa đơn VAT",
  "current_lease": 4,
  "timestamp": "2026-10-05T10:14:30Z"
}
```

---

## 8. Metrics & Quan Sát Hệ Thống (Observability & Alerts)

Xuất bản metrics Prometheus tại Bounded Context `internal/conversation`:

| Metric Name | Loại | Labels | Mô tả |
|---|---|---|---|
| `crm_takeover_events_total` | Counter | `tenant_id`, `channel_type`, `trigger_type` | Số lần nhân viên can thiệp hội thoại. |
| `crm_bot_replies_suppressed_total` | Counter | `tenant_id`, `reason` (`stale_lease`, `human_hold`) | Số tin nhắn bot bị huỷ để tránh nói đè nhân viên. |
| `crm_human_hold_duration_seconds` | Histogram | `tenant_id` | Thời gian trung bình một hội thoại bị giữ quyền bởi người. |

---

## 9. Danh Sách Kiểm Tra Khi Triển Khai (DDD Checklist)

- [ ] Thuộc tính `agent_lease`, `agent_human_hold_until`, `agent_control_status` nằm trọn vẹn trong Aggregate Root `Conversation`.
- [ ] Không sử dụng biến toàn cục hoặc in-memory state lẻ tẻ ngoài DB Aggregate và Cache.
- [ ] Mọi tin nhắn gửi đi từ nhân viên đều tự động kích hoạt `RecordHumanTakeover`.
- [ ] Endpoint `/reply` của GOSO bắt buộc phải thực hiện Atomic CAS check trước khi dispatch tin nhắn sang Channel Gateway.
- [ ] Ghi đầy đủ Audit Log khi xảy ra tình huống từ chối tin nhắn bot (`AI_REPLY_SUPPRESSED_BY_HUMAN`).
