# FRONTEND-I18N-AUDIT — Kiểm Tra Dịch Toàn Bộ `omni-web-next`

**Ngày:** 2026-11-17 · **Phạm vi:** chỉ `omni-web-next` (không đụng `omni-web`) · **Script:** [`scripts/i18n-audit.py`](../scripts/i18n-audit.py)

---

## 1. Kết Luận Ngắn

Hệ thống dịch **đã có và đúng**: 623 key × 3 locale (`vi`/`en`/`zh`), parity tuyệt đối 0 key lệch. Nhưng **chỉ 61 file gọi `t()`**, trong khi app có 626 file chứa chuỗi tiếng Việt viết thẳng.

Đo bằng cách tải **toàn bộ 164 route** với `Cookie: NEXT_LOCALE=en`:

| Chỉ số | Giá trị |
|---|---|
| Route kiểm tra | **164** |
| Route vẫn hiện chữ Việt khi chọn `en` | **164 (100%)** |
| Tổng ký tự Việt còn sót trong HTML | **26.198** |
| Chuỗi Việt viết thẳng trong `src/` | **4.602** (626 file) |
| File có gọi `t()` | **61** / 626 |

Không có trang nào sạch. Vì vậy issue được mở **theo khu vực chức năng**, không theo từng route — 164 route nhưng phần lớn dùng chung component.

## 2. Hai Phép Đo, Vì Một Phép Đo Sẽ Nói Dối

| Phép đo | Bắt được | Bỏ sót |
|---|---|---|
| **static** — quét literal trong `src/**` | vị trí chính xác `file:line` để sửa | chuỗi sinh ra từ helper, api module, hooks; và bắt cả fixture/seed (dương tính giả) |
| **runtime** — tải route với `NEXT_LOCALE=en` | bằng chứng người dùng thật thấy chữ Việt | không chỉ ra dòng nào trong mã |

Dùng cả hai: runtime để biết **trang nào hỏng**, static để biết **sửa ở đâu**.

## 3. Route Sót Nhiều Nhất

| Route | Ký tự Việt | Ví dụ chuỗi còn tiếng Việt |
|---|---|---|
| `/settings/org/billing` | 361 | Đang tải... |
| `/dashboard` | 358 | Đang tải... |
| `/settings` | 357 | Đang tải... |
| `/reports` | 326 | Đang tải... |
| `/settings/org/general` | 274 | Đang tải... |
| `/settings/org/profile` | 274 | Đang tải... |
| `/settings/organization` | 274 | Đang tải... |
| `/ai-agents` | 256 | Đang tải... |
| `/settings/channels/rate-limit` | 252 | Đang tải... |
| `/settings/account` | 240 | Đang tải... |
| `/settings/crm/deal-stages` | 240 | Đang tải... |
| `/settings/deal-stages` | 240 | Đang tải... |

Chuỗi xuất hiện trên ≥120 route: `Đang tải...` — nằm ở khung ứng dụng, không phải nội dung trang.

## 4. Phân Bố Theo Khu Vực

| Khu vực | Chuỗi | File |
|---|---|---|
| settings | 804 | 82 |
| utils (nhãn domain dùng chung) | 719 | 69 |
| chat | 498 | 80 |
| api + hooks (thông báo lỗi) | 384 | 89 |
| marketing | 371 | 45 |
| channels | 270 | 37 |
| contacts | 149 | 23 |
| constants (biến template, loại hoạt động) | 145 | 4 |
| groups | 132 | 15 |
| analytics | 97 | 19 |

## 5. Issue Đã Mở

| Issue | Khu vực | Chuỗi | File |
|---|---|---|---|
| !617 | Lớp nhãn dùng chung (utils/constants/lib) — nhãn domain ch | 967 | 89 |
| !618 | Thông báo lỗi & nhãn trả về từ api/hooks (hiện ra qua toas | 384 | 89 |
| !619 | Khung ứng dụng: sidebar, topbar, org switcher, thông báo,  | 39 | 6 |
| !620 | Cài đặt (settings/**) — 75 route | 804 | 82 |
| !621 | Hội thoại (chat/**) | 498 | 80 |
| !622 | Marketing (trigger/sequence/broadcast/lists/blocks) | 371 | 45 |
| !623 | Kênh kết nối (zalo/telegram/whatsapp/facebook/network) | 335 | 49 |
| !624 | CRM: khách hàng, nhóm, bạn bè, deal, lead-pool, tài khoản  | 437 | 65 |
| !625 | Bán hàng: sản phẩm, báo giá, bảng giá, đơn hàng | 240 | 32 |
| !626 | Báo cáo & phân tích | 136 | 24 |
| !627 | Kho media | 89 | 10 |
| !628 | Lịch hẹn & việc cần làm | 67 | 11 |
| !629 | AI Agents & trợ lý | 84 | 12 |
| !630 | Đăng nhập & tài khoản | 61 | 10 |
| !631 | Còn lại: dashboard, tutorial, egress, quota, integrations, | 89 | 20 |

Tracker: **!632** — `[i18n] Audit toàn bộ trang: 164/164 route còn chữ Việt khi chọn en`

## 6. Bốn Cái Bẫy Khi Sửa

1. **Nhãn trong `utils/` trả về chữ, không trả key.** `egress-helpers.ts`, `deal-logic.ts`, `zalo-grid-logic.ts` trả thẳng nhãn tiếng Việt cho component render. Sửa ở đây phải trả **key**, dịch ở chỗ render — nếu trả chữ thì mỗi lần render lại phải `t()`, rất dễ sót.
2. **Lỗi từ `api/client.ts` hiện ra qua toast.** Quét JSX không thấy. Phải trả mã lỗi (`errors.unauthorized`) thay vì câu tiếng Việt.
3. **`Intl` hardcode `vi-VN`.** `toLocaleString('vi-VN')` ở bảng tiền/ngày sẽ sai định dạng khi chọn `en`/`zh` dù chữ đã dịch. Phải truyền `locale` từ `useI18n()`.
4. **`<html lang>`.** `i18n/context.tsx:50-63` đã ghi lại lỗi cũ: server không đọc cookie nên HTML đúng byte giữa `vi` và `en`. Hiện đã sửa (`initialLocale`), nhưng mọi trang mới phải kiểm lại `lang`.


## 6.5 Tầng tài liệu — phát hiện thêm khi kiểm `<html lang>`

Không phải chuỗi dịch, mà là khung trang. Ảnh hưởng cả 164 route cùng lúc:

| Kiểm | Kết quả |
|---|---|
| `<html lang>` khi `NEXT_LOCALE=vi` / `en` / `zh` | **luôn `"vi"`** (đo trên `/dashboard`, `/settings`, `/chat`, `/login`) |
| `src/app/layout.tsx:29` | `lang="vi"` viết cứng |
| `src/app/layout.tsx:33` | `<I18nProvider>` không truyền `initialLocale` → server không resolve cookie |
| `src/app/layout.tsx:16-24` | `metadata` tĩnh, không dịch |
| Hardcode `'vi-VN'` | **181 chỗ** (`grep -rn "'vi-VN'" src`); chỉ 2 file trong `src/components` dùng `locale` từ `useI18n()` |

Vì vậy đổi sang `en`: chữ có thể dịch nhưng `lang` vẫn `vi`, tiền vẫn `1.234.567đ`, ngày vẫn `dd/mm/yyyy`. Issue riêng: **!633**.

## 7. Cách Chạy Lại

```bash
cd /path/to/omni-web-next
python3 omni-docs/scripts/i18n-audit.py parity  --repo .
python3 omni-docs/scripts/i18n-audit.py static  --repo .
python3 omni-docs/scripts/i18n-audit.py runtime --repo . --base http://localhost:3000
```

`static` và `runtime` trả exit code 1 khi còn chuỗi Việt → dùng được làm cổng CI.

## 8. Định Nghĩa Hoàn Thành

- [ ] `runtime` với `NEXT_LOCALE=en`: 0 ký tự Việt trong text nhìn thấy, ở cả 164 route
- [ ] `static`: 0 literal tiếng Việt ngoài `src/messages/`
- [ ] `parity`: 0 key lệch giữa 3 locale
- [ ] `<html lang>` khớp locale đang chọn ở mọi route (hiện luôn `"vi"` — !633)
- [ ] Không còn `toLocaleString('vi-VN')` hardcode
