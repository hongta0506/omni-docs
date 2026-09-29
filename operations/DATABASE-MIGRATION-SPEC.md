# Quy Chuẩn Migration & Khởi Tạo Dữ Liệu Gốc (Database Migration & Seeding Spec)
## Omni Core Platform — PostgreSQL & Bun ORM Architecture

> **Mục tiêu**: Chuẩn hóa cơ chế chuyển dịch schema cơ sở dữ liệu (Database Migrations) và nạp dữ liệu gốc (Baseline Seeding) cho PostgreSQL 16 sử dụng Bun ORM. Đảm bảo quy trình nâng cấp an toàn, chống deadlock, hỗ trợ zero-downtime deployment và cô lập dữ liệu thử nghiệm.

---

## 1. Nguyên Tắc Cốt Lõi (Core Migration Rules)

1. **Version Control Duy Nhất**: Toàn bộ thay đổi cấu trúc bảng, khóa ngoại, chỉ mục (Index) bắt buộc phải quản lý qua file migration có định danh thời gian (Timestamped). Tuyệt đối cấm thao tác sửa schema trực tiếp bằng tay trên DB staging hoặc production.
2. **Khóa Độc Quyền (Advisory Locking)**: Khi ứng dụng chạy nhiều replica trên Kubernetes/Docker Swarm, tiến trình migration bắt buộc phải acquire PostgreSQL Advisory Lock (`pg_advisory_lock`) để ngăn chặn việc chạy đồng thời gây xung đột dữ liệu.
3. **Quy Tắc Zero-Downtime (Mô Hình Mở Rộng - Thu Hẹp / Expand-Contract Pattern)**:
   - **Không đổi tên cột trực tiếp**: Cần thêm cột mới (nullable) ➔ Triển khai code hỗ trợ cả hai cột ➔ Đồng bộ dữ liệu cũ sang mới ➔ Đổi code trỏ hẳn sang cột mới ➔ Xóa cột cũ ở migration sau.
   - **Tạo Index ngầm (Concurrently)**: Với các bảng lớn (hàng triệu bản ghi tin nhắn, khách hàng), tạo index luôn đi kèm cờ `CREATE INDEX CONCURRENTLY` để không khóa bảng (table write lock).
4. **Hai Chiều Up/Down Bắt Buộc**: Mỗi bước nâng cấp (`*.up.sql` hoặc Go handler `Up`) phải có thao tác hoàn tác tương ứng (`*.down.sql` hoặc Go handler `Down`).

---

## 2. Cấu Trúc Thư Mục Migration & Công Cụ Quản Lý

Mã nguồn quản lý migration được tổ chức tập trung tại root repository `omni-core`:

```
omni-core/
├── cmd/
│   └── migrate/
│       └── main.go                 # CLI Runner (up, down, status, create, seed)
├── internal/
│   └── infrastructure/
│       └── persistence/
│           └── migrations/         # Bộ sưu tập file migration
│               ├── 20260901000001_init_extensions_and_dlq.up.sql
│               ├── 20260901000001_init_extensions_and_dlq.down.sql
│               ├── 20260901000002_create_identity_tables.up.sql
│               ├── 20260901000002_create_identity_tables.down.sql
│               ├── 20260901000003_create_customer_tables.up.sql
│               └── ...
└── scripts/
    └── seed/                       # Scripts nạp dữ liệu mồi
        ├── baseline_system.go       # Dữ liệu gốc bắt buộc cho mọi môi trường
        └── mock_development.go      # Dữ liệu mẫu dùng riêng cho dev/staging
```

---

## 3. Quy Ước Đặt Tên File Migration (Naming Conventions)

Tên file migration tuân theo định dạng:
`YYYYMMDDHHMMSS_<submodule>_<hanh_dong>.up.sql` (hoặc `.down.sql`)

Ví dụ:
- `20260925143000_customer_add_smart_merge_fields.up.sql`
- `20260925143000_customer_add_smart_merge_fields.down.sql`
- `20260928090000_resilience_create_system_outbound_dlq.up.sql`

---

## 4. Đặc Tả Migration Nền Tảng Cho MVP (Baseline Schemas)

### 4.1 Migration Khởi Tạo Tiện Ích & Bảng Tự Phục Hồi DLQ (Sprint 7)
Mọi cụm PostgreSQL của Omni Core bắt buộc có bảng `system_outbound_dlq` ngay từ migration đầu tiên:

```sql
-- Up Migration: 20260901000001_init_extensions_and_dlq.up.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Bảng Dead Letter Queue phục vụ tự chữa lành và nút Redrive trên UI CRM
CREATE TABLE IF NOT EXISTS system_outbound_dlq (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    bounded_context VARCHAR(32) NOT NULL,
    submodule VARCHAR(32) NOT NULL,
    destination_target VARCHAR(128) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    exception_classification VARCHAR(32) NOT NULL, -- Transient, Terminal, SecurityPolicy
    failure_reason TEXT NOT NULL,
    retry_count INT DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'FAILED',  -- FAILED, RESOLVED, DISCARDED
    resolved_by_user_id VARCHAR(64),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant_status ON system_outbound_dlq(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dlq_created_at ON system_outbound_dlq(created_at DESC);
```

---

## 5. Chiến Lược Nạp Dữ Liệu Gốc (Baseline Data Seeding)

Dữ liệu Seeding được phân định rạch ròi thành 2 cấp độ:

### 5.1 Cấp Độ 1: System Baseline Seed (`seed:system`)
Áp dụng cho **tất cả môi trường** (kể cả Production khi khởi tạo tenant mới):
1. **Root SuperAdmin**: Tài khoản quản trị cấp cao nhất phục vụ setup hệ thống.
2. **Cây Quyền Hạn Chuẩn (RBAC Tree)**:
   - Các nhóm quyền: `IdentityManager`, `ChannelAdmin`, `SalesLead`, `ChatAgent`, `MarketingSpecialist`.
   - Các action nguyên tử: `contact:read`, `contact:write`, `contact:merge`, `order:approve`, `deal:close`.
3. **Phễu Bán Hàng Mặc Định (Default Sales Pipeline)**:
   - 6 Stage chuẩn: `lead` (Tiềm năng) ➔ `qualified` (Đủ điều kiện) ➔ `proposal_sent` (Gửi báo giá) ➔ `negotiation` (Đàm phán) ➔ `won` (Thành công) / `lost` (Thất bại).
4. **Mẫu Tin Nhắn Hệ Thống (Default Chat Presets)**:
   - Các câu chào mừng tiêu chuẩn cho nhân viên trực chat: `{greeting}`, `{ask_phone}`.

### 5.2 Cấp Độ 2: Mock Development Seed (`seed:mock`)
**Nghiêm cấm chạy trên môi trường Production**. Chỉ dành cho Local Dev và Staging:
1. 50 khách hàng mẫu kèm số điện thoại, tag phân loại và lịch sử mua hàng.
2. 20 đơn hàng mẫu đồng bộ từ KiotViet/Pancake với các trạng thái nợ khác nhau để test tính năng quét nợ (`order-debt-sweep`).
3. Dữ liệu tin nhắn chat mẫu giả lập hội thoại Zalo/Telegram.

---

## 6. Các Lệnh Điều Khiển Chuẩn (CLI Commands)

```bash
# Áp dụng toàn bộ migration mới nhất
go run cmd/migrate/main.go up

# Rollback bước migration gần nhất
go run cmd/migrate/main.go down

# Kiểm tra trạng thái hiện tại của migrations (đã chạy / đang chờ)
go run cmd/migrate/main.go status

# Nạp dữ liệu hệ thống chuẩn (System Baseline)
go run cmd/migrate/main.go seed --type=system

# Nạp dữ liệu giả lập cho môi trường phát triển (Dev Mock)
go run cmd/migrate/main.go seed --type=mock
```
