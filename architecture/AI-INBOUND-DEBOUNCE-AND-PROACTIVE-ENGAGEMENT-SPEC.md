# Inbound Debounce Buffer & Proactive Re-engagement Specification

> **ĐẶC TẢ KIẾN TRÚC GỘP TIN NHẮN RỚT DÒNG, ĐỘ TRỄ PHẢN HỒI TỰ NHIÊN & CHỦ ĐỘNG MỞ LẠI HỘI THOẠI (PROACTIVE RE-ENGAGEMENT)**  
> **Mã tài liệu:** `SPEC-ARCH-AIA-003`  
> **Bounded Contexts liên quan:**  
> - `internal/channel` (BC 2 — Channel & Gateway): Inbound buffer, message debounce, outbound throttle.  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge): Re-seeding context synthesizer, proactive agent prompt.  
> - `internal/conversation` (BC 4 — Conversation & Media): Conversation control state, draft injection, message history.  
> - `internal/customer` & `internal/deal` (BC 3 & BC 5): Lead status, Deal stage, customer tags qualification.  
> **Trạng thái:** DRAFT / PROPOSED FOR ARCHITECTURE REVIEW  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, tên trường DB, API contracts giữ nguyên Tiếng Anh).

---

## 1. Bối Cảnh & Vấn Đề Nghiệp Vụ (Context & Problem Statement)

Trong hệ thống AI Auto-Reply đa kênh (Zalo cá nhân, Telegram, Facebook):

1. **Vấn đề 1: Khách nhắn rớt dòng (Fragmented Messages / Rapid-Fire Bursts)**
   - Thói quen người dùng nhắn tin thường gõ từng câu ngắn liên tiếp trong vài giây:
     - Dòng 1 (0s): *"Alo shop ơi"*
     - Dòng 2 (4s): *"Bên mình có mã giảm giá HAGL20 ko ạ"*
     - Dòng 3 (9s): *"Check giúp em với"*
   - **Hậu quả nếu không có Debounce**: Bot nhận dòng 1 ngay lập tức trả lời *"Dạ chào bạn, shop có thể giúp gì ạ?"*, sau đó nhận tiếp dòng 2 lại sinh câu trả lời đè lên, gây giật cục, spam tin nhắn và làm khách khó chịu.

2. **Vấn đề 2: Phản hồi tức thì thiếu tự nhiên (Uncanny Instant Response)**
   - Bot trả lời ngay sau 0.5s - 1s khiến khách biết ngay là máy trả lời, mất tính cá nhân hóa và giảm tỷ lệ chốt đơn.
   - Gửi tin tức thì liên tục khiến Zalo Anti-Spam đánh cờ tài khoản botting (dễ bị khóa tính năng nhắn tin).
   - **Khoảng thời gian phản hồi hợp lý**: Trì hoãn tự nhiên từ **30s – 50s**, hoặc trung bình **1' – 2'** (có kèm jitter ngẫu nhiên) mô phỏng chính xác tốc độ đọc và gõ phím của nhân viên tư vấn thật.

3. **Vấn đề 3: Đứt gãy phễu bán hàng khi khách im lặng (Silent Lead Drop-off)**
   - Sau khi shop gửi báo giá hoặc tư vấn, khách xem xong nhưng bận hoặc phân vân không nhắn lại.
   - Nếu không có cơ chế chủ động mở lại hội thoại sau X giờ, lead sẽ nguội dần và mất doanh số.
   - Tuy nhiên, **tuyệt đối không được gửi bừa bãi không có tiêu chí**:
     - Không gửi cho khách đã chốt đơn / đã mua.
     - Không gửi cho khách đã từ chối rõ ràng ("không có nhu cầu", "đắt quá", "phiền").
     - Không gửi vào đêm muộn hoặc sáng sớm.
     - Không gửi tin rập khuôn máy móc ("Shop chờ anh phản hồi").

---

## 2. Luồng Xử Lý Gộp Tin Rớt Dòng & Độ Trễ Tự Nhiên (Inbound Debounce Buffer)

### 2.1 Kiến Trúc Bộ Đệm (Sliding Window Buffer)

```
[Inbound Message Evt] ──► [Redis/Memory Buffer Key: conv_buf:{tenant}:{conv_id}]
                                │
                                ├── Có tin mới trong window:
                                │     - Nối thêm text vào buffer: text += "\\n" + newText
                                │     - Reset / Gia hạn timer (Sliding Window)
                                │
                                └── Hết thời gian chờ (Debounce Timeout: 30s - 50s):
                                      │
                                      ▼
                                [Drain & Flush Buffer]
                                      │
                                      ▼
                                [Nạp vào Prompt AI (1 lần duy nhất)]
                                      │
                                      ▼
                                [Gửi câu trả lời hoàn chỉnh ra Zalo]
```

### 2.2 Quy Tắc Bất Biến (Debounce Invariants)

1. **Concatenation Invariant**: Toàn bộ các mẩu tin nhắn text nhận được trong cửa sổ debounce được ghép nối theo đúng thứ tự thời gian (timestamp ASC), ngăn cách bằng dấu xuống dòng.
2. **Media/Attachment Preservation**: Nếu trong chuỗi tin nhắn có ảnh/file, danh sách attachments được tích lũy vào mảng attachments để AI phân tích toàn diện.
3. **Timer Ceiling Invariant (Hard Cap)**: Để tránh trường hợp khách nhắn liên tục không ngừng khiến timer bị trôi mãi mãi, áp dụng **Hard Ceiling Timeout = 90 giây**. Nếu sau 90 giây kể từ tin đầu tiên mà vẫn còn tin mới, hệ thống bắt buộc phải flush buffer để trả lời lời đợt 1.
4. **Natural Jitter Delay**: Thời gian trễ không cố định số giây mà tính theo công thức:
   - BaseDelay + RandomJitter(0, 15s)
   - Mặc định: BaseDelay = 35s, RandomJitter = 0..15s -> Thời gian trả lời dao động tự nhiên từ **35s đến 50s**.
   - Cấu hình mức chậm (Deep Thinking): BaseDelay = 60s, RandomJitter = 0..60s -> Dao động từ **1' đến 2'**.

---

## 3. Kiến Trúc Chủ Động Nhắn Lại Sau X Giờ (Proactive Re-engagement)

AI chủ động nhắn lại sau khi hội thoại bị gián đoạn X giờ **bắt buộc phải vượt qua 6 tầng sàng lọc nghiêm ngặt (6-Tier Eligibility Guardrails)**:

### 3.1 Bộ Tiêu Chí Sàng Lọc 6 Tầng (6-Tier Eligibility Filter)

| Tầng | Tên Tiêu Chí | Điều Kiện Bắt Buộc (Pass Condition) | Hành Vi Khi Vi Phạm |
|---|---|---|---|
| **Tier 1** | **Terminal Speaker Role** | Người gửi tin cuối cùng là Shop/Agent (last_sender IN ('agent', 'self', 'bot')). Khách là người im lặng. | Bỏ qua. Nếu khách vừa nhắn câu cuối mà shop chưa trả lời thì thuộc luồng Auto-Reply thông thường, không phải Proactive. |
| **Tier 2** | **Working Hours Gate** | Thời gian hiện tại nằm trong khung giờ làm việc: **08:30 – 11:30** hoặc **14:00 – 19:30** (theo timezone khách hàng/tenant). | Hoãn execution tới khung giờ hợp lệ tiếp theo. Cấm gửi 21:00 - 08:00. |
| **Tier 3** | **Lead / Deal Qualification** | 1. Hội thoại có liên kết Contact/Deal hợp lệ.<br>2. Deal Stage **không phải** WON (Đã chốt) và **không phải** LOST (Thất bại).<br>3. Không chứa nhãn tiêu cực: DND, Spam, KhongNhuCau, KhieuNai. | Huỷ bỏ (Abort). Không làm phiền khách đã mua hoặc khách đã từ chối. |
| **Tier 4** | **Inactivity Threshold (X Giờ)** | Thời gian kể từ tin nhắn cuối cùng >= X giờ (Mặc định: **4 giờ** ban ngày hoặc **24 giờ** qua ngày). | Chưa đủ điều kiện thời gian -> Chờ tiếp. |
| **Tier 5** | **Frequency & Quota Cap** | 1. Tối đa **1 tin chủ động / khách / 24 giờ**.<br>2. Tối đa **2 lần nhắc nhở trong toàn bộ vòng đời hội thoại** nếu khách tiếp tục không phản hồi.<br>3. Giới hạn tài khoản Zalo: Tối đa **20 tin chủ động / tài khoản / ngày** (Anti-Ban). | Chuyển trạng thái hội thoại sang DORMANT. Ngừng nhắc nhở vĩnh viễn cho đến khi khách tự nhắn lại. |
| **Tier 6** | **Account Safety Status** | Tài khoản Zalo phải ở trạng thái active, cookie hợp lệ, không có cảnh báo checkpoint từ Zalo Gateway. | Hủy tác vụ, log cảnh báo ops. |

### 3.2 Quy Trình Tái Nạp Ngữ Cảnh (Context Re-seeding Pipeline)

AI không bao giờ gửi tin nhắn chung chung rập khuôn. Quá trình sinh tin chủ động trải qua 4 bước:

1. **Trích xuất Context**:
   - 15 tin nhắn gần nhất trong messages.
   - Thông tin Lead/Contact: Tên gọi, lịch sử mua hàng, sản phẩm đang hỏi thăm.
   - Thông tin Deal: Tên sản phẩm, giá trị đơn hàng, mã khuyến mãi đã trao đổi.
2. **Xác định Điểm Ngắt (Friction Point Identification)**:
   - LLM phân tích lý do khách dừng phản hồi: Đang phân vân giá? Chờ xin ý kiến người thân? Quên phản hồi? Hay cần thêm thông tin kỹ thuật?
3. **Sinh Thông Điệp Khơi Gợi (Hook Message Generation)**:
   - System Prompt chuyên biệt cho Proactive Re-engagement:
     - Xưng hô đúng tên khách.
     - Nhắc lại đúng chi tiết đang trao đổi dở dang.
     - Đưa ra giá trị gia tăng nhẹ nhàng (giữ chỗ khuyến mãi, hỗ trợ kỹ thuật, giải đáp thắc mắc).
     - Kết thúc bằng câu hỏi mở ngắn gọn, dễ trả lời (Yes/No hoặc lựa chọn).
4. **Kiểm duyệt Độ An Toàn (Safety Validation)**:
   - Không chứa từ ngữ hối thúc, dồn ép mua hàng.
   - Không vi phạm chính sách spam của Zalo.

### 3.3 Chế Độ Thực Thi (Dual Execution Modes)

Hệ thống hỗ trợ 2 chế độ cấu hình linh hoạt cho từng tổ chức / tài khoản:

1. **Chế độ Bán Tự Động (Draft Suggestion Mode - Khuyến nghị giai đoạn đầu)**:
   - AI sau khi sinh tin nhắn sẽ **KHÔNG tự động gửi ra Zalo**.
   - AI điền nội dung vào khung soạn thảo (Draft Box) của hội thoại trên giao diện Web CRM.
   - Hiển thị badge: *"AI gợi ý mở lại hội thoại (Im lặng 4h qua)"*.
   - Nhân viên trực chỉ cần xem qua, điều chỉnh nếu muốn và ấn nút **Gửi**.
2. **Chế độ Tự Động Toàn Phần (Direct Auto-Send Mode)**:
   - Hệ thống tự động gửi thẳng qua Zalo Outbound Sender khi đạt 100% 6 tầng tiêu chí.
   - Ghi nhận tin nhắn vào bảng messages với sender_type = 'bot', metadata.is_proactive = true.

---

## 4. Thiết Kế Cơ Sở Dữ Liệu & Migration

### 4.1 Cập nhật bảng ai_configs

```sql
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS debounce_delay_seconds INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS debounce_max_ceiling_seconds INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS proactive_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proactive_idle_hours INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS proactive_mode VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft' hoặc 'auto_send'
  ADD COLUMN IF NOT EXISTS proactive_max_attempts INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS proactive_work_hours_start VARCHAR(5) NOT NULL DEFAULT '08:30',
  ADD COLUMN IF NOT EXISTS proactive_work_hours_end VARCHAR(5) NOT NULL DEFAULT '19:30';
```

### 4.2 Bảng ghi nhận lịch sử Re-engagement: ai_proactive_logs

```sql
CREATE TABLE IF NOT EXISTS ai_proactive_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    channel_account_id VARCHAR(100) NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    trigger_reason VARCHAR(100) NOT NULL, -- 'IDLE_4H', 'DISCOUNT_FOLLOWUP'
    generated_content TEXT NOT NULL,
    execution_mode VARCHAR(20) NOT NULL, -- 'draft' | 'direct_sent'
    status VARCHAR(30) NOT NULL, -- 'SUCCESS', 'SKIPPED_CRITERIA', 'FAILED_GATEWAY'
    skip_reason VARCHAR(100),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proactive_logs_conv ON ai_proactive_logs (conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_logs_tenant ON ai_proactive_logs (tenant_id, created_at DESC);
```

---

## 5. Hợp Đồng API & Giao Diện Người Dùng

### 5.1 REST API Endpoints

1. **Cấu hình Debounce & Proactive Settings**:
   - `GET /api/v1/ai-agents/config/proactive` -> Trả về cấu hình hiện tại.
   - `PUT /api/v1/ai-agents/config/proactive` -> Cập nhật thời gian delay, giờ idle, chế độ draft/auto.
2. **Kích hoạt Re-seed thủ công (Trigger on-demand từ UI)**:
   - `POST /api/v1/conversations/{id}/ai-proactive-draft`
   - Request: `{ "context_notes": "Khách hỏi mã giảm giá" }`
   - Response: `{ "draft_message": "Dạ anh Hùng ơi...", "suggested_action": "SEND_DRAFT" }`
3. **Danh sách nhật ký Proactive**:
   - `GET /api/v1/conversations/{id}/ai-proactive-logs`

### 5.2 Thành Phần Giao Diện Vue.js (omni-web)

1. **AgentAutoReplyCard.vue & AgentAutoReplyPanel.vue**:
   - Thêm Slider: **Thời gian chờ phản hồi tự nhiên (Delay)**: từ 30s – 120s (mặc định 40s).
   - Thêm Switch: **Gộp tin nhắn rớt dòng (Inbound Debounce)**.
   - Thêm Card: **Tự động chăm sóc khách im lặng (Proactive Re-engagement)**:
     - Chọn thời gian im lặng X giờ (Slider 2h – 48h).
     - Chọn chế độ: *Điền sẵn câu trả lời vào ô chat (Khuyến nghị)* vs *Tự động gửi thẳng*.
     - Cài đặt khung giờ gửi tin hợp lệ.
2. **Màn hình Chat (MessageThread.vue / ChatInputArea.vue)**:
   - Khi có gợi ý proactive ở dạng Draft, khung soạn thảo tự hiển thị text với viền sáng xanh + nút *"Gửi tin nhắn AI mở lại hội thoại"* hoặc *"Hủy"*.

---

## 6. Kế Hoạch Triển Khai (Phased Roadmap)

### Phase 1: Inbound Message Debouncer & Natural Delay Buffer (Tuần 1)
- Xây dựng InboundMessageAggregator trong internal/channel/application/autoreply/ với sliding window 30s – 50s.
- Hỗ trợ gộp tin nhắn text rớt dòng và giữ nguyên attachments.
- Unit tests & Race condition checks cho concurrent bursts.

### Phase 2: Proactive Eligibility Filter Engine & Scheduler (Tuần 2)
- Triển khai 6-Tier Filter bảo vệ an toàn (Working Hours, Terminal Role, Deal Stage, Quota).
- Xây dựng background worker kiểm tra các hội thoại thỏa điều kiện im lặng sau X giờ.
- Triển khai ContextReSeeder và Prompt Synthesizer cho Proactive Re-engagement.

### Phase 3: Draft Injection & UI Control (Tuần 3)
- Kết nối API Draft Suggestion lên màn hình Chat của omni-web.
- Bổ sung cấu hình Slider delay và công tắc Proactive trên trang Cài đặt AI Agent.
- Kiểm thử thực tế trên các tài khoản Zalo cá nhân.
