# Omni Workers — Đặc Tả Chi Tiết 27 Background Workers & Scheduled Jobs

> Tài liệu đặc tả kỹ thuật toàn diện cho **27 Background Workers & Cron Jobs** di trú từ Fastify/Node.js sang **Golang Clean Architecture**.
> Trong Go Core (`omni-core`), các tác vụ nền được tổ chức thành 2 nhóm chính:
> 1. **Scheduled Cron Jobs**: Thực thi chu kỳ định kỳ thông qua Go Runner (`robfig/cron/v3` hoặc Go ticker goroutine).
> 2. **Event / Outbox Workers**: Tiêu thụ message từ hàng đợi (NSQ / Redis Stream / PostgreSQL Transactional Outbox).

---

## 1. Bảng Tổng Hợp 27 Background Workers Theo Bounded Context

| STT | Tên Worker Cũ | File Fastify Cũ | Bounded Context Go | Cơ Chế Kích Hoạt | Chu Kỳ / Queue |
|:---:|---|---|---|---|---|
| **1** | `contact-profile-sync-cron` | `contacts/contact-profile-sync-cron.ts` | `internal/customer` | Scheduled Cron | Mỗi 6 giờ |
| **2** | `interaction-cron` | `contacts/interaction-cron.ts` | `internal/customer` | Scheduled Cron | Mỗi 15 phút |
| **3** | `engagement-cron` | `engagement/engagement-cron.ts` | `internal/customer` | Scheduled Cron | Hàng ngày (01:00 AM) |
| **4** | `inbound-worker` (zalo-bot) | `integrations/providers/zalo-bot/inbound-worker.ts` | `internal/channel` | Queue Consumer | Queue `channel.inbound.zalo-bot` |
| **5** | `inbound-worker` (zalo-oa) | `integrations/providers/zalo-oa/inbound-worker.ts` | `internal/channel` | Queue Consumer | Queue `channel.inbound.zalo-oa` |
| **6** | `token-refresh-cron` | `integrations/providers/zalo-oa/token-refresh-cron.ts` | `internal/channel` | Scheduled Cron | Mỗi 4 giờ |
| **7** | `media-trash-gc-cron` | `media/media-trash-gc-cron.ts` | `internal/conversation` | Scheduled Cron | Hàng ngày (03:00 AM) |
| **8** | `unanswered-reminder-cron` | `notifications/unanswered-reminder-cron.ts` | `internal/conversation` | Scheduled Cron | Mỗi 10 phút |
| **9** | `cron` (ops-radar) | `ops-radar/cron.ts` | `internal/aiagent` | Scheduled Cron | Mỗi 5 phút |
| **10** | `report-job` (ops-radar) | `ops-radar/report-job.ts` | `internal/aiagent` | Scheduled Cron | Hàng ngày (00:30 AM) |
| **11** | `order-sync-cron` | `order-store/order-sync-cron.ts` | `internal/deal` | Scheduled Cron | Mỗi 30 phút |
| **12** | `kiotviet-sync-cron` | `products/kiotviet-sync/kiotviet-sync-cron.ts` | `internal/deal` | Scheduled Cron | Mỗi 1 giờ |
| **13** | `product-sync-cron` | `products/product-sync-cron.ts` | `internal/deal` | Scheduled Cron | Mỗi 2 giờ |
| **14** | `backfill-cron` | `scoring/backfill-cron.ts` | `internal/customer` | Manual / One-off Job | Chạy khi cấu hình rule mới |
| **15** | `decay-cron` | `scoring/decay-cron.ts` | `internal/customer` | Scheduled Cron | Hàng ngày (02:00 AM) |
| **16** | `service-birthday-worker` | `service-api/service-birthday-worker.ts` | `internal/customer` | Scheduled Cron | Hàng ngày (07:00 AM) |
| **17** | `service-friend-outbox-worker`| `service-api/service-friend-outbox-worker.ts` | `internal/serviceapi` | Outbox Poller / Queue | Continuous (poll 2s hoặc NSQ) |
| **18** | `service-message-outbox-worker`| `service-api/service-message-outbox-worker.ts` | `internal/serviceapi` | Outbox Poller / Queue | Continuous (poll 1s hoặc NSQ) |
| **19** | `service-webhook-delivery-worker`| `service-api/service-webhook-delivery-worker.ts`| `internal/serviceapi` | Queue Consumer | Queue `service.webhook.delivery` |
| **20** | `goclaw-agent-sync.job` | `sync/goclaw-agent-sync.job.ts` | `internal/aiagent` | Scheduled Cron | Mỗi 15 phút |
| **21** | `goclaw-user-sync.job` | `sync/goclaw-user-sync.job.ts` | `internal/aiagent` | Scheduled Cron | Mỗi 30 phút |
| **22** | `friend-sync-cron` | `zalo/friend-sync-cron.ts` | `internal/channel` | Scheduled Cron | Mỗi 6 giờ |
| **23** | `group-info-sync-cron` | `zalo/group-info-sync-cron.ts` | `internal/channel` | Scheduled Cron | Mỗi 12 giờ |
| **24** | `group-scan-worker` | `zalo/group-scan-worker.ts` | `internal/channel` | Queue Consumer | Queue `channel.group.scan` |
| **25** | `status-log-checkpoint-cron`| `zalo/status-log-checkpoint-cron.ts` | `internal/channel` | Scheduled Cron | Mỗi 1 phút |
| **26** | `broadcast-worker` | `_ee/automation/workers/broadcast-worker.ts` | `internal/marketing` | Queue Consumer | Queue `marketing.broadcast.dispatch` |
| **27** | `muctieu-invite-worker` | `_ee/automation/workers/muctieu-invite-worker.ts` | `internal/marketing` | Queue Consumer | Queue `marketing.group.invite` |

---

## 2. Đặc Tả Chi Tiết Từng Nhóm Worker

### 2.1 Nhóm Customer & Lead (`internal/customer`)

#### 1. `contact-profile-sync-cron`
* **Mục tiêu**: Đồng bộ metadata mới nhất (tên, avatar, bio) từ các profile kênh về `contacts`.
* **Thuật toán Go**:
  1. Quét các `channel_profiles` có `updated_at > last_sync_time`.
  2. Cập nhật bảng `contacts` cha nếu `full_name` hoặc `avatar_url` của contact đang rỗng.
  3. Batch size: 500 records/lần, dùng `bun.NewSelect().Limit(500)`.

#### 2. `interaction-cron`
* **Mục tiêu**: Cập nhật `last_interaction_at` của Contact dựa trên tin nhắn 2 chiều mới nhất.
* **Tần suất**: Mỗi 15 phút.
* **Xử lý**: Lấy timestamp tin nhắn gửi/nhận gần nhất từ bảng `messages` nhóm theo `contact_id`, cập nhật vào `contacts.last_interacted_at`.

#### 3. `engagement-cron`
* **Mục tiêu**: Tính toán chỉ số gắn kết (Engagement Score) theo ngày.
* **Tần suất**: 01:00 AM hàng ngày.
* **Công thức**: Tổng số tin nhắn khách gửi + số cuộc gọi + số click link trong 24h qua.

#### 14. `backfill-cron` & 15. `decay-cron` (Scoring Engine)
* **`decay-cron`**: Chạy 02:00 AM hàng ngày. Khách hàng không có tương tác sau N ngày sẽ bị giảm điểm:
  $$Score_{new} = \max(0, Score_{current} - DecayRate \times DaysInactive)$$
* **`backfill-cron`**: Kích hoạt khi Admin sửa công thức tính điểm (Scoring Rules), duyệt toàn bộ danh bạ tenant để tính lại điểm tích lũy theo batch.

#### 16. `service-birthday-worker`
* **Mục tiêu**: Quét sinh nhật khách hàng trong ngày (`DATE(dob) = CURRENT_DATE`).
* **Hành động**: Bắn Domain Event `ContactBirthdayReachedEvent` vào Outbox để Marketing BC tự động gửi tin chúc mừng hoặc voucher.

---

### 2.2 Nhóm Channel & Gateway (`internal/channel`)

#### 4 & 5. `inbound-worker` (Zalo Bot & Zalo OA)
* **Cơ chế**: Tiêu thụ webhook payload từ nhà cung cấp Zalo Bot / OA qua NSQ queue.
* **Nghiệp vụ**:
  1. Phân loại sự kiện (`user_send_text`, `user_send_image`, `follow_oa`).
  2. Bóc tách `oa_id` / `bot_id`, chuyển đổi thành `UniversalChannelEvent`.
  3. Đẩy sang `internal/conversation` để lưu tin nhắn và broadcast WebSocket tới UI.

#### 6. `token-refresh-cron` (Zalo OA)
* **Mục tiêu**: Refresh OAuth 2.0 access token của Zalo OA trước khi token 25h hết hạn.
* **Tần suất**: Chạy mỗi 4 giờ. Lọc các token có `expires_at < NOW() + 2 hours`. Gọi endpoint OAuth Zalo để đổi token mới và lưu DB.

#### 22. `friend-sync-cron` & 23. `group-info-sync-cron`
* **Mục tiêu**: Đồng bộ danh bạ bạn bè và thông tin nhóm Zalo cá nhân từ gateway sidecar.
* **Khóa chống trùng**: Dùng Redis Distributed Lock (`SETNX channel:sync:lock:<account_id> 3600s`) để không chạy song song 2 worker cùng lúc trên 1 tài khoản.

#### 24. `group-scan-worker`
* **Cơ chế**: Queue consumer xử lý yêu cầu quét thành viên nhóm Zalo.
* **Nghiệp vụ**: Nhận `group_id`, gửi lệnh sang Zalo sidecar lấy danh sách UID thành viên, đối soát với DB để cập nhật danh bạ khách hàng.

#### 25. `status-log-checkpoint-cron`
* **Mục tiêu**: Heartbeat kiểm tra trạng thái sống của các tài khoản Zalo cá nhân.
* **Tần suất**: Mỗi 1 phút. Nếu tài khoản không gửi ping quá 3 phút, chuyển trạng thái sang `DISCONNECTED`.

---

### 2.3 Nhóm Conversation & Media (`internal/conversation`)

#### 7. `media-trash-gc-cron`
* **Mục tiêu**: Dọn dẹp các tệp media đã bị xóa mềm (`deleted_at IS NOT NULL`) quá 30 ngày.
* **Hành động**: Xóa file vật lý trên S3/MinIO Storage, sau đó xóa vĩnh viễn record trong PostgreSQL.

#### 8. `unanswered-reminder-cron`
* **Mục tiêu**: Giám sát tin nhắn chưa trả lời.
* **Xử lý**: Lọc các cuộc hội thoại có tin nhắn cuối cùng là từ khách hàng (`direction = 'INBOUND'`), chưa được nhân viên phản hồi sau quá 15 phút. Gửi notification nhắc nhở nhân viên phụ trách.

---

### 2.4 Nhóm Deal & E-commerce (`internal/deal`)

#### 11. `order-sync-cron`
* **Mục tiêu**: Đồng bộ trạng thái đơn hàng từ Pancake POS / đối tác vận chuyển.
* **Tần suất**: Mỗi 30 phút. Cập nhật trạng thái `PENDING`, `SHIPPING`, `DELIVERED`, `CANCELLED`.

#### 12. `kiotviet-sync-cron` & 13. `product-sync-cron`
* **Mục tiêu**: Kéo dữ liệu giá và tồn kho sản phẩm từ KiotViet API để cập nhật bảng giá `pricebook`.
* **Idempotency**: Dùng hash MD5 của payload sản phẩm để chỉ cập nhật record khi có sự thay đổi giá hoặc số lượng tồn kho.

---

### 2.5 Nhóm Marketing & Automation (`internal/marketing`)

#### 26. `broadcast-worker` (Gửi tin hàng loạt)
* **Cơ chế**: Tiêu thụ job từ queue `marketing.broadcast.dispatch`.
* **Quy tắc an toàn chống khóa nick**:
  - Gửi qua Zalo cá nhân: Giãn cách 15-30 giây / tin nhắn.
  - Tối đa 200 tin / ngày / 1 tài khoản Zalo.
  - Nếu gặp lỗi checkpoint/captcha từ Zalo, tạm dừng queue của tài khoản đó ngay lập tức (`PauseAccountBroadcast`).

#### 27. `muctieu-invite-worker`
* **Mục tiêu**: Tự động gửi lời mời vào nhóm Zalo mục tiêu cho các khách hàng thỏa mãn tag chiến dịch.

---

### 2.6 Nhóm AI Agent & Knowledge (`internal/aiagent`)

#### 9. `cron` & 10. `report-job` (Ops Radar)
* **Mục tiêu**: Phát hiện bất thường vận hành: tỷ lệ gửi tin lỗi tăng vọt, token AI cạn kiệt, độ trễ API cao.
* **Tần suất**: `cron` chạy mỗi 5 phút; `report-job` tổng hợp báo cáo chỉ số mỗi ngày vào 00:30 AM.

#### 20. `goclaw-agent-sync.job` & 21. `goclaw-user-sync.job`
* **Mục tiêu**: Đồng bộ 2 chiều cấu hình Agent và phân quyền người dùng giữa Omni Core và GoClaw Gateway.

---

### 2.7 Nhóm Service API & External Gateway (`internal/serviceapi`)

#### 17. `service-friend-outbox-worker` & 18. `service-message-outbox-worker`
* **Mô hình**: **Transactional Outbox Pattern**.
* **Luồng xử lý**:
  ```
  App Handler (DB Tx) ➔ Ghi outbox_events ➔ Commit DB
                                                │
  Outbox Worker (Poll / Listen) ◄───────────────┘
         │
         ▼
  Gửi sang Channel Gateway / Network
         │
         ▼
  Đánh dấu outbox_events status = 'PROCESSED' (hoặc FAILED + Retry count)
  ```

#### 19. `service-webhook-delivery-worker`
* **Mục tiêu**: Bắn webhook thông báo sự kiện ra các hệ thống bên thứ 3.
* **Cơ chế Retry**: Exponential backoff (1m, 5m, 15m, 1h, 6h). Tối đa 5 lần retry trước khi đưa vào Dead Letter Queue (DLQ).
