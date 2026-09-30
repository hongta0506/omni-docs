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

### 1.3 Rules Chuẩn Khi Tạo/Cập Nhật Issue GitHub (MANDATORY)
Mọi GitHub Issue tạo mới hoặc cập nhật trên `omni-core` phục vụ AI Agent bắt buộc phải có cấu trúc 7 phần, khóa 5 bẫy Go DDD và ranh giới cách ly file chống conflict. Chi tiết quy chuẩn xem mục [4.4 Standard Issue Specification & Anti-Pattern Locking](#44-standard-issue-specification--anti-pattern-locking-mandatory).

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

## 3. Mandatory Golang Performance, Anti-Pattern & Resilience Rules

Detailed guide: `omni-docs/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md` and `omni-docs/architecture/CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md`.

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
6. **Observability, Structured Logging & Exception Standards (MANDATORY FOR ALL BCS)**:
   - **Logging**: Always use `pkg/logger`. Never use `fmt.Println` or `log.Printf` in production code. All logs must emit Structured JSON to `stdout` containing `trace_id`, `tenant_id`, `bounded_context`, and `submodule` for Grafana Loki ingestion. For business actions/commands, ALWAYS use `logger.LogAudit(ctx, logger.AuditEntry{...})` — never use ad-hoc `logger.InfoContext` without audit structure.
   - **Exceptions**: Always use `pkg/errors`. Never return anonymous `errors.New("raw string")`. Every domain error must be classified into `ClassificationTransient`, `ClassificationTerminal`, or `ClassificationSecurityPolicy`.
   - **Third-Party I/O Resilience**: All external API calls (Zalo, Meta, Telegram, Webhooks, external HTTP) must execute through `pkg/resilience.ExecuteWithRetry` or Circuit Breaker.
   - **Dead Letter Queue (DLQ)**: Failed critical async outbound jobs (messages, order sync, webhooks) that exhaust retries must persist to `system_outbound_dlq` for manual redrive.
7. **Strict Error Propagation & Anti-Silent Mock Fallback (CRITICAL ANTI-PATTERN)**:
   - **ZERO SILENT MOCK FALLBACKS**: Strictly prohibit fallback logic that returns fake mock IDs (`uuid.New().String()`) or static success responses (`map[string]any{"ok": true}`) when `err != nil` or dependencies are missing (`cmds == nil`, `db == nil`).
   - If a command/query fails or returns an error, the HTTP handler MUST propagate the true error status code (`400 Bad Request`, `404 Not Found`, `409 Conflict`, `500 Internal Error`) via `pkg/errors`.
   - Never write production fallback mocks just to make unit tests pass with nil dependencies. Write real mocks/stubs inside `*_test.go` using `sqlmock` or in-memory repositories instead.

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
# MANDATORY LOCAL QUALITY GATE: Chạy script verify ở local trước khi commit/push!
bash scripts/ci/verify_agents_rules.sh
go test -race ./...

git commit -m "<type>(<scope>): <short description> (closes #<issue>)"
git push origin <branch-name>
gh pr create --base staging --title "[BC-name] <type>: <description>" --body "..."

# MANDATORY: Watch and verify CI checks before merging or closing issue
gh pr checks <PR_NUMBER_OR_URL> --watch

# If CI checks fail, AI Agent MUST immediately extract exact failure logs:
gh run view --log-failed

# Only merge when all CI checks pass (SUCCESS)
gh pr merge <PR_NUMBER_OR_URL> --squash --delete-branch
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

### 4.4 Standard Issue Specification & Anti-Pattern Locking (MANDATORY)
Every GitHub Issue created on `omni-core` or assigned to an AI Agent must strictly follow the standard structure below. Furthermore, every functional issue MUST explicitly define the **Observability, Logging & Exception Contract** extending `pkg/logger`, `pkg/errors`, and `pkg/resilience` so that implementing agents automatically adhere to system-wide observability without drift:

```markdown
## Context & Goal
Describe business goal, target Bounded Context, and submodule.

## Affected Submodule & Strict File Boundaries
> **MULTI-AGENT FILE ISOLATION (CRITICAL FOR CONCURRENT WORK):**
> AI Agents working on this task MUST strictly operate within designated paths. Modifying files outside the boundary is strictly prohibited.

- **Domain Layer:** `internal/<bc>/domain/<submodule>/`
- **Application Layer:** `internal/<bc>/application/<submodule>/`
- **Infrastructure Layer:** `internal/<bc>/infrastructure/<submodule>/`
- **Interfaces Layer:** `internal/<bc>/interfaces/http/<submodule>_handler.go`
- **Forbidden Area:** List files / submodules currently assigned to other agents or outside this scope.

## Source Docs & Reference (Master Branch)
- Architecture Blueprint: [MASTER-ARCHITECTURE-BLUEPRINT.md](https://github.com/hongta0506/omni-docs/blob/master/architecture/MASTER-ARCHITECTURE-BLUEPRINT.md)
- Subdomain Mapping: Detailed context documentation in `contexts/`
- Resilience & Error Handling: [CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md](https://github.com/hongta0506/omni-docs/blob/master/architecture/CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md)
- Performance & Anti-Patterns: [GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md](https://github.com/hongta0506/omni-docs/blob/master/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md)
- Legacy Reference: Original Fastify/Prisma source files

## Domain Invariants
List invariant rules that Aggregate Root and Value Objects must enforce.

## Observability, Logging & Exception Contract (EXTENDS SPRINT 7 RESILIENCE STANDARD)
> **MANDATORY CODING RULES FOR IMPLEMENTING AGENTS:**
> 1. **Structured Logging:** Use `pkg/logger` to stream JSON to `stdout` for Grafana Loki ingestion. Include `trace_id`, `tenant_id`, `bounded_context`, `submodule`, `action_taken`, and `duration_ms`. NEVER use `fmt.Println` or stdlib `log.Printf`.
> 2. **Error Taxonomy:** Map every technical/domain failure to `pkg/errors` with classification (`Transient`, `Terminal`, `SecurityPolicy`). NEVER return unclassified raw errors.
> 3. **External I/O Resilience:** Wrap any 3rd-party or external network call in `pkg/resilience.ExecuteWithRetry` or Circuit Breaker.
> 4. **DLQ Persistence:** Route unrecoverable outbound messages / async jobs to `system_outbound_dlq`.

| Exception Group | Technical / Domain Error List | System Action | Resilience Strategy (Retry / Circuit Breaker / DLQ) |
|---|---|---|---|
| **Transient** | Network timeout, 429 RateLimit, DB deadlock | Auto retry | Exponential Backoff with Jitter (Base 500ms-2s, Max 3 retries) |
| **Terminal** | Validation failure, Entity not found, Recipient blocked | Abort immediately | Log Terminal error, route to `system_outbound_dlq` if outbound job |
| **Security/Policy** | Token expired, Account checkpointed, Session banned | Disconnect session | Open Circuit Breaker, trigger Admin/Ops alert |

- **Log Event Names & Action Taken:**
  - Success event: `<SUBMODULE>_SUCCESS` (e.g. `CUSTOMER_TIMELINE_QUERIED`, `ORDER_SYNCED`)
  - Warning/Retry event: `<SUBMODULE>_RETRIED`
  - Failure/DLQ event: `<SUBMODULE>_FAILED`, `<SUBMODULE>_SENT_TO_DLQ`

## Go DDD Performance & Anti-Pattern Checklist (MANDATORY)
> AI Agent must verify against `omni-docs/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`:

- [ ] **Small Aggregate (Pitfall 3):** Aggregate Root ONLY stores identity, metadata, and summary metrics; NO large slices in RAM.
- [ ] **Pragmatic CQRS (Pitfall 2):** Queries scan directly from DB into Read Projection DTOs, NEVER hydrating full Domain Aggregates.
- [ ] **No N+1 (Pitfall 3):** Batch fetch via SQL JOIN or `bun.In()`, NEVER query in a loop.
- [ ] **Idiomatic Go (Pitfall 5):** Accept interfaces, return structs. No `I*` prefix or `*Impl` suffix.
- [ ] **Standard Pagination (Shared Kernel):** Embed `pkg/pagination.PaginationParam`, normalize via `Normalize()`, and return `PageResult[T]`.
- [ ] **Context Lifecycle (Pitfall 4):** Never pass `r.Context()` to async goroutines without detaching via `context.WithoutCancel()`.
- [ ] **Resilience & Observability (Mandatory for MVP):** Use `pkg/logger.LogAudit` (JSON stdout), classify errors via `pkg/errors`, and apply retry/circuit breaker via `pkg/resilience`.
- [ ] **No Silent Fallback (Anti-Cheat):** Zero fake mock fallbacks (`uuid.New()`, `{"ok": true}`) when `err != nil`. Errors must propagate genuine HTTP 4xx/5xx status codes.

## Acceptance Criteria
- [ ] HTTP / Connect-RPC endpoints checklist
- [ ] Unit tests for Domain Invariants & Value Objects
- [ ] Repository integration tests with Bun ORM / pgx
- [ ] Observability tests verifying Structured JSON log output and error classification

## Git Workflow
```bash
git checkout staging && git pull origin staging
git checkout -b <type>/<issue-number>-<short-kebab-desc>
```
```

### 4.5 Mandatory Acceptance Criteria & Endpoint Verification Audit (STRICT GATE BEFORE PR & ISSUE CLOSURE)
> **CRITICAL RULE FOR ALL DEVELOPERS & AI AGENTS:**
> An issue or PR MUST NEVER be closed or moved to `Done` while checkboxes (`- [ ]`) in the GitHub Issue body remain unchecked, OR while CI checks have not passed.
>
> 1. **Zero Unchecked Items on Done:**
>    - Every route, invariant, and test item listed under `Acceptance Criteria` and `Anti-Pattern Checklist` MUST be verified against actual code before closing the issue.
> 2. **Mandatory Local Verification Gate (PRE-COMMIT / PRE-PR REQUIREMENT):**
>    - AI Agent BẮT BUỘC phải thực thi script kiểm tra quy tắc AGENTS.md và race detector ở môi trường local trước khi push hoặc tạo PR:
>      ```bash
>      # Bước 1: Chạy kiểm tra 9 chốt chặn chống Mock và Anti-pattern ở local
>      bash scripts/ci/verify_agents_rules.sh
>      # Bước 2: Chạy kiểm tra Race condition
>      go test -race ./internal/<bc>/...
>      ```
>    - Nếu script báo `FAILED` ở bất kỳ bước nào (Silent mock fallback, LogAudit thiếu, In-Memory DB mock, PII leak, Pagination sai chuẩn), Agent PHẢI sửa triệt để trước khi push. Nghiêm cấm push code để "thử nghiệm CI".
> 3. **Mandatory CI Verification Gate & Failure Inspection:**
>    - AI Agent MUST explicitly wait for CI/CD checks to complete using `gh pr checks <PR_NUMBER_OR_URL> --watch`.
>    - If any check fails (e.g. `Enforce AGENTS.md Rules` or `Go Test Suite`), the agent MUST run:
>      ```bash
>      gh run view --log-failed
>      ```
>      to extract the exact error lines, stack trace, and race detector warnings. The agent MUST NOT guess or ignore failure output.
>    - The agent MUST fix the violations on the feature branch, push the changes, and wait for CI to return a green `pass` status.
>    - It is STRICTLY FORBIDDEN to merge a PR or close an issue when CI checks are in pending or failing state.
> 4. **Pre-PR Issue Sync Command:**
>    - Dev/AI Agent MUST audit the codebase and update the GitHub Issue body via `gh issue edit <ISSUE_ID>` to mark all completed items with `[x]` BEFORE opening the PR or merging:
>      ```bash
>      # Verify routes in codebase
>      grep -rn "POST /api/v1/..." internal/<bc>/interfaces/http/
>      # Update issue body to reflect [x]
>      gh issue edit <ISSUE_ID> --body "<body_with_checked_boxes>"
>      ```
> 5. **Unimplemented / Deferred Scope Isolation:**
>    - If any endpoint or invariant cannot be completed within the current PR/task, it is STRICTLY FORBIDDEN to leave it as an unchecked `- [ ]` in a closed issue.
>    - The agent/developer MUST extract the uncompleted items into a new follow-up GitHub Issue first, remove them from the original issue, and link the new issue before ticking remaining items and closing.
> 6. **PR Body Acceptance Criteria Table:**
>    - Every PR description MUST explicitly include an **Acceptance Criteria Verification** table listing every endpoint, its file location, and test verification status.


