# Deal & E-commerce — Repository Port & Storage Spec

> Bounded Context: `internal/deal`  
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

type DealRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*Deal, error)
	FindByCode(ctx context.Context, tenantID uuid.UUID, dealCode string) (*Deal, error)
	ListByContact(ctx context.Context, tenantID, contactID uuid.UUID) ([]*Deal, error)
	ListByStage(ctx context.Context, tenantID, stageID uuid.UUID) ([]*Deal, error)
	Save(ctx context.Context, deal *ValidatedDeal) error
	Update(ctx context.Context, deal *ValidatedDeal) error
	UpdateStage(ctx context.Context, tenantID, id, stageID uuid.UUID, lifecycle DealLifecycle, lostReason *string) error
	LockDeal(ctx context.Context, tenantID, id uuid.UUID, lockedAt time.Time) error
}

type QuoteRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*Quote, error)
	FindByDeal(ctx context.Context, tenantID, dealID uuid.UUID) ([]*Quote, error)
	Save(ctx context.Context, quote *Quote) error
	UpdateStatus(ctx context.Context, tenantID, id uuid.UUID, status QuoteStatus, approverID *uuid.UUID) error
}

type ProductRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*Product, error)
	FindBySKU(ctx context.Context, tenantID uuid.UUID, sku string) (*Product, error)
	List(ctx context.Context, tenantID uuid.UUID, search string, limit, offset int) ([]*Product, int, error)
	Save(ctx context.Context, product *Product) error
	UpdateStock(ctx context.Context, tenantID, id uuid.UUID, delta int) error
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

type DealModel struct {
	bun.BaseModel `bun:"table:deals,alias:d"`

	ID             uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID       uuid.UUID  `bun:"org_id,notnull,type:uuid"`
	DealCode       string     `bun:"deal_code,notnull,type:varchar(64)"`
	Title          string     `bun:"title,notnull,type:varchar(255)"`
	ContactID      uuid.UUID  `bun:"contact_id,notnull,type:uuid"`
	PipelineID     uuid.UUID  `bun:"pipeline_id,notnull,type:uuid"`
	StageID        uuid.UUID  `bun:"stage_id,notnull,type:uuid"`
	AssignedUserID uuid.UUID  `bun:"assigned_user_id,notnull,type:uuid"`
	Lifecycle      string     `bun:"lifecycle,notnull,default:'open'"`
	EstimatedValue int64      `bun:"estimated_value,notnull,default:0"`
	Probability    int        `bun:"probability,notnull,default:10"`
	WeightedValue  int64      `bun:"weighted_value,notnull,default:0"`
	QuoteSentCount int        `bun:"quote_sent_count,notnull,default:0"`
	LostReason     *string    `bun:"lost_reason,type:varchar(64)"`
	WonOrderID     *uuid.UUID `bun:"won_order_id,type:uuid"`
	LockedAt       *time.Time `bun:"locked_at"`
	LastActivityAt time.Time  `bun:"last_activity_at,notnull"`
	CreatedAt      time.Time  `bun:"created_at,notnull,default:current_timestamp"`
	UpdatedAt      time.Time  `bun:"updated_at,notnull,default:current_timestamp"`
}

type QuoteModel struct {
	bun.BaseModel `bun:"table:quotes,alias:q"`

	ID             uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID       uuid.UUID  `bun:"org_id,notnull,type:uuid"`
	DealID         uuid.UUID  `bun:"deal_id,notnull,type:uuid"`
	QuoteCode      string     `bun:"quote_code,notnull,type:varchar(64)"`
	Version        int        `bun:"version,notnull,default:1"`
	Status         string     `bun:"status,notnull,default:'draft'"`
	ItemsJSON      []byte     `bun:"items,type:jsonb"`
	Subtotal       int64      `bun:"subtotal,notnull"`
	DiscountAmount int64      `bun:"discount_amount,notnull,default:0"`
	TaxAmount      int64      `bun:"tax_amount,notnull,default:0"`
	TotalAmount    int64      `bun:"total_amount,notnull"`
	ApprovedBy     *uuid.UUID `bun:"approved_by,type:uuid"`
	ApprovedAt     *time.Time `bun:"approved_at"`
	ValidUntil     time.Time  `bun:"valid_until,notnull"`
	CreatedAt      time.Time  `bun:"created_at,notnull,default:current_timestamp"`
}
```

---

## 3. Query Tối Ưu & Chỉ Mục Bắt Buộc

```sql
-- Pipeline Kanban View: tải nhanh các Deal đang mở theo từng Cột Giai Đoạn
CREATE INDEX IF NOT EXISTS idx_deals_kanban 
ON deals (org_id, pipeline_id, stage_id, lifecycle) 
WHERE lifecycle = 'open';

-- Báo giá của một Deal theo phiên bản
CREATE INDEX IF NOT EXISTS idx_quotes_deal_version 
ON quotes (deal_id, version DESC);

-- Lookup sản phẩm theo mã SKU
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_org_sku 
ON products (org_id, sku);
```
