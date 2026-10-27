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

### 3.2 Vị Trí & Tương Tác Người Dùng (UX & Micro-interactions)

1. **Vị Trí Cố Định**:
   - Tọa độ: `position: fixed; bottom: 24px; right: 24px; z-index: 1000;`.
   - Nút kích hoạt: Nút tròn 56x56px, màu gradient chủ đạo (Indigo/Purple), đổ bóng nổi (`box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.4)`), icon AI lấp lánh (Sparkles/Bot Icon).
   - Tooltip: Hiển thị "Trợ lý AI Copilot (Ctrl + Space)".
2. **Khung Chat Mở Rộng**:
   - Kích thước: `width: 420px; height: 600px; max-height: calc(100vh - 120px);`.
   - Hiệu ứng mở: `transform-origin: bottom right; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);`.
   - Header: Tên Agent đang chọn kèm badge "Trực tuyến", nút thu nhỏ và nút xóa lịch sử chat.
   - Body: Danh sách tin nhắn có thanh cuộn tự động cuộn xuống khi token đang stream về.
   - Quick Prompt Chips: Các nút bấm gợi ý nhanh ("Tóm tắt khách này", "Gợi ý kịch bản xử lý từ chối", "Tra cứu tồn kho").
   - Footer: Textarea tự động co giãn theo nội dung, nút gửi và phím tắt gửi (Enter, Shift+Enter xuống dòng).

### 3.3 Tự Động Thu Thập Ngữ Cảnh (Context Injection)

Hàm `use-ai-copilot.ts` tự động bắt Router hiện tại:
- Nếu nhân viên đang ở `/chat/:id`: tự động bổ sung `conversation_id: route.params.id` vào payload gọi endpoint `POST /api/v1/ai/copilot/chat`.
- Nếu đang ở `/contacts/:id`: tự động bổ sung `contact_id`.
- Điều này giúp Copilot lập tức hiểu người dùng đang nói về khách hàng nào mà không cần nhân viên phải gõ lại ID hoặc tên khách.

### 3.4 Quản Trị Phiên & Bộ Nhớ Tạm (Session Memory)

- Lịch sử hội thoại của Floating Copilot được lưu vào `sessionStorage` hoặc Pinia Store. Khi nhân viên chuyển trang trong app, khung chat không bị reset nội dung.
- Cung cấp nút "Làm mới phiên chat" (New Chat) để nhân viên xóa sạch ngữ cảnh cũ khi bắt đầu câu hỏi mới.

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
