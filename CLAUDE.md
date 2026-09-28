# CLAUDE.md — Omni Docs (Quy Định Phát Triển Tài Liệu Kiến Trúc)

> Hướng dẫn chuẩn hóa SDLC, quy chuẩn phân rã Bounded Context và quy trình thực thi tài liệu trong repo `omni-docs`.

---

## 0. Ngôn Ngữ Giao Tiếp (Communication Language)

**Toàn bộ giải thích, trao đổi, kế hoạch và phản hồi tới người dùng BẮT BUỘC bằng TIẾNG VIỆT.**
Tên biến, hàm, endpoint, commands, file paths, JSON/Protobuf schemas giữ nguyên tiếng Anh gốc.

---

## 1. Nguyên Tắc Docs-First & Kích Hoạt Skills Bắt Buộc

Trước khi thiết kế, viết tài liệu hoặc hướng dẫn triển khai cho bất kỳ tính năng nào:
1. **Kích hoạt Skill Phân Tích Nghiệp Vụ (BẮT BUỘC LOAD ĐẦU TIÊN)**:
   - `/business-analyst`: Khảo sát nhu cầu (Jobs-to-Be-Done, 5 Whys), chuẩn hóa Ubiquitous Language, viết User Stories và BDD Acceptance Criteria (Given/When/Then), phân định Tenant scope / Role permission trước khi vào kỹ thuật.
2. **Đọc tài liệu gốc tại `omni-docs/architecture/` và `omni-docs/migration/`**:
   - `MASTER-ARCHITECTURE-BLUEPRINT.md`
   - `NEXTGEN-GOLANG-DDD-SPEC.md`
   - `DDD-MIGRATION-MASTER-PLAN.md`
   - `mapping-service-api-and-analytics.md`
3. **Kích hoạt Skills DDD & Kiến Trúc**:
   - Khảo sát & Bounded Context: `/ddd-scope`, `/ddd-contexts`, `/ddd-aggregates`
   - Cấu trúc Go DDD: `/golang-ddd`, `/golang-ddd-architecture`, `/golang-ddd-cqrs`

---

## 2. Quy Chuẩn Bounded Contexts & Cấu Trúc Thư Mục Go Backend

Hệ thống được chia thành 8 Bounded Contexts cốt lõi tại `omni-core/internal/`:

1. **`internal/identity` (Identity & Settings BC)**:
   - Phạm vi: Authentication, User profile, RBAC permissions, Departments, Tenant settings.
   - Endpoints: `/api/v1/auth/*`, `/api/v1/me/*`, `/api/v1/users/*`, `/api/v1/departments/*`, `/api/v1/settings/*`.

2. **`internal/channel` (Channel & Gateway BC)**:
   - Phạm vi: Zalo accounts, Telegram personal, WhatsApp, Zalo OA/Bot integrations, Egress proxy pool.
   - Endpoints: `/api/v1/zalo-accounts/*`, `/api/v1/zalo-groups/*`, `/api/v1/telegram-personal/*`, `/api/v1/integrations/*`, `/api/v1/admin/egress/*`.

3. **`internal/customer` (Customer & Lead BC)**:
   - Phạm vi: Contacts CRM, Leads, Lead Pool, Customer Lists (Segments), Appointments, Notes, Scoring, Timeline.
   - Endpoints: `/api/v1/contacts/*`, `/api/v1/leads/*`, `/api/v1/lead-pool/*`, `/api/v1/customer-lists/*`, `/api/v1/appointments/*`, `/api/v1/scoring/*`.

4. **`internal/conversation` (Conversation & Media BC)**:
   - Phạm vi: Quản lý chat đa kênh, Messages, Chat folders, Chat presets (trả lời nhanh), Media asset library, Watermarks.
   - Endpoints: `/api/v1/conversations/*`, `/api/v1/messages/*`, `/api/v1/chat/presets/*`, `/api/v1/media/*`.

5. **`internal/deal` (Deal & E-commerce BC)**:
   - Phạm vi: Sales pipeline Kanban, Quotes báo giá, Products, Pricebook bảng giá, Order store đồng bộ Pancake POS.
   - Endpoints: `/api/v1/deals/*`, `/api/v1/quotes/*`, `/api/v1/products/*`, `/api/v1/pricebook/*`, `/api/v1/order-store/*`, `/api/v1/pancake/*`.

6. **`internal/marketing` (Marketing & Automation BC)**:
   - Phạm vi: Tags, Tag groups, Broadcast campaigns, Automation triggers & sequences nuôi dưỡng, Báo cáo hiệu năng.
   - Endpoints: `/api/v1/tags/*`, `/api/v1/tag-groups/*`, `/api/v1/broadcasts/*`, `/api/v1/campaigns/*`, `/api/v1/marketing/sequences/*`, `/api/v1/automation/*`, `/api/v1/reports/*`.

7. **`internal/aiagent` (AI Agent & Knowledge BC)**:
   - Phạm vi: Quản trị AI agents, AI providers (DeepSeek/OpenAI), RAG Knowledge base, Company profile, Ops Radar giám sát bất thường.
   - Endpoints: `/api/v1/ai-agents/*`, `/api/v1/goclaw-providers/*`, `/api/v1/ai/knowledge/*`, `/api/v1/ops-radar/*`, `/api/v1/work-items/*`.

8. **`internal/serviceapi` (Service API & External Gateway BC)**:
   - Phạm vi: Public API cho agent bên ngoài (GoClaw Daemon, external bots), HMAC authentication, Webhook receivers, Analytics SLA.
   - Endpoints: `/api/v1/service/*` (`whoami`, `messages/send`, `leads/assign`), `/api/v1/analytics/*`.

Mỗi BC luôn tổ chức chuẩn 4 tầng: `domain/` -> `application/` -> `infrastructure/` -> `interfaces/`.

---

## 3. Quy Trình Git & Protected Branches

- `main`: Chỉ chứa tài liệu đã phát hành chính thức. CẤM PUSH TRỰC TIẾP.
- `staging`: Nhánh phát triển tài liệu và review. CẤM PUSH TRỰC TIẾP.
- Mọi tài liệu cập nhật phải qua PR vào `staging`:
  `git checkout staging && git pull origin staging`
  `git checkout -b docs/<task-number>-<name>`
  `git commit -m "docs(<scope>): <short description>"`
  `git push origin docs/<task-number>-<name>`
  `gh pr create --base staging --title "docs(<scope>): <desc>" --body "..."`

---

## 4. Sprint Board Automation

- Board: `Omni Core — Backend DDD Sprint Board` (`PVT_kwHOD3RGJc4Bkgl_`)
- Field: `PVTSSF_lAHOD3RGJc4Bkgl_zhjQ8L0`
- Todo: `f75ad846` | In Progress: `47fc9ee4` | Done: `98236657`
