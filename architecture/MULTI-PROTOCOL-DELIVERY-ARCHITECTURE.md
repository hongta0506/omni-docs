# Kiến Trúc Phân Tầng Giao Tiếp Đa Thức (Multi-Protocol Delivery Architecture)

> Tài liệu chuẩn hoá tầng Interfaces trong Go Clean DDD cho hệ thống Omni Core.
> Phiên bản: 2.0.0 (Cập nhật 2026-09-27)

---

## 1. Triết Lý Thiết Kế (Design Philosophy)

Hệ thống Omni Core được thiết kế theo **Clean Architecture & Domain-Driven Design (DDD)** với nguyên tắc **Độc lập cơ chế phân phối (Delivery Mechanism Agnostic)**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INTERFACES LAYER                                │
│                                                                        │
│   ┌────────────────┐   ┌────────────────┐   ┌──────────────────────┐   │
│   │  HTTP / REST   │   │  Connect-RPC   │   │  gRPC / WebSockets   │   │
│   │ (Web/Mobile UI)│   │  (Type-safe)   │   │(Gateways, Daemons, AI│   │
│   └───────┬────────┘   └───────┬────────┘   └──────────┬───────────┘   │
└───────────┼────────────────────┼───────────────────────┼───────────────┘
            │                    │                       │
            ▼                    ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER (CQRS)                          │
│                                                                        │
│             Commands Handlers  ◄───►  Queries Handlers                 │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DOMAIN LAYER (DDD Core)                         │
│                                                                        │
│            Rich Aggregates  ◄───►  Invariants & Domain Events          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                               │
│                                                                        │
│            PostgreSQL (Bun ORM)  ◄───►  Redis / Outbox Relay           │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Application CQRS Handlers là trung tâm nghiệp vụ duy nhất**:
   - `commands/` và `queries/` chứa 100% logic điều phối.
   - Không lặp lại bất kỳ logic validate, nghiệp vụ hay database query nào giữa các giao thức.
2. **Các cơ chế giao tiếp chỉ là lớp mỏng (Thin Delivery Adapters)**:
   - **HTTP / RESTful**: Phục vụ trực tiếp cho Web UI (Vue 3 / Next.js) qua chuẩn JSON HTTP/1.1 hoặc HTTP/2. URL giữ nguyên tương thích 100% với frontend mà không cần adapter chắp vá.
   - **Connect-RPC**: Phục vụ các client hiện đại hỗ trợ TypeScript type-safe Protobuf contracts.
   - **gRPC (HTTP/2 Multiplexing & Streams)**: Phục vụ kết nối Daemon nền (Node.js Zalo Gateway, WhatsApp Gateway) và AI Agent Engine đòi hỏi băng thông cao, độ trễ cực thấp.
   - **WebSocket Hub**: Phục vụ các sự kiện realtime (tin nhắn mới, cập nhật trạng thái online, thông báo).

---

## 2. Chuẩn Cấu Trúc Thư Mục Trong Từng Bounded Context

Mỗi Bounded Context trong `internal/<bc>/` tuân thủ nghiêm ngặt cấu trúc phân tầng:

```
internal/<bc>/
├── domain/                    # Entities, Aggregates, Value Objects, Domain Events
├── application/               # CQRS
│   ├── commands/              # Handlers ghi (Write)
│   └── queries/               # Handlers đọc (Read)
├── infrastructure/            # Persistence & External Clients
│   └── postgres/              # Bun ORM repositories & models
└── interfaces/                # Tầng giao tiếp (Giao thức bên ngoài)
    ├── http/                  # [MỚI] RESTful HTTP handlers & routes cho Frontend
    │   ├── handler.go
    │   └── router.go
    ├── grpc/                  # Connect-RPC / gRPC Server handlers
    │   └── server.go
    └── ws/                    # Realtime WebSocket stream (nếu có)
```

---

## 3. Bản Đồ 7 Bounded Contexts & Phân Bổ Giao Thức

| Bounded Context | Tầng `interfaces/http` (REST) | Tầng `interfaces/grpc` (Connect/gRPC) | Tầng Realtime Stream (WS) |
|---|---|---|---|
| **Identity** | Auth Login, Refresh, Logout, Profile, Tenants, RBAC Departments & Groups | `IdentityService` Connect-RPC | Token expiry alerts |
| **Customer** | Contacts, Profiles, Notes, Appointments, Activities, Lead Scoring | `CustomerService`, `CustomerExtService` | Contact timeline events |
| **Conversation**| Conversations, Messages, Folders, Presets, Media Uploads | `ConversationService`, `ConversationExtService`| Realtime Chat Socket Hub |
| **Deal & Orders**| Deals, Pipeline 6 Stages, Orders, Quotes, Products | `DealService` Connect-RPC | Order status push |
| **Channel** | Zalo Accounts, Group Scans, Labels Sync, Proxy Pool | `ZaloPersonalService`, `ChannelZaloExtService` | Inbound Message Stream |
| **Marketing & Tagging** | Tags, Groups, Broadcast Campaigns, ZNS, Triggers | `TaggingService`, `MarketingService` | Campaign progress |
| **Analytics** | SLA Response Times (FRT/ART), Radar Signals | `AnalyticsService` Connect-RPC | Breach radar alerts |

---

## 4. Lộ Trình Triển Khai (Migration Roadmap)

Toàn bộ các gói công việc bổ sung tầng RESTful HTTP được quản lý qua GitHub Issues trên Sprint Board Project 11:
- **Phase 1**: Identity BC REST Interfaces (Issue #69).
- **Phase 2**: Customer BC REST Interfaces (Issue #70).
- **Phase 3**: Conversation & Media BC REST Interfaces (Issue #71).
- **Phase 4**: Deals, Quotes & Products BC REST Interfaces (Issue #72).
- **Phase 5**: Channel & Egress Proxy BC REST Interfaces (Issue #73).
- **Phase 6**: Tagging, Marketing & Analytics BC REST Interfaces (Issue #74).
- **Phase 7**: AI Agent & GoClaw Bridge Interfaces (Issue #75).
