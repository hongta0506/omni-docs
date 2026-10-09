# CROSS-CHANNEL-QUOTE-AND-REPLY-SYNC-SPEC.md — Đặc tả Đồng bộ Tin nhắn Trả lời (Quote / Reply) Đa Kênh

> **Bounded Contexts:** Channel & Gateway (`internal/channel`), Conversation & Realtime (`internal/conversation`)  
> **Nền tảng hỗ trợ:** Zalo (Personal/Group via `zcago`), Telegram (MTProto via `gotd`), WhatsApp (Multi-device via `whatsmeow`)  
> **Trạng thái tài liệu:** Official Engineering Specification

---

## 1. Khả năng Hỗ trợ của 3 Native Libraries

Cả 3 thư viện native đều cung cấp cơ chế Quote / Reply cả 2 chiều (**Inbound sync** khi nhận từ bên ngoài, và **Outbound send** khi nhân viên reply từ hệ thống):

| Nền tảng | Native Go Library | Inbound Quote / Reply Field | Outbound Send Reply Method / Struct |
|---|---|---|---|
| **Zalo** | `pkg/zcago` | `model.TMessage.Quote` (`*TQuote` chứa `OwnerID`, `MsgID`, `CliMsgID`, `Msg`, `FromD`, `CliMsgType`, `Attach`) | `api.SendMessageOptions{Quote: &SendMessageQuote{UIDFrom, MsgID, CliMsgID, Content, ...}}` |
| **Telegram** | `github.com/gotd/td/tg` | `*tg.Message.ReplyTo` (`*tg.MessageReplyHeader` chứa `ReplyToMsgID`, `QuoteText`, `ReplyFrom`) | `&tg.MessagesSendMessageRequest{ReplyTo: &tg.InputReplyToMessage{ReplyToMsgID: id, QuoteText: ...}}` |
| **WhatsApp** | `go.mau.fi/whatsmeow` | `ContextInfo.QuotedMessage` & `ContextInfo.StanzaID`, `ContextInfo.Participant` trong Protobuf `waE2E` | Gán `waE2E.ContextInfo{StanzaID: &targetMsgID, QuotedMessage: targetMsg, Participant: &targetSender}` vào Message gửi đi |

---

## 2. Chuẩn hóa Cấu trúc Dữ liệu Quote (Universal Reply Schema)

Để Frontend (`omni-web`) hiển thị đồng nhất thẻ Reply (`reply-card`) và hỗ trợ tính năng click nhảy tới tin nhắn gốc (`jump-to-reply`), dữ liệu Quote được lưu vào `messages.metadata["quote"]` theo cấu trúc:

```json
{
  "msgId": "string (Channel Message ID hoặc Internal Message UUID)",
  "cliMsgId": "string (nếu có)",
  "content": "string (Nội dung trích dẫn rút gọn)",
  "senderName": "string (Tên người gửi tin nhắn gốc)",
  "uidFrom": "string (Sender ID người được trả lời)",
  "msgType": "text | image | video | file | sticker",
  "ts": "string (timestamp)",
  "channel": "zalo | telegram | whatsapp"
}
```

---

## 3. Kiến trúc Luồng Dữ liệu (Data Flow)

### 3.1 Chiều Inbound (Nhận tin nhắn có Quote từ người dùng)
1. **Zalo Gateway:**
   - `um.Data.Quote` hoặc `gm.Data.Quote` có dữ liệu khác `nil`.
   - Giữ nguyên cấu trúc `TQuote` map vào `metaMap["quote"]` với các field chuẩn: `msgId`, `content` (từ `Quote.Msg`), `senderName` (từ `Quote.FromD`), `uidFrom` (từ `Quote.OwnerID`), `msgType`.
2. **Telegram Gateway:**
   - Khi parse `tg.Message`, kiểm tra `m.ReplyTo`. Nếu là `*tg.MessageReplyHeader`:
     - Trích xuất `replyHeader.ReplyToMsgID`, `replyHeader.QuoteText`.
     - Tìm tin nhắn gốc trong DB theo `channel_message_id = replyHeader.ReplyToMsgID` để lấy `sender_name`, `content`.
     - Đưa vào `metadata["quote"]`.
3. **WhatsApp Gateway:**
   - Trích xuất `ContextInfo` từ `ExtendedTextMessage` / `ImageMessage` / `VideoMessage` / `DocumentMessage`.
   - Nếu `ctxInfo.StanzaID != nil`:
     - Lấy ID tin nhắn gốc `*ctxInfo.StanzaID`, người gửi `*ctxInfo.Participant`.
     - Lấy nội dung trích xuất từ `ctxInfo.QuotedMessage` (text hoặc caption).
     - Đưa vào `metadata["quote"]`.

### 3.2 Chiều Outbound (Nhân viên reply tin nhắn từ CRM Frontend)
1. **Frontend (`omni-web`):**
   - User bấm "Trả lời" trên tin nhắn -> `replyingTo` mang thông tin `Message`.
   - Gửi request `POST /api/v1/conversations/:id/messages` với body chứa:
     ```json
     {
       "content": "Nội dung trả lời",
       "replyMessageId": "UUID của tin nhắn trong DB",
       "mentions": []
     }
     ```
2. **Backend (`omni-core`):**
   - Endpoint `SendMessage` nhận `replyMessageId`.
   - Query DB tìm tin nhắn gốc -> Lấy `channel_message_id`, `sender_id`, `content`.
   - Tạo transaction outbox task kèm `quote` metadata.
   - Dispatcher của từng kênh:
     - **Zalo:** Đẩy `Quote` vào payload `SendMessageQuote`.
     - **Telegram:** Gán `ReplyTo: &tg.InputReplyToMessage{ReplyToMsgID: origMsgID}`.
     - **WhatsApp:** Gán `ContextInfo: &waE2E.ContextInfo{StanzaID: origMsgID}`.
