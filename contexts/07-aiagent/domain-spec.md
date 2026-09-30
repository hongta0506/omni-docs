# AI Agent & Knowledge — Đặc Tả Domain & Invariants

> Bounded Context: `internal/aiagent`  
> Trách nhiệm: Quản lý Cấu hình AI Copilot (GoClaw Providers, AI Agents, Hands-free mode), Cổng kiểm duyệt phản hồi tự động (Agent Gate / Approval Queue), Cơ sở tri thức doanh nghiệp & RAG (Knowledge Base & Company Profile), Radar vận hành bất thường (Ops Radar), và Việc cần xử lý (Work Items).

---

## 1. Ubiquitous Language & Core Aggregates

### 1.1 Aggregate Root: `AIAgentConfig` & `AgentGate`
Đại diện cho cấu hình trợ lý AI gắn với từng kênh hoặc toàn Tenant.

```go
package domain

import (
	"errors"
	"time"
	"github.com/google/uuid"
)

type AgentMode string
const (
	ModeCopilot  AgentMode = "copilot"   // Chỉ gợi ý bản nháp cho Sale duyệt (GOSO Approval Gate)
	ModeHandsFree AgentMode = "hands_free" // Tự động gửi tin nhắn khi độ tự tin cao
	ModeOff      AgentMode = "off"
)

type AIAgentConfig struct {
	id               uuid.UUID
	tenantID         uuid.UUID
	name             string
	mode             AgentMode
	providerID       uuid.UUID        // GoClaw Provider (Anthropic, DeepSeek, OpenAI)
	modelName        string           // claude-3-5-sonnet, deepseek-chat
	systemPrompt     string
	temperature      float64
	minConfidence    float64          // Ngưỡng tự động gửi (vd: 0.85)
	activeHoursJSON  []byte           // Khung giờ trực đêm / ngày nghỉ
	assignedAccounts []uuid.UUID      // Áp dụng cho các nick nào
	isActive         bool
	createdAt        time.Time
	updatedAt        time.Time
}
```

#### Invariants & Safety Gates:
1. **Safety Gate Default**: Mặc định mọi AI Agent khi mới tạo bắt buộc ở chế độ `copilot`. Chế độ `hands_free` chỉ được bật khi Tenant cấu hình đầy đủ giới hạn hạn mức (Rate limit) và có xác nhận của Quản trị viên.
2. **Confidence Threshold**: Trong chế độ `hands_free`, nếu điểm tin cậy do mô hình đánh giá (`confidence < minConfidence`), bắt buộc chuyển luồng sang `WorkItem` cho nhân viên phê duyệt thủ công.
3. **Blacklist Keywords Invariant**: Nếu phát hiện các từ khóa nhạy cảm (khiếu nại, lừa đảo, chuyển khoản, hoàn tiền), AI bị cấm tự động gửi và phải chuyển khẩn cấp sang nhân viên.

---

### 1.2 Entity: `KnowledgeDoc` & `CompanyProfile`
Quản lý cơ sở dữ liệu tri thức nội bộ phục vụ RAG (Retrieval-Augmented Generation).

```go
type DocStatus string
const (
	DocPending   DocStatus = "pending_embedding"
	DocIndexed   DocStatus = "indexed"
	DocFailed    DocStatus = "failed"
)

type KnowledgeDoc struct {
	id          uuid.UUID
	tenantID    uuid.UUID
	title       string
	content     string
	category    string        // chính sách giá, bảo hành, quy trình
	tokenCount  int
	chunkCount  int
	status      DocStatus
	qdrantColID string        // ID collection vector
	createdAt   time.Time
	updatedAt   time.Time
}
```

---

### 1.3 Aggregate Root: `OpsRadarSignal` & `WorkItem`

```go
type RadarSeverity string
const (
	SeverityInfo     RadarSeverity = "info"
	SeverityWarning  RadarSeverity = "warning"
	SeverityCritical RadarSeverity = "critical"
)

type OpsRadarSignal struct {
	id          uuid.UUID
	tenantID    uuid.UUID
	signalType  string        // SLA_BREACH, CHECKPOINT_SPIKE, AGENT_REJECT_HIGH
	severity    RadarSeverity
	description string
	metadata    []byte
	isResolved  bool
	resolvedAt  *time.Time
	createdAt   time.Time
}

type WorkItem struct {
	id             uuid.UUID
	tenantID       uuid.UUID
	assignedUserID *uuid.UUID
	conversationID uuid.UUID
	messageDraft   string
	reason         string        // LOW_CONFIDENCE, SENSITIVE_KEYWORD
	status         string        // pending, approved, rejected
	createdAt      time.Time
}
```

---

## 2. Validated Aggregate Wrapper

```go
package domain

type ValidatedAIAgentConfig struct {
	inner *AIAgentConfig
}

func (a *AIAgentConfig) Validate() (*ValidatedAIAgentConfig, error) {
	if a.tenantID == uuid.Nil {
		return nil, errors.New("aiagent.validation: tenant_id is required")
	}
	if a.name == "" {
		return nil, errors.New("aiagent.validation: name is required")
	}
	if a.providerID == uuid.Nil {
		return nil, errors.New("aiagent.validation: provider_id is required")
	}
	if a.temperature < 0.0 || a.temperature > 2.0 {
		return nil, errors.New("aiagent.validation: temperature must be between 0.0 and 2.0")
	}
	return &ValidatedAIAgentConfig{inner: a}, nil
}

func (v *ValidatedAIAgentConfig) Config() *AIAgentConfig {
	return v.inner
}

---

## 3. Pluggable AI Harness & Multi-Agent Swarm Domain Types

### 3.1 Value Object: `AgentRole` & `SpecializedAgentSpec`

```go
type AgentRole string

const (
	AgentRoleSupervisorRouter AgentRole = "supervisor_router" // Phân loại ý định, điều phối bầy agent
	AgentRoleKnowledgeFAQ    AgentRole = "knowledge_faq"     // RAG Vector Search tra cứu chính sách
	AgentRoleSalesCommerce   AgentRole = "sales_commerce"    // Tra cứu hàng hóa, tính giá, lên đơn nháp
	AgentRoleTechSupport     AgentRole = "tech_support"      // Hướng dẫn kỹ thuật, thu thập thông tin lỗi
	AgentRoleSentimentEscalate AgentRole = "sentiment_escalate" // Canh gác cảm xúc, kích hoạt Safe Handoff
)

type SpecializedAgentSpec struct {
	Role         AgentRole        `json:"role"`
	SystemPrompt string           `json:"systemPrompt"`
	ModelConfig  ModelConfigVO    `json:"modelConfig"`
	AllowedTools []string         `json:"allowedTools"` // Danh sách tên Tool được phép thực thi
	MaxTurns     int              `json:"maxTurns"`     // Giới hạn số lượt suy luận tối đa
}
```

### 3.2 Value Object: `ToolCallDefinition` & `ToolResult`

```go
type ToolCallDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	TargetBC    string                 `json:"targetBC"` // "deal", "customer", "marketing"
	Parameters  map[string]interface{} `json:"parameters"`
}

type ToolExecutionResult struct {
	ToolCallID string    `json:"toolCallId"`
	ToolName   string    `json:"toolName"`
	OutputJSON string    `json:"outputJson"`
	Error      string    `json:"error,omitempty"`
	ExecutedAt time.Time `json:"executedAt"`
}
```

### 3.3 Value Object: `ApprovalGateVerdict`

```go
type GateDecision string

const (
	DecisionAutoSend     GateDecision = "auto_send"     // Gửi trực tiếp tới khách hàng
	DecisionDraftCopilot GateDecision = "draft_copilot" // Đẩy bản nháp cho Sale duyệt
	DecisionBlockAlert   GateDecision = "block_alert"   // Chặn phát ngôn và gửi cảnh báo
)

type ApprovalGateVerdict struct {
	Decision        GateDecision `json:"decision"`
	ConfidenceScore float64      `json:"confidenceScore"`
	TriggeredRules  []string     `json:"triggeredRules"`
	DraftContent    string       `json:"draftContent"`
	EvaluatedAt     time.Time    `json:"evaluatedAt"`
}
```

```
