# AI-TRANSLATION-REPLY-FLOW.md — Đặc tả Luồng Dịch Tin nhắn Trả lời (AI Translation Reply)

> **Context:** Chat Composer, AI Copilot, Language Detection.
> **Status:** Engineering Design Doc

## 1. Mục tiêu
Tự động hóa việc dịch tin nhắn của nhân viên sang ngôn ngữ của khách hàng khi nhân viên sử dụng tính năng **Trả lời (Reply)**, đảm bảo trải nghiệm khách hàng bản địa hóa 100%.

## 2. Logic nghiệp vụ (Business Rules)
1. **Detection**: Dựa trên `customer.language` hoặc `conversation.metadata.language` (được gán sau bước AI/Human Detect).
2. **Trigger**: Khi nhân viên bấm "Reply" tin nhắn và soạn nội dung, hệ thống check:
   - Nếu `nhân_viên_ngôn_ngữ` != `khách_ngôn_ngữ`: Kích hoạt dịch tự động.
3. **Flow**:
   - Nhân viên soạn thảo (tiếng Việt mặc định).
   - Trước khi gửi, hệ thống hiển thị bản dịch "nháp" (dưới dạng text mờ) ngay dưới khung soạn thảo.
   - Nhân viên nhấn "Gửi" -> Nội dung dịch được đẩy vào `payload.content`.

## 3. Cấu trúc yêu cầu (Backend API Update)
Endpoint: `POST /api/v1/conversations/:id/messages`
Payload mới:
```json
{
  "content": "Dịch nội dung",
  "replyMessageId": "UUID",
  "originalContent": "Nội dung gốc (tiếng Việt)",
  "targetLanguage": "en"
}
```

## 4. Checklist Implementation (Composer & ComposerStore)
- [ ] Bổ sung state `translationState` vào `ComposerStore`.
- [ ] Tích hợp API `/api/v1/ai/translate` vào `composer.tsx`.
- [ ] Toggle bật/tắt dịch trong UI Composer.
- [ ] Lưu log bản dịch trong `metadata` của tin nhắn gửi đi để audit.
