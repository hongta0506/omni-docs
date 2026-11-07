# AI-TRANSLATION-REPLY-FLOW.md — Đặc tả Luồng Dịch Tin nhắn Trả lời (AI Translation Reply)

> **Context:** AI Agent, Chat Composer, Language Detection, Translation.
> **Status:** Engineering Design Doc (Updated)

## 1. Luồng xử lý mới (Agent-Centric Flow)
Dựa trên chỉ đạo: **AI Agent sẽ chịu trách nhiệm chính** để tối ưu tốc độ và sự tiện lợi cho nhân viên.

### 1.1. Luồng tự động (Workflow)
1. **Detection (Context-based)**: 
   - AI Agent phân tích lịch sử chat (các tin nhắn gần nhất) để xác định ngôn ngữ khách hàng (`targetLanguage`).
   - Nếu khách chat tiếng Trung/Anh/Nhật, AI ghi nhận ngữ cảnh.
2. **Translation Service**:
   - Khi nhân viên Reply, AI Agent nhận nội dung tiếng Việt (gốc).
   - Agent **tự động gọi dịch** sang `targetLanguage`.
   - Kết quả dịch được trả về để hiển thị bản nháp cho nhân viên (không lưu tin nhắn nháp vào DB).
3. **Execution**:
   - Nhân viên chỉ cần duyệt bản dịch, bấm **Gửi**.
   - Khách hàng nhận tin đã dịch.
   - Tin nhắn lưu trong DB là nội dung đã dịch (gửi cho khách), có thể lưu thêm metadata về nội dung gốc để quản lý kiểm tra.

## 2. Logic cập nhật
- **Không lưu bản dịch nháp**: Chỉ hiển thị preview bản dịch tại UI để nhân viên xác nhận.
- **Agent đóng vai trò trung tâm**: AI Agent xử lý nội dung, trừ trường hợp nhân viên muốn trả lời/chỉnh sửa thủ công.
- **Language Detection**: Ưu tiên lịch sử chat thay vì field language tĩnh.

## 3. Checklist cập nhật
- [ ] Agent Service: Bổ sung endpoint/flow xử lý: `Detect Language (Context) -> Translate (Content) -> Reply Preview`.
- [ ] UI Composer: Hiển thị bản dịch preview dưới khung soạn thảo.
- [ ] Workflow: Nếu nhân viên gõ trực tiếp tiếng nước ngoài (không qua Việt), AI giữ nguyên nội dung.

## 4. Metadata Standard & Sync Representation (SPEC-AI-TRANS-001)

### 4.1. Payload & Metadata Schema
Mỗi tin nhắn gửi qua cơ chế dịch tự động (AI Auto-Translate Reply) lưu tại `messages.metadata`:
```json
{
  "is_ai_translated": true,
  "original_content": "Chào bạn, đơn hàng của bạn đã gửi.",
  "translation_info": {
    "from": "vi",
    "to": "en",
    "provider": "ai_agent"
  }
}
```

### 4.2. Nguyên tắc hiển thị trên CRM (chỉ áp dụng cho Next.js omni-web-next)
- **Cột `content` trong DB**: Luôn lưu nội dung đã dịch (ngôn ngữ đích của khách) để khi sync về hoặc gửi đi đều thống nhất.
- **Bong bóng chat (`MessageBubble`):**
  - Hiển thị chữ chính: Nội dung đã dịch (`message.content`).
  - Phụ đề nguồn (Translation Pill): Dưới nội dung có dòng text nhỏ mờ `text-slate-500 text-xs` kèm icon 🌐:
    *`Đã dịch từ: "Chào bạn, đơn hàng của bạn đã gửi."`*
  - Hỗ trợ nút/icon bấm để đảo vị trí hiển thị (toggle view gốc / dịch).
- **Lưu ý nghiệp vụ:** `omni-web` (Vue 3 legacy) **KHÔNG** triển khai tính năng này, chỉ hỗ trợ trên `omni-web-next` và `omni-core`.

## 5. Persistence & Inbound Translation Requirements (SPEC-AI-TRANS-002)

### 5.1. Persistence Compliance (Server & Local)
- **Server-side**: Metadata dịch thuật (`is_ai_translated`, `original_content`, `translation_info`) bắt buộc lưu vào cột `metadata` (JSONB) trong DB. Tuyệt đối không filter hoặc strip metadata này khi truyền qua API/Socket.
- **Client-side (IndexedDB)**: Schema `localDb.messages` phải hỗ trợ field `metadata`. Khi deduplicate tin nhắn giữa cache và delta (API), phải dùng deep merge để bảo tồn metadata này sau mỗi lần reload trang.

### 5.2. Inbound Translation (Dịch tin nhắn khách)
- Đối với tin nhắn khách hàng gửi đến (Inbound), Frontend cần cung cấp nút bấm hoặc tag **"Dịch"** (Translate) ngay dưới bong bóng chat nếu ngôn ngữ tin nhắn khác tiếng Việt.
- UI/UX:
  - Hiển thị nội dung gốc (tiếng khách) là mặc định.
  - Nút "Dịch" (🌐) hiển thị bên dưới.
  - Khi bấm, hiển thị nội dung tiếng Việt (đã dịch bởi AI) ngay phía dưới, kèm chú thích `Đã dịch bởi AI`.
  - Tính năng này phải dùng chung logic preview/toggle giống như luồng "AI Auto-Translate Reply" (SPEC-AI-TRANS-001).
