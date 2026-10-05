# Phân Định Ranh Giới Kiến Trúc: BC 7 (AIAgent) vs BC 8 (ServiceAPI) & BC Analytics

> **ĐẶC TẢ PHÂN TÁCH BOUNDED CONTEXT & LOẠI BỎ GOD CONTEXT TẠI OMNI-CORE**  
> **Mã tài liệu:** `ADR-ARCH-007-008`  
> **Bounded Contexts liên quan:**  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge)  
> - `internal/serviceapi` (BC 8 — Service API & Ingress Gateway)  
> - `internal/analytics` (Bounded Context Đo lường & Báo cáo)  
> **Trạng thái:** APPROVED / ENFORCED  
> **Quy tắc ngôn ngữ:** Tiếng Việt (Thuật ngữ code, API, struct giữ nguyên Tiếng Anh).

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Trong quá trình phát triển, sự suy thoái ranh giới kiến trúc (Architectural Erosion) đã dẫn tới 3 vi phạm nghiêm trọng:
1. **Khái niệm Credential bị nhân ba:** Cả 3 file `aiagent/domain/agent_hands/credential.go`, `service/domain/credential/credential.go` và `service/domain/aigateway/credential.go` đều định nghĩa các aggregate quản lý key `omni_live_xxx` / `omni_gw_xxx` dẫn tới phân mảnh xác thực.
2. **MCP Handlers bị phân mảnh:** `aiagent` giữ `/mcp/v1/tools/call` (chọc thẳng vào CRM logic), trong khi `service` lại giữ `/api/v1/service/*` (cũng thực thi CRM logic).
3. **`internal/service` bị biến thành God Context (Túi rác):** Ôm đồm cả Ingress Gateway, MCP Tools, External Webhooks, DLQ Admin, và toàn bộ hệ thống Báo cáo/Analytics/SLA.

---

## 2. Ma Trận Phân Định Trách Nhiệm (Separation of Concerns)

```
┌─────────────────────────────────────────────────────────────┐
│                 BC 7: internal/aiagent                      │
│             (Bộ Não, Cấu Hình & Tri Thức)                    │
├─────────────────────────────────────────────────────────────┤
│ 1. Agent Management (Prompt, Instructions, Persona).        │
│ 2. LLM Providers (OpenAI, DeepSeek, GOSO Dual Transport).   │
│ 3. Knowledge Vault & RAG (Context embeddings, Chunks).      │
│ 4. Clef Decision Engine (SPEC 064 - Shadow / Draft).        │
│ 5. Tool Schemas Registry: Định nghĩa và đồng bộ JSON Schema │
│    của các tools sang GOSO Engine để LLM hiểu.              │
│    (TUYỆT ĐỐI KHÔNG THỰC THI LOGIC CRM TẠI ĐÂY)            │
└──────────────────────────────┬──────────────────────────────┘
                               │
               (GOSO Bot nhận prompt kèm schema)
                               │
                               ▼ [Gọi Ingress có Token omni_live_xxx]
┌─────────────────────────────────────────────────────────────┐
│                 BC 8: internal/serviceapi                   │
│             (Cổng Dịch Vụ Nền Tảng & Thực Thi)               │
├─────────────────────────────────────────────────────────────┤
│ 1. Ingress Security & Credential Management:               │
│    - DUY NHẤT 1 Aggregate Root: ServiceCredential.         │
│    - Token prefix: omni_live_xxx (SHA-256 Hash Lookup).    │
│    - Anti-Replay via X-Request-Fingerprint.                │
│ 2. Autonomy Gates & Policy: L1 (Chờ duyệt), L2, L3.        │
│ 3. Emergency Kill-Switch: Khẩn cấp ngắt toàn bộ AI.        │
│ 4. Platform Service APIs (/api/v1/service/*):               │
│    - Thực thi các Tool CRM cho AI: tạo đơn, báo giá, v.v.  │
│ 5. External Webhook Subscriptions & System DLQ Admin.       │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ (Độc lập hoàn toàn, trả về đúng chủ)
┌──────────────────────────────┴──────────────────────────────┐
│                BC Analytics: internal/analytics             │
│                 (Toàn Bộ Báo Cáo & Đo Lường)                 │
├─────────────────────────────────────────────────────────────┤
│ 1. Dashboard Metrics & Overview (/api/v1/analytics/*).      │
│ 2. SLA Metrics & Agent Scorecard (/api/v1/sla/*).           │
│ 3. Menu Báo Cáo 8 Tabs (ReportsShell, /api/v1/reports/*).   │
│ 4. CQRS Read Projections & Xuất Excel thật (excelize).      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Ranh Giới Hợp Đồng (Contract Specifications)

### 3.1 Credential & Security
- **Chủ quyền:** Thuộc 100% về `internal/serviceapi/domain/credential`.
- **Aggregate Root:** `ServiceCredential`.
- **Token Format:** `omni_live_<hex32>`.
- **Hashing:** SHA-256 hex mã hoá lưu DB.
- Khi Admin từ giao diện Web muốn tạo Key cho Agent, REST API sẽ gọi Command Handler tại `internal/serviceapi/application/credential/`. BC `aiagent` tuyệt đối không lưu bảng credential riêng.

### 3.2 MCP (Model Context Protocol) Flow
1. **Discovery / Metadata Phase:**
   - `internal/aiagent/application/mcp/queries/list_tool_definitions.go` trả về JSON Schemas của các tool sẵn có (dựa trên contract tĩnh hoặc dynamic manifest).
   - Được push sang GOSO Engine qua `POST /api/v1/ai/agent-hands/sync-tools`.
2. **Execution Phase:**
   - GOSO Engine hoặc external Agent gọi thẳng vào Ingress Endpoint: `POST /api/v1/service/quotes/propose`, `POST /api/v1/service/orders`.
   - `internal/serviceapi` kiểm tra `ServiceCredential`, Autonomy Gate L1/L2/L3, Kill-Switch, sau đó gọi Application Port sang BC tương ứng (`customer`, `deal`).
   - Xoá bỏ endpoint trùng lặp `/mcp/v1/tools/call` bên `aiagent`.

### 3.3 Giải Phóng Analytics
- Toàn bộ thư mục `internal/service/domain/reports`, `application/reports`, `infrastructure/postgres/reports*`, `interfaces/http/analytics_handler.go`, `sla_handler.go` được di dời sang `internal/analytics/`.
- Tên package thống nhất: `internal/analytics/...`.
