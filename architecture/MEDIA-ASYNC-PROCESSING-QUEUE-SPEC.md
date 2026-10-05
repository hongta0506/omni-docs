# Media Async Processing Queue & Distributed Worker Specification

> **ĐẶC TẢ KIẾN TRÚC HÀNG ĐỢI XỬ LÝ ĐA PHƯƠNG TIỆN BẤT ĐỒNG BỘ (MEDIA ASYNC QUEUE & WORKER)**  
> **Mã tài liệu:** `SPEC-ARCH-MEDIA-005`  
> **Bounded Context:** Conversation & Media (`internal/conversation`)  
> **Submodule:** `media`  
> **Hạ tầng liên quan:** NSQ Messaging Engine (`pkg/nsq`), MinIO S3 Storage, Grafana Loki (`pkg/logger`)  
> **Trạng thái:** APPROVED FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, struct, field, topic name giữ nguyên Tiếng Anh)  

---

## 1. Bối cảnh & Vấn đề Kỹ thuật (Context & Problem Statement)

### 1.1 Hiện trạng Xử lý Đồng bộ (Synchronous Bottleneck)
Hiện tại trong `omni-core` (`internal/conversation/application/media/media_app.go` và `media_actions_app.go`):
1. **Blocking HTTP Thread:** Các tác vụ upload tệp tin từ client, áp watermark (`applyWatermarkCmd`), và lưu trữ từ chat (`SaveFromChat`) đều được thực thi đồng bộ 100% trong vòng đời của HTTP request.
2. **Nguy cơ OOM & CPU Throttling:** Khi người dùng đồng thời tải lên các tệp tin ảnh phân giải cao (4K/8K), video lớn hoặc kích hoạt đóng dấu bản quyền hàng loạt (`bulkUpdateMediaCmd`), việc xử lý trực tiếp trên goroutine của HTTP request làm nghẽn Event Loop, tăng đột biến RAM và khiến Garbage Collector bị quá tải.
3. **Thiếu Khả Năng Thử Lại (No Retry/Backoff):** Nếu thao tác ghi sang MinIO hoặc xử lý đồ họa gặp lỗi tạm thời (Transient I/O), toàn bộ request bị fail và dữ liệu rơi vào trạng thái dở dang (Orphan files).

### 1.2 Mục tiêu Thiết kế Kiến trúc Đích
- **Phân tách luồng Nhận (Ingress) và luồng Xử lý (Processing):** Chuyển toàn bộ các tác vụ tính toán nặng (tạo thumbnail, đóng dấu watermark, bóc tách metadata kích thước/thời lượng, tối ưu hóa định dạng WebP) sang Background Consumer Worker.
- **Bảo toàn tính sẵn sàng (Resilience):** Sử dụng hàng đợi phân tán NSQ kết hợp Dead Letter Queue (`system_media_dlq`) và Exponential Backoff with Jitter.
- **Quan sát toàn diện (Observability):** Phát sinh Structured JSON log chuẩn `pkg/logger.LogAudit` đẩy về Grafana Loki phục vụ dashboard giám sát và truy vết sự cố.

---

## 2. Kiến trúc Luồng Dữ Liệu Bất Đồng Bộ (Async Architecture Pipeline)

```
[Client / Web / Mobile]
        │ (1) POST /api/v1/media/upload (Multipart)
        ▼
┌────────────────────────────────────────────────────────┐
│ HTTP Ingress Layer (MediaHTTPHandler)                  │
│ - Validate Auth & Tenant Quota                         │
│ - Write Raw Binary to MinIO Temp Path                  │
│ - Insert Asset (status: 'PROCESSING')                  │
└────────────────────────────────────────────────────────┘
        │
        │ (2) Publish Job (Topic: media.process.tasks)
        ▼
┌────────────────────────────────────────────────────────┐
│ NSQ Distributed Queue Engine (pkg/nsq)                 │
│ Topic: media.process.tasks | Channel: media-processor  │
└────────────────────────────────────────────────────────┘
        │
        │ (3) Consume Task (Concurrent Workers: 4-8)
        ▼
┌────────────────────────────────────────────────────────┐
│ MediaProcessorWorker (Application Worker Layer)        │
│ ├── 1. Fetch Raw Bytes from MinIO                      │
│ ├── 2. Extract Dimensions, Duration & Format Check     │
│ ├── 3. Generate Thumbnail (WebP 300x300 & 600x600)     │
│ ├── 4. Apply Watermark Overlay (if requested)          │
│ ├── 5. Upload Processed Assets to MinIO Storage        │
│ └── 6. Update DB Asset (status: 'READY', URLs, Meta)   │
└────────────────────────────────────────────────────────┘
        │
        ├─────────────────────────────┬─────────────────────────────┐
        ▼ (Thành công)                ▼ (Lỗi quá 3 lần)             ▼ (Audit Realtime)
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ Realtime WebSocket   │   │ Dead Letter Queue    │   │ Grafana Loki Log     │
│ Emit MEDIA_READY     │   │ Topic:               │   │ action_taken:        │
│ to Client UI         │   │ system_media_dlq     │   │ MEDIA_PROCESSED      │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

---

## 3. Đặc tả Hàng Đợi NSQ & Dữ Liệu Tác Vụ (Topic & Payload Contract)

### 3.1 Topic & Channel Conventions
Bổ sung vào `omni-core/pkg/nsq/topics.go`:

```go
const (
    // Topic xử lý đa phương tiện bất đồng bộ
    TopicMediaProcessTasks = "media.process.tasks"
    ChannelMediaProcessor  = "media-processor"

    // Dead letter queue cho tác vụ media thất bại
    TopicMediaDLQ          = "system_media_dlq"
    ChannelMediaDLQ        = "media-dlq-consumer"
)
```

### 3.2 Cấu trúc Payload Tác Vụ (`MediaProcessTask`)

```json
{
  "task_id": "tsk_01J8F4M1001122334455667788",
  "task_type": "PROCESS_UPLOAD", 
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "asset_id": "ast_01J8F4M2AABBCCDDEEFF001122",
  "raw_storage_key": "raw/2026/10/05/ast_01J8F4M2AABBCCDDEEFF001122.png",
  "file_name": "bang_gia_dich_vu_2026.png",
  "mime_type": "image/png",
  "file_size": 4194304,
  "options": {
    "generate_thumbnail": true,
    "thumbnail_sizes": [300, 600],
    "apply_watermark": true,
    "watermark_text": "ADMATRIX CONFIDENTIAL",
    "watermark_position": "bottom_right",
    "watermark_opacity": 0.4
  },
  "created_at": "2026-10-05T10:30:00Z"
}
```

#### Các giá trị `task_type`:
- `PROCESS_UPLOAD`: Bóc tách thông số tệp mới tải lên, tạo thumbnail và cập nhật trạng thái `READY`.
- `APPLY_WATERMARK`: Áp dấu watermark lên asset đã tồn tại.
- `REMOVE_WATERMARK`: Gỡ dấu watermark, phục hồi URL về file gốc.
- `BULK_WATERMARK`: Xử lý đóng dấu hàng loạt theo danh sách `asset_ids`.
- `OPTIMIZE_WEBP`: Chuyển đổi ảnh sang WebP nén không suy giảm chất lượng phục vụ Web UI.

---

## 4. Quản Trị Vòng Đời & Trạng Thái Media Asset (Asset Lifecycle Invariants)

Bổ sung trường trạng thái vòng đời vào Aggregate Root `MediaVaultAsset`:

```go
type MediaProcessingStatus string

const (
    StatusPendingProcessing MediaProcessingStatus = "PENDING_PROCESSING"
    StatusProcessing        MediaProcessingStatus = "PROCESSING"
    StatusReady             MediaProcessingStatus = "READY"
    StatusFailed            MediaProcessingStatus = "FAILED"
)
```

### Invariants:
1. **Immediate Ingress Invariant:** Khi upload xong qua HTTP, asset được lưu vào DB ngay lập tức với trạng thái `PENDING_PROCESSING` và trả về `202 Accepted` kèm `id` để UI hiển thị trạng thái loading/skeleton.
2. **Optimistic Display Invariant:** Client có thể sử dụng `raw_url` tạm thời nếu cần hiển thị ngay trong khi thumbnail đang được sinh bất đồng bộ trong background.
3. **Idempotent Processing:** Nếu nhận cùng một `task_id` hoặc cùng một `asset_id` đang ở trạng thái `READY`, worker phải kiểm tra hash hoặc version để tránh ghi đè lãng phí tài nguyên CPU.
4. **Clean Failure Invariant:** Nếu worker xử lý thất bại sau 3 lần retry, trạng thái asset đổi thành `FAILED`, đính kèm mã lỗi (`error_reason`) và đẩy task vào `system_media_dlq`.

---

## 5. Khả Năng Phục Hồi & Phân Loại Lỗi (Resilience & Error Taxonomy)

Tuân thủ nghiêm ngặt chuẩn `pkg/resilience` và `pkg/errors`:

| Nhóm lỗi (Classification) | Nguyên nhân cụ thể | Hành vi của Worker | Chiến lược phục hồi |
|---|---|---|---|
| **Transient** | MinIO S3 I/O timeout, TCP Connection reset, NSQ Requeue | Thử lại tự động | Exponential Backoff with Jitter (Base: 1s, Max: 10s, Retries: 3) |
| **Terminal** | File nhị phân bị hỏng (corrupted magic bytes), tệp vượt quá kích thước cho phép, MIME không hỗ trợ | Ngừng xử lý ngay lập tức | Cập nhật `StatusFailed`, ghi log Terminal, gửi vào `system_media_dlq` |
| **SecurityPolicy** | Phát hiện malware/script độc hại trong tệp tin, vi phạm bản quyền dữ liệu | Cách ly tệp ngay lập tức | Xóa tệp thô khỏi MinIO, khóa asset, kích hoạt Security Alert |

---

## 6. Tiêu Chuẩn Ghi Log Grafana Loki (Observability & Structured Audit)

Mọi trạng thái trong vòng đời xử lý media bắt buộc phải gọi `pkg/logger.LogAudit(ctx, entry)` để xuất JSON ra `stdout`, phục vụ bộ thu thập Promtail đẩy về Grafana Loki:

### Các sự kiện Audit bắt buộc:
1. `MEDIA_UPLOAD_QUEUED`: Khi HTTP Handler đẩy task vào NSQ.
2. `MEDIA_PROCESS_STARTED`: Khi Background Worker bắt đầu lấy task ra thực thi.
3. `MEDIA_THUMBNAIL_GENERATED`: Hoàn thành sinh ảnh thu nhỏ.
4. `MEDIA_WATERMARK_APPLIED`: Hoàn thành đóng dấu bản quyền.
5. `MEDIA_PROCESSED_SUCCESS`: Hoàn thành toàn bộ pipeline, cập nhật trạng thái `READY`.
6. `MEDIA_PROCESS_FAILED`: Xử lý thất bại, chuyển trạng thái `FAILED`.
7. `MEDIA_SENT_TO_DLQ`: Tác vụ cạn kiệt số lần retry, đẩy vào Dead Letter Queue.

### Mẫu JSON Log chuẩn trên Grafana Loki:
```json
{
  "timestamp": "2026-10-05T10:30:02.150Z",
  "level": "INFO",
  "trace_id": "tr_01J8F4N9001122334455667788",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "bounded_context": "conversation",
  "submodule": "media",
  "action_taken": "MEDIA_PROCESSED_SUCCESS",
  "target_resource": "media_asset",
  "target_id": "ast_01J8F4M2AABBCCDDEEFF001122",
  "status_code": 200,
  "duration_ms": 320,
  "payload_summary": {
    "file_size": 4194304,
    "thumbnail_generated": true,
    "watermark_applied": true,
    "output_format": "image/webp"
  }
}
```

---

## 7. Danh Sách Kiểm Tra Khi Triển Khai (Go DDD Compliance Checklist)

- [ ] **Small Aggregate (Pitfall 3):** `MediaVaultAsset` chỉ lưu trữ metadata, đường dẫn URL và trạng thái; không lưu giữ byte buffer của ảnh/video trong RAM.
- [ ] **Stream I/O (Pitfall 1):** Worker tải và xử lý media theo luồng (`io.Reader` / `io.Writer`) với bộ đệm `32KB`, không dùng `io.ReadAll` trên toàn bộ tập tin lớn.
- [ ] **No Silent Fallback (Anti-Cheat 7):** Khi xử lý lỗi, cấm trả về URL rỗng hoặc ảnh giả mạo. Phải trả lỗi thật và chuyển `StatusFailed`.
- [ ] **Thread-Safe Worker Pool:** Background Worker chạy đa luồng an toàn (4 concurrent goroutines), quản lý lifecycle bằng `context.Context` có thời hạn (timeout tối đa 60s/task).
- [ ] **Race Prevention (Rule 8):** Kiểm tra cẩn thận với `go test -race ./internal/conversation/...` đảm bảo không tranh chấp dữ liệu khi nhiều worker cập nhật asset đồng thời.
