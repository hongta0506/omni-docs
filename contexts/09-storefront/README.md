# Storefront Bounded Context (`internal/storefront`)

> Bounded Context thứ 9 của Omni Core. Phụ trách toàn bộ hành trình mua tự phục vụ của **shopper bên ngoài**: giỏ hàng, phiên chốt đơn, giữ hàng, mã giảm giá, và danh tính shopper.
>
> **Trạng thái:** PLANNED. Chưa có package Go, chưa có bảng. Mọi thành phần dưới đây là `(planned)`.
> **Đặc tả đầy đủ:** [`../../architecture/STOREFRONT-BC9-SPEC.md`](../../architecture/STOREFRONT-BC9-SPEC.md)

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/storefront` **(planned)** |
| **Tầng** | `domain/`, `application/`, `infrastructure/`, `interfaces/` — đúng chuẩn 8 BC hiện có |
| **Aggregate Roots** | `Cart`, `CheckoutSession`, `ShopperAccount`, `Coupon` **(planned)** |
| **Entities con** | `CartItem`, `CouponRedemption` **(planned)** |
| **Giao thức** | Connect RPC — `storefront.v1.CartService`, `storefront.v1.CheckoutService`, `storefront.v1.ShopperService` **(planned)** |
| **Proto nguồn** | `api/proto/storefront/v1/storefront.proto` **(planned)** |
| **Codegen** | `gen/go/storefront/v1/`, `gen/ts/storefront/v1/` **(planned)** |
| **Mount** | Trong `cmd/server`, cùng mux tại `cmd/server/main.go:348`. KHÔNG tách binary. |

---

## 2. Trách Nhiệm

### 2.1 Trong phạm vi

1. **Giỏ hàng:** tạo, thêm, sửa số lượng, xoá, đọc. Hỗ trợ cả shopper đã đăng ký và guest.
2. **Phiên chốt đơn:** tổng tiền, áp coupon, giữ hàng, chốt đơn, hết hạn.
3. **Danh tính shopper:** đăng ký, đăng nhập, hồ sơ. Principal hoàn toàn tách khỏi staff.
4. **Mã giảm giá:** định nghĩa, giới hạn lượt dùng, ghi nhận lượt dùng.
5. **Thanh toán:** tạo `payment_intent`, nhận callback từ provider, đối soát. Chỉ lưu `provider_txn_id`, không lưu dữ liệu thẻ `(planned)`.

### 2.2 Ngoài phạm vi (thuộc BC khác)

| Việc | Chủ sở hữu thật |
|---|---|
| Định nghĩa sản phẩm, biến thể, ảnh | `internal/deal` — `internal/deal/domain/product/product.go` |
| Bảng giá, quy tắc giá | `internal/deal` — `internal/deal/infrastructure/quote/postgres_repository.go:107/123/390` |
| **UPDATE `warehouse_stocks.quantity`** | `internal/deal` — model tại `internal/deal/infrastructure/product/postgres_repository.go:39` |
| Tạo order | `internal/deal` — `internal/deal/domain/order/` |
| Contact, lead, timeline | `internal/customer` |
| Campaign, broadcast | `internal/marketing` |
| Xác thực API key, scope, rate limit | `internal/serviceapi` — `internal/serviceapi/domain/credential/credential.go` |
| Tài khoản nhân viên | `internal/identity` — bảng `users` tại `internal/identity/infrastructure/postgres/models/models.go:25` |

### 2.3 Điều cấm tuyệt đối

1. **Cấm dùng bảng `users` cho shopper.** `users` có `tenant_id`, `role` default `'agent'`, `password_hash` — đó là danh bạ nhân viên. Shopper dùng `shopper_accounts` riêng.
2. **Cấm UPDATE `warehouse_stocks.quantity`.** Chỉ `deal` được ghi tồn kho; `storefront` chỉ tạo reservation.
3. **Cấm tạo bảng order thứ năm.** Bốn bảng order-shaped hiện có (`mirrored_orders` khai báo hai lần tại `migrations/000008_customer_ext_tables.up.sql:52` và `migrations/000009_deals_orders_tables.up.sql:25`, cộng `order_platform_orders` tại `migrations/000026_order_platform_orders_tables.up.sql:6`, cộng `pancake_orders`) là nợ kỹ thuật, không mở rộng.
4. **Cấm import chéo domain/application** sang BC khác — theo `contexts/README.md` §4.2.
5. **Cấm lấy `tenant_id` từ request body.**

---

## 3. Ngôn Ngữ (Ubiquitous Language)

| Thuật ngữ | Nghĩa chính xác | Không được nhầm với |
|---|---|---|
| `Shopper` | Người mua bên ngoài, principal riêng | `users` (staff), `contacts` (khách trong CRM) |
| `Guest` | Shopper chưa đăng ký, định danh bằng `cart_session_token` | user ẩn danh, session nhân viên |
| `Cart` | Tập `CartItem` của một chủ giỏ trong một tenant | `Quote` của `deal` |
| `CartItem` | Dòng hàng có `quantity` và giá snapshot | `pricebook_item` |
| `CheckoutSession` | Phiên chốt đơn một lần, có TTL | order |
| `StockReservation` | Quyền giữ tồn kho có thời hạn, **không** trừ tồn kho | `warehouse_stocks.quantity` |
| `AvailableStock` | `quantity` − tổng reservation còn hiệu lực | `quantity` thô |
| `Coupon` | Mã giảm giá có giới hạn lượt | campaign của `marketing` |
| `Order` | Đơn thật, do `deal` tạo | `CheckoutSession` |

---

## 4. Invariant

### 4.1 `Cart`

1. Cart phải có chủ: `shopper_id IS NOT NULL OR cart_session_token IS NOT NULL`.
2. Cart của guest **bắt buộc** có `expires_at`.
3. `status` chỉ đi theo `active → converted` hoặc `active → abandoned`. Không quay lại `active` từ hai trạng thái kia.
4. Một shopper chỉ có **một** cart `active` tại một thời điểm trong một tenant.

### 4.2 `CartItem`

1. `quantity > 0`. Sửa về `0` là lệnh xoá, không phải lưu trữ dòng rỗng.
2. `quantity` **không vượt** `AvailableStock` tại thời điểm ghi.
3. `(cart_id, product_id, variant_key)` là duy nhất — thêm trùng thì cộng dồn.
4. `unit_price_snapshot` ghi một lần lúc thêm; mọi thay đổi giá sau đó **không** ghi đè ngầm.

### 4.3 `CheckoutSession`

1. Tổng tiền bất biến sau khi tạo, trừ khi coupon thay đổi và phiên quay lại `open`.
2. `grand_total = subtotal − discount_total`, không âm.
3. Chỉ `open → reserved → converted` là đường hợp lệ; `reserved` có thể `→ expired` hoặc `→ failed`.
4. `converted` là trạng thái cuối. Mọi lần gọi `PlaceOrder` sau đó trả `order_id` cũ.

### 4.4 `ShopperAccount`

1. `email` duy nhất trong tenant, so sánh không phân biệt hoa thường.
2. Không bao giờ mang `Role` hay `Permissions` của staff.
3. Token của shopper mang `aud = storefront`; token staff **không** được chấp nhận ở `storefront`, và ngược lại.

### 4.5 `StockReservation`

1. Reservation thuộc `deal`, không thuộc `storefront`.
2. Tổng `held` của một `(tenant_id, product_id, warehouse_id)` **không vượt** `warehouse_stocks.quantity`.
3. `quantity > 0`.
4. `expires_at` bắt buộc. Không có reservation vô hạn.
5. `reservation_key` duy nhất theo tenant — gọi lại không tạo reservation thứ hai.

---

## 5. Phụ Thuộc BC Khác

### 5.1 Bản đồ

```
        ┌──────────────┐        ┌──────────────┐
        │ identity (01)│        │serviceapi(08)│
        │  staff JWT   │        │  api_keys    │
        └──────┬───────┘        └──────┬───────┘
               │  (không dùng chung)    │  scope
               ▼                        ▼
        ╔══════════════════════════════════════╗
        ║        storefront (09)               ║
        ║  cart / checkout / shopper / coupon  ║
        ╚═════╦═══════════════════════╦════════╝
              ║ upstream (đọc + RPC)   ║    downstream (event)
              ▼                        ▼
        ┌──────────────┐        ┌──────────────┐
        │  deal (05)   │        │customer (03) │
        │ product,     │        │ contact,     │
        │ pricebook,   │        │ timeline     │
        │ stock, order │        │              │
        └──────────────┘        └──────────────┘
```

### 5.2 Upstream — `storefront` phụ thuộc

| BC | Phụ thuộc cái gì | Đường giao tiếp |
|---|---|---|
| `deal` | Đọc `products`, bảng giá công khai qua `ListPublicPlans` (`internal/deal/infrastructure/product/public_pricebook.go:27`) | Connect RPC client tại `internal/storefront/infrastructure/client/` |
| `deal` | `ReserveStock`, `CommitReservation`, `ReleaseReservation`, `CreateOrder` | Connect RPC |
| `deal` | `AvailableStock` cho invariant số lượng | Connect RPC |
| `serviceapi` | Xác thực `api_keys` cho đối tác, scope `orders:write`/`products:read`/`stock:reserve` | Middleware dùng chung |
| `customer` | Liên kết `contact_id` (UUID thô, không FK) | Chỉ ghi giá trị, không đọc |

### 5.3 Downstream — phụ thuộc `storefront`

| BC | Dùng cái gì |
|---|---|
| `customer` | Nhận `OrderPlacedEvent` để ghi timeline và gắn contact |
| `conversation` | Nhận `OrderPlacedEvent` để đẩy thông báo vào hội thoại nếu có |
| `marketing` | Nhận `CartAbandonedEvent` để chạy nhắc giỏ hàng `(planned)` |

### 5.4 Ràng buộc kỹ thuật

- Mọi lời gọi sang `deal` **bắt buộc** bọc `pkg/resilience` (`pkg/resilience/circuit_breaker.go`, `pkg/resilience/runner.go`). `deal` chết thì `storefront` trả `Unavailable`, không tạo reservation nửa vời.
- Không có foreign key vật lý liên BC. `product_id`, `contact_id`, `order_id` là `uuid.UUID` thô.
- Không có transaction xuyên BC. Bù trừ bằng reservation + job hết hạn.

---

## 6. Domain Event

Ghi qua `outbox_events` trong cùng transaction, đúng chuẩn `pkg/outbox/outbox.go`. Bảng `outbox_events` đã tồn tại từ `pkg/migrate/migrations/000001_baseline_schema.up.sql:85`.

### 6.1 Phát ra

| Event | Khi nào | Payload chính |
|---|---|---|
| `CartItemAdded` | Thêm/sửa dòng hàng | `cart_id`, `product_id`, `quantity` |
| `CartAbandoned` | Job quét guest cart hết TTL | `cart_id`, `shopper_id`, `last_activity_at` |
| `CheckoutSessionCreated` | Tạo phiên | `checkout_session_id`, `grand_total` |
| `CheckoutReserved` | `deal` giữ hàng thành công | `checkout_session_id`, `reservation_ids`, `expires_at` |
| `OrderPlaced` | `deal` tạo đơn thành công | `checkout_session_id`, `order_id`, `contact_id`, `grand_total` |
| `CheckoutExpired` | Reservation hết TTL | `checkout_session_id`, lý do |

### 6.2 Lắng nghe

| Event | Nguồn | Phản ứng |
|---|---|---|
| `StockReservationExpired` | `deal` | `checkout_sessions.status = expired`, cart về `active` |
| `StockReservationCommitted` | `deal` | `checkout_sessions.status = converted` (nếu chưa set) |
| `ProductPriceChanged` `(planned)` | `deal` | Đánh dấu dòng giỏ có giá lệch ngưỡng |

### 6.3 Quy ước đặt tên

Theo `AGENTS.md` §4.4: `<SUBMODULE>_SUCCESS`, `<SUBMODULE>_RETRIED`, `<SUBMODULE>_FAILED`. Event nghiệp vụ dùng thì quá khứ (`OrderPlaced`), log hành động dùng hiện tại hoàn thành (`CART_ITEM_ADDED`).

---

## 7. Tài Liệu Thành Phần `(planned)`

| Tài liệu | Mô tả | Trạng thái |
|---|---|---|
| `api-mapping.md` | Ánh xạ endpoint storefront sang command/query handler | Chưa tạo |
| `usecases.md` | BDD Given-When-Then cho cart, checkout, reservation | Chưa tạo |
| `workflows.md` | Sequence diagram Mermaid cho `cart → checkout → order` | Chưa tạo |
| `test-matrix.md` | Ma trận kiểm thử invariant và failure mode | Chưa tạo |
| `repository-port.md` | Interface repository tầng domain | Chưa tạo |

---

## 8. Tài Liệu Liên Quan

- [`../../architecture/STOREFRONT-BC9-SPEC.md`](../../architecture/STOREFRONT-BC9-SPEC.md) — đặc tả đầy đủ.
- [`../../architecture/ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md`](../../architecture/ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md) — vì sao BC trong repo.
- [`../../architecture/FRONTEND-STOREFRONT-NEXTJS-SPEC.md`](../../architecture/FRONTEND-STOREFRONT-NEXTJS-SPEC.md) — app Next.js riêng.
- [`../05-deal/README.md`](../05-deal/README.md) — BC sở hữu sản phẩm, tồn kho, đơn hàng.
- [`../08-serviceapi/README.md`](../08-serviceapi/README.md) — xác thực API key và scope.
- [`../README.md`](../README.md) — bản đồ 9 Bounded Contexts.
