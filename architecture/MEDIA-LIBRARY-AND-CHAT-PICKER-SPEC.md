# MEDIA-LIBRARY-AND-CHAT-PICKER-SPEC.md — Đặc tả Kỹ thuật Kho Phương tiện & Media Picker trong Chat (Cột 4)

> **Bounded Context:** Conversation & Media (`internal/conversation`)  
> **Frontend Module:** Media Tab Panel & Picker (`omni-web/src/components/chat/MediaTabPanel.vue`, `omni-web/src/api/media.ts`)  
> **Document Status:** Official Reference Spec

---

## 1. Bối cảnh & Phân tích Nghiệp vụ (Business Analysis)

### 1.1 Vấn đề Hiện tại
1. **Giao diện Cột 4 Tab Media trong Chat (`MediaTabPanel.vue`):**
   - Hiển thị 4 sub-tab: **Ảnh** (`image`), **Video** (`video`), **Tệp** (`file`), và **Khối** (`block` - Automation Blocks).
   - Hiện trạng: Cả 3 tab Ảnh, Video, Tệp đều hiển thị thông báo rỗng:
     > *"Không có ảnh nào khớp. Tải lên ở trang Kho ảnh hoặc chuột phải tin nhắn → Lưu vào Media."*
2. **Nguyên nhân Kỹ thuật:**
   - **Lệch cấu trúc DTO giữa Backend và Frontend:**
     - Frontend (`MediaAssetItem` trong `omni-web/src/api/media.ts`) mong đợi các thuộc tính:
       `{ id, kind, name, visibility, ownerUserId, tagIds, usageCount, url, thumbnailUrl, sizeBytes, durationSec, createdAt }`.
     - Backend (`formatAssetJSON` trong `omni-core/internal/conversation/interfaces/http/media_handler.go`) chỉ trả về:
       `{ id, tenantId, folderId, uploaderId, fileName, fileSize, mimeType, originalUrl, watermarkedUrl, activeUrl, isWatermarked, tags, isFavorite, isTrash, createdAt, updatedAt }`.
       → Thiếu `name` (dùng `fileName`), thiếu `kind` (dùng `mimeType`), thiếu `url`/`thumbnailUrl` (dùng `originalUrl`), thiếu `sizeBytes` (dùng `fileSize`), thiếu `tagIds` (dùng `tags`).
   - **Thiếu xử lý bộ lọc truy vấn (Query Filtering):**
     - Frontend gửi các query parameters: `kind`, `q` (tìm kiếm), `visibility`, `tag`, `folderId`, `since` (`7d`|`30d`|`90d`), `sizeMin`, `sizeMax`, `sort` (`most_used`|`recent`|`newest`|`name`), `limit`, `skip`.
     - Backend `ListMedia` chỉ đọc `page`, `limit`, `tag`, `folderId` và hoàn toàn bỏ qua `kind`, `q`, `visibility`, `sort`, `skip`.
   - **Thiếu dữ liệu khởi tạo (Seed Data):**
     - Tenant mặc định (`00000000-0000-0000-0000-000000000001`) chưa có dữ liệu media assets và media folders để hiển thị ngay khi người dùng mở giao diện.

---

## 2. Chuẩn hóa Thuật ngữ & Quy tắc Nghiệp vụ (Ubiquitous Language & Invariants)

| Thuật ngữ | UI Label | Mã Hệ thống (Code / DB) | Ý nghĩa Nghiệp vụ |
|---|---|---|---|
| **Ảnh** | Ảnh | `image` | Hình ảnh JPEG, PNG, WebP, GIF. Hỗ trợ hiển thị thumbnail dạng grid và gửi album nhiều ảnh (tối đa 12 ảnh). |
| **Video** | Video | `video` | Video MP4, QuickTime, WebM. Có ảnh thu nhỏ (thumbnail) và thời lượng video (`durationSec`). |
| **Tệp** | Tệp | `file` | Tài liệu văn phòng: PDF, Excel, Word, PowerPoint, ZIP. Hiển thị dạng danh sách chi tiết kèm icon định dạng và dung lượng. |
| **Khối** | Khối | `block` | Nhúng Automation Blocks Panel (kịch bản tin nhắn mẫu tự động). |
| **Quyền** | Tất cả / Công khai / Riêng tư | `visibility` (`public` / `private`) | `public`: Toàn bộ thành viên trong tổ chức có thể xem và gửi. `private`: Chỉ người tải lên sở hữu. |
| **Dự án** | Dự án | `folders` / `folder_id` | Thư mục nhóm phương tiện theo dự án (bất động sản, chiến dịch bán hàng). |
| **Tag** | Tag | `tags` / `tagIds` | Thẻ phân loại nhanh phương tiện (`#bang-gia`, `#mat-bang`, `#phap-ly`). |
| **Sắp xếp** | Sắp xếp xoay vòng | `sort` | Gửi nhiều (`most_used`), Gần nhất (`recent`), Mới upload (`newest`). |

### Domain Invariants:
1. **Phân loại Media (`Kind Inference`):**
   - Loại media (`kind`) được chuẩn hóa từ `mime_type` hoặc đuôi tệp:
     - `image`: `image/*`
     - `video`: `video/*` hoặc đuôi `.mp4, .mov, .webm, .mkv`
     - `file`: các loại còn lại (`application/*`, `text/*`)
2. **Quyền riêng tư & Phân quyền truy cập (Visibility & RBAC):**
   - Thành viên bình thường: Chỉ truy cập asset của chính mình (`uploader_id = user_id`) HOẶC asset có `visibility = 'public'`.
   - Admin/Manager (`media.view_all`): Xem toàn bộ kho tài nguyên của tổ chức (`tenant_id`).
3. **Giới hạn Album ảnh (Multi-mode constraints):**
   - Tối đa **12 ảnh** cho một lượt chọn và gửi album vào cuộc hội thoại Zalo.
4. **Phân trang Chuẩn mực (Pagination):**
   - Hỗ trợ cả `page/limit` lẫn `skip/limit`.
   - Luôn trả về `total` để hiển thị số trang `page + 1 / totalPages` và badge số lượng trên từng sub-tab.

---

## 3. BDD Acceptance Criteria (Given / When / Then)

### Kịch bản 1: Mở sub-tab Ảnh và xem danh sách
- **Given:** Tổ chức có sẵn các media assets thuộc loại `image`.
- **When:** Người dùng chọn sub-tab **"Ảnh"** trong panel Cột 4.
- **Then:**
  - Badge trên sub-tab "Ảnh" hiển thị chính xác tổng số ảnh có sẵn.
  - Danh sách ảnh hiển thị dạng lưới (grid) với ảnh thumbnail sắc nét, tên ảnh và chỉ số đã gửi.
  - Không còn thông báo rỗng "Không có ảnh nào khớp".

### Kịch bản 2: Lọc theo sub-tab Video và Tệp
- **Given:** Kho media có chứa cả file video MP4 và file tài liệu PDF/Excel.
- **When:** Người dùng chuyển sang sub-tab **"Video"**:
  - Giao diện chuyển sang danh sách video kèm icon play và thời lượng (`durationSec`).
- **When:** Người dùng chuyển sang sub-tab **"Tệp"**:
  - Giao diện chuyển sang dạng dòng (list view) hiển thị icon định dạng (PDF đỏ, XLS xanh lá, DOC xanh dương) cùng dung lượng tệp.

### Kịch bản 3: Tìm kiếm và lọc theo Quyền (Public / Private)
- **Given:** Người dùng đang ở sub-tab bất kỳ.
- **When:** Nhập từ khóa tìm kiếm vào ô input "Tìm ảnh…".
  - Danh sách kết quả lập tức lọc theo tên tệp (`name` / `file_name`).
- **When:** Bấm chọn quyền "Công khai" hoặc "Riêng tư".
  - Danh sách lọc chính xác theo trường `visibility`.

### Kịch bản 4: Sắp xếp xoay vòng (Cycle Sort)
- **Given:** Người dùng bấm nút Sắp xếp.
- **When:** Click lần lượt vào nút Sắp xếp.
  - Chuyển tuần tự: **Gửi nhiều** (`most_used`) → **Gần nhất** (`recent`) → **Mới upload** (`newest`) và cập nhật danh sách hiển thị ngay lập tức.

### Kịch bản 5: Chọn và gửi Album ảnh vào hội thoại
- **Given:** Đang ở sub-tab "Ảnh" và mở một cuộc hội thoại.
- **When:** Tích chọn "Chọn nhiều ảnh (album)", click chọn 3 ảnh và bấm "Gửi 3 ảnh".
- **Then:**
  - Hệ thống gọi API gửi album vào cuộc hội thoại Zalo đang chọn và hiển thị thông báo thành công.

---

## 4. Thiết kế Kỹ thuật Backend (`omni-core`)

### 4.1 Chuẩn hóa DTO `GET /api/v1/media`
Backend `formatAssetJSON` trong `internal/conversation/interfaces/http/media_handler.go` phải trả về cả 2 định dạng trường (backward & forward compatibility):
```json
{
  "items": [
    {
      "id": "81392d8e-62ac-479c-b788-aeb109f7b71c",
      "name": "bang-bao-gia.pdf",
      "fileName": "bang-bao-gia.pdf",
      "kind": "file",
      "visibility": "public",
      "ownerUserId": "00000000-0000-0000-0000-000000000001",
      "uploaderId": "00000000-0000-0000-0000-000000000001",
      "tagIds": ["báo-giá"],
      "tags": ["báo-giá"],
      "usageCount": 12,
      "url": "https://cdn.example.com/media/bang-bao-gia.pdf",
      "originalUrl": "https://cdn.example.com/media/bang-bao-gia.pdf",
      "thumbnailUrl": null,
      "sizeBytes": 1048576,
      "fileSize": 1048576,
      "mimeType": "application/pdf",
      "durationSec": 0,
      "createdAt": "2026-10-01T08:00:00Z",
      "updatedAt": "2026-10-01T08:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 40,
  "totalPages": 1,
  "hasNext": false
}
```

### 4.2 Xử lý Bộ lọc trong Repository Layer (`postgres_repository.go`)
Truy vấn SQL Bun ORM hỗ trợ đầy đủ các tham số:
```go
q := r.db.NewSelect().Model(&models).
    Where("ma.tenant_id = ? AND ma.is_trash = false", tenantID)

// Lọc theo loại (kind)
if kind == "image" {
    q = q.Where("ma.mime_type LIKE 'image/%'")
} else if kind == "video" {
    q = q.Where("ma.mime_type LIKE 'video/%'")
} else if kind == "file" {
    q = q.Where("ma.mime_type NOT LIKE 'image/%' AND ma.mime_type NOT LIKE 'video/%'")
}

// Tìm kiếm tên tệp
if search != "" {
    q = q.Where("ma.file_name ILIKE ?", "%" + search + "%")
}

// Lọc quyền
if visibility != "" {
    q = q.Where("ma.visibility = ?", visibility)
}

// Sắp xếp
switch sort {
case "most_used":
    q = q.Order("ma.usage_count DESC", "ma.created_at DESC")
case "recent":
    q = q.Order("ma.updated_at DESC")
case "name":
    q = q.Order("ma.file_name ASC")
default: // newest
    q = q.Order("ma.created_at DESC")
}
```

---

## 5. Kế hoạch Triển khai (Step-by-Step Execution Plan)

1. **Giai đoạn 1: Tài liệu & Phê duyệt (Docs & Issue Creation)**:
   - Tạo đặc tả `MEDIA-LIBRARY-AND-CHAT-PICKER-SPEC.md` trong `omni-docs`.
   - Tạo PR merge vào `master` của `omni-docs`.
   - Tạo GitHub Issue chuẩn 7 phần trên `omni-core` và gán vào Sprint Board.
2. **Giai đoạn 2: Triển khai Backend (`omni-core`)**:
   - Nâng cấp `ListMedia` trong `media_handler.go` hỗ trợ `kind`, `q`, `visibility`, `sort`, `skip`.
   - Nâng cấp `formatAssetJSON` trả về các trường `name`, `kind`, `url`, `thumbnailUrl`, `sizeBytes`, `tagIds`.
   - Thêm seed media mẫu (Ảnh, Video, Tệp mẫu) cho tenant mặc định `00000000-0000-0000-0000-000000000001`.
   - Viết unit test và chạy 9/9 bước kiểm tra của `scripts/ci/verify_agents_rules.sh` + `go test -race`.
3. **Giai đoạn 3: Kiểm thử Tích hợp Frontend & E2E**:
   - Mở Cột 4 Media trong `/chat`, xác nhận hiển thị mượt mà trên cả 4 sub-tab Ảnh / Video / Tệp / Khối.
   - Thử nghiệm tìm kiếm, sắp xếp và chuyển trang.
   - Tạo PR trên `omni-core`, watch CI pass và squash-merge vào `staging`.
