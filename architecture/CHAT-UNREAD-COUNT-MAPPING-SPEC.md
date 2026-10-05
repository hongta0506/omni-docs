# CHAT-UNREAD-COUNT-MAPPING-SPEC.md — Đặc tả Kỹ thuật Mapping Số đếm Chưa đọc (Group, Cá nhân, Chính, Ưu tiên)

> **Bounded Context:** Conversation & Media (`internal/conversation`)  
> **Frontend Module:** Chat & Inbox Triage (`omni-web/src/components/chat`, `omni-web/src/views/ChatView.vue`)  
> **Document Status:** Official Reference Spec

---

## 1. Bối cảnh & Phân tích Nghiệp vụ (Business Analysis)

### 1.1 Vấn đề Hiện tại
1. **Số đếm chưa đọc bị gộp chung (Global Aggregate):**
   - Khi Sale đứng ở tab **Cá nhân** (`personal`), **Nhóm** (`group`), **Chính** (`main`) hay **Ưu tiên** (`other`), số đếm trên quick pill **"Chưa đọc"** hiện tại chỉ phản ánh một con số tổng duy nhất (`counts.unread`), hoặc tính toán trên danh sách đã tải ở client-side mà không đồng bộ theo ngữ cảnh tab.
   - Khi có tin nhắn nhóm chưa đọc, số đếm pill "Chưa đọc" ở tab "Cá nhân" vẫn tăng, nhưng khi Sale bấm vào filter "Chưa đọc", danh sách 1-1 lại rỗng hoặc không khớp với số đếm trên pill, gây hiểu lầm là lỗi hệ thống ("lag số").
2. **Tab "Ưu tiên" & "Nhóm" thiếu phân rã chỉ số chính xác:**
   - Tab "Ưu tiên" đang dùng trường riêng `otherUnread`, nhưng các tab "Cá nhân", "Nhóm", "Chính" chưa có trường unread độc lập trong DTO phản hồi của backend `GET /api/v1/conversations/counts`.
   - API `/api/v1/conversations/counts` chưa hỗ trợ lọc theo `tab` và `threadType` một cách nhất quán với query của `GET /api/v1/conversations`.

### 1.2 Phân tích 5 Whys (Gốc rễ Vấn đề)
1. **Tại sao số đếm chưa đọc trên giao diện gây khó hiểu cho người dùng?**  
   → Vì số đếm hiển thị trên pill "Chưa đọc" không tương ứng với các hội thoại hiển thị trong tab đang chọn.
2. **Tại sao không tương ứng?**  
   → Vì UI đang dùng chung một giá trị `counts.unread` toàn cục hoặc gọi API đếm không kèm tham số phạm vi tab.
3. **Tại sao API không trả về theo tab?**  
   → Vì `GetCounts` trong `internal/conversation/interfaces/http/chat_handler.go` chỉ tính `COUNT(*) FILTER (WHERE unread_count > 0)` trên toàn bộ tenant, bỏ qua query param `tab` và `threadType`.
4. **Tại sao UI không biết phân bổ chưa đọc giữa 4 mục?**  
   → Vì schema DTO của `/conversations/counts` thiếu các trường breakdown: `unreadPersonal`, `unreadGroup`, `unreadMain`, `unreadPriority`.
5. **Mục tiêu cốt lõi cần đạt được:**  
   → Mọi số đếm chưa đọc (ở Pill filter "Chưa đọc", Mini counter "x chưa đọc", và Badge/chấm báo trên từng Tab) phải được mapping chính xác tuyệt đối theo 4 nhóm: **Group (Nhóm)**, **Cá nhân (1-1)**, **Chính (Hộp thư chính)**, và **Ưu tiên (Đã ghim / Priority)**.

---

## 2. Chuẩn hóa Thuật ngữ & Quy tắc Nghiệp vụ (Ubiquitous Language & Invariants)

| Thuật ngữ | UI Label | Mã Hệ thống (Code / DB) | Điều kiện Lọc Dữ liệu (PostgreSQL Filter) | Quy tắc Loại trừ |
|---|---|---|---|---|
| **Cá nhân** | Cá nhân | `personal` / `threadType=user` | `(metadata->>'threadType' IS NULL OR metadata->>'threadType' != 'group') AND (metadata->>'tab' IS NULL OR metadata->>'tab' != 'other')` | Loại trừ hội thoại nhóm và hội thoại đã chuyển sang Ưu tiên. |
| **Nhóm** | Nhóm | `group` / `threadType=group` | `metadata->>'threadType' = 'group' AND (metadata->>'tab' IS NULL OR metadata->>'tab' != 'other')` | Chỉ hội thoại nhóm, loại trừ hội thoại nhóm đã chuyển sang Ưu tiên. |
| **Chính** | Chính | `main` / `tab=main` | `metadata->>'tab' IS NULL OR metadata->>'tab' != 'other'` | Bao gồm cả 1-1 và nhóm nằm trong hộp thư chính (loại trừ Ưu tiên). |
| **Ưu tiên** | Ưu tiên | `other` / `is_pinned=true` | `metadata->>'tab' = 'other' OR is_pinned = true` | Hội thoại được ghim hoặc gán nhãn ưu tiên; tách biệt khỏi hộp thư chính. |

### Domain Invariants:
1. **Bảo toàn số lượng (Disjoint Partition):**
   - `unreadMain = unreadPersonal + unreadGroup`
   - `unreadTotal = unreadMain + unreadPriority`
2. **Quy tắc đếm Chưa đọc (Unread Definition):**
   - Một hội thoại được tính là chưa đọc khi và chỉ khi: `unread_count > 0` VÀ `deleted_at IS NULL` VÀ thuộc tenant/account được phân quyền.
3. **Quy tắc hiển thị Pill "Chưa đọc" theo Tab:**
   - Đang ở Tab **Cá nhân**: Pill "Chưa đọc" hiển thị đúng `unreadPersonal`.
   - Đang ở Tab **Nhóm**: Pill "Chưa đọc" hiển thị đúng `unreadGroup`.
   - Đang ở Tab **Chính**: Pill "Chưa đọc" hiển thị đúng `unreadMain`.
   - Đang ở Tab **Ưu tiên**: Pill "Chưa đọc" hiển thị đúng `unreadPriority`.
4. **Quy tắc hiển thị Badge/Dot trên 4 Tab:**
   - Tab **Cá nhân**: In đậm / hiển thị badge khi `unreadPersonal > 0`.
   - Tab **Nhóm**: In đậm / hiển thị badge khi `unreadGroup > 0`.
   - Tab **Chính**: In đậm / hiển thị badge khi `unreadMain > 0`.
   - Tab **Ưu tiên**: Class `has-unread` (dot đỏ) khi `unreadPriority > 0` (hoặc `otherUnread > 0`).

---

## 3. BDD Acceptance Criteria (Given / When / Then)

### Kịch bản 1: Đếm chưa đọc độc lập giữa Cá nhân và Nhóm
- **Given:** Tài khoản có:
  - 3 cuộc hội thoại 1-1 cá nhân chưa đọc (`threadType='user', tab='main', unread_count > 0`).
  - 5 cuộc hội thoại nhóm chưa đọc (`threadType='group', tab='main', unread_count > 0`).
  - 1 cuộc hội thoại ưu tiên chưa đọc (`tab='other', unread_count > 0`).
- **When:** Người dùng chọn tab **"Cá nhân"**.
- **Then:**
  - Pill "Chưa đọc" hiển thị số **3**.
  - Dòng mini counter hiển thị "... · **3 chưa đọc**".
  - Khi click vào pill "Chưa đọc", danh sách lọc đúng 3 hội thoại cá nhân chưa đọc.

### Kịch bản 2: Đếm chưa đọc trong Tab Nhóm
- **Given:** Dữ liệu như Kịch bản 1.
- **When:** Người dùng chuyển sang tab **"Nhóm"**.
- **Then:**
  - Pill "Chưa đọc" lập tức cập nhật hiển thị số **5**.
  - Khi click vào pill "Chưa đọc", danh sách lọc đúng 5 hội thoại nhóm chưa đọc.

### Kịch bản 3: Đếm tổng hợp trong Tab Chính
- **Given:** Dữ liệu như Kịch bản 1.
- **When:** Người dùng chuyển sang tab **"Chính"**.
- **Then:**
  - Pill "Chưa đọc" hiển thị số **8** (gồm 3 cá nhân + 5 nhóm).
  - Không bao gồm 1 hội thoại thuộc tab Ưu tiên.

### Kịch bản 4: Đếm trong Tab Ưu tiên
- **Given:** Dữ liệu như Kịch bản 1.
- **When:** Người dùng ở bất kỳ tab nào.
- **Then:**
  - Tab "Ưu tiên" hiển thị chấm đỏ báo chưa đọc (`has-unread`).
- **When:** Người dùng click vào tab **"Ưu tiên"**.
- **Then:**
  - Pill "Chưa đọc" hiển thị số **1**.
  - Danh sách lọc ra đúng 1 hội thoại ưu tiên chưa đọc.

---

## 4. Thiết kế Kỹ thuật Backend (`omni-core`)

### 4.1 Endpoint Contract: `GET /api/v1/conversations/counts`
- **Query Parameters:**
  - `accountId` (string, optional): Lọc theo Nick Zalo/Kênh liên kết.
  - `tab` (string, optional): `personal` | `group` | `main` | `other` (nếu truyền, trường `unread` và `total` sẽ tính theo tab này).
  - `threadType` (string, optional): `user` | `group`.

- **Response Payload DTO:**
```json
{
  "total": 100,
  "unread": 8,
  "unanswered": 5,
  "stuck": 2,
  "ready": 3,
  "individual": 60,
  "group": 40,
  "otherUnread": 1,
  "unreadPersonal": 3,
  "unreadGroup": 5,
  "unreadMain": 8,
  "unreadPriority": 1,
  "breakdown": {
    "personal": { "total": 55, "unread": 3, "unanswered": 2 },
    "group": { "total": 35, "unread": 5, "unanswered": 3 },
    "main": { "total": 90, "unread": 8, "unanswered": 5 },
    "priority": { "total": 10, "unread": 1, "unanswered": 0 }
  }
}
```

### 4.2 Tối ưu Hiệu năng Truy vấn (Anti-Pattern & Performance Lock)
- **Zero N+1 & Single Atomic Aggregation:**
  - Sử dụng SQL `COUNT(*) FILTER (WHERE ...)` trong một câu `SELECT` duy nhất để quét toàn bộ các chỉ số thống kê thay vì chạy nhiều câu query riêng lẻ.
  - Tận dụng index `idx_conversations_tenant` và `idx_conversations_last_message`.
- **Đoạn mã SQL mẫu chuẩn Bun ORM:**
```go
q := h.db.NewSelect().
    Table("conversations").
    Where("tenant_id = ? OR tenant_id = '00000000-0000-0000-0000-000000000001'", tenantID).
    ColumnExpr("COUNT(*) AS total").
    ColumnExpr("COUNT(*) FILTER (WHERE unread_count > 0) AS unread_total").
    ColumnExpr("COUNT(*) FILTER (WHERE unread_count > 0 AND (metadata->>'threadType' IS NULL OR metadata->>'threadType' != 'group') AND (metadata->>'tab' IS NULL OR metadata->>'tab' != 'other')) AS unread_personal").
    ColumnExpr("COUNT(*) FILTER (WHERE unread_count > 0 AND metadata->>'threadType' = 'group' AND (metadata->>'tab' IS NULL OR metadata->>'tab' != 'other')) AS unread_group").
    ColumnExpr("COUNT(*) FILTER (WHERE unread_count > 0 AND (metadata->>'tab' IS NULL OR metadata->>'tab' != 'other')) AS unread_main").
    ColumnExpr("COUNT(*) FILTER (WHERE unread_count > 0 AND (metadata->>'tab' = 'other' OR is_pinned = true)) AS unread_priority").
    ColumnExpr("COUNT(*) FILTER (WHERE (metadata->>'threadType' IS NULL OR metadata->>'threadType' != 'group') AND (metadata->>'tab' IS NULL OR metadata->>'tab' != 'other')) AS total_personal").
    ColumnExpr("COUNT(*) FILTER (WHERE metadata->>'threadType' = 'group' AND (metadata->>'tab' IS NULL OR metadata->>'tab' != 'other')) AS total_group").
    ColumnExpr("COUNT(*) FILTER (WHERE metadata->>'tab' IS NULL OR metadata->>'tab' != 'other') AS total_main").
    ColumnExpr("COUNT(*) FILTER (WHERE metadata->>'tab' = 'other' OR is_pinned = true) AS total_priority")
```

---

## 5. Thiết kế Kỹ thuật Frontend (`omni-web`)

### 5.1 Cập nhật `ConversationFilterBar.vue`
- Mở rộng kiểu dữ liệu `counts`:
```typescript
counts: {
  total?: number;
  unread?: number;
  unanswered?: number;
  stuck?: number;
  ready?: number;
  individual?: number;
  group?: number;
  unreadPersonal?: number;
  unreadGroup?: number;
  unreadMain?: number;
  unreadPriority?: number;
  otherUnread?: number;
};
```
- Tính toán số đếm unread động tương ứng với `filters.state.activeTab`:
```typescript
const activeUnreadCount = computed(() => {
  const tab = props.filters?.state?.activeTab;
  if (tab === 'personal') {
    return props.counts.unreadPersonal ?? props.counts.unread ?? 0;
  }
  if (tab === 'group') {
    return props.counts.unreadGroup ?? 0;
  }
  if (tab === 'main') {
    return props.counts.unreadMain ?? props.counts.unread ?? 0;
  }
  if (tab === 'other') {
    return props.counts.unreadPriority ?? props.counts.otherUnread ?? 0;
  }
  return props.counts.unread ?? 0;
});
```
- Hiển thị trên giao diện:
  - Pill "Chưa đọc": `<span class="count">{{ activeUnreadCount }}</span>`
  - Mini counter: `<span class="accent">{{ activeUnreadCount }} chưa đọc</span>`
  - Tab "Cá nhân", "Nhóm", "Chính": bổ sung badge / font-weight tương ứng khi có unread.

### 5.2 Cập nhật `ChatView.vue`
- Hàm `fetchPriorityUnread()` (hoặc `fetchCounts()`) phân giải toàn bộ các trường:
```typescript
serverCounts.value = {
  total: res.data.total ?? 0,
  unread: res.data.unread ?? 0,
  unanswered: res.data.unanswered ?? 0,
  stuck: res.data.stuck ?? 0,
  ready: res.data.ready ?? 0,
  individual: res.data.individual ?? 0,
  group: res.data.group ?? 0,
  unreadPersonal: res.data.unreadPersonal ?? 0,
  unreadGroup: res.data.unreadGroup ?? 0,
  unreadMain: res.data.unreadMain ?? 0,
  unreadPriority: res.data.unreadPriority ?? res.data.otherUnread ?? 0,
  otherUnread: res.data.otherUnread ?? 0,
};
```

---

## 6. Kế hoạch Triển khai Chuẩn chỉnh (Step-by-Step Execution Plan)

1. **Giai đoạn 1: Tài liệu & Phê duyệt (Docs & Plan Approval)**:
   - Tạo tài liệu đặc tả `CHAT-UNREAD-COUNT-MAPPING-SPEC.md` trong `omni-docs`.
   - Cập nhật `CHAT-FILTER-AND-ACTIONS-SPEC.md` liên kết tới tài liệu này.
   - Commit, push và tạo PR merge vào `master` của `omni-docs`.
   - Trình bày kế hoạch cho người dùng phê duyệt trước khi viết code.
2. **Giai đoạn 2: Tạo GitHub Issue & Đưa vào Sprint Board**:
   - Tạo Issue mới trên `omni-core` theo đúng cấu trúc 7 phần của `AGENTS.md` §4.4.
   - Gán vào Project Board `PVT_kwHOD3RGJc4Bkgl_`, chuyển sang `In Progress` (`47fc9ee4`).
3. **Giai đoạn 3: Triển khai Backend (`omni-core`)**:
   - Tạo nhánh `feat/<issue>-unread-count-tab-mapping` từ `staging`.
   - Triển khai atomic query đếm phân rã trong `chat_handler.go` và `postgres_repository.go`.
   - Viết unit test kiểm thử `GetCounts` với các trường `unreadPersonal`, `unreadGroup`, `unreadMain`, `unreadPriority`.
   - Chạy `verify_agents_rules.sh` và `go test -race ./internal/conversation/...`.
4. **Giai đoạn 4: Triển khai Frontend (`omni-web`)**:
   - Cập nhật `ConversationFilterBar.vue`, `use-inbox-filters.ts` và `ChatView.vue` phản ánh `activeUnreadCount`.
   - Bổ sung Vitest unit test kiểm tra reactivity khi đổi tab.
   - Chạy `vue-tsc -b` và `npx vitest`.
5. **Giai đoạn 5: Kiểm thử E2E & Đóng Task**:
   - Tạo PR trên `omni-core`, watch CI pass 100%.
   - Squash merge vào `staging`, restart backend, chuyển thẻ Sprint Board sang `Done` (`98236657`).
