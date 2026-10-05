# Zalo Group Member Scraping & Automation Specification

> **ĐẶC TẢ TỰ ĐỘNG HÓA QUÉT THÀNH VIÊN NHÓM ZALO (ZALO GROUP MEMBER SCRAPING & LEAD INGESTION AUTOMATION)**  
> **Mã tài liệu:** `SPEC-ARCH-ZALO-006`  
> **Hệ thống liên quan:**  
> - `omni-core` (Golang Clean DDD - Bounded Context `internal/channel`, `internal/customer`, `internal/marketing`)  
> - `ZaloCRM` (Legacy Node.js/Fastify/Prisma - Reference Engine & Worker)  
> - `zcago` (Native Go Zalo Client Engine)  
> **Trạng thái:** APPROVED SPECIFICATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, code identifiers, database schemas, API routes giữ nguyên Tiếng Anh)  

---

## 1. Bối Cảnh Nghiệp Vụ & Mục Tiêu (Business Context & Goals)

### 1.1 Bài toán nghiệp vụ
Trong kinh doanh B2B/B2C tại Việt Nam, các cộng đồng khách hàng tiềm năng tập trung phần lớn trong các Nhóm Zalo (Zalo Groups/Communities). Việc thu thập danh sách thành viên từ các nhóm mà tài khoản nhân viên/tài khoản bán hàng đang tham gia là bước khởi đầu quan trọng cho chu trình:
1. **Quét thành viên (Group Member Scraping):** Tự động bóc tách danh sách UID, Display Name, Avatar, trạng thái kết bạn (`isFriend`).
2. **Làm giàu dữ liệu & Định danh Khách hàng (Lead Ingestion):** Tự động chuyển đổi thành viên nhóm thành Contact/Lead trong hệ thống CRM (`internal/customer`).
3. **Kích hoạt kịch bản tiếp thị (Marketing Automation):** Nuôi dưỡng lead qua Automation Sequences (`internal/marketing`) như gửi lời mời kết bạn tự động theo lịch trình, gửi tin nhắn chào mừng, phân loại Tag.

### 1.2 Thách thức kỹ thuật & Cơ chế bảo vệ (Anti-Checkpoint)
- **Zalo Rate Limit & Checkpoint:** Gọi API quét dồn dập khiến Zalo chặn tài khoản (banned/checkpoint session).
- **Roster Incomplete (Group Community lớn):** Zalo API giới hạn trả danh sách thành viên đầy đủ một lần đối với nhóm trên 500-1000 người, đòi hỏi cơ chế nhận diện `truncated / partial`.
- **Chunking & Batching:** Cần chia nhỏ truy vấn hồ sơ (`GetUserSummaryInfo`) thành từng đợt (chunks 50 members) kèm jitter delay.
- **Idempotency & Upsert:** Hỗ trợ quét lặp lại mà không làm trùng lặp dữ liệu, không ghi đè mất nhãn/lead score của contact đã tồn tại.

---

## 2. Luồng Nghiệp Vụ & Sơ Đồ Tuần Tự (Architecture & Sequence Flow)

```
[Frontend / Client]            [Omni-Core Channel BC]          [Zalo Personal / zcago]        [Customer / Lead BC]
         |                                |                               |                           |
         | 1. POST /zalo-groups/scan      |                               |                           |
         |------------------------------->| 2. GetAllGroups()             |                           |
         |                                |------------------------------>|                           |
         |                                |<------------------------------|                           |
         |                                | 3. Batch GetGroupInfo (chunk 50)                          |
         |                                | 4. Upsert `zalo_groups`       |                           |
         |                                |    Upsert group conversations |                           |
         | 5. Return group list           |                               |                           |
         |<-------------------------------|                               |                           |
         |                                |                               |                           |
         | 6. POST /zalo-groups/scan-members                              |                           |
         |    (account_id, group_ids[])   |                               |                           |
         |------------------------------->| 7. Create `zalo_group_scans`  |                           |
         |                                |    status = 'pending'         |                           |
         |<-------------------------------|                               |                           |
         |    202 Accepted (scan_id)      |                               |                           |
         |                                | 8. Async Worker: scanOneGroup |                           |
         |                                |------------------------------>|                           |
         |                                |    GetGroupInfo(groupID)      |                           |
         |                                |<------------------------------|                           |
         |                                | 9. Extract MemberIDs / MemVerList                         |
         |                                | 10. Chunk 50 UIDs: GetUserSummaryInfo                     |
         |                                |------------------------------>|                           |
         |                                |<------------------------------|                           |
         |                                | 11. Upsert `zalo_scanned_members`                         |
         |                                | 12. Upsert `channel_profiles`                             |
         |                                | 13. Auto Lead Ingestion       |-------------------------->|
         |                                |                               |    Upsert `contacts`      |
         |                                | 14. Update scan progress      |    Emit LeadCreatedEvent  |
         |                                |     (scannedGroups, members)  |                           |
         | 15. GET scan progress/members  |                               |                           |
         |------------------------------->|                               |                           |
         |<-------------------------------|                               |                           |
```

---

## 3. Đặc Tả Dữ Liệu (Database Schema Contract)

### 3.1 Bảng `zalo_group_scans` (Quản lý phiên quét nhóm)
Lưu trạng thái và tiến độ của một đợt quét tự động:

```sql
CREATE TABLE IF NOT EXISTS zalo_group_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    account_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, running, completed, partial, failed, cancelled
    group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Danh sách external group ID cần quét
    total_groups INT NOT NULL DEFAULT 0,
    scanned_groups INT NOT NULL DEFAULT 0,
    member_count INT NOT NULL DEFAULT 0,
    friend_count INT NOT NULL DEFAULT 0,
    resume_cursor VARCHAR(64) DEFAULT NULL,        -- Group ID cuối cùng xử lý xong (phục vụ retry/resume)
    error_message TEXT DEFAULT NULL,
    started_at TIMESTAMPTZ DEFAULT NULL,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_zalo_group_scans_acc_status ON zalo_group_scans(account_id, status);
CREATE INDEX idx_zalo_group_scans_org ON zalo_group_scans(org_id);
```

### 3.2 Bảng `zalo_scanned_members` (Thành viên nhóm đã quét)
Lưu trữ danh sách thành viên trích xuất từ các nhóm:

```sql
CREATE TABLE IF NOT EXISTS zalo_scanned_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES zalo_group_scans(id) ON DELETE CASCADE,
    account_id VARCHAR(64) NOT NULL,
    group_id VARCHAR(64) NOT NULL,
    member_id VARCHAR(64) NOT NULL,                -- Zalo UID của thành viên
    display_name VARCHAR(255) DEFAULT NULL,
    zalo_name VARCHAR(255) DEFAULT NULL,
    avatar_url TEXT DEFAULT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'member',    -- creator, admin, member
    is_friend BOOLEAN NOT NULL DEFAULT FALSE,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_scan_group_member UNIQUE (account_id, group_id, member_id)
);

CREATE INDEX idx_zalo_scanned_members_scan ON zalo_scanned_members(scan_id);
CREATE INDEX idx_zalo_scanned_members_member ON zalo_scanned_members(member_id);
```

---

## 4. Đặc Tả REST API Endpoints

### 4.1 Quét Danh Sách Nhóm Của Tài Khoản
- **Endpoint:** `POST /api/v1/zalo-groups/scan`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
```json
{
  "accountId": "84901234567"
}
```
- **Response 200 OK:**
```json
{
  "total": 12,
  "groups": [
    {
      "id": "g_789456123",
      "name": "Cộng Đồng Đầu Tư BĐS Hà Nội",
      "avatarUrl": "https://s120-ava-talk.zadn.vn/...",
      "memberCount": 450,
      "creatorId": "u_11223344"
    }
  ]
}
```

### 4.2 Kích Hoạt Tiến Trình Quét Thành Viên Nhóm (Batch Scan)
- **Endpoint:** `POST /api/v1/zalo-groups/scan-members`
- **Request Body:**
```json
{
  "accountId": "84901234567",
  "groupIds": ["g_789456123", "g_987654321"]
}
```
- **Response 202 Accepted:**
```json
{
  "scanId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending",
  "totalGroups": 2
}
```

### 4.3 Kiểm Tra Trạng Thái & Tiến Độ Phiên Quét
- **Endpoint:** `GET /api/v1/zalo-groups/scans/{scanId}`
- **Response 200 OK:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "running",
  "totalGroups": 2,
  "scannedGroups": 1,
  "memberCount": 450,
  "friendCount": 18,
  "resumeCursor": "g_789456123",
  "startedAt": "2026-10-05T08:00:00Z"
}
```

### 4.4 Lấy Danh Sách Thành Viên Đã Quét
- **Endpoint:** `GET /api/v1/zalo-groups/scans/{scanId}/members`
- **Query Params:** `page=1&limit=50&role=all&isFriend=false`
- **Response 200 OK:**
```json
{
  "items": [
    {
      "memberId": "u_55667788",
      "groupId": "g_789456123",
      "displayName": "Nguyễn Văn A",
      "avatarUrl": "https://s120-ava-talk.zadn.vn/...",
      "role": "member",
      "isFriend": false
    }
  ],
  "total": 450,
  "page": 1,
  "limit": 50,
  "totalPages": 9,
  "hasNext": true
}
```

### 4.5 Hủy Phiên Quét
- **Endpoint:** `POST /api/v1/zalo-groups/scans/{scanId}/cancel`
- **Response 200 OK:**
```json
{
  "scanId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "cancelled"
}
```

---

## 5. Chiến Lược Chống Checkpoint & Quy Chuẩn Xử Lý (Anti-Checkpoint & Rate Limiting)

1. **Tuần Tự Hóa Theo Tài Khoản (Per-Account Queue Manager):**
   - Mọi tương tác gọi sang Zalo API của cùng một `account_id` phải đi qua hàng đợi điều phối tuần tự (`queueMgr.Execute`). Không quét song song nhiều nhóm trên cùng 1 tài khoản.
2. **Chunking Kích Thước 50 (Batch Member Profile):**
   - API lấy chi tiết profile `GetUserSummaryInfo` bắt buộc chunk tối đa 50 UIDs một lần.
3. **Jitter Delay & Throttling:**
   - Giữa mỗi chunk 50 members: Delay từ 300ms đến 800ms.
   - Giữa các nhóm khác nhau: Delay từ 1.5s đến 3.0s để giải tỏa tần suất request lên Zalo Gateway.
4. **Xử Lý Lỗi Từng Phần (Partial vs Terminal Failure):**
   - Nếu 1 nhóm gặp lỗi (ví dụ bị admin nhóm kick ra ngoài): Ghi nhận lỗi của nhóm đó, cập nhật `resume_cursor` và tiếp tục quét nhóm kế tiếp. Kết thúc phiên quét với trạng thái `partial`, KHÔNG làm đứt gãy toàn bộ job.
5. **Auto Lead Ingestion:**
   - Khi quét được thành viên mới:
     - Tạo bản ghi trong `channel_profiles` (loại `zalo_personal`, relationship `none` hoặc `friend`).
     - Tự động sinh `contacts` nếu chưa có liên kết.
     - Phát sinh Domain Event `LeadDiscoveredEvent` để module `internal/marketing` đưa vào Automation Sequences (ví dụ chiến dịch kết bạn tự động `friend_request_sequence`).
