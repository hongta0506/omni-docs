# Conversation & Media — Đặc Tả Domain & Repository Port

> Bounded Context: `internal/conversation`  
> Trách nhiệm: Quản lý hội thoại đa kênh (Conversations), luồng tin nhắn (Messages), phân loại thư mục (Chat Folders), mẫu trả lời nhanh (Chat Presets), và quản lý tài nguyên số (Media assets, Watermarks).

---

## 1. Ubiquitous Language & Core Aggregates

### 1.1 Aggregate Root: `Conversation`
```go
package domain

import (
	"errors"
	"time"
	"github.com/google/uuid"
)

type ChannelType string
const (
	ChannelZaloPersonal ChannelType = "zalo_personal"
	ChannelZaloOA       ChannelType = "zalo_oa"
	ChannelTelegram     ChannelType = "telegram"
	ChannelWhatsApp     ChannelType = "whatsapp"
	ChannelFacebook     ChannelType = "facebook"
)

type ConversationStatus string
const (
	ConvStatusOpen     ConversationStatus = "open"
	ConvStatusClosed   ConversationStatus = "closed"
	ConvStatusSpam     ConversationStatus = "spam"
	ConvStatusArchived ConversationStatus = "archived"
)

type Conversation struct {
	id               uuid.UUID
	tenantID         uuid.UUID
	contactID        uuid.UUID
	channelType      ChannelType
	channelAccountID string
	externalChatID   string // ID chat trên nền tảng (Zalo userId / GroupId / WA JID)
	status           ConversationStatus
	assignedUserID   *uuid.UUID
	unreadCount      int
	lastMessageAt    time.Time
	lastSnippet      string
	folderID         *uuid.UUID
	tags             []string
	createdAt        time.Time
	updatedAt        time.Time
}
```

#### Invariants & Business Rules:
1. **Uniqueness per External Channel**: Không thể tồn tại 2 Conversation mở cho cùng một cặp `(channelType, channelAccountID, externalChatID)` trong cùng một Tenant.
2. **Channel Agnostic Interface**: Tầng Domain không biết chi tiết giao thức của Zalo hay WhatsApp; chỉ giao tiếp qua `externalChatID` và `ChannelType`.
3. **Unread Counter Invariant**: `unreadCount` luôn `>= 0`. Khi lệnh `MarkAsRead` được kích hoạt, giá trị này bắt buộc reset về 0 và kích hoạt Domain Event `ConversationReadEvent`.
4. **Assignment Rule**: Không thể gán cuộc hội thoại cho nhân viên không thuộc cùng `tenantID`.

---

### 1.2 Entity: `Message`
```go
type MessageDirection string
const (
	MessageInbound  MessageDirection = "inbound"  // Khách gửi vào
	MessageOutbound MessageDirection = "outbound" // Sale hoặc AI gửi ra
)

type MessageType string
const (
	MsgTypeText        MessageType = "text"
	MsgTypeImage       MessageType = "image"
	MsgTypeFile        MessageType = "file"
	MsgTypeAudio       MessageType = "audio"
	MsgTypeVideo       MessageType = "video"
	MsgTypeLocation    MessageType = "location"
	MsgTypeSticker     MessageType = "sticker"
	MsgTypeContactCard MessageType = "contact_card"
	MsgTypeSystem      MessageType = "system"
	MsgTypeReaction    MessageType = "reaction"
)

type Reaction struct {
	Emoji             string    `json:"emoji"`
	SenderID          string    `json:"sender_id"`
	ExternalMessageID string    `json:"external_message_id,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

type MessageStatus string
const (
	MsgStatusPending   MessageStatus = "pending"
	MsgStatusSent      MessageStatus = "sent"
	MsgStatusDelivered MessageStatus = "delivered"
	MsgStatusFailed    MessageStatus = "failed"
	MsgStatusRecalled  MessageStatus = "recalled"
)

type Message struct {
	id                uuid.UUID
	conversationID    uuid.UUID
	tenantID          uuid.UUID
	senderID          string
	direction         MessageDirection
	msgType           MessageType
	content           string
	mediaURL          string
	metadata          map[string]any // Payload mở rộng: lat/long, sticker_id, vcard, reaction target
	reactions         []Reaction     // Danh sách biểu cảm trên tin nhắn
	status            MessageStatus
	externalMessageID string
	isPinned          bool
	createdAt         time.Time
}
```

---

## 2. Validated Aggregate Wrapper

```go
package domain

type ValidatedConversation struct {
	inner *Conversation
}

func (c *Conversation) Validate() (*ValidatedConversation, error) {
	if c.tenantID == uuid.Nil {
		return nil, errors.New("conversation.validation: tenant_id is required")
	}
	if c.contactID == uuid.Nil {
		return nil, errors.New("conversation.validation: contact_id is required")
	}
	if c.channelAccountID == "" {
		return nil, errors.New("conversation.validation: channel_account_id is required")
	}
	if c.externalChatID == "" {
		return nil, errors.New("conversation.validation: external_chat_id is required")
	}
	return &ValidatedConversation{inner: c}, nil
}

func (v *ValidatedConversation) Conversation() *Conversation {
	return v.inner
}
```

---

## 3. Repository Port Specification

`internal/conversation/domain/repository.go`:

```go
package domain

import (
	"context"
	"github.com/google/uuid"
)

type ConversationRepository interface {
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*Conversation, error)
	GetByExternalID(ctx context.Context, tenantID uuid.UUID, channelType ChannelType, accountID, externalChatID string) (*Conversation, error)
	Save(ctx context.Context, conv *ValidatedConversation) error
	UpdateStatus(ctx context.Context, tenantID, id uuid.UUID, status ConversationStatus) error
	AssignUser(ctx context.Context, tenantID, id, userID uuid.UUID) error
	ResetUnread(ctx context.Context, tenantID, id uuid.UUID) error
}

type MessageRepository interface {
	Save(ctx context.Context, msg *Message) error
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*Message, error)
	GetByExternalID(ctx context.Context, tenantID uuid.UUID, convID uuid.UUID, externalMsgID string) (*Message, error)
	ListByConversation(ctx context.Context, tenantID, convID uuid.UUID, cursor *time.Time, limit int) ([]*Message, error)
	UpdateStatus(ctx context.Context, tenantID, id uuid.UUID, status MessageStatus, externalMsgID string) error
	PinMessage(ctx context.Context, tenantID, convID, msgID uuid.UUID, pin bool) error
	AddReaction(ctx context.Context, tenantID, msgID uuid.UUID, reaction Reaction) error
	RemoveReaction(ctx context.Context, tenantID, msgID uuid.UUID, senderID string) error
	ListSharedResources(ctx context.Context, tenantID, convID uuid.UUID, resourceType string, limit, offset int) ([]*Message, int64, error)
}

type MediaRepository interface {
	SaveAsset(ctx context.Context, asset *MediaAsset) error
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*MediaAsset, error)
	DeleteAsset(ctx context.Context, tenantID, id uuid.UUID) error
}
```
