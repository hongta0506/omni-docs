# Omni Docs — Omni-Channel CRM Architecture & Documentation

> Tài liệu thiết kế kiến trúc, catalog nghiệp vụ, đặc tả kỹ thuật và kế hoạch di trú cho hệ thống **Omni** — Nền tảng CRM đa kênh thế hệ mới (Zalo, Telegram, WhatsApp, Facebook Messenger, ...) từ Fastify/Node.js sang **Golang Clean Architecture + DDD + Connect-RPC**.

---

## 1. Số Liệu Quy Chuẩn Hệ Thống

| Chỉ số | Giá trị | Giải thích |
|---|---|---|
| **Tổng routes thô (Raw Scan)** | **792** | Quét tự động từ toàn bộ codebase Fastify/Node.js production (bao gồm biến thể params, internal, dev routes). |
| **Routes nghiệp vụ chuẩn hóa** | **615** | Phạm vi di trú chính thức, phân bổ trên 8 Bounded Contexts. |
| **Background Workers** | **27** | Queue workers, cron jobs, đồng bộ dữ liệu và webhooks. |
| **Bounded Contexts (BC)** | **8** | Phân rã độc lập theo chuẩn DDD Clean Architecture tại `omni-core/internal/`. |
| **Giao thức hỗ trợ** | **Multi-Protocol** | Connect-RPC (HTTP/2 Protobuf), RESTful JSON (ServeMux Go 1.22+), SSE Stream, WebSocket Hub. |

---

## 2. Mục Lục Tài Liệu Toàn Diện

### 2.1 Kiến Trúc Hệ Thống (`architecture/`)
> Thư mục chi tiết: [`architecture/README.md`](./architecture/README.md)

| Tài liệu | Mô tả | Trọng tâm |
|---|---|---|
| [`MASTER-ARCHITECTURE-BLUEPRINT.md`](./architecture/MASTER-ARCHITECTURE-BLUEPRINT.md) | Bản thiết kế kiến trúc tổng thể toàn diện | Phân bổ 615 endpoints vào 8 Bounded Contexts, ma trận di trú, chiến lược ORM (Bun ORM + pgx/v5), RBAC 4 cấp, Transactional Outbox, Multi-protocol interfaces. |
| [`NEXTGEN-GOLANG-DDD-SPEC.md`](./architecture/NEXTGEN-GOLANG-DDD-SPEC.md) | Đặc tả kỹ thuật Go Clean DDD | Chuẩn hóa tầng Domain (Zero external deps, ValidatedAggregate, Rich invariants), Application CQRS, Connect-RPC Protobuf contracts, SSE/WebSocket streaming. |
| [`CHANNEL-GATEWAYS-ARCHITECTURE.md`](./architecture/CHANNEL-GATEWAYS-ARCHITECTURE.md) | Kiến trúc cổng kết nối đa kênh (Channel Gateways) | Zalo Personal QR State Machine, Telegram MTProto/Bot, WhatsApp Gateway (WPPConnect/Baileys), Egress Proxy Pool (xoay vòng IP dân cư, chống checkpoint). |
| [`MODULAR-MONOLITH-TO-MICROSERVICES.md`](./architecture/MODULAR-MONOLITH-TO-MICROSERVICES.md) | Chiến lược phân rã Microservices | Đánh giá độ sẵn sàng phân rã (90%), điều kiện kích hoạt, checklist gỡ coupling (DB per service, Connect-RPC, NSQ) và runbook 4 bước bốc service độc lập. |
| [`GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md`](./architecture/GOLANG-DDD-PERFORMANCE-AND-PITFALLS.md) | Quy chuẩn hiệu năng & chống 5 anti-patterns Go DDD | Khắc phục rò rỉ Memory/GC, N+1 query, Aggregate phình to, Context lifecycle và tư duy OOP sai lầm trong Go. |
| [`CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md`](./architecture/CROSS-BC-RESILIENCE-AND-ERROR-HANDLING-SPEC.md) | Quản trị lỗi, ngoại lệ & khả năng chống chịu xuyên suốt 8 BCs | Phân loại Exception Taxonomy (Transient, Terminal, Security/Policy), Circuit Breaker, Exponential Backoff, DLQ & 3 tầng Observability (Loki/Prometheus/Postgres). |
| [`ZALOCRM-FUNCTIONAL-CATALOG.md`](./architecture/ZALOCRM-FUNCTIONAL-CATALOG.md) | Danh mục chức năng nghiệp vụ chi tiết | 792 endpoints & 27 workers phân tích từ mã nguồn Fastify, catalog 34 modules nghiệp vụ nguyên bản. |

### 2.2 Đặc Tả 8 Bounded Contexts (`contexts/`)
> Thư mục chi tiết: [`contexts/README.md`](./contexts/README.md)

| Bounded Context | Thư Mục | Endpoints | Nội Dung Chính |
|---|---|:---:|---|
| **1. Identity & Settings** | [`contexts/01-identity/`](./contexts/01-identity/) | 72 | User, RBAC, Department, Device Session, Invariants & Repo Port |
| **2. Channel & Gateway** | [`contexts/02-channel/`](./contexts/02-channel/) | 95 | Zalo personal, Groups, Telegram MTProto, Egress proxy pool |
| **3. Customer & Lead** | [`contexts/03-customer/`](./contexts/03-customer/) | 92 | Contact Golden Record, Lead pool, Lists, Appointments, Repo Port |
| **4. Conversation & Media** | [`contexts/04-conversation/`](./contexts/04-conversation/) | 82 | Chat inbox, Messages, Presets, Folders, Media assets, Invariants |
| **5. Deal & E-commerce** | [`contexts/05-deal/`](./contexts/05-deal/) | 85 | Deals pipeline, Quotes báo giá, Products, Order store Pancake |
| **6. Marketing & Automation** | [`contexts/06-marketing/`](./contexts/06-marketing/) | 84 | Tags, Broadcast campaigns, Sequences nuôi dưỡng, Automation |
| **7. AI Agent & Knowledge** | [`contexts/07-aiagent/`](./contexts/07-aiagent/) | 65 | Providers, AI Agents, RAG Knowledge base, Ops Radar |
| **8. Service API & Gateway** | [`contexts/08-serviceapi/`](./contexts/08-serviceapi/) | 40 | Public API daemons, HMAC auth, Webhooks, SLA Analytics |

### 2.3 Đặc Tả Background Workers (`workers/`)
> Thư mục chi tiết: [`workers/README.md`](./workers/README.md)

* Chi tiết **27 Background Workers** (Queue workers, Cron jobs, Realtime sync, Cleanup tasks).
* Bảng tham số: Tần suất (Schedule), Cơ chế kích hoạt (NSQ / Cron / Redis stream), Batch size, Concurrency lock.

### 2.4 Kế Hoạch & Lộ Trình Di Trú (`migration/`)
> Thư mục chi tiết: [`migration/README.md`](./migration/README.md)

| Nhóm | Tài liệu | Mô tả |
|---|---|---|
| **Chiến lược tổng thể** | [`DDD-MIGRATION-MASTER-PLAN.md`](./migration/DDD-MIGRATION-MASTER-PLAN.md) | Kế hoạch tổng thể di trú Strangler Fig 4 pha, mô hình "2 cuốn sổ" (`Contact` + `ChannelProfile`), zero-downtime DB. |
| | [`SPRINT-MIGRATION-ROADMAP.md`](./migration/SPRINT-MIGRATION-ROADMAP.md) | Lộ trình chuyển đổi 7 Sprints từ bản production `release/orbstack-mini-20260924` (Bao gồm Sprint 7: Resilience & Observability). |
| | [`MVP-RESILIENCE-SPRINT-PLAN.md`](./migration/MVP-RESILIENCE-SPRINT-PLAN.md) | Kế hoạch triển khai Resilience & Error Handling cho MVP Release (Sprint 0 - Sprint 7, Loki/Prometheus/DLQ). |
| | [`PRODUCTION-GAP-ANALYSIS.md`](./migration/PRODUCTION-GAP-ANALYSIS.md) | Phân tích chênh lệch: 177 routes core ban đầu vs 615 routes production (thiếu 438 routes, Issues A–H). |
| | [`DETAILED-MIGRATION-WBS.md`](./migration/DETAILED-MIGRATION-WBS.md) | Phân rã công việc (WBS) gồm 8 Epics lớn, chi tiết module, route và technical specs. |
| **Dữ liệu kiểm toán** | [`PROD-ROUTES-AUDIT.json`](./migration/PROD-ROUTES-AUDIT.json) | Dữ liệu thô quét tự động 792 routes từ codebase Fastify. |

### 2.5 Scripts Công Cụ (`scripts/`)

| File | Mô tả |
|---|---|
| [`scan-prod-routes.ts`](./scripts/scan-prod-routes.ts) / `.js` | Script TypeScript/Node.js quét tự động toàn bộ Fastify routes, HTTP methods và controllers từ codebase monolith ZaloCRM. |

### 2.6 Quy Chuẩn & Quy Trình Phát Triển

| File | Mô tả |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Hướng dẫn bắt buộc cho AI coding agents: Docs-First, Preload Skills (`business-analyst`, `ddd-*`, `golang-ddd-*`), Sprint Board automation, chuẩn layout thư mục 4 tầng DDD. |
| [`CLAUDE.md`](./CLAUDE.md) | Quy định SDLC, phân chia 8 Bounded Contexts, quy trình Git branching (`staging` target, conventional commits) và tự động hóa trạng thái task trên GitHub Project Board. |

---

## 3. Bản Đồ 8 Bounded Contexts DDD

Hệ thống được quy hoạch thành **8 Bounded Contexts** chuẩn Clean Architecture trong backend Go (`omni-core/internal/`):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OMNI CORE SYSTEM                                     │
│                         (Golang DDD Clean Architecture Monolith)                       │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│ 1. Identity &      │ 2. Channel &       │ 3. Customer &      │ 4. Conversation &       │
│    Settings        │    Gateway         │    Lead            │    Media                │
│ internal/identity  │ internal/channel   │ internal/customer  │ internal/conversation   │
│ (72 endpoints)     │ (95 endpoints)     │ (92 endpoints)     │ (82 endpoints)          │
├────────────────────┼────────────────────┼────────────────────┼─────────────────────────┤
│ 5. Deal &          │ 6. Marketing &     │ 7. AI Agent &      │ 8. Service API &        │
│    E-commerce      │    Automation      │    Knowledge       │    Gateway              │
│ internal/deal      │ internal/marketing │ internal/aiagent   │ internal/serviceapi     │
│ (85 endpoints)     │ (84 endpoints)     │ (65 endpoints)     │ (40 endpoints)          │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
```

Mỗi Bounded Context tuân thủ nghiêm ngặt mô hình 4 tầng độc lập:
1. **Domain (`domain/`)**: Zero external dependencies (chỉ dùng stdlib + `google/uuid`). Chứa Aggregates, Value Objects, Domain Events và Repository Ports (chỉ nhận `*Validated<Aggregate>`).
2. **Application (`application/`)**: Tách biệt Command (write) và Query (read) theo mô hình lightweight CQRS. Điều phối domain và ports, không chứa business logic.
3. **Infrastructure (`infrastructure/`)**: Triển khai persistence qua PostgreSQL (`Bun ORM` + `pgx/v5`), Redis stream, Transactional Outbox pattern, external clients.
4. **Interfaces (`interfaces/`)**: Đa giao thức — Connect-RPC (`grpc/`), RESTful HTTP (`http/`), Realtime streaming (`ws/` hoặc `stream/`).

---

## 4. Tầm Nhìn Đa Kênh (Multi-Channel Routing)

Omni Core là **Channel-Agnostic** (hoàn toàn không phụ thuộc vào một kênh cụ thể nào). Mọi tương tác kênh đều đi qua các gateway tương ứng:

| Kênh | Cơ chế kết nối | Package / Service | Trạng thái |
|---|---|---|---|
| **Zalo Cá Nhân** | WebSocket + HTTP sidecar (zca-js) | `internal/channel/interfaces/http/zalo` | Đang hoạt động |
| **Zalo OA / Bot** | Official API Webhook | `internal/channel/interfaces/http/integrations` | Đang hoạt động |
| **Telegram Personal** | MTProto protocol | `internal/channel/interfaces/http/telegram` | Đang hoạt động |
| **WhatsApp** | WPPConnect / Baileys Gateway RPC | `internal/channel/infrastructure/whatsapp` | Đang hoạt động (Issue #59) |
| **Facebook Messenger** | Meta Graph API Webhook | Gateway sidecar | Kế hoạch tích hợp |
| **Egress Proxy Pool** | Quản lý pool proxy dân cư chống khóa tài khoản | `internal/channel` | Đang hoạt động |

---

## 5. Repositories Liên Quan Trong Hệ Sinh Thái

| Repo | Vai trò | Công nghệ |
|---|---|---|
| **`hongta0506/omni-core`** | Backend chính — Core Go DDD Clean Architecture đa kênh | Go 1.22+, Bun ORM, pgx/v5, Connect-RPC, NSQ |
| **`hongta0506/omni-docs`** | **Repo này** — Tài liệu kiến trúc, specs, WBS và kế hoạch di trú | Markdown, JSON |
| `ZaloCRM` | Codebase monolith cũ (Fastify/Node.js/Prisma) — cơ sở đối soát | Node.js, Fastify, Prisma |
| `goso` | Gateway AI — Universal Harness, LLM router, Gate Approval | Go, Python |
