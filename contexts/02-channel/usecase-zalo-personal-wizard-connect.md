# Use Case Specification: Kết Nối Tài Khoản Zalo Cá Nhân (Wizard 4 Bước) & ZCA Gateway Lifecycle

> **Bounded Context:** `internal/channel`  
> **Submodule:** `internal/channel/domain/zalo` & `internal/channel/interfaces/http/zalo`  
> **Actor Chính:** Nhân viên Kinh doanh (Sales Rep) / Quản trị viên Tổ chức (Org Admin)  
> **Hệ thống liên quan:** `omni-web` (Frontend Vue 3), `omni-core` (Go Backend Clean DDD), `zca-gateway` (Node.js `zca-js` Daemon), `Zalo Platform Server`.

---

## 1. Tóm Tắt Nghiệp Vụ (Business Overview & Jobs-to-Be-Done)

### 1.1 Mục Tiêu Nghiệp Vụ
- **Job-to-Be-Done (JTBD):** Khi nhân viên kinh doanh cần tương tác, chăm sóc khách hàng và chốt đơn qua tài khoản Zalo cá nhân, họ cần liên kết tài khoản Zalo của mình vào hệ thống Omni CRM thông qua luồng Wizard 4 bước đơn giản, trực quan, bảo đảm an toàn chống checkpoint / khóa nick, và ngăn ngừa tuyệt đối việc trùng lặp tài khoản giữa các nhân viên trong tổ chức.
- **Tính năng nổi bật:**
  1. **Kiểm tra SĐT & Phân loại chủ sở hữu:** Xác thực SĐT thực trước khi quét, dùng nick hệ thống/nick live để truy vấn tên hiển thị + ảnh đại diện từ Zalo Server nhằm xác nhận đúng nick chính chủ.
  2. **Chặn trùng nick đa tầng (Anti-Duplicate & Revive):**
     - Chặn nhân viên khác kết nối nick đang thuộc quyền quản lý của đồng nghiệp.
     - Phát hiện nick đã từng kết nối trước đó (kể cả nick đã bị xóa mềm hoặc ngắt kết nối thủ công) để tái kích hoạt (Revive) phiên cũ, bảo toàn toàn bộ lịch sử hội thoại thay vì tạo record rác mới.
  3. **Truyền phát mã QR Realtime:** Khởi tạo phiên quét mã từ `zca-js` daemon, phát ảnh QR mã hóa Base64 về trình duyệt qua Socket.IO / REST payload.
  4. **Bảo mật phiên & Cách ly đường ra (SOCKS5 Sticky Proxy):** Lưu trữ cookie, IMEI, secret key được mã hóa AES-GCM-256; định tuyến toàn bộ lưu lượng của nick qua IP Proxy cố định để chống checkpoint.

---

## 2. Chi Tiết Luồng Wizard 4 Bước (Step-by-Step Flow)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  BƯỚC 1      │     │  BƯỚC 2      │     │  BƯỚC 3      │     │  BƯỚC 4      │
│  Nhập SĐT    ├────►│  Xác Nhận    ├────►│  Quét QR     ├────►│  Hoàn Tất    │
│  (Phone)     │     │  (Confirm)   │     │  (QR Scan)   │     │  (Done)      │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Bước 1: Nhập Số Điện Thoại (Step 1 — Phone Input)
- **Actor:** Người dùng nhập SĐT của nick Zalo dự kiến đăng nhập vào hệ thống.
- **Client Validation:** Kiểm tra số điện thoại hợp lệ theo định dạng Việt Nam (`10 số, bắt đầu bằng 0 hoặc +84`). Chuẩn hóa thành định dạng số thuần túy (VD: `0912345678`).
- **API Call:** `POST /api/v1/zalo-accounts/check-phone` kèm body:
  ```json
  {
    "phone": "0912345678"
  }
  ```

### Bước 2: Xác Nhận Nick & Kiểm Tra Trùng Lặp (Step 2 — Nick Confirmation & Anti-Duplicate)
- **Backend Lookup (`omni-core` ↔ `zca-gateway`):**
  1. Hệ thống tìm kiếm một **Nick Hệ Thống** (`organization.systemNotifyZaloAccountId`) hoặc một nick Zalo bất kỳ đang ở trạng thái `connected` trong cùng Tenant/Tổ chức.
  2. Nếu có nick live, backend ủy quyền cho `zca-gateway` gọi API Zalo (`api.findUser(normalizedPhone)`) để tra cứu thông tin công khai của SĐT đó.
  3. Phản hồi trả về gồm:
     - `found = true`: `displayName` (Tên hiển thị Zalo), `avatarUrl` (Ảnh đại diện), `zaloUid` (Zalo User ID toàn cầu).
     - `found = false`: SĐT chưa đăng ký Zalo hoặc bị ẩn tìm kiếm (vẫn cho phép người dùng tiếp tục nếu chắc chắn).
     - `available = false` (`reason: system_nick_unavailable`): Tổ chức chưa có nick nào online để tra cứu → Cho phép bỏ qua bước tra cứu và chuyển thẳng sang quét QR (Graceful Fallback).
- **Phân loại xử lý trùng lặp (Anti-Duplicate Decision Tree):**
  - **Trường hợp 2A — Trùng nick của nhân viên khác (`duplicate.ownedByMe === false`):**
    - Hệ thống cảnh báo đỏ: *"Nick này đang do [Tên Nhân Viên] quản lý. Bạn không thể tự kết nối. Vui lòng liên hệ chủ tổ chức để được chuyển giao."*
    - **Hành động:** Khóa nút tiếp tục, chỉ cho phép bấm "Đã hiểu" để đóng modal. Ngăn chặn tuyệt đối việc chiếm quyền nick (take-over).
  - **Trường hợp 2B — Trùng nick chính mình đang chạy (`duplicate.ownedByMe === true && duplicate.status === 'connected'`):**
    - Hệ thống thông báo: *"Nick này đang chạy trong CRM, không cần kết nối lại."*
    - **Hành động:** Chỉ cho phép đóng modal.
  - **Trường hợp 2C — Trùng nick chính mình đã ngắt/xóa mềm (`duplicate.ownedByMe === true && status !== 'connected'`):**
    - Nick đã bị ngắt thủ công (`disconnectReason === 'manual'`) hoặc đã xóa mềm vào thùng rác (`archived === true`). Phiên session cũ đã đóng.
    - Hệ thống thông báo: *"Nick này bạn đã ngắt/xóa trước đó. Cần QUÉT QR MỚI để đăng nhập lại."*
    - **Hành động:** Nút bấm hiển thị *"Quét QR mới →"*. Client sử dụng trực tiếp `accountId` cũ (`reviveAccountId`) thay vì tạo record rác mới.
  - **Trường hợp 2D — Nick hoàn toàn mới:**
    - Hiển thị tên + avatar vừa tra cứu được.
    - **Hành động:** Nút bấm hiển thị *"Xác nhận, quét QR →"*.

### Bước 3: Quét Mã QR Đăng Nhập (Step 3 — QR Code Pairing & Streaming)
- **Khởi tạo phiên QR:**
  - Client gọi `POST /api/v1/zalo-accounts` (nếu là nick mới) để tạo record ở trạng thái chờ (`status = 'qr_pending'`), hoặc dùng lại `accountId` (nếu revive).
  - Client tham gia kênh realtime Socket.IO: `socket.emit('zalo:subscribe', { accountId })`.
  - Client gọi lệnh đăng nhập: `POST /api/v1/zalo-accounts/{id}/login`.
- **Gán Proxy SOCKS5 (Egress Pool Allocation):**
  - Backend kiểm tra tài khoản đã có proxy chưa. Nếu chưa, cấp phát 1 IP Proxy SOCKS5 từ kho (`claimIdleProxy`).
  - Kiểm tra kết nối SOCKS5 (`testSocks5Proxy`). Nếu cổng proxy hỏng, loại trừ và lấy cổng khác.
- **Tiến trình sinh QR từ `zca-js` Daemon:**
  - Daemon khởi tạo instance Zalo kèm proxy được chỉ định, kích hoạt lệnh `zalo.loginQR()`.
  - **Sự kiện 0 (`QRCodeGenerated`):** Daemon nhận chuỗi QR từ server Zalo, chuyển đổi thành Data Image URL / Base64.
    - Daemon emit Socket.IO `zalo:qr` payload `{ accountId, qrImage }`.
    - Đồng thời, HTTP response `POST /login` trả về trực tiếp `qrImage` để UI hiển thị tức thì, không bị phụ thuộc vào độ trễ WebSocket.
  - **Sự kiện 1 (`QRCodeExpired`):** Mã QR hết hạn (sau ~120s). Daemon phát `zalo:qr-expired`. Nếu vượt quá số lần retry cho phép (3 lần), daemon emit `zalo:qr-session-dead` để yêu cầu user bấm "Tạo QR mới".
  - **Sự kiện 2 (`QRCodeScanned`):** Người dùng đã quét mã trên điện thoại thành công và đang chờ xác thực trên app. Daemon emit `zalo:scanned` kèm `displayName`, `avatar` của người vừa quét. Modal chuyển sang trạng thái: *"Đã quét! Đang xác nhận trên điện thoại…"*.
  - **Sự kiện 4 (`GotLoginInfo`):** Người dùng bấm "Đăng nhập" trên app Zalo điện thoại. Daemon nhận bộ credentials gồm: `cookie`, `imei`, `userAgent`.

### Bước 4: Hoàn Tất Đăng Nhập & Bảo Lưu Phiên (Step 4 — Completed & Session Guard)
- **Lưu trữ bảo mật:**
  - Daemon hoặc Core mã hóa toàn bộ `cookie` và `imei` bằng thuật toán AES-GCM-256 (khóa từ `CHANNEL_TOKEN_KEY`).
  - Cập nhật database: `status = 'connected'`, `zaloUid = ownId`, `lastConnectedAt = NOW()`, `avatarUrl`, `displayName`.
  - Gửi event Socket.IO `zalo:connected` payload `{ accountId }`.
- **Khởi động Realtime Listener & Sync:**
  - Daemon kích hoạt WebSocket listener nhận tin nhắn đến, sự kiện kết bạn và cập nhật trạng thái online.
  - Kích hoạt tiến trình đồng bộ tin nhắn gần nhất (`zalo-message-sync`) và lịch sử (`zalo-history-backfill`).
- **Giao diện chúc mừng & Cảnh báo an toàn (UI Remind):**
  - Hiển thị thông báo kết nối thành công với tên nick.
  - **CẢNH BÁO QUAN TRỌNG:** *"Nick này đã đăng nhập vào Zalo CRM. KHÔNG dùng Zalo Web (chat.zalo.me) để đăng nhập/quét nick này nữa — sẽ làm văng phiên và nick bị mất kết nối khỏi CRM."*

---

## 3. BDD Scenarios (Acceptance Criteria Specification)

### Kịch Bản 1: Kiểm tra SĐT thành công và hiển thị đúng tên nick Zalo
```gherkin
Given Nhân viên kinh doanh mở modal kết nối nick Zalo
When Nhân viên nhập số điện thoại "0987654321" và bấm "Kiểm tra"
Then Hệ thống gọi POST /api/v1/zalo-accounts/check-phone
And ZCA Gateway dùng nick hệ thống tìm kiếm thông tin trên Zalo
Then Hệ thống chuyển sang Bước 2 (Xác nhận)
And Hiển thị chính xác tên "Nguyễn Văn A" và ảnh đại diện Zalo của số điện thoại đó
And Nút bấm hiển thị "Xác nhận, quét QR →"
```

### Kịch Bản 2: Chặn kết nối khi số điện thoại thuộc nick của nhân viên khác
```gherkin
Given Số điện thoại "0912345678" đã được kết nối bởi nhân viên "Trần Thị B" trong cùng tổ chức
When Nhân viên "Nguyễn Văn A" nhập số "0912345678" và bấm "Kiểm tra"
Then Hệ thống phát hiện duplicate.ownedByMe == false
And Hiển thị cảnh báo: "Nick này đang do Trần Thị B quản lý. Bạn không thể tự kết nối."
And Nút "Xác nhận, quét QR" bị vô hiệu hóa
And Chỉ cho phép người dùng bấm "Đã hiểu" để đóng modal
```

### Kịch Bản 3: Tái kích hoạt (Revive) nick của chính mình đã ngắt kết nối
```gherkin
Given Số điện thoại "0909090909" thuộc sở hữu của nhân viên hiện tại nhưng đang ở trạng thái "disconnected" (hoặc đã xóa mềm)
When Nhân viên nhập số "0909090909" và bấm "Kiểm tra"
Then Hệ thống phát hiện duplicate.ownedByMe == true và status != "connected"
And Hiển thị thông báo: "Nick này bạn đã ngắt/xóa trước đó. Cần QUÉT QR MỚI để đăng nhập lại."
And Nút hành động hiển thị "Quét QR mới →"
When Nhân viên bấm "Quét QR mới →"
Then Hệ thống sử dụng trực tiếp accountId cũ để gọi POST /api/v1/zalo-accounts/{id}/login
And KHÔNG tạo thêm bản ghi mới trong cơ sở dữ liệu
```

### Kịch Bản 4: Sinh mã QR và xử lý các trạng thái quét mã
```gherkin
Given Nhân viên bấm xác nhận kết nối nick ở Bước 2
Then Client gọi POST /api/v1/zalo-accounts/{id}/login
And Lắng nghe phòng Socket.IO "account:{accountId}"
Then ZCA Daemon sinh mã QR thành công và gửi event "zalo:qr" kèm chuỗi Base64
And Giao diện hiển thị hình ảnh mã QR trong vòng 1 giây
When Người dùng dùng điện thoại quét mã QR
Then ZCA Daemon bắt được sự kiện "QRCodeScanned" và emit "zalo:scanned"
And Giao diện cập nhật sang "Đã quét! Đang xác nhận trên điện thoại…"
When Người dùng bấm "Đăng nhập" trên app Zalo điện thoại
Then ZCA Daemon nhận Cookie & IMEI, mã hóa AES-GCM-256 lưu vào DB
And Emit event "zalo:connected"
Then Giao diện chuyển sang Bước 4 (Hoàn tất) với lời nhắc không đăng nhập Zalo Web
```
