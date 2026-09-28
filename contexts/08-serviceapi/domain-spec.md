# Service API & Gateway — Đặc Tả Domain & Invariants

> Bounded Context: `internal/serviceapi`  
> Trách nhiệm: Open Service API cho bên thứ 3 và AI Agents bên ngoài (API Key auth, rate limiting, kill switches), Open Service Gateway điều phối tin nhắn ra ngoài có hàng đợi kiểm duyệt (Approval Queue & Outbox), và Phân tích số liệu Dashboard tổng thể (Analytics).

---

## 1. Ubiquitous Language & Core Aggregates

### 1.1 Aggregate Root: `ServiceCredential` (API Keys)
Quản lý khóa truy cập API cho hệ thống ERP, n8n, Zapier hoặc bên thứ 3.

```go
package domain

import (
	"errors"
	"time"
	"github.com/google/uuid"
)

type CredentialStatus string
const (
	CredActive   CredentialStatus = "active"
	CredRevoked  CredentialStatus = "revoked"
	CredExpired  CredentialStatus = "expired"
)

type ServiceCredential struct {
	id          uuid.UUID
	tenantID    uuid.UUID
	name        string
	keyPrefix   string        // omni_live_...
	secretHash  string        // Argon2id / SHA-256 hash
	scopes      []string      // messages:write, contacts:read, leads:assign
	rateLimit   int           // Requests per minute (RPM)
	status      CredentialStatus
	lastUsedAt  *time.Time
	expiresAt   *time.Time
	createdAt   time.Time
}
```

#### Invariants:
1. **Scope Gating**: Mọi request qua Service API bắt buộc đối chiếu với `scopes` được cấp phép. Không được phép bypass scope check.
2. **Never Store Plain Secrets**: Khóa bí mật chỉ hiển thị 1 lần duy nhất khi tạo, sau đó chỉ lưu chuỗi băm an toàn trong cơ sở dữ liệu.

---

### 1.2 Aggregate Root: `ServiceOperation` & `KillSwitch`
Quản lý các tác vụ thực thi từ bên ngoài (Gửi tin nhắn, Gán lead, Thêm bạn bè) qua cơ chế Outbox có bảo vệ.

```go
type OperationStatus string
const (
	OpPendingApproval OperationStatus = "pending_approval" // Cần người duyệt
	OpQueued          OperationStatus = "queued"           // Đã duyệt, chờ worker
	OpExecuting       OperationStatus = "executing"
	OpSuccess         OperationStatus = "success"
	OpFailed          OperationStatus = "failed"
	OpRejected        OperationStatus = "rejected"
)

type ServiceOperation struct {
	id             uuid.UUID
	tenantID       uuid.UUID
	credentialID   uuid.UUID
	idempotencyKey string        // Chống gửi trùng lặp
	operationType  string        // SEND_MESSAGE, ASSIGN_LEAD, ADD_FRIEND
	payloadJSON    []byte
	status         OperationStatus
	requiresGate   bool          // Cần Sale xác nhận trên UI trước khi bắn
	approvedBy     *uuid.UUID
	failReason     *string
	createdAt      time.Time
	executedAt     *time.Time
}

type KillSwitch struct {
	id          uuid.UUID
	tenantID    uuid.UUID
	channelType string        // zalo, telegram, all
	isEngaged   bool          // true = Dừng khẩn cấp toàn bộ tin gửi ra
	reason      string
	engagedBy   uuid.UUID
	engagedAt   time.Time
}
```

#### Invariants & Circuit Breaker:
1. **Kill Switch Absolute Power**: Nếu `KillSwitch.isEngaged == true` cho channel tương ứng, toàn bộ Outbox workers dừng tức thì mọi lệnh bắn tin ra ngoài.
2. **Idempotency Guarantee**: Cùng một `(tenantID, idempotencyKey)` trong vòng 24h không được phép thực thi tác vụ thứ hai; trả về kết quả đã lưu từ lần đầu.

---

## 2. Validated Aggregate Wrapper

```go
package domain

type ValidatedServiceOperation struct {
	inner *ServiceOperation
}

func (o *ServiceOperation) Validate() (*ValidatedServiceOperation, error) {
	if o.tenantID == uuid.Nil {
		return nil, errors.New("serviceapi.validation: tenant_id is required")
	}
	if o.idempotencyKey == "" {
		return nil, errors.New("serviceapi.validation: idempotency_key is required")
	}
	if o.operationType == "" {
		return nil, errors.New("serviceapi.validation: operation_type is required")
	}
	return &ValidatedServiceOperation{inner: o}, nil
}

func (v *ValidatedServiceOperation) Operation() *ServiceOperation {
	return v.inner
}
```
