# AGENTS.md — Omni Docs

> Mandatory instructions for all AI coding agents working in the `omni-docs` repository.

---

## 0. CRITICAL: Communication Language

**ALL explanations, summaries, plans, and responses to the user MUST be written in Vietnamese.**
Identifiers, file paths, commands, and schemas remain in their original form.

---

## 1. Protected Branches & Git Rules

### Protected Branches
- `main`: Canonical production documentation. **DIRECT PUSH FORBIDDEN.**
- `staging`: QA / Staging documentation. **DIRECT PUSH FORBIDDEN.**
- All changes must go through a branch and Pull Request.

### Branch Naming Convention
```
<type>/<issue-or-task-number>-<short-kebab-desc>
```
Types: `docs`, `feat`, `fix`, `refactor`, `chore`
Examples:
- `docs/1-customer-api-mapping`
- `docs/4-zalocrm-catalog`

### Standard Workflow
1. `git checkout staging && git pull origin staging` (luôn pull code mới nhất)
2. `git checkout -b <type>/<task-number>-<short-desc>`
3. Viết tài liệu theo cấu trúc markdown rõ ràng, nhất quán
4. Commit: `docs(<scope>): <short description>`
5. Push: `git push origin <branch-name>`
6. Tạo Pull Request vào `staging` (hoặc `main` khi có yêu cầu)
