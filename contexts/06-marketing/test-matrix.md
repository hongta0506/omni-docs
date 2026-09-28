# Marketing & Automation Bounded Context — Ma Trận Kiểm Thử & Invariants

> Bảng đối chiếu kịch bản kiểm thử (Test Matrix) tự động hóa, kiểm thử bảo vệ tài khoản (Anti-Ban Rate Limiter), Kiểm thử ngắt Sequence tự động và Động cơ Automation Rules.

---

## 1. Ma Trận Kiểm Thử Nghiệp Vụ Cốt Lõi (Core Test Matrix)

| Test ID | Hạng Mục Kiểm Thử | Điều Kiện Đầu Vào (Given) | Hành Động Kích Hoạt (When) | Kết Quả Mong Đợi (Then) | Mức Độ |
|---|---|---|---|---|---|
| **TC-MKT-01** | Anti-Ban Jitter Delay | Chiến dịch gửi qua tài khoản Zalo cá nhân | Dispatcher chuẩn bị gửi 5 tin nhắn liên tiếp | Khoảng cách thời gian giữa mỗi lần gửi nằm ngẫu nhiên trong khoảng `[15s, 30s]`, không gửi dồn dập. | P0 (Critical) |
| **TC-MKT-02** | Account Hourly Limit | Tài khoản Zalo cá nhân đạt hạn mức 50 tin/giờ | Dispatcher chuẩn bị gửi tin thứ 51 | Bị Rate Limiter chặn lại, hoãn cho đến đầu giờ tiếp theo, không cố gửi ép gây khóa tài khoản. | P0 (Critical) |
| **TC-MKT-03** | Auto Pause on Restriction | Gateway trả về mã lỗi `ErrAccountRestricted` | Tin nhắn gửi đi gặp lỗi khóa tài khoản | Chiến dịch tự động chuyển sang `PAUSED`, ngừng gửi toàn bộ tin còn lại, bắn cảnh báo khẩn cấp tới Admin. | P0 (Critical) |
| **TC-MKT-04** | Dynamic Segment Eval | Phân tập động: "Chưa mua hàng trong 30 ngày" | Khách hàng vừa phát sinh đơn hàng 5 phút trước | Khi chiến dịch chạy, truy vấn realtime loại trừ khách hàng này ra khỏi danh sách gửi tin. | P1 |
| **TC-MKT-05** | Sequence Step Progression | Khách hàng nhận Step 1 của Sequence | Sau 3 ngày không có tương tác phát sinh | Hệ thống tự động kích hoạt gửi Step 2, cập nhật `CurrentStep = 2`. | P1 |
| **TC-MKT-06** | Sequence Auto-Exit on Reply | Khách đang ở giữa kịch bản Sequence | Khách gửi tin nhắn phản hồi trên Zalo | Marketing Engine bắt `MessageReceivedEvent`, chuyển trạng thái khách sang `COMPLETED_EARLY`, hủy các bước sau. | P0 (Critical) |
| **TC-MKT-07** | Sequence Auto-Exit on Won | Khách đang trong Sequence chăm sóc | Deal của khách chuyển sang `WON` | Marketing Engine bắt `DealWonEvent`, tự động đưa khách ra khỏi chuỗi kịch bản bán hàng. | P0 (Critical) |
| **TC-MKT-08** | Automation Rule Execution | Rule: "Khi Deal Won -> Gắn Tag VIP" | Sự kiện `DealWonEvent` được bắn trên Bus | Gắn thẻ `VIP` cho khách hàng thành công, ghi nhật ký thực thi `automation_logs`. | P1 |

---

## 2. Kiểm Thử Invariants & Race Conditions (Stress & Concurrency Tests)

### 2.1 Concurrency Trong Broadcast Dispatching Đa Luồng
- **Tình huống:** Chiến dịch gửi cho 10,000 khách hàng sử dụng 10 tài khoản Zalo cá nhân luân phiên (Account Pool).
- **Kỳ vọng:**
  - Worker Pool phân chia danh sách gửi đảm bảo mỗi tài khoản Zalo chạy trên 1 goroutine riêng rẽ với Rate Limiter độc lập.
  - Không có 2 goroutine nào gửi trùng tin nhắn cho cùng 1 khách hàng (Idempotency theo `(CampaignID, ContactID)`).
  - Cập nhật tiến độ `sent_count`, `failed_count` trên bản ghi `Campaign` sử dụng Atomic Increment trong DB:
    ```sql
    UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = :id;
    ```

### 2.2 Đảm Bảo Tính Toàn Vẹn Khi Dừng Khẩn Cấp (Graceful Campaign Cancellation)
- **Tình huống:** Quản trị viên bấm nút "Dừng khẩn cấp" (Cancel Campaign) khi worker đang trong quá trình dispatch.
- **Kỳ vọng:**
  - Context của Campaign Worker bị hủy (`ctx.Done()`).
  - Toàn bộ tin nhắn đang nằm trong hàng đợi chờ gửi bị hủy bỏ ngay lập tức, không gửi thêm bất kỳ tin nhắn nào sau khi đã nhận lệnh Cancel.
