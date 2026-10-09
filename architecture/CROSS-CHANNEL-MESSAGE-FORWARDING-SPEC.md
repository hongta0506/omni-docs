# CROSS-CHANNEL-MESSAGE-FORWARDING-SPEC.md — Đặc tả Cơ chế Chuyển tiếp Tin nhắn (Forward Message) Đa Kênh

> **Bounded Contexts:** Conversation & Media (`internal/conversation`), Channel Gateway (`internal/channel`), Frontend (`omni-web`)  
> **Nền tảng hỗ trợ:** Zalo (Personal & Group via `zcago`), Telegram (1-1 & Supergroup via `gotd`), WhatsApp (Multi-device via `whatsmeow`)  
> **Trạng thái tài liệu:** Official Engineering Specification

---

## 1. Hiện trạng & Lỗ hổng Triển khai (Current Implementation Gaps)

### 1.1 Frontend (`omni-web`)
- Đã có UI menu context: `message-context-menu.vue` phát sự kiện `forward`.
- Đã có dialog chọn hội thoại đích: `ForwardDialog` (`forward-dialog.vue`).
- **Lỗi 1 (Payload Mismatch):** `use-chat-operations.ts` gửi payload `{ msgId: "...", targetConversationIds: [...] }`. Tuy nhiên Backend `chat_handler.go` yêu cầu JSON tag là `messageId` (`req.MessageID`), dẫn đến backend luôn nhận `messageId = ""` và báo lỗi `400 invalid message id`.

### 1.2 Backend (`omni-core`)
- Endpoint `POST /api/v1/conversations/{id}/forward` trong `chat_handler.go` chỉ mới sao chép bản ghi tin nhắn trong PostgreSQL nội bộ (`h.repo.SaveMessage`).
- **Lỗi 2 (Missing Channel Outbound Dispatch):** Không hề gọi Outbound Dispatcher để chuyển tiếp tin nhắn qua Zalo, Telegram hay WhatsApp thực tế.
- **Lỗi 3 (Missing Inbound Forwarded Metadata):** Khi đối tác bên ngoài gửi tin nhắn chuyển tiếp vào, 3 native gateway chưa trích xuất cờ `is_forwarded` và thông tin tác giả gốc (`forwarded_from`).

---

## 2. Khả năng Hỗ trợ của 3 Native Libraries

| Nền tảng | Native Go Library | Outbound Forwarding API / Struct | Inbound Forwarded Event Detection |
|---|---|---|---|
| **Zalo** | `pkg/zcago` | `api.ForwardMessage(ctx, threadIDs, threadType, payload)` | `msg.MsgType == "chat.forward"` hoặc `msg.Data.PropertyExt` |
| **Telegram** | `github.com/gotd/td/tg` | `*tg.MessagesForwardMessagesRequest{FromPeer, ID: []int{msgID}, ToPeer}` | `msg.FwdFrom != nil` (`*tg.MessageFwdHeader`) |
| **WhatsApp** | `go.mau.fi/whatsmeow` | Gửi lại message kèm `waE2E.ContextInfo{IsForwarded: true, ForwardingScore: 1}` | `ctxInfo.GetIsForwarded() == true` |

---

## 3. Kiến trúc Luồng Dữ liệu (Data Flow)

### 3.1 Luồng Outbound Forward (Nhân viên bấm Chuyển tiếp trên CRM)
```
[ Frontend omni-web ]
   │  POST /api/v1/conversations/{id}/forward
   │  { messageId: "<uuid>", targetConversationIds: ["<convId1>", "<convId2>"] }
   ▼
[ Conversation BC: ChatHTTPHandler.ForwardMessage ]
   │  1. Lấy thông tin tin nhắn gốc và kiểm tra quyền
   │  2. Vòng lặp các hội thoại đích:
   │     - Tạo bản ghi tin nhắn mới trong DB (metadata: { is_forwarded: true, forwarded_from: orig.SenderName })
   │     - Tạo Task Transactional Outbox đẩy vào NSQ topic channel.outbound
   ▼
[ Channel Dispatcher (Zalo / Telegram / WhatsApp) ]
   ├─► Zalo:      zcago.ForwardMessage(...)
   ├─► Telegram:  client.API().MessagesForwardMessages(...)
   └─► WhatsApp:  cli.SendMessage(..., waE2E.Message{ContextInfo: {IsForwarded: true}})
```

### 3.2 Luồng Inbound Forward (Khách gửi tin nhắn chuyển tiếp)
- Gateways nhận diện cờ chuyển tiếp và lưu vào `messages.metadata`:
  ```json
  {
    "is_forwarded": true,
    "forwarded_from": "Tên tác giả gốc",
    "forwarded_date": 1791169497
  }
  ```
- Frontend `special-message-renderer.vue` hiển thị thẻ chuyển tiếp (`forwarded-card`) với nhãn "Đã chuyển tiếp".
