# Role-Based Resource Quota & Usage Limit Specification

> **ĐẶC TẢ KIẾN TRÚC & QUY TẮC NGHIỆP VỤ: HẠN MỨC TÀI NGUYÊN & ĐỊNH MỨC SỬ DỤNG THEO VAI TRÒ (AI & SOCIAL OMNI ACCOUNTS)**  
> **Mã đặc tả:** `SPEC-ARCH-QUOTA-001`  
> **Bounded Contexts liên quan:**  
> - `internal/identity` (BC 1 — Identity & Settings: Quyền hạn, Quota Policy, User Role)  
> - `internal/channel` (BC 2 — Channel & Gateway: Chốt chặn kết nối Social Accounts Zalo/Telegram/WhatsApp/FB)  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge: Chốt chặn định mức token/lượt gọi LLM)  
> **Trạng thái:** APPROVED SPECIFICATION / READY FOR ISSUE BREAKDOWN  
> **Áp dụng:** Toàn bộ hệ thống Backend Go (`omni-core`), Vue 3 (`omni-web`), Next.js (`omni-web-next`)  

---

## 1. Bối Cảnh Nghiệp Vụ & Phân Tích Nhu Cầu (Business Context & JTBD)

### 1.1 Khung Nhu Cầu Cốt Lõi (Jobs-to-Be-Done - JTBD)
- **Chủ doanh nghiệp / Quản trị viên (Owner / Admin):**
  - *When:* Quản lý chi phí vận hành và tài nguyên hệ sinh thái Omni CRM.
  - *I want to:* Đặt trần số lượng tài khoản mạng xã hội nhân viên được kết nối và giới hạn số lượt/token AI nhân viên được dùng mỗi ngày/tháng; trong khi bản thân Admin không bị giới hạn.
  - *So I can:* Ngăn chặn lạm dụng tài nguyên, tránh bùng nổ chi phí API LLM (OpenAI/Anthropic/Gemini/GoClaw) và kiểm soát rủi ro checkpoint/spam tài khoản social.
- **Nhân viên kinh doanh / Hỗ trợ (Agent / Member):**
  - *When:* Sử dụng các tính năng Omni Chat và trợ lý AI Copilot hàng ngày.
  - *I want to:* Biết rõ hạn mức còn lại trong ngày (số lượt gợi ý AI, số nick social đang quản lý).
  - *So I can:* Chủ động điều tiết công việc hoặc gửi yêu cầu nâng hạn mức lên quản trị viên khi cần thiết.

### 1.2 Phân Tích Căn Nguyên (5 Whys Analysis)
1. *Tại sao hệ thống cần giới hạn tài nguyên?*  
   → Vì chi phí LLM tính theo token và cổng kết nối Social tính theo số phiên proxy/RAM container.
2. *Tại sao phải phân tách Admin vs Non-admin?*  
   → Admin là người quản trị hệ thống/tổ chức, cần năng lực toàn quyền để cấu hình, kiểm thử, xử lý sự cố mà không bị chặn cửa. Nhân viên vận hành thao tác tác vụ lặp đi lặp lại nên phải nằm trong định mức gói cước.
3. *Tại sao giải pháp `org_entitlements.nick_limit` hiện tại chưa đủ?*  
   → Vì `nick_limit` hiện tại chỉ là trần gộp chung ở cấp Workspace (`tenant_id`), chỉ kiểm tra Zalo cá nhân, hoàn toàn bỏ lọt Telegram, WhatsApp, Facebook và không có khái niệm hạn mức cấp User.
4. *Tại sao tính năng AI hiện tại chưa an toàn?*  
   → Vì API `/api/v1/ai/suggest`, `/api/v1/ai/summarize` đang mở tự do, `/api/v1/ai/usage` đang trả về `usedToday: 0` hardcoded, chưa hề ghi nhận ledger thực tế.

---

## 2. Từ Điển Ngôn Ngữ Chung (Ubiquitous Language)

| Thuật ngữ | Định danh Code | Bounded Context | Định nghĩa nghiệp vụ |
|---|---|---|---|
| **Vai trò Quản trị** | `RoleOwner`, `RoleAdmin` | `identity` | Cấp bậc quản trị cao nhất của Workspace, có đặc quyền vượt qua mọi chốt chặn hạn ngạch (**Admin Bypass**). |
| **Vai trò Vận hành** | `RoleManager`, `RoleAgent`, `RoleViewer` | `identity` | Cấp bậc nhân viên, chịu sự kiểm soát chặt chẽ của chính sách hạn mức tài nguyên (**Quota Enforcement**). |
| **Chính sách Hạn mức** | `UserQuotaPolicy` | `identity` | Bộ quy tắc định mức số lượng nick social và lượt/token AI tối đa được cấp cho một User hoặc gán theo Role/Gói cước. |
| **Trần Tài khoản Social** | `SocialAccountCap` | `channel` | Tổng số tài khoản mạng xã hội cá nhân (tính gộp hoặc theo kênh Zalo, Telegram, WhatsApp, FB) mà 1 User được phép liên kết đồng thời. |
| **Định mức Sử dụng AI** | `AIUsageQuota` | `aiagent` | Số lượng lượt gọi (Requests) hoặc số lượng Token tối đa mà User được phép tiêu thụ trong chu kỳ (Ngày / Tháng). |
| **Sổ cái Sử dụng AI** | `AIUsageLedger` | `aiagent` | Bản ghi bất biến ghi nhận mỗi giao dịch AI thành công (`user_id`, `tenant_id`, `feature`, `tokens`, `model`, `cost`). |
| **Quyết định Hạn ngạch** | `QuotaDecision` | Shared Kernel | Kết quả đánh giá trước khi thực thi tác vụ: `Allowed: true` hoặc `Allowed: false` kèm mã lỗi chuẩn (`quota_social_accounts_exceeded`, `quota_ai_daily_exceeded`). |
| **Đặc quyền Bỏ qua** | `AdminBypass` | Shared Kernel | Cơ chế cho phép `RoleOwner` và `RoleAdmin` luôn nhận `QuotaDecision.Allowed = true` mà không cần trừ quota. |

---

## 3. Ma Trận Phân Quyền Hạn Mức (Quota Policy Matrix)

| Tiêu chí | Admin / Owner (`admin`, `owner`) | Manager (`manager`) | Agent / Member (`agent`, `viewer`) |
|---|---|---|---|
| **Cơ chế kiểm tra** | **Admin Bypass** (Luôn cho phép) | **Policy Enforcement** | **Policy Enforcement** |
| **Trần Social Accounts (Tổng cộng)** | **Không giới hạn** (`unlimited`) | Mặc định **10 nick** (Có thể cấu hình) | Mặc định **3 nick** (Có thể cấu hình) |
| - Zalo Personal | Không giới hạn (chỉ chạm trần gói Org) | Tối đa 5 nick | Tối đa 2 nick |
| - WhatsApp Personal | Không giới hạn | Tối đa 3 nick | Tối đa 1 nick |
| - Telegram Personal | Không giới hạn | Tối đa 3 nick | Tối đa 1 nick |
| - Facebook Personal | Không giới hạn | Tối đa 2 nick | Tối đa 1 nick |
| **Định mức AI (Lượt gọi / ngày)** | **Không giới hạn** (`unlimited`) | Mặc định **300 lượt / ngày** | Mặc định **100 lượt / ngày** |
| **Định mức AI (Token / ngày)** | **Không giới hạn** (`unlimited`) | Mặc định **500.000 tokens / ngày** | Mặc định **150.000 tokens / ngày** |
| **Quyền gán/sửa Quota cho người khác** | Có quyền (`quota:manage`) | Chỉ xem nhóm của mình | Không có quyền |

---

## 4. Đặc Tả Hành Vi BDD (Behavior-Driven Development Scenarios)

### 4.1 Kịch bản: Nhân viên kết nối Social Account vượt trần
```gherkin
Scenario: Agent kết nối tài khoản WhatsApp thứ 2 khi trần kênh là 1
  Given User "nhanvien1" có vai trò "agent" trong Workspace "công ty A"
  And User "nhanvien1" đã có 1 tài khoản WhatsApp trạng thái "CONNECTED"
  And Chính sách "SocialAccountCap" của vai trò "agent" quy định tối đa 1 tài khoản WhatsApp
  When User "nhanvien1" gửi yêu cầu GET "/api/v1/whatsapp-personal/login/qr" để kết nối thêm tài khoản
  Then Hệ thống Channel Gateway chặn lại ở lớp Middleware
  And Trả về HTTP 403 Forbidden
  And Payload phản hồi chứa code "quota_social_account_exceeded"
  And Message là "Bạn đã đạt giới hạn 1 tài khoản WhatsApp cá nhân. Vui lòng liên hệ Admin để nâng hạn mức."
  And Không tạo phiên quét QR mới trong cơ sở dữ liệu
```

### 4.2 Kịch bản: Admin kết nối Social Account không bị chặn
```gherkin
Scenario: Admin kết nối tài khoản mạng xã hội không bị giới hạn số lượng cá nhân
  Given User "admin1" có vai trò "admin" hoặc "owner" trong Workspace "công ty A"
  And User "admin1" đã kết nối 15 tài khoản Zalo, 5 tài khoản WhatsApp
  When User "admin1" gửi yêu cầu tạo thêm phiên kết nối
  Then Hệ thống kích hoạt luật Admin Bypass
  And Bỏ qua bước kiểm tra trần nick cá nhân
  And Trả về HTTP 200 OK kèm QR code đăng nhập
```

### 4.3 Kịch bản: Nhân viên sử dụng AI gợi ý câu trả lời vượt trần ngày
```gherkin
Scenario: Agent gọi AI Suggest khi đã hết hạn mức trong ngày
  Given User "nhanvien2" có vai trò "agent"
  And Định mức hàng ngày của "nhanvien2" là 100 lượt gọi AI
  And Bảng "ai_usage_ledgers" ghi nhận User đã thực hiện 100 lượt gọi trong ngày hôm nay (UTC)
  When User "nhanvien2" gửi POST "/api/v1/ai/suggest" trong khung chat
  Then Hệ thống AI Gateway chặn trước khi dispatch prompt sang LLM Harness
  And Trả về HTTP 429 Too Many Requests
  And Payload lỗi chứa code "quota_ai_daily_exceeded"
  And Message là "Hạn mức AI trong ngày của bạn đã hết (100/100 lượt). Hạn mức sẽ được làm mới lúc 00:00 UTC."
  And Tuyệt đối không tiêu tốn thêm token hoặc chi phí của hệ thống
```

### 4.4 Kịch bản: Tra cứu hạn mức và mức độ sử dụng thời gian thực
```gherkin
Scenario: User xem bảng đồng hồ mức sử dụng tài nguyên của bản thân
  Given User đã đăng nhập với JWT hợp lệ
  When Gửi request GET "/api/v1/my/usage-quota"
  Then Hệ thống trả về HTTP 200 OK
  And Payload chứa thông tin chi tiết:
    | Trường dữ liệu | Giá trị mẫu |
    | role | "agent" |
    | isAdmin | false |
    | socialAccounts.used | 2 |
    | socialAccounts.limit | 3 |
    | socialAccounts.remaining | 1 |
    | aiUsage.todayRequests | 45 |
    | aiUsage.dailyLimit | 100 |
    | aiUsage.todayTokens | 67500 |
    | aiUsage.tokenLimit | 150000 |
    | aiUsage.resetAt | "2026-11-06T00:00:00Z" |
```

---

## 5. Thiết Kế Cơ Sở Dữ Liệu (Database Schema)

### 5.1 Bảng Chính sách Hạn mức: `user_quota_policies`
Bảng quy định hạn mức áp dụng theo từng Tenant, Role hoặc ghi đè riêng cho từng User cụ thể.
```sql
CREATE TABLE public.user_quota_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(100) NOT NULL,
    user_id UUID NULL,                        -- NULL: áp dụng chung cho role trong tenant; NOT NULL: ghi đè cho user cụ thể
    role VARCHAR(50) NOT NULL,                -- 'admin', 'manager', 'agent', 'viewer'
    max_total_social_accounts INT NOT NULL DEFAULT 3,
    max_zalo_accounts INT NOT NULL DEFAULT 2,
    max_whatsapp_accounts INT NOT NULL DEFAULT 1,
    max_telegram_accounts INT NOT NULL DEFAULT 1,
    max_facebook_accounts INT NOT NULL DEFAULT 1,
    daily_ai_requests_limit INT NOT NULL DEFAULT 100,
    daily_ai_tokens_limit INT NOT NULL DEFAULT 150000,
    monthly_ai_requests_limit INT NOT NULL DEFAULT 2500,
    monthly_ai_tokens_limit INT NOT NULL DEFAULT 4000000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_role_user UNIQUE(tenant_id, role, user_id)
);

CREATE INDEX idx_user_quota_lookup ON public.user_quota_policies (tenant_id, user_id, role);
```

### 5.2 Bảng Gán Chủ Sở Hữu Kênh: Bổ sung `owner_user_id` vào `channel_accounts`
Để đếm chính xác số lượng tài khoản mỗi User đang sở hữu:
```sql
ALTER TABLE public.channel_accounts 
ADD COLUMN IF NOT EXISTS owner_user_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_channel_accounts_owner ON public.channel_accounts (tenant_id, owner_user_id, channel_type, status);
```

### 5.3 Bảng Sổ Cái Tiêu Thụ AI: `ai_usage_ledgers`
Theo dõi chính xác từng request AI để tổng hợp báo cáo và đối soát quota:
```sql
CREATE TABLE public.ai_usage_ledgers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    feature VARCHAR(50) NOT NULL,             -- 'suggest', 'summarize', 'sentiment', 'auto_reply', 'format_rich'
    model_name VARCHAR(100) NOT NULL,         -- 'gpt-4o-mini', 'gemini-1.5-flash', 'picoclaw'
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    execution_duration_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index đánh mốc thời gian để aggregate ngày và tháng siêu tốc
CREATE INDEX idx_ai_usage_user_daily ON public.ai_usage_ledgers (tenant_id, user_id, created_at);
```

---

## 6. Kiến Trúc Lớp & Chốt Chặn Kiểm Tra (Architectural Enforcement)

### 6.1 Luồng Xử Lý Chốt Chặn Social Account (Channel Gate)
```
[Client / User]
       │
       ▼
[Channel HTTP Handler (Zalo / Telegram / WhatsApp / FB Login)]
       │
       ▼
[QuotaGuardPort.CheckSocialAccountCap(ctx, tenantID, userID, role, channelType)]
       ├── Role == 'owner' || Role == 'admin' ──► [Admin Bypass] ──► CHO PHÉP TẠO PHIÊN QR / LOGIN
       └── Role in ['agent', 'manager', ...]
               │
               ▼
       [Đếm số lượng channel_accounts WHERE owner_user_id = user_id AND status = 'ACTIVE']
               ├── Đang dùng < Hạn mức Policy ──► CHO PHÉP TẠO PHIÊN
               └── Đang dùng >= Hạn mức Policy ──► TỪ CHỐI HTTP 403 (quota_social_account_exceeded)
```

### 6.2 Luồng Xử Lý Chốt Chặn AI Quota (AI Engine Gate)
```
[Client / Chat UI] ── POST /api/v1/ai/suggest
       │
       ▼
[AIAgentRESTHandler]
       │
       ▼
[AIQuotaGuardPort.CheckAIQuota(ctx, tenantID, userID, role)]
       ├── Role in ['owner', 'admin'] ──► [Admin Bypass] ──► CHUYỂN TỚI LLM HARNESS
       └── Non-admin
               │
               ▼
       [Tra cứu bộ đếm Redis: quota:ai:daily:{tenant_id}:{user_id}:{YYYYMMDD}]
               ├── Chưa vượt trần ──► DISPATCH LLM HARNESS
               │                           │
               │                           ▼ (Hoàn tất)
               │                     [Ghi sổ cái DB ai_usage_ledgers & Tăng Redis Counter]
               │
               └── Đã vượt trần ──► TỪ CHỐI HTTP 429 (quota_ai_daily_exceeded)
                                    (Không gọi LLM, không tốn chi phí)
```

---

## 7. Danh Mục API Mới Cần Triển Khai

| Method | Route | Phân quyền | Chức năng nghiệp vụ |
|---|---|---|---|
| `GET` | `/api/v1/my/usage-quota` | Authenticated User | Lấy thông tin hạn ngạch và lượng tài nguyên đã dùng/còn lại trong ngày của User đang đăng nhập. |
| `GET` | `/api/v1/admin/user-quotas` | Admin / Owner | Liệt kê danh sách chính sách hạn mức của các vai trò và user trong Workspace (`pkg/pagination`). |
| `PUT` | `/api/v1/admin/user-quotas/{userId}` | Admin / Owner | Thiết lập/ghi đè hạn mức nick social và quota AI riêng biệt cho một nhân viên cụ thể. |
| `GET` | `/api/v1/admin/ai-usage/analytics` | Admin / Owner | Báo cáo chi tiết lượng tiêu thụ token và số lượt gọi AI theo phòng ban, nhân viên và tính năng. |

---

## 8. Tuân Thủ Chuẩn Mực Hệ Thống (Go DDD & Resilience Compliance)
1. **Zero Silent Fallback:** Khi vượt hạn mức, bắt buộc trả về mã lỗi HTTP 403 / 429 trung thực, nghiêm cấm fake thành công hoặc bypass âm thầm.
2. **Hiệu năng cao với Redis:** Quota hàng ngày của AI kiểm tra trực tiếp qua Redis Atomic Counter (`INCRBY`, `EXPIRE` 24h) để độ trễ chốt chặn đạt dưới 1ms, không làm nghẽn luồng chat. Sổ cái DB ghi bất đồng bộ (`resilience.Go`) để phục vụ lưu trữ vĩnh viễn và kiểm toán.
3. **Structured Logging:** Ghi log JSON chuẩn Grafana Loki:
   - `QUOTA_SOCIAL_ACCOUNT_CHECKED`
   - `QUOTA_SOCIAL_ACCOUNT_BLOCKED`
   - `QUOTA_AI_DAILY_CONSUMED`
   - `QUOTA_AI_DAILY_BLOCKED`

---

## 9. Đo Lường Token Chuẩn Xác: Upstream LLM Response vs Client Estimation

### 9.1 So Sánh Phương Pháp Đo Lường

| Tiêu chí | Đo tại Client / API Gateway (Ước lượng) | Đo tại Phản Hồi của LLM Provider (Chuẩn Hóa Đơn) |
|---|---|---|
| **Cơ chế** | Đếm ký tự hoặc dùng tokenizer mã nguồn mở ở Client/Server trước khi gửi đi. | Lấy trực tiếp trường `usage` từ JSON response do OpenAI, Gemini, Claude hoặc PicoClaw trả về sau khi hoàn tất sinh văn bản. |
| **Độ chính xác** | **Rất sai lệch (Sai số 10x - 50x)**. Lý do: Client chỉ gửi 1 câu ngắn (10 tokens), nhưng AI Agent phải inject: System Prompt (~1.500 tokens), Lịch sử 20 tin nhắn (~2.000 tokens), Schema MCP Tools (~1.000 tokens) và Knowledge RAG. | **Chính xác tuyệt đối 100%**. Trùng khớp từng token với hóa đơn chi phí (Billing Invoice) của nhà cung cấp LLM. |
| **Xử lý Tiếng Việt** | Mỗi model có byte-pair encoding khác nhau (GPT-4o dùng `o200k_base`, Claude/Gemini có vocab riêng). Tokenizer client không bao quát hết. | Nhà cung cấp tính tiền dựa trên chính xác vocab của họ. |
| **Khuyến nghị chuẩn** | Chỉ dùng để hiển thị ước lượng sơ bộ trước khi submit (nếu cần). | **BẮT BUỘC DÙNG** làm dữ liệu nguồn ghi sổ cái `ai_usage_ledgers` và trừ quota người dùng. |

### 9.2 Hợp Đồng Dữ Liệu Token Đo Lường Chuẩn
```go
type LLMTokenTelemetry struct {
    PromptTokens     int    `json:"prompt_tokens"`     // Số token đầu vào (System + History + Prompt + Tools)
    CompletionTokens int    `json:"completion_tokens"` // Số token câu trả lời do model sinh ra
    TotalTokens      int    `json:"total_tokens"`      // Tổng số token bị tính phí
    ModelName        string `json:"model_name"`        // Định danh model thực tế (gpt-4o-mini, gemini-1.5-flash)
    LatencyMs        int64  `json:"latency_ms"`         // Thời gian chờ xử lý của upstream
}
```

---

## 10. Lộ Trình Mở Rộng: Trung Tâm Quản Trị Hạn Mức & Hệ Thống Cảnh Báo (Dedicated Quota Governance & Alert Center)

Trong các pha nâng cấp tiếp theo (Pha Refactor), hệ thống sẽ tách riêng một phân hệ **Super Admin Quota Governance Center**:

1. **Cảnh Báo Chạm Ngưỡng Đa Kênh (Multi-Channel Threshold Alerts):**
   - **Ngưỡng 80% (Warning):** Gửi cảnh báo mềm trong giao diện chat ("Bạn đã dùng 80% hạn ngạch AI hôm nay").
   - **Ngưỡng 100% (Blocked):** Chặn gọi AI, đồng thời bắn Webhook / Telegram Bot cảnh báo cho Quản lý phòng ban và Admin.
2. **Quy Trình Phê Duyệt Nâng Quota Tức Thì (Self-service Quota Request & Approval):**
   - Nhân viên bị hết quota có thể bấm "Yêu cầu cấp thêm quota hôm nay" kèm lý do (ví dụ: đang tư vấn khách hàng VIP).
   - Admin nhận thông báo realtime qua Socket.IO / Telegram và có thể bấm "Duyệt +50 lượt" ngay lập tức mà không cần vào bảng cấu hình phức tạp.
3. **Báo Cáo Đối Soát Chi Phí Nhà Cung Cấp (Provider Cost Reconciliation):**
   - Thống kê tỷ trọng token tiêu thụ giữa các model (OpenAI vs Gemini vs Local LLM).
   - Tự động cảnh báo khi chi phí API trong ngày của toàn bộ Workspace vượt ngưỡng ngân sách cấu hình (Budget Overrun Kill-Switch).

