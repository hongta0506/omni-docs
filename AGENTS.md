# AGENTS.md — Omni Docs (AI Coding Agent Directives & Operational Standard)

> **MANDATORY INSTRUCTIONS FOR ALL AI CODING AGENTS WORKING IN THE OMNI PLATFORM.**
> All agents working in `omni-docs` and `omni-core` must strictly abide by every directive in this document.

---

## 0. CRITICAL: Communication Language

**ALL explanations, analyses, summaries, discussions, and responses directed to the user MUST be in VIETNAMESE.**
Variable names, function names, class names, file paths, git commands, SQL queries, JSON/YAML payloads, and Protobuf schemas remain in their original English form.

---

## 1. Docs-First & Mandatory Skill Preload

### 1.1 Docs-First Principle
Before touching code or architecture, read documentation in order:
1. `omni-docs/architecture/MASTER-ARCHITECTURE-BLUEPRINT.md`: Full 615 endpoints and 8 Bounded Contexts.
2. `omni-docs/architecture/NEXTGEN-GOLANG-DDD-SPEC.md`: Go Clean DDD & Connect-RPC specifications.
3. `omni-docs/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`: Critical Go performance, concurrency & anti-pattern rules.
4. `omni-docs/migration/DDD-MIGRATION-MASTER-PLAN.md`: Overall migration roadmap for the 8 Bounded Contexts.

### 1.2 Mandatory Skill Preload
- **Business Analysis & Requirements (REQUIRED FIRST AT DOCS)**: `business-analyst` (`/business-analyst`). Jobs-to-Be-Done, 5 Whys, Ubiquitous Language normalization, User Stories with BDD Acceptance Criteria (Given/When/Then), Tenant/Role/Plan boundaries.
- **Domain Modeling & Bounded Contexts**: `ForceInjection/domain-driven-design-skills` (`/ddd-scope`, `/ddd-contexts`, `/ddd-aggregates`, `/ddd-domain-interactions`).
- **Go DDD Implementation**: `joeyave/golang-ddd-skills` (`/golang-ddd`, `/golang-ddd-architecture`, `/golang-ddd-cqrs`, `/golang-ddd-infrastructure`).
- **Testing & Quality Rigor**: `addyosmani/agent-skills` (`/test-driven-development`, `/code-review-and-quality`, `/spec-driven-development`).

---

## 2. Bounded Context & Submodule Directory Standards

All business logic must be placed in the proper Bounded Context (`internal/<bc_name>/`). Flat file structures across root layers are strictly prohibited. Organize all 4 layers by submodules:

```
internal/<bc_name>/
├── domain/                         # Layer 1: Domain (Zero external dependencies)
│   ├── <submodule_a>/              # Dedicated Sub-domain / Aggregate cluster
│   │   ├── <aggregate_root>.go     # Aggregate Root, Entities, Invariants
│   │   ├── <value_objects>.go      # Value Objects (immutable, self-validating)
│   │   ├── events.go               # Domain Events
│   │   ├── repository.go           # Repository Port interface (*Validated<Aggregate> only)
│   │   └── validation.go           # Validated<Aggregate> wrapper
│   └── errors.go                   # BC-wide domain errors
│
├── application/                    # Layer 2: CQRS Application
│   └── <submodule_a>/              # Matches domain submodule layout
│       ├── commands/               # State mutations
│       │   ├── create_handler.go
│       │   └── update_handler.go
│       └── queries/                # DTO read projections
│           ├── get_handler.go
│           └── list_handler.go
│
├── infrastructure/                 # Layer 3: Persistence & Adapters
│   ├── <submodule_a>/
│   │   ├── postgres_repository.go  # Bun ORM / sqlc / pgx repository
│   │   └── models.go               # DB table schemas & mappings
│   └── client/                     # External service/SDK clients
│
└── interfaces/                     # Layer 4: Multi-Protocol Delivery
    ├── http/                       # REST ServeMux (Go 1.22+) flat handlers per resource
    │   ├── handler.go              # Main router & RegisterRoutes(mux *http.ServeMux)
    │   ├── <submodule_a>_handler.go
    │   └── <submodule_b>_handler.go
    ├── grpc/                       # Connect-RPC / gRPC server implementations
    │   ├── <submodule_a>_service.go
    │   └── <submodule_b>_service.go
    ├── ws/                         # Realtime WebSocket hub & handlers
    └── stream/                     # Server-Sent Events (SSE) token streaming
```

### 2.1 Shared Kernel & Common Conventions (Mandatory across all BCs)
1. **Pagination**:
   - Flat list endpoints must use `omni-core/pkg/pagination` (`PaginationParam`, `PageResult[T]`).
   - Query structs embed `pagination.PaginationParam`.
   - CQRS Query Handlers call `norm := q.Normalize()`, pass `norm.Limit()` and `norm.Offset()` to repositories, and return `*pagination.PageResult[T]`.
   - REST responses return uniform JSON: `{ "items": [...], "total": ..., "page": ..., "limit": ..., "totalPages": ..., "hasNext": ... }`.
   - Connect-RPC returns `&commonv1.PaginationResponse{}`.
   - Do NOT apply offset pagination to hierarchical tree structures (`departments_tree`, `permission_groups_tree`, `settings`).
2. **Error Classification**:
   - Use `omni-core/pkg/errors` (`CodeNotFound`, `CodeConflict`, `CodeInvalidInput`, `CodeUnauthorized`, `CodeForbidden`, `CodeInternal`). Map explicitly to HTTP status codes and Connect-RPC codes.
3. **Identity & Tenant Claims**:
   - Use `omni-core/pkg/auth`. Safely retrieve `TenantID` and `UserID` from `auth.UserClaimsFromContext(ctx)`. Never trust raw client input for tenant identity.
4. **UUID Generation**:
   - Use `omni-core/pkg/uid` (`uid.New()`, `uid.IsValid()`) or `github.com/google/uuid`. Never generate ad-hoc random strings.

### 2.2 The 8 Bounded Contexts

| Bounded Context | Package Path | Scope & Endpoints | Count |
|---|---|---|---|
| **1. Identity & Settings** | `internal/identity` | `/api/v1/auth/*`, `/api/v1/users/*`, `/api/v1/departments/*`, `/api/v1/rbac/*`, `/api/v1/settings/*` | 72 |
| **2. Channel & Gateway** | `internal/channel` | `/api/v1/zalo-accounts/*`, `/api/v1/zalo-groups/*`, `/api/v1/telegram-personal/*`, `/api/v1/integrations/*` | 95 |
| **3. Customer & Lead** | `internal/customer` | `/api/v1/contacts/*`, `/api/v1/leads/*`, `/api/v1/lead-pool/*`, `/api/v1/customer-lists/*`, `/api/v1/scoring/*` | 92 |
| **4. Conversation & Media** | `internal/conversation` | `/api/v1/conversations/*`, `/api/v1/messages/*`, `/api/v1/chat/presets/*`, `/api/v1/media/*` | 82 |
| **5. Deal & E-commerce** | `internal/deal` | `/api/v1/deals/*`, `/api/v1/quotes/*`, `/api/v1/products/*`, `/api/v1/pricebook/*`, `/api/v1/order-store/*` | 85 |
| **6. Marketing & Automation** | `internal/marketing` | `/api/v1/tags/*`, `/api/v1/broadcasts/*`, `/api/v1/campaigns/*`, `/api/v1/marketing/sequences/*`, `/api/v1/automation/*` | 84 |
| **7. AI Agent & Knowledge** | `internal/aiagent` | `/api/v1/ai-agents/*`, `/api/v1/goclaw-providers/*`, `/api/v1/ai/knowledge/*`, `/api/v1/ops-radar/*` | 65 |
| **8. Service API & Gateway** | `internal/serviceapi` | `/api/v1/service/whoami`, `/api/v1/service/messages/send`, `/api/v1/service/leads/assign`, `/api/v1/analytics/*` | 40 |

---

## 3. Five Mandatory Golang Performance & Anti-Pattern Rules

Detailed guide: `omni-docs/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`.

1. **Memory & GC Hygiene**:
   - No unbounded `go func()`. Use managed worker pools or bounded buffered channels with backpressure.
   - Sliced sub-arrays stored long-term must be copied via `slices.Clone()` (Go 1.21+) to prevent backing array retention.
   - Use concrete structs instead of `any` or `map[string]interface{}` to enable compiler escape analysis on the stack.
2. **Pragmatic CQRS Read Projections**:
   - Write paths: Command -> Aggregate Root (enforces invariants) -> Repository.
   - Read paths: Query -> Direct DB Model Scan into Application DTO. Do NOT re-hydrate full domain aggregates for read queries.
3. **Small Aggregate Boundaries & Batch Queries**:
   - Aggregates hold identities and boundary metrics, never unbounded slices of children.
   - Never query DB inside loops. Always batch query using `bun.In()` or SQL `JOIN` / `json_agg()`.
4. **Concurrency & Context Lifecycle**:
   - Never pass HTTP `r.Context()` to async goroutines. Use `context.WithoutCancel(r.Context())` with a timeout.
   - Critical async side-effects must use Transactional Outbox in the same DB transaction.
5. **Java/C# Paradigm Traps**:
   - "Accept interfaces, return structs".
   - Define interfaces in the consumer package.
   - No `I*` prefixes or `*Impl` suffixes.
   - Do NOT create single-implementation interfaces unless needed for mock injection.

---

## 4. Git, Branching & Sprint Board Automation

### 4.1 Protected Branches
- `main`: Production releases only. **DIRECT PUSH FORBIDDEN.**
- `staging`: QA / Integration testing. **DIRECT PUSH FORBIDDEN.**
- All changes must go through a feature branch and Pull Request into `staging`.

### 4.2 Standard Branch & Commit Workflow
```bash
git checkout staging && git pull origin staging
git checkout -b <type>/<issue-number>-<short-kebab-desc>
# Implement and test
git commit -m "<type>(<scope>): <short description> (closes #<issue>)"
git push origin <branch-name>
gh pr create --base staging --title "[BC-name] <type>: <description>" --body "..."
```

### 4.3 Sprint Board Automation (MANDATORY)
- **Project Board**: `Omni Core — Backend DDD Sprint Board` (ID: `PVT_kwHOD3RGJc4Bkgl_`)
- **Field Status ID**: `PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0`
- **Option IDs**: Todo (`f75ad846`), In Progress (`47fc9ee4`), Done (`98236657`)
- **Rules**:
  1. Query active tasks before starting. Never pick up an `In Progress` task.
  2. Transition task to `In Progress` immediately upon starting work:
     ```bash
     gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
       --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 47fc9ee4
     ```
  3. Transition task to `Done` upon PR merge / issue closure:
     ```bash
     gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
       --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 98236657
     ```
