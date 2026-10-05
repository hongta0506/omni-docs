# Order Store & Contact Linking Specification (SPEC 057, 057-E, 057-F)

> **Bounded Context:** `internal/deal` (Submodule `order` & `orderlink`)  
> **Ánh xạ từ ZaloCRM:** `modules/order-store/` (SPEC 057 P1 -> 057-F, commit `0de2b9a6`)  
> **Nguyên tắc:** Clean DDD, Batch Ingestion, Transactional Outbox, Scope & Privacy Guard.

---

## 1. Bản Chất Nghiệp Vụ & Luồng Xử Lý

Kho đơn hàng (`order-store`) chịu trách nhiệm tiếp nhận, chuẩn hoá và phản chiếu đơn hàng từ các nền tảng thương mại bên ngoài (Pancake POS, KiotViet, Sapo, Haravan, TikTok Shop...) vào Omni CRM.

### 1.1 Cơ Chế Tự Động Tạo Hồ Sơ Khách Hàng (SPEC 057-E)
- Khi đơn hàng mới được đồng bộ về (qua Webhook hoặc Cron pull):
  1. Kiểm tra SĐT người mua (`buyer_phone`).
  2. Nếu tổ chức bật `autoCreateContacts = true` và SĐT chưa tồn tại trong danh bạ:
     - Tự động khởi tạo Aggregate `Contact` với thông tin người mua (`name`, `phone`, `address`).
     - Gắn ngay ID đơn hàng vào `Contact` vừa tạo.
     - Tăng counter `autoCreated.total` và cập nhật `lastAutoCreateAt`.
  3. Nếu không tạo được (thiếu SĐT): Đưa vào danh sách "Đơn chưa gắn khách" (`unlinked buyers`).

### 1.2 Cơ Chế Tự Bàn Giao Theo Người Bán Trên Hoá Đơn (SPEC 057-F)
- Trên hoá đơn POS thường có trường người bán (`seller_name` / `seller_code`).
- Hệ thống hỗ trợ bảng tra cứu `SellerMap`: map giữa `seller_name` và `user_id` nhân viên tư vấn trong CRM.
- Khi tạo hoặc gắn khách:
  - Nếu `autoAssignBySeller = true`: Tự động gán `owner_user_id` của `Contact` cho nhân viên tương ứng với người bán trên hoá đơn.

---

## 2. PostgreSQL Schema Bổ Sung

```sql
-- Bổ sung trường cấu hình cho bảng order_sync_states
ALTER TABLE order_sync_states 
ADD COLUMN IF NOT EXISTS auto_create_contacts BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_created_count INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_auto_create_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_assign_by_seller BOOLEAN NOT NULL DEFAULT false;

-- Bảng ánh xạ người bán trên hoá đơn POS với nhân viên CRM
CREATE TABLE IF NOT EXISTS order_seller_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    seller_key VARCHAR(128) NOT NULL,
    crm_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, seller_key)
);
```

---

## 3. Danh Mục API Endpoints Chuẩn Hóa

| Method | Route | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/order-store/sync` | `settings.edit` | Trạng thái đồng bộ, công tắc `autoCreateContacts`, số lượng máy tự tạo. |
| `PUT` | `/api/v1/order-store/sync` | `settings.edit` | Bật/tắt đồng bộ, bật/tắt tự động tạo Contact. |
| `GET` | `/api/v1/order-store/sellers` | `settings.edit` | Danh sách người bán trên hoá đơn và liên kết nhân viên CRM. |
| `PUT` | `/api/v1/order-store/sellers` | `settings.edit` | Cập nhật ánh xạ người bán hoá đơn -> nhân viên CRM. |
| `GET` | `/api/v1/order-store/buyers/unlinked` | `settings.edit` | Danh sách người mua trên đơn hàng chưa được gắn hồ sơ Contact. |
| `POST` | `/api/v1/order-store/buyers/link` | `settings.edit` | Gắn thủ công đơn hàng vào Contact. |
| `POST` | `/api/v1/order-store/buyers/create-contacts` | `settings.edit` | Tạo hàng loạt Contact từ danh sách người mua chưa gắn. |
| `GET` | `/api/v1/order-store/contacts/:contactId/purchases` | `deal.access` | Lịch sử mua hàng của khách hàng (Tab Đơn hàng). |
| `POST` | `/api/v1/webhooks/pancake/:tenantId` | Public Secret | Webhook nhận đơn tức thì từ Pancake POS. |
