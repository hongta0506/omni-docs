# Channel & Gateway Bounded Context (`internal/channel`)

> Bounded Context phụ trách Quản trị và Kết nối Đa Kênh: Quản lý tài khoản mạng xã hội (Zalo Personal, Telegram, WhatsApp, Facebook), Điều phối phiên đăng nhập (QR State Machine, Session keep-alive), Nhóm chat, và Egress Proxy Pool xoay vòng IP dân cư chống checkpoint.

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/channel` |
| **Tổng số Endpoints** | **95** (Zalo Accounts 32, Zalo Groups/Labels 25, Telegram 15, Integrations 11, Admin Egress Proxy 12) |
| **Aggregate Roots** | `ChannelAccount`, `ChannelGroup`, `EgressProxy`, `ChannelIntegration` |
| **Entities con** | `ChannelSession`, `GroupMember`, `ProxyHealthRecord`, `WebhookSubscription` |
| **Value Objects** | `ChannelType` (Zalo, Telegram, WhatsApp, Facebook), `AccountStatus` (Online, Offline, Checkpoint, QR_Pending), `ProxyIPVO` |
| **Giao thức** | Connect-RPC (`channel.v1.ChannelGatewayService`), REST (`/api/v1/zalo-accounts/*`, `/api/v1/telegram-personal/*`, `/api/v1/admin/egress/*`) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`social-channels-matrix.md`](./social-channels-matrix.md) | **Đặc tả 2 Hướng Official vs Unofficial**: Ma trận đối soát Zalo (OA vs Personal), WhatsApp (Cloud vs Baileys), Telegram (Bot vs MTProto), Facebook (Graph vs Profile), Instagram (Graph vs Private API). |
| [`zalo-personal-domain-gateway-spec.md`](./zalo-personal-domain-gateway-spec.md) | **Đặc Tả Chi Tiết Zalo Personal Domain, Schema & Gateway Client RPC**: Danh bạ bạn bè, Quản lý nhóm Zalo, Quét thành viên Lead Gen, DDL PostgreSQL 5 bảng (`zalo_friends`, `zalo_groups`, `zalo_group_members`, `zalo_group_scans`, `zalo_scanned_members`) và Go RPC Interface `ZaloPersonalGatewayClient` chống mock/fake. |
| [`session-persistence-and-reconnect-spec.md`](./session-persistence-and-reconnect-spec.md) | **Đặc Tả Lưu Trữ Phiên, Fingerprint & Tự Động Reconnect**: Cơ chế lưu bộ 3 (`cookie`, `imei`, `userAgent`) chống lệch chữ ký `signkey` Zalo, mã hóa AES-256-GCM, lưu trữ khóa Baileys WhatsApp Multi-Device (Postgres/SQLite), và pipeline tự động đồng bộ `AutoSyncOnConnect`. |
| [`channel-error-handling-and-exceptions.md`](./channel-error-handling-and-exceptions.md) | **Quản Lý Lỗi & Ngoại Lệ Kênh**: Bảng tra cứu Error Codes (Meta, Zalo, Telegram), Phân loại ngoại lệ (Transient, Terminal, Security/Policy), Cơ chế Retry/DLQ, Circuit Breaker và Structured JSON Audit Log. |
| [`usecases.md`](./usecases.md) | **Đặc tả SDLC & BDD**: Danh sách User Stories (`Given / When / Then`), Đăng nhập đa giao thức, Sticky Proxy, Giới hạn tốc độ gửi tin, Điều phối kép Official/Unofficial. |
| [`usecase-zalo-personal-wizard-connect.md`](./usecase-zalo-personal-wizard-connect.md) | **Wizard Kết Nối Nick Zalo Cá Nhân 4 Bước**: Đặc tả chi tiết luồng SĐT, tra cứu nick hệ thống, chống trùng lặp đa tầng (Revive/Block), sinh & quét mã QR, và bảo vệ phiên. |
| [`usecase-whatsapp-personal-wizard-connect.md`](./usecase-whatsapp-personal-wizard-connect.md) | **Wizard Kết Nối WhatsApp Cá Nhân 4 Bước**: Đặc tả luồng E.164, pairing QR Multi-Device (`whatsmeow`), SOCKS5 Sticky Proxy, SQLite session store và History Sync. |
| [`workflows.md`](./workflows.md) | **Sơ đồ luồng & UML**: Sequence Diagram điều phối tin nhắn Inbound/Outbound, State Machine phiên kết nối, Flowchart phân luồng Official vs Unofficial. |
| [`test-matrix.md`](./test-matrix.md) | **Ma trận kiểm thử**: Test Scenarios từ Sticky Proxy Binding, Token Bucket Rate Limiting, HMAC Verification, đến Jitter Outbound Delay. |
| [`architecture/CHANNEL-GATEWAYS-ARCHITECTURE.md`](../../architecture/CHANNEL-GATEWAYS-ARCHITECTURE.md) | Kiến trúc chi tiết các Channel Gateways: Zalo Personal sidecar, Telegram MTProto, WhatsApp Gateway, Egress Proxy Pool. |

---

## 3. Danh Mục Endpoints Chính (95 Routes)

### 3.1 Zalo Personal Accounts (32 routes)
* `GET /api/v1/zalo-accounts`: Danh sách nick Zalo theo tenant và phân quyền nhân viên.
* `POST /api/v1/zalo-accounts/qr`: Khởi tạo phiên quét mã QR đăng nhập mới.
* `GET /api/v1/zalo-accounts/:id/qr-status`: Polling / SSE trạng thái quét QR (`PENDING`, `SCANNED`, `CONFIRMED`, `EXPIRED`).
* `POST /api/v1/zalo-accounts/:id/relogin`: Kích hoạt kết nối lại phiên đăng nhập đã lưu session token.
* `DELETE /api/v1/zalo-accounts/:id`: Hủy đăng nhập và xóa thông tin phiên.
* `PUT /api/v1/zalo-accounts/:id/proxy`: Gán IP proxy dân cư cố định cho tài khoản Zalo.
* `POST /api/v1/zalo-accounts/:id/sync-friends`: Lệnh đồng bộ danh bạ bạn bè từ Zalo về Core.

### 3.2 Zalo Groups & Labels (25 routes)
* `GET/POST /api/v1/zalo-groups`: Quản lý danh sách nhóm chat của từng tài khoản.
* `POST /api/v1/zalo-groups/:id/members`: Thêm/xóa thành viên nhóm.
* `GET/POST /api/v1/zalo-labels`: Quản lý nhãn phân loại nội bộ Zalo.

### 3.3 Telegram Personal & MTProto (15 routes)
* `POST /api/v1/telegram-personal/send-code`: Yêu cầu gửi OTP đăng nhập Telegram.
* `POST /api/v1/telegram-personal/verify-code`: Xác thực OTP và khởi tạo session MTProto.
* `GET /api/v1/telegram-personal/dialogs`: Lấy danh sách hội thoại Telegram.

### 3.4 Admin Egress Proxy Pool (12 routes)
* `GET/POST /api/v1/admin/egress/proxies`: Quản trị pool proxy dân cư (SOCKS5/HTTP).
* `POST /api/v1/admin/egress/proxies/health-check`: Kiểm tra độ trễ và độ sạch IP (IP fraud score).
* `POST /api/v1/admin/egress/rotate`: Xoay IP proxy cho tài khoản khi gặp checkpoint.

---

## 4. Invariants & Nghiệp Vụ Cốt Lõi

1. **Proxy Binding Invariant**:
   - Một tài khoản cá nhân (Zalo/Telegram) khi hoạt động BẮT BUỘC gắn với 1 Proxy IP cố định trong cùng 1 session để tránh bị nền tảng gắn cờ truy cập bất thường (IP flapping).
2. **Rate Limit & Concurrency**:
   - Mỗi tài khoản Zalo chỉ xử lý 1 outbound message request tại 1 thời điểm; delay tối thiểu giữa các lệnh gửi là 15 giây.
3. **Session Auto-Refresh**:
   - Khi token phiên của Zalo hết hạn hoặc socket disconnect, gateway tự động kích hoạt backoff reconnect tối đa 3 lần trước khi đánh dấu tài khoản là `OFFLINE_AUTH_REQUIRED` và thông báo tới người dùng.

---

## 5. Thành Phần Dùng Chung & Phụ Thuộc (Shared & Dependencies)

### 5.1 Thành phần dùng chung nội bộ (Internal BC Common)
- `internal/channel/domain/errors.go`: Sentinel errors (`ErrAccountDisconnected`, `ErrProxyUnavailable`, `ErrRateLimitExceeded`, `ErrSessionExpired`).
- `internal/channel/application/common/`:
  - `session_pool.go`: In-memory gateway session state pool cho goroutines quản lý kết nối Zalo/Telegram/WhatsApp.
  - `rate_limiter.go`: Outbound throttle & jitter controller cho các tài khoản channel.
  - `pagination.go`: AccountFilter, ProxyFilter DTOs.
- `internal/channel/interfaces/http/`: Phân nhóm gateway riêng (`zalo/`, `telegram/`, `whatsapp/`, `admin/egress/`).

### 5.2 Thành phần phụ thuộc dùng chung toàn hệ thống (Cross-BC Shared Kernel)
- `pkg/context/`: TenantID context extraction.
- `pkg/events/`: Publish Domain Events (`ChannelAccountConnectedEvent`, `ChannelMessageReceivedEvent`, `ChannelAccountDisconnectedEvent`) qua Outbox.
- `pkg/pagination/`: PageRequest, PageResponse chuẩn hóa.
- `pkg/errors/`: System error codes & HTTP/RPC status mapper.

