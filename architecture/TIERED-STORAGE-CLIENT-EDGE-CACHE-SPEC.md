# TIERED-STORAGE-CLIENT-EDGE-CACHE-SPEC.md — Đặc tả Kiến trúc Phân tầng Lưu trữ & Edge Cache IndexedDB Đa Khách hàng (SaaS)

> **Bounded Contexts:** Conversation & Media (`internal/conversation`), Channel & Gateway (`internal/channel`), Customer & Lead (`internal/customer`), Deal & Product (`internal/deal`)  
> **Phạm vi tác động:** `omni-core` (Stateless Message Relay, Intent Extraction Worker) & `omni-web` (IndexedDB Edge Cache via Dexie.js)  
> **Trạng thái tài liệu:** Architectural Specification & Implementation Standard (Chính thức)

---

## 1. Bối cảnh & Thách thức Bài toán SaaS Đa Khách Hàng (Multi-Tenancy)

Khi triển khai Omni dưới dạng nền tảng SaaS phục vụ hàng trăm đến hàng ngàn Doanh nghiệp (Tenants):
1. **Thảm họa chi phí lưu trữ (Storage Cost Explosion):**
   - 1,000 tenants, mỗi tenant có 10,000 khách hàng -> Hàng chục triệu tin nhắn mỗi tháng. Nếu lưu toàn bộ text chat và ảnh thô trên PostgreSQL/S3, chi phí đĩa cứng, sao lưu (backup) và RAM buffer pool sẽ vượt biên lợi nhuận của gói SaaS.
2. **95% Tin nhắn thô là dữ liệu phi thương mại:**
   - Các câu chào hỏi ("alo", "shop ơi"), sticker, icon cảm xúc, ảnh biên lai tạm không có giá trị phân tích lâu dài.
3. **Bảo mật & Quyền riêng tư (Data Privacy Selling Point):**
   - Khách hàng doanh nghiệp đòi hỏi tin nhắn nội bộ của họ không bị lưu trữ vĩnh viễn trên server nhà cung cấp SaaS.

👉 **Chiến lược cốt lõi:** **"Thân ở Client, Hồn ở Server" (Zero-Raw-Message Architecture)**.
- **Nội dung chat thô (Raw text/media):** Lưu tại **IndexedDB** trên máy nhân viên của Tenant (Chi phí hạ tầng = 0 VNĐ).
- **Hồ sơ nhu cầu & Gợi ý sản phẩm (Intent & Target Profile):** Lưu tại **PostgreSQL (Tenant-Isolated)** với dung lượng siêu nhẹ (~100-200 KB / khách hàng).

---

## 2. Đánh giá Công nghệ Client Storage: IndexedDB vs SQLite WASM

| Tiêu chí | IndexedDB (`Dexie.js`) [CHỌN] | SQLite WASM + OPFS [LOẠI] | Phân tích Kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Bản chất** | API Web tiêu chuẩn W3C có sẵn | C codebase compile qua Emscripten | IndexedDB không cần nạp bundle WASM nhị phân (~1MB). |
| **Tương thích Browser** | **100%**: Chrome, Edge, Safari, Firefox | Phân mảnh: Safari bị hạn chế SyncAccessHandle | Safari iOS/macOS giới hạn OPFS ngoài Web Worker. |
| **Phụ thuộc HTTP Header** | **Không** (chạy trên mọi domain) | **Bắt buộc `COOP` & `COEP`** | Bật COOP/COEP sẽ chặn tải ảnh từ CDN ngoài (Zalo `zadn.vn`, Facebook CDN). |
| **Lưu trữ Media Binary** | Hỗ trợ `Blob` nguyên bản | Phải nhét vào BLOB SQL | IndexedDB lưu ảnh trực tiếp, dùng `URL.createObjectURL()` render 0ms. |
| **Tốc độ truy vấn** | < 2ms theo Compound Index | < 1ms với SQL engine | Lập chỉ mục `[conversationId+sentAt]` trên IndexedDB đáp ứng hoàn hảo chat. |

### Xử lý đặc thù từng Trình duyệt (Browser Quirks & Safeguards)
1. **Safari 7-Day Storage Eviction:**
   - WebKit tự xóa IndexedDB nếu người dùng không tương tác trong 7 ngày.
   - **Khắc phục:** Khi người dùng đăng nhập `omni-web`, tự động gọi API đăng ký bộ nhớ bền vững:
     ```typescript
     if (navigator.storage && navigator.storage.persist) {
       const isPersisted = await navigator.storage.persist();
       console.log('IndexedDB persistent storage:', isPersisted);
     }
     ```
2. **Quota Giới hạn Dung lượng:**
   - Chromium (Chrome/Edge): Tối đa 60% - 80% dung lượng trống ổ cứng.
   - Firefox: Tối đa 50% dung lượng trống.
   - **Chính sách LRU (Least Recently Used) Eviction:** Chỉ lưu tối đa **1,000 tin nhắn gần nhất** mỗi hội thoại. Tự động thu dọn hội thoại không hoạt động sau 30 ngày.

---

## 3. Kiến trúc Tổng thể Hệ thống Phân tầng (Tiered System Architecture)

```
[Khách mua hàng gửi tin qua Zalo / Telegram / FB]
                      │
                      ▼
            [omni-core Gateway]
                      │
    ┌─────────────────┴──────────────────────────────────────────┐
    │                                                            │
    ▼ (Real-time WebSocket / SSE)                                ▼ (Asynchronous Worker Queue)
[omni-web Frontend (Trình duyệt nhân viên)]            [Customer Intent Enrichment Worker]
    │                                                            │
    ├── 1. Ghi tin nhắn vào IndexedDB (`messages`)              ├── 1. Lọc tin nhắn tìm sản phẩm / nhu cầu
    ├── 2. Tải ảnh & lưu Blob vào `media_blobs`                ├── 2. Đối chiếu Catalog Sản phẩm (`deal_products`)
    └── 3. Render tức thì 0ms (Cache-First)                      └── 3. Cập nhật `customer_intent_profiles` (Postgres)
                                                                         │
                                                                         ▼
                                                                [XÓA TIN NHẮN THÔ KHỎI SERVER]
```

---

## 4. Thiết kế Chi tiết Lược đồ IndexedDB Client (`omni-web`)

Sử dụng thư viện `dexie` (v4+) trên Vue 3.5:

```typescript
// src/services/storage/db.ts
import Dexie, { type Table } from 'dexie';

export interface LocalConversation {
  id: string; // UUID hội thoại
  tenantId: string;
  channelType: 'zalo_personal' | 'telegram_personal' | 'facebook_personal';
  customerName: string;
  customerAvatarUrl?: string;
  lastMessageSnippet: string;
  lastMessageAt: number; // Unix timestamp
  unreadCount: number;
}

export interface LocalMessage {
  id: string; // Server UUID hoặc Client Local Msg ID
  conversationId: string;
  tenantId: string;
  senderType: 'customer' | 'agent' | 'system';
  msgType: 'text' | 'image' | 'file' | 'audio' | 'quote';
  content: string; // Nội dung text hoặc caption
  mediaBlobId?: string; // Khóa ngoại trỏ sang bảng blobs
  sentAt: number; // Unix timestamp
  deliveryStatus: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  quoteTarget?: string; // JSON quote data nếu có
}

export interface LocalMediaBlob {
  id: string; // hash SHA-256 của file
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  blob: Blob; // Nhị phân ảnh/tệp tin lưu trực tiếp
  cachedAt: number;
}

export class OmniDatabase extends Dexie {
  conversations!: Table<LocalConversation, string>;
  messages!: Table<LocalMessage, string>;
  mediaBlobs!: Table<LocalMediaBlob, string>;

  constructor() {
    super('OmniClientVault');
    this.version(1).stores({
      conversations: 'id, tenantId, lastMessageAt, channelType',
      messages: 'id, conversationId, [conversationId+sentAt], deliveryStatus',
      mediaBlobs: 'id, cachedAt',
    });
  }
}

export const localDb = new OmniDatabase();
```

---

## 5. Thiết kế Hồ sơ Nhu cầu Đa Khách Hàng (`customer_intent_profiles`) trên Server

Mỗi khách hàng của từng Tenant chỉ tốn **1 dòng bản ghi duy nhất** trong PostgreSQL, được cập nhật liên tục:

```sql
-- deploy/postgres/38_customer_intent_profiles.sql
CREATE TABLE IF NOT EXISTS customer_intent_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    
    -- Phân loại nhu cầu & hành vi mua sắm
    detected_interests TEXT[] DEFAULT '{}',          -- ['noi-chien-khong-dau', 'noi-com-dien']
    price_range_min BIGINT DEFAULT 0,
    price_range_max BIGINT DEFAULT 0,
    buying_readiness_score NUMERIC(3, 2) DEFAULT 0, -- 0.00 đến 1.00 (Điểm sẵn sàng chốt đơn)
    
    -- Gợi ý sản phẩm thuộc Tenant (Cross-link với Deal BC)
    recommended_product_ids UUID[] DEFAULT '{}',
    key_objections TEXT[] DEFAULT '{}',             -- ['che-gia-cao', 'hoi-freeship']
    last_intent_summary TEXT DEFAULT '',            -- "Khách hỏi nồi chiên 5L, đang phân vân giá 1.2tr"
    
    -- Dữ liệu Vector phục vụ Semantic Search & AI Recommendation
    embedding vector(1536),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_tenant_customer_intent UNIQUE (tenant_id, customer_id)
);

CREATE INDEX idx_customer_intent_tenant ON customer_intent_profiles(tenant_id);
CREATE INDEX idx_customer_intent_score ON customer_intent_profiles(tenant_id, buying_readiness_score DESC);
```

---

## 6. Quy trình Target Marketing & Gợi ý Sản phẩm Tiếp Theo (Next-Best-Action)

1. **Khách nhắn tin:**
   - Inbound Webhook đẩy tin nhắn vào Redis Stream `stream:inbound:intent`.
2. **Intent Worker (Stateless AI Extraction):**
   - Đọc danh mục sản phẩm của chính Tenant (`SELECT id, name, price, tags FROM deal_products WHERE tenant_id = ?`).
   - Gửi rolling context 5 tin gần nhất + Product List vào LLM.
   - LLM trả về JSON:
     ```json
     {
       "interests": ["kem-chong-nang", "da-dau"],
       "price_max": 400000,
       "readiness": 0.85,
       "recommended_product_ids": ["c0a80101-0000-0000-0000-000000000010"],
       "summary": "Khách cần kem chống nắng kiềm dầu đi biển, ngân sách dưới 400k."
     }
     ```
   - Upsert kết quả vào `customer_intent_profiles`. Hủy toàn bộ nội dung tin thô trên server.
3. **Phục vụ Target Remarketing:**
   - Khi Tenant tạo chiến dịch Marketing (Broadcast / ZNS / Automation):
   - Thay vì quét hàng triệu dòng tin nhắn, câu truy vấn chạy siêu tốc trên bảng Intent:
     ```sql
     SELECT c.id, c.phone, c.name 
     FROM customer_intent_profiles cip
     JOIN contacts c ON c.id = cip.customer_id
     WHERE cip.tenant_id = $1
       AND 'kem-chong-nang' = ANY(cip.detected_interests)
       AND cip.buying_readiness_score > 0.7;
     ```

---

## 7. Cơ chế Dự phòng & Đồng bộ Khi Đổi Thiết Bị (Device Sync & Failover)

1. **Nhân viên đổi máy tính / Đăng nhập tab mới:**
   - Server vẫn lưu trữ **50 tin nhắn nóng gần nhất (Hot Rolling Buffer)** cho mỗi hội thoại trong vòng 7 ngày (hoặc trên Redis Stream).
   - Khi client mới kết nối, client kéo 50 tin nóng này về nạp vào IndexedDB cục bộ.
2. **Xuất bản Backup Mã hóa (Optional Tenant Backup):**
   - Cung cấp tính năng: Quản lý Tenant có thể bấm *"Xuất bản sao lưu lịch sử chat"*.
   - Client nén toàn bộ IndexedDB thành tệp tin `.enc` (mã hóa mật khẩu) tải về máy của Tenant hoặc đẩy lên Google Drive riêng của Tenant. Server SaaS hoàn toàn không lưu trữ tệp này.

---

## 8. Cơ chế Kỹ thuật Tối ưu Đồng bộ IndexedDB & Multi-Tab Concurrency

### 8.1 Multi-Tab Concurrency Control (Web Locks API & BroadcastChannel)
Khi nhân viên mở nhiều tab làm việc đồng thời trên trình duyệt:
1. **Leader Election:** Sử dụng Web Locks API (`navigator.locks`) để bầu 1 tab làm "Leader" duy nhất duy trì kết nối WebSocket tới Server.
2. **Data Distribution:** Tab Leader ghi dữ liệu vào IndexedDB và phát thông báo qua `BroadcastChannel('omni_chat_sync')` để các tab vệ tinh (Followers) cập nhật giao diện mà không cần duplicate kết nối socket hay xung đột transaction write.

```typescript
// src/services/storage/tab-sync.ts
const channel = new BroadcastChannel('omni_chat_sync');

export function initMultiTabSync(onNewMessage: (msg: LocalMessage) => void) {
  navigator.locks.request('omni_socket_leader', { mode: 'exclusive' }, async (lock) => {
    // Tab này được bầu làm Leader
    setupRealtimeSocket((msg) => {
      localDb.messages.put(msg);
      channel.postMessage({ type: 'MESSAGE_RECEIVED', payload: msg });
      onNewMessage(msg);
    });
    // Giữ lock cho tới khi đóng tab
    await new Promise(() => {});
  });

  // Tab Follower lắng nghe từ Leader
  channel.onmessage = (event) => {
    if (event.data?.type === 'MESSAGE_RECEIVED') {
      onNewMessage(event.data.payload);
    }
  };
}
```

### 8.2 Cơ chế Cache-First SWR có Cursor Gap Detection
1. **0ms Render:** Khi người dùng click chọn hội thoại, truy vấn ngay 50 tin nhắn gần nhất từ IndexedDB qua Compound Index `[conversationId+sentAt]`.
2. **Gap Catch-up:** Lấy `latestSentAt` của tin nhắn mới nhất trong IndexedDB, gửi request `GET /api/v1/conversations/{id}/messages?since_ts={latestSentAt}` lên Server.
3. **Batch Commit:** Sử dụng `localDb.messages.bulkPut(newMessages)` để thực thi dưới 1 transaction duy nhất, không block UI thread.

### 8.3 Quản lý & Tối ưu Media Blob Vault
- **Ảnh đại diện, Sticker & Thumbnail:** Tải nhị phân về máy client và lưu trực tiếp dạng `Blob` vào store `mediaBlobs`. Render tức thì bằng `URL.createObjectURL(blob)` không tốn băng thông CDN.
- **Tệp tin lớn & Video (> 5MB):** Tuyệt đối không lưu Blob vào IndexedDB. Chỉ lưu remote URL để streaming theo nhu cầu nhằm tránh tràn bộ nhớ trình duyệt (Quota Throttling).

### 8.4 Tự động Thu dọn Bộ nhớ Nền (LRU Idle Eviction)
Tận dụng thời gian rảnh của trình duyệt qua `window.requestIdleCallback` để thực thi dọn dẹp bộ nhớ:
- Xóa các tin nhắn vượt quá ngưỡng 1.000 tin gần nhất của mỗi hội thoại.
- Xóa các bản ghi `mediaBlobs` không được truy xuất trong vòng 30 ngày qua.

### 8.5 Phân tích Dữ liệu On-Demand (Client-to-Server Intent Sync)
Khi cấp quản lý yêu cầu phân tích chuyên sâu (ví dụ: đánh giá kỹ năng tư vấn, phân tích chất lượng cuộc gọi/chat dài hạn):
1. Client query lịch sử chat liên quan từ IndexedDB cục bộ.
2. Nén và gửi payload lên API `POST /api/v1/analytics/conversations/analyze-stream`.
3. Server nhận stream, gọi LLM phân tích, trả kết quả chỉ số về dashboard và **xóa ngay dữ liệu thô khỏi bộ nhớ tạm**, bảo toàn cam kết Zero-Raw-Storage.
