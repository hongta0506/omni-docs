# SPEC-ANALYTICS-REPORTS-CONTRACT-ALIGNMENT-001: Analytics Reports DTO Alignment & Frontend Contract Spec

> **Tài liệu đặc tả chuẩn hóa dữ liệu báo cáo (Reports Contract Alignment)**  
> **Mã tài liệu:** `SPEC-ANALYTICS-REPORTS-002`  
> **Phạm vi:** `internal/analytics` (Go Backend), `omni-web` (Frontend Vue 3), `omni-docs` (Architecture).  
> **Trạng thái:** DRAFT / PENDING REVIEW.  

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem)

Khi tích hợp giao diện Báo cáo Tổng quan (`OverviewReport.vue`) với backend Go (`GET /api/v1/reports/overview`), giao diện không hiển thị số liệu (tất cả các chỉ số KPI bằng 0 hoặc rỗng) do sự sai lệch cấu trúc payload (Schema Mismatch):
1. **Frontend Contract:** Giao diện `omni-web` kế thừa hợp đồng từ ZaloCRM (`report-analytics-routes.ts`), mong đợi cấu trúc gồm:
   - `kpis`: Đối tượng chứa các chỉ số vận hành tổng thể (`totalContacts`, `newContacts`, `nicksOnline`, `nicksTotal`, `nicksNeedRelogin`, `msgToday`, `msgByBot`, `apptToday`, `leadPoolWaiting`, `closeRate`, `friendAcceptRate`).
   - `msgSeries`: Mảng dữ liệu chuỗi thời gian `{ date, sent, received }`.
   - `funnel`: Mảng thống kê phễu khách hàng `{ label, count, sub, val }`.
   - `topSales`: Bảng xếp hạng doanh số sale `{ name, revenue, dealsWon, convRate }`.
   - `riskNicks`: Danh sách nick Zalo có cảnh báo/nguy cơ checkpoint `{ name, risk, quotaPct, uptime7d }`.
2. **Backend Hiện Tại:** `internal/analytics` trả về cấu trúc phẳng gồm:
   - `summary`: (`totalContacts`, `deltaContactsPct`, `totalMessages`, `sentMessages`, `receivedMessages`, `totalDealsWon`, `totalRevenue`, `totalAppointments`, `avgFirstResponseMs`).
   - `messageSeries`: Mảng thời gian (sai lệch tên trường `messageSeries` vs `msgSeries`).
   - `channelShare`: Thị phần theo kênh.
   - `topTags`: Thẻ nhãn phổ biến.
   - Hoàn toàn thiếu các khối `funnel`, `topSales`, `riskNicks`.

---

## 2. Chuẩn Hóa Cấu Trúc JSON Hợp Nhất (Unified DTO Contract)

Để đảm bảo vừa giữ nguyên vẹn Domain Model của Go DDD, vừa phục vụ trực tiếp giao diện người dùng mà không cần tầng trung gian chắp vá, DTO trả về của `GET /api/v1/reports/overview` sẽ mở rộng và hỗ trợ cả 2 tương thích ngược (Dual Compatibility):

### 2.1 Cấu Trúc Response JSON Chuẩn

```json
{
  "kpis": {
    "totalContacts": 1096,
    "newContacts": 1096,
    "nicksOnline": 0,
    "nicksTotal": 0,
    "nicksNeedRelogin": 0,
    "msgToday": 0,
    "msgByBot": 0,
    "apptToday": 14,
    "leadPoolWaiting": 0,
    "closeRate": 0,
    "friendAcceptRate": 0
  },
  "msgSeries": [
    { "date": "2026-10-01", "sent": 12, "received": 25 }
  ],
  "funnel": [
    { "label": "Liên hệ mới", "count": 1096, "sub": "Số contact tạo mới", "val": "100%" },
    { "label": "Đang tương tác", "count": 0, "sub": "Có phát sinh tin nhắn", "val": "0%" },
    { "label": "Có lịch hẹn", "count": 14, "sub": "Đã đặt lịch hẹn", "val": "1.2%" },
    { "label": "Chốt đơn (Deals Won)", "count": 0, "sub": "Đơn hàng thành công", "val": "0%" }
  ],
  "topSales": [
    { "name": "Nguyễn Văn A", "revenue": 15000000, "dealsWon": 3, "convRate": 12.5 }
  ],
  "riskNicks": [
    { "name": "Zalo Tư Vấn 01", "risk": "warning", "quotaPct": 85, "uptime7d": 98.2 }
  ],
  "summary": {
    "totalContacts": 1096,
    "deltaContactsPct": 100,
    "totalMessages": 0,
    "sentMessages": 0,
    "receivedMessages": 0,
    "totalDealsWon": 0,
    "totalRevenue": 0,
    "totalAppointments": 14,
    "avgFirstResponseMs": 82500
  },
  "messageSeries": [],
  "channelShare": [],
  "topTags": []
}
```

---

## 3. Kiến Trúc Go DDD Tại `internal/analytics`

1. **Domain Model (`internal/analytics/domain/reports/models.go`):**
   - Mở rộng struct `OverviewReport`:
     ```go
     type OverviewKPIs struct {
         TotalContacts     int64   `json:"totalContacts"`
         NewContacts       int64   `json:"newContacts"`
         NicksOnline       int64   `json:"nicksOnline"`
         NicksTotal        int64   `json:"nicksTotal"`
         NicksNeedRelogin  int64   `json:"nicksNeedRelogin"`
         MsgToday          int64   `json:"msgToday"`
         MsgByBot          int64   `json:"msgByBot"`
         ApptToday         int64   `json:"apptToday"`
         LeadPoolWaiting   int64   `json:"leadPoolWaiting"`
         CloseRate         float64 `json:"closeRate"`
         FriendAcceptRate  float64 `json:"friendAcceptRate"`
     }

     type FunnelStageItem struct {
         Label string `json:"label"`
         Count int64  `json:"count"`
         Sub   string `json:"sub"`
         Val   string `json:"val"`
     }

     type TopSalesSummaryItem struct {
         Name     string  `json:"name"`
         Revenue  float64 `json:"revenue"`
         DealsWon int64   `json:"dealsWon"`
         ConvRate float64 `json:"convRate"`
     }

     type RiskNickItem struct {
         Name     string  `json:"name"`
         Risk     string  `json:"risk"`
         QuotaPct int64   `json:"quotaPct"`
         Uptime7d float64 `json:"uptime7d"`
     }
     ```
2. **Infrastructure Query (`internal/analytics/infrastructure/postgres/reports_query_repository.go`):**
   - Truy vấn SQL trực tiếp từ các bảng: `contacts`, `channel_accounts`, `messages`, `appointments`, `deals`, `users`.
   - Tuyệt đối tuân thủ Anti-Mock: Trả về số thực từ database, không sinh số ngẫu nhiên hoặc số cứng nếu dữ liệu trống.
3. **Application Queries & HTTP Handler:**
   - Map đồng thời cả hai trường `msgSeries` và `messageSeries` trỏ chung vào slice dữ liệu để không phá vỡ bất kỳ client nào.

---

## 4. Ranh Giới File Thực Thi (Strict File Isolation)

- `internal/analytics/domain/reports/models.go` (Domain Layer)
- `internal/analytics/infrastructure/postgres/reports_query_repository.go` (Infrastructure Layer)
- `internal/analytics/application/reports/queries.go` (Application Layer)
- `internal/analytics/interfaces/http/analytics_handler.go` (Interfaces Layer)
