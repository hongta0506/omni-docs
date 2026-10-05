# Báo Cáo Đối Soát ZaloCRM Cập Nhật Mới Nhất (Commit 0de2b9a6) vs Omni Platform

> **Thời điểm đối soát:** Tháng 10/2026  
> **Nguồn cập nhật:** Repo `ZaloCRM` (nhánh `main`, commit HEAD `0de2b9a6`)  
> **Đối tượng đối soát:** `omni-core-clean` (Golang Clean DDD Backend) và `omni-web` (Vue 3 Frontend)  
> **Mục tiêu:** Nhận diện 100% các endpoint mới, các thay đổi màn hình Frontend từ phiên bản mới nhất của ZaloCRM trên production để bổ sung kịp thời vào kế hoạch phát triển của hệ thống Omni.

---

## 1. Bối Cảnh Cập Nhật Của ZaloCRM

Trước đây, nhánh `main` trên GitHub của ZaloCRM dừng ở commit `d352dd9e` (tháng 08/2026), trong khi production thực tế chạy các gói tính năng từ Spec 028 đến Spec 061 trên nhánh staging/mini.

Hiện tại, toàn bộ các bản vá và tính năng mới nhất đã được **merge và đồng bộ vào `main` (Commit `0de2b9a6`)**, bao gồm:
1. **SPEC 051 (Phần 1 -> Phần 5):** Hệ thống phân nhóm khách hàng RFM (`slipping` Khách lớn đang rời, VIP, Mua nhiều bỏ bẵng, Mua 1 lần, Có ý định nhưng chưa mua, Bỏ qua), bộ lọc tự do (`?tab=loc`), và trang cấu hình luật RFM theo mô hình kinh doanh (Retail, B2B, High-Value).
2. **SPEC 057 (Phần 1 -> 057-F):** Kho đơn hàng đa kênh (`order-store`), Đơn chưa gắn khách (`unlinked`), Tự động tạo hồ sơ khách hàng từ người mua có lần mua hợp lệ (`057-E`), Tự động bàn giao khách hàng cho nhân viên bán hàng ghi trên hoá đơn (`057-F`).
3. **SPEC 064:** Nhận định khách hàng đa kênh (Clef Decision Engine & AI Shadow/Draft mode).
4. **SPEC 056 (P1, P2b, P2c):** Quản lý quyền lợi tổ chức (`entitlements` gói/trần nick) và Quản trị đường ra Egress Proxy tập trung cho Master (`/duong-ra`).
5. **SPEC 052 & 058:** Đề xuất việc theo chỉ số (`work-items` / `metric-advice`) và Trang tài liệu hướng dẫn vận hành (`/tutorial`).

---

## 2. Danh Mục Các Endpoint Mới Bổ Sung Từ ZaloCRM (Backend)

Dưới đây là danh sách chi tiết các REST API endpoints mới xuất hiện trong bản cập nhật `0de2b9a6` cần được đưa vào kế hoạch chuyển đổi sang Golang DDD (`omni-core-clean`):

### 2.1 Nhóm Khách Hàng RFM (SPEC 051) — Thuộc Bounded Context `internal/customer` hoặc `internal/deal`
Tệp route: `ZaloCRM/backend/src/modules/rfm/rfm-routes.ts`

| Method | Endpoint | Quyền / Scope | Mô tả chức năng |
|---|---|---|---|
| `GET` | `/api/v1/rfm/summary` | `deal.access` | Thống kê số lượng khách hàng theo 6 nhóm RFM, tổng số khách có phát sinh đơn, luật RFM hiện hành. |
| `GET` | `/api/v1/rfm/segment` | `deal.access` | Danh sách khách hàng theo nhóm (`slipping`, `vip`, `repeat_lapsed`...). Phân trang, hiển thị điểm R, F, M (1-5). |
| `GET` | `/api/v1/rfm/filter` | `deal.access` | "Lọc tự do" khách hàng theo ngưỡng (số lần mua, số ngày chưa mua, tổng tiền đã chi). |
| `GET` | `/api/v1/rfm/contacts/:contactId` | `deal.access` | Chi tiết chỉ số RFM và lý do cờ bỏ qua (`skipReasons`) của một khách hàng cụ thể. |
| `POST` | `/api/v1/rfm/to-list` | `customer_list.create` | Đẩy trọn vẹn nhóm khách hàng RFM hoặc kết quả lọc tự do sang Tệp khách hàng CRM (`CustomerList`) để chạy chiến dịch Zalo. |
| `POST` | `/api/v1/rfm/recompute` | `settings.edit` | Kích hoạt tính toán lại toàn bộ chỉ số tổng mua và phân nhóm RFM toàn tổ chức. |
| `GET` | `/api/v1/rfm/rules` | `settings.edit` | Lấy cấu hình luật chia nhóm RFM hiện tại, danh sách mẫu gợi ý (Retail, B2B, High-Value). |
| `PUT` | `/api/v1/rfm/rules` | `settings.edit` | Lưu luật chia nhóm RFM theo mô hình doanh nghiệp và tự động tính toán lại phân nhóm. |

### 2.2 Kho Đơn Hàng & Gắn Khách Tự Động (SPEC 057, 057-E, 057-F) — Thuộc Bounded Context `internal/deal`
Tệp route: `modules/order-store/order-store-routes.ts` & `order-link-routes.ts`

| Method | Endpoint | Quyền / Scope | Mô tả chức năng |
|---|---|---|---|
| `GET` | `/api/v1/order-store/sync` | `settings.edit` | Trạng thái đồng bộ đơn hàng, công tắc tự tạo hồ sơ (`autoCreateContacts`), số lượng máy đã tự tạo (`autoCreated`). |
| `PUT` | `/api/v1/order-store/sync` | `settings.edit` | Bật/tắt tiến trình đồng bộ nền, cấu hình bật/tắt tự động tạo hồ sơ khách hàng khi có đơn mới (`057-E`). |
| `GET` | `/api/v1/order-store/sellers` | `settings.edit` | Danh sách người bán trên hoá đơn POS/TMĐT, số lượng đơn/tiền, liên kết với nhân viên CRM (`057-F`). |
| `PUT` | `/api/v1/order-store/sellers` | `settings.edit` | Lưu cấu hình tự động phân bổ khách hàng cho người bán trên hoá đơn. |
| `POST` | `/api/v1/order-store/sync/run` | `settings.edit` | Chạy ngay một lượt kéo đơn hàng nền từ nguồn bán hàng (Pancake, KiotViet...). |
| `POST` | `/api/v1/order-store/sync/backfill` | `settings.edit` | Bắt đầu nạp lùi lịch sử đơn hàng 24 tháng. |
| `GET` | `/api/v1/order-store/buyers/unlinked` | `settings.edit` | Danh sách người mua trên đơn hàng chưa được gắn vào hồ sơ khách hàng nào trong CRM. |
| `POST` | `/api/v1/order-store/buyers/link` | `settings.edit` | Gắn thủ công toàn bộ đơn của một người mua vào một Contact đã có. |
| `POST` | `/api/v1/order-store/buyers/create-contacts` | `settings.edit` | Tạo hàng loạt hồ sơ Contact từ danh sách người mua chưa gắn. |
| `POST` | `/api/v1/order-store/orders/:orderId/link` | `settings.edit` | Gắn hoặc gỡ thủ công 1 đơn hàng cụ thể với Contact. |
| `GET` | `/api/v1/order-store/contacts/:contactId/purchases`| `deal.access` | Lịch sử mua hàng của khách hàng (hiển thị tại Tab Đơn hàng của hồ sơ khách). |
| `GET` | `/api/v1/order-store/deals/:dealId/order` | `deal.access` | Lấy chi tiết đơn hàng gắn với Cơ hội bán hàng (Deal). |
| `POST` | `/api/v1/webhooks/pancake/:orgId` | Public + Secret | Cổng Webhook tiếp nhận đơn hàng tức thời từ Pancake POS. |

### 2.3 Nhận Định Khách Hàng Clef (SPEC 064) — Thuộc Bounded Context `internal/aiagent`
Tệp route: `ZaloCRM/backend/src/modules/decision/decision-routes.ts`

| Method | Endpoint | Quyền / Scope | Mô tả chức năng |
|---|---|---|---|
| `GET` | `/api/v1/decision/settings` | `owner, admin` | Xem cấu hình nhận định khách hàng (bật/tắt, chế độ shadow/draft). |
| `PUT` | `/api/v1/decision/settings` | `owner, admin` | Cập nhật cấu hình nhận định khách hàng của tổ chức. |
| `GET` | `/api/v1/admin/decision/status` | Master Org Only | Tổng quan động cơ nhận định: số dư Clef, tình trạng kết nối, tỉ lệ phản hồi 24h. |
| `PUT` | `/api/v1/admin/decision/orgs/:orgId` | Master Org Only | Cấp quyền gửi nhãn ra ngoài cho từng tenant cụ thể. |
| `POST` | `/api/v1/admin/decision/engine/reactivate` | Master Org Only | Kích hoạt lại engine Clef sau sự cố. |
| `POST` | `/api/v1/admin/decision/engine/disable` | Master Org Only | Tắt engine Clef, chuyển sang dùng LLM dự phòng. |
| `PUT` | `/api/v1/admin/decision/llm` | Master Org Only | Cấu hình model LLM dự phòng (OpenAI / Anthropic / DeepSeek). |
| `GET` | `/api/v1/admin/decision/logs` | Master Org Only | Sổ nhật ký phân loại và nhận định gần đây. |
| `POST` | `/api/v1/admin/decision/playground` | Master Org Only | Thử nghiệm nhận định với một đoạn hội thoại mẫu. |

### 2.4 Quản Trị Đường Ra & Quyền Lợi Gói (SPEC 056) — Thuộc Bounded Context `internal/channel` & `internal/identity`
Tệp route: `modules/zalo/egress-admin-routes.ts` & `modules/entitlement/entitlement-routes.ts`

| Method | Endpoint | Quyền / Scope | Mô tả chức năng |
|---|---|---|---|
| `GET` | `/api/v1/admin/egress/proxies` | Master Org Only | Danh sách kho proxy đường ra dùng chung toàn hệ thống. |
| `POST` | `/api/v1/admin/egress/proxies` | Master Org Only | Thêm proxy mới vào kho (hỗ trợ kiểm tra SOCKS5h / HTTP latency). |
| `DELETE` | `/api/v1/admin/egress/proxies/:id` | Master Org Only | Gỡ bỏ proxy khỏi kho chung. |
| `GET` | `/api/v1/entitlements` | Master Org Only | Danh sách gói thuê, hạn mức số lượng nick Zalo, hạn ngạch của các tổ chức. |
| `PUT` | `/api/v1/entitlements/:orgId` | Master Org Only | Cập nhật hạn mức tài khoản và thời hạn sử dụng cho tổ chức. |

---

## 3. Thay Đổi Ở Tầng Frontend (ZaloCRM Frontend vs Omni Web)

### 3.1 Bảng So Sánh Các Màn Hình Mới Nhất

| Đường dẫn Vue Route | Tên View trong ZaloCRM | Đã có trong `omni-web`? | Mô tả & Mức độ ưu tiên |
|---|---|:---:|---|
| `/rfm` | `RfmSegmentsView.vue` | ❌ **CHƯA CÓ** | **Ưu tiên Cao (P1):** Màn hình phân nhóm khách hàng RFM (6 nhóm) + Tab Lọc tự do (`?tab=loc`). |
| `/settings/crm/rfm` | `RfmRulesSettingsView.vue` | ❌ **CHƯA CÓ** | **Ưu tiên Cao (P1):** Cài đặt luật RFM theo mô hình B2B/B2C cho quản trị viên. |
| `/orders/unlinked` | `OrderBuyersView.vue` | ⚠️ Đã có khung view | **Ưu tiên Vừa (P2):** Cần bổ sung switch "Tự động tạo hồ sơ khách hàng" (`057-E`) và liên kết nhanh. |
| `/duong-ra` | `EgressView.vue` | ⚠️ Đã có khung view | **Ưu tiên Vừa (P2):** Cần gắn API `admin/egress/proxies` và circuit breaker status. |
| `/tutorial` | `TutorialView.vue` | ❌ **CHƯA CÓ** | **Ưu tiên Thấp (P3):** Trang cẩm nang hướng dẫn sử dụng kèm ảnh trực quan (Layout blank). |
| Cài đặt ▸ Kênh bán | `RetailChannelPage.vue` | ⚠️ Đã có khung | Bổ sung khối "Người bán trên hoá đơn -> Nhân viên phụ trách CRM" (`057-F`). |

---

## 4. Đánh Giá Hiện Trạng Kiến Trúc Golang (`omni-core-clean`)

Trong `omni-core-clean`, hệ thống đã xây dựng rất chuẩn theo Clean DDD 4 lớp cho 8 Bounded Contexts chính:
- **Đã hoàn thiện tốt:** Identity & RBAC, Zalo Personal Connect-RPC server, Zalo OA extension, Conversation Inbound/Outbound, Tagging, Analytics, AI Harness (GOSO dual transport).
- **Các phần cần bổ sung theo bản cập nhật `0de2b9a6`:**
  1. **Submodule `rfm`:**
     - Tạo `internal/customer/domain/rfm/` (hoặc `internal/deal/domain/rfm/`): Aggregate Root `RfmProfile`, Invariants ngưỡng R, F, M (1-5), thuật toán phân chia quintile và bộ luật B2B/B2C.
     - Cung cấp Handler `internal/customer/interfaces/http/rfm_handler.go` bọc đủ 8 endpoints RFM chuẩn spec 051.
  2. **Mở rộng Submodule `order` trong Deal BC:**
     - Tích hợp logic `autoCreateContacts` (`057-E`) khi nhận đơn hàng mới từ Webhook.
     - Bổ sung cơ chế map người bán trên hoá đơn sang nhân viên tư vấn (`057-F`).
     - Bổ sung endpoint cho đơn chưa gắn khách (`unlinked buyers`).
  3. **Submodule `decision` trong AI Agent BC (SPEC 064):**
     - Đưa `DecisionEngine` vào `internal/aiagent/domain/decision/` với cơ chế shadow/draft mode và kết nối sang Clef/LLM.

---

## 5. Kết Luận & Lộ Trình Hành Động Đề Xuất

1. **Về Backend (`omni-core-clean`):**
   - **Sprint 8.1:** Triển khai Submodule `rfm` (SPEC 051 P1-P5) trong Customer/Deal BC để hoàn thiện luồng phân hạng khách hàng.
   - **Sprint 8.2:** Bổ sung tính năng tự tạo contact từ đơn hàng (`057-E`) và bàn giao theo người bán (`057-F`) vào Deal/Order Store.
   - **Sprint 8.3:** Triển khai Clef Decision Engine (`SPEC 064`) trong AI Agent BC.
2. **Về Frontend (`omni-web`):**
   - Port 2 view chính: `RfmSegmentsView.vue` và `RfmRulesSettingsView.vue` sang Vue 3 + Vuetify 3 theo đúng chuẩn thiết kế UX/UI Pro Max.
   - Hoàn thiện luồng kết nối API cho `OrderBuyersView.vue` và `EgressView.vue`.
