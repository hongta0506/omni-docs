# Telegram Personal Full Feature Specification (Parity with Zalo Personal)

> **Bounded Context:** `internal/channel` (Channel & Gateway)  
> **Driver:** Native Go In-Process MTProto Client (`github.com/gotd/td`)  
> **Mục tiêu:** Định nghĩa toàn bộ ma trận tính năng của Telegram Personal đạt chuẩn tương đương Zalo Personal (Accounts, Dialogs/Contacts, Groups/Channels, Scrape/Leadgen, Realtime Listener & Sync Worker), phục vụ CRM Omnichannel và loại bỏ hoàn toàn mock code.

---

## 1. So Sánh Tổng Quan Đối Trọng Zalo vs Telegram

| Nhóm Nghiệp Vụ | Zalo Personal (`pkg/zcago`) | Telegram Personal (`gotd/td`) |
|---|---|---|
| **Xác thực / Đăng nhập** | Quét QR qua cookie & session key | Quét QR (`auth.NewQR()`) + Nhập mã xác thực/2FA |
| **Quản lý Tài khoản** | Danh sách nick Zalo, Proxy SOCKS5, Uptime | Danh sách nick Telegram, SOCKS5 Proxy, Uptime, DC Info |
| **Realtime Inbound** | WebSocket event listener (`onMessage`, `onReaction`) | MTProto `telegram.Options.UpdateHandler` (`UpdateNewMessage`) |
| **Sync Lịch sử Tin nhắn** | `ZaloSyncWorker` qua NSQ theo chunk + progress bar | `TelegramSyncWorker` qua NSQ (`messages.getHistory`) + progress bar |
| **Danh bạ / Đối thoại** | `ChannelFriend` / Bạn bè Zalo, tìm qua SĐT | Telegram Dialogs / Contacts (`contacts.getContacts`), tìm qua Username/Phone |
| **Nhóm & Kênh** | Zalo Group (Thành viên, Phó nhóm, Link mời) | Telegram Supergroup / Channel (`channels.getParticipants`), Link mời |
| **Cào Lead / Khai thác** | Group Scan cào thành viên đẩy sang Lead Pool | Group/Channel Member Scraper đẩy sang Lead Pool |
| **Outbound / Gửi tin** | Outbound Dispatcher với Jitter 3s-7s | Outbound Dispatcher với Jitter 3s-7s + FloodWait Auto-Cooldown |

---

## 2. Toàn Bộ API Contract Chi Tiết (Parity Matrix)

### 2.1 Quản lý Tài khoản & Phiên Đăng nhập (Accounts & Session Lifecycle)

| Method | Route | Mô tả nghiệp vụ MTProto |
|---|---|---|
| `GET` | `/api/v1/telegram-personal/accounts` | Danh sách tài khoản Telegram theo tenant (Pragmatic CQRS DTO) |
| `POST` | `/api/v1/telegram-personal/accounts/init` | Khởi tạo tài khoản với SOCKS5 Sticky Proxy |
| `GET` | `/api/v1/telegram-personal/accounts/{id}/qr` | Xuất mã QR đăng nhập MTProto (`tg://login?token=...`) |
| `POST` | `/api/v1/telegram-personal/accounts/{id}/2fa` | Nhập mật khẩu 2FA (nếu tài khoản bật Two-Step Verification) |
| `POST` | `/api/v1/telegram-personal/accounts/{id}/reconnect` | Tái kết nối MTProto session từ encrypted session DB |
| `DELETE` | `/api/v1/telegram-personal/accounts/{id}` | Hủy phiên, đóng TCP connection, giải phóng SOCKS5 proxy |
| `GET` | `/api/v1/telegram-personal/accounts/{id}/health` | Kiểm tra ping DC, trạng thái session, quota còn lại trong ngày |

### 2.2 Quản lý Hội thoại & Danh bạ (Dialogs & Contacts)

| Method | Route | Mô tả nghiệp vụ MTProto |
|---|---|---|
| `GET` | `/api/v1/telegram-personal/accounts/{id}/dialogs` | Lấy danh sách hội thoại gần nhất (`messages.getDialogs`) |
| `GET` | `/api/v1/telegram-personal/accounts/{id}/contacts` | Lấy danh bạ Telegram (`contacts.getContacts`) |
| `POST` | `/api/v1/telegram-personal/accounts/{id}/contacts/sync` | Kích hoạt đồng bộ danh bạ từ Telegram về cơ sở dữ liệu |
| `POST` | `/api/v1/telegram-personal/accounts/{id}/contacts/search`| Tìm người dùng theo `@username` hoặc SĐT (`contacts.resolveUsername`) |
| `POST` | `/api/v1/telegram-personal/contacts/{id}/ensure-conversation` | Đảm bảo hội thoại tồn tại trong Bounded Context `conversation` |
| `POST` | `/api/v1/telegram-personal/contacts/{id}/promote-lead` | Đưa contact vào Customer Lead Pool (score = 10, status = 'lead') |

### 2.3 Quản lý Nhóm & Kênh (Groups & Channels)

| Method | Route | Mô tả nghiệp vụ MTProto |
|---|---|---|
| `GET` | `/api/v1/telegram-personal/accounts/{id}/groups` | Lấy danh sách Group/Supergroup/Channel đã tham gia |
| `GET` | `/api/v1/telegram-personal/accounts/{id}/groups/{gid}` | Chi tiết nhóm (tên, avatar, tổng thành viên, quyền admin) |
| `GET` | `/api/v1/telegram-personal/accounts/{id}/groups/{gid}/members` | Lấy danh sách thành viên nhóm (`channels.getParticipants`) |
| `POST` | `/api/v1/telegram-personal/accounts/{id}/groups/join` | Tham gia nhóm/channel qua invite link hoặc `@username` |
| `POST` | `/api/v1/telegram-personal/accounts/{id}/groups/{gid}/leave` | Rời khỏi nhóm |

### 2.4 Quét Thành Viên & Lead Generation (Scraper & Ingestion)

| Method | Route | Mô tả nghiệp vụ MTProto |
|---|---|---|
| `POST` | `/api/v1/telegram-personal/groups/{gid}/sync` | Đồng bộ hàng loạt thành viên cào được từ nhóm vào DB |
| `POST` | `/api/v1/telegram-personal/groups/{gid}/ingest-leads` | Chuyển toàn bộ thành viên nhóm (loại trừ bot) sang Lead Pool CRM |
| `GET` | `/api/v1/telegram-personal/scans/history` | Lịch sử các đợt cào dữ liệu nhóm Telegram |

### 2.5 Realtime Listener & Message Sync (Đồng bộ Tin nhắn)

| Chức năng | Cơ chế Triển khai | Mô tả |
|---|---|---|
| **Realtime Inbound Listener** | `telegram.Options.UpdateHandler` | Bắt các update `tg.UpdateNewMessage`, `tg.UpdateShortChatMessage`. Chuẩn hóa thành `ChannelMessageReceivedEvent` và phát qua `SocketIOHub` tới UI. |
| **History Sync Worker** | `TelegramSyncWorker` (NSQ Job) | Tiêu thụ task từ NSQ (`stages: ["contacts", "dialogs", "messages"]`). Gọi `messages.getHistory` theo batch 50 tin, phát sóng `SyncProgressBroadcaster` (0% - 100%). |
| **Outbound Message Dispatcher** | `TelegramOutboundDispatcher` | Gửi tin nhắn kèm Jitter (3s-7s). Nếu gặp lỗi `FLOOD_WAIT_X`, tự động tạm dừng tài khoản theo đúng số giây Telegram yêu cầu trước khi retry. |

---

## 3. Database Schema Specification (PostgreSQL)

### 3.1 Bảng `channel_telegram_accounts`
```sql
CREATE TABLE channel_telegram_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    telegram_user_id VARCHAR(64),
    username VARCHAR(128),
    phone_number VARCHAR(32),
    display_name VARCHAR(255),
    avatar_url TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'INITIALIZED',
    proxy_url VARCHAR(255),
    encrypted_session TEXT,
    daily_stranger_outbound INT NOT NULL DEFAULT 0,
    last_quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_channel_telegram_tenant_status ON channel_telegram_accounts(tenant_id, status);
```

### 3.2 Bảng `channel_telegram_contacts`
```sql
CREATE TABLE channel_telegram_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES channel_telegram_accounts(id) ON DELETE CASCADE,
    telegram_user_id VARCHAR(64) NOT NULL,
    username VARCHAR(128),
    phone_number VARCHAR(32),
    first_name VARCHAR(128),
    last_name VARCHAR(128),
    is_mutual BOOLEAN NOT NULL DEFAULT FALSE,
    is_bot BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, account_id, telegram_user_id)
);
```

### 3.3 Bảng `channel_telegram_scraped_members`
```sql
CREATE TABLE channel_telegram_scraped_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES channel_telegram_accounts(id) ON DELETE CASCADE,
    group_id VARCHAR(128) NOT NULL,
    telegram_user_id VARCHAR(64) NOT NULL,
    username VARCHAR(128),
    first_name VARCHAR(128),
    last_name VARCHAR(128),
    is_bot BOOLEAN NOT NULL DEFAULT FALSE,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, group_id, telegram_user_id)
);
```

---

## 4. Quy Tắc Phòng Thủ Kỹ Thuật (Anti-Ban & Resilience)

1. **FloodWait Auto-Cooldown**:
   Khi Telegram API trả về mã lỗi `FLOOD_WAIT_X` (X giây):
   - Ngay lập tức block hàng đợi gửi tin của tài khoản trong đúng `X + 5` giây.
   - Không thực hiện retry mù quáng để tránh bị Telegram DC ban vĩnh viễn số điện thoại.
2. **Stranger Outbound Quota**:
   - Invariant: Tối đa 25 tin nhắn gửi cho người lạ/ngày mỗi tài khoản.
   - Tự động reset bộ đếm sau 24h.
3. **Đa Chế Độ Proxy & Direct Connection**:
   - Hỗ trợ 3 cơ chế kết nối linh hoạt theo nhu cầu hạ tầng:
     - **Direct Connection** (`proxy_url` rỗng): Kết nối TCP trực tiếp từ server tới Telegram DC IP (phù hợp máy dev local, VPS quốc tế không bị chặn ISP).
     - **SOCKS5 Sticky Proxy** (`socks5://user:pass@host:port`): Tunnel TCP nguyên bản qua SOCKS5, ghim cố định per account trong suốt vòng đời phiên.
     - **HTTP CONNECT Tunnel** (`http://user:pass@host:port` hoặc `https://...`): Sử dụng cơ chế HTTP CONNECT tunnel mở raw TCP socket qua proxy HTTP/HTTPS để đàm phán MTProto.
4. **Encryption at Rest**:
   - Khóa session MTProto (`session.StorageMemory` / string) bắt buộc mã hóa AES-GCM-256 trước khi lưu vào cột `encrypted_session`.
5. **Vòng Đời Phiên & Giải Phóng Tài Nguyên (Graceful Teardown)**:
   - Khi người dùng bấm ngắt kết nối (`DELETE /api/v1/telegram-personal/accounts/{id}`) hoặc đóng modal quét QR:
     - Hệ thống bắt buộc gọi `gotdClient.Disconnect(accountID)` để cancel context, đóng kết nối TCP MTProto đang hoạt động trong bộ nhớ.
     - Xóa các goroutine đang lắng nghe token / update của tài khoản, ngăn chặn triệt để tình trạng zombie connection chiếm giữ socket và nghẽn Telegram DC.
6. **Chuẩn Hóa Xuất & Hiển Thị Mã QR (ISO/IEC 18004)**:
   - **Backend Handshake Timeout**: Giới hạn thời gian kết nối và lấy QR token trong 20s (thay vì treo 3 phút). Trường hợp Telegram DC trả mã lỗi `FLOOD_WAIT` hoặc quá hạn 20s, backend trả ngay mã HTTP `429 Too Many Requests` hoặc `504 Gateway Timeout` kèm `retry_after_seconds`.
   - **Frontend Rendering Standard**: Chuỗi `tg://login?token=...` bắt buộc được render thông qua thư viện QR chuẩn tuân theo ISO/IEC 18004 (sử dụng thư viện `qrcode`), hiển thị rõ ràng trên giao diện để camera ứng dụng Telegram quét thành công 100%. Nghiêm cấm dùng thuật toán giả lập vẽ chấm ngẫu nhiên (`seed % 3`).

---

## 5. Đặc Tả Đồng Bộ Đa Phương Tiện & Định Dạng Văn Bản (Rich Media & Formatting Sync)

### 5.1 Cấu Trúc Text, Định Dạng Đoạn Văn (Paragraphs) & Entities
Tin nhắn văn bản Telegram có cấu trúc phân tách giữa chuỗi ký tự thô (`msg.Message`) và danh sách byte offset (`msg.Entities`).
1. **Paragraphs & Dòng Trống**:
   - Telegram biểu diễn ngắt đoạn bằng ký tự xuống dòng kép `\n\n` hoặc đơn `\n` trong chuỗi UTF-16.
   - Khi lưu trữ vào `messages.content` và hiển thị trên giao diện chat: Giữ nguyên chuỗi phân tách dòng `\n\n`, không được chuẩn hoá gom dòng (collapse whitespaces) làm mất cấu trúc bài viết của khách hàng.
2. **Entities Mapping Chuẩn (Telegram MTProto <-> CRM HTML/Markdown)**:
   - `*tg.MessageEntityBold` -> `<strong>...</strong>`
   - `*tg.MessageEntityItalic` -> `<em>...</em>`
   - `*tg.MessageEntityUnderline` -> `<u>...</u>`
   - `*tg.MessageEntityStrike` -> `<s>...</s>`
   - `*tg.MessageEntityCode` -> `<code>...</code>` (inline code)
   - `*tg.MessageEntityPre` -> `<pre><code>...</code></pre>` (khối code đa dòng)
   - `*tg.MessageEntityTextUrl` -> `<a href="..." target="_blank">...</a>` (hyperlink gắn kèm URL)
   - `*tg.MessageEntityCustomEmoji` -> Custom emoji document ID Telegram (hiển thị kèm fallback unicode character).
3. **Lưu Trữ Trong Cơ Sở Dữ Liệu (`messages`)**:
   - Cột `content`: Giữ chuỗi text thô đầy đủ ngắt dòng.
   - Cột `metadata` (JSONB):
     ```json
     {
       "channel": "telegram",
       "format": "html",
       "formatted_content": "<p>Đoạn 1 <strong>in đậm</strong></p><p>Đoạn 2: <a href=\"https://...\">link</a></p>",
       "telegram_entities": [
         { "type": "bold", "offset": 8, "length": 7 },
         { "type": "text_url", "offset": 25, "length": 4, "url": "https://..." }
       ]
     }
     ```

### 5.2 Đồng Bộ Hình Ảnh (`MessageMediaPhoto`)
1. **Trích Xuất MTProto**:
   - Kiểm tra `msg.Media` dạng `*tg.MessageMediaPhoto`.
   - Lấy đối tượng `Photo` (`*tg.Photo`): Trích xuất `ID`, `AccessHash`, `FileReference`, kích thước các phiên bản (`PhotoSize`).
2. **Cơ Chế Tải & Cache Ảnh**:
   - Không lưu binary trực tiếp vào DB.
   - Proxy MTProto Stream: Tải binary ảnh qua MTProto `UploadGetFile` qua SOCKS5 Proxy của tài khoản, nạp lên MinIO / S3 Storage của Omni Platform.
   - Trả về đường dẫn CDN nội bộ (`https://media.omnicrm.vn/storage/telegram/...`) lưu vào cột `media_url`.
3. **Cấu Hình Message Record**:
   - `content_type`: `"image"`.
   - `content`: Caption mô tả ảnh (nếu có trong `msg.Message`).
   - `media_url`: Link ảnh hiển thị trên chat.

### 5.3 Đồng Bộ Sticker & Animated / Video Sticker (`MessageMediaDocument`)
Sticker trong Telegram được đóng gói dưới dạng `Document` kèm thuộc tính đặc biệt `DocumentAttributeSticker`.
1. **Phân Loại Định Dạng Sticker**:
   - **Static Sticker (`image/webp`)**: Ảnh WebP tĩnh. Render trực tiếp trên thẻ `<img>`.
   - **Animated Sticker (`application/x-tgsticker`)**: Định dạng nén Gzip chứa vector Lottie JSON (.tgs). Frontend giải nén gzip và render qua thư viện `@lottiefiles/lottie-player` hoặc `rlottie-wasm`.
   - **Video Sticker (`video/webm`)**: Định dạng video WebM nén VP9 không âm thanh. Render qua thẻ `<video autoplay loop muted playsinline>`.
2. **Metadata Trích Xuất & Lưu Trữ**:
   - Thuộc tính `*tg.DocumentAttributeSticker`: Lấy `Alt` (ký tự emoji đại diện sticker, vd: `😀`, `🔥`), `Stickerset` (`*tg.InputStickerSetID`).
   - Cột `content_type`: `"sticker"`.
   - Cột `content`: Ký tự emoji đại diện (alt emoji).
   - Cột `media_url`: Link file WebP / TGS / WebM đã nạp lên Media Storage.
   - Cột `metadata` (JSONB):
     ```json
     {
       "channel": "telegram",
       "sticker_type": "static | animated | video",
       "mime_type": "image/webp",
       "alt_emoji": "🔥",
       "document_id": "53928172918271",
       "access_hash": "829102847192",
       "file_reference": "base64_ref"
     }
     ```

### 5.4 Đặc Tả Đồng Bộ Avatar Cá Nhân, Hội Thoại & Thành Viên Nhóm (Profile & Chat Photos)
Telegram không trả về CDN URL trực tiếp như Zalo hay Meta mà đóng gói ảnh đại diện thành cấu trúc nhị phân MTProto (`UserProfilePhoto` / `ChatPhoto`). Hệ thống bắt buộc phải giải mã và đồng bộ ảnh qua luồng xử lý sau:

1. **Avatar Tài Khoản Cá Nhân (`channel_accounts.avatar_url`)**:
   - Khi quét mã QR hoặc đăng nhập thành công (`ExportLoginQR`), lấy `u.Photo` từ `*tg.User`.
   - Nếu `u.Photo` thuộc kiểu `*tg.UserProfilePhoto`:
     - Trích xuất `PhotoID`.
     - Kiểm tra cache / storage: Nếu file ảnh ứng với `PhotoID` đã tồn tại trên server/S3, tái sử dụng URL cũ (chống tải lặp lại).
     - Nếu chưa có: Tải binary qua MTProto API `UploadGetFile` với `InputPeerPhotoFileLocation` (Peer: `InputPeerSelf`, PhotoID: `u.Photo.PhotoID`, Big: `false` để lấy thumbnail 160x160 hoặc Big: `true` cho ảnh chuẩn).
     - Lưu binary vào Media Storage (`LocalStorage` trên server hoặc S3).
     - Cập nhật URL công khai vào `channel_accounts.avatar_url`.

2. **Avatar Hội Thoại & Nhóm Chat (`conversations.metadata.avatar_url`)**:
   - Khi quét danh sách hội thoại (`FetchDialogs`), phân loại theo Peer:
     - User Chat: Trích xuất `u.Photo` (`*tg.UserProfilePhoto`).
     - Group / Supergroup / Channel: Trích xuất `ch.Photo` (`*tg.ChatPhoto`).
   - Tải ảnh đại diện kích thước nhỏ (`small`) qua MTProto `UploadGetFile`.
   - Lưu trữ vào Media Storage theo định dạng key: `telegram/avatars/dialogs/{peer_id}_{photo_id}.jpg`.
   - Trả về trong struct `teledom.TelegramDialog.AvatarURL`.
   - `telegram_sync_worker` nạp URL này vào `conversations.metadata` (`{"avatar_url": "..."}`) và cập nhật `contacts.avatar_url` (đối với hội thoại 1-1).

3. **Avatar Thành Viên Nhóm (`channel_group_members.avatar_url`)**:
   - Khi cào danh sách thành viên nhóm (`ScrapeGroupParticipants` / `channels.getParticipants`), duyệt danh sách `users []tg.UserClass`.
   - Với mỗi thành viên có `u.Photo`:
     - Tải thumbnail avatar hoặc trích xuất vị trí file MTProto.
     - Lưu vào Media Storage và điền URL thật vào struct `teledom.ScrapedGroupMember.AvatarURL`.
     - `postgres_repository` ghi nhận `AvatarURL` vào bảng `channel_group_members` (thay vì để chuỗi rỗng `""`).

### 5.5 Kiến Trúc Media Storage Đa Tầng & Cơ Chế Server Disk Fallback (S3 vs Local Storage)
Hệ thống thiết kế trừu tượng hóa tầng lưu trữ tệp đa phương tiện qua `StoragePort` (`pkg/storage`):

```go
type StoragePort interface {
    // Save lưu dữ liệu binary và trả về URL công khai truy cập được
    Save(ctx context.Context, relativePath string, data []byte, contentType string) (publicURL string, error)
    // Get đọc dữ liệu binary từ storage
    Get(ctx context.Context, relativePath string) (io.ReadCloser, string, error)
    // Exists kiểm tra tệp đã tồn tại chưa (dùng cho deduplication/cache)
    Exists(ctx context.Context, relativePath string) (bool, error)
}
```

**Chiến lược thích ứng (Adaptive Fallback Strategy):**
1. **Ưu tiên Cloud Object Storage (S3 / MinIO / Cloudflare R2)**:
   - Kích hoạt khi có cấu hình biến môi trường: `STORAGE_DRIVER=s3` hoặc có `AWS_S3_BUCKET` + `AWS_ENDPOINT`.
   - Tải file lên bucket S3 theo prefix chỉ định. URL trả về dạng CDN: `https://media.domain.com/{relativePath}`.
2. **Cơ Chế Dự Phòng Lưu Trực Tiếp Trên Server (Local Disk Fallback - BẮT BUỘC KHI CHƯA CÓ S3)**:
   - **Mặc định kích hoạt**: Khi chưa có hoặc thiếu cấu hình S3, hệ thống tự động fallback sang `LocalStorage`.
   - **Đường dẫn vật lý trên server**: Lưu trữ tại `./data/storage/{relativePath}` (hoặc đường dẫn cấu hình qua `STORAGE_LOCAL_DIR`). Tự động khởi tạo cây thư mục bằng `os.MkdirAll`.
   - **Cơ chế phục vụ tệp (HTTP File Serving)**: Hệ thống mở route HTTP nội bộ phục vụ static file:
     `GET /api/v1/media/files/*` hoặc `GET /media/*`.
   - **Định dạng URL công khai trả về**:
     - Cấu hình domain: `fmt.Sprintf("%s/api/v1/media/files/%s", appBaseURL, relativePath)`
     - Mặc định local/dev: `http://localhost:8080/api/v1/media/files/telegram/avatars/{filename}`.
   - **Bảo mật & MIME**: Sử dụng `http.DetectContentType` xác định MIME chuẩn (`image/jpeg`, `image/png`, `image/webp`). Chống tấn công Path Traversal qua `filepath.Clean`.

### 5.6 Xử Lý Binary Media Trong Tin Nhắn MTProto (Inbound & Outbound Photo Streaming)
1. **Nhận Tin Nhắn Ảnh Đến (Inbound Photo)**:
   - Khi nhận sự kiện `*tg.Message` chứa `*tg.MessageMediaPhoto`:
     - **NGHIÊM CẤM** trả về fake URI nội bộ `tg://photo/{id}` vì trình duyệt web không thể hiển thị.
     - Sử dụng MTProto Downloader (`gotd/td/telegram/downloader`) tải binary ảnh bản kích thước lớn nhất (`PhotoSize.Type = "y"` hoặc `"x"`).
     - Đẩy binary vào `StoragePort` (Local Server Disk hoặc S3) với đường dẫn `telegram/messages/photos/{account_id}_{photo_id}.jpg`.
     - Lưu URL HTTP thật vào cột `media_url` của bảng `messages` để Web Chat hiển thị lập tức qua thẻ `<img>`.
2. **Gửi Tin Nhắn Ảnh Đi (Outbound Photo)**:
   - API `POST /api/v1/telegram-personal/messages/send-media` nhận `media_url`.
   - Outbound Driver hỗ trợ 2 nguồn ảnh:
     - Nguồn HTTP/HTTPS từ xa: Tải binary qua HTTP client có timeout/resilience.
     - Nguồn file nội bộ server (Local Disk Fallback): Đọc trực tiếp từ đường dẫn máy chủ mà không cần loopback HTTP request.
     - Nạp binary vào MTProto Uploader (`uploader.NewUploader`) và gửi qua `MessagesSendMedia`.

---

## 6. Đặc Tả Chiều Gửi Tin Nhắn Đa Phương Tiện (Outbound Media & Sticker Dispatch)

### 6.1 Gửi Tin Nhắn Kèm Định Dạng & Đoạn Văn (Formatted Text)
1. **API Gửi Tin Mở Rộng**:
   - `POST /api/v1/telegram-personal/messages/send`
   ```json
   {
     "account_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
     "peer_id": "123456789",
     "text": "Chào bạn,\n\nĐây là **thông điệp quan trọng**:\n- Ưu đãi 50%\nChi tiết xem tại https://omni.vn",
     "parse_mode": "markdown", 
     "is_stranger": false
   }
   ```
2. **Xử Lý MTProto Driver**:
   - Parser phân giải `text` và sinh danh sách `[]tg.MessageEntityClass` (sử dụng parser native `gotd/td/telegram/message/styling` hoặc `html`/`markdown`).
   - Gọi `rawClient.MessagesSendMessage` với `Entities` được cấu hình chuẩn offset.

### 6.2 Gửi Sticker (Send Sticker)
1. **Quy Trình Gửi**:
   - Client gửi lệnh với `content_type: "sticker"` kèm `document_id`, `access_hash`, `file_reference` (nếu sticker từ thư viện đã có) hoặc link sticker.
   - MTProto Driver gọi `rawClient.MessagesSendMedia` với tham số:
     - `Media`: `&tg.InputMediaDocument{ ID: &tg.InputDocument{ ID: docID, AccessHash: accessHash, FileReference: fileRef } }`
     - Kèm cờ `RandomID` và `Peer`.
2. **Gửi Sticker Từ Bộ Sưu Tập Cá Nhân (Sticker Set)**:
   - Hệ thống cung cấp danh mục Sticker Sets khả dụng để nhân viên chọn trong khung chat `MessageInput`.

### 6.3 Gửi Hình Ảnh (Send Image)
1. Tải ảnh lên Telegram DC qua `uploader.Uploader.Upload` tạo `InputFile`.
2. Gọi `rawClient.MessagesSendMedia` với `&tg.InputMediaUploadedPhoto{ File: inputFile }` kèm Caption văn bản và Entities.

---

## 7. Trạng Thái Code Hiện Tại & Ranh Giới Cần Hoàn Thiện (Audit & Implementation Gap)

| Thành Phần | Trạng Thái Code Hiện Tại | Đánh Giá & Khoảng Trống (Gap) |
|---|---|---|
| **Chiều Gửi Text (`SendMessage`)** | **ĐÃ CÓ** (`telegram_handler.go:406`, `native_gotd_client.go:330`) | Chỉ gửi text thô đơn giản qua `MessagesSendMessage`. Chưa hỗ trợ parse Entities/HTML/Markdown và chưa có gửi Media/Sticker. |
| **Chiều Gửi Sticker & Media** | **CHƯA CÓ** | Chưa có handler và chưa có lệnh MTProto `MessagesSendMedia`. |
| **Chiều Nhận Realtime Socket Listener** | **CÓ KHUNG THỦ CÔNG** (`native_gotd_client.go:623`) | `StartInboundListener` đã viết xong dispatcher nhưng **CHƯA ĐƯỢC GỌI** ở bất cứ đâu trong runtime. Tin nhắn đến không tự động bắn realtime. |
| **Đồng Bộ Lịch Sử Bù (History Sync)** | **ĐÃ CÓ** (`telegram_sync_worker.go:216`) | Kéo bù tin nhắn qua NSQ worker nhưng hardcode `content_type = "text"`, bỏ qua hoàn toàn `msg.Media` và `msg.Entities`. |

