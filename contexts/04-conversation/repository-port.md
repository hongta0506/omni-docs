# Conversation & Media — Repository Port & Storage Spec

> Đặc tả giao diện Repository tầng Domain (`internal/conversation/domain/repository.go`) và các yêu cầu triển khai kỹ thuật với Bun ORM / pgx trong tầng Infrastructure.

---

## 1. Domain Repository Port Interfaces

Theo đúng chuẩn Go Clean Architecture DDD, Domain Repository Ports **chỉ chấp nhận con trỏ đối tượng đã được validate (`*ValidatedConversation`, `*ValidatedMessage`)** để bảo vệ invariants tuyệt đối trước khi ghi xuống Database.

```go
package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ConversationRepositoryPort quản lý lưu trữ Aggregate Root Conversation
type ConversationRepositoryPort interface {
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*Conversation, error)
	GetByExternalID(ctx context.Context, tenantID uuid.UUID, channelType ChannelType, accountID, externalChatID string) (*Conversation, error)
	Save(ctx context.Context, conv *ValidatedConversation) error
	Update(ctx context.Context, conv *ValidatedConversation) error
	UpdateStatus(ctx context.Context, tenantID, id uuid.UUID, status ConversationStatus) error
	AssignUser(ctx context.Context, tenantID, id, userID uuid.UUID) error
	ResetUnread(ctx context.Context, tenantID, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID, filter ConversationFilter) ([]*Conversation, int, error)
}

// MessageRepositoryPort quản lý thực thể Message trong hội thoại
type MessageRepositoryPort interface {
	Save(ctx context.Context, msg *ValidatedMessage) error
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*Message, error)
	ListByConversation(ctx context.Context, tenantID, convID uuid.UUID, cursor *time.Time, limit int) ([]*Message, *time.Time, error)
	UpdateStatus(ctx context.Context, tenantID, id uuid.UUID, status MessageStatus, externalMsgID string) error
	PinMessage(ctx context.Context, tenantID, convID, msgID uuid.UUID, pin bool) error
	Search(ctx context.Context, tenantID uuid.UUID, query MessageSearchQuery) ([]*Message, error)
}

// MediaRepositoryPort quản lý thư viện file đa phương tiện và watermark
type MediaRepositoryPort interface {
	SaveAsset(ctx context.Context, asset *MediaAsset) error
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*MediaAsset, error)
	DeleteAsset(ctx context.Context, tenantID, id uuid.UUID) error
	ListAssets(ctx context.Context, tenantID uuid.UUID, folderID *uuid.UUID, page, limit int) ([]*MediaAsset, int, error)
}

// ChatPresetRepositoryPort quản lý tin nhắn mẫu (quick replies)
type ChatPresetRepositoryPort interface {
	SavePreset(ctx context.Context, preset *ChatPreset) error
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*ChatPreset, error)
	ListPresets(ctx context.Context, tenantID uuid.UUID, category string) ([]*ChatPreset, error)
	DeletePreset(ctx context.Context, tenantID, id uuid.UUID) error
}
```

---

## 2. Infrastructure Bun ORM Models & Database Schema

Vị trí cài đặt: `internal/conversation/infrastructure/postgres/models.go`

```go
package postgres

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type ConversationModel struct {
	bun.BaseModel `bun:"table:conversations,alias:c"`

	ID             uuid.UUID `bun:"id,pk,type:uuid"`
	TenantID       uuid.UUID `bun:"tenant_id,notnull,type:uuid"`
	ChannelType    string    `bun:"channel_type,notnull,type:varchar(32)"`
	AccountID      string    `bun:"account_id,notnull,type:varchar(128)"`
	ExternalChatID string    `bun:"external_chat_id,notnull,type:varchar(255)"`
	ContactID      *uuid.UUID `bun:"contact_id,type:uuid"`
	AssignedUserID *uuid.UUID `bun:"assigned_user_id,type:uuid"`
	Status         string    `bun:"status,notnull,default:'open',type:varchar(32)"`
	UnreadCount    int       `bun:"unread_count,notnull,default:0"`
	LastMessageID  *uuid.UUID `bun:"last_message_id,type:uuid"`
	LastMessageAt  time.Time `bun:"last_message_at,notnull"`
	CreatedAt      time.Time `bun:"created_at,notnull,default:current_timestamp"`
	UpdatedAt      time.Time `bun:"updated_at,notnull,default:current_timestamp"`
}

type MessageModel struct {
	bun.BaseModel `bun:"table:messages,alias:m"`

	ID             uuid.UUID              `bun:"id,pk,type:uuid"`
	TenantID       uuid.UUID              `bun:"tenant_id,notnull,type:uuid"`
	ConversationID uuid.UUID              `bun:"conversation_id,notnull,type:uuid"`
	SenderType     string                 `bun:"sender_type,notnull,type:varchar(32)"`
	SenderID       string                 `bun:"sender_id,notnull,type:varchar(128)"`
	Direction      string                 `bun:"direction,notnull,type:varchar(16)"`
	MessageType    string                 `bun:"message_type,notnull,type:varchar(32)"`
	Content        string                 `bun:"content,notnull,type:text"`
	Attachments    map[string]interface{} `bun:"attachments,type:jsonb"`
	ExternalMsgID  string                 `bun:"external_msg_id,type:varchar(255)"`
	Status         string                 `bun:"status,notnull,default:'pending',type:varchar(32)"`
	IsPinned       bool                   `bun:"is_pinned,notnull,default:false"`
	CreatedAt      time.Time              `bun:"created_at,notnull,default:current_timestamp"`
	SentAt         time.Time              `bun:"sent_at,notnull"`
}
```

---

## 3. Query Tối Ưu & Cursor-Based Pagination

Truy vấn lịch sử tin nhắn yêu cầu độ trễ < 50ms cho realtime chat, áp dụng Cursor-based pagination thay vì Offset:

```sql
SELECT id, conversation_id, sender_type, sender_id, direction, message_type, content, attachments, status, is_pinned, sent_at
FROM messages
WHERE tenant_id = ? 
  AND conversation_id = ?
  AND sent_at < ? -- cursor timestamp
ORDER BY sent_at DESC
LIMIT ?;
```

Chỉ mục bắt buộc trên PostgreSQL:
```sql
CREATE INDEX IF NOT EXISTS idx_messages_conv_sent_at 
ON messages (tenant_id, conversation_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_account_chat 
ON conversations (tenant_id, channel_type, account_id, external_chat_id);
```
