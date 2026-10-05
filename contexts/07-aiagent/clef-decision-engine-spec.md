# Clef Decision Engine & AI Shadow Ingestion Specification (SPEC 064)

> **Bounded Context:** `internal/aiagent` (Submodule `decision`)  
> **Ánh xạ từ ZaloCRM:** `ZaloCRM/backend/src/modules/decision/` (SPEC 064, commit `0de2b9a6`)  
> **Nguyên tắc:** Clean DDD, Dual Run Shadow Traffic, Circuit Breaker, Admin Killswitch.

---

## 1. Bản Chất Nghiệp Vụ & Cơ Chế Hoạt Động

Clef Decision Engine là hệ thống AI phân tích nội dung cuộc hội thoại Zalo/Telegram thời gian thực nhằm:
1. Nhận định ý định mua hàng của khách (Intent classification).
2. Phát hiện cảm xúc tiêu cực hoặc tín hiệu khiếu nại (Sentiment / Anomaly signal).
3. Đề xuất kịch bản hoặc hành động tự động cho tư vấn viên.

### 1.1 Hai (2) Chế Độ Vận Hành
- **`shadow` (Chạy bóng):** Động cơ nhận định và ghi log nhật ký phân tích nhưng KHÔNG tự động gắn nhãn hay gửi tin ra bên ngoài. Dùng để đối soát độ chính xác trước khi bật chính thức.
- **`draft` (Bản nháp):** Tự động sinh ra gợi ý câu trả lời dưới dạng bản nháp trong khung chat để tư vấn viên bấm duyệt gửi.

### 1.2 Quyền Hạn Đa Tầng (Multi-tier Governance)
- **Tổ chức thông thường (Tenant Owner/Admin):**
  - Chỉ được xem/bật/tắt chế độ nhận định (`shadow` vs `draft`).
  - **Không** được tự ý mở quyền gửi nhãn ra bên ngoài (`egressAllowed`).
  - **Không** được nhìn thấy số dư tài khoản Clef hay khoá API của động cơ.
- **Tổ chức Master (Admatrix System Admin):**
  - Quản lý trạng thái động cơ Clef toàn hệ thống.
  - Cấp quyền `egressAllowed` cho từng tenant.
  - Cấu hình LLM fallback model (khi Clef gặp sự cố mạng hoặc hết hạn ngạch).
  - Kiểm tra sổ log phân tích toàn hệ thống và chạy thử trên Playground.

---

## 2. PostgreSQL Schema

```sql
CREATE TABLE IF NOT EXISTS decision_settings (
    tenant_id VARCHAR(64) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    mode VARCHAR(16) NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'draft')),
    egress_allowed BOOLEAN NOT NULL DEFAULT false,
    clef_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    conversation_id VARCHAR(128) NOT NULL,
    message_id VARCHAR(128),
    engine VARCHAR(32) NOT NULL DEFAULT 'clef',
    intent VARCHAR(64),
    sentiment VARCHAR(32),
    suggested_action VARCHAR(64),
    confidence_score DECIMAL(5, 4),
    execution_time_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_logs_tenant ON decision_logs(tenant_id, created_at DESC);
```

---

## 3. Danh Mục API Endpoints Chuẩn Hóa

| Method | Route | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/decision/settings` | `owner, admin` | Xem cấu hình nhận định của tổ chức (`enabled`, `mode`). |
| `PUT` | `/api/v1/decision/settings` | `owner, admin` | Cập nhật chế độ `shadow` hoặc `draft`. |
| `GET` | `/api/v1/admin/decision/status` | Master Org Only | Trạng thái toàn cục: số dư Clef, uptime, thống kê 24h. |
| `PUT` | `/api/v1/admin/decision/orgs/:orgId` | Master Org Only | Mở quyền `egressAllowed` cho từng tổ chức. |
| `POST` | `/api/v1/admin/decision/engine/reactivate` | Master Org Only | Kích hoạt lại engine Clef sau sự cố. |
| `POST` | `/api/v1/admin/decision/engine/disable` | Master Org Only | Tắt Clef, chuyển sang dùng LLM dự phòng. |
| `PUT` | `/api/v1/admin/decision/llm` | Master Org Only | Cấu hình LLM fallback model (DeepSeek / OpenAI). |
| `GET` | `/api/v1/admin/decision/logs` | Master Org Only | Tra cứu nhật ký nhận định toàn hệ thống. |
| `POST` | `/api/v1/admin/decision/playground` | Master Org Only | Thử nghiệm nhận định với đoạn chat tuỳ ý. |
