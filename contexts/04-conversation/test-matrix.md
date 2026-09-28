# Conversation & Media Bounded Context — Ma Trận Kiểm Thử & Invariants

> Bảng đối chiếu kịch bản kiểm thử (Test Matrix) tự động hóa, kiểm thử biên (Boundary), Invariants và Stress Tests cho Hộp thư hội thoại đa kênh.

---

## 1. Ma Trận Kiểm Thử Nghiệp Vụ Cốt Lõi (Core Test Matrix)

| Test ID | Hạng Mục Kiểm Thử | Điều Kiện Đầu Vào (Given) | Hành Động Kích Hoạt (When) | Kết Quả Mong Đợi (Then) | Mức Độ |
|---|---|---|---|---|---|
| **TC-CONV-01** | Inbound Idempotency | Tin nhắn inbound `ChannelMsgID: "msg_abc_01"` lần 1 | Gateway đẩy webhook nhận tin | Tạo Message mới trong DB, broadcast WebSocket thành công. | P0 (Critical) |
| **TC-CONV-02** | Inbound Deduplication | Tin nhắn inbound `ChannelMsgID: "msg_abc_01"` lần 2 trong vòng 24h | Gateway retry do timeout | Redis chặn `SETNX`, trả về ACK 200, không tạo Message thứ 2, không tăng `unread_count`. | P0 (Critical) |
| **TC-CONV-03** | Outbox Atomic Write | Sales bấm gửi tin nhắn outbound | Gọi Command `SendMessage` | Trong cùng 1 DB transaction: Message lưu trạng thái `Pending`, OutboxEvent được lưu. Giao diện nhận HTTP 200 ngay. | P0 (Critical) |
| **TC-CONV-04** | Outbox Worker Retry | Kênh Zalo bị disconnect tạm thời | Worker cố gắng dispatch tin ra Gateway | Worker nhận lỗi, cập nhật `retry_count=1`, tăng thời gian backoff. Tin nhắn vẫn ở trạng thái `Pending`. | P1 |
| **TC-CONV-05** | Outbox Worker Max Retry | Worker retry lần thứ 3 vẫn thất bại | Đạt ngưỡng tối đa | Cập nhật `Message.Status = Failed`, xóa hoặc đánh dấu lỗi trong outbox, push thông báo lỗi về UI của Sales. | P1 |
| **TC-CONV-06** | Cursor Pagination Seek | Hội thoại có 500,000 messages | Gọi `GET /messages` kèm cursor `(sent_at, id)` | Database thực hiện Index Scan trên B-tree composite, thời gian query < 25ms, không dùng `OFFSET`. | P0 (Critical) |
| **TC-CONV-07** | Mark As Read Atomic | Hội thoại đang có `unread_count = 15` | Sales mở hội thoại trên Web UI | `unread_count` giảm về 0, bắn WebSocket `chat.conversation.read`, badge thông báo trên UI cập nhật tức thời. | P1 |
| **TC-CONV-08** | Message Recall Valid | Tin nhắn gửi outbound thành công 5 phút trước | Sales bấm "Thu hồi tin nhắn" | Dispatch lệnh gỡ sang Gateway, Message trong DB đổi thành `Recalled`, nội dung che giấu, push WS cập nhật UI. | P1 |
| **TC-CONV-09** | Message Recall Expired | Tin nhắn đã gửi cách đây 2 tiếng (> 60 phút) | Sales bấm "Thu hồi tin nhắn" | Trả về lỗi `ErrMessageRecallTimeExceeded`, giữ nguyên nội dung tin nhắn. | P2 |
| **TC-CONV-10** | Media Watermark Process | Tải ảnh bảng giá dung lượng 5MB | Gọi Command `UploadMedia` kèm watermark flag | File được nén < 1.5MB, logo và số hotline được đóng dấu chìm vào góc dưới, trả về URL ảnh đã xử lý và thumbnail. | P2 |

---

## 2. Kiểm Thử Invariants & Race Conditions (Stress & Concurrency Tests)

### 2.1 Concurrency Inbound Ingestion (Bão Tin Nhắn Cùng Một Thời Điểm)
- **Tình huống:** Một group chat Zalo hoặc Telegram bắn 100 tin nhắn trong vòng 1 giây về cùng 1 cuộc hội thoại.
- **Kỳ vọng:**
  - 100 goroutines tiếp nhận song song không gây deadlock bảng `conversations`.
  - Cập nhật trường `last_message_at` và `unread_count` chính xác tuyệt đối (`unread_count = unread_count + 100`).
  - Sử dụng câu lệnh nguyên tử: `UPDATE conversations SET unread_count = unread_count + 1, last_message_at = ? WHERE id = ?`.

### 2.2 Tranh Chấp Nhận & Gán Hội Thoại (Conversation Assignment Race Condition)
- **Tình huống:** 2 Sales cùng bấm nút "Tiếp nhận" (Assign to me) một cuộc hội thoại chưa được gán cùng một lúc.
- **Kỳ vọng:**
  - Sử dụng Optimistic Lock (`version` field) hoặc Conditional Update:
    ```sql
    UPDATE conversations 
    SET assigned_user_id = :user_id, version = version + 1 
    WHERE id = :id AND assigned_user_id IS NULL AND version = :current_version;
    ```
  - Chỉ duy nhất 1 Sales nhận thành công (Rows affected = 1). Sales thứ 2 nhận thông báo `ErrConversationAlreadyAssigned`.

### 2.3 Outbox Worker Concurrency với PostgreSQL `FOR UPDATE SKIP LOCKED`
- **Tình huống:** Chạy 5 instances worker cùng quét bảng `outbox_events` để gửi tin nhắn.
- **Kỳ vọng:**
  - Không có 2 worker nào xử lý cùng 1 bản ghi outbox event.
  - Sử dụng câu lệnh:
    ```sql
    SELECT id, payload FROM outbox_events 
    WHERE status = 'PENDING' AND next_retry_at <= NOW()
    ORDER BY created_at ASC 
    LIMIT 50 
    FOR UPDATE SKIP LOCKED;
    ```
  - Đảm bảo throughput gửi tin nhắn cao nhất mà không bị lock contention hay duplicate outbound message sang khách hàng.
