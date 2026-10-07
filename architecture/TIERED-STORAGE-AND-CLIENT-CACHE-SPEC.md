# TIERED-STORAGE-AND-CLIENT-CACHE-SPEC.md — Đặc tả Kiến trúc Phân tầng Lưu trữ Tin nhắn & Media SaaS

> **Bounded Contexts:** Conversation & Media (`internal/conversation`), Channel & Gateway (`internal/channel`), Analytics & AI (`internal/aiagent`, `internal/serviceapi`)  
> **Phạm vi tác động:** `omni-core` (Storage Tier, Ingestion Workers, Archiver) & `omni-web` (Browser Edge Cache, IndexedDB Image Vault)  
> **Trạng thái tài liệu:** Architectural RFC & Technical Proposal (Chờ quyết định triển khai)

---

## 1. Bối cảnh & Thách thức Mở rộng SaaS (SaaS Scaling Bottlenecks)

### 1.1 Vấn đề khi lưu trữ thuần PostgreSQL
1. **Phình đĩa (Disk Bloat) & Nghẽn I/O Database:**
   - Hoạt động chat đa kênh (Zalo, Telegram, WhatsApp) sinh ra khối lượng lớn tin nhắn văn bản, reaction, audit logs, metadata JSONB (hàng triệu bản ghi/tháng/tenant).
   - Chỉ mục B-Tree trên các trường `created_at`, `conversation_id`, `external_message_id` phình to vượt dung lượng RAM (Buffer Pool Hit Ratio sụt giảm), dẫn đến nghẽn I/O đĩa cứng khi thực hiện truy vấn phân trang hoặc lọc hội thoại.
2. **Hết hạn URL Media bên thứ 3 (CDN Token Expiry):**
   - Media (ảnh, voice, tệp tin) hiện tại lưu trữ trực tiếp URL CDN của bên thứ 3 (`zadn.vn` của Zalo, Telegram MTProto file link).
   - URL CDN thứ 3 có thời gian sống ngắn (Zalo hết hạn sau 24-72 giờ). Tin nhắn cũ bị lỗi hiển thị ảnh/tệp tin khi xem lại lịch sử.
3. **Chi phí và rủi ro nếu nhét Blob vào Database:**
   - Lưu trữ Base64 hoặc Binary Blob trực tiếp trong PostgreSQL/NoSQL làm phình DB engine, nghẽn Replication Stream và tăng chi phí sao lưu (pg_dump/WAL archive).

---

## 2. Kiến trúc Lưu trữ 4 Phân tầng (4-Tier Storage Architecture)

```
                    [ Inbound Gateway (Zalo / Tele / WA) ]
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    [ Tier 1: PostgreSQL ]    [ Tier 2: S3 / MinIO ]   [ Tier 3: NoSQL / OLAP ]
    (Hot Data: 30-60 ngày)    (Object Storage)        (Cold Data & Mining)
    - Metadata lõi            - Raw ảnh / video / doc  - ClickHouse / Mongo
    - Foreign keys & CRM      - WebP thumbnail nén     - Raw gateway payloads
    - Phân trang hội thoại    - URL nội bộ cố định     - Vector / Data mining
              │                       │
              └───────────┬───────────┘
                          ▼
              [ Tier 4: Browser Edge Cache ]
              (IndexedDB via Dexie.js)
              - 0ms instant render
              - Cache-First SWR
              - Offline Image Blob Vault
```

---

## 3. Chi tiết Thiết kế Từng Tầng Lưu trữ

### Tier 1: Hot Transactional Store (PostgreSQL)
- **Mục đích:** Đảm bảo tính toàn vẹn giao dịch (ACID), khóa ngoại (Foreign Keys) liên kết Khách hàng / Nhân viên / Trạng thái Takeover / Deal Stage.
- **Phạm vi dữ liệu:** Chỉ lưu dữ liệu nóng trong 30 đến 60 ngày gần nhất.
- **Chiến lược tối ưu:**
  - Áp dụng **PostgreSQL Table Partitioning theo tháng** (`PARTITION BY RANGE (created_at)`) trên bảng `messages`.
  - Truy vấn hội thoại chỉ quét trên partition hiện tại, loại bỏ việc scan bảng hàng chục triệu dòng.
  - Khi hết chu kỳ 60 ngày: Detach partition và đẩy sang Cold Store mà không lock bảng chính.

### Tier 2: Media Object Storage & CDN (MinIO / Cloudflare R2 / AWS S3)
- **Mục đích:** Lưu trữ toàn bộ tệp nhị phân đa phương tiện (ảnh, video, audio voice, văn bản).
- **Quy trình xử lý Worker:**
  1. Khi nhận webhook/event chứa ảnh từ gateway: Ingestion Worker tải stream nhị phân về background.
  2. Nén tự động định dạng `WebP` (giảm 70-80% dung lượng so với JPEG/PNG gốc) và tạo thumbnail 200px.
  3. Đẩy lên Object Storage theo cấu trúc phân cấp:
     `{tenant_id}/{channel}/{year}/{month}/{file_hash}.webp`
  4. Database (PostgreSQL/NoSQL) chỉ lưu chuỗi đường dẫn tương đối hoặc public URL đại diện, tuyệt đối không lưu binary.

### Tier 3: Cold Archive & Data Mining Store (ClickHouse hoặc MongoDB)
- **Mục đích:** Lưu trữ vĩnh viễn lịch sử chat, phục vụ huấn luyện AI Intent, phân tích báo cáo (OLAP) và khai phá dữ liệu (Data Mining).
- **Lựa chọn công nghệ:**
  - **ClickHouse (Khuyến nghị số 1 cho Analytics & AI Mining):**
    - Tỷ lệ nén dữ liệu văn bản từ 1:5 đến 1:10 dung lượng đĩa so với PostgreSQL.
    - Truy vấn thống kê, tìm kiếm từ khóa, tính toán thời gian phản hồi (SLA) trên hàng tỷ tin nhắn với độ trễ dưới 1 giây.
    - Hỗ trợ lưu trữ Vector Embeddings trực tiếp để tích hợp Semantic Search và RAG cho AI Agent.
  - **MongoDB / ScyllaDB (Nếu chọn hướng Flexible Document):**
    - Lưu nguyên dạng JSON thô từ Zalo/Telegram/WhatsApp mà không cần định hình schema cố định.

### Tier 4: Client-Side Edge Cache (Browser IndexedDB)

#### So sánh kỹ thuật: IndexedDB vs LocalStorage
| Tiêu chí | LocalStorage | IndexedDB (Dexie.js) | Kết luận |
|---|---|---|---|
| **Dung lượng tối đa** | Giới hạn cứng ~5MB | Hàng trăm MB đến vài GB (theo đĩa máy) | IndexedDB đáp ứng được lịch sử chat lớn |
| **Cơ chế I/O** | Đồng bộ (Synchronous Blocking) | Bất đồng bộ (Async Non-blocking Web Worker) | LocalStorage gây đơ UI khi đọc/ghi JSON dài |
| **Hỗ trợ kiểu dữ liệu** | Chỉ lưu String (phải Base64) | Hỗ trợ lưu trực tiếp `Blob`, `ArrayBuffer`, `Object` | IndexedDB lưu trực tiếp file ảnh nhị phân |
| **Khả năng Index** | Không hỗ trợ (phải parse toàn bộ) | Hỗ trợ Index đa trường (`[convId+sentAt]`) | IndexedDB cho phép query phân trang tức thì |

#### Cơ chế vận hành trên Frontend (`omni-web`):
1. **Cache-First Stale-While-Revalidate (SWR):**
   - Khi sale mở hội thoại: Đọc ngay 50 tin nhắn gần nhất từ IndexedDB -> Giao diện hiển thị trong **0ms** (không hiện khung chờ / skeleton).
   - Gửi background request lên backend (`GET /messages?since=<latest_id>`) để kéo các tin mới phát sinh và cập nhật ngược lại IndexedDB.
2. **Offline Image Blob Vault:**
   - Ảnh sau khi tải từ CDN được lưu trực tiếp dưới dạng `Blob` vào Object Store của IndexedDB.
   - Các lần mở sau dùng `URL.createObjectURL(blob)` để render ngay lập tức, tiết kiệm 100% băng thông mạng cho ảnh cũ.
3. **Chính sách Thu dọn Bộ nhớ (LRU Eviction):**
   - Giới hạn lưu tối đa 1.000 tin nhắn gần nhất cho mỗi hội thoại trên máy client.
   - Tự động xóa cache các hội thoại không mở trong vòng 14 ngày.

---

## 4. Lộ trình Phân kỳ Đề xuất (Phased Roadmap)

- **Giai đoạn 1 (Tối ưu Trải nghiệm Client & Băng thông):**
  - Tích hợp `Dexie.js` trên `omni-web`.
  - Triển khai IndexedDB cache cho tin nhắn và avatar/thumbnail ảnh.
- **Giai đoạn 2 (Tách rời Media khỏi CDN thứ 3):**
  - Thiết lập MinIO/S3 Bucket.
  - Xây dựng background worker tải và nén ảnh WebP khi nhận tin nhắn đa phương tiện.
- **Giai đoạn 3 (Giải phóng Tải PostgreSQL):**
  - Đánh partition theo tháng cho bảng `messages` trên PostgreSQL.
- **Giai đoạn 4 (Phục vụ Data Mining & AI):**
  - Triển khai ClickHouse và CDC pipeline (Change Data Capture qua Debezium/Worker) để đồng bộ tin nhắn cũ sang Cold Store.
