# CLAUDE.md — Omni Platform (Architecture, Docs & Backend Go)

> Technical, behavioral, and architectural guidelines for developing and maintaining the Omni platform (`omni-docs` and `omni-core`).
> All AI coding agents MUST strictly follow every directive in this document.

---

## 0. Communication Language

**All explanations, summaries, plans, and conversational interactions with the user MUST be conducted in VIETNAMESE.**
Technical identifiers, variable and function names, file paths, git commands, SQL queries, JSON/YAML payloads, and Protobuf schemas remain in their original English form.

---

## 1. Skill Preload (Mandatory Before Any Design, Code, or Migration)

Before executing any design or coding task, activate the required specialized skills:

### Suite A: Strategic & Tactical Domain Modeling (`ForceInjection/domain-driven-design-skills`)
Use for domain analysis, boundary definition, invariant discovery, and model validation:
- `/ddd-scope` — scope convergence: problem statement, goals/non-goals, constraints
- `/ddd-discover` — collaborative domain discovery: event flows, command/event candidates
- `/ddd-subdomains` — subdomain classification (Core / Supporting / Generic)
- `/ddd-contexts` — bounded context design, ubiquitous language glossary, boundary ADRs
- `/ddd-context-map` — context mapping: integration patterns (ACL, OHS, PL, Shared Kernel)
- `/ddd-aggregates` — aggregate design: invariants, entities, value objects, transaction boundaries
- `/ddd-domain-interactions` — domain events catalog, domain services, repository interfaces, factories
- `/ddd-model-review` — model quality audit: consistency scoring, completeness check, coupling analysis
- `/ddd-openspec-bridge` — map DDD tactical artifacts to OpenSpec structured specifications

### Suite B: Go DDD Implementation (`joeyave/golang-ddd-skills`)
Use for writing Go code, refactoring legacy Node.js, or structuring layers:
1. `/golang-ddd` — Go DDD workflow orchestrator (invoke first)
2. `/golang-ddd-architecture` — layer boundaries and aggregate definitions
3. `/golang-ddd-refactor` — porting legacy Node.js code to Go DDD
4. `/golang-ddd-cqrs` — command and query separation
5. `/golang-ddd-infrastructure` — sqlc/bun and transactional outbox patterns

### Suite C: Engineering Rigor & GSD Execution (`addyosmani/agent-skills`)
Use during execution, testing, and quality review:
1. `/test-driven-development` — Red-Green-Refactor loop; Prove-It pattern (reproduction test before fix)
2. `/incremental-implementation` — Thin slices, sequential verified delivery
3. `/code-simplification` — Code minimalism, YAGNI, eliminate premature abstractions
4. `/debugging-and-error-recovery` — Root cause analysis when tests fail, zero guessing
5. `/code-review-and-quality` — Rigorous quality review before creating Pull Requests

### Suite D: Business Analysis & Specification (`business-analyst`)
Use at docs and requirements stage:
- `/business-analyst` — Jobs-to-Be-Done, 5 Whys, Ubiquitous Language normalization, User Stories with BDD Acceptance Criteria (Given/When/Then), Tenant/Role/Plan boundary definition.

**Rule**: Suite D for requirements → Suite A for domain modeling → Suite B for Go implementation → Suite C for testing & execution rigor. Never start coding without running the relevant skill first.

---

## 2. Docs-First Rule

Always read the authoritative documentation before designing or implementing anything:
- Directory: `D:/Company/Admatrix/omni-docs/`
- Architecture Blueprint: `architecture/MASTER-ARCHITECTURE-BLUEPRINT.md` (615 endpoints, 8 Bounded Contexts)
- Go DDD Spec: `architecture/NEXTGEN-GOLANG-DDD-SPEC.md`
- Performance & Anti-Patterns: `architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`
- Migration Master Plan: `migration/DDD-MIGRATION-MASTER-PLAN.md`
- Channel Gateways: `architecture/CHANNEL-GATEWAYS-ARCHITECTURE.md`
- Legacy Catalog: `architecture/ZALOCRM-FUNCTIONAL-CATALOG.md`

Verify which Bounded Context owns the feature, what submodules are involved, and what invariants must be protected.

---

## 3. Plan-First & Issue-First Workflow (SDLC Mandatory)

Before writing any production code:
1. **GitHub Issue**: Create via `gh issue create` with title `[BC-name] <type>: <description>`. Phải tuân thủ cấu trúc chuẩn 7 phần (xem `AGENTS.md` §4.4): Context & Goal, Affected Submodule & Strict File Boundaries (cách ly chống conflict), Source Docs Reference, Domain Invariants, **Go DDD Performance & Anti-Pattern Checklist (MANDATORY)**, Acceptance Criteria, Git Workflow.
2. **Sprint Board Automation & Concurrency Control (MANDATORY)**:
   - Project: **Omni Core — Backend DDD Sprint Board** (ID: `PVT_kwHOD3RGJc4Bkgl_`)
   - Field: `PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0`
   - Status options: Todo (`f75ad846`), In Progress (`47fc9ee4`), Done (`98236657`)
   - **Check Active Tasks First**: Query active sprint items before picking up work:
     ```bash
     gh project item-list 11 --owner hongta0506 --format json
     ```
     Any task with status `In Progress` is owned by another engineer/agent. Do NOT pick up or duplicate in-progress tasks.
   - **STARTING** task: immediately move from `Todo` to `In Progress`:
     ```bash
     gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 47fc9ee4
     ```
   - **COMPLETED** task (PR merged / issue closed): move to `Done`:
     ```bash
     gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 98236657
     ```
   - Find `<ITEM_ID>`:
     ```bash
     gh project item-list 11 --owner hongta0506 --format json | jq -r '.items[] | select(.content.number==<ISSUE_NUMBER>) | .id'
     ```
3. **User Approval**: Present the plan to the user in chat (in Vietnamese). **WAIT for explicit confirmation** before modifying any code.
4. **Mandatory Acceptance Criteria Audit Before PR/Close (STRICT GATE)**:
   - **Never close an issue or mark `Done` with unchecked boxes (`- [ ]`).**
   - Before opening PR or merging, dev/agent MUST:
     1. Audit codebase to verify all routes/invariants exist and pass tests.
     2. Update GitHub Issue body (`gh issue edit <id>`) to change all verified `- [ ]` to `- [x]`.
     3. If any item is deferred, spin off a new issue for it; never leave unchecked items in a closed issue.


---

## 4. Think Before Coding

**No guessing. State assumptions. Be transparent about trade-offs.**

Before writing any code:
- State assumptions clearly. If anything is ambiguous, pause and ask.
- When multiple viable approaches exist, list them — do not silently choose.
- If a simpler solution exists, propose it directly.
- If requirements are unclear, stop. Explain what is missing and ask.

---

## 5. Simplicity First (Lazy Senior Mindset)

**Write the minimum code that solves the problem. Never build for hypothetical future needs.**

The simplicity ladder:
1. Does this need to exist at all? (YAGNI)
2. Does the Go standard library already solve it? Use stdlib first.
3. Does the database solve it? (Use DB constraints and indexes instead of 50 lines of app code).
4. Does an existing dependency solve it? Do not add new libraries for what a few lines can do.
5. Can it be one line? One line.
6. Only then: write the minimal code that fulfills the requirement.

Rules:
- No abstractions for one-time operations (never create an interface for a struct with only one implementation).
- No unrequested configuration, flags, or speculative flexibility.
- Mark intentional simplifications with a `// ponytail: [current limit and upgrade path]` comment.

---

## 6. Surgical Changes

**Touch only what is necessary. Leave no trace.**

When modifying existing code:
- Do not reformat or clean up surrounding code outside the task scope.
- Do not refactor functioning code unless explicitly instructed.
- Match the prevailing style of the codebase.
- Flag pre-existing dead code to the user — do not delete it unprompted.

---

## 7. Goal-Driven Execution

**Define clear success criteria. Verify with tests.**

- Adding an invariant: Write the failing unit test for the invalid case first, then implement the invariant to make it pass.
- Fixing a bug: Write a reproduction test, then fix the code until the test passes.
- Refactoring: Ensure 100% test pass rate both before and after refactoring.

---

## 8. Git & Branching

### 8.1 Protected Branches
- `main`: Production releases only. **DIRECT PUSH FORBIDDEN.**
- `staging`: QA / Integration testing. **DIRECT PUSH FORBIDDEN.**
- All changes must go through a feature branch and Pull Request into `staging`.

### 8.2 Branch Naming
Format: `<type>/<issue-number>-<short-kebab-desc>`
Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`
Examples: `feat/12-customer-postgres-repo`, `fix/15-contact-merge-bug`

### 8.3 Standard Workflow
1. `git checkout staging && git pull origin staging` (always start from latest staging)
2. `git checkout -b <type>/<issue-number>-<short-desc>`
3. Implement within the approved scope
4. Quality checks (via Docker or local Go):
   - `docker compose run --rm omni-core go vet ./...`
   - `docker compose run --rm omni-core go test ./...`
   - `docker compose run --rm omni-core go build ./...`
5. Commit: `git commit -m "<type>(<scope>): <description> (closes #<issue>)"`
6. Push: `git push origin <branch-name>`
7. PR: `gh pr create --title "[BC-name] <type>: <desc>" --body "..."` (target `staging`)

### 8.4 Merge Flow
`feature branch` → PR → `staging` → PR → `main` (tagged release)

---

## 9. Architecture & Submodule Structure (The 4 Layers)

Each Bounded Context under `internal/<bc_name>/` must organize submodules across all 4 layers:

```
internal/<bc_name>/
├── domain/                         # Layer 1: Domain (Zero external dependencies)
│   ├── <submodule>/
│   │   ├── <aggregate_root>.go     # Aggregate Root, Entities, Invariants
│   │   ├── <value_objects>.go      # Value Objects (immutable, self-validating)
│   │   ├── events.go               # Domain Events
│   │   ├── repository.go           # Repository Port interface (*Validated<Aggregate> only)
│   │   └── validation.go           # Validated<Aggregate> wrapper
│   └── errors.go                   # BC-wide domain errors
├── application/                    # Layer 2: CQRS Application
│   └── <submodule>/
│       ├── commands/               # State mutations
│       └── queries/                # Read projections & list DTO queries
├── infrastructure/                 # Layer 3: Persistence & Adapters
│   ├── <submodule>/
│   │   ├── postgres_repository.go  # Bun ORM / pgx repository implementing Port
│   │   └── models.go               # DB table schemas & mappings
│   └── client/                     # External service/SDK clients
└── interfaces/                     # Layer 4: Multi-Protocol Delivery
    ├── http/                       # REST ServeMux (Go 1.22+) flat handlers per resource
    ├── grpc/                       # Connect-RPC / gRPC service implementations
    ├── ws/                         # WebSocket hub & handlers
    └── stream/                     # Server-Sent Events (SSE) streaming
```

### Shared Kernel Conventions (Mandatory across all BCs):
1. **Pagination**: Flat lists use `omni-core/pkg/pagination` (`PaginationParam`, `PageResult[T]`). Handlers normalize via `norm := q.Normalize()`, pass `norm.Limit()` and `norm.Offset()` to DB, return standard `{ "items": [...], "total": ..., "page": ..., "limit": ..., "totalPages": ..., "hasNext": ... }`.
2. **Error Classification**: Use `omni-core/pkg/errors` (`CodeNotFound`, `CodeConflict`, `CodeInvalidInput`, `CodeUnauthorized`, `CodeForbidden`, `CodeInternal`). Map explicitly to HTTP status and Connect-RPC codes.
3. **Identity & Tenant Claims**: Use `omni-core/pkg/auth`. Extract `TenantID` and `UserID` from `auth.UserClaimsFromContext(ctx)`. Never trust client-supplied tenant IDs.
4. **UUIDs**: Use `omni-core/pkg/uid` (`uid.New()`, `uid.IsValid()`) or `github.com/google/uuid`.

---

## 10. Performance, Concurrency & Anti-Pattern Prevention (Mandatory)

Reference: `omni-docs/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`.

Every agent must avoid the 5 critical Go anti-patterns:
1. **Memory & GC Pressure**:
   - Never spawn naked, unbounded goroutines (`go func()`). Use managed worker pools or bounded buffered channels.
   - Prevent slice retention memory leaks: always clone sub-slices when storing long-term references (`slices.Clone(buf[:n])`).
   - Avoid `any` or `map[string]interface{}` across internal boundaries. Use concrete structs to stay on the stack and avoid heap escape.
2. **Architecture Bloat & Pragmatic CQRS**:
   - Write path (Commands): Pass through Domain Aggregate Root to enforce invariants (`ValidatedAggregate`).
   - Read path (Queries): Query DB directly via `bun` / `sqlc` into read-model projection DTOs. Do NOT instantiate Domain Aggregates for pure read/list queries.
3. **Aggregate Bloat & N+1 Prevention**:
   - Aggregates are consistency boundaries, not data containers. Hold IDs and metrics; do NOT embed thousands of child entities in memory.
   - Never execute DB queries inside a loop. Batch query related records with `bun.In()` or SQL `JOIN` / `json_agg()`.
4. **Concurrency & Context Safety**:
   - Never pass HTTP `r.Context()` directly to asynchronous background tasks. HTTP cancellation will abort the background task. Use `context.WithoutCancel(r.Context())` with a timeout.
   - For critical asynchronous side-effects (Zalo messages, SMS, audit logs), use the Transactional Outbox pattern (`outbox_events` table in the same DB transaction).
5. **Java/C# Paradigm Traps**:
   - "Accept interfaces, return structs".
   - Define interfaces in the consumer/calling package, not upfront next to the implementation.
   - Never use `I*` prefixes (`IUserRepository`) or `*Impl` suffixes (`UserRepositoryImpl`).
   - If there is only one implementation, do NOT create an interface unless needed for test mock injection.

---

## 11. Docker-First Environment

Never assume local host tooling:
- All linting, testing, and building must run via `make` targets or `docker compose run --rm omni-core ...`.
