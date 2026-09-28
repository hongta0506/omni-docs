# Bounded Contexts — Đặc Tả Nghiệp Vụ & Kỹ Thuật 8 Contexts

> Thư mục chứa toàn bộ tài liệu đặc tả nghiệp vụ chi tiết, use cases, domain model, repository ports và mapping routes của **8 Bounded Contexts** trong hệ thống **Omni Core** (`omni-core/internal/`).
> Golang Core developers tra cứu trực tiếp tại từng context tương ứng để triển khai độc lập.

---

## 1. Danh Mục 8 Bounded Contexts

| STT | Bounded Context | Thư Mục Package Go | Thư Mục Docs | Endpoints | Trọng Tâm Nghiệp Vụ |
|:---:|---|---|---|:---:|---|
| **01** | **Identity & Settings** | `internal/identity` | [`01-identity/`](./01-identity/) | 72 | Auth (JWT/Refresh), RBAC 4 cấp, Users, Departments, Tenant Settings. |
| **02** | **Channel & Gateway** | `internal/channel` | [`02-channel/`](./02-channel/) | 95 | Zalo QR / sessions, Telegram MTProto, WhatsApp Cloud, Egress proxy pool. |
| **03** | **Customer & Lead** | `internal/customer` | [`03-customer/`](./03-customer/) | 92 | Unified Contact (2 cuốn sổ), Leads, Lead Pool, Segments, Appointments, Notes. |
| **04** | **Conversation & Media** | `internal/conversation` | [`04-conversation/`](./04-conversation/) | 82 | Omni inbox, Tin nhắn đa kênh, Quick reply presets, Media library, Watermark. |
| **05** | **Deal & E-commerce** | `internal/deal` | [`05-deal/`](./05-deal/) | 85 | Pipeline Kanban, Báo giá Quotes, Products, Pricebook, Order Store, Pancake POS. |
| **06** | **Marketing & Automation** | `internal/marketing` | [`06-marketing/`](./06-marketing/) | 84 | Broadcast campaigns, Tags đa kênh, Nuôi dưỡng sequences, Automation flows. |
| **07** | **AI Agent & Knowledge** | `internal/aiagent` | [`07-aiagent/`](./07-aiagent/) | 65 | AI Agents, Providers (DeepSeek/OpenAI), RAG Knowledge base, Ops Radar. |
| **08** | **Service API & Gateway** | `internal/serviceapi` | [`08-serviceapi/`](./08-serviceapi/) | 40 | Public API cho daemons (GoClaw), HMAC Auth, Analytics SLA, Webhooks. |
| | **TỔNG CỘNG** | | | **615** | Chuẩn hóa từ 792 routes thô Fastify. |

---

## 2. Quy Chuẩn Cấu Trúc Nội Bộ Mỗi Bounded Context

Mỗi context trong thư mục này cung cấp:
1. `README.md`: Tổng quan nghiệp vụ, bảng phân rã Aggregates, Invariants và danh sách Use Cases.
2. `api-mapping.md`: Bảng ánh xạ route Fastify cũ ➔ Go Command/Query Handler & Connect-RPC service.
3. `repository-port.md`: Đặc tả Interface Repository tầng Domain (chỉ nhận `*Validated<Aggregate>`), Bun ORM queries và transaction boundaries.
4. `use-cases/` (nếu có): Step-by-step xử lý logic cho các nghiệp vụ phức tạp.

---

## 3. Bản Đồ Liên Kết Tương Tác Giữa Các Contexts (Context Map)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   Identity (01)                                 │
│                   (Cung cấp TenantContext, UserID, Permissions)                  │
└───────┬───────────────────────────────┬─────────────────────────────────┬───────┘
        │                               │                                 │
        ▼                               ▼                                 ▼
┌──────────────┐                ┌──────────────┐                  ┌──────────────┐
│ Channel (02) │◄──Events/RPC──►│Customer (03) │◄───CustomerRef───┤  Deal (05)   │
└───────┬──────┘                └───────┬──────┘                  └──────────────┘
        │                               │                                 ▲
        │ ChannelEvent                  │ ContactRef                      │ DealRef
        ▼                               ▼                                 │
┌──────────────┐                ┌──────────────┐                          │
│Conversation(04)◄──Activity────┤Marketing(06) ├──────────────────────────┘
└───────┬──────┘                └───────┬──────┘
        │                               │
        ▼                               ▼
┌──────────────┐                ┌──────────────┐
│ AI Agent(07) │                │ServiceAPI(08)│
└──────────────┘                └──────────────┘
```

---

## 4. Cơ Chế Phân Định Thành Phần Dùng Chung (Internal Common vs Cross-BC Shared Kernel)

Để tránh tình trạng phình to code trùng lặp hoặc vi phạm ranh giới Bounded Context (tight coupling), toàn bộ 8 Bounded Contexts tuân thủ cơ chế 2 cấp độ dùng chung:

```
omni-core/
├── pkg/                                # CẤP 2: CROSS-BC SHARED KERNEL (Toàn hệ thống, sẵn sàng tách module)
│   ├── auth/                           # JWT verification, Role/Permission claims, Context User/Tenant
│   ├── context/                        # TenantID, UserID, RequestID extraction
│   ├── events/                         # Event Envelope, Outbox interface, Message Broker
│   ├── pagination/                     # Generic PaginationParam (Page, PageSize, Cursor, Offset) & PageResult[T]
│   ├── errors/                         # System Error Codes & Connect-RPC/HTTP mappers
│   └── logger/                         # Structured JSON logging
│
└── internal/<bc_name>/
    ├── domain/errors.go                # CẤP 1A: Domain Errors dùng chung trong nội bộ BC
    ├── application/common/             # CẤP 1B: INTERNAL BC COMMON (Chỉ dùng trong BC này)
    │   ├── context.go                  # Context helper trích xuất thông tin nghiệp vụ riêng
    │   ├── filters.go                  # Filter & Sort DTOs nghiệp vụ (EMBED/EXTEND pkg/pagination.PaginationParam)
    │   └── errors.go                   # Application error handling nội bộ
    └── interfaces/http/
        └── middleware/                 # Middleware kiểm tra quyền / logic riêng của BC (nếu có)
```

### 4.1 Quy Tắc Phân Cấp Dùng Chung

1. **Cấp 1 — Dùng chung nội bộ Bounded Context (`internal/<bc>/application/common/`)**:
   - Chỉ được import và sử dụng bởi các submodules bên trong chính Bounded Context đó (`internal/<bc>/application/<submodule>/`, `internal/<bc>/interfaces/`).
   - Tuyệt đối không export ra ngoài cho các Bounded Context khác sử dụng.
   - Chứa: DTO nghiệp vụ tìm kiếm (`filters.go`), ví dụ `UserFilter`, `ContactFilter`, `DealFilter`. Các filter này **bắt buộc nhúng (embed) `pkg/pagination.PaginationParam`** để tái sử dụng toàn bộ tính toán `Offset`, `PageSize`, `Cursor`, không viết lại thủ công các trường phân trang. Chứa context accessor chuyên biệt của BC và sentinel domain errors (`domain/errors.go`).

2. **Cấp 2 — Dùng chung toàn hệ thống (`pkg/` — Cross-BC Shared Kernel)**:
   - Các tiện ích generic kỹ thuật, hoàn toàn phi nghiệp vụ (infrastructure/platform level).
   - Mọi Bounded Context đều được phép import.
   - Chứa: Quản lý Tenant/User context chuẩn, JWT middleware, Base generic pagination (`pkg/pagination`), Event bus contracts.
   - **Xóa bỏ `internal/shared/`**: Di chuyển toàn bộ các tiện ích generic còn sót tại `internal/shared/common/` sang `pkg/` (`pkg/pagination/`, `pkg/errors/`, `pkg/auth/`) để phục vụ chuẩn hóa Monorepo hoặc tách Private Module khi phân rã Microservices, tránh mập mờ giữa `internal/shared` và `pkg/`.

### 4.2 Các Bất Biến Ranh Giới Bắt Buộc (Boundary Invariants)

- **CẤM IMPORT CHÉO DOMAIN & APPLICATION**: Bounded Context `A` tuyệt đối **KHÔNG ĐƯỢC** import bất kỳ package nào từ `internal/B/domain` hoặc `internal/B/application`.
- **GIAO TIẾP LIÊN CONTEXT DUY NHẤT**:
  1. **Đồng bộ (Synchronous)**: Gọi qua Connect-RPC client do gRPC service của context đích cung cấp (`internal/<caller>/infrastructure/client/`).
  2. **Bất đồng bộ (Asynchronous)**: Xuất bản và lắng nghe Domain Events qua Transactional Outbox / Message Broker (`pkg/events`).
- **ZERO EXTERNAL DEPENDENCY TRONG DOMAIN**: Tầng `domain/` của mỗi BC chỉ import stdlib và `github.com/google/uuid`. Tuyệt đối không import `pkg/auth`, `net/http` hay bất kỳ thư viện framework nào.

