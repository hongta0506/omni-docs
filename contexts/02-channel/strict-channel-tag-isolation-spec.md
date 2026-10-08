# SPEC-CHANNEL-042: Strict Channel Isolation for Tags Specification

## 1. Context & Problem Statement
Trong môi trường đa kênh (Multi-Channel Unified Inbox), Zalo cung cấp nhãn phân loại độc quyền (Zalo Native Labels - `zaloLabels`, `zaloRealTags`). Khi người dùng chuyển sang hội thoại hoặc nhóm của Telegram hoặc WhatsApp, các nhãn Zalo native và icon nhận diện Zalo (`ZaloBrandIcon`) không được phép hiển thị để tránh gây hiểu nhầm nghiệp vụ và vi phạm phân lập kênh.

## 2. Invariants & Rules
1. **Strict Channel Gating**:
   - `zaloLabels`, `zaloRealTags`, và Zalo Classification Menu chỉ được render khi `conversation.channel === 'zalo'`.
   - Với `telegram` và `whatsapp`, thanh Tag chỉ hiển thị CRM Tags (`tagsCrm`, `manual_per_nick`, `autoTags`).
2. **Header & Context Menu**:
   - Nút phân loại Zalo trên mobile header và desktop header bị ẩn hoặc thay thế bằng nút "+ Gắn thẻ CRM" khi hội thoại thuộc Telegram hoặc WhatsApp.
3. **Sidebar Filter Isolation**:
   - Khi bộ lọc hội thoại đang chọn tab `telegram_bot` hoặc tài khoản Telegram / WhatsApp (`isNonZalo === true`), danh mục lọc tag Zalo native tự động ẩn hoàn toàn.
4. **Resilience & Optimistic Rollback**:
   - Khi thực hiện gán/gỡ tag, UI lưu lại trạng thái trước đó. Nếu API gọi lỗi, rollback state tức thì và thông báo toast lỗi cho người dùng.
