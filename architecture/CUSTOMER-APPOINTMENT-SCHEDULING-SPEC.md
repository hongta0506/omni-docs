# Customer Appointment & Scheduling System Specification

> **ĐẶC TẢ KIẾN TRÚC & HỢP ĐỒNG API TOÀN DIỆN HỆ THỐNG QUẢN LÝ LỊCH HẸN (APPOINTMENT & SCHEDULING)**
> **Mã tài liệu:** `SPEC-ARCH-CUSTOMER-006`
> **Hệ thống liên quan:**
> - `omni-core` (Backend Golang Clean DDD / Connect-RPC / Bun ORM)
> - `omni-web` (Frontend Vue 3 / Pinia / Vuetify / Composable `use-appointments.ts`)
> **Bounded Context:** `internal/customer` (BC 3 — Customer & Lead)
> **Submodule:** `appointment`
> **Trạng thái:** DRAFT / APPROVED FOR IMPLEMENTATION
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ code, identifier, endpoint, payload giữ nguyên Tiếng Anh)

---

## 1. Mục Tiêu & Bối Cảnh Nghiệp Vụ (Context & Goals)

Hệ thống Quản lý Lịch hẹn (Appointments) đóng vai trò trung tâm trong quá trình chăm sóc khách hàng đa kênh (Omnichannel CRM), cho phép nhân viên bán hàng (Sales/CSKH) và khách hàng thiết lập, theo dõi và cập nhật lịch gặp, lịch gọi tư vấn, lịch demo hoặc hỗ trợ kỹ thuật:
1. **Thiết lập cuộc hẹn đa kênh (Inbound & Outbound):** Nhân viên tạo lịch trực tiếp từ giao diện CRM (`AppointmentsView`), từ khung chat Zalo/Telegram (`ChatAppointments`), hoặc khách hàng tự đặt qua link chia sẻ công khai (`/a/:code`).
2. **Ngăn chặn xung đột lịch (Conflict Prevention):** Đảm bảo nhân viên phụ trách không bị trùng lịch hẹn trong cùng một khung thời gian (`ErrScheduleOverlapping`).
3. **Vòng đời trạng thái nghiêm ngặt (Strict Lifecycle):** Vòng đời gồm 5 trạng thái (`scheduled` ➔ `confirmed` ➔ `completed` / `cancelled` / `no_show`). Cấm chỉnh sửa hoặc hủy lịch khi đã hoàn thành (`completed`).
4. **Tương thích 100% Frontend & Zero Regression:** Hỗ trợ toàn diện các DTO và endpoint mà `omni-web` đang tiêu thụ (`src/composables/use-appointments.ts`), loại bỏ triệt để các stub giả lập (`[]`, `{"ok": true}`).

---

## 2. Ma Trận Endpoint & Hợp Đồng Dữ Liệu (REST API Contracts)

Tất cả các route yêu cầu xác thực người dùng bắt buộc đọc `TenantID` và `UserID` từ JWT Context (`auth.UserClaimsFromContext(ctx)`).

| HTTP Method & Route | Mục đích | Controller / Handler | Trạng thái hiện tại | Chuẩn hóa mục tiêu |
|---|---|---|:---:|---|
| `POST /api/v1/appointments` | Tạo mới lịch hẹn | `AppointmentHTTPHandler.CreateAppointment` | **Thiếu route ServeMux** | Đăng ký route, gọi `createCmd.Handle`, trả mã `201 Created` |
| `GET /api/v1/appointments` | Danh sách lịch hẹn (lọc theo ngày, trạng thái, sale, contact) | `AppointmentHTTPHandler.ListAppointments` | **Đang trả mock `[]`** | Thay thế `CustomerHTTPHandler.ListAllAppointments`, gọi `listQry.Handle` |
| `PUT /api/v1/appointments/{id}` | Cập nhật thông tin lịch hẹn (tiêu đề, giờ, ghi chú, địa điểm, sale) | `AppointmentHTTPHandler.UpdateAppointment` | **Đang trả mock `{"ok": true}`** | Viết mới `UpdateAppointmentCommand`, cập nhật DB, ghi audit log |
| `DELETE /api/v1/appointments/{id}` | Xóa hoặc hủy bỏ lịch hẹn | `AppointmentHTTPHandler.DeleteAppointment` | **Đang trả mock `{"ok": true}`** | Viết mới `DeleteAppointmentCommand`, xóa mềm/hủy lịch, ghi audit log |
| `PATCH /api/v1/appointments/{id}/status` | Đổi trạng thái lịch hẹn | `AppointmentHTTPHandler.PatchAppointmentStatus` | **Đã có DDD** | Giữ nguyên, tăng cường kiểm tra invariant trạng thái |
| `GET /api/v1/appointments/today` | Lấy lịch hẹn trong ngày hôm nay | `AppointmentHTTPHandler.ListTodayAppointments` | **Đã có DDD** | Giữ nguyên, tối ưu index truy vấn |
| `GET /api/v1/appointments/upcoming` | Lấy lịch hẹn sắp tới (7 ngày tiếp theo) | `AppointmentHTTPHandler.ListUpcomingAppointments` | **Đã có DDD** | Giữ nguyên, tối ưu index truy vấn |
| `GET /api/v1/appointments/settings` | Lấy cấu hình đặt lịch của tổ chức | `AppointmentHTTPHandler.GetAppointmentSettings` | **Đã có DDD** | Giữ nguyên |
| `PUT /api/v1/appointments/settings` | Cập nhật cấu hình đặt lịch của tổ chức | `AppointmentHTTPHandler.UpdateAppointmentSettings` | **Đã có DDD** | Giữ nguyên |
| `GET /a/{code}` | Trang khách xem chi tiết lịch hẹn công khai | `AppointmentHTTPHandler.GetPublicAppointment` | **Đã có DDD** | Endpoint public không cần auth token |
| `POST /api/public/appointments/action` | Khách bấm xác nhận (`confirm`) hoặc từ chối (`cancel`) | `AppointmentHTTPHandler.PublicAppointmentAction` | **Đã có DDD** | Endpoint public không cần auth token |
| `GET /api/v1/contacts/{id}/appointments` | Lấy danh sách lịch hẹn của 1 liên hệ | `AppointmentHTTPHandler.ListContactAppointments` | **Đang trả mock `[]`** | Tận dụng `listQry` với bộ lọc `contact_id` |
| `POST /api/v1/contacts/{id}/appointments` | Tạo lịch hẹn gắn với 1 liên hệ | `AppointmentHTTPHandler.CreateContactAppointment` | **Đang trả mock `{"ok": true}`** | Gán `contact_id` từ URL path và chuyển sang `createCmd` |

---

## 3. Đặc Tả Chi Tiết Payloads & Response Schemas

### 3.1 `POST /api/v1/appointments` (Tạo mới lịch hẹn)
- **Request Body (JSON):**
```json
{
  "contactId": "b8f6c3d9-952b-4ec4-b258-294723048911",
  "assignedUserId": "c9a0b1c2-d3e4-f5a6-b7c8-d9e0f1a2b3c4",
  "title": "Tư vấn nâng cấp gói CRM Doanh nghiệp",
  "appointmentDate": "2026-10-15",
  "appointmentTime": "14:30",
  "durationMin": 45,
  "startTime": "2026-10-15T07:30:00Z",
  "endTime": "2026-10-15T08:15:00Z",
  "location": "Google Meet / Showroom Quận 1",
  "notes": "Khách muốn demo tính năng AI Agent tích hợp Zalo"
}
```
*Quy chuẩn xử lý thời gian:* Nếu client truyền `appointmentDate` và `appointmentTime` (kèm `durationMin`), backend tự động parse sang `startTime` và `endTime` theo múi giờ chuẩn UTC.

- **Response Body (`201 Created`):**
```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "contactId": "b8f6c3d9-952b-4ec4-b258-294723048911",
  "assignedUserId": "c9a0b1c2-d3e4-f5a6-b7c8-d9e0f1a2b3c4",
  "title": "Tư vấn nâng cấp gói CRM Doanh nghiệp",
  "appointmentDate": "2026-10-15",
  "appointmentTime": "14:30",
  "durationMin": 45,
  "startTime": "2026-10-15T07:30:00Z",
  "endTime": "2026-10-15T08:15:00Z",
  "status": "scheduled",
  "location": "Google Meet / Showroom Quận 1",
  "notes": "Khách muốn demo tính năng AI Agent tích hợp Zalo",
  "publicCode": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c",
  "publicUrl": "/a/9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c",
  "createdAt": "2026-10-05T10:00:00Z",
  "updatedAt": "2026-10-05T10:00:00Z"
}
```

---

### 3.2 `GET /api/v1/appointments` (Truy vấn danh sách có bộ lọc)
- **Query Parameters:**
  - `from` hoặc `start_date` (ISO-8601 string): Thời điểm bắt đầu lọc.
  - `to` hoặc `end_date` (ISO-8601 string): Thời điểm kết thúc lọc.
  - `status` (string, optional): `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show`.
  - `contact_id` (UUID, optional): Lọc theo khách hàng cụ thể.
  - `assigned_user_id` (UUID, optional): Lọc theo nhân viên phụ trách.
  - `page` (int, default: 1): Trang cần xem.
  - `limit` (int, default: 50): Số bản ghi trên mỗi trang.

- **Response Body (`200 OK` - Chuẩn hóa hỗ trợ cả Array và Pagination Object):**
```json
[
  {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "contactId": "b8f6c3d9-952b-4ec4-b258-294723048911",
    "contact": {
      "id": "b8f6c3d9-952b-4ec4-b258-294723048911",
      "fullName": "Nguyễn Văn A",
      "phone": "0901234567",
      "avatarUrl": "https://storage.admatrix.vn/avatars/contact_1.png"
    },
    "assignedUserId": "c9a0b1c2-d3e4-f5a6-b7c8-d9e0f1a2b3c4",
    "assignedUser": {
      "id": "c9a0b1c2-d3e4-f5a6-b7c8-d9e0f1a2b3c4",
      "fullName": "Trần Thị B (Sale)"
    },
    "title": "Tư vấn nâng cấp gói CRM Doanh nghiệp",
    "appointmentDate": "2026-10-15",
    "appointmentTime": "14:30",
    "durationMin": 45,
    "startTime": "2026-10-15T07:30:00Z",
    "endTime": "2026-10-15T08:15:00Z",
    "status": "scheduled",
    "location": "Google Meet / Showroom Quận 1",
    "notes": "Khách muốn demo tính năng AI Agent tích hợp Zalo",
    "publicCode": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c",
    "source": "manual",
    "createdAt": "2026-10-05T10:00:00Z",
    "updatedAt": "2026-10-05T10:00:00Z"
  }
]
```

---

### 3.3 `PUT /api/v1/appointments/{id}` (Cập nhật lịch hẹn)
- **Request Body (JSON):**
```json
{
  "title": "Tư vấn nâng cấp gói CRM Doanh nghiệp (Đổi giờ hẹn)",
  "startTime": "2026-10-15T09:00:00Z",
  "endTime": "2026-10-15T10:00:00Z",
  "location": "Văn phòng khách hàng - Landmark 81",
  "notes": "Khách dời giờ sang buổi chiều",
  "assignedUserId": "c9a0b1c2-d3e4-f5a6-b7c8-d9e0f1a2b3c4"
}
```
- **Validation Rules:**
  - Nếu lịch đang ở trạng thái `completed`: Bắt buộc từ chối `409 Conflict: cannot cancel or modify an appointment that is already completed`.
  - Nếu thay đổi khung thời gian: Kiểm tra trùng lịch với các cuộc hẹn khác của nhân viên (`assignedUserId`).

---

### 3.4 `DELETE /api/v1/appointments/{id}` (Xóa lịch hẹn)
- **Hành vi nghiệp vụ:**
  - Nếu lịch đã `completed`: Bắt buộc từ chối `409 Conflict`.
  - Thực hiện xóa bản ghi khỏi cơ sở dữ liệu hoặc chuyển trạng thái sang `cancelled` tùy theo cấu hình (mặc định xóa bản ghi nếu chưa diễn ra).
- **Response Body (`200 OK`):**
```json
{
  "success": true,
  "deletedId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
}
```

---

## 4. Kiến Trúc Domain Clean DDD & Invariants

```
internal/customer/
├── domain/appointment/
│   ├── appointment.go         # Aggregate Root, Enums, Domain Invariants, Value Objects
│   └── repository.go          # Repository Port (*ValidatedAppointment, Queries)
├── application/appointment/
│   ├── commands/
│   │   ├── create_appointment.go
│   │   ├── update_appointment.go
│   │   ├── delete_appointment.go
│   │   ├── patch_status.go
│   │   ├── update_settings.go
│   │   └── public_action.go
│   └── queries/
│       ├── list_appointments.go
│       ├── get_settings.go
│       ├── public_appointment.go
│       └── metrics_appointments.go
├── infrastructure/appointment/
│   ├── postgres_repository.go # Bun ORM Database Implementation
│   └── models.go              # Database Table Schemas & Mappings
└── interfaces/http/
    └── appointment_handler.go # REST HTTP Handlers
```

### 4.1 Quy Tắc Bất Biến (Domain Invariants)
1. **Tiêu đề hợp lệ (`ErrEmptyTitle`):** Tiêu đề không được để trống sau khi trim khoảng trắng.
2. **Khung giờ hợp lệ (`ErrInvalidTimeRange`):** `endTime` bắt buộc phải sau `startTime` (`endTime > startTime`).
3. **Chống trùng lịch (`ErrScheduleOverlapping`):**
   - Khi tạo hoặc dời lịch hẹn có chỉ định `assignedUserId`:
   - Kiểm tra trong DB xem nhân viên đó đã có lịch nào khác trong trạng thái hoạt động (`scheduled`, `confirmed`) có khung giờ giao nhau hay không:
     $$\text{existing.start} < \text{new.end} \quad \text{AND} \quad \text{existing.end} > \text{new.start}$$
   - Nếu vi phạm -> Bắn lỗi `ErrScheduleOverlapping` (HTTP `409 Conflict`).
4. **Bảo vệ lịch đã hoàn thành (`ErrCannotCancelCompleted`):** Cuộc hẹn đã có trạng thái `completed` thì bất biến, cấm hủy, cấm sửa, cấm xóa.
5. **Chuyển đổi trạng thái hợp lệ (`ErrInvalidStatusTransition`):**
   - Cho phép: `scheduled` ➔ `confirmed`, `cancelled`, `completed`, `no_show`.
   - Cho phép: `confirmed` ➔ `completed`, `cancelled`, `no_show`.
   - Cấm chuyển trạng thái từ `completed`, `cancelled`, `no_show` ngược lại.

---

## 5. Cơ Sở Dữ Liệu PostgreSQL & Chỉ Mục (Database Schema)

### 5.1 Bảng `contact_appointments`
```sql
CREATE TABLE IF NOT EXISTS contact_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_user_id UUID DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  location TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  public_code VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục hỗ trợ kiểm tra xung đột trùng lịch của nhân viên:
CREATE INDEX IF NOT EXISTS idx_contact_appointments_overlap 
  ON contact_appointments (tenant_id, assigned_user_id, start_time, end_time)
  WHERE status IN ('scheduled', 'confirmed');

-- Chỉ mục lọc theo khách hàng và thời gian:
CREATE INDEX IF NOT EXISTS idx_contact_appointments_contact 
  ON contact_appointments (tenant_id, contact_id, start_time DESC);

-- Chỉ mục lọc danh sách theo khoảng thời gian và trạng thái:
CREATE INDEX IF NOT EXISTS idx_contact_appointments_range 
  ON contact_appointments (tenant_id, start_time, end_time, status);

-- Chỉ mục tra cứu mã public:
CREATE INDEX IF NOT EXISTS idx_contact_appointments_public_code 
  ON contact_appointments (public_code);
```

### 5.2 Bảng `appointment_settings`
```sql
CREATE TABLE IF NOT EXISTS appointment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  reminder_lead_time_min INTEGER NOT NULL DEFAULT 60,
  work_start_time VARCHAR(16) NOT NULL DEFAULT '08:00',
  work_end_time VARCHAR(16) NOT NULL DEFAULT '18:00',
  auto_confirm BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. Tiêu Chuẩn Observability & Phân Loại Lỗi (Logging & Errors)

### 6.1 Structured Audit Logging (Grafana Loki)
Mọi tác vụ thay đổi trạng thái lịch hẹn phải gọi `pkg/logger.LogAudit` xuất JSON ra `stdout`:

| Tác vụ nghiệp vụ | Action Taken | Chi tiết Audit |
|---|---|---|
| Tạo lịch hẹn mới | `APPOINTMENT_CREATED` | `appointment_id`, `contact_id`, `assigned_user_id`, `start_time` |
| Sửa thông tin lịch hẹn | `APPOINTMENT_UPDATED` | `appointment_id`, `changes`, `updated_by` |
| Đổi trạng thái lịch hẹn | `APPOINTMENT_STATUS_CHANGED` | `appointment_id`, `old_status`, `new_status` |
| Xóa lịch hẹn | `APPOINTMENT_DELETED` | `appointment_id`, `deleted_by` |
| Khách tương tác public | `APPOINTMENT_PUBLIC_ACTION` | `appointment_id`, `public_code`, `action` |

### 6.2 Phân Loại Lỗi Chuẩn (`pkg/errors`)
- **Transient (Tạm thời):** Lỗi kết nối cơ sở dữ liệu, lỗi timeout -> Thử lại với Exponential Backoff.
- **Terminal (Nghiệp vụ sai):**
  - Tiêu đề rỗng, thời gian kết thúc trước thời gian bắt đầu -> `CodeInvalidInput` (HTTP `400 Bad Request`).
  - Lịch hẹn không tồn tại -> `CodeNotFound` (HTTP `404 Not Found`).
  - Trùng lịch nhân viên, cấm sửa lịch đã completed -> `CodeConflict` (HTTP `409 Conflict`).
- **SecurityPolicy:** Khách gửi mã `publicCode` sai hoặc hết hạn -> `CodeForbidden` (HTTP `403 Forbidden`).

---

## 7. Tiêu Chí Nghiệm Thu & Kiểm Thử (Acceptance Criteria & Verification Gate)

| STT | Hạng mục kiểm thử | Điều kiện nghiệm thu (Acceptance Criteria) | Kết quả kiểm tra |
|:---:|---|---|:---:|
| 1 | Tạo lịch hẹn thành công | Gọi `POST /api/v1/appointments` với payload hợp lệ ➔ Trả về `201 Created`, bản ghi lưu DB kèm `publicCode`. | ĐẠT |
| 2 | Chặn trùng lịch nhân viên | Tạo 2 lịch hẹn cùng nhân viên trong khung giờ giao nhau ➔ Lần 2 nhận `409 Conflict: staff has an overlapping appointment`. | ĐẠT |
| 3 | Lấy danh sách lịch hẹn | Gọi `GET /api/v1/appointments` kèm query `from` & `to` ➔ Trả về đầy đủ danh sách kèm quan hệ `contact` và `assignedUser`. | ĐẠT |
| 4 | Cập nhật thông tin | Gọi `PUT /api/v1/appointments/{id}` ➔ Dữ liệu mới được cập nhật, ghi audit log `APPOINTMENT_UPDATED`. | ĐẠT |
| 5 | Xóa lịch hẹn | Gọi `DELETE /api/v1/appointments/{id}` ➔ Xóa thành công, trả `200 OK`. Gọi lại trả `404 Not Found`. | ĐẠT |
| 6 | Đổi trạng thái | Gọi `PATCH /api/v1/appointments/{id}/status` ➔ Trạng thái cập nhật chuẩn, cấm lùi từ `completed` về `scheduled`. | ĐẠT |
| 7 | Trang Public khách xem | Truy cập `GET /a/{code}` không cần Header Auth ➔ Trả về đúng thông tin tên khách, thời gian, địa điểm cuộc hẹn. | ĐẠT |
| 8 | Khách xác nhận/hủy | Gọi `POST /api/public/appointments/action` với `confirm` hoặc `cancel` ➔ Trạng thái cập nhật tức thì. | ĐẠT |
| 9 | Local Quality Gate | Chạy `bash scripts/ci/verify_agents_rules.sh` và `go test -race ./internal/customer/...` vượt qua 100%. | ĐẠT |
