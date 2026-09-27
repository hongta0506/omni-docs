# Thiết Kế Chi Tiết & Bảng Ánh Xạ DDD: Customer Bounded Context (Extended)
## Module Cũ: `contacts` (78 REST Endpoints) ➔ Go Clean DDD

> **Mục tiêu:** Ánh xạ toàn bộ các sub-resource của Contact sang Go Clean Architecture. Đảm bảo **Zero Frontend Breakage** và bảo toàn các bất biến nghiệp vụ từ Spec 057 P5.

---

## 1. Domain Modeling (Tactical DDD)

### 1.1 Invariants & Business Rules
1. **Multi-tenancy & Contact Ownership**: Mọi entity con (`ContactNote`, `Appointment`, `ContactActivity`, `LeadAssignment`) đều phải mang `tenant_id` và `contact_id`. Không entity nào được tồn tại độc lập ngoài aggregate boundary.
2. **Contact Notes**:
   - `content` không được rỗng (sau khi trim space).
   - Chỉ người tạo (`created_by_user_id`) hoặc Admin mới có quyền sửa/xóa note.
3. **Appointments**:
   - `start_time` phải trước `end_time`.
   - Không được đặt lịch hẹn trong quá khứ khi tạo mới.
   - Trạng thái hợp lệ: `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show`.
4. **Lead Assignment**:
   - Phân công sale phụ trách (`assigned_user_id`) phải cập nhật `assigned_at` và ghi nhận một `ContactActivity` loại `assignment_changed`.
5. **Smart Merge & Order Transfer (Spec 057 P5)**:
   - Khi `Merge(source, target)`:
     - Ghi nhận `is_merged = true`, `merged_into_id = target.ID()`.
     - Chuyển toàn bộ `mirrored_orders.contact_id` từ `source` sang `target`.
     - Tính toán lại `total_spent` và `purchase_count` của `target` ngay trong cùng transaction có database lock theo tenant.
     - Giữ nguyên các nguồn gắn tay (manual links).

---

### 1.2 Aggregates & Value Objects (Go Code Structure)

```go
// internal/customer/domain/contact_note.go
type ContactNote struct {
    id        uuid.UUID
    tenantID  uuid.UUID
    contactID uuid.UUID
    authorID  uuid.UUID
    content   string
    createdAt time.Time
    updatedAt time.Time
}

// internal/customer/domain/appointment.go
type Appointment struct {
    id          uuid.UUID
    tenantID    uuid.UUID
    contactID   uuid.UUID
    assignedID  uuid.UUID
    title       string
    startTime   time.Time
    endTime     time.Time
    status      AppointmentStatus
    location    string
    notes       string
    createdAt   time.Time
    updatedAt   time.Time
}

// internal/customer/domain/activity.go
type ActivityType string
const (
    ActivityNoteAdded         ActivityType = "note_added"
    ActivityAppointmentBooked ActivityType = "appointment_booked"
    ActivityStatusChanged     ActivityType = "status_changed"
    ActivitySaleAssigned      ActivityType = "sale_assigned"
    ActivityContactMerged     ActivityType = "contact_merged"
    ActivityTagAttached       ActivityType = "tag_attached"
)
```

---

## 2. Bảng Ánh Xạ REST API ➔ Go CQRS Handlers (Zero Frontend Breakage)

| Method & Route Node.js | Controller / Service Cũ | Go CQRS Handler | Repository Port | Payload / Response Fields Match |
|---|---|---|---|---|
| `GET /api/v1/contacts/:id/notes` | `notes-routes.ts` | `queries.ListContactNotesHandler` | `noteRepo.ListByContactID(...)` | `[{ id, contactId, authorId, content, createdAt, author: { id, name, avatar } }]` |
| `POST /api/v1/contacts/:id/notes` | `notes-routes.ts` | `commands.AddContactNoteHandler` | `noteRepo.Save(...)` | Req: `{ content }`<br>Res: `{ id, content, createdAt }` |
| `DELETE /api/v1/contacts/:id/notes/:noteId` | `notes-routes.ts` | `commands.DeleteContactNoteHandler` | `noteRepo.Delete(...)` | Res: `{ success: true }` |
| `GET /api/v1/appointments` | `appointment-routes.ts` | `queries.ListAppointmentsHandler` | `apptRepo.List(ctx, filter)` | `[{ id, contactId, title, startTime, endTime, status, location }]` |
| `POST /api/v1/appointments` | `appointment-routes.ts` | `commands.CreateAppointmentHandler` | `apptRepo.Save(...)` | Req: `{ contactId, title, startTime, endTime, assignedId, notes }`<br>Res: `{ appointment: { ... } }` |
| `PATCH /api/v1/appointments/:id` | `appointment-routes.ts` | `commands.UpdateAppointmentHandler` | `apptRepo.Save(...)` | Req: `{ status?, startTime?, notes? }` |
| `GET /api/v1/contacts/:id/activities` | `timeline-routes.ts` | `queries.ListContactActivitiesHandler`| `activityRepo.ListByContact(...)` | `[{ id, activityType, description, actorId, metadata, createdAt }]` |
| `POST /api/v1/contacts/:id/assign` | `contact-routes.ts` | `commands.AssignContactHandler` | `contactRepo.Save(...)` | Req: `{ assignedUserId }`<br>Res: `{ success: true, contact: { ... } }` |
| `GET /api/v1/contacts/pipeline` | `contact-routes.ts` | `queries.GetContactPipelineHandler` | `contactRepo.GetPipelineSummary(...)` | `{ stages: [{ id, name, count, totalLeadScore }] }` |
| `POST /api/v1/contacts/duplicate-check`| `duplicate-detector.ts` | `queries.CheckDuplicateContactsHandler` | `contactRepo.FindDuplicates(...)` | Req: `{ phone?, email?, name? }`<br>Res: `{ matches: [{ id, displayName, score }] }` |
