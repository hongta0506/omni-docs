# Kế Hoạch Chuyển Đổi & Danh Sách Đối Chiếu Tính Năng (Migration Plan & Parity Checklist)

> **CHIẾN LƯỢC CHUYỂN ĐỔI TOÀN DIỆN TỪ FASTIFY GOCLAW-BRIDGE SANG GOLANG OMNI-CORE (ZERO-DOWNTIME & 100% PARITY)**  
> **Mã tài liệu:** `SPEC-ARCH-GOSO-004`  
> **Bounded Contexts liên quan:**  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge)  
> - `internal/conversation` (BC 4 — Conversation & Media)  
> - `internal/channel` (BC 2 — Channel & Gateway)  
> - `internal/serviceapi` (BC 8 — Service API & Gateway)  
> **Trạng thái:** DRAFT / APPROVED FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, code identifiers, HTTP routes, JSON schema giữ nguyên Tiếng Anh)  

---

## 1. Tổng Quan & Mục Tiêu Chuyển Đổi (Context & Objectives)

Hệ thống cũ `ZaloCRM` (Node.js/Fastify/Prisma) điều phối cầu nối AI thông qua module `src/modules/integrations/providers/goclaw-bridge/`. Dù đáp ứng tốt giai đoạn thử nghiệm ban đầu, kiến trúc Node.js đơn luồng bộc lộ hạn chế lớn khi tải tin nhắn tăng vọt:
- Event loop bị block khi xử lý các thuật toán chuỗi phức tạp (`multi-bubble.ts`, regex parsing của `card-readable.ts`).
- Cơ chế quét nền `reconcile.ts` bằng `node-cron` và BullMQ tiêu tốn nhiều RAM và tiềm ẩn nguy cơ race condition giữa các replica worker.
- Chưa có kiến trúc phân lớp DDD nghiêm ngặt; logic handoff, bảo mật HMAC và định tuyến kênh bị đan xen chặt chẽ vào database client.

Hệ thống thế hệ mới `omni-core` (Golang DDD) kế thừa toàn bộ 100% quy tắc nghiệp vụ thực chiến từ Fastify, đồng thời tối ưu hóa thông qua goroutine concurrency, bộ nhớ đệm O(1) và kết nối gRPC/HTTP tốc độ cao.

### Mục Tiêu Cốt Lõi:
1. **Zero Downtime:** Không làm gián đoạn bất kỳ hội thoại nào của khách hàng hoặc gián đoạn luồng sinh câu trả lời của GOSO Engine trong suốt quá trình chuyển giao.
2. **100% Feature & Bug-for-Bug Parity:** Đảm bảo toàn bộ các xử lý chi tiết (từ chuyển đổi thẻ sinh nhật, chia nhỏ bong bóng chat, ngắt bot khi nhân viên can thiệp, xoay secret an toàn 4 bước) hoạt động đồng nhất tuyệt đối.
3. **Dual-Run / Shadow Traffic:** Cho phép kiểm chứng độ trễ, tính đúng đắn của dữ liệu và chữ ký mã hóa trên môi trường production trước khi thực sự ngắt Node.js bridge.
4. **Instant Safe Rollback:** Quy trình hoàn nguyên về Node.js trong dưới 30 giây nếu phát hiện bất kỳ dị thường nào.

---

## 2. Chiến Lược Triển Khai Chuyển Đổi (Migration & Traffic Shifting Strategy)

Quy trình chuyển đổi được thiết kế theo 4 giai đoạn nối tiếp:

```
┌────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 1: Shadow Traffic (Kiểm thử song song không ảnh hưởng)       │
│ - Ingress Proxy nhân bản Inbound Webhook sang Go omni-core             │
│ - Omni-core chạy verify HMAC, parse body, ghi log so sánh              │
│ - TẮT chiều gửi tin ra Zalo/Telegram từ Omni-core                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Tỷ lệ match > 99.99%)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 2: Canary Routing theo Tenant (Di trú từng phần)             │
│ - 10% Tenant nội bộ chuyển toàn bộ Inbound/Outbound sang Go omni-core  │
│ - 90% Tenant khách hàng tiếp tục chạy trên Node.js Fastify             │
│ - Giám sát tỷ lệ lỗi (Error Rate) và độ trễ P99                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Không có sự cố sau 48h)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 3: Full Cutover (Chuyển đổi 100% lưu lượng sang Go)         │
│ - Định tuyến 100% traffic Webhook Bridge sang Go omni-core             │
│ - Dừng Inbound Worker của Fastify goclaw-bridge                        │
│ - Giữ Node.js Fastify ở trạng thái Standby Warm Ready                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Ổn định 7 ngày liên tục)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 4: Decommission & Cleanup (Dọn dẹp mã nguồn cũ)              │
│ - Xoá module `goclaw-bridge` khỏi codebase Node.js Fastify             │
│ - Giải phóng Redis Queue cũ của BullMQ                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Cấu Hình Shadow Traffic tại Lớp Ingress (Envoy / Traefik / Nginx)

Sử dụng Envoy Proxy hoặc Nginx Mirroring để nhân bản các request từ GOSO sang cả hai hệ thống:

```nginx
# Cấu hình Nginx Shadow Mirroring
location /api/integrations/goclaw/ {
    # Luồng chính phục vụ khách hàng: Node.js Fastify
    proxy_pass http://zalocrm-fastify-backend:3000;
    
    # Luồng Shadow ngầm: Go omni-core
    mirror /shadow_goclaw;
    mirror_request_body on;
}

location = /shadow_goclaw {
    internal;
    proxy_pass http://omni-core-backend:8080$request_uri;
    proxy_pass_request_body on;
    # Header đánh dấu để Go omni-core nhận biết chỉ dry-run, không dispatch ra ngoài
    proxy_set_header X-Shadow-Mode "true";
}
```

Tại `omni-core/internal/aiagent/interfaces/http/goclaw_bridge.go`:
```go
if r.Header.Get("X-Shadow-Mode") == "true" {
    // Chỉ thực thi xác thực HMAC, giải mã JSON và kiểm tra Invariant
    // KHÔNG dispatch lệnh gửi tin thực tế ra kênh Zalo
    w.WriteHeader(http.StatusOK)
    return
}
```

---

## 3. Ma Trận Đối Chiếu Chi Tiết 100% Tính Năng (Parity Checklist)

Bảng đối chiếu toàn bộ 13 file/module từ `ZaloCRM/backend/src/modules/integrations/providers/goclaw-bridge/` sang cấu trúc Go DDD trong `omni-core`:

| STT | Fastify File (ZaloCRM) | Chức Năng Nghiệp Vụ Cốt Lõi | Go DDD File Tương Ứng (`omni-core`) | Trạng Thái Parity | Ghi Chú Kỹ Thuật Đặc Thù |
|---|---|---|---|:---:|---|
| 1 | `routes.ts` | Khai báo 3 Webhook: `/reply`, `/context`, `/media` | `internal/aiagent/interfaces/http/goclaw_bridge.go` | **100%** | Parse Header HMAC, limit body 1MB, CQRS Dispatch. |
| 2 | `sign.ts` | Ký HMAC SHA-256 outbound request (`timestamp.nonce.body`) | `internal/aiagent/infrastructure/harness/security.go` | **100%** | `crypto/hmac` native Go, không phụ thuộc thư viện ngoài. |
| 3 | `verify.ts` | Xác thực chữ ký HMAC Inbound, kiểm tra nonce & timestamp skew | `internal/aiagent/infrastructure/harness/security.go` | **100%** | O(1) Nonce check bằng sync.Map hoặc Redis TTL ring buffer. |
| 4 | `secret-store.ts` | Tra cứu và cache secret theo tổ chức (`bridge_hmac_secret`) | `internal/aiagent/infrastructure/postgres_provider_repo.go` | **100%** | Lưu tại DB Postgres, cache RAM read-through với TTL 10 phút. |
| 5 | `rotate.ts` | Xoay chìa khóa bảo mật 4 bước an toàn tuyệt đối | `internal/aiagent/application/commands/rotate_secret_handler.go` | **100%** | Lock phân tán theo Tenant ID, dual-candidate verify. |
| 6 | `agent-handoff.ts` | Quản lý Conversation Lease, ngắt bot khi nhân viên chat | `internal/conversation/domain/conversation.go` | **100%** | Invariant trực tiếp trong Aggregate Root: `HumanTakeoverUntil`. |
| 7 | `group-mention-gate.ts` | Lọc tin nhắn nhóm Zalo: chỉ phản hồi khi có @mention nick bot | `internal/aiagent/application/filter/group_mention_gate.go` | **100%** | Parse `mentions` array từ message metadata JSON. |
| 8 | `card-readable.ts` | Chuyển đổi contact card, thiệp sinh nhật, sticker thành văn bản | `internal/aiagent/application/transformer/card_readable.go` | **100%** | Loại bỏ dấu tiếng Việt, phân loại thiệp sinh nhật, danh thiếp. |
| 9 | `multi-bubble.ts` | Tách đoạn văn bản LLM thành nhiều bong bóng chat Zalo | `internal/channel/application/transformer/multi_bubble.go` | **100%** | Thuật toán tách câu, nhận diện bảng Markdown, làm mềm chữ hoa. |
| 10 | `reconcile.ts` | Sweeper chạy định kỳ 1 phút quét tin khách bị lỡ do sự cố | `internal/aiagent/infrastructure/scheduler/reconcile_worker.go` | **100%** | Background goroutine ticker thay thế node-cron, cursor `synced_at`. |
| 11 | `reply-target.ts` | Xác định đích đến phản hồi (1-1 user thread hay group thread) | `internal/conversation/application/queries/reply_target.go` | **100%** | Map chuẩn xác giữa external Zalo ID và Omni Conversation ID. |
| 12 | `legacy-window.ts` | Giới hạn cửa sổ ngữ cảnh lịch sử cho các tin nhắn cũ | `internal/conversation/application/queries/context_window.go` | **100%** | Lọc theo thời gian `MAX_RECONCILE_WINDOW_MS` (30 phút). |
| 13 | `index.ts` | Entrypoint module, cấu hình tích hợp và lifecycle hook | `internal/aiagent/interfaces/http/handler.go` | **100%** | Đăng ký route vào ServeMux Go 1.22+. |

---

## 4. Xử Lý Chi Tiết Các Trường Hợp Đặc Thù (Edge Cases Parity)

### 4.1 Thuật Toán Multi-Bubble Splitter (`multi-bubble.ts` -> Go)
Zalo là ứng dụng chat di động. Trợ lý AI trả lời một tràng văn bản dài sẽ khiến người dùng khó theo dõi và mất tính tự nhiên.
- **Quy tắc phân đoạn:**
  - Tối đa: 8 bong bóng chat (`MULTI_BUBBLE_MAX_MESSAGES = 8`).
  - Độ dài mục tiêu một bong bóng: ~78 ký tự, tối đa 118 ký tự.
  - Phân tách ưu tiên theo dấu câu ngắt dòng (`\n\n`), dấu chấm (`.`), dấu chấm phẩy (`;`), hoặc liên từ dẫn xuất ("đúng rồi", "chính xác", "nói dễ hiểu").
  - **Bảo toàn bảng Markdown:** Nếu câu trả lời chứa bảng biểu (`| cột 1 | cột 2 |`), không được cắt nát bảng mà gom toàn bộ bảng thành 1 bong bóng độc lập.
  - **Làm mềm chữ hoa (Soften Shouting Words):** Phát hiện các từ viết hoa toàn bộ (trừ các từ kỹ thuật: `EAC`, `SKU`, `OA`, `USD`, `VIP`, `CRM`, `ZALO`) và chuyển thành chữ thường để tránh cảm giác "quát mắng" khách hàng.

### 4.2 Bộ Chuyển Đổi Thẻ Zalo Thành Văn Bản Hiểu Được (`card-readable.ts` -> Go)
Các binary GOSO không hiểu cấu trúc JSON nội bộ của thẻ Zalo. `omni-core` chuẩn hóa trước khi đẩy sang GOSO:
- **Contact Card:** Rút trích Tên (`name`), Số điện thoại (`phone`) hoặc Zalo UID (`userId`). Chuyển thành: `"Khách vừa gửi một danh thiếp Zalo: Nguyễn Văn A (0912345678)"`.
- **Thiệp Sinh Nhật (Birthday Card):** Phát hiện chuỗi không dấu `"sinh nhat"` hoặc `"birthday"` trong params. Chuyển thành: `"Khách vừa gửi một thiệp chúc mừng sinh nhật"`.
- **Sticker / Emotion:** Thay vì bỏ qua tin nhắn, chuyển thành: `"Khách vừa gửi một sticker biểu cảm trên Zalo"`.

### 4.3 Quy Trình Xoay Khóa Bí Mật 4 Bước (`rotate.ts` -> Go)
Xoay khóa bí mật HMAC là thao tác nhạy cảm nhất. Nếu sai thứ tự, GOSO sẽ không thể xác thực webhook và ngừng trả lời khách.
- **Bước 1 (Staged Secret):** Tạo khóa mới và ghi vào cột `staged_bridge_hmac_secret`. Tại bước này, bộ xác thực Inbound chấp nhận CẢ khóa cũ lẫn khóa đang chờ duyệt (`staged`). Chiều vào không bị gián đoạn.
- **Bước 2 (Sync to GOSO):** Gọi API sang GOSO Engine để cập nhật secret mới cho toàn bộ các kênh thuộc tổ chức.
- **Bước 3 (Promote Secret):** Khi GOSO xác nhận đã lưu thành công khóa mới trên toàn bộ kênh, hệ thống chuyển `staged_secret` thành `active_secret`. Lúc này chiều ra (Outbound) bắt đầu ký bằng khóa mới.
- **Bước 4 (Cleanup):** Xoá trường `staged_secret`. Nếu ở Bước 2 gặp lỗi mạng hoặc GOSO từ chối, lập tức huỷ bỏ `staged_secret` và giữ nguyên khóa cũ (Safe Rollback).

### 4.4 Sweeper Bù Tin Nhắn Tự Động (`reconcile.ts` -> Go)
Để đảm bảo không mất tin nhắn của khách hàng kể cả khi mạng chập chờn:
- Goroutine nền chạy chu kỳ `1 phút/lần`.
- Quét các cuộc hội thoại có `last_message_at > goclaw_synced_at` trong vòng 30 phút qua.
- Đẩy lại tin nhắn mới nhất sang GOSO kèm ID định danh để đảm bảo tính Idempotent (không kích hoạt lặp).

---

## 5. Quy Trình Vận Hành Chuyển Giao (Cutover Runbook Cho DevOps)

### 5.1 Các Bước Chuẩn Bị Trước Giờ G (T-24h)
1. **Kiểm tra tương thích Database:**
   - Đảm bảo các bảng `conversations`, `messages`, `goclaw_providers`, `ai_agent_bindings` đã có đủ các chỉ mục (indexes) trên Postgres.
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_goclaw_sync 
   ON messages (conversation_id, sent_at DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conv_goclaw_synced 
   ON conversations (tenant_id, last_message_at) WHERE status = 'active';
   ```
2. **Triển khai ứng dụng `omni-core`:**
   - Deploy container `omni-core:v1.0.0` trên Kubernetes hoặc Docker Compose.
   - Cấu hình biến môi trường:
     ```env
     PORT=8080
     DATABASE_URL=postgres://omni:password@postgres-master:5432/omni_db?sslmode=disable
     REDIS_URL=redis://redis-cluster:6379/0
     GOSO_BASE_URL=https://goso-engine.internal.admatrix.vn
     ```
3. **Chạy kiểm thử Shadow Verification:**
   - Bật Ingress Mirroring trong 2 giờ.
   - Kiểm tra log Grafana Loki: So sánh số lượng request thành công giữa Fastify và Go.
   - Ngưỡng đạt chuẩn: Tỷ lệ lệch chữ ký HMAC = 0%, tỷ lệ lỗi 5xx = 0%.

### 5.2 Thực Hiện Chuyển Giao Lưu Lượng (Giờ G)
- **Bước 1 (T-0): Chuyển Canary 10%**
  - Chuyển 10% Tenant ID (danh sách Tenant nội bộ của công ty) sang trỏ trực tiếp vào Ingress của `omni-core`.
  - Theo dõi Dashboard trong 15 phút.
- **Bước 2 (T+15m): Chuyển Tăng Cường 50%**
  - Mở rộng thêm 40% Tenant tiếp theo.
  - Quan sát mức tiêu thụ CPU/RAM của Postgres và Go runtime.
- **Bước 3 (T+30m): Chuyển Toàn Bộ 100%**
  - Đổi cấu hình Reverse Proxy: Trỏ toàn bộ route `/api/integrations/goclaw/*` sang `omni-core:8080`.
  - Tắt background sweeper của Fastify (`reconcile.ts`) để tránh 2 hệ thống quét trùng lặp.

### 5.3 Giám Sát Sau Chuyển Đổi (T+1h -> T+24h)
Theo dõi các chỉ số quan trọng trên Grafana:
1. `omni_goclaw_bridge_replies_total{status="200"}`: Tăng đều tương ứng với lưu lượng khách chat.
2. `omni_goclaw_hmac_verify_failures_total`: Phải bằng 0.
3. `omni_conversation_human_takeover_conflicts_total`: Đếm số lần bot bị huỷ câu trả lời do nhân viên can thiệp kịp thời (chứng minh tính năng Takeover hoạt động chính xác).
4. `go_gc_duration_seconds`: Đảm bảo thời gian dừng GC < 5ms.

---

## 6. Tiêu Chí & Kế Hoạch Hoàn Nguyên Khẩn Cấp (Emergency Rollback Runbook - 15 Phút)

### 6.1 Điều Kiện Kích Hoạt Hoàn Nguyên (Rollback Triggers)
Nếu xuất hiện bất kỳ điều kiện nào sau đây kéo dài quá **2 phút liên tục**:
1. Tỷ lệ lỗi HTTP 5xx tại endpoint `/reply` vượt quá **2.0%**.
2. Tỷ lệ lỗi xác thực chữ ký HMAC sai lệch vượt quá **0.5%** (dấu hiệu sai lệch secret hoặc thuật toán ký).
3. Thời gian phản hồi P99 của endpoint `/context` vượt quá **1500ms** (gây nghẽn context của GOSO).
4. Nhân viên phát hiện bot trả lời đè lên tin nhắn của nhân viên (Human Takeover Lease bị hỏng).
5. Tỷ lệ đối chiếu sai lệch `aiagent_shadow_parity_match_ratio` sụt giảm dưới ngưỡng an toàn **99.9%**.

### 6.2 Quy Trình 4 Bước Hoàn Nguyên Khẩn Cấp (<= 15 Phút)

#### Bước 1: Dập Emergency Kill-Switch & Drain Webhooks (T+0m -> T+2m)
Ngay lập tức kích hoạt Emergency Kill-Switch trên Service API Gateway để chặn toàn bộ các thao tác ghi (mutations) từ Agent Hands:
```bash
curl -X POST https://api.admatrix.vn/api/v1/service/credentials/$CREDENTIAL_ID/kill-switch   -H "Authorization: Bearer $OPS_MASTER_TOKEN"   -H "Content-Type: application/json"   -d '{"reason": "Emergency Cutover Rollback triggered"}'
```
- Thời gian thực thi: **30 giây**.
- Kết quả kiểm chứng: Mọi request mutation tới `/api/v1/service/*` nhận mã 403 Forbidden với thông báo `Credential is kill-switched`.

#### Bước 2: Điều Hướng Nginx / Cloudflare Ingress Proxy (T+2m -> T+5m)
Chuyển đổi Ingress Traffic trả ngược về cụm Fastify backend:
```bash
# Tại máy chủ Nginx / Ingress Controller:
ln -sf /etc/nginx/sites-available/zalocrm-fastify.conf /etc/nginx/sites-enabled/
nginx -t && nginx -s reload

# Hoặc qua Kubernetes Ingress / Helm:
kubectl apply -f k8s/ingress-fallback-to-fastify.yaml
```
- Thời gian thực thi: **2 phút**.
- Kiểm tra kết quả: `curl -I https://api.admatrix.vn/api/integrations/goclaw/health` trả về header `X-Powered-By: Fastify`.

#### Bước 3: Revert DNS & Fallback sang Fastify Cluster (T+5m -> T+10m)
Nếu lỗi xảy ra ở mức mạng hoặc hạ tầng Kubernetes, chuyển DNS Cloudflare qua Fastify Standby:
```bash
# Chuyển đổi DNS A/CNAME record qua Cloudflare API
curl -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID"   -H "Authorization: Bearer $CF_API_TOKEN"   -H "Content-Type: application/json"   -d '{"type":"CNAME","name":"api","content":"fastify-standby.admatrix.vn","ttl":60,"proxied":true}'
```
- Thời gian thực thi: **3 phút**.
- Thời gian DNS hội tụ: **dưới 60 giây**.

#### Bước 4: Reconcile & Đồng Bộ Dữ Liệu Bù (T+10m -> T+15m)
Bật lại Reconcile Sweeper trên Fastify để quét và bù các tin nhắn chưa được xử lý trong khoảng thời gian chuyển tiếp:
```bash
curl -X POST http://zalocrm-fastify-backend:3000/api/admin/goclaw-bridge/reconcile/resume   -H "Authorization: Bearer $INTERNAL_OPS_TOKEN"
```
- Quét các tin nhắn trong cửa sổ 30 phút gần nhất (`MAX_RECONCILE_WINDOW_MS`).
- Đảm bảo 100% cuộc trò chuyện không bị thất thoát thông tin.
- Hoàn tất quy trình hoàn nguyên trong tối đa **15 phút**.

---

## 7. Kế Hoạch Hậu Chuyển Đổi & Dọn Dẹp Mã Nguồn (Decommissioning)

Sau **7 ngày** chạy ổn định 100% trên `omni-core` không phát sinh sự cố P0/P1:
1. **Lưu trữ Log & Metrics:** Kết xuất báo cáo đối soát tỷ lệ tin nhắn thành công giữa hai phiên bản.
2. **Dừng Container Fastify goclaw-bridge:** Tắt hoàn toàn service Node.js.
3. **Dọn dẹp mã nguồn:**
   - Xoá thư mục `ZaloCRM/backend/src/modules/integrations/providers/goclaw-bridge/`.
   - Gỡ bỏ các dependency không còn dùng trong `package.json` (ví dụ `node-cron`, các helper không liên quan).
   - Đóng toàn bộ các GitHub Issue liên quan đến giai đoạn chuyển đổi.
4. **Cập nhật tài liệu kiến trúc:** Đánh dấu `SPEC-ARCH-GOSO-001` đến `SPEC-ARCH-GOSO-004` là `ACTIVE / PRODUCTION VERIFIED`.
