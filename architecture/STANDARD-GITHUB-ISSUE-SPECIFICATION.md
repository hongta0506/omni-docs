# Standard GitHub Issue Specification & Anti-Pattern Enforcement

> **MANDATORY SPECIFICATION FOR CREATING & AUDITING GITHUB ISSUES IN OMNI PLATFORM**  
> **Document Code:** `SPEC-ARCH-ISSUE-001`  
> **Audience:** All AI Coding Agents, Orchestrator Agents, and Software Engineers.  
> **Status:** ACTIVE & ENFORCED IN CI/CD QUALITY GATES.  
> **Language:** English.

---

## 1. Core Principle & Why Issue Isolation is Critical

In a multi-agent autonomous engineering workflow:
1. **Agent Context Window Isolation:** Subagents, Ralph loops, and fresh coding agents receive the **GitHub Issue body as their primary execution prompt**. They do not share live conversation memory from parent sessions.
2. **Strict Gate Enforcement (`AGENTS.md` §4.5):** An issue or PR **MUST NEVER** be closed or marked `Done` while any checkbox (`- [ ]`) remains unchecked. Explicit checkboxes force the agent to perform self-verification before opening a Pull Request.
3. **Zero Ambiguity:** If an issue relies on general references like "see AGENTS.md", AI agents tend to overlook domain-specific invariants and fall into common Go DDD traps (such as missing pagination, N+1 queries, or fake mock fallbacks).

---

## 2. The 7 Mandatory Sections (Verbatim Issue Template)

Every backend issue created on `hongta0506/omni-core` **MUST** strictly follow the verbatim structure below without omitting or shortening any section:

```markdown
## Context & Goal
[Clearly describe the business context, the target Bounded Context, and the architectural goal.]

## Affected Submodule & Strict File Boundaries
> **MULTI-AGENT FILE ISOLATION (CRITICAL FOR CONCURRENT WORK):**
> AI Agents working on this task MUST strictly operate within designated paths. Modifying files outside the boundary is strictly prohibited.

- **Domain Layer:** `internal/<bc>/domain/<submodule>/`
- **Application Layer:** `internal/<bc>/application/<submodule>/`
- **Infrastructure Layer:** `internal/<bc>/infrastructure/<submodule>/`
- **Interfaces Layer:** `internal/<bc>/interfaces/http/<submodule>_handler.go`
- **Forbidden Area:** [List files, submodules, or Bounded Contexts currently assigned to other agents or outside this scope.]

## Source Docs & Reference (Master Branch)
- Architecture Blueprint: [MASTER-ARCHITECTURE-BLUEPRINT.md](https://github.com/hongta0506/omni-docs/blob/master/architecture/MASTER-ARCHITECTURE-BLUEPRINT.md)
- Domain Specification: [Relevant SPEC file in omni-docs/contexts/ or architecture/]
- Resilience & Error Handling: [CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md](https://github.com/hongta0506/omni-docs/blob/master/architecture/CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md)
- Performance Rules: [GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md](https://github.com/hongta0506/omni-docs/blob/master/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md)

## Domain Invariants
[List bulleted business invariants that the Aggregate Root and Value Objects must enforce. e.g., validation rules, state transitions, tenant isolation.]

## Observability, Logging & Exception Contract (EXTENDS SPRINT 7 RESILIENCE STANDARD)
> **MANDATORY CODING RULES FOR IMPLEMENTING AGENTS:**
> 1. **Structured Logging:** Use `pkg/logger.LogAudit` for all domain state changes and critical business commands (JSON stdout for Grafana Loki). NEVER use `fmt.Println` or stdlib `log.Printf`.
> 2. **Error Taxonomy:** Map every error to `pkg/errors` with proper classification (`Transient`, `Terminal`, `SecurityPolicy`).
> 3. **External I/O Resilience:** Wrap any 3rd-party or network I/O in `pkg/resilience.ExecuteWithRetry` or Circuit Breaker.
> 4. **DLQ Persistence:** Route unrecoverable outbound messages / async jobs to `system_outbound_dlq`.

| Exception Group | Technical / Domain Error List | System Action | Resilience Strategy (Retry / Circuit Breaker / DLQ) |
|---|---|---|---|
| **Transient** | Network timeout, 429 RateLimit, DB deadlock | Auto retry | Exponential Backoff with Jitter (Base 500ms-2s, Max 3 retries) |
| **Terminal** | Validation failure, Entity not found, Blocked contact | Abort immediately | Log Terminal error, route to `system_outbound_dlq` if outbound job |
| **Security/Policy** | Token expired, Account checkpointed, Session banned | Disconnect session | Open Circuit Breaker, trigger Admin/Ops alert |

- **Log Event Names & Action Taken:**
  - Success event: `<SUBMODULE>_SUCCESS` (e.g. `CUSTOMER_TIMELINE_QUERIED`, `ORDER_SYNCED`)
  - Warning/Retry event: `<SUBMODULE>_RETRIED`
  - Failure/DLQ event: `<SUBMODULE>_FAILED`, `<SUBMODULE>_SENT_TO_DLQ`

## Go DDD Performance & Anti-Pattern Checklist (MANDATORY)
> AI Agent must verify against omni-docs/architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md:

- [ ] **Small Aggregate (Pitfall 3):** Aggregate Root ONLY stores identity, metadata, and summary metrics; NO large slices in RAM.
- [ ] **Pragmatic CQRS (Pitfall 2):** Queries scan directly from DB into Read Projection DTOs, NEVER hydrating full Domain Aggregates.
- [ ] **No N+1 (Pitfall 3):** Batch fetch via SQL JOIN or bun.In(), NEVER query in a loop.
- [ ] **Idiomatic Go (Pitfall 5):** Accept interfaces, return structs. No I* prefix or *Impl suffix.
- [ ] **Standard Pagination (Shared Kernel):** Embed pkg/pagination.PaginationParam, normalize via Normalize(), and return PageResult[T].
- [ ] **Context Lifecycle (Pitfall 4):** Never pass r.Context() to async goroutines without detaching via context.WithoutCancel().
- [ ] **Resilience & Observability (Mandatory for MVP):** Use pkg/logger.LogAudit (JSON stdout), classify errors via pkg/errors, and apply retry/circuit breaker via pkg/resilience.
- [ ] **No Silent Fallback (Anti-Cheat):** Zero fake mock fallbacks (uuid.New(), {"ok": true}) when err != nil. Errors must propagate genuine HTTP 4xx/5xx status codes.

## Acceptance Criteria
- [ ] [List of HTTP / Connect-RPC endpoints, with explicit pagination contract for any collection endpoint]
- [ ] Unit tests for Domain Invariants & Value Objects (100% pass)
- [ ] Repository integration tests with Bun ORM / pgx (100% pass)
- [ ] Observability tests verifying Structured JSON log output and error classification
- [ ] Local quality gate pass (`bash scripts/ci/verify_agents_rules.sh` and `go test -race ./...`)

## Git Workflow
```bash
git checkout staging && git pull origin staging
git checkout -b <type>/<issue-number>-<short-kebab-desc>
```
```

---

## 3. Strict Rules for Pagination in Acceptance Criteria

For **EVERY** endpoint that returns a list, collection, or search result:
1. **Mandatory Query Parameters:** Must specify `?page=&page_size=` in the endpoint URI.
2. **Application DTO Embedding:** Application Query struct must embed `pkg/pagination.PaginationParam`.
3. **Query Handler Normalization:** Handler must call `norm := q.Normalize()` and pass `norm.Limit()` / `norm.Offset()` to SQL.
4. **Standard Uniform Response JSON:** Must return `pkg/pagination.PageResult[T]` with the standard fields:
   ```json
   {
     "items": [...],
     "total": 1250,
     "page": 1,
     "limit": 20,
     "totalPages": 63,
     "hasNext": true
   }
   ```
5. **Acceptance Criteria Format:**
   ```markdown
   - [ ] `GET /api/v1/resource?page=&page_size=` list endpoint (embed `pkg/pagination.PaginationParam`, return `PageResult[T]` JSON: `{items, total, page, limit, totalPages, hasNext}`).
   ```

---

## 4. Prohibited Anti-Patterns in Issue Management

1. **Abbreviating the 8-item Checklist:** Never reduce the checklist to 2 or 3 items. All 8 items are mandatory.
2. **Leaving Generic Pagination Placeholders:** Never write simply "pagination support". Specify query params and response shape.
3. **Closing with Unchecked Items:** Never close an issue with remaining `- [ ]`. Any uncompleted feature must be spun off into a new tracked issue before closing.
4. **Permitting Boundary Leaks:** Never leave the `Affected Submodule & Strict File Boundaries` section empty or vague.
