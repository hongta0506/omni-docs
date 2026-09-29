# Service API & External Gateway Bounded Context — Ma Trận Kiểm Thử & Invariants

> Bảng đối chiếu kịch bản kiểm thử (Test Matrix) tự động hóa, kiểm thử bảo mật HMAC, ngăn chặn tấn công mạng, xác thực IP Whitelist và kiểm thử tải cho Service API.

---

## 1. Ma Trận Kiểm Thử Nghiệp Vụ Cốt Lõi (Core Test Matrix)

| Test ID | Hạng Mục Kiểm Thử | Điều Kiện Đầu Vào (Given) | Hành Động Kích Hoạt (When) | Kết Quả Mong Đợi (Then) | Mức Độ |
|---|---|---|---|---|---|
| **TC-SERV-01** | HMAC Valid Signature | Request có `X-Signature` sinh đúng từ `SecretKey` | Gọi POST `/api/v1/service/messages/send` | Middleware xác thực thành công qua `ConstantTimeCompare`, trả HTTP 200. | P0 (Critical) |
| **TC-SERV-02** | HMAC Invalid Signature | Header `X-Signature` bị sửa đổi 1 ký tự | Gọi POST `/api/v1/service/messages/send` | Trả về 401 Unauthorized (`ErrInvalidHMACSignature`), không đọc payload tiếp. | P0 (Critical) |
| **TC-SERV-03** | Anti-Replay Timestamp Valid | `X-Timestamp` lệch 10 giây so với giờ server | Gọi API | Chấp thuận request do nằm trong dung sai ±300 giây. | P0 (Critical) |
| **TC-SERV-04** | Anti-Replay Expired | `X-Timestamp` tạo cách đây 10 phút (> 300s) | Gọi API với chữ ký hợp lệ của request cũ | Trả về 401 Unauthorized (`ErrTimestampExpired`), chặn đứng Replay Attack. | P0 (Critical) |
| **TC-SERV-05** | IP Whitelist Matched | Client gọi từ IP `103.56.12.50` thuộc CIDR `103.56.12.0/24` | Gửi request có key hợp lệ | Middleware kiểm tra IP khớp CIDR, cho phép truy cập. | P1 |
| **TC-SERV-06** | IP Whitelist Blocked | Client gọi từ IP ngoài dải whitelist (`14.161.22.9`) | Gửi request có key hợp lệ | Lập tức trả về 403 Forbidden (`ErrIPNotAllowed`), ghi log cảnh báo IP lạ. | P1 |
| **TC-SERV-07** | Scope Permission Check | Key chỉ có scope `contacts:read` | Gọi lệnh gửi tin `POST /service/messages/send` | Trả về 403 Forbidden (`ErrScopeUnauthorized`), từ chối thực thi quyền chưa cấp. | P1 |
| **TC-SERV-08** | Webhook Retry Exponential | Endpoint đối tác trả về HTTP 500 hoặc Timeout | Webhook Engine gửi sự kiện | Ghi bản ghi `RETRYING`, lên lịch lần 2 (+30s), lần 3 (+2m), lần 4 (+10m), lần 5 (+1h). | P1 |
| **TC-SERV-09** | SLA Breach Detection | Cuộc hội thoại có tin nhắn inbound lúc `T0` | Sau `T0 + 15 phút` chưa có reply outbound | Hệ thống tự động ghi nhận `SLABreachEvent`, tăng bộ đếm vi phạm của nhân viên. | P1 |
| **TC-SERV-10** | Timing Attack Prevention | Kẻ tấn công đo thời gian so sánh chuỗi hash | Gửi 10,000 chữ ký sai với các tiền tố khác nhau | Thời gian phản hồi hoàn toàn đồng nhất do dùng `subtle.ConstantTimeCompare`. | P0 (Critical) |

---

## 2. Kiểm Thử Invariants & Race Conditions (Security & Stress Tests)

### 2.1 Chống Tấn Công Timing Attack Vào Khâu Kiểm Tra Chữ Ký Số
- **Yêu cầu bảo mật:** Không sử dụng toán tử so sánh chuỗi thông thường `sig == expectedSig` vì thời gian so sánh sẽ kết thúc sớm ngay khi gặp ký tự sai đầu tiên, làm rò rỉ độ dài tiền tố đúng.
- **Tiêu chí kiểm thử:**
  - Bắt buộc kiểm tra mã nguồn sử dụng: `crypto/subtle.ConstantTimeCompare([]byte(sig), []byte(expectedSig)) == 1`.
  - Kiểm thử tải 10,000 requests với các chữ ký giả mạo sai ở vị trí ký tự đầu tiên và ký tự cuối cùng: Độ lệch chuẩn thời gian phản hồi (standard deviation) phải tiệm cận 0.

### 2.2 Rate Limiting Đa Luồng Với Thuật Toán Token Bucket (Redis)
- **Tình huống:** Một đối tác bị lỗi vòng lặp vô tận (infinite loop) gửi 2,000 request/giây vào endpoint Service API.
- **Kỳ vọng:**
  - Áp dụng cấu hình `RateLimitPolicyVO: 100 requests / second / key`.
  - Redis Token Bucket sử dụng atomic script (Lua script) hoặc Redis Cell.
  - Sau request thứ 100 trong giây đó, toàn bộ request còn lại phải nhận HTTP 429 Too Many Requests kèm header `Retry-After: 1`. Không làm nghẽn CPU Go runtime.
