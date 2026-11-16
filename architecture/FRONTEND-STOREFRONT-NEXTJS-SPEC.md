# FRONTEND STOREFRONT (Next.js) — Đặc Tả Kiến Trúc App Bán Hàng Công Khai

> **Mã tài liệu:** `SPEC-FE-STOREFRONT`
> **Đối tượng:** app Next.js **riêng**, phục vụ shopper bên ngoài.
> **Trạng thái:** PLANNED — chưa có repo, chưa có route. Mọi route và component trong tài liệu này là `(planned)`.
> **KHÔNG liên quan `omni-web-next`.** `omni-web-next` là app admin nội bộ cho staff; đợt này không đụng vào.
> **Quy tắc ngôn ngữ:** Tiếng Việt. Route, tên file, tên service giữ nguyên tiếng Anh.

---

## 1. Bối Cảnh

`omni-web-next` là app Next.js 16.4.3 (`package.json`) cho **nhân viên nội bộ**, giao tiếp backend qua REST `axios` với `baseURL: '/api/v1'` (`src/api/client.ts:20-21`), build `output: "standalone"` và bật `cacheComponents: true` (`next.config.ts:4-10`).

Storefront là **app thứ hai**, cùng framework nhưng khác hoàn toàn về đối tượng, xác thực, SEO và chiến lược cache. Gộp chung sẽ khiến mọi guard của admin trở thành rào cản với shopper, và mọi route công khai trở thành lỗ hổng của admin.

---

## 2. Khác Biệt Với `omni-web-next`

| Trục | `omni-web-next` (admin) | Storefront `(planned)` |
|---|---|---|
| **Audience** | Nhân viên có tài khoản trong bảng `users` | Shopper trong `shopper_accounts`, và **guest chưa đăng nhập** |
| **Auth principal** | `pkg/auth.UserClaims` (`pkg/auth/claims.go:20`) — `UserID`, `TenantID`, `Role`, `Permissions` | Shopper claims riêng, `aud = storefront`, **không** mang `Role`/`Permissions` của staff |
| **Nơi giữ token** | `localStorage` — `getStoredToken()` tại `src/api/client.ts:23-26` | **Server-side session only.** Browser không bao giờ thấy access token |
| **Transport** | REST `axios` tới `/api/v1` | **Connect** với client sinh từ `gen/ts/storefront/v1/` |
| **Tenant** | `getStoredTenantId()` gửi kèm header | Suy ra từ credential ở server; **không** có trong request body, không có trong URL |
| **SEO** | Không cần — app sau đăng nhập | **Bắt buộc** — sản phẩm phải index được, có metadata, có sitemap |
| **Cache** | `cacheComponents: true`, dữ liệu riêng tư theo user | Catalog cache công khai; cart và checkout **tuyệt đối không cache** |
| **Rendering** | Client-heavy sau đăng nhập | Server Components là mặc định; client chỉ cho tương tác |
| **Đăng ký** | Admin tạo user | Shopper tự đăng ký, cần verify email |
| **Rủi ro bảo mật** | Lộ token admin = lộ toàn bộ CRM | Lộ token shopper = lộ một giỏ hàng của một người |

---

## 3. Dùng `gen/ts` + Connect

### 3.1 Nguồn sinh

`omni-core-clean/buf.gen.yaml` đã cấu hình sẵn 2 plugin TypeScript:

```yaml
- remote: buf.build/connectrpc/es:v1.4.0
  out: gen/ts
  opt: target=ts
- remote: buf.build/bufbuild/es:v2.0.0
  out: gen/ts
  opt: target=ts
```

Sau khi thêm `api/proto/storefront/v1/storefront.proto` và chạy `buf generate`, ta có:

```
gen/ts/storefront/v1/storefront_pb.ts        # message types (bufbuild/es)
gen/ts/storefront/v1/storefront_connect.ts   # service descriptors (connectrpc/es)
```

Đặt cạnh các BC đã có: `gen/ts/deal/v1/deal_connect.ts`, `gen/ts/service/v1/service_api_connect.ts`.

### 3.2 Cách nối vào app

App không copy `gen/ts` bằng tay. Chọn một trong hai, cố định một lần:

- **Cách A — package nội bộ:** publish `gen/ts` thành package `@omni/gen` và import `@omni/gen/storefront/v1/storefront_connect`.
- **Cách B — copy có kiểm soát:** script `prebuild` rsync `omni-core-clean/gen/ts/storefront/` vào `src/gen/storefront/`, có CLAUDE/AGENTS ghi rõ "không sửa tay".

Khuyến nghị **Cách A**, vì `gen/ts` là hợp đồng giữa hai repo và copy tay sẽ trôi phiên bản.

### 3.3 Không dùng REST cho storefront

Lý do: các endpoint storefront cần đúng một hợp đồng typed cho cả hai chiều, và `gen/ts` đã có sẵn hạ tầng. Viết thêm một tầng `axios` song song là hai nguồn sự thật cho cùng một API.

Ngoại lệ: ingress callback của payment provider (public webhook) là HTTP thuần, không đi qua Connect, và nằm hoàn toàn phía server. Nó không bao giờ được gọi từ browser.

---

## 4. Server-Side Token

### 4.1 Nguyên tắc

Access token của shopper **chỉ** tồn tại trong:

1. Cookie `httpOnly`, `Secure`, `SameSite=Lax`, path `/`.
2. Bộ nhớ của Next.js server (route handler / Server Component / Server Action).

Không có `localStorage`. Không có token trong RSC payload. Không có token trong URL.

Đây là khác biệt có chủ đích so với admin: `src/api/client.ts:23-26` đọc token từ `localStorage`, chấp nhận được cho app nội bộ sau VPN/đăng nhập, **không** chấp nhận được cho một trang công khai nơi XSS là bề mặt thật.

### 4.2 Luồng đăng nhập

```
Browser  ── POST /api/session/login ──►  Next route handler
                                          │
                                          ├─ gọi Connect ShopperService/Login
                                          │   (server → omni-core, không qua browser)
                                          ├─ nhận accessToken + refreshToken
                                          ├─ Set-Cookie: shopper_sid (httpOnly)  ← access
                                          ├─ Set-Cookie: shopper_rid (httpOnly)  ← refresh
                                          └─ trả { ok: true }, KHÔNG trả token
Browser  ── GET /cart ──►  RSC đọc cookie, gắn Authorization, gọi Connect, render HTML
```

### 4.3 Guest

Guest không có token, chỉ có `cart_session_token` opaque do server phát. Token đó cũng nằm trong cookie `httpOnly` và có TTL ngắn; hết TTL thì cart `status = abandoned`.

### 4.4 Refresh

Refresh xảy ra ở server, không ở browser. Khi Connect trả `Unauthenticated`, route handler thử refresh một lần rồi phát lại request; thất bại thì xoá cookie và trả về trạng thái chưa đăng nhập. Không có vòng refresh phía client.

---

## 5. Cart Server-Side

### 5.1 Vì sao không giữ cart ở client

Giỏ hàng phải sống qua nhiều thiết bị, nhiều tab, và qua lúc đăng nhập/đăng xuất. Giữ ở Zustand + `localStorage` sẽ sinh ra 3 nguồn sự thật: local state, `localStorage`, và `carts` trong DB — cùng một lỗi đã gặp ở admin với `localDb`/Dexie.

**Quyết định:** giỏ hàng là dữ liệu server, không phải dữ liệu client.

### 5.2 Hệ quả thiết kế

| Thao tác | Cách làm |
|---|---|
| Đọc giỏ | Server Component gọi `CartService/GetCart`, render thẳng HTML |
| Thêm / sửa / xoá | Server Action → gọi Connect → `revalidatePath('/cart')` |
| Đếm số món trên header | Lấy cùng lần đọc giỏ, truyền xuống layout; không có fetch riêng |
| Optimistic update | Chỉ dùng `useOptimistic` cho phản hồi tức thời, nhưng nguồn sự thật vẫn là server |

### 5.3 Cache

- `GET /cart` và mọi route checkout: **`force-dynamic`**, không cache, không `cacheComponents`.
- Catalog (`/`, `/p/[slug]`, danh mục): cache được, nhưng theo tenant. Dùng `revalidate` ngắn và tag theo `product_id`.
- Tuyệt đối không để catalog cache rò rỉ giỏ hàng: cart không bao giờ nằm trong cùng một cache entry với catalog.

---

## 6. Route Map `(planned)`

| Route | Rendering | Auth | Connect call | Ghi chú |
|---|---|---|---|---|
| `/` | Server, cache | Public | — | Trang chủ, danh mục nổi bật |
| `/p/[slug]` | Server, cache + revalidate | Public | — | Chi tiết sản phẩm; metadata + JSON-LD |
| `/c/[slug]` | Server, cache | Public | — | Danh mục |
| `/search` | Server, dynamic | Public | — | Theo `searchParams` |
| `/cart` | Server, **dynamic** | Guest hoặc shopper | `CartService/GetCart` | Nguồn sự thật của giỏ |
| `/checkout` | Server, **dynamic** | Bắt buộc shopper | `CheckoutService/CreateSession` | Không cho guest vào |
| `/checkout/payment` | Server, **dynamic** | Bắt buộc shopper | `PaymentService/CreateIntent` | Redirect sang trang thanh toán của provider |
| `/checkout/success/[id]` | Server, **dynamic** | Bắt buộc shopper | `CheckoutService/GetSession` | Idempotent theo session id |
| `/login` | Server shell + client form | Public | `ShopperService/Login` | Form là client, token do server giữ |
| `/register` | Server shell + client form | Public | `ShopperService/Register` | Verify email |
| `/account` | Server, **dynamic** | Bắt buộc shopper | `ShopperService/GetProfile` | |
| `/account/orders` | Server, **dynamic** | Bắt buộc shopper | — | Đọc từ `deal`, hiển thị read-only |

### 6.1 Route handler nội bộ

| Handler | Mục đích |
|---|---|
| `POST /api/session/login` | Đăng nhập, set cookie httpOnly |
| `POST /api/session/logout` | Xoá cookie |
| `POST /api/session/refresh` | Refresh phía server |
| `POST /api/cart/items` | Server Action nhận, chuyển sang Connect |
| `POST /api/checkout/place` | Server Action chốt đơn |

Không có route handler nào trả về access token trong body.

### 6.2 SEO bắt buộc

- `generateMetadata` cho `/p/[slug]` và `/c/[slug]`.
- `sitemap.ts` và `robots.ts` ở cấp app.
- `JSON-LD` cho sản phẩm: `@type: Product`, `offers.price`, `offers.availability` — `availability` phải suy từ `AvailableStock`, không phải từ `warehouse_stocks.quantity` thô.

---

## 7. Chất Lượng & Ràng Buộc

1. **5-state machine** cho mọi màn hình: loading (skeleton đúng layout), empty, error (kèm Retry), active, in-action.
2. **Không mock fallback.** API lỗi thì hiện lỗi thật, không render dữ liệu giả.
3. **Không `img src=""`.** Luôn `src={url || undefined}` và chỉ render khi URL không rỗng.
4. **List > 50 phần tử phải windowing.**
5. **≤ 10 `useState` và ≤ 500 dòng mỗi component.**
6. **Không parse nặng trong render** — parse ở tầng nạp.
7. **WCAG AA**: contrast ≥ 4.5:1, không `text-slate-400` trên nền trắng.
8. **`pnpm exec tsc --noEmit` và `pnpm run build` phải pass.**

---

## 8. Non-goals

1. Không sửa `omni-web-next`.
2. Không dùng chung `src/` với `omni-web-next`.
3. Không ship access token ra browser, dưới bất kỳ hình thức nào.
4. Không bật payment trong sprint này.
5. Không làm PWA, offline mode, app mobile trong đợt này.

---

## 9. Tài Liệu Liên Quan

- [`STOREFRONT-BC9-SPEC.md`](./STOREFRONT-BC9-SPEC.md) — ranh giới BC, bảng dữ liệu, luồng nghiệp vụ.
- [`FRONTEND-NEXTJS-ARCHITECTURE-SPEC.md`](./FRONTEND-NEXTJS-ARCHITECTURE-SPEC.md) — chuẩn chung Next.js của Omni Platform.
- [`../contexts/09-storefront/README.md`](../contexts/09-storefront/README.md) — trách nhiệm và invariant.
