# Channel & Gateway — API Mapping Chi Tiết (95 Routes)

> Bounded Context: `internal/channel`  
> Phân rã từ backend Fastify (`modules/zalo`, `modules/accounts`, `modules/integrations`) sang Go Clean Architecture với Multi-Protocol Delivery.

---

## 1. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Cung cấp API trực tiếp cho Frontend Web/SPA (Vue 3, Admin Portal). Đặc thù Bounded Context Channel cho phép chia các subpackage:
  - `interfaces/http/zalo/`: Các route riêng cho Zalo Personal (`/api/v1/zalo-accounts/*`, `/api/v1/zalo-groups/*`, `/api/v1/zalo-labels/*`).
  - `interfaces/http/telegram/`: Các route riêng cho Telegram Personal MTProto.
  - `interfaces/http/whatsapp/`: Các route riêng cho WhatsApp Personal (QR/Session daemon) và WhatsApp Official (WABA Webhook & Cloud API).
  - `interfaces/http/integrations/`: Facebook OAuth, Webhook receiver.
  - `interfaces/http/egress/`: Admin Egress Proxy Pool quản trị IP.
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `ChannelGatewayService` phục vụ inter-service RPC giữa Node.js Gateway Sidecar và Go Core Application.
- **`interfaces/ws/`**: WebSocket streaming đẩy sự kiện quét mã QR (`qr_scanned`, `qr_confirmed`), thay đổi trạng thái nick (`nick_connected`, `nick_disconnected`).

---

## 2. Bảng Đối Chiếu Chi Tiết Từng Endpoint

### 2.1 Zalo Personal Accounts (32 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/zalo/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/zalo-accounts` | `accounts_handler.go:ListAccounts` | `queries.ListAccessibleAccounts` | `ListAccounts` |
| `POST` | `/api/v1/zalo-accounts/qr` | `qr_handler.go:CreateQRSession` | `commands.InitQRSession` | `InitQRSession` |
| `GET` | `/api/v1/zalo-accounts/:id/qr-status` | `qr_handler.go:GetQRStatus` | `queries.GetQRStatus` | `GetQRStatus` |
| `POST` | `/api/v1/zalo-accounts/:id/relogin` | `accounts_handler.go:Relogin` | `commands.ReloginAccount` | `ReloginAccount` |
| `DELETE` | `/api/v1/zalo-accounts/:id` | `accounts_handler.go:Disconnect` | `commands.DisconnectAccount` | `DisconnectAccount` |
| `POST` | `/api/v1/zalo-accounts/:id/archive` | `accounts_handler.go:Archive` | `commands.ArchiveAccount` | `ArchiveAccount` |
| `POST` | `/api/v1/zalo-accounts/:id/restore` | `accounts_handler.go:Restore` | `commands.RestoreAccount` | `RestoreAccount` |
| `GET` | `/api/v1/zalo-accounts/:id/profile` | `profile_handler.go:GetProfile` | `queries.GetAccountProfile` | `GetProfile` |
| `PUT` | `/api/v1/zalo-accounts/:id/profile` | `profile_handler.go:UpdateProfile` | `commands.UpdateAccountProfile` | `UpdateProfile` |
| `GET` | `/api/v1/zalo-accounts/:id/status-logs`| `status_handler.go:ListLogs` | `queries.ListStatusLogs` | `ListStatusLogs` |
| `POST` | `/api/v1/zalo-accounts/:id/sync-friends`| `sync_handler.go:SyncFriends` | `commands.TriggerFriendSync` | `TriggerFriendSync` |
| `GET` | `/api/v1/zalo-accounts/:id/friends-db` | `friends_handler.go:ListFriendsDB` | `queries.ListFriendsFromDB` | `ListFriendsDB` |
| `POST` | `/api/v1/zalo-accounts/:id/friends/request`| `friends_handler.go:SendRequest`| `commands.SendFriendRequest` | `SendFriendRequest` |
| `POST` | `/api/v1/zalo-accounts/:id/friends/accept` | `friends_handler.go:AcceptRequest`| `commands.AcceptFriendRequest` | `AcceptFriendRequest` |
| `DELETE`| `/api/v1/zalo-accounts/:id/friends/:fId` | `friends_handler.go:DeleteFriend` | `commands.RemoveFriend` | `RemoveFriend` |

### 2.2 Zalo Groups & Moderation (25 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/zalo/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/zalo-accounts/:id/groups` | `groups_handler.go:ListGroups` | `queries.ListAccountGroups` | `ListGroups` |
| `GET` | `/api/v1/zalo-accounts/:id/groups/:gId`| `groups_handler.go:GetGroup` | `queries.GetGroupDetail` | `GetGroupDetail` |
| `POST` | `/api/v1/zalo-accounts/:id/groups/create`| `groups_handler.go:CreateGroup` | `commands.CreateZaloGroup` | `CreateGroup` |
| `POST` | `/api/v1/zalo-accounts/:id/groups/:gId/invite` | `groups_handler.go:InviteMembers` | `commands.InviteGroupMembers` | `InviteGroupMembers` |
| `DELETE`| `/api/v1/zalo-accounts/:id/groups/:gId/members/:mId`| `groups_handler.go:KickMember` | `commands.KickGroupMember` | `KickGroupMember` |
| `POST` | `/api/v1/zalo-accounts/:id/groups/:gId/scan` | `scan_handler.go:TriggerScan` | `commands.QueueGroupScan` | `QueueGroupScan` |
| `GET` | `/api/v1/zalo-accounts/:id/groups/:gId/scan-status` | `scan_handler.go:GetScanStatus` | `queries.GetGroupScanStatus`| `GetGroupScanStatus` |
| `GET` | `/api/v1/zalo-accounts/:id/labels` | `labels_handler.go:ListLabels` | `queries.ListZaloLabels` | `ListLabels` |
| `POST` | `/api/v1/zalo-accounts/:id/labels` | `labels_handler.go:CreateLabel` | `commands.CreateZaloLabel` | `CreateLabel` |
| `POST` | `/api/v1/zalo-accounts/:id/labels/assign` | `labels_handler.go:AssignLabel` | `commands.AssignZaloLabel` | `AssignLabel` |

### 2.3 Egress Proxy Pool & Integrations (38 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/egress/proxies` | `egress/proxy_handler.go:List` | `queries.ListEgressProxies` | `ListEgressProxies` |
| `POST` | `/api/v1/admin/egress/proxies` | `egress/proxy_handler.go:Create` | `commands.AddEgressProxy` | `AddEgressProxy` |
| `POST` | `/api/v1/admin/egress/proxies/test` | `egress/proxy_handler.go:Test` | `commands.TestProxyConnectivity` | `TestProxyConnectivity` |
| `POST` | `/api/v1/admin/egress/proxies/:id/rebind` | `egress/proxy_handler.go:Rebind` | `commands.RebindProxyAccount` | `RebindProxyAccount` |
| `GET` | `/api/v1/telegram-personal/accounts` | `telegram/account_handler.go:List` | `queries.ListTelegramAccounts` | `ListTelegramAccounts` |
| `POST` | `/api/v1/telegram-personal/login/phone` | `telegram/auth_handler.go:SendCode` | `commands.SendTelegramAuthCode` | `SendTelegramAuthCode` |
| `POST` | `/api/v1/telegram-personal/login/code` | `telegram/auth_handler.go:VerifyCode`| `commands.VerifyTelegramAuthCode`| `VerifyTelegramAuthCode` |
| `GET` | `/api/v1/integrations/facebook/oauth` | `integrations/fb_handler.go:OAuth` | `queries.GetFacebookOAuthURL` | `GetFacebookOAuthURL` |
| `POST` | `/api/v1/integrations/facebook/callback`| `integrations/fb_handler.go:Callback`| `commands.ProcessFacebookOAuth` | `ProcessFacebookOAuth` |
| `GET` | `/api/v1/whatsapp-personal/accounts` | `whatsapp/personal_handler.go:List` | `queries.ListWhatsAppPersonalAccounts` | `ListWhatsAppAccounts` |
| `POST` | `/api/v1/whatsapp-personal/qr` | `whatsapp/personal_handler.go:CreateQR` | `commands.InitWhatsAppQRSession` | `InitWhatsAppQR` |
| `GET` | `/api/v1/whatsapp-personal/:id/qr-status` | `whatsapp/personal_handler.go:QRStatus` | `queries.GetWhatsAppQRStatus` | `GetWhatsAppQRStatus` |
| `POST` | `/api/v1/whatsapp-personal/:id/reconnect` | `whatsapp/personal_handler.go:Reconnect` | `commands.ReconnectWhatsAppPersonal` | `ReconnectWhatsApp` |
| `DELETE`| `/api/v1/whatsapp-personal/:id` | `whatsapp/personal_handler.go:Disconnect` | `commands.DisconnectWhatsAppPersonal` | `DisconnectWhatsApp` |
| `GET` | `/api/v1/whatsapp-official/webhook` | `whatsapp/official_handler.go:Verify` | `queries.VerifyWhatsAppWebhook` | `VerifyWebhook` |
| `POST` | `/api/v1/whatsapp-official/webhook` | `whatsapp/official_handler.go:Receive` | `commands.HandleWhatsAppWebhookEvent` | `ReceiveWebhookEvent` |
| `POST` | `/api/v1/whatsapp-official/templates/sync`| `whatsapp/official_handler.go:SyncTemplates` | `commands.SyncWhatsAppTemplates` | `SyncTemplates` |
| `POST` | `/api/v1/whatsapp-official/messages/send-template` | `whatsapp/official_handler.go:SendTemplate` | `commands.SendWhatsAppTemplateMessage` | `SendTemplateMessage` |

---

## 3. Đặc Tả Nghiệp Vụ, Schema DB & Gateway Client RPC Chuẩn Hóa

Xem tài liệu chi tiết bắt buộc tuân thủ: [zalo-personal-domain-gateway-spec.md](./zalo-personal-domain-gateway-spec.md) để:
- Lấy trọn vẹn danh mục API Routes (Accounts, Friends/Danh bạ, Groups/Nhóm, Group Scans).
- DDL PostgreSQL: `zalo_friends`, `zalo_groups`, `zalo_group_members`, `zalo_group_scans`, `zalo_scanned_members`.
- Go RPC Interface `ZaloPersonalGatewayClient` chống sinh code mock/fake.

