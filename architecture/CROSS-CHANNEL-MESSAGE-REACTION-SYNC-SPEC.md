# CROSS-CHANNEL-MESSAGE-REACTION-SYNC-SPEC.md — Đặc Tả Đồng Bộ Cảm Xúc Tin Nhắn Đa Kênh (Reaction Sync, Backfill & Outbound Dispatch)

> **Bounded Contexts liên quan:**
> - `internal/channel` (BC 2 — Channel & Gateway): Inbound/Outbound adapters cho Zalo (`zcago`), Facebook Messenger (`fbclient`), Telegram (`gotd`), WhatsApp (`whatsmeow`).
> - `internal/conversation` (BC 4 — Conversation & Media): REST Handlers (`SetReaction`, `RemoveReaction`), Realtime WebSocket Hub (`chat:reactions`, `chat.message.reaction_updated`), Message Metadata Persistence.
> - `omni-web` (Frontend): `use-chat.ts` (`normalizeMessage`), `reaction-display.vue`, `message-bubble.vue`.
>
> **Mã đặc tả:** `SPEC-CORE-REACTION-001`  
> **Trạng thái:** OFFICIAL ENGINEERING SPECIFICATION  
> **Áp dụng cho:** GitHub Issues #1411 (Reaction Sync & Backfill)

---

## 1. Bối cảnh & Hiện trạng Vấn đề (Problem Statement)

Hệ thống Omni Core hỗ trợ tính năng thả cảm xúc (Reaction) tin nhắn trên giao diện Web (`omni-web`) và đồng bộ hai chiều với các nền tảng chat bên thứ ba (Zalo Personal, Facebook Messenger, Telegram, WhatsApp).

Qua rà soát thực tế mã nguồn và kiểm toán cơ sở dữ liệu (`messages.metadata->'reactions'`), hệ thống gặp các lỗi cản trở luồng đồng bộ:
1. **Zalo Inbound Backfill**: Khi sync lịch sử hội thoại qua WebSocket (`RequestOldReactions`), Zalo trả về mã lệnh CMD 610/611. Các gói tin phản hồi mang subcmd 0 (`1_610_0`, `1_611_0`) bị router nuốt chửng vào nhánh `default:`. Ngoài ra, tiến trình kéo tin nhắn cũ và kéo reaction cũ chạy song song không đồng bộ, khiến reaction đến trước khi tin nhắn được INSERT vào DB -> câu lệnh truy vấn tin nhắn trả về rỗng và bị drop vĩnh viễn không retry.
2. **Facebook Inbound**: Bộ lắng nghe luồng sự kiện Facebook cá nhân (`internal/channel/infrastructure/facebook/event_listener.go`) khi bắt sự kiện `*channelv1.FbStreamEvent_Reaction` chỉ ghi log thông tin và **hoàn toàn chưa thực hiện lưu DB hay bắn sự kiện WebSocket**.
3. **Telegram Historical Sync**: Khi kéo lịch sử tin nhắn (`MessagesGetHistory` / `ParseInboundTelegramMessage`), trường `msg.Reactions` từ MTProto Telegram bị bỏ qua hoàn toàn, dẫn đến việc chỉ tin nhắn nhận realtime mới có reaction, còn tải lại trang hoặc kéo lịch sử bị mất trắng reaction.
4. **WhatsApp Historical Sync**: Hàm `SyncMessages` trong repository chỉ lưu nội dung văn bản thô, chưa trích xuất các phản ứng tin nhắn được lưu trữ.
5. **Zalo Outbound Mismatch**: Khi nhân viên thả reaction từ Web sang Zalo, mã lệnh `AddReaction` gán cứng `"msgType": 1` (tin nhắn văn bản) cho mọi tin nhắn; khi tin nhắn mục tiêu là ảnh (`msgType: 32`), video (`msgType: 22`) hoặc file (`msgType: 30`), API Zalo từ chối xử lý. Khi gỡ reaction, hệ thống gửi chuỗi rỗng dẫn đến lỗi `ErrInvalidReaction`. Toàn bộ lỗi gọi API Zalo đều bị nuốt bởi `_ = ...`.
6. **Lệch chuẩn Schema Frontend/Backend**: DB lưu trữ và socket realtime có sự không nhất quán giữa khóa `emoji` và `reaction`. Hàm `normalizeMessage` ở frontend chỉ đọc `reaction.emoji`, dẫn đến lỗi `undefined` khi dữ liệu trả về theo chuẩn outbox cũ.

---

## 2. Kiến Trúc Đồng Bộ & Luồng Dữ Liệu Chuẩn (Architecture & Pipeline)

```
                                  ┌────────────────────────┐
                                  │   Third-Party Network  │
                                  │ (Zalo, FB, Tele, WA)   │
                                  └───────────┬────────────┘
                                              │ Inbound Socket / Webhook / History Sync
                                              ▼
                             ┌─────────────────────────────────┐
                             │    Channel Inbound Adapters     │
                             │  - Zalo: handleZaloReaction     │
                             │  - FB: event_listener.go        │
                             │  - Tele: ParseInboundMessage    │
                             │  - WA: rawMsg.GetReaction()     │
                             └────────────────┬────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         [ Live Realtime Event ]                           [ Backfill / History Sync ]
                      │                                               │
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │  Resolve Message in DB  │                     │  Buffered Cache / Retry │
         │  by channel_message_id, │                     │  Wait for message row   │
         │  cliMsgId, zaloMsgIdNum │                     │  insertion completion   │
         └────────────┬────────────┘                     └────────────┬────────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                             ┌─────────────────────────────────┐
                             │       Bun ORM DB Updater        │
                             │   UPDATE messages               │
                             │   SET metadata = jsonb_set(...) │
                             │   (atomic add/replace/remove)   │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │       Socket.IO Gateway         │
                             │ Broadcast 'chat:reactions' &    │
                             │ 'chat.message.reaction_updated' │
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │       omni-web (Frontend)       │
                             │  normalizeMessage() fallback:   │
                             │  emoji: r.emoji || r.reaction   │
                             │  Reactive UI updates bubble     │
                             └─────────────────────────────────┘
```

---

## 3. Quy Chuẩn Schema Dữ Liệu (Reaction Contract)

### 3.1 Cấu Trúc Lưu Trữ Trong Database (`messages.metadata->'reactions'`)

Mỗi phần tử trong danh sách `reactions` được lưu dưới dạng JSON Object đồng nhất:

```json
{
  "reactions": [
    {
      "emoji": "❤️",
      "reaction": "❤️",
      "userId": "4794800195489700540",
      "reactorId": "4794800195489700540",
      "userName": "Trung",
      "reactorName": "Trung",
      "reactorSource": "zalo",
      "source": "zalo",
      "action": "add",
      "totalCount": 1,
      "reacted": false,
      "updatedAt": "2026-10-27T07:10:36Z"
    }
  ]
}
```

**Quy tắc bất biến (Invariants):**
- Cả hai khóa `emoji` và `reaction` **bắt buộc luôn tồn tại** và có giá trị ký tự hiển thị (Unicode Emoji như `❤️`, `👍`, `😆`, `😮`, `😭`, `😡`).
- `reactorId` và `userId` là định danh tài khoản người thả reaction trên nền tảng mạng xã hội hoặc ID người dùng Omni.
- `reacted = true` nếu người thả reaction chính là nhân viên Omni (dựa theo `userID` trong JWT claims hoặc cờ `isSelf`).

### 3.2 Gói Tin Phát Sóng WebSocket Realtime (`chat:reactions`)

Được phát sóng qua `SocketIOHub.BroadcastChatMessage` tới phòng hội thoại:

```json
[
  "chat:reactions",
  {
    "event": "chat:reactions",
    "conversationId": "2c64fd7b-2ff3-4278-bd4f-eb097393c123",
    "messageId": "36d0c0a1-fdff-4d7a-b872-8e42d5a82cb0",
    "msgId": "36d0c0a1-fdff-4d7a-b872-8e42d5a82cb0",
    "reactions": [
      {
        "emoji": "❤️",
        "reaction": "❤️",
        "userId": "4794800195489700540",
        "reactorId": "4794800195489700540",
        "userName": "Trung",
        "reactorName": "Trung",
        "source": "zalo",
        "action": "add",
        "totalCount": 1,
        "reacted": false
      }
    ]
  }
]
```

---

## 4. Đặc Tả Triển Khai Chi Tiết Từng Kênh

### 4.1 Kênh Zalo (`zcago` Gateway Driver)

#### A. Router Khắc Phục Bỏ Rơi Lệnh Kéo Lịch Sử (`pkg/zcago/listener/router.go`)
Bổ sung các mã lệnh trả về subcmd 0 của Zalo Server:
```go
// Router lắng nghe cả SubCMD 0 và 1 cho lệnh reaction cũ
case "1_610_0", "1_610_1", "1_611_0", "1_611_1":
    ln.handleOldReactions(ctx, body)
```

#### B. Khắc Phục Lỗi Unmarshal Chặt Kiểu (`pkg/zcago/listener/events/reaction.go`)
Thay thế unmarshal cứng bằng bộ parser linh hoạt (hỗ trợ cả JSON string lẫn numeric timestamp / ID):
```go
type ReactionMessageRef struct {
    GMsgID  FlexibleInt64 `json:"gMsgID"`
    CMsgID  FlexibleInt64 `json:"cMsgID"`
    MsgType int           `json:"msgType"`
}
```

#### C. Khắc Phục Race Condition Giữa Kéo Tin Nhắn & Kéo Reaction (`gateway_client_zcago.go`)
Trong `handleZaloReaction`:
1. Mở rộng điều kiện truy vấn tin nhắn mục tiêu:
   ```go
   q.Where("channel_message_id IN (?) OR metadata->>'cliMsgId' IN (?) OR metadata->>'zaloMsgIdNum' IN (?) OR id::text = ?", ...)
   ```
2. Cơ chế Retry đệm (Buffered Pending Queue): Khi tin nhắn chưa kịp ghi vào bảng `messages` (do goroutine `RequestOldMessages` đang chạy tải media), reaction được đưa vào bộ đệm tạm thời (Redis / In-memory sync map với TTL 60s) và tự động khớp lại khi tin nhắn được INSERT thành công.

#### D. Outbound Reaction Dispatch (`add_reaction.go` & `chat_handler.go`)
1. **Dynamic MsgType Mapping**: Truy vấn loại tin nhắn gốc (`content_type`) từ bảng `messages`. Ánh xạ:
   - Text / Link: `msgType = 1`
   - Photo / Image: `msgType = 32`
   - Video: `msgType = 22`
   - File / Document: `msgType = 30`
   - Voice / Audio: `msgType = 27`
2. **Không nuốt lỗi**: Bắt lỗi từ `AddReaction`, ghi log kiểm toán qua `pkglogger.LogAudit` với mã hành động `ZALO_OUTBOUND_REACTION_FAILED` và trả HTTP 502/400 nếu thất bại.

---

### 4.2 Kênh Facebook Messenger (`event_listener.go`)

Triển khai đầy đủ xử lý sự kiện `*channelv1.FbStreamEvent_Reaction`:
```go
case *channelv1.FbStreamEvent_Reaction:
    r := payload.Reaction
    l.processInboundReaction(ctx, accountExternalID, r)
```

Quy trình trong `processInboundReaction`:
1. Tìm tin nhắn mục tiêu trong DB theo `channel_message_id = r.GetMessageId()`.
2. Trích xuất ký tự emoji từ chuỗi phản ứng của Facebook (ví dụ: `like` -> `👍`, `love` -> `❤️`, `haha` -> `😆`, `wow` -> `😮`, `sad` -> `😭`, `angry` -> `😡`).
3. Cập nhật mảng `reactions` trong `messages.metadata`. Nếu Facebook gửi reaction rỗng hoặc sự kiện gỡ, loại bỏ mục reaction của người gửi tương ứng.
4. Bắn gói tin `chat:reactions` qua `SocketIOHub.BroadcastChatMessage` để cập nhật UI người dùng.

---

### 4.3 Kênh Telegram (`native_gotd_client.go`)

Khắc phục mất reaction khi kéo lịch sử tin nhắn:
1. Trong hàm `ParseInboundTelegramMessage`:
   Kiểm tra nếu tin nhắn MTProto có trường `msg.Reactions` (`*tg.MessageReactions`):
   ```go
   if msg.Reactions != nil && len(msg.Reactions.Results) > 0 {
       var reactionsList []map[string]any
       for _, r := range msg.Reactions.Results {
           emoji := extractTelegramReactionEmoji(r.Reaction)
           reactionsList = append(reactionsList, map[string]any{
               "emoji":      emoji,
               "reaction":   emoji,
               "count":      r.Count,
               "totalCount": r.Count,
               "source":     "telegram",
               "reacted":    r.Chosen,
           })
       }
       metadata["reactions"] = reactionsList
   }
   ```
2. Đảm bảo toàn bộ tin nhắn được tải về từ `MessagesGetHistory` đều giữ nguyên các phản ứng đã có.

---

### 4.4 Kênh WhatsApp (`native_whatsmeow_client.go` & `postgres_repository.go`)

1. Giữ vững cơ chế bắt sự kiện realtime qua `rawMsg.GetReactionMessage()` đã có.
2. Nâng cấp hàm `SyncMessages` trong `postgres_repository.go`: khi lấy lịch sử từ `gatewayPort.FetchHistory`, trích xuất trường `Reaction` của tin nhắn cũ và lưu vào `metadata->'reactions'`.

---

### 4.5 Giao Diện Người Dùng (`omni-web`)

Cập nhật hàm chuẩn hóa tin nhắn `normalizeMessage` tại `omni-web/src/composables/use-chat.ts`:

```typescript
if (Array.isArray(message.reactions) && message.reactions.length > 0) {
  const counts = new Map<string, number>();
  for (const r of message.reactions) {
    // Dự phòng an toàn đọc cả emoji lẫn reaction
    const emoji = r.emoji || r.reaction;
    if (!emoji) continue;
    counts.set(emoji, (counts.get(emoji) || 0) + (r.count || r.totalCount || 1));
  }
  normalizedReactions = Array.from(counts.entries()).map(([emoji, count]) => ({
    emoji,
    reaction: emoji,
    count,
  }));
}
```

Khi nhận sự kiện socket `chat:message`, nếu tin nhắn đã tồn tại trên màn hình, tiến hành reconcile và merge mảng `reactions` thay vì ghi đè làm mất danh sách cảm xúc hiện thời.

---

## 5. Ma Trận Kiểm Thử & Tiêu Chí Nghiệm Thu (Acceptance Criteria)

- [ ] **TC-REACTION-01 (Zalo Live Inbound)**: Khách thả tim từ Zalo mobile -> tin nhắn trên `omni-web` lập tức xuất hiện icon ❤️ với bộ đếm đúng, không cần F5.
- [ ] **TC-REACTION-02 (Zalo Backfill Sync)**: Khi tài khoản Zalo kết nối lần đầu hoặc chạy lệnh sync hội thoại, toàn bộ reaction của các tin nhắn cũ được tải về và lưu vào DB.
- [ ] **TC-REACTION-03 (Zalo Media Outbound)**: Nhân viên trên `omni-web` thả reaction vào tin nhắn hình ảnh / file của khách -> Zalo phía khách hàng hiển thị reaction thành công, backend không trả lỗi `ErrInvalidReaction`.
- [ ] **TC-REACTION-04 (Facebook Inbound Live)**: Khách thả reaction trên Messenger -> backend ghi nhận vào DB và phát sóng Socket.IO, hiển thị chuẩn trên `omni-web`.
- [ ] **TC-REACTION-05 (Telegram History Sync)**: Kéo lịch sử tin nhắn Telegram cũ giữ nguyên danh sách emoji reaction của từng tin nhắn.
- [ ] **TC-REACTION-06 (No Silent Swallowing)**: Mọi lỗi thất bại khi gọi API gửi reaction từ kênh thứ ba đều được ghi nhận vào Grafana Loki qua `pkglogger.LogAudit` với đầy đủ `TraceID`, `TenantID`, `ChannelAccountID`.
