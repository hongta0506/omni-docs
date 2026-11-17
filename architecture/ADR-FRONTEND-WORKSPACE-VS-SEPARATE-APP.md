# ADR — Workspace Website Trong Cùng App Hay App Riêng

**Trạng thái:** Accepted (2026-11-17) · **Ngày:** 2026-11-17 · **Liên quan:** [FRONTEND-NAV-LAYOUT-SPEC](./FRONTEND-NAV-LAYOUT-SPEC.md), [STOREFRONT-BC9-SPEC](./STOREFRONT-BC9-SPEC.md), [ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE](./ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md)

---

## 1. Bối Cảnh

`omni-web-next` hiện là một app duy nhất phục vụ vận hành CRM: hội thoại, khách hàng, đơn hàng, báo cáo. Khi storefront (BC 09) ra đời, cùng một tổ chức còn có nhu cầu cấu hình **website bán hàng**: nhận diện, khung trang, trang mẫu, danh mục publish, giỏ hàng, mã giảm giá, phí ship, cổng thanh toán, tên miền, SEO.

Câu hỏi kiến trúc: **cấu hình website nằm trong app admin hiện tại, hay tách app riêng?**

Đây là quyết định frontend. Quyết định BC 09 là monolith hay service riêng đã có ở [ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE](./ADR-STOREFRONT-BC-VS-SEPARATE-SERVICE.md); hai quyết định độc lập nhau.

## 2. Số Liệu Quyết Định

Đo từ app đang chạy và từ cây route hiện tại:

| Chỉ số | Giá trị |
|---|---|
| Đích điều hướng hiện tại | 32 (+1 theo quyền) |
| Route `settings/**` | 75 |
| Nhóm settings có tên | 6 (`channels` 15, `crm` 11, `org` 6, `personal` 6, `dev` 4, `rbac` 4) |
| Màn cấu hình website dự kiến ban đầu | 28 |

## 3. Phương Án

### A. Workspace trong cùng app (đã chọn)

Một build, một deploy, một login. Rail đổi bộ 9 đích ↔ 8 đích, panel đổi cây.

- **Ưu:** không nhân đôi auth/tenant/RBAC/theme; một `⌘K` cho cả hai; cấu hình tồn kho, giá, danh mục dùng chung type với CRM; deploy và rollback một khối.
- **Nhược:** bundle lớn hơn; một lỗi build ảnh hưởng cả hai mặt; người dùng website-thuần phải đi qua shell CRM.

### B. App Next.js thứ hai, chung backend

`storefront-admin` riêng, port riêng, login bằng cùng JWT.

- **Ưu:** cô lập deploy; bundle nhỏ cho người chỉ dùng website.
- **Nhược:** nhân đôi shell/auth/i18n/token refresh; hai nơi phải cập nhật khi contract đổi; `omni-web-next` vừa migrate xong từ Vue — nhân đôi bây giờ là tự tạo thêm một bản lệch.

### C. Trang cấu hình nằm rải trong CRM, không có workspace

- **Ưu:** rẻ nhất, không đổi shell.
- **Nhược:** 28 màn nữa nhét vào sidebar 32 đích → 60 đích. Đã đo được bệnh này: khối "Làm việc" 19 mục làm nav cao 990px trong 844px, "Cài đặt hệ thống" rơi dưới nếp gấp. Thêm 28 mục là hỏng hẳn.

## 4. Quyết Định

**Chọn A.** Website là **workspace** của `omni-web-next`, không phải app riêng, không phải section thứ 6 của sidebar CRM.

### 4.1 Ranh giới hai workspace

| | CRM | Website |
|---|---|---|
| Người dùng | CSKH, sales | marketing, admin nội dung |
| Nhịp dùng | hàng ngày, hàng giờ | theo đợt phát hành |
| Việc | xử lý hàng đợi | cấu hình rồi publish |
| Dữ liệu chung | khách, đơn, tồn kho, giá | cùng những thứ đó, nhìn từ phía bán |
| Không có | cấu hình theme, tên miền | lead pool, hội thoại, đơn POS |

Đơn của website rơi về **cùng bảng order của `deal`**, mang nguồn `storefront` (xem `STOREFRONT-BC9-SPEC.md` §5.2). Workspace Website không có bảng dữ liệu riêng nào.

### 4.1.1 Phân biệt "cấu hình website" và "site bán hàng" (chốt 2026-11-17)

ADR này chỉ nói về **màn hình cấu hình** website (nhận diện, trang mẫu, danh mục publish, phí ship, cổng thanh toán, tên miền, SEO) — những màn đó là **workspace trong app admin**.

**Site bán hàng cho khách KHÔNG nằm trong app admin.** Nó là **một repo riêng — site ecom độc lập**, vì phục vụ end-user: SEO, tốc độ tải, theme riêng, tên miền riêng, lịch deploy riêng.

| | App admin (`omni-web` / `omni-web-next`) | Site storefront (repo riêng) |
|---|---|---|
| Người dùng | staff đã đăng nhập | khách vãng lai |
| Auth | staff JWT | không (token shopper riêng) |
| Gọi API | API nội bộ + staff JWT | **chỉ public API** (`/api/v1/public/**`) |
| Logic nghiệp vụ | có (qua backend) | **không** — chỉ render + gọi API |
| Widget chat | cấu hình + đọc hội thoại trong inbox | hiển thị widget cho khách |

Hệ quả: mọi đặc tả có màn hình khách nhìn thấy phải ghi rõ repo đích — xem [`STOREFRONT-WEBCHAT-CHANNEL-SPEC.md`](./STOREFRONT-WEBCHAT-CHANNEL-SPEC.md) §1.1 và [`PAYMENT-METHODS-ADAPTER-SPEC.md`](./PAYMENT-METHODS-ADAPTER-SPEC.md) §7.1.

### 4.2 Điều kiện bắt buộc

1. `src/config/navigation.ts` export `CRM_NAV` và `WEBSITE_NAV` cùng một type — nếu hai cây dùng hai type khác nhau thì đã là hai app trên một shell, và lúc đó phải chọn B.
2. Workspace đang chọn lưu `localStorage.nav.workspace`; vào lại đúng workspace cũ.
3. Route của workspace kia không bị chặn cứng — vào bằng URL vẫn được, chỉ rail đổi theo.

## 5. Hệ Quả

- Rail/panel phải **data-driven** từ phase 1. Nếu hardcode JSX như hiện tại (`sidebar.tsx` 585 dòng, 5 khối cứng), method A không thi công được.
- `sidebar.tsx` được thay, không sửa tại chỗ. `mobile-bottom-nav.tsx` đổi 4 đích theo workspace.
- Bundle: workspace Website nên `dynamic import` phần cấu hình nặng (trình soạn theme, xem trước).
- Người dùng website-thuần vẫn thấy rail CRM — chấp nhận; nếu số phiên tăng thì mở đường B.

## 6. Điều Kiện Chuyển Sang Phương Án B

Chuyển sang app riêng khi **một** điều kiện đúng:

| # | Điều kiện | Cách đo |
|---|---|---|
| 1 | Màn cấu hình website vượt **40** | đếm route `(website)/**` |
| 2 | Bundle workspace Website vượt **40%** tổng JS của app | `next build` output |
| 3 | Người dùng chỉ-dùng-website vượt **50%** số phiên | analytics theo workspace |
| 4 | Cần domain/port riêng (khách hàng tự đăng nhập quản trị site) | yêu cầu sản phẩm |

Khi đó việc tách là **bê nguyên** `WEBSITE_NAV` + các page sang app mới — vì cả hai đã đọc cùng một type, không phải viết lại logic.

## 7. Phương Án Bị Loại

- **B (app thứ hai ngay bây giờ):** loại vì nhân đôi shell/auth trong lúc `omni-web-next` vừa hoàn tất migrate từ Vue; rủi ro lệch cao hơn lợi ích cô lập.
- **C (rải trang vào CRM):** loại vì đã có số đo chứng minh sidebar hiện tại quá tải; thêm 28 mục là vi phạm trực tiếp.
