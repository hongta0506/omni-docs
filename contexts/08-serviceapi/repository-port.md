# Service API & Gateway — Repository Port & Storage Spec

> Bounded Context: `internal/serviceapi`  
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

type CredentialRepositoryPort interface {
	FindByKeyPrefix(ctx context.Context, keyPrefix string) (*ServiceCredential, error)
	FindByID(ctx context.Context, tenantID, id uuid.UUID) (*ServiceCredential, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]*ServiceCredential, error)
	Save(ctx context.Context, cred *ServiceCredential) error
	Revoke(ctx context.Context, tenantID, id uuid.UUID) error
}

type OperationRepositoryPort interface {
	FindByIdempotencyKey(ctx context.Context, tenantID uuid.UUID, key string) (*ServiceOperation, error)
	Save(ctx context.Context, op *ValidatedServiceOperation) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status OperationStatus, failReason *string) error
	ListPendingApproval(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]*ServiceOperation, int, error)
}

type KillSwitchRepositoryPort interface {
	IsEngaged(ctx context.Context, tenantID uuid.UUID, channelType string) (bool, error)
	SetState(ctx context.Context, tenantID, userID uuid.UUID, channelType string, engaged bool, reason string) error
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

type ServiceCredentialModel struct {
	bun.BaseModel `bun:"table:service_credentials,alias:sc"`

	ID         uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID   uuid.UUID  `bun:"org_id,notnull,type:uuid"`
	Name       string     `bun:"name,notnull,type:varchar(128)"`
	KeyPrefix  string     `bun:"key_prefix,notnull,unique,type:varchar(32)"`
	SecretHash string     `bun:"secret_hash,notnull,type:varchar(255)"`
	Scopes     []string   `bun:"scopes,notnull,type:text[],array"`
	RateLimit  int        `bun:"rate_limit,notnull,default:60"`
	Status     string     `bun:"status,notnull,default:'active'"`
	LastUsedAt *time.Time `bun:"last_used_at"`
	ExpiresAt  *time.Time `bun:"expires_at"`
	CreatedAt  time.Time  `bun:"created_at,notnull,default:current_timestamp"`
}

type ServiceOperationModel struct {
	bun.BaseModel `bun:"table:service_operations,alias:so"`

	ID             uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID       uuid.UUID  `bun:"org_id,notnull,type:uuid"`
	CredentialID   uuid.UUID  `bun:"credential_id,notnull,type:uuid"`
	IdempotencyKey string     `bun:"idempotency_key,notnull,type:varchar(128)"`
	OperationType  string     `bun:"operation_type,notnull,type:varchar(64)"`
	PayloadJSON    []byte     `bun:"payload,type:jsonb"`
	Status         string     `bun:"status,notnull,default:'queued'"`
	RequiresGate   bool       `bun:"requires_gate,notnull,default:false"`
	ApprovedBy     *uuid.UUID `bun:"approved_by,type:uuid"`
	FailReason     *string    `bun:"fail_reason,type:text"`
	CreatedAt      time.Time  `bun:"created_at,notnull,default:current_timestamp"`
	ExecutedAt     *time.Time `bun:"executed_at"`
}
```

---

## 3. Query Tối Ưu & Chỉ Mục Bắt Buộc

```sql
-- Idempotency check 24h
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_ops_idempotency 
ON service_operations (org_id, idempotency_key);

-- Outbox Worker Polling
CREATE INDEX IF NOT EXISTS idx_service_ops_queue 
ON service_operations (status, created_at) 
WHERE status = 'queued';
```
