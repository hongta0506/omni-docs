# Conversation & Media Bounded Context (`internal/conversation`)

> Bounded Context phụ trách Hộp thư hội thoại đa kênh (**Omni Unified Inbox**), Quản lý tin nhắn 2 chiều (Messages: văn bản, ảnh, voice, video, files), Thư viện tin nhắn mẫu (Presets / Quick Replies), Thư mục phân loại hội thoại (Chat Folders), Thư viện tài sản đa phương tiện (Media Asset Library) và Đóng dấu bản quyền ảnh (Watermarking).

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/conversation` |
| **Tổng số Endpoints** | **82** (Chat & Folders: 39, Media & Storage: 24, Presets & Notifications: 19) |
| **Aggregate Roots** | `Conversation` (Unified Inbox Thread), `MediaAsset` |
| **Entities con** | `Message` (Rich Media & Payload), `ChatFolder`, `ChatPreset` (Snippet), `WatermarkConfig` |
| **Value Objects** | `ConversationID`, `MessageID`, `ChannelType` (Zalo, Telegram, WhatsApp, FB), `MessageDirection` (Inbound, Outbound), `MessageStatus` (Pending, Sent, Delivered, Read, Failed) |
| **Giao thức** | Connect-RPC (`conversation.v1.ConversationService`), REST (`/api/v1/conversations/*`, `/api/v1/messages/*`, `/api/v1/media/*`), Realtime WebSocket Hub (`/ws/v1/chat`) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`api-mapping.md`](./api-mapping.md) | Ánh xạ toàn bộ 82 endpoints từ Fastify (`chat`, `media`, `system-notifications`) sang Go Handlers, WebSocket events & Connect-RPC. |
| [`repository-port.md`](./repository-port.md) | Đặc tả giao diện Repository tầng Domain: `ValidatedConversation`, `ValidatedMessage`, phân trang Cursor-based và Bun ORM models. |

---

## 3. Kiến Trúc Hộp Thư Đa Kênh (Omni-Channel Inbox Model)

Mỗi cuộc hội thoại (`Conversation`) đại diện cho 1 luồng trao đổi giữa 1 nhân viên/team với 1 Khách hàng (`Contact`) thông qua 1 kênh nhắn tin cụ thể:

```
┌────────────────────────────────────────────────────────┐
│              Conversation (Aggregate Root)            │
│ - ID: ConversationID                                   │
│ - TenantID: TenantID                                   │
│ - ContactID: ContactID                                 │
│ - ChannelType: Zalo | Telegram | WhatsApp | Facebook   │
│ - ChannelAccountID: string (Nick Zalo / Bot / PhoneJID)│
│ - PeerChannelID: string (UID Zalo khách / Phone WA)    │
│ - AssignedUserID: *UserID                              │
│ - Status: Open | Pending | Closed | Spam               │
│ - UnreadCount: int                                     │
│ - LastMessageAt: time.Time                             │
│ - FolderID: *FolderID                                  │
└───────────────────────────┬────────────────────────────┘
                            │ 1
                            ▼ *
┌────────────────────────────────────────────────────────┐
│                   Message (Entity)                     │
│ - ID: MessageID                                        │
│ - Direction: Inbound | Outbound                        │
│ - SenderType: Customer | Staff | Bot | AI              │
│ - ContentType: Text | Image | Video | Audio | File     │
│ - Content: string                                      │
│ - Attachments: []AttachmentVO (URL, Size, MimeType)    │
│ - Status: Pending ➔ Sent ➔ Delivered ➔ Read ➔ Failed    │
│ - ChannelMsgID: string (ID tin nhắn gốc trên Zalo/WA)  │
│ - SentAt: time.Time                                    │
└────────────────────────────────────────────────────────┘
```

---

## 4. Invariants & Business Rules Cốt Lõi

1. **Idempotency Message Ingestion**: Khi nhận tin nhắn inbound từ Gateway (Zalo webhook, Telegram MTProto), hệ thống kiểm tra `(channel_account_id, channel_msg_id)` trong Redis cache. Nếu đã tồn tại, lập tức bỏ qua để chống duplicate tin nhắn khi mạng chập chờn.
2. **Realtime Broadcast Guarantee**: Mọi tin nhắn mới (cả gửi và nhận) sau khi ghi vào PostgreSQL Transaction thành công BẮT BUỘC phải phát tán ngay lập tức qua WebSocket Hub tới tất cả các client đang mở conversation đó.
3. **Cursor-based Pagination**: Do khối lượng tin nhắn cực lớn, cấm tuyệt đối dùng `OFFSET / LIMIT` cho danh sách messages. Bắt buộc dùng Cursor theo `(sent_at, id)`.
4. **Outbox Message Sending**: Khi nhân viên bấm gửi tin nhắn outbound, tin nhắn được tạo ở trạng thái `Pending` trong DB transaction kèm 1 bản ghi `outbox_events`. Worker nền sẽ gửi sang Channel Gateway tương ứng và cập nhật trạng thái `Sent`/`Failed`.
