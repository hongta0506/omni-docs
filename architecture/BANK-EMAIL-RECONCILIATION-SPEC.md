# BANK EMAIL RECONCILIATION SPEC — Đối soát chuyển khoản bằng email

> **Document Code:** `SPEC-STOREFRONT-BANK-RECON-001`
> **Status:** NOTED / PLANNED — **chưa implement**. Sprint hiện tại chỉ có bank transfer + admin xác nhận tay.
> **Liên quan:** [PAYMENT-METHODS-ADAPTER-SPEC.md](./PAYMENT-METHODS-ADAPTER-SPEC.md) §4, §5.

---

## 1. Vì sao cần

Bank transfer không có callback. Ngân hàng **gửi email biến động số dư** cho chủ tài khoản. Đọc email đó là cách duy nhất để tự động chuyển `pending_payment → paid` mà không phải bấm tay từng đơn.

Flow mục tiêu:

```
[Bank] --email--> [Ingest] --parse--> [Candidate] --match--> [Confirm] --> order.paid
```

---

## 2. Nguồn ingest

Hai đường, **cùng một parser**:

1. **IMAP poll** (mặc định): worker đọc hộp thư chuyên dụng (`orders@`), `UNSEEN`, lọc theo sender domain ngân hàng, rồi `\Seen` sau khi ingest. Không xóa mail.
2. **Forward webhook**: ngân hàng/MSP forward mail vào `POST /api/v1/internal/bank-email` (HMAC). Dùng khi IMAP không khả dụng.

Bất biến ingest:

- `Message-ID` là khóa idempotency; ingest lại cùng `Message-ID` → no-op (`UNIQUE (tenant_id, message_id)`).
- Không bao giờ tin toàn bộ body: chỉ trích các field theo parser, lưu `raw_hash` để tra cứu sau.
- Email vào hàng đợi `bank_email_events`; **không** đổi trạng thái đơn trong transaction ingest.

---

## 3. Parser

Mỗi ngân hàng một template (subject + body regex), versioned trong DB (`bank_email_templates`), không hard-code:

```
provider: "vcb" | "tcb" | "mb" | "acb" | "tpbank" | ...
sender_pattern: "no-reply@vietcombank.com.vn"
subject_pattern: "Biến động số dư"
amount_pattern:    "(?i)(\\+|ghi có|credit).*?([\\d\\.]+)\\s*(VND|đ)"
content_pattern:   "(?i)(nội dung|diễn giải|description)\\s*:?\\s*(?P<content>.+)"
```

Trích ra: `amount_minor`, `currency`, `transfer_content`, `bank_txn_ref`, `received_at`.

Chuẩn hoá nội dung CK (bắt buộc, theo [PAYMENT §4](./PAYMENT-METHODS-ADAPTER-SPEC.md)):
`uppercase → bỏ dấu → bỏ khoảng trắng/ký tự đặc biệt → tìm `(PREFIX)?DH\d{6}[A-Z0-9]{4}``.

Không match được → `status = 'unmatched'` + vào review queue, **không** đoán.

---

## 4. Matching

| Bước | Rule | Nếu fail |
|---|---|---|
| 1 | `order_code` parse được từ content | `unmatched` → review |
| 2 | Đơn tồn tại và thuộc tenant của tài khoản nhận | `unmatched` (log `SECURITY_ORDER_TENANT_MISMATCH`) |
| 3 | Đơn đang `pending_payment` hoặc `partially_paid` | `ignored` (đã paid/expired) |
| 4 | `amount >= order.total_minor` | `partially_paid` + review, **không** auto paid |
| 5 | `bank_txn_ref` chưa từng dùng | `UNIQUE` chặn → `duplicate` |

Kết quả ghi vào `bank_email_events.status`: `unmatched` | `matched` | `partially_paid` | `ignored` | `duplicate`.

---

## 5. Confirm

```
BEGIN;
  UPDATE storefront_orders SET status='paid', paid_at=now() WHERE id=$1 AND status='pending_payment';
  INSERT INTO outbox_events(... 'store.order.paid' ...);
  UPDATE bank_email_events SET status='matched', order_id=$1 WHERE id=$2;
COMMIT;
```

- Một transaction: đổi đơn + outbox + cập nhật event. Không có trạng thái nửa vời.
- `store.order.paid` được consumer dùng để: gửi mail xác nhận cho khách, đẩy sang `deal` (nếu bật), thông báo cho agent trong CRM.
- Idempotent: chạy lại cùng `bank_email_event` không tạo outbox thứ hai (`UNIQUE (aggregate_id, event_type)`).
- Audit: `logger.LogAudit` `STORE_ORDER_PAID_BY_EMAIL` với `order_code`, `bank_txn_ref`, `amount_minor`, `match_confidence`.

---

## 6. Review queue (admin CRM AI)

- Đơn `partially_paid` / event `unmatched` hiện trong màn hình "Đối soát chuyển khoản".
- Admin có 3 hành động: **Gán vào đơn** (chọn order_code), **Đánh dấu không liên quan**, **Tạo đơn mới từ giao dịch này**.
- Mỗi hành động ghi audit + lý do (free text bắt buộc với 2 hành động sau).
- Danh sách có phân trang `?page=&page_size=`, filter theo `status`, `bank`, khoảng thời gian.

---

## 6.1 UI surfaces (Vue — `omni-web`)

| Màn hình | View | Store | API service |
|---|---|---|---|
| Hàng chờ đối soát (`unmatched`/`partially_paid`/`ambiguous`) | `src/views/BankReconciliationView.vue` | `src/stores/bank-reconciliation.ts` | `src/api/bank-reconciliation.ts` |
| Chi tiết một giao dịch + 3 hành động | drawer trong view trên (`v-navigation-drawer`) | dùng chung store | dùng chung service |

Bắt buộc: mọi hành động gán/đánh dấu đều qua `v-dialog` xác nhận, có ô lý do bắt buộc với "Không liên quan" và "Tạo đơn mới". Không hiển thị số tài khoản đầy đủ — chỉ 4 số cuối.

## 7. Idempotency & an toàn

1. Email `Message-ID` unique; `bank_txn_ref` unique.
2. Không auto-paid nếu: amount thiếu, tenant lệch, đơn đã expired, content mơ hồ (match > 1 order_code).
3. Nếu 1 email chứa nhiều giao dịch (sao kê) → tách thành nhiều event, mỗi event idempotent riêng.
4. Không log số tài khoản đầy đủ / OTP / token trong email; mask về 4 số cuối.
5. Email giả mạo: chỉ chấp nhận sender khớp `sender_pattern` **và** (khuyến nghị) `Authentication-Results: spf=pass dkim=pass`. Fail → `quarantined`, không vào matching.
6. Giới hạn: 1 worker xử lý tuần tự theo `received_at` để tránh race giữa 2 email cùng đơn.

---

## 8. Failure modes

| Tình huống | Phát hiện | Hành vi |
|---|---|---|
| IMAP down | connect error | Retry backoff, metric `bank_email_poll_failed`, alert sau 3 lần |
| Template mới của ngân hàng | parse fail 100% trong 10 mail | Alert + tự chuyển `unmatched`, không nuốt mail |
| Email thiếu nội dung CK | content rỗng | `unmatched` + review |
| Hai khách cùng nội dung CK (gõ sai) | 2 order_code cùng match | `ambiguous` → review, không auto paid |
| Đơn đã expired khi tiền về | status = expired | `paid_late` → review, admin quyết định hoàn tiền hoặc mở lại đơn |
| Email trùng sau khi restore DB | `Message-ID` unique | no-op |

---

## 9. Non-goals

1. Không đọc email cá nhân của nhân viên — chỉ hộp thư chuyên dụng của tenant.
2. Không OCR ảnh biên lai khách gửi (planned riêng).
3. Không tự hoàn tiền khi `paid_late`.
4. Không hỗ trợ đa tiền tệ.

---

## 10. Việc phải làm khi implement (checklist cho issue tương lai)

- [ ] Migration `bank_email_events`, `bank_email_templates` (idempotency + index theo `received_at`).
- [ ] Parser theo template versioned, có test golden với mail mẫu từng ngân hàng.
- [ ] IMAP worker + forward webhook dùng chung parser.
- [ ] Matching service thuần (không I/O) để test bảng §4.
- [ ] Confirm transaction + outbox `store.order.paid`.
- [ ] Review queue API + admin UI.
- [ ] Metrics: `bank_email_ingested`, `bank_email_matched`, `bank_email_unmatched`, `bank_email_parse_failed`.
