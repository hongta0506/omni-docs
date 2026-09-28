# Identity & Settings — Repository Port & Storage Spec

> Đặc tả giao diện Repository tầng Domain (`internal/identity/domain/repository.go`) và các yêu cầu triển khai kỹ thuật với Bun ORM / pgx trong tầng Infrastructure.

---

## 1. Domain Repository Port Interfaces

Theo đúng chuẩn Go Clean Architecture DDD, Domain Repository Ports **chỉ chấp nhận con trỏ đối tượng đã được validate (`*ValidatedUser`, `*ValidatedRole`)** để bảo vệ invariants tuyệt đối trước khi ghi xuống Database.

```go
package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// UserRepositoryPort quản lý lưu trữ Aggregate Root User
type UserRepositoryPort interface {
	FindByID(ctx context.Context, tenantID uuid.UUID, id uuid.UUID) (*User, error)
	FindByEmail(ctx context.Context, tenantID uuid.UUID, email EmailVO) (*User, error)
	FindByEmailGlobal(ctx context.Context, email EmailVO) ([]*User, error) // Cho luồng Tenant Switcher
	Save(ctx context.Context, user *ValidatedUser) error
	Update(ctx context.Context, user *ValidatedUser) error
	Delete(ctx context.Context, tenantID uuid.UUID, id uuid.UUID) error
	
	// Queries tối ưu cho list / phân trang
	List(ctx context.Context, tenantID uuid.UUID, filter UserFilter) ([]*User, int, error)
}

// RoleRepositoryPort quản lý Aggregate Root Role & RBAC
type RoleRepositoryPort interface {
	FindByID(ctx context.Context, tenantID uuid.UUID, id uuid.UUID) (*Role, error)
	FindByCode(ctx context.Context, tenantID uuid.UUID, code string) (*Role, error)
	Save(ctx context.Context, role *ValidatedRole) error
	Delete(ctx context.Context, tenantID uuid.UUID, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]*Role, error)
	
	// Permissions
	ListUserPermissions(ctx context.Context, tenantID uuid.UUID, userID uuid.UUID) ([]Permission, error)
	AssignRoleToUser(ctx context.Context, tenantID uuid.UUID, userID uuid.UUID, roleID uuid.UUID) error
	RemoveRoleFromUser(ctx context.Context, tenantID uuid.UUID, userID uuid.UUID, roleID uuid.UUID) error
}

// SessionRepositoryPort lưu session tạm thời trong Redis
type SessionRepositoryPort interface {
	StoreSession(ctx context.Context, session *DeviceSession, ttl time.Duration) error
	GetSession(ctx context.Context, sessionID string) (*DeviceSession, error)
	RevokeSession(ctx context.Context, sessionID string) error
	RevokeAllUserSessions(ctx context.Context, userID uuid.UUID) error
	IsTokenBlacklisted(ctx context.Context, jti string) (bool, error)
	BlacklistToken(ctx context.Context, jti string, exp time.Duration) error
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

type UserModel struct {
	bun.BaseModel `bun:"table:users,alias:u"`

	ID           uuid.UUID  `bun:"id,pk,type:uuid"`
	TenantID     uuid.UUID  `bun:"tenant_id,notnull,type:uuid"`
	Email        string     `bun:"email,notnull"`
	PasswordHash string     `bun:"password_hash,notnull"`
	FullName     string     `bun:"full_name,notnull"`
	PhoneNumber  *string    `bun:"phone_number"`
	AvatarURL    *string    `bun:"avatar_url"`
	Status       string     `bun:"status,notnull,default:'active'"` // active, suspended, inactive
	DepartmentID *uuid.UUID `bun:"department_id,type:uuid"`
	CreatedAt    time.Time  `bun:"created_at,notnull,default:current_timestamp"`
	UpdatedAt    time.Time  `bun:"updated_at,notnull,default:current_timestamp"`
	DeletedAt    *time.Time `bun:"deleted_at,soft_delete"`
}

type RoleModel struct {
	bun.BaseModel `bun:"table:roles,alias:r"`

	ID          uuid.UUID `bun:"id,pk,type:uuid"`
	TenantID    uuid.UUID `bun:"tenant_id,notnull,type:uuid"`
	Name        string    `bun:"name,notnull"`
	Code        string    `bun:"code,notnull"`
	Description string    `bun:"description"`
	IsSystem    bool      `bun:"is_system,notnull,default:false"`
	CreatedAt   time.Time `bun:"created_at,notnull,default:current_timestamp"`
}

type UserRoleModel struct {
	bun.BaseModel `bun:"table:user_roles,alias:ur"`

	UserID   uuid.UUID `bun:"user_id,pk,type:uuid"`
	RoleID   uuid.UUID `bun:"role_id,pk,type:uuid"`
	TenantID uuid.UUID `bun:"tenant_id,notnull,type:uuid"`
}
```

---

## 3. Transaction Boundary & Audit Trail

1. **Transactional User Deletion / Deactivation**:
   Khi vô hiệu hóa nhân viên:
   - Cập nhật `users.status = 'inactive'` trong DB Transaction.
   - Xóa `user_roles` liên quan hoặc thu hồi các quyền quản trị.
   - Gọi `SessionRepository.RevokeAllUserSessions` trong Redis để đá người dùng ra khỏi mọi app mobile / web desktop.
2. **Data Masking Query Protection**:
   - Khi truy vấn `users` hoặc `contacts`, nếu context gọi không có cờ `IsSuperAdmin` hoặc permission `privacy.unmask_phone`, câu lệnh SELECT tự động dùng hàm SQL mask:
   ```sql
   CONCAT(SUBSTRING(phone_number, 1, 4), '***', SUBSTRING(phone_number, LENGTH(phone_number)-2))
   ```
