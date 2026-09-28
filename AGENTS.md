# AGENTS.md — Omni Docs (Quy Định & Quy Trình AI Coding Agent)

> **MANDATORY INSTRUCTIONS FOR ALL AI CODING AGENTS WORKING IN THE `omni-docs` REPOSITORY.**
> Toàn bộ agent AI bắt buộc phải đọc, tuân thủ và thực thi tuyệt đối các quy định trong file này.

---

## 0. CRITICAL: Ngôn Ngữ Giao Tiếp (Communication Language)

**MỌI lời giải thích, phân tích, tóm tắt, trao đổi và trả lời người dùng BẮT BUỘC bằng TIẾNG VIỆT.**
Tên biến, hàm, class, file path, git command, JSON/YAML/Protobuf schema giữ nguyên định dạng tiếng Anh gốc.

---

## 1. Cơ Chế Bắt Buộc Đọc Docs & Kích Hoạt Skills Trước Khi Thực Thi

### 1.1 Nguyên Tắc "Docs-First" (Đọc Tài Liệu Trước Tiên)
Mọi agent khi nhận nhiệm vụ liên quan đến phân rã Bounded Context, thiết kế kiến trúc hoặc triển khai code đều phải đọc tài liệu chuẩn từ `omni-docs` theo thứ tự:
1. `omni-docs/architecture/MASTER-ARCHITECTURE-BLUEPRINT.md`: Bản đồ toàn diện 615 endpoints và quy chuẩn phân chia 8 Bounded Contexts.
2. `omni-docs/architecture/NEXTGEN-GOLANG-DDD-SPEC.md`: Đặc tả kỹ thuật Go Clean DDD + Connect-RPC.
3. `omni-docs/migration/DDD-MIGRATION-MASTER-PLAN.md`: Kế hoạch tổng thể chuyển đổi 7 Bounded Contexts.
4. `omni-docs/migration/mapping-service-api-and-analytics.md`: Chi tiết ánh xạ cho Service-API, Analytics & Ops Radar.

### 1.2 Nguyên Tắc "Skill Preload" (Nạp Kỹ Năng Bắt Buộc)
Mọi agent khi làm việc trong `omni-docs` BẮT BUỘC phải nạp và kích hoạt kỹ năng phân tích nghiệp vụ đầu tiên:
- **Phân tích nghiệp vụ & Đặc tả yêu cầu (BẮT BUỘC LOAD ĐẦU TIÊN TẠI DOCS)**: `business-analyst` (`/business-analyst`). Áp dụng "Jobs-to-Be-Done", "5 Whys", chuẩn hóa Ubiquitous Language, viết User Stories với BDD Acceptance Criteria (Given/When/Then), xác định rõ phạm vi Tenant/Role/Plan trước khi bàn giao cho Engineering thiết kế kỹ thuật.
- **Phân tích miền nghiệp vụ & Bounded Context**: `ForceInjection/domain-driven-design-skills` (`/ddd-scope`, `/ddd-contexts`, `/ddd-aggregates`, `/ddd-domain-interactions`).
- **Hiện thực Go DDD**: `joeyave/golang-ddd-skills` (`/golang-ddd`, `/golang-ddd-architecture`, `/golang-ddd-cqrs`, `/golang-ddd-infrastructure`).
- **Kỷ luật chất lượng & Rà soát**: `addyosmani/agent-skills` (`/test-driven-development`, `/code-review-and-quality`, `/spec-driven-development`).

---

## 2. Quy Chuẩn Phân Chia Bounded Context & Cấu Trúc Thư Mục Chuẩn DDD

Tất cả các endpoint và logic nghiệp vụ phải được quy hoạch chuẩn xác vào đúng Bounded Context (BC). Không được tạo package tùy tiện hay đặt sai tầng.

### 2.1 Cấu Trúc Phân Rã Sub-module Bắt Buộc Trên Cả 4 Tầng (`internal/<bc_name>/`)

Khi một Bounded Context có nhiều nhóm nghiệp vụ/Aggregates, **NGHIÊM CẤM** để phẳng toàn bộ file ở thư mục gốc của các tầng. Bắt buộc tổ chức phân cấp đồng bộ theo **Sub-module** trên cả 4 tầng:

```
internal/<bc_name>/
├── domain/                         # 1. DOMAIN LAYER (Zero external dependencies)
│   ├── <submodule_a>/              # Tách riêng từng Sub-domain / Aggregate cluster
│   │   ├── <aggregate_root>.go     # Aggregate Root, Entities, Invariant business logic
│   │   ├── <value_objects>.go      # Value Objects (bất biến, tự validate)
│   │   ├── events.go               # Domain Events của submodule
│   │   ├── repository.go           # Repository Port interface (Chỉ nhận *Validated<Aggregate>)
│   │   └── validation.go           # Validated<Aggregate> wrapper
│   ├── <submodule_b>/
│   │   ├── <aggregate_root>.go
│   │   ├── <value_objects>.go
│   │   └── repository.go
│   └── errors.go                   # Lỗi Domain dùng chung trong toàn BC
│
├── application/                    # 2. APPLICATION LAYER (CQRS điều phối nghiệp vụ)
│   ├── <submodule_a>/              # Đồng bộ cấu trúc theo Sub-module của Domain
│   │   ├── commands/               # Handlers thay đổi trạng thái
│   │   │   ├── create_handler.go
│   │   │   └── update_handler.go
│   │   └── queries/                # Handlers truy vấn tối ưu DTO
│   │       ├── get_handler.go
│   │       └── list_handler.go
│   └── <submodule_b>/
│       ├── commands/
│       └── queries/
│
├── infrastructure/                 # 3. INFRASTRUCTURE LAYER (Persistence, Adapters, External)
│   ├── <submodule_a>/              # Repository implementation & DB adapters cho submodule A
│   │   ├── postgres_repository.go  # Bun ORM / sqlc / pgx repository thực thi Port
│   │   └── models.go               # DB Table schemas & mapping
│   ├── <submodule_b>/
│   │   ├── postgres_repository.go
│   │   └── models.go
│   └── client/                     # External HTTP/gRPC SDK clients (nếu có)
│
└── interfaces/                     # 4. INTERFACES LAYER (Multi-Protocol Delivery)
    ├── http/                       # RESTful API handlers (ServeMux Go 1.22+)
    │   ├── handler.go              # Router chung & đăng ký RegisterRoutes(mux *http.ServeMux)
    │   ├── <submodule_a>_handler.go# Flat handlers per resource (hoặc subfolder <submodule>/ nếu độc lập hoàn toàn)
    │   └── <submodule_b>_handler.go
    ├── grpc/                       # Connect-RPC / gRPC service servers theo từng Sub-module Protobuf
    │   ├── <submodule_a>_service.go
    │   └── <submodule_b>_service.go
    ├── ws/                         # WebSocket streaming Hub & handlers
    └── stream/                     # Server-Sent Events (SSE) streaming (AI token, realtime events)
```

#### Quy Chuẩn Cụ Thể Từng Tầng:
1. **Domain Layer (`domain/<submodule>/`)**: Mỗi Aggregate Root quản lý Invariant riêng nằm trong sub-module riêng (ví dụ: `identity/domain/tenant`, `domain/user`, `domain/group`, `domain/permission`). Zero dependencies (chỉ stdlib và `uuid`).
2. **Application Layer (`application/<submodule>/`)**: CQRS Commands và Queries phân bổ rõ theo sub-module tương ứng để tránh Application Service bị phình to.
3. **Infrastructure Layer (`infrastructure/<submodule>/`)**: SQL models, migrations và code thực thi Repository Ports được cô lập theo sub-module.
4. **Interfaces Layer (`interfaces/`)**:
   - HTTP REST: Handlers gọi application CQRS tương ứng theo sub-module. Với Channel BC, các gateway Zalo/Telegram/WhatsApp có package con riêng (`interfaces/http/zalo/`, `interfaces/http/whatsapp/`). Với các BC khác, tổ chức file handler rõ ràng theo resource.
   - gRPC / Connect-RPC: Phân tách service implementation file theo từng protobuf service của sub-module.


### 2.2 Bản Đồ 8 Bounded Contexts & Phân Chia Endpoint Tương Ứng

| Bounded Context | Thư Mục Package | Phạm Vi Nghiệp Vụ & Endpoints Phụ Trách | Số Endpoint |
|---|---|---|---|
| **1. Identity & Settings** | `internal/identity` | `/api/v1/auth/*`, `/api/v1/me/*`, `/api/v1/users/*`, `/api/v1/departments/*`, `/api/v1/permission-groups/*`, `/api/v1/settings/*`, `/api/v1/organization/*` | 72 |
| **2. Channel & Gateway** | `internal/channel` | `/api/v1/zalo-accounts/*`, `/api/v1/zalo-groups/*`, `/api/v1/zalo-labels/*`, `/api/v1/account-folders/*`, `/api/v1/telegram-personal/*`, `/api/v1/integrations/*`, `/api/v1/admin/egress/*` | 95 |
| **3. Customer & Lead** | `internal/customer` | `/api/v1/contacts/*`, `/api/v1/leads/*`, `/api/v1/lead-pool/*`, `/api/v1/customer-lists/*`, `/api/v1/customer-list-entries/*`, `/api/v1/appointments/*`, `/api/v1/notes/*`, `/api/v1/scoring/*`, `/api/v1/crm-tags/*` | 92 |
| **4. Conversation & Media** | `internal/conversation`| `/api/v1/conversations/*`, `/api/v1/messages/*`, `/api/v1/chat/presets/*`, `/api/v1/media/*` (Folders, Upload, Watermarks) | 82 |
| **5. Deal & E-commerce** | `internal/deal` | `/api/v1/deals/*`, `/api/v1/quotes/*`, `/api/v1/products/*`, `/api/v1/pricebook/*`, `/api/v1/order-store/*`, `/api/v1/pancake/*` | 85 |
| **6. Marketing & Automation** | `internal/marketing` | `/api/v1/tags/*`, `/api/v1/tag-groups/*`, `/api/v1/broadcasts/*`, `/api/v1/campaigns/*`, `/api/v1/marketing/sequences/*`, `/api/v1/automation/*`, `/api/v1/reports/*`, `/api/v1/dashboard/*` | 84 |
| **7. AI Agent & Knowledge** | `internal/aiagent` | `/api/v1/ai-agents/*`, `/api/v1/goclaw-providers/*`, `/api/v1/ai/knowledge/*`, `/api/v1/ai/company-profile/*`, `/api/v1/ai/agent-hands/*`, `/api/v1/ops-radar/*`, `/api/v1/work-items/*` | 65 |
| **8. Service API & Gateway** | `internal/serviceapi` | `/api/v1/service/whoami`, `/api/v1/service/messages/send`, `/api/v1/service/leads/assign`, `/api/v1/service/contacts/*`, `/api/v1/analytics/*` | 40 |

---

## 3. Quy Tắc Quản Lý Branch & Git (Protected Branches)

- `main`: Nhánh production. **NGHIÊM CẤM PUSH TRỰC TIẾP.**
- `staging`: Nhánh tích hợp QA/Staging. **NGHIÊM CẤM PUSH TRỰC TIẾP.**
- **Mọi thay đổi bắt buộc tạo feature/docs branch và mở Pull Request vào `staging`.**

### Chu Trình Làm Việc Tiêu Chuẩn (Standard Workflow)
```bash
# 1. Luôn kéo mã mới nhất từ staging
git checkout staging
git pull origin staging

# 2. Tạo nhánh làm việc theo quy ước
git checkout -b <type>/<task-or-issue-number>-<short-kebab-desc>
# Ví dụ: docs/standardize-agents-workflow-and-ddd-layout

# 3. Viết và cập nhật tài liệu chuẩn xác

# 4. Commit theo chuẩn Conventional Commits
git commit -m "docs(<scope>): <short description>"

# 5. Push lên remote
git push origin <branch-name>

# 6. Tạo Pull Request vào staging
gh pr create --base staging --title "docs(<scope>): <description>" --body "..."
```

---

## 4. Tự Động Hóa Quản Lý Trạng Thái Sprint Board (MANDATORY)

- **Project Board**: `Omni Core — Backend DDD Sprint Board` (ID: `PVT_kwHOD3RGJc4Bkgl_`)
- **Field Status ID**: `PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0`
- **Option IDs**:
  - `f75ad846` → **Todo**
  - `47fc9ee4` → **In Progress**
  - `98236657` → **Done**

### Quy Tắc Chuyển Đổi Trạng Thái
1. **Trước khi nhận task**: Kiểm tra xem task có đang `In Progress` bởi người khác không (`gh project item-list 11 --owner hongta0506 --format json`).
2. **Khi BẮT ĐẦU thực hiện**: Chuyển ngay sang `In Progress`:
   ```bash
   gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
     --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 47fc9ee4
   ```
3. **Khi HOÀN THÀNH (PR merged / task xong)**: Chuyển ngay sang `Done`:
   ```bash
   gh project item-edit --project-id PVT_kwHOD3RGJc4Bkgl_ --id <ITEM_ID> \
     --field-id PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0 --single-select-option-id 98236657
   ```
