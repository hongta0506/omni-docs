# User Auto-Provisioning & GoClaw Sync Specification

> **Bounded Context:** `internal/identity` (Submodule `provision`)  
> **Ánh xạ từ ZaloCRM:** `ZaloCRM/backend/src/modules/users/user-routes.ts` (T220 Phase 2, commit `0de2b9a6`)  
> **Nguyên tắc:** Clean DDD, Cross-system Identity Mirroring, One-Time Password (OTP).

---

## 1. Bản Chất Nghiệp Vụ & Luồng Xử Lý

Khi Admin/Owner của một tổ chức thêm nhân viên mới qua hệ thống trung tâm:
1. **Kiểm tra quyền hạn:** Chỉ `owner` hoặc `admin` của tổ chức mới được phép gọi API này.
2. **Gọi sang Máy chủ Quản trị (GoClaw):**
   - Gửi yêu cầu `createUser` với `{ email, tenantId, role, displayName }`.
   - GoClaw khởi tạo Membership và tạo mật khẩu tạm dùng 1 lần (`one_time_password`).
3. **Phản chiếu tức thì (Local Mirroring):**
   - Lưu ngay bản ghi `User` và liên kết `Organization` vào cơ sở dữ liệu PostgreSQL local.
   - Tránh việc UI RBAC/Danh sách nhân viên phải đợi tiến trình đồng bộ định kỳ (Cron).
4. **Phản hồi:** Trả về thông tin User kèm mật khẩu một lần để Admin bàn giao cho nhân viên (chỉ hiển thị 1 lần duy nhất).

---

## 2. API Contract

- **Endpoint:** `POST /api/v1/users/provision`
- **Quyền:** `owner`, `admin`
- **Request Body:**
```json
{
  "email": "sale01@company.com",
  "role": "member",
  "displayName": "Nguyễn Văn A"
}
```
- **Response (200 OK):**
```json
{
  "user": {
    "id": "usr_uuid",
    "email": "sale01@company.com",
    "role": "member",
    "displayName": "Nguyễn Văn A"
  },
  "oneTimePassword": "otp_secret_key_once"
}
```
