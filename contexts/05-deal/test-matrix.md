# Deal & E-commerce Bounded Context — Ma Trận Kiểm Thử & Invariants

> Bảng đối chiếu kịch bản kiểm thử (Test Matrix) tự động hóa, kiểm thử chuyển trạng thái Deal Pipeline, Invariants Báo giá (Quotes) và Kiểm thử đồng bộ đơn hàng từ Pancake POS.

---

## 1. Ma Trận Kiểm Thử Nghiệp Vụ Cốt Lõi (Core Test Matrix)

| Test ID | Hạng Mục Kiểm Thử | Điều Kiện Đầu Vào (Given) | Hành Động Kích Hoạt (When) | Kết Quả Mong Đợi (Then) | Mức Độ |
|---|---|---|---|---|---|
| **TC-DEAL-01** | Transition Deal Won Valid | Deal có `ContactID` và `Amount = 15,000,000 VND` | Chuyển stage sang `WON` | Thành công, cập nhật `ClosedAt = NOW()`, phát `DealWonEvent`. | P0 (Critical) |
| **TC-DEAL-02** | Transition Deal Won Invalid | Deal chưa gắn `ContactID` hoặc `Amount <= 0` | Cố gắng chuyển sang `WON` | Bị từ chối với lỗi `ErrDealCannotBeWonWithoutContactOrAmount`. | P0 (Critical) |
| **TC-DEAL-03** | Transition Deal Lost Reason | Deal bị khách từ chối | Chuyển stage sang `LOST` không có `LostReason` | Bị chặn lại với lỗi `ErrDealLostReasonRequired`. | P1 |
| **TC-DEAL-04** | Quote Price Snapshot | Sản phẩm niêm yết 10,000,000 VND | Tạo Quote thành công | Giá trong `QuoteItem` được snapshot; khi giá sản phẩm gốc tăng lên 12,000,000, Quote không đổi giá. | P0 (Critical) |
| **TC-DEAL-05** | Quote Discount Approval | Chiết khấu vượt ngưỡng chính sách (> 10%) | Nhân viên tạo Quote giảm 15% | Quote vào trạng thái `PendingApproval`, chặn gửi cho khách cho đến khi Quản lý duyệt. | P1 |
| **TC-DEAL-06** | Quote Expiration Auto | Quote có thời hạn hiệu lực 7 ngày | Sau 7 ngày khách không phản hồi | Cron worker quét chuyển trạng thái sang `Expired`, không thể chuyển thành `Accepted`. | P2 |
| **TC-DEAL-07** | Pancake Webhook Sync | Nhận webhook đơn hàng từ Pancake kèm SĐT | Webhook Handler xử lý | Match đúng `Contact` theo SĐT quốc tế E.164, tạo `OrderStore` và tự động chốt `WON` cho Deal tương ứng. | P0 (Critical) |
| **TC-DEAL-08** | Money Calculation Precision | Báo giá gồm 3 mặt hàng có thuế VAT 8% và 10% | Tính tổng hóa đơn | Tính toán chính xác bằng `MoneyVO` với kiểu `int64` (đơn vị xu/đồng), không dùng `float64` tránh sai số dấu phẩy động. | P0 (Critical) |

---

## 2. Kiểm Thử Invariants & Race Conditions (Stress & Concurrency Tests)

### 2.1 Chống Sai Số Tài Chính Bằng Kiểu `int64` (No Floating Point Error)
- **Yêu cầu kỹ thuật:** Toàn bộ tính toán giá tiền tệ, chiết khấu và thuế VAT phải dùng kiểu số nguyên `int64` (đơn vị đồng hoặc cent) hoặc cấu trúc `MoneyVO`. Tuyệt đối cấm dùng `float32` hoặc `float64`.
- **Kịch bản kiểm tra:**
  - Cộng 100 dòng đơn hàng có đơn giá lẻ `33,333 VND` và thuế suất `8%`:
  - So sánh kết quả tính toán giữa domain logic và kỳ vọng: Độ lệch tuyệt đối phải bằng `0 VND`.

### 2.2 Tranh Chấp Đồng Thời Cập Nhật Giai Đoạn Deal (Kanban Optimistic Lock)
- **Tình huống:** 2 nhân viên mở cùng một màn hình Deal: Sales A kéo sang `Won`, trong khi Sales B cùng lúc cập nhật giá trị Deal từ 50M lên 70M.
- **Kỳ vọng:**
  - Cơ chế Optimistic Lock qua trường `version` trên bảng `deals`:
    ```sql
    UPDATE deals SET stage = 'WON', version = version + 1 WHERE id = :id AND version = :current_version;
    ```
  - Thao tác thứ hai đến sau phát hiện `version` đã thay đổi, từ chối cập nhật và trả về mã lỗi `ErrDealConcurrentConflict`, yêu cầu reload lại dữ liệu mới nhất.
