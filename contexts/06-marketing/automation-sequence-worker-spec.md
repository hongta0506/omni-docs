# Distributed Automation Sequence & Trigger Worker Specification (SPEC 036, 037)

> **Bounded Context:** `internal/marketing` (Submodule `automation` & `sequence`)  
> **Ánh xạ từ ZaloCRM:** `modules/campaign/` & `modules/automation/`  
> **Nguyên tắc:** Clean DDD, Distributed Cron/Scheduler, Event-driven Triggers, Safety Jitter Dispatching.

---

## 1. Bản Chất Nghiệp Vụ Kịch Bản Tự Động (Sequences)

Kịch bản tự động gồm chuỗi các bước gửi tin (Step 1 -> Chờ X giờ/ngày -> Step 2 -> Step 3).
1. **Ghi danh (Enrollment):** Khách hàng được ghi danh vào sequence qua:
   - Webhook sự kiện (Khách quét nhóm Zalo, Khách tạo đơn hàng mới, Khách đạt điểm Lead Score).
   - Tư vấn viên gán thủ công từ giao diện danh bạ.
2. **Cơ Chế Bỏ Qua An Toàn (Safety Skip Rules):**
   - Đang có hội thoại chat trực tiếp trong vòng 24h (`active_chat`).
   - Đang có lịch hẹn chưa hoàn thành (`has_appointment`).
   - Khách đã phản hồi tin nhắn trước đó trong kịch bản (`stop_on_reply = true`).
   - Khung giờ ngoài giờ làm việc (`outside_work_hours`).
3. **Tiến Trình Chạy Nền (Distributed Sequence Worker):**
   - Định kỳ quét các bước đến hạn gửi (`due_executions`).
   - Sử dụng khoá phân tán (PostgreSQL Advisory Lock hoặc Redis) chống chạy trùng lặp khi chạy đa pod/container.
   - Gọi `ZaloDispatcher` thực hiện gửi tin kèm độ trễ ngẫu nhiên (3s - 7s jitter) để chống checkpoint tài khoản.

---

## 2. API Contract

- `POST /api/v1/marketing/sequences/:id/enroll`: Ghi danh danh sách contact vào sequence.
- `POST /api/v1/marketing/sequences/:id/pause`: Tạm dừng sequence.
- `POST /api/v1/marketing/sequences/:id/resume`: Tiếp tục sequence.
- `GET /api/v1/marketing/sequences/:id/executions`: Lịch sử các bước gửi tin và kết quả (gửi thành công, bỏ qua, lỗi).
