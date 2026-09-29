# Đặc Tả Nghiệp Vụ Chi Tiết: Channel & Gateway Bounded Context (95 Endpoints)

> **Bounded Context:** `internal/channel`  
> **Phạm vi quản lý:** Quản lý kết nối tài khoản mạng xã hội đa kênh (Zalo Personal, Telegram MTProto, WhatsApp Personal/Official WABA, Facebook Fanpage), Quản lý nhóm Zalo & kiểm duyệt (Groups & Moderation), Đồng bộ danh bạ/bạn bè (Friends Sync), Egress Proxy Pool quản trị IP chống checkpoint, và Webhook tích hợp đa nền tảng.

---

## 1. Domain Model, Aggregates & Invariants (Quy Tắc Bất Biến Nghiệp Vụ)

### 1.1 Aggregate Root: `ChannelAccount`
- **Các loại tài khoản hỗ trợ (`ChannelType`):** `zalo_personal`, `telegram_personal`, `whatsapp_personal`, `whatsapp_official`, `facebook_page`.
- **Trạng thái tài khoản (`AccountStatus`):** `initializing`, `waiting_qr`, `connected`, `disconnected`, `checkpointed`, `archived`.
- **Invariants:**
  1. **IP Egress Binding Sticky:** Mỗi tài khoản mạng xã hội cá nhân (đặc biệt là Zalo Personal và WhatsApp Web daemon) bắt buộc phải gắn cố định với một Dedicated Proxy IP (`egress_proxy_id`). Không được tự ý đổi IP egress giữa các phiên kết nối trừ khi có lệnh Rebind tường minh của Admin để chống Zalo/Meta phát hiện đăng nhập bất thường và khóa nick.
  2. **Concurrency Worker per Account:** Mỗi tài khoản `connected` chạy độc lập trong một Go worker goroutine (hoặc daemon process sidecar) kèm theo circuit breaker riêng. Lỗi mất kết nối của một tài khoản không bao giờ được ảnh hưởng tới các tài khoản khác cùng Tenant.
  3. **Auto Health-Check & Reconnect:** Heartbeat định kỳ 30 giây một lần. Nếu mất kết nối (`disconnected`), cơ chế tự kết nối lại kích hoạt với Exponential Backoff (1s, 2s, 4s, tối đa 30s). Sau 5 lần retry thất bại, chuyển trạng thái sang `checkpointed` hoặc `disconnected` và gửi thông báo khẩn qua WebSocket/Telegram thông báo cho nhân viên quản trị.

### 1.2 Entity: `QRSession` (Quét Mã Đăng Nhập)
- **Invariants:**
  1. Mã QR chỉ có thời hạn tồn tại tối đa 120 giây (TTL = 120s). Quá thời hạn này, phiên QR tự động hủy (`expired`).
  2. Vòng đời QR: `created` -> `scanned` (khách đã dùng app quét mã) -> `confirmed` (khách bấm Xác nhận trên điện thoại) -> `authenticated` (đã trích xuất Cookie/Token thành công) hoặc `expired`/`rejected`.
  3. Khi hoàn tất xác thực, Cookie/Session Keys phải được mã hóa AES-256-GCM trước khi lưu vào DB, không bao giờ lưu trữ plain-text session token.

### 1.3 Aggregate Root: `ZaloGroup` & Moderation
- **Invariants:**
  1. Một tài khoản Zalo chỉ có thể kiểm duyệt/quét thành viên của những nhóm mà tài khoản đó là thành viên hoặc quản trị viên (Admin/Owner).
  2. Tác vụ quét danh sách thành viên nhóm lớn (lên tới 1000 người) bắt buộc phải chạy dưới dạng background job qua queue với rate-limit (tối đa 20 thành viên/giây) để tránh bị Zalo rate-limit API 429 hoặc checkpoint tài khoản.

---

## 2. Chi Tiết Nghiệp Vụ & BDD Cho Từng Phân Hệ Endpoints

### 2.1 Phân Hệ Zalo Personal Accounts (32 Endpoints)

#### EP 01-05: Khởi Tạo Session QR & Kết Nối Tài Khoản
- **GET `/api/v1/zalo-accounts`**:
  - **Nghiệp vụ:** Trả về danh sách tất cả nick Zalo được phân quyền cho user hiện tại (hoặc toàn bộ nick trong Tenant nếu là Admin/Manager). Đi kèm thông tin trạng thái live, proxy đang gắn, số lượng bạn bè, số nhóm đang tham gia.
- **POST `/api/v1/zalo-accounts/qr`**:
  - **Nghiệp vụ:** Khởi tạo tiến trình đăng nhập QR. Hệ thống chọn một IP proxy khả dụng từ Egress Proxy Pool, khởi tạo daemon giả lập Zalo client, sinh mã QR code dạng Base64 Data URL kèm theo `session_id`.
  - **BDD Scenario:**
    - *Given:* Tenant còn chỉ tiêu kết nối nick Zalo theo gói dịch vụ (Plan quota).
    - *When:* Gửi POST tới `/api/v1/zalo-accounts/qr`.
    - *Then:* Trả về HTTP 201, ảnh QR base64, `session_id`, thời gian hết hạn 120s, bắn sự kiện `qr_ready` qua WebSocket.
- **GET `/api/v1/zalo-accounts/{id}/qr-status`**:
  - **Nghiệp vụ:** Thăm dò trạng thái quét mã (polling fallback nếu WebSocket bị gián đoạn).
- **POST `/api/v1/zalo-accounts/{id}/relogin`**:
  - **Nghiệp vụ:** Kích hoạt đăng nhập lại bằng session cookie đã lưu mà không cần quét lại mã QR (nếu cookie còn hạn).
- **DELETE `/api/v1/zalo-accounts/{id}`**:
  - **Nghiệp vụ:** Đăng xuất nick Zalo, hủy phiên websocket daemon, xóa cookie cache khỏi RAM, giải phóng proxy liên kết.

#### EP 06-10: Quản Lý Hồ Sơ & Trạng Thái Nick
- **POST `/api/v1/zalo-accounts/{id}/archive` & `/restore`**: Lưu trữ nick (tạm dừng hoạt động nhưng không xóa dữ liệu tin nhắn/bạn bè cũ) và khôi phục hoạt động.
- **GET `/api/v1/zalo-accounts/{id}/profile`**: Lấy thông tin chi tiết hồ sơ Zalo: Tên hiển thị, avatar, ngày sinh, số điện thoại, giới tính, trạng thái tài khoản.
- **PUT `/api/v1/zalo-accounts/{id}/profile`**: Cập nhật bio hoặc trạng thái trực tuyến.
- **GET `/api/v1/zalo-accounts/{id}/status-logs`**: Lịch sử kết nối, ngắt kết nối, lỗi mạng, thời điểm xuất hiện checkpoint.

#### EP 11-15: Quản Lý Bạn Bè & Đồng Bộ Danh Bạ
- **POST `/api/v1/zalo-accounts/{id}/sync-friends`**:
  - **Nghiệp vụ:** Đưa job cào danh sách bạn bè vào hàng đợi bất đồng bộ. Tự động mapping bạn bè Zalo với bảng `contacts` của Customer Bounded Context theo số điện thoại hoặc Zalo UID.
- **GET `/api/v1/zalo-accounts/{id}/friends-db`**: Xem danh sách bạn bè đã được đồng bộ vào database cục bộ (hỗ trợ tìm kiếm theo tên, tag, phân trang).
- **POST `/api/v1/zalo-accounts/{id}/friends/request`**: Gửi lời mời kết bạn tới một số điện thoại hoặc Zalo UID kèm tin nhắn chào hỏi. Kiểm tra giới hạn: tối đa 50 lời mời/ngày/nick để tránh spam ban.
- **POST `/api/v1/zalo-accounts/{id}/friends/accept`**: Chấp nhận lời mời kết bạn gửi đến.
- **DELETE `/api/v1/zalo-accounts/{id}/friends/{fId}`**: Xóa bạn bè hoặc hủy lời mời kết bạn.

#### EP 16-20: Cấu Hình Tự Động & Tin Nhắn Nhanh Của Nick
- **GET & PUT `/api/v1/zalo-accounts/{id}/auto-reply-settings`**: Bật/tắt chế độ tự động trả lời khi nhận tin nhắn mới từ người lạ, ngoài giờ làm việc.
- **GET & PUT `/api/v1/zalo-accounts/{id}/proxy-binding`**: Cấu hình gán nick cố định vào proxy cụ thể.
- **GET `/api/v1/zalo-accounts/{id}/quotas`**: Thống kê số lượng tin nhắn, lời mời kết bạn đã gửi trong ngày so với ngưỡng an toàn.

#### EP 21-25: Phân Quyền Nhân Viên Phụ Trách Nick
- **GET `/api/v1/zalo-accounts/{id}/assignees`**: Danh sách nhân viên (users) được phép xem và nhắn tin bằng nick Zalo này.
- **POST `/api/v1/zalo-accounts/{id}/assignees`**: Gán quyền truy cập nick cho nhân viên hoặc toàn bộ một phòng ban.
- **DELETE `/api/v1/zalo-accounts/{id}/assignees/{userId}`**: Thu hồi quyền sử dụng nick của nhân viên.
- **GET `/api/v1/zalo-accounts/shared-inbox`**: Danh sách hộp thư gom chung các nick mà nhân viên đang trực.
- **POST `/api/v1/zalo-accounts/switch-active-chat`**: Ghi nhận nhân viên đang mở hội thoại cụ thể để tránh 2 nhân viên cùng chat trùng một khách.

#### EP 26-32: Quản Lý Tag & Phân Loại Cục Bộ Của Zalo (Zalo Labels)
- **GET `/api/v1/zalo-accounts/{id}/labels`**: Lấy danh sách nhãn màu phân loại gốc từ Zalo.
- **POST `/api/v1/zalo-accounts/{id}/labels`**: Tạo nhãn phân loại mới trên Zalo.
- **PUT & DELETE `/api/v1/zalo-accounts/{id}/labels/{lId}`**: Đổi tên, đổi màu và xóa nhãn Zalo.
- **POST `/api/v1/zalo-accounts/{id}/labels/assign`**: Gán nhãn Zalo cho một hội thoại hoặc người dùng.
- **POST `/api/v1/zalo-accounts/{id}/labels/unassign`**: Tháo nhãn khỏi hội thoại.
- **POST `/api/v1/zalo-accounts/{id}/labels/sync`**: Đồng bộ cây nhãn từ server Zalo về Omni.

---

### 2.2 Phân Hệ Zalo Groups & Moderation (25 Endpoints)

#### EP 33-37: Quản Lý Nhóm & Thành Viên
- **GET `/api/v1/zalo-accounts/{id}/groups`**: Danh sách các nhóm Zalo mà nick này đang tham gia.
- **GET `/api/v1/zalo-accounts/{id}/groups/{gId}`**: Chi tiết nhóm: số lượng thành viên, link mời, danh sách phó nhóm/trưởng nhóm.
- **POST `/api/v1/zalo-accounts/{id}/groups/create`**: Tạo nhóm Zalo mới: đặt tên, ảnh nhóm, danh sách bạn bè mời tham gia ban đầu.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/invite`**: Mời thêm thành viên vào nhóm (bằng UID hoặc gửi qua số điện thoại).
- **DELETE `/api/v1/zalo-accounts/{id}/groups/{gId}/members/{mId}`**: Xóa/Kick thành viên vi phạm khỏi nhóm (yêu cầu nick là Admin của nhóm).

#### EP 38-42: Quét Thành Viên & Cào Data Nhóm (Group Scan)
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/scan`**:
  - **Nghiệp vụ:** Kích hoạt quét toàn bộ danh sách thành viên nhóm, lấy Tên, Avatar, UID Zalo, chức vụ trong nhóm. Đẩy job vào worker để tránh block request HTTP.
- **GET `/api/v1/zalo-accounts/{id}/groups/{gId}/scan-status`**: Kiểm tra tiến độ quét (% hoàn thành, số lượng thành viên đã lưu).
- **GET `/api/v1/zalo-accounts/{id}/groups/{gId}/members`**: Danh sách thành viên nhóm đã quét xong, hỗ trợ tìm kiếm, lọc theo người chưa kết bạn.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/batch-add-friends`**: Đặt lịch kết bạn tự động với các thành viên trong nhóm (giãn cách ngẫu nhiên 30-90 giây/lần kết bạn).
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/leave`**: Rời khỏi nhóm Zalo.

#### EP 43-47: Cài Đặt Nhóm & Kiểm Duyệt Tin Nhắn Tự Động
- **PUT `/api/v1/zalo-accounts/{id}/groups/{gId}/settings`**: Bật/tắt chế độ duyệt thành viên mới, khóa quyền chat của thành viên (chỉ trưởng/phó nhóm được chat).
- **PUT `/api/v1/zalo-accounts/{id}/groups/{gId}/name`**: Đổi tên nhóm.
- **PUT `/api/v1/zalo-accounts/{id}/groups/{gId}/avatar`**: Đổi ảnh đại diện nhóm.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/pin-message`**: Ghim tin nhắn hoặc thông báo quan trọng lên đầu nhóm.
- **DELETE `/api/v1/zalo-accounts/{id}/groups/{gId}/pin-message`**: Tháo ghim tin nhắn.

#### EP 48-52: Bảng Tin Nhóm & Lịch Sử Hoạt Động
- **GET `/api/v1/zalo-accounts/{id}/groups/{gId}/topics`**: Lấy danh sách ghi chú, bình chọn (polls) của nhóm.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/polls`**: Tạo cuộc thăm dò ý kiến/bình chọn trong nhóm.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/polls/{pId}/vote`**: Bỏ phiếu bình chọn.
- **GET `/api/v1/zalo-accounts/{id}/groups/{gId}/activity-logs`**: Lịch sử người vào/ra nhóm, người đổi tên, tin nhắn vi phạm bị xóa.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/transfer-owner`**: Chuyển quyền Trưởng nhóm cho thành viên khác.

#### EP 53-57: Quản Trị Nhóm Nâng Cao
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/assign-deputy`**: Bổ nhiệm phó nhóm.
- **DELETE `/api/v1/zalo-accounts/{id}/groups/{gId}/assign-deputy/{mId}`**: Cách chức phó nhóm.
- **GET `/api/v1/zalo-accounts/{id}/groups/{gId}/pending-members`**: Danh sách người xin vào nhóm đang chờ duyệt.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/approve-member`**: Phê duyệt người vào nhóm.
- **POST `/api/v1/zalo-accounts/{id}/groups/{gId}/reject-member`**: Từ chối người xin vào nhóm.

---

### 2.3 Phân Hệ Egress Proxy Pool, Telegram, WhatsApp & Integrations (38 Endpoints)

#### EP 58-64: Quản Trị Proxy Xuất Trạm (Egress Proxy Pool)
- **GET `/api/v1/admin/egress/proxies`**: Danh sách toàn bộ proxy IP trong pool: IP, Port, Loại (`HTTP`/`SOCKS5`), Quốc gia, ISP, Trạng thái (`alive`, `dead`, `slow`), Nick đang gán.
- **POST `/api/v1/admin/egress/proxies`**: Thêm proxy mới vào hệ thống (hỗ trợ nhập đơn hoặc import hàng loạt dạng `ip:port:user:pass`).
- **POST `/api/v1/admin/egress/proxies/test`**: Kiểm tra tốc độ ping, IP xuất trạm thực tế và độ ổn định kết nối của proxy.
- **POST `/api/v1/admin/egress/proxies/{id}/rebind`**: Đổi proxy gắn cho một tài khoản Zalo/WhatsApp khi proxy cũ bị chết hoặc mạng chập chờn.
- **DELETE `/api/v1/admin/egress/proxies/{id}`**: Xóa proxy khỏi hệ thống (chặn xóa nếu đang có nick active sử dụng).
- **GET `/api/v1/admin/egress/proxies/stats`**: Thống kê băng thông tiêu thụ và tỷ lệ sống của proxy pool.
- **POST `/api/v1/admin/egress/proxies/auto-assign`**: Tự động phân bổ các proxy khỏe nhất cho các nick chưa có proxy.

#### EP 65-71: Telegram Personal MTProto
- **GET `/api/v1/telegram-personal/accounts`**: Danh sách tài khoản Telegram cá nhân đã kết nối.
- **POST `/api/v1/telegram-personal/login/phone`**: Nhập số điện thoại quốc tế để gửi mã xác thực Telegram.
- **POST `/api/v1/telegram-personal/login/code`**: Nhập mã OTP Telegram gửi về app để đăng nhập. Nếu có mật khẩu 2 bước (2FA), yêu cầu nhập thêm `two_fa_password`.
- **DELETE `/api/v1/telegram-personal/{id}`**: Đăng xuất tài khoản Telegram, chấm dứt phiên MTProto client.
- **GET `/api/v1/telegram-personal/{id}/dialogs`**: Đồng bộ danh sách hội thoại và channel Telegram.
- **POST `/api/v1/telegram-personal/{id}/sync-contacts`**: Đồng bộ danh bạ từ Telegram sang hệ thống.
- **GET `/api/v1/telegram-personal/{id}/status`**: Kiểm tra kết nối socket MTProto đến Data Center của Telegram.

#### EP 72-80: WhatsApp Personal & WhatsApp Cloud API (WABA)
- **GET `/api/v1/whatsapp-personal/accounts`**: Danh sách các số WhatsApp Web đã đăng nhập.
- **POST `/api/v1/whatsapp-personal/qr`**: Khởi tạo phiên quét mã QR đăng nhập WhatsApp Web.
- **GET `/api/v1/whatsapp-personal/{id}/qr-status`**: Kiểm tra trạng thái quét mã WhatsApp.
- **POST `/api/v1/whatsapp-personal/{id}/reconnect`**: Kết nối lại phiên WhatsApp Web đã lưu.
- **DELETE `/api/v1/whatsapp-personal/{id}`**: Hủy kết nối số WhatsApp.
- **GET `/api/v1/whatsapp-official/webhook`**: Xác thực Webhook của Meta Cloud API (`hub.challenge`, `hub.verify_token`).
- **POST `/api/v1/whatsapp-official/webhook`**: Nhận sự kiện tin nhắn đến, trạng thái đã gửi/đã đọc từ Meta Cloud API.
- **POST `/api/v1/whatsapp-official/templates/sync`**: Đồng bộ danh sách tin nhắn mẫu (HSM Templates) đã được Meta phê duyệt.
- **POST `/api/v1/whatsapp-official/messages/send-template`**: Gửi tin nhắn mẫu thông báo chính thức có tính phí theo chính sách của WhatsApp Business.

#### EP 81-88: Facebook Messenger & Instagram Direct
- **GET `/api/v1/integrations/facebook/oauth`**: Tạo đường dẫn cấp quyền Facebook OAuth đăng nhập quản trị Fanpage.
- **POST `/api/v1/integrations/facebook/callback`**: Nhận mã auth code từ Facebook, đổi Long-Lived User Access Token và lấy danh sách Fanpage.
- **GET `/api/v1/integrations/facebook/pages`**: Danh sách Page mà tài khoản có quyền quản trị.
- **POST `/api/v1/integrations/facebook/pages/subscribe`**: Đăng ký nhận webhook nhắn tin từ Fanpage vào hệ thống Omni.
- **DELETE `/api/v1/integrations/facebook/pages/{pageId}/unsubscribe`**: Hủy liên kết Fanpage.
- **GET `/api/v1/integrations/facebook/webhook`**: Endpoint verify webhook từ Facebook Developers.
- **POST `/api/v1/integrations/facebook/webhook`**: Nhận webhook real-time tin nhắn khách gửi Fanpage Facebook & Instagram.
- **POST `/api/v1/integrations/facebook/sync-conversations`**: Cào lại lịch sử tin nhắn cũ của Page.

#### EP 89-95: Webhook Mở Rộng & Gateway Health Status
- **GET `/api/v1/channel/gateways/health`**: Kiểm tra tình trạng hoạt động của toàn bộ các Gateway Sidecar (Zalo Daemon, Telegram MTProto, WABA Worker).
- **POST `/api/v1/channel/gateways/restart-sidecar`**: Khởi động lại một container gateway sidecar đang bị treo hoặc mất kết nối mạng.
- **GET `/api/v1/channel/webhooks/incoming-logs`**: Lịch sử nhận webhook từ tất cả các nhà mạng xã hội (phục vụ đối soát sự cố miss tin nhắn).
- **POST `/api/v1/channel/webhooks/retry`**: Chạy lại các webhook event bị xử lý lỗi.
- **GET `/api/v1/channel/metrics/latency`**: Độ trễ trung bình của các gateway khi nhận và gửi tin nhắn (ms).
- **POST `/api/v1/channel/emergency/disconnect-all`**: Nút dừng khẩn cấp: ngắt kết nối toàn bộ nick nếu phát hiện tài khoản công ty bị rà quét hoặc tấn công diện rộng.
- **GET `/api/v1/channel/settings/limits`**: Xem các giới hạn an toàn tin nhắn trong ngày của từng kênh.

---

## 3. Ma Trận Observability, Logging & Exception Chuẩn

| Nhóm Ngoại Lệ | Danh Sách Lỗi Kỹ Thuật / Domain | Phân Loại `pkg/errors` | Hành Động Hệ Thống | Event Log `pkg/logger` |
|---|---|---|---|---|
| **Mất kết nối** | Session cookie hết hạn, Nick bị logout từ xa | `CodeUnauthorized` (Terminal) | Đổi status `disconnected`, báo user quét QR lại | `CHANNEL_SESSION_EXPIRED` |
| **Bị checkpoint** | Zalo yêu cầu xác minh bạn bè/ngày sinh | `CodeForbidden` (SecurityPolicy) | Dừng gửi tin ngay lập tức, báo động khẩn | `CHANNEL_NICK_CHECKPOINTED` |
| **Proxy Egress** | Proxy timeout, chết socket, IP bị blacklist | `CodeInternal` (Transient) | Tự động chuyển fallback proxy dự phòng | `CHANNEL_PROXY_FAILED` |
| **Giới hạn Rate-limit**| Quá số tin nhắn gửi trong ngày (Spam limit) | `CodeInvalidInput` (Transient) | Tạm dừng hàng đợi gửi tin, dời lịch sau | `CHANNEL_RATE_LIMITED` |
| **Webhook lỗi** | Chữ ký HMAC SHA256 không hợp lệ (Meta/Zalo) | `CodeForbidden` (SecurityPolicy) | Từ chối request 403, ghi nhận log bảo mật | `CHANNEL_WEBHOOK_INVALID_SIGNATURE` |
| **Độ trễ cao** | Thời gian phản hồi gateway > 2000ms | Cảnh báo nội bộ | Ghi log độ trễ để Ops theo dõi | `CHANNEL_GATEWAY_HIGH_LATENCY` |
