# Marketing & Automation — Đặc Tả Domain & Invariants

> Bounded Context: `internal/marketing`  
> Trách nhiệm: Quản lý Hệ thống Nhãn đa chiều (Tags & Tag Groups), Chiến dịch tiếp cận tự động (Outreach Campaigns, Broadcasts), Chuỗi chăm sóc tự động (Marketing Sequences, Triggers), và Chấm điểm tương tác (Engagement Scoring).

---

## 1. Ubiquitous Language & Core Aggregates

### 1.1 Aggregate Root: `Tag` & `TagGroup`
Hệ thống nhãn thông minh phân cấp hỗ trợ gắn nhãn tự động dựa trên hành vi tương tác và chat.

```go
package domain

import (
	"errors"
	"time"
	"github.com/google/uuid"
)

type TagGroupKind string
const (
	GroupKindManual     TagGroupKind = "manual"      // Nhân viên tự gắn
	GroupKindAutomated  TagGroupKind = "automated"   // AI / Rule engine tự gắn
	GroupKindSystem     TagGroupKind = "system"      // Cung-chăm, Trạng thái Zalo
)

type Tag struct {
	id          uuid.UUID
	tenantID    uuid.UUID
	groupID     uuid.UUID
	name        string
	colorHex    string
	description string
	isSystem    bool
	usageCount  int
	createdAt   time.Time
}

type TagGroup struct {
	id          uuid.UUID
	tenantID    uuid.UUID
	name        string
	kind        TagGroupKind
	exclusive   bool          // 1 khách chỉ được có 1 tag trong group này (ví dụ: Giai đoạn chăm)
	createdAt   time.Time
}
```

#### Invariants:
1. **Tag Exclusivity**: Nếu `TagGroup.exclusive == true`, khi gắn nhãn mới thuộc nhóm này cho khách hàng, hệ thống bắt buộc tự động gỡ bỏ các nhãn cũ cùng nhóm.
2. **System Tag Protection**: Nhãn hệ thống (`isSystem == true`) không được phép đổi tên hoặc xóa.

---

### 1.2 Aggregate Root: `Campaign` (Broadcast / Outreach)

```go
type CampaignType string
const (
	CampaignBroadcast CampaignType = "broadcast"
	CampaignOutreach  CampaignType = "outreach_friend_request"
	CampaignZNS       CampaignType = "zalo_zns"
)

type CampaignStatus string
const (
	CampaignDraft     CampaignStatus = "draft"
	CampaignScheduled CampaignStatus = "scheduled"
	CampaignRunning   CampaignStatus = "running"
	CampaignPaused    CampaignStatus = "paused"
	CampaignCompleted CampaignStatus = "completed"
	CampaignFailed    CampaignStatus = "failed"
)

type Campaign struct {
	id               uuid.UUID
	tenantID         uuid.UUID
	title            string
	campaignType     CampaignType
	status           CampaignStatus
	senderAccountIDs []uuid.UUID      // Danh sách nick Zalo/Channel tham gia gửi
	targetFilterJSON []byte           // Điều kiện lọc khách hàng (tags, lead score, inactive days)
	contentTemplate  string           // Nội dung tin nhắn (hỗ trợ biến {customer_name})
	sendDelayMinSec  int              // Random delay chống spam (vd: 15s)
	sendDelayMaxSec  int              // Random delay tối đa (vd: 45s)
	dailyLimitPerNick int             // Tối đa 50 tin/nick/ngày
	totalTargets     int
	sentCount        int
	successCount     int
	failCount        int
	scheduledAt      *time.Time
	startedAt        *time.Time
	completedAt      *time.Time
	createdAt        time.Time
}
```

#### Invariants & Anti-Ban Rules:
1. **Safety Delay Constraint**: `sendDelayMinSec` không được nhỏ hơn 10 giây đối với tài khoản Zalo cá nhân để chống khóa nick thuật toán Zalo.
2. **Quota Invariant**: Không được phép vượt quá `dailyLimitPerNick` (tối đa 50 lời mời kết bạn hoặc tin nhắn lạ/nick/ngày).
3. **Execution State Transition**: Chỉ có thể chuyển sang `running` khi ở trạng thái `scheduled` hoặc `paused`.

---

## 2. Validated Aggregate Wrapper

```go
package domain

type ValidatedCampaign struct {
	inner *Campaign
}

func (c *Campaign) Validate() (*ValidatedCampaign, error) {
	if c.tenantID == uuid.Nil {
		return nil, errors.New("marketing.validation: tenant_id is required")
	}
	if c.title == "" {
		return nil, errors.New("marketing.validation: title is required")
	}
	if len(c.senderAccountIDs) == 0 {
		return nil, errors.New("marketing.validation: at least one sender account is required")
	}
	if c.sendDelayMinSec < 10 {
		return nil, errors.New("marketing.validation: send_delay_min_sec must be >= 10s for spam safety")
	}
	return &ValidatedCampaign{inner: c}, nil
}

func (v *ValidatedCampaign) Campaign() *Campaign {
	return v.inner
}
```
