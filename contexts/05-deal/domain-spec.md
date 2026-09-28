# Deal & E-commerce — Đặc Tả Domain & Invariants

> Bounded Context: `internal/deal`  
> Trách nhiệm: Quản lý Cơ hội bán hàng (Deals), Đường ống bán hàng 6 giai đoạn (Sales Pipeline), Báo giá & Chiết khấu (Quotes & Pricebook), Danh mục sản phẩm (Products), và Tích hợp đơn hàng đa nền tảng (Order Store / Pancake / KiotViet).

---

## 1. Ubiquitous Language & Core Aggregates

### 1.1 Aggregate Root: `Deal`
Đại diện cho một thương vụ đàm phán với khách hàng, có giá trị ước tính và tiến trình qua pipeline.

```go
package domain

import (
	"errors"
	"time"
	"github.com/google/uuid"
)

type DealLifecycle string
const (
	LifecycleOpen DealLifecycle = "open"
	LifecycleWon  DealLifecycle = "won"
	LifecycleLost DealLifecycle = "lost"
)

type Deal struct {
	id             uuid.UUID
	tenantID       uuid.UUID
	dealCode       string        // Mã chuẩn: D-YYYYMMDD-XXXX
	title          string
	contactID      uuid.UUID
	pipelineID     uuid.UUID
	stageID        uuid.UUID
	assignedUserID uuid.UUID
	lifecycle      DealLifecycle
	estimatedValue int64         // Tiền VNĐ (VND Money pattern)
	probability    int           // 0..100%
	weightedValue  int64         // estimatedValue * probability / 100
	quoteSentCount int
	lostReason     *string       // gia, doi_thu, het_nhu_cau, mat_lien_lac, khac
	wonOrderID     *uuid.UUID    // Gắn với Order khi chốt Won
	lockedAt       *time.Time    // Khi đã Won/Lost, deal bị khóa
	lastActivityAt time.Time
	createdAt      time.Time
	updatedAt      time.Time
}
```

#### Invariants & Business Rules:
1. **Pipeline 6 Stages**: Mặc định gồm: `Khai thác (10%)` -> `Tư vấn (30%)` -> `Báo giá (60%)` -> `Đàm phán (80%)` -> `Chốt Won (100%)` hoặc `Chốt Lost (0%)`.
2. **Win Condition Invariant**: Không thể chuyển Deal sang `Won` nếu chưa có Đơn hàng liên kết (`wonOrderID != nil`) hoặc Báo giá đã được phê duyệt (`approvedQuote`).
3. **Lost Reason Requirement**: Bắt buộc phải có lý do thất bại (`lostReason`) thuộc danh mục chuẩn khi chuyển sang `Lost`.
4. **Immutability when Locked**: Khi Deal đã rơi vào `won` hoặc `lost` và bị khóa (`lockedAt != nil`), nghiêm cấm chỉnh sửa giá trị, giai đoạn hay xóa Deal trừ khi có quyền `deal.admin_reopen`.
5. **Weighted Value Invariant**: `weightedValue` luôn tự động tính toán: `(estimatedValue * probability) / 100`.

---

### 1.2 Aggregate Root: `Quote` (Báo Giá)

```go
type QuoteStatus string
const (
	QuoteDraft     QuoteStatus = "draft"
	QuotePending   QuoteStatus = "pending_approval" // Vượt trần chiết khấu
	QuoteApproved  QuoteStatus = "approved"
	QuoteSent      QuoteStatus = "sent"
	QuoteAccepted  QuoteStatus = "accepted"
	QuoteRejected  QuoteStatus = "rejected"
	QuoteExpired   QuoteStatus = "expired"
)

type Quote struct {
	id             uuid.UUID
	tenantID       uuid.UUID
	dealID         uuid.UUID
	quoteCode      string        // Q-YYYYMMDD-XXXX
	version        int           // Version 1, 2, 3...
	status         QuoteStatus
	items          []QuoteItem
	subtotal       int64
	discountAmount int64
	discountRate   float64       // %
	taxAmount      int64
	totalAmount    int64
	requiresCEO    bool          // Chiết khấu > 20% yêu cầu CEO duyệt
	approvedBy     *uuid.UUID
	approvedAt     *time.Time
	validUntil     time.Time
	createdAt      time.Time
}

type QuoteItem struct {
	id          uuid.UUID
	productID   uuid.UUID
	productName string
	sku         string
	quantity    int
	unitPrice   int64
	discount    int64
	finalPrice  int64
}
```

#### Invariants:
1. **Floor Price Rule**: Không được phép báo giá thấp hơn Giá sàn (`floor_price`) của sản phẩm trong Pricebook trừ khi có Approval từ Giám đốc.
2. **Sequential Versioning**: Khi sửa đổi báo giá đã gửi (`sent`), hệ thống bắt buộc tạo bản sao mới với số `version = version + 1`. Không ghi đè báo giá đã gửi.

---

### 1.3 Entity: `Product` & `Pricebook`

```go
type ProductKind string
const (
	ProductPhysical ProductKind = "physical"
	ProductService  ProductKind = "service"
)

type Product struct {
	id          uuid.UUID
	tenantID    uuid.UUID
	sku         string
	name        string
	kind        ProductKind
	basePrice   int64
	floorPrice  int64        // Giá tối thiểu không được bán dưới
	costPrice   int64
	unit        string
	stockCount  int
	isActive    bool
	syncedFrom  *string      // kiotviet, pancake, sap
	createdAt   time.Time
}
```

---

## 2. Validated Aggregate Wrapper

```go
package domain

type ValidatedDeal struct {
	inner *Deal
}

func (d *Deal) Validate() (*ValidatedDeal, error) {
	if d.tenantID == uuid.Nil {
		return nil, errors.New("deal.validation: tenant_id is required")
	}
	if d.contactID == uuid.Nil {
		return nil, errors.New("deal.validation: contact_id is required")
	}
	if d.title == "" {
		return nil, errors.New("deal.validation: title is required")
	}
	if d.estimatedValue < 0 {
		return nil, errors.New("deal.validation: estimated_value cannot be negative")
	}
	if d.probability < 0 || d.probability > 100 {
		return nil, errors.New("deal.validation: probability must be between 0 and 100")
	}
	return &ValidatedDeal{inner: d}, nil
}

func (v *ValidatedDeal) Deal() *Deal {
	return v.inner
}
```
