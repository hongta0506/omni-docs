# STOREFRONT COUPON / VOUCHER / PROMOTION SPEC

> **Document Code:** `SPEC-STOREFRONT-COUPON-001`
> **Status:** PARTIAL — domain + bảng đã có (issue #1734), **admin API và lịch sử sử dụng chưa có**.
> **Liên quan:** [STOREFRONT-BC9-SPEC.md](./STOREFRONT-BC9-SPEC.md) §4.6, §5.1, §7; [PAYMENT-METHODS-ADAPTER-SPEC.md](./PAYMENT-METHODS-ADAPTER-SPEC.md) §6 (thứ tự tính VAT).

---

## 1. Hiện trạng (đã có trong code)

Migration `000099_coupons.up.sql` đã tạo:

- `coupons`: `tenant_id, code, kind ('percent'|'amount'), value, max_redemptions, per_shopper_limit, min_subtotal_minor, starts_at, ends_at, is_active` + `UNIQUE (tenant_id, code)`.
- `coupon_redemptions`: `coupon_id, checkout_session_id, shopper_id, redeemed_at` + `UNIQUE (coupon_id, checkout_session_id)`.

Domain `internal/storefront/domain/coupon/coupon.go` đã enforce: active, window (`starts_at/ends_at`), min subtotal, percent ≤ 100, per-shopper limit. Áp dụng đã có trong `application/checkout/create_session.go:133 applyCoupon`.

**Nhưng**: toàn repo **không có** handler HTTP/RPC nào cho coupon — `internal/storefront/interfaces/http/` chỉ có `cart_handler.go` và `payment_webhook_handler.go`. Nghĩa là **không ai tạo được mã**, và **không ai xem được ai đã dùng mã**. Cơ chế đúng nhưng không có cửa vào.

---

## 2. Ba khái niệm phải tách

| Khái niệm | Ai nhập mã? | Ví dụ | Bảng |
|---|---|---|---|
| **Coupon** | Khách nhập `code` ở checkout | `TET2026` giảm 10%, tối đa 500k | `coupons` (đã có) |
| **Voucher** | Khách nhập `code` duy nhất | Mã quà tặng 200k, mỗi mã dùng 1 lần | `vouchers` (mới) — hoặc `coupons` với `max_redemptions=1` + batch code |
| **Promotion** | **Không ai nhập** — tự áp | 20/11 giảm 15% toàn bộ đơn ≥ 300k | `promotions` (mới) |

Quy ước: **coupon/voucher là discount theo code; promotion là discount theo điều kiện, không code.** Cả ba dùng chung engine tính tiền.

### 2.1 Voucher — hai lựa chọn, chốt một

**Phương án A (khuyến nghị): dùng lại `coupons`.** Voucher = coupon với `max_redemptions = 1` (hoặc `per_shopper_limit = 1`) và sinh **hàng loạt mã**. Thêm cột `batch_id` + bảng `coupon_batches` (số lượng, prefix, hạn dùng). Ưu: engine tính tiền không đổi, redemption history dùng chung.
**Phương án B: bảng `vouchers` riêng** (serial, giá trị cố định, có thể chuyển nhượng). Chỉ chọn nếu cần bán thẻ quà tặng như sản phẩm.

Sprint này chọn **A**. B chỉ mở khi có yêu cầu bán gift card.

---

## 3. Data model bổ sung

```sql
-- Promotion tự áp, không cần mã
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('percent','amount')),
    value BIGINT NOT NULL CHECK (value > 0),
    min_subtotal_minor BIGINT NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    priority INT NOT NULL DEFAULT 100,     -- nhỏ hơn = áp trước
    stackable BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bổ sung vào coupons: batch + giới hạn
ALTER TABLE coupons ADD COLUMN batch_id UUID;
ALTER TABLE coupons ADD COLUMN max_discount_minor BIGINT;  -- trần cho kind='percent'
CREATE TABLE coupon_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    prefix VARCHAR(16),
    quantity INT NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nối redemption với đơn để tra lịch sử
ALTER TABLE coupon_redemptions ADD COLUMN order_id UUID;
ALTER TABLE coupon_redemptions ADD COLUMN discount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE coupon_redemptions ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'code'
    CHECK (source IN ('code','promotion'));
CREATE INDEX idx_coupon_redemptions_order ON coupon_redemptions (order_id);
```

Bất biến schema:

1. `coupons.code` unique theo `(tenant_id)`, lưu **uppercase**, không khoảng trắng.
2. `promotions` **không** có `code`.
3. `coupon_redemptions` unique `(coupon_id, checkout_session_id)` — giữ nguyên; thêm `order_id` để lịch sử không phụ thuộc session.
4. `discount_minor` lưu **số tiền thực giảm**, không lưu % — để đối soát doanh thu không phải tính lại.
5. `max_discount_minor` chỉ áp cho `kind='percent'`; `kind='amount'` bỏ qua.

---

## 4. Engine tính tiền (một hàm, ba nguồn)

```
subtotal
  → áp promotion (stackable / priority order)
  → áp coupon hoặc voucher (1 mã / đơn, trừ khi tenant bật stacking)
  → discount_total (không vượt subtotal)
  → VAT (theo config tenant — xem PAYMENT §6)
  → shipping
  → total
```

Bất biến:

1. `discount_total ≤ subtotal`; tổng không bao giờ âm. Vượt → cắt về `subtotal`, ghi lý do.
2. Thứ tự **cố định**: discount trước VAT. Không được tính VAT trên giá gốc rồi mới trừ.
3. `kind='percent'` làm tròn **floor** trên số minor; nếu có `max_discount_minor` thì cắt trần.
4. Một đơn chỉ áp **1 mã** (coupon hoặc voucher); promotion được áp nhiều nếu `stackable=true`.
5. Không áp mã nếu subtotal sau promotion < `min_subtotal_minor`.
6. Mã hết hạn / hết lượt / sai tenant → từ chối với lý do **phân biệt được** (`coupon_expired`, `coupon_exhausted`, `coupon_not_applicable`), không gộp thành "mã không hợp lệ".

---

## 5. Lịch sử sử dụng mã (thứ đang thiếu hoàn toàn)

Ba màn hình, đều phân trang `?page=&page_size=` theo `pkg/pagination`:

1. **Danh sách mã** — `GET /api/v1/storefront/coupons?page=&page_size=&status=&q=`: mã, loại, giá trị, đã dùng / tổng lượt, thời gian hiệu lực, trạng thái (active/scheduled/expired/paused).
2. **Chi tiết một mã** — `GET /api/v1/storefront/coupons/{id}`: thông tin + **lịch sử redemption** `GET /api/v1/storefront/coupons/{id}/redemptions?page=&page_size=` → `{shopper_email_masked, order_code, discount_minor, redeemed_at, source}`.
3. **Sổ cái toàn tenant** — `GET /api/v1/storefront/discounts/redemptions?page=&page_size=&from=&to=&coupon_id=`: mọi lần giảm giá (kể cả promotion), để đối soát doanh thu cuối tháng.

Bất biến lịch sử:

- Redemption **không xóa được**. Hủy mã = `is_active=false`, lịch sử còn nguyên.
- `discount_minor` và `order_code` là **immutable** sau khi ghi.
- Truy vấn lịch sử phải join sang đơn để lấy `order_code`, không N+1: một query có `JOIN storefront_orders`.
- PII: email shopper **mask** (`a***@gmail.com`) trong list; detail chỉ mở khi role ≥ manager, có audit `STORE_COUPON_HISTORY_VIEWED`.

---

## 6. Vòng đời & thời gian

```
scheduled ──(starts_at tới)──► active ──(ends_at qua / hết lượt / admin pause)──► expired | paused
```

- `scheduled`: có `starts_at` trong tương lai. Khách nhập → `coupon_not_started`.
- `active`: trong window và còn lượt.
- `expired`: quá `ends_at` **hoặc** `max_redemptions` đã đạt.
- `paused`: admin tắt tay; đơn đang giữ mã đã áp vẫn giữ giá trị đã snapshot.
- Job đánh dấu expired (cron/worker) **không** cần đổi dữ liệu — trạng thái suy ra từ `(is_active, starts_at, ends_at, đếm redemptions)`; job chỉ dùng để gửi thông báo "mã sắp hết hạn" cho admin.

---

## 6.1 UI surfaces (Vue — `omni-web`) — thay cho mô tả "Admin CRM AI"

| Màn hình | View | Store | API service |
|---|---|---|---|
| Danh sách + tạo/sửa mã | `src/views/StoreCouponsView.vue` | `src/stores/store-coupons.ts` | `src/api/store-coupons.ts` |
| Chi tiết mã + lịch sử redemption | `src/views/StoreCouponDetailView.vue` | dùng chung store | dùng chung service |
| Khuyến mãi theo thời gian | `src/views/StorePromotionsView.vue` | `src/stores/store-promotions.ts` | `src/api/store-promotions.ts` |
| Sổ cái giảm giá (đối soát doanh thu) | `src/views/StoreDiscountLedgerView.vue` | store riêng | service riêng |

Quy ước: 5 state, phân trang server-side, không mock; nút xoá **không tồn tại** — chỉ Pause (có `v-dialog` xác nhận).

## 7. Admin CRM AI — cấu hình

Màn hình **Storefront → Khuyến mãi**:

- Tạo/sửa mã: nhập tay hoặc **sinh hàng loạt** (prefix + số lượng + hạn dùng) → xuất CSV để phát hành.
- Tạo promotion: chọn thời gian, điều kiện subtotal, priority, có cho xếp chồng hay không.
- Bật/tắt (không xóa), xem trước "áp lên đơn mẫu" để kiểm tra số tiền trước khi bật.
- Cảnh báo xung đột: hai promotion `stackable` cùng window + cùng điều kiện → hiện cảnh báo, không tự chặn.

Mọi thao tác ghi `logger.LogAudit`: `STORE_COUPON_CREATED`, `_UPDATED`, `_PAUSED`, `STORE_PROMOTION_CREATED`, `_UPDATED`.

---

## 8. Failure modes

| Tình huống | Phát hiện | Hành vi |
|---|---|---|
| Hai người dùng lượt cuối cùng | race trên `max_redemptions` | DB check + `UNIQUE` redemption; một người fail `coupon_exhausted`, không oversell |
| Mã hết hạn giữa lúc áp và lúc đặt | so `ends_at` với `now` ở `PlaceOrder` | Từ chối, yêu cầu nhập lại mã, **không** tự bỏ giảm giá rồi đặt |
| Mã áp lên đơn đã hủy | `checkout_session` cancelled | Redemption không tính; không tái sử dụng lượt (vì chưa `paid`), đếm theo `order_id` đã `paid` |
| Đổi giá trị mã sau khi có người dùng | `coupons.updated_at` | Đơn cũ giữ `discount_minor` đã snapshot; mã mới chỉ áp cho đơn mới |
| Mã trùng khi import CSV | `UNIQUE (tenant_id, code)` | Import báo lỗi từng dòng, không partial-commit |
| Promotion + mã cùng vượt 100% | `discount_total > subtotal` | Cắt về `subtotal`, `total = 0`, vẫn hợp lệ (đơn 0 đồng), ghi audit |

---

## 9. Non-goals

1. Không làm hệ loyalty/điểm thưởng (BC9 §8 đã loại).
2. Không làm mã áp theo từng sản phẩm/danh mục trong sprint này — chỉ theo **subtotal toàn đơn**.
3. Không làm mã chuyển nhượng (gift card) — chỉ mở khi chọn phương án B.
4. Không làm A/B testing khuyến mãi.
5. Không gửi email marketing tự động khi tạo mã (thuộc Marketing BC).

---

## 10. Test bắt buộc

- Bảng test engine: (`percent|amount`) × (`min_subtotal` pass/fail) × (`max_discount` có/không) × (promotion stackable/không) × (VAT inclusive/exclusive) — assert `discount_minor`, `vat_amount`, `total`.
- Race test: N goroutine cùng redeem mã `max_redemptions=1` → đúng 1 thành công.
- Boundary: `starts_at`/`ends_at` đúng 1 giây trước/sau; `min_subtotal` lệch 1 đồng.
- History: redemption hiển thị đúng `order_code`, mask email, và phân trang theo `pkg/pagination`.
