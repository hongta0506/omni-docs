# PRISMA-TO-GO-DDD-MIGRATION-SPEC.md — Đặc Tả Kỹ Thuật Di Trú Dữ Liệu ZaloCRM (Node.js/Prisma) Sang Omni (Golang DDD) & IndexedDB

> **Bounded Contexts:** Identity & Settings, Channel & Gateway, Customer & Lead, Deal & Order, Conversation & Media, Marketing & Automation, Analytics & ServiceAPI.  
> **Phạm vi tác động:** `ZaloCRM` (Prisma schema: 175 models) ➔ `omni-core` (PostgreSQL schema: 139 tables) & `omni-web` (IndexedDB: `OmniClientVault`).  
> **Trạng thái tài liệu:** Migration Specification & Parity Standard (Chính thức).

---

## 1. Mục Tiêu & Nguyên Tắc Cốt Lõi (Guiding Principles)

1. **Zero Data Loss (Bảo toàn 100% dữ liệu nghiệp vụ):**
   - Giữ nguyên toàn bộ UUID gốc (`id`) của Khách hàng, Tổ chức, Nhân viên, Cuộc hội thoại, Cơ hội (Deals), Đơn hàng (Orders), Thẻ tag và Lịch hẹn.
   - Không làm đứt gãy lịch sử chăm sóc và phân quyền phụ trách của nhân viên sale.
2. **Tuân thủ Kiến trúc Zero-Raw-Message:**
   - **Không nhét hàng triệu tin nhắn và tệp media cũ vào PostgreSQL mới**.
   - PostgreSQL của Go chỉ lưu **Hot Rolling Buffer (7 ngày gần nhất)** để phục vụ truy vấn nóng và các thiết bị mới.
   - Toàn bộ lịch sử tin nhắn cũ hơn 7 ngày được đóng gói thành các file dữ liệu lưu trữ (Vault Archive) để nạp thẳng vào **IndexedDB máy nhân viên**.
3. **Idempotency & Safe Resume (Chạy lại an toàn):**
   - Quá trình di trú ETL phải hỗ trợ `ON CONFLICT (id) DO UPDATE` hoặc cơ chế Cursor-based checkpoint để có thể chạy nhiều lần hoặc tiếp tục nếu bị ngắt quãng giữa chừng.

---

## 2. Bảng Đối Soát Bounded Contexts & Schema Mapping (Prisma vs Go Bun ORM)

### 2.1 Bounded Context 1: Identity & Access (Tổ chức, Người dùng & Phân quyền)

| Bảng Nguồn Prisma (`ZaloCRM`) | Bảng Đích PostgreSQL (`omni-core`) | Quy Tắc Chuyển Đổi & Mapping |
| :--- | :--- | :--- |
| `organizations` | `tenants` | `id` ➔ `id` (UUID)<br>`name` ➔ `name`<br>`slug` ➔ `slug`<br>`timezone` ➔ `timezone`<br>`is_active` ➔ `is_active` |
| `users` | `users` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`email` ➔ `email`<br>`phone` ➔ `phone`<br>`full_name` ➔ `full_name`<br>`role` ➔ `role`<br>`password_hash` ➔ `password_hash` |
| `departments` | `departments` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`name` ➔ `name`<br>`parent_id` ➔ `parent_id` |
| `department_members` | `department_members` | `org_id` ➔ `tenant_id`<br>`department_id` ➔ `department_id`<br>`user_id` ➔ `user_id` |
| `permission_groups` | `permission_groups` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`name` ➔ `name`<br>`grants` ➔ `grants` (JSONB) |
| `user_preferences` | `user_preferences` | `user_id` ➔ `user_id`<br>`org_id` ➔ `tenant_id`<br>`key`/`value` ➔ `settings` (JSONB) |

---

### 2.2 Bounded Context 2: Channel & Gateway (Tài khoản kết nối & Định danh)

| Bảng Nguồn Prisma (`ZaloCRM`) | Bảng Đích PostgreSQL (`omni-core`) | Quy Tắc Chuyển Đổi & Mapping |
| :--- | :--- | :--- |
| `zalo_accounts` | `channel_accounts` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`channel_type` = `'zalo_personal'`<br>`zalo_id` ➔ `external_id`<br>`name` ➔ `display_name`<br>`avatar_url` ➔ `avatar_url`<br>`credentials` ➔ `credentials` (Cookies/IMEI JSONB) |
| `egress_proxies` | `egress_proxies` | Giữ nguyên 1:1, chuyển `org_id` ➔ `tenant_id` |
| `egress_proxy_bindings`| `egress_proxy_bindings`| Giữ nguyên 1:1, chuyển `org_id` ➔ `tenant_id` |
| `telegram_bridge_configs`| `channel_accounts` | Map sang `channel_type='telegram'` |
| `facebook_page_accounts`| `channel_accounts` | Map sang `channel_type='facebook'` |

---

### 2.3 Bounded Context 3: Customer & Lead (Khách hàng, Quan hệ & Phân loại)

| Bảng Nguồn Prisma (`ZaloCRM`) | Bảng Đích PostgreSQL (`omni-core`) | Quy Tắc Chuyển Đổi & Mapping |
| :--- | :--- | :--- |
| `contacts` | `contacts` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`full_name` ➔ `display_name`<br>`phone` / `phone_normalized` ➔ `phone`<br>`email` ➔ `email`<br>`avatar_url` ➔ `avatar_url`<br>`source` ➔ `source` |
| `friends` | `channel_profiles` | `contact_id` ➔ `contact_id`<br>`zalo_account_id` ➔ `channel_account_id`<br>`channel_type` = `'zalo_personal'`<br>`zalo_uid` ➔ `external_user_id`<br>`display_name` ➔ `external_display_name`<br>`avatar_url` ➔ `avatar_url` |
| `crm_tags` | `crm_tags` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`name` ➔ `name`<br>`color` ➔ `color` |
| `contact_tags` | `contact_tag_mappings` | `contact_id` ➔ `contact_id`<br>`tag_id` ➔ `tag_id` |
| `notes` | `contact_notes` | `id` ➔ `id`<br>`contact_id` ➔ `contact_id`<br>`author_id` ➔ `author_id`<br>`content` ➔ `content` |
| `appointments` | `appointments` | `id` ➔ `id`<br>`contact_id` ➔ `contact_id`<br>`scheduled_at` ➔ `scheduled_at` |
| `customer_lists` | `customer_lists` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`name` ➔ `name` |
| `customer_list_entries` | `customer_list_entries` | `list_id` ➔ `list_id`<br>`contact_id` ➔ `contact_id` |

---

### 2.4 Bounded Context 4: Deal & Order (Cơ hội bán hàng, Kho đơn hàng Spec 057)

| Bảng Nguồn Prisma (`ZaloCRM`) | Bảng Đích PostgreSQL (`omni-core`) | Quy Tắc Chuyển Đổi & Mapping |
| :--- | :--- | :--- |
| `deals` | `deals` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`contact_id` ➔ `contact_id`<br>`title` ➔ `title`<br>`amount` ➔ `amount`<br>`stage_id` ➔ `stage_id` |
| `deal_stages` | `deal_stages` | Giữ nguyên danh mục pipeline |
| `mirrored_orders` | `orders` | `id` ➔ `id`<br>`org_id` ➔ `tenant_id`<br>`contact_id` ➔ `contact_id`<br>`order_code` ➔ `order_code`<br>`total_amount` ➔ `total_amount`<br>`source_platform` ➔ `source_platform` (KiotViet, Pancake) |
| `mirrored_order_lines` | `order_items` | `order_id` ➔ `order_id`<br>`product_name` ➔ `product_name`<br>`quantity` ➔ `quantity`<br>`price` ➔ `price` |
| `contact_purchase_totals`| `contact_purchase_totals`| Giữ nguyên để phục vụ RFM |
| `contact_rfm_assignments`| `rfm_scores` | Giữ nguyên kết quả phân nhóm RFM (VIP, Slipping, Repeat...) |

---

### 2.5 Bounded Context 5: Conversation & Messaging (Hội thoại & Phân tầng Tin nhắn)

| Bảng Nguồn Prisma (`ZaloCRM`) | Vị Trí Lưu Mới | Cơ Chế Xử Lý & Điều Kiện Lọc |
| :--- | :--- | :--- |
| `conversations` | `omni-core` (`conversations`) | Nạp 100% hội thoại vào PostgreSQL mới.<br>`id` ➔ `id`<br>`channel_account_id` ➔ `channel_account_id`<br>`last_message_snippet` ➔ `last_message_snippet`<br>`last_message_at` ➔ `last_message_at` |
| `messages` (`sent_at >= NOW() - 7 days`) | `omni-core` (`messages`) | **Hot Rolling Buffer (PostgreSQL)**.<br>Nạp vào PostgreSQL để nhân viên mở tab mới hoặc thiết bị mới load được 50 tin nóng tức thì. |
| `messages` (`sent_at < NOW() - 7 days`) | `omni-web` (`IndexedDB: messages`) | **Cold Historical Data (Client Edge Vault)**.<br>Đóng gói thành tệp nén `.vault.json.gz` phân theo từng tài khoản. Client tải về và nạp trực tiếp vào IndexedDB máy người dùng. |
| `media_assets` (Ảnh, File) | `omni-web` (`IndexedDB: mediaBlobs`) | Bỏ qua việc lưu file nhị phân trên server. Client tải ảnh từ Zalo CDN và lưu thành `Blob` trong IndexedDB. |

---

## 3. Quy Trình Kỹ Thuật Thực Thi Di Trú (ETL Execution Steps)

### Giai đoạn 1: Chuẩn bị & Đóng băng Ghi (Pre-flight & Read-Only Window)
1. Tạo snapshot/backup database PostgreSQL của ZaloCRM:
   ```bash
   pg_dump -h <old_db_host> -U crmuser -d zalocrm -F c -b -v -f zalocrm_pre_migration.dump
   ```
2. Triển khai `omni-core` với schema migration mới nhất (đã qua migration 000069).

### Giai đoạn 2: Thực thi CLI Migration Tool (`omni-migrate etl`)
Chạy công cụ chuyển đổi dữ liệu viết bằng Go với cơ chế chunking (1.000 records/batch):
```bash
./bin/omni-migrate etl   --source-dsn="postgres://crmuser:pass@old-db:5432/zalocrm?sslmode=disable"   --dest-dsn="postgres://omni_user:omni_pass@new-db:5432/omni_db?sslmode=disable"   --rolling-days=7   --export-vault-dir="/var/data/vault-archives/"
```

**Thứ tự phụ thuộc dữ liệu bắt buộc (Foreign Key Dependency Order):**
1. `tenants` (từ `organizations`)
2. `users`, `departments`, `permission_groups`
3. `channel_accounts` (từ `zalo_accounts`)
4. `contacts`, `channel_profiles`
5. `crm_tags`, `contact_tag_mappings`, `notes`, `appointments`
6. `deals`, `orders`, `order_items`, `rfm_scores`
7. `conversations`
8. `messages` (Chỉ lấy mốc `sent_at >= NOW() - 7 days`)
9. Xuất bản tệp `vault-archive-{tenant_id}-{account_id}.json.gz` cho phần tin nhắn cũ hơn 7 ngày.

### Giai đoạn 3: Đối Soát Toàn Vẹn Dữ Liệu (Parity & Integrity Verification)
Chạy script kiểm tra checksum và count tương đồng:
```sql
-- Đối soát số lượng Khách hàng
SELECT 'old_contacts', count(*) FROM old_contacts
UNION ALL
SELECT 'new_contacts', count(*) FROM contacts;

-- Đối soát số lượng Đơn hàng
SELECT 'old_orders', count(*) FROM old_mirrored_orders
UNION ALL
SELECT 'new_orders', count(*) FROM orders;
```

### Giai đoạn 4: Đẩy Dữ Liệu Lịch Sử Xuống Client (IndexedDB Ingestion)
1. Khi nhân viên đăng nhập vào `omni-web` lần đầu tiên sau đợt migrate:
2. Hệ thống kiểm tra: Nếu IndexedDB của nhân viên chưa có lịch sử cũ, background worker sẽ gọi API:
   `GET /api/v1/migration/vault-archives/my-account`
3. Trình duyệt giải nén gzip trong Web Worker và thực thi:
   ```typescript
   await localDb.messages.bulkPut(historicalMessages);
   ```
4. Hoàn tất quá trình: Nhân viên có toàn bộ lịch sử chat nhiều năm trên máy của mình, tra cứu 0ms, trong khi máy chủ PostgreSQL vẫn hoàn toàn tinh gọn và nhẹ nhàng.
