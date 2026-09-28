# Marketing & Automation — Repository Port & Storage Spec

> Bounded Context: `internal/marketing`  
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

type TagRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*Tag, error)
	FindByName(ctx context.Context, tenantID uuid.UUID, name string) (*Tag, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]*Tag, error)
	Save(ctx context.Context, tag *Tag) error
	Delete(ctx context.Context, tenantID, id uuid.UUID) error
	AttachContactTag(ctx context.Context, tenantID, contactID, tagID uuid.UUID) error
	DetachContactTag(ctx context.Context, tenantID, contactID, tagID uuid.UUID) error
	ListContactTags(ctx context.Context, tenantID, contactID uuid.UUID) ([]*Tag, error)
}

type CampaignRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*Campaign, error)
	List(ctx context.Context, tenantID uuid.UUID, status *CampaignStatus, limit, offset int) ([]*Campaign, int, error)
	Save(ctx context.Context, campaign *ValidatedCampaign) error
	UpdateStatus(ctx context.Context, tenantID, id uuid.UUID, status CampaignStatus) error
	IncrementCounters(ctx context.Context, id uuid.UUID, success bool) error
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

type TagModel struct {
	bun.BaseModel `bun:"table:tags,alias:t"`

	ID        uuid.UUID `bun:"id,pk,type:uuid"`
	TenantID  uuid.UUID `bun:"org_id,notnull,type:uuid"`
	GroupID   uuid.UUID `bun:"group_id,type:uuid"`
	Name      string    `bun:"name,notnull,type:varchar(64)"`
	ColorHex  string    `bun:"color_hex,notnull,default:'#6B7280'"`
	IsSystem  bool      `bun:"is_system,notnull,default:false"`
	CreatedAt time.Time `bun:"created_at,notnull,default:current_timestamp"`
}

type ContactTagModel struct {
	bun.BaseModel `bun:"table:contact_tags,alias:ct"`

	ContactID uuid.UUID `bun:"contact_id,pk,type:uuid"`
	TagID     uuid.UUID `bun:"tag_id,pk,type:uuid"`
	TenantID  uuid.UUID `bun:"org_id,notnull,type:uuid"`
	CreatedAt time.Time `bun:"created_at,notnull,default:current_timestamp"`
}

type CampaignModel struct {
	bun.BaseModel `bun:"table:campaigns,alias:c"`

	ID               uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID         uuid.UUID  `bun:"org_id,notnull,type:uuid"`
	Title            string     `bun:"title,notnull,type:varchar(255)"`
	CampaignType     string     `bun:"campaign_type,notnull"`
	Status           string     `bun:"status,notnull,default:'draft'"`
	SenderAccounts   []uuid.UUID `bun:"sender_accounts,type:uuid[],array"`
	FilterJSON       []byte     `bun:"filter_json,type:jsonb"`
	ContentTemplate  string     `bun:"content_template,notnull,type:text"`
	SendDelayMinSec  int        `bun:"send_delay_min_sec,notnull,default:15"`
	SendDelayMaxSec  int        `bun:"send_delay_max_sec,notnull,default:45"`
	TotalTargets     int        `bun:"total_targets,notnull,default:0"`
	SentCount        int        `bun:"sent_count,notnull,default:0"`
	SuccessCount     int        `bun:"success_count,notnull,default:0"`
	FailCount        int        `bun:"fail_count,notnull,default:0"`
	ScheduledAt      *time.Time `bun:"scheduled_at"`
	CreatedAt        time.Time  `bun:"created_at,notnull,default:current_timestamp"`
}
```
