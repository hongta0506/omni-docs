# Đặc Tả Nghiệp Vụ Chi Tiết: AI Agent & Knowledge Bounded Context (65 Endpoints)

> **Bounded Context:** `internal/aiagent`  
> **Phạm vi quản lý:** Quản trị Trợ lý AI thông minh (AI Agents & Assistant Bots), Kho tri thức doanh nghiệp & RAG Retrieval (Knowledge Base & Vector Store), Quản trị nhà cung cấp mô hình ngôn ngữ (GoClaw Providers: OpenAI, Anthropic, Gemini, DeepSeek, Local Ollama), và Giám sát vận hành & Kiểm soát chi phí Token (Ops-Radar & Token Budgeting).

---

## 1. Domain Model, Aggregates & Invariants (Quy Tắc Bất Biến Nghiệp Vụ)

### 1.1 Aggregate Root: `AIAgent` (Trợ Lý AI Đa Kênh)
- **Chế độ hoạt động (`AgentMode`):**
  - `copilot`: Gợi ý câu trả lời cho nhân viên tư vấn trong giao diện chat (nhân viên duyệt trước khi gửi).
  - `autopilot`: Tự động trả lời trực tiếp cho khách hàng trên Zalo, Facebook, WhatsApp theo kịch bản và tri thức đã học.
- **Invariants:**
  1. **Kiểm Soát Độ Tin Cậy & Chuyển Giao Người Thật (Human Fallback Invariant):**
     - Khi phản hồi ở chế độ `autopilot`, nếu độ tin cậy vector RAG (`confidence_score`) thấp hơn ngưỡng cấu hình (mặc định `0.75`), hoặc khách hàng thể hiện thái độ tức giận (Sentiment = `angry`), AI Agent phải lập tức chuyển quyền điều khiển hội thoại cho nhân viên trực (`handover_to_human = true`), không được tự bịa đặt thông tin gây hiểu lầm cho khách hàng (Hallucination Guard).
  2. **Hạn Mức Ngân Sách Chi Phí Token (Token Budget Cap):**
     - Mỗi Agent có ngân sách chi tiêu token trong ngày (`daily_token_limit`). Khi đạt 100% ngân sách, Agent tự động tạm dừng chế độ autopilot và chuyển sang chế độ fallback an toàn để tránh phát sinh chi phí ngoài tầm kiểm soát của công ty.

### 1.2 Aggregate Root: `KnowledgeBase` & Tài Liệu RAG
- **Invariants:**
  1. **Chunking & Vector Embedding Pipeline:**
     - Tài liệu đưa vào Knowledge Base (PDF, DOCX, TXT, Website URL) phải được cắt khúc (`chunking`) với kích thước tối đa 512 tokens và overlap 10%.
     - Sau khi cắt, các chunks được tính toán vector embedding qua embedding provider và lưu trữ đồng bộ vào Vector Database (pgvector).
  2. **Cách Ly Tri Thức Theo Tenant (Tenant Vector Isolation):** Mọi truy vấn vector tương đồng (Cosine Similarity / Hybrid Search) bắt buộc phải kèm điều kiện lọc `tenant_id` ngay tại tầng cơ sở dữ liệu để chống rò rỉ bí mật kinh doanh giữa các doanh nghiệp dùng chung hạ tầng.

---

## 2. Chi Tiết Nghiệp Vụ & BDD Cho Từng Phân Hệ Endpoints

### 2.1 Phân Hệ Cấu Hình & Quản Lý Trợ Lý AI (AI Agents - 25 Endpoints)

#### EP 01-08: CRUD Trợ Lý AI & Persona
- **GET `/api/v1/ai-agents`**: Danh sách tất cả Agent trong workspace kèm trạng thái (`active`, `paused`), mô hình sử dụng, kênh đang gắn.
- **POST `/api/v1/ai-agents`**: Tạo Agent mới: Đặt tên, chọn tính cách (Persona), System Prompt hướng dẫn, chọn mô hình AI (GPT-4o, Claude 3.5 Sonnet, Gemini Flash).
- **GET `/api/v1/ai-agents/{id}`**: Lấy chi tiết cấu hình Agent: System Prompt, nhiệt độ sáng tạo (`temperature`), độ dài tối đa (`max_tokens`), danh sách Knowledge Base liên kết.
- **PUT `/api/v1/ai-agents/{id}`**: Cập nhật thông số Agent.
- **DELETE `/api/v1/ai-agents/{id}`**: Xóa Agent (tự động gỡ liên kết khỏi các hội thoại đang gắn).

#### EP 09-16: Phân Kênh Hoạt Động & Chuyển Giao Người Thật (Handover)
- **POST `/api/v1/ai-agents/{id}/assign-channels`**: Gắn Agent vào một hoặc nhiều nick Zalo, Fanpage hoặc số WhatsApp.
- **DELETE `/api/v1/ai-agents/{id}/unassign-channels`**: Tháo gỡ Agent khỏi kênh mạng xã hội.
- **POST `/api/v1/ai-agents/handover`**:
  - **Nghiệp vụ:** Nhận tín hiệu yêu cầu nhân viên người thật hỗ trợ từ khách hàng hoặc do AI tự động kích hoạt.
  - **BDD Scenario:**
    - *Given:* Hội thoại đang ở chế độ `agent_active=true`.
    - *When:* Khách hàng chat: "Tôi muốn gặp trực tiếp nhân viên tư vấn".
    - *Then:* Hệ thống chuyển `agent_active=false`, thông báo tới phòng ban phụ trách, gửi tin nhắn: "Dạ, em đã kết nối anh/chị với chuyên viên tư vấn ạ!".
- **POST `/api/v1/ai-agents/takeover`**: Nhân viên người thật chủ động giành quyền chat từ tay AI.

#### EP 17-25: Kiểm Thử Prompt & Trò Chuyện Thử Nghiệm (Playground)
- **POST `/api/v1/ai-agents/{id}/test-chat`**: Môi trường giả lập (Playground) để kiểm tra câu trả lời của AI và xem các đoạn tri thức RAG được trích xuất.
- **GET `/api/v1/ai-agents/{id}/conversations-history`**: Danh sách các cuộc trò chuyện mà AI đã tham gia trả lời tự động trong ngày.
- **POST `/api/v1/ai-agents/{id}/feedback`**: Nhân viên chấm điểm tốt/xấu cho câu trả lời của AI để cải thiện chất lượng prompt.

---

## 2.2 Phân Hệ Kho Tri Thức Doanh Nghiệp (Knowledge Base & RAG - 22 Endpoints)

#### EP 26-35: Quản Lý Nguồn Tri Thức & Tải Tài Liệu
- **GET `/api/v1/ai/knowledge`**: Danh sách các kho tri thức phân loại theo chủ đề: Bảng giá, Chính sách bảo hành, Hỏi đáp thường gặp (FAQ), Hướng dẫn kỹ thuật.
- **POST `/api/v1/ai/knowledge`**: Tạo kho tri thức mới.
- **POST `/api/v1/ai/knowledge/{id}/documents/upload`**: Tải file tài liệu (PDF, Word, Excel, CSV) lên hệ thống để phân tích tri thức.
- **POST `/api/v1/ai/knowledge/{id}/crawl-website`**: Nhập đường link website để tự động cào bài viết và nội dung trang web vào kho tri thức.
- **GET `/api/v1/ai/knowledge/{id}/documents`**: Danh sách tài liệu trong kho và trạng thái xử lý vector (`indexing`, `ready`, `failed`).
- **DELETE `/api/v1/ai/knowledge/{id}/documents/{docId}`**: Xóa tài liệu khỏi kho tri thức (tự động xóa toàn bộ vector chunks liên quan trong database).

#### EP 36-42: Quản Lý Chunks & Tìm Kiếm Tương Đồng (RAG Retrieval)
- **GET `/api/v1/ai/knowledge/documents/{docId}/chunks`**: Xem danh sách các đoạn văn bản (chunks) sau khi hệ thống cắt nhỏ tài liệu.
- **PUT `/api/v1/ai/knowledge/chunks/{chunkId}`**: Chỉnh sửa thủ công nội dung chunk để tăng độ chính xác câu trả lời.
- **POST `/api/v1/ai/knowledge/test-retrieval`**: Thử nghiệm truy vấn tìm kiếm RAG theo câu hỏi của khách hàng, xem trước điểm số tương đồng (Cosine Similarity Score).

---

## 2.3 Phân Hệ Nhà Cung Cấp LLM & Giám Sát Chi Phí (GoClaw Providers & Ops-Radar - 18 Endpoints)

#### EP 43-52: Quản Lý Nhà Cung Cấp Mô Hình Ngôn Ngữ (GoClaw Providers)
- **GET `/api/v1/goclaw-providers`**: Danh sách các cổng kết nối LLM đã cấu hình (OpenAI, Azure OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Ollama Local).
- **POST `/api/v1/goclaw-providers`**: Thêm cổng kết nối mô hình mới: nhập API Key, Base URL, cấu hình Rate Limit.
- **POST `/api/v1/goclaw-providers/{id}/test-connection`**: Kiểm tra tính hợp lệ của API Key và độ trễ phản hồi (Ping latency).
- **PUT & DELETE `/api/v1/goclaw-providers/{id}`**: Sửa đổi cấu hình hoặc gỡ bỏ cổng kết nối LLM.
- **GET `/api/v1/goclaw-providers/available-models`**: Danh sách tất cả mô hình có sẵn theo nhà cung cấp (gpt-4o-mini, claude-3-5-sonnet, gemini-1.5-flash).

#### EP 53-65: Radar Vận Hành & Giám Sát Chi Phí Token (Ops-Radar)
- **GET `/api/v1/ops-radar/metrics/token-usage`**: Báo cáo tổng lượng tiêu thụ Token (Prompt Tokens, Completion Tokens) theo giờ/ngày/tuần.
- **GET `/api/v1/ops-radar/metrics/cost-analytics`**: Thống kê chi phí thực tế (USD/VND) chi trả cho từng nhà cung cấp LLM.
- **GET `/api/v1/ops-radar/metrics/latency-p99`**: Biểu đồ độ trễ phản hồi của AI (P50, P90, P99) để phát hiện sự cố nghẽn mạng từ phía nhà mạng AI.
- **GET `/api/v1/ops-radar/alerts`**: Cảnh báo vượt ngân sách, cảnh báo câu hỏi vi phạm chính sách nội dung (Safety & Content Filter).
- **PUT `/api/v1/ops-radar/settings/budgets`**: Thiết lập hạn mức cảnh báo chi phí theo ngày cho toàn bộ Tenant.

---

## 3. Ma Trận Observability, Logging & Exception Chuẩn

| Nhóm Ngoại Lệ | Danh Sách Lỗi Kỹ Thuật / Domain | Phân Loại `pkg/errors` | Hành Động Hệ Thống | Event Log `pkg/logger` |
|---|---|---|---|---|
| **Vượt ngân sách** | Hết hạn mức Token trong ngày của Agent | `CodeForbidden` (QuotaExceeded) | Dừng autopilot, chuyển về copilot | `AI_TOKEN_BUDGET_EXCEEDED` |
| **Độ tin cậy RAG thấp** | RAG confidence score < 0.75 | `CodeInternal` (BusinessFallback) | Tự động chuyển giao nhân viên trực | `AI_LOW_CONFIDENCE_HANDOVER` |
| **LLM Provider lỗi** | OpenAI/Anthropic trả về 429 Rate Limit hoặc 503 | `CodeInternal` (Transient) | Tự động chuyển mô hình dự phòng (Failover) | `AI_PROVIDER_FAILOVER` |
| **Chính sách an toàn** | Khách hỏi nội dung độc hại/nhạy cảm | `CodeInvalidInput` (SafetyViolation) | Từ chối trả lời theo chính sách an toàn | `AI_SAFETY_POLICY_VIOLATED` |
| **Không tìm thấy** | Không tìm thấy Agent, Tri thức, Provider | `CodeNotFound` (Terminal) | Trả về HTTP 404 Not Found | `AI_NOT_FOUND` |
