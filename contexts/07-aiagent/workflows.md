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
