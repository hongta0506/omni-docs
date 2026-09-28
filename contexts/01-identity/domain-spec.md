# Identity & Settings — Đặc Tả Domain & Repository Port

> Bounded Context: `internal/identity`  
> Trách nhiệm: Quản lý danh tính người dùng (Users), phân quyền RBAC đa cấp, phòng ban (Departments), phiên đăng nhập (Device Sessions) và cấu hình hệ thống (Tenant Settings).

---

## 1. Ubiquitous Language & Core Aggregates

### 1.1 Aggregate Root: `User`
```go
package domain

import (
	"errors"
	"time"
	"github.com/google/uuid"
)

type UserStatus string
const (
	UserStatusActive    UserStatus = "active"
	UserStatusSuspended UserStatus = "suspended"
	UserStatusPending   UserStatus = "pending"
)

type User struct {
	id           uuid.UUID
	tenantID     uuid.UUID
	departmentID *uuid.UUID
	email        string
	passwordHash string
	fullName     string
	roleCode     string
	status       UserStatus
	permissions  []string
	lastLoginAt  *time.Time
	createdAt    time.Time
	updatedAt    time.Time
}
```

#### Invariants & Business Rules:
1. **Email Unique Per Tenant**: Không được trùng lặp email giữa các tài khoản active trong cùng 1 Tenant.
2. **Super Admin Immutability**: Không thể xóa hoặc hạ quyền user có vai trò `super_admin` duy nhất của Tenant.
3. **Password Complexity**: Bắt buộc tối thiểu 8 ký tự, có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt.
4. **Suspension Invariant**: Khi User bị chuyển sang `suspended`, tất cả Refresh Token và Device Session của user đó lập tức bị thu hồi (revoke).

---

### 1.2 Entity: `DeviceSession`
```go
type DeviceSession struct {
	id           uuid.UUID
	userID       uuid.UUID
	tenantID     uuid.UUID
	refreshToken string
	ipAddress    string
	userAgent    string
	expiresAt    time.Time
	revokedAt    *time.Time
	createdAt    time.Time
}
```

---

## 2. Validated Aggregate Wrapper

```go
package domain

type ValidatedUser struct {
	inner *User
}

func (u *User) Validate() (*ValidatedUser, error) {
	if u.tenantID == uuid.Nil {
		return nil, errors.New("identity.validation: tenant_id is required")
	}
	if u.email == "" || !isValidEmail(u.email) {
		return nil, errors.New("identity.validation: invalid email format")
	}
	if u.fullName == "" {
		return nil, errors.New("identity.validation: full_name cannot be blank")
	}
	return &ValidatedUser{inner: u}, nil
}

func (v *ValidatedUser) User() *User {
	return v.inner
}
```

---

## 3. Repository Port Specification

`internal/identity/domain/repository.go`:

```go
package domain

import (
	"context"
	"github.com/google/uuid"
)

type UserRepository interface {
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*User, error)
	GetByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*User, error)
	Save(ctx context.Context, user *ValidatedUser) error
	UpdatePassword(ctx context.Context, tenantID, id uuid.UUID, hash string) error
	Delete(ctx context.Context, tenantID, id uuid.UUID) error
}

type DeviceSessionRepository interface {
	CreateSession(ctx context.Context, session *DeviceSession) error
	GetByRefreshToken(ctx context.Context, token string) (*DeviceSession, error)
	RevokeAllUserSessions(ctx context.Context, tenantID, userID uuid.UUID) error
}

type DepartmentRepository interface {
	GetByID(ctx context.Context, tenantID, id uuid.UUID) (*Department, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]*Department, error)
	Save(ctx context.Context, dept *Department) error
}
```
