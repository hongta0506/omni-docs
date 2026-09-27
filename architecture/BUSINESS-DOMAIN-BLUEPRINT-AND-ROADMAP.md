# Quy Hoạch Nghiệp Vụ Toàn Diện (Business Domain Blueprint) & Lộ Trình Triển Khai Thực Thi

> **Tài liệu đặc tả nghiệp vụ chi tiết Domain-Driven Design (DDD)**  
> **Dự án**: Omni Core (Go Backend Clean Architecture)  
> **Tham chiếu chuẩn**: Toàn bộ nghiệp vụ thực tế từ hệ thống tiền nhiệm ZaloCRM (442 endpoints, 13 background workers, 68 Prisma schema models)  
> **Mục tiêu**: Định danh chính xác 100% logic nghiệp vụ cần hiện thực ở các tầng Domain Invariants, CQRS Commands/Queries, Bun ORM Persistence, Outbox Events thay vì chỉ trả về HTTP Mock/Stub.

---

## 1. Bản Đồ Chuẩn Hóa Cấu Trúc Thư Mục 7 Bounded Contexts

Toàn bộ backend Go (`omni-core`) được quy hoạch chính xác theo 4 tầng Clean DDD, trong đó các sub-channels của **Channel BC** được bóc tách dứt điểm thành các thư mục con riêng biệt:

```
internal/
├── identity/                  # BC 1: Identity, User Profile, RBAC & System Settings
│   ├── domain/                # Aggregate Root User, Tenant, Department, Role, SystemConfig
│   ├── application/           # Commands (Login, Refresh, SwitchTenant, UpdateUser, SaveSettings)
│   │   └── queries/           # Queries (GetCurrentUser, ListUsers, GetRBACMatrix, GetSettings)
│   ├── infrastructure/        # Bun ORM persistence (users, tenants, roles, configs)
│   └── interfaces/http/       # REST Handlers (auth, me, rbac, settings)
│
├── channel/                   # BC 2: Multi-channel Gateway & Proxy Egress Pool
│   ├── domain/                # Aggregate Root ChannelAccount (status, tokens, rate limits)
│   │   ├── zalo/              # Zalo personal: QR session state-machine, Friendships, Groups, Labels
│   │   ├── telegram/          # Telegram: MTProto string session, 2FA, SMS code, Channel/Chat
│   │   ├── whatsapp/          # WhatsApp: WABA/Baileys session, JID mapping
│   │   └── proxy/             # EgressProxy: Binding 1-1 nick/IP, Health check ping, Rotation policy
│   ├── application/           # Cross-channel Router & Sub-channel CQRS
│   │   ├── router/            # InboundEventForwarder, OutboundMessageRouter
│   │   ├── zalo/              # Commands (StartQRLogin, ScanGroup, SyncLabels) | Queries (ListZaloAccs)
│   │   ├── telegram/          # Commands (StartTeleLogin, SubmitCode, Submit2FA) | Queries (ListTeleAccs)
│   │   ├── whatsapp/          # Commands (ConnectWhatsApp, SendWAMessage)
│   │   └── proxy/             # Commands (BindProxy, RotateProxy, CheckHealth) | Queries (ListProxies)
│   ├── infrastructure/        # Adapters & Network Clients
│   │   ├── postgres/          # Bun ORM (channel_accounts, zalo_ext, tele_sessions, egress_proxies)
│   │   ├── redis/             # QR session cache, Telegram auth code cache
│   │   ├── zalo/              # Zalo Gateway WebSocket / HTTP client
│   │   ├── telegram/          # MTProto client wrapper
│   │   └── whatsapp/          # gRPC client kết nối WhatsApp daemon
│   └── interfaces/http/       # REST Delivery Handlers
│       ├── zalo/              # /api/v1/zalo-accounts/*, /zalo-groups/*, /zalo-labels/*
│       ├── telegram/          # /api/v1/telegram-personal/*, /telegram-bridge/*
│       ├── integrations/      # /api/v1/integrations/zalo-oa/*, /zalo-bot/*
│       ├── egress/            # /api/v1/admin/egress/*
│       └── whatsapp/          # /api/v1/webhook/whatsapp
│
├── customer/                  # BC 3: Customer CRM, Two-ledger Contact, Lead Pool & Scoring
│   ├── domain/                # Aggregate Root Contact (Two-ledger: Zalo ledger vs CRM ledger)
│   │   ├── leadpool/          # LeadPool entity, SLA auto-revoke policy, Assignment rules
│   │   ├── scoring/           # RFM scoring rules, Engagement points calculator
│   │   └── subresources/      # ContactNote, Appointment, TimelineEvent
│   ├── application/           # Commands (CreateContact, MergeLedgers, ClaimLead, DistributeLeads)
│   │   └── queries/           # Queries (ListContacts, GetTimeline, LeadPoolStats, ScoringRules)
│   ├── infrastructure/        # Bun ORM (contacts, lead_pool, appointments, notes, scoring_rules)
│   └── interfaces/http/       # REST Handlers (contacts, lead_pool, appointments, scoring, crm_tags)
│
├── conversation/              # BC 4: Omnichannel Messaging, Chat Presets & Media Library
│   ├── domain/                # Aggregate Root Conversation, Message, ChatFolder, MediaAsset
│   ├── application/           # Commands (SendMessage, MarkRead, CreateFolder, UploadMedia, Watermark)
│   │   └── queries/           # Queries (ListConversations, GetMessages, ListFolders, MediaStats)
│   ├── infrastructure/        # Bun ORM (conversations, messages, media_assets) + S3/MinIO driver
│   └── interfaces/http/       # REST Handlers (conversations, messages, presets, media)
│
├── deal/                      # BC 5: Sales Pipeline, Quotes, Products, Order Store & Pancake POS
│   ├── domain/                # Aggregate Root Deal, DealStage (7 stages), Quote, Product, Order
│   ├── application/           # Commands (TransitionStage, ApproveDiscount, CreateQuote, SyncPancake)
│   │   └── queries/           # Queries (ListDeals, PipelineSummary, QuotePDF, ListPancakeOrders)
│   ├── infrastructure/        # Bun ORM (deals, quotes, products, mirrored_orders, pancake_configs)
│   └── interfaces/http/       # REST Handlers (deals, quotes, pricebook, products, pancake, order_store)
│
├── marketing/                 # BC 6: Tags, Broadcasts, Automation ECA Engine & SLA Analytics
│   ├── domain/                # Aggregate Root Tag, BroadcastCampaign, TriggerRule, Sequence
│   ├── application/           # Commands (CreateTag, ScheduleBroadcast, TriggerECA, ToggleSequence)
│   │   └── queries/           # Queries (ListTags, BroadcastStats, ResponseTimeSLA, FunnelMetrics)
│   ├── infrastructure/        # Bun ORM (tags, broadcasts, automation_rules) + Cron/Queue worker
│   └── interfaces/http/       # REST Handlers (tags, campaigns, broadcasts, automation, analytics)
│
└── aiagent/                   # BC 7: AI Agent, Providers, Knowledge Vault (RAG) & Ops Radar
    ├── domain/                # Aggregate Root AIAgent, AIProvider, KnowledgeDoc, RadarSignal
    ├── application/           # Commands (CreateAgent, BindChannel, GenerateReply, IngestDoc)
    │   └── queries/           # Queries (ListAgents, ListProviders, SearchKnowledge, RadarReports)
    ├── infrastructure/        # Bun ORM (ai_agents, ai_providers, knowledge_chunks) + Vector Search
    └── interfaces/http/       # REST Handlers (ai_agents, providers, knowledge, ops_radar, goclaw)
```

---

## 2. Đặc Tả Chi Tiết Khoảng Cách Nghiệp Vụ (Gap Analysis) & Domain Logic Cần Hiện Thực

### Nhóm 1: Channel & Sub-channels BC (`internal/channel`)
*Hiện trạng: Các handlers đang trả về object tĩnh.*

#### 1.1. Zalo Personal (`internal/channel/domain/zalo`)
- **Nghiệp vụ ZaloCRM**:
  - Quản lý QR Code đăng nhập: State machine (INIT -> QR_GENERATED -> SCANNED -> CONFIRMED -> EXPIRED). Quá 120s tự hủy session.
  - Sau khi xác nhận đăng nhập: Lấy Session Cookie (`zpw_sek`, `_zlang`), giải mã Token và lưu vào DB với mã hóa **AES-256-GCM**.
  - Tự động Reconnect: Background worker kiểm tra Heartbeat mỗi 60s. Nếu token hết hạn hoặc session bị logout từ điện thoại -> chuyển trạng thái `NEEDS_RECONNECT`, bắn SSE cảnh báo cho User.
  - Đồng bộ danh bạ bạn bè (`/friends`): Gọi Zalo API lấy danh sách bạn bè, so sánh external UID để lưu vào `channel_friends`.
  - Quét nhóm (`/zalo-groups/:id/members/scan`): Thu thập toàn bộ member trong nhóm Zalo, lọc số điện thoại công khai, phân loại thành viên mới để đưa vào phễu chăm sóc.

#### 1.2. Telegram Personal (`internal/channel/domain/telegram`)
- **Nghiệp vụ ZaloCRM**:
  - Đăng nhập MTProto qua Phone Number (`/telegram-personal/login/start`): Tạo MTProto client, yêu cầu gửi SMS/Telegram Code, sinh `loginId` tạm trong Redis (TTL 5 phút).
  - Xác thực Code (`/submit-code`): Gửi Code lên Telegram server. Nếu tài khoản có 2FA (Cloud Password) -> trả về `needsPassword: true`.
  - Xác thực 2FA (`/submit-password`): Gửi SRP password hash lên Telegram. Sau khi thành công, sinh `session_string` và lưu vào PostgreSQL.

#### 1.3. Egress Proxy Pool (`internal/channel/domain/proxy`)
- **Nghiệp vụ ZaloCRM**:
  - Gắn cố định 1-1 (Sticky Proxy): Mỗi tài khoản Zalo/Telegram phải gắn chặt với 1 IP Proxy (HTTP/SOCKS5) để tránh Zalo/Tele checkpoint do nhảy IP bất thường.
  - Health check: Worker tự động ping Google/Zalo qua Proxy định kỳ 5 phút. Nếu fail liên tiếp 3 lần -> đánh dấu `PROXY_DEGRADED`, tự động xoay (rotate) sang proxy dự phòng trong Pool.

---

### Nhóm 2: Customer & Lead BC (`internal/customer`)
*Hiện trạng: Mới chỉ có lưu Contact cơ bản, chưa có Two-ledger, Lead Pool và Scoring.*

#### 2.1. Kiến trúc 2 Cuốn Sổ (Two-ledger Pattern)
- **Nghiệp vụ ZaloCRM**:
  - **Sổ Zalo (Zalo Ledger)**: Lưu đúng những gì lấy từ Zalo (Zalo Name, Zalo Avatar, Zalo Gender, Zalo Bio). Cấm sale sửa đè trường này vì mỗi lần sync từ Zalo về sẽ cập nhật lại.
  - **Sổ CRM (CRM Ledger)**: Cho phép sale điền thông tin thật (Họ tên thật, Số điện thoại xác minh, Email, Công ty, Địa chỉ giao hàng, Mã số thuế).
  - Khi xem chi tiết Contact: Merge view hiển thị song song hai cuốn sổ (Ví dụ: Tên Zalo là "Mèo Con", nhưng Sổ CRM ghi rõ "Nguyễn Thị Mai - Kế toán trưởng").

#### 2.2. Lead Pool & Thuật toán Phân Bổ Lead
- **Nghiệp vụ ZaloCRM**:
  - Tiếp nhận Lead từ đa kênh (Form quảng cáo, Khách tự nhắn Zalo mới, Quét từ group Zalo) -> Đưa vào `lead_pool` trạng thái `UNASSIGNED`.
  - Phân bổ tự động:
    - **Round-Robin**: Chia đều lần lượt cho các sale đang online/trong ca trực.
    - **Theo hạn mức (Capacity)**: Mỗi sale tối đa được giữ 50 lead chưa chốt. Đầy hạn mức thì chuyển sang sale khác.
  - Thu hồi tự động (Auto-revoke SLA): Nếu sau **24 giờ** (hoặc thời gian cấu hình) mà sale không phát sinh cuộc gọi, tin nhắn hay ghi chú mới -> Lead tự động bị thu hồi về Pool và cảnh báo lên Trưởng phòng.

#### 2.3. Lead Scoring (Chấm Điểm Tương Tác)
- **Nghiệp vụ ZaloCRM**:
  - Điểm tương tác = (Số tin khách gửi x 2) + (Khách click link báo giá x 10) + (Khách rep tin nhắn trong 5p x 5) - (Quá 7 ngày không tương tác x 15).
  - Phân loại nhiệt độ: **Cold** (< 20 điểm), **Warm** (20 - 60 điểm), **Hot** (> 60 điểm). Điểm này quyết định thứ tự ưu tiên hiển thị trên danh sách chat.

---

### Nhóm 3: Deal, Báo Giá & Pancake POS BC (`internal/deal`)
*Hiện trạng: Đã có chuyển giai đoạn Deal, nhưng thiếu Quy trình duyệt (Approvals), Báo giá PDF và Kho đơn Pancake.*

#### 3.1. Quy Trình Duyệt Bán Hàng (Deal Approvals)
- **Nghiệp vụ ZaloCRM**:
  - Sale tạo Deal có chiết khấu:
    - Chiết khấu <= 5%: Tự động duyệt.
    - Chiết khấu 6% - 15%: Cần Trưởng phòng (Leader) phê duyệt (`/deals/:id/approve`).
    - Chiết khấu > 15%: Cần Giám đốc (Director) phê duyệt.
  - Trong lúc chờ duyệt: Deal bị khóa ở trạng thái `PENDING_APPROVAL`, không được phép kéo sang giai đoạn `Won`.

#### 3.2. Báo Giá (Quotes) & Xuất File PDF Tiếng Việt
- **Nghiệp vụ ZaloCRM**:
  - Chọn sản phẩm từ `pricebook` (có bảng giá sỉ/lẻ, tồn kho tức thời).
  - Tự động tính thuế VAT (8% hoặc 10%), chiết khấu dòng, chiết khấu tổng đơn.
  - Render PDF (`/quotes/:id/pdf`): Xuất hóa đơn/báo giá có logo công ty, chữ ký điện tử, điều khoản thanh toán, QR VietQR động chứa số tiền và nội dung chuyển khoản.
  - Gửi báo giá qua Zalo (`/quotes/:id/send-zalo`): Tự động tạo link xem online cho khách và gửi tin nhắn Zalo kèm file PDF.

#### 3.3. Đồng Bộ Pancake POS & Quản Lý Công Nợ
- **Nghiệp vụ ZaloCRM**:
  - Kết nối Pancake qua API Key: Sync danh mục sản phẩm, biến thể (size, màu), tồn kho từ kho hàng Pancake (`/pancake/warehouses`).
  - Webhook nhận đơn: Khi đơn trên Pancake đổi trạng thái (Chờ xác nhận -> Đang giao -> Đã thu tiền / Hoàn hàng), hệ thống Go Core cập nhật trạng thái đơn tương ứng.
  - Tính công nợ: Lưu lịch sử thanh toán từng đợt, tính số tiền nợ còn lại (`debt_amount`) để hiển thị cảnh báo ngay trên khung chat khi sale nhắn tin với khách.

---

### Nhóm 4: Conversation & Thư Viện Rich Media BC (`internal/conversation`)
*Hiện trạng: Nhắn tin cơ bản đã có, thiếu quản lý Media chuyên sâu.*

#### 4.1. Thư Viện Media Bán Hàng (Media Assets)
- **Nghiệp vụ ZaloCRM**:
  - Hỗ trợ lưu trữ Ảnh, Video, Tài liệu Catalog sản phẩm trên S3/MinIO.
  - Tự động sinh thumbnail nhiều kích thước (150x150, 600x600).
  - Đóng dấu Watermark (`/media/:id/watermark`): Tự động chèn số điện thoại của Nick Zalo hoặc Logo công ty vào góc ảnh sản phẩm trước khi gửi cho khách để tránh bị đối thủ ăn cắp ảnh.
  - Thùng rác (Trash): File xóa đưa vào Trash, sau 30 ngày Cron worker tự động dọn sạch ổ đĩa.

---

### Nhóm 5: Marketing & Động Cơ Tự Động Hóa (Automation ECA Engine) (`internal/marketing`)
*Hiện trạng: Mới có Tags cơ bản, chưa có Engine tự động hóa và Rate-limited Broadcast.*

#### 5.1. Động Cơ Event-Condition-Action (ECA Engine)
- **Nghiệp vụ ZaloCRM**:
  - **Event (Sự kiện)**: Khách mới kết bạn Zalo, Khách nhắn tin sau 22h, Deal chuyển sang Lost, Khách không trả lời quá 2 tiếng.
  - **Condition (Điều kiện)**: Tag chứa "VIP", Nguồn là "Facebook Ads", Giá trị đơn > 5 triệu.
  - **Action (Hành động)**: Tự động gửi tin nhắn chào mừng, tự động gắn tag "Cần hỗ trợ gấp", tự động giao việc cho sale trực, gửi thông báo Telegram cho sếp.

#### 5.2. Broadcast Chiến Dịch Hàng Loạt Có Rate Limiting
- **Nghiệp vụ ZaloCRM**:
  - Chống khóa nick Zalo: Khi gửi tin cho 1.000 khách, worker bắt buộc phải phân bổ qua nhiều nick Zalo (Multi-account distribution).
  - Giãn cách an toàn (Jitter Delay): Random từ 15 đến 35 giây giữa 2 tin nhắn liên tiếp.
  - Hạn mức ngày: Mỗi nick cá nhân chỉ được gửi tối đa 50 tin nhắn cho người lạ/ngày. Đạt mốc tự động ngắt và hẹn giờ sang ngày hôm sau.

---

### Nhóm 6: AI Agent, Knowledge Vault & Ops Radar (`internal/aiagent`)
*Hiện trạng: PR 92 đã tạo cấu trúc Provider/Agent, còn thiếu RAG Vector Vault và Ops Radar.*

#### 6.1. Knowledge Vault (RAG Tri Thức Bán Hàng)
- **Nghiệp vụ ZaloCRM**:
  - Cho phép tải tài liệu PDF, Word, File hướng dẫn sản phẩm lên (`/ai/knowledge/documents`).
  - Background worker chunking văn bản thành các đoạn 500 ký tự (overlap 50 ký tự), gọi Embedding API lưu vector vào Postgres (`pgvector`).
  - Khi khách hỏi: Tìm kiếm ngữ nghĩa (Semantic search) lấy top 3 đoạn liên quan nhất để nạp vào Context Prompt cho AI trả lời chính xác thông tin nội bộ của công ty.

#### 6.2. Ops Radar (Radar Giám Sát Vận Hành)
- **Nghiệp vụ ZaloCRM**:
  - Realtime Scanner phát hiện các rủi ro vận hành:
    - Khách nhắn tin nhưng sale **bỏ quên quá 15 phút** trong giờ hành chính.
    - Tin nhắn khách hàng chứa từ khóa khiếu nại, tiêu cực ("lừa đảo", "chất lượng kém", "hoàn tiền", "chửi").
    - Sale xóa liên hệ hàng loạt hoặc tải dữ liệu bất thường.
  - Bắn cảnh báo đỏ (Critical Signal) trực tiếp lên thanh thông báo của Giám đốc/Quản lý.

---

## 3. Lộ Trình Triển Khai Thực Thi Theo Từng Sprint (Implementation Roadmap)

| Sprint | Bounded Context | Nhóm Nghiệp Vụ Cần Xử Lý | Mục Tiêu Kỹ Thuật (Deliverables) |
|:---:|---|---|---|
| **Sprint 13** | **Channel BC** | Zalo Personal QR State Machine, Auto-Reconnect & Proxy Binding | Aggregate `ZaloSession`, `ProxyBinding`, AES-256 token encryption, Ping worker, kết nối database `channel_accounts` & `egress_proxies` |
| **Sprint 14** | **Channel BC** | Telegram MTProto Login, 2FA & Zalo OA OAuth Sync | MTProto client wrapper, Redis login cache, OA token refresh daemon, lưu trữ `telegram_sessions` |
| **Sprint 15** | **Customer BC** | Two-Ledger (Sổ Zalo vs Sổ CRM), Merge Contacts & Timeline | Entity `ContactLedger`, validation bất biến không cho sửa đè sổ Zalo, timeline event stream, bảng `contact_ledgers` |
| **Sprint 16** | **Customer BC** | Lead Pool Round-Robin, Capacity & Auto-Revoke SLA Worker | Domain service `LeadAllocator`, cron worker thu hồi lead sau 24h, bảng `lead_pool` & `lead_allocations` |
| **Sprint 17** | **Deal BC** | Deal Approvals Workflow & Quotes PDF Engine with VietQR | Aggregate `Quote`, `DealApproval`, Go PDF generator render hóa đơn tiếng Việt + VietQR, bảng `quotes` & `pricebooks` |
| **Sprint 18** | **Deal BC** | Pancake POS Webhook Sync, Product Stocks & Debt Balance | Webhook processor, Debt ledger calculator, bảng `pancake_configs` & `mirrored_orders` |
| **Sprint 19** | **Marketing BC** | Automation ECA Engine & Rate-limited Broadcast Worker | Domain event subscriber, ECA rule evaluator, Rate-limited queue worker chống khóa nick Zalo |
| **Sprint 20** | **AI Agent BC** | Knowledge Vault RAG (Embedding + PgVector) & Ops Radar | Text chunking worker, pgvector cosine search, Ops Radar rule scanner cảnh báo sale bỏ quên khách |
