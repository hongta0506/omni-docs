# ZaloCRM - Audit Kiến Trúc Hiện Tại

> Ngày audit: 2026-09-24

## Verdict: Feature-based Modular Monolith (KHÔNG PHẢI DDD)

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js ESM, Fastify 5, TypeScript, Prisma 7 |
| Database | PostgreSQL 16 (93 Prisma models) |
| Cache/Queue | Redis 7, BullMQ |
| Realtime | Socket.IO |
| Storage | MinIO |
| Frontend | Vue 3, Vite, Pinia, Vuetify, TailwindCSS |
| Zalo Integration | zca-js (pool/socket/listener per nick) |

## Kiến trúc hiện tại

```
Request → Routes (Fastify) → Services (Business logic + Prisma trực tiếp) → PostgreSQL
                                   ↓
                             BullMQ / Redis (Background Jobs)
                                   ↓
                             Socket.IO (Real-time updates)
```

### 23 Module Backend (`backend/src/modules/`)

| Nhóm | Module |
|---|---|
| Identity & Access | `auth`, `rbac`, `privacy` |
| Zalo Integration | `zalo`, `system-notifications` |
| CRM Core | `contacts`, `chat`, `tags`, `lead-pool`, `search` |
| Growth & Intelligence | `scoring`, `engagement`, `automation`, `campaign`, `ai` |
| Reporting | `analytics`, `dashboard` |
| Platform / Shared | `api`, `integrations`, `notifications`, `branding`, `activity`, `media` |

### Cấu trúc mỗi module (3 file)

- `xxx.routes.ts` — HTTP endpoints (Fastify route handlers)
- `xxx.service.ts` — Business logic + Prisma queries trộn lẫn
- `xxx.schema.ts` — Input validation (TypeBox/Zod)

### Shared (`backend/src/shared/`)

- `database/` — Prisma client singleton
- `tenant/` — Multi-tenancy middleware
- `types/` — Shared interfaces, DTOs
- `realtime/` — Socket.IO event emitter

## Lý do KHÔNG PHẢI DDD

| Tiêu chí DDD | Hiện trạng | Đánh giá |
|---|---|---|
| Aggregate Root | Không có class Aggregate. Model = Prisma generated interfaces | ❌ |
| Entity / Value Object | Không có. Dùng primitive types (`string`, `number`) | ❌ |
| Repository Pattern | Không có interface Repository. Service gọi `prisma.xxx.findMany()` trực tiếp | ❌ |
| Domain Events | Không có. Dùng BullMQ/EventEmitter gắn chặt infra | ❌ |
| Bounded Contexts | Module chia theo CRUD/table, không theo sub-domain nghiệp vụ | ❌ |
| Ubiquitous Language | Không có glossary. Naming lẫn lộn tiếng Anh/Việt | ❌ |
| Domain Services | Business logic nằm trong service layer, trộn lẫn persistence logic | ❌ |
| Anti-corruption Layer | Zalo API gọi trực tiếp từ service, không có adapter/port trung gian | ❌ |

## Mô hình dữ liệu gốc: Contact vs Friend ("2 cuốn sổ")

- **Contact** = KH Cha (góc nhìn manager) — thuộc tính con người + aggregate score/status
- **Friend** = Phiếu chăm sóc con (góc nhìn sale/nick) — mỗi row = 1 cặp `zaloAccount × identity`
- 1 Contact → N Friend
- Score chính nằm ở Friend; `Contact.leadScore` = aggregate MAX
- Breakdown 4 chiều: Engagement / Intent / Fit / Velocity
- `relationship_kind`: `friend` | `pending_friend` | `chatting_stranger` | `ghost`

## Vấn đề chính cần giải quyết khi chuyển DDD

1. **Anemic Domain Model**: Logic nằm hết trong service, model chỉ là data container
2. **Persistence coupling**: Business logic gọi Prisma trực tiếp, không tách được
3. **Module boundaries mờ**: Các module import lẫn nhau tự do qua shared types
4. **Thiếu invariant protection**: Không có aggregate root bảo vệ business rules
5. **Infra leak vào domain**: Redis/BullMQ/Socket.IO xen kẽ trong business logic
