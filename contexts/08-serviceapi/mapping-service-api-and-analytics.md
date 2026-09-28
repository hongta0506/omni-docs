# Thiết Kế Chi Tiết & Bảng Ánh Xạ DDD: Service-API & Analytics Bounded Context
## Modules Cũ: `service-api` (68 routes), `analytics`, `ops-radar` (45 routes) ➔ Go Clean DDD

> **Căn cứ nghiệp vụ:** Spec 046 (Service API đa tenant & Agent Hands), Spec 032 (Radar vận hành, đo SLA và tín hiệu bất thường).

---

## 1. Domain Modeling (Tactical DDD)

### 1.1 Invariants & Business Rules
1. **Service API Multi-tenant & Security (Spec 046)**:
   - Aggregate Root: `ServiceCredential`.
   - Invariant: Mỗi request từ external agent (Goclaw, Auto-bot) phải mang Bearer Token hợp lệ được hash và kiểm tra chữ ký HMAC hoặc SHA-256.
   - **Request Fingerprinting**: Chống phát lại (replay attack) bằng `X-Request-Fingerprint` lưu trong Redis với TTL 10 phút.
   - **Agent Hands Write Policy**: Agent chỉ được ghi dữ liệu vào các contact/lead mà nó được gán quyền (`assertServiceAgentVisible`), không được can thiệp vào các tài khoản/lead của phòng ban khác.
2. **Analytics & SLA Response Tracking (Spec 032)**:
   - Aggregate Root: `ConversationSLA`.
   - Invariant: Thời gian phản hồi đầu tiên (`first_response_time`) được tính từ mốc tin nhắn inbound của khách đến mốc tin nhắn outbound đầu tiên của nhân viên.
   - Invariant: Khi thời gian chờ vượt ngưỡng cấu hình (ví dụ > 15 phút trong giờ làm việc), tự động kích hoạt `SLAWarningSignal`.
3. **Ops Radar Anomaly Detection (Spec 032)**:
   - Bất biến khung giờ làm việc (`work-hours`): Chỉ tính thời gian vi phạm SLA trong khung giờ làm việc của tổ chức (trừ đêm và ngày nghỉ lễ).
   - Phân tích cảm xúc (`sentiment`): Gắn nhãn hội thoại tiêu cực để đẩy lên `ActionHub` cho quản lý can thiệp kịp thời.

---

### 1.2 Aggregates & Value Objects (Go Code Structure)

```go
// internal/serviceapi/domain/credential.go
type ServiceCredential struct {
    id          uuid.UUID
    tenantID    uuid.UUID
    name        string
    tokenHash   string
    permissions []string
    isActive    bool
    lastUsedAt  *time.Time
}

// internal/analytics/domain/sla_metric.go
type AgentSLAMetric struct {
    id                uuid.UUID
    tenantID          uuid.UUID
    agentUserID       uuid.UUID
    conversationID    uuid.UUID
    firstResponseTime time.Duration
    avgResponseTime   time.Duration
    isBreached        bool
    recordedAt        time.Time
}
```

---

## 2. Bảng Ánh Xạ REST API ➔ Go CQRS Handlers (Zero Frontend Breakage)

| Method & Route Node.js | Controller / Service Cũ | Go CQRS Handler | Repository Port | Payload / Response Fields Match |
|---|---|---|---|---|
| `POST /api/v1/service/messages/send` | `service-message-routes.ts` | `commands.SendExternalAgentMessageHandler` | `serviceMsgRepo.SaveAndDispatch(...)` | Req: `{ toUid, channelType, text, fingerprint }`<br>Res: `{ messageId, status: "queued" }` |
| `GET /api/v1/service/whoami` | `service-whoami-routes.ts` | `queries.GetServiceIdentityHandler` | `credRepo.FindActiveByToken(...)` | Res: `{ tenantId, agentId, permissions }` |
| `POST /api/v1/service/leads/assign` | `service-lead-assignment-routes.ts` | `commands.ServiceAssignLeadHandler` | `leadRepo.Assign(...)` | Req: `{ contactId, targetUserId }`<br>Res: `{ success: true }` |
| `GET /api/v1/analytics/overview` | `analytics-routes.ts` | `queries.GetAnalyticsOverviewHandler` | `analyticsRepo.GetMetrics(ctx, period)` | `{ totalMessages, activeContacts, newLeads, avgResponseMinutes }` |
| `GET /api/v1/analytics/team-performance`| `team-performance.ts` | `queries.GetTeamPerformanceHandler` | `analyticsRepo.GetTeamMetrics(ctx, filter)` | `[{ userId, name, totalConversations, avgFirstResponseSec, slaPassRate }]` |
| `GET /api/v1/ops-radar/signals` | `ops-radar-routes.ts` | `queries.ListRadarSignalsHandler` | `signalRepo.ListActiveSignals(...)` | `[{ id, conversationId, signalType: "sla_breach", severity, createdAt }]` |
