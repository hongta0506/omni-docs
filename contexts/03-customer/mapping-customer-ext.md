# Thiết Kế Chi Tiết & Bảng Ánh Xạ DDD: Customer Bounded Context (Extended)
## Module Cũ: `contacts`, `crm-tags`, `lead-pool` ➔ Go Clean DDD

> **Mục tiêu:** Đặc tả toàn bộ 92 endpoints, Aggregate Root, Value Objects, Domain Invariants, CQRS Handlers và Repository Ports của Customer Bounded Context. Đảm bảo **Zero Frontend Breakage** và bảo toàn các bất biến nghiệp vụ từ Spec 057 P5, Spec 039 Lead Pool và Cockpit CRM Tab.

---

## 1. Domain Modeling (Tactical DDD)

### 1.1 Invariants & Business Rules
1. **Multi-tenancy & Contact Ownership**:
   - Mọi entity con (`ContactNote`, `Appointment`, `ContactActivity`, `CRMTag`, `LeadPoolRule`, `LeadPoolRequest`, `ParentCandidate`) đều bắt buộc mang `tenant_id`.
   - Các entity thuộc vòng đời liên hệ bắt buộc có `contact_id`. Không entity nào được tồn tại ngoài aggregate boundary.
2. **Two-Ledger Contact Model (Golden Record)**:
   - Cuốn sổ 1 (`ChannelProfile` / `Friend`): Snapshot dữ liệu mạng xã hội (Zalo, Telegram, FB). Đọc chỉ ghi đè bởi Webhook/Sync từ Gateway, nhân viên không được sửa trực tiếp.
   - Cuốn sổ 2 (`Contact` CRM): Hồ sơ vàng hợp nhất. Chứa `crm_name`, `phone` chuẩn E.164, `pipeline_stage`, `assigned_user_id`, `tags`, `metadata`.
3. **Contact Notes**:
   - `content` không được rỗng sau khi trim space.
   - Chỉ người tạo (`author_id`) hoặc Quản trị viên (Admin/Manager) mới có quyền cập nhật/xóa ghi chú.
4. **Appointments**:
   - `start_time` phải diễn ra trước `end_time`.
   - Không được tạo lịch hẹn trong quá khứ (`start_time >= now() - tolerance`).
   - Trạng thái hợp lệ: `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show`.
5. **Lead Assignment & SLA Auto-Revoke**:
   - Khi gán sale phụ trách (`assigned_user_id`): cập nhật `assigned_at = now()`, sinh sự kiện `ContactActivity` loại `sale_assigned`.
   - Quá hạn SLA (mặc định 24h) không có tương tác phát sinh (`last_interaction_at` không đổi): Worker tự động giải phóng `assigned_user_id = NULL`, chuyển về `LeadPool` và ghi nhận vi phạm SLA.
6. **Lead Pool Claim & Quota Invariants**:
   - Nhân viên chỉ được xin nhận Lead mới (`/lead-pool/request`) khi số Lead đang giữ chưa vượt quá hạn mức (`active_leads_count < max_active_leads_per_rep`, mặc định 10).
   - Cooldown giữa 2 lần xin Lead liên tiếp: tối thiểu `cooldown_minutes` (mặc định 5 phút).
   - Buộc phải có ghi chú (`ContactNote`) cho Lead gần nhất trước khi được cấp Lead tiếp theo (`require_note_before_next`).
   - Lock bi-directional transaction khi nhận lead để chống tranh chấp đồng thời (concurrency race condition).
7. **Smart Merge & Order Transfer (Spec 057 P5)**:
   - Khi `Merge(source, target)`:
     - `source.is_merged = true`, `source.merged_into_id = target.ID()`.
     - Chuyển toàn bộ `mirrored_orders.contact_id` từ `source` sang `target`.
     - Tính toán lại tổng chi tiêu `total_spent` và `purchase_count` của `target` trong cùng 1 DB transaction.
     - Di chuyển các quan hệ bạn bè (`friends`), ghi chú (`notes`), lịch hẹn (`appointments`) sang `target`.
8. **CRM Tags & Color Validation**:
   - Tag name là duy nhất trong cùng một `tenant_id` (case-insensitive).
   - Mã màu `color` phải hợp lệ định dạng Hex (`^#(?:[0-9a-fA-F]{3}){1,2}$`).
   - Thứ tự hiển thị `order_index` tự động tịnh tiến khi thêm mới hoặc sắp xếp lại.
9. **Parent/Child Household Relationship (Gia đình / Doanh nghiệp)**:
   - Một contact chỉ có tối đa 1 `parent_contact_id`.
   - Không cho phép quan hệ vòng lặp: Contact A không thể là Parent của B nếu B (hoặc con của B) đang là Parent của A.

---

### 1.2 Aggregates, Entities & Value Objects (Go Structs)

```go
package domain

import (
	"time"
	"github.com/google/uuid"
)

// ContactNote entity
type ContactNote struct {
	ID        uuid.UUID `json:"id"`
	TenantID  uuid.UUID `json:"tenantId"`
	ContactID uuid.UUID `json:"contactId"`
	AuthorID  uuid.UUID `json:"authorId"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Appointment entity
type AppointmentStatus string
const (
	AppointmentScheduled AppointmentStatus = "scheduled"
	AppointmentConfirmed AppointmentStatus = "confirmed"
	AppointmentCompleted AppointmentStatus = "completed"
	AppointmentCancelled AppointmentStatus = "cancelled"
	AppointmentNoShow    AppointmentStatus = "no_show"
)

type Appointment struct {
	ID         uuid.UUID         `json:"id"`
	TenantID   uuid.UUID         `json:"tenantId"`
	ContactID  uuid.UUID         `json:"contactId"`
	AssignedID uuid.UUID         `json:"assignedId"`
	Title      string            `json:"title"`
	StartTime  time.Time         `json:"startTime"`
	EndTime    time.Time         `json:"endTime"`
	Status     AppointmentStatus `json:"status"`
	Location   string            `json:"location"`
	Notes      string            `json:"notes"`
	CreatedAt  time.Time         `json:"createdAt"`
	UpdatedAt  time.Time         `json:"updatedAt"`
}

// CRMTag entity
type CRMTag struct {
	ID         uuid.UUID `json:"id"`
	TenantID   uuid.UUID `json:"tenantId"`
	Name       string    `json:"name"`
	Color      string    `json:"color"`
	OrderIndex int       `json:"orderIndex"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// LeadPoolRule entity
type LeadPoolRule struct {
	ID                  uuid.UUID `json:"id"`
	TenantID            uuid.UUID `json:"tenantId"`
	Name                string    `json:"name"`
	AutoAssignEnabled   bool      `json:"autoAssignEnabled"`
	MaxLeadsPerRep      int       `json:"maxLeadsPerRep"`
	CooldownMinutes     int       `json:"cooldownMinutes"`
	SlaRevokeHours      int       `json:"slaRevokeHours"`
	RequireNoteForNext  bool      `json:"requireNoteForNext"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

// ContactActivity entity
type ActivityType string
const (
	ActivityNoteAdded         ActivityType = "note_added"
	ActivityAppointmentBooked ActivityType = "appointment_booked"
	ActivityStatusChanged     ActivityType = "status_changed"
	ActivitySaleAssigned      ActivityType = "sale_assigned"
	ActivityLeadRevoked       ActivityType = "lead_revoked"
	ActivityContactMerged     ActivityType = "contact_merged"
	ActivityTagAttached       ActivityType = "tag_attached"
	ActivityTagDetached       ActivityType = "tag_detached"
)

type ContactActivity struct {
	ID           uuid.UUID              `json:"id"`
	TenantID     uuid.UUID              `json:"tenantId"`
	ContactID    uuid.UUID              `json:"contactId"`
	ActivityType ActivityType           `json:"activityType"`
	Description  string                 `json:"description"`
	ActorID      uuid.UUID              `json:"actorId"`
	Metadata     map[string]interface{} `json:"metadata"`
	CreatedAt    time.Time              `json:"createdAt"`
}
```

---

## 2. Bảng Ánh Xạ REST API ➔ Go CQRS Handlers (Zero Frontend Breakage)

| HTTP Route | Source Handler (ZaloCRM Node.js) | Go CQRS Handler | Repository Port | Contract Matching & Payload Details |
|---|---|---|---|---|
| `POST /api/v1/contacts/quick-create` | `contact-routes.ts` | `commands.QuickCreateContactHandler` | `contactRepo.Create(...)` | Req: `{ name, phone }`<br>Res: `201 { id, name, phone }` |
| `PUT /api/v1/contacts/:id` | `contact-routes.ts` | `commands.UpdateContactHandler` | `contactRepo.Update(...)` | Req: `{ fullName?, crmName?, phone?, metadata? }`<br>Res: `200 { id, updated: true }` |
| `DELETE /api/v1/contacts/:id` | `contact-routes.ts` | `commands.DeleteContactHandler` | `contactRepo.SoftDelete(...)` | Res: `200 { ok: true, deleted: true }` |
| `GET /api/v1/contacts/:id/engagement-timeline` | `contact-routes.ts` | `queries.GetEngagementTimelineHandler` | `activityRepo.ListTimeline(...)` | Res: `200 { events: [...] }` |
| `GET /api/v1/contacts/:id/cockpit` | `cockpit-routes.ts` | `queries.GetContactCockpitHandler` | `contactRepo.GetCockpitSummary(...)` | Res: `200 { contact: {...}, metrics: {...}, getfly: {...} }` |
| `GET /api/v1/contacts/:id/teammates` | `cockpit-routes.ts` | `queries.GetContactTeammatesHandler` | `friendRepo.ListTeammates(...)` | Res: `200 { teammates: [...] }` |
| `GET /api/v1/contacts/:contactId/notes` | `notes-routes.ts` | `queries.ListContactNotesHandler` | `noteRepo.ListByContactID(...)` | Res: `200 [{ id, contactId, authorId, content, createdAt, author }]` |
| `POST /api/v1/contacts/:contactId/notes` | `notes-routes.ts` | `commands.AddContactNoteHandler` | `noteRepo.Save(...)` | Req: `{ content }`<br>Res: `201 { id, content, createdAt }` |
| `DELETE /api/v1/contacts/:contactId/notes/:id` | `notes-routes.ts` | `commands.DeleteContactNoteHandler` | `noteRepo.Delete(...)` | Res: `200 { success: true }` |
| `GET /api/v1/contacts/:id/crm-tags` | `crm-tag-routes.ts` | `queries.GetContactCRMTagsHandler` | `tagRepo.ListByContactID(...)` | Res: `200 { tags: [...] }` |
| `POST /api/v1/contacts/:id/crm-tags` | `crm-tag-routes.ts` | `commands.AssignContactCRMTagsHandler` | `tagRepo.AttachToContact(...)` | Req: `{ tagIds: [...] }`<br>Res: `200 { ok: true }` |
| `GET /api/v1/crm-tags` | `crm-tag-routes.ts` | `queries.ListCRMTagsHandler` | `tagRepo.List(...)` | Res: `200 [{ id, name, color, orderIndex }]` |
| `POST /api/v1/crm-tags` | `crm-tag-routes.ts` | `commands.CreateCRMTagHandler` | `tagRepo.Create(...)` | Req: `{ name, color }`<br>Res: `201 { id, name, color }` |
| `PATCH /api/v1/crm-tags/:id` | `crm-tag-routes.ts` | `commands.UpdateCRMTagHandler` | `tagRepo.Update(...)` | Req: `{ name?, color?, orderIndex? }`<br>Res: `200 { id, updated: true }` |
| `DELETE /api/v1/crm-tags/:id` | `crm-tag-routes.ts` | `commands.DeleteCRMTagHandler` | `tagRepo.Delete(...)` | Res: `200 { ok: true }` |
| `POST /api/v1/crm-tags/reorder` | `crm-tag-routes.ts` | `commands.ReorderCRMTagsHandler` | `tagRepo.Reorder(...)` | Req: `{ tagIds: [...] }`<br>Res: `200 { ok: true }` |
| `GET /api/v1/contacts/duplicates` | `contact-routes.ts` | `queries.ListContactDuplicatesHandler` | `contactRepo.FindDuplicateGroups(...)` | Res: `200 { groups: [...] }` |
| `POST /api/v1/contacts/duplicates/:groupId/merge` | `contact-routes.ts` | `commands.MergeDuplicateContactHandler` | `contactRepo.Merge(...)` | Req: `{ primaryContactId }`<br>Res: `200 { merged: true, groupId }` |
| `POST /api/v1/contacts/duplicates/:groupId/dismiss` | `contact-routes.ts` | `commands.DismissDuplicateContactHandler` | `contactRepo.DismissDuplicate(...)` | Res: `200 { dismissed: true, groupId }` |
| `GET /api/v1/contacts/parent-candidates` | `contact-routes.ts` | `queries.ListParentCandidatesHandler` | `parentRepo.ListCandidates(...)` | Res: `200 { candidates: [...] }` |
| `POST /api/v1/contacts/parent-candidates/:id/accept` | `contact-routes.ts` | `commands.AcceptParentCandidateHandler` | `parentRepo.AcceptCandidate(...)` | Req: `{ parentContactId }`<br>Res: `200 { ok: true }` |
| `POST /api/v1/contacts/parent-candidates/:id/dismiss` | `contact-routes.ts` | `commands.DismissParentCandidateHandler` | `parentRepo.DismissCandidate(...)` | Res: `200 { ok: true }` |
| `POST /api/v1/contacts/:id/link-parent` | `contact-routes.ts` | `commands.LinkParentContactHandler` | `contactRepo.SetParent(...)` | Req: `{ parentContactId }`<br>Res: `200 { ok: true }` |
| `POST /api/v1/contacts/:id/unlink-parent` | `contact-routes.ts` | `commands.UnlinkParentContactHandler` | `contactRepo.ClearParent(...)` | Res: `200 { ok: true }` |
| `POST /api/v1/lead-pool/rules` | `lead-pool-routes.ts` | `commands.CreateLeadPoolRuleHandler` | `leadPoolRepo.SaveRule(...)` | Req: `{ name, autoAssign, maxLeads }`<br>Res: `201 { id }` |
| `GET /api/v1/lead-pool/request` | `lead-pool-routes.ts` | `commands.RequestLeadFromPoolHandler` | `leadPoolRepo.ClaimLead(...)` | Res: `200 { lead: {...}, remainingQuota: 9 }` |
| `POST /api/v1/lead-pool/return` | `lead-pool-routes.ts` | `commands.ReturnLeadToPoolHandler` | `leadPoolRepo.ReturnLead(...)` | Req: `{ contactId, reason }`<br>Res: `200 { returned: true }` |
| `POST /api/v1/lead-pool/admin/reset-quota` | `lead-pool-routes.ts` | `commands.ResetLeadPoolQuotaHandler` | `leadPoolRepo.ResetQuotas(...)` | Req: `{ userId? }`<br>Res: `200 { reset: true }` |
| `GET /api/v1/contacts/:id/appointments` | `contact-routes.ts` | `queries.ListContactAppointmentsHandler` | `apptRepo.ListByContactID(...)` | Res: `200 [{ id, title, startTime, status }]` |
| `GET /api/v1/contacts/pipeline` | `contact-routes.ts` | `queries.GetContactPipelineHandler` | `contactRepo.GetPipelineSummary(...)` | Res: `200 { stages: [...] }` |
| `GET /api/v1/contacts/stats` | `contact-routes.ts` | `queries.GetContactStatsHandler` | `contactRepo.GetStats(...)` | Res: `200 { total, newToday, leadPoolCount }` |

---

## 3. Observability, Logging & Error Taxonomy

Tuân thủ nghiêm ngặt chuẩn `pkg/logger` và `pkg/errors`:
- Tất cả các thao tác thay đổi trạng thái (Merge, Claim Lead, Delete Contact, Assign Tag) phải ghi Structured JSON log ra `stdout` chứa `trace_id`, `tenant_id`, `bounded_context="customer"`, `submodule`, `action_taken`, và `duration_ms`.
- Phân loại lỗi miền:
  - `CodeInvalidInput`: Dữ liệu đầu vào sai format (Phone E.164, Hex color, startTime >= endTime).
  - `CodeNotFound`: Không tìm thấy Contact, Tag, Note hoặc Candidate trong phạm vi Tenant.
  - `CodeConflict`: Trùng lặp Tag Name, xung đột cập nhật Contact, hoặc Lead vừa bị Sales khác claim.
  - `CodeForbidden`: Truy cập ngoài Tenant hoặc sửa Note của Sales khác khi không có quyền Admin.
