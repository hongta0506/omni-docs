# Deal & E-commerce Bounded Context — Nghiệp Vụ & BDD User Stories

> Tài liệu mô tả các kịch bản nghiệp vụ của Phễu bán hàng (Kanban Deal Stages), Tạo Báo giá (Quotes), Quản lý Bảng giá động (Pricebook), Đồng bộ Đơn hàng & Công nợ từ Pancake POS / KiotViet, và Khóa Invariants chốt đơn.

---

## 1. Danh Mục Tác Nhân (Actors)

| Actor | Vai Trò & Trách Nhiệm |
|---|---|
| **Sales Executive (Nhân viên kinh doanh)** | Quản lý Deal, tạo báo giá cho khách, kéo thả trạng thái trên Kanban. |
| **Sales Manager (Trưởng phòng bán hàng)** | Duyệt báo giá vượt chiết khấu, cấu hình Bảng giá động (Pricebook). |
| **Pancake POS / External Store** | Hệ thống phần mềm bán hàng tại quầy / livestream đẩy đơn hàng qua Webhook. |
| **Order Sync Worker** | Worker nền đối soát SĐT đơn hàng với Customer BC và cập nhật doanh thu Deal. |

---

## 2. Danh Sách User Stories & BDD Scenarios

### US-DEAL-01: Chuyển Trạng Thái Deal Trên Kanban (State Machine Invariants)
- **As a** Nhân viên kinh doanh
- **I want** kéo thả Deal qua các giai đoạn phễu (`Lead` ➔ `Qualified` ➔ `Proposal` ➔ `Negotiation` ➔ `Won` / `Lost`)
- **So that** theo dõi tiến độ chốt khách và dự báo doanh số bán lẻ/doanh nghiệp.

#### Scenario 1: Chốt Deal thành công (Stage: WON)
- **Given** Deal đang ở giai đoạn `Negotiation` với giá trị dự kiến 50,000,000 VND
- **And** Deal đã được liên kết với `ContactID` hợp lệ
- **When** Sales kéo Deal sang cột `WON`
- **Then** Hệ thống kiểm tra: `ContactID != nil` và `Amount > 0`
- **And** Cập nhật `Deal.Status = 'WON'`, ghi nhận `ClosedAt = NOW()`
- **And** Phát sự kiện `DealWonEvent` sang Customer BC để nâng hạng khách hàng từ `Lead` lên `Customer`.

#### Scenario 2: Chặn chốt Deal thất bại khi thiếu lý do (Stage: LOST)
- **Given** Khách hàng từ chối mua hàng vì chê giá đắt
- **When** Sales kéo Deal sang `LOST` nhưng để trống trường `LostReason`
- **Then** Hệ thống chặn cập nhật và trả về mã lỗi `ErrDealLostReasonRequired`
- **And** Yêu cầu Sales chọn một trong các lý do quy chuẩn: `PriceTooHigh`, `CompetitorSelected`, `NoBudget`, `Unresponsive`.

---

### US-DEAL-02: Tạo Báo Giá (Quote) & Khóa Giá Snapshot
- **As a** Nhân viên tư vấn bán hàng
- **I want** tạo Báo giá gửi cho khách hàng với các dòng sản phẩm và chiết khấu tùy chỉnh
- **So that** khách hàng có văn bản chính thức để thanh toán và giá không bị thay đổi nếu sau này công ty tăng giá sản phẩm.

#### Scenario 1: Snapshot giá sản phẩm khi tạo Báo giá
- **Given** Sản phẩm `MacBook Pro M3` đang có giá niêm yết trong bảng giá là 45,000,000 VND
- **When** Sales tạo Quote gồm 2 chiếc `MacBook Pro M3` kèm chiết khấu 5%
- **Then** Hệ thống tính toán: `Subtotal = 90,000,000`, `Discount = 4,500,000`, `Total = 85,500,000 VND`
- **And** Lưu bản ghi `QuoteItem` chứa snapshot cố định: `unit_price = 45000000`, `discount_rate = 5%`
- **And** Kể cả khi tuần sau admin tăng giá sản phẩm lên 48,000,000 VND, Quote đã tạo vẫn giữ nguyên đơn giá 45,000,000 VND.

#### Scenario 2: Phê duyệt báo giá khi vượt hạn mức chiết khấu
- **Given** Chính sách công ty quy định Sales chỉ được tự giảm tối đa 10%
- **When** Sales tạo Quote với chiết khấu 15% cho khách hàng VIP
- **Then** Quote tự động chuyển trạng thái `PendingApproval`
- **And** Gửi thông báo phê duyệt tới Trưởng phòng bán hàng trước khi cho phép xuất file PDF gửi khách.

---

### US-DEAL-03: Webhook Đồng Bộ Đơn Hàng Pancake POS / KiotViet
- **As a** Hệ thống bán hàng Omni
- **I want** tự động tiếp nhận đơn hàng từ Pancake POS, đối soát SĐT với Golden Record và tạo đơn hàng trong CRM
- **So that** nhân viên không phải nhập tay lại đơn và doanh số tự động nhảy vào Deal tương ứng.

#### Scenario 1: Tiếp nhận đơn hàng Pancake và liên kết khách hàng tự động
- **Given** Khách hàng `0988888888` đặt 1 đơn hàng thành công trên Pancake POS với mã `PANCAKE_ORDER_999`, tổng tiền 1,200,000 VND
- **When** Pancake đẩy webhook `order.created` tới `/api/v1/order-store/webhooks/pancake`
- **Then** Order Sync Worker tìm kiếm `Contact` theo số điện thoại `+84988888888` trong Customer BC
- **And** Nếu tìm thấy, tạo bản ghi `OrderStore` liên kết với `ContactID` đó
- **And** Tự động tìm Deal đang mở (`Status IN ('Negotiation', 'Proposal')`) của khách để cập nhật giá trị thực thu và chuyển Deal sang `WON`.
