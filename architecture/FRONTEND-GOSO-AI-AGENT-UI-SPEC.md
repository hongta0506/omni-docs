# Frontend UI/UX Architecture & Component Specification for GOSO AI Agent & Takeover

> **ĐẶC TẢ KIẾN TRÚC GIAO DIỆN & TÁC VỤ NGƯỜI DÙNG CHO HỆ THỐNG GOSO AI AGENT (OMNI-WEB)**  
> **Mã tài liệu:** `SPEC-UI-GOSO-001`  
> **Target Repository:** `omni-web` (`src/`)  
> **Bounded Contexts liên quan:**  
> - `internal/conversation` (BC 4 — Conversation & Media)  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge)  
> - `internal/service` (BC 8 — Service API & Gateway)  
> - `internal/deal` (BC 5 — Deal & E-commerce)  
> **Trạng thái:** APPROVED FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, component name, props, store name, event name giữ nguyên Tiếng Anh)  

---

## 1. Nguyên Tắc Thiết Kế Giao Diện (Core UX Directives)

Theo định hướng tại `omni-web/AGENTS.md` (Docs-First, Zero Silent Mock Fallback, Strict TypeScript, Vuetify 3 / SCSS):
1. **Không can thiệp ngầm (Transparency):** Nhân viên phải luôn biết ai đang cầm quyền phát ngôn trong phiên chat (Bot hay Người).
2. **Không nói đè (Zero Speech Collision):** Khi nhân viên gõ phím hoặc ấn tiếp quản, giao diện phản hồi trạng thái `HUMAN_TAKEN_OVER` ngay lập tức (Optimistic UI) và hiển thị đồng hồ đếm ngược Grace Period 30 phút.
3. **Phản ứng khẩn cấp một chạm (Emergency Kill-Switch):** Quản trị viên có thể dập cầu dao tức thì cho từng Agent Credential trực tiếp trên Dashboard khi bot có dấu hiệu sai lệch.
4. **Kiểm duyệt Human-in-the-Loop (L1 Proposals):** Các báo giá và đơn hàng do AI Agent tạo nháp ở cấp L1 phải xuất hiện nổi bật tại Chat Panel để nhân viên duyệt trước khi bắn sang cho khách hàng.

---

## 2. Sơ Đồ Cấu Trúc Component Phía Frontend (`omni-web`)

```
src/
├── api/
│   ├── aigateway.ts                 # API Client gọi /api/v1/ai/agent-hands, /api/v1/service/credentials
│   └── takeover.ts                  # API Client gọi /api/v1/conversations/:id/human-takeover, agent-control
│
├── composables/
│   ├── use-takeover.ts              # Quản lý Lease, Hold Timer 30m, State machine, WS listeners
│   ├── use-agent-hands.ts           # Quản lý Credentials, Kill-Switch, Autonomy L1/L2/L3
│   └── use-proposal-approval.ts     # Quản lý hàng đợi duyệt báo giá/đơn hàng L1
│
├── stores/
│   └── takeover-store.ts            # Pinia store lưu trạng thái takeover map theo conversation_id
│
├── components/
│   ├── chat/
│   │   ├── ConversationTakeoverBar.vue    # Thanh điều khiển trạng thái Bot/Người ở đầu Thread
│   │   ├── TakeoverGraceCountdown.vue     # Widget đếm ngược cửa sổ trượt 30 phút
│   │   ├── HandoffAlertBanner.vue         # Banner cảnh báo đỏ khi bot yêu cầu người cứu viện
│   │   └── AgentProposalApprovalCard.vue  # Thẻ duyệt Báo giá / Đơn hàng nháp của Bot
│   │
│   └── settings/
│       ├── AgentHandsCredentialList.vue   # Bảng danh sách API Key Agent Hands
│       ├── AgentHandsCreateDialog.vue     # Dialog tạo Token thô mới kèm Scopes
│       ├── AutonomyLevelSelect.vue        # Dropdown cấu hình cấp L1 / L2 / L3
│       └── EmergencyKillSwitchModal.vue   # Modal dập cầu dao màu đỏ cảnh báo cao
│
└── views/
    ├── ChatView.vue                       # Tích hợp TakeoverBar & HandoffAlertBanner
    └── settings/
        └── AgentHandsSettingsView.vue     # Màn hình cấu hình Agent Hands & Gateways
```

---

## 3. Đặc Tả Chi Tiết Các Component Nghiệp Vụ

### 3.1 Component `ConversationTakeoverBar.vue` (Thanh Kiểm Soát Hội Thoại)

- **Vị trí hiển thị:** Cố định ở phần trên cùng của cửa sổ chat (`MessageThread.vue`), ngay dưới thông tin khách hàng.
- **Props:**
  ```typescript
  interface Props {
    conversationId: string;
    customerName: string;
    channelType: 'ZALO' | 'TELEGRAM' | 'FACEBOOK';
  }
  ```
- **Các trạng thái hiển thị (State Variations):**

| Trạng thái | Màu sắc / Icon | Nhãn hiển thị | Hành động (Action Buttons) |
|---|---|---|---|
| `BOT_ACTIVE` | Xanh lá (`#10B981`) / `BotIcon` | **"AI Agent đang phản hồi tự động"** | Nút **"Tiếp quản hội thoại"** (`btn-takeover`). |
| `HUMAN_TAKEN_OVER` | Cam hổ phách (`#F59E0B`) / `UserCheckIcon` | **"Nhân viên đang tiếp quản"** + `<TakeoverGraceCountdown />` | Nút **"Trả quyền cho Bot"** (`btn-release`) & Nút **"Gia hạn 30p"**. |
| `HANDOFF_PENDING` | Đỏ nhấp nháy (`#EF4444`) / `AlertTriangleIcon` | **"Bot yêu cầu nhân viên can thiệp!"** | Nút **"Tiếp nhận ngay"** (Ưu tiên số 1). |
| `BOT_MUTED` | Xám (`#6B7280`) / `BotOffIcon` | **"AI Agent đang tắt"** | Nút **"Bật lại Bot"**. |

- **Hành vi tự động khi nhân viên soạn tin (Type-to-Takeover):**
  - Khi nhân viên focus và gửi tin nhắn trong `rich-text-editor.vue`:
  - Hệ thống tự động kích hoạt `acquireTakeover(conversationId)` ngầm nếu trạng thái đang là `BOT_ACTIVE`.
  - Cửa sổ trượt 30 phút tự động reset lại 1.800 giây.

---

### 3.2 Component `TakeoverGraceCountdown.vue` (Đồng Hồ Đếm Ngược Cửa Sổ Trượt)

- **Props:**
  ```typescript
  interface Props {
    holdUntil: string | null; // ISO 8601 string
    compact?: boolean;
  }
  ```
- **Logic hoạt động:**
  - Sử dụng `useIntervalFn` từ `@vueuse/core` chu kỳ 1.000ms.
  - Tính toán `remainingSeconds = Math.max(0, Math.floor((new Date(holdUntil) - Date.now()) / 1000))`.
  - Định dạng chuỗi hiển thị: `mm:ss` (Ví dụ: `28:45`).
  - Khi `remainingSeconds <= 0`:
    - Phát ra event `emits('expired')`.
    - Trạng thái UI chuyển tự động về `BOT_ACTIVE` (phù hợp với logic Background Sweeper ở backend).

---

### 3.3 Component `HandoffAlertBanner.vue` (Banner Yêu Cầu Cứu Viện)

- **Kích hoạt:** Khi nhận được WebSocket event `handoff:requested` từ `omni-core`.
- **Nội dung hiển thị:**
  - Biểu tượng cảnh báo đỏ khẩn cấp.
  - Lý do bot yêu cầu bàn giao:
    - `CUSTOMER_REQUESTED_STAFF`: "Khách hàng yêu cầu gặp tư vấn viên trực tiếp."
    - `NEGATIVE_SENTIMENT`: "Phát hiện thái độ giận dữ hoặc bức xúc."
    - `KNOWLEDGE_UNAVAILABLE`: "Vấn đề ngoài phạm vi kiến thức của AI."
  - Bản tóm tắt ngữ cảnh cuộc hội thoại (Conversation Summary do bot trích xuất).
  - Nút bấm to: **"TIẾP QUẢN NGAY"** (nhấn vào sẽ gọi API `/human-takeover` với `action: "acquire"`).

---

### 3.4 Component `AgentProposalApprovalCard.vue` (Thẻ Duyệt Báo Giá / Đơn Nháp L1)

- **Vị trí hiển thị:** Trong `ChatContactPanel.vue` (Tab "Đơn hàng/Báo giá") hoặc dạng Bubble tương tác ghim trong luồng chat.
- **Dữ liệu hiển thị:**
  - Tiêu đề: "Đề xuất Báo giá #Q-2026-1005 do AI khởi tạo (Chờ duyệt)"
  - Bảng danh mục sản phẩm: SKU, Số lượng, Đơn giá, % Chiết khấu, Thành tiền.
  - Ghi chú khách hàng.
  - Mức chiết khấu và tổng giá trị thanh toán.
- **Hành động nhân viên:**
  - Nút xanh **"Duyệt & Gửi khách"**: Gọi `POST /api/v1/deal/proposals/:id/approve`. Backend sẽ chuyển trạng thái Quote sang `SENT` và gửi tin nhắn link báo giá qua Zalo/Telegram.
  - Nút đỏ **"Từ chối"**: Gọi `POST /api/v1/deal/proposals/:id/reject` kèm modal nhập lý do từ chối để huấn luyện lại AI.

---

### 3.5 Component `EmergencyKillSwitchModal.vue` (Modal Dập Cầu Dao Khẩn Cấp)

- **Cảnh báo an toàn (Danger Zone):**
  - Màu nền: Đỏ Ruby (`#991B1B`).
  - Nội dung xác nhận: *"Hành động này sẽ ngắt toàn bộ quyền hạn Agent Hands, hủy mọi tác vụ tự động ghi dữ liệu và thu hồi phiên kết nối MCP Server ngay lập tức!"*
  - Yêu cầu người dùng gõ chuỗi chữ: `DAP-CAU-DAO` vào ô xác nhận trước khi kích hoạt nút đỏ.
  - Khi xác nhận thành công:
    - Gọi `POST /api/v1/service/credentials/:id/kill-switch`.
    - Bắn Toast thông báo: *"Đã dập cầu dao khẩn cấp thành công cho Agent."*
    - Cập nhật trạng thái badge của Credential sang `KILL_SWITCHED` (Màu đỏ sẫm).

---

## 4. Đặc Tả Composable & Pinia Store

### 4.1 Composable `useTakeover.ts`

```typescript
import { ref, computed } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { takeoverApi } from '@/api/takeover';
import { useSocketStore } from '@/stores/socket-store';

export type AgentControlStatus = 'BOT_ACTIVE' | 'HUMAN_TAKEN_OVER' | 'BOT_MUTED' | 'HANDOFF_PENDING';

export function useTakeover(conversationId: string) {
  const status = ref<AgentControlStatus>('BOT_ACTIVE');
  const currentLease = ref<number>(1);
  const holdUntil = ref<string | null>(null);
  const lastStaffId = ref<string | null>(null);
  const handoffReason = ref<string | null>(null);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // Tính số giây còn lại của Grace Period
  const remainingSeconds = computed(() => {
    if (!holdUntil.value) return 0;
    const diff = Math.floor((new Date(holdUntil.value).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  // Timer 1s đếm ngược
  const { pause, resume } = useIntervalFn(() => {
    if (remainingSeconds.value <= 0 && status.value === 'HUMAN_TAKEN_OVER') {
      status.value = 'BOT_ACTIVE';
      holdUntil.value = null;
      pause();
    }
  }, 1000, { immediate: false });

  // 1. Tiếp quản thủ công
  async function acquireTakeover(graceMinutes = 30) {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await takeoverApi.acquire(conversationId, graceMinutes);
      status.value = res.agent_control_status;
      currentLease.value = res.agent_lease;
      holdUntil.value = res.hold_until;
      resume();
    } catch (err: any) {
      error.value = err.message || 'Lỗi khi tiếp quản hội thoại';
    } finally {
      isLoading.value = false;
    }
  }

  // 2. Trả quyền cho Bot
  async function releaseTakeover() {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await takeoverApi.release(conversationId);
      status.value = res.agent_control_status;
      currentLease.value = res.agent_lease;
      holdUntil.value = null;
      pause();
    } catch (err: any) {
      error.value = err.message || 'Lỗi khi trả quyền cho bot';
    } finally {
      isLoading.value = false;
    }
  }

  // 3. Đăng ký nhận sự kiện WebSocket thời gian thực
  function subscribeEvents(socket: any) {
    socket.on('takeover:acquired', (data: any) => {
      if (data.conversation_id === conversationId) {
        status.value = data.agent_control_status;
        currentLease.value = data.agent_lease;
        holdUntil.value = data.hold_until;
        resume();
      }
    });

    socket.on('takeover:extended', (data: any) => {
      if (data.conversation_id === conversationId) {
        holdUntil.value = data.hold_until;
      }
    });

    socket.on('takeover:released', (data: any) => {
      if (data.conversation_id === conversationId) {
        status.value = data.agent_control_status;
        currentLease.value = data.agent_lease;
        holdUntil.value = null;
        pause();
      }
    });

    socket.on('handoff:requested', (data: any) => {
      if (data.conversation_id === conversationId) {
        status.value = 'HANDOFF_PENDING';
        handoffReason.value = data.reason;
      }
    });
  }

  return {
    status,
    currentLease,
    holdUntil,
    remainingSeconds,
    isLoading,
    error,
    acquireTakeover,
    releaseTakeover,
    subscribeEvents
  };
}
```

---

## 5. Danh Sách Kiểm Tra & Tiêu Chuẩn Chất Lượng (Quality Gate)

Tuân thủ nghiêm ngặt quy định tại `omni-web/AGENTS.md`:
- [ ] **Zero Silent Mock Fallback:** Nếu API `/human-takeover` lỗi 400/409/500, tuyệt đối không tự ý gán biến `status.value = 'HUMAN_TAKEN_OVER'` giả lập. Bắt buộc hiển thị Snackbar/Toast lỗi thật.
- [ ] **Strict TypeScript:** Tất cả DTO trả về từ API Takeover và WebSocket payload phải có interface chuẩn (`TakeoverResponseDTO`, `TakeoverWSEventDTO`). Không sử dụng `any`.
- [ ] **Cleanup Timer & Listener:** Trong `onUnmounted()` của Vue component, bắt buộc gọi `pause()` timer và `socket.off()` toàn bộ 4 sự kiện `takeover:*`.
- [ ] **Type-check Gate:** Chạy `pnpm run build` (`vue-tsc -b`) và `pnpm run test` (Vitest) không có bất kỳ lỗi biên dịch nào.
