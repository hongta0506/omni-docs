# Conversation & Media Bounded Context — Nghiệp Vụ & BDD User Stories

> Tài liệu mô tả các kịch bản nghiệp vụ trọng yếu của Hộp thư hội thoại đa kênh (**Omni Unified Inbox**), Quản lý tin nhắn 2 chiều, Outbox Pattern, Deduplication, Cursor Pagination, và Xử lý tài sản truyền thông đa phương tiện.

---

## 1. Danh Mục Tác Nhân (Actors)

| Actor | Vai Trò & Trách Nhiệm |
|---|---|
| **Customer (Khách hàng)** | Người dùng cuối nhắn tin qua Zalo cá nhân, Zalo OA, Telegram, Facebook Messenger, WhatsApp. |
| **Sales / Support Agent (Tư vấn viên)** | Nhân viên trực tổng đài chat, gửi nhận tin nhắn, tài liệu, chốt đơn từ hội thoại. |
| **Channel Gateway Daemon** | Tiến trình chạy nền kết nối với các API/MTProto/Protocol của kênh (Zalo, Telegram, Meta). |
| **Conversation Outbox Worker** | Worker nền quét bảng Outbox để dispatch tin nhắn outbound tới đúng Gateway kênh. |
| **Media Processor Service** | Dịch vụ ngầm nén ảnh, tạo thumbnail, đóng watermark bản quyền và tải lên Cloud Object Storage. |

---

## 2. Danh Sách User Stories & BDD Scenarios

### US-CONV-01: Ingestion & Chống Duplicate Tin Nhắn Đa Kênh (Idempotency Ingestion)
- **As a** hệ thống Omni Inbox
- **I want to** chỉ lưu và phát sóng tin nhắn inbound một lần duy nhất dù Gateway retry nhiều lần
- **So that** khách hàng và nhân viên không bị nhiễu loạn thông tin trùng lặp.

#### Scenario 1: Tiếp nhận tin nhắn mới từ Zalo Gateway thành công
- **Given** Khách hàng `ZaloUID: 12345` gửi tin nhắn văn bản "Báo giá cho tôi" qua Gateway Zalo tài khoản `0988888888`
- **And** `ChannelMsgID: "zmsg_999"` chưa từng tồn tại trong hệ thống (Redis key `msg:dedup:0988888888:zmsg_999` trống)
- **When** Gateway đẩy sự kiện `ChannelMessageReceivedEvent` tới `internal/conversation`
- **Then** Hệ thống lưu `ChannelMsgID` vào Redis với TTL = 24 giờ
- **And** Tạo bản ghi `Message` với trạng thái `Delivered`, cập nhật `LastMessageAt` và `UnreadCount += 1` trên `Conversation`
- **And** Phát sự kiện WebSocket `chat.message.received` tới các Sales phụ trách hội thoại trong < 50ms.

#### Scenario 2: Chặn tin nhắn trùng lặp khi Gateway retry do mạng chập chờn
- **Given** Tin nhắn `ChannelMsgID: "zmsg_999"` đã được xử lý và ghi nhận vào Redis
- **When** Gateway Zalo gặp timeout mạng và phát lại `ChannelMessageReceivedEvent` với cùng `ChannelMsgID: "zmsg_999"`
- **Then** Hệ thống phát hiện key trùng trong Redis
- **And** Trả về mã thành công `ACK (Already Processed)` cho Gateway ngay lập tức
- **And** Không tạo thêm Message trong cơ sở dữ liệu, không tăng `UnreadCount`, không phát lại WebSocket.

---

### US-CONV-02: Gửi Tin Nhắn Outbound Đảm Bảo Qua Transactional Outbox
- **As a** Nhân viên tư vấn
- **I want to** bấm gửi tin nhắn outbound tức thì mà không bị gián đoạn hay mất dữ liệu nếu kết nối kênh mạng xã hội bị gián đoạn
- **So that** tiến độ tư vấn liên tục và tin nhắn chắc chắn sẽ được gửi đi khi kênh khôi phục.

#### Scenario 1: Gửi tin nhắn thành công qua Outbox
- **Given** Nhân viên đang mở hội thoại Zalo của khách hàng
- **When** Nhân viên gõ "Dạ em gửi anh thông tin ạ" và nhấn Gửi
- **Then** Hệ thống mở DB Transaction ghi:
  1. Tạo `Message` với trạng thái `Pending`.
  2. Tạo `OutboxEvent` chứa payload tin nhắn, đích đến là Gateway Zalo.
  3. Cập nhật `LastMessageAt` của `Conversation`.
- **And** Trả về HTTP 200 kèm DTO Message cho giao diện để hiển thị trạng thái "Đang gửi" (Đồng hồ cát)
- **And** Worker nền đọc Outbox, gọi Gateway Zalo gửi tin, Gateway trả về `zmsg_1001`
- **And** Cập nhật `Message` thành `Sent`, đính kèm `ChannelMsgID`, bắn WebSocket cập nhật UI thành "Đã gửi" (1 dấu tích).

#### Scenario 2: Xử lý khi kênh đích gặp sự cố (Tài khoản Zalo bị checkpoint/disconnect)
- **Given** Tài khoản Zalo của doanh nghiệp vừa bị ngắt kết nối
- **When** Outbox Worker gửi tin nhắn outbound sang Channel Gateway và nhận lỗi `ErrChannelDisconnected`
- **Then** Worker thực hiện retry theo cơ chế Exponential Backoff (tối đa 3 lần)
- **And** Nếu sau 3 lần vẫn lỗi, cập nhật trạng thái `Message` thành `Failed` kèm lý do lỗi
- **And** Phát sự kiện WebSocket `chat.message.failed` để UI hiển thị icon đỏ (Dấu chấm than cảnh báo gửi thất bại cho Sales).

---

### US-CONV-03: Lịch Sử Tin Nhắn Cursor-Based Hiệu Năng Cao
- **As a** Kỹ sư hệ thống & Nhân viên trực chat
- **I want to** cuộn xem lịch sử tin nhắn hàng triệu bản ghi mà tốc độ phản hồi luôn dưới 30ms
- **So that** không làm quá tải CPU cơ sở dữ liệu và không bị hiện tượng lệch trang (pagination shift) khi có tin nhắn mới đổ về liên tục.

#### Scenario 1: Tải trang đầu tiên của hội thoại
- **Given** Hội thoại có 200,000 tin nhắn
- **When** Client gửi yêu cầu `GET /api/v1/conversations/:id/messages?limit=30`
- **Then** Repository truy vấn PostgreSQL sử dụng `WHERE conversation_id = ? ORDER BY sent_at DESC, id DESC LIMIT 30`
- **And** Trả về danh sách 30 tin nhắn cùng `next_cursor` được mã hóa Base64 từ `(sent_at, id)` của tin nhắn thứ 30.

#### Scenario 2: Cuộn lên tải trang kế tiếp bằng Cursor
- **Given** Client đã có `next_cursor` từ trang trước
- **When** Client gửi yêu cầu `GET /api/v1/conversations/:id/messages?cursor=eyJzZW50X2F0IjoiMjAyNi0...&limit=30`
- **Then** Repository decode cursor và thực hiện truy vấn seek: `WHERE conversation_id = ? AND (sent_at, id) < (?, ?) ORDER BY sent_at DESC, id DESC LIMIT 30`
- **And** Cơ sở dữ liệu quét trực tiếp B-Tree Index composite `(conversation_id, sent_at DESC, id DESC)` với Index Scan 0 cost, không duyệt tuần tự (Sequential Scan).

---

### US-CONV-04: Đóng Dấu Bản Quyền (Watermark) & Nén Ảnh Trước Khi Gửi Kênh
- **As a** Quản trị viên & Nhân viên bán hàng
- **I want** ảnh chụp sản phẩm hoặc bảng giá khi gửi cho khách qua Zalo/FB phải tự động đóng dấu logo chống cướp khách
- **So that** bảo vệ thương hiệu và số điện thoại hotline trên từng bức ảnh trao đổi.

#### Scenario 1: Upload và tự động áp watermark theo cấu hình Tenant
- **Given** Tenant đã bật cấu hình `WatermarkConfig`: Logo góc dưới bên phải, độ mờ 35%, kèm số hotline
- **When** Nhân viên tải ảnh bảng giá dung lượng 8MB lên hội thoại
- **Then** Hệ thống tiếp nhận file, lưu file gốc vào Object Storage riêng
- **And** Gọi `MediaProcessor` nén dung lượng ảnh xuống < 1.5MB (đáp ứng giới hạn upload của Zalo/Telegram)
- **And** Áp watermark logo và hotline lên ảnh đã nén
- **And** Tạo bản ghi `MediaAsset` với URL ảnh đã đóng dấu và URL thumbnail để gửi qua chat.

---

### US-CONV-05: Thu Hồi Tin Nhắn 2 Chiều (Message Recall)
- **As a** Nhân viên tư vấn
- **I want to** thu hồi một tin nhắn vừa gửi nhầm thông tin hoặc nhầm giá
- **So that** khách hàng trên Zalo/WhatsApp không đọc được nội dung sai sót.

#### Scenario 1: Thu hồi tin nhắn trong thời hạn cho phép
- **Given** Tin nhắn outbound đã gửi cách đây 2 phút (trong ngưỡng cho phép 60 phút của kênh)
- **When** Nhân viên bấm "Thu hồi tin nhắn"
- **Then** Hệ thống kiểm tra quyền sở hữu của nhân viên
- **And** Tạo Outbox Event yêu cầu Gateway phát lệnh thu hồi tới máy chủ Zalo/WhatsApp
- **And** Cập nhật trạng thái `Message` trong CRM thành `Recalled`, nội dung đổi thành "Tin nhắn đã được thu hồi"
- **And** Bắn sự kiện WebSocket `chat.message.recalled` cập nhật tức thời giao diện các bên.

#### Scenario 2: Chặn thu hồi khi quá thời hạn cho phép của kênh
- **Given** Tin nhắn đã gửi từ 24 giờ trước
- **When** Nhân viên yêu cầu thu hồi tin nhắn
- **Then** Hệ thống từ chối yêu cầu và trả về lỗi `ErrMessageRecallTimeExceeded`
- **And** Giữ nguyên nội dung và trạng thái tin nhắn.
