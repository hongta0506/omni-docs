# STOREFRONT (BC 9) — Đặc Tả Bounded Context Bán Hàng Cho Shopper

> **Mã tài liệu:** `SPEC-BC9-STOREFRONT`
> **Bounded Context:** `internal/storefront` (BC thứ 9)
> **Trạng thái:** PLANNED — chưa có mã nguồn, chưa có migration. Toàn bộ bảng dữ liệu và service trong tài liệu này là `(planned)`.
> **Quyết định nền:** [`ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md`](./ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md)
> **Quy tắc ngôn ngữ:** Tiếng Việt. Tên bảng, struct, package, endpoint giữ nguyên tiếng Anh.

---

## 1. Bối Cảnh

### 1.1 Hiện trạng hệ thống

`omni-core` đang là một modular monolith Go với 8 Bounded Contexts, tổng 615 endpoint:

| BC | Package Go | Endpoints |
|---|---|---:|
| 01 Identity & Settings | `internal/identity` | 72 |
| 02 Channel & Gateway | `internal/channel` | 95 |
| 03 Customer & Lead | `internal/customer` | 92 |
| 04 Conversation & Media | `internal/conversation` | 82 |
| 05 Deal & E-commerce | `internal/deal` | 85 |
| 06 Marketing & Automation | `internal/marketing` | 84 |
| 07 AI Agent & Knowledge | `internal/aiagent` | 65 |
| 08 Service API & Gateway | `internal/serviceapi` | 40 |

Mỗi BC theo đúng 4 layer: `internal/<bc>/{domain,application,infrastructure,interfaces}`.

### 1.2 Hạ tầng vận chuyển hiện tại

- **Transport:** Connect RPC, không phải gRPC thuần — `go.mod:6` khai báo `connectrpc.com/connect v1.17.0`.
- **Codegen:** `buf.yaml` khai báo module `api/proto`; `buf.gen.yaml` sinh ra `gen/go` (protoc-gen-go v1.34.2 + connectrpc/go v1.17.0) và `gen/ts` (connectrpc/es v1.4.0 + bufbuild/es v2.0.0). Proto nguồn nằm ở `api/proto/<bc>/v1/<bc>.proto`.
- **Sinh ra thư mục `gen` khác tên package:** BC `serviceapi` sinh ra `gen/go/service/v1/` và `gen/ts/service/v1/service_api_connect.ts` — tên thư mục codegen là `service`, không phải `serviceapi`. Storefront giữ nguyên quy ước đặt tên `storefront` cho cả package Go (`internal/storefront`) và thư mục codegen (`gen/go/storefront/v1/`, `gen/ts/storefront/v1/`), nên không phát sinh lệch tên như trường hợp `serviceapi`.
- **Server:** một binary duy nhất `cmd/server`. Mux tạo tại `cmd/server/main.go:348` (`mux := http.NewServeMux()`). Listener là `pkg/httpserver/server.go:73` — `s.server.ListenAndServe()`, tức **plaintext HTTP/1.1**. Chưa có `h2c`, chưa có `ServeTLS`. Connect vẫn chạy được trên HTTP/1.1 nhưng mất multiplexing của HTTP/2.

### 1.3 Khoảng trống nghiệp vụ

Kiểm tra thực tế trên `omni-core-clean`:

| Khái niệm | Trạng thái | Bằng chứng |
|---|---|---|
| Giỏ hàng | **Không tồn tại** | `grep -rn "cart" internal/ --include=*.go \| wc -l` → `0` |
| Bảng payment | **Không có** | không có bảng nào tên `payment*` |
| Bảng shipment | **Không có** | không có bảng nào tên `shipment*` |
| Bảng reservation | **Không có** | không có bảng nào tên `reservation*` |
| Coupon | **Không có** | `internal/marketing` chỉ có audience/automation/campaign/block/edition/history/notification/tagging |
| Tồn kho | Có | `pkg/migrate/migrations/000077_schema_drift_prod.up.sql:100` — `warehouse_stocks(id, product_id, warehouse_id, warehouse_name, quantity, updated_at)` |
| Outbox | Có | `pkg/migrate/migrations/000001_baseline_schema.up.sql:85` — `outbox_events` |
| API key cho hệ ngoài | Có | `pkg/migrate/migrations/000090_restore_dropped_bc_schema.up.sql:83` — `api_keys(key_hash, scopes TEXT[], ip_allowlist TEXT[], expires_at, revoked_at)` |

Đơn hàng hiện đã **phân mảnh thành 4 bảng order-shaped**, đây là nợ kỹ thuật đã biết, không sửa trong đợt này:

| Bảng | Khai báo tại |
|---|---|
| `mirrored_orders` | `migrations/000008_customer_ext_tables.up.sql:52` **và** `migrations/000009_deals_orders_tables.up.sql:25` (khai báo hai lần) |
| `order_platform_orders` | `migrations/000026_order_platform_orders_tables.up.sql:6` |
| `pancake_orders` | `migrations/000033_pancake_amounts_bigint.up.sql` |
| Order aggregate trong code | `internal/deal/domain/order/order.go` (`PlatformOrder` tại `:94`, `UnlinkedBuyer` tại `:67`) |

### 1.4 Vì sao phải là Bounded Context mới

Principal của shopper **không thể** là principal của staff:

- Bảng `users` (`internal/identity/infrastructure/postgres/models/models.go:25` — `bun:"table:users,alias:u"`) có `tenant_id`, `role` default `'agent'`, `password_hash`. Đây là danh bạ **nhân viên nội bộ**.
- Toàn bộ phân quyền hiện tại dựa trên `pkg/auth.UserClaims` (`pkg/auth/claims.go:20`) với `Role` và `Permissions` của nhân viên.
- Nhét shopper vào `users` sẽ khiến mọi truy vấn đếm nhân viên, mọi báo cáo RBAC và mọi JOIN `users` sai lệch — và tệ hơn, shopper sẽ kế thừa đường đăng nhập của nhân viên.

Đồng thời giỏ hàng, checkout, giữ hàng, coupon là một mô hình nghiệp vụ **khác hình dạng** với pipeline/quote/order của `deal`. `deal` đo lường theo cơ hội bán hàng do sales đẩy; `storefront` đo lường theo phiên mua tự phục vụ của người lạ. Ghép chung sẽ tạo God Context — đúng lỗi mà `architecture/BOUNDED-CONTEXT-BC7-AIAGENT-VS-BC8-SERVICEAPI.md` đã ghi nhận và loại bỏ một lần.

---

## 2. Ranh Giới Bounded Context

### 2.1 Bảng sở hữu

| Thực thể / bảng | `storefront` sở hữu | Ghi chú |
|---|:---:|---|
| `carts` | ✅ | Gắn với shopper hoặc guest session token |
| `cart_items` | ✅ | Snapshot giá tại thời điểm thêm |
| `checkout_sessions` | ✅ | Phiên chốt đơn, có TTL |
| `payment_intents` | ✅ | `(planned)` — thực thi để sprint sau |
| `shopper_accounts` | ✅ | Principal riêng, KHÔNG dùng `users` |
| `stock_reservations` | ✅ | Chỉ tạo reservation, không UPDATE tồn kho |
| `coupons` | ✅ | Định nghĩa + lượt dùng |

### 2.2 Bảng KHÔNG sở hữu (chỉ đọc hoặc chỉ gọi)

| Thực thể / bảng | Chủ sở hữu | `storefront` được làm gì |
|---|---|---|
| `products` | `deal` — `internal/deal/infrastructure/product/postgres_repository.go:16` | Chỉ đọc qua port. Không ghi. |
| `pricebooks`, `pricebook_items`, `pricebook_rules` | `deal` — `internal/deal/infrastructure/quote/postgres_repository.go:107/123/390` | Chỉ đọc bảng giá công khai qua `ListPublicPlans` (`internal/deal/infrastructure/product/public_pricebook.go:27`) |
| `warehouse_stocks.quantity` | `deal` — model tại `internal/deal/infrastructure/product/postgres_repository.go:39` | **Chỉ `deal` được UPDATE.** `storefront` chỉ tạo reservation |
| order (4 bảng order-shaped) | `deal` — `internal/deal/domain/order/` | `storefront` yêu cầu `deal` tạo, không tự INSERT |
| `contacts`, `leads` | `customer` | Chỉ tham chiếu `contact_id` dạng UUID thô, không FK |
| `users`, `api_keys` | `identity`, `serviceapi` | Chỉ đọc để xác thực |

### 2.3 Bất biến ranh giới

1. `internal/storefront/**` **cấm import** `internal/deal/domain/**`, `internal/deal/application/**`, `internal/customer/domain/**`, `internal/customer/application/**`.
2. Giao tiếp liên BC **chỉ** qua 2 đường, đúng chuẩn `contexts/README.md` §4.2:
   - **Đồng bộ:** Connect RPC client đặt tại `internal/storefront/infrastructure/client/`.
   - **Bất đồng bộ:** domain event qua `pkg/outbox` (`pkg/outbox/outbox.go`) + bảng `outbox_events`.
3. `tenant_id` **luôn** lấy từ credential (API key hoặc JWT claims), **không bao giờ** đọc từ request body hay query string.
4. Không tạo foreign key liên BC. `product_id`, `contact_id`, `order_id` lưu dạng `uuid.UUID` thô.

---

## 3. Ubiquitous Language

| Thuật ngữ | Định nghĩa | KHÔNG phải |
|---|---|---|
| **Shopper** | Người mua bên ngoài, có danh tính riêng trong `shopper_accounts` | Không phải `users` (staff), không phải `contacts` (khách trong CRM) |
| **Guest shopper** | Shopper chưa đăng ký, định danh bằng `cart_session_token` | Không phải user ẩn danh |
| **Cart** | Tập hợp `cart_item` của một shopper/guest trong một tenant | Không phải quote (`deal`), không phải order |
| **CartItem** | Một dòng hàng: `product_id`, `quantity`, giá snapshot | Không phải `pricebook_item` |
| **CheckoutSession** | Phiên chốt đơn một lần, sinh ra sau khi bấm "Thanh toán", có TTL | Không phải order |
| **StockReservation** | Quyền giữ một lượng tồn kho trong một khoảng thời gian hữu hạn | Không phải trừ tồn kho |
| **AvailableStock** | `warehouse_stocks.quantity` − tổng reservation còn hiệu lực | Không phải `quantity` thô |
| **Coupon** | Quy tắc giảm giá có mã, giới hạn lượt dùng | Không phải campaign (`marketing`) |
| **PaymentIntent** | `(planned)` Ý định thanh toán với một provider | Không phải hoá đơn |
| **Order** | Đơn hàng thật, **do `deal` tạo** | `storefront` không sở hữu |

---

## 4. Bảng Dữ Liệu `(planned)`

> Toàn bộ bảng dưới đây **chưa tồn tại**. Tên bảng dùng số nhiều, snake_case, khớp quy ước hiện có (`warehouse_stocks`, `outbox_events`, `api_keys`).

### 4.1 `carts`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | Lấy từ credential |
| `shopper_id` | UUID NULL | FK logic tới `shopper_accounts`, không FK vật lý |
| `cart_session_token` | VARCHAR(64) NULL | Định danh guest; UNIQUE cùng `tenant_id` |
| `currency` | VARCHAR(8) NOT NULL | |
| `status` | VARCHAR(32) NOT NULL | `active` \| `converted` \| `abandoned` |
| `expires_at` | TIMESTAMPTZ NULL | Bắt buộc khi `shopper_id IS NULL` |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL | |

Ràng buộc: `CHECK (shopper_id IS NOT NULL OR cart_session_token IS NOT NULL)` — cart phải có chủ.

### 4.2 `cart_items`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `cart_id` | UUID NOT NULL | |
| `product_id` | UUID NOT NULL | UUID thô, không FK sang `products` |
| `variant_key` | VARCHAR(120) NOT NULL DEFAULT '' | |
| `quantity` | INTEGER NOT NULL | `CHECK (quantity > 0)` |
| `unit_price_snapshot` | BIGINT NOT NULL | Giá tại thời điểm thêm |
| `currency` | VARCHAR(8) NOT NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL | |

UNIQUE `(cart_id, product_id, variant_key)` — thêm trùng mặt hàng thì cộng quantity, không tạo dòng mới.

### 4.3 `checkout_sessions`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | |
| `cart_id` | UUID NOT NULL | |
| `shopper_id` | UUID NULL | |
| `status` | VARCHAR(32) NOT NULL | `open` \| `reserved` \| `converted` \| `expired` \| `failed` |
| `contact_id` | UUID NULL | Tham chiếu `customer`, UUID thô |
| `order_id` | UUID NULL | Tham chiếu `deal`, UUID thô |
| `subtotal`, `discount_total`, `grand_total` | BIGINT NOT NULL | Đơn vị minor unit |
| `coupon_code` | VARCHAR(64) NULL | |
| `expires_at` | TIMESTAMPTZ NOT NULL | TTL phiên giữ hàng |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL | |

### 4.4 `shopper_accounts`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | |
| `email` | VARCHAR(255) NOT NULL | UNIQUE `(tenant_id, lower(email))` |
| `email_verified_at` | TIMESTAMPTZ NULL | |
| `password_hash` | VARCHAR(255) NOT NULL | bcrypt, cùng thư viện với `internal/identity/infrastructure/security/hasher.go` |
| `display_name` | VARCHAR(255) NOT NULL DEFAULT '' | |
| `contact_id` | UUID NULL | Liên kết tuỳ chọn sang `customer.contacts` |
| `status` | VARCHAR(32) NOT NULL | `active` \| `locked` \| `deleted` |
| `last_login_at` | TIMESTAMPTZ NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL | |

**Tách tuyệt đối khỏi `users`.** Không có `role` default `'agent'`, không chia sẻ bảng, không chia sẻ secret nếu audience tách.

### 4.5 `stock_reservations`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | |
| `product_id` | UUID NOT NULL | |
| `warehouse_id` | UUID NOT NULL | |
| `quantity` | INTEGER NOT NULL | `CHECK (quantity > 0)` |
| `reservation_key` | VARCHAR(120) NOT NULL | Thường là `checkout_session.id`; UNIQUE cùng tenant |
| `status` | VARCHAR(32) NOT NULL | `held` \| `committed` \| `released` \| `expired` |
| `expires_at` | TIMESTAMPTZ NOT NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL | |

**Bảng này thuộc `deal`, không thuộc `storefront`** — vì nó là mặt đối diện bắt buộc của `warehouse_stocks.quantity`, và chỉ `deal` được ghi tồn kho. Chi tiết ở issue `[deal] Chốt chủ tồn kho`.

### 4.6 `coupons` và `coupon_redemptions`

| `coupons` | Kiểu | `coupon_redemptions` | Kiểu |
|---|---|---|---|
| `id` | UUID PK | `id` | UUID PK |
| `tenant_id` | UUID NOT NULL | `tenant_id` | UUID NOT NULL |
| `code` | VARCHAR(64) NOT NULL | `coupon_id` | UUID NOT NULL |
| `kind` | VARCHAR(16) NOT NULL (`percent` \| `fixed`) | `shopper_id` | UUID NULL |
| `value` | BIGINT NOT NULL | `checkout_session_id` | UUID NOT NULL |
| `min_subtotal` | BIGINT NOT NULL DEFAULT 0 | `discount_amount` | BIGINT NOT NULL |
| `max_redemptions` | INTEGER NULL | `redeemed_at` | TIMESTAMPTZ NOT NULL |
| `per_shopper_limit` | INTEGER NOT NULL DEFAULT 1 | | |
| `starts_at`, `ends_at` | TIMESTAMPTZ NULL | | |
| `status` | VARCHAR(16) NOT NULL | | |

UNIQUE `(tenant_id, code)`.

### 4.7 `payment_intents` `(planned)`

Cột: `id`, `tenant_id`, `checkout_session_id`, `provider`, `provider_txn_id` (UNIQUE), `amount`, `currency`, `status`, `idempotency_key`, `created_at`, `updated_at`. Không lưu dữ liệu thẻ: dùng trang thanh toán của provider, chỉ lưu `provider_txn_id`. Chi tiết ở issue `[storefront] Tích hợp thanh toán`.

---

## 5. Luồng `cart → checkout → reservation → order`

### 5.1 Trình tự

```
Shopper (Next.js storefront)
   │
   │ 1. POST /storefront.v1.CartService/AddItem    (credential: shopper JWT hoặc cart_session_token)
   ▼
storefront ── đọc giá qua port ──► deal.product / ListPublicPlans
   │                                 (internal/deal/infrastructure/product/public_pricebook.go:27)
   │ 2. INSERT cart_items (snapshot giá)
   │
   │ 3. POST /storefront.v1.CheckoutService/CreateSession  (coupon + tổng tiền)
   │ 4. POST /storefront.v1.CheckoutService/Reserve
   ▼
storefront ── Connect RPC ──► deal: ReserveStock(checkout_session_id, items)
   │                              ├─ kiểm tra AvailableStock
   │                              ├─ INSERT stock_reservations (expires_at)
   │                              └─ KHÔNG UPDATE warehouse_stocks.quantity
   │
   │ 5. POST /storefront.v1.CheckoutService/PlaceOrder
   ▼
storefront ── Connect RPC ──► deal: CommitReservation + CreateOrder
                                  ├─ UPDATE warehouse_stocks.quantity  ← CHỈ deal
                                  ├─ UPDATE stock_reservations → committed
                                  └─ tạo order trong deal
   │
   │ 6. Nhận order_id, ghi checkout_sessions.order_id, status = converted
   ▼
outbox_events ── domain event ──► conversation/customer (thông báo, timeline)
```

### 5.2 Ai ghi gì

| Bước | `storefront` ghi | `deal` ghi |
|---|---|---|
| Thêm vào giỏ | `cart_items` | — |
| Tạo phiên | `checkout_sessions`, redeem `coupons` | — |
| Giữ hàng | `checkout_sessions.status = reserved` | `stock_reservations` |
| Chốt đơn | `checkout_sessions.status = converted`, `order_id` | `warehouse_stocks.quantity`, `stock_reservations.status`, order |

### 5.3 Giải phóng khi hết TTL

Job của `deal` quét `stock_reservations WHERE status = 'held' AND expires_at < now()`:

1. `UPDATE stock_reservations SET status = 'expired'`.
2. Phát event `StockReservationExpired`.
3. `storefront` nhận event, `UPDATE checkout_sessions SET status = 'expired'` cho phiên tương ứng.
4. Cart quay về `active` để shopper thử lại.

Không có bước nào ở đây trừ tồn kho thật, vì reservation chưa bao giờ trừ tồn kho. Chỉ `Commit` mới trừ.

### 5.4 Idempotency

- `CartService/AddItem` idempotent theo `(cart_id, product_id, variant_key)`.
- `CheckoutService/Reserve` idempotent theo `reservation_key = checkout_session.id` — gọi lại không tạo reservation thứ hai.
- `CheckoutService/PlaceOrder` idempotent theo `checkout_session.id` + `status`; phiên đã `converted` trả lại `order_id` cũ, không tạo đơn thứ hai.

---

## 6. Transport & Contract

### 6.1 Proto `(planned)`

Đường dẫn: `api/proto/storefront/v1/`.

```protobuf
// Planned — chưa tồn tại
package storefront.v1;

service CartService {
  rpc GetCart(GetCartRequest) returns (GetCartResponse);
  rpc AddItem(AddItemRequest) returns (AddItemResponse);
  rpc UpdateItem(UpdateItemRequest) returns (UpdateItemResponse);
  rpc RemoveItem(RemoveItemRequest) returns (RemoveItemResponse);
}

service CheckoutService {
  rpc CreateSession(CreateSessionRequest) returns (CreateSessionResponse);
  rpc Reserve(ReserveRequest) returns (ReserveResponse);
  rpc PlaceOrder(PlaceOrderRequest) returns (PlaceOrderResponse);
}

service ShopperService {
  rpc Register(RegisterRequest) returns (RegisterResponse);
  rpc Login(LoginRequest) returns (LoginResponse);
  rpc GetProfile(GetProfileRequest) returns (GetProfileResponse);
}
```

Codegen: thêm `api/proto/storefront/` rồi chạy `buf generate`; `buf.gen.yaml` đã cấu hình sẵn `out: gen/go` và `out: gen/ts` nên không cần sửa file cấu hình.

### 6.2 Transport cho client

- **Connect RPC** duy nhất. Raw gRPC và h2c để task riêng — **không bật trong phạm vi này**.
- Lý do chấp nhận được: `pkg/httpserver/server.go:73` đang `ListenAndServe()` plaintext HTTP/1.1, Connect chạy full-duplex trên HTTP/1.1 nhưng không multiplex. Với lưu lượng storefront sprint đầu, đây là đánh đổi có ý thức.

### 6.3 Xác thực

| Đối tượng | Cơ chế | Principal |
|---|---|---|
| Shopper đã đăng ký | JWT `aud = storefront` `(planned)` | `shopper_id` |
| Guest | `cart_session_token` opaque, TTL ngắn | không có `shopper_id` |
| Hệ ngoài (đối tác) | `api_keys` + `X-API-Key` | `api_key.tenant_id` |
| Staff nội bộ | JWT `users` hiện tại | không đi qua `storefront` |

`tenant_id` bóc từ credential ở tầng `interfaces`, đẩy xuống `application` qua context — không nhận từ body.

### 6.4 Scope `(planned)`

Bổ sung vào `internal/serviceapi/domain/credential/credential.go` (hiện có `ScopeMessagesSend` `messages:send`, `ScopeLeadsAssign` `leads:assign`, `ScopeWhoAmI` `whoami` ở `:40-42`, và `ScopeHandsWrite` `agent:hands:write`, `ScopeHandsRead` `agent:hands:read` ở `:32-33`):

- `orders:write`
- `products:read`
- `stock:reserve`

---

## 7. Failure Modes

| Tình huống | Phát hiện | Hành vi mong đợi |
|---|---|---|
| Tồn kho không đủ khi `Reserve` | `deal` trả `FailedPrecondition` | `checkout_sessions.status = failed`, cart giữ nguyên, trả lỗi có mã cho UI |
| Hết TTL reservation | Job `deal` quét `expires_at < now()` | `stock_reservations → expired`, phát event, checkout `→ expired` |
| `PlaceOrder` gọi 2 lần | `checkout_session.status = converted` | Trả `order_id` cũ, không tạo đơn mới |
| Coupon hết lượt | `coupon_redemptions` vượt `max_redemptions` | Từ chối, không tạo session |
| Giá đổi giữa lúc thêm giỏ và chốt đơn | So `unit_price_snapshot` với giá hiện tại | Chênh lệch vượt ngưỡng cấu hình → `failed` với lý do `price_changed`, không âm thầm dùng giá mới |
| `deal` không phản hồi | Circuit breaker `pkg/resilience/circuit_breaker.go` | Trả `Unavailable`, không tạo reservation nửa vời |
| Guest cart hết `expires_at` | Job `storefront` quét `carts.expires_at` | `status = abandoned` |
| Trùng `email` khi đăng ký shopper | UNIQUE `(tenant_id, lower(email))` | `AlreadyExists` |
| Sai `tenant_id` do client gửi | Không có trường này trong body | Bỏ qua; luôn dùng credential |

---

## 8. Non-goals

1. **Không tạo bảng order thứ năm.** Bốn bảng order-shaped hiện có là nợ kỹ thuật, đã ghi nhận ở §1.3. Đợt này không sửa.
2. **Không UPDATE `warehouse_stocks.quantity`** từ `storefront`. Chỉ `deal`.
3. **Không bật h2c, không TLS, không nginx** trong phạm vi này.
4. **Không tách binary.** `storefront` mount trong `cmd/server`.
5. **Không đụng `omni-web-next`.** Đó là app admin nội bộ.
6. **Không làm shipment, tax engine, đa kho thông minh, loyalty point.**
7. **Không thay thế `deal`.** Pipeline, quote, pricebook, order vẫn thuộc `deal`.
8. **Không tự lưu dữ liệu thẻ** — thanh toán đi qua trang của provider, `storefront` chỉ giữ `provider_txn_id` (xem §4.7). Không làm cổng thanh toán riêng, không ví điện tử nội bộ.

---

## 9. Tài Liệu Liên Quan

- [`ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md`](./ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md) — vì sao là BC trong repo, khi nào đổi.
- [`FRONTEND-STOREFRONT-NEXTJS-SPEC.md`](./FRONTEND-STOREFRONT-NEXTJS-SPEC.md) — app riêng cho storefront (site ecom). **Lưu ý:** repo storefront chưa tồn tại; tên/stack là quyết định riêng, tài liệu chỉ ràng buộc nó gọi public API và không chứa logic nghiệp vụ.
- [`../contexts/09-storefront/README.md`](../contexts/09-storefront/README.md) — trách nhiệm, invariant, event.
- [`PAYMENT-METHODS-ADAPTER-SPEC.md`](./PAYMENT-METHODS-ADAPTER-SPEC.md) — port `Provider`, 7 phương thức thanh toán, adapter pattern, VietQR, mã đơn chuyển khoản, VAT theo tenant.
- [`BANK-EMAIL-RECONCILIATION-SPEC.md`](./BANK-EMAIL-RECONCILIATION-SPEC.md) — đối soát chuyển khoản bằng email ngân hàng (planned).
- [`STOREFRONT-COUPON-VOUCHER-SPEC.md`](./STOREFRONT-COUPON-VOUCHER-SPEC.md) — coupon/voucher/promotion, engine tính tiền, lịch sử redemption.
- [`STOREFRONT-WEBCHAT-CHANNEL-SPEC.md`](./STOREFRONT-WEBCHAT-CHANNEL-SPEC.md) — kênh `webchat`: widget trên site ecom (repo riêng), visitor session, inbound vào Conversation BC, SSE, rate limit, ranh giới repo.
- [`MODULAR-MONOLITH-TO-MICROSERVICES.md`](./MODULAR-MONOLITH-TO-MICROSERVICES.md) — điều kiện tách service.
- [`BOUNDED-CONTEXT-BC7-AIAGENT-VS-BC8-SERVICEAPI.md`](./BOUNDED-CONTEXT-BC7-AIAGENT-VS-BC8-SERVICEAPI.md) — tiền lệ loại bỏ God Context.
- [`CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md`](./CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md) — phân loại lỗi và retry.
- [`GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`](./GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md) — pitfall aggregate/CQRS/N+1.
