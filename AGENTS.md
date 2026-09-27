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

---

## 2. Sprint Board Status Automation (MANDATORY)

Project board: **Omni Core — Backend DDD Sprint Board** (project ID: `PVT_kwHOD3RGJc4Bkgl_`)  
Status field: `PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0`  
Status options:
- `f75ad846` → Todo
- `47fc9ee4` → In Progress
- `98236657` → Done

### Rules

- When **STARTING** work on any issue/task: immediately move to `In Progress`:
  ```bash
  gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
    --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 47fc9ee4
  ```

- When **COMPLETED** (PR merged / issue closed): move to `Done`:
  ```bash
  gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
    --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 98236657
  ```

- To find `<ITEM_ID>` for an issue:
  ```bash
  gh project item-list 11 --owner hongta0506 --format json | jq '.items[] | select(.content.number==<ISSUE_NUMBER>) | .id'
  ```

---

## 3. Communication

**ALL explanations, plans, and responses MUST be in Vietnamese.**  
File content (markdown docs, schemas, code blocks, commands, file paths, identifiers): keep in original English form.
