# Analytics & Reporting CQRS Read Projections Specification (Zero Silent Mock)

> **Bounded Context:** `internal/serviceapi` & `internal/analytics`  
> **Mục tiêu:** Xoá bỏ triệt để 100% dữ liệu Mock cứng trong `analytics_handler.go` và thay thế bằng CQRS Read Projections truy vấn dữ liệu thật từ PostgreSQL.  
> **Nguyên tắc:** Pragmatic CQRS (Pitfall 2: Read paths scan direct DB model, không hydrate full Aggregate), Batch Query, Zero Mock Fallback.

---

## 1. Hiện Trạng Lỗi Vi Phạm & Phương Án Khắc Phục

### 1.1 Điểm Vi Phạm Hiện Tại
File `internal/service/interfaces/http/analytics_handler.go` đang trả về các giá trị hardcoded:
- `GetAnalyticsOverview`: Trả về số cứng (`totalContacts: 1250, activeDeals: 48, totalRevenue: 185000000`).
- `ExportDashboardExcel`: Trả về chuỗi giả lập `[]byte("mock_excel_data")`.
- `GetConversions`, `GetTeamPerformance`, `GetReportsPipeline`: Trả về mảng rỗng `[]any{}` hoặc số cố định.

### 1.2 Kiến Trúc Thay Thế (Pragmatic CQRS Read Projections)
1. **Tách biệt Write Path vs Read Path**:
   - Write Path: Ghi nhận sự kiện qua Outbox hoặc trực tiếp vào tables (`contacts`, `deals`, `messages`).
   - Read Path: CQRS Query Handlers gọi trực tiếp `AnalyticsQueryRepository` sử dụng câu lệnh SQL Aggregation tối ưu (COUNT, SUM, AVG, GROUP BY).
2. **Xuất Excel Thật**:
   - Sử dụng thư viện thuần Go `github.com/xuri/excelize/v2` để tạo workbook thật, format header, currency và stream nhị phân về cho browser.

---

## 2. Thiết Kế Truy Vấn SQL Aggregation Chuẩn

### 2.1 Analytics Overview (`GET /api/v1/analytics/overview`)
```sql
SELECT 
    COUNT(c.id) AS total_contacts,
    COUNT(d.id) FILTER (WHERE d.status = 'open') AS active_deals,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'won'), 0) AS total_revenue,
    COALESCE(AVG(a.first_response_time_seconds), 0) AS avg_response_sec
FROM contacts c
LEFT JOIN deals d ON d.tenant_id = c.tenant_id
LEFT JOIN agent_sla_metrics a ON a.tenant_id = c.tenant_id
WHERE c.tenant_id = $1;
```

### 2.2 Conversion Funnel (`GET /api/v1/analytics/conversions`)
```sql
SELECT 
    COUNT(c.id) AS total_contacts,
    COUNT(d.id) AS total_deals_opened,
    COUNT(d.id) FILTER (WHERE d.status = 'won') AS deals_won,
    CASE 
        WHEN COUNT(c.id) > 0 THEN ROUND(COUNT(d.id) FILTER (WHERE d.status = 'won')::numeric / COUNT(c.id)::numeric, 4)
        ELSE 0 
    END AS conversion_rate
FROM contacts c
LEFT JOIN deals d ON d.contact_id = c.id AND d.tenant_id = c.tenant_id
WHERE c.tenant_id = $1 AND c.created_at BETWEEN $2 AND $3;
```

### 2.3 Team Performance (`GET /api/v1/analytics/team-performance`)
```sql
SELECT 
    u.id AS user_id,
    u.full_name AS user_name,
    COUNT(DISTINCT c.id) AS assigned_contacts,
    COUNT(DISTINCT d.id) AS total_deals,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'won'), 0) AS revenue_generated,
    COALESCE(AVG(a.avg_response_time_seconds), 0) AS avg_response_sec
FROM users u
LEFT JOIN contacts c ON c.owner_user_id = u.id AND c.tenant_id = u.tenant_id
LEFT JOIN deals d ON d.user_id = u.id AND d.tenant_id = u.tenant_id
LEFT JOIN agent_sla_metrics a ON a.user_id = u.id AND a.tenant_id = u.tenant_id
WHERE u.tenant_id = $1
GROUP BY u.id, u.full_name;
```

---

## 3. Danh Mục Endpoints Cần Chuyển Đổi Sang SQL Thật

| Method | Endpoint | SQL Source Tables | DTO Trả Về |
|---|---|---|---|
| `GET` | `/api/v1/analytics/overview` | `contacts`, `deals`, `agent_sla_metrics` | `{ totalContacts, activeDeals, totalRevenue, averageResponseSec }` |
| `GET` | `/api/v1/analytics/conversions` | `contacts`, `deals` | `{ conversionRate, leadsReceived, dealsClosed }` |
| `GET` | `/api/v1/analytics/team-performance?page=&page_size=`| `users`, `contacts`, `deals` | Phân trang chuẩn `pkg/pagination` (`PageResult[TeamMemberMetric]`: `{items, total, page, page_size, total_pages, has_next}`) |
| `GET` | `/api/v1/dashboard/metrics` | `contacts`, `messages` | `{ metrics: { newContactsToday, messagesSentToday, activeChats } }` |
| `GET` | `/api/v1/dashboard/export-excel` | Full aggregated dataset | Trả về file MIME `application/vnd.openxmlformats-officedocument...` thật |
| `GET` | `/api/v1/reports/overview` | `conversations`, `messages` | `{ summary: { totalConversations, resolved, avgFirstResponseMs } }` |
| `GET` | `/api/v1/reports/pipeline` | `deals`, `deal_stages` | `{ stages: [{ stageId, stageName, dealCount, totalValue }] }` |