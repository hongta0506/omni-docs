# Channel & Gateway — Repository Port & Storage Spec

> Bounded Context: `internal/channel`  
> Đặc tả giao diện Repository tầng Domain và cấu trúc cơ sở dữ liệu trên PostgreSQL.

---

## 1. Domain Repository Port Interfaces

```go
package domain

import (
	"context"
	"time"
	"github.com/google/uuid"
)

type ChannelAccountRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*ChannelAccount, error)
	FindByUID(ctx context.Context, tenantID uuid.UUID, channelType ChannelType, accountUID string) (*ChannelAccount, error)
	ListAccessible(ctx context.Context, tenantID, userID uuid.UUID, includeArchived bool) ([]*ChannelAccount, error)
	Save(ctx context.Context, account *ValidatedChannelAccount) error
	Update(ctx context.Context, account *ValidatedChannelAccount) error
	UpdateStatus(ctx context.Context, tenantID, id uuid.UUID, status AccountStatus, reason DisconnectReason) error
	SoftDelete(ctx context.Context, tenantID, id uuid.UUID) error
	Restore(ctx context.Context, tenantID, id uuid.UUID) error
}

type ChannelGroupRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*ChannelGroup, error)
	FindByExternalID(ctx context.Context, tenantID, accountID uuid.UUID, externalGroupID string) (*ChannelGroup, error)
	ListByAccount(ctx context.Context, tenantID, accountID uuid.UUID) ([]*ChannelGroup, error)
	SaveGroup(ctx context.Context, group *ChannelGroup) error
	BatchSaveMembers(ctx context.Context, groupID uuid.UUID, members []*GroupMember) error
	ListMembers(ctx context.Context, groupID uuid.UUID, limit, offset int) ([]*GroupMember, int, error)
}

type EgressProxyRepositoryPort interface {
	FindAvailableProxy(ctx context.Context, tenantID *uuid.UUID) (*EgressProxy, error)
	BindToAccount(ctx context.Context, proxyID, accountID uuid.UUID) error
	ReleaseAccount(ctx context.Context, accountID uuid.UUID) error
	UpdateHealth(ctx context.Context, proxyID uuid.UUID, status ProxyStatus, latencyMs int) error
	ListProxies(ctx context.Context, tenantID *uuid.UUID) ([]*EgressProxy, error)
}
```

---

## 2. PostgreSQL Schema & Bun ORM Models

```go
package postgres

import (
	"time"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type ChannelAccountModel struct {
	bun.BaseModel `bun:"table:zalo_accounts,alias:za"`

	ID               uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID         uuid.UUID  `bun:"org_id,notnull,type:uuid"`
	OwnerUserID      uuid.UUID  `bun:"owner_user_id,notnull,type:uuid"`
	ZaloUID          *string    `bun:"zalo_uid,type:varchar(128)"`
	DisplayName      *string    `bun:"display_name,type:varchar(255)"`
	AvatarURL        *string    `bun:"avatar_url,type:text"`
	Phone            *string    `bun:"phone,type:varchar(32)"`
	Status           string     `bun:"status,notnull,default:'disconnected'"`
	DisconnectReason *string    `bun:"disconnect_reason,type:varchar(32)"`
	DisconnectedAt   *time.Time `bun:"disconnected_at"`
	LastConnectedAt  *time.Time `bun:"last_connected_at"`
	ProxyURL         *string    `bun:"proxy_url,type:text"`
	SessionData      []byte     `bun:"session_data,type:jsonb"`
	PrivacyMode      bool       `bun:"privacy_mode,notnull,default:false"`
	ArchivedAt       *time.Time `bun:"archived_at"`
	CreatedAt        time.Time  `bun:"created_at,notnull,default:current_timestamp"`
	UpdatedAt        time.Time  `bun:"updated_at,notnull,default:current_timestamp"`
}

type EgressProxyModel struct {
	bun.BaseModel `bun:"table:egress_proxies,alias:ep"`

	ID          uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID    *uuid.UUID `bun:"org_id,type:uuid"`
	ServerIP    string     `bun:"server_ip,notnull,type:varchar(64)"`
	Port        int        `bun:"port,notnull"`
	Username    *string    `bun:"username,type:varchar(128)"`
	PasswordEnc []byte     `bun:"password_enc,type:bytea"`
	Protocol    string     `bun:"protocol,notnull,default:'socks5'"`
	Status      string     `bun:"status,notnull,default:'active'"`
	BoundToNick *uuid.UUID `bun:"bound_to_nick_id,type:uuid"`
	LatencyMs   int        `bun:"latency_ms,notnull,default:0"`
	LastCheckAt time.Time  `bun:"last_check_at,notnull,default:current_timestamp"`
	CreatedAt   time.Time  `bun:"created_at,notnull,default:current_timestamp"`
}
```

---

## 3. Query Tối Ưu & Chỉ Mục Bắt Buộc

```sql
-- Tìm kiếm nick Zalo khả dụng theo Tenant và Owner
CREATE INDEX IF NOT EXISTS idx_zalo_accounts_org_owner 
ON zalo_accounts (org_id, owner_user_id, status) WHERE archived_at IS NULL;

-- Độc nhất UID theo Tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_zalo_account_uid 
ON zalo_accounts (org_id, zalo_uid) WHERE zalo_uid IS NOT NULL AND archived_at IS NULL;

-- Egress Proxy Pool lookup cho nick mới
CREATE INDEX IF NOT EXISTS idx_egress_proxies_avail 
ON egress_proxies (status, bound_to_nick_id) WHERE bound_to_nick_id IS NULL;
```
