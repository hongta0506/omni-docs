# Architecture Decision: Storage Strategy & Infrastructure ORM Selection

> **Status:** Accepted  
> **Date:** 2026-03-27  
> **Bounded Contexts:** All (Customer, Conversation, Channel, Automation, Deal)  
> **Authors:** Engineering Team & Architecture Review

---

## 1. Problem Statement & Context

Omni Core là nền tảng quản trị hội thoại đa kênh (Zalo Personal, Zalo OA, Facebook Messenger, Telegram) kết hợp CRM bán hàng đa nhân viên và tích hợp AI Agent tự động hóa.

Hệ thống có hai luồng dữ liệu chính:
1. **Dữ liệu CRM nghiệp vụ & Quan hệ (Relational & Transactional CRM):**
   - Khách hàng (`contacts`), liên kết hồ sơ mạng xã hội (`channel_profiles`), nhãn (`tags`), giao dịch (`deals`), phân quyền nhân viên (`assignees`), cấu hình kênh (`channel_accounts`).
   - Yêu cầu: Khả năng lọc tìm kiếm động đa tiêu chí (Dynamic Filtering), tính toàn vẹn dữ liệu ACID cao, dễ dàng mở rộng thuộc tính.
2. **Dữ liệu Hội thoại & Tin nhắn (High-volume Conversation & Message Stream):**
   - Sự kiện tin nhắn từ Webhook / Sync API của các bên (Zalo, Meta, Telegram), các sự kiện nội bộ và phản hồi của AI Agent.
   - Yêu cầu: Lưu trữ dữ liệu lớn, tốc độ ghi nhanh, hỗ trợ tìm kiếm phân đoạn (cursor pagination), phục vụ trích xuất ngữ cảnh cho AI Agent (RAG / Vector search).

Việc sử dụng thuần `sqlc` ở tầng Infrastructure phát sinh chi phí lớn khi xây dựng các bộ lọc CRM phức tạp (10-15 optional filters), trong khi việc lưu trữ toàn bộ lịch sử tin nhắn vô hạn định trong bảng quan hệ PostgreSQL có thể làm tăng dung lượng và chi phí vận hành nhanh chóng.

---

## 2. Infrastructure ORM / Data Access Layer: Bun (`uptrace/bun`)

### 2.1 Quyết định kỹ thuật
- **Lựa chọn:** Thay thế chiến lược `sqlc` thuần ở các màn hình CRM / Repository bằng **`uptrace/bun`**.
- **Loại bỏ:** Không sử dụng `GORM` do hạn chế về reflection overhead, cơ chế magic tag dễ xâm lấn Domain model, và khó kiểm soát SQL phức tạp.

### 2.2 So sánh đối chiếu

| Tiêu chí | `sqlc` + `pgx/v5` | `GORM` | `uptrace/bun` (Được chọn) |
| :--- | :--- | :--- | :--- |
| **Bản chất** | Compile SQL thành Go code | Heavy Active-Record ORM | SQL-First Query Builder & Lightweight ORM |
| **Hiệu năng & Memory** | Tối đa (Zero reflection) | Kém nhất (Reflection nặng) | Rất cao (Tối ưu buffer, gần tiệm cận pgx) |
| **Dynamic Filters (CRM)** | Khó viết, query phình to | Rất dễ | **Rất dễ và tự nhiên** (`q.Where("? = ?", ...)`) |
| **Tính tương thích DDD** | Tốt (tách rời Model) | Dễ gây coupling Domain | **Tốt** (Hỗ trợ Data Mapper sạch) |
| **Tính năng PostgreSQL** | Đầy đủ | Hạn chế | Hỗ trợ sâu: `JSONB`, Array, `ON CONFLICT`, CTE |

### 2.3 Nguyên tắc triển khai trong Go Clean Architecture
1. **Domain Layer bất biến:** Không đặt tag của `bun` trong Entity/Aggregate thuộc `internal/<bc>/domain/`. Domain Entity hoàn toàn độc lập với database.
2. **Persistence Models:** Tầng `internal/<bc>/infrastructure/postgres/models/` khai báo các struct tương ứng với bảng database và chứa thẻ `bun:"..."`.
3. **Data Mapper:** Thực hiện chuyển đổi tường minh giữa Domain Aggregate và Persistence Model (`toDomain()` và `toPersistence()`).

---

## 3. Chiến lược Lưu trữ Tin nhắn & Dữ liệu (Message Storage Strategy)

```
             ┌────────────────────────────────────────────────────────┐
             │       Webhook / Sync Worker (Zalo, Meta, Telegram)     │
             └───────────────────────────┬────────────────────────────┘
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │          Omni Core Ingestion          │
                     └───────────────────┬───────────────────┘
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             │                                                       │
             ▼                                                       ▼
   [CRM & Conversation Metadata]                           [Message Timeline Storage]
     (PostgreSQL via Bun)                                   (PostgreSQL Partitioned
    - contacts, channel_profiles                            / Evolution to NoSQL)
    - conversations (summary: unread,                      - Raw text, attachments
      last_message, assignee, tags)                        - Cursor-based timeline
             │                                                       │
             │                                                       ▼
             │                                             [Vector Knowledge Store]
             │                                                (PostgreSQL pgvector)
             │                                             - Chunked text embeddings
             │                                             - Khách hàng & hội thoại context
             │                                                       │
             └───────────────────────────┬───────────────────────────┘
                                         ▼
                             ┌───────────────────────┐
                             │       AI Agent        │
                             │  (RAG / Auto-reply)   │
                             └───────────────────────┘
```

### 3.1 Vì sao không dùng mô hình Client-Only Storage?
- **Đặc thù CRM Đa người dùng:** Nhiều nhân viên CSKH / Sale cùng theo dõi và hỗ trợ một khách hàng. Nếu chỉ lưu ở client, dữ liệu không thể đồng bộ tức thời giữa các nhân viên.
- **AI Agent chạy độc lập (24/7 Server-side):** Khi khách hàng gửi tin nhắn ngoài giờ làm việc (nhân viên đã tắt máy), AI Agent trên server cần dữ liệu lịch sử để hiểu ngữ cảnh và phản hồi tự động.

### 3.2 Lộ trình phân cấp lưu trữ (Tiered Storage)

#### Giai đoạn 1: MVP & Phase 2 (Hiện tại)
- **Engine:** PostgreSQL 16.
- **Cấu trúc bảng `conversations`:** Lưu metadata của cuộc hội thoại (`id`, `contact_id`, `channel_type`, `status`, `assigned_to`, `unread_count`, `last_message_at`, `snippet`).
- **Cấu trúc bảng `messages`:** Lưu chi tiết tin nhắn (`id`, `conversation_id`, `sender_type`, `content`, `attachments`, `metadata`, `created_at`). Đánh index Composite `(conversation_id, created_at DESC)` phục vụ phân trang tin nhắn tốc độ cao.
- **Ưu điểm:** Tinh gọn, tối ưu chi phí hạ tầng, dễ backup trong một cụm database duy nhất.

#### Giai đoạn 2: Scale & Archival (Hàng chục triệu tin nhắn)
- **Partitioning:** Phân vùng bảng `messages` theo khoảng thời gian (`RANGE (created_at)` theo tháng) để duy trì hiệu năng index.
- **Cold Storage / NoSQL Adapter:** Triển khai adapter `MessageRepository` mới trỏ sang NoSQL (MongoDB hoặc ScyllaDB) cho tin nhắn cũ hơn 90 ngày. Domain layer hoàn toàn không thay đổi nhờ tuân thủ Dependency Inversion.

---

## 4. Tích hợp AI Agent & Vector Search (pgvector)

### 4.1 Không lưu raw message vào Vector DB
- Vector DB không được thiết kế để thay thế primary database cho việc đọc lịch sử tin nhắn hàng ngày.
- Chi phí lưu trữ và RAM của Vector DB cao hơn nhiều so với relational / document storage.

### 4.2 Chiến lược Hybrid RAG với `pgvector`
- **Tận dụng `pgvector` trên PostgreSQL:** Không cần triển khai thêm cụm dịch vụ Vector DB độc lập (như Milvus / Qdrant) trong giai đoạn đầu.
- **Cơ chế Embedding:**
  1. Tin nhắn đến hoặc sau khi phiên hội thoại kết thúc: Worker gom nhóm tin nhắn (conversation chunking).
  2. Tạo embedding vector qua Embedding API (OpenAI text-embedding-3 hoặc model cục bộ).
  3. Lưu vector và metadata vào bảng `conversation_embeddings` (`embedding vector(1536)`).
- **Truy vấn AI Agent:**
  - AI Agent nhận câu hỏi mới từ khách hàng -> Tạo embedding -> Thực hiện Cosine Similarity Search (`<=>`) trên PostgreSQL để tìm các lượt trao đổi liên quan nhất của khách hàng đó -> Bơm vào prompt làm ngữ cảnh.

---

## 5. Kết luận & Kế hoạch hành động

1. **omni-docs:** Lưu trữ tài liệu này tại `architecture/STORAGE-STRATEGY-AND-ORM.md` và cập nhật chỉ mục.
2. **omni-core (Issue #9):** 
   - Cài đặt thư viện `uptrace/bun` và `bun/driver/pgdriver`.
   - Tạo schema migration cho `conversations`, `messages`, `conversation_events` (outbox).
   - Triển khai `PostgresConversationRepository` và `PostgresMessageRepository` bằng `Bun`.
   - Viết Integration test xác nhận tính tương thích và hiệu năng.
