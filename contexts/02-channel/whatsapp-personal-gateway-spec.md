# WhatsApp Personal Gateway Specification (go.mau.fi/whatsmeow Native Engine)

> **ĐẶC TẢ KIẾN TRÚC CỔNG WHATSAPP CÁ NHÂN NATIVE IN-PROCESS (UNOFFICIAL MULTI-DEVICE)**  
> **Mã tài liệu:** `SPEC-CHANNEL-WA-001`  
> **Bounded Context:** `internal/channel` (BC 2 — Channel & Gateway)  
> **Kiến trúc vận hành:** Go Native In-Process Driver (`go.mau.fi/whatsmeow`), nhúng trực tiếp trong `omni-core`  
> **Trạng thái:** APPROVED / READY FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ code, API, struct, Protobuf giữ nguyên Tiếng Anh).

---

## 1. Bối Cảnh & Mục Tiêu Nghiệp Vụ (Context & Goals)

Hệ thống Omni Platform kết nối tài khoản **WhatsApp cá nhân (Personal / Unofficial Multi-Device)** cho nhân viên bán hàng / CSKH:
1. **Thu Lead & Chăm Sóc Khách Hàng Tự Động:** Nhận diện tin nhắn gửi tới số điện thoại nhân viên, tự động ghi nhận vào CRM Lead Pool (`contacts.status = 'lead'`).
2. **Kịch Bản Nuôi Dưỡng 1-1 Không Giới Hạn Cửa Sổ 24h:** Trò chuyện 2 chiều tự do, không bị ràng buộc bởi chính sách 24h Service Window hay phí phiên hội thoại của Meta WABA.
3. **Đăng Nhập QR Code Native (Multi-Device):** Quét mã QR trực tiếp bằng ứng dụng WhatsApp trên điện thoại (`Linked Devices` -> `Link a Device`).
4. **Kiến Trúc Go Native In-Process (Thống nhất với Zalo & Telegram):** Loại bỏ hoàn toàn daemon sidecar Node.js/Baileys độc lập. Nhúng thư viện Go thuần [`go.mau.fi/whatsmeow`](https://github.com/tulir/whatsmeow) chạy trực tiếp trong tiến trình `omni-core`.

---

## 2. Kiến Trúc Tổng Thể & Ranh Giới Native In-Process (System Architecture)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           OMNI CORE (internal/channel)                         │
│  - Bounded Context: Channel & Gateway                                          │
│  - Hợp đồng Outbound Port: WhatsAppGatewayPort                                 │
│  - Quản lý Egress Proxy Pool (SPEC 056): Cấp phát SOCKS5 / HTTP Proxy per-nick │
│  - Persistence: Postgres Bun ORM (`channel_accounts`, `conversations`, `messages`) │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │                NativeWhatsmeowClient Manager (In-Process)                │ │
│  │  - Multi-Client Instance per Channel Account (Sync Map / RWMutex)        │ │
│  │  - Session Store: PostgreSQL / SQLite container (`sqlstore`)             │ │
│  │  - QR Channel Pairing Engine (SSE / Polling emitter)                     │ │
│  │  - Inbound Event Dispatcher: Push to DB + SocketIO Broadcaster           │ │
│  │  - Safety Jitter & Outbound Rate Limiter                                 │ │
│  └──────────────────────────────────┬───────────────────────────────────────┘ │
└─────────────────────────────────────┼──────────────────────────────────────────┘
                                      │ Noise Protocol over WebSocket (TLS 443)
                                      │ Đi qua Residential Proxy SOCKS5
                                      ▼
                        WHATSAPP MULTI-DEVICE SERVERS
                             (c.whatsapp.net)
```

### So Sánh Trước và Sau Khi Đổi Sang Native In-Process

| Tiêu chí | Kiến trúc Cũ (Daemon Sidecar / Baileys) | Kiến trúc Mới (Native `whatsmeow` In-Process) |
|---|---|---|
| **Môi trường chạy** | Microservice phụ thuộc (Container Node.js / Go ngoài) | Nhúng trực tiếp trong tiến trình `omni-core` (In-Process) |
| **Giao thức Inter-Service** | gRPC / HTTP RPC hop trung gian (Port 3001) | Gọi trực tiếp hàm Go in-memory (Zero RPC latency) |
| **Tài nguyên phần cứng** | Tốn RAM/CPU chạy 2 runtime (Node.js + Go) | Tối ưu tuyệt đối: Goroutine Go thuần, Stack-allocated |
| **Độ đồng bộ hệ thống** | Lệch pha với Zalo (`zcago`) và Telegram (`gotd/td`) | **Đồng bộ 100%**: 3 kênh Personal đều chạy Native Go In-Process |
| **Quản lý Session** | File JSON / SQLite mount qua Docker Volume | `sqlstore` gắn trực tiếp PostgreSQL DB hoặc Bun ORM |

---

## 3. Sơ Đồ Luồng Hoạt Động (Flow Diagrams)

### 3.1 Luồng 1: Đăng Nhập Tài Khoản Bằng Quét Mã QR (QR Login Flow)

```
[Sale / Frontend]          [Omni Core (Handler)]      [NativeWhatsmeowClient]      [WhatsApp Server]
       │                            │                            │                        │
       │─── 1. Bấm Kết nối WA ─────►│                            │                        │
       │                            │─── 2. ExportLoginQR ──────►│                        │
       │                            │    (account_id, proxy)     │─── 3. GetQRChannel() ──►│
       │                            │                            │◄── QR String Code ─────│
       │                            │◄── 4. QR Image (Base64) ───│                        │
       │◄── 5. Render QR Code ──────│                            │                        │
       │                            │                            │                        │
   [Quét App WA]                    │                            │                        │
       │─────────────────────────────────────────────────────────────────────────────────►│
       │                            │                            │◄── 6. PairSuccess Event│
       │                            │◄── 7. Callback (JID, keys)─│    (Noise Handshake OK)│
       │                            │    [Lưu DB Encrypted]      │                        │
       │◄── 8. Status: CONNECTED ───│                            │                        │
```

### 3.2 Luồng 2: Nhận Tin Nhắn Realtime & Tự Động Thu Lead (Inbound Realtime & Lead Harvest)

```
[User / Lead WA]         [WhatsApp Server]        [NativeWhatsmeowClient]       [Omni Core (Channel/Customer)]
       │                         │                       │                         │
       │─── Gửi tin nhắn ───────►│                       │                         │
       │                         │─── Push WS Event ────►│                         │
       │                         │    (events.Message)   │                         │
       │                         │                       │─── Inbound Handler ────►│
       │                         │                       │    (direct Go callback) ├── 1. Ghi tin nhắn DB
       │                         │                       │                         ├── 2. Bắn SocketIO Hub
       │                         │                       │                         │      (Web chat tức thì)
       │                         │                       │                         └── 3. Check Lead Pool:
       │                         │                       │                                Chưa có -> Nạp Lead mới
```

### 3.3 Luồng 3: Gửi Tin An Toàn, Giãn Cách & Kịch Bản Chăm Sóc (Outbound & Safety Jitter)

```
[Marketing / Sale]         [Omni Core (Handler)]      [NativeWhatsmeowClient]      [WhatsApp Server]
       │                            │                            │                        │
       │─── 1. Dispatch Msg ───────►│                            │                        │
       │                            │─── 2. SendTextMessage ────►│                        │
       │                            │    (jid, text, is_stranger)├── 3. Rate Limit Check:│
       │                            │                            │      Lead mới: <30/day │
       │                            │                            ├── 4. Apply Jitter:     │
       │                            │                            │      Sleep 3s - 7s     │
       │                            │                            │─── 5. SendMessage ────►│
       │                            │◄── 6. Message Sent ACK ────│◄─── Resp: Timestamp,ID │
       │◄── 7. Status: DELIVERED ───│                            │                        │
```

---

## 4. Đặc Tả Giao Diện Kỹ Thuật (Go Interface & Struct Contracts)

### 4.1 Phân Biệt Chat 1-1 và Group Chat (JID & Peer Classification)
WhatsApp Web Protocol phân định rõ danh tính thực thể qua đuôi JID (`types.JID`):
- **Chat 1-1 (Direct / Private):** Server là `s.whatsapp.net` (`<phone>@s.whatsapp.net`).
  - `IsGroup = false`
  - `Sender == Chat`
  - Conversation mapping: `conversation_type = "direct"`, `peer_id = phone@s.whatsapp.net`.
- **Chat Nhóm (Group Chat):** Server là `g.us` (`<group-node>@g.us`).
  - `IsGroup = true`
  - `Chat = groupJID` (Địa chỉ phòng nhóm).
  - `Sender = participantJID` (Người thực tế gửi tin nhắn trong nhóm).
  - Conversation mapping: `conversation_type = "group"`, `peer_id = groupJID`.
- **Broadcast / Status:** Server là `broadcast` (`status@broadcast`). Bỏ qua hoặc phân loại riêng.

---

### 4.2 Interface Port: `WhatsAppGatewayPort`
Vị trí: `internal/channel/infrastructure/whatsapp/port.go`:

```go
package whatsapp

import (
	"context"
	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/types"
)

type WhatsAppGroupInfo struct {
	JID          string   `json:"jid"`
	Name         string   `json:"name"`
	Topic        string   `json:"topic"`
	OwnerJID     string   `json:"owner_jid"`
	MemberCount  int      `json:"member_count"`
	Participants []string `json:"participants"`
}

type WhatsAppGroupMember struct {
	JID          string `json:"jid"`
	DisplayName  string `json:"display_name"`
	Role         string `json:"role"` // admin, superadmin, member
	JoinedAtUnix int64  `json:"joined_at_unix"`
}

type WhatsAppGatewayPort interface {
	// Account Lifecycle & QR
	ExportLoginQR(ctx context.Context, tenantID, accountID uuid.UUID, proxyURL string, onSuccess func(ctx context.Context, tID, accID uuid.UUID, jid types.JID, pushName string) error) (string, error)
	Disconnect(ctx context.Context, accountID string) error
	Reconnect(ctx context.Context, accountID, proxyURL string) error

	// Inbound Realtime Listener
	StartInboundListener(ctx context.Context, tenantID, accountID uuid.UUID, proxyURL string) error

	// Outbound Messaging: Text, Media, Reactions, Revoke
	SendMessage(ctx context.Context, accountID, recipientJID, text, proxyURL string) (string, error)
	SendMediaPhoto(ctx context.Context, accountID, recipientJID, caption, mediaURL, proxyURL string) (string, error)
	SendMediaDocument(ctx context.Context, accountID, recipientJID, fileName, mediaURL, proxyURL string) (string, error)
	SendReaction(ctx context.Context, accountID, recipientJID, messageID, emoji, proxyURL string) error
	RevokeMessage(ctx context.Context, accountID, recipientJID, messageID, proxyURL string) error

	// Sync & Backfill
	SyncAccount(ctx context.Context, accountID, proxyURL string) error

	// Group Management & Member Scraping
	GetJoinedGroups(ctx context.Context, accountID, proxyURL string) ([]WhatsAppGroupInfo, error)
	SyncGroupMembers(ctx context.Context, accountID, groupJID, proxyURL string) ([]WhatsAppGroupMember, error)
}
```

### 4.3 Cấu Trúc Native Driver: `NativeWhatsmeowClient`
Vị trí: `internal/channel/infrastructure/whatsapp/native_whatsmeow_client.go`:

```go
package whatsapp

import (
	"context"
	"sync"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
)

type NativeWhatsmeowClient struct {
	container      *sqlstore.Container
	clientsMutex   sync.RWMutex
	activeClients  map[string]*whatsmeow.Client
	inboundHandler func(ctx context.Context, tenantID, accountID string, event any) error
}
```

---

## 5. Ma Trận Đối Soát 100% Endpoints: Zalo vs Telegram vs WhatsApp

Hệ thống chuẩn hóa toàn bộ các API endpoint của 3 kênh Social Personal dưới cùng một triết lý thiết kế RESTful:

| Nghiệp Vụ / Hành Vi | Zalo Personal (`zalo-accounts`) | Telegram Personal (`telegram-personal`) | WhatsApp Personal (`whatsapp-personal`) |
|---|---|---|---|
| **1. Danh sách nick** | `GET /api/v1/zalo-accounts` | `GET /api/v1/telegram-personal/accounts` | `GET /api/v1/whatsapp-personal/accounts` |
| **2. Khởi tạo nick & cấp proxy** | `POST /api/v1/zalo-accounts` | `POST /api/v1/telegram-personal/accounts/init` | `POST /api/v1/whatsapp-personal/accounts/init` |
| **3. Lấy QR code đăng nhập** | `POST /api/v1/zalo-accounts/qr/start` | `GET /api/v1/telegram-personal/accounts/{id}/qr` | `GET /api/v1/whatsapp-personal/accounts/{id}/qr` |
| **4. Ngắt kết nối nick** | `DELETE /api/v1/zalo-accounts/{id}` | `DELETE /api/v1/telegram-personal/accounts/{id}` | `DELETE /api/v1/whatsapp-personal/accounts/{id}` |
| **5. Tái kết nối rớt mạng** | `POST /api/v1/zalo-accounts/{id}/reconnect` | `POST /api/v1/telegram-personal/accounts/{id}/reconnect` | `POST /api/v1/whatsapp-personal/accounts/{id}/reconnect` |
| **6. Danh sách hội thoại (Dialogs)** | `GET /api/v1/conversations?channel=zalo_personal` | `GET /api/v1/telegram-personal/dialogs` | `GET /api/v1/whatsapp-personal/dialogs` |
| **7. Đồng bộ tin nhắn / Lịch sử** | `POST /api/v1/zalo-accounts/{id}/backfill-messages` | `POST /api/v1/telegram-personal/accounts/{id}/sync` | `POST /api/v1/whatsapp-personal/accounts/{id}/sync` |
| **8. Gửi tin nhắn Text / Media** | Outbound Dispatcher (text/photo) | `POST /api/v1/telegram-personal/messages/send` | `POST /api/v1/whatsapp-personal/messages/send` |
| **9. Thả Reaction / Icon / Emoji** | Reaction Webhook / Dispatcher | `POST /api/v1/telegram-personal/messages/react` | `POST /api/v1/whatsapp-personal/messages/react` |
| **10. Thu hồi tin nhắn (Revoke)** | `POST /api/v1/webhook/zalo-personal/undo` | `DELETE /api/v1/telegram-personal/messages/{id}` | `POST /api/v1/whatsapp-personal/messages/revoke` |
| **11. Danh sách nhóm (Groups)** | `GET /api/v1/zalo-accounts/{id}/groups` | `GET /api/v1/telegram-personal/dialogs?type=group` | `GET /api/v1/whatsapp-personal/groups` |
| **12. Đồng bộ thành viên nhóm** | `POST /api/v1/zalo-accounts/{id}/group-scans` | `POST /api/v1/telegram-personal/groups/{id}/sync` | `POST /api/v1/whatsapp-personal/groups/{id}/sync` |
| **13. Danh sách thành viên nhóm** | `GET /api/v1/zalo-accounts/{id}/groups/{gid}/members` | `GET /api/v1/telegram-personal/groups/{id}/members` | `GET /api/v1/whatsapp-personal/groups/{id}/members` |

---

## 6. Chi Tiết Request / Response DTOs Mở Rộng

### 6.1 Gửi Tin Nhắn Đa Dạng (Text & Media): `POST /api/v1/whatsapp-personal/messages/send`
```json
{
  "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "peer_id": "84901234567@s.whatsapp.net",
  "peer_type": "direct",
  "text": "Chào bạn, đây là hình ảnh và catalog sản phẩm!",
  "media_type": "image",
  "media_url": "https://storage.omni.vn/media/product-catalog.png",
  "caption": "Catalog sản phẩm 2026",
  "is_stranger": false
}
```
*Ghi chú:*
- Nếu `peer_id` kết thúc bằng `@g.us`, hệ thống tự động suy diễn `peer_type = "group"`.
- Hỗ trợ `media_type`: `"none"`, `"image"`, `"video"`, `"audio"`, `"document"`.

### 6.2 Thả Reaction / Icon / Emoji: `POST /api/v1/whatsapp-personal/messages/react`
```json
{
  "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "peer_id": "84901234567@s.whatsapp.net",
  "message_id": "3EB0123456789ABCDEF",
  "emoji": "👍"
}
```

### 6.3 Thu Hồi Tin Nhắn: `POST /api/v1/whatsapp-personal/messages/revoke`
```json
{
  "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "peer_id": "84901234567@s.whatsapp.net",
  "message_id": "3EB0123456789ABCDEF"
}
```

### 6.4 Đồng Bộ Thành Viên Nhóm: `POST /api/v1/whatsapp-personal/groups/{id}/sync`
Query param: `?account_id=uuid`
Response:
```json
{
  "group_id": "120363025123456789@g.us",
  "name": "Hội Khách Hàng Thân Thiết",
  "total_members": 45,
  "synced_at": "2026-10-07T10:00:00Z"
}
```

---

## 7. Chính Sách Quản Lý Session, Fingerprint & Chống Khóa Số (Anti-Ban Rules)

1. **Isolation Proxy Egress 1:1:**
   - Mỗi tài khoản WhatsApp kết nối qua 1 Proxy SOCKS5 dân cư độc lập (lấy từ Master Proxy Pool SPEC 056).
   - Thiết lập qua `client.SetProxyAddress(proxyURL)`. Tuyệt đối không để rò rỉ IP của máy chủ core.
2. **Cố Định Browser Fingerprint (`store.Device`):**
   - Không thay đổi OS / Browser info giữa các lần reconnect. Sử dụng thiết lập nhận diện cố định:
     `store.DeviceProps.Os = "Mac OS"` hoặc `"Chrome (Windows)"`.
3. **Safety Jitter Delay:**
   - Gửi tin tự động áp dụng khoảng nghỉ ngẫu nhiên: `time.Sleep(rand.Duration(3s, 7s))`.
4. **Daily Stranger Outbound Quota Guard:**
   - Giới hạn tối đa **30 số điện thoại lạ/ngày/nick** đối với khách hàng chưa từng tương tác 2 chiều.

---

## 7. Đối Soát Trạng Thái Implementation & Lộ Trình Triển Khai (Gap Analysis & Action Plan)

| Thành phần | Hiện trạng trong Codebase (`omni-core-clean`) | Yêu Cầu Hoàn Thiện Khi Đổi Sang Native |
|---|---|---|
| **Engine Runtime** | Đang dùng gRPC client stub gọi sang sidecar daemon port 3001 | Thay thế bằng `NativeWhatsmeowClient` nhúng thư viện `go.mau.fi/whatsmeow` |
| **Session Store** | Dự kiến mount sqlite file ngoài container | Dùng `sqlstore.New("postgres", dbConnStr)` hoặc lưu credentials vào Bun DB |
| **QR Code Engine** | Chưa có code Go, phụ thuộc daemon ngoài | Dùng kênh `client.GetQRChannel(context.Background())` sinh Base64 QR code |
| **Inbound Handler** | Chỉ có stub xử lý webhook/stream | Gắn `client.AddEventHandler` hứng `events.Message` đẩy trực tiếp DB & SocketIO |
| **Outbound Dispatcher** | Client gRPC rỗng | Dùng `client.SendMessage(recipientJID, &waProto.Message{...})` |
