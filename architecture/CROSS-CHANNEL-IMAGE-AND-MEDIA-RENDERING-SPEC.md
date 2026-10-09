# CROSS-CHANNEL-IMAGE-AND-MEDIA-RENDERING-SPEC.md — Đặc tả Cơ chế Nhận diện & Render Hình ảnh Đa Kênh Chuẩn Xác

> **Bounded Contexts:** Conversation & Media (`internal/conversation`), Channel Gateway (`internal/channel`), Frontend (`omni-web`)  
> **Nền tảng hỗ trợ:** Zalo (Personal & Group), Telegram (1-1 & Supergroup/Channel MTProto), WhatsApp (Personal & Group Multi-device)  
> **Trạng thái tài liệu:** Official Engineering Specification

---

## 1. Bối cảnh & Nguyên nhân Sự cố (Root Causes Analysis)

Qua quá trình rà soát commit `b56aad1` (PR #44) và backend Telegram gateway, phát hiện 3 nguyên nhân khiến hình ảnh trên cả 3 nền tảng không hiển thị hoặc bị biến thành thẻ file:

### 1.1 Sự cố 1: Hình ảnh Zalo bị nuốt nhầm thành File Card (Frontend)
- **Vấn đề:** Trong `message-bubble.vue`, nhánh `getFileInfo()` được đặt trước nhánh `getImageUrl()`.
- **Lỗi code:** Hàm `getFileInfo()` bắt điều kiện `if (p.fileUrl || p.href)` mà không kiểm tra đuôi tệp. Tin nhắn ảnh Zalo lưu JSON `{"href": "https://photo-stal-*.zdn.vn/...jpg"}`, do đó `getFileInfo()` trả về kết quả khớp và render nhầm thành thẻ File Card tải về tệp JPG thay vì hiển thị hình ảnh trong khung chat.

### 1.2 Sự cố 2: Hình ảnh Telegram & WhatsApp bị từ chối URL tương đối (Frontend)
- **Vấn đề:** Backend tải ảnh từ Telegram/WhatsApp về server lưu trữ cục bộ để tránh link hết hạn, trả về đường dẫn tương đối:
  `/api/v1/media/files/media/telegram_photo_*.jpg` hoặc `/api/v1/media/files/media/chat_wa_*.jpg`.
- **Lỗi code:** `getImageUrl()` chỉ chấp nhận URL bắt đầu bằng `http` (`directMedia.startsWith('http')` hoặc `firstUrl.startsWith('http')`), dẫn đến tất cả URL nội bộ `/api/v1/...` bị trả về `null`, giao diện không hiển thị được ảnh.

### 1.3 Sự cố 3: Telegram Document dạng ảnh bị ép cứng thành File Document (Backend)
- **Vấn đề:** Telegram MTProto gửi ảnh gốc không nén dưới dạng `tg.MessageMediaDocument` với `MimeType: "image/png"` hoặc `"image/jpeg"`.
- **Lỗi code:** `native_gotd_client.go` ép cứng tất cả document không phải sticker thành `contentType = "document"` và `mediaURL = "tg://document/<id>"` thay vì nhận diện là `image` và tải về máy chủ.

---

## 2. Tiêu chuẩn Phân loại & Render (Invariants)

### 2.1 Tiêu chuẩn Phân loại Nội dung (Classification Invariant)
1. Bất kỳ tệp nào có đuôi mở rộng hình ảnh (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) hoặc có `MimeType: image/*` hoặc `contentType: image` bắt buộc phải đi vào pipeline render **Image**, **tuyệt đối không được rơi vào File Card**.
2. Thẻ File Card (`MessageFileCard`) chỉ áp dụng cho tài liệu, văn bản, bảng tính hoặc tệp nén (`.pdf`, `.zip`, `.rar`, `.docx`, `.xlsx`, `.csv`, ...).

### 2.2 Tiêu chuẩn Chuẩn hóa URL Hình ảnh (`normalizeMediaUrl`)
- Nếu URL là đường dẫn tương đối (bắt đầu bằng `/api/` hoặc `/files/`), tự động kết hợp với `window.location.origin` để tạo URL tuyệt đối mà thẻ `<img>` có thể fetch được.
- Đảm bảo an toàn không bị chặn mixed-content giữa HTTP và HTTPS.

---

## 3. Quy tắc Triển khai Chi tiết

### 3.1 Frontend (`omni-web` - `message-bubble.vue`)
1. **Tinh chỉnh `getFileInfo(msg)`:**
   - Đặt chặn ngay đầu hàm: Nếu `msg.contentType === 'image'` hoặc URL/tên có đuôi ảnh (`.(jpe?g|png|webp|gif)`), lập tức `return null`.
   - Trong nhánh parse JSON: Loại bỏ việc nhận bừa `p.href` nếu không có mime type của tài liệu hoặc đuôi tài liệu.
2. **Tinh chỉnh `getImageUrl(msg)`:**
   - Chấp nhận cả URL bắt đầu bằng `http`, `https`, hoặc `/` (`/api/v1/...`).
   - Cung cấp fallback hình ảnh khi tải thất bại, hỗ trợ xem trước qua modal phóng to ảnh (`FilePreviewModal` / `preview-image`).

### 3.2 Backend (`omni-core` - `native_gotd_client.go`)
1. Khi nhận `tg.MessageMediaDocument`:
   - Nếu `doc.MimeType` bắt đầu bằng `image/`, gán `contentType = "image"` và thực hiện stream tải về lưu vào `media/telegram_photo_<id>.<ext>`.
   - Nếu `doc.MimeType` bắt đầu bằng `video/`, gán `contentType = "video"` và gán URL tương ứng.
