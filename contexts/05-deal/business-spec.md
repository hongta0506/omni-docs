# Đặc Tả Nghiệp Vụ Chi Tiết: Deal & E-commerce Bounded Context (85 Endpoints)

> **Bounded Context:** `internal/deal`  
> **Phạm vi quản lý:** Quản trị cơ hội bán hàng & Phễu doanh thu (Deals & Pipeline Stages), Soạn thảo báo giá & Phê duyệt chiết khấu (Quotes & Approval Matrix), Bảng giá & Giá sàn bảo vệ biên lợi nhuận (Pricebook & Products), và Đồng bộ đơn hàng đa kênh (Order Store, Pancake, KiotViet).

---

## 1. Domain Model, Aggregates & Invariants (Quy Tắc Bất Biến Nghiệp Vụ)

### 1.1 Aggregate Root: `Deal` & `Pipeline`
- **Invariants:**
  1. **Toàn vẹn giá trị cơ hội (`deal_value`):** Giá trị deal không được âm (`>= 0`). Khi chuyển stage sang `won`, giá trị deal được cộng dồn vào doanh số thực tế của nhân viên và tính toán lại LTV của khách hàng trong Bounded Context `customer`.
  2. **Trạng thái kết thúc không thể đảo ngược tùy tiện:** Một Deal đã chuyển trạng thái `won` hoặc `lost` không thể tiếp tục kéo thả qua lại giữa các stage thông thường. Để mở lại một Deal đã đóng, bắt buộc phải có thao tác `reopen` kèm quyền `deals:reopen` và lý do giải trình.
  3. **Lý do thất bại bắt buộc (Lost Reason Invariant):** Khi đánh dấu một Deal là `lost`, bắt buộc phải cung cấp mã lý do (`lost_reason_id`: giá quá cao, đối thủ cạnh tranh, hết nhu cầu, không liên lạc được) phục vụ phân tích dữ liệu kinh doanh.

### 1.2 Aggregate Root: `Quote` & Ma Trận Phê Duyệt Chiết Khấu
- **Invariants:**
  1. **Chặn bán dưới giá sàn (Floor Price Guard):** Đơn giá từng sản phẩm trong báo giá không được thấp hơn giá sàn (`floor_price`) quy định trong `Pricebook`.
  2. **Ngưỡng duyệt chiết khấu đa cấp (Discount Approval Invariant):**
     - Chiết khấu `<= 5%`: Nhân viên tư vấn (Sale) được tự quyền quyết định.
     - Chiết khấu `> 5%` và `<= 15%`: Bắt buộc Trưởng phòng kinh doanh (`Sales Manager`) duyệt qua API `/api/v1/quotes/{id}/approve`.
     - Chiết khấu `> 15%`: Bắt buộc Giám đốc điều hành (`Director` / `SuperAdmin`) phê duyệt.
     - Trong khi chờ phê duyệt, Quote ở trạng thái `pending_approval` và không thể xuất PDF hay gửi sang khách hàng.
  3. **Quote Versioning (Bất Biến Lịch Sử Báo Giá):** Khi khách hàng yêu cầu thay đổi điều khoản trên báo giá đã gửi, hệ thống tự động tăng `version` (V1 -> V2). Mọi phiên bản cũ đều được lưu vết để đối chiếu khi có tranh chấp hợp đồng.

### 1.3 Aggregate Root: `Order` & Đồng Bộ Tồn Kho Đa Sàn
- **Invariants:**
  1. **Idempotency Webhook Đơn Hàng:** Nhận webhook từ Pancake hoặc KiotViet phải kiểm tra `external_order_id` và `idempotency_key`. Nếu trùng lặp trong vòng 7 ngày, chỉ cập nhật trạng thái đơn mà không tạo đơn hàng mới hay trừ tồn kho lần 2.
  2. **Khóa liên kết khách hàng:** Đơn hàng phát sinh từ sàn thương mại điện tử hoặc chat phải tự động liên kết với `contact_id` hợp nhất trong `internal/customer`. Nếu chưa có khách hàng, tự động tạo Contact mới với thông tin số điện thoại từ đơn hàng.

---

## 2. Chi Tiết Nghiệp Vụ & BDD Cho Từng Phân Hệ Endpoints

### 2.1 Phân Hệ Deals & Phễu Bán Hàng (Deals & Pipeline - 30 Endpoints)

#### EP 01-08: CRUD Deals & Quản Lý Phễu Bán Hàng
- **GET `/api/v1/deals`**:
  - **Nghiệp vụ:** Truy vấn danh sách Deal dạng bảng hoặc dạng Kanban board. Hỗ trợ lọc theo: `pipeline_id`, `stage_id`, `assigned_user_id`, khoảng giá trị (`min_value`, `max_value`), `closing_date_range`.
- **POST `/api/v1/deals`**:
  - **Nghiệp vụ:** Khởi tạo Deal mới: Tên deal, khách hàng liên kết (`contact_id`), giá trị dự kiến, ngày dự kiến chốt đơn.
- **GET `/api/v1/deals/{id}`**: Lấy chi tiết Deal: lịch sử chuyển stage, danh sách báo giá đính kèm, ghi chú cuộc gọi, nhiệm vụ cần làm.
- **PATCH `/api/v1/deals/{id}`**: Cập nhật thông tin cơ hội: đổi tên, chỉnh giá trị, dời ngày chốt đơn.
- **DELETE `/api/v1/deals/{id}`**: Xóa mềm cơ hội bán hàng.

#### EP 09-16: Chuyển Stage & Đóng Deal (Won/Lost/Reopen)
- **POST `/api/v1/deals/{id}/stage`**: Kéo thả Deal sang stage mới trên Kanban board.
- **POST `/api/v1/deals/{id}/win`**:
  - **Nghiệp vụ:** Đánh dấu chốt deal thành công (`won`). Tự động phát sinh đơn hàng dự thảo hoặc đồng bộ doanh thu vào KPI của nhân viên.
  - **BDD Scenario:**
    - *Given:* Deal có giá trị 20.000.000 VNĐ đang ở stage `negotiation`.
    - *When:* Gửi POST tới `/api/v1/deals/{id}/win` với body `{"actualValue": 20000000}`.
    - *Then:* Deal chuyển sang `status=won`, bắn domain event `DEAL_WON`, cập nhật LTV khách hàng tương ứng.
- **POST `/api/v1/deals/{id}/lost`**: Đánh dấu thất bại kèm mã lý do (`lost_reason_id`) và ghi chú rút kinh nghiệm.
- **POST `/api/v1/deals/{id}/reopen`**: Mở lại deal đã đóng sau khi khách hàng liên hệ lại.

#### EP 17-24: Cấu Hình Pipeline & Stage (Pipelines CRUD)
- **GET `/api/v1/deal-stages`**: Danh sách các stage trong pipeline bán hàng kèm tỷ lệ chốt đơn dự kiến (win probability %).
- **POST `/api/v1/deal-stages`**: Tạo stage mới trong quy trình bán hàng.
- **PUT `/api/v1/deal-stages/reorder`**: Kéo thả sắp xếp lại thứ tự các bước trong quy trình bán hàng.
- **PUT & DELETE `/api/v1/deal-stages/{id}`**: Sửa tên, màu sắc, xác suất thành công hoặc xóa stage (yêu cầu di dời các deal hiện có trong stage đó trước khi xóa).

#### EP 25-30: Thống Kê & Dự Báo Doanh Thu (Deal Analytics)
- **GET `/api/v1/deals/analytics/pipeline-velocity`**: Tốc độ luân chuyển deal: thời gian trung bình một deal nằm ở từng stage trước khi sang bước tiếp theo.
- **GET `/api/v1/deals/analytics/forecast`**: Báo cáo dự báo doanh thu tháng dựa trên giá trị deal nhân tỷ lệ phần trăm xác suất chốt đơn.
- **POST `/api/v1/deals/batch-assign`**: Chuyển giao hàng loạt deal cho nhân viên mới nhận bàn giao công việc.

---

## 2.2 Phân Hệ Báo Giá & Bảng Giá (Quotes & Pricebook - 25 Endpoints)

#### EP 31-38: Soạn Thảo & Quản Lý Báo Giá (Quotes CRUD)
- **GET `/api/v1/quotes`**: Danh sách báo giá đã lập, lọc theo deal, khách hàng hoặc trạng thái (`draft`, `pending_approval`, `approved`, `sent`, `accepted`, `rejected`).
- **POST `/api/v1/quotes`**: Soạn dự thảo báo giá: chọn sản phẩm, số lượng, đơn giá, chiết khấu dòng, chiết khấu tổng đơn, thuế VAT. Tự động tính toán tổng thanh toán.
- **GET `/api/v1/quotes/{id}`**: Xem chi tiết báo giá và cây bóc tách chi phí.
- **PUT `/api/v1/quotes/{id}`**: Chỉnh sửa dự thảo báo giá (chỉ cho phép khi quote ở trạng thái `draft` hoặc bị `rejected`).
- **DELETE `/api/v1/quotes/{id}`**: Hủy bỏ báo giá nháp.

#### EP 39-46: Quy Trình Phê Duyệt & Xuất PDF
- **POST `/api/v1/quotes/{id}/submit-approval`**: Gửi yêu cầu duyệt chiết khấu vượt khung lên cấp quản lý.
- **POST `/api/v1/quotes/{id}/approve`**: Quản lý duyệt thông qua báo giá có chiết khấu cao.
- **POST `/api/v1/quotes/{id}/reject`**: Quản lý từ chối kèm lý do yêu cầu sửa đổi tỷ lệ chiết khấu.
- **POST `/api/v1/quotes/{id}/send`**: Gửi link báo giá trực tuyến hoặc gửi file qua Zalo/Email cho khách hàng.
- **GET `/api/v1/quotes/{id}/pdf`**: Render và xuất file PDF báo giá theo mẫu nhận diện thương hiệu công ty.

#### EP 47-55: Bảng Giá & Kiểm Soát Giá Sàn (Pricebook)
- **GET `/api/v1/pricebook`**: Danh sách bảng giá đang áp dụng (Bảng giá bán lẻ, Bảng giá đại lý, Bảng giá dự án).
- **POST `/api/v1/pricebook`**: Tạo bảng giá mới kèm thời hạn áp dụng (`valid_from`, `valid_to`).
- **PUT `/api/v1/pricebook/{id}`**: Cập nhật giá niêm yết và giá sàn bảo vệ biên lợi nhuận cho từng SKU sản phẩm.
- **DELETE `/api/v1/pricebook/{id}`**: Vô hiệu hóa bảng giá.

---

## 2.3 Phân Hệ Sản Phẩm & Đơn Hàng Đa Sàn (Products & Orders - 30 Endpoints)

#### EP 56-65: Quản Lý Danh Mục Sản Phẩm (Products CRUD & Tồn Kho)
- **GET `/api/v1/products`**: Danh sách sản phẩm: mã SKU, tên, giá niêm yết, tồn kho khả dụng, phân loại danh mục.
- **POST `/api/v1/products`**: Thêm mới sản phẩm vào hệ thống.
- **GET `/api/v1/products/{id}`**: Chi tiết sản phẩm, lịch sử biến động giá và số lượng tồn theo từng kho.
- **PATCH `/api/v1/products/{id}`**: Cập nhật thông số kỹ thuật, mô tả, giá bán và thuộc tính sản phẩm.
- **DELETE `/api/v1/products/{id}`**: Ẩn/Ngừng kinh doanh sản phẩm.
- **POST `/api/v1/products/sync`**: Kích hoạt đồng bộ danh mục sản phẩm từ KiotViet hoặc Pancake POS.

#### EP 66-75: Quản Lý Đơn Hàng Cửa Hàng & Đa Kênh (Order Store)
- **GET `/api/v1/order-store/orders`**: Danh sách đơn hàng đa kênh: lọc theo kênh bán, trạng thái giao vận (`pending`, `shipping`, `delivered`, `returned`, `cancelled`), mã vận đơn.
- **POST `/api/v1/order-store/orders`**: Tạo đơn hàng thủ công từ cuộc hội thoại chat.
- **GET `/api/v1/order-store/orders/{id}`**: Chi tiết đơn hàng: danh sách mặt hàng, phí giao hàng, tiền thu hộ COD, địa chỉ nhận hàng.
- **PUT `/api/v1/order-store/orders/{id}/status`**: Cập nhật tiến độ xử lý đơn hàng.
- **POST `/api/v1/order-store/orders/{id}/cancel`**: Hủy đơn hàng và hoàn lại tồn kho khả dụng.

#### EP 76-85: Webhooks & Cổng Tích Hợp Đơn Đa Sàn (Pancake & KiotViet)
- **POST `/api/v1/pancake/webhook`**: Nhận webhook tức thời khi có đơn hàng mới hoặc đổi trạng thái giao hàng từ Pancake POS.
- **POST `/api/v1/kiotviet/webhook`**: Nhận webhook tồn kho và hóa đơn xuất kho từ phần mềm KiotViet.
- **GET `/api/v1/orders/shipping/tracking/{carrier}/{trackingCode}`**: Tra cứu hành trình vận chuyển thực tế từ các đơn vị vận chuyển (GHTK, GHN, ViettelPost).
- **POST `/api/v1/orders/batch-export`**: Xuất danh sách đơn hàng phục vụ đóng gói và kiểm toán doanh số.

---

## 3. Ma Trận Observability, Logging & Exception Chuẩn

| Nhóm Ngoại Lệ | Danh Sách Lỗi Kỹ Thuật / Domain | Phân Loại `pkg/errors` | Hành Động Hệ Thống | Event Log `pkg/logger` |
|---|---|---|---|---|
| **Giá sàn vi phạm** | Chiết khấu vượt giá sàn của Pricebook | `CodeInvalidInput` (Terminal) | Chặn lưu báo giá, cảnh báo biên lợi nhuận | `DEAL_FLOOR_PRICE_BREACH` |
| **Thẩm quyền duyệt** | Sale tự duyệt quote vượt thẩm quyền chiết khấu | `CodeForbidden` (SecurityPolicy) | Chặn gửi quote, bắt buộc trình cấp trên | `QUOTE_APPROVAL_REQUIRED` |
| **Đơn trùng lặp** | Webhook Pancake gửi trùng `order_id` | `CodeConflict` (Idempotent) | Bỏ qua tạo mới, chỉ cập nhật trạng thái | `ORDER_WEBHOOK_DUPLICATE` |
| **Tồn kho không đủ** | Đặt hàng vượt quá số lượng tồn kho khả dụng | `CodeInvalidInput` (BusinessRule) | Báo lỗi thiếu hàng, đề xuất nhập thêm kho | `PRODUCT_OUT_OF_STOCK` |
| **Trạng thái Deal** | Kéo thả Deal đã đóng Won/Lost | `CodeInvalidInput` (Terminal) | Chặn kéo thả, yêu cầu mở lại Reopen | `DEAL_TRANSITION_INVALID` |
| **Không tìm thấy** | Không tìm thấy Deal, Quote, Product, Order | `CodeNotFound` (Terminal) | Trả về HTTP 404 Not Found | `DEAL_NOT_FOUND` |
