# Marketing & Automation Bounded Context (`internal/marketing`)

> Bounded Context phụ trách Quản lý Nhãn phân loại (Tags & Tag Groups), Chiến dịch gửi tin hàng loạt (Broadcasts & Campaigns), Kịch bản nuôi dưỡng tự động (Sequences), Automation Triggers/Actions, và Báo cáo chuyển đổi tiếp thị.

---

## 1. Thông Tin Quy Chuẩn

| Mục | Giá trị |
|---|---|
| **Package Go** | `omni-core/internal/marketing` |
| **Tổng số Endpoints** | **84** (Tags 24, Broadcasts/Campaigns 32, Sequences 16, Automation 12) |
| **Aggregate Roots** | `TagGroup`, `Campaign` (Broadcast), `Sequence` (Drip Nurturing), `AutomationRule` |
| **Entities con** | `TagItem`, `CampaignTarget`, `SequenceStep`, `AutomationTrigger`, `AutomationAction` |
| **Value Objects** | `ScheduleCronVO`, `DeliveryStatus`, `FilterCriteriaVO` |
| **Giao thức** | Connect-RPC (`marketing.v1.MarketingService`), REST (`/api/v1/tags/*`, `/api/v1/campaigns/*`, `/api/v1/automation/*`) |

---

## 2. Tài Liệu Thành Phần

| Tài liệu | Mô tả |
|---|---|
| [`mapping-marketing-and-channels.md`](./mapping-marketing-and-channels.md) | Ánh xạ chi tiết endpoints Tags, Campaigns, Sequences, Broadcast schedules và Channel dispatching. |

---

## 3. Invariants & Nghiệp Vụ Cốt Lõi

1. **Broadcast Safety Limit**:
   - Mọi chiến dịch gửi tin qua tài khoản cá nhân (Zalo Personal, Telegram) bắt buộc đi qua Rate Limiter (delay tối thiểu 15-30s giữa các tin nhắn) để tránh bị chặn tài khoản.
2. **Dynamic Segment Resolution**:
   - Khi chiến dịch kích hoạt, truy vấn danh sách người nhận theo realtime dynamic tags và customer filter, không lưu static list quá 24h.
3. **Sequence Drip Progression**:
   - Khách hàng đã phản hồi hoặc đạt mục tiêu (ví dụ đã tạo Deal) sẽ tự động thoát khỏi Sequence nuôi dưỡng (`AutoStopCondition`).
