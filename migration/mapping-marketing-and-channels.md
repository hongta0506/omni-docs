# Thiết Kế Chi Tiết & Bảng Ánh Xạ DDD: Marketing & Channel Extensions
## Modules Cũ: `campaign` (Issue #23) & `zalo` (Quản lý nhóm & Egress Proxy) ➔ Go Clean DDD

> **Căn cứ nghiệp vụ:** Spec 037b (Gửi tin theo đối tượng), Spec 061 (Gửi tin hàng loạt thật, sửa lỗi stub, kích hoạt lại lượt tạm dừng), Spec 056 P2c (Cấp phát đường ra proxy SOCKS5h & circuit breaker).

---

## 1. Domain Modeling (Tactical DDD)

### 1.1 Invariants & Business Rules
1. **Marketing Campaign (Spec 061)**:
   - Aggregate Root: `Campaign`.
   - Các State: `draft`, `scheduled`, `running`, `paused`, `completed`, `failed`.
   - **Bảo toàn Invariant Resume (Spec 061)**:
     - Khi một campaign bị tạm dừng (`paused`) rồi kích hoạt lại (`resume`): Tổng số người nhận (`total_recipients`) được tính toán cố định từ snapshot của đối tượng đã khóa ban đầu, **tuyệt đối không được cộng dồn trùng lặp**.
   - **Template Interpolation (Bỏ stub hoàn toàn)**:
     - Nội dung tin nhắn hỗ trợ các biến `{name}`, `{gender}`, `{sale}`.
     - Dispatcher phải phân phối gửi thật qua Zalo Personal adapter hoặc Zalo OA, gắn kèm cơ chế trễ (delay ngẫu nhiên 3s - 7s) để bảo vệ tài khoản khỏi checkpoint.
2. **Channel Egress Proxy & Circuit Breaker (Spec 056 P2c)**:
   - Aggregate Root: `EgressBinding`.
   - Mỗi tài khoản Zalo (`channel_account_id`) được gắn vào một proxy endpoint trong pool SOCKS5h.
   - **Invariant Circuit Breaker**:
     - Khi proxy xảy ra lỗi xác thực (`auth-fail`) hoặc mất kết nối 3 lần liên tiếp: Lập tức cô lập cổng proxy (`mark dead`), chuyển tài khoản sang chế độ Direct IP hoặc fail-over sang proxy dự phòng.
     - **Không để nghẽn tiến trình sinh mã QR** khi proxy gặp sự cố.

---

### 1.2 Aggregates & Value Objects (Go Code Structure)

```go
// internal/marketing/domain/campaign.go
type Campaign struct {
    id              uuid.UUID
    tenantID        uuid.UUID
    title           string
    messageTemplate string
    channelType     string // zalo_personal, zalo_oa
    channelAccountID uuid.UUID
    targetAudience  AudienceCriteria
    totalRecipients int
    sentCount       int
    failedCount     int
    status          CampaignStatus
    scheduledAt     *time.Time
    startedAt       *time.Time
    completedAt     *time.Time
}

// internal/channel/domain/egress.go
type EgressBinding struct {
    id               uuid.UUID
    tenantID         uuid.UUID
    channelAccountID uuid.UUID
    proxyURL         string // socks5h://user:pass@host:port
    status           ProxyStatus // healthy, failing, dead
    failureCount     int
    lastCheckedAt    time.Time
}
```

---

## 2. Bảng Ánh Xạ REST API ➔ Go CQRS Handlers (Zero Frontend Breakage)

| Method & Route Node.js | Controller / Service Cũ | Go CQRS Handler | Repository Port | Payload / Response Fields Match |
|---|---|---|---|---|
| `GET /api/v1/campaigns` | `campaign-routes.ts` | `queries.ListCampaignsHandler` | `campaignRepo.List(ctx, filter)` | `[{ id, title, channelType, status, totalRecipients, sentCount, createdAt }]` |
| `POST /api/v1/campaigns` | `campaign-routes.ts` | `commands.CreateCampaignHandler` | `campaignRepo.Save(...)` | Req: `{ title, messageTemplate, targetAudience, channelAccountId }`<br>Res: `{ campaign: { ... } }` |
| `POST /api/v1/campaigns/:id/resume` | `campaign-routes.ts` | `commands.ResumeCampaignHandler` | `campaignRepo.Save(...)` | Res: `{ success: true, status: "running" }` |
| `GET /api/v1/zalo/groups` | `group-routes.ts` | `queries.ListZaloGroupsHandler` | `groupRepo.ListByAccount(...)` | `[{ id, zaloGroupId, name, memberCount, avatarUrl }]` |
| `POST /api/v1/zalo/groups/scan` | `group-scan-routes.ts` | `commands.ScanGroupMembersHandler` | `groupScanQueue.Enqueue(...)` | Req: `{ groupId, filter: [...] }`<br>Res: `{ jobId, status: "scanning" }` |
| `GET /api/v1/zalo/labels` | `zalo-labels-routes.ts` | `queries.ListZaloLabelsHandler` | `labelRepo.ListByTenant(...)` | `[{ id, labelId, name, color }]` |
| `POST /api/v1/zalo/egress/bind` | `egress-routes.ts` | `commands.BindProxyToAccountHandler` | `egressRepo.BindProxy(...)` | Req: `{ channelAccountId, proxyUrl }`<br>Res: `{ success: true }` |
