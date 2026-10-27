# AI-COPILOT-FLOATING-WIDGET-AND-AGENT-SELECTION-SPEC.md — Đặc Tả Floating AI Copilot Widget & Cầu Nối Chọn AI Agent Mặc Định

> **Bounded Contexts liên quan:**
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge): REST Handlers (`default_ai_agent_tail.go`, `agent_rest_handler.go`), Persistence (`default_ai_agent_repository.go`, `ai_agents` table), Streaming Copilot Endpoint (`/api/v1/ai/copilot/chat`).
> - `internal/identity` (BC 1 — Identity & Settings): `tenants.default_ai_agent_key`.
> - `omni-web` (Frontend): `AiCopilotFloatingWidget.vue`, `AiCopilotChatWindow.vue`, `use-ai-copilot.ts`, `DefaultAiAgentCard.vue`, `AiAskPanel.vue`.
>
> **Mã đặc tả:** `SPEC-AI-COPILOT-002`  
> **Trạng thái:** OFFICIAL ENGINEERING SPECIFICATION  
> **Áp dụng cho:** GitHub Issues #1412 (Fix 502 Agent Available) & #1413 (Floating AI Copilot Widget)

---

## 1. Bối cảnh & Mục tiêu Kỹ thuật

Hệ thống Omni Core đã triển khai endpoint AI Copilot streaming độc lập (`POST /api/v1/ai/copilot/chat` tại Issue #1410) kết nối Router9 GOSO và MCP Tool Execution.

Tuy nhiên, phía vận hành và trải nghiệm người dùng hiện tồn tại 2 vấn đề lớn:
1. **Lỗi 502 Bad Gateway (`agent_sidecar_unavailable`)**: Khi vào trang Cài đặt (`DefaultAiAgentCard.vue`) hoặc mở tab "Hỏi AI" ở panel liên hệ (`AiAskPanel.vue`), hệ thống gọi `GET /api/v1/settings/ai-agent/available` và `PUT /api/v1/settings/ai-agent/default`. Do mã nguồn cũ phụ thuộc vào sidecar GoClaw bên ngoài không còn tồn tại, backend trả về lỗi cứng 502 khiến console báo lỗi đỏ liên tục và người dùng không thể chọn Agent mặc định.
2. **Khung chat AI bị cô lập**: Tính năng chat với AI hiện chỉ nằm co cụm trong tab con "Hỏi AI" ở khung thông tin khách hàng bên phải (`AiAskPanel.vue`), không thể truy cập nhanh khi nhân viên đang xem danh sách liên hệ, đơn hàng, báo cáo hay đang ở các màn hình khác. Cần một **Floating Chat Bubble toàn cục ở góc phải bên dưới màn hình** cho phép gọi AI Copilot mọi lúc, nhận phản hồi streaming thời gian thực và tự động mang theo ngữ cảnh (Context) của màn hình đang làm việc.

---

## 2. Kiến Trúc Cầu Nối AI Agent Mặc Định (Resolving 502)

### 2.1 Loại bỏ Sidecar Phụ Thuộc — Kết Nối Trực Tiếp Cơ Sở Dữ Liệu
Thay vì giả định cần một process sidecar kiểm tra GoClaw bên ngoài, backend chuyển thẳng sang truy vấn bảng nội bộ `ai_agents` và `tenants` qua Bun ORM.

```
   [ omni-web ]
        │
        ├─► GET /api/v1/settings/ai-agent/available
        │        │
        │        ▼
        │   [ DefaultAIAgentHTTPHandler.Available ]
        │        │
        │        ├─► 1. Query 'tenants.default_ai_agent_key' (Tenant Default)
        │        └─► 2. Query 'ai_agents' WHERE tenant_id = ? AND status = 'active'
        │                 │
        │                 ▼
        │        HTTP 200 OK: { agents: [...], current: "agent-uuid", success: true }
        │
        └─► PUT /api/v1/settings/ai-agent/default { "agent_key": "agent-uuid" }
                 │
                 ▼
            [ DefaultAIAgentHTTPHandler.SetDefault ]
                 │
                 ├─► 1. Verify agent exists in 'ai_agents' (or NULL if clearing)
                 └─► 2. UPDATE 'tenants' SET default_ai_agent_key = ? WHERE id = ?
                          │
                          ▼
                 HTTP 200 OK: { current: "agent-uuid", success: true }
```

### 2.2 Quy Chuẩn REST Contract

#### A. Danh sách Agent Khả dụng (`GET /api/v1/settings/ai-agent/available`)
- **Headers**: `Authorization: Bearer <jwt>`
- **Response HTTP 200 OK**:
```json
{
  "agents": [
    {
      "agent_key": "7b8e1234-a1b2-4c3d-e4f5-6789abcdef01",
      "display_name": "Trợ lý Bán Hàng & Chốt Đơn (GOSO)",
      "description": "Tư vấn sản phẩm, tính toán giá khuyến mãi và tạo đơn hàng nháp."
    }
  ],
  "current": "7b8e1234-a1b2-4c3d-e4f5-6789abcdef01",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "success": true
}
```
- *Trường hợp Tenant chưa tạo Agent nào trong DB*: Trả về `"agents": []` và `"current": null` với HTTP 200 OK (tuyệt đối không trả về 502).

#### B. Cập nhật Agent Mặc định (`PUT /api/v1/settings/ai-agent/default`)
- **Request Body**:
```json
{
  "agent_key": "7b8e1234-a1b2-4c3d-e4f5-6789abcdef01"
}
```
- **Xóa mặc định**: Gửi `"agent_key": null` để gỡ bỏ.
- **Response HTTP 200 OK**:
```json
{
  "current": "7b8e1234-a1b2-4c3d-e4f5-6789abcdef01",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "success": true
}
```

### 2.3 Khắc Phục Lỗi 409 Conflict Trên Endpoint Hỏi Trợ Lý (`POST /api/v1/ai/ask` - Issue #1415)
- **Nguyên nhân cốt lõi**:
  - `ask_handler.go` sử dụng một biến bộ nhớ tạm `askModels = map[string]string{}` được bảo vệ bằng `sync.Mutex`. Biến này không được lưu xuống DB và không đồng bộ với `tenants.default_ai_agent_key`.
  - Khi chưa gọi `PUT /api/v1/ai/ask-model`, `model` bị rỗng -> hàm `domain.DecideAsk` trả về `{ ok: false, code: "agent_not_selected" }` -> trả HTTP 409 Conflict về giao diện Web.
  - Khi `model` có giá trị, mã nguồn cũ chỉ trả về `{ ok: true, agent: "goclaw:..." }` chứ **hoàn toàn chưa tích hợp gọi LLM sinh câu trả lời**.
- **Quy chuẩn sửa đổi (Resolution Contract)**:
  1. Khi nhận `POST /api/v1/ai/ask`, đọc `default_ai_agent_key` từ `DefaultAIAgentRepository` (hoặc bảng `tenants`).
  2. Nếu tìm thấy agent tương ứng trong bảng `ai_agents`, sử dụng `system_prompt` và `model_name` của agent đó.
  3. Nếu tenant chưa chọn agent mặc định, hệ thống **tự động fallback về Router9 GOSO provider** với persona "Trợ lý bán hàng sản phẩm" thay vì ném mã lỗi 409 Conflict làm gián đoạn người dùng.
  4. Gửi prompt (kèm `contactId`, `conversationId`, và danh sách lịch sử câu hỏi trước đó) tới LLM Provider, trả về định dạng chuẩn mà `omni-web/src/api/ai-ask.ts` yêu cầu:
  ```json
  {
    "answer": "Sản phẩm hiện đang có sẵn tại kho với mức chiết khấu 15%...",
    "model": "goso:router9",
    "ok": true
  }
  ```

---

## 3. Đặc Tả Floating AI Copilot Chat Widget Phía Frontend

### 3.1 Cấu Trúc Component Phía `omni-web`

```
omni-web/src/
├── components/ai/
│   ├── AiCopilotFloatingWidget.vue   # Widget nút tròn cố định góc phải dưới + popup container
│   ├── AiCopilotChatWindow.vue       # Khung nội dung hội thoại chat, streaming tokens, actions
│   ├── AiCopilotMessageItem.vue      # Render từng tin nhắn (User / Assistant), markdown & tool calls
│   └── AiCopilotToolConfirmation.vue # Thẻ xác nhận 1-chạm khi AI đề xuất hành động nhạy cảm
├── composables/
│   └── use-ai-copilot.ts             # Quản lý trạng thái mở/đóng, lịch sử turns, kết nối SSE stream
└── App.vue                           # Mount <AiCopilotFloatingWidget /> toàn cục
```

### 3.2 Thiết Kế Bottom-Left Sidebar Dock & Khung Chat Mở Rộng 760px (Ultra-Spacious Viewport)

1. **Vấn Đề Thực Tế Của Nút Float Góc Phải & Dock Giữa Màn Hình**:
   - Nút góc phải `bottom: 24px; right: 24px`: Che khuất ô soạn tin nhắn chat (`/chat/:id`), nút Gửi, nút đính kèm ảnh/file và panel thông tin khách hàng.
   - Dock giữa màn hình: Dễ che mất dòng cuộn tin nhắn ở giữa và các nút xem thêm tin nhắn cũ/mới trong luồng chat.
   - Khung chat kích thước cũ (`420px x 580px`) quá chật chội, khó đọc các đoạn tóm tắt Markdown dài, bảng báo giá nhiều cột, hoặc đối chiếu dữ liệu 2 bên.
2. **Quy Chuẩn Bottom-Left Sidebar Anchor**:
   - **Tọa độ Neo**: `position: fixed; bottom: 16px; left: calc(var(--v-layout-left, 256px) + 16px); z-index: 999;` (Sát ngay mép phải thanh Sidebar chính, hoặc neo trực tiếp ở chân Sidebar).
   - **Giao Diện Dock Thu Gọn (Sidebar Capsule / Trigger Pill)**:
     - Kích thước: Chiều cao 38px, bo tròn pill (`border-radius: 9999px`), padding ngang 14px-16px.
     - Phong cách: Glassmorphism / Dark Surface (`background: rgba(30, 41, 59, 0.90); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.15);`).
     - Nội dung: Icon Sparkles phát sáng nhẹ + chữ "AI Copilot" + phím tắt badge `Ctrl+K` (hoặc `⌘K`).
     - Hiệu ứng: Hover phóng nhẹ, bóng sáng tím sang trọng.
3. **Khung Chat Mở Rộng Gấp Gần Đôi (Spacious 760px Viewport)**:
   - Tọa độ mở: Neo từ góc trái dưới `position: fixed; bottom: 64px; left: calc(var(--v-layout-left, 256px) + 16px);`.
   - **Kích thước to gấp gần đôi**:
     - Chiều rộng: `width: 760px; max-width: calc(100vw - 320px);` (Gấp 1.8x kích thước 420px cũ, cho phép đọc code, bảng dữ liệu và tóm tắt cực kỳ thoải mái).
     - Chiều cao: `height: 680px; max-height: calc(100vh - 100px);`.
   - **Header Tính Năng Đỉnh Cao**:
     - Tên Agent kèm badge "GOSO Live" + Context Chip hiển thị ngành nghề hiện tại.
     - Nút **Maximize / Restore**: Cho phép phóng to toàn màn hình (hoặc 1100px Split View) khi cần phân tích chuyên sâu.
     - Nút Xóa lịch sử & Nút Thu nhỏ.
   - **Footer Soạn Thảo**:
     - Textarea đa dòng tự co giãn, gợi ý sẵn câu lệnh nhanh (Quick Prompt chips: "Tóm tắt hội thoại", "Soạn báo giá", "Gợi ý trả lời").
   - **Giải phóng 100% không gian CRM**:
     - Góc phải (ô chat khách, nút gửi, nút đính kèm, panel CRM): Hoàn toàn tự do.
     - Khu vực giữa màn hình (dòng tin nhắn chat): Không bị che chắn bất kỳ phần tử nào.

### 3.3 Tự Động Thu Thập Ngữ Cảnh (Context Injection)

Hàm `use-ai-copilot.ts` tự động bắt Router hiện tại:
- Nếu nhân viên đang ở `/chat/:id`: tự động bổ sung `conversation_id: route.params.id` vào payload gọi endpoint `POST /api/v1/ai/copilot/chat`.
- Nếu đang ở `/contacts/:id`: tự động bổ sung `contact_id`.
- Điều này giúp Copilot lập tức hiểu người dùng đang nói về khách hàng nào mà không cần nhân viên phải gõ lại ID hoặc tên khách.

### 3.4 Quản Trị Phiên & Bộ Nhớ Tạm (Session Memory)

- Lịch sử hội thoại của Floating Copilot được lưu vào `sessionStorage` hoặc Pinia Store. Khi nhân viên chuyển trang trong app, khung chat không bị reset nội dung.
- Cung cấp nút "Làm mới phiên chat" (New Chat) để nhân viên xóa sạch ngữ cảnh cũ khi bắt đầu câu hỏi mới.

### 3.5 Đặc Tả Thống Nhất Giao Thức Stream (gRPC-to-REST SSE Token Unification)

Khi backend chuyển đổi luồng streaming từ Connect-RPC/gRPC sang REST SSE (`POST /api/v1/ai/copilot/chat`):
1. **Lệch Key Dữ Liệu**:
   - Backend phát sự kiện:
     ```
     event: token
     data: {"token":"Omni CRM ready. Provide customer ID, lead, or"}
     ```
   - Phía frontend (`use-ai-copilot.ts`) không được phụ thuộc cứng vào duy nhất `data.text`.
   - Bóc tách theo thứ tự ưu tiên đa giao thức (Multi-protocol resilient extractor):
     ```ts
     const tokenChunk = data?.token ?? data?.text ?? data?.content ?? data?.delta ?? data?.chunk_text ?? (typeof data === 'string' ? data : '');
     ```
2. **Scoping Biến Sự Kiện Qua Chunk Phân Mảnh (TCP Chunk Splitting)**:
   - Biến `currentEvent` phải được khai báo **bên ngoài** vòng lặp đọc stream (`while (true)`), mặc định là `'token'`.
   - Khi dòng là rỗng (`\n\n` kết thúc một event SSE), reset `currentEvent = 'token'` để sẵn sàng cho event tiếp theo.
3. **Hiển Thị Tin Nhắn An Toàn (Layout Fallback)**:
   - Trong `AiCopilotChatWindow.vue`: Khi đang stream (`status === 'streaming'`), nếu `msg.content` chưa có ký tự nào thì hiển thị typing indicator 3 chấm; khi đã có `msg.content` thì render markdown ngay lập tức.
   - Khi nhận `event: done` hoặc kết thúc stream: nếu `msg.content` vẫn rỗng vì lỗi upstream, hiển thị thông báo lỗi thân thiện thay vì để bubble trống hoàn toàn.
4. **Backend Tương Thích Kép**:
   - `internal/aiagent/application/copilot/chat_service.go` phát cả 2 key `"token"` và `"text"` trong `copilotdom.EventToken` để tương thích ngược 100% với mọi phiên bản client.

---

## 4. Kế Hoạch Triển Khai Kỹ Thuật (Phasing & Checklist)

### Pha 1: Triển Khai Backend Bridge (Issue #1412)
- [ ] Refactor `DefaultAIAgentHTTPHandler` trong `internal/aiagent/interfaces/http/default_ai_agent_tail.go`.
- [ ] Xóa bỏ toàn bộ mã trả về 502 `agent_sidecar_unavailable`.
- [ ] Truy vấn danh sách từ `ai_agents` và `tenants.default_ai_agent_key`.
- [ ] Viết unit tests kiểm thử trạng thái 200 OK cho cả trường hợp có agent và danh sách rỗng.

### Pha 2: Triển Khai Giao Diện Floating Copilot (Issue #1413)
- [ ] Tạo composable `use-ai-copilot.ts` xử lý Server-Sent Events (SSE) streaming từ `/api/v1/ai/copilot/chat`.
- [ ] Tạo components `AiCopilotFloatingWidget.vue` và `AiCopilotChatWindow.vue`.
- [ ] Tích hợp vào `App.vue` và kiểm tra trên các độ phân giải màn hình.
- [ ] Kiểm thử luồng hỏi đáp streaming và thực thi công cụ MCP có xác nhận.

### Pha 3: Bóc Tách SSE Stream Token Đa Chuẩn & Khắc Phục Lỗi Ẩn Tin Nhắn
- [ ] Sửa `use-ai-copilot.ts`: hỗ trợ đa key (`token`, `text`, `content`, `delta`), di chuyển `currentEvent` ra ngoài `while (true)`.
- [ ] Cập nhật `AiCopilotChatWindow.vue`: hiển thị nội dung stream thời gian thực và fallback khi rỗng.
- [ ] Thêm dual-field `"token"` và `"text"` trong backend `chat_service.go`.

### 3.6 Đặc Tả Lưu Trữ Vết Hội Thoại (Harness Session & Turn Trace Persistence)

Nhằm mục đích kiểm toán chất lượng prompt, đo lường độ trễ token, và hỗ trợ replay/eval tự động tương tự cơ chế DeepSeek Harness:
1. **Mô Hình Dữ Liệu PostgreSQL**:
   - Bảng `ai_copilot_sessions`: Quản lý phiên hội thoại cấp người dùng/tenant.
     - `id` (UUID PK), `tenant_id` (UUID), `user_id` (UUID), `title` (VARCHAR), `industry_domain` (VARCHAR), `created_at`, `updated_at`.
   - Bảng `ai_copilot_turns`: Lưu chi tiết từng turn hỏi-đáp.
     - `id` (UUID PK), `session_id` (UUID FK), `tenant_id` (UUID), `user_prompt` (TEXT), `system_prompt` (TEXT), `client_context` (JSONB), `model_name` (VARCHAR), `assistant_reply` (TEXT), `tool_executions` (JSONB), `tokens_used` (INT), `duration_ms` (INT), `status` (VARCHAR: `COMPLETED` / `FAILED`), `created_at`.
2. **Cơ Chế Ghi Không Chặn (Non-Blocking Trace Persister)**:
   - Toàn bộ quá trình lưu vết diễn ra sau khi hoàn tất stream (`COPILOT_CHAT_STREAM_COMPLETED`), không làm trễ tốc độ stream token về client.
   - Sử dụng Transactional Outbox hoặc background worker bounded pool để ghi dữ liệu trace vào PostgreSQL.
3. **API Tra Cứu Lịch Sử & Replay Trace**:
   - `GET /api/v1/ai/copilot/sessions?page=&page_size=`: Danh sách các phiên trò chuyện của user/tenant.
   - `GET /api/v1/ai/copilot/sessions/:id/turns`: Chi tiết toàn bộ các lượt prompt, tool execution và chunk token đã nhận từ GOSO.

### 3.7 Kiến Trúc Tự Động Gom Ngữ Cảnh Phía Client (Client-Driven Context Injection)

Trong mô hình SaaS đa ngành (Bất động sản, Spa/Thẩm mỹ, Bán lẻ tiêu dùng, Phòng khám):
1. **Lý Do Đẩy Từ Client (Client-Driven)**:
   - Máy chủ không thể chạy các truy vấn nặng (join 4-5 bảng `contacts`, `deals`, `messages`, `notes`) mỗi khi nhân viên gửi một câu hỏi cho Copilot.
   - Client nắm chính xác nhất trạng thái thao tác của nhân viên tại thời điểm hiện tại: Tab đang mở, bản ghi liên hệ đang chọn, các tin nhắn đang hiển thị trong khung nhìn (viewport).
2. **Cấu Trúc `client_context` Chuẩn Hóa**:
   ```json
   {
     "industry_preset": "real_estate",
     "active_entity": {
       "entity_type": "deal",
       "entity_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
       "snapshot": {
         "title": "Căn hộ Vinhomes Grand Park 2PN",
         "stage": "NEGOTIATION",
         "value": 3500000000,
         "customer_name": "Nguyễn Văn A",
         "customer_phone": "0987654321"
       }
     },
     "viewport_messages": [
       { "sender": "customer", "content": "Dự án này có sổ hồng chưa em?", "sent_at": "2026-10-27T10:15:00Z" },
       { "sender": "agent", "content": "Dạ dự án đã có sổ từng căn rồi ạ.", "sent_at": "2026-10-27T10:16:00Z" }
     ]
   }
   ```
3. **Nguyên Tắc Hybrid Context Injection Trên Backend**:
   - Nếu `req.ClientContext` tồn tại: Backend ưu tiên sử dụng snapshot và viewport messages của client để ráp vào System Prompt, **hoàn toàn không cần query lại DB tin nhắn**.
   - Nếu `req.ClientContext` rỗng: Fallback sang `crm.get_conversation_context` query 10 tin gần nhất trong PostgreSQL.

---

## 4. Kế Hoạch Triển Khai Kỹ Thuật (Phasing & Checklist)

### Pha 1: Triển Khai Backend Bridge (Issue #1412)
- [ ] Refactor `DefaultAIAgentHTTPHandler` trong `internal/aiagent/interfaces/http/default_ai_agent_tail.go`.
- [ ] Xóa bỏ toàn bộ mã trả về 502 `agent_sidecar_unavailable`.
- [ ] Truy vấn danh sách từ `ai_agents` và `tenants.default_ai_agent_key`.
- [ ] Viết unit tests kiểm thử trạng thái 200 OK cho cả trường hợp có agent và danh sách rỗng.

### Pha 2: Triển Khai Giao Diện Floating Copilot (Issue #1413)
- [ ] Tạo composable `use-ai-copilot.ts` xử lý Server-Sent Events (SSE) streaming từ `/api/v1/ai/copilot/chat`.
- [ ] Tạo components `AiCopilotFloatingWidget.vue` và `AiCopilotChatWindow.vue`.
- [ ] Tích hợp vào `App.vue` và kiểm tra trên các độ phân giải màn hình.
- [ ] Kiểm thử luồng hỏi đáp streaming và thực thi công cụ MCP có xác nhận.

### Pha 3: Bóc Tách SSE Stream Token Đa Chuẩn & Khắc Phục Lỗi Ẩn Tin Nhắn (Issue #164)
- [ ] Sửa `use-ai-copilot.ts`: hỗ trợ đa key (`token`, `text`, `content`, `delta`), di chuyển `currentEvent` ra ngoài `while (true)`.
- [ ] Cập nhật `AiCopilotChatWindow.vue`: hiển thị nội dung stream thời gian thực và fallback khi rỗng.
- [ ] Thêm dual-field `"token"` và `"text"` trong backend `chat_service.go`.

### Pha 4: Tái Cấu Trúc Nút Float Sang Bottom-Left Sidebar Dock & Khung Chat 760px (Issue #165)
- [ ] Tái cấu trúc `AiCopilotFloatingWidget.vue` về vị trí sát sidebar trái `bottom: 16px; left: calc(var(--v-layout-left, 256px) + 16px);`.
- [ ] Mở rộng kích thước khung chat `AiCopilotChatWindow.vue` lên `width: 760px; height: 680px;` (gấp gần đôi kích thước 420px cũ).
- [ ] Bổ sung nút Phóng to / Thu nhỏ (Maximize / Restore) cho khung chat Copilot.
- [ ] Đảm bảo phím tắt `Ctrl+K` mở/đóng mượt mà và không che khuất luồng chat CRM ở trung tâm & góc phải.

### Pha 5: Lưu Trữ Harness Trace & Lịch Sử Phiên Chat Backend
- [ ] Migration tạo 2 bảng `ai_copilot_sessions` và `ai_copilot_turns` trong PostgreSQL.
- [ ] Triển khai repository `CopilotTraceRepository` ghi vết phiên và turn chat không làm nghẽn stream.
- [ ] Viết endpoints `GET /api/v1/ai/copilot/sessions` và `GET /api/v1/ai/copilot/sessions/:id/turns` phân trang chuẩn `pkg/pagination`.

### Pha 6: Bộ Gom Ngữ Cảnh Client-Driven & Đa Ngành Frontend (`omni-web`)
- [ ] Tạo composable `use-copilot-context.ts` tự động gom: industry preset, thực thể active, 5-10 tin nhắn trong viewport.
- [ ] Cập nhật payload `POST /api/v1/ai/copilot/chat` trong `use-ai-copilot.ts` gửi kèm `client_context`.
- [ ] Bổ sung selector cấu hình ngành nghề (Real Estate, Spa, Retail, Clinic) trong giao diện Copilot.
