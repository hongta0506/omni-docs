# FRONTEND-NAV-LAYOUT-SPEC — Bố Cục Điều Hướng `omni-web-next`

**Trạng thái:** đã chốt (2026-11-17) · **Phạm vi:** `omni-web-next` (Next.js admin) · **Ảnh:** [`assets/nav-layout/`](./assets/nav-layout/)

---

## 1. Bối Cảnh

`omni-web-next` là bản migrate 1:1 từ `omni-web` (Vue 3). Sidebar hiện tại được port nguyên từ `DefaultLayout.vue`, giữ đúng hành vi cũ — kể cả các khuyết điểm. Khi storefront (BC 09) bắt đầu có màn cấu hình website, số đích đến tăng thêm và bố cục hiện tại không còn chỗ.

Tài liệu này chốt bố cục điều hướng mới, phần còn lại của app không đổi.

## 2. Hiện Trạng — Số Đo Thật

Đo từ app đang chạy (`next dev` tại `:3000`, dữ liệu lấy từ DOM server-render của chính app):

| Chỉ số | Giá trị | Cách đo |
|---|---|---|
| Số đích điều hướng | **32** (+ `/egress` khi có quyền = 33) | hợp của 4 trang: `/dashboard` 22, `/reports/overview` 28, `/channels/zalo` 26, `/contacts` 22 |
| Số khối | 5 | `sidebar.tsx` — Tổng quan / Làm việc / Phân tích / Kênh kết nối / Hệ thống |
| Khối lớn nhất | **Làm việc: 19 mục** (59%) | đếm link trong DOM |
| Bề rộng | `w-60` = 240px → `w-16` = 64px khi thu gọn | `sidebar.tsx:95` |
| Chiều cao nav | ≈ 990px cho 33 mục × 30px | 33 × 30 = 990 |
| Không gian khả dụng | 844px ở màn 900px | 900 − 56 topbar |
| Route `settings/**` | **75** | `find src/app/\(dashboard\)/settings -name page.tsx` |
| Link settings ở trang `/settings` | 19 | DOM của `/settings` |

Ba khuyết điểm đo được:

1. **Nhóm đóng thì con bị unmount.** `/dashboard` render 22 link, `/reports/overview` render 28. Cùng một app, menu đổi hình theo trang đang đứng — người dùng không học được vị trí.
2. **Một khối nhốt 19/32 mục.** "Làm việc" trộn 6 loại công việc: CRM, chat, đơn, sản phẩm, báo giá, marketing. Hệ quả: 990px nav trong 844px → "Cài đặt hệ thống" nằm dưới nếp gấp.
3. **Cấu hình không có tầng.** 75 route nhưng trang vào chỉ mở 19 link; 29 route còn tồn tại ở dạng trùng lặp kiểu cũ (`settings/statuses` vs `settings/crm/statuses`, Zalo có 5 đường dẫn).

Ảnh hiện trạng: [`before-current.png`](./assets/nav-layout/before-current.png)

## 3. Quyết Định

### 3.1 Ba tầng

```
Tầng 0  Workspace switcher (CRM ↔ Website) — đổi ngữ cảnh lớn, ở topbar
Tầng 1  Rail 72px — 9 đích cố định, luôn hiện, có LOGO
Tầng 2  Panel 248px — cây của đích đang chọn, có ô lọc, có 3 trạng thái
Tầng 3  Nội dung
```

Bề rộng: rail 72 + panel 248 = **320px** → nội dung 1120px ở 1440, 1046px ở 1366.

### 3.2 Rail có nhãn, không phải icon trơn

**Quyết định: mỗi đích trong rail là icon 20px + nhãn chữ 9.2px, luôn hiển thị.**

Lý do, dựa trên dữ liệu ở §2:

- 32 đích hiện tại **đều có nhãn chữ**. Bỏ nhãn là bước lùi, không phải bước tiến.
- Trong 9 đích mới có **4 cặp dễ lẫn** nếu chỉ dùng hình: `Sản phẩm`/`Bán hàng` (hộp vs xe đẩy), `Kênh`/`Cấu hình` (phích cắm vs bánh răng), `Báo cáo`/`Tổng quan` (cột vs nhà), `Marketing`/`Hội thoại` (thẻ vs bong bóng).
- Icon trơn buộc người dùng **nhớ** (recall); nhãn cho phép **nhận ra** (recognition). Với người dùng CRM mở app 50 lần/ngày, recall không thành vấn đề; với người mở 2 lần/tuần (kế toán, chủ shop), recall là rào cản thật.
- Nhãn 9.2px + tracking 0.15 nằm gọn trong 72px với nhãn dài nhất "Khách hàng" (10 ký tự ≈ 52px). Không cần cắt, không cần ellipsis.

Nhãn **không** thay thế tooltip ở nơi khác: icon-only button trong nội dung vẫn phải có `title`/`aria-label`.

### 3.3 Panel có 3 trạng thái

| Trạng thái | Kích hoạt | Hành vi | Nội dung có nhảy? |
|---|---|---|---|
| **Pinned** | mặc định ở ≥ 1280px; click rail | Panel chiếm chỗ, đẩy nội dung | Có (đúng ý) |
| **Peek** | hover rail 150ms, hoặc focus bằng Tab | Panel nổi overlay, có viền indigo | Không |
| **Collapsed** | < 1024px; hoặc click đích đang active | Chỉ rail 72px; panel mở bằng click | Không |

Click rail = đổi pin/unpin. Hover = chỉ peek, rời chuột 250ms thì đóng. Phím `←` `→` di chuyển trong rail khi rail có focus.

Trạng thái lưu vào `localStorage`, cạnh key `sidebar-collapsed` đang dùng (`app-shell.tsx:86,97`):

```
nav.rail.active      // 'chat' | 'contacts' | ...
nav.panel.pinned     // '1' | '0'
nav.panel.open       // '1' | '0'  (dùng cho < 1280px)
```

### 3.4 Giữ nguyên nhận diện

Không đổi bảng màu, không đổi logo:

| Thành phần | Giá trị | Nguồn |
|---|---|---|
| Logo tile | nền `stone-950` `#0C0A09`, viền `amber-500` `#F59E0B` opacity 0.45, `rounded-xl` | `top-nav.tsx:53-56` |
| Accent | `indigo-600` `#4F46E5`; active bg `indigo-50` | đang dùng toàn app |
| Nhấn phụ | `amber-700` cho badge "CRM" | `top-nav.tsx:66` |
| Viền | `slate-200/80` | `sidebar.tsx:93` |
| Chữ | `slate-900` tiêu đề, `slate-500` nhãn phụ (≥4.5:1) | AGENTS.md §4.1 |

Logo chuyển từ topbar vào **đầu rail** (40px tile). Topbar giữ tên workspace + badge. Lý do: rail là trục dọc cố định — logo ở đó neo thương hiệu và giải phóng 200px ngang ở topbar cho tabs.

### 3.5 Ánh xạ 32 đích hiện tại → 9 rail

| Rail | Mục trong panel (nhãn nguyên văn từ app) |
|---|---|
| **Tổng quan** | Bảng tin điều hành |
| **Hội thoại** | Tất cả hội thoại `[Live]` · Chưa gán · Chờ trả lời · Đã đóng · Bạn bè · Nhóm · Quét nhóm · Hộp thư Facebook · Mẫu tin nhắn · Kịch bản tự động |
| **Khách hàng** | Danh sách KH · Doanh nghiệp · Cơ hội (Deals) · Khách theo tổng mua · Lead kẹt · Phân khúc mua |
| **Bán hàng** | Đơn hàng · Người mua · Đơn chưa gán · Báo giá · Bảng giá |
| **Sản phẩm** | Sản phẩm · Kho media · Tồn kho `(planned)` |
| **Marketing** | Mục tiêu (Triggers) · Kịch bản tự động · Khối nội dung · Phiên chăm sóc · Bám đuổi thủ công · Mẫu tin nhắn · Lịch hẹn |
| **Kênh** | Zalo Cá nhân & OA · Telegram MTProto · WhatsApp Personal · Facebook Cá nhân |
| **Báo cáo** | Tổng quan điều hành · Vận hành Nick Zalo · Hiệu suất Sale & Team · Engagement KH · Audit & Sức khỏe HT · Phân tích |
| **Cấu hình** | 6 nhóm (xem §3.6) · Hướng dẫn sử dụng · Egress |

Mỗi panel ≤ 10 mục hiển thị, phần còn lại qua ô lọc. Không mục nào bị unmount khi đổi trạng thái.

### 3.6 Cấu hình: 75 route → 6 nhóm

| Nhóm | Gồm |
|---|---|
| Kênh & tích hợp | `channels/*` (15), `integrations`, `egress`, `retail`, `sdk-limits`, `rate-limit` |
| CRM | `crm/*` (11): trạng thái, deal stage, tag, nhãn Zalo, chấm điểm, lead pool, lịch hẹn, AI assistant |
| Tổ chức | `org/*` (6): thông tin, gói, audit, ops-radar, thông báo |
| Cá nhân | `personal/*` (6): hồ sơ, bảo mật, phiên, giao diện, thông báo |
| Phân quyền | `rbac/*` (4): người dùng, nhóm quyền, phòng ban |
| Nhà phát triển | `dev/*` (4), `api`, `agent-hands` |

29 route trùng lặp được gộp + `301` về route chuẩn. Việc này **bắt buộc** trước khi panel Cấu hình ship: nếu không, panel sẽ có 2 dòng "Nhãn Zalo" trỏ 2 nơi khác nhau.

### 3.7 Workspace Website

Cùng khung, rail 8 đích, cây riêng: `Tổng quan · Giao diện · Trang · Danh mục · Bán hàng · Vận chuyển · Thanh toán · Tên miền`. Ranh giới và lý do tách: xem [ADR-FRONTEND-WORKSPACE-VS-SEPARATE-APP](./ADR-FRONTEND-WORKSPACE-VS-SEPARATE-APP.md).

### 3.8 Nút AI Copilot (cam)

Nút nổi đang có nằm ở `copilot-capsule-dock.tsx`: 48px, `bottom-24 left-5`, gradient `amber-500 → orange-500 → amber-600`, bóng `orange-500/35`, Sparkles 24px, chấm emerald 12px, 2 lớp radar khi đóng, `stone-900` + X khi mở, hotkey `⌘J`.

**Toạ độ cũ không dùng được** với bố cục mới. Nút được thiết kế để nằm trong khoảng trống đáy của sidebar 240px (comment trong code: *"Sidebar bottom-left position"*). Khi nav thành rail 72 + panel 248 = **320px**, khoảng trống đó biến mất: `left: 20px` đặt nút **bên trong rail**, đè đích thứ 8–9 và khối tổ chức. Sheet (`copilot-chat-sheet.tsx`) mở ở `left-20 / sm:left-24` với `w-[500px] sm:w-[540px]` → che kín panel.

#### Neo

```css
:root { --nav-w: 72px; }
:root[data-panel="pinned"] { --nav-w: 320px; }
```

- Nút: `left: calc(var(--nav-w) + 20px)`, `bottom-24` (96px) — giữ nguyên kích thước, màu, `z-40`.
- Sheet: `left: calc(var(--nav-w) + 16px)`, `w-[500px] sm:w-[540px] h-[640px]`, `max-w: calc(100vw - var(--nav-w) - 2rem)`.
- Peek **không** làm nút dịch (peek nổi 72–320, nút ở 340).
- `z-index`: nút/sheet 40 > panel 30 > peek overlay 20.
- `prefers-reduced-motion`: tắt `animate-contact-radar-*` và `animate-ping`.

#### Nhưng: ẩn nút ở màn tin nhắn chi tiết

Ở `/chat/[convId]` (`chat/[convId]/page.tsx:19-31`) đáy màn hình là composer, bên phải là nút Gửi, và từ 1280px còn CRM drawer `w-88` (352px). Ba vùng đó chiếm hết cả hai góc:

| Vị trí | Xung đột đo được | Kết luận |
|---|---|---|
| Đáy-trái cột nội dung | Không có gì | **Giữ** cho các màn khác |
| Đáy-phải viewport | Đè nút Gửi; mobile đè bottom nav | Bỏ |
| Phải khi drawer mở | Nút nổi **trên** drawer 352px, che nút đóng | Bỏ |
| Mobile màn Khách hàng | `contacts-mobile-fab.tsx:18` đã là nút cam `bottom-20 right-4` 52px | Bỏ — hai nút cam cùng màu chồng nhau |

Và ở màn chat, AI **đã có** đường vào riêng: `composer-toolbar.tsx:293` (Sparkles cạnh ô soạn) và `ai-suggest-bar.tsx:42`. Thêm nút nổi thứ ba ở đó là che composer mà không thêm khả năng gì.

**Quy tắc:** nút nổi là phần tử được thêm cuối cùng, nên nó nhường chỗ. Ẩn ở `/chat/[id]`, giữ ở mọi màn khác.

Nếu vẫn muốn góc phải: phải dựng **FAB stack** dùng chung (AI + Thêm khách) và cộng bề rộng drawer vào `right` — không nhét lẻ (issue `!615`).

Ảnh: [`ai-capsule.png`](./assets/nav-layout/ai-capsule.png), [`ai-button-placement.png`](./assets/nav-layout/ai-button-placement.png)

## 4. Ảnh

| Ảnh | Nội dung |
|---|---|
| [before-current.png](./assets/nav-layout/before-current.png) | Hiện trạng: 240px, 5 khối, 33 mục tràn nếp gấp 900px |
| [rail-pinned.png](./assets/nav-layout/rail-pinned.png) | Chốt: rail 72 có logo + nhãn, panel pinned, workspace CRM |
| [rail-peek.png](./assets/nav-layout/rail-peek.png) | Hover rail = peek overlay, nội dung không nhảy |
| [collapsed-mobile.png](./assets/nav-layout/collapsed-mobile.png) | < 1024px và mobile bottom nav |
| [website-workspace.png](./assets/nav-layout/website-workspace.png) | Workspace Website, cùng logo và màu |
| [ai-capsule.png](./assets/nav-layout/ai-capsule.png) | Nút AI cam: 4 trạng thái, sheet, lỗi vị trí và cách sửa |
| [ai-button-placement.png](./assets/nav-layout/ai-button-placement.png) | Đặt nút AI ở đâu: 5 phương án đo trên màn chat chi tiết |

## 5. Hợp Đồng Dữ Liệu Điều Hướng

Một nguồn duy nhất: `src/config/navigation.ts`. Không hardcode JSX.

```ts
export type NavItem = {
  id: string;
  label: string;            // i18n key hoặc nhãn tiếng Việt
  href: string;
  badge?: 'live' | 'count';
  permission?: string;      // ẩn nếu thiếu quyền — ẩn bằng data, không unmount nhóm
  children?: NavItem[];
};
export type NavDestination = {
  id: 'overview'|'inbox'|'customers'|'sales'|'catalog'|'marketing'|'channels'|'reports'|'settings';
  icon: LucideIcon;
  label: string;
  panelTitle: string;
  groups: { label: string; items: NavItem[] }[];
};
export const CRM_NAV: NavDestination[];
export const WEBSITE_NAV: NavDestination[];
```

`permission` lọc bằng hàm thuần trước khi render — panel luôn có cùng số nhóm, chỉ khác số mục.

## 6. Rủi Ro

| Rủi ro | Mức | Cách phát hiện |
|---|---|---|
| Người dùng quen sidebar cũ không tìm thấy mục | Cao | Thêm bộ lọc `⌘K` + lần đầu vào có tour 1 bước chỉ vào rail; đo bằng số lần dùng `⌘K` |
| Panel 248px + rail 72 ăn 320px trên laptop 1366 | Trung bình | Nếu > 40% phiên ở 1366 thì mặc định `pinned=0`; theo dõi qua `nav.panel.pinned` |
| Peek overlay che tiêu đề trang khi hover | Thấp | Overlay tự đóng sau 250ms; nội dung không bị đẩy nên không reflow |
| Gộp 29 route trùng làm chết bookmark cũ | Cao | `301` + danh sách route cũ trong PR; test redirect cho từng route |
| Nhãn 9.2px khó đọc ở màn hình thấp DPI | Trung bình | Nhãn `slate-500` trên trắng = 4.6:1 (AA); ở < 1024px đổi sang 10px |
| Hai app cùng lúc (Vue + Next) lệch bố cục | Trung bình | Chỉ áp ở `omni-web-next`; Vue giữ nguyên tới khi ngừng dùng |

## 7. Thứ Tự Thi Công

| Phase | Việc | Chặn bởi |
|---|---|---|
| 1 | `navigation.ts` + rail 72 (logo, nhãn, active) + panel đọc từ data | — |
| 2 | 3 trạng thái panel + `localStorage` + `⌘K` palette | Phase 1 |
| 3 | Gộp 29 route settings trùng + `301` | Phase 1 |
| 4 | Workspace switcher + cây Website | Có API cấu hình storefront |
| 5 | Mobile bottom nav + sheet | Phase 2 |

Phase 1–2 làm được ngay, không chờ backend.

## 8. Non-goals

- Không đổi bảng màu, logo, font.
- Không đổi nội dung trang nào ngoài phần nav.
- Không làm theme switcher, không dark mode.
- Không đổi bố cục `omni-web` (Vue) trong cùng đợt.

## 9. Liên Quan

- [STOREFRONT-BC9-SPEC.md](./STOREFRONT-BC9-SPEC.md) §2.2 — ranh giới BC 09
- [ADR-FRONTEND-WORKSPACE-VS-SEPARATE-APP.md](./ADR-FRONTEND-WORKSPACE-VS-SEPARATE-APP.md)
- [FRONTEND-STOREFRONT-NEXTJS-SPEC.md](./FRONTEND-STOREFRONT-NEXTJS-SPEC.md)
- Mã hiện tại: `src/components/layout/sidebar.tsx`, `app-shell.tsx`, `top-nav.tsx`, `mobile-bottom-nav.tsx`
