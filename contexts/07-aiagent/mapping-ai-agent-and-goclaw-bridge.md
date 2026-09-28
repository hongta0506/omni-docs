# Đối Soát Chi Tiết AI Agent, GoClaw Bridge & Hạ Tầng Universal Harness

> Tài liệu đối soát các API Endpoints và Hàm xử lý Backend giữa **ZaloCRM Production (`prod-runtime`)** và **Omni Core (Golang DDD)**.

---

## 1. Danh Sách Endpoints Hiện Tại Trên Production (`prod-runtime`)

### A. Nhóm Quản Lý AI Providers (`/goclaw-providers`)
Backend đóng vai trò proxy bảo mật sang GOSO/GoClaw qua `GOCLAW_BASE_URL` (không lưu raw API key tại CRM DB, lưu vào Vault theo Tenant `x-goclaw-tenant: orgId`).

| Method | Endpoint | Quyền (RBAC) | Chức Năng | Tình Trạng Ở `omni-core` |
|---|---|---|---|:---:|
| `GET` | `/goclaw-providers` | `settings.view` | Lấy danh sách providers của tổ chức (ẩn API key) | **Chưa có** |
| `POST` | `/goclaw-providers` | `settings.manage` | Tạo provider mới (OpenAI, Claude, Gemini, DeepSeek, vLLM, OAuth) | **Chưa có** |
| `GET` | `/goclaw-providers/_meta/types` | `settings.view` | Lấy danh sách chủng loại provider hỗ trợ | **Chưa có** |
| `GET` | `/goclaw-providers/:id/models` | `settings.view` | Lấy danh sách model khả dụng từ provider | **Chưa có** |
| `PATCH` | `/goclaw-providers/:id` | `settings.manage` | Cập nhật tên hiển thị, defaultModel, apiKey | **Chưa có** |
| `DELETE` | `/goclaw-providers/:id` | `settings.manage` | Xóa provider trên GoClaw | **Chưa có** |

### B. Nhóm Quản Lý AI Agents & Binding (`/ai-agents`)

| Method | Endpoint | Quyền (RBAC) | Chức Năng | Tình Trạng Ở `omni-core` |
|---|---|---|---|:---:|
| `GET` | `/ai-agents` | `settings.view` | Danh sách agent kèm ràng buộc kênh & hạn mức ngày | **Chưa có** |
| `POST` | `/ai-agents` | `settings.manage` | Tạo agent mới sang GOSO (system prompt, model, provider) | **Chưa có** |
| `GET` | `/ai-agents/:id` | `settings.view` | Chi tiết cấu hình agent | **Chưa có** |
| `PATCH` | `/ai-agents/:id` | `settings.manage` | Sửa prompt, nhiệt độ, dailyReplyCap, model | **Chưa có** |
| `DELETE` | `/ai-agents/:id` | `settings.manage` | Xóa agent khỏi hệ thống | **Chưa có** |
| `GET` | `/ai-agents/_meta/accounts` | `settings.view` | Danh sách tài khoản gán được (Zalo cá nhân, OA, Bot, Telegram, WhatsApp) | **Chưa có** |
| `POST` | `/ai-agents/_meta/bindings` | `settings.manage` | Ràng buộc Agent vào tài khoản kênh cụ thể | **Chưa có** |
| `DELETE` | `/ai-agents/_meta/bindings/:id` | `settings.manage` | Gỡ bỏ ràng buộc Agent khỏi kênh | **Chưa có** |
| `PATCH` | `/ai-agents/_meta/accounts/:id/auto-reply` | `settings.manage` | Bật/tắt auto-reply riêng cho 1 tài khoản | **Chưa có** |
| `POST` | `/ai-agents/_meta/channels/rotate-bridge-secret` | `settings.manage` | Xoay vòng khóa bí mật HMAC-SHA256 của tenant | **Chưa có** |
| `POST` | `/ai-agents/_meta/channels/retry` | `settings.manage` | Thử kết nối lại kênh lỗi sang GOSO | **Chưa có** |
| `GET` | `/ai-agents/:id/context-files` | `settings.view` | Đọc danh sách file tri thức (AGENTS.md, SOUL.md) | **Chưa có** |
| `PUT` | `/ai-agents/:id/context-files/:filename` | `settings.manage` | Cập nhật nội dung file tri thức lên GoClaw | **Chưa có** |
| `POST` | `/ai-agents/:id/vault/plan-upload` | `settings.manage` | Presigned URL upload tài liệu vào RAG Vault | **Chưa có** |

### C. Nhóm Cầu Nối Thời Gian Thực (`/api/integrations/goclaw/*`)

| Method | Endpoint | Xác Thực | Chức Năng | Tình Trạng Ở `omni-core` |
|---|---|---|---|:---:|
| `POST` | `/api/integrations/goclaw/reply` | HMAC Signature | GOSO webhook trả kết quả tin nhắn cho khách (text, image, bubble) | **Chưa có** |
| `POST` | `/api/integrations/goclaw/context` | HMAC Signature | GOSO lấy ngữ cảnh lịch sử 50 tin nhắn của hội thoại | **Chưa có** |
| `GET` | `/api/integrations/goclaw/health` | Public | Kiểm tra trạng thái cầu nối giữa CRM và GOSO | **Chưa có** |

---

## 2. Các Logic Nghiệp Vụ Cốt Lõi (Functions) Ở Backend Đang Bị Thiếu Khi Sang Go

Qua kiểm tra thư mục `modules/ai-agent/` và `modules/integrations/providers/goclaw-bridge/`:

1. **HMAC-SHA256 Security & Signature Verification**:
   - `signGoClawRequest`: Ký SHA256 header `x-goclaw-signature`, timestamp, nonce và body gửi sang GOSO.
   - `verifyGoClawSignature`: Thẩm định chữ ký khi GOSO webhook gọi lại endpoint reply/context để chống giả mạo request.
2. **Bộ Lọc Cửa Chặn Auto-Reply (Gate Rules & Multi-level Priority)**:
   - `agent-gate.ts`: Kiểm tra 4 tầng công tắc:
     - Tầng 1: Công tắc toàn tổ chức (`auto_reply_enabled`).
     - Tầng 2: Công tắc tài khoản kênh (`BindableAccount.autoReply`).
     - Tầng 3: Khung giờ làm việc / ngoài giờ (`workHours`).
     - Tầng 4: Công tắc riêng của từng hội thoại (sale bấm thủ công tắt bot trong khung chat).
   - `agent-pick-rule.ts`: Phân giải agent theo độ ưu tiên kênh khi 1 khách nhắn tin vào.
3. **Quản Lý Trần Tin Nhắn Hằng Ngày (Daily Cap Enforcement)**:
   - Tránh việc bot bị lặp vô tận (looping) hoặc ngốn token LLM vượt ngân sách. Khi chạm ngưỡng `daily_reply_cap`, tự động chuyển quyền về cho Sale người thật.
4. **Hạ Tầng Hàng Đợi (Queue & Asynchronous Dispatch)**:
   - Trên Node.js prod dùng BullMQ (`deliverToGoClawOnce`).
   - Cần thay thế bằng **NSQ** (`go-nsq`) trong Go để tách rời: Inbound Event -> NSQ -> AI Dispatcher -> LLM -> NSQ Outbound -> Rate-limit Delay (1-3s gõ phím) -> Gateway Send.
5. **Universal Agent Harness Port (Mở Rộng Không Chỉ GOSO)**:
   - Hiện tại Node.js ghép cứng vào GoClaw.
   - Trong Go DDD, thiết kế Interface `AIAgentHarnessPort`:
     - Adapter 1: `GOSOAdapter` (chuẩn REST + HMAC hiện hữu).
     - Adapter 2: `OpenAICompatibleAdapter` (chuẩn OpenAI Chat Completions cho vLLM, Ollama, Dify).
     - Adapter 3: `WebhookAdapter` (cho các harness tự dựng).
