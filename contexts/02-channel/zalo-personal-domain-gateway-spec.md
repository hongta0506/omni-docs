# Zalo Personal Domain & Gateway Architecture Specification

> **Tài liệu đặc tả kiến trúc, nghiệp vụ Domain, Schema PostgreSQL và Gateway Client RPC cho phân hệ Zalo Personal (Accounts, Friends, Groups, Gateway).**
> **Mục tiêu:** Cung cấp đầy đủ contract cho AI Coding Agents để xóa bỏ triệt để tình trạng code mock/stub trong `omni-core` và `omni-web`.

---

## 1. Phân định Bounded Context & Trách nhiệm

1. **`internal/channel` (Channel & Gateway Context)**:
   - Quản lý phiên Zalo (Account, QR login, Session token/cookies, Uptime, Proxy).
   - Quản lý quan hệ Bạn bè Zalo (`ChannelFriend` / `ZaloFriendNick`).
   - Quản lý Nhóm Zalo (`ZaloGroup`, `ZaloGroupMember`, Quét thành viên/Group scan).
   - Cung cấp Gateway Client (`ZaloPersonalGatewayClient`) kết nối sang ZCA Gateway daemon.
2. **`internal/conversation` (Conversation Context)**:
   - Quản lý cuộc hội thoại (`Conversation`), tin nhắn (`Message`).
   - Khi chat với bạn bè/nhóm Zalo, gọi sang `Channel` hoặc nhận webhook/event từ Gateway để Ensure Conversation và nạp tin nhắn.
3. **`internal/customer` (Customer Context)**:
   - Lưu trữ `Contact` và `Lead` toàn hệ thống.
   - Khi quét nhóm Zalo hoặc đồng bộ bạn bè Zalo, có command ingest thành Contact/Lead trong CRM.

---

## 2. Toàn bộ API Contract Zalo (Chuẩn hóa khớp 100% Frontend & Legacy Fastify)

### 2.1 Quản lý Tài khoản Zalo (Accounts & Session)
| Method | Route | Mô tả nghiệp vụ | Handled In |
|---|---|---|---|
| `GET` | `/api/v1/zalo-accounts` | Danh sách tài khoản Zalo theo tenant | `zalo/accounts_handler.go` |
| `GET` | `/api/v1/zalo-accounts/enriched` | Danh sách tài khoản kèm live status, owner, stats | `zalo/accounts_handler.go` |
| `GET` | `/api/v1/zalo-accounts/stats` | Thống kê số lượng active/qrPending/disconnected | `zalo/accounts_handler.go` |
| `POST`| `/api/v1/zalo-accounts` | Tạo mới tài khoản Zalo (manual/import) | `zalo/accounts_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}` | Lấy chi tiết tài khoản | `zalo/accounts_handler.go` |
| `PATCH`| `/api/v1/zalo-accounts/{id}` | Cập nhật tên, avatar, trạng thái | `zalo/accounts_handler.go` |
| `DELETE`| `/api/v1/zalo-accounts/{id}`| Xóa tài khoản Zalo | `zalo/accounts_handler.go` |
| `POST`| `/api/v1/zalo-accounts/qr/start` | Khởi tạo phiên QR đăng nhập (nhận sessionId, qrUrl) | `zalo/zalo_handler.go` |
| `POST`| `/api/v1/zalo-accounts/qr/confirm`| Xác nhận đăng nhập QR bằng cookies | `zalo/zalo_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/login` | Tạo QR login cho tài khoản đã có | `zalo/accounts_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/login-status` | Kiểm tra trạng thái đăng nhập từ Gateway | `zalo/accounts_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/reconnect` | Reconnect session | `zalo/zalo_handler.go` |
| `POST`| `/api/v1/zalo-accounts/check-phone` | Tra cứu SĐT xem có dùng Zalo không | `zalo/accounts_handler.go` |
| `POST`| `/api/v1/zalo-accounts/bulk-action`| Thao tác hàng loạt (enable, disable, reconnect) | `zalo/accounts_handler.go` |

### 2.2 Quản lý Bạn bè & Danh bạ Zalo (Friends)
| Method | Route | Mô tả nghiệp vụ | Handled In |
|---|---|---|---|
| `GET` | `/api/v1/friends-db/all-nicks` | Lấy tất cả bạn bè của mọi tài khoản theo tenant | `zalo/friends_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/friends-db` | Danh sách bạn bè đã đồng bộ vào DB của 1 tài khoản | `zalo/friends_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/friends-db/sync` | Kích hoạt đồng bộ danh bạ từ Gateway về DB | `zalo/friends_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/friends` | Alias lấy bạn bè của tài khoản | `zalo/friends_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/friends/recommendations` | Lấy danh sách gợi ý kết bạn | `zalo/friends_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/friends/requests/sent` | Danh sách lời mời kết bạn đã gửi | `zalo/friends_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/friends/requests/{rid}/status`| Trạng thái lời mời kết bạn | `zalo/friends_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/friends/requests` | Gửi lời mời kết bạn qua Zalo UID | `zalo/friends_handler.go` |
| `DELETE`| `/api/v1/zalo-accounts/{id}/friends/{fid}` | Hủy kết bạn (unfriend) | `zalo/friends_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/friends/lookup-by-phone` | Tìm bạn bè bằng SĐT | `zalo/friends_handler.go` |
| `POST`| `/api/v1/friends/{id}/ensure-conversation` | Đảm bảo hội thoại chat tồn tại với bạn bè | `zalo/friends_handler.go` |
| `PATCH`| `/api/v1/friends/{id}` | Cập nhật alias/ghi chú bạn bè | `zalo/friends_handler.go` |
| `GET` | `/api/v1/friends/{id}/tags` | Danh sách tag gắn cho bạn bè | `zalo/friends_handler.go` |
| `POST`| `/api/v1/friends/{id}/tags` | Gắn tag CRM cho bạn bè | `zalo/friends_handler.go` |
| `DELETE`| `/api/v1/friends/{id}/tags/{tagId}` | Gỡ tag khỏi bạn bè | `zalo/friends_handler.go` |
| `GET` | `/api/v1/friends/{id}/score-breakdown` | Điểm lead scoring của bạn bè | `zalo/friends_handler.go` |
| `POST`| `/api/v1/friends/{id}/promote` | Chuyển bạn bè thành Contact CRM chính thức | `zalo/friends_handler.go` |

### 2.3 Quản lý Nhóm Zalo (Groups)
| Method | Route | Mô tả nghiệp vụ | Handled In |
|---|---|---|---|
| `GET` | `/api/v1/zalo-accounts/{id}/groups` | Lấy danh sách nhóm Zalo mà tài khoản tham gia | `zalo/groups_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/groups/{gid}` | Lấy chi tiết nhóm (tên, avatar, tổng thành viên) | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups` | Tạo nhóm Zalo mới | `zalo/groups_handler.go` |
| `PATCH`| `/api/v1/zalo-accounts/{id}/groups/{gid}/name` | Đổi tên nhóm | `zalo/groups_handler.go` |
| `PATCH`| `/api/v1/zalo-accounts/{id}/groups/{gid}/settings`| Đổi cài đặt nhóm (chặn tin nhắn, duyệt thành viên) | `zalo/groups_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/groups/{gid}/members` | Danh sách thành viên nhóm | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups/{gid}/members` | Mời thêm thành viên vào nhóm | `zalo/groups_handler.go` |
| `DELETE`| `/api/v1/zalo-accounts/{id}/groups/{gid}/members`| Xóa thành viên khỏi nhóm | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups/{gid}/deputy` | Bổ nhiệm phó nhóm | `zalo/groups_handler.go` |
| `DELETE`| `/api/v1/zalo-accounts/{id}/groups/{gid}/deputy/{uid}`| Hủy tư cách phó nhóm | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups/{gid}/block` | Chặn thành viên vào nhóm | `zalo/groups_handler.go` |
| `DELETE`| `/api/v1/zalo-accounts/{id}/groups/{gid}/block/{uid}`| Hủy chặn thành viên | `zalo/groups_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/groups/{gid}/blocked` | Danh sách thành viên bị chặn | `zalo/groups_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/groups/{gid}/pending` | Danh sách thành viên chờ duyệt | `zalo/groups_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/groups/{gid}/link` | Lấy link mời tham gia nhóm | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups/{gid}/link/enable`| Kích hoạt link mời nhóm | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups/{gid}/link/disable`| Tắt link mời nhóm | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups/join-link` | Tham gia nhóm qua link mời | `zalo/friends_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/groups/{gid}/ensure-conversation`| Đảm bảo có conversation ID cho nhóm | `zalo/friends_handler.go` |

### 2.4 Quét thành viên Nhóm (Group Scans - Lead Generation)
| Method | Route | Mô tả nghiệp vụ | Handled In |
|---|---|---|---|
| `GET` | `/api/v1/zalo-accounts/{id}/group-scans` | Lịch sử các đợt quét nhóm | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/group-scans` | Bắt đầu quét thành viên các nhóm đã chọn | `zalo/groups_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/group-scans/{scanId}`| Trạng thái đợt quét (`queued`, `running`, `completed`) | `zalo/groups_handler.go` |
| `GET` | `/api/v1/zalo-accounts/{id}/group-scans/{scanId}/members`| Danh sách thành viên đã quét được | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-accounts/{id}/group-scans/{scanId}/cancel` | Hủy đợt quét đang chạy | `zalo/groups_handler.go` |
| `POST`| `/api/v1/zalo-groups/{id}/ingest-leads` | Chuyển thành viên đã quét thành Lead CRM | `groups_handler.go` |

---

## 3. Database Schema Specification (PostgreSQL)

Mọi bảng Zalo Channel bắt buộc có `tenant_id` (Multi-tenant partition) và lưu trữ trong DB PostgreSQL chính.

### 3.1 Bảng `zalo_friends` (Lưu danh bạ bạn bè per Zalo account)
```sql
CREATE TABLE IF NOT EXISTS zalo_friends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    zalo_uid VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    phone VARCHAR(32) DEFAULT '',
    gender VARCHAR(16) DEFAULT 'unknown',
    alias_in_nick VARCHAR(255) DEFAULT '',
    relationship_kind VARCHAR(32) DEFAULT 'friend', -- friend, pending, stranger
    friendship_status VARCHAR(32) DEFAULT 'accepted', -- accepted, pending, rejected
    zalo_labels JSONB DEFAULT '[]'::jsonb,
    crm_tags JSONB DEFAULT '[]'::jsonb,
    lead_score INT DEFAULT 0,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    total_inbound INT DEFAULT 0,
    total_outbound INT DEFAULT 0,
    last_interaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_acc_zuid UNIQUE (tenant_id, account_id, zalo_uid)
);

CREATE INDEX idx_zalo_friends_tenant_acc ON zalo_friends (tenant_id, account_id);
CREATE INDEX idx_zalo_friends_zuid ON zalo_friends (zalo_uid);
```

### 3.2 Bảng `zalo_groups` & `zalo_group_members`
```sql
CREATE TABLE IF NOT EXISTS zalo_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    external_group_id VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    total_members INT DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}'::jsonb,
    invite_link TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_acc_extgroup UNIQUE (tenant_id, account_id, external_group_id)
);

CREATE TABLE IF NOT EXISTS zalo_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    group_id UUID NOT NULL REFERENCES zalo_groups(id) ON DELETE CASCADE,
    member_zalo_uid VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    role VARCHAR(32) DEFAULT 'member', -- admin, deputy, member
    is_friend BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_group_member UNIQUE (group_id, member_zalo_uid)
);
```

### 3.3 Bảng `zalo_group_scans` & `zalo_scanned_members`
```sql
CREATE TABLE IF NOT EXISTS zalo_group_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    account_id UUID NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
    state VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued, running, completed, failed, cancelled
    scope VARCHAR(32) NOT NULL DEFAULT 'selected', -- selected, all
    group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_groups INT DEFAULT 0,
    scanned_groups INT DEFAULT 0,
    member_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS zalo_scanned_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    scan_id UUID NOT NULL REFERENCES zalo_group_scans(id) ON DELETE CASCADE,
    member_uid VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    is_admin BOOLEAN DEFAULT FALSE,
    is_friend BOOLEAN DEFAULT FALSE,
    harvested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingested_lead_id UUID
);
```

---

## 4. Zalo Gateway RPC Interface Standard (`ZaloPersonalGatewayClient`)

AI Agent khi code tích hợp giữa `omni-core` và Gateway (`zca-gateway` / `zca-js`) bắt buộc phải gọi qua interface Go:

```go
type ZaloPersonalGatewayClient interface {
    // Session & Login
    GenerateLoginQR(ctx context.Context, accountID string) (*GenerateQRResponse, error)
    CheckLoginStatus(ctx context.Context, accountID string) (*LoginStatusResponse, error)
    DisconnectSession(ctx context.Context, accountID string) error

    // Contacts & Friends
    SyncFriends(ctx context.Context, accountID string) ([]ZaloFriendDTO, error)
    FindUserByPhone(ctx context.Context, accountID string, phone string) (*ZaloUserDTO, error)
    SendFriendRequest(ctx context.Context, accountID string, zaloUID string, msg string) error
    DeleteFriend(ctx context.Context, accountID string, zaloUID string) error

    // Groups
    ListGroups(ctx context.Context, accountID string) ([]ZaloGroupDTO, error)
    GetGroupMembers(ctx context.Context, accountID string, externalGroupID string) ([]ZaloGroupMemberDTO, error)
    CreateGroup(ctx context.Context, accountID string, name string, memberUIDs []string) (*ZaloGroupDTO, error)
    RenameGroup(ctx context.Context, accountID string, externalGroupID string, name string) error
    AddGroupMembers(ctx context.Context, accountID string, externalGroupID string, memberUIDs []string) error
    RemoveGroupMember(ctx context.Context, accountID string, externalGroupID string, memberUID string) error

    // Messages
    SendTextMessage(ctx context.Context, accountID string, recipientUID string, text string) (*SentMessageDTO, error)
    GetHistoricalMessages(ctx context.Context, accountID string, conversationUID string, limit int) ([]ZaloMessageDTO, error)
}
```

---

## 5. Quy tắc chống Mock cho AI Agent khi cài đặt Zalo

1. **Không trả fake JSON khi thiếu Repo**:
   Nếu `accountRepo == nil` hoặc `friendRepo == nil`, handler phải trả về `503 Service Unavailable` hoặc `500 Internal Error`. CẤM code nhánh `dto := channelAccountDTO{...}` hay `[]map[string]any{...}` bịa data.
2. **Sync Friends**:
   Hàm `SyncZaloFriendsDB` phải gọi `h.zaloClient.SyncFriends(ctx, id)` -> upsert vào bảng `zalo_friends` bằng `friendRepo.UpsertBatch` -> trả về số lượng thực tế đã sync.
3. **Scan Group**:
   Tạo record `zalo_group_scans` trạng thái `running` -> đẩy job vào worker pool chạy ngầm gọi Gateway -> cập nhật số lượng thành viên quét được.
4. **Ensure Conversation**:
   Hàm `EnsureFriendConversation` phải gọi `ConversationService.EnsureByUID` trong BC Conversation để tạo record thật trong `conversations`, không được tự ý `uuid.New().String()`.
