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
Trong kinh doanh B2B/B2C tại Việt Nam, các cộng đồng khách hàng tiềm năng tập trung phần lớn trong các Nhóm Zalo (Zalo Groups/Communities). Việc thu thập danh sách thành viên từ các nhóm là bước khởi đầu thu Lead tự động vào phễu kinh doanh (Lead Generation):
1. **Quét thành viên (Group Member Scraping):** Tự động bóc tách danh sách UID, Display Name, Avatar, trạng thái kết bạn (`isFriend`).
2. **Làm giàu dữ liệu & Nạp Lead vào Lead Pool (Lead Ingestion):** Tự động chuyển đổi thành viên nhóm thành Lead mới (`contacts.status = 'lead'`, `leads.stage = 'new'`) trong Bể Lead của CRM (`internal/customer`). Tuyệt đối không nâng cấp thành Customer khi chưa có giao dịch (ADR-ARCH-009).
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