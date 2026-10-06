# Quy Chuẩn Phân Định Ranh Giới: Lead (Đầu Mối) vs Customer (Khách Hàng)

> **Mã tài liệu:** `ADR-ARCH-009-LEAD-VS-CUSTOMER`  
> **Bounded Context áp dụng:**  
> - `internal/customer` (Customer & Lead BC)  
> - `internal/channel` (Channel & Gateway BC)  
> - `internal/deal` (Deal & Order Store BC)  
> - `internal/marketing` (Marketing & Automation BC)  
> **Trạng thái:** ACTIVE & MANDATORY ENFORCEMENT  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, code identifiers, database schemas giữ nguyên Tiếng Anh).

---

## 1. Nguyên Tắc Cốt Lõi (Core Ubiquitous Invariant)

> **QUY TẮC BẤT BIẾN:**  
> **Mọi thành viên cào được từ Nhóm (Groups), Kênh (Channels), Danh bạ (Phonebooks), hoặc Mạng xã hội (Zalo, Telegram, WhatsApp, Meta) ĐỀU LÀ LEAD (ĐẦU MỐI TIỀM NĂNG), TUYỆT ĐỐI KHÔNG ĐƯỢC COI LÀ KHÁCH HÀNG (CUSTOMER).**

Trong phễu kinh doanh CRM:
- **Lead (Đầu mối / Khách tiềm năng):** Là người mới chỉ có thông tin định danh (UID mạng xã hội, tên, avatar, số điện thoại thu thập được). Chưa có bất kỳ giao dịch mua hàng nào, chưa có thỏa thuận thương mại, và chưa được nhân viên bán hàng thẩm định nhu cầu (Qualification).
- **Prospect (Khách hàng tiềm năng đã xác thực):** Là Lead đã tương tác 2 chiều, phản hồi tin nhắn và bày tỏ sự quan tâm tới sản phẩm/dịch vụ.
- **Customer (Khách hàng chính thức):** Chỉ trở thành Khách hàng khi và chỉ khi **đã chốt thành công ít nhất 1 Cơ hội bán hàng (`Deal Won`) hoặc có Đơn hàng thực tế (`Order Store` / thanh toán thành công)**.

---

## 2. Ánh Xạ Vào Cơ Sở Dữ Liệu & Source Code (`omni-core`)

Khi thực hiện Ingest / Sync từ các kênh (Zalo Group Member Scrape, Telegram Group Scrape, WhatsApp Contact Sync):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DỮ LIỆU ĐẦU VÀO TỪ MẠNG XÃ HỘI                  │
│       (Zalo Member UID, Telegram Member UID, WhatsApp Phonebook)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ [Ingest Pipeline]
┌────────────────────────────────────────────────────────────────────────┐
│             BẢNG `contacts` (Hồ sơ liên hệ định danh đa kênh)          │
│  - `status`: BẮT BUỘC LÀ `"lead"` (Tuyệt đối KHÔNG gán `"customer"`)     │
│  - `lead_score`: 10 (Điểm khởi tạo cho lead mới)                      │
│  - `total_spent`: 0, `purchase_count`: 0                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ [Đồng thời tạo]
┌────────────────────────────────────────────────────────────────────────┐
│                 BẢNG `leads` (Bể Lead chung - Lead Pool)              │
│  - `stage`: `"new"` (Giai đoạn mới thu thập)                          │
│  - `source`: `"zalo_group_scan"`, `"telegram_group_scan"`, v.v.     │
│  - `score`: 10                                                        │
│  - Thuộc quyền điều phối của Lead Pool (Round-Robin chia cho Sale)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ [Ghi nhận Outbox Event]
┌────────────────────────────────────────────────────────────────────────┐
│                 BẢNG `domain_events` (Transactional Outbox)           │
│  - `aggregate_type`: `"lead"`                                         │
│  - `event_type`: `"LeadDiscoveredEvent"`                             │
│  - Kích hoạt Marketing Automation Sequences (Nuôi dưỡng Lead 1-1)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ma Trận Chuyển Đổi Vòng Đời (Lifecycle State Machine)

| Giai đoạn | Trạng thái `contacts.status` | Trạng thái `leads.stage` | Điều kiện kích hoạt chuyển đổi | Hành động hệ thống |
|---|---|---|---|---|
| **1. Mới thu thập** | `lead` | `new` | Cào từ Group/Channel hoặc Sync danh bạ | Nạp vào Lead Pool, tính điểm khởi tạo (Score = 10) |
| **2. Đã tiếp cận** | `lead` | `contacted` | Bot gửi tin chào mừng hoặc Sale nhắn tin đầu tiên | Ghi nhận timeline tương tác, khởi động đồng hồ SLA |
| **3. Quan tâm** | `prospect` | `qualified` | Khách hàng phản hồi, đồng ý nhận tư vấn/báo giá | Tăng Lead Score (+20), mở tạo Cơ hội bán hàng (`Deal`) |
| **4. Chốt đơn (Khách hàng)** | **`customer`** | `converted_to_deal` | **Tạo Đơn hàng thành công (`Order Store` SPEC 057) hoặc Deal Win** | **Chính thức nâng cấp lên Khách Hàng (Customer). Tính toán RFM (SPEC 051).** |
| **5. Không tiềm năng** | `lost` / `unqualified` | `unqualified` | Sai số, từ chối thẳng thừng, chặn tin nhắn | Thu hồi về kho lưu trữ, ngừng kịch bản marketing |

---

## 4. Rà Soát & Khóa Rules Cho Tất Cả AI Coding Agents

1. **Tuyệt đối không gọi thành viên cào về là "khách hàng" trong code & docs:**
   - Đặt tên biến: `leadID`, `scannedLead`, `leadSource`. Không dùng `customerID` cho các hàm quét mạng xã hội.
   - API endpoints: `/api/v1/leads/pool`, `/api/v1/contacts/ingest-scanned-members` với payload trả về `leadsCreated`, `contactsCreated`.
2. **Không tự ý gán `contacts.status = 'customer'` khi chưa có đơn hàng:**
   - Mọi luồng Ingest từ Channel Gateway chỉ được phép tạo Contact với `status = 'lead'`.
   - Quyền thăng hạng `status = 'customer'` thuộc quyền sở hữu độc quyền của **Deal & E-commerce BC (`internal/deal`)** khi có sự kiện chốt đơn hợp lệ.
