# Deal & E-commerce — API Mapping Chi Tiết (85 Routes)

> Bounded Context: `internal/deal`  
> Phân rã từ backend Fastify (`modules/deals`, `modules/quotes`, `modules/products`, `modules/order-store`, `modules/order-platform`) sang Go Clean Architecture.

---

## 1. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Flat handlers per resource phục vụ Frontend Web/SPA:
  - `deals_handler.go`: CRUD Deals, chuyển stage Kanban, duyệt Won/Lost (`/api/v1/deals/*`).
  - `deal_stages_handler.go`: Cấu hình Pipeline & Stages (`/api/v1/deal-stages/*`).
  - `quotes_handler.go`: Soạn báo giá, versioning, phê duyệt chiết khấu (`/api/v1/quotes/*`).
  - `products_handler.go`: Danh mục sản phẩm, tồn kho (`/api/v1/products/*`).
  - `pricebook_handler.go`: Bảng giá, chính sách giá sàn (`/api/v1/pricebook/*`).
  - `orders_handler.go`: Đơn hàng đa nền tảng Pancake/KiotViet (`/api/v1/order-store/*`, `/api/v1/pancake/*`).
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `DealService` và `OrderService` cho Inter-service RPC và background syncing daemons.

---

## 2. Bảng Đối Chiếu Chi Tiết Từng Endpoint

### 2.1 Deals & Pipelines (30 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/deals` | `deals_handler.go:ListDeals` | `queries.ListDeals` | `ListDeals` |
| `POST` | `/api/v1/deals` | `deals_handler.go:CreateDeal` | `commands.CreateDeal` | `CreateDeal` |
| `GET` | `/api/v1/deals/:id` | `deals_handler.go:GetDeal` | `queries.GetDealDetail` | `GetDealDetail` |
| `PATCH` | `/api/v1/deals/:id` | `deals_handler.go:UpdateDeal` | `commands.UpdateDeal` | `UpdateDeal` |
| `DELETE` | `/api/v1/deals/:id` | `deals_handler.go:DeleteDeal` | `commands.DeleteDeal` | `DeleteDeal` |
| `POST` | `/api/v1/deals/:id/stage` | `deals_handler.go:ChangeStage` | `commands.TransitionDealStage` | `TransitionDealStage` |
| `POST` | `/api/v1/deals/:id/win` | `deals_handler.go:MarkWon` | `commands.MarkDealWon` | `MarkDealWon` |
| `POST` | `/api/v1/deals/:id/lost` | `deals_handler.go:MarkLost` | `commands.MarkDealLost` | `MarkDealLost` |
| `GET` | `/api/v1/deal-stages` | `deal_stages_handler.go:ListStages`| `queries.ListPipelineStages` | `ListPipelineStages` |
| `POST` | `/api/v1/deal-stages` | `deal_stages_handler.go:CreateStage`| `commands.CreatePipelineStage`| `CreatePipelineStage` |
| `PUT` | `/api/v1/deal-stages/reorder`| `deal_stages_handler.go:Reorder` | `commands.ReorderStages` | `ReorderStages` |

### 2.2 Quotes & Pricebook (25 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/quotes` | `quotes_handler.go:ListQuotes` | `queries.ListQuotes` | `ListQuotes` |
| `POST` | `/api/v1/quotes` | `quotes_handler.go:CreateQuote` | `commands.DraftQuote` | `DraftQuote` |
| `GET` | `/api/v1/quotes/:id` | `quotes_handler.go:GetQuote` | `queries.GetQuoteDetail` | `GetQuoteDetail` |
| `POST` | `/api/v1/quotes/:id/approve` | `quotes_handler.go:ApproveQuote` | `commands.ApproveQuoteDiscount`| `ApproveQuoteDiscount`|
| `POST` | `/api/v1/quotes/:id/send` | `quotes_handler.go:SendQuote` | `commands.SendQuoteToCustomer` | `SendQuoteToCustomer` |
| `GET` | `/api/v1/quotes/:id/pdf` | `quotes_handler.go:ExportPDF` | `queries.GenerateQuotePDF` | `GenerateQuotePDF` |
| `GET` | `/api/v1/pricebook` | `pricebook_handler.go:List` | `queries.ListPricebookEntries`| `ListPricebookEntries`|
| `PUT` | `/api/v1/pricebook/:id` | `pricebook_handler.go:Update` | `commands.UpdatePricebookEntry`| `UpdatePricebookEntry`|

### 2.3 Products & Multi-channel Orders (30 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/products` | `products_handler.go:List` | `queries.ListProducts` | `ListProducts` |
| `POST` | `/api/v1/products` | `products_handler.go:Create` | `commands.CreateProduct` | `CreateProduct` |
| `GET` | `/api/v1/products/:id` | `products_handler.go:Get` | `queries.GetProductDetail` | `GetProductDetail` |
| `PATCH` | `/api/v1/products/:id` | `products_handler.go:Update` | `commands.UpdateProduct` | `UpdateProduct` |
| `POST` | `/api/v1/products/sync` | `products_handler.go:SyncKiotViet` | `commands.SyncKiotVietProducts`| `SyncKiotVietProducts`|
| `GET` | `/api/v1/order-store/orders` | `orders_handler.go:ListOrders` | `queries.ListStoreOrders` | `ListStoreOrders` |
| `POST` | `/api/v1/order-store/orders` | `orders_handler.go:CreateOrder`| `commands.CreateStoreOrder` | `CreateStoreOrder` |
| `POST` | `/api/v1/pancake/webhook` | `orders_handler.go:PancakeWebhook`| `commands.ProcessPancakeOrder` | `ProcessPancakeOrder` |
