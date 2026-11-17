# PAYMENT METHODS & ADAPTER SPEC — Storefront (BC 9)

> **Document Code:** `SPEC-STOREFRONT-PAYMENT-001`
> **Status:** ACTIVE — sprint hiện tại chỉ implement **bank transfer (VietQR)**; các phương thức còn lại là `planned`.
> **Audience:** AI Coding Agents; Backend (Go — `omni-core`); Frontend **Vue 3 + Vuetify + Pinia** (`omni-web`, admin CRM AI và storefront widget). Không dùng Next.js cho phạm vi này.
> **Liên quan:** [STOREFRONT-BC9-SPEC.md](./STOREFRONT-BC9-SPEC.md) §4.7, §6.3; [BANK-EMAIL-RECONCILIATION-SPEC.md](./BANK-EMAIL-RECONCILIATION-SPEC.md).

---

## 1. Mục tiêu & phạm vi

Storefront phải bán được hàng **trước khi** có cổng thanh toán. Sprint này chỉ cần một đường: form checkout → tạo đơn → khách chuyển khoản → shop xác nhận. Mọi phương thức khác **không được hard-code**: chúng phải cắm vào cùng một port để mỗi phương thức mới là **một file adapter + một dòng config**, không phải sửa domain/application.

Nguyên tắc: **domain sở hữu hợp đồng, adapter sở hữu giao thức.**

- Port: `internal/storefront/domain/payment/provider.go` — đã tồn tại, **không đổi shape** trừ khi thêm method có default.
- Adapter hiện có: `internal/storefront/infrastructure/payment/vnpay.go` (VNPay hosted page).
- Adapter mới sprint này: `internal/storefront/infrastructure/payment/banktransfer.go`.
- Adapter `planned`: momo, zalopay, stripe, paypal, atm-card (qua gateway nội địa).

---

## 2. Trạng thái từng phương thức

| Phương thức | `provider` value | QR | Redirect | Callback | Trạng thái |
|---|---|---|---|---|---|
| Chuyển khoản ngân hàng (VietQR) | `bank_transfer` | VietQR do ta sinh | Không | Không (đối soát qua email — xem spec riêng) | **Sprint này** |
| VNPay | `vnpay` | Cổng tự sinh | Có | `GET /storefront/payment/callback` | Đã có |
| Momo | `momo` | Momo trả về `qrCodeUrl` | Có (app-to-app) | `POST /storefront/payment/callback/momo` | planned |
| ZaloPay | `zalopay` | ZaloPay trả về `qr_code` | Có | `POST /storefront/payment/callback/zalopay` | planned |
| Stripe (card quốc tế) | `stripe` | Không | Có (Checkout Session) | `POST /storefront/payment/callback/stripe` (webhook, verify `Stripe-Signature`) | planned |
| PayPal | `paypal` | Không | Có (approve link) | `POST /storefront/payment/callback/paypal` | planned |
| ATM / thẻ nội địa | `atm_card` | Không | Có (cổng nội địa) | Theo cổng | planned |
| COD (thu hộ) | `cod` | Không | Không | Không | planned (nếu cần) |

Bảng này là **nguồn sự thật duy nhất** cho `payment_intents.provider`. Thêm phương thức = thêm dòng + adapter + config key.

---

## 3. Port contract (không phá vỡ)

```go
type Provider interface {
    Name() string                                        // giá trị ghi vào payment_intents.provider
    CreateCheckoutURL(req CheckoutRequest) (string, error) // "" nếu phương thức không redirect
    VerifyCallback(params map[string]string) (*Event, error) // verify chữ ký TRƯỚC khi đọc field
    QueryTransaction(ctx context.Context, providerTxnID string) (*Event, error)
    Refund(ctx context.Context, providerTxnID string, amountMinor int64) error
}
```

Quy ước bắt buộc cho mọi adapter:

1. `Name()` trả về **đúng** giá trị trong bảng §2 — đây là khóa dispatch, không được đổi.
2. `CreateCheckoutURL` **không được** gọi mạng (trừ khi gateway yêu cầu tạo session server-side như Stripe); nếu gọi mạng thì phải bọc `pkg/resilience.ExecuteWithRetry`.
3. `VerifyCallback` phải verify chữ ký/HMAC **trước** khi parse bất kỳ field nào; sai chữ ký → `ErrSignatureInvalid`, không log payload thô.
4. `QueryTransaction` là đường đối soát khi callback không tới — dùng bởi reconcile worker (`application/payment/reconcile_worker.go`).
5. `Refund` idempotent theo `providerTxnID` + `amountMinor`: gọi 2 lần không hoàn 2 lần.
6. Adapter **không** được đọc DB, không biết tenant, không log số tài khoản/token.

### 3.1 Adapter bank transfer

```go
type BankTransfer struct{ cfg BankTransferConfig }

type BankTransferConfig struct {
    BankBIN     string // mã BIN ngân hàng theo chuẩn VietQR, vd 970436
    AccountNo   string
    AccountName string
    Template    string // "compact2" | "qr_only" | "print"
    TransferPrefix string // tiền tố nội dung CK, vd "OMNI"
}
```

- `CreateCheckoutURL` trả `""` — không có trang thanh toán của provider.
- Adapter trả về **instruction payload** (không phải URL):

```json
{
  "method": "bank_transfer",
  "bankBin": "970436",
  "accountNo": "0123456789",
  "accountName": "CONG TY TNHH OMNI",
  "amountMinor": 250000000,
  "currency": "VND",
  "transferContent": "OMNI DH2411170001",
  "orderCode": "DH2411170001",
  "qrPayload": "00020101021238570010A00000072701270006970436...",
  "qrImageUrl": "/api/v1/public/storefront/qr/DH2411170001.svg",
  "expiresAt": "2026-11-17T18:45:00Z"
}
```

- `VerifyCallback` **luôn** trả `ErrSignatureInvalid`: phương thức này không có callback. Đối soát đi qua [BANK-EMAIL-RECONCILIATION-SPEC.md](./BANK-EMAIL-RECONCILIATION-SPEC.md) hoặc admin xác nhận tay.

### 3.2 QR generation (VietQR / EMVCo)

- Dùng chuẩn **EMVCo QR** với `A000000727` (NAPAS), field 38 = merchant info (BIN + số TK), field 53 = `704` (VND), field 54 = số tiền, field 62-08 = nội dung CK.
- Sinh payload **ở server**, trả về `qrPayload` (chuỗi EMV) và `qrImageUrl` (SVG sinh từ payload). **Không** gọi dịch vụ ảnh bên thứ ba.
- `qrPayload` deterministic theo `(bankBin, accountNo, amountMinor, transferContent)` — cùng input thì cùng payload, để test so sánh byte.
- Nội dung CK bị giới hạn **25 ký tự** với nhiều ngân hàng, không dấu, không khoảng trắng: `<PREFIX><ORDER_CODE>`. Vì vậy `order_code` phải ngắn và không dấu (§4).
- Số tiền: VND, hệ `minor units` = đồng (không có phần lẻ). Không cho `amountMinor <= 0`.

---

## 4. Mã đơn & nội dung chuyển khoản

`order_code` là khóa đối soát **con người đọc được** và **máy parse được**:

```
DH + YYMMDD + 4 ký tự base32 (không I/O/0/1) của UUID
ví dụ: DH2411170001, DH24111700A7
```

Bất biến:

1. `order_code` unique trong `(tenant_id)` — có DB constraint.
2. `order_code` **không đổi** sau khi tạo; mọi xác nhận thanh toán trỏ vào nó.
3. Nội dung CK gửi cho khách = `<PREFIX><order_code>`, tổng ≤ 25 ký tự ASCII.
4. Parser đối soát phải chấp nhận: khoảng trắng thừa, chữ thường, có/không prefix, và nội dung bị ngân hàng cắt cụt — **match trên `order_code` sau khi normalize và uppercase**, không match cả chuỗi.

---

## 5. Vòng đời `payment_intent` / đơn

```
 (tạo đơn)                 (khách chuyển tiền)            (đối soát)
 pending_payment ──────────────────────────────────► paid
       │                                               ▲
       │ quá hạn (mặc định 24h)                       │ admin xác nhận tay
       ▼                                               │
   expired / cancelled ──────── khách CK lại ──────────┘ (tạo intent mới, giữ order_code)
```

- Mỗi lần khách bấm "Tôi đã chuyển" chỉ tạo **ghi nhận chờ**, không đổi trạng thái.
- `paid` chỉ được set bởi: (a) đối soát email khớp, (b) admin bấm xác nhận, (c) callback provider có chữ ký hợp lệ.
- Một `order_code` có thể có **nhiều payment_intent** (khách chuyển thiếu rồi chuyển bù) — tổng `paid` phải bằng hoặc vượt tổng đơn; thiếu thì `partially_paid` (planned).
- Mọi chuyển trạng thái ghi `logger.LogAudit` với `action_taken` = `STORE_PAYMENT_<FROM>_TO_<TO>`.

---

## 6. VAT — cấu hình theo tenant

Hiện tại VAT đang hard-code: `internal/deal/domain/quote/plan_price.go:6` (`VATPercent8 = 8`) và `quote.go:14` chỉ cho `0, 8, 10`. Storefront **không** được theo pattern hard-code đó.

- Cấu hình theo tenant: `vat_percent` (int), `vat_inclusive` (bool), `vat_rounding` (`half_up` | `floor`).
- Thứ tự tính **bắt buộc**: `subtotal → discount (coupon/voucher) → VAT → shipping (nếu có) → total`.
- Nếu `vat_inclusive = true`: giá đã gồm VAT → `total = net`, `vatAmount` chỉ để hiển thị hoá đơn; nếu `false`: `total = net + net*rate`.
- Mọi đơn phải **snapshot** `vat_percent`, `vat_amount_minor`, `vat_inclusive` tại thời điểm đặt — đổi config sau đó không làm thay đổi đơn cũ.
- Làm tròn: áp dụng **một lần** trên tổng, không làm tròn từng dòng (tránh lệch 1 đồng khi so tổng).
- Đổi VAT của tenant phải ghi audit `STORE_VAT_CONFIG_UPDATED` kèm before/after.

---

## 7. Config ở admin CRM AI

Bảng `payment_method_configs` (mới), một row / `(tenant_id, provider)`:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | NOT NULL |
| `provider` | varchar(32) | §2 |
| `is_enabled` | bool | bật/tắt theo tenant |
| `is_default` | bool | tối đa 1 row / tenant (partial unique index) |
| `display_name` | varchar(64) | "Chuyển khoản ngân hàng" |
| `sort_order` | int | thứ tự hiển thị ở checkout |
| `config` | jsonb | thông số riêng từng provider (bank BIN, account, prefix, public key...) |
| `secret_ref` | text | **trỏ tới** secret, không chứa secret |
| `created_at/updated_at` | timestamptz | |

Bất biến bảo mật:

- Secret (hash secret, API key, private key) **không** nằm trong `config`; chỉ nằm trong secret store, bảng giữ `secret_ref`.
- API đọc config trả về `config` đã **redact** (số TK hiển thị 4 số cuối), không bao giờ trả `secret_ref` giá trị thật.
- Mọi thay đổi cấu hình ghi `logger.LogAudit` `STORE_PAYMENT_CONFIG_UPDATED` với diff đã redact.
- Tắt một provider đang có intent `pending` **không** được xóa intent; chỉ ngăn tạo intent mới.

API (REST, staff JWT):

```
GET    /api/v1/storefront/payment-methods            → list (kèm is_enabled)
PUT    /api/v1/storefront/payment-methods/{provider} → upsert config (redacted response)
GET    /api/v1/public/storefront/payment-methods?tenant=... → chỉ method bật + field công khai (cho checkout)
```

---

## 7.1 UI surfaces (Vue — `omni-web`)

Mọi màn hình quản trị nằm trong `omni-web` (Vue 3 + Vuetify + Pinia), **không** phải app Next.js:

| Màn hình | View | Store | API service |
|---|---|---|---|
| Cấu hình phương thức thanh toán | `src/views/StorefrontPaymentView.vue` | `src/stores/storefront-payment.ts` | `src/api/storefront-payment.ts` |
| Cấu hình VAT | tab trong `StorefrontPaymentView.vue` (hoặc `StorefrontVatView.vue`) | dùng chung store trên | dùng chung service trên |
| Danh sách & xác nhận đơn chuyển khoản | `src/views/StoreOrdersView.vue` | `src/stores/store-orders.ts` | `src/api/store-orders.ts` |
| Trang hoàn tất cho khách (public) | `src/views/public/StoreOrderStatusView.vue` (route công khai, không auth) | — | `src/api/public-store-order.ts` |

Quy ước UI bắt buộc: 5 state (Loading skeleton, Empty, Error thật kèm Retry, Active dạng bảng dày, In-action disable + spinner), phân trang server-side `page`/`limit`, không mock data, không hiển thị `secret_ref`.

## 8. Failure modes

| Tình huống | Phát hiện | Hành vi mong đợi |
|---|---|---|
| Provider bị tắt giữa chừng | `is_enabled = false` | `CreateIntent` → `FailedPrecondition` "method_disabled"; intent cũ vẫn đối soát được |
| Callback sai chữ ký | `ErrSignatureInvalid` | Ack theo contract provider, log `SECURITY_PAYMENT_SIGNATURE_INVALID`, không đổi trạng thái |
| Callback đến 2 lần | `provider_txn_id` unique | Lần 2 no-op, trả 200 |
| Callback đến trước khi client quay về | reconcile/verify độc lập | Đơn vẫn `paid`; trang kết quả poll `GetIntent` |
| Số tiền chuyển thiếu | so `amountMinor` với `order.total_minor` | `partially_paid`, không auto `paid`, vào review queue |
| Config ngân hàng thiếu | `bank_bin`/`account_no` rỗng | `bank_transfer` bị coi là chưa bật; checkout **không** hiện phương thức này thay vì hiện QR sai |
| VAT config đổi giữa 2 lần đặt | snapshot trên đơn | Đơn cũ giữ VAT cũ |

---

## 9. Non-goals (đợt này)

1. Không lưu số thẻ, không làm cổng thanh toán riêng, không ví điện tử nội bộ.
2. Không tự động chuyển `paid` từ email trong sprint này — flow đó nằm ở [BANK-EMAIL-RECONCILIATION-SPEC.md](./BANK-EMAIL-RECONCILIATION-SPEC.md).
3. Không làm multi-currency: chỉ VND, `minor = đồng`.
4. Không làm "trả sau" / COD cho tới khi có yêu cầu nghiệp vụ.
5. Không làm hoàn tiền tự động qua bank transfer (chỉ VNPay/gateway mới có `Refund` API).

---

## 10. Test bắt buộc

- **Contract test dùng chung**: một bảng `[]Provider` chạy cùng bộ assert (`Name()` non-empty, `VerifyCallback` reject chữ ký sai, `Refund` idempotent) để thêm adapter mới không lệch hợp đồng.
- **QR golden test**: input cố định → payload EMVCo đúng byte, và `order_code` 25-ký-tự limit được assert.
- **VAT test**: 3 tổ hợp (`inclusive/exclusive` × `0/8/10`) × làm tròn biên (±1 đồng).
- **Idempotency test**: cùng `provider_txn_id` × 3 lần → 1 trạng thái, 0 panic.
- Không test nào được gọi mạng thật; provider dùng `httptest`.
