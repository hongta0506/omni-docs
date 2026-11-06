# SPEC-FE-I18N-001: Frontend Internationalization (i18n) Architecture Specification

> **Mã đặc tả:** `SPEC-FE-I18N-001`  
> **Phiên bản:** `1.0.0` (Tháng 5/2026)  
> **Trạng thái:** `APPROVED / IN-PRODUCTION`  
> **Kho lưu trữ áp dụng:** `omni-web-next` (Next.js 16+ App Router, React 19) và tham chiếu tương thích `omni-web` (Vue 3).

---

## 1. Executive Summary & Bối cảnh

Hệ thống Omni CRM đang mở rộng phục vụ các doanh nghiệp đa quốc gia tại khu vực Đông Nam Á và Đông Á (Việt Nam, Singapore, Đài Loan, Trung Quốc). Để đảm bảo trải nghiệm người dùng nhất quán, ứng dụng cần hỗ trợ chuyển đổi đa ngôn ngữ tức thì, không làm reload cứng trình duyệt, và không gây xung đột cấu trúc định tuyến (URL routing) với hơn 173 route tĩnh/động hiện có.

### Mục tiêu kỹ thuật
1. **Zero Route Disruption**: Không sử dụng cấu trúc `/[locale]/...` gây thay đổi toàn bộ URL (tránh vỡ bookmark, deep-link `/chat/[convId]`, `/contacts/[id]`, `/quotes/[id]`).
2. **Type-Safe & Scalable**: Các chuỗi ngôn ngữ được quản lý tập trung theo file JSON phân cấp namespace (`common`, `chat`, `dashboard`, `settings`).
3. **Graceful Fallback**: Luôn fallback về Tiếng Việt (`vi`) nếu khóa dịch bị thiếu trong ngôn ngữ được chọn, và fallback về key path nếu không tìm thấy.
4. **Seamless Switching**: Chuyển đổi ngôn ngữ mượt mà trong Client State (React Context + Zustand), đồng thời đồng bộ vào `localStorage` và cookie `NEXT_LOCALE` để hỗ trợ Server-Side Rendering.
5. **Interpolation Support**: Hỗ trợ định dạng biến thay thế dạng `{variable}` (ví dụ: `Đã gửi {count} tệp tin`).

---

## 2. Danh sách ngôn ngữ hỗ trợ (Supported Locales)

| Mã Locale | Tên ngôn ngữ | Cờ hiển thị | Mặc định (Default) |
| :--- | :--- | :--- | :--- |
| `vi` | Tiếng Việt | 🇻🇳 | **Yes** (Fallback gốc) |
| `en` | English | 🇬🇧 | No |
| `zh` | 中文 (Chinese) | 🇨🇳 | No |

---

## 3. Cấu trúc thư mục & Tệp tin

```
omni-web-next/
├── src/
│   ├── messages/
│   │   ├── vi.json       # Từ điển Tiếng Việt (Source of Truth)
│   │   ├── en.json       # Từ điển Tiếng Anh
│   │   └── zh.json       # Từ điển Tiếng Trung
│   ├── i18n/
│   │   ├── config.ts     # Cấu hình supported locales, metadata, storage keys
│   │   ├── context.tsx   # I18nProvider, useI18n, useTranslation, useLocale
│   │   └── index.ts      # Re-export barrel
│   └── components/layout/
│       ├── language-switcher.tsx # Dropdown chọn ngôn ngữ (TopNav)
│       └── top-nav.tsx           # Tích hợp Switcher
```

---

## 4. Phân cấp Namespace trong Từ điển JSON

Mỗi tệp tin ngôn ngữ (`vi.json`, `en.json`, `zh.json`) được cấu trúc thành 4 nhóm chính:

### 4.1 `common`
Các nhãn nút bấm, trạng thái tải, thông báo xác nhận dùng chung trên toàn hệ thống:
- `save`: Lưu / Save / 保存
- `cancel`: Hủy / Cancel / 取消
- `send`: Gửi / Send / 发送
- `delete`: Xóa / Delete / 删除
- `edit`: Chỉnh sửa / Edit / 编辑
- `search`: Tìm kiếm... / Search... / 搜索...
- `loading`: Đang tải... / Loading... / 加载中...
- `confirm`: Xác nhận / Confirm / 确认
- `retry`: Thử lại / Retry / 重试

### 4.2 `chat`
Các nhãn nghiệp vụ dành riêng cho màn hình Trò chuyện & Hội thoại:
- `title`: Danh sách hội thoại
- `search_placeholder`: Tìm kiếm hội thoại, khách hàng...
- `composer_placeholder`: Nhập tin nhắn... (Enter để gửi)
- `takeover_resume_bot`: Bật lại AI Bot
- `takeover_paused`: AI Bot đang tạm dừng do nhân viên tiếp quản
- `filter_all`, `filter_unread`, `filter_ai`
- `sending`, `sent`, `delivered`, `seen`: Trạng thái biên nhận tin nhắn

### 4.3 `dashboard`
Các chỉ số phân tích, báo cáo tổng quan:
- `title`: Tổng quan / Dashboard / 控制台
- `today_conversations`: Hội thoại hôm nay
- `response_rate`: Tỉ lệ phản hồi
- `ai_handled`: AI xử lý thành công

### 4.4 `settings`
Cài đặt cá nhân, tổ chức và hệ thống:
- `title`: Cài đặt / Settings / 设置
- `language`: Ngôn ngữ / Language / 语言
- `theme`: Giao diện / Theme / 主题
- `quota`: Hạn ngạch AI / AI Quota / AI 配额

---

## 5. Storage and Detection Strategy
1. **Cookie (`NEXT_LOCALE`)**: Nguồn đọc ưu tiên cho SSR rendering để chống layout shift và đồng bộ cookie phiên.
2. **LocalStorage (`omni_preferred_locale`)**: Lưu trữ tùy chọn ở client qua các lần mở lại trình duyệt.
3. **Accept-Language Header**: Dùng làm fallback nhận diện tự động trong lần truy cập đầu tiên nếu chưa có cookie/storage.

---

## 6. Quy trình thêm khóa dịch mới (Workflow)

1. **Thêm vào `src/messages/vi.json` trước** (nguồn chuẩn hóa).
2. **Cập nhật tương ứng vào `en.json` và `zh.json`** với cùng đường dẫn key.
3. Trong component React:
   ```tsx
   import { useTranslation } from '@/i18n';

   export function MyComponent() {
     const { t } = useTranslation();
     return <button>{t('common.save')}</button>;
   }
   ```
4. Kiểm tra tự động bằng unit test:
   ```bash
   node test/i18n-architecture.test.mjs
   ```

---

## 7. Tiêu chuẩn Kiểm định & Acceptance Criteria
- [x] Cài đặt và cấu hình thành công kiến trúc i18n không làm vỡ 173 routes trên `omni-web-next`.
- [x] Chuyển đổi mượt mà giữa Tiếng Việt, Tiếng Anh và Tiếng Trung qua `LanguageSwitcher` trên TopNav.
- [x] Các màn hình cốt lõi (Chat, Dashboard, Settings, Common) được tách chuỗi ra JSON dictionary.
- [x] Tài liệu kiến trúc `FRONTEND-I18N-INTERNATIONALIZATION-SPEC.md` được ban hành tại `omni-docs`.
