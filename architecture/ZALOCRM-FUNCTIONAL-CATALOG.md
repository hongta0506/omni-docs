# Danh Mục Toàn Bộ Chức Năng & Endpoints ZaloCRM Backend (Production Truth)

> **Tài liệu trích xuất chính xác 100% từ toàn bộ source code gốc `ZaloCRM/backend/src/`**:
> - Tổng số endpoints: **792 endpoints** (thuộc 38 modules nghiệp vụ).
> - Tổng số background jobs & workers: **27 jobs/workers** (gồm hàng đợi Outbox/Inbound, đồng bộ Zalo/KiotViet, chấm điểm Scoring decay, v.v.).
> - Đây là căn cứ dữ liệu production tuyệt đối để đối chiếu di trú sang hệ thống mới Omni Core Go DDD.

---

## 1. Bảng Tổng Hợp Số Lượng Endpoints Theo Module

| STT | Tên Module Nghiệp Vụ | Thư Mục Gốc (`backend/src/`) | Số Endpoints |
|:---:|:---|:---|:---:|
| 1 | **ACCOUNTS** | `accounts` | **6** |
| 2 | **ACTIVITY** | `activity` | **3** |
| 3 | **AI** | `ai` | **20** |
| 4 | **AI-AGENT** | `ai-agent` | **37** |
| 5 | **ANALYTICS** | `analytics` | **10** |
| 6 | **API** | `api` | **14** |
| 7 | **APP.TS** | `app.ts` | **2** |
| 8 | **AUTH** | `auth` | **39** |
| 9 | **BRANDING** | `branding` | **2** |
| 10 | **CAMPAIGN** | `campaign` | **2** |
| 11 | **CHAT** | `chat` | **45** |
| 12 | **CONFIG** | `config` | **1** |
| 13 | **CONTACTS** | `contacts` | **78** |
| 14 | **DASHBOARD** | `dashboard` | **23** |
| 15 | **DEALS** | `deals` | **23** |
| 16 | **DEVICES** | `devices` | **2** |
| 17 | **ENGAGEMENT** | `engagement` | **3** |
| 18 | **ENTITLEMENT** | `entitlement` | **4** |
| 19 | **INTEGRATIONS** | `integrations` | **56** |
| 20 | **LISTS** | `lists` | **14** |
| 21 | **MEDIA** | `media` | **24** |
| 22 | **NOTIFICATIONS** | `notifications` | **1** |
| 23 | **OPS-RADAR** | `ops-radar` | **12** |
| 24 | **ORDER-PLATFORM** | `order-platform` | **8** |
| 25 | **ORDER-STORE** | `order-store` | **17** |
| 26 | **PRIVACY** | `privacy` | **9** |
| 27 | **PRODUCTS** | `products` | **13** |
| 28 | **QUOTES** | `quotes` | **17** |
| 29 | **RBAC** | `rbac` | **20** |
| 30 | **SCORING** | `scoring` | **15** |
| 31 | **SEARCH** | `search` | **1** |
| 32 | **SERVICE-API** | `service-api` | **68** |
| 33 | **SYSTEM-NOTIFICATIONS** | `system-notifications` | **19** |
| 34 | **TAGS** | `tags` | **12** |
| 35 | **USERS** | `users` | **1** |
| 36 | **WORK-ITEMS** | `work-items` | **4** |
| 37 | **ZALO** | `zalo` | **97** |
| 38 | **_EE** | `_ee` | **70** |
| | **TỔNG CỘNG** | | **792** |

---

## 2. Chi Tiết Danh Sách Toàn Bộ 792 Endpoints Theo Từng Module

### Nhóm ACCOUNTS (6 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/accounts` | `modules/accounts/account-routes.ts` |
| `GET` | `/api/v1/accounts/:id` | `modules/accounts/account-routes.ts` |
| `POST` | `/api/v1/accounts` | `modules/accounts/account-routes.ts` |
| `PUT` | `/api/v1/accounts/:id` | `modules/accounts/account-routes.ts` |
| `DELETE` | `/api/v1/accounts/:id` | `modules/accounts/account-routes.ts` |
| `POST` | `/api/v1/accounts/:id/contacts` | `modules/accounts/account-routes.ts` |

### Nhóm ACTIVITY (3 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/customers/:id/timeline` | `modules/activity/timeline-routes.ts` |
| `GET` | `/api/v1/customers/:id/activity-log` | `modules/activity/timeline-routes.ts` |
| `GET` | `/api/v1/timeline/export` | `modules/activity/timeline-routes.ts` |

### Nhóm AI (20 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/ai/providers` | `modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/providers/:id` | `modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/providers/:id/models` | `modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/config` | `modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/config` | `modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/usage` | `modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/suggest` | `modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/company-profile` | `modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/company-profile` | `modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/knowledge` | `modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/knowledge` | `modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/knowledge/documents` | `modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/ask` | `modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/summarize/:id` | `modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/sentiment/:id` | `modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/sales-handoff-message` | `modules/ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/format-rich` | `modules/ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/assistant-config` | `modules/ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/assistant-config` | `modules/ai/ai-routes.ts` |
| `PATCH` | `/api/v1/contacts/:contactId/apply-ai-suggestion` | `modules/ai/ai-routes.ts` |

### Nhóm AI-AGENT (37 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/ai-agents` | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents` | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents/sync` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/:id` | `modules/ai-agent/ai-agent-routes.ts` |
| `PATCH` | `/api/v1/ai-agents/:id` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/:id/files` | `modules/ai-agent/ai-agent-routes.ts` |
| `PUT` | `/api/v1/ai-agents/:id/files/:name` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/:id/documents` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/_meta/vault-scopes` | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents/:id/documents` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/_meta/accounts` | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents/_meta/channels/rotate-bridge-secret` | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents/_meta/channels/retry` | `modules/ai-agent/ai-agent-routes.ts` |
| `PATCH` | `/api/v1/ai-agents/_meta/accounts/:id/auto-reply` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/_meta/auto-reply` | `modules/ai-agent/ai-agent-routes.ts` |
| `PUT` | `/api/v1/ai-agents/_meta/auto-reply` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/_meta/providers` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/ai-agents/_meta/providers/:providerId/models` | `modules/ai-agent/ai-agent-routes.ts` |
| `POST` | `/api/v1/ai-agents/:id/bindings` | `modules/ai-agent/ai-agent-routes.ts` |
| `DELETE` | `/api/v1/ai-agents/_bindings/:bindingId` | `modules/ai-agent/ai-agent-routes.ts` |
| `GET` | `/api/v1/settings/ai-agent/available` | `modules/ai-agent/default-ai-agent-routes.ts` |
| `PUT` | `/api/v1/settings/ai-agent/default` | `modules/ai-agent/default-ai-agent-routes.ts` |
| `GET` | `/api/v1/goclaw-providers/_meta/types` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `GET` | `/api/v1/goclaw-providers` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `GET` | `/api/v1/goclaw-providers/:id/models` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `POST` | `/api/v1/goclaw-providers` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `PUT` | `/api/v1/goclaw-providers/:id` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `DELETE` | `/api/v1/goclaw-providers/:id` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `POST` | `/api/v1/goclaw-providers/oauth/:name/start` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `POST` | `/api/v1/goclaw-providers/oauth/:name/callback` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `GET` | `/api/v1/goclaw-providers/oauth/:name/status` | `modules/ai-agent/goclaw-provider-routes.ts` |
| `GET` | `/api/v1/settings/retail-channel` | `modules/ai-agent/retail-channel-routes.ts` |
| `POST` | `/api/v1/settings/retail-channel/kiotviet/test` | `modules/ai-agent/retail-channel-routes.ts` |
| `PUT` | `/api/v1/settings/retail-channel/kiotviet` | `modules/ai-agent/retail-channel-routes.ts` |
| `DELETE` | `/api/v1/settings/retail-channel/:type` | `modules/ai-agent/retail-channel-routes.ts` |
| `GET` | `/api/v1/settings/retail-channel/sync-progress` | `modules/ai-agent/retail-channel-routes.ts` |
| `POST` | `/api/v1/settings/retail-channel/kiotviet/resync` | `modules/ai-agent/retail-channel-routes.ts` |

### Nhóm ANALYTICS (10 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/analytics/conversion-funnel` | `modules/analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/team-performance` | `modules/analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/response-time` | `modules/analytics/analytics-routes.ts` |
| `POST` | `/api/v1/analytics/custom` | `modules/analytics/analytics-routes.ts` |
| `GET` | `/api/v1/saved-reports` | `modules/analytics/saved-report-routes.ts` |
| `POST` | `/api/v1/saved-reports` | `modules/analytics/saved-report-routes.ts` |
| `GET` | `/api/v1/saved-reports/:id` | `modules/analytics/saved-report-routes.ts` |
| `PUT` | `/api/v1/saved-reports/:id` | `modules/analytics/saved-report-routes.ts` |
| `DELETE` | `/api/v1/saved-reports/:id` | `modules/analytics/saved-report-routes.ts` |
| `POST` | `/api/v1/saved-reports/:id/run` | `modules/analytics/saved-report-routes.ts` |

### Nhóm API (14 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/public/contacts` | `modules/api/public-api-routes.ts` |
| `GET` | `/api/public/contacts/:id` | `modules/api/public-api-routes.ts` |
| `POST` | `/api/public/contacts` | `modules/api/public-api-routes.ts` |
| `PUT` | `/api/public/contacts/:id` | `modules/api/public-api-routes.ts` |
| `GET` | `/api/public/conversations` | `modules/api/public-api-routes.ts` |
| `GET` | `/api/public/conversations/:id/messages` | `modules/api/public-api-routes.ts` |
| `GET` | `/api/public/appointments` | `modules/api/public-api-routes.ts` |
| `POST` | `/api/public/appointments` | `modules/api/public-api-routes.ts` |
| `POST` | `/api/public/messages/send` | `modules/api/public-api-routes.ts` |
| `GET` | `/api/v1/settings/webhook` | `modules/api/webhook-settings-routes.ts` |
| `PUT` | `/api/v1/settings/webhook` | `modules/api/webhook-settings-routes.ts` |
| `POST` | `/api/v1/settings/webhook/test` | `modules/api/webhook-settings-routes.ts` |
| `POST` | `/api/v1/settings/api-key/generate` | `modules/api/webhook-settings-routes.ts` |
| `GET` | `/api/v1/settings/api-key` | `modules/api/webhook-settings-routes.ts` |

### Nhóm APP.TS (2 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/health` | `app.ts` |
| `GET` | `/api/v1/status` | `app.ts` |

### Nhóm AUTH (39 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `POST` | `/api/v1/auth/login` | `modules/auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/refresh` | `modules/auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/logout` | `modules/auth/auth-routes.ts` |
| `GET` | `/api/v1/auth/tenants` | `modules/auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/switch-tenant` | `modules/auth/auth-routes.ts` |
| `GET` | `/api/v1/profile` | `modules/auth/auth-routes.ts` |
| `GET` | `/api/v1/organization` | `modules/auth/org-routes.ts` |
| `PATCH` | `/api/v1/organization/system-notify-nick` | `modules/auth/org-routes.ts` |
| `PUT` | `/api/v1/organization` | `modules/auth/org-routes.ts` |
| `GET` | `/api/v1/organization/automation-settings` | `modules/auth/org-routes.ts` |
| `PUT` | `/api/v1/organization/automation-settings` | `modules/auth/org-routes.ts` |
| `GET` | `/api/v1/teams` | `modules/auth/team-routes.ts` |
| `POST` | `/api/v1/teams` | `modules/auth/team-routes.ts` |
| `PUT` | `/api/v1/teams/:id` | `modules/auth/team-routes.ts` |
| `DELETE` | `/api/v1/teams/:id` | `modules/auth/team-routes.ts` |
| `GET` | `/api/v1/teams/:id/members` | `modules/auth/team-routes.ts` |
| `POST` | `/api/v1/teams/:id/members` | `modules/auth/team-routes.ts` |
| `DELETE` | `/api/v1/teams/:id/members/:userId` | `modules/auth/team-routes.ts` |
| `GET` | `/api/v1/me/preferences` | `modules/auth/user-preference-routes.ts` |
| `GET` | `/api/v1/me/preferences/:key` | `modules/auth/user-preference-routes.ts` |
| `PUT` | `/api/v1/me/preferences/:key` | `modules/auth/user-preference-routes.ts` |
| `DELETE` | `/api/v1/me/preferences/:key` | `modules/auth/user-preference-routes.ts` |
| `GET` | `/api/v1/users` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users` | `modules/auth/user-routes.ts` |
| `PUT` | `/api/v1/users/:id` | `modules/auth/user-routes.ts` |
| `PUT` | `/api/v1/users/:id/password` | `modules/auth/user-routes.ts` |
| `DELETE` | `/api/v1/users/:id` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users/:id/handoff` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/users/bulk-assign` | `modules/auth/user-routes.ts` |
| `GET` | `/api/v1/audit-logs` | `modules/auth/user-routes.ts` |
| `PATCH` | `/api/v1/users/:id/max-privacy-nicks` | `modules/auth/user-routes.ts` |
| `GET` | `/api/v1/me/internal-contact` | `modules/auth/user-routes.ts` |
| `GET` | `/api/v1/me/onboarding` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/change-password` | `modules/auth/user-routes.ts` |
| `PATCH` | `/api/v1/me/profile` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/avatar` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/skip-step` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/dismiss` | `modules/auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/reopen` | `modules/auth/user-routes.ts` |

### Nhóm BRANDING (2 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/branding` | `modules/branding/branding-routes.ts` |
| `GET` | `/api/v1/public/org-branding` | `modules/branding/org-branding-routes.ts` |

### Nhóm CAMPAIGN (2 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `POST` | `/api/v1/campaigns/random-friend-request` | `modules/campaign/campaign-routes.ts` |
| `GET` | `/api/v1/campaigns/contacts/:contactId/attempts` | `modules/campaign/campaign-routes.ts` |

### Nhóm CHAT (45 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/channel-accounts/capabilities` | `modules/chat/channel-access-routes.ts` |
| `GET` | `/api/v1/channel-accounts/:id/access` | `modules/chat/channel-access-routes.ts` |
| `POST` | `/api/v1/channel-accounts/:id/access` | `modules/chat/channel-access-routes.ts` |
| `PUT` | `/api/v1/channel-accounts/:id/access/:accessId` | `modules/chat/channel-access-routes.ts` |
| `DELETE` | `/api/v1/channel-accounts/:id/access/:accessId` | `modules/chat/channel-access-routes.ts` |
| `POST` | `/api/v1/conversations/:id/attachments` | `modules/chat/chat-attachment-routes.ts` |
| `POST` | `/api/v1/conversations/:id/reactions` | `modules/chat/chat-operations-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id/reactions` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/typing` | `modules/chat/chat-operations-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id/messages/:msgId` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:msgId/undo` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:msgId/edit` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/forward` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/pin` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/unpin` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/sticker` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/link` | `modules/chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/card` | `modules/chat/chat-operations-routes.ts` |
| `GET` | `/api/v1/conversations/counts` | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/event-counts` | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/sidebar-tags` | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations` | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/:id` | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/touch-profile` | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/:id/messages` | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages` | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/send-block` | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/upload-image` | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/mark-read` | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/chat/send-handoff` | `modules/chat/chat-routes.ts` |
| `PATCH` | `/api/v1/conversations/:id/tab` | `modules/chat/chat-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id` | `modules/chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/restore` | `modules/chat/chat-routes.ts` |
| `GET` | `/api/v1/account-folders` | `modules/chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders` | `modules/chat/folder-routes.ts` |
| `PUT` | `/api/v1/account-folders/:id` | `modules/chat/folder-routes.ts` |
| `DELETE` | `/api/v1/account-folders/:id` | `modules/chat/folder-routes.ts` |
| `PUT` | `/api/v1/account-folders/:id/members` | `modules/chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders/reorder` | `modules/chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders/sync-by-owner` | `modules/chat/folder-routes.ts` |
| `GET` | `/api/v1/filter-presets` | `modules/chat/preset-routes.ts` |
| `POST` | `/api/v1/filter-presets` | `modules/chat/preset-routes.ts` |
| `PUT` | `/api/v1/filter-presets/:id` | `modules/chat/preset-routes.ts` |
| `DELETE` | `/api/v1/filter-presets/:id` | `modules/chat/preset-routes.ts` |
| `POST` | `/api/v1/filter-presets/:id/use` | `modules/chat/preset-routes.ts` |

### Nhóm CONFIG (1 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/config` | `modules/config/config-routes.ts` |

### Nhóm CONTACTS (78 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/a/:code` | `modules/contacts/appointment-public-routes.ts` |
| `GET` | `/api/public/appointments/action` | `modules/contacts/appointment-public-routes.ts` |
| `POST` | `/api/public/appointments/action` | `modules/contacts/appointment-public-routes.ts` |
| `GET` | `/api/v1/appointments/today` | `modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/upcoming` | `modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments` | `modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/:id` | `modules/contacts/appointment-routes.ts` |
| `POST` | `/api/v1/appointments` | `modules/contacts/appointment-routes.ts` |
| `PUT` | `/api/v1/appointments/:id` | `modules/contacts/appointment-routes.ts` |
| `PATCH` | `/api/v1/appointments/:id/status` | `modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/settings` | `modules/contacts/appointment-routes.ts` |
| `PUT` | `/api/v1/appointments/settings` | `modules/contacts/appointment-routes.ts` |
| `DELETE` | `/api/v1/appointments/:id` | `modules/contacts/appointment-routes.ts` |
| `GET` | `/api/v1/contacts/:id/cockpit` | `modules/contacts/cockpit-routes.ts` |
| `GET` | `/api/v1/contacts/:id/teammates` | `modules/contacts/cockpit-routes.ts` |
| `GET` | `/api/v1/contacts` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/stats` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/sources` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/pipeline` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/quick-create` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/virtual-conversation` | `modules/contacts/contact-routes.ts` |
| `PUT` | `/api/v1/contacts/:id` | `modules/contacts/contact-routes.ts` |
| `PUT` | `/api/v1/contacts/:id/tags` | `modules/contacts/contact-routes.ts` |
| `DELETE` | `/api/v1/contacts/:id` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/duplicates` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/duplicates/:groupId/dismiss` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/duplicates/:groupId/merge` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/intelligence/recompute` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id/friendships` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-global-id` | `modules/contacts/contact-routes.ts` |
| `PATCH` | `/api/v1/friends/:id` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/friends/:id/ensure-conversation` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:accountId/groups/:groupId/ensure-conversation` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/resolve-by-keys` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/conversations/ensure-by-uid` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/friends/:id/promote-to-parent` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/merge-into` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/link-parent` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/unlink-parent` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/parent-candidates` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/parent-candidates/:id/accept` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/parent-candidates/:id/dismiss` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/admin/run-detector` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/admin/migrate-status-table` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-missing-friends` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-orphan-friends` | `modules/contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-friend-display-name` | `modules/contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id/appointments` | `modules/contacts/contact-sub-resource-routes.ts` |
| `GET` | `/api/v1/contacts/by-zalo-uid/:uid` | `modules/contacts/contact-sub-resource-routes.ts` |
| `GET` | `/api/v1/crm-tag-groups` | `modules/contacts/crm-tag-group-routes.ts` |
| `POST` | `/api/v1/crm-tag-groups` | `modules/contacts/crm-tag-group-routes.ts` |
| `PATCH` | `/api/v1/crm-tag-groups/:id` | `modules/contacts/crm-tag-group-routes.ts` |
| `DELETE` | `/api/v1/crm-tag-groups/:id` | `modules/contacts/crm-tag-group-routes.ts` |
| `GET` | `/api/v1/crm-tags` | `modules/contacts/crm-tag-routes.ts` |
| `POST` | `/api/v1/crm-tags` | `modules/contacts/crm-tag-routes.ts` |
| `PATCH` | `/api/v1/crm-tags/:id` | `modules/contacts/crm-tag-routes.ts` |
| `DELETE` | `/api/v1/crm-tags/:id` | `modules/contacts/crm-tag-routes.ts` |
| `POST` | `/api/v1/crm-tags/reorder` | `modules/contacts/crm-tag-routes.ts` |
| `GET` | `/api/v1/contacts/:contactId/notes` | `modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/contacts/:contactId/notes` | `modules/contacts/notes-routes.ts` |
| `PATCH` | `/api/v1/notes/:id` | `modules/contacts/notes-routes.ts` |
| `DELETE` | `/api/v1/notes/:id` | `modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/reactions` | `modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/ai-parse` | `modules/contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/link-appointment` | `modules/contacts/notes-routes.ts` |
| `GET` | `/api/v1/settings/statuses` | `modules/contacts/status-routes.ts` |
| `POST` | `/api/v1/settings/statuses` | `modules/contacts/status-routes.ts` |
| `PUT` | `/api/v1/settings/statuses/:id` | `modules/contacts/status-routes.ts` |
| `POST` | `/api/v1/settings/statuses/reorder` | `modules/contacts/status-routes.ts` |
| `DELETE` | `/api/v1/settings/statuses/:id` | `modules/contacts/status-routes.ts` |
| `GET` | `/api/v1/zalo-bankcard` | `modules/contacts/zinstant-proxy-routes.ts` |
| `GET` | `/api/v1/zalo-sticker/:catId/:id` | `modules/contacts/zinstant-proxy-routes.ts` |
| `GET` | `/api/v1/zalo-sticker-list` | `modules/contacts/zinstant-proxy-routes.ts` |
| `POST` | `/api/v1/zalo-user-info/batch` | `modules/contacts/zinstant-proxy-routes.ts` |
| `POST` | `/api/v1/zalo-user-info/find-by-phone` | `modules/contacts/zinstant-proxy-routes.ts` |
| `GET` | `/api/v1/zalo-user-info/:uid` | `modules/contacts/zinstant-proxy-routes.ts` |

### Nhóm DASHBOARD (23 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/dashboard/action-hub/me` | `modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/team` | `modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/system` | `modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/picker/users` | `modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/picker/depts` | `modules/dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/kpi` | `modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/message-volume` | `modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/pipeline` | `modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/sources` | `modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/appointments` | `modules/dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/reports/overview` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/nick-fleet` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/sales-performance` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/pipeline` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/lead-pool` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/automation` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/engagement` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/audit` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/crm-usage` | `modules/dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/messages` | `modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/contacts` | `modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/appointments` | `modules/dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/export` | `modules/dashboard/report-routes.ts` |

### Nhóm DEALS (23 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/deals/:dealId/activities` | `modules/deals/deal-activity-routes.ts` |
| `POST` | `/api/v1/deals/:dealId/activities` | `modules/deals/deal-activity-routes.ts` |
| `PUT` | `/api/v1/deals/:dealId/activities/:id` | `modules/deals/deal-activity-routes.ts` |
| `DELETE` | `/api/v1/deals/:dealId/activities/:id` | `modules/deals/deal-activity-routes.ts` |
| `GET` | `/api/v1/deals/approvals/pending` | `modules/deals/deal-approval-routes.ts` |
| `GET` | `/api/v1/deals/:id/approvals` | `modules/deals/deal-approval-routes.ts` |
| `POST` | `/api/v1/deals/:id/${action}` | `modules/deals/deal-approval-routes.ts` |
| `GET` | `/api/v1/deals` | `modules/deals/deal-routes.ts` |
| `GET` | `/api/v1/deals/views-count` | `modules/deals/deal-routes.ts` |
| `GET` | `/api/v1/deals/pipeline/summary` | `modules/deals/deal-routes.ts` |
| `GET` | `/api/v1/deals/:id` | `modules/deals/deal-routes.ts` |
| `POST` | `/api/v1/deals` | `modules/deals/deal-routes.ts` |
| `PUT` | `/api/v1/deals/:id` | `modules/deals/deal-routes.ts` |
| `PUT` | `/api/v1/deals/:id/lines` | `modules/deals/deal-routes.ts` |
| `POST` | `/api/v1/deals/:id/transition` | `modules/deals/deal-routes.ts` |
| `POST` | `/api/v1/deals/:id/undo` | `modules/deals/deal-routes.ts` |
| `POST` | `/api/v1/deals/:id/quote-sent` | `modules/deals/deal-routes.ts` |
| `DELETE` | `/api/v1/deals/:id` | `modules/deals/deal-routes.ts` |
| `GET` | `/api/v1/settings/deal-stages` | `modules/deals/deal-stage-routes.ts` |
| `POST` | `/api/v1/settings/deal-stages` | `modules/deals/deal-stage-routes.ts` |
| `PUT` | `/api/v1/settings/deal-stages/:id` | `modules/deals/deal-stage-routes.ts` |
| `POST` | `/api/v1/settings/deal-stages/reorder` | `modules/deals/deal-stage-routes.ts` |
| `DELETE` | `/api/v1/settings/deal-stages/:id` | `modules/deals/deal-stage-routes.ts` |

### Nhóm DEVICES (2 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `POST` | `/api/v1/devices` | `modules/devices/device-routes.ts` |
| `DELETE` | `/api/v1/devices/:fcmToken` | `modules/devices/device-routes.ts` |

### Nhóm ENGAGEMENT (3 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/contacts/:id/engagement-timeline` | `modules/engagement/engagement-routes.ts` |
| `POST` | `/api/v1/admin/engagement/recompute` | `modules/engagement/engagement-routes.ts` |
| `POST` | `/api/v1/admin/engagement/backfill` | `modules/engagement/engagement-routes.ts` |

### Nhóm ENTITLEMENT (4 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/my/entitlement` | `modules/entitlement/entitlement-routes.ts` |
| `GET` | `/api/v1/admin/entitlements` | `modules/entitlement/entitlement-routes.ts` |
| `GET` | `/api/v1/admin/entitlements/:orgId` | `modules/entitlement/entitlement-routes.ts` |
| `PUT` | `/api/v1/admin/entitlements/:orgId` | `modules/entitlement/entitlement-routes.ts` |

### Nhóm INTEGRATIONS (56 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/external-conversations` | `modules/integrations/external-inbox-routes.ts` |
| `GET` | `/api/v1/external-conversations/:id/messages` | `modules/integrations/external-inbox-routes.ts` |
| `POST` | `/api/v1/external-conversations/:id/link-contact` | `modules/integrations/external-inbox-routes.ts` |
| `DELETE` | `/api/v1/external-conversations/:id/link-contact` | `modules/integrations/external-inbox-routes.ts` |
| `POST` | `/api/v1/external-conversations/:id/read` | `modules/integrations/external-inbox-routes.ts` |
| `POST` | `/api/v1/external-conversations/:id/messages` | `modules/integrations/external-inbox-routes.ts` |
| `GET` | `/api/v1/integrations/facebook/config` | `modules/integrations/facebook-oauth-routes.ts` |
| `GET` | `/api/v1/integrations/facebook/oauth/start` | `modules/integrations/facebook-oauth-routes.ts` |
| `GET` | `/api/v1/integrations/facebook/oauth/callback` | `modules/integrations/facebook-oauth-routes.ts` |
| `GET` | `/api/v1/integrations/facebook/pages` | `modules/integrations/facebook-oauth-routes.ts` |
| `DELETE` | `/api/v1/integrations/facebook/pages/:pageId` | `modules/integrations/facebook-oauth-routes.ts` |
| `GET` | `/api/v1/integrations` | `modules/integrations/integration-routes.ts` |
| `POST` | `/api/v1/integrations` | `modules/integrations/integration-routes.ts` |
| `PUT` | `/api/v1/integrations/:id` | `modules/integrations/integration-routes.ts` |
| `DELETE` | `/api/v1/integrations/:id` | `modules/integrations/integration-routes.ts` |
| `POST` | `/api/v1/integrations/:id/sync` | `modules/integrations/integration-routes.ts` |
| `GET` | `/api/v1/integrations/:id/logs` | `modules/integrations/integration-routes.ts` |
| `GET` | `/api/v1/integrations/facebook/webhook` | `modules/integrations/providers/facebook/facebook-webhook-routes.ts` |
| `POST` | `/api/v1/integrations/facebook/webhook` | `modules/integrations/providers/facebook/facebook-webhook-routes.ts` |
| `POST` | `/api/internal/goclaw/context` | `modules/integrations/providers/goclaw-bridge/routes.ts` |
| `POST` | `/api/internal/goclaw/media` | `modules/integrations/providers/goclaw-bridge/routes.ts` |
| `POST` | `/api/internal/goclaw/reply` | `modules/integrations/providers/goclaw-bridge/routes.ts` |
| `POST` | `/api/v1/conversations/:id/agent-control` | `modules/integrations/providers/goclaw-bridge/routes.ts` |
| `POST` | `/api/v1/conversations/:id/human-takeover` | `modules/integrations/providers/goclaw-bridge/routes.ts` |
| `GET` | `/api/v1/pancake/status` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `GET` | `/api/v1/pancake/config` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `PUT` | `/api/v1/pancake/config` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `DELETE` | `/api/v1/pancake/config` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `GET` | `/api/v1/pancake/orders` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `GET` | `/api/v1/pancake/products` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `GET` | `/api/v1/pancake/warehouses` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `POST` | `/api/v1/pancake/orders` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `POST` | `/api/v1/pancake/orders/:id/cancel` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `GET` | `/api/v1/pancake/orders/:id` | `modules/integrations/providers/pancake-pos/routes.ts` |
| `GET` | `/api/v1/telegram-bridge/:zaloAccountId/status` | `modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/link-code` | `modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/provision/:zaloAccountId` | `modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/disable/:zaloAccountId` | `modules/integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `GET` | `/api/v1/telegram-personal/accounts` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `POST` | `/api/v1/telegram-personal/login/start` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `GET` | `/api/v1/telegram-personal/login/:id` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `POST` | `/api/v1/telegram-personal/login/:id/password` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `DELETE` | `/api/v1/telegram-personal/login/:id` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `POST` | `/api/v1/telegram-personal/accounts/:id/sync` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `POST` | `/api/v1/telegram-personal/accounts/:id/disconnect` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `PUT` | `/api/v1/telegram-personal/accounts/:id/proxy` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `POST` | `/api/v1/telegram-personal/accounts/:id/proxy/test` | `modules/integrations/providers/telegram-personal/routes.ts` |
| `GET` | `/api/v1/integrations/zalo-bot/accounts` | `modules/integrations/providers/zalo-bot/account-routes.ts` |
| `POST` | `/api/v1/integrations/zalo-bot/accounts` | `modules/integrations/providers/zalo-bot/account-routes.ts` |
| `DELETE` | `/api/v1/integrations/zalo-bot/accounts/:id` | `modules/integrations/providers/zalo-bot/account-routes.ts` |
| `POST` | `${ZALO_BOT_WEBHOOK_PATH}/:profileId` | `modules/integrations/providers/zalo-bot/webhook-routes.ts` |
| `GET` | `/api/v1/integrations/zalo-oa/accounts` | `modules/integrations/providers/zalo-oa/account-routes.ts` |
| `GET` | `/api/v1/integrations/zalo-oa/oauth/start` | `modules/integrations/providers/zalo-oa/oauth-routes.ts` |
| `GET` | `/api/v1/integrations/zalo-oa/oauth/callback` | `modules/integrations/providers/zalo-oa/oauth-routes.ts` |
| `POST` | `/api/v1/integrations/zalo-oa/webhook` | `modules/integrations/providers/zalo-oa/webhook-routes.ts` |
| `GET` | `/api/v1/integrations/zalo-oa/conversations/:id/window` | `modules/integrations/providers/zalo-oa/window-routes.ts` |

### Nhóm LISTS (14 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/customer-lists/:id/entries` | `modules/lists/list-entry-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/entries/bulk` | `modules/lists/list-entry-routes.ts` |
| `PATCH` | `/api/v1/customer-lists/:id/entries/:entryId` | `modules/lists/list-entry-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/entries` | `modules/lists/list-entry-routes.ts` |
| `DELETE` | `/api/v1/customer-lists/:id/entries/:entryId` | `modules/lists/list-entry-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/entries/:entryId/find-zalo` | `modules/lists/list-entry-routes.ts` |
| `GET` | `/api/v1/customer-list-entries/:entryId/lead-detail` | `modules/lists/list-entry-routes.ts` |
| `GET` | `/api/v1/customer-lists` | `modules/lists/list-routes.ts` |
| `GET` | `/api/v1/customer-lists/:id` | `modules/lists/list-routes.ts` |
| `PATCH` | `/api/v1/customer-lists/:id` | `modules/lists/list-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/archive` | `modules/lists/list-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/unarchive` | `modules/lists/list-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/rescan-zalo` | `modules/lists/list-routes.ts` |
| `DELETE` | `/api/v1/customer-lists/:id` | `modules/lists/list-routes.ts` |

### Nhóm MEDIA (24 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/media` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/uploaders` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/upload` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/save-from-chat` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/save-from-chat-batch` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/send` | `modules/media/media-routes.ts` |
| `PATCH` | `/api/v1/media/:id` | `modules/media/media-routes.ts` |
| `PATCH` | `/api/v1/media/bulk` | `modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/download` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/trash` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/restore` | `modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id/permanent` | `modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/trash/empty` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/watermark` | `modules/media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id/watermark` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/folders` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/folders` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/suggest` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/tags` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/stats` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/favorite` | `modules/media/media-routes.ts` |
| `GET` | `/api/v1/media/favorites` | `modules/media/media-routes.ts` |
| `POST` | `/api/v1/media/album/send` | `modules/media/media-routes.ts` |

### Nhóm NOTIFICATIONS (1 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/notifications` | `modules/notifications/notification-routes.ts` |

### Nhóm OPS-RADAR (12 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/ops-radar/settings` | `modules/ops-radar/ops-radar-routes.ts` |
| `PUT` | `/api/v1/ops-radar/settings` | `modules/ops-radar/ops-radar-routes.ts` |
| `GET` | `/api/v1/ops-radar/groups` | `modules/ops-radar/ops-radar-routes.ts` |
| `PUT` | `/api/v1/ops-radar/groups/:conversationId` | `modules/ops-radar/ops-radar-routes.ts` |
| `GET` | `/api/v1/ops-radar/groups/:conversationId/members` | `modules/ops-radar/ops-radar-routes.ts` |
| `POST` | `/api/v1/ops-radar/telegram/test` | `modules/ops-radar/ops-radar-routes.ts` |
| `POST` | `/api/v1/ops-radar/sweep/run` | `modules/ops-radar/ops-radar-routes.ts` |
| `POST` | `/api/v1/ops-radar/reports/run` | `modules/ops-radar/ops-radar-routes.ts` |
| `GET` | `/api/v1/ops-radar/overview` | `modules/ops-radar/ops-radar-routes.ts` |
| `GET` | `/api/v1/ops-radar/signals` | `modules/ops-radar/ops-radar-routes.ts` |
| `GET` | `/api/v1/ops-radar/reports` | `modules/ops-radar/ops-radar-routes.ts` |
| `GET` | `/api/v1/ops-radar/reports/:id` | `modules/ops-radar/ops-radar-routes.ts` |

### Nhóm ORDER-PLATFORM (8 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/order-platform/status` | `modules/order-platform/routes.ts` |
| `GET` | `/api/v1/order-platform/products` | `modules/order-platform/routes.ts` |
| `GET` | `/api/v1/order-platform/products/:variationId` | `modules/order-platform/routes.ts` |
| `GET` | `/api/v1/order-platform/orders` | `modules/order-platform/routes.ts` |
| `GET` | `/api/v1/order-platform/orders/list` | `modules/order-platform/routes.ts` |
| `GET` | `/api/v1/order-platform/orders/:id` | `modules/order-platform/routes.ts` |
| `POST` | `/api/v1/order-platform/orders` | `modules/order-platform/routes.ts` |
| `PUT` | `/api/v1/order-platform/connection` | `modules/order-platform/routes.ts` |

### Nhóm ORDER-STORE (17 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/order-store/buyers/unlinked` | `modules/order-store/order-link-routes.ts` |
| `POST` | `/api/v1/order-store/buyers/link` | `modules/order-store/order-link-routes.ts` |
| `POST` | `/api/v1/order-store/buyers/create-contacts` | `modules/order-store/order-link-routes.ts` |
| `POST` | `/api/v1/order-store/orders/:orderId/link` | `modules/order-store/order-link-routes.ts` |
| `GET` | `/api/v1/order-store/contacts/:contactId/purchases` | `modules/order-store/order-link-routes.ts` |
| `GET` | `/api/v1/order-store/totals/segment` | `modules/order-store/order-link-routes.ts` |
| `POST` | `/api/v1/order-store/totals/recompute` | `modules/order-store/order-link-routes.ts` |
| `GET` | `/api/v1/order-store/deals/:dealId/order` | `modules/order-store/order-link-routes.ts` |
| `GET` | `/api/v1/order-store/sync` | `modules/order-store/order-store-routes.ts` |
| `PUT` | `/api/v1/order-store/sync` | `modules/order-store/order-store-routes.ts` |
| `POST` | `/api/v1/order-store/sync/run` | `modules/order-store/order-store-routes.ts` |
| `POST` | `/api/v1/order-store/sync/backfill` | `modules/order-store/order-store-routes.ts` |
| `GET` | `/api/v1/order-store/webhook` | `modules/order-store/order-store-routes.ts` |
| `POST` | `/api/v1/order-store/webhook/enable` | `modules/order-store/order-store-routes.ts` |
| `POST` | `/api/v1/order-store/webhook/disable` | `modules/order-store/order-store-routes.ts` |
| `POST` | `/api/v1/webhooks/pancake/:orgId` | `modules/order-store/order-webhook-routes.ts` |
| `POST` | `/api/v1/webhooks/kiotviet/:orgId/:token` | `modules/order-store/order-webhook-routes.ts` |

### Nhóm PRIVACY (9 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/privacy/otp/status` | `modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/otp/request` | `modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/otp/verify` | `modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/lock` | `modules/privacy/privacy-routes.ts` |
| `GET` | `/api/v1/privacy/status` | `modules/privacy/privacy-routes.ts` |
| `GET` | `/api/v1/privacy/my-nicks` | `modules/privacy/privacy-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/privacy-mode` | `modules/privacy/privacy-routes.ts` |
| `POST` | `/api/v1/admin/privacy/reset-lock/:userId` | `modules/privacy/privacy-routes.ts` |
| `GET` | `/api/v1/admin/privacy/audit` | `modules/privacy/privacy-routes.ts` |

### Nhóm PRODUCTS (13 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/products` | `modules/products/product-routes.ts` |
| `POST` | `/api/v1/products` | `modules/products/product-routes.ts` |
| `PATCH` | `/api/v1/products/:id` | `modules/products/product-routes.ts` |
| `DELETE` | `/api/v1/products/:id` | `modules/products/product-routes.ts` |
| `GET` | `/api/v1/products/source` | `modules/products/product-routes.ts` |
| `POST` | `/api/v1/products/import` | `modules/products/product-routes.ts` |
| `GET` | `/api/v1/products/:id/stocks` | `modules/products/product-routes.ts` |
| `GET` | `/api/v1/products/sync/settings` | `modules/products/product-sync-routes.ts` |
| `PUT` | `/api/v1/products/sync/settings` | `modules/products/product-sync-routes.ts` |
| `POST` | `/api/v1/products/sync/run` | `modules/products/product-sync-routes.ts` |
| `GET` | `/api/v1/products/sync/runs` | `modules/products/product-sync-routes.ts` |
| `POST` | `/api/v1/products/:id/${action}` | `modules/products/product-sync-routes.ts` |
| `POST` | `/api/v1/products/ignore-all` | `modules/products/product-sync-routes.ts` |

### Nhóm QUOTES (17 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/pricebook/options` | `modules/quotes/pricebook-routes.ts` |
| `GET` | `/api/v1/pricebook` | `modules/quotes/pricebook-routes.ts` |
| `POST` | `/api/v1/pricebook/items` | `modules/quotes/pricebook-routes.ts` |
| `PATCH` | `/api/v1/pricebook/items/:id` | `modules/quotes/pricebook-routes.ts` |
| `DELETE` | `/api/v1/pricebook/items/:id` | `modules/quotes/pricebook-routes.ts` |
| `GET` | `/api/v1/public/pricebook` | `modules/quotes/public-pricebook-routes.ts` |
| `GET` | `/api/v1/quotes/:id/pdf` | `modules/quotes/quote-pdf-routes.ts` |
| `POST` | `/api/v1/quotes/:id/send-zalo` | `modules/quotes/quote-pdf-routes.ts` |
| `GET` | `/api/v1/quotes` | `modules/quotes/quote-routes.ts` |
| `GET` | `/api/v1/quotes/approvals/pending` | `modules/quotes/quote-routes.ts` |
| `GET` | `/api/v1/quotes/:id` | `modules/quotes/quote-routes.ts` |
| `POST` | `/api/v1/quotes` | `modules/quotes/quote-routes.ts` |
| `PATCH` | `/api/v1/quotes/:id` | `modules/quotes/quote-routes.ts` |
| `POST` | `/api/v1/quotes/:id/version` | `modules/quotes/quote-routes.ts` |
| `POST` | `/api/v1/quotes/:id/send` | `modules/quotes/quote-routes.ts` |
| `POST` | `/api/v1/quotes/:id/${action}` | `modules/quotes/quote-routes.ts` |
| `POST` | `/api/v1/quotes/:id/${action}` | `modules/quotes/quote-routes.ts` |

### Nhóm RBAC (20 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/departments` | `modules/rbac/department-routes.ts` |
| `POST` | `/api/v1/departments` | `modules/rbac/department-routes.ts` |
| `PATCH` | `/api/v1/departments/:id` | `modules/rbac/department-routes.ts` |
| `DELETE` | `/api/v1/departments/:id` | `modules/rbac/department-routes.ts` |
| `POST` | `/api/v1/departments/:id/members` | `modules/rbac/department-routes.ts` |
| `DELETE` | `/api/v1/departments/:id/members/:userId` | `modules/rbac/department-routes.ts` |
| `GET` | `/api/v1/departments/:id/members-tree` | `modules/rbac/department-routes.ts` |
| `GET` | `/api/v1/permission-groups` | `modules/rbac/permission-group-routes.ts` |
| `GET` | `/api/v1/permission-groups/meta` | `modules/rbac/permission-group-routes.ts` |
| `GET` | `/api/v1/permission-groups/:id` | `modules/rbac/permission-group-routes.ts` |
| `POST` | `/api/v1/permission-groups` | `modules/rbac/permission-group-routes.ts` |
| `PATCH` | `/api/v1/permission-groups/:id` | `modules/rbac/permission-group-routes.ts` |
| `DELETE` | `/api/v1/permission-groups/:id` | `modules/rbac/permission-group-routes.ts` |
| `DELETE` | `/api/v1/contacts/:id` | `modules/rbac/rbac-middleware.ts` |
| `GET` | `/api/v1/messages/:id` | `modules/rbac/rbac-middleware.ts` |
| `GET` | `/api/v1/rbac/users` | `modules/rbac/user-assignment-routes.ts` |
| `PATCH` | `/api/v1/rbac/users/:id/permission-group` | `modules/rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/seed-default-groups` | `modules/rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/migrate-legacy-users` | `modules/rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/create-test-users` | `modules/rbac/user-assignment-routes.ts` |

### Nhóm SCORING (15 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/scoring/config` | `modules/scoring/scoring-routes.ts` |
| `PUT` | `/api/v1/scoring/config` | `modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/rules` | `modules/scoring/scoring-routes.ts` |
| `PUT` | `/api/v1/scoring/rules/:id` | `modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/stage-transitions` | `modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/stuck-thresholds` | `modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/nba-templates` | `modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/scoring/seed-defaults` | `modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/friends/:id/score-breakdown` | `modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/friends/:id/promote` | `modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/friends/:id/evaluate-promote` | `modules/scoring/scoring-routes.ts` |
| `GET` | `/api/v1/leads/stuck` | `modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/leads/stuck/scan` | `modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/leads/stuck/send-template` | `modules/scoring/scoring-routes.ts` |
| `POST` | `/api/v1/scoring/recompute-all` | `modules/scoring/scoring-routes.ts` |

### Nhóm SEARCH (1 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/search` | `modules/search/search-routes.ts` |

### Nhóm SERVICE-API (68 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/ai/agent-hands` | `modules/service-api/agent-hands-routes.ts` |
| `POST` | `/api/v1/ai/agent-hands` | `modules/service-api/agent-hands-routes.ts` |
| `DELETE` | `/api/v1/ai/agent-hands` | `modules/service-api/agent-hands-routes.ts` |
| `POST` | `/api/v1/ai/agent-hands/rotate` | `modules/service-api/agent-hands-routes.ts` |
| `PUT` | `/api/v1/ai/agent-hands/autonomy` | `modules/service-api/agent-hands-routes.ts` |
| `POST` | `/api/v1/ai/agent-hands/sync-tools` | `modules/service-api/agent-hands-routes.ts` |
| `GET` | `/api/service/v1/birthdays/due` | `modules/service-api/service-birthday-routes.ts` |
| `POST` | `/api/service/v1/birthday-runs/preview` | `modules/service-api/service-birthday-routes.ts` |
| `POST` | `/api/service/v1/birthday-runs` | `modules/service-api/service-birthday-routes.ts` |
| `GET` | `/api/service/v1/products` | `modules/service-api/service-catalog-routes.ts` |
| `GET` | `/api/service/v1/products/:id` | `modules/service-api/service-catalog-routes.ts` |
| `GET` | `/api/service/v1/pricebook` | `modules/service-api/service-catalog-routes.ts` |
| `GET` | `/api/service/v1/contacts` | `modules/service-api/service-contact-routes.ts` |
| `GET` | `/api/service/v1/contacts/:id` | `modules/service-api/service-contact-routes.ts` |
| `GET` | `/api/v1/service-credentials` | `modules/service-api/service-credential-admin-routes.ts` |
| `POST` | `/api/v1/service-credentials` | `modules/service-api/service-credential-admin-routes.ts` |
| `POST` | `/api/v1/service-credentials/:id/rotate` | `modules/service-api/service-credential-admin-routes.ts` |
| `POST` | `/api/v1/service-credentials/:id/revoke` | `modules/service-api/service-credential-admin-routes.ts` |
| `POST` | `/api/service/v1/contacts` | `modules/service-api/service-crm-mutation-routes.ts` |
| `PATCH` | `/api/service/v1/contacts/:id` | `modules/service-api/service-crm-mutation-routes.ts` |
| `POST` | `/api/service/v1/contacts/:contactId/notes` | `modules/service-api/service-crm-mutation-routes.ts` |
| `POST` | `/api/service/v1/appointments` | `modules/service-api/service-crm-mutation-routes.ts` |
| `GET` | `/api/service/v1/contacts/:contactId/notes` | `modules/service-api/service-crm-tracking-routes.ts` |
| `GET` | `/api/service/v1/appointments` | `modules/service-api/service-crm-tracking-routes.ts` |
| `GET` | `/api/service/v1/events` | `modules/service-api/service-event-feed-routes.ts` |
| `POST` | `/api/service/v1/friend-lookups` | `modules/service-api/service-friend-routes.ts` |
| `POST` | `/api/service/v1/friend-requests/preview` | `modules/service-api/service-friend-routes.ts` |
| `POST` | `/api/service/v1/friend-requests` | `modules/service-api/service-friend-routes.ts` |
| `GET` | `/api/service/v1/friend-requests/:id` | `modules/service-api/service-friend-routes.ts` |
| `POST` | `/api/service/v1/friend-requests/:id/cancel` | `modules/service-api/service-friend-routes.ts` |
| `GET` | `/api/service/v1/integrations` | `modules/service-api/service-integrations-routes.ts` |
| `GET` | `/api/service/v1/lead-assignments/:contactId` | `modules/service-api/service-lead-assignment-routes.ts` |
| `POST` | `/api/service/v1/lead-assignments/:contactId` | `modules/service-api/service-lead-assignment-routes.ts` |
| `POST` | `/api/v1/service-operations/:id/approve` | `modules/service-api/service-message-approval-routes.ts` |
| `POST` | `/api/v1/service-operations/:id/reject` | `modules/service-api/service-message-approval-routes.ts` |
| `POST` | `/api/service/v1/messages/preview` | `modules/service-api/service-message-routes.ts` |
| `POST` | `/api/service/v1/messages/send` | `modules/service-api/service-message-routes.ts` |
| `GET` | `/api/service/v1/conversations` | `modules/service-api/service-messaging-health-routes.ts` |
| `GET` | `/api/service/v1/conversations/:conversationId/messages` | `modules/service-api/service-messaging-health-routes.ts` |
| `GET` | `/api/service/v1/zalo-accounts` | `modules/service-api/service-messaging-health-routes.ts` |
| `GET` | `/api/service/v1/zalo-accounts/:id/health` | `modules/service-api/service-messaging-health-routes.ts` |
| `GET` | `/api/service/v1/operations/:id` | `modules/service-api/service-operation-routes.ts` |
| `GET` | `/api/service/v1/quotes` | `modules/service-api/service-sales-routes.ts` |
| `GET` | `/api/service/v1/quotes/:id` | `modules/service-api/service-sales-routes.ts` |
| `GET` | `/api/service/v1/deals` | `modules/service-api/service-sales-routes.ts` |
| `GET` | `/api/service/v1/deals/:id` | `modules/service-api/service-sales-routes.ts` |
| `GET` | `/api/service/v1/contacts/:id/score` | `modules/service-api/service-sales-routes.ts` |
| `POST` | `/api/service/v1/deals` | `modules/service-api/service-sales-write-routes.ts` |
| `PATCH` | `/api/service/v1/deals/:id` | `modules/service-api/service-sales-write-routes.ts` |
| `POST` | `/api/service/v1/deals/:id/notes` | `modules/service-api/service-sales-write-routes.ts` |
| `POST` | `/api/service/v1/quotes` | `modules/service-api/service-sales-write-routes.ts` |
| `PATCH` | `/api/service/v1/quotes/:id` | `modules/service-api/service-sales-write-routes.ts` |
| `POST` | `/api/service/v1/deals/:id/transition` | `modules/service-api/service-sales-write-routes.ts` |
| `PATCH` | `/api/service/v1/deals/:id/lines` | `modules/service-api/service-sales-write-routes.ts` |
| `POST` | `/api/service/v1/deals/:id/win_propose` | `modules/service-api/service-sales-write-routes.ts` |
| `POST` | `/api/service/v1/deals/:id/lose_propose` | `modules/service-api/service-sales-write-routes.ts` |
| `GET` | `/api/service/v1/scoring/config` | `modules/service-api/service-scoring-routes.ts` |
| `GET` | `/api/service/v1/leads/:id/score` | `modules/service-api/service-scoring-routes.ts` |
| `PUT` | `/api/service/v1/scoring/config` | `modules/service-api/service-scoring-routes.ts` |
| `POST` | `/api/service/v1/scoring/recompute` | `modules/service-api/service-scoring-routes.ts` |
| `GET` | `/api/service/v1/webhook-subscriptions` | `modules/service-api/service-webhook-routes.ts` |
| `POST` | `/api/service/v1/webhook-subscriptions` | `modules/service-api/service-webhook-routes.ts` |
| `GET` | `/api/service/v1/webhook-subscriptions/:id` | `modules/service-api/service-webhook-routes.ts` |
| `PATCH` | `/api/service/v1/webhook-subscriptions/:id` | `modules/service-api/service-webhook-routes.ts` |
| `POST` | `/api/service/v1/webhook-subscriptions/:id/rotate-secret` | `modules/service-api/service-webhook-routes.ts` |
| `GET` | `/api/service/v1/webhook-deliveries` | `modules/service-api/service-webhook-routes.ts` |
| `POST` | `/api/service/v1/webhook-deliveries/:id/replay` | `modules/service-api/service-webhook-routes.ts` |
| `GET` | `/api/service/v1/whoami` | `modules/service-api/service-whoami-routes.ts` |

### Nhóm SYSTEM-NOTIFICATIONS (19 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/system-notifications/settings` | `modules/system-notifications/system-notify-routes.ts` |
| `PATCH` | `/api/v1/system-notifications/settings/sender` | `modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/unanswered-reminder-settings` | `modules/system-notifications/system-notify-routes.ts` |
| `PATCH` | `/api/v1/system-notifications/unanswered-reminder-settings` | `modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/recipients` | `modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/recipients/health` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/recipients/:userId/check-live` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/recipients/recheck-all` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/test` | `modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/org-config` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/compile-template` | `modules/system-notifications/system-notify-routes.ts` |
| `PATCH` | `/api/v1/system-notifications/org-config` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/welcome-image` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/preview-welcome` | `modules/system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/logs` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/logs/:id/retry` | `modules/system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/users/check-zalo-by-phone` | `modules/system-notifications/user-create-with-zalo-routes.ts` |
| `POST` | `/api/v1/users/create-with-zalo` | `modules/system-notifications/user-create-with-zalo-routes.ts` |
| `POST` | `/api/v1/users/:userId/resend-credentials` | `modules/system-notifications/user-create-with-zalo-routes.ts` |

### Nhóm TAGS (12 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/` | `modules/tags/tag-routes.ts` |
| `GET` | `/zalo-accounts` | `modules/tags/tag-routes.ts` |
| `POST` | `/` | `modules/tags/tag-routes.ts` |
| `PATCH` | `/:id` | `modules/tags/tag-routes.ts` |
| `DELETE` | `/:id` | `modules/tags/tag-routes.ts` |
| `POST` | `/merge` | `modules/tags/tag-routes.ts` |
| `GET` | `/:id/tags` | `modules/tags/tag-routes.ts` |
| `POST` | `/:id/tags` | `modules/tags/tag-routes.ts` |
| `DELETE` | `/:id/tags/:tagId` | `modules/tags/tag-routes.ts` |
| `GET` | `/:id/crm-tags` | `modules/tags/tag-routes.ts` |
| `POST` | `/:id/crm-tags` | `modules/tags/tag-routes.ts` |
| `DELETE` | `/:id/crm-tags/:tagId` | `modules/tags/tag-routes.ts` |

### Nhóm USERS (1 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `POST` | `/api/v1/users/provision` | `modules/users/user-routes.ts` |

### Nhóm WORK-ITEMS (4 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/work-items` | `modules/work-items/work-items-routes.ts` |
| `GET` | `/api/v1/work-items/:id` | `modules/work-items/work-items-routes.ts` |
| `PATCH` | `/api/v1/work-items/:id` | `modules/work-items/work-items-routes.ts` |
| `POST` | `/api/v1/work-items/:id/comments` | `modules/work-items/work-items-routes.ts` |

### Nhóm ZALO (97 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `${BASE}/export` | `modules/zalo/credential-routes.ts` |
| `POST` | `${BASE}/import` | `modules/zalo/credential-routes.ts` |
| `GET` | `/api/v1/admin/egress` | `modules/zalo/egress-admin-routes.ts` |
| `POST` | `/api/v1/admin/egress/proxies` | `modules/zalo/egress-admin-routes.ts` |
| `POST` | `/api/v1/admin/egress/bindings` | `modules/zalo/egress-admin-routes.ts` |
| `DELETE` | `/api/v1/admin/egress/bindings/:id` | `modules/zalo/egress-admin-routes.ts` |
| `DELETE` | `/api/v1/admin/egress/:id` | `modules/zalo/egress-admin-routes.ts` |
| `POST` | `/api/v1/admin/egress/:id/dead` | `modules/zalo/egress-admin-routes.ts` |
| `POST` | `/api/v1/admin/egress/:id/test` | `modules/zalo/egress-admin-routes.ts` |
| `POST` | `/api/v1/egress/proxies` | `modules/zalo/egress-routes.ts` |
| `GET` | `${BASE}-db` | `modules/zalo/friend-routes.ts` |
| `GET` | `/api/v1/friends-db/all-nicks` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}-db/sync` | `modules/zalo/friend-routes.ts` |
| `GET` | `${BASE}/find` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}/lookup-by-phone` | `modules/zalo/friend-routes.ts` |
| `GET` | `${BASE}/online` | `modules/zalo/friend-routes.ts` |
| `GET` | `${BASE}/recommendations` | `modules/zalo/friend-routes.ts` |
| `GET` | `${BASE}/aliases` | `modules/zalo/friend-routes.ts` |
| `GET` | `${BASE}/requests/sent` | `modules/zalo/friend-routes.ts` |
| `GET` | `${BASE}/requests/:userId/status` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}/requests` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}/requests/:userId/accept` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}/requests/:userId/reject` | `modules/zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/requests/:userId` | `modules/zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId` | `modules/zalo/friend-routes.ts` |
| `PUT` | `${BASE}/:userId/alias` | `modules/zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId/alias` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}/:userId/block` | `modules/zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId/block` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}/:userId/block-feed` | `modules/zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId/block-feed` | `modules/zalo/friend-routes.ts` |
| `POST` | `${BASE}/:groupId/block` | `modules/zalo/group-moderation-routes.ts` |
| `DELETE` | `${BASE}/:groupId/block/:userId` | `modules/zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/blocked` | `modules/zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/pending` | `modules/zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/link` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/link/enable` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/link/disable` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:accountId/groups/join-link` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/leave` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/disperse` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls` | `modules/zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/polls/:pollId` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls/:pollId/vote` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls/:pollId/lock` | `modules/zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls/:pollId/share` | `modules/zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId` | `modules/zalo/group-routes.ts` |
| `GET` | `${BASE}/:groupId/members` | `modules/zalo/group-routes.ts` |
| `PATCH` | `${BASE}/:groupId/name` | `modules/zalo/group-routes.ts` |
| `POST` | `${BASE}/:groupId/members` | `modules/zalo/group-routes.ts` |
| `DELETE` | `${BASE}/:groupId/members` | `modules/zalo/group-routes.ts` |
| `POST` | `${BASE}/:groupId/deputies` | `modules/zalo/group-routes.ts` |
| `DELETE` | `${BASE}/:groupId/deputies/:userId` | `modules/zalo/group-routes.ts` |
| `POST` | `${BASE}/:groupId/transfer` | `modules/zalo/group-routes.ts` |
| `GET` | `${BASE}/:scanId` | `modules/zalo/group-scan-routes.ts` |
| `GET` | `${BASE}/:scanId/members` | `modules/zalo/group-scan-routes.ts` |
| `GET` | `${BASE}/last-online/:userId` | `modules/zalo/profile-routes.ts` |
| `GET` | `${BASE}/avatars` | `modules/zalo/profile-routes.ts` |
| `PATCH` | `${BASE}/avatar` | `modules/zalo/profile-routes.ts` |
| `DELETE` | `${BASE}/avatars/:avatarId` | `modules/zalo/profile-routes.ts` |
| `POST` | `${BASE}/avatars/:avatarId/reuse` | `modules/zalo/profile-routes.ts` |
| `PUT` | `${BASE}/status` | `modules/zalo/profile-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/access` | `modules/zalo/zalo-access-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/access` | `modules/zalo/zalo-access-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/access/:accessId` | `modules/zalo/zalo-access-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/access/:accessId` | `modules/zalo/zalo-access-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/stats` | `modules/zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/enriched` | `modules/zalo/zalo-dashboard-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/owner` | `modules/zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/uptime` | `modules/zalo/zalo-dashboard-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/bulk-action` | `modules/zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/sdk-limits` | `modules/zalo/zalo-dashboard-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/sdk-limits/org` | `modules/zalo/zalo-dashboard-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/sdk-limits` | `modules/zalo/zalo-dashboard-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/sdk-limits` | `modules/zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/labels` | `modules/zalo/zalo-labels-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/labels-overview` | `modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/sync` | `modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/touch` | `modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/assign-thread` | `modules/zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/friends/:friendId/zalo-label` | `modules/zalo/zalo-labels-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/labels/:labelId` | `modules/zalo/zalo-labels-routes.ts` |
| `GET` | `/api/v1/zalo-accounts` | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts` | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/login` | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/reconnect` | `modules/zalo/zalo-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id` | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/restore` | `modules/zalo/zalo-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/archived` | `modules/zalo/zalo-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/purge-empty` | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/check-phone` | `modules/zalo/zalo-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/status` | `modules/zalo/zalo-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/proxy` | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/proxy/test` | `modules/zalo/zalo-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/phone` | `modules/zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/sync-contacts` | `modules/zalo/zalo-sync-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/sync-history` | `modules/zalo/zalo-sync-routes.ts` |

### Nhóm _EE (70 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/automation/blocks` | `_ee/automation/routes/blocks.ts` |
| `GET` | `/api/v1/automation/blocks/:id` | `_ee/automation/routes/blocks.ts` |
| `POST` | `/api/v1/automation/blocks` | `_ee/automation/routes/blocks.ts` |
| `PATCH` | `/api/v1/automation/blocks/:id` | `_ee/automation/routes/blocks.ts` |
| `DELETE` | `/api/v1/automation/blocks/:id` | `_ee/automation/routes/blocks.ts` |
| `GET` | `/api/v1/automation/block-folders` | `_ee/automation/routes/blocks.ts` |
| `POST` | `/api/v1/automation/block-folders` | `_ee/automation/routes/blocks.ts` |
| `PATCH` | `/api/v1/automation/block-folders/:id` | `_ee/automation/routes/blocks.ts` |
| `DELETE` | `/api/v1/automation/block-folders/:id` | `_ee/automation/routes/blocks.ts` |
| `GET` | `/api/v1/automation/broadcasts` | `_ee/automation/routes/broadcasts.ts` |
| `GET` | `/api/v1/automation/broadcasts/group-options` | `_ee/automation/routes/broadcasts.ts` |
| `POST` | `/api/v1/automation/broadcasts` | `_ee/automation/routes/broadcasts.ts` |
| `GET` | `/api/v1/automation/broadcasts/:id` | `_ee/automation/routes/broadcasts.ts` |
| `PATCH` | `/api/v1/automation/broadcasts/:id` | `_ee/automation/routes/broadcasts.ts` |
| `DELETE` | `/api/v1/automation/broadcasts/:id` | `_ee/automation/routes/broadcasts.ts` |
| `POST` | `/api/v1/automation/broadcasts/:id/count` | `_ee/automation/routes/broadcasts.ts` |
| `POST` | `/api/v1/automation/broadcasts/count-preview` | `_ee/automation/routes/broadcasts.ts` |
| `POST` | `/api/v1/automation/broadcasts/:id/activate` | `_ee/automation/routes/broadcasts.ts` |
| `POST` | `/api/v1/automation/broadcasts/:id/pause` | `_ee/automation/routes/broadcasts.ts` |
| `GET` | `/api/v1/automation/broadcasts/:id/recipients` | `_ee/automation/routes/broadcasts.ts` |
| `GET` | `/api/v1/automation/broadcasts/:id/history` | `_ee/automation/routes/broadcasts.ts` |
| `GET` | `/api/v1/automation/care-sessions/listen-settings` | `_ee/automation/routes/care-sessions.ts` |
| `PUT` | `/api/v1/automation/care-sessions/listen-settings` | `_ee/automation/routes/care-sessions.ts` |
| `GET` | `/api/v1/automation/care-sessions/listen-status` | `_ee/automation/routes/care-sessions.ts` |
| `POST` | `/api/v1/automation/care-sessions/listen` | `_ee/automation/routes/care-sessions.ts` |
| `DELETE` | `/api/v1/automation/care-sessions/listen` | `_ee/automation/routes/care-sessions.ts` |
| `GET` | `/api/v1/automation/care-sessions/listening-pairs` | `_ee/automation/routes/care-sessions.ts` |
| `GET` | `/api/v1/automation/care-sessions` | `_ee/automation/routes/care-sessions.ts` |
| `GET` | `/api/v1/automation/ee-health` | `_ee/automation/routes/health.ts` |
| `POST` | `/api/v1/customer-lists/from-audience` | `_ee/automation/routes/list-audience.ts` |
| `POST` | `/api/v1/customer-lists/:id/refresh-audience` | `_ee/automation/routes/list-audience.ts` |
| `GET` | `/api/v1/automation/sequences` | `_ee/automation/routes/sequences.ts` |
| `POST` | `/api/v1/automation/sequences` | `_ee/automation/routes/sequences.ts` |
| `GET` | `/api/v1/automation/sequences/:id/stats` | `_ee/automation/routes/sequences.ts` |
| `POST` | `/api/v1/automation/sequences/:id/preview` | `_ee/automation/routes/sequences.ts` |
| `GET` | `/api/v1/automation/sequences/:id` | `_ee/automation/routes/sequences.ts` |
| `PATCH` | `/api/v1/automation/sequences/:id` | `_ee/automation/routes/sequences.ts` |
| `DELETE` | `/api/v1/automation/sequences/:id` | `_ee/automation/routes/sequences.ts` |
| `GET` | `/api/v1/automation/templates` | `_ee/automation/routes/templates.ts` |
| `POST` | `/api/v1/automation/templates` | `_ee/automation/routes/templates.ts` |
| `PUT` | `/api/v1/automation/templates/:id` | `_ee/automation/routes/templates.ts` |
| `DELETE` | `/api/v1/automation/templates/:id` | `_ee/automation/routes/templates.ts` |
| `POST` | `/api/v1/automation/templates/:id/track-use` | `_ee/automation/routes/templates.ts` |
| `GET` | `/api/v1/automation/template-folders` | `_ee/automation/routes/templates.ts` |
| `POST` | `/api/v1/automation/template-folders` | `_ee/automation/routes/templates.ts` |
| `PUT` | `/api/v1/automation/template-folders/:id` | `_ee/automation/routes/templates.ts` |
| `DELETE` | `/api/v1/automation/template-folders/:id` | `_ee/automation/routes/templates.ts` |
| `GET` | `/api/v1/automation/triggers` | `_ee/automation/routes/triggers.ts` |
| `GET` | `/api/v1/automation/triggers/:id` | `_ee/automation/routes/triggers.ts` |
| `POST` | `/api/v1/automation/triggers` | `_ee/automation/routes/triggers.ts` |
| `PATCH` | `/api/v1/automation/triggers/:id` | `_ee/automation/routes/triggers.ts` |
| `POST` | `/api/v1/automation/triggers/:id/activate` | `_ee/automation/routes/triggers.ts` |
| `GET` | `/api/v1/lead-pool/eligibility` | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/request` | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/:id/note` | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/:id/return` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/config` | `_ee/lead-pool/lead-pool-routes.ts` |
| `PATCH` | `/api/v1/lead-pool/config` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/admin-dashboard` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/distribution-log` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/my-history` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/preview` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/queue-today-stats` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/stats` | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/:id/open-chat` | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/:id/find-zalo` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/admin/sale-noted-leads` | `_ee/lead-pool/lead-pool-routes.ts` |
| `POST` | `/api/v1/lead-pool/admin/reset-quota` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/:id/payload` | `_ee/lead-pool/lead-pool-routes.ts` |
| `GET` | `/api/v1/lead-pool/available-nicks` | `_ee/lead-pool/lead-pool-routes.ts` |

---

## 3. Danh Mục Các Background Workers & Scheduled Cron Jobs (27 Jobs)

| STT | Tên Worker / Cron Job | Đường Dẫn File | Phạm Vi Nhiệm Vụ Nghiệp Vụ |
|:---:|:---|:---|:---|
| 1 | `contact-profile-sync-cron` | `backend/src/modules/contacts/contact-profile-sync-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 2 | `interaction-cron` | `backend/src/modules/contacts/interaction-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 3 | `engagement-cron` | `backend/src/modules/engagement/engagement-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 4 | `inbound-worker` | `backend/src/modules/integrations/providers/zalo-bot/inbound-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 5 | `inbound-worker` | `backend/src/modules/integrations/providers/zalo-oa/inbound-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 6 | `token-refresh-cron` | `backend/src/modules/integrations/providers/zalo-oa/token-refresh-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 7 | `media-trash-gc-cron` | `backend/src/modules/media/media-trash-gc-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 8 | `unanswered-reminder-cron` | `backend/src/modules/notifications/unanswered-reminder-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 9 | `cron` | `backend/src/modules/ops-radar/cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 10 | `report-job` | `backend/src/modules/ops-radar/report-job.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 11 | `order-sync-cron` | `backend/src/modules/order-store/order-sync-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 12 | `kiotviet-sync-cron` | `backend/src/modules/products/kiotviet-sync/kiotviet-sync-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 13 | `product-sync-cron` | `backend/src/modules/products/product-sync-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 14 | `backfill-cron` | `backend/src/modules/scoring/backfill-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 15 | `decay-cron` | `backend/src/modules/scoring/decay-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 16 | `service-birthday-worker` | `backend/src/modules/service-api/service-birthday-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 17 | `service-friend-outbox-worker` | `backend/src/modules/service-api/service-friend-outbox-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 18 | `service-message-outbox-worker` | `backend/src/modules/service-api/service-message-outbox-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 19 | `service-webhook-delivery-worker` | `backend/src/modules/service-api/service-webhook-delivery-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 20 | `goclaw-agent-sync.job` | `backend/src/modules/sync/goclaw-agent-sync.job.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 21 | `goclaw-user-sync.job` | `backend/src/modules/sync/goclaw-user-sync.job.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 22 | `friend-sync-cron` | `backend/src/modules/zalo/friend-sync-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 23 | `group-info-sync-cron` | `backend/src/modules/zalo/group-info-sync-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 24 | `group-scan-worker` | `backend/src/modules/zalo/group-scan-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 25 | `status-log-checkpoint-cron` | `backend/src/modules/zalo/status-log-checkpoint-cron.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 26 | `broadcast-worker` | `backend/src/_ee/automation/workers/broadcast-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
| 27 | `muctieu-invite-worker` | `backend/src/_ee/automation/workers/muctieu-invite-worker.ts` | Tác vụ chạy ngầm / định kỳ xử lý hàng đợi |
