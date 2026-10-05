# RFM Customer Segmentation Domain & API Specification (SPEC 051)

> **Bounded Context:** `internal/customer` (Submodule `rfm`)  
> **Ánh xạ từ ZaloCRM:** `ZaloCRM/backend/src/modules/rfm/` (SPEC 051 P1 - P5, commit `0de2b9a6`)  
> **Nguyên tắc:** Hexagonal Architecture / Clean DDD, Zero Silent Mock, CQRS Read Projections.

---

## 1. Bản Chất Nghiệp Vụ & Domain Model

RFM (Recency, Frequency, Monetary) là hệ thống phân nhóm khách hàng tự động dựa trên hành vi mua hàng thực tế (từ kho đơn hàng đa kênh SPEC 057) kết hợp với điểm tiềm năng Lead Score (SPEC 044).

### 1.1 Sáu (6) Nhóm Khách Hàng Chuẩn (`segment`)
1. **`slipping` (Khách lớn đang rời - P4):** Khách hàng VIP/giá trị cao có dấu hiệu chững lại, số ngày kể từ lần mua cuối (`daysSinceLast`) vượt quá nhịp mua trung bình (`cadenceDays * slippingK`).
2. **`vip` (Khách VIP):** Khách hàng có tần suất mua cao (`purchaseCount >= vipMinFreq`) và tổng chi tiêu lớn (`m >= 4` hoặc `totalPaid >= moneyMin`).
3. **`repeat_lapsed` (Khách mua nhiều bỏ bẵng):** Khách đã mua >= 2 lần nhưng thời gian dài chưa mua lại (`daysSinceLast > vipDays`).
4. **`one_shot` (Khách mua 1 lần):** Khách chỉ mới phát sinh đúng 1 đơn hàng thành công (`purchaseCount == 1`).
5. **`high_intent_never_bought` (Có ý định cao nhưng chưa mua):** Khách hàng chưa có đơn hàng nào (`purchaseCount == 0`) nhưng có điểm Lead Score cao (`leadScore >= highIntentScore`).
6. **`skip` (Bỏ qua):** Khách không nằm trong các nhóm trên hoặc vi phạm cờ loại trừ.

### 1.2 Bốn (4) Cờ Loại Trừ (`skipReasons`)
- `no_phone`: Khách không có SĐT hợp lệ (không thể gửi tin Zalo/SMS).
- `active_chat`: Đang có tương tác chat trong 24 giờ qua với tư vấn viên (tránh spam khi đang chăm sóc).
- `has_appointment`: Đang có lịch hẹn chưa hoàn thành.
- `agent_hold`: Bị AI Agent hoặc tư vấn viên đánh dấu tạm giữ (Manual Followup).

### 1.3 Cơ Chế Tính Nhịp Mua Riêng (`cadenceDays`)
- Chỉ tính cho khách hàng có từ 3 lần mua trở lên (`purchaseCount >= 3`):
  $$\text{cadenceDays} = \frac{\text{latestPurchaseAt} - \text{firstPurchaseAt}}{\text{purchaseCount} - 1}$$
- Dùng làm mốc động để phát hiện nguy cơ rời bỏ (`slipping`) chính xác hơn mốc ngày cố định.

---

## 2. PostgreSQL Schema & Tactical Aggregates

### Bảng: `contact_rfm_assignments`
```sql
CREATE TABLE IF NOT EXISTS contact_rfm_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    contact_id UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
    days_since_last INT,
    purchase_count INT NOT NULL DEFAULT 0,
    total_paid BIGINT NOT NULL DEFAULT 0,
    r INT NOT NULL CHECK (r BETWEEN 0 AND 5),
    f INT NOT NULL CHECK (f BETWEEN 0 AND 5),
    m INT NOT NULL CHECK (m BETWEEN 0 AND 5),
    segment VARCHAR(32) NOT NULL,
    skip_reasons TEXT[] DEFAULT '{}',
    lead_score_snapshot INT NOT NULL DEFAULT 0,
    source VARCHAR(32) NOT NULL DEFAULT 'code',
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_purchase_at TIMESTAMPTZ,
    cadence_days DECIMAL(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_rfm_tenant_segment ON contact_rfm_assignments(tenant_id, segment);
```

---

## 3. Danh Mục API Endpoints Chuẩn Hóa (Zero Frontend Breakage)

| Method | Route | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/rfm/summary` | `deal.access` | Thống kê số lượng khách theo 6 nhóm, tổng số khách có đơn, luật đang dùng. |
| `GET` | `/api/v1/rfm/segment?segment=&page=&page_size=` | `deal.access` | Lấy danh sách khách hàng theo nhóm cụ thể (Chuẩn `pkg/pagination`: trả về `{items, total, page, page_size, total_pages, has_next}`). |
| `GET` | `/api/v1/rfm/filter?minPurchases=&page=&page_size=` | `deal.access` | "Lọc tự do" khách hàng theo các ngưỡng tuỳ chọn (Chuẩn `pkg/pagination`: trả về `{items, total, page, page_size, total_pages, has_next}`). |
| `GET` | `/api/v1/rfm/contacts/:contactId` | `deal.access` | Lấy trạng thái RFM và cờ bỏ qua live của 1 khách hàng. |
| `POST` | `/api/v1/rfm/to-list` | `customer_list.create` | Đẩy danh sách khách RFM sang Tệp khách hàng CRM (`CustomerList`). |
| `POST` | `/api/v1/rfm/recompute` | `settings.edit` | Kích hoạt tính toán lại toàn bộ dữ liệu RFM toàn tổ chức. |
| `GET` | `/api/v1/rfm/rules` | `settings.edit` | Lấy cấu hình luật RFM hiện hành và 3 bộ mẫu (B2B, Retail, High-Value). |
| `PUT` | `/api/v1/rfm/rules` | `settings.edit` | Cập nhật cấu hình luật RFM cho tổ chức. |