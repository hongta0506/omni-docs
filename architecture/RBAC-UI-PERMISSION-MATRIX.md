# Tài Liệu Đặc Tả Phân Quyền (RBAC) & Quyền Truy Cập Giao Diện (UI Access Matrix)

> Lưu trữ tham chiếu hệ thống phân quyền của Omni Web & Omni Core.
> Phiên bản: 1.0.0 (Bảo lưu từ ZaloCRM Spec 045 / RBAC-M2).

---

## 1. Cơ Chế Kiểm Soát Quyền Trên Frontend (`omni-web`)

### 1.1 Nguyên Tắc Phân Quyền Cốt Lõi
- **Bypass toàn quyền**: User có `role === 'admin'` hoặc `role === 'owner'` tự động bypass toàn bộ kiểm tra quyền (`canAccess()` luôn trả về `true`).
- **Default Deny**: Đối với nhân viên thông thường (`role === 'agent'`), nếu không được cấu hình quyền trong `grants`, mặc định bị từ chối truy cập (`false`).
- **Manager Scope**: Trưởng phòng / Phó phòng (`deptRole === 'leader' | 'deputy'`) hoặc user có cờ `canViewAll: true` được quyền xem dữ liệu cấp phòng ban hoặc toàn tổ chức.

---

## 2. Ma Trận Quyền Hệ Thống (Resource × Action Matrix)

Hệ thống quản lý **18 Resources** chia theo 4 khối màn hình chính và **5 Actions**.

### 2.1 5 Cột Hành Động (Actions)
1. `access`: Quyền xem / truy cập vào màn hình / danh sách.
2. `create`: Quyền tạo mới bản ghi.
3. `edit`: Quyền chỉnh sửa bản ghi thuộc phạm vi của mình.
4. `delete`: Quyền xóa bản ghi.
5. `view_all`: Cờ đặc quyền cho phép xem dữ liệu toàn công ty (bỏ qua giới hạn phụ trách hoặc giới hạn phòng ban).

### 2.2 18 Tài Nguyên (Resources)

| STT | Resource | Tên Tiếng Việt | Đường dẫn Frontend tương ứng | Actions hỗ trợ |
|:---:|---|---|---|---|
| **I** | **Hệ thống & Tổ chức** | | | |
| 1 | `department` | Quản lý phòng ban | `/settings/rbac/departments` | `access`, `create`, `edit`, `delete` |
| 2 | `user` | Quản lý người dùng | `/settings/rbac/users` | `access`, `create`, `edit`, `delete` |
| 3 | `permission_group` | Phân quyền vai trò | `/settings/rbac/permission-groups` | `access`, `create`, `edit`, `delete` |
| 4 | `settings` | Cài đặt hệ thống | `/settings/*` | `access`, `create`, `edit` |
| 5 | `audit_log` | Nhật ký hành động | `/settings/org/audit` | `access`, `view_all` |
| **II** | **Khách hàng & Bán hàng** | | | |
| 6 | `contact` | Khách hàng | `/contacts` | `access`, `create`, `edit`, `delete`, `view_all` |
| 7 | `friend` | Bạn bè Zalo | `/friends` | `access`, `create`, `edit`, `delete`, `view_all` |
| 8 | `conversation` | Hội thoại & Chat | `/chat` | `access`, `edit`, `delete`, `view_all` |
| 9 | `customer_list` | Tệp khách hàng | `/marketing/lists` | `access`, `create`, `edit`, `delete`, `view_all` |
| 10 | `deal` | Cơ hội bán hàng | `/deals` | `access`, `create`, `edit`, `delete`, `view_all` |
| 11 | `quote` | Báo giá | `/bao-gia` | `access`, `create`, `edit`, `delete`, `view_all` |
| **III** | **Marketing & Automation** | | | |
| 12 | `trigger` | Mục tiêu / Trigger | `/marketing/triggers` | `access`, `create`, `edit`, `delete`, `view_all` |
| 13 | `sequence` | Chuỗi chăm sóc | `/marketing/sequences` | `access`, `create`, `edit`, `delete`, `view_all` |
| 14 | `broadcast` | Chiến dịch gửi tin | `/marketing/broadcasts` | `access`, `create`, `edit`, `delete`, `view_all` |
| 15 | `block` | Khối tin nhắn mẫu | `/marketing/blocks` | `access`, `create`, `edit`, `delete`, `view_all` |
| 16 | `care_session` | Phiên chăm sóc | `/marketing/care-sessions` | `access`, `view_all` |
| **IV** | **Kênh & Tài nguyên** | | | |
| 17 | `zalo_account` | Tài khoản Nick Zalo | `/settings/channels/zalo` | `access`, `create`, `edit`, `delete`, `view_all` |
| 18 | `media` | Kho thư viện Media | `/media` | `access`, `create`, `edit`, `delete`, `view_all` |
| 19 | `webhook` | API / Webhook | `/settings/dev/api` | `access`, `create`, `edit`, `delete` |
| 20 | `engagement_score` | Báo cáo & Thống kê | `/reports` | `access`, `view_all` |

---

## 3. Danh Sách 7 Nhóm Quyền Mặc Định (Default System Groups)

1. **Admin**: Toàn quyền mọi Resource và Action (`fullCrud` 100%).
2. **CEO**: Toàn quyền xem số liệu toàn công ty (`view_all` tất cả), quản lý Deal/Quote, không có quyền sửa cấu hình hệ thống / phân quyền.
3. **Trưởng phòng**: Toàn quyền CRUD trong phạm vi phòng ban và cấp dưới, không được xem ngoài phòng ban trừ khi được cấp `view_all`.
4. **Sale Senior**: CRUD khách hàng, hội thoại của mình, có quyền xóa khách hàng/hội thoại do mình phụ trách.
5. **Sale Junior**: Chỉ tạo mới và chăm sóc khách hàng của mình, không có quyền xóa.
6. **Marketing**: Quản lý chiến dịch Broadcast, Trigger, Tệp khách hàng, kho Media, `contact.view_all=true` để quét tệp.
7. **CSKH**: Chăm sóc hội thoại, tiếp nhận khách, hỗ trợ nhắn tin và gắn thẻ.
