# AI Agent & Knowledge — Repository Port & Storage Spec

> Bounded Context: `internal/aiagent`  
> Đặc tả giao diện Repository tầng Domain và cấu trúc cơ sở dữ liệu trên PostgreSQL / Qdrant.

---

## 1. Domain Repository Port Interfaces

```go
package domain

import (
	"context"
	"time"
	"github.com/google/uuid"
)

type AIAgentRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*AIAgentConfig, error)
	FindByAccount(ctx context.Context, tenantID, accountID uuid.UUID) (*AIAgentConfig, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]*AIAgentConfig, error)
	Save(ctx context.Context, config *ValidatedAIAgentConfig) error
	Update(ctx context.Context, config *ValidatedAIAgentConfig) error
}

type KnowledgeRepositoryPort interface {
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*KnowledgeDoc, error)
	List(ctx context.Context, tenantID uuid.UUID, category string) ([]*KnowledgeDoc, error)
	Save(ctx context.Context, doc *KnowledgeDoc) error
	Delete(ctx context.Context, tenantID, id uuid.UUID) error
}

type OpsRadarRepositoryPort interface {
	SaveSignal(ctx context.Context, signal *OpsRadarSignal) error
	ListUnresolved(ctx context.Context, tenantID uuid.UUID) ([]*OpsRadarSignal, error)
	ResolveSignal(ctx context.Context, tenantID, id uuid.UUID) error
}

type WorkItemRepositoryPort interface {
	ListPending(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]*WorkItem, int, error)
	Save(ctx context.Context, item *WorkItem) error
	Resolve(ctx context.Context, tenantID, id uuid.UUID, status string) error
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

type AIAgentModel struct {
	bun.BaseModel `bun:"table:ai_agent_configs,alias:aac"`

	ID               uuid.UUID   `bun:"id,pk,type:uuid"`
	TenantID         uuid.UUID   `bun:"org_id,notnull,type:uuid"`
	Name             string      `bun:"name,notnull,type:varchar(128)"`
	Mode             string      `bun:"mode,notnull,default:'copilot'"`
	ProviderID       uuid.UUID   `bun:"provider_id,notnull,type:uuid"`
	ModelName        string      `bun:"model_name,notnull,type:varchar(64)"`
	SystemPrompt     string      `bun:"system_prompt,notnull,type:text"`
	Temperature      float64     `bun:"temperature,notnull,default:0.7"`
	MinConfidence    float64     `bun:"min_confidence,notnull,default:0.85"`
	AssignedAccounts []uuid.UUID `bun:"assigned_accounts,type:uuid[],array"`
	IsActive         bool        `bun:"is_active,notnull,default:true"`
	CreatedAt        time.Time   `bun:"created_at,notnull,default:current_timestamp"`
	UpdatedAt        time.Time   `bun:"updated_at,notnull,default:current_timestamp"`
}

type OpsRadarSignalModel struct {
	bun.BaseModel `bun:"table:ops_radar_signals,alias:ors"`

	ID          uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID    uuid.UUID  `bun:"org_id,notnull,type:uuid"`
	SignalType  string     `bun:"signal_type,notnull,type:varchar(64)"`
	Severity    string     `bun:"severity,notnull,default:'warning'"`
	Description string     `bun:"description,notnull,type:text"`
	Metadata    []byte     `bun:"metadata,type:jsonb"`
	IsResolved  bool       `bun:"is_resolved,notnull,default:false"`
	ResolvedAt  *time.Time `bun:"resolved_at"`
	CreatedAt   time.Time  `bun:"created_at,notnull,default:current_timestamp"`
}
```
