# Danh Mục Toàn Bộ Chức Năng & Endpoints ZaloCRM Backend

> Thống kê tự động từ source code `backend/src/modules/`

### Nhóm ACTIVITY (3 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/customers/:id/timeline` | `activity/timeline-routes.ts` |
| `GET` | `/api/v1/customers/:id/activity-log` | `activity/timeline-routes.ts` |
| `GET` | `/api/v1/timeline/export` | `activity/timeline-routes.ts` |

### Nhóm AI (14 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/ai/providers` | `ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/providers/:id` | `ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/providers/:id/models` | `ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/config` | `ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/config` | `ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/usage` | `ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/suggest` | `ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/summarize/:id` | `ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/sentiment/:id` | `ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/sales-handoff-message` | `ai/ai-routes.ts` |
| `POST` | `/api/v1/ai/format-rich` | `ai/ai-routes.ts` |
| `GET` | `/api/v1/ai/assistant-config` | `ai/ai-routes.ts` |
| `PUT` | `/api/v1/ai/assistant-config` | `ai/ai-routes.ts` |
| `PATCH` | `/api/v1/contacts/:contactId/apply-ai-suggestion` | `ai/ai-routes.ts` |

### Nhóm ANALYTICS (10 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/analytics/conversion-funnel` | `analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/team-performance` | `analytics/analytics-routes.ts` |
| `GET` | `/api/v1/analytics/response-time` | `analytics/analytics-routes.ts` |
| `POST` | `/api/v1/analytics/custom` | `analytics/analytics-routes.ts` |
| `GET` | `/api/v1/saved-reports` | `analytics/saved-report-routes.ts` |
| `POST` | `/api/v1/saved-reports` | `analytics/saved-report-routes.ts` |
| `GET` | `/api/v1/saved-reports/:id` | `analytics/saved-report-routes.ts` |
| `PUT` | `/api/v1/saved-reports/:id` | `analytics/saved-report-routes.ts` |
| `DELETE` | `/api/v1/saved-reports/:id` | `analytics/saved-report-routes.ts` |
| `POST` | `/api/v1/saved-reports/:id/run` | `analytics/saved-report-routes.ts` |

### Nhóm API (14 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/public/contacts` | `api/public-api-routes.ts` |
| `GET` | `/api/public/contacts/:id` | `api/public-api-routes.ts` |
| `POST` | `/api/public/contacts` | `api/public-api-routes.ts` |
| `PUT` | `/api/public/contacts/:id` | `api/public-api-routes.ts` |
| `GET` | `/api/public/conversations` | `api/public-api-routes.ts` |
| `GET` | `/api/public/conversations/:id/messages` | `api/public-api-routes.ts` |
| `GET` | `/api/public/appointments` | `api/public-api-routes.ts` |
| `POST` | `/api/public/appointments` | `api/public-api-routes.ts` |
| `POST` | `/api/public/messages/send` | `api/public-api-routes.ts` |
| `GET` | `/api/v1/settings/webhook` | `api/webhook-settings-routes.ts` |
| `PUT` | `/api/v1/settings/webhook` | `api/webhook-settings-routes.ts` |
| `POST` | `/api/v1/settings/webhook/test` | `api/webhook-settings-routes.ts` |
| `POST` | `/api/v1/settings/api-key/generate` | `api/webhook-settings-routes.ts` |
| `GET` | `/api/v1/settings/api-key` | `api/webhook-settings-routes.ts` |

### Nhóm AUTH (39 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/setup/status` | `auth/auth-routes.ts` |
| `POST` | `/api/v1/setup` | `auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/login` | `auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/refresh` | `auth/auth-routes.ts` |
| `POST` | `/api/v1/auth/logout` | `auth/auth-routes.ts` |
| `GET` | `/api/v1/profile` | `auth/auth-routes.ts` |
| `GET` | `/api/v1/organization` | `auth/org-routes.ts` |
| `PATCH` | `/api/v1/organization/system-notify-nick` | `auth/org-routes.ts` |
| `PUT` | `/api/v1/organization` | `auth/org-routes.ts` |
| `GET` | `/api/v1/organization/automation-settings` | `auth/org-routes.ts` |
| `PUT` | `/api/v1/organization/automation-settings` | `auth/org-routes.ts` |
| `GET` | `/api/v1/teams` | `auth/team-routes.ts` |
| `POST` | `/api/v1/teams` | `auth/team-routes.ts` |
| `PUT` | `/api/v1/teams/:id` | `auth/team-routes.ts` |
| `DELETE` | `/api/v1/teams/:id` | `auth/team-routes.ts` |
| `GET` | `/api/v1/teams/:id/members` | `auth/team-routes.ts` |
| `POST` | `/api/v1/teams/:id/members` | `auth/team-routes.ts` |
| `DELETE` | `/api/v1/teams/:id/members/:userId` | `auth/team-routes.ts` |
| `GET` | `/api/v1/me/preferences` | `auth/user-preference-routes.ts` |
| `GET` | `/api/v1/me/preferences/:key` | `auth/user-preference-routes.ts` |
| `PUT` | `/api/v1/me/preferences/:key` | `auth/user-preference-routes.ts` |
| `DELETE` | `/api/v1/me/preferences/:key` | `auth/user-preference-routes.ts` |
| `GET` | `/api/v1/users` | `auth/user-routes.ts` |
| `POST` | `/api/v1/users` | `auth/user-routes.ts` |
| `PUT` | `/api/v1/users/:id` | `auth/user-routes.ts` |
| `PUT` | `/api/v1/users/:id/password` | `auth/user-routes.ts` |
| `DELETE` | `/api/v1/users/:id` | `auth/user-routes.ts` |
| `POST` | `/api/v1/users/:id/handoff` | `auth/user-routes.ts` |
| `POST` | `/api/v1/users/bulk-assign` | `auth/user-routes.ts` |
| `GET` | `/api/v1/audit-logs` | `auth/user-routes.ts` |
| `PATCH` | `/api/v1/users/:id/max-privacy-nicks` | `auth/user-routes.ts` |
| `GET` | `/api/v1/me/internal-contact` | `auth/user-routes.ts` |
| `GET` | `/api/v1/me/onboarding` | `auth/user-routes.ts` |
| `POST` | `/api/v1/me/change-password` | `auth/user-routes.ts` |
| `PATCH` | `/api/v1/me/profile` | `auth/user-routes.ts` |
| `POST` | `/api/v1/me/avatar` | `auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/skip-step` | `auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/dismiss` | `auth/user-routes.ts` |
| `POST` | `/api/v1/me/onboarding/reopen` | `auth/user-routes.ts` |

### Nhóm BRANDING (2 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/branding` | `branding/branding-routes.ts` |
| `GET` | `/api/v1/public/org-branding` | `branding/org-branding-routes.ts` |

### Nhóm CAMPAIGN (2 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `POST` | `/api/v1/campaigns/random-friend-request` | `campaign/campaign-routes.ts` |
| `GET` | `/api/v1/campaigns/contacts/:contactId/attempts` | `campaign/campaign-routes.ts` |

### Nhóm CHAT (40 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `POST` | `/api/v1/conversations/:id/attachments` | `chat/chat-attachment-routes.ts` |
| `POST` | `/api/v1/conversations/:id/reactions` | `chat/chat-operations-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id/reactions` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/typing` | `chat/chat-operations-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id/messages/:msgId` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:msgId/undo` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:msgId/edit` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/forward` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/pin` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/unpin` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/sticker` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/link` | `chat/chat-operations-routes.ts` |
| `POST` | `/api/v1/conversations/:id/card` | `chat/chat-operations-routes.ts` |
| `GET` | `/api/v1/conversations/counts` | `chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/event-counts` | `chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/sidebar-tags` | `chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations` | `chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/:id` | `chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/touch-profile` | `chat/chat-routes.ts` |
| `GET` | `/api/v1/conversations/:id/messages` | `chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/messages` | `chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/send-block` | `chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/upload-image` | `chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/mark-read` | `chat/chat-routes.ts` |
| `POST` | `/api/v1/chat/send-handoff` | `chat/chat-routes.ts` |
| `PATCH` | `/api/v1/conversations/:id/tab` | `chat/chat-routes.ts` |
| `DELETE` | `/api/v1/conversations/:id` | `chat/chat-routes.ts` |
| `POST` | `/api/v1/conversations/:id/restore` | `chat/chat-routes.ts` |
| `GET` | `/api/v1/account-folders` | `chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders` | `chat/folder-routes.ts` |
| `PUT` | `/api/v1/account-folders/:id` | `chat/folder-routes.ts` |
| `DELETE` | `/api/v1/account-folders/:id` | `chat/folder-routes.ts` |
| `PUT` | `/api/v1/account-folders/:id/members` | `chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders/reorder` | `chat/folder-routes.ts` |
| `POST` | `/api/v1/account-folders/sync-by-owner` | `chat/folder-routes.ts` |
| `GET` | `/api/v1/filter-presets` | `chat/preset-routes.ts` |
| `POST` | `/api/v1/filter-presets` | `chat/preset-routes.ts` |
| `PUT` | `/api/v1/filter-presets/:id` | `chat/preset-routes.ts` |
| `DELETE` | `/api/v1/filter-presets/:id` | `chat/preset-routes.ts` |
| `POST` | `/api/v1/filter-presets/:id/use` | `chat/preset-routes.ts` |

### Nhóm CONFIG (1 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/config` | `config/config-routes.ts` |

### Nhóm CONTACTS (78 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/a/:code` | `contacts/appointment-public-routes.ts` |
| `GET` | `/api/public/appointments/action` | `contacts/appointment-public-routes.ts` |
| `POST` | `/api/public/appointments/action` | `contacts/appointment-public-routes.ts` |
| `GET` | `/api/v1/appointments/today` | `contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/upcoming` | `contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments` | `contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/:id` | `contacts/appointment-routes.ts` |
| `POST` | `/api/v1/appointments` | `contacts/appointment-routes.ts` |
| `PUT` | `/api/v1/appointments/:id` | `contacts/appointment-routes.ts` |
| `PATCH` | `/api/v1/appointments/:id/status` | `contacts/appointment-routes.ts` |
| `GET` | `/api/v1/appointments/settings` | `contacts/appointment-routes.ts` |
| `PUT` | `/api/v1/appointments/settings` | `contacts/appointment-routes.ts` |
| `DELETE` | `/api/v1/appointments/:id` | `contacts/appointment-routes.ts` |
| `GET` | `/api/v1/contacts/:id/cockpit` | `contacts/cockpit-routes.ts` |
| `GET` | `/api/v1/contacts/:id/teammates` | `contacts/cockpit-routes.ts` |
| `GET` | `/api/v1/contacts` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/stats` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/sources` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/pipeline` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/quick-create` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/virtual-conversation` | `contacts/contact-routes.ts` |
| `PUT` | `/api/v1/contacts/:id` | `contacts/contact-routes.ts` |
| `PUT` | `/api/v1/contacts/:id/tags` | `contacts/contact-routes.ts` |
| `DELETE` | `/api/v1/contacts/:id` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/duplicates` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/duplicates/:groupId/dismiss` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/duplicates/:groupId/merge` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/intelligence/recompute` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id/friendships` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-global-id` | `contacts/contact-routes.ts` |
| `PATCH` | `/api/v1/friends/:id` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/friends/:id/ensure-conversation` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:accountId/groups/:groupId/ensure-conversation` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/resolve-by-keys` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/conversations/ensure-by-uid` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/friends/:id/promote-to-parent` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/merge-into` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/link-parent` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/:id/unlink-parent` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/parent-candidates` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/parent-candidates/:id/accept` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/parent-candidates/:id/dismiss` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/admin/run-detector` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/admin/migrate-status-table` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-missing-friends` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-orphan-friends` | `contacts/contact-routes.ts` |
| `POST` | `/api/v1/contacts/backfill-friend-display-name` | `contacts/contact-routes.ts` |
| `GET` | `/api/v1/contacts/:id/appointments` | `contacts/contact-sub-resource-routes.ts` |
| `GET` | `/api/v1/contacts/by-zalo-uid/:uid` | `contacts/contact-sub-resource-routes.ts` |
| `GET` | `/api/v1/crm-tag-groups` | `contacts/crm-tag-group-routes.ts` |
| `POST` | `/api/v1/crm-tag-groups` | `contacts/crm-tag-group-routes.ts` |
| `PATCH` | `/api/v1/crm-tag-groups/:id` | `contacts/crm-tag-group-routes.ts` |
| `DELETE` | `/api/v1/crm-tag-groups/:id` | `contacts/crm-tag-group-routes.ts` |
| `GET` | `/api/v1/crm-tags` | `contacts/crm-tag-routes.ts` |
| `POST` | `/api/v1/crm-tags` | `contacts/crm-tag-routes.ts` |
| `PATCH` | `/api/v1/crm-tags/:id` | `contacts/crm-tag-routes.ts` |
| `DELETE` | `/api/v1/crm-tags/:id` | `contacts/crm-tag-routes.ts` |
| `POST` | `/api/v1/crm-tags/reorder` | `contacts/crm-tag-routes.ts` |
| `GET` | `/api/v1/contacts/:contactId/notes` | `contacts/notes-routes.ts` |
| `POST` | `/api/v1/contacts/:contactId/notes` | `contacts/notes-routes.ts` |
| `PATCH` | `/api/v1/notes/:id` | `contacts/notes-routes.ts` |
| `DELETE` | `/api/v1/notes/:id` | `contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/reactions` | `contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/ai-parse` | `contacts/notes-routes.ts` |
| `POST` | `/api/v1/notes/:id/link-appointment` | `contacts/notes-routes.ts` |
| `GET` | `/api/v1/settings/statuses` | `contacts/status-routes.ts` |
| `POST` | `/api/v1/settings/statuses` | `contacts/status-routes.ts` |
| `PUT` | `/api/v1/settings/statuses/:id` | `contacts/status-routes.ts` |
| `POST` | `/api/v1/settings/statuses/reorder` | `contacts/status-routes.ts` |
| `DELETE` | `/api/v1/settings/statuses/:id` | `contacts/status-routes.ts` |
| `GET` | `/api/v1/zalo-bankcard` | `contacts/zinstant-proxy-routes.ts` |
| `GET` | `/api/v1/zalo-sticker/:catId/:id` | `contacts/zinstant-proxy-routes.ts` |
| `GET` | `/api/v1/zalo-sticker-list` | `contacts/zinstant-proxy-routes.ts` |
| `POST` | `/api/v1/zalo-user-info/batch` | `contacts/zinstant-proxy-routes.ts` |
| `POST` | `/api/v1/zalo-user-info/find-by-phone` | `contacts/zinstant-proxy-routes.ts` |
| `GET` | `/api/v1/zalo-user-info/:uid` | `contacts/zinstant-proxy-routes.ts` |

### Nhóm DASHBOARD (23 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/dashboard/action-hub/me` | `dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/team` | `dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/system` | `dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/picker/users` | `dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/action-hub/picker/depts` | `dashboard/dashboard-action-hub-routes.ts` |
| `GET` | `/api/v1/dashboard/kpi` | `dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/message-volume` | `dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/pipeline` | `dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/sources` | `dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/dashboard/appointments` | `dashboard/dashboard-routes.ts` |
| `GET` | `/api/v1/reports/overview` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/nick-fleet` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/sales-performance` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/pipeline` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/lead-pool` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/automation` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/engagement` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/audit` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/crm-usage` | `dashboard/report-analytics-routes.ts` |
| `GET` | `/api/v1/reports/messages` | `dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/contacts` | `dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/appointments` | `dashboard/report-routes.ts` |
| `GET` | `/api/v1/reports/export` | `dashboard/report-routes.ts` |

### Nhóm DEVICES (2 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `POST` | `/api/v1/devices` | `devices/device-routes.ts` |
| `DELETE` | `/api/v1/devices/:fcmToken` | `devices/device-routes.ts` |

### Nhóm ENGAGEMENT (3 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/contacts/:id/engagement-timeline` | `engagement/engagement-routes.ts` |
| `POST` | `/api/v1/admin/engagement/recompute` | `engagement/engagement-routes.ts` |
| `POST` | `/api/v1/admin/engagement/backfill` | `engagement/engagement-routes.ts` |

### Nhóm INTEGRATIONS (10 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/integrations` | `integrations/integration-routes.ts` |
| `POST` | `/api/v1/integrations` | `integrations/integration-routes.ts` |
| `PUT` | `/api/v1/integrations/:id` | `integrations/integration-routes.ts` |
| `DELETE` | `/api/v1/integrations/:id` | `integrations/integration-routes.ts` |
| `POST` | `/api/v1/integrations/:id/sync` | `integrations/integration-routes.ts` |
| `GET` | `/api/v1/integrations/:id/logs` | `integrations/integration-routes.ts` |
| `GET` | `/api/v1/telegram-bridge/:zaloAccountId/status` | `integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/link-code` | `integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/provision/:zaloAccountId` | `integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |
| `POST` | `/api/v1/telegram-bridge/disable/:zaloAccountId` | `integrations/providers/telegram-bridge/telegram-bridge-routes.ts` |

### Nhóm LISTS (14 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/customer-lists/:id/entries` | `lists/list-entry-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/entries/bulk` | `lists/list-entry-routes.ts` |
| `PATCH` | `/api/v1/customer-lists/:id/entries/:entryId` | `lists/list-entry-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/entries` | `lists/list-entry-routes.ts` |
| `DELETE` | `/api/v1/customer-lists/:id/entries/:entryId` | `lists/list-entry-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/entries/:entryId/find-zalo` | `lists/list-entry-routes.ts` |
| `GET` | `/api/v1/customer-list-entries/:entryId/lead-detail` | `lists/list-entry-routes.ts` |
| `GET` | `/api/v1/customer-lists` | `lists/list-routes.ts` |
| `GET` | `/api/v1/customer-lists/:id` | `lists/list-routes.ts` |
| `PATCH` | `/api/v1/customer-lists/:id` | `lists/list-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/archive` | `lists/list-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/unarchive` | `lists/list-routes.ts` |
| `POST` | `/api/v1/customer-lists/:id/rescan-zalo` | `lists/list-routes.ts` |
| `DELETE` | `/api/v1/customer-lists/:id` | `lists/list-routes.ts` |

### Nhóm MEDIA (24 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/media` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/uploaders` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/upload` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/save-from-chat` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/save-from-chat-batch` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/send` | `media/media-routes.ts` |
| `PATCH` | `/api/v1/media/:id` | `media/media-routes.ts` |
| `PATCH` | `/api/v1/media/bulk` | `media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/download` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/trash` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/restore` | `media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id/permanent` | `media/media-routes.ts` |
| `DELETE` | `/api/v1/media/trash/empty` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/watermark` | `media/media-routes.ts` |
| `DELETE` | `/api/v1/media/:id/watermark` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/folders` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/folders` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/suggest` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/tags` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/stats` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/:id/favorite` | `media/media-routes.ts` |
| `GET` | `/api/v1/media/favorites` | `media/media-routes.ts` |
| `POST` | `/api/v1/media/album/send` | `media/media-routes.ts` |

### Nhóm NOTIFICATIONS (1 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/notifications` | `notifications/notification-routes.ts` |

### Nhóm PRIVACY (9 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/privacy/otp/status` | `privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/otp/request` | `privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/otp/verify` | `privacy/privacy-routes.ts` |
| `POST` | `/api/v1/privacy/lock` | `privacy/privacy-routes.ts` |
| `GET` | `/api/v1/privacy/status` | `privacy/privacy-routes.ts` |
| `GET` | `/api/v1/privacy/my-nicks` | `privacy/privacy-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/privacy-mode` | `privacy/privacy-routes.ts` |
| `POST` | `/api/v1/admin/privacy/reset-lock/:userId` | `privacy/privacy-routes.ts` |
| `GET` | `/api/v1/admin/privacy/audit` | `privacy/privacy-routes.ts` |

### Nhóm RBAC (20 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/departments` | `rbac/department-routes.ts` |
| `POST` | `/api/v1/departments` | `rbac/department-routes.ts` |
| `PATCH` | `/api/v1/departments/:id` | `rbac/department-routes.ts` |
| `DELETE` | `/api/v1/departments/:id` | `rbac/department-routes.ts` |
| `POST` | `/api/v1/departments/:id/members` | `rbac/department-routes.ts` |
| `DELETE` | `/api/v1/departments/:id/members/:userId` | `rbac/department-routes.ts` |
| `GET` | `/api/v1/departments/:id/members-tree` | `rbac/department-routes.ts` |
| `GET` | `/api/v1/permission-groups` | `rbac/permission-group-routes.ts` |
| `GET` | `/api/v1/permission-groups/meta` | `rbac/permission-group-routes.ts` |
| `GET` | `/api/v1/permission-groups/:id` | `rbac/permission-group-routes.ts` |
| `POST` | `/api/v1/permission-groups` | `rbac/permission-group-routes.ts` |
| `PATCH` | `/api/v1/permission-groups/:id` | `rbac/permission-group-routes.ts` |
| `DELETE` | `/api/v1/permission-groups/:id` | `rbac/permission-group-routes.ts` |
| `DELETE` | `/api/v1/contacts/:id` | `rbac/rbac-middleware.ts` |
| `GET` | `/api/v1/messages/:id` | `rbac/rbac-middleware.ts` |
| `GET` | `/api/v1/rbac/users` | `rbac/user-assignment-routes.ts` |
| `PATCH` | `/api/v1/rbac/users/:id/permission-group` | `rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/seed-default-groups` | `rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/migrate-legacy-users` | `rbac/user-assignment-routes.ts` |
| `POST` | `/api/v1/admin/rbac/create-test-users` | `rbac/user-assignment-routes.ts` |

### Nhóm SCORING (15 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/scoring/config` | `scoring/scoring-routes.ts` |
| `PUT` | `/api/v1/scoring/config` | `scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/rules` | `scoring/scoring-routes.ts` |
| `PUT` | `/api/v1/scoring/rules/:id` | `scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/stage-transitions` | `scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/stuck-thresholds` | `scoring/scoring-routes.ts` |
| `GET` | `/api/v1/scoring/nba-templates` | `scoring/scoring-routes.ts` |
| `POST` | `/api/v1/scoring/seed-defaults` | `scoring/scoring-routes.ts` |
| `GET` | `/api/v1/friends/:id/score-breakdown` | `scoring/scoring-routes.ts` |
| `POST` | `/api/v1/friends/:id/promote` | `scoring/scoring-routes.ts` |
| `POST` | `/api/v1/friends/:id/evaluate-promote` | `scoring/scoring-routes.ts` |
| `GET` | `/api/v1/leads/stuck` | `scoring/scoring-routes.ts` |
| `POST` | `/api/v1/leads/stuck/scan` | `scoring/scoring-routes.ts` |
| `POST` | `/api/v1/leads/stuck/send-template` | `scoring/scoring-routes.ts` |
| `POST` | `/api/v1/scoring/recompute-all` | `scoring/scoring-routes.ts` |

### Nhóm SEARCH (1 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/search` | `search/search-routes.ts` |

### Nhóm SYSTEM-NOTIFICATIONS (17 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/api/v1/system-notifications/settings` | `system-notifications/system-notify-routes.ts` |
| `PATCH` | `/api/v1/system-notifications/settings/sender` | `system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/recipients` | `system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/recipients/health` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/recipients/:userId/check-live` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/recipients/recheck-all` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/test` | `system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/org-config` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/compile-template` | `system-notifications/system-notify-routes.ts` |
| `PATCH` | `/api/v1/system-notifications/org-config` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/welcome-image` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/preview-welcome` | `system-notifications/system-notify-routes.ts` |
| `GET` | `/api/v1/system-notifications/logs` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/system-notifications/logs/:id/retry` | `system-notifications/system-notify-routes.ts` |
| `POST` | `/api/v1/users/check-zalo-by-phone` | `system-notifications/user-create-with-zalo-routes.ts` |
| `POST` | `/api/v1/users/create-with-zalo` | `system-notifications/user-create-with-zalo-routes.ts` |
| `POST` | `/api/v1/users/:userId/resend-credentials` | `system-notifications/user-create-with-zalo-routes.ts` |

### Nhóm TAGS (12 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `/` | `tags/tag-routes.ts` |
| `GET` | `/zalo-accounts` | `tags/tag-routes.ts` |
| `POST` | `/` | `tags/tag-routes.ts` |
| `PATCH` | `/:id` | `tags/tag-routes.ts` |
| `DELETE` | `/:id` | `tags/tag-routes.ts` |
| `POST` | `/merge` | `tags/tag-routes.ts` |
| `GET` | `/:id/tags` | `tags/tag-routes.ts` |
| `POST` | `/:id/tags` | `tags/tag-routes.ts` |
| `DELETE` | `/:id/tags/:tagId` | `tags/tag-routes.ts` |
| `GET` | `/:id/crm-tags` | `tags/tag-routes.ts` |
| `POST` | `/:id/crm-tags` | `tags/tag-routes.ts` |
| `DELETE` | `/:id/crm-tags/:tagId` | `tags/tag-routes.ts` |

### Nhóm ZALO (88 endpoints)

| Phương thức | Đường dẫn (Route) | File định nghĩa |
|---|---|---|
| `GET` | `${BASE}/export` | `zalo/credential-routes.ts` |
| `POST` | `${BASE}/import` | `zalo/credential-routes.ts` |
| `GET` | `${BASE}-db` | `zalo/friend-routes.ts` |
| `GET` | `/api/v1/friends-db/all-nicks` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}-db/sync` | `zalo/friend-routes.ts` |
| `GET` | `${BASE}/find` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}/lookup-by-phone` | `zalo/friend-routes.ts` |
| `GET` | `${BASE}/online` | `zalo/friend-routes.ts` |
| `GET` | `${BASE}/recommendations` | `zalo/friend-routes.ts` |
| `GET` | `${BASE}/aliases` | `zalo/friend-routes.ts` |
| `GET` | `${BASE}/requests/sent` | `zalo/friend-routes.ts` |
| `GET` | `${BASE}/requests/:userId/status` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}/requests` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}/requests/:userId/accept` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}/requests/:userId/reject` | `zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/requests/:userId` | `zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId` | `zalo/friend-routes.ts` |
| `PUT` | `${BASE}/:userId/alias` | `zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId/alias` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}/:userId/block` | `zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId/block` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}/:userId/block-feed` | `zalo/friend-routes.ts` |
| `DELETE` | `${BASE}/:userId/block-feed` | `zalo/friend-routes.ts` |
| `POST` | `${BASE}/:groupId/block` | `zalo/group-moderation-routes.ts` |
| `DELETE` | `${BASE}/:groupId/block/:userId` | `zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/blocked` | `zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/pending` | `zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/link` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/link/enable` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/link/disable` | `zalo/group-moderation-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:accountId/groups/join-link` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/leave` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/disperse` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls` | `zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId/polls/:pollId` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls/:pollId/vote` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls/:pollId/lock` | `zalo/group-moderation-routes.ts` |
| `POST` | `${BASE}/:groupId/polls/:pollId/share` | `zalo/group-moderation-routes.ts` |
| `GET` | `${BASE}/:groupId` | `zalo/group-routes.ts` |
| `GET` | `${BASE}/:groupId/members` | `zalo/group-routes.ts` |
| `PATCH` | `${BASE}/:groupId/name` | `zalo/group-routes.ts` |
| `POST` | `${BASE}/:groupId/members` | `zalo/group-routes.ts` |
| `DELETE` | `${BASE}/:groupId/members` | `zalo/group-routes.ts` |
| `POST` | `${BASE}/:groupId/deputies` | `zalo/group-routes.ts` |
| `DELETE` | `${BASE}/:groupId/deputies/:userId` | `zalo/group-routes.ts` |
| `POST` | `${BASE}/:groupId/transfer` | `zalo/group-routes.ts` |
| `GET` | `${BASE}/:scanId` | `zalo/group-scan-routes.ts` |
| `GET` | `${BASE}/:scanId/members` | `zalo/group-scan-routes.ts` |
| `GET` | `${BASE}/last-online/:userId` | `zalo/profile-routes.ts` |
| `GET` | `${BASE}/avatars` | `zalo/profile-routes.ts` |
| `PATCH` | `${BASE}/avatar` | `zalo/profile-routes.ts` |
| `DELETE` | `${BASE}/avatars/:avatarId` | `zalo/profile-routes.ts` |
| `POST` | `${BASE}/avatars/:avatarId/reuse` | `zalo/profile-routes.ts` |
| `PUT` | `${BASE}/status` | `zalo/profile-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/access` | `zalo/zalo-access-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/access` | `zalo/zalo-access-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/access/:accessId` | `zalo/zalo-access-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/access/:accessId` | `zalo/zalo-access-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/stats` | `zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/enriched` | `zalo/zalo-dashboard-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/owner` | `zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/uptime` | `zalo/zalo-dashboard-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/bulk-action` | `zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/sdk-limits` | `zalo/zalo-dashboard-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/sdk-limits/org` | `zalo/zalo-dashboard-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/sdk-limits` | `zalo/zalo-dashboard-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/sdk-limits` | `zalo/zalo-dashboard-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/labels` | `zalo/zalo-labels-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/labels-overview` | `zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/sync` | `zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/touch` | `zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/assign-thread` | `zalo/zalo-labels-routes.ts` |
| `POST` | `/api/v1/friends/:friendId/zalo-label` | `zalo/zalo-labels-routes.ts` |
| `PATCH` | `/api/v1/zalo-accounts/:id/labels/:labelId` | `zalo/zalo-labels-routes.ts` |
| `GET` | `/api/v1/zalo-accounts` | `zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts` | `zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/login` | `zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/reconnect` | `zalo/zalo-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id` | `zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/restore` | `zalo/zalo-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/archived` | `zalo/zalo-routes.ts` |
| `DELETE` | `/api/v1/zalo-accounts/:id/purge-empty` | `zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/check-phone` | `zalo/zalo-routes.ts` |
| `GET` | `/api/v1/zalo-accounts/:id/status` | `zalo/zalo-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/proxy` | `zalo/zalo-routes.ts` |
| `PUT` | `/api/v1/zalo-accounts/:id/phone` | `zalo/zalo-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/sync-contacts` | `zalo/zalo-sync-routes.ts` |
| `POST` | `/api/v1/zalo-accounts/:id/sync-history` | `zalo/zalo-sync-routes.ts` |

---

**Tổng cộng: 442 endpoints** trên 24 modules.


---

## Background Workers & Cron Jobs

| File | Export Functions (entry points) | Schedule / Ghi chú |
|---|---|---|
| contacts/contact-profile-sync-cron.ts | startContactProfileSyncCron, stopContactProfileSyncCron, parseBirthDate, mapGender | — |
| contacts/interaction-cron.ts | startInteractionCron, runSilentDetection | 0 19 * * * |
| contacts/reminder-sync.ts | syncReminderFromMessage | — |
| engagement/engagement-cron.ts | startEngagementCron, runEngagementCron | 30 19 * * * |
| media/media-trash-gc-cron.ts | startMediaTrashGcCron, runMediaTrashGc | 30 20 * * * |
| scoring/backfill-cron.ts | runBackfillTick, startBackfillCron, stopBackfillCron | — |
| scoring/decay-cron.ts | runDecayForOrg, runDecayAllOrgs | — |
| zalo/friend-sync-cron.ts | startFriendSyncCron, stopFriendSyncCron, runFriendSyncCycleNow | — |
| zalo/group-info-sync-cron.ts | startGroupInfoSyncCron, stopGroupInfoSyncCron, runGroupInfoSyncCycleNow | — |
| zalo/status-log-checkpoint-cron.ts | startStatusLogCheckpointCron, stopStatusLogCheckpointCron, runCheckpoint | — |
| zalo/alias-sync.ts | pullAliasMap, syncAliasesForAccount | — |
| zalo/zalo-message-sync.ts | startMessageSync, stopMessageSync | — |
| integrations/sync-engine.ts | runSync | — |
