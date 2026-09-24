# Omni — Architecture & Migration Documentation

Tài liệu thiết kế kiến trúc, catalog nghiệp vụ và lộ trình chuyển đổi **Omni** (nền tảng CRM đa kênh: Zalo, Facebook Messenger, WhatsApp, Telegram, và các kênh nhắn tin khác) từ Fastify/Node.js sang **Golang Clean Architecture + DDD + Connect-RPC**.

---

## 1. Mục lục tài liệu

| Thư mục / File | Mô tả |
|---|---|
| [`architecture/CURRENT-ARCHITECTURE-AUDIT.md`](./architecture/CURRENT-ARCHITECTURE-AUDIT.md) | Báo cáo kiểm toán kiến trúc Node.js hiện tại (Anemic Model, đánh giá mức độ DDD) — baseline từ ZaloCRM v1 (Zalo-only) |
| [`architecture/NEXTGEN-GOLANG-DDD-SPEC.md`](./architecture/NEXTGEN-GOLANG-DDD-SPEC.md) | Đặc tả kiến trúc Go Core + Clean/DDD + Connect-RPC + Dual-System AI (Jev + LangChainGo) |
| [`architecture/ZALOCRM-FUNCTIONAL-CATALOG.md`](./architecture/ZALOCRM-FUNCTIONAL-CATALOG.md) | 442 API endpoints & 13 background workers — catalog đầy đủ từ source code ZaloCRM v1 |
| [`migration/DDD-MIGRATION-MASTER-PLAN.md`](./migration/DDD-MIGRATION-MASTER-PLAN.md) | Kế hoạch tổng thể: Bounded Contexts, database strategy, proto contract, lộ trình 4 giai đoạn |
| [`diagrams/`](./diagrams/) | Sơ đồ hệ thống, data model, backend modules (Mermaid, Excalidraw, PNG, SVG) |

---

## 2. Tầm nhìn Omni: Đa Kênh (Multi-Channel)

ZaloCRM v1 chỉ hỗ trợ Zalo. **Omni** mở rộng sang toàn bộ kênh nhắn tin, thống nhất dưới một nghiệp vụ CRM duy nhất:

| Kênh | Gateway Service | Trạng thái |
|---|---|---|
| **Zalo** (cá nhân) | `zalo-gateway` (Node.js + zca-js) | Hiện tại — Phase 1 di trú |
| **Facebook Messenger** | `fb-gateway` (Node.js / Go + Graph API) | Kế hoạch — Phase 4+ |
| **WhatsApp** | `wa-gateway` (Go + Meta Cloud API) | Kế hoạch — Phase 4+ |
| **Telegram** | `tg-gateway` (Go + Bot API) | Kế hoạch — Phase 4+ |

**Nguyên tắc cốt lõi**: Go Core **không biết** đang nói chuyện với Zalo hay Facebook. Mọi kênh đều được bọc thành một `ChannelGateway` service thống nhất giao tiếp qua gRPC với interface chung (`gateway.proto`).

---

## 3. Tóm tắt định hướng kiến trúc

```
[Web / Mobile Client]
        │ Connect-RPC (HTTP/2 hoặc JSON)
        ▼
┌──────────────────────────────────────────┐
│  Go Core (DDD Monolith — stateless)      │
│  ├── Identity & Access BC                │
│  ├── Customer & Relationship BC          │
│  ├── Conversation & Messaging BC         │
│  ├── Growth & Engagement BC              │
│  ├── Intelligence & AI BC               │
│  └── Reporting & Platform BC            │
└────────────────────┬─────────────────────┘
                     │ gRPC (internal network)
        ┌────────────┼────────────┬────────────┐
        ▼            ▼            ▼            ▼
  [Zalo GW]   [FB Messenger  [WhatsApp   [Telegram
  (Node.js)    GW (Go)]       GW (Go)]    GW (Go)]
```

- **Go Core**: Clean Architecture + Rich Domain Model (Aggregates, Value Objects, Domain Events). Stateless, scale ngang sau Load Balancer.
- **Channel Gateways**: Mỗi kênh là 1 sidecar service độc lập. Go Core giao tiếp với tất cả qua interface gRPC chuẩn hóa.
- **Connect-RPC & Protobuf**: Contract duy nhất xuyên suốt hệ thống.
- **Dual-System AI**:
  - System 1 (Jev): Phân loại, routing, spam filter (70-200ms, 0 token LLM).
  - System 2 (LLM qua LangChainGo & GOSO Gateway): Tóm tắt, RAG, sinh câu trả lời có Approval Gate.

---

## 4. Repository liên quan

| Repo | Mô tả |
|---|---|
| `ZaloCRM` | Codebase Node.js Fastify hiện tại — Zalo-only (legacy, dần thay thế) |
| `omni-go` (tạo mới) | Go Core DDD — engine nghiệp vụ đa kênh |
| `zalocrm-zalo-gateway` (tách từ ZaloCRM) | Node.js Zalo Gateway (zca-js sidecar) |
| `goso` | AI Gateway — Agent runtime, LLM routing, Approval Gate |
| `omni-docs` | **Repo này** — tài liệu kiến trúc & migration |
