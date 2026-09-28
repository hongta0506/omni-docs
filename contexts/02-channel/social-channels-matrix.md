# Phân Loại Kênh Social: Official vs Unofficial (Channel Matrix Specification)

> **Bounded Context:** `internal/channel`  
> **Nguyên tắc cốt lõi:** Các kênh mạng xã hội (Zalo, WhatsApp, Telegram, Facebook Messenger, Instagram...) bản chất chỉ là **Adapters ngõ vào/ra ngoại vi**.  
> Cùng một loại kênh (VD: Zalo, Facebook), hệ thống hỗ trợ 2 hướng tiếp cận song song: **Official (Chính quy qua API/Webhook đối tác)** và **Unofficial (Tự động hóa qua Session/QR/MTProto/Emulation)**.

---

## 1. Ma Trận Đối Soát Tổng Thể (Official vs Unofficial)

| Kênh Social | Hướng (Mode) | Giao thức / SDK | Xác thực (Auth) | Rủi ro & Chính sách | Khả năng & Ràng buộc |
|---|---|---|---|---|---|
| **Zalo** | **Official (OA)** | Zalo OpenAPI v3, HTTPS Webhook | App ID + Secret, OAuth2 Access Token / Refresh Token | Không rủi ro khóa nick. Tính phí gửi tin ZNS/UID theo hạn mức Zalo Cloud. | Bị giới hạn cửa sổ phản hồi 48h, chỉ gửi tin tương tác hoặc ZNS có phí. Không đọc được tin nhắn cá nhân. |
| **Zalo** | **Unofficial (Personal)** | WebSocket daemon (`zca-js` / TLS Node sidecar) | Quét QR Code, Session Cookie, AES Secret Key | Nguy cơ Checkpoint, ban account nếu spam hoặc đổi IP đột ngột. Cần SOCKS5 Sticky Proxy. | Đọc/gửi tin nhắn tài khoản cá nhân, quản lý nhóm bạn bè, tag bạn bè, không tốn phí ZNS. |
| **WhatsApp** | **Official (Cloud API)** | Meta Graph API v20+, Webhooks | Meta App Token, System User Token, WABA ID | Không rủi ro ban nick. Trả phí theo cuộc hội thoại (Conversation-based pricing). | Phải dùng Template Message duyệt trước nếu ngoài 24h. Chỉ chat với khách chủ động nhắn trước. |
| **WhatsApp** | **Unofficial (Web/Baileys)** | WebSocket qua Baileys lib, Protobuf TLS | Quét QR Code / 8-digit Pairing Code | Rủi ro bị WhatsApp khóa số điện thoại (Ban JID) nếu gửi dồn dập. | Chat 1-1 tự do từ số cá nhân/doanh nghiệp không cần duyệt mẫu template, tạo/tham gia group. |
| **Telegram** | **Official (Bot API)** | HTTPS Long Polling / Webhook (`api.telegram.org`) | Bot Token từ `@BotFather` | Miễn phí 100%, không bị ban nick trừ khi vi phạm ToS nghiêm trọng. | Bot không thể chủ động nhắn trước cho user nếu user chưa bấm `/start`. Không đọc được chat cá nhân ngoài bot. |
| **Telegram** | **Unofficial (Personal/MTProto)** | TDLib / MTProto TCP binary protocol | SĐT + Mã OTP SMS/Telegram, Session String | Rủi ro bị FloodWait, SpamBot gắn cờ nếu add user lạ hoặc blast tin dồn dập. | Quản lý nick cá nhân, đọc tin nhắn user/group/channel, chủ động nhắn qua username/phone. |
| **Facebook Messenger** | **Official (Page Graph API)** | Meta Graph API / Messenger Webhook | Facebook Page Access Token, App Secret Proof | Không rủi ro khóa nick. Tuân thủ chính sách 24h Messaging Window. | Chat dưới danh nghĩa Fanpage. Ngoài 24h phải dùng Message Tags (Confirmed Event, Post Purchase) hoặc Sponsored. |
| **Facebook Messenger** | **Unofficial (Personal Emulation)** | Puppeteer / Playwright headless / Graph Cookie | User Cookie (`c_user`, `xs`), 2FA TOTP | Rủi ro Checkpoint danh tính, vô hiệu hóa tài khoản Facebook cá nhân cực cao. | Chat dưới danh nghĩa Profile cá nhân, rep tin nhắn Marketplace, group chat cá nhân. |
| **Instagram** | **Official (Graph API)** | Meta Instagram Messaging API, Webhook | Instagram Business/Creator Account link Page Token | Không rủi ro ban nick. Cửa sổ chat 24h tiêu chuẩn Meta. | Nhận/gửi tin Direct Message (DM), Story Mentions, Ice Breakers cho tài khoản Doanh nghiệp/Creator. |
| **Instagram** | **Unofficial (Private API)** | Mobile App Emulation (`instagram-private-api`) | Username + Password + Session Cookie, SOCKS5 | Rủi ro Challenge SMS, khóa tài khoản do hành vi đăng nhập bất thường. | Nhắn tin từ tài khoản Instagram cá nhân thường, follow, thả tim story, quét tin nhắn DM cá nhân. |

---

## 2. Kiến Trúc Adapter & Nguyên Tắc Tách Rời (Separation of Concerns)

Tất cả các kênh dù là Official hay Unofficial đều phải tuân thủ nghiêm ngặt mô hình **Ports & Adapters (Hexagonal)**:
- **Core Domain không biết loại giao thức**: Tầng Domain (`internal/channel/domain`) chỉ làm việc với struct `ChannelAccount` và `ChannelType`.
- **Phân loại qua Enum `ChannelMode`**:
  ```go
  type ChannelMode string

  const (
      ChannelModeOfficial   ChannelMode = "OFFICIAL"   // Webhook, OAuth, Cloud APIs
      ChannelModeUnofficial ChannelMode = "UNOFFICIAL" // QR, Session, Daemon, MTProto
  )
  ```
- **Chuẩn hóa sự kiện đầu vào (Inbound Normalization)**:
  - Mọi luồng dù đến từ Webhook Meta (Official) hay Socket Zalo Daemon (Unofficial) đều được bọc thành một Domain Event duy nhất:
  `ChannelMessageReceivedEvent` đẩy vào Event Bus nội bộ.
- **Điều phối đầu ra (Outbound Routing)**:
  - **Official**: Gọi qua HTTP Client chuẩn, xử lý OAuth Token Refresh, Rate Limit theo Header đối tác (`X-RateLimit-*`).
  - **Unofficial**: Bắt buộc gắn **SOCKS5 Sticky Proxy**, đi qua **Token Bucket Rate Limiter có Jitter (3-7s)**, kiểm tra cờ an toàn tài khoản trước khi gửi.

---

## 3. Quy Tắc Phòng Thủ Kỹ Thuật Cho Hướng Unofficial

1. **SOCKS5 Sticky Proxy Cố Định**:
   - 1 tài khoản Unofficial (Zalo Personal, WhatsApp Baileys, Telegram MTProto, Instagram Private) được gán cố định 1 IP Proxy dân cư (Residential Proxy).
   - Tuyệt đối không để tài khoản nhảy IP liên tục giữa các lần gửi hoặc reconnect.
2. **Jitter Delay & Giả Lập Hành Vi Người**:
   - Hướng Unofficial không gửi tin dồn dập (Burst = 1).
   - Thêm khoảng nghỉ ngẫu nhiên (Jitter: 2s - 5s - 12s) giữa các tin nhắn.
3. **Session Secret Encryption**:
   - Cookie, Session String, Private Key của các nick Unofficial phải được mã hóa AES-GCM-256 bằng Master Key của Tenant trước khi lưu DB.
