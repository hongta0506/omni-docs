# CHAT-FILTER-AND-ACTIONS-SPEC.md — Đặc tả Kỹ thuật Hệ thống Lọc Hội thoại & Action (Filter Bar + Filter Sidebar)

## 1. Bối cảnh & Vấn đề
- Hệ thống chat hiện tại hiển thị:
  1. **ConversationFilterBar**: 4 quick pills: "Chưa đọc" (`unread`), "Chưa rep" (`unanswered`), "Đình trệ" (`stuck`), "Sẵn sàng" (`ready`).
  2. **ConversationFilterSidebar**: Các nhóm lọc sâu:
     - Auto-tag: "Hoạt động" (`active`), "Sẵn sàng chốt" (`ready`), "Đình trệ" (`stuck`), "Nguội" (`cold`).
     - Tin nhắn: "Chưa trả lời" (`unanswered`), "Bot trả lời (No Sale)" (`bot_no_sale`), "Sale đã trả lời" (`sale_replied`).
     - Điểm & Trạng thái: Điểm tiềm năng (`scoreMin`, `scoreMax`), Tier (`scoreTier`), Trạng thái KH (`stages`), Thời gian đình trệ (`stuckDuration`).
     - Thời gian: Tin nhắn cuối (`lastMessageWithin`), Cờ tương tác (`customerWaitingReply`, `saleWaitingReply`).
     - Sự kiện sắp tới: Sinh nhật 7 ngày (`birthdayWithin7d`), Lịch hẹn 24h (`appointmentWithin24h`), Hẹn quá hạn (`appointmentOverdue`).
     - Sale phụ trách: Tôi (`self`), Tất cả (`all`), Chưa giao (`unassigned`).
     - Tương tác: Đang nóng lên (`hot`), Xuất sắc (`champion`), Ổn định (`stable`), Đang nguội (`cooling`), Lạnh (`cold`).
- **Nguyên nhân lỗi:**
  1. Backend `GET /api/v1/conversations` trong `ListConversations` (`handler.go`) chỉ parse `page`, `limit`, `threadType`, `accountId`, `search`, bỏ qua toàn bộ query params lọc còn lại.
  2. DTO trả về cho mỗi conversation thiếu các thuộc tính quan trọng: `isReplied` (để frontend đếm và lọc chưa rep), `contact.leadScore` (để frontend đếm và lọc khách sẵn sàng/tiềm năng), `friendship.stuckSince` (để tính đình trệ), và `friendship.autoTags`.
  3. Endpoint `GET /api/v1/conversations/event-counts` trả về `counts` tổng thay vì struct `{ birthday, appointmentSoon, appointmentOverdue, msgUnanswered, msgBotNoSale, msgSaleReplied }`.
  4. Endpoint `GET /api/v1/conversations/sidebar-tags` trả về `[]string` dạng mảng thay vì cấu trúc object `{ crmTags: [...], zaloTags: [...] }`.
  5. Frontend lọc client-side fallback chưa đồng bộ hoàn chỉnh khi filter được bấm.

## 2. Giải pháp Kỹ thuật End-to-End

### 2.1 Backend (Omni Core)
1. **Repository & Query Layer (`internal/conversation`):**
   - Mở rộng `ListConversationsParams` và `ListConversationsQuery` hỗ trợ:
     - `Unread`, `Unreplied`, `Stuck`, `Ready`
     - `AutoTagsAny`
     - `ScoreMin`, `ScoreMax`, `ScoreTier`
     - `Stages`
     - `StuckDuration`
     - `LastMessageWithin`
     - `CustomerWaitingReply`, `SaleWaitingReply`
     - `BirthdayWithin7d`, `AppointmentWithin24h`, `AppointmentOverdue`
     - `AssignedUserID`
     - `EngagementPattern`
     - `MessageReplyState`
     - `FolderID`, `Tab`
   - Triển khai SQL / Bun ORM dynamic WHERE clause trong `ListConversations` repository:
     - `unread`: `c.unread_count > 0`
     - `unreplied` / `customerWaitingReply`: tin nhắn cuối cùng gửi bởi `customer` / `contact` và chưa có phản hồi từ `agent` / `self`.
     - `ready`: `EXISTS (SELECT 1 FROM contacts ct WHERE ct.id = c.contact_id AND ct.lead_score >= 80)`
     - `stuck`: `c.last_message_at IS NOT NULL AND c.last_message_at < NOW() - INTERVAL '3 days'`
     - `autoTagsAny`:
       - `active`: tin nhắn cuối trong 24 giờ (`c.last_message_at >= NOW() - INTERVAL '24 hours'`).
       - `ready`: `lead_score >= 80`.
       - `stuck`: không tương tác > 3 ngày.
       - `cold`: không tương tác 15-60 ngày (`c.last_message_at <= NOW() - INTERVAL '15 days'`).
     - `messageReplyState`:
       - `unanswered`: tin cuối từ `customer` / `contact` và chưa có tin trả lời.
       - `bot_no_sale`: tin cuối sau khách chỉ do bot/hệ thống trả lời.
       - `sale_replied`: tin cuối từ agent/nhân viên.
     - `scoreMin` / `scoreMax` / `scoreTier`: lọc theo `contacts.lead_score`.
     - `stages`: lọc theo `contacts.status`.
     - `birthdayWithin7d`: trích xuất ngày sinh từ `contacts.metadata` hoặc `channel_profiles.metadata`.
     - `assignedUserId`: lọc theo `c.assigned_to` hoặc `contacts.assigned_user_id`.
     - `folderId`: JOIN `conversation_folder_mappings` hoặc `account_folders`.
     - `tab`: lọc theo `c.metadata->>'tab'`.
2. **DTO Serialization (`handler.go`):**
   - Bổ sung `isReplied` (boolean), `lastMessageSenderType`.
   - Bổ sung `contact.leadScore` và `contact.status` lấy từ bảng `contacts`.
   - Bổ sung `friendship.stuckSince` và `friendship.autoTags` tính toán chính xác theo thời gian `last_message_at`.
3. **Event Counts & Sidebar Tags Endpoints:**
   - `GET /api/v1/conversations/event-counts`: Trả về đúng JSON struct:
     ```json
     {
       "birthday": 0,
       "appointmentSoon": 0,
       "appointmentOverdue": 0,
       "msgUnanswered": 0,
       "msgBotNoSale": 0,
       "msgSaleReplied": 0
     }
     ```
   - `GET /api/v1/conversations/sidebar-tags`: Trả về:
     ```json
     {
       "crmTags": ["VIP", "Khách mới", "Tiềm năng"],
       "zaloTags": []
     }
     ```

### 2.2 Frontend (Omni Web)
- Kiểm tra `use-inbox-filters.ts` và `ConversationFilterSidebar.vue`, đảm bảo các event click gán đúng state và trigger refetch.
- Kiểm tra tính toán client-side cho count badge và đồng bộ với API.

### 2.3 Phân rã & Mapping Số đếm Chưa đọc (Unread Count Mapping)
- Chi tiết đặc tả phân rã số đếm chưa đọc giữa **Group (Nhóm)**, **Cá nhân (1-1)**, **BOT tele (Bot bán hàng)**, **Chính (Hộp thư chính)** và **Ưu tiên (Priority)** được quy định chi tiết tại tài liệu [CHAT-UNREAD-COUNT-MAPPING-SPEC.md](./CHAT-UNREAD-COUNT-MAPPING-SPEC.md).

### 2.4 Tab Lọc "BOT tele" (Telegram Bot Bán Hàng)
- **Vị trí UI:** Đặt ngay cạnh tab "Nhóm" trên thanh `ConversationFilterBar.vue` (Thứ tự: `Cá nhân` → `Nhóm` → `BOT tele` → `Chính` → `Ưu tiên`).
- **Mục tiêu nghiệp vụ:** Gom toàn bộ các cuộc hội thoại xuất phát từ Bot bán hàng Telegram (`channel = 'telegram'` có cờ Bot hoặc kênh `telegram_bot`) về một khu vực riêng biệt. Giúp sale/chủ shop dễ dàng giám sát đơn hàng tự động và tương tác bot mà không bị lẫn vào luồng chat 1-1 hay nhóm chat thảo luận.
- **Điều kiện lọc:** `(channel = 'telegram' AND (metadata->>'isBot' = 'true' OR metadata->>'telegramType' = 'bot')) OR channel = 'telegram_bot'`.
