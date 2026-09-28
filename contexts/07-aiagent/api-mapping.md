# AI Agent & Knowledge — API Mapping Chi Tiết (65 Routes)

> Bounded Context: `internal/aiagent`  
> Phân rã từ backend Fastify (`modules/ai`, `modules/ai-agent`, `modules/ops-radar`, `modules/work-items`) sang Go Clean Architecture.

---

## 1. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Flat handlers per resource cho Frontend Web/SPA:
  - `ai_agents_handler.go`: CRUD cấu hình trợ lý AI (`/api/v1/ai-agents/*`).
  - `goclaw_providers_handler.go`: Cấu hình LLM providers, API keys (`/api/v1/goclaw-providers/*`).
  - `knowledge_handler.go`: Quản lý tài liệu và hồ sơ công ty RAG (`/api/v1/ai/knowledge/*`, `/api/v1/ai/company-profile/*`).
  - `ops_radar_handler.go`: Giám sát cảnh báo vi phạm SLA & checkpoint (`/api/v1/ops-radar/*`).
  - `work_items_handler.go`: Hàng đợi duyệt tin nhắn nháp (`/api/v1/work-items/*`).
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `AIAgentService` cho inter-service orchestration (GOSO AI Gateway, LangChainGo worker).
- **`interfaces/stream/` (SSE)**: Endpoint `interfaces/stream/sse_handler.go` stream từng token văn bản của AI Copilot theo chuẩn `text/event-stream`.

---

## 2. Bảng Đối Chiếu Chi Tiết Từng Endpoint

### 2.1 AI Agents & GoClaw Providers (25 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/ai-agents` | `ai_agents_handler.go:List` | `queries.ListAIAgents` | `ListAIAgents` |
| `POST` | `/api/v1/ai-agents` | `ai_agents_handler.go:Create` | `commands.CreateAIAgent` | `CreateAIAgent` |
| `GET` | `/api/v1/ai-agents/:id` | `ai_agents_handler.go:Get` | `queries.GetAIAgentDetail` | `GetAIAgentDetail` |
| `PUT` | `/api/v1/ai-agents/:id` | `ai_agents_handler.go:Update` | `commands.UpdateAIAgent` | `UpdateAIAgent` |
| `DELETE` | `/api/v1/ai-agents/:id` | `ai_agents_handler.go:Delete` | `commands.DeleteAIAgent` | `DeleteAIAgent` |
| `GET` | `/api/v1/goclaw-providers` | `goclaw_providers_handler.go:List` | `queries.ListProviders` | `ListProviders` |
| `POST` | `/api/v1/goclaw-providers` | `goclaw_providers_handler.go:Create` | `commands.AddProvider` | `AddProvider` |
| `POST` | `/api/v1/goclaw-providers/test` | `goclaw_providers_handler.go:Test` | `commands.TestProviderKey` | `TestProviderKey` |

### 2.2 Knowledge Base & RAG (20 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/ai/knowledge` | `knowledge_handler.go:ListDocs` | `queries.ListKnowledgeDocs`| `ListKnowledgeDocs`|
| `POST` | `/api/v1/ai/knowledge` | `knowledge_handler.go:CreateDoc` | `commands.UploadKnowledgeDoc`| `UploadKnowledgeDoc`|
| `DELETE` | `/api/v1/ai/knowledge/:id` | `knowledge_handler.go:DeleteDoc` | `commands.DeleteKnowledgeDoc`| `DeleteKnowledgeDoc`|
| `GET` | `/api/v1/ai/company-profile` | `knowledge_handler.go:GetProfile` | `queries.GetCompanyProfile` | `GetCompanyProfile` |
| `PUT` | `/api/v1/ai/company-profile` | `knowledge_handler.go:UpdateProfile`| `commands.SaveCompanyProfile`| `SaveCompanyProfile`|
| `POST` | `/api/v1/ai/ask` | `knowledge_handler.go:AskAssistant` | `commands.QueryRAGAssistant`| `QueryRAGAssistant`|

### 2.3 Ops Radar & Work Items (20 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/ops-radar/signals` | `ops_radar_handler.go:ListSignals` | `queries.ListRadarSignals` | `ListRadarSignals` |
| `POST` | `/api/v1/ops-radar/signals/:id/resolve`| `ops_radar_handler.go:Resolve` | `commands.ResolveRadarSignal`| `ResolveRadarSignal`|
| `GET` | `/api/v1/work-items` | `work_items_handler.go:List` | `queries.ListWorkItems` | `ListWorkItems` |
| `POST` | `/api/v1/work-items/:id/approve` | `work_items_handler.go:Approve` | `commands.ApproveWorkItem` | `ApproveWorkItem` |
| `POST` | `/api/v1/work-items/:id/reject` | `work_items_handler.go:Reject` | `commands.RejectWorkItem` | `RejectWorkItem` |
