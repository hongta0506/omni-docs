# Đặc Tả Kiến Trúc Pluggable AI Harness & Multi-Agent Swarm

> **Bounded Context:** `internal/aiagent` (AI Agent & Knowledge BC)  
> **Package Go:** `omni-core/internal/aiagent`  
> **Mục tiêu:** Chuẩn hóa cổng kết nối suy luận AI đa tầng (Pluggable Harness Adapter), cơ chế bầy Agent chuyên trách (Multi-Agent Swarm & Intent Router), Tool Calling liên Bounded Context và Cổng kiểm duyệt phản hồi tự động (Copilot vs Hands-Free Safety Gates).

---

## 1. Tổng Quan Kiến Trúc Pluggable Harness

### 1.1 Vấn Đề Thiết Kế Cũ & Định Hướng Mới
- **Hệ thống cũ:** Bị phụ thuộc cứng vào GoClaw/GOSO qua REST proxy (`/goclaw-providers`). Nếu GOSO gián đoạn hoặc doanh nghiệp muốn chạy model nội bộ (Ollama/vLLM) nhằm tối ưu chi phí và bảo mật dữ liệu, hệ thống không thể tự mở rộng.
- **Kiến trúc mới (Pluggable AI Harness):** Trừu tượng hóa hoàn toàn tầng suy luận LLM bằng **Port & Adapters (Hexagonal Architecture)**. `omni-core` không quan tâm mô hình chạy ở đâu (GOSO, OpenAI Cloud, hay On-Premise GPU), chỉ giao tiếp qua chuẩn duy nhất: `AIAgentHarnessPort`.

```
                      ┌──────────────────────────────────────┐
                      │    Conversation Inbound Event Stream │
                      │   (MessageReceived / IntentTrigger)  │
                      └──────────────────┬───────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────────┐
│                        AI Agent & Knowledge BC                                  │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │               Multi-Agent Swarm & Intent Router                         │   │
│   │   - Intent Classification (CSKH / Báo Giá / Kỹ Thuật / Human Request)   │   │
│   │   - Context Assembly (Conversation History + Customer Profile)          │   │
│   └───────────────┬─────────────────────────────────────────┬───────────────┘   │
│                   │                                         │                   │
│       ┌───────────▼───────────┐                 ┌───────────▼───────────┐       │
│       │ FAQ / Knowledge Agent │                 │ Deal & Ordering Agent │       │
│       │ (RAG Vector Search)   │                 │ (Tool Calling Engine) │       │
│       └───────────┬───────────┘                 └───────────┬───────────┘       │
│                   │                                         │                   │
│                   └────────────────────┬────────────────────┘                   │
│                                        │                                        │
│   ┌────────────────────────────────────▼────────────────────────────────────┐   │
│   │                Safety Gate & Approval Queue Engine                      │   │
│   │   - Confidence Score Evaluation (minConfidence >= 0.85)                 │   │
│   │   - Copilot Draft Injection (gợi ý Sale) vs Hands-free (Tự động gửi)   │   │
│   │   - Rate Limit, Working Hours Check & Sensitive Keyword Sanitizer       │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
│                                        │                                        │
│   ┌────────────────────────────────────▼────────────────────────────────────┐   │
│   │                      AIAgentHarnessPort (Go Port)                       │   │
│   └──────┬─────────────────────────────┼─────────────────────────────┬──────┘   │
└──────────┼─────────────────────────────┼─────────────────────────────┼──────────┘
           │                             │                             │
┌──────────▼──────────┐       ┌──────────▼──────────┐       ┌──────────▼──────────┐
│ GOSO / GoClaw       │       │ OpenAI-Compatible   │       │ Embedded Go Engine  │
│ Adapter (HMAC Auth) │       │ Adapter (Ollama,    │       │ (Rule-based Fallback│
│                     │       │ vLLM, DeepSeek,     │       │ & Token Estimator)  │
│                     │       │ LiteLLM, FastGPT)   │       │                     │
└─────────────────────┘       └─────────────────────┘       └─────────────────────┘
```

---

## 2. Đặc Tả Core Domain & Harness Port

### 2.1 Domain Port Interface (`AIAgentHarnessPort`)
Đặt tại `internal/aiagent/domain/harness_port.go`:

```go
package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// InferenceRole đại diện vai trò trong chuỗi hội thoại LLM.
type InferenceRole string

const (
	RoleSystem    InferenceRole = "system"
	RoleUser      InferenceRole = "user"
	RoleAssistant InferenceRole = "assistant"
	RoleTool      InferenceRole = "tool"
)

// InferenceMessage đơn vị tin nhắn gửi vào context window.
type InferenceMessage struct {
	Role       InferenceRole  `json:"role"`
	Content    string         `json:"content"`
	ToolCallID string         `json:"toolCallId,omitempty"`
	ToolCalls  []ToolCallSpec `json:"toolCalls,omitempty"`
}

// ToolCallSpec định nghĩa cuộc gọi hàm do LLM sinh ra.
type ToolCallSpec struct {
	ID        string `json:"id"`
	Name      string `json:"name"`      // vd: "search_product", "create_order_draft"
	Arguments string `json:"arguments"` // JSON payload
}

// ToolDefinition đăng ký cho LLM hiểu để thực thi function calling.
type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"` // JSONSchema
}

// HarnessRequest tham số đầu vào cho suy luận AI.
type HarnessRequest struct {
	TenantID        uuid.UUID          `json:"tenantId"`
	ProviderID      uuid.UUID          `json:"providerId"`
	ModelName       string             `json:"modelName"`
	Messages        []InferenceMessage `json:"messages"`
	Tools           []ToolDefinition   `json:"tools,omitempty"`
	Temperature     float64            `json:"temperature"`
	MaxTokens       int                `json:"maxTokens"`
	Stream          bool               `json:"stream"`
	Timeout         time.Duration      `json:"timeout"`
}

// HarnessResponse kết quả trả về từ Adapter.
type HarnessResponse struct {
	Message          InferenceMessage `json:"message"`
	FinishReason     string           `json:"finishReason"` // "stop", "tool_calls", "length"
	PromptTokens     int              `json:"promptTokens"`
	CompletionTokens int              `json:"completionTokens"`
	TotalTokens      int              `json:"totalTokens"`
	LatencyMs        int64            `json:"latencyMs"`
}

// StreamChunk khối dữ liệu stream thời gian thực (SSE).
type StreamChunk struct {
	DeltaContent string        `json:"deltaContent"`
	ToolCall     *ToolCallSpec `json:"toolCall,omitempty"`
	IsLast       bool          `json:"isLast"`
	Err          error         `json:"err,omitempty"`
}

// AIAgentHarnessPort hợp đồng bắt buộc cho mọi nhà cung cấp mô hình.
type AIAgentHarnessPort interface {
	// Execute đồng bộ - đợi sinh trọn vẹn câu trả lời.
	Execute(ctx context.Context, req HarnessRequest) (*HarnessResponse, error)
	// Stream truyền phát token thời gian thực (SSE token stream).
	Stream(ctx context.Context, req HarnessRequest) (<-chan StreamChunk, error)
	// HealthCheck kiểm tra trạng thái sống của endpoint LLM.
	HealthCheck(ctx context.Context, providerID uuid.UUID) error
}
```

---

## 3. Kiến Trúc Bầy Agent Chuyên Trách (Multi-Agent Swarm)

Thay vì dùng một System Prompt khổng lồ gây ảo giác và tốn chi phí token, hệ thống phân rã thành **Mạng lưới Agent Chuyên Trách (Swarm)**:

```
[Inbound Message từ Khách hàng]
              │
              ▼
┌──────────────────────────────────────────────┐
│        1. Supervisor / Intent Router         │
│  - Phân loại ngữ cảnh & ý định người dùng    │
│  - Xác định Agent chuyên môn tiếp quản       │
└──────┬───────────────┬───────────────┬───────┘
       │               │               │
       ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│  Agent CSKH  ││  Agent Sale  ││  Agent Tech  │
│  - Tra cứu   ││  - Báo giá   ││  - Hướng dẫn │
│    RAG docs  ││  - Chốt đơn  ││    sửa lỗi   │
│  - Gợi ý FAQ ││  - Check tồn ││  - Nhận log  │
└──────┬───────┘└──────┬───────┘└──────┬───────┘
       │               │               │
       └───────────────┼───────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│       2. Tool Execution Coordinator          │
│  (Gọi API nội bộ `deal`, `customer`, `rag`)  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│         3. Safety & Approval Gate            │
│  - Hands-Free: Gửi thẳng khách (Confidence)  │
│  - Copilot: Bắn draft về UI cho Sale duyệt   │
└──────────────────────────────────────────────┘
```

### 3.1 Danh Mục Agent Chuyên Trách
1. **Supervisor Router Agent**:
   - Sử dụng model siêu nhẹ (Fast & Low Cost: `gpt-4o-mini`, `deepseek-chat`, hoặc `qwen2.5:3b`).
   - Nhiệm vụ: Phân loại ý định (`intent: inquiry_faq`, `intent: buy_product`, `intent: complaint_rage`, `intent: human_agent_request`).
2. **Knowledge & FAQ Agent**:
   - Tích hợp vector search `pgvector` / `qdrant`.
   - Trả lời quy chế đổi trả, chính sách đại lý, địa chỉ cửa hàng.
3. **Commerce & Deal Agent (Tool Calling)**:
   - Được gắn danh sách Tools: `query_product_stock`, `calculate_quotation`, `create_lead_deal`.
   - Thực thi tạo đơn nháp vào Bounded Context `internal/deal`.
4. **Sentiment & Escalation Agent (Ops Radar)**:
   - Chạy nền đánh giá cảm xúc (Sentiment Analysis).
   - Nếu phát hiện khách tức giận (`anger_level > 0.8`), lập tức ngắt bot, chuyển sang chế độ `Safe Human Handoff` và báo động nhân viên trực.

---

## 4. Cơ Chế Tool Calling Liên Bounded Context

Để đảm bảo tính độc lập giữa các Bounded Context theo kiến trúc Clean DDD:
- AI Agent **KHÔNG BAO GIỜ** được truy vấn trực tiếp DB của BC khác.
- AI Agent gọi Tool thông qua **In-Process CQRS Commands / Connect-RPC Services**:

```go
type ToolRegistry interface {
	RegisterTool(name string, desc string, schema map[string]interface{}, handler ToolHandler)
	ExecuteTool(ctx context.Context, name string, argsJSON string) (string, error)
}
```

### Danh Mục Tools Chuẩn Trong Hệ Thống:
| Tên Tool | Bounded Context Đích | Mô Tả | Tham Số |
|---|---|---|---|
| `get_product_info` | `internal/deal` | Tra cứu giá niêm yết, tồn kho và khuyến mãi | `sku`, `product_name` |
| `create_deal_draft`| `internal/deal` | Khởi tạo đơn hàng nháp từ hội thoại | `contact_id`, `items`, `discount_code` |
| `update_customer_tag` | `internal/customer` | Gắn nhãn phân loại khách sau tư vấn | `contact_id`, `tag_name` |
| `schedule_appointment` | `internal/marketing` | Đặt lịch hẹn tư vấn trực tiếp | `phone`, `datetime`, `service_type` |

---

## 5. Quy Trình Vận Hành Safety Gate (Copilot vs Hands-Free)

```
[Kết quả sinh ra từ LLM]
           │
           ▼
   [Đo lường Confidence]
           │
     ┌─────┴─────────────────────────┐
     │ Điểm >= minConfidence (0.85)  │ Điểm < minConfidence (0.85)
     │ VÀ Mode == 'hands_free'       │ HOẶC Mode == 'copilot'
     ▼                               ▼
[Kiểm tra khung giờ trực]      [Tạo Draft Suggestion]
     │                               │
     ├─► Trong giờ: Gửi khách ngay   └─► Đẩy Socket.IO `ai:draft_ready`
     └─► Ngoài giờ: Gửi kèm thông báo    vào khung chat của Sale
```

### Bảng So Sánh Hai Chế Độ An Toàn:
- **Chế độ Copilot (Trợ lý đồng hành - Khuyến nghị mặc định):**
  - Không bao giờ tự gửi tin nhắn ra ngoài.
  - Câu trả lời sinh ra được gửi về Frontend Web của Sale dưới dạng gợi ý mờ (Ghost Text / Draft Pill).
  - Nhân viên Sale có thể: Bấm "Gửi ngay" (1-click), chỉnh sửa lại nội dung, hoặc từ chối gợi ý.
  - Phù hợp: Giai đoạn đầu đào tạo AI, ngành hàng giá trị cao (bất động sản, thẩm mỹ, xe hơi).
- **Chế độ Hands-Free (Tự động hoàn toàn):**
  - Chỉ gửi tự động khi thỏa mãn đồng thời 4 điều kiện:
    1. Tenant bật cờ `hands_free_enabled = true`.
    2. Độ tự tin mô hình `>= minConfidence` (mặc định 0.85).
    3. Không chứa các từ khóa cấm / blacklist do doanh nghiệp cấu hình.
    4. Không vượt quá hạn mức tin nhắn ngày (`dailyReplyCap`).
  - Phù hợp: Trực đêm 24/7, ngành hàng tiêu dùng nhanh (FMCG), shop thương mại điện tử đơn giản.

---

## 6. LangChain-Go (`tmc/langchaingo`) AI-Centric Runtime Engine

Để giải phóng kỹ sư khỏi việc tự viết hàng ngàn dòng code boilerplate (quản lý context history, streaming parser, tool execution loop, vector store connectors), Omni Core tích hợp **`github.com/tmc/langchaingo`** làm Runtime Engine chính tại tầng Infrastructure.

### 6.1 Kiến Trúc Cách Ly DDD (Clean Boundary)
- **Domain Layer (`domain/`)**: Hoàn toàn thuần Go, định nghĩa `AIAgentHarnessPort` và các Value Objects. **Tuyệt đối không import `langchaingo` vào Domain.**
- **Infrastructure Layer (`infrastructure/langchain/`)**: Đóng gói toàn bộ logic của `langchaingo` thành một Implementation Adapter của `AIAgentHarnessPort`.

```
┌────────────────────────────────────────────────────────┐
│  Domain Layer: AIAgentHarnessPort                      │
└──────────────────────────▲─────────────────────────────┘
                           │ implements
┌──────────────────────────┴─────────────────────────────┐
│  Infrastructure: LangChainGoAdapter                    │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ langchaingo / `agents.NewOpenAIToolsAgent()`     │  │
│  │                                                  │  │
│  │  - Model Provider: `llms/openai`, `llms/ollama`   │  │
│  │  - Context Memory: `memory.NewChatMessageHistory`│  │
│  │  - Vector Store: `vectorstores/qdrant`           │  │
│  │  - Tools Bridge: Wrap CQRS Commands thành Tools  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 6.2 Cầu Nối Tool Calling Giữa LangChain-Go và Các Bounded Contexts
Mọi nghiệp vụ liên quan đến dữ liệu doanh nghiệp được bọc thành `tools.Tool` interface của `langchaingo`:

```go
package langchain

import (
	"context"
	"encoding/json"

	"github.com/tmc/langchaingo/tools"
	dealapp "omni-core/internal/deal/application"
)

// DealToolBridge bọc CQRS Command/Query của Deal BC thành LangChain Tool
type DealToolBridge struct {
	getPricingQuery *dealapp.GetProductPricingHandler
	createDraftCmd  *dealapp.CreateDealDraftHandler
}

func (d *DealToolBridge) Name() string {
	return "query_and_create_deal"
}

func (d *DealToolBridge) Description() string {
	return "Tra cứu giá sản phẩm, số lượng tồn kho và tạo đơn hàng nháp cho khách hàng."
}

func (d *DealToolBridge) Call(ctx context.Context, input string) (string, error) {
	// Parse input do LLM sinh ra và gọi trực tiếp vào CQRS Handler của Deal BC
	var req struct {
		SKU      string `json:"sku"`
		Quantity int    `json:"quantity"`
	}
	if err := json.Unmarshal([]byte(input), &req); err != nil {
		return "", err
	}
	
	// Gọi Application Service nội bộ
	pricing, err := d.getPricingQuery.Handle(ctx, req.SKU)
	if err != nil {
		return "", err
	}
	
	resJSON, _ := json.Marshal(pricing)
	return string(resJSON), nil
}
```

### 6.3 Lợi Ích Của Giải Pháp LangChain-Go AI-Centric
1. **Chat UI Tự Trị (Self-Serve Chat Window):** Khách hàng hoặc Sale nội bộ có thể chat trực tiếp với Agent, Agent tự lặp vòng suy luận (ReAct: Thought -> Action -> Observation) để trả lời hoặc thao tác hệ thống mà không cần backend can thiệp từng bước.
2. **Loại Bỏ Hoàn Toàn Tự Viết Parser:** Tự động bắt schema tham số của Tool, bắt lỗi parse JSON từ mô hình và tự động nhắc LLM sửa định dạng (Self-Correction).
3. **Đa Nhà Cung Cấp Cùng Một Chuẩn:** Chuyển đổi qua lại giữa OpenAI GPT-4o, Anthropic Claude 3.5, DeepSeek-V3, hoặc Ollama Llama-3/Qwen chạy nội bộ chỉ bằng 1 biến môi trường.

---

## 7. Sơ Đồ Triển Khai Hạ Tầng (Infrastructure Deployment)

- **Go Core Daemon:** Chạy service `aiagent` nội tại, quản lý worker pool lắng nghe sự kiện inbound từ NATS JetStream / Go channel.
- **Local LLM Engine (Tùy chọn On-Premise):**
  - Sử dụng Docker container `ollama/ollama:latest` hoặc `vllm/vllm-openai:latest`.
  - Chạy mô hình mã nguồn mở tối ưu tiếng Việt (vd: `Qwen2.5-7B-Instruct`, `PhoGPT`, `DeepSeek-R1-Distill-Qwen-7B`).
  - Giao tiếp với Go Core qua mạng nội bộ Docker (`http://ollama:11434/v1`) với độ trễ < 50ms.
- **Cloud Fallback:** Khi local LLM bị sập hoặc quá tải hàng đợi (> 20 requests), Circuit Breaker tự động chuyển tiếp sang Cloud API (`DeepSeek Open Platform` hoặc `OpenAI`) để đảm bảo hệ thống không bao giờ gián đoạn.

