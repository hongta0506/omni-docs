# Marketing & Automation — API Mapping Chi Tiết (84 Routes)

> Bounded Context: `internal/marketing`  
> Phân rã từ backend Fastify (`modules/tags`, `modules/campaign`, `modules/engagement`, `modules/notifications`) sang Go Clean Architecture.

---

## 1. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Flat handlers per resource cho Frontend:
  - `tags_handler.go`: CRUD Tag và nhóm nhãn (`/api/v1/tags/*`, `/api/v1/tag-groups/*`).
  - `campaigns_handler.go`: Chiến dịch broadcast, kết bạn ngẫu nhiên (`/api/v1/campaigns/*`, `/api/v1/broadcasts/*`).
  - `sequences_handler.go`: Chuỗi chăm sóc tự động (`/api/v1/marketing/sequences/*`).
  - `engagement_handler.go`: Cấu hình chấm điểm tương tác (`/api/v1/engagement/*`).
  - `reports_handler.go`: Báo cáo hiệu quả chiến dịch (`/api/v1/reports/*`).
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `MarketingService` cho worker scheduler kích hoạt chiến dịch.
- **`interfaces/ws/`**: WebSocket streaming thông báo tiến độ gửi tin broadcast theo thời gian thực (`campaign_progress`, `campaign_completed`).

---

## 2. Bảng Đối Chiếu Chi Tiết Từng Endpoint

### 2.1 Tags & Tag Groups (30 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/tags` | `tags_handler.go:ListTags` | `queries.ListTags` | `ListTags` |
| `POST` | `/api/v1/tags` | `tags_handler.go:CreateTag` | `commands.CreateTag` | `CreateTag` |
| `PATCH` | `/api/v1/tags/:id` | `tags_handler.go:UpdateTag` | `commands.UpdateTag` | `UpdateTag` |
| `DELETE` | `/api/v1/tags/:id` | `tags_handler.go:DeleteTag` | `commands.DeleteTag` | `DeleteTag` |
| `GET` | `/api/v1/tag-groups` | `tags_handler.go:ListGroups` | `queries.ListTagGroups` | `ListTagGroups` |
| `POST` | `/api/v1/tag-groups` | `tags_handler.go:CreateGroup` | `commands.CreateTagGroup` | `CreateTagGroup` |
| `POST` | `/api/v1/tags/batch-assign` | `tags_handler.go:BatchAssign` | `commands.BatchAssignTags` | `BatchAssignTags` |

### 2.2 Campaigns & Broadcasts (30 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/campaigns` | `campaigns_handler.go:List` | `queries.ListCampaigns` | `ListCampaigns` |
| `POST` | `/api/v1/campaigns` | `campaigns_handler.go:Create` | `commands.CreateCampaign` | `CreateCampaign` |
| `GET` | `/api/v1/campaigns/:id` | `campaigns_handler.go:Get` | `queries.GetCampaignDetail` | `GetCampaignDetail` |
| `POST` | `/api/v1/campaigns/:id/start` | `campaigns_handler.go:Start` | `commands.StartCampaign` | `StartCampaign` |
| `POST` | `/api/v1/campaigns/:id/pause` | `campaigns_handler.go:Pause` | `commands.PauseCampaign` | `PauseCampaign` |
| `POST` | `/api/v1/campaigns/random-friend-request` | `campaigns_handler.go:RandomFriend` | `commands.ExecuteRandomFriend`| `ExecuteRandomFriend`|

### 2.3 Engagement & Sequence Automation (24 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/engagement/rules` | `engagement_handler.go:ListRules` | `queries.ListEngagementRules` | `ListEngagementRules` |
| `POST` | `/api/v1/engagement/recalculate` | `engagement_handler.go:Recalculate`| `commands.RecalculateScores` | `RecalculateScores` |
| `GET` | `/api/v1/marketing/sequences` | `sequences_handler.go:List` | `queries.ListSequences` | `ListSequences` |
| `POST` | `/api/v1/marketing/sequences` | `sequences_handler.go:Create` | `commands.CreateSequence` | `CreateSequence` |
| `GET` | `/api/v1/reports/campaign-summary`| `reports_handler.go:Summary` | `queries.GetCampaignSummary` | `GetCampaignSummary` |
