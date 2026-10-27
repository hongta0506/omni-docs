# FRONTEND-NEXTJS-ARCHITECTURE-SPEC.md — Đặc Tả Kiến Trúc Chuẩn Frontend Next.js (Omni Platform)

> **Mã đặc tả:** `SPEC-FE-NEXTJS-001`  
> **Trạng thái:** OFFICIAL ENGINEERING SPECIFICATION  
> **Áp dụng cho:** Repository `omni-web-next` (GitLab: `hong.taxuan/omni-web-next.git`)  
> **Kế thừa tiêu chuẩn:** Kỷ luật kỹ thuật & chuẩn vận hành từ dự án `lottery` (`CLAUDE.md` & `AGENTS.md`).

---

## 1. Bối Cảnh Kỹ Thuật & Tầm Nhìn Chuyển Dịch

Nền tảng **Omni Core** đã hoàn thiện 8 Bounded Contexts backend theo kiến trúc Clean DDD (Go 1.22+, Connect-RPC, Bun ORM). Phiên bản frontend hiện tại (`omni-web`) được xây dựng trên Vue 3 + Vuetify + Vite.

Nhằm tối ưu hóa hiệu năng render (Server-Side Rendering / React Server Components), đón đầu hệ sinh thái UI hiện đại (**Tailwind CSS v4 + shadcn/ui + Radix UI**) và tăng cường khả năng mở rộng đa nền tảng, hệ thống khởi tạo repo frontend thế hệ mới: **`omni-web-next`** lưu trữ chính thức trên GitLab.

### Nguyên Tắc Cốt Lõi Kế Thừa Từ Dự Án Lottery
Hệ thống áp dụng 6 nguyên tắc bất biến đã được chứng minh hiệu quả tại dự án Lottery:
1. **Think Before Coding**: Không đoán mò, làm rõ mọi giả định, nêu bật đánh đổi (tradeoffs) trước khi gõ code.
2. **Simplicity First (Lazy Senior Mindset)**: Đoạn code tốt nhất là đoạn code không phải viết. Tận dụng tối đa stdlib và native primitives; cấm sinh boilerplate hay abstraction dư thừa cho tính năng chưa yêu cầu.
3. **Surgical Changes**: Chạm đúng chỗ cần sửa, dọn sạch rác phát sinh từ thay đổi của mình, không sửa lan man mã nguồn xung quanh.
4. **Goal-Driven Execution**: Mọi nhiệm vụ đều quy về mục tiêu kiểm thử được (Red-Green-Refactor loop).
5. **Documentation & Docs-First Workflow**: Đọc kỹ `omni-docs` trước khi làm; cập nhật task spec và đợi người dùng xác nhận mới bắt đầu code.
6. **Zero Silent Mock Fallback**: Tuyệt đối không chèn fake data arrays `[...]` hay dummy stubs để che giấu lỗi API.

---

## 2. Quy Chuẩn Công Nghệ (Core Tech Stack)

| Thành phần | Công nghệ lựa chọn | Phiên bản | Vai trò & Lý do |
|---|---|---|---|
| **Framework** | Next.js (App Router, Turbopack) | `16.4+` | SSR, RSC, Partial Prerendering, tối ưu SEO & First Meaningful Paint |
| **Core UI Library** | React | `19.3+` | Concurrency, Actions, useOptimistic, useTransition |
| **Styling** | Tailwind CSS v4 + `@tailwindcss/turbopack` | `4.3+` | Utility-first siêu tốc, không cấu hình lỉnh kỉnh, tương thích Turbopack |
| **UI Primitives** | Radix UI + shadcn/ui primitives | Latest | Accessibility (a11y) WCAG AAA, headless, dễ tùy biến giao diện CRM |
| **Class Utilities** | `clsx` + `tailwind-merge` + `class-variance-authority` | Latest | Quản lý biến thể component qua helper `cn()` chuẩn hóa |
| **Icon System** | `lucide-react` | `1.6+` | Nhẹ, sắc nét, đồng bộ phong cách thiết kế |
| **Client State** | **Zustand** | `5.0+` | Quản lý state UI nhẹ (Auth tokens, Sidebar collapse, Active conversation, Copilot dock) |
| **Server Cache** | **TanStack React Query** | `5.105+` | Cache API, dedup requests, polling thông minh, optimistic UI |
| **Streaming** | Server-Sent Events (SSE) Native Reader | Standard | Nhận token thời gian thực từ AI Copilot và Router9 GOSO |
| **Testing** | Vitest + React Testing Library | Latest | Chạy test component và logic headless với tốc độ mili-giây |

---

## 3. Cấu Trúc Thư Mục & Ánh Xạ Bounded Context

Thư mục `src/` được bố trí theo App Router của Next.js, phân rã 1:1 theo các Bounded Context của backend:

```
src/
├── app/                                    # Next.js App Router
│   ├── (auth)/                             # Nhóm route công khai / xác thực (BC 1)
│   │   ├── login/page.tsx
│   │   └── forgot-password/page.tsx
│   │
│   ├── (dashboard)/                        # Shell quản trị CRM đa người thuê (Authenticated)
│   │   ├── layout.tsx                      # AppShell: Sidebar + TopNav + Bottom Dock
│   │   ├── page.tsx                        # Dashboard KPI tổng quan
│   │   │
│   │   ├── chat/                           # BC 4: Conversation & Message Stream
│   │   │   ├── page.tsx                    # Khung chat đa kênh
│   │   │   └── [id]/page.tsx               # Hội thoại chi tiết với khách hàng
│   │   │
│   │   ├── contacts/                       # BC 3: Customer & Lead Management
│   │   │   ├── page.tsx                    # Danh sách khách hàng, bộ lọc thông minh
│   │   │   └── [id]/page.tsx               # Hồ sơ 360 độ & Dòng thời gian (Timeline)
│   │   │
│   │   ├── channels/                       # BC 2: Channel Gateway Management
│   │   │   ├── zalo/page.tsx               # Quản lý nick Zalo cá nhân & Zalo OA
│   │   │   ├── telegram/page.tsx           # Quản lý tài khoản MTProto & Bot
│   │   │   ├── facebook/page.tsx           # Quản lý nick Facebook cá nhân
│   │   │   └── whatsapp/page.tsx           # Quản lý phiên Baileys WhatsApp
│   │   │
│   │   ├── deals/                          # BC 5: Deal & Sales Pipeline
│   │   │   └── page.tsx                    # Kanban board, deal stages
│   │   │
│   │   ├── orders/                         # BC 6: Retail Egress & Orders
│   │   │   └── page.tsx                    # Đơn hàng đồng bộ từ Pancake/POS
│   │   │
│   │   └── settings/                       # BC 1 & BC 7: Cài đặt hệ thống & AI
│   │       ├── profile/page.tsx            # Hồ sơ người dùng
│   │       ├── team/page.tsx               # Phân quyền phòng ban, RBAC
│   │       └── ai-agent/page.tsx           # Cấu hình AI Agent & Persona GOSO
│   │
│   ├── api/                                # Next.js Route Handlers (BFF nếu cần)
│   ├── globals.css                         # Tailwind CSS v4 directives & theme tokens
│   └── layout.tsx                          # Root layout, HTML/body tags, QueryClientProvider
│
├── components/
│   ├── ui/                                 # Primitives headless shadcn/ui
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── skeleton.tsx
│   │   └── badge.tsx
│   │
│   ├── ai/                                 # AI Copilot Components
│   │   ├── AiCopilotDock.tsx               # Bottom-Center Capsule Dock (Ctrl+K)
│   │   ├── AiCopilotChatWindow.tsx         # Khung chat streaming trồi lên từ dock
│   │   └── AiCopilotMessageItem.tsx        # Render từng lượt chat, mini markdown
│   │
│   ├── chat/                               # Chat widgets (MessageBubble, Composer, AlbumGrid)
│   ├── layout/                             # TopNav, Sidebar, BottomNav
│   └── feedback/                           # EmptyState, ErrorAlert, ConfirmDialog
│
├── lib/
│   ├── utils.ts                            # Helper cn() merge class Tailwind
│   ├── api-client.ts                       # Axios / Fetch client inject Bearer JWT & X-Tenant-ID
│   └── sse-parser.ts                       # Bộ phân tích SSE stream đa key (token/text/delta)
│
├── stores/                                 # Zustand Stores
│   ├── use-auth-store.ts                   # Quản lý JWT token, tenant hiện tại, permissions
│   ├── use-chat-store.ts                   # Quản lý hội thoại đang active, draft message
│   └── use-copilot-store.ts                # Quản lý dock mở/đóng, lịch sử hỏi Copilot
│
└── types/                                  # TypeScript DTOs chuẩn hóa khớp Backend Bun ORM
    ├── conversation.ts
    ├── contact.ts
    ├── channel.ts
    └── copilot.ts
```

---

## 4. Đặc Tả Giao Tiếp Real-Time & Streaming AI

### 4.1 Bóc Tách SSE Stream Token Đa Giao Thức (`lib/sse-parser.ts`)
Để tương thích hoàn toàn với backend Go chuyển đổi từ gRPC sang REST SSE:
- **Tập Event Chuẩn Hóa**:
  - `event: token`: Chứa chunk văn bản LLM phát ra.
  - `event: tool_start`: Bắt đầu thực thi MCP tool.
  - `event: tool_result`: Kết quả trả về của tool.
  - `event: proposal`: Đề xuất hành động nhạy cảm cần xác nhận (L1 Autonomy Gate).
  - `event: done`: Kết thúc stream hoàn tất.
  - `event: error`: Báo lỗi từ provider AI.
- **Hàm Bóc Tách Token An Toàn**:
```ts
export function extractTokenChunk(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return data.token ?? data.text ?? data.content ?? data.delta ?? data.chunk_text ?? '';
}
```

### 4.2 Thiết Kế Bottom-Center Capsule Dock (`components/ai/AiCopilotDock.tsx`)
- **Vị trí cố định**: `fixed bottom-4 left-1/2 -translate-x-1/2 z-50`.
- **Kích thước**: Cao 38px, bo tròn dạng capsule (`rounded-full`), nền kính mờ (`bg-slate-900/85 backdrop-blur-md border border-white/15`).
- **Phím tắt toàn cục**: `Ctrl+K` (Windows/Linux) hoặc `⌘K` (macOS) để bật/tắt tức thì.
- **Giải phóng 100% góc phải màn hình**: Khung soạn thảo tin nhắn, nút gửi tin, nút đính kèm của CRM không bao giờ bị che khuất.

---

## 5. Tiêu Chuẩn Thiết Kế UX/UI Pro Max (5 Trạng Thái Cốt Lõi)

Mọi màn hình và component trong `omni-web-next` bắt buộc phải hiện thực hóa đủ 5 trạng thái:
1. **Loading State**: Sử dụng skeleton loaders (`<Skeleton />`) mô phỏng đúng cấu trúc layout (table rows, user cards, message bubbles). Tuyệt đối không dùng spinner trống giữa màn hình.
2. **Empty State**: Bao gồm icon ngữ cảnh, tiêu đề súc tích, câu giải thích và một nút Call-to-Action (CTA) cụ thể (ví dụ: *"Chưa có hội thoại nào — Bấm 'Tạo tin nhắn mới' để bắt đầu"*).
3. **Error State**: Bắt chuẩn mã lỗi HTTP (400, 401, 403, 404, 500), hiển thị thông điệp dễ hiểu kèm nút **Thử lại (Retry)**.
4. **Active / Populated State**: Thiết kế mật độ dữ liệu cao (High Data Density) phục vụ nhân viên vận hành CRM, định dạng tiền tệ, ngày giờ chuẩn tiếng Việt qua `Intl`.
5. **In-Action / Progress State**: Khi thực hiện hành động (Gửi tin, Quét mã QR, Đổi trạng thái), nút bấm phải bị disable kèm hiệu ứng spinner, hiển thị tiến trình (`<Progress />`) đối với tác vụ nền dài.

---

## 6. Quy Trình Kiểm Soát Chất Lượng (Quality Gate Rules)

Mọi AI Agent làm việc trên `omni-web-next` phải tuân thủ nghiêm ngặt:
1. **Check TypeScript Không Lỗi**:
   ```bash
   pnpm exec tsc --noEmit
   ```
2. **Check Build Next.js Hoàn Hảo**:
   ```bash
   pnpm run build
   ```
3. **Kiểm tra Unit Tests**:
   ```bash
   pnpm run test
   ```
4. **Git Flow Trên GitLab**:
   - Nhánh chính: `main`. Tuyệt đối không push trực tiếp vào `main`.
   - Tạo nhánh theo cú pháp: `feat/<ten-tinh-nang>` hoặc `fix/<ma-loi>`.
   - Tạo Merge Request (MR) trên GitLab và yêu cầu review trước khi merge.
