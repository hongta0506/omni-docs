# AI Agent & Knowledge Bounded Context (`internal/aiagent`)

> Bounded Context phụ trách Quản trị Cấu hình AI Agents, Quản lý Nhà cung cấp mô hình (GoClaw Providers: OpenAI, DeepSeek, Claude, v.v.), Kho tri thức RAG (Knowledge Bases & Documents), Company Profiles, và Radar Giám Sát Bất Thường (Ops Radar).

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/aiagent` |
| **Tổng số Endpoints** | **65** (AI Agents 20, Providers 15, Knowledge Base 18, Ops Radar 12) |
| **Aggregate Roots** | `AIAgent`, `AIProvider`, `KnowledgeBase`, `RadarAlert` |
| **Entities con** | `KnowledgeDocument`, `DocumentChunk`, `AgentSkill`, `RadarMetric` |
| **Value Objects** | `ModelConfigVO` (Temperature, MaxTokens), `EmbeddingVector`, `HandoffCondition` |
| **Giao thức** | Connect-RPC (`aiagent.v1.AIAgentService`), REST (`/api/v1/ai-agents/*`, `/api/v1/goclaw-providers/*`, `/api/v1/ops-radar/*`) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`mapping-ai-agent-and-goclaw-bridge.md`](./mapping-ai-agent-and-goclaw-bridge.md) | Ánh xạ chi tiết endpoints AI Agents, GoClaw Providers bridge, Vector Knowledge chunking, Ops Radar anomaly detection. |
| [`usecases.md`](./usecases.md) | Đặc tả Use Cases & BDD Scenarios (Given-When-Then): RAG Tenant Isolation, Circuit Breaker Fallback, Safe Handoff, Token Spike Alert. |
| [`workflows.md`](./workflows.md) | Sơ đồ luồng nghiệp vụ Mermaid: Sequence RAG Search & LLM Fallback, State Machine Safe Human Handoff, Flowchart Ops Radar Anomaly. |
| [`test-matrix.md`](./test-matrix.md) | Ma trận kiểm thử: RAG accuracy, Boundary cách ly Tenant vector, Chuyển mạch trạng thái Circuit Breaker và Stress chunking. |

---

## 3. Invariants & Nghiệp Vụ Cốt Lõi

1. **Provider Fallback & Circuit Breaker**:
   - Nếu primary LLM provider (ví dụ DeepSeek) gặp timeout > 5s hoặc trả về 5xx, tự động chuyển luồng sang fallback provider (ví dụ OpenAI) với rate limit tương ứng.
2. **Safe Agent Handoff**:
   - Khi phát hiện khách hàng có sentiment tiêu cực hoặc yêu cầu gặp nhân viên tư vấn, AI Agent bắt buộc gán cờ `HandoffRequested = true` và dừng can thiệp tự động cho đến khi Agent con người giải phóng.
3. **RAG Knowledge Embedding Boundary**:
   - Mọi tài liệu upload vào Knowledge Base phải được kiểm tra tenant isolation; các chunk vector được đánh dấu tenant metadata để không bao giờ bị rò rỉ dữ liệu giữa các doanh nghiệp.

---

## 4. Thành Phần Dùng Chung & Phụ Thuộc (Shared & Dependencies)

### 4.1 Thành phần dùng chung nội bộ (Internal BC Common)
- `internal/aiagent/domain/errors.go`: Sentinel errors (`ErrAgentNotFound`, `ErrProviderTimeout`, `ErrKnowledgeChunkingFailed`, `ErrHandoffFailed`).
- `internal/aiagent/application/common/`:
  - `prompt_builder.go`: Tiện ích dựng prompt system & context injection nội bộ.
  - `chunker.go`: Bộ băm nhỏ văn bản (chunking) và đếm token cho RAG.
  - `pagination.go`: AIAgentFilter, ProviderFilter, KnowledgeFilter DTOs.
- `internal/aiagent/interfaces/stream/`: SSE streaming handler phục vụ truyền tải token AI realtime.

### 4.2 Thành phần phụ thuộc dùng chung toàn hệ thống (Cross-BC Shared Kernel)
- `pkg/context/`: TenantID, UserID context extraction.
- `pkg/events/`: Publish Domain Events (`AIHandoffTriggeredEvent`, `RadarAnomalyDetectedEvent`). Lắng nghe `MessageReceivedEvent` (Conversation BC) để AI tự động suy luận và sinh câu trả lời.
- `pkg/pagination/`: PageRequest, PageResponse chuẩn hóa.
- `pkg/errors/`: System error codes & HTTP/RPC status mapper.

