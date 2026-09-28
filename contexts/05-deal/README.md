# Deal & E-commerce Bounded Context (`internal/deal`)

> Bounded Context phụ trách quản lý Phễu bán hàng (Kanban Deal Stages), Báo giá (Quotes), Danh mục sản phẩm (Products), Bảng giá động (Pricebook), Kho đơn hàng đa kênh (Order Store), và Đồng bộ Pancakes POS.

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/deal` |
| **Tổng số Endpoints** | **85** (Deals 28, Quotes 14, Products 18, Pricebook 10, Order-Store/Pancake 15) |
| **Aggregate Roots** | `Deal` (Sales Pipeline), `Quote` (Báo giá), `Product` (Sản phẩm), `Pricebook` (Bảng giá), `OrderStore` (Đơn hàng) |
| **Entities con** | `DealStageHistory`, `QuoteItem`, `ProductVariant`, `OrderLineItem` |
| **Value Objects** | `MoneyVO` (VND/USD + Amount int64), `DiscountVO`, `DealStatus`, `OrderStatus` |
| **Giao thức** | Connect-RPC (`deal.v1.DealService`, `deal.v1.OrderService`), REST (`/api/v1/deals/*`, `/api/v1/quotes/*`, `/api/v1/order-store/*`) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`mapping-deals-and-orders.md`](./mapping-deals-and-orders.md) | Ánh xạ chi tiết toàn bộ endpoints: Deals, Quotes, Products, Pricebook, Order Store và Pancake webhook integration. |

---

## 3. Invariants & Nghiệp Vụ Cốt Lõi

1. **State Machine của Deal**: `Lead` ➔ `Qualified` ➔ `Proposal` ➔ `Negotiation` ➔ `Won` / `Lost`.
   - Chuyển `Won`: Bắt buộc gắn `ContactID` hợp lệ và tổng giá trị deal > 0.
   - Chuyển `Lost`: Bắt buộc cung cấp `LostReason` (lý do thất bại).
2. **Quote Lifecycle**: `Draft` ➔ `Sent` ➔ `Accepted` / `Rejected` ➔ `Expired`.
   - Khi Quote `Accepted`, tự động cập nhật giá trị Deal và trigger event tạo đơn hàng nháp.
3. **Pancake POS Sync**:
   - Webhook từ Pancake tự động đối soát SĐT với Customer BC để liên kết đơn hàng với Golden Record.
