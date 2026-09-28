# Thiết Kế Kiến Trúc ZaloCRM Next-Gen (Golang + DDD + Connect-RPC)

> Ngày lập: 2026-09-24  
> Trạng thái: Proposal / Architectural RFC  
> Dự án: Tái cấu trúc ZaloCRM từ Node.js Modular Monolith sang Golang Clean/DDD Monolith + Distributed Gateways.

---

## 1. Mục Tiêu & Động Lực Chuyển Đổi

1. **Hiệu năng & Tài nguyên**: Chuyển đổi từ mô hình Node.js/Prisma tốn RAM và nghẽn Event Loop sang Go runtime với mô hình concurrency native (goroutine, channel) cực nhẹ.
2. **Chuẩn hóa nghiệp vụ (DDD)**: Thoát khỏi Anemic Domain Model (nơi data model và service logic trộn lẫn) sang Rich Domain Model có Aggregate Root, Value Objects, bảo vệ toàn vẹn business invariant.
3. **Mở rộng linh hoạt (Scalability)**: Tách rời tầng giao tiếp Zalo dễ biến động ra Gateway riêng, Go Core hoàn toàn stateless, frontend độc lập theo mô hình BFF (Backend-For-Frontend).
4. **Hợp đồng giao tiếp type-safe (Single Source of Truth)**: Dùng Protobuf làm contract duy nhất xuyên suốt: Next.js ◄(Connect-RPC)► Go Core ◄(gRPC)► Node.js Zalo Gateway.

---

## 2. Sơ Đồ Kiến Trúc Tổng Thể

```
[Browser / Mobile Client]
           │
           │ (HTTPS / Connect-RPC: JSON hoặc Protobuf)
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Tầng 1: Frontend / BFF (Next.js Standalone / Docker)        │
│ - SSR, UI rendering, Client session management              │
│ - Call Go Core qua gRPC/Connect client sinh từ .proto       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ (gRPC qua mạng nội bộ VPC / LAN)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tầng 2: Go Core Application (Clean Architecture + DDD)      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Interfaces (Connect-RPC Handler, WebSocket Hub)         │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Application Layer (Commands, Queries, Orchestrators)    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Domain Layer (Aggregates, Entities, VOs, Domain Events) │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Infrastructure (pgx, SQLC, Redis PubSub, Zalo Client)   │ │
│ └────────────────────────────┬────────────────────────────┘ │
└──────────────────────────────┼──────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │ gRPC Stream          │ TCP (pgx pool)       │ Redis RESP
        ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Tầng 3: Zalo GW  │  │ PgBouncer        │  │ Redis Cluster    │
│ (Node.js/zca-js) │  │ ┌──────────────┐ │  │ - Event Bus      │
│ - Worker 1       │  │ │PostgreSQL 16 │ │  │ - Realtime PubSub│
│ - Worker 2       │  │ └──────────────┘ │  │ - Token cache    │
│ (Nicks pool)     │  └──────────────────┘  └──────────────────┘
└──────────────────┘
```

---

## 3. Thiết Kế Bounded Contexts (DDD) Trong Go

Tổ chức theo mô hình Modular Monolith (1 repo, 1 binary ban đầu, boundary cô lập tuyệt đối qua Go package):

```
zalocrm-go/
├── api/proto/                      # Hợp đồng Protobuf dùng chung
│   ├── contact/v1/contact.proto
│   ├── chat/v1/chat.proto
│   └── zalo_gateway/v1/gateway.proto
├── cmd/
│   └── server/main.go              # Entry point duy nhất
├── internal/
│   ├── domain/                     # Domain Layer (Pure Go - Không phụ thuộc infra)
│   │   ├── contact/
│   │   │   ├── contact.go          # Aggregate Root: Contact
│   │   │   ├── friend.go           # Entity: Friend (mỗi nick Zalo 1 friend record)
│   │   │   ├── value_objects.go    # LeadScore, RelationshipKind, Phone
│   │   │   ├── events.go           # ContactMerged, FriendAdded, ScoreUpdated
│   │   │   └── repository.go       # Interface ContactRepository
│   │   ├── conversation/
│   │   │   ├── conversation.go     # Aggregate Root: Conversation
│   │   │   ├── message.go          # Entity: Message
│   │   │   ├── value_objects.go    # MessageContent, Attachment
│   │   │   └── repository.go
│   │   └── zalo_account/
│   │       ├── account.go          # Aggregate Root: ZaloAccount
│   │       └── repository.go
│   ├── application/                # Use Case Layer (CQRS light)
│   │   ├── contact/
│   │   │   ├── commands/           # CreateContact, MergeContact, RecomputeScore
│   │   │   └── queries/            # GetContactDetail, ListContacts
│   │   └── conversation/
│   │       ├── commands/           # SendMessage, MarkAsRead
│   │       └── queries/            # GetChatHistory
│   ├── infrastructure/             # Adapters / External implementations
│   │   ├── postgres/               # SQLC generated code + pgx pool
│   │   │   ├── queries/
│   │   │   └── contact_repo.go
│   │   ├── redis/
│   │   │   └── pubsub_eventbus.go  # Domain event dispatcher qua Redis
│   │   └── zalo_gateway/
│   │       └── grpc_client.go      # Anti-corruption layer bọc gRPC client gọi Node
│   └── interfaces/
│       ├── http/                   # RESTful HTTP handlers (ServeMux Go 1.22+) cho Frontend Web/SPA
│       │   ├── handler.go          # RegisterRoutes(mux *http.ServeMux)
│       │   └── handler_test.go
│       ├── grpc/                   # Connect-RPC / gRPC Server handlers (Protobuf) cho Inter-service
│       │   └── server.go
│       ├── ws/                     # Realtime WebSocket hub cho Chat/Notification streaming
│       │   └── hub.go
│       └── stream/                 # SSE (Server-Sent Events) cho AI Token streaming
│           └── sse_handler.go
```

---

## 4. Kiến Trúc Giao Tiếp Đa Giao Thức (Multi-Protocol Delivery Architecture)

Hệ thống triển khai mô hình **Multi-Protocol Delivery** linh hoạt, đáp ứng tối ưu từng loại client và tác vụ:

### 4.1 RESTful HTTP JSON (Giao thức chính cho Frontend Web/SPA)
- **Mục đích**: Giao thức chính cho Frontend (Vue 3, React, Next.js, Mobile App) thao tác toàn bộ các nghiệp vụ CRM qua các API chuẩn `/api/v1/...`.
- **Cơ chế triển khai**:
  - Tận dụng routing native của Go 1.22+ `net/http` `ServeMux` với method và path pattern (`POST /api/v1/auth/login`, `GET /api/v1/contacts/{id}`).
  - Xử lý xác thực qua `AuthMiddleware` (JWT Bearer Token / HttpOnly Session Cookie), tự động trích xuất `tenant_id` và `user_id` gắn vào `context.Context`.
  - Chuẩn hóa Request/Response JSON DTOs, bắt lỗi và trả về mã lỗi HTTP chuẩn (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `422 Unprocessable Entity`, `500 Internal Error`).
  - Cấu trúc file HTTP Handler dạng phẳng (flat file per resource) trong `interfaces/http/` (ví dụ `contacts_handler.go`, `leadpool_handler.go`) tránh trùng tên với `net/http`.

### 4.2 Connect-RPC & gRPC (Giao thức RPC hiệu năng cao & Inter-Service)
- **Mục đích**: Giao thức RPC chuẩn hóa qua Protobuf schemas cho giao tiếp giữa các service nội bộ, background daemons (GoClaw Daemon), các microservice vệ tinh hoặc typed RPC clients.
- **Cơ chế triển khai**:
  - Định nghĩa hợp đồng trong `api/proto/` và sinh code Go / TypeScript tự động qua `buf`.
  - Tương thích song song cả Connect protocol (HTTP/1.1 & HTTP/2 JSON/Protobuf) và gRPC truyền thống qua HTTP/2.
  - Go Core kết nối với các Channel Gateways (Node.js Zalo Gateway, WhatsApp Gateway) qua gRPC streaming và unary RPCs.

### 4.3 Real-time WebSocket Hub (Hội thoại & Thông báo tức thời)
- **Mục đích**: Duy trì 1 kết nối song công (full-duplex) duy nhất giữa Frontend client và backend Omni Core.
- **Cơ chế triển khai**:
  - Đồng bộ trạng thái hội thoại đa kênh (Zalo, Telegram, WhatsApp), đẩy sự kiện tin nhắn mới (inbound/outbound), typing indicator, read receipt.
  - Phân tán sự kiện giữa các Go replica thông qua Redis Pub/Sub stream.

### 4.4 Server-Sent Events - SSE (Truyền dòng Token cho AI Agent)
- **Mục đích**: Phục vụ tính năng AI Copilot, Chatbot trợ lý và RAG Knowledge streaming.
- **Cơ chế triển khai**:
  - Endpoint `interfaces/stream/sse_handler.go` stream từng token văn bản trực tiếp từ LLM providers (DeepSeek, OpenAI) xuống giao diện người dùng theo chuẩn `text/event-stream`.
  - Giảm thiểu overhead so với việc mở WebSocket hai chiều cho các tác vụ chỉ cần luồng dữ liệu 1 chiều từ server.

---

## 5. Chiến Lược Scale & Hiệu Năng

### A. Go Core (Stateless Scale-out)
- **Tài nguyên**: 1 Go Pod chỉ chiếm ~30-60MB RAM, khởi động trong vài mili-giây.
- **Scale ngang**: Đặt nhiều Go replica sau Load Balancer (Traefik/Nginx).
- **Tránh nghẽn DB**: Bắt buộc triển khai **PgBouncer** trung gian gom connection pool trước PostgreSQL.
- **Realtime Sync**: Khi tin nhắn về ở Node Go #1, event bắn lên Redis Pub/Sub → Node Go #2, #3 nhận và đẩy xuống WebSocket của frontend tương ứng.

### B. Node.js Zalo Gateway (Stateful / Session Pool)
- Do thư viện `zca-js` gắn liền kết nối socket với server Zalo, tầng này mang tính stateful theo nick.
- **Phân tải**: Dùng cơ chế **Consistent Hashing** dựa trên `zalo_account_id`.
  - Worker Gateway A: phụ trách Account ID hash `0..33%`
  - Worker Gateway B: phụ trách Account ID hash `34..66%`
  - Worker Gateway C: phụ trách Account ID hash `67..100%`
- Go Core nắm bảng routing hoặc qua 1 micro-proxy nhỏ để định tuyến gRPC tới đúng worker giữ nick.

---

## 6. Lộ Trình Di Trú (Strangler Fig Pattern)

Không đập đi xây lại trong một đêm. Chia 4 giai đoạn an toàn:

| Giai đoạn | Hành động | Mục tiêu |
|---|---|---|
| **Phase 1** | Tách `zca-js` từ code backend hiện tại ra thành **Node.js Zalo Gateway** độc lập, expose gRPC server | Cách ly protocol Zalo, biến nó thành service chuyên biệt |
| **Phase 2** | Dựng khung **Go Core (DDD)**, kết nối với Zalo Gateway qua gRPC; implement trước các nghiệp vụ cốt lõi: Contact ("2 cuốn sổ"), Chat/Conversation | Kiểm chứng hiệu năng và domain invariants trên Go |
| **Phase 3** | Viết proto contract và nối **Next.js** hoặc cập nhật frontend hiện tại gọi Connect-RPC sang Go | Thay thế hoàn toàn backend Fastify cũ |
| **Phase 4** | Dời các module vệ tinh (Campaign, Scoring, Automation, RBAC) sang Go Core | Hoàn tất chuyển đổi sang 100% Go Core + Node Gateway |

---

## 7. AI Layer: Dual-System Architecture (Jev + LLM qua LangChainGo)

### 7.1 Hai khái niệm AI hoàn toàn khác nhau

| | **Jev (System 1)** | **LLM via LangChainGo (System 2)** |
|---|---|---|
| Loại | Decision Model — trả về xác suất | Language Model — sinh văn bản |
| Tốc độ | 70ms - 500ms | 2s - 30s |
| Output | Typed struct: `P(intent)=0.88, confidence=0.92` | Free-form text |
| Hallucination | Không thể — output space cố định (≤255 choices) | Có rủi ro |
| Chi phí | $0.042/1M input, output miễn phí | ~$1-15/1M token (tùy provider) |
| Dùng cho | Phân loại, lọc, routing, scoring, gating | Sinh reply, tóm tắt, extract entities, RAG |

### 7.2 Kiến trúc tách service riêng

```
[ZaloCRM Core (Go)] ──(MCP/gRPC nội bộ)──► [AI Agent Service (Go)]
 - Contact BC                                 ├── Jev Client (HTTP)
 - Conversation BC                            │     └── typesafe.ai API
 - Campaign BC                                ├── LangChainGo Runtime
 - (expose MCP tools: contact_search,         │     ├── LLM Providers
   message_send, get_chat_history)            │     │   (Anthropic, Gemini, OpenAI, Qwen)
                                              │     ├── Tool Calling ← MCP tools từ Core
                                              │     ├── Memory (Redis / pgvector)
                                              │     └── RAG (Qdrant / pgvector)
                                              └── GOSO Gateway (Go)
                                                    ├── Agent runtime
                                                    ├── Approval Gate
                                                    └── Audit / Quota
```

### 7.3 Luồng xử lý tin nhắn với Dual-System

```
Tin nhắn khách tới
        │
        ▼
[Jev: System 1 — 70-200ms]
 Input: context 3 tin cuối + trạng thái Contact
 Output: { P(need_reply), P(spam), P(urgent), P(lead_hot), confidence }
        │
        ├─ P(spam) > 0.90 ──────► Bỏ qua / Tag "Spam" (0 token LLM, mất 200ms)
        │
        ├─ P(need_reply) < 0.50 ► Queue chờ Sale xử lý thủ công
        │
        └─ P(need_reply) ≥ 0.50
                │
                ▼
        [LangChainGo: System 2 — 3-15s]
         - Load ngữ cảnh 40 tin + info dự án BĐS (RAG)
         - Tool call: contact_search, get_property_info
         - Sinh draft reply tiếng Việt
                │
                ▼
        [GOSO Approval Gate]
         - Sale nhận card gợi ý trên UI
         - Accept 1-click → bắn gRPC → Node Zalo GW → Zalo API
         - Reject → loop lại hoặc Sale tự gõ
```

### 7.4 Vị trí trong DDD structure

Jev và LangChainGo là hạ tầng. **Không được lọt vào domain layer.**

```
internal/
├── domain/ai/
│   ├── ports.go           # Interface: DecisionModel, AgentRuntime
│   └── value_objects.go   # DecisionResult{Intent, Confidence}, AgentAction
└── infrastructure/ai/
    ├── jev_client.go       # Implement DecisionModel — gọi typesafe.ai API
    ├── langchain_runner.go # Implement AgentRuntime — dùng tmc/langchaingo
    └── mcp_tool_registry.go# Đăng ký MCP tools từ ZaloCRM Core vào LangChainGo
```

### 7.5 Tích hợp GOSO (Gateway AI sẵn có)

GOSO (`github.com/admatrixorg/goso`) đã build sẵn:
- Agent runtime, LLM routing, billing, audit log, approval gate.
- SPEC 014: ZaloCRM là connector đầu tiên, giao tiếp qua MCP-HTTP port 8089.
- **Lý do tách repo**: ZaloCRM dính AGPL-3.0 license — không thể merge code vào GOSO thương mại. Ranh giới qua HTTP/MCP giữ clean-room.

Khi tích hợp:
1. ZaloCRM Go Core expose MCP Server: `contact_search` (read), `message_send` (write + approval gate).
2. GOSO đăng ký connector `zalocrm` với manifest tools.
3. LangChainGo trong AI Agent Service dùng GOSO làm orchestrator thay vì tự chạy Agent loop.
