# COPILOT-RAG-GUIDE-AND-AUTOMATION-ACTION-HARNESS-SPEC.md — Đặc Tả RAG Hướng Dẫn Sử Dụng & Action Harness Tự Động Hóa Trong AI Copilot (GoSO)

> **Bounded Contexts liên quan:**
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge): Copilot Service, Ingestion Pipeline, Vector/Fulltext Search, Tool Executor (`copilotapp.ToolExecutor`), Trace & Proposal Store.
> - `internal/marketing` (BC 6 — Marketing & Automation): Automation Engine, Triggers, Sequences, Flow Execution Port.
> - `internal/channel` (BC 2 — Channel & Gateway): Channel & Conversation Switch Ports.
> - `omni-web` (Frontend): `AiCopilotChatWindow.vue`, `AiCopilotFloatingWidget.vue`, Proposal Approval Renderer.
>
> **Mã đặc tả:** `SPEC-AI-COPILOT-003`  
> **Trạng thái:** OFFICIAL ENGINEERING SPECIFICATION  
> **Áp dụng cho:** AI Copilot Global Q&A & Action Automation Helper

---

## 1. Bối cảnh & Mục tiêu Kỹ thuật

Hệ thống Omni Platform đã sở hữu:
1. **AI Copilot Streaming Engine** (`internal/aiagent/application/copilot`): Hỗ trợ chat SSE thời gian thực qua phím tắt `Ctrl+K` / Floating Widget, kết nối Router9 / GoSO Harness.
2. **Autonomy Gate L1** (`copilotdom.Proposal`): Cho phép AI đề xuất hành động nghiệp vụ có kiểm soát (nhân viên duyệt trước khi ghi dữ liệu: `crm.create_deal`, `crm.add_contact_note`).
3. **Kho tài liệu phong phú** (`omni-docs`): Bao gồm kiến trúc, hướng dẫn sử dụng, cẩm nang tính năng, quy trình bám đuổi khách hàng và kịch bản CSKH.

### Vấn đề thực tế
- Người dùng (Sale, CSKH, Quản trị viên) khi sử dụng hệ thống thường phải chuyển tab để đọc tài liệu hướng dẫn, hoặc lúng túng khi muốn cấu hình các luồng tự động phức tạp (như tạo flow bám đuổi, đặt điều kiện kích hoạt, bật công tắc tự phản hồi).
- Người dùng mong muốn **ngay tại hộp thoại chat Copilot (chat all)**:
  - Khi hỏi: AI tự động tra cứu chính xác tài liệu hướng dẫn sử dụng hệ thống (RAG) để trả lời từng bước.
  - Khi yêu cầu hành động (ví dụ: *"Tạo cho anh flow bám đuổi khách hỏi giá sau 2 ngày"*): AI không chỉ trả lời suông mà tự động cấu hình và sinh ra **Thẻ đề xuất hành động (Proposal Card)**, người dùng chỉ cần bấm **Duyệt tạo** là hệ thống tự thiết lập luồng tự động hóa.

---

## 2. Kiến Trúc RAG Hướng Dẫn Sử Dụng (Documentation RAG)

```
   [ User Prompt ] (vd: "Làm sao tạo flow bám đuổi?")
          │
          ▼
   [ Copilot Chat Service (GoSO Harness) ]
          │
          ├─► Tool Call: docs.search_guide(query="tạo flow bám đuổi")
          │         │
          │         ▼
          │   [ GuideSearchPort / Hybrid Vector & FTS ]
          │         │
          │         ├─► Query: PostgreSQL 'ai_guide_chunks'
          │         │   (Cosine Similarity + ts_rank_cd Full-text)
          │         ▼
          │   Return: Top-3 hướng dẫn & schema flow liên quan
          │
          ├─► LLM Reasoning & Context Synthesis
          │
          └─► Stream Response: Lời giải thích chi tiết từng bước
```

### 2.1 Cấu trúc Lưu trữ (Database Schema)

Tận dụng PostgreSQL 16 của `omni-postgres` với `pgvector` (hoặc hybrid fallback `tsvector` + vector embedding):

```sql
-- Bảng tài liệu hướng dẫn gốc
CREATE TABLE IF NOT EXISTS ai_guide_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- UUID cố định hoặc system-level tenant
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL, -- 'automation', 'chat', 'channel', 'crm', 'settings'
    source_path VARCHAR(512) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bảng phân đoạn kiến thức (Chunks) phục vụ RAG
CREATE TABLE IF NOT EXISTS ai_guide_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES ai_guide_documents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    token_count INT NOT NULL,
    search_vector TSVECTOR,
    embedding vector(1536), -- Hoặc 768 tuỳ embedding model
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guide_chunks_doc ON ai_guide_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_guide_chunks_tsv ON ai_guide_chunks USING GIN(search_vector);
-- Index HNSW cho vector similarity
CREATE INDEX IF NOT EXISTS idx_guide_chunks_vec ON ai_guide_chunks USING hnsw (embedding vector_cosine_ops);
```

### 2.2 Tool Specification: `docs.search_guide`

- **Name:** `docs.search_guide`
- **Description:** *"Tra cứu tài liệu hướng dẫn sử dụng hệ thống Omni Platform, quy trình thao tác và hướng dẫn cấu hình nghiệp vụ."*
- **Parameters:**
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Câu hỏi hoặc từ khóa cần tra cứu hướng dẫn" },
    "category": { "type": "string", "enum": ["automation", "chat", "channel", "crm", "settings", "all"], "default": "all" },
    "limit": { "type": "integer", "default": 3 }
  },
  "required": ["query"]
}
```

---

## 3. Kiến Trúc Action Harness Hỗ Trợ Tự Động Hóa (Automation Action)

Khi người dùng yêu cầu thực thi (thêm flow, gắn khách, đổi cấu hình), GoSO kích hoạt các tool tạo Proposal theo chuẩn **Autonomy Gate L1**.

```
   [ User Prompt ] (vd: "Tạo flow gửi tin nhắn chăm sóc sau 3 ngày cho khách mới")
          │
          ▼
   [ GoSO AI Copilot ]
          │
          ├─► Tool Call: marketing.create_automation_flow(...)
          │
          ▼
   [ ToolExecutor ]
          │
          ├─► Build Autonomy Gate L1 Proposal:
          │   - Action: "marketing.create_automation_flow"
          │   - Title: "Tạo luồng bám đuổi: Chăm sóc khách mới sau 3 ngày"
          │   - Status: "PENDING_APPROVAL"
          │   - Payload: { trigger: "contact_created", delay_hours: 72, message: "..." }
          │
          ▼
   [ SSE Stream to omni-web ]
          │
          ▼
   [ Copilot Chat UI ]
          │
          ├─► Render Card: "⚡ Đề xuất ghi: marketing.create_automation_flow"
          ├─► Preview cấu hình Trigger & Message dạng đẹp mắt
          └─► Nút bấm: [ ✅ Duyệt tạo ]  [ ❌ Hủy bỏ ]
                 │ (User bấm Duyệt)
                 ▼
          POST /api/v1/ai/copilot/proposals/{id}/approve
                 │
                 ▼
          [ Marketing Command Handler: CreateTrigger & CreateSequence ]
```

### 3.1 Danh mục Action Tools Mở Rộng

| Tool Name | Domain Mục Tiêu | Quyền Hạn & Invariant | Autonomy Level |
|---|---|---|---|
| `docs.search_guide` | `internal/aiagent/application/copilot` | Read-only tài liệu, không đổi state | Level 0 (Tự động thực thi) |
| `marketing.create_automation_flow` | `internal/marketing/domain/automation` | Tạo Trigger + Sequence mới | Level 1 (Bắt buộc user bấm duyệt) |
| `marketing.enroll_contact_flow` | `internal/marketing/domain/automation` | Gắn khách hàng vào flow đang chạy | Level 1 (Bắt buộc user bấm duyệt) |
| `channel.toggle_auto_reply` | `internal/channel` & `internal/conversation` | Bật/tắt tự phản hồi cho nick/hội thoại | Level 1 (Bắt buộc user bấm duyệt) |

### 3.2 Đặc tả Payload `marketing.create_automation_flow`

```json
{
  "name": "marketing.create_automation_flow",
  "description": "Tạo luồng bám đuổi tự động (Flow/Sequence) với điều kiện kích hoạt và bước gửi tin.",
  "parameters": {
    "type": "object",
    "properties": {
      "flow_name": { "type": "string", "description": "Tên gợi nhớ của luồng bám đuổi" },
      "trigger_event": { "type": "string", "enum": ["contact_created", "tag_added", "deal_stalled", "no_reply_timeout"] },
      "delay_minutes": { "type": "integer", "description": "Thời gian chờ trước khi thực thi bước kế tiếp (phút)" },
      "message_template": { "type": "string", "description": "Nội dung tin nhắn dự kiến gửi" },
      "channel_type": { "type": "string", "enum": ["zalo_personal", "zalo_oa", "telegram"], "default": "zalo_personal" }
    },
    "required": ["flow_name", "trigger_event", "delay_minutes", "message_template"]
  }
}
```

---

## 4. Bảo Vệ An Toàn & Invariants

1. **Tenant Isolation Invariant:** Mọi truy vấn RAG và đề xuất hành động đều được bind chặt với `tenant_id` lấy từ session JWT context. Nghiêm cấm rò rỉ tri thức hoặc luồng giữa các tenant.
2. **Autonomy Gate Invariant:** Mọi hành động ghi dữ liệu vào Marketing Automation hoặc cấu hình Kênh BẮT BUỘC phải sinh `Proposal` với trạng thái `PENDING_APPROVAL`. Không bao giờ tự động ghi thẳng vào database khi chưa có tín hiệu duyệt từ phía client.
3. **Graceful Fallback Invariant:** Nếu embedding service hoặc pgvector gặp sự cố tạm thời, công cụ tìm kiếm tài liệu tự động fallback sang full-text search `tsvector` trên trường `content` mà không làm crash phiên chat Copilot.

---

## 5. Kế Hoạch Triển Khai (Roadmap)

1. **Giai đoạn 1 (Database & Ingestion):**
   - Tạo migration bảng `ai_guide_documents` và `ai_guide_chunks`.
   - Viết parser đọc tự động các tài liệu từ thư mục tài liệu hệ thống và nạp chunking vào DB.
2. **Giai đoạn 2 (MCP RAG Tool):**
   - Triển khai `GuideSearchPort` và đăng ký tool `docs.search_guide` vào `ToolExecutor`.
   - Kết nối vào GoSO System Prompt để model nhận diện khi nào cần tra cứu docs.
3. **Giai đoạn 3 (Automation Action Harness):**
   - Đăng ký `marketing.create_automation_flow` và `marketing.enroll_contact_flow` vào `ToolExecutor`.
   - Cập nhật Handler phê duyệt Proposal (`handleProposalAction`) để dispatch vào `automation.CreateTrigger` / `automation.CreateSequence`.
