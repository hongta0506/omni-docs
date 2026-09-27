# CLAUDE.md — Omni Docs

> Guidelines for managing documentation and specifications in the `omni-docs` repository.

---

## 0. Communication Language

**ALL explanations, summaries, plans, and responses to the user MUST be written in Vietnamese.**
Code identifiers, file paths, commands, and schemas remain in their original form.

---

## 1. Protected Branches & Git Rules

### Protected Branches
- `main`: Canonical production documentation. **DIRECT PUSH FORBIDDEN.**
- `staging`: QA / Staging documentation. **DIRECT PUSH FORBIDDEN.**
- All changes must go through a branch and Pull Request into `staging`.

### Branch Naming Convention
```
<type>/<issue-or-task-number>-<short-kebab-desc>
```
Types: `docs`, `feat`, `fix`, `refactor`, `chore`

### Standard Workflow
1. `git checkout staging && git pull origin staging`
2. `git checkout -b <type>/<task-number>-<short-desc>`
3. Write clean, structured markdown docs
4. Commit: `docs(<scope>): <short description>`
5. Push: `git push origin <branch-name>`
6. Create PR into `staging`

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
