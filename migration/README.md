# Migration — Kế Hoạch & Ma Trận Di Trú Sang Go Clean DDD

> Thư mục chứa toàn bộ chiến lược, lộ trình sprint, phân tích chênh lệch production (Gap Analysis) và các tài liệu ánh xạ (mapping) chi tiết 615 endpoints từ Fastify/Prisma sang Go Clean DDD + Connect-RPC.

---

## 1. Số Liệu Quy Chuẩn

| Chỉ số | Giá trị | Giải thích |
|---|---|---|
| **Tổng routes thô (Raw)** | **792** | Quét từ codebase Fastify monolith (tính cả dev, mock, deprecated, parameter variants). |
| **Routes nghiệp vụ chuẩn hóa** | **615** | Phạm vi cần di trú sau khi lọc trùng, chuẩn hóa theo 8 Bounded Contexts. |
| **Workers nền** | **27** | Background workers xử lý queue, sync, cron, webhook. |
| **Bounded Contexts** | **8** | Identity, Channel, Customer, Conversation, Deal, Marketing, AI Agent, Service API & Gateway. |
| **Số Sprints di trú** | **6** | Lộ trình chuyển đổi toàn diện theo phương pháp Strangler Fig. |

---

## 2. Mục Lục Tài Liệu Di Trú

### 2.1 Chiến Lược & Lộ Trình Tổng Thể

| File | Mô tả | Trọng tâm |
|---|---|---|
| [`DDD-MIGRATION-MASTER-PLAN.md`](./DDD-MIGRATION-MASTER-PLAN.md) | Kế hoạch tổng thể di trú sang Go Clean DDD | Phân rã 8 Bounded Contexts, mô hình "2 cuốn sổ" mở rộng (`Contact` + `ChannelProfile`), chiến lược Strangler Fig 4 pha, zero-downtime DB migration. |
| [`SPRINT-MIGRATION-ROADMAP.md`](./SPRINT-MIGRATION-ROADMAP.md) | Lộ trình chuyển đổi 6 Sprints | Phân bổ công việc chi tiết theo từng sprint nghiệp vụ dựa trên bản production `release/orbstack-mini-20260924`. |
| [`PRODUCTION-GAP-ANALYSIS.md`](./PRODUCTION-GAP-ANALYSIS.md) | Phân tích chênh lệch Production | Đối chiếu 177 routes core ban đầu vs 615 routes production thực tế. Định vị 438 routes thiếu hụt và danh sách Issue A–H. |
| [`DETAILED-MIGRATION-WBS.md`](./DETAILED-MIGRATION-WBS.md) | Phân rã cấu trúc công việc (WBS) | 8 Epics lớn, khớp chi tiết từng module ZaloCRM sang Go package, route controller và technical specs. |

### 2.2 Tài Liệu Ánh Xạ Chi Tiết Theo Bounded Context (Mapping Specs)

| File | Bounded Context | Modules cũ | Số routes |
|---|---|---|:---:|
| [`customer-api-mapping.md`](./customer-api-mapping.md) | Customer & Lead | `contacts` (core) | 16 |
| [`mapping-customer-ext.md`](./mapping-customer-ext.md) | Customer & Lead (Extended) | `contacts`, `lead-pool`, `customer-lists`, `appointments`, `notes` | 78 |
| [`mapping-deals-and-orders.md`](./mapping-deals-and-orders.md) | Deal & E-commerce | `deals`, `quotes`, `products`, `pricebook`, `order-store`, `pancake` | 69 |
| [`mapping-marketing-and-channels.md`](./mapping-marketing-and-channels.md) | Marketing & Channel Extensions | `campaign`, `tags`, `zalo` (quản lý nhóm, egress proxy) | 179 |
| [`mapping-ai-agent-and-goclaw-bridge.md`](./mapping-ai-agent-and-goclaw-bridge.md) | AI Agent & Knowledge | `goclaw-providers`, `ai-agents`, `knowledge`, `radar` | 65 |
| [`mapping-service-api-and-analytics.md`](./mapping-service-api-and-analytics.md) | Service API & Gateway | `service-api` (68), `analytics` + `ops-radar` (45) | 113 |

### 2.3 Dữ Liệu Kiểm Toán (Audit Data)

| File | Mô tả |
|---|---|
| [`PROD-ROUTES-AUDIT.json`](./PROD-ROUTES-AUDIT.json) | Dữ liệu thô quét tự động từ mã nguồn Fastify: method, path, module, controller handler cho toàn bộ routes production. |

---

## 3. Thứ Tự Đọc Khuyến Nghị

```
DDD-MIGRATION-MASTER-PLAN.md (Tổng quan chiến lược)
       │
       ▼
PRODUCTION-GAP-ANALYSIS.md (Hiểu rõ khoảng trống cần bù)
       │
       ▼
SPRINT-MIGRATION-ROADMAP.md (Nắm thứ tự thực hiện theo Sprint)
       │
       ▼
DETAILED-MIGRATION-WBS.md (Tra cứu checklist công việc)
       │
       ▼
mapping-*.md (Tra cứu chi tiết từng Bounded Context khi implement)
```
