# CROSS-CHANNEL-READ-RECEIPTS-AND-DELIVERY-SPEC.md — Đặc tả Cơ chế Bắt Sự kiện Đã Nhận (Delivered) & Đã Xem (Read/Seen) Đa Kênh

> **Bounded Contexts:** Channel & Gateway (`internal/channel`), Conversation & Realtime (`internal/conversation`)  
> **Nền tảng hỗ trợ:** Zalo (Personal/Group via `zcago`), Telegram (MTProto via `gotd`), WhatsApp (Multi-device via `whatsmeow`)  
> **Trạng thái tài liệu:** Official Engineering Specification

---

## 1. Bối cảnh & Khả năng Hỗ trợ của 3 Native Libraries

Hiện tại cả 3 thư viện Go Native in-process đều cung cấp các cấu trúc sự kiện Delivered (Đã nhận / 2 tick xám) và Read/Seen (Đã xem / 2 tick xanh / Avatar người xem) qua WebSocket / Socket kết nối:

| Nền tảng | Native Go Library | Delivered Event (Đã nhận) | Read / Seen Event (Đã xem) | Chi tiết Cấu trúc Event |
|---|---|---|---|---|
| **Zalo** | `pkg/zcago/listener` | `ln.DeliveredMessages()` | `ln.SeenMessages()` | - User: `model.TUserSeenMessage{MsgIDs, DstUID}`<br>- Group: `model.TGroupSeenMessage{MsgIDs, Grid, UID}` |
| **Telegram** | `github.com/gotd/td/tg` | Server ack / Msg ID | `*tg.UpdateReadHistoryOutbox`<br>`*tg.UpdateReadChannelOutbox` | - 1-1 Chat: `Peer`, `MaxID` (vị trí tin nhắn cuối được đọc)<br>- Supergroup/Channel: `ChannelID`, `MaxID` |
| **WhatsApp** | `go.mau.fi/whatsmeow` | `events.Receipt` (`Type == ReceiptTypeDelivered`) | `events.Receipt` (`Type == ReceiptTypeRead` / `ReceiptTypeReadSelf`) | - `MessageIDs []types.MessageID`<br>- `Chat types.JID`<br>- `Sender types.JID`<br>- `Timestamp time.Time` |

---

## 2. Luồng Xử lý Dữ liệu Chuẩn (Data Pipeline Flow)

```
[ Native Gateway Driver ]
   │
   ├─► Zalo:      ln.SeenMessages() / ln.DeliveredMessages()
   ├─► Telegram:  Updates.UpdateReadHistoryOutbox / UpdateReadChannelOutbox
   └─► WhatsApp:  AddEventHandler(*events.Receipt)
   │
   ▼
[ Channel Inbound Event Forwarder ]
   │  Map sang Domain Event: ChannelMessageReadReceiptEvent / ChannelMessageDeliveredEvent
   │  - channel: "zalo" | "telegram" | "whatsapp"
   │  - externalMessageIds: []string
   │  - externalConversationId: string
   │  - readerId / seenBy: string
   │  - seenAt: time.Time
   ▼
[ NSQ Topic: channel.receipt.events ]
   │
   ▼
[ Conversation Receipt Consumer & DB Updater ]
   │  1. Batch UPDATE messages SET status = 'read', read_at = now() 
   │     WHERE external_message_id IN (...) AND status != 'read'
   │  2. Broadcast Socket.IO event "message:receipt" tới client frontend
   ▼
[ Frontend omni-web ]
   UI cập nhật trạng thái tin nhắn (Delivered -> Seen / Read Receipt Icon)
```

---

## 3. Chi tiết Xử lý Từng Nền tảng

### 3.1 Zalo Personal & Group (`zcago`)
- Lắng nghe 2 channels từ listener:
  ```go
  go func() {
      for seenBatch := range listener.SeenMessages() {
          for _, s := range seenBatch {
              // s.MsgIDs: danh sách mã tin nhắn
              // s.SenderUID / s.UID: người vừa xem tin
              // s.ThreadID: id hội thoại hoặc nhóm
          }
      }
  }()
  ```

### 3.2 Telegram MTProto (`gotd`)
- Bổ sung handler vào `telegramUpdateHandlerWrapper` trong `native_gotd_client.go`:
  ```go
  case *tg.UpdateReadHistoryOutbox:
      // up.Peer: đối tác trò chuyện
      // up.MaxID: tin nhắn outbound cuối cùng đã được đối phương đọc
      handleReadReceipt(peerID, up.MaxID)
  case *tg.UpdateReadChannelOutbox:
      // up.ChannelID: nhóm/channel
      // up.MaxID: tin nhắn outbound cuối cùng đã được đọc
      handleReadReceipt(channelID, up.MaxID)
  ```

### 3.3 WhatsApp Multi-Device (`whatsmeow`)
- Bổ sung case `*events.Receipt` trong `attachClientEventHandlers` tại `native_whatsmeow_client.go`:
  ```go
  case *events.Receipt:
      if evt.Type == types.ReceiptTypeRead || evt.Type == types.ReceiptTypeReadSelf {
          // evt.MessageIDs: danh sách ID tin nhắn vừa được đọc
          // evt.Chat.String(): JID cuộc trò chuyện
          // evt.Sender.String(): JID người đọc
          // evt.Timestamp: thời điểm xem
      }
  ```

---

## 4. Kế hoạch Triển khai
1. **Backend (`omni-core`):**
   - Đăng ký nhận sự kiện tại 3 native clients.
   - Dispatch sự kiện qua NSQ hoặc chuyển trực tiếp tới Conversation repository để cập nhật trường `status = 'read'` và `read_at`.
   - Broadcast qua `SocketIOHub` cho client đang mở chat.
2. **Frontend (`omni-web`):**
   - Lắng nghe realtime event `message:receipt` để hiển thị icon 2 tick xanh hoặc avatar người xem bên dưới bong bóng chat.
