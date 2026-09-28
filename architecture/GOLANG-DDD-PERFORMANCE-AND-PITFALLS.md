# Golang Clean DDD Performance, Concurrency & Anti-Pattern Guidelines

> Version: 1.0.0  
> Target: Omni Core Backend Engineering & AI Coding Agents  
> Scope: Prevention of 5 Critical Golang Anti-Patterns (Memory/GC, Architecture Bloat, N+1/Performance, Concurrency/Context, Java/C# Mindset in Go).

---

## 1. Executive Summary: The 5 Critical Traps in Go DDD

When porting a TypeScript/Node.js or Java/C# codebase to Golang with Clean Architecture and Domain-Driven Design (DDD), developers and AI agents frequently fall into 5 critical pitfalls:

| Core Issue | Root Cause | Production Consequence | Mandatory Go Solution |
|---|---|---|---|
| **1. Memory & GC Pressure** | Unbounded goroutines, slice retention, heap escape via `any`/`interface{}`. | RAM spikes, GC stop-the-world pauses, OOM kills in Kubernetes/Docker. | Worker pools, bounded channels, `slices.Clone()`, concrete types over `any`. |
| **2. Architecture Bloat** | Forcing CQRS read models through domain aggregates; redundant layer-to-layer DTO copies. | Boilerplate overload, CPU/alloc churn on reads, slow API response. | Pragmatic CQRS: Command routes via Aggregates; Query routes directly to DB Projection DTOs. |
| **3. N+1 & Aggregate Bloat** | Loading entire entity graphs into aggregates; DB queries inside loops. | High query latency, DB connection exhaustion, CPU lockups under load. | Small aggregates (IDs only, no unbounded slices); batch queries via `bun.In()` / SQL joins. |
| **4. Concurrency & Context** | Inheriting HTTP `req.Context()` in async event handlers; race conditions on state. | Handlers canceled unexpectedly when HTTP finishes; data races, corrupted state. | `context.WithoutCancel()`, sync primitives (`sync.Mutex`), Transactional Outbox. |
| **5. Java/C# Paradigm Traps** | `IUserService` / `UserServiceImpl` upfront interfaces; deep package hierarchies. | Non-idiomatic Go, package import cycles, excessive boilerplate. | "Accept interfaces, return structs"; define interfaces at the call-site/consumer package. |

---

## 2. Pitfall 1: Memory Leaks, GC Latency & Heap Escape

### 2.1 The Goroutine Leak Trap
**Anti-Pattern:** Spawning raw goroutines without lifecycle management or cancellation bounds.
```go
// BAD: Uncontrolled goroutine spawn per incoming HTTP/RPC request
func (h *EventHandler) HandleMessage(w http.ResponseWriter, r *http.Request) {
    go func() {
        // Leaks if external service hangs or channel blocks indefinitely!
        notifyExternalWebhook(payload)
    }()
}
```
**Go-Native Solution:** Use a bounded worker pool or bounded buffered channel with worker goroutines managed by service lifecycle.
```go
// GOOD: Bounded worker pool with backpressure / worker worker pool
type EventDispatcher struct {
    jobs chan EventPayload
}

func (d *EventDispatcher) Dispatch(ctx context.Context, payload EventPayload) error {
    select {
    case d.jobs <- payload:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    default:
        // Backpressure: worker queue full, handle gracefully or enqueue to Redis/NSQ
        return ErrQueueFull
    }
}
```

### 2.2 Sub-Slice Memory Retention (Backing Array Leak)
**Anti-Pattern:** Reslicing large buffers or slices and storing references in long-lived caches or aggregates.
```go
// BAD: Storing 20 bytes from a 10MB raw payload keeps the entire 10MB in memory!
func extractShortToken(rawPayload []byte) []byte {
    return rawPayload[:20] // Backing array of 10MB cannot be garbage collected!
}
```
**Go-Native Solution:** Always clone the sub-slice using `slices.Clone()` (Go 1.21+) or `copy()`.
```go
// GOOD: Independent memory allocation frees the underlying large backing array
import "slices"

func extractShortToken(rawPayload []byte) []byte {
    return slices.Clone(rawPayload[:20])
}
```

### 2.3 Heap Escape Analysis: Concrete Structs vs. `any` / `interface{}`
**Anti-Pattern:** Passing `any` or generic `map[string]interface{}` across internal boundaries, forcing variables onto the heap.
```go
// BAD: Forces heap allocation and prevents compile-time optimization
func (r *Repo) UpdateMetadata(id uuid.UUID, data map[string]interface{}) error
```
**Go-Native Solution:** Use concrete, strongly typed structs or small typed value objects allocated on the stack.
```go
// GOOD: Stack allocatable, zero escape, type-safe
type UserPreferences struct {
    Theme       string `json:"theme"`
    NotifyEmail bool   `json:"notify_email"`
}

func (r *Repo) UpdatePreferences(ctx context.Context, id uuid.UUID, prefs UserPreferences) error
```

---

## 3. Pitfall 2: Architecture Bloat & Pragmatic CQRS

### 3.1 The Redundant Mapping Cascade
In anemic DDD or naive Clean Architecture, a simple query triggers 4 layers of conversion:
`SQL DB Model -> Infra DTO -> Domain Entity -> Application DTO -> HTTP/RPC Response DTO`.

For read operations, this wastes CPU cycles and creates thousands of ephemeral heap allocations.

```
WRONG (Dogmatic CQRS):
DB Model ──(Alloc)──► Domain Entity ──(Alloc)──► App DTO ──(Alloc)──► API Response

CORRECT (Pragmatic CQRS):
[Write Side] Command ──► Domain Aggregate (Protects Invariants) ──► Repository (Persist)
[Read Side]  Query   ──► Infrastructure Direct Projection DTO  ──► API Response
```

### 3.2 Concrete Implementation Rule for Queries
- **Commands (Write):** Pass through Aggregate Root. Aggregate Root enforces business rules and invariants (`ValidatedAggregate`).
- **Queries (Read):** Query handlers query the database directly using `bun` / `sqlc` to scan directly into Application Read Models (DTOs). Do **NOT** instantiate Domain Aggregates for pure read/list operations.

```go
// GOOD: Direct read projection avoiding domain aggregate hydration overhead
type ContactListDTO struct {
    ID          uuid.UUID `bun:"id"`
    DisplayName string    `bun:"display_name"`
    PhoneNumber string    `bun:"phone_number"`
    LeadScore   int       `bun:"lead_score"`
}

func (q *ListContactsHandler) Handle(ctx context.Context, query ListContactsQuery) (*pagination.PageResult[ContactListDTO], error) {
    norm := query.Normalize()
    var items []ContactListDTO
    
    total, err := q.db.NewSelect().
        Model(&items).
        Where("tenant_id = ?", query.TenantID).
        Limit(norm.Limit()).
        Offset(norm.Offset()).
        ScanAndCount(ctx)
    if err != nil {
        return nil, err
    }
    
    return pagination.NewPageResult(items, total, norm), nil
}
```

---

## 4. Pitfall 3: Aggregate Bloating & N+1 Database Queries

### 4.1 The Giant Aggregate Antipattern
An Aggregate is a consistency boundary, **not** a data graph container.
- **BAD:** Loading a `Customer` aggregate that embeds 1,000 `Order` entities, 5,000 `Message` entities, and 200 `Note` entities into Go slices.
- **GOOD:** The `Customer` Aggregate Root holds only identity, state, and summary metrics needed for invariant checks:
```go
// GOOD: Small, bounded Aggregate Root
type Customer struct {
    id          uuid.UUID
    tenantID    uuid.UUID
    status      CustomerStatus
    totalOrders int
    lifetimeVal Money
    // Child collections are referenced by ID or queried independently!
}
```

### 4.2 Eliminating N+1 in Repository & Query Handlers
**Anti-Pattern:** Querying in a `for` loop.
```go
// BAD: 1 query for contacts + N queries for tags! (N+1 latency killer)
contacts, _ := repo.ListContacts(ctx, tenantID)
for _, c := range contacts {
    c.Tags, _ = repo.GetTagsForContact(ctx, c.ID) // DB hit per row!
}
```
**Go-Native Solution:** Batch queries using `bun.In()` or SQL `JOIN` with `json_agg()`.
```go
// GOOD: Batch query in 2 round-trips total, regardless of count
contactIDs := make([]uuid.UUID, len(contacts))
for i, c := range contacts {
    contactIDs[i] = c.ID
}

var tagRelations []ContactTagRelation
err := db.NewSelect().
    Model(&tagRelations).
    Where("contact_id IN (?)", bun.In(contactIDs)).
    Scan(ctx)
// Map relations in Go using O(N) hashmap lookup
```

---

## 5. Pitfall 4: Concurrency Safety & Context Lifecycle

### 5.1 Context Cancellation in Asynchronous Processing
When an HTTP request triggers an asynchronous task or domain event, passing the HTTP `r.Context()` to the background goroutine causes the task to be aborted the moment the HTTP client disconnects or receives headers.

```go
// BAD: Background handler aborted as soon as HTTP response finishes!
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
    user := h.service.Create(r.Context(), cmd)
    go func() {
        // FAILS: r.Context() is canceled immediately after HTTP handler exits!
        h.emailService.SendWelcomeEmail(r.Context(), user.Email) 
    }()
}
```
**Go-Native Solution:** Use `context.WithoutCancel()` (Go 1.21+) or create a detached context with a dedicated timeout.
```go
// GOOD: Retains trace/values from parent context but detaches cancellation
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
    user := h.service.Create(r.Context(), cmd)
    
    // Detach from HTTP request cancellation
    asyncCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 30*time.Second)
    go func() {
        defer cancel()
        h.emailService.SendWelcomeEmail(asyncCtx, user.Email)
    }()
}
```

### 5.2 Transactional Outbox Pattern Over Immediate Async Dispatches
For all mission-critical side-effects (e.g. billing, SMS, Zalo notifications, audit logs):
- Never rely on in-memory fire-and-forget goroutines.
- Write domain events into an `outbox_events` table inside the **exact same database transaction** as the entity mutation.
- A background worker polls or listens via CDC/LISTEN-NOTIFY to reliably dispatch events.

---

## 6. Pitfall 5: Java/C# Paradigm Traps in Go

### 6.1 The "IInterface" / "Implementation" Virus
In Java/C#, developers define interfaces before writing any implementation:
`interface IUserService` -> `class UserServiceImpl`.

In Go, this is an anti-pattern:
1. **Accept interfaces, return structs**: Functions should receive interfaces for their dependencies and return concrete structs.
2. **Consumer-defined interfaces**: Define interfaces in the package that *uses* them, not in the package that implements them.
3. If there is only 1 implementation of a service, **do not create an interface**. Create an interface only when you need mock injection for testing or alternate implementations.

```go
// BAD: Pre-mature interface in domain/service package with one implementation
package user
type UserService interface { ... } // Unnecessary abstraction!
type userServiceImpl struct { ... }

// GOOD: Package exports concrete struct. Calling package defines what it needs:
package user
type Service struct { ... }
func NewService(...) *Service { ... }

// Calling package (e.g. HTTP handler) defines interface if testing requires:
package http
type UserCreator interface {
    Create(ctx context.Context, cmd CreateUserCmd) (*User, error)
}
```

### 6.2 Naming Conventions
- Never prefix interfaces with `I` (e.g., `IUserRepository` -> `UserRepository`).
- Never suffix implementations with `Impl` (e.g., `UserRepositoryImpl` -> `PostgresUserRepository` or simply `Repository` under `postgres` package).
- Single-method interfaces should end in `er` (e.g., `Reader`, `Writer`, `Validator`, `TokenParser`).

---

## 7. AI Coding Agent Enforce Checklist

Every AI agent implementing code in `omni-core` must verify against this checklist before opening a Pull Request:

- [ ] **No Naked Goroutines**: Every goroutine runs within a managed worker pool or has explicit context lifetime.
- [ ] **No Large Slice Leaks**: Any sliced sub-array stored long-term uses `slices.Clone()`.
- [ ] **Pragmatic Read Side**: Queries do not re-hydrate full domain aggregates unless domain invariants are evaluated.
- [ ] **No N+1 Queries**: All list queries batch related records using `bun.In()` or SQL joins.
- [ ] **Context Lifecycle Safe**: Async handlers/events use `context.WithoutCancel(ctx)` with timeout.
- [ ] **Idiomatic Interfaces**: Interfaces live at consumer call-sites. No `I*` prefixes or `*Impl` suffixes.
- [ ] **Single Source of Truth**: All listing APIs embed `pkg/pagination.PaginationParam` and return standard page results.
