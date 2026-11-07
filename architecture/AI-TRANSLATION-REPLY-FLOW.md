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
