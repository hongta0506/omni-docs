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
