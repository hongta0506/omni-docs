# AI Agent & Knowledge Bounded Context — Sơ Đồ Luồng Nghiệp Vụ (Workflows & UML)

> Mô hình hóa luồng xử lý RAG Search với Tenant Isolation, Cơ chế Circuit Breaker Fallback giữa các LLM Providers, Luồng Safe Human Handoff và Giám sát Ops Radar.

---

## 1. Sơ Đồ Tuần Tự: Luồng Xử Lý RAG Search & Trả Lời Đa Kênh

Cơ chế điều phối ngữ cảnh prompt, embedding tìm kiếm vector và sinh phản hồi:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Khách Hàng (Chat)
    participant ConvBC as Conversation BC
    participant Orch as AI Orchestrator
    participant VecDB as Vector DB (pgvector)
    participant CB as Circuit Breaker
    participant LLM as Primary LLM (DeepSeek)
    participant FallbackLLM as Fallback LLM (OpenAI)

    Customer->>ConvBC: Tin nhắn mới ("Chính sách bảo hành?")
    ConvBC->>Orch: Trigger AIAgent (TenantID, QueryText)
    
    rect rgb(240, 248, 255)
    Note over Orch,VecDB: Bước 1: RAG Search cách ly Tenant tuyệt đối
    Orch->>VecDB: CosineSimilaritySearch(Embedding(QueryText), Filter: tenant_id = T1)
    VecDB-->>Orch: Chunks dữ liệu phù hợp nhất (Score > 0.75)
    end

    rect rgb(255, 250, 240)
    Note over Orch,FallbackLLM: Bước 2: Gọi LLM qua Circuit Breaker
    Orch->>CB: ExecuteLLM(Prompt + KnowledgeContext)
    CB->>LLM: Gửi request tới DeepSeek API (Timeout: 5s)
    
    alt DeepSeek Timeout hoặc lỗi 503
        LLM--xCB: Timeout / Error 503
        Note over CB: Circuit Breaker kích hoạt Fallback
        CB->>FallbackLLM: Gửi request tới OpenAI GPT-4o-mini
        FallbackLLM-->>CB: Token Stream Response
        CB-->>Orch: Hoàn thành sinh câu trả lời
    else DeepSeek thành công
        LLM-->>CB: Token Stream Response
        CB-->>Orch: Hoàn thành sinh câu trả lời
    end
    end

    Orch->>ConvBC: SendMessage(TextResponse)
    ConvBC-->>Customer: Trả lời tự động tới khách hàng
```

---

## 2. Sơ Đồ Máy Trạng Thái: Chuyển Giao Quyền Cho Con Người (Safe Human Handoff)

Quy trình quản lý trạng thái can thiệp của AI trên cuộc hội thoại:

```mermaid
stateDiagram-v2
    [*] --> AI_Active : Khách hàng bắt đầu nhắn tin

    AI_Active --> AI_Active : AI trả lời bình thường (Sentiment Neutral/Positive)
    
    AI_Active --> Handoff_Triggered : Khách yêu cầu gặp người thật / Sentiment Negative / LLM không tự tin (< 50%)
    
    Handoff_Triggered --> Queued_For_Human : AI gửi tin trấn an & Tắt chế độ tự trả lời (Silent Mode)
    
    Queued_For_Human --> Assigned_To_Agent : Nhân viên bấm tiếp nhận hội thoại
    
    Assigned_To_Agent --> Human_Chatting : Nhân viên tư vấn trực tiếp cho khách
    
    Human_Chatting --> AI_Active : Nhân viên chốt ca và kích hoạt lại bot
    Human_Chatting --> Closed : Hội thoại kết thúc
    Closed --> [*]
```

---

## 3. Sơ Đồ Luồng: Giám Sát Bất Thường Token & Latency (Ops Radar Loop)

Luồng kiểm soát chi phí và hiệu năng các AI Providers:

```mermaid
flowchart TD
    Req[LLM Request Hoàn Tất] --> LogMetric[Ghi nhận Token Usage & Latency vào Time-series DB]
    LogMetric --> RadarWorker[Ops Radar Engine quét mỗi 1 phút]
    
    RadarWorker --> CalcZScore[Tính điểm bất thường Z-Score theo Tenant]
    CalcZScore --> CheckThreshold{Z-Score > 3.0 hoặc Latency > 10s?}
    
    CheckThreshold -- Bình thường --> KeepRunning[Tiếp tục theo dõi]
    CheckThreshold -- Bất thường (Anomaly) --> CreateAlert[Tạo bản ghi RadarAlert mức HIGH/CRITICAL]
    
    CreateAlert --> AutoThrottle[Tự động hạ Rate-limit của Bot về 1 req/phút]
    AutoThrottle --> NotifyTelegram[Gửi cảnh báo khẩn cấp tới kênh Telegram của Admin]
```

---

## 4. Sơ Đồ Tuần Tự: Multi-Agent Swarm & Tool Calling Execution Loop

Quy trình phối hợp giữa Router Agent, Specialized Agent và Tool Calling liên Bounded Context:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Khách Hàng (Chat)
    participant Conv as Conversation BC
    participant Router as Supervisor / Intent Router
    participant Swarm as Specialized Agent (Sales/Deal)
    participant Harness as Pluggable AI Harness
    participant DealBC as Deal & Order BC
    participant Gate as Safety Approval Gate
    actor HumanAgent as Nhân Viên Tư Vấn (Sale)

    Customer->>Conv: Tin nhắn: "Cho anh đặt 2 hộp trà mã SP-99 giao quận 1"
    Conv->>Router: MessageReceivedEvent (TenantID, MessageContent)
    
    rect rgb(240, 248, 255)
    Note over Router,Harness: BƯỚC 1: PHÂN LOẠI Ý ĐỊNH (ROUTER)
    Router->>Harness: Execute(SystemRouterPrompt, MessageContent)
    Harness-->>Router: Trả về Intent: "intent_ordering_deal"
    Router->>Swarm: Bàn giao ngữ cảnh cho Sales Agent
    end

    rect rgb(255, 250, 240)
    Note over Swarm,DealBC: BƯỚC 2: INFERENCE KÈM TOOL CALLING
    Swarm->>Harness: Execute(SalesPrompt, Context, Tools: [get_product_info, create_deal_draft])
    Harness-->>Swarm: Trả về ToolCall: get_product_info(sku="SP-99")
    Swarm->>DealBC: Query ProductBySKU("SP-99")
    DealBC-->>Swarm: Trả về: {name: "Trà Thượng Hạng", price: 250000, stock: 15}
    
    Swarm->>Harness: Gửi ToolResult vào Context -> Yêu cầu sinh phản hồi kế tiếp
    Harness-->>Swarm: Trả về ToolCall: create_deal_draft(items=[{sku: "SP-99", qty: 2}], address="Quận 1")
    Swarm->>DealBC: Command CreateDealDraft(...)
    DealBC-->>Swarm: DealID: "deal-12345", Tổng tiền: 500.000đ
    
    Swarm->>Harness: Hoàn tất Tool Execution -> Sinh câu trả lời xác nhận
    Harness-->>Swarm: Draft Message: "Dạ em đã tạo đơn nháp 2 hộp Trà Thượng Hạng (500k) giao Quận 1..." (Confidence: 0.92)
    end

    rect rgb(245, 255, 245)
    Note over Swarm,HumanAgent: BƯỚC 3: SAFETY GATE KIỂM DUYỆT
    Swarm->>Gate: EvaluateResponse(DraftMessage, Confidence: 0.92, Mode)
    
    alt Mode == 'hands_free' VÀ Confidence >= 0.85
        Gate->>Conv: Command SendOutboundMessage(...)
        Conv-->>Customer: Tự động gửi tin xác nhận cho khách hàng
    else Mode == 'copilot' HOẶC Confidence < 0.85
        Gate->>HumanAgent: WebSocket emit 'ai:draft_ready' {dealId, draftContent}
        Note over HumanAgent: Sale xem bản nháp, bấm "Duyệt & Gửi" trên giao diện
        HumanAgent->>Conv: Confirm & Gửi tin nhắn tới khách
        Conv-->>Customer: Tin nhắn tới khách từ tài khoản Sale
    end
    end
```

---

## 5. Sơ Đồ Kiến Trúc: Pluggable Inference Adapters

Mô hình trừu tượng hóa Adapter cắm rút tự do giữa Go Core và các Engine bên ngoài:

```mermaid
classDiagram
    class AIAgentHarnessPort {
        <<interface>>
        +Execute(ctx, req HarnessRequest) (*HarnessResponse, error)
        +Stream(ctx, req HarnessRequest) (<-chan StreamChunk, error)
        +HealthCheck(ctx, providerID) error
    }

    class GOSOAdapter {
        -baseURL string
        -hmacSecret string
        -httpClient *http.Client
        +Execute(ctx, req) (*HarnessResponse, error)
        +Stream(ctx, req) (<-chan StreamChunk, error)
    }

    class OpenAICompatibleAdapter {
        -client *openai.Client
        -apiKey string
        -endpointURL string
        +Execute(ctx, req) (*HarnessResponse, error)
        +Stream(ctx, req) (<-chan StreamChunk, error)
    }

    class EmbeddedLocalEngine {
        -tokenEstimator Tokenizer
        -ruleMatcher RuleEngine
        +Execute(ctx, req) (*HarnessResponse, error)
        +Stream(ctx, req) (<-chan StreamChunk, error)
    }

    AIAgentHarnessPort <|.. GOSOAdapter : implements
    AIAgentHarnessPort <|.. OpenAICompatibleAdapter : implements
    AIAgentHarnessPort <|.. EmbeddedLocalEngine : implements
```

