# Zalo Groups Management & Lead Generation — Use Cases & Technical Specification

> **Bounded Contexts liên quan:**
> - `internal/channel`: Quản lý thực thể Nhóm (`ZaloGroup`), Thành viên (`ZaloGroupMember`), Phiên quét (`ZaloGroupScan`), Gateway Client RPC.
> - `internal/customer`: Tiếp nhận danh sách quét để chuyển đổi thành `Contact` và `Lead` (Lead Generation Ingestion).
> - `internal/conversation`: Lưu trữ hội thoại nhóm (`group_chat`) và các tin nhắn trao đổi trong nhóm.
> - `internal/marketing`: Điều phối chiến dịch gửi tin nhắn hàng loạt vào nhóm (Group Broadcast Automation).

---

## 1. Domain Model & Business Invariants

### 1.1 Invariants & Business Rules
1. **Phân quyền thao tác theo Vai trò Nhóm (Group Roles Invariant)**:
   - Các vai trò trong nhóm: `ADMIN` (Trưởng nhóm), `DEPUTY` (Phó nhóm), `MEMBER` (Thành viên).
   - Thao tác gửi tin nhóm: Nếu nhóm cấu hình `only_admin_can_chat = true`, tài khoản Zalo cá nhân BẮT BUỘC phải có vai trò `ADMIN` hoặc `DEPUTY` mới được gửi outbound message. Nếu là `MEMBER`, hệ thống từ chối ngay tại Domain Layer (`ErrGroupAdminChatOnly`).
   - Duyệt thành viên: Chỉ thực thi khi tài khoản có quyền `ADMIN` hoặc `DEPUTY`.
2. **Lead Generation & Chống trùng lặp (Anti-Collision & Deduplication Invariant)**:
   - Một thành viên được quét từ nhóm (`member_zalo_uid`) khi ingest vào CRM (`internal/customer`) phải tuân thủ thứ tự mapping:
     1. Khớp `zalo_uid` với hồ sơ khách hàng hiện có.
     2. Khớp số điện thoại (nếu thông tin công khai hoặc đã từng kết bạn trước đó).
     3. Nếu đã tồn tại: Cập nhật tag nguồn `source = 'zalo_group'` và gắn `group_id` vào timeline hoạt động. KHÔNG tạo mới duplicate record.
     4. Nếu chưa tồn tại: Tạo mới `Contact` với trạng thái `LEAD_UNVERIFIED`.
3. **Anti-Spam & Rate Limiting khi gửi tin nhóm (Outbound Group Broadcast Invariant)**:
   - Khoảng cách giữa 2 lần gửi tin liên tiếp vào cùng 1 nhóm: Tối thiểu **30 giây**.
   - Khoảng cách giữa các nhóm khác nhau trong một chiến dịch: Áp dụng Human-like Jitter ngẫu nhiên từ **15 đến 45 giây**.
   - Hạn mức tối đa một tài khoản cá nhân được gửi vào nhóm trong một ngày: Không quá **50 tin nhóm/ngày/tài khoản** để tránh bị Zalo đưa vào danh sách đen hoặc hạn chế tính năng tài khoản (Checkpoint).
4. **Idempotency & Concurrent Scan Protection**:
   - Mỗi nhóm chỉ được phép có duy nhất **1 phiên quét (`ZaloGroupScan`) ở trạng thái `IN_PROGRESS`** tại một thời điểm.
   - Nếu có yêu cầu quét mới khi phiên cũ đang chạy, hệ thống trả về mã lỗi `409 Conflict` (`ErrScanAlreadyInProgress`).

---

## 2. Danh Sách Use Cases (Chuẩn BDD Given/When/Then)

### UC-GRP-01: Đồng Bộ Danh Sách Nhóm Zalo (Sync Groups from Gateway)
- **Actor:** Nhân viên kinh doanh / Hệ thống nền (Cron/Worker).
- **Mục tiêu:** Kéo danh sách toàn bộ các nhóm chat mà tài khoản Zalo cá nhân đang tham gia từ ZCA Gateway về lưu tại PostgreSQL.

#### Kịch bản BDD:
```gherkin
Scenario: Đồng bộ danh sách nhóm thành công từ Zalo
  Given Tài khoản Zalo cá nhân "ACC_01" có trạng thái "ACTIVE"
  When Nhân viên gọi "POST /api/v1/zalo-groups/sync" với payload:
    { "account_id": "ACC_01" }
  Then Hệ thống gọi RPC "GetGroups" sang ZCA Gateway
  And ZCA Gateway trả về danh sách 15 nhóm chat
  And Hệ thống thực hiện Batch Upsert vào bảng "zalo_groups" theo unique key "(tenant_id, account_id, external_group_id)"
  And Cập nhật các trường: name, avatar_url, total_members, is_admin, invite_link
  And Trả về HTTP Status 200 OK kèm thông tin tổng số nhóm đã đồng bộ: 15
```

---

### UC-GRP-02: Đồng Bộ & Quét Chi Tiết Thành Viên Nhóm (Scan Group Members for Lead Gen)
- **Actor:** Nhân viên Marketing / Nhân viên Bán hàng.
- **Mục tiêu:** Cào toàn bộ danh sách thành viên công khai của nhóm để lưu trữ và phục vụ phân tích tệp khách hàng tiềm năng.

#### Kịch bản BDD:
```gherkin
Scenario: Khởi tạo phiên quét thành viên nhóm thành công
  Given Nhóm Zalo "GRP_100" thuộc tài khoản "ACC_01" tồn tại trong DB
  And Không có phiên quét nào của nhóm đang ở trạng thái "IN_PROGRESS"
  When Nhân viên gọi "POST /api/v1/zalo-groups/GRP_100/scan-members"
  Then Hệ thống tạo mới một bản ghi trong bảng "zalo_group_scans" với trạng thái "IN_PROGRESS"
  And Hệ thống đẩy background job "job.zalo.group.scan" vào worker queue
  And Trả về HTTP Status 202 Accepted kèm thông tin "scan_id"

Scenario: Worker xử lý cào thành viên và lưu dữ liệu
  Given Background worker nhận job quét cho "scan_id"
  When Worker gọi RPC "GetGroupMembers" qua ZCA Gateway Client
  Then Gateway trả về mảng 500 thành viên gồm: zalo_uid, display_name, avatar_url, role
  And Worker thực hiện Batch Upsert vào bảng "zalo_group_members"
  And Worker lưu snapshot kết quả vào bảng "zalo_scanned_members" với trạng thái "NEW"
  And Cập nhật bản ghi "zalo_group_scans": total_found = 500, status = "COMPLETED", completed_at = NOW()
  And Ghi nhận audit log "ZALO_GROUP_SCAN_COMPLETED"
```

---

### UC-GRP-03: Chuyển Đổi Thành Viên Quét Thành CRM Leads (Ingest Leads into Customer BC)
- **Actor:** Nhân viên Sales / Marketing.
- **Mục tiêu:** Nạp tập thành viên đã quét từ nhóm Zalo vào danh bạ `contacts`/`leads` của phân hệ Customer.

#### Kịch bản BDD:
```gherkin
Scenario: Ingest danh sách quét thành Lead CRM có chọn lọc
  Given Phiên quét "SCAN_99" đã hoàn tất với 200 thành viên
  When Người dùng gọi "POST /api/v1/zalo-group-scans/SCAN_99/ingest-leads" kèm danh sách filter:
    { "lead_status": "NEW", "tag_ids": ["TAG_ZALO_REAL_ESTATE"] }
  Then Hệ thống kiểm tra từng thành viên:
    | Trường hợp | Hành động nghiệp vụ |
    | Zalo UID đã tồn tại trong CRM | Gắn thêm Tag và ghi nhận Activity Timeline "Found in Group Zalo" |
    | Zalo UID chưa tồn tại | Tạo mới Contact với type = "LEAD", nguồn = "ZALO_GROUP" |
  And Đánh dấu "is_lead_converted = true" trong bảng "zalo_scanned_members"
  And Trả về kết quả: { "total_processed": 200, "created": 150, "merged": 50 }
```

---

### UC-GRP-04: Gửi Tin Nhắn Nhóm Có Kiểm Soát (Controlled Group Outbound Message)
- **Actor:** Nhân viên CSKH / Chiến dịch tự động hóa.
- **Mục tiêu:** Gửi tin nhắn dạng văn bản hoặc đính kèm ảnh vào nhóm chat Zalo, đảm bảo tuân thủ quyền hạn nhóm và hạn mức an toàn.

#### Kịch bản BDD:
```gherkin
Scenario: Từ chối gửi tin nếu nhóm chặn thành viên thường
  Given Nhóm "GRP_VIP" cấu hình "only_admin_can_chat = true"
  And Tài khoản Zalo "ACC_01" có vai trò "MEMBER" trong nhóm này
  When Nhân viên yêu cầu "POST /api/v1/zalo-groups/GRP_VIP/send"
  Then Hệ thống từ chối và trả về lỗi HTTP 403 Forbidden
  And Error Code là "GROUP_PERMISSION_DENIED" kèm thông báo "Chỉ trưởng/phó nhóm mới được phép gửi tin nhắn"

Scenario: Gửi tin nhắn thành công có áp dụng Jitter delay
  Given Tài khoản "ACC_01" có quyền gửi tin vào nhóm "GRP_COMMUNITY"
  And Lần gửi tin gần nhất vào nhóm này cách đây hơn 35 giây
  When Nhân viên gửi tin nhắn nội dung "Thông báo lịch bảo trì hệ thống"
  Then Hệ thống điều phối gọi RPC "SendGroupMessage" qua ZCA Gateway
  And ZCA Gateway gửi tin qua socket Zalo Web thành công
  And Lưu bản ghi vào bảng messages của Bounded Context Conversation
  And Ghi nhận audit log "GROUP_MESSAGE_SENT"
```

---

## 3. Kiến Trúc Tương Tác Giữa Các Lớp (Clean DDD)

```
[REST Client / Frontend]
        │
        ▼ (HTTP 1.22+ ServeMux)
[internal/channel/interfaces/http/zalo/groups_handler.go]
        │
        ▼ (Command / Query Bus)
[internal/channel/application/zalo/commands/scan_group_handler.go]
        │
        ├─────────────────────────────────────────────────┐
        ▼                                                 ▼
[internal/channel/domain/zalo/zalo_group.go]    [ZaloPersonalGatewayClient]
(Enforce Roles & RateLimit Invariants)          (Connect-RPC sang Node.js Gateway)
        │                                                 │
        ▼                                                 ▼
[internal/channel/infrastructure/zalo/]        [ZCA Gateway Node.js Daemon]
(PostgreSQL: zalo_groups, zalo_group_scans)    (Thao tác trực tiếp Zalo Web Protocol)
        │
        ▼ (Event Dispatcher)
[internal/customer/application/lead/commands/ingest_group_leads.go]
(Đồng bộ và Deduplicate vào Customer Contacts / Leads)
```

---

## 4. DDL & Schema Database Chuẩn Hóa

```sql
-- 1. Bảng quản lý Nhóm Zalo
CREATE TABLE IF NOT EXISTS zalo_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    external_group_id VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    total_members INT DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{"only_admin_can_chat": false, "approval_required": false}'::jsonb,
    invite_link TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_zalo_groups_tenant_acc_ext UNIQUE (tenant_id, account_id, external_group_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_groups_tenant_acc ON zalo_groups (tenant_id, account_id);

-- 2. Bảng quản lý Thành viên Nhóm Zalo
CREATE TABLE IF NOT EXISTS zalo_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    group_id UUID NOT NULL REFERENCES zalo_groups(id) ON DELETE CASCADE,
    member_zalo_uid VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    role VARCHAR(32) DEFAULT 'member', -- 'admin', 'deputy', 'member'
    is_friend BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_zalo_group_members_unique UNIQUE (group_id, member_zalo_uid)
);

CREATE INDEX IF NOT EXISTS idx_zalo_group_members_uid ON zalo_group_members (member_zalo_uid);

-- 3. Bảng quản lý Phiên quét Lead Gen từ Nhóm
CREATE TABLE IF NOT EXISTS zalo_group_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES zalo_groups(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    total_found INT DEFAULT 0,
    total_converted INT DEFAULT 0,
    error_message TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 4. Bảng lưu trữ chi tiết các thành viên quét được từ phiên
CREATE TABLE IF NOT EXISTS zalo_scanned_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES zalo_group_scans(id) ON DELETE CASCADE,
    member_zalo_uid VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    phone_number VARCHAR(32) DEFAULT '',
    gender VARCHAR(16) DEFAULT 'unknown',
    is_lead_converted BOOLEAN DEFAULT FALSE,
    contact_id UUID, -- Liên kết sang Customer Bounded Context
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_scanned_members_scan ON zalo_scanned_members (scan_id);
```

---

## 5. Gateway Client RPC Contract (Go Interface)

```go
package zalo

import "context"

// ZaloPersonalGroupGatewayClient định nghĩa RPC contract giao tiếp với ZCA Daemon
type ZaloPersonalGroupGatewayClient interface {
    // GetGroups lấy toàn bộ danh sách nhóm mà tài khoản đang tham gia
    GetGroups(ctx context.Context, accountID string) ([]ZaloGroupDTO, error)
    
    // GetGroupMembers cào danh sách thành viên công khai của nhóm
    GetGroupMembers(ctx context.Context, accountID string, externalGroupID string) ([]ZaloGroupMemberDTO, error)
    
    // SendGroupMessage gửi tin nhắn văn bản / media vào nhóm
    SendGroupMessage(ctx context.Context, accountID string, externalGroupID string, msg GroupMessagePayload) (string, error)
    
    // ApproveGroupMember duyệt thành viên đang chờ vào nhóm (khi tài khoản là Admin/Deputy)
    ApproveGroupMember(ctx context.Context, accountID string, externalGroupID string, userUIDs []string) error
}
```
