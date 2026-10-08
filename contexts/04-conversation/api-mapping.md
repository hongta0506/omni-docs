# Conversation & Media — Ánh Xạ Endpoint Chi Tiết (82 Routes)

> Tài liệu đối chiếu chi tiết 82 API routes từ module `chat`, `media`, `system-notifications` sang **Go Clean CQRS Handlers**, **WebSocket Events** và **Connect-RPC Services**.

---

## 0. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Flat HTTP Handlers per resource (`/api/v1/conversations/*`, `/api/v1/messages/*`, `/api/v1/media/*`):
  - `conversations_handler.go`: CRUD hội thoại, lọc trạng thái, gán tư vấn viên.
  - `messages_handler.go`: Lịch sử tin nhắn cursor-based, gửi tin, thu hồi tin nhắn.
  - `chat_presets_handler.go`: Quản lý tin nhắn mẫu (quick replies / snippets).
  - `chat_folders_handler.go`: Quản lý thư mục phân loại hội thoại.
  - `media_handler.go`: Upload tập tin, quản lý thư mục media, watermark ảnh.
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `ConversationService` cho Channel Daemons, Outbox Workers và AI Agent.
- **`interfaces/ws/` (WebSocket Hub)**: Endpoint `/ws/v1/chat` full-duplex stream tin nhắn và trạng thái realtime.

---

## 1. Module Chat & Tin Nhắn Đa Kênh (39 Endpoints)

| HTTP Method | Route Cũ (Fastify) | Go Handler (CQRS) | Connect-RPC Service & Method | Mô Tả Nghiệp Vụ |
|---|---|---|---|---|
| `GET` | `/api/v1/conversations` | `queries.ListConversationsHandler` | `ConversationService.ListConversations` | Lấy danh sách hội thoại theo bộ lọc (kênh, chưa đọc, tag, folder) |
| `POST` | `/api/v1/conversations` | `commands.CreateConversationHandler` | `ConversationService.CreateConversation` | Khởi tạo cuộc hội thoại mới với khách hàng |
| `GET` | `/api/v1/conversations/:id` | `queries.GetConversationHandler` | `ConversationService.GetConversation` | Xem chi tiết cuộc hội thoại và thông tin profile khách |
| `DELETE` | `/api/v1/conversations/:id` | `commands.DeleteConversationHandler` | `ConversationService.DeleteConversation` | Xóa mềm cuộc hội thoại (`status = 'deleted'`) |
| `PUT` | `/api/v1/conversations/:id/assign` | `commands.AssignConversationHandler` | `ConversationService.AssignConversation` | Gán cuộc hội thoại cho nhân viên tư vấn |
| `PUT` | `/api/v1/conversations/:id/status` | `commands.UpdateConversationStatusHandler` | `ConversationService.UpdateStatus` | Đổi trạng thái (Open, Closed, Spam, Archive) |
| `POST` | `/api/v1/conversations/:id/read` | `commands.MarkAsReadHandler` | `ConversationService.MarkAsRead` | Đánh dấu đã đọc toàn bộ tin nhắn trong hội thoại |
| `POST` | `/api/v1/conversations/:id/unread` | `commands.MarkAsUnreadHandler` | `ConversationService.MarkAsUnread` | Đánh dấu chưa đọc để xử lý sau |
| `GET` | `/api/v1/conversations/:id/messages` | `queries.ListMessagesCursorHandler` | `ConversationService.ListMessages` | Lấy danh sách tin nhắn (phân trang Cursor-based) |
| `POST` | `/api/v1/conversations/:id/messages` | `commands.SendMessageHandler` | `ConversationService.SendMessage` | Gửi tin nhắn văn bản outbound tới khách qua Gateway |
| `POST` | `/api/v1/conversations/:id/messages/media` | `commands.SendMediaMessageHandler` | `ConversationService.SendMediaMessage` | Gửi tin nhắn đính kèm ảnh, video, tệp tin |
| `DELETE` | `/api/v1/messages/:id` | `commands.RecallMessageHandler` | `ConversationService.RecallMessage` | Thu hồi / gỡ tin nhắn đã gửi trên kênh Zalo/WhatsApp |
| `POST` | `/api/v1/messages/:id/pin` | `commands.PinMessageHandler` | `ConversationService.PinMessage` | Ghim tin nhắn quan trọng trong hội thoại |
| `DELETE` | `/api/v1/messages/:id/pin` | `commands.UnpinMessageHandler` | `ConversationService.UnpinMessage` | Bỏ ghim tin nhắn |
| `POST` | `/api/v1/conversations/:id/messages/:msg_id/reactions` | `commands.SendReactionHandler` | `ConversationService.SendReaction` | Thả/cập nhật biểu cảm cảm xúc (emoji reaction) trên tin nhắn |
| `DELETE` | `/api/v1/conversations/:id/messages/:msg_id/reactions` | `commands.RemoveReactionHandler` | `ConversationService.RemoveReaction` | Gỡ biểu cảm cảm xúc đã thả |
| `GET` | `/api/v1/conversations/:id/pinned` | `queries.ListPinnedMessagesHandler` | `ConversationService.ListPinnedMessages` | Lấy danh sách tin nhắn được ghim |
| `GET` | `/api/v1/conversations/folders` | `queries.ListFoldersHandler` | `ConversationService.ListFolders` | Danh sách thư mục phân loại chat cá nhân/chung |
| `POST` | `/api/v1/conversations/folders` | `commands.CreateFolderHandler` | `ConversationService.CreateFolder` | Tạo thư mục chat mới |
| `PUT` | `/api/v1/conversations/folders/:id` | `commands.UpdateFolderHandler` | `ConversationService.UpdateFolder` | Đổi tên, màu sắc hoặc thứ tự thư mục |
| `DELETE` | `/api/v1/conversations/folders/:id` | `commands.DeleteFolderHandler` | `ConversationService.DeleteFolder` | Xóa thư mục chat |
| `PUT` | `/api/v1/conversations/:id/folder` | `commands.MoveToFolderHandler` | `ConversationService.MoveToFolder` | Chuyển hội thoại vào thư mục |
| `GET` | `/api/v1/chat/presets` | `queries.ListPresetsHandler` | `ConversationService.ListPresets` | Danh sách tin nhắn mẫu (trả lời nhanh / snippets) |
| `POST` | `/api/v1/chat/presets` | `commands.CreatePresetHandler` | `ConversationService.CreatePreset` | Tạo tin nhắn mẫu mới (hỗ trợ biến `{name}`, `{phone}`) |
| `PUT` | `/api/v1/chat/presets/:id` | `commands.UpdatePresetHandler` | `ConversationService.UpdatePreset` | Cập nhật nội dung tin nhắn mẫu |
| `DELETE` | `/api/v1/chat/presets/:id` | `commands.DeletePresetHandler` | `ConversationService.DeletePreset` | Xóa tin nhắn mẫu |
| `GET` | `/api/v1/chat/search` | `queries.SearchMessagesHandler` | `ConversationService.SearchMessages` | Tìm kiếm toàn văn (Full-text search) tin nhắn |
| `POST` | `/api/v1/chat/forward` | `commands.ForwardMessageHandler` | `ConversationService.ForwardMessage` | Chuyển tiếp tin nhắn sang cuộc hội thoại khác |
| `POST` | `/api/v1/chat/typing` | `commands.SendTypingIndicatorHandler` | `ConversationService.SendTyping` | Gửi tín hiệu đang gõ phím tới UI |
| `GET` | `/api/v1/conversations/:id/timeline` | `queries.GetChatTimelineHandler` | `ConversationService.GetTimeline` | Lịch sử tương tác và ghi chú trong phiên chat |
| `POST` | `/api/v1/conversations/:id/tags` | `commands.AddConversationTagHandler` | `ConversationService.AddTag` | Gắn nhãn phân loại hội thoại |
| `DELETE` | `/api/v1/conversations/:id/tags/:tag_id` | `commands.RemoveConversationTagHandler` | `ConversationService.RemoveTag` | Gỡ nhãn phân loại |
| `POST` | `/api/v1/conversations/batch-assign` | `commands.BatchAssignHandler` | `ConversationService.BatchAssign` | Phân công hàng loạt hội thoại cho sale |
| `POST` | `/api/v1/conversations/batch-read` | `commands.BatchMarkAsReadHandler` | `ConversationService.BatchMarkAsRead` | Đánh dấu đã đọc hàng loạt |
| `POST` | `/api/v1/conversations/batch-archive` | `commands.BatchArchiveHandler` | `ConversationService.BatchArchive` | Lưu trữ hàng loạt hội thoại cũ |
| `GET` | `/api/v1/conversations/unread-count` | `queries.GetTotalUnreadCountHandler` | `ConversationService.GetUnreadCount` | Đếm tổng số tin nhắn chưa đọc của nhân viên |
| `GET` | `/api/v1/conversations/:id/shared-media`| `queries.ListSharedMediaHandler` | `ConversationService.ListSharedMedia` | Trích xuất toàn bộ ảnh, video đã trao đổi trong chat |
| `GET` | `/api/v1/conversations/:id/shared-links`| `queries.ListSharedLinksHandler` | `ConversationService.ListSharedLinks` | Trích xuất toàn bộ link URL đã gửi trong chat |
| `GET` | `/api/v1/conversations/:id/shared-files`| `queries.ListSharedFilesHandler` | `ConversationService.ListSharedFiles` | Trích xuất toàn bộ file tài liệu đã trao đổi |
| `POST` | `/api/v1/conversations/:id/notes` | `commands.AddInternalNoteHandler` | `ConversationService.AddInternalNote` | Thêm ghi chú nội bộ (chỉ nhân viên thấy) |
| `GET` | `/api/v1/conversations/:id/notes` | `queries.ListInternalNotesHandler` | `ConversationService.ListInternalNotes` | Danh sách ghi chú nội bộ của cuộc chat |
| `POST` | `/api/v1/conversations/export` | `commands.ExportChatHistoryHandler` | `ConversationService.ExportChatHistory` | Xuất lịch sử đoạn chat ra file PDF / Excel |
| `GET` | `/api/v1/chat/stats/response-time` | `queries.GetAvgResponseTimeHandler` | `ConversationService.GetAvgResponseTime` | Thống kê tốc độ phản hồi tin nhắn của sale |

---

## 2. Module Media & Quản Lý Tệp Tin Đa Kênh (24 Endpoints)

| HTTP Method | Route Cũ (Fastify) | Go Handler (CQRS) | Connect-RPC Service & Method | Mô Tả Nghiệp Vụ |
|---|---|---|---|---|
| `POST` | `/api/v1/media/upload` | `commands.UploadMediaHandler` | `MediaService.UploadMedia` | Tải tệp lên hệ thống (S3 / MinIO / Local storage) |
| `POST` | `/api/v1/media/upload-chunk` | `commands.UploadChunkHandler` | `MediaService.UploadChunk` | Tải tệp dung lượng lớn theo phân đoạn (Chunked upload) |
| `POST` | `/api/v1/media/upload-complete` | `commands.CompleteChunkUploadHandler` | `MediaService.CompleteChunkUpload` | Hoàn tất ghép file chunk |
| `GET` | `/api/v1/media/:id` | `queries.GetMediaDetailsHandler` | `MediaService.GetMediaDetails` | Xem thông tin chi tiết tệp (kích thước, định dạng, link) |
| `DELETE` | `/api/v1/media/:id` | `commands.DeleteMediaHandler` | `MediaService.DeleteMedia` | Xóa mềm tệp tin chuyển vào thùng rác |
| `GET` | `/api/v1/media` | `queries.ListMediaAssetsHandler` | `MediaService.ListMediaAssets` | Duyệt danh sách thư viện media có bộ lọc |
| `GET` | `/api/v1/media/folders` | `queries.ListMediaFoldersHandler` | `MediaService.ListFolders` | Danh mục thư mục lưu trữ media |
| `POST` | `/api/v1/media/folders` | `commands.CreateMediaFolderHandler` | `MediaService.CreateFolder` | Tạo thư mục lưu media |
| `PUT` | `/api/v1/media/folders/:id` | `commands.UpdateMediaFolderHandler` | `MediaService.UpdateFolder` | Đổi tên hoặc di chuyển thư mục media |
| `DELETE` | `/api/v1/media/folders/:id` | `commands.DeleteMediaFolderHandler` | `MediaService.DeleteFolder` | Xóa thư mục media |
| `POST` | `/api/v1/media/watermark/apply` | `commands.ApplyWatermarkHandler` | `MediaService.ApplyWatermark` | Đóng dấu chìm watermark vào ảnh sản phẩm |
| `GET` | `/api/v1/media/watermark/config` | `queries.GetWatermarkConfigHandler` | `MediaService.GetWatermarkConfig` | Lấy cấu hình logo và vị trí watermark |
| `PUT` | `/api/v1/media/watermark/config` | `commands.UpdateWatermarkConfigHandler` | `MediaService.UpdateWatermarkConfig` | Cập nhật cấu hình watermark ảnh |
| `GET` | `/api/v1/media/trash` | `queries.ListTrashMediaHandler` | `MediaService.ListTrashMedia` | Danh sách media nằm trong thùng rác |
| `POST` | `/api/v1/media/trash/restore/:id` | `commands.RestoreTrashMediaHandler` | `MediaService.RestoreMedia` | Khôi phục tệp từ thùng rác |
| `DELETE` | `/api/v1/media/trash/empty` | `commands.EmptyTrashHandler` | `MediaService.EmptyTrash` | Dọn sạch thùng rác vĩnh viễn |
| `GET` | `/api/v1/media/storage-usage` | `queries.GetStorageUsageHandler` | `MediaService.GetStorageUsage` | Báo cáo dung lượng ổ cứng đã dùng theo tenant |
| `POST` | `/api/v1/media/thumbnails/generate` | `commands.GenerateThumbnailsHandler` | `MediaService.GenerateThumbnails` | Tạo ảnh thu nhỏ (Thumbnail) cho ảnh/video |
| `GET` | `/api/v1/media/download-url/:id` | `queries.GetPresignedDownloadURLHandler` | `MediaService.GetDownloadURL` | Lấy presigned URL tải trực tiếp từ cloud S3 |
| `POST` | `/api/v1/media/compress` | `commands.CompressImageHandler` | `MediaService.CompressImage` | Nén ảnh giảm dung lượng trước khi gửi Zalo |
| `PUT` | `/api/v1/media/:id/rename` | `commands.RenameMediaHandler` | `MediaService.RenameMedia` | Đổi tên tệp tin |
| `POST` | `/api/v1/media/:id/move` | `commands.MoveMediaHandler` | `MediaService.MoveMedia` | Chuyển tệp tin sang thư mục khác |
| `GET` | `/api/v1/media/types-summary` | `queries.GetMediaTypesSummaryHandler` | `MediaService.GetTypesSummary` | Thống kê số lượng theo loại (Image, Video, Doc) |
| `POST` | `/api/v1/media/cleanup-temp` | `commands.CleanupTempMediaHandler` | `MediaService.CleanupTemp` | Dọn dẹp tệp tạm thời sinh ra trong quá trình xử lý |

---

## 3. Module System Notifications & Cảnh Báo (19 Endpoints)

| HTTP Method | Route Cũ (Fastify) | Go Handler (CQRS) | Connect-RPC Service & Method | Mô Tả Nghiệp Vụ |
|---|---|---|---|---|
| `GET` | `/api/v1/system-notifications` | `queries.ListNotificationsHandler` | `NotificationService.ListNotifications` | Danh sách thông báo hệ thống của user |
| `POST` | `/api/v1/system-notifications` | `commands.CreateNotificationHandler` | `NotificationService.CreateNotification` | Tạo thông báo mới (nội bộ hệ thống) |
| `GET` | `/api/v1/system-notifications/:id` | `queries.GetNotificationHandler` | `NotificationService.GetNotification` | Xem chi tiết thông báo |
| `POST` | `/api/v1/system-notifications/:id/read` | `commands.MarkNotificationReadHandler` | `NotificationService.MarkAsRead` | Đánh dấu thông báo đã đọc |
| `POST` | `/api/v1/system-notifications/read-all` | `commands.MarkAllNotificationsReadHandler` | `NotificationService.MarkAllAsRead` | Đánh dấu tất cả thông báo là đã đọc |
| `DELETE` | `/api/v1/system-notifications/:id` | `commands.DeleteNotificationHandler` | `NotificationService.DeleteNotification` | Xóa thông báo |
| `DELETE` | `/api/v1/system-notifications/clear-all` | `commands.ClearAllNotificationsHandler` | `NotificationService.ClearAll` | Xóa toàn bộ thông báo đã đọc |
| `GET` | `/api/v1/system-notifications/unread-count`| `queries.GetNotificationUnreadCountHandler` | `NotificationService.GetUnreadCount` | Đếm số thông báo chuông chưa đọc |
| `GET` | `/api/v1/system-notifications/preferences` | `queries.GetNotificationPrefsHandler` | `NotificationService.GetPreferences` | Cấu hình nhận thông báo (Email, Push, Web) |
| `PUT` | `/api/v1/system-notifications/preferences` | `commands.UpdateNotificationPrefsHandler` | `NotificationService.UpdatePreferences` | Cập nhật tùy chọn thông báo |
| `POST` | `/api/v1/system-notifications/push-token` | `commands.RegisterPushTokenHandler` | `NotificationService.RegisterPushToken` | Đăng ký FCM token cho thông báo mobile |
| `DELETE` | `/api/v1/system-notifications/push-token` | `commands.RemovePushTokenHandler` | `NotificationService.RemovePushToken` | Hủy đăng ký push token khi đăng xuất |
| `POST` | `/api/v1/system-notifications/broadcast` | `commands.BroadcastAdminNotificationHandler`| `NotificationService.Broadcast` | Quản trị viên phát thông báo bảo trì toàn sàn |
| `GET` | `/api/v1/system-notifications/categories` | `queries.ListNotificationCategoriesHandler`| `NotificationService.ListCategories` | Danh mục loại thông báo (Chat, Đơn, Lịch hẹn) |
| `POST` | `/api/v1/system-notifications/test-push` | `commands.TestPushNotificationHandler` | `NotificationService.TestPush` | Bắn thử nghiệm thông báo push tới thiết bị |
| `GET` | `/api/v1/system-notifications/logs` | `queries.ListPushLogsHandler` | `NotificationService.ListLogs` | Nhật ký gửi thông báo và tỷ lệ nhận thành công |
| `PUT` | `/api/v1/system-notifications/:id/archive` | `commands.ArchiveNotificationHandler` | `NotificationService.Archive` | Lưu trữ thông báo |
| `GET` | `/api/v1/system-notifications/templates` | `queries.ListNotificationTemplatesHandler` | `NotificationService.ListTemplates` | Danh sách mẫu thông báo tự động |
| `PUT` | `/api/v1/system-notifications/templates/:id`| `commands.UpdateNotificationTemplateHandler`| `NotificationService.UpdateTemplate` | Sửa nội dung mẫu thông báo |
