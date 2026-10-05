# Reports Module & Multi-Tab Analytics Specification (Menu Báo Cáo)

> **Bounded Context:** `internal/serviceapi` (Submodule `reports` & `analytics`)  
> **Frontend Shell:** `ZaloCRM/frontend/src/views/reports/ReportsShell.vue` (8 tabs)  
> **Backend Source:** `ZaloCRM/backend/src/modules/dashboard/report-analytics-routes.ts` & `report-routes.ts`  
> **Nguyên tắc:** Clean DDD, Pragmatic CQRS Read Projections, Zero Silent Mock Fallbacks, Real XLSX Export.

---

## 1. Kiến Trúc Menu Báo Cáo (Reports Shell — 8 Tabs)

Khung giao diện Menu Báo cáo (`ReportsShell`) bao gồm 8 phân hệ con, phục vụ báo cáo quản trị cấp cao và vận hành:

```
Reports Shell (/reports)
├── 1. Tổng quan (/reports/tong-quan)       -> GET /api/v1/reports/overview
├── 2. Nick Zalo (/reports/nick)            -> GET /api/v1/reports/nick-fleet
├── 3. Sale & Team (/reports/sale)          -> GET /api/v1/reports/sales-performance
├── 4. Pipeline & Lead Pool (/reports/pipeline) -> GET /api/v1/reports/pipeline & /reports/lead-pool
├── 5. Automation (/reports/automation)     -> GET /api/v1/reports/automation
├── 6. Engagement (/reports/engagement)     -> GET /api/v1/reports/engagement
├── 7. Audit & Hệ thống (/reports/audit)    -> GET /api/v1/reports/audit & /reports/crm-usage
└── 8. Radar vận hành (/reports/radar)      -> GET /api/v1/ops-radar/signals (SPEC 032)
```

---

## 2. Chi Tiết Kỹ Thuật 12 REST Endpoints Báo Cáo

Mọi endpoint đều nhận tham số lọc thời gian `?from=YYYY-MM-DD&to=YYYY-MM-DD` (mặc định 30 ngày gần nhất) và bắt buộc gán phạm vi `tenant_id` (`org_id`).

### 2.1 GET /api/v1/reports/overview (Tổng quan)
- **Mục đích:** Thẻ chỉ số KPI chính và biểu đồ chuỗi thời gian tin nhắn.
- **SQL Aggregation:**
  - KPI Contacts: Đếm số `contacts` tạo mới trong kỳ và kỳ trước để tính `deltaPct`.
  - KPI Messages: Tổng số tin nhắn gửi và nhận trong kỳ.
  - KPI Deals Won: Số hợp đồng chốt và doanh thu.
  - KPI Appointments: Số lịch hẹn đã thực hiện.
  - `messageSeries`: Mảng 14 ngày gồm `date`, `sent`, `received`.

### 2.2 GET /api/v1/reports/nick-fleet (Đội ngũ Nick Zalo)
- **Mục đích:** Báo cáo sức khoẻ và hiệu quả từng tài khoản Zalo.
- **SQL Aggregation:**
  - Join `channel_accounts` (loại Zalo) với `messages` và `conversations`.
  - Đếm: `sentToday`, `receivedToday`, `activeChatsToday`, `friendCount`, `checkpointWarning`.

### 2.3 GET /api/v1/reports/sales-performance (Hiệu suất Sale & Team)
- **Mục đích:** Đánh giá năng suất của từng nhân viên tư vấn.
- **SQL Aggregation:**
  - Group by `users.id`, `users.full_name`, `departments.name`.
  - Đếm: Số lead được gán, số tin gửi đi, thời gian phản hồi đầu tiên (`avgFirstResponseTimeSec`), số deal chốt (`dealsWon`), doanh thu đạt được (`totalRevenue`), tỉ lệ đạt SLA (`slaPassRate`).

### 2.4 GET /api/v1/reports/pipeline & /api/v1/reports/lead-pool (Bán hàng & Kho Lead)
- **Pipeline:** Nhóm theo `deal_stages`: đếm số deal, tổng giá trị, số deal bị kẹt quá hạn (`stuckCount`), tỉ lệ chuyển đổi qua chặng tiếp theo.
- **Lead Pool:** Số lead trong kho chưa ai nhận (`availableLeads`), số lead đã nhận hôm nay, số lead bị tự động thu hồi do vi phạm thời gian chăm sóc (`revokedCount`).

### 2.5 GET /api/v1/reports/automation (Chiến dịch tự động)
- **Mục đích:** Thống kê các kịch bản nuôi dưỡng (Sequences) và gửi tin tự động.
- **SQL Aggregation:**
  - Bảng `marketing_sequences`: `enrolledCount`, `completedCount`, `replyCount`, `replyRatePct`.
  - Bảng sự kiện: `failedRate24h`, nhóm lý do bỏ qua (`skipReasons`: đã có lịch hẹn, đang chat trực tiếp, ngoài giờ...).

### 2.6 GET /api/v1/reports/engagement (Tương tác & Heatmap)
- **Mục đích:** Khung giờ vàng tương tác và phân tích hành vi khách.
- **SQL Aggregation:**
  - Ma trận Heatmap 24x7: Trích xuất `EXTRACT(DOW FROM sent_at)` và `EXTRACT(HOUR FROM sent_at)` từ `messages` có `sender_type = 'contact'`.
  - Top 10 khách hàng phản hồi nhanh nhất.

### 2.7 GET /api/v1/reports/audit (Nhật ký an ninh)
- **Mục đích:** Truy vết các hành vi nhạy cảm của người dùng.
- **Dữ liệu:** Quét bảng `privacy_audit_logs` và `user_sessions`: hành động xem số điện thoại, xuất file excel, phân quyền, đăng nhập thất bại.

### 2.8 GET /api/v1/reports/export (Xuất file Excel tổng hợp)
- **Mục đích:** Tải file Excel đa trang tính (`.xlsx`).
- **Thực thi:** Sử dụng thư viện thuần Go `github.com/xuri/excelize/v2`.
  - Sheet 1: `Messages` (ngày, gửi, nhận, tổng).
  - Sheet 2: `Contacts` (ngày, trạng thái, người phụ trách).
  - Sheet 3: `Appointments` (ngày giờ, khách hàng, nhân viên, trạng thái).
- **MIME:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### 2.9 Các Endpoints Báo Cáo Chi Tiết:
- `GET /api/v1/reports/messages`: Thống kê tin nhắn theo từng ngày.
- `GET /api/v1/reports/contacts`: Thống kê contact mới theo ngày và phân bố trạng thái.
- `GET /api/v1/reports/appointments`: Thống kê lịch hẹn theo trạng thái và loại hình.
- `GET /api/v1/reports/crm-usage`: Chỉ số DAU/MAU người dùng hệ thống.

---

## 3. Quy Tắc Chống Gian Lận Dữ Liệu (Anti-Mock Standard)

1. **Tuyệt đối không trả về số tĩnh:** Không bao giờ trả về các số cứng như `1250`, `48`, `450`, `mock_excel_data`. Nếu database rỗng, phải trả về `0` hoặc mảng rỗng `[]`.
2. **Quyền truy cập (RBAC Scoping):**
   - `admin` / `owner`: Toàn bộ tổ chức.
   - `leader` / `deputy`: Toàn bộ nhân viên thuộc cây phòng ban quản lý.
   - `member` thông thường: Bị chặn `403 Forbidden` (`reports_member_forbidden`).
