# ADR — Storefront: Bounded Context Trong Repo Hay Service Riêng

> **Mã tài liệu:** `ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE`
> **Trạng thái:** ACCEPTED
> **Ngày chốt:** 2026-11
> **Bounded Context liên quan:** `internal/storefront` (BC 9 `(planned)`), `internal/deal` (BC 5), `internal/serviceapi` (BC 8), `internal/identity` (BC 1)
> **Quy tắc ngôn ngữ:** Tiếng Việt. Tên package, bảng, endpoint giữ nguyên tiếng Anh.

---

## 1. Bối Cảnh

Omni Core đang là modular monolith 8 BC, 615 endpoint, một binary `cmd/server`, mux tại `cmd/server/main.go:348`, listener plaintext tại `pkg/httpserver/server.go:73` (`s.server.ListenAndServe()`, chưa có h2c/TLS).

Nghiệp vụ bán hàng cho shopper bên ngoài chưa tồn tại: `grep -rn "cart" internal/ --include=*.go | wc -l` trả `0`, không có bảng payment/shipment/reservation nào, coupon không có trong `internal/marketing`.

Đã có sẵn vài mảnh ghép liên quan nhưng phân mảnh:

- Tồn kho: `warehouse_stocks` — `pkg/migrate/migrations/000077_schema_drift_prod.up.sql:100`.
- Đơn hàng: 4 bảng order-shaped, trong đó `mirrored_orders` bị khai báo **hai lần** (`migrations/000008_customer_ext_tables.up.sql:52` và `migrations/000009_deals_orders_tables.up.sql:25`).
- Cổng ra ngoài: `POST /api/v1/service/orders` tại `internal/serviceapi/interfaces/http/mcp_tools_handler.go:48`, xác thực qua `api_keys` (`pkg/migrate/migrations/000090_restore_dropped_bc_schema.up.sql:83`).
- Catalog công khai: `ListPublicPlans` tại `internal/deal/infrastructure/product/public_pricebook.go:27`.

Câu hỏi kiến trúc: **đặt storefront ở đâu?**

---

## 2. Các Phương Án Đã Cân Nhắc

### Phương án A — Bounded Context mới trong repo (ĐÃ CHỌN)

`internal/storefront/{domain,application,infrastructure,interfaces}`, mount trong `cmd/server`, dùng chung một DB, giao tiếp với `deal` qua Connect RPC nội bộ + outbox.

**Ưu điểm**

1. Không có độ trễ mạng cho luồng nóng nhất — đọc giá, kiểm tra tồn kho, giữ hàng.
2. Một transaction boundary cho cart/checkout; reservation vẫn tách vì thuộc `deal`, nhưng bù trừ trong cùng DB nên job hết hạn chạy chính xác.
3. Deploy một container như hiện tại; không thêm service discovery, không thêm secret distribution.
4. Codegen đã sẵn: `buf.gen.yaml` sinh `gen/go` và `gen/ts`, chỉ cần thêm `api/proto/storefront/v1/`.
5. Tận dụng nguyên hạ tầng có sẵn: `pkg/outbox`, `pkg/resilience`, `pkg/logger`, `pkg/errors`, `pkg/pagination`, `pkg/rpcauth`.
6. Ranh giới vẫn cưỡng chế được bằng quy tắc import — đúng cách đã làm với BC 7/8.

**Nhược điểm**

1. DB dùng chung, nên "database-per-service" chỉ là quy ước, không phải ràng buộc vật lý.
2. Một lỗi deploy ảnh hưởng cả CRM và storefront.
3. Traffic công khai của storefront đi vào cùng process với CRM nội bộ — bề mặt tấn công rộng hơn.
4. Không thể scale riêng khi shopper tăng đột biến.

### Phương án B — Service riêng, sở hữu cart/checkout, DB riêng

Binary mới `cmd/storefront`, DB riêng, gọi `deal` qua Connect RPC.

**Ưu điểm**

1. Cô lập blast radius: storefront sập không kéo CRM sập.
2. Scale độc lập theo traffic shopper.
3. Bề mặt tấn công công khai tách khỏi CRM nội bộ — đây là lợi ích bảo mật thật, không chỉ là khẩu hiệu.
4. Ranh giới vật lý, không thể vi phạm bằng một dòng import.

**Nhược điểm**

1. Phải giải bài toán nhất quán phân tán ngay từ ngày đầu: giữ hàng ở `deal` nhưng cart ở service khác, job hết hạn chạy ở đâu, ai bù trừ khi một bên chết.
2. Cần service discovery, secret distribution, tracing xuyên service, hai pipeline CI, hai bộ migration.
3. Chi phí hạ tầng và chi phí vận hành tăng trước khi có doanh thu.
4. Không có dữ liệu traffic thật để biết ngưỡng tách — tách bây giờ là đoán.

### Phương án C — Storefront sở hữu toàn bộ, kể cả product/order/stock

Một BC ôm hết: catalog, giỏ, đơn, tồn kho, thanh toán.

**Ưu điểm**

1. Một mô hình, một nơi, không cần giao tiếp liên BC.
2. Nhanh nhất để viết bản thử đầu tiên.

**Nhược điểm — và đây là lý do loại**

1. **Tạo God Context.** Đây đúng lỗi đã xảy ra và đã bị loại bỏ một lần: `architecture/BOUNDED-CONTEXT-BC7-AIAGENT-VS-BC8-SERVICEAPI.md` ghi nhận `internal/service` từng ôm Ingress Gateway, MCP Tools, Webhooks, DLQ và toàn bộ Analytics, và phải tách ra.
2. **Hai chủ cho `warehouse_stocks.quantity`.** `deal` đang sở hữu và đang UPDATE (`internal/deal/infrastructure/product/postgres_repository.go:39`). Thêm chủ thứ hai là công thức chắc chắn của oversell.
3. **Nhân bản order lần thứ năm.** Đã có 4 bảng order-shaped, một trong đó khai báo hai lần. Thêm bảng nữa là biến nợ kỹ thuật thành không thể trả.
4. **Hai mô hình giá.** `deal` đã có `pricebooks`/`pricebook_items`/`pricebook_rules` với `ListPublicPlans`. Storefront tự quản giá sẽ lệch ngay lần đổi giá đầu tiên.
5. **Shopper lẫn staff.** Nếu ôm luôn danh tính, áp lực đưa shopper vào bảng `users` là rất lớn, và lúc đó mọi báo cáo RBAC sai.

---

## 3. Quyết Định

**Chọn Phương án A.**

Cụ thể đã chốt:

1. BC thứ 9 tên `storefront`, thư mục `internal/storefront`, mount trong `cmd/server`. Không tách binary ở giai đoạn này.
2. `storefront` **sở hữu**: `carts`, `cart_items`, `checkout_sessions`, `payment_intents` `(planned)`, `shopper_accounts`, `coupons`, `coupon_redemptions`.
3. `storefront` **không sở hữu**: `products`, `pricebooks`, order (4 bảng hiện có), `contacts`/`leads`, và **`warehouse_stocks.quantity`**.
4. `stock_reservations` thuộc **`deal`**, không thuộc `storefront` — vì nó là mặt đối diện bắt buộc của `warehouse_stocks.quantity`, và chỉ `deal` được ghi tồn kho.
5. Transport cho client: **Connect**. Raw gRPC và h2c để task riêng, không bật trong phạm vi này.
6. Frontend storefront là **app Next.js riêng**. `omni-web-next` là admin nội bộ, không đụng vào.
7. `tenant_id` luôn lấy từ credential/claims, **không bao giờ** từ request body.

### 3.1 Vì sao không chọn B ngay

Lý do quyết định không phải "monolith tốt hơn microservice". Lý do là: **chưa có dữ liệu để biết ngưỡng tách, và chưa có bài toán nhất quán phân tán nào được giải.**

Tách service bây giờ nghĩa là phải trả lời ngay: reservation ở `deal`, cart ở storefront-service, vậy khi storefront-service chết giữa `Reserve` và `PlaceOrder` thì ai release? Chưa có câu trả lời dựa trên vận hành thật, chỉ có phỏng đoán. Ở Phương án A, câu trả lời là một job SQL trên cùng DB — đúng và rẻ.

Đồng thời, `architecture/MODULAR-MONOLITH-TO-MICROSERVICES.md` §2 đã đặt nguyên tắc **MonolithFirst**: chỉ tách khi có nghẽn thật (I/O socket, CPU/RAG, hoặc team riêng), không tách theo cảm giác.

### 3.2 Vì sao Phương án C bị loại dứt khoát

Phương án C không phải "đơn giản hơn". Nó là **hai chủ trên một cột dữ liệu** và **bảng order thứ năm**. Cả hai đều là lỗi không thể sửa bằng refactor nhỏ về sau.

---

## 4. Hệ Quả

### 4.1 Hệ quả tích cực

1. Luồng mua hàng không có hop mạng nào; p99 của `Reserve` phụ thuộc DB, không phụ thuộc service khác.
2. Reservation + commit có thể bù trừ bằng một job SQL duy nhất, chạy trên cùng instance.
3. Tái dùng nguyên `pkg/*` — không viết lại retry, circuit breaker, outbox, logging.
4. Một pipeline CI, một bộ migration, một lần deploy.

### 4.2 Hệ quả tiêu cực — chấp nhận có ý thức

1. **Traffic công khai đi vào cùng process với CRM.** Giảm thiểu: rate limit theo IP và theo tenant ở tầng `interfaces`, tách route prefix, không expose route admin qua cùng hostname công khai khi lên production.
2. **Không scale riêng.** Nếu shopper tăng đột biến, phải scale cả process. Đây là đánh đổi có ý thức, gắn với điều kiện chuyển đổi ở §5.
3. **DB dùng chung.** Ranh giới dữ liệu là quy ước. Giảm thiểu: không tạo FK liên BC, cưỡng chế bằng review + script kiểm tra import.

### 4.3 Việc phải làm để quyết định này không bị xói mòn

1. Không cho `internal/storefront` import `internal/deal/domain/**` hay `internal/customer/domain/**`. Kiểm bằng script CI, không bằng lời hứa.
2. Không tạo foreign key vật lý liên BC. `product_id`, `contact_id`, `order_id` là `uuid.UUID` thô.
3. Mọi UPDATE `warehouse_stocks.quantity` phải nằm trong `internal/deal`. Review chặn tuyệt đối.
4. Không thêm bảng order thứ năm.

---

## 5. Điều Kiện Để Đổi Sang Service Riêng

Quyết định này **có hạn**. Chuyển sang Phương án B khi **bất kỳ** điều kiện sau đúng và giữ đúng liên tục, không phải một lần spike:

| # | Điều kiện | Ngưỡng đề xuất | Vì sao ngưỡng này |
|---|---|---|---|
| 1 | **PCI DSS** — payment đi vào phạm vi thẻ thật, cần cô lập CDE | Khi payment chuyển từ DEFERRED sang thực thi và chạm dữ liệu thẻ | Phạm vi PCI bao quanh service chứ không bao quanh cả monolith CRM. Đây là lý do **mạnh nhất** trong danh sách. |
| 2 | **Traffic spike** — tải shopper làm chậm CRM nội bộ | p99 của route CRM nội bộ tăng > 2× so với baseline khi storefront cao điểm, kéo dài > 30 ngày | Đo được, không phỏng đoán |
| 3 | **Team riêng** — có team sở hữu storefront | Team có release cadence riêng và bị chặn bởi CI của core | Đúng tiêu chí Team Topology trong `MODULAR-MONOLITH-TO-MICROSERVICES.md` §2 |
| 4 | **Tải DB** — storefront chiếm phần lớn I/O DB | > 40% thời gian DB của instance đến từ bảng `storefront` | Chỉ cần DB riêng, chưa chắc cần service riêng |
| 5 | **Blast radius** — storefront sập kéo CRM sập, đã xảy ra thật | ≥ 2 sự cố production trong 1 quý | Bằng chứng vận hành, không phải lo xa |

### 5.1 Runbook khi đổi

Theo `architecture/MODULAR-MONOLITH-TO-MICROSERVICES.md` §4, 4 bước:

1. **Tách DB trước, tách service sau.** Chuyển bảng `storefront` sang schema/instance riêng, vẫn trong cùng process. Đây là bước rẻ nhất và phát hiện mọi FK ẩn.
2. **Gỡ import chéo.** Chuyển mọi lời gọi `deal` sang Connect RPC client, kể cả khi vẫn cùng process.
3. **Tách binary.** `cmd/storefront`, mount riêng, cùng contract.
4. **Chuyển traffic.** Theo sau ingress, giữ `cmd/server` làm fallback trong một sprint.

Bước 1 và 2 làm được **ngay bây giờ** mà không cần quyết định tách service. Nếu cần giảm rủi ro của Phương án A, hãy làm bước 1–2 sớm thay vì tách service sớm.

---

## 6. Phương Án Đã Xem Xét Và Loại Khác

| Phương án | Vì sao loại |
|---|---|
| Đặt storefront trong `internal/deal` | `deal` đã 85 endpoint; thêm cart/checkout/shopper sẽ vượt xa ngưỡng God Context. Hai mô hình giá và hai vòng đời dữ liệu khác nhau. |
| Đặt storefront trong `internal/serviceapi` | `serviceapi` là **cổng** cho hệ ngoài, 40 endpoint, không sở hữu nghiệp vụ. Nhét nghiệp vụ vào cổng là đảo ngược kiến trúc. |
| Dùng bảng `users` cho shopper | `users` là danh bạ nhân viên (`tenant_id`, `role` default `'agent'`). Shopper lẫn vào sẽ làm sai mọi truy vấn RBAC và kế thừa đường đăng nhập nội bộ. |
| Mượn `contacts` của `customer` làm shopper | `contacts` là khách hàng **trong CRM của tenant**, do sales quản lý. Shopper là người lạ tự đăng ký, chưa chắc là contact. Gộp sẽ làm bẩn danh sách khách hàng. |
| Dùng `quotes` của `deal` làm giỏ hàng | Quote là bản chào giá do sales soạn cho một contact cụ thể. Cart là tập hàng tạm của người lạ. Khác chủ thể, khác vòng đời, khác quyền. |

---

## 7. Tài Liệu Liên Quan

- [`STOREFRONT-BC9-SPEC.md`](./STOREFRONT-BC9-SPEC.md) — đặc tả BC 9.
- [`FRONTEND-STOREFRONT-NEXTJS-SPEC.md`](./FRONTEND-STOREFRONT-NEXTJS-SPEC.md) — app Next.js riêng.
- [`../contexts/09-storefront/README.md`](../contexts/09-storefront/README.md) — trách nhiệm, invariant, event.
- [`MODULAR-MONOLITH-TO-MICROSERVICES.md`](./MODULAR-MONOLITH-TO-MICROSERVICES.md) — điều kiện và runbook tách service.
- [`BOUNDED-CONTEXT-BC7-AIAGENT-VS-BC8-SERVICEAPI.md`](./BOUNDED-CONTEXT-BC7-AIAGENT-VS-BC8-SERVICEAPI.md) — tiền lệ loại bỏ God Context.
- [`MASTER-ARCHITECTURE-BLUEPRINT.md`](./MASTER-ARCHITECTURE-BLUEPRINT.md) — bản đồ tổng thể.
- [`ADR-LEAD-VS-CUSTOMER-LIFECYCLE-SPEC.md`](./ADR-LEAD-VS-CUSTOMER-LIFECYCLE-SPEC.md) — tiền lệ định dạng ADR trong repo.
