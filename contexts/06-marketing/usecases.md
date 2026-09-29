# Marketing & Automation Bounded Context — Nghiệp Vụ & BDD User Stories

> Tài liệu mô tả các kịch bản nghiệp vụ Quản lý Nhãn phân loại (Tags & Tag Groups), Chiến dịch gửi tin đa kênh (Broadcast Campaigns), Cơ chế Chống khóa tài khoản (Rate Limiting & Jitter), Kịch bản nuôi dưỡng tự động (Drip Sequences), và Tự động ngắt khi khách phản hồi (Auto-Exit Condition).

---

## 1. Danh Mục Tác Nhân (Actors)

| Actor | Vai Trò & Trách Nhiệm |
|---|---|
| **Marketing Specialist (Chuyên viên tiếp thị)** | Thiết lập chiến dịch Broadcast, tạo kịch bản Drip Sequence và gắn nhãn phân loại khách hàng. |
| **Campaign Dispatcher Worker** | Worker nền lấy danh sách khách theo phân khúc động và phân bổ tin nhắn qua Rate Limiter. |
| **Account Safety Rate Limiter** | Bộ điều tiết thời gian gửi tin kèm độ trễ ngẫu nhiên (Jitter 15-30s) chống AI của Zalo/Telegram quét khóa tài khoản. |
| **Automation Rule Engine** | Lắng nghe các Domain Event trong hệ thống để tự động kích hoạt hành động (Gắn Tag, kích hoạt kịch bản). |

---

## 2. Danh Sách User Stories & BDD Scenarios

### US-MKT-01: Chiến Dịch Gửi Tin Hàng Loạt An Toàn (Anti-Ban Broadcast Dispatcher)
- **As a** Chuyên viên tiếp thị
- **I want** gửi thông báo ưu đãi tới 500 khách hàng qua tài khoản Zalo cá nhân mà không bị Zalo quét khóa tài khoản (Check-point / Ban)
- **So that** thông điệp tiếp thị tiếp cận khách hàng tối đa với độ an toàn tài khoản cao nhất.

#### Scenario 1: Gửi tin với độ trễ ngẫu nhiên (Random Jitter 15s - 30s)
- **Given** Chiến dịch Broadcast gồm 200 người nhận được kích hoạt chạy qua tài khoản Zalo `0988888888`
- **When** Campaign Dispatcher lấy từng khách hàng trong hàng đợi
- **Then** Rate Limiter chèn độ trễ ngẫu nhiên: `Delay = Random(15s, 30s)` trước mỗi tin nhắn
- **And** Giới hạn tối đa 50 tin nhắn / giờ cho mỗi tài khoản Zalo cá nhân
- **And** Nếu tài khoản Zalo trả về cảnh báo `ErrAccountRestricted`, chiến dịch lập tức tạm dừng (`PAUSED`) và gửi cảnh báo khẩn cấp cho Quản trị viên.

#### Scenario 2: Trích xuất tập người nhận theo Dynamic Segment tại thời điểm chạy
- **Given** Chiến dịch được lên lịch gửi vào lúc 09:00 sáng mai tới nhóm khách hàng có tag `VIP` và chưa mua hàng trong 30 ngày
- **When** Đến 09:00 sáng mai, hệ thống kích hoạt gửi
- **Then** Dispatcher truy vấn trực tiếp cơ sở dữ liệu để lấy danh sách khách hàng thỏa mãn tiêu chí đúng vào lúc 09:00
- **And** Khách hàng nào vừa mua hàng lúc 08:30 sáng mai sẽ tự động bị loại ra khỏi danh sách gửi tin, tránh gửi nhầm thông điệp không phù hợp.

---

### US-MKT-02: Kịch Bản Nuôi Dưỡng Tự Động (Drip Sequence & Auto-Exit)
- **As a** Trưởng nhóm kinh doanh
- **I want** khách hàng mới đăng ký nhận được chuỗi tin nhắn hướng dẫn và ưu đãi tự động sau 1 ngày, 3 ngày, 7 ngày
- **And** chuỗi tin nhắn phải tự động dừng ngay khi khách hàng phản hồi hoặc đã chốt đơn
- **So that** tránh làm phiền khách và không gửi kịch bản chăm sóc ngô nghê khi khách đã mua hàng.

#### Scenario 1: Khách hàng tiến triển theo chuỗi Drip bình thường
- **Given** Khách hàng mới được thêm vào Sequence "Chào Mừng Khách Hàng Mới"
- **When** Khách hàng nhận Step 1 (Tin nhắn ngày 1) và không có phản hồi
- **Then** Sau 3 ngày, hệ thống tự động gửi Step 2 kèm mã giảm giá 10%
- **And** Tiến trình của khách hàng được cập nhật `CurrentStep = 2`.

#### Scenario 2: Tự động ngắt kịch bản khi khách phản hồi hoặc Deal thành công (Auto-Stop Condition)
- **Given** Khách hàng đang ở Step 2 của kịch bản
- **When** Khách hàng nhắn lại tin nhắn "Tôi muốn mua gói này" trên kênh Zalo
- **And** Hệ thống Conversation phát sự kiện `MessageReceivedEvent`
- **Then** Marketing Sequence Engine bắt sự kiện và kiểm tra điều kiện `ExitCondition: OnCustomerReplied = true`
- **And** Lập tức chuyển trạng thái của khách hàng trong sequence sang `COMPLETED_EARLY`
- **And** Hủy toàn bộ các bước gửi tin Step 3, Step 4 trong tương lai.

---

### US-MKT-03: Tự Động Hóa Kích Hoạt Đa Kênh (Automation Rule Engine)
- **As a** Quản trị viên hệ thống
- **I want** cấu hình quy tắc tự động: "Khi Deal chuyển sang WON -> Tự động gắn tag VIP và thêm khách vào danh sách Chăm Sóc Hậu Mãi"
- **So that** tối ưu hóa quy trình làm việc giữa đội ngũ Bán hàng và Chăm sóc khách hàng.

#### Scenario 1: Thực thi Rule tự động khi nhận Domain Event
- **Given** Rule có cấu hình: `Trigger: Event.DealWon -> Action: AddTag("VIP_CUSTOMER") -> Action: EnrollSequence("PostSaleCare")`
- **When** Deal của khách hàng chuyển sang trạng thái `WON`
- **Then** Automation Engine nhận `DealWonEvent`
- **And** Thực thi nguyên tử việc gắn nhãn `VIP_CUSTOMER` vào `Contact` trong Customer BC
- **And** Thêm khách hàng vào kịch bản `PostSaleCare` với độ trễ < 1 giây.
