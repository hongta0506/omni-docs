# Channel & Gateway — Đặc Tả Domain & Invariants

> Bounded Context: `internal/channel`  
> Trách nhiệm: Quản lý vòng đời kết nối mạng xã hội (Zalo Personal, Telegram, WhatsApp, Facebook), phiên đăng nhập (QR state machine, session crypto), quản lý nhóm/nhãn Zalo, và Egress Proxy Pool xoay vòng IP chống checkpoint.

---

## 1. Ubiquitous Language & Core Aggregates

### 1.1 Aggregate Root: `ChannelAccount`
Đại diện cho 1 tài khoản mạng xã hội được liên kết vào hệ thống Omni CRM.

```go
package domain

import (
	"errors"
	"time"
	"github.com/google/uuid"
)

type ChannelType string
const (
	ChannelZaloPersonal     ChannelType = "zalo_personal"
	ChannelZaloOA           ChannelType = "zalo_oa"
	ChannelTelegram         ChannelType = "telegram"
	ChannelWhatsAppPersonal ChannelType = "whatsapp_personal" // Unofficial Baileys / QR daemon
	ChannelWhatsAppOfficial ChannelType = "whatsapp_official" // Official WABA Cloud API
	ChannelFacebook         ChannelType = "facebook"
)

type AccountStatus string
const (
	StatusConnected    AccountStatus = "connected"
	StatusDisconnected AccountStatus = "disconnected"
	StatusQRPending    AccountStatus = "qr_pending"
	StatusCheckpoint   AccountStatus = "checkpoint"
	StatusBanned       AccountStatus = "banned"
)

type DisconnectReason string
const (
	DisconnectManual  DisconnectReason = "manual"  // Sale chủ động bấm Ngắt -> Không tự reconnect
	DisconnectPassive DisconnectReason = "passive" // Mất mạng, server Zalo drop -> Tự kích hoạt retry loop
)

type ChannelAccount struct {
	id               uuid.UUID
	tenantID         uuid.UUID
	ownerUserID      uuid.UUID
	channelType      ChannelType
	accountUID       string           // Zalo UID / Telegram User ID / WhatsApp JID
	displayName      string
	avatarURL        string
	phone            string
	status           AccountStatus
	disconnectReason DisconnectReason
	disconnectedAt   *time.Time
	lastConnectedAt  *time.Time
	proxyID          *uuid.UUID       // Gắn với Egress Proxy IP
	sessionDataEnc   []byte           // AES-256-GCM encrypted cookies/tokens
	privacyMode      bool             // Ẩn SĐT với sale thông thường
	archivedAt       *time.Time       // Xóa mềm
	createdAt        time.Time
	updatedAt        time.Time
}
```

#### Domain Invariants & Business Rules:
1. **Uniqueness per Provider**: Không thể tồn tại 2 `ChannelAccount` cùng `(channelType, accountUID)` trong cùng một Tenant.
2. **Disconnect Semantics**: Khi sale bấm ngắt kết nối chủ động (`DisconnectManual`), cấm background daemon tự động kích hoạt `Relogin`. Chỉ tự động reconnect khi `disconnectReason == DisconnectPassive`.
3. **Session Encryption**: Toàn bộ session credentials (cookies, imei, zpw_sek) bắt buộc phải được mã hóa AES-256-GCM trước khi lưu xuống persistent storage.
4. **Proxy Binding Rule**: Mỗi tài khoản cá nhân không chính thức (`zalo_personal`, `whatsapp_personal`) khi đăng nhập phải được gắn với một SOCKS5/HTTP proxy hợp lệ trong Egress Pool để tránh tình trạng nhảy IP dẫn đến khóa nick (Checkpoint/Ban). Tài khoản Official (`zalo_oa`, `whatsapp_official`) không sử dụng Proxy daemon mà giao tiếp trực tiếp qua Webhook/Cloud API.
5. **WhatsApp Service Window Invariant**: Đối với `whatsapp_official`, hệ thống chỉ được phép gửi tin nhắn tự do dạng văn bản/media trong vòng 24 giờ kể từ thời điểm nhận tin nhắn gần nhất của người dùng (`last_customer_message_at`). Sau 24 giờ, bắt buộc phải dùng Tin nhắn Mẫu (Template Message).
6. **Tenant Isolation**: Mọi truy vấn và lệnh cập nhật tài khoản bắt buộc phải mang `tenantID`.

---

### 1.2 Aggregate Root: `EgressProxy`
Quản lý dải IP SOCKS5 dân cư phục vụ việc xoay vòng và giữ phiên kết nối ổn định cho các nick Zalo/Telegram.

```go
type ProxyProtocol string
const (
	ProxySOCKS5 ProxyProtocol = "socks5"
	ProxyHTTP   ProxyProtocol = "http"
)

type ProxyStatus string
const (
	ProxyStatusActive   ProxyStatus = "active"
	ProxyStatusDead     ProxyStatus = "dead"
	ProxyStatusTesting  ProxyStatus = "testing"
)

type EgressProxy struct {
	id          uuid.UUID
	tenantID    *uuid.UUID      // null = pool dùng chung toàn hệ thống do Admatrix cấp
	serverIP    string
	port        int
	username    string
	passwordEnc []byte          // Mã hóa mật khẩu proxy
	protocol    ProxyProtocol
	status      ProxyStatus
	assignedTo  *uuid.UUID      // ID của ChannelAccount đang giữ proxy
	lastCheckAt time.Time
	latencyMs   int
	createdAt   time.Time
	updatedAt   time.Time
}
```

#### Invariants:
1. **Single Account Binding**: Một proxy đang ở trạng thái gán (`assignedTo != nil`) không được phép cấp cho tài khoản thứ hai nhằm bảo toàn IP fingerprint cho mỗi nick.
2. **Dead Proxy Auto-Eject**: Proxy có latency timeout 3 lần liên tiếp hoặc check dead phải bị cô lập (`ProxyStatusDead`), tự động kích hoạt cảnh báo đổi IP cho nick liên quan.

---

### 1.3 Entity: `ChannelGroup` & `GroupMember`
Quản lý các nhóm Zalo/Telegram mà nick tham gia, phục vụ đồng bộ tin nhắn và phân quyền nhóm.

```go
type ChannelGroup struct {
	id               uuid.UUID
	tenantID         uuid.UUID
	accountID        uuid.UUID
	externalGroupID  string     // Grid Zalo / Telegram Chat ID
	name             string
	totalMembers     int
	ownerUID         string
	isScanning       bool       // Cờ đánh dấu worker đang quét thành viên
	lastSyncedAt     time.Time
	createdAt        time.Time
}

type GroupMember struct {
	id              uuid.UUID
	groupID         uuid.UUID
	externalUID     string
	displayName     string
	avatarURL       string
	isAdmin         bool
	isCreator       bool
}
```

---

## 2. Validated Aggregate Wrapper

```go
package domain

type ValidatedChannelAccount struct {
	inner *ChannelAccount
}

func (a *ChannelAccount) Validate() (*ValidatedChannelAccount, error) {
	if a.tenantID == uuid.Nil {
		return nil, errors.New("channel.validation: tenant_id is required")
	}
	if a.ownerUserID == uuid.Nil {
		return nil, errors.New("channel.validation: owner_user_id is required")
	}
	if a.channelType == "" {
		return nil, errors.New("channel.validation: channel_type is required")
	}
	if a.accountUID == "" && a.status != StatusQRPending {
		return nil, errors.New("channel.validation: account_uid is required for active accounts")
	}
	return &ValidatedChannelAccount{inner: a}, nil
}

func (v *ValidatedChannelAccount) Account() *ChannelAccount {
	return v.inner
}
```
