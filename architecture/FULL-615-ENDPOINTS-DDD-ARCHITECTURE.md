# Kiến Trúc Bounded Context & Chuẩn Hóa Phân Tầng DDD Cho Toàn Bộ 615 REST Endpoints

> **Tài liệu chuẩn hóa kiến trúc Domain-Driven Design (DDD)**  
> **Dự án**: Omni Core (Go Backend Clean DDD)  
> **Phiên bản**: 3.0.0 (Cập nhật 2026-09-27)  
> **Mục tiêu**: Gom nhóm, phân rã 615 REST API endpoints từ `omni-web` vào đúng Bounded Context, chuẩn hóa thư mục con ở 4 tầng: `domain/`, `application/`, `infrastructure/`, `interfaces/`.

---

## 1. Nguyên Tắc Phân Định Bounded Context (Domain Boundaries)

Hệ thống được chia thành **7 Bounded Contexts cốt lõi** và **1 Bounded Context hỗ trợ (Supporting Subdomain)** theo đúng bản đồ ngữ cảnh (Context Map):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OMNI CORE SYSTEM                                │
│                                                                        │
│  [Identity & Settings BC] ─── Cung cấp danh tính, phân quyền, config  │
│          │                                                             │
│          ▼                                                             │
│  [Channel BC] ─────────────── Quản lý nick Zalo, Telegram, OA, Proxy   │
│          │                                                             │
│          ▼                                                             │
│  [Customer & Lead BC] ─────── Quản lý 2 cuốn sổ, Lead Pool, Scoring    │
│          │                                                             │
│          ▼                                                             │
│  [Conversation & Media BC] ── Hội thoại đa kênh, Socket Hub, Rich Media│
│          │                                                             │
│          ▼                                                             │
│  [Deal & Order BC] ────────── Bán hàng, Báo giá, Kho đơn, Pancake POS │
│          │                                                             │
│          ▼                                                             │
│  [Marketing & Automation BC]  Chiến dịch, Trigger, Sequence, Tagging   │
│          │                                                             │
│          ▼                                                             │
│  [AI Agent & Knowledge BC] ── GoClaw Bridge, Knowledge Vault, Ops Radar│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Quy Chuẩn Cấu Trúc 4 Tầng Trong Từng Bounded Context

Mọi Bounded Context trong `internal/<bc>/` bắt buộc tuân thủ cấu trúc phân tầng con chuyên biệt:

```
internal/<bc>/
├── domain/                    # 1. CORE DOMAIN LAYER (Zero external dependencies)
│   ├── <aggregate_root>.go    # Aggregate Root, invariants, validation methods
│   ├── <entity>.go            # Các entity con trong Aggregate
│   ├── <value_objects>.go     # Value Objects bất biến (VO)
│   ├── events.go              # Domain Events phát sinh khi thay đổi trạng thái
│   ├── repository.go          # Repository Ports (Interfaces nhận *ValidatedAggregate)
│   └── validation.go          # Validated<Aggregate> type wrapper
│
├── application/               # 2. APPLICATION CQRS LAYER
│   ├── commands/              # Handlers thực thi thay đổi (Write side)
│   │   ├── <action>_cmd.go
│   │   └── dispatcher.go      # Event Dispatcher outbox
│   └── queries/               # Handlers truy vấn tối ưu (Read side)
│       └── <action>_qry.go
│
├── infrastructure/            # 3. INFRASTRUCTURE PERSISTENCE LAYER
│   ├── postgres/              # Triển khai Bun ORM / raw SQL
│   │   ├── models/            # Bun DB schema models (Gắn tag `bun:"..."`)
│   │   └── <entity>_repo.go   # Hiện thực domain.Repository interface
│   ├── client/                # Clients gọi dịch vụ bên ngoài (nếu có)
│   └── cache/                 # Redis cache / In-memory buffer
│
└── interfaces/                # 4. DELIVERY INTERFACES LAYER (Đa giao thức)
    ├── http/                  # [RESTful API] Phục vụ Frontend Web (Vue 3 / Next.js)
    │   ├── router.go          # Định tuyến sạch sẽ, gom route theo resource
    │   └── <entity>_handler.go# Parse HTTP Request -> gọi Command/Query -> JSON
    ├── grpc/                  # [Connect-RPC & gRPC] Type-safe RPC cho Gateway/Daemon
    │   └── <service>_server.go
    └── ws/                    # [WebSocket Hub] Realtime streaming sự kiện
        └── hub.go
```

---

## 3. Bản Đồ Phân Rã Chi Tiết 615 Endpoints Vào 7 Bounded Contexts

### BC 1: `Identity & Settings BC` (`internal/identity`) — 72 Endpoints
*Chịu trách nhiệm: Xác thực, Người dùng cá nhân, Phân quyền RBAC, Phòng ban, Cấu hình Tenant & Hệ thống.*

- **Thư mục con**:
  - `domain/`: `User`, `Tenant`, `Department`, `PermissionGroup`, `SystemConfig`
  - `application/commands/`: `Login`, `RefreshToken`, `ChangePassword`, `UpdateProfile`, `CreateUser`, `AssignRole`, `UpdateConfig`
  - `application/queries/`: `GetCurrentUser`, `ListTenants`, `GetRBACMatrix`, `ListDepartments`, `GetSystemSettings`
  - `infrastructure/postgres/`: `user_repo.go`, `tenant_repo.go`, `rbac_repo.go`, `settings_repo.go`
  - `interfaces/http/`:
    - `auth_handler.go`: `/auth/login`, `/auth/refresh`, `/auth/tenants`, `/auth/switch-tenant`
    - `me_handler.go`: `/me`, `/me/profile`, `/me/avatar`, `/me/change-password`, `/me/preferences`
    - `rbac_handler.go`: `/permission-groups/*`, `/departments/*`, `/rbac/users`, `/users/*`
    - `settings_handler.go`: `/settings/*`, `/organization/*`, `/branding/*`, `/system-notifications/*`, `/setup/*`

---

### BC 2: `Channel & Gateway BC` (`internal/channel`) — 95 Endpoints
*Chịu trách nhiệm: Quản lý danh sách Nick Zalo, Telegram cá nhân, WhatsApp, Zalo OA, Zalo Bot, và Egress Proxy Pool.*

- **Thư mục con theo chuẩn DDD phân rã theo từng Sub-channel**:
  - `domain/`:
    - `channel_account.go` (Aggregate Root chung: status, token, limits, proxy_binding)
    - `zalo/` (ZaloGroup, ZaloLabel, ZaloFriend, QRSession)
    - `telegram/` (TelegramAccount, TelegramSession, MTProtoConfig)
    - `whatsapp/` (WhatsAppAccount, WABASession)
    - `proxy/` (EgressProxy, ProxyBinding, RotationPolicy)
  - `application/`:
    - `router/` (InboundEventForwarder, OutboundMessageRouter)
    - `zalo/` (Commands: ScanGroup, SyncLabels, QRLogin | Queries: ListZaloAccounts, ListGroups)
    - `telegram/` (Commands: StartTeleLogin, VerifyTeleCode, RotateTeleProxy | Queries: ListTeleAccounts)
    - `whatsapp/` (Commands: ConnectWhatsApp, SendWhatsAppMessage)
    - `proxy/` (Commands: BindProxy, RotateProxy | Queries: ListProxies)
  - `infrastructure/`:
    - `postgres/` (models/, channel_account_repo.go, zalo_repo.go, telegram_repo.go, proxy_repo.go)
    - `redis/` (qr_session_store.go, telegram_session_store.go)
    - `telegram/` (mtproto_client.go, tele_gateway_adapter.go)
    - `whatsapp/` (grpc_client.go, event_subscriber.go)
    - `zalo/` (zalo_client.go)
  - `interfaces/http/`:
    - `zalo/`: `/zalo-accounts/*`, `/privacy/*`, `/friends/*`, `/zalo-groups/*`, `/zalo-labels/*`, `/account-folders/*`
    - `telegram/`: `/telegram-personal/*`, `/telegram-bridge/*`
    - `integrations/`: `/integrations/zalo-oa/*`, `/integrations/zalo-bot/*`
    - `egress/`: `/admin/egress/*`
    - `whatsapp/`: `/webhook/whatsapp`
    - `zalo_group_handler.go`: `/zalo-groups/*`, `/zalo-labels/*`, `/account-folders/*`
    - `integration_handler.go`: `/integrations/zalo-oa/*`, `/integrations/zalo-bot/*`
    - `telegram_handler.go`: `/telegram-personal/*`, `/telegram-bridge/*`
    - `egress_handler.go`: `/admin/egress/*`

---

### BC 3: `Customer & Lead BC` (`internal/customer`) — 92 Endpoints
*Chịu trách nhiệm: Danh bạ 2 cuốn sổ (Sổ Zalo & Sổ CRM), Ghi chú, Lịch hẹn, Lead Pool, Lead Scoring, Khách hàng mục tiêu.*

- **Thư mục con**:
  - `domain/`: `Contact`, `ContactProfile`, `ContactNote`, `Appointment`, `LeadPool`, `EngagementScore`
  - `application/commands/`: `CreateContact`, `MergeContacts`, `AddNote`, `CreateAppointment`, `AssignLead`, `ClaimLead`, `RecalculateScore`
  - `application/queries/`: `ListContacts`, `GetContactTimeline`, `ListAppointments`, `ListLeadPool`, `GetLeadScoring`
  - `infrastructure/postgres/`: `contact_repo.go`, `sub_resource_repo.go`, `lead_pool_repo.go`
  - `interfaces/http/`:
    - `contact_handler.go`: `/contacts/*`, `/crm-tags/*`, `/timeline/*`
    - `lead_pool_handler.go`: `/lead-pool/*`, `/leads/*`, `/customer-lists/*`, `/customer-list-entries/*`
    - `appointment_handler.go`: `/appointments/*`
    - `scoring_handler.go`: `/scoring/*`

---

### BC 4: `Conversation & Media BC` (`internal/conversation`) — 82 Endpoints
*Chịu trách nhiệm: Hội thoại đa kênh, Quản lý tin nhắn, Chat folders, Mẫu trả lời nhanh (Presets), Thư viện Rich Media.*

- **Thư mục con**:
  - `domain/`: `Conversation`, `Message`, `ChatFolder`, `ChatPreset`, `MediaAsset`
  - `application/commands/`: `SendMessage`, `MarkRead`, `AssignConversation`, `CreateFolder`, `UploadMedia`, `DeleteMedia`
  - `application/queries/`: `ListConversations`, `GetMessages`, `ListFolders`, `ListPresets`, `ListMediaAssets`
  - `infrastructure/postgres/`: `conversation_repo.go`, `conversation_ext_repo.go`, `media_repo.go`
  - `interfaces/http/`:
    - `conversation_handler.go`: `/conversations/*`, `/external-conversations/*`
    - `preset_handler.go`: `/chat/presets/*`, `/conversations/folders/*`
    - `media_handler.go`: `/media/*` (upload, folders, favorites, trash, watermark)

---

### BC 5: `Deal & E-commerce BC` (`internal/deal`) — 85 Endpoints
*Chịu trách nhiệm: Sales Pipeline Kanban 7 giai đoạn, Báo giá Quotes, Quản lý Sản phẩm, Kho đơn đa nguồn, Pancake POS.*

- **Thư mục con**:
  - `domain/`: `Deal`, `Quote`, `Product`, `MirroredOrder`, `DebtBalance`
  - `application/commands/`: `CreateDeal`, `TransitionStage`, `CreateQuote`, `SyncProduct`, `MirrorOrder`, `SettleDebt`
  - `application/queries/`: `ListDeals`, `GetPipelineSummary`, `ListQuotes`, `SearchProducts`, `ListOrders`
  - `infrastructure/postgres/`: `deal_repo.go`, `quote_repo.go`, `product_repo.go`, `order_repo.go`
  - `interfaces/http/`:
    - `deal_handler.go`: `/deals/*` (approvals, views, stages)
    - `quote_handler.go`: `/quotes/*`, `/pricebook/*`
    - `product_handler.go`: `/products/*` (stocks, sync)
    - `order_platform_handler.go`: `/order-store/*`, `/order-platform/*`, `/pancake/*`

---

### BC 6: `Marketing & Automation BC` (`internal/marketing`) — 84 Endpoints
*Chịu trách nhiệm: Tags & Nhóm thẻ, Chiến dịch Broadcast, Kịch bản nuôi dưỡng (Sequences), Bộ kích hoạt (Triggers), Báo cáo SLA.*

- **Thư mục con**:
  - `domain/`: `Tag`, `TagGroup`, `BroadcastCampaign`, `SequenceRule`, `TriggerWorkflow`
  - `application/commands/`: `CreateTag`, `CreateCampaign`, `ExecuteBroadcast`, `CreateTrigger`, `ToggleSequence`
  - `application/queries/`: `ListTags`, `ListCampaigns`, `ListTriggers`, `GetCampaignStats`
  - `infrastructure/postgres/`: `tag_repo.go`, `campaign_repo.go`, `automation_repo.go`
  - `interfaces/http/`:
    - `tagging_handler.go`: `/tags/*`, `/tag-groups/*`
    - `campaign_handler.go`: `/broadcasts/*`, `/campaigns/*`
    - `automation_handler.go`: `/automation/*`, `/marketing/sequences/*`
    - `analytics_handler.go`: `/analytics/*`, `/reports/*`, `/dashboard/*`

---

### BC 7: `AI Agent & Knowledge BC` (`internal/aiagent`) — 65 Endpoints
*Chịu trách nhiệm: AI Providers (DeepSeek/OpenAI), AI Agents, Cầu nối GoClaw HMAC Bridge, Kho tri thức RAG Vault, Ops Radar.*

- **Thư mục con**:
  - `domain/`: `AIAgent`, `AIProvider`, `KnowledgeDocument`, `AgentBinding`, `RadarSignal`
  - `application/commands/`: `CreateAgent`, `BindChannel`, `GenerateReply`, `UploadDocument`, `AcknowledgeSignal`
  - `application/queries/`: `ListAgents`, `ListProviders`, `GetDocumentContent`, `ListRadarSignals`
  - `infrastructure/postgres/`: `agent_repo.go`, `knowledge_repo.go`, `radar_repo.go`
  - `interfaces/http/`:
    - `agent_handler.go`: `/ai-agents/*`, `/goclaw-providers/*`
    - `knowledge_handler.go`: `/ai/knowledge/*`, `/ai/company-profile/*`, `/ai/agent-hands/*`
    - `goclaw_bridge.go`: `/api/integrations/goclaw/*` (HMAC verify)
    - `ops_radar_handler.go`: `/ops-radar/*`, `/work-items/*`

---

## 4. Kế Hoạch Đóng Gói Issues Triển Khai (Sprint Roadmap)

Mỗi gói sẽ triển khai trọn gói 4 tầng và đăng ký router sạch sẽ, đảm bảo test pass 100%:

1. **Sprint 9 - Issue #85**: `[Identity-Settings] feat: Full REST HTTP interfaces (Me, Users, Settings, Preferences)`
2. **Sprint 9 - Issue #86**: `[Channel-Ext] feat: Zalo Account Operations & Sub-channels (OA, Bot, Telegram) REST HTTP`
3. **Sprint 10 - Issue #87**: `[Customer-Lead] feat: Lead Pool, Appointments & Scoring REST HTTP`
4. **Sprint 10 - Issue #88**: `[Deal-Order] feat: Quotes, Products, Pricebook & Pancake Order Store REST HTTP`
5. **Sprint 11 - Issue #89**: `[Conversation-Media] feat: Media Library Folders & Watermarks REST HTTP`
6. **Sprint 11 - Issue #90**: `[Marketing-Auto] feat: Automation Triggers, Sequences & Customer Lists REST HTTP`
7. **Sprint 12 - Issue #91**: `[AI-Knowledge] feat: Company Profile, Knowledge Documents & Ops Radar REST HTTP`
