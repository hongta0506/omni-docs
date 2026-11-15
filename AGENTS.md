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

### 1.3 Standard Issue Creation Rules (MANDATORY)
Every GitHub Issue created or updated for AI Agents must strictly adhere to the authoritative specification in [`STANDARD-GITHUB-ISSUE-SPECIFICATION.md`](architecture/STANDARD-GITHUB-ISSUE-SPECIFICATION.md):
- **Backend (`omni-core`)**: Follow the 7-section structure, locking all 8 items of the Go DDD anti-pattern checklist verbatim, enforcing strict file boundary isolation, and mandating `pkg/pagination` on every list endpoint (Detailed in [Section 4.4](#44-standard-issue-specification--anti-pattern-locking-mandatory)).
- **Frontend (`omni-web`)**: Follow the Frontend UX/UI & State Machine standard, isolating Views/Components/Composables boundaries, strictly prohibiting backend code and database DDL (Detailed in [Section 4.6](#46-standard-frontend-issue-specification-omni-web-mandatory)).
- **Zero-Tolerance Quality Enforcement**: Truncating the 8-item anti-pattern checklist, omitting `pkg/pagination.PaginationParam` / `PageResult[T]` on collection queries, or closing issues with unchecked checkboxes (`- [ ]`) is strictly prohibited.

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
   - Write paths: Command -&gt; Aggregate Root (enforces invariants) -&gt; Repository.
   - Read paths: Query -&gt; Direct DB Model Scan into Application DTO. Do NOT re-hydrate full domain aggregates for read queries.
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
   - **Logging**: Always use `pkg/logger`. Never use `fmt.Println` or `log.Printf` in production code. All logs must emit Structured JSON to `stdout` containing `trace_id`, `tenant_id`, `bounded_context`, and `submodule` for Grafana Loki ingestion. For business actions/commands, ALWAYS use `logger.LogAudit(ctx, logger.AuditEntry{...})` - never use ad-hoc `logger.InfoContext` without audit structure.
   - **Exceptions**: Always use `pkg/errors`. Never return anonymous `errors.New("raw string")`. Every domain error must be classified into `ClassificationTransient`, `ClassificationTerminal`, or `ClassificationSecurityPolicy`.
   - **Third-Party I/O Resilience**: All external API calls (Zalo, Meta, Telegram, Webhooks, external HTTP) must execute through `pkg/resilience.ExecuteWithRetry` or Circuit Breaker.
   - **Dead Letter Queue (DLQ)**: Failed critical async outbound jobs (messages, order sync, webhooks) that exhaust retries must persist to `system_outbound_dlq` for manual redrive.
7. **Strict Error Propagation & Anti-Silent Mock Fallback (CRITICAL ANTI-PATTERN)**:
   - **ZERO SILENT MOCK FALLBACKS**: Strictly prohibit fallback logic that returns fake mock IDs (`uuid.New().String()`) or static success responses (`map[string]any{"ok": true}`) when `err != nil` or dependencies are missing (`cmds == nil`, `db == nil`). The violation is the fallback, not the response shape: a 2xx write on a happy path is correct code, a 2xx write inside an error guard is not. Gate Check 1 walks the diff context to tell them apart.
   - If a command/query fails or returns an error, the HTTP handler MUST propagate the true error status code (`400 Bad Request`, `404 Not Found`, `409 Conflict`, `500 Internal Error`) via `pkg/errors`.
   - Never write production fallback mocks just to make unit tests pass with nil dependencies. Write real mocks/stubs inside `*_test.go` using `sqlmock` or in-memory repositories instead.
8. **Test Thread-Safety & Race Prevention (MANDATORY FOR ALL TESTS)**:
   - All CI tests run under `go test -race ./...`. Any detected data race will fail the build immediately.
   - Mock repositories and in-memory test fakes accessed across multiple goroutines (HTTP server, background dispatch loops, event streams) MUST protect shared memory using `sync.Mutex` or `sync.RWMutex`.
   - Never use blind `time.Sleep` to wait for async state changes; synchronize via channels, `sync.WaitGroup`, or mutex-guarded polling.

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
# MANDATORY LOCAL QUALITY GATE: chay script verify o local truoc khi commit/push
bash scripts/ci/verify_agents_rules.sh
go test -race ./...

git commit -m "<type>(<scope>): <short description> (closes #<issue>)"
git push origin <branch-name>
gh pr create --base staging --title "[BC-name] <type>: <description>" --body "..."

# MANDATORY: watch and verify CI checks before merging or closing the issue
gh pr checks <PR_NUMBER_OR_URL> --watch

# If CI checks fail, the agent MUST extract the exact failure logs:
gh run view --log-failed

# Only merge when every CI check passes (SUCCESS)
gh pr merge <PR_NUMBER_OR_URL> --squash --delete-branch
```

### 4.3 Sprint Board Automation (MANDATORY)
- **Project Board**: `Omni Core - Backend DDD Sprint Board` (ID: `PVT_kwHOD3RGJc4Bkgl_`)
- **Field Status ID**: `PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0`
- **Option IDs**: Todo (`f75ad846`), In Progress (`47fc9ee4`), Done (`98236657`)
- **Rules**:
  1. Query active tasks before starting. Never pick up an `In Progress` task.
  2. Transition the task to `In Progress` immediately upon starting work:
     ```bash
     gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
       --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 47fc9ee4
     ```
  3. Transition the task to `Done` upon PR merge / issue closure:
     ```bash
     gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
       --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 98236657
     ```

### 4.4 Standard Issue Specification & Anti-Pattern Locking (MANDATORY)
Every GitHub Issue created on `omni-core` or assigned to an AI Agent MUST follow the authoritative template in [`STANDARD-GITHUB-ISSUE-SPECIFICATION.md` Section 2](architecture/STANDARD-GITHUB-ISSUE-SPECIFICATION.md). That template owns the wording; this section only pins the parts that must never drift:

- **7 mandatory sections, verbatim**: Context & Goal; Affected Submodule & Strict File Boundaries; Source Docs & Reference; Domain Invariants; Observability, Logging & Exception Contract; Go DDD Performance & Anti-Pattern Checklist; Acceptance Criteria (+ Git Workflow).
- **The 8-item anti-pattern checklist is mandatory in full.** Truncating it to 2 or 3 items is prohibited (see spec Section 4).
- **Pagination contract on every collection query** (see spec Section 3): URI `?page=&page_size=`, application query embeds `pkg/pagination.PaginationParam`, handler calls `norm := q.Normalize()` and passes `norm.Limit()` / `norm.Offset()`, response is `pkg/pagination.PageResult[T]` rendered as `{ items, total, page, limit, totalPages, hasNext }`.
- **File boundaries are never vague.** The forbidden-area list is mandatory so concurrent agents cannot collide.
- **Zero unchecked boxes at closure.** Deferred scope becomes a new linked issue before the original closes (see 4.5).

### 4.5 Mandatory Acceptance Criteria & Endpoint Verification Audit (STRICT GATE BEFORE PR & ISSUE CLOSURE)
> **CRITICAL RULE FOR ALL DEVELOPERS & AI AGENTS:**
> An issue or PR MUST NEVER be closed or moved to `Done` while checkboxes (`- [ ]`) in the GitHub Issue body remain unchecked, OR while CI checks have not passed.

1. **Zero Unchecked Items on Done:** every route, invariant, and test item under `Acceptance Criteria` and the anti-pattern checklist MUST be verified against actual code before closing.
2. **Mandatory Local Verification Gate (PRE-COMMIT / PRE-PR):**
   ```bash
   bash scripts/ci/verify_agents_rules.sh
   go test -race ./internal/<bc>/...
   ```
   If the script reports `FAILED` at any step, fix it before pushing. Pushing code to "try CI" is prohibited.
3. **Mandatory CI Verification Gate & Failure Inspection:**
   - Wait for checks with `gh pr checks <PR_NUMBER_OR_URL> --watch`.
   - On failure, extract the exact output with `gh run view --log-failed`. Do not guess at the failure.
   - Fix on the feature branch, push, and wait for green. Merging or closing while checks are pending or failing is STRICTLY FORBIDDEN.
4. **Pre-PR Issue Sync:** audit the codebase, then update the issue body via `gh issue edit <ISSUE_ID>` to flip verified `- [ ]` to `- [x]` BEFORE opening the PR.
5. **Unimplemented / Deferred Scope Isolation:** an unchecked item may never be left behind in a closed issue. Extract it into a linked follow-up issue first, then close.
6. **PR Body Acceptance Criteria Table:** every PR description MUST include an **Acceptance Criteria Verification** table listing each endpoint, its file location, and test status.

### 4.6 Standard Frontend Issue Specification (`omni-web` Mandatory)
Every frontend issue created on `hongta0506/omni-web` MUST follow the authoritative template in [`STANDARD-GITHUB-ISSUE-SPECIFICATION.md` Section 5](architecture/STANDARD-GITHUB-ISSUE-SPECIFICATION.md). The non-negotiables:

- **Repo isolation:** operate strictly inside `omni-web` frontend paths. Inserting Go code, SQL schemas, or backend DDL into a frontend issue is STRICTLY PROHIBITED.
- **Boundary layout:** Views `src/views/<FeatureView>.vue`; Components `src/components/<feature>/`; Composables/State `src/composables/` and `src/stores/`; Types `src/types/<feature>.ts`; API services `src/api/<feature>.ts`.
- **5 UI states are mandatory:** Loading (skeleton), Empty (icon + CTA), Error (real HTTP status via toast/alert with retry), Active/Populated (dense readable tables with status chips), In-Action (disabled control + spinner/progress).
- **Design system:** Vuetify 3 + Lucide icons, semantic theme tokens only, zero arbitrary inline overrides, tooltips on icon buttons, `v-dialog` confirmation before destructive actions.
- **Anti-cheat zero mock:** never inject dummy arrays or fake objects. Every call hits a real endpoint or surfaces the real HTTP error.
- **Frontend quality gate:** 100% TypeScript, no bare `any` without a type guard, `pnpm run build` passes with 0 errors, EventBus/Socket.IO/intervals cleaned in `onUnmounted()`, flat lists use server-side `page` / `limit`.
