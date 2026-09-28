# Thiết Kế Chi Tiết & Bảng Ánh Xạ DDD: Deals & Order Store Bounded Context
## Modules Cũ: `deals`, `order-store`, `quotes`, `products` (69 REST Endpoints) ➔ Go Clean DDD

> **Căn cứ nghiệp vụ:** Spec 028b (Đơn hàng đa nguồn), Spec 041/041b (Báo giá dịch vụ), Spec 050/050b (Tồn kho KiotViet), Spec 057 (Kho đơn hàng & Quét nợ).

---

## 1. Domain Modeling (Tactical DDD)

### 1.1 Invariants & Business Rules
1. **Sales Deal Lifecycle**:
   - Aggregate Root: `Deal`.
   - Các Stage: `lead`, `qualified`, `proposal_sent`, `negotiation`, `won`, `lost`.
   - Invariant: Deal khi chuyển sang `won` phải tự động kích hoạt domain event `DealWonEvent` để tạo hoặc nâng hạng contact (`contact-won-promote`).
   - Invariant: `DealValue` không được âm. Đơn vị tiền tệ chuẩn hóa là VND (số nguyên int64 tránh lỗi làm tròn float).
2. **Product Catalog & Inventory (Spec 050/050b)**:
   - Aggregate Root: `Product`.
   - Tìm kiếm sản phẩm: Chuẩn hóa bỏ dấu tiếng Việt (unaccent/lowercase), tìm theo mã SKU hoặc barcode trước, nếu không khớp mới đối sánh mờ theo tên sản phẩm.
   - Trạng thái tồn kho: `in_stock`, `low_stock`, `out_of_stock`.
3. **Order Store & Debt Sweep (Spec 057)**:
   - Aggregate Root: `MirroredOrder`.
   - Nguồn đơn hàng (`source`): `kiotviet`, `pancake`, `manual`, `pos`.
   - Invariant: Đơn hàng lưu vết `purchase_key` duy nhất để chống ghi nhận trùng (idempotent).
   - Invariant: Khi phát hiện đơn hàng bị thu hồi (`return`) hoặc trả tiền nợ (`debt_paid`), cập nhật trường `paid_amount` và sinh event `OrderDebtSettledEvent`.
4. **Quotes & Money Words (Spec 041/041b)**:
   - Aggregate Root: `Quote`.
   - Invariant: Báo giá có hạn sử dụng (`valid_until`). Sau ngày này, trạng thái tự chuyển sang `expired`.
   - Invariant: Đọc tiền thành chữ tiếng Việt (`money-words`) phải được tính toán chính xác từ `TotalAmount` và lưu cố định vào snapshot của Quote khi chốt phát hành.

---

### 1.2 Aggregates & Value Objects (Go Code Structure)

```go
// internal/deal/domain/deal.go
type Deal struct {
    id          uuid.UUID
    tenantID    uuid.UUID
    contactID   uuid.UUID
    assignedID  uuid.UUID
    title       string
    value       int64      // Tiền VND
    stage       DealStage
    probability int        // 0 - 100%
    closedAt    *time.Time
    lostReason  string
    createdAt   time.Time
    updatedAt   time.Time
}

// internal/order/domain/mirrored_order.go
type MirroredOrder struct {
    id             uuid.UUID
    tenantID       uuid.UUID
    contactID      uuid.UUID
    externalID     string // Mã đơn KiotViet/Pancake
    source         OrderSource
    totalAmount    int64
    paidAmount     int64
    debtAmount     int64
    status         OrderStatus
    orderLinesJSON []byte
    createdAt      time.Time
    updatedAt      time.Time
}

// internal/quote/domain/quote.go
type Quote struct {
    id          uuid.UUID
    tenantID    uuid.UUID
    dealID      *uuid.UUID
    contactID   uuid.UUID
    code        string
    items       []QuoteItem
    totalAmount int64
    amountWords string // Số tiền bằng chữ
    status      QuoteStatus
    validUntil  time.Time
    createdAt   time.Time
}
```

---

## 2. Bảng Ánh Xạ REST API ➔ Go CQRS Handlers (Zero Frontend Breakage)

| Method & Route Node.js | Controller / Service Cũ | Go CQRS Handler | Repository Port | Payload / Response Fields Match |
|---|---|---|---|---|
| `GET /api/v1/deals` | `deal-routes.ts` | `queries.ListDealsHandler` | `dealRepo.List(ctx, filter)` | `[{ id, title, value, stage, contactId, contact: { displayName, phone } }]` |
| `POST /api/v1/deals` | `deal-routes.ts` | `commands.CreateDealHandler` | `dealRepo.Save(...)` | Req: `{ title, value, stage, contactId, assignedId }`<br>Res: `{ deal: { ... } }` |
| `PATCH /api/v1/deals/:id/stage` | `deal-routes.ts` | `commands.TransitionDealStageHandler` | `dealRepo.Save(...)` | Req: `{ stage, lostReason? }`<br>Res: `{ success: true, deal: { ... } }` |
| `GET /api/v1/products` | `product-routes.ts` | `queries.ListProductsHandler` | `productRepo.Search(ctx, query)` | `[{ id, sku, name, price, stockQuantity, category }]` |
| `POST /api/v1/products/sync-kiotviet` | `product-sync-routes.ts` | `commands.SyncKiotVietCatalogHandler` | `productSyncService.Trigger(...)` | Res: `{ status: "sync_queued", job_id: "..." }` |
| `GET /api/v1/order-store/orders` | `order-store-routes.ts` | `queries.ListMirroredOrdersHandler` | `orderRepo.List(ctx, filter)` | `[{ id, externalId, source, totalAmount, paidAmount, status, contactId }]` |
| `POST /api/v1/order-store/link` | `order-link-routes.ts` | `commands.LinkOrderToContactHandler` | `orderRepo.LinkContact(...)` | Req: `{ orderId, contactId }`<br>Res: `{ success: true }` |
| `GET /api/v1/quotes` | `quote-routes.ts` | `queries.ListQuotesHandler` | `quoteRepo.List(ctx, filter)` | `[{ id, code, totalAmount, status, validUntil }]` |
| `POST /api/v1/quotes` | `quote-routes.ts` | `commands.CreateQuoteHandler` | `quoteRepo.Save(...)` | Req: `{ contactId, dealId?, items: [...] }`<br>Res: `{ quote: { id, code, amountWords, ... } }` |
| `GET /api/v1/quotes/:id/pdf` | `quote-pdf-routes.ts` | `queries.GenerateQuotePDFHandler` | `quotePdfService.Render(...)` | Output: `application/pdf` binary stream |
