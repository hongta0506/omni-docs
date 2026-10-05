# Media Processor Async Worker Lifecycle Specification

> **Bounded Context:** `internal/conversation` (Submodule `media` & `worker`)  
> **Source Code:** `internal/conversation/application/worker/media_processor_worker.go`  
> **Nguyên tắc:** Clean DDD, Distributed Task Queue, Graceful Shutdown, Stream Processing.

---

## 1. Mục Đích & Kiến Trúc Vận Hành

Khi người dùng hoặc khách hàng gửi ảnh, video, âm thanh qua chat:
1. File nhị phân được upload nhanh vào Media Vault và lưu trạng thái `pending`.
2. Hệ thống đẩy một task `MediaProcessTask` vào hàng đợi phân tán NSQ topic `media.process.tasks` (kèm buffer in-memory fallback).
3. **`MediaProcessorWorker`** nhận task:
   - Xử lý nén ảnh, tạo thumbnail nhỏ gọn để hiển thị nhanh trên Web UI.
   - Trích xuất metadata (width, height, duration, MIME type).
   - Cập nhật trạng thái asset thành `ready` và phát tán sự kiện `MediaAssetProcessedEvent`.

---

## 2. Yêu Cầu Tích Hợp Lifecycle Vào Server (`cmd/server/main.go`)

1. **Khởi tạo:**
   - Tạo instance `MediaProcessorWorker` với cấu hình concurrency (mặc định 4) và max retries (3).
2. **Khởi chạy nền (Background Goroutine):**
   - Chạy `worker.Start(ctx)` gắn với root context của server.
3. **Graceful Shutdown:**
   - Khi server nhận tín hiệu `SIGINT` hoặc `SIGTERM`, gọi `worker.Stop()` đợi toàn bộ tác vụ đang xử lý dở hoàn tất trước khi tiến trình tắt hoàn toàn.
