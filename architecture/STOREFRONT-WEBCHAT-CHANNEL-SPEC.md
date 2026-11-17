# STOREFRONT WEBCHAT CHANNEL SPEC — Chat từ website vào Conversation BC

> **Document Code:** `SPEC-STOREFRONT-WEBCHAT-001`
> **Status:** ACTIVE — đặc tả đủ để triển khai; backend issue [#1786](https://github.com/hongta0506/omni-core/issues/1786), admin issue [omni-web#257](https://github.com/hongta0506/omni-web/issues/257)
> **Liên quan:** [STOREFRONT-BC9-SPEC.md](./STOREFRONT-BC9-SPEC.md), [CHANNEL-GATEWAYS-ARCHITECTURE.md](./CHANNEL-GATEWAYS-ARCHITECTURE.md), [CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md](./CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md)

---

## 1. Mục tiêu & phạm vi

Khách đang xem site ecom bấm nút chat, nhắn cho shop, và tin nhắn **chảy vào Conversation BC** — hiện trong CRM inbox y như hội thoại Zalo/WhatsApp: cùng danh sách, cùng cửa sổ chat, cùng phân công, cùng SLA. Agent trả lời ngay tại inbox, khách nhận realtime trên site. **Không** làm hộp thư thứ hai, không lưu hội thoại ở repo khác.

### 1.1 Chủ sở hữu theo repo (chốt)

| Thành phần | Repo | Ghi chú |
|---|---|---|
| Channel adapter, visitor session, forward vào Conversation BC, SSE | `omni-core` (Go) | `internal/channel/{domain,application,infrastructure,interfaces}` |
| CRM inbox hiển thị hội thoại `webchat` + màn cấu hình widget | `omni-web` (Vue 3 + Vuetify) | admin; **không** chứa widget |
| **Widget chat + trang public của site** | **repo storefront (site ecom, repo riêng)** | chỉ gọi public API, không cần biết Conversation BC |

Ranh giới cứng: widget **không** được gọi API nội bộ/Connect RPC; chỉ 5 endpoint public ở §5. Storefront site **không** lưu tin nhắn lâu dài — nguồn sự thật là `omni-core`.

---

## 2. Hiện trạng (đã kiểm trong code)

| Thành phần | Hiện trạng trên `feat/customer-lists-archive` @ `bf27e5b3` |
|---|---|
| `channel_type` | chỉ có `zalo`, `facebook`, `telegram`, `whatsapp` — **không có** `webchat` |
| Seam inbound | `InboundEventForwarder` trong `internal/channel/application/inbound/` đã tồn tại nhưng các webhook chính thức chưa nối vào (xem [#1775](https://github.com/hongta0506/omni-core/issues/1775)); webchat phải nối **đúng seam này** |
| Endpoint chat | không có: `internal/storefront/interfaces/http/` chỉ có `cart_handler.go`, `payment_webhook_handler.go` |
| Widget trên site | chưa có (site ecom chưa tồn tại) |
| Inbox | `src/views/ChatView.vue` + `chatStore` render đa kênh, nhưng chưa có nhánh `webchat` |

---

## 3. Kiến trúc luồng

```
[Site ecom (repo riêng)]                    [omni-core]                         [omni-web admin]
  ChatWidget.vue
     │ POST /public/webchat/session
     │───────────────────────────────────►  channel/application/webchat
     │◄──────── visitor_token (cookie) ────  + webchat_sessions
     │
     │ POST /public/webchat/messages  {client_message_id, body}
     │───────────────────────────────────►  validate → rate limit → InboundEventForwarder (outbox)
     │◄──────── 202 {message_id} ──────────
     │
     │                                        outbox consumer
     │                                        └─► Conversation BC: conversations/messages
     │                                              (channel_type='webchat')
     │                                                   │
     │                                                   ├─► CRM inbox (list + detail)
     │                                                   │      agent trả lời
     │                                                   │
     │ GET /public/webchat/stream (SSE) ◄────────────────┘ outbox 'conversation.message.created'
     │◄──────── event: message ──────────────
```

Nguyên tắc: **một** đường ghi (`InboundEventForwarder` → outbox → Conversation BC), **một** đường đọc realtime (SSE từ outbox). Handler không ghi thẳng bảng `messages`.

---

## 4. Data model

```sql
-- khách vãng lai của kênh webchat
CREATE TABLE webchat_visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    channel_account_id UUID NOT NULL,
    shopper_id UUID,                       -- NULL = khách vãng lai
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent_hash VARCHAR(64),
    ip_hash      VARCHAR(64),
    country_code VARCHAR(2)
);

-- phiên giữ token, hash-at-rest
CREATE TABLE webchat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id UUID NOT NULL REFERENCES webchat_visitors (id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- idempotency inbound
CREATE TABLE webchat_inbound_receipts (
    tenant_id UUID NOT NULL,
    client_message_id VARCHAR(64) NOT NULL,
    message_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, client_message_id)
);
```

- `channel_accounts`: **đúng 1** row `channel_type='webchat'` mỗi tenant, giữ `config jsonb` (`allowed_origins[]`, `title`, `greeting`, `accent_color`, `enabled`).
- Hội thoại/tin nhắn **dùng lại** `conversations`/`messages` với `channel_type='webchat'`; `external_thread_id = webchat_visitors.id` để agent thấy đúng người.
- Không tạo bảng đơn hàng/hội thoại riêng cho webchat.

---

## 5. Public API contract

Tất cả dưới `/api/v1/public/webchat/`. Tenant resolve từ **host** (`Origin`/`Referer` khớp `allowed_origins`) hoặc `X-Webchat-Site` đã đăng ký — **không** nhận `tenant_id` từ body.

| Method | Path | Auth | Body / Query | Trả |
|---|---|---|---|---|
| POST | `/session` | origin allowlist | `{shopper_token?}` | `201 {visitorId, expiresAt}` + `Set-Cookie: wc_token=<opaque>; HttpOnly; Secure; SameSite=None; Path=/` |
| POST | `/messages` | visitor token | `{clientMessageId, body}` | `202 {messageId}` |
| GET | `/messages?after=<id>&limit=` | visitor token | `limit ≤ 50` | `{items:[{messageId, direction, body, createdAt}]}` |
| GET | `/stream` | visitor token | `Last-Event-ID` | `text/event-stream`, event `message`, heartbeat 15s |
| GET | `/chat-config?tenant=<slug>` | public | — | `{enabled, title, greeting, accentColor}` |

Bất biến:

1. `clientMessageId` là **idempotency key** (`webchat_inbound_receipts`): gửi lại → cùng `messageId`, **1** row `messages`.
2. Body tối đa **4 KB** ký tự, strip toàn bộ HTML server-side; rỗng sau strip → `422`.
3. Rate limit: **20 msg/phút/visitor**, **60 msg/phút/IP**, burst 5 → `429` + `Retry-After`.
4. Token: ≥128 bit, hash ở DB, TTL 30 ngày trượt; token của visitor A không đọc/ghi được hội thoại của visitor B (`403`).
5. SSE chỉ phát event thuộc **chính** hội thoại của visitor đó; không broadcast chéo.
6. Origin ngoài allowlist → `403`, **không** tạo row nào.
7. Cookie phải do **site ecom** set qua route handler server-side của nó (không để JS đọc token); SPA thuần thì giữ token trong memory, **cấm** `localStorage`.

---

## 6. Bảo mật & dữ liệu cá nhân

- Origin allowlist theo tenant, so khớp scheme+host+port chính xác; hỗ trợ nhiều origin (domain chính + staging).
- Không log nội dung tin nhắn ở mức `info`; chỉ log `message_id`, `visitor_id`, độ dài.
- Lưu `ip_hash`/`user_agent_hash` (không lưu raw) để chống spam mà vẫn tối thiểu PII.
- Widget **không** được gửi `shopper_id` do client tự khai; nếu khách đã đăng nhập site, site gửi `shopper_token` **đã ký** (JWT `aud=storefront`) và backend verify rồi gắn `shopper_id`.
- Retention: `webchat_sessions` hết hạn xoá theo job; `webchat_inbound_receipts` giữ 7 ngày; hội thoại theo chính sách lưu trữ chung của Conversation BC.
- Cấm render HTML: widget hiển thị `textContent`, không `v-html`/`innerHTML`.

---

## 7. Widget contract (repo storefront — site ecom)

Widget là **thành phần của site**, không phải của CRM. Hợp đồng tối thiểu:

1. **Vị trí & kích thước:** bong bóng cố định góc phải-dưới, chạm ≥ 44px; panel desktop 380×560, mobile full-screen sheet. Không che CTA/nút mua.
2. **5 trạng thái bắt buộc:** loading (3 skeleton bubble), empty (greeting + 2–3 gợi ý chip), error (bubble "Gửi thất bại — Thử lại"), active (phân biệt visitor/agent, timestamp), in-action (đang gửi, disable).
3. **Optimistic send:** hiện bubble ngay, đổi "sent" khi có `messageId`, "failed" + retry dùng **cùng** `clientMessageId`.
4. **Realtime:** `EventSource` tới `/stream`; mất kết nối → reconnect backoff (1s→2s→4s… max 30s) + banner "Đang kết nối lại…"; fallback polling `/messages?after=` mỗi 5s khi SSE fail 3 lần liên tiếp.
5. **Persistence:** giữ hội thoại qua điều hướng trang (sessionStorage giữ `after` id, token trong cookie/memory), không tạo session mới mỗi lần chuyển trang.
6. **A11y:** `role="log"`, `aria-live="polite"`, focus trap khi mở, `Esc` đóng, đọc được bằng screen reader.
7. **Không phụ thuộc thư viện nặng:** bundle widget ≤ 60 KB gzip; nếu nhúng site ngoài domain thì đóng gói Web Component để CSS không xung đột.
8. **Config-driven:** lấy `title/greeting/accentColor` từ `/chat-config`; config sai → fallback token theme, không vỡ layout.
9. **Không** dùng `localStorage` cho token; **không** gọi endpoint nội bộ; **không** gửi dữ liệu đơn hàng/thanh toán trong chat.

---

## 8. Phía agent (omni-web)

- `ChatView` thêm nhánh `webchat`: chip kênh + icon riêng, không nhân bản cửa sổ chat.
- Mọi hành vi hiện có dùng lại: phân công, takeover, unread, filter, trả lời nhanh, AI suggest.
- Trạng thái "khách đang gõ" (typing) là **nice-to-have**, không nằm trong sprint này.
- Màn cấu hình widget: bật/tắt, title, greeting, accent color, **danh sách origin cho phép** (validate scheme+host), preview.

---

## 9. Failure modes

| Tình huống | Phát hiện | Hành vi |
|---|---|---|
| Tenant chưa có `channel_accounts` webchat | lookup rỗng | `409` `webchat_not_configured`; widget ẩn nút thay vì hiện chat chết |
| Token hết hạn | `expires_at < now` | `401`; widget tự gọi `/session` lại **một** lần rồi retry |
| Trùng `clientMessageId` (client retry) | `webchat_inbound_receipts` | Trả `202` cùng `messageId`, không tạo tin thứ hai |
| Outbox chậm | độ trễ consumer | Tin đã `202`, hiện trong inbox trễ; metric `webchat_forward_lag_ms` |
| SSE chết giữa phiên | `onerror` | Reconnect backoff; sau 3 lần → polling fallback |
| Spam | rate limit | `429` + `Retry-After`; widget đếm ngược, không tạo bubble |
| Agent trả lời khi khách đã đóng tab | không có subscriber | Tin vẫn lưu; khách mở lại thấy qua `/messages?after=` |
| Origin bị đổi (domain mới) | allowlist miss | `403`; admin phải thêm origin — log `SECURITY_WEBCHAT_ORIGIN_DENIED` |

---

## 10. Non-goals

1. Không gửi file/ảnh trong chat (sprint sau; cần upload + quét virus).
2. Không video/voice call.
3. Không chatbot tự động trả lời trong kênh này ở sprint đầu (AI agent có thể bật sau qua BC7).
4. Không typing indicator, không read-receipt cho khách.
5. Không multi-tenant trên cùng 1 domain (mỗi site 1 tenant).

---

## 11. Test bắt buộc

- Idempotency: gửi 3 lần cùng `clientMessageId` → 1 row `messages`, 3 lần trả cùng `messageId`.
- Rate limit dùng clock inject, **không** `time.Sleep`.
- Origin allowlist: 4 case (đúng, sai scheme, sai port, subdomain lạ).
- SSE: 1 visitor nhận, visitor khác **không** nhận (2 client song song).
- XSS: `<script>alert(1)</script>xin chào` → lưu `xin chào`.
- Contract test cho widget (repo storefront): dùng fake server, assert optimistic send + retry cùng id + reconnect.
- Tải: 500 visitor đồng thời, 1 msg/visitor → p95 `POST /messages` < 150ms, không rơi tin.

---

## 12. Rollout

1. Feature flag theo tenant (`channel_accounts.config.enabled`), mặc định **tắt**.
2. Bật cho 1 tenant nội bộ → kiểm inbox + SSE → mở rộng.
3. Widget chỉ render khi `/chat-config` trả `enabled: true` — site không cần deploy lại để tắt.
