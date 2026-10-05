# Multi-Channel Lead Scoring Domain & API Specification (SPEC 044)

> **Bounded Context:** `internal/customer` (Submodule `scoring`)  
> **Ánh xạ từ ZaloCRM:** `ZaloCRM/backend/src/modules/scoring/` (SPEC 044 P1 - P4, commit `0de2b9a6`)  
> **Nguyên tắc:** Hexagonal Architecture / Clean DDD, Event-driven Scoring, Temporal Decay, Master Governance.

---

## 1. Bản Chất Nghiệp Vụ & Domain Model

Lead Scoring Engine là hệ thống chấm điểm tiềm năng khách hàng tự động đa kênh (Zalo cá nhân, Zalo OA, Telegram, Facebook) nhằm đánh giá mức độ sẵn sàng mua hàng, kích hoạt tự động nhảy giai đoạn (Stage Promotion) và cảnh báo khách hàng bị bỏ quên (Stuck Leads).

### 1.1 Bốn (4) Chiều Điểm Số Chuẩn (Tổng = 100)
1. **Engagement (35%):** Mức độ tương tác (tần suất nhắn tin, phản hồi tin nhắn của tư vấn viên, bấm link gửi qua chat).
2. **Intent (30%):** Ý định mua hàng (hỏi giá, hỏi thông số sản phẩm, gửi địa chỉ nhận hàng, nhắc tới thanh toán).
3. **Fit (15%):** Độ phù hợp chân dung khách hàng (khớp ngành nghề, quy mô doanh nghiệp, địa bàn mục tiêu).
4. **Velocity (20%):** Tốc độ phản hồi và chuyển đổi (thời gian từ lúc tiếp cận đến lúc cung cấp SĐT/nhu cầu).

### 1.2 Cơ Chế Bán Rã Điểm Số (Temporal Score Decay)
- Điểm số không tồn tại vĩnh viễn: Nếu khách hàng ngừng tương tác quá `halfLifeDays` (mặc định 14 ngày), điểm Engagement và Velocity sẽ tự động suy giảm theo hàm mũ:
  $$\text{Score}(t) = \text{Score}_0 \times \left(\frac{1}{2}\right)^{\frac{\Delta t}{\text{halfLifeDays}}}$$
- Điểm Intent và Fit có chu kỳ phân rã dài hơn hoặc được bảo toàn.

### 1.3 Tự Động Nhảy Giai Đoạn (Auto Stage Promotion)
- Khi điểm tổng (`final_score`) vượt ngưỡng cấu hình:
  - Vượt ngưỡng MQL (ví dụ >= 50 điểm): Tự động chuyển Stage sang Marketing Qualified Lead.
  - Vượt ngưỡng SQL (ví dụ >= 75 điểm): Tự động gán tư vấn viên và tạo thông báo ưu tiên.

### 1.4 Phát Hiện Lead Kẹt (Stuck Lead Detection)
- Mỗi giai đoạn bán hàng có ngưỡng thời gian kẹt (`stuckThresholdDays`).
- Nếu khách ở một giai đoạn quá số ngày quy định mà không có tương tác mới, hệ thống tự động đưa vào danh mục `/leads/stuck` và sinh gợi ý hành động tiếp theo (NBA - Next Best Action).

---

## 2. PostgreSQL Schema

```sql
CREATE TABLE IF NOT EXISTS scoring_configs (
    tenant_id VARCHAR(64) PRIMARY KEY,
    weight_engagement INT NOT NULL DEFAULT 35,
    weight_intent INT NOT NULL DEFAULT 30,
    weight_fit INT NOT NULL DEFAULT 15,
    weight_velocity INT NOT NULL DEFAULT 20,
    half_life_days INT NOT NULL DEFAULT 14,
    weights_by_channel JSONB DEFAULT '{}',
    is_master_only BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_weights_sum CHECK (weight_engagement + weight_intent + weight_fit + weight_velocity = 100)
);

CREATE TABLE IF NOT EXISTS contact_score_breakdowns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    contact_id UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
    engagement_score INT NOT NULL DEFAULT 0,
    intent_score INT NOT NULL DEFAULT 0,
    fit_score INT NOT NULL DEFAULT 0,
    velocity_score INT NOT NULL DEFAULT 0,
    final_score INT NOT NULL DEFAULT 0,
    last_signal_at TIMESTAMPTZ,
    last_decayed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_score_tenant ON contact_score_breakdowns(tenant_id, final_score DESC);
```

---

## 3. Danh Mục API Endpoints Chuẩn Hóa

| Method | Route | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/scoring/config` | Master / Org Admin | Xem cấu hình trọng số và phân rã điểm của tổ chức. |
| `PUT` | `/api/v1/scoring/config` | Master Org Only | Cập nhật cấu hình trọng số (bắt buộc tổng = 100) và weights theo kênh. |
| `GET` | `/api/v1/scoring/rules` | Master / Admin | Danh sách các quy tắc bắt tín hiệu (Signal rules). |
| `PUT` | `/api/v1/scoring/rules/:id` | Master Org Only | Chỉnh sửa điểm thưởng/phạt của 1 quy tắc tín hiệu. |
| `GET` | `/api/v1/scoring/stage-transitions` | `contact.access` | Danh sách ngưỡng điểm tự động nhảy giai đoạn. |
| `GET` | `/api/v1/scoring/stuck-thresholds` | `contact.access` | Danh sách số ngày kẹt tối đa cho từng stage. |
| `GET` | `/api/v1/scoring/nba-templates` | `contact.access` | Danh sách mẫu kịch bản đề xuất hành động tiếp theo (NBA). |
| `GET` | `/api/v1/friends/:id/score-breakdown` | `contact.access` | Xem chi tiết 4 chiều điểm số và lịch sử tín hiệu của 1 khách hàng. |
| `POST` | `/api/v1/friends/:id/promote` | `contact.edit` | Thao tác đẩy giai đoạn thủ công cho khách hàng. |
| `POST` | `/api/v1/scoring/recompute-all` | Master Org Only | Kích hoạt tính toán lại toàn bộ điểm số sau khi thay đổi trọng số. |
| `GET` | `/api/v1/leads/stuck?stageId=&page=&page_size=` | `contact.access` | Danh sách lead bị kẹt giai đoạn (Chuẩn `pkg/pagination`: trả về `{items, total, page, page_size, total_pages, has_next}`). |