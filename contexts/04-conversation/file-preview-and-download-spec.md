# SPEC-CONV-041: Universal File Preview & Secure Download Specification

## 1. Context & Business Value
Hệ thống Omni Core & Omni Web hỗ trợ tin nhắn đa kênh (Zalo, Telegram, WhatsApp) chứa nhiều định dạng tệp tin đính kèm khác nhau (Images, Videos, Audios, Documents, Compressed Archives). Người dùng (CSKH / Sales) cần xem trước trực tiếp trên giao diện và tải xuống tệp tin an toàn với tên gốc mà không bị rào cản CORS hoặc mất dữ liệu.

## 2. Supported Categories & MIME Types
- **Images**: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml` (Hỗ trợ zoom, rotate, download).
- **Videos**: `video/mp4`, `video/webm`, `video/quicktime` (HTML5 video player kèm controls).
- **Audios**: `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp4` (Audio player kèm timeline seek).
- **PDF Documents**: `application/pdf` (Nhúng `<iframe>` xem trực tiếp).
- **Plain Text / Code**: `text/plain`, `application/json`, `text/csv` (Viewer text có thanh cuộn).
- **Office & Archives**: `.docx`, `.xlsx`, `.pptx`, `.zip`, `.rar`, `.7z` (Metadata card hiển thị tên, kích thước và nút tải xuống an toàn).

## 3. UI/UX Pro Max State Machine
1. **Loading State**: Hiển thị `v-progress-circular` khi nạp nội dung.
2. **Error State**: Bắt lỗi HTTP/CORS và hiển thị nút Thử lại (Retry).
3. **Empty State**: Báo tệp không tồn tại hoặc link tải hết hạn.
4. **Active State**: Render viewer tương ứng với category.
5. **In-Progress State**: Nút tải về hiển thị spinner và thanh tiến trình `v-progress-linear`.

## 4. Secure Download & Memory Lifecycle
- Backend proxy: `GET /api/v1/media/download?url={url}&name={name}` trả về binary blob kèm header `Content-Disposition`.
- Frontend xử lý: Tạo Blob URL (`URL.createObjectURL`), trigger download qua `<a download>`, và thu hồi bộ nhớ bằng `URL.revokeObjectURL(blobUrl)` sau 5s hoặc khi đóng modal.
