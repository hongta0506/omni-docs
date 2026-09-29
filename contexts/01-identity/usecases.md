# Identity & Settings — Danh Tả Use Cases & User Stories (BDD Specification)

> **Bounded Context:** `internal/identity`  
> **Phạm vi:** 72 Endpoints (Xác thực Auth, Quản trị Users, Cây phòng ban Departments, RBAC động, Cấu hình Tenant Settings, Audit Log).  
> **Định dạng:** Chuẩn BDD (`Given - When - Then`) & Jobs-to-Be-Done (JTBD).

---

## Danh Mục Use Cases (Actors & Boundaries)

| Use Case ID | Nhóm Nghiệp Vụ | Actor Chính | Mục Tiêu Nghiệp Vụ |
|---|---|---|---|
| **UC-IDEN-01** | Multi-Tenant Authentication | Người dùng (End-User) | Đăng nhập an toàn, cấp JWT Token gắn chặt TenantID và UserID claims |
| **UC-IDEN-02** | Refresh Token Rotation | Client Application | Cấp mới Access Token với cơ chế phát hiện Replay Attack (thu hồi toàn bộ session) |
| **UC-IDEN-03** | Hierarchical Department Tree | Quản trị viên (Admin) | Quản lý cây phòng ban đa cấp, kế thừa quyền và chống vòng lặp cha-con |
| **UC-IDEN-04** | Dynamic RBAC Evaluation | Hệ thống (Authorizer) | Đánh giá ma trận phân quyền phân giải đa tầng (Resource, Action, Scope) |
| **UC-IDEN-05** | Sensitive Data Masking | Nhân viên / Quản lý | Che số điện thoại / email khách hàng theo quyền xem (Privacy Leak Protection) |
| **UC-IDEN-06** | Multi-Device Session Watchdog | Security Admin | Quản lý phiên đa thiết bị, thu hồi phiên đăng nhập từ xa khi có rủi ro bảo mật |
| **UC-IDEN-07** | Tenant Feature Flags & Config | Super Admin / Tenant Owner | Bật/tắt tính năng theo gói cước dịch vụ và cấu hình riêng biệt từng Tenant |

---

## 1. UC-IDEN-01: Multi-Tenant Authentication & Strict Tenant Boundary

### User Story
**As an** Nhân viên sử dụng Omni CRM,  
**I want** đăng nhập vào đúng không gian doanh nghiệp (Tenant) của mình bằng tài khoản và mật khẩu an toàn,  
**So that** tôi chỉ truy cập được dữ liệu thuộc quyền quản lý của công ty tôi, tuyệt đối không bị lẫn lộn dữ liệu với công ty khác.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Đăng nhập thành công và trích xuất Claims chuẩn
- **Given:** Người dùng có tài khoản `user@company.com`, mật khẩu đúng, thuộc Tenant `tenant_01`, tài khoản ở trạng thái `active`.
- **When:** Gửi request `POST /api/v1/auth/login` với thông tin đăng nhập hợp lệ.
- **Then:** Hệ thống kiểm tra mật khẩu bằng Argon2id hoặc bcrypt an toàn.
- **And:** Cấp cặp Access Token (hạn 15 phút) và Refresh Token (hạn 7 ngày).
- **And:** Trong Payload JWT chứa `tenant_id = tenant_01`, `user_id = usr_abc`, `role_ids = [role_sales]`.
- **And:** Ghi nhật ký đăng nhập thành công vào bảng `audit_logs`.

#### Kịch bản 2: Tài khoản bị vô hiệu hóa (Suspended User)
- **Given:** Người dùng nhập đúng tài khoản và mật khẩu nhưng trạng thái tài khoản là `suspended` hoặc `inactive`.
- **When:** Gửi request `POST /api/v1/auth/login`.
- **Then:** Hệ thống từ chối đăng nhập với mã lỗi `403 Forbidden` (`ErrUserAccountSuspended`).
- **And:** Tuyệt đối không sinh mã JWT token.

---

## 2. UC-IDEN-02: Cơ Chế Xoay Vòng Refresh Token & Chống Token Replay Attack

### User Story
**As a** Quản trị viên An ninh hệ thống,  
**I want** khi client yêu cầu cấp mới Access Token, Refresh Token cũ phải bị hủy ngay lập tức và sinh ra mã mới,  
**So that** nếu một Refresh Token cũ bị kẻ gian đánh cắp và cố tình dùng lại, hệ thống sẽ phát hiện hành vi tấn công và lập tức hủy bỏ toàn bộ phiên làm việc của user đó.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Cấp mới token bình thường (Token Rotation)
- **Given:** Client gửi request `POST /api/v1/auth/refresh` với Refresh Token hợp lệ `RT_1` của phiên `session_01`.
- **When:** Hệ thống kiểm tra `RT_1` chưa từng được sử dụng và chưa hết hạn.
- **Then:** Đánh dấu `RT_1` là đã sử dụng (`consumed = true`).
- **And:** Cấp mới cặp `Access Token mới` và `Refresh Token RT_2`.
- **And:** Liên kết `RT_2` vào phiên làm việc `session_01`.

#### Kịch bản 2: Phát hiện dùng lại Refresh Token đã cũ (Replay Attack Detected)
- **Given:** Kẻ gian đánh cắp được `RT_1` và cố tình gọi `POST /api/v1/auth/refresh` sau khi `RT_1` đã được đổi sang `RT_2`.
- **When:** Hệ thống phát hiện `RT_1.consumed == true`.
- **Then:** Hệ thống xác định đây là hành vi Token Replay Attack.
- **And:** Lập tức thu hồi (Revoke) tất cả Refresh Token thuộc `session_01` (bao gồm cả `RT_2`).
- **And:** Buộc người dùng hợp pháp phải đăng nhập lại từ đầu.
- **And:** Ghi cảnh báo an ninh mức CRITICAL vào `security_audit_logs`.

---

## 3. UC-IDEN-03: Cây Phòng Ban Đa Cấp & Chống Vòng Lặp Cha - Con

### User Story
**As an** Quản trị viên Nhân sự (HR/Admin),  
**I want** thiết lập cơ cấu tổ chức hình cây (Tổng công ty -> Chi nhánh -> Khối -> Phòng ban -> Đội nhóm),  
**So that** việc phân quyền dữ liệu và quản lý nhân viên được kế thừa chính xác theo cấp bậc quản lý.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Tạo phòng ban con kế thừa cấp bậc
- **Given:** Phòng ban cha "Khối Kinh Doanh Miền Nam" (`dept_south`, Level 1).
- **When:** Admin tạo phòng ban mới "Đội Telesales 01" chọn cha là `dept_south`.
- **Then:** Hệ thống kiểm tra hợp lệ, gán `parent_id = dept_south`, `level = 2`, `path = /dept_south/dept_tele01`.
- **And:** Người quản lý của `dept_south` tự động có quyền giám sát dữ liệu của `dept_tele01`.

#### Kịch bản 2: Ngăn chặn tạo vòng lặp phòng ban (Circular Hierarchy Detection)
- **Given:** Đã có quan hệ: `Khối Kinh Doanh` -> `Phòng Telesales` -> `Nhóm 1`.
- **When:** Admin cố tình cập nhật phòng ban cha của `Khối Kinh Doanh` trỏ vào `Nhóm 1`.
- **Then:** Hệ thống phát hiện vòng lặp đệ quy trong cấu trúc cây.
- **And:** Từ chối yêu cầu với lỗi `ErrCircularHierarchyDetected` (HTTP 400).
- **And:** Giữ nguyên vẹn cấu trúc cây phòng ban hiện hữu.

---

## 4. UC-IDEN-04: Đánh Giá Quyền Động Phân Cấp (Dynamic RBAC Evaluation)

### User Story
**As an** Nhân viên Kinh doanh,  
**I want** chỉ xem được khách hàng do chính tôi phụ trách hoặc khách hàng thuộc phòng ban của tôi,  
**So that** bảo mật thông tin nội bộ giữa các nhóm kinh doanh khác nhau trong cùng một công ty.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Phân quyền theo phạm vi cá nhân (Scope: Personal)
- **Given:** Nhân viên A có quyền `contact:read` với `Scope = Personal`.
- **When:** Nhân viên A truy vấn danh sách khách hàng `GET /api/v1/contacts`.
- **Then:** Tầng Application tự động tiêm điều kiện lọc `WHERE assigned_user_id = User_A.ID`.
- **And:** Nhân viên A không thể nhìn thấy bất kỳ khách hàng nào của Nhân viên B.

#### Kịch bản 2: Phân quyền theo phạm vi phòng ban (Scope: Department Hierarchy)
- **Given:** Trưởng phòng có quyền `contact:read` với `Scope = Department`.
- **When:** Trưởng phòng gọi `GET /api/v1/contacts`.
- **Then:** Hệ thống trích xuất danh sách tất cả phòng ban con trực thuộc phòng ban của Trưởng phòng.
- **And:** Trả về toàn bộ khách hàng được gán cho bất kỳ nhân viên nào trong các phòng ban đó.

---

## 5. UC-IDEN-05: Mặt Nạ Che Dữ Liệu Nhạy Cảm (Privacy Phone Masking)

### User Story
**As an** Chủ Doanh nghiệp (Tenant Owner),  
**I want** nhân viên thử việc hoặc cấp thấp chỉ nhìn thấy số điện thoại của khách hàng dưới dạng mặt nạ (VD: `091****678`),  
**So that** ngăn chặn nhân viên tự ý sao chép danh sách khách hàng mang ra ngoài doanh nghiệp.

### Kịch Bản BDD (Acceptance Criteria)

#### Kịch bản 1: Nhân viên không có quyền xem số đầy đủ (Data Masked)
- **Given:** Khách hàng có số điện thoại `+84912345678`.
- **And:** Nhân viên B không có quyền `customer:view_full_phone`.
- **When:** Nhân viên B mở xem hồ sơ khách hàng.
- **Then:** Hệ thống trả về `phone: "+84912***678"`.
- **And:** Nhân viên B chỉ có thể bấm nút gọi thông qua tổng đài VoIP nội bộ mà không biết số thật.

#### Kịch bản 2: Quản lý có quyền xem số đầy đủ (Audit Logged)
- **Given:** Quản lý có quyền `customer:view_full_phone`.
- **When:** Quản lý bấm xem số điện thoại đầy đủ.
- **Then:** Hệ thống trả về `+84912345678`.
- **And:** Ghi nhận 1 bản ghi `audit_logs`: `Action = UNMASK_PHONE`, `UserID = Manager_ID`, `ContactID = Cust_ID`.
