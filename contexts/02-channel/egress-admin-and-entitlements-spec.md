# Master Egress Proxies Admin & Org Entitlements Specification (SPEC 056 P1, P2b)

> **Bounded Context:** `internal/channel` (Submodule `proxy`) & `internal/identity` (Submodule `entitlement`)  
> **Ánh xạ từ ZaloCRM:** `modules/zalo/egress-admin-routes.ts` & `modules/entitlement/entitlement-routes.ts`  
> **Nguyên tắc:** Master Governance, Zero Credential Leak, SOCKS5h Ingress, Tenant Limit Enforcement.

---

## 1. Nghiệp Vụ Quản Trị Đường Ra (SPEC 056 P2b)

- **Nguyên tắc cốt lõi:**
  - Tổ chức Master (`masterOrgId`) chịu trách nhiệm mua, kiểm tra sống chết và nạp kho Proxy SOCKS5h tập trung.
  - Tổ chức thuê không được tự ý cấu hình đường ra; hệ thống tự cấp phát từ kho dùng chung hoặc kho riêng.
  - **Bảo mật tuyệt đối:** API liệt kê cổng **KHÔNG BAO GIỜ** trả về URL/mật khẩu đầy đủ của Proxy, chỉ trả về `fingerprint` (dạng `host:port`).
- **Nạp lô cổng (Batch Ingest):** Nạp danh sách URL `socks5://user:pass@host:port`, tự động băm `fingerprint`, mã hoá mật khẩu lưu vào DB, kiểm tra kết nối hợp lệ.

---

## 2. Nghiệp Vụ Quyền Lợi & Hạn Ngạch Tổ Chức (SPEC 056 P1)

- **Trần Nick & Định Mức IP:**
  - Lấy từ Bảng giá gói cước (`trial`, `starter`, `pro`, `enterprise`).
  - Ops có quyền override đặt tay theo từng tổ chức.
- **Kiểm soát vượt hạn ngạch (Hard Cap Gate):**
  - Khi một tổ chức kết nối thêm tài khoản Zalo mới: nếu `số nick đang dùng >= nickLimit` thì từ chối kết nối với mã lỗi `entitlement_nick_limit_reached`.

---

## 3. Danh Mục Endpoints

| Method | Route | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/admin/egress?page=&page_size=` | Master Org Only | Liệt kê danh sách proxy phân trang chuẩn `pkg/pagination` (trả về `{items, total, page, page_size, total_pages, has_next}`). |
| `POST` | `/api/v1/admin/egress/proxies` | Master Org Only | Nạp lô proxy SOCKS5h mới vào hệ thống. |
| `GET` | `/api/v1/my/entitlement` | Authenticated User | Tổ chức tự xem gói, hạn, trần nick và số lượng đang dùng. |
| `GET` | `/api/v1/admin/entitlements/:orgId` | Master Org Only | Xem quyền lợi và hạn ngạch của 1 tổ chức cụ thể. |
| `PUT` | `/api/v1/admin/entitlements/:orgId` | Master Org Only | Cập nhật hạn ngạch/gói cho 1 tổ chức cụ thể. |