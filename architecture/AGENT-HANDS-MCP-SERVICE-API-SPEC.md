# Agent Hands, MCP Tools & Service API Gateway Specification

> **ĐẶC TẢ KIẾN TRÚC & HỢP ĐỒNG GIAO DIỆN TÁC VỤ CHO AI AGENT (AGENT HANDS & MCP GATEWAY)**  
> **Mã tài liệu:** `SPEC-ARCH-GOSO-003`  
> **Bounded Contexts liên quan:**  
> - `internal/service` (BC 8 — Service API & Gateway)  
> - `internal/aiagent` (BC 7 — AI Agent & Knowledge)  
> - `internal/customer` (BC 3 — Customer & Lead)  
> - `internal/deal` (BC 5 — Deal & E-commerce)  
> **Trạng thái:** DRAFT / APPROVED FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ code, API, Scope, Schema giữ nguyên Tiếng Anh)  

---

## 1. Mục Tiêu & Khái Niệm "Agent Có Tay" (Context & Conceptual Model)

AI Agent nếu chỉ đọc tin nhắn và sinh văn bản trả lời thì chỉ là "Chatbot biết nói". Để trở thành trợ lý kinh doanh thực thụ, Agent cần **"Đôi tay" (Agent Hands)** để thao tác trực tiếp vào dữ liệu hệ sinh thái CRM:
- Tra cứu hồ sơ khách hàng, lịch sử mua hàng, công nợ.
- Gắn thẻ (Tag), chấm điểm tiềm năng (Scoring), phân loại Lead.
- Khởi tạo Cơ hội bán hàng (Deal), tạo Bản báo giá nháp (Quote Draft).
- Tra cứu bảng giá sản phẩm và tồn kho thời gian thực.
- Đề xuất chuyển giai đoạn phễu bán hàng.

Kiến trúc này được thực thi thông qua chuẩn mở **Model Context Protocol (MCP)** do Anthropic khởi xướng, kết hợp cùng lớp **Service API Gateway** được kiểm soát bảo mật chặt chẽ trong `omni-core`.

```
=============================================================================
                          GOSO AI AGENT ENGINE
 (LLM Reasoning Loop -> Quyết định gọi tool: zcrm.create_deal / zcrm.get_stock)
=============================================================================
                                     │
                                     ▼ (MCP JSON-RPC 2.0 / SSE Transport)
=============================================================================
               SERVICE API GATEWAY (internal/service)
 - Xác thực API Key: `omni_live_xxx` (SHA-256 Hash Lookup)
 - Kiểm tra Tenant Context & Rate Limiting (Redis Token Bucket)
 - Kiểm tra Phân Quyền Hạt Mịn (RBAC Scopes Enforcement)
 - Kiểm tra Cấp Độ Tự Chủ (Autonomy Gate L1 / L2 / L3)
 - Chốt Chặn Khẩn Cấp (Tenant Kill-Switch)
=============================================================================
       │                     │                     │                     │
       ▼                     ▼                     ▼                     ▼
[BC 3: Customer]      [BC 4: Conversation]  [BC 5: Deal]          [BC 6: Marketing]
 Tra cứu Lead,         Gửi tin nhắn,         Tạo Báo giá,          Gắn Tag,
 Cập nhật Phone        Đọc lịch sử Chat      Tra tồn kho           Trigger Sequence
```

---

## 2. Mô Hình Phân Quyền & Cấp Độ Tự Chủ (Scopes & Autonomy Levels)

### 2.1 Ma Trận Phân Quyền Scope (Service Credential Scopes)

Khi kích hoạt "Agent có tay" (`Agent Hands`), hệ thống chỉ cấp phát tập Scope an toàn tối thiểu (Least Privilege). Tuyệt đối **cấm** cấp quyền quản trị hạ tầng hoặc quyền gửi hàng loạt (Bulk).

| Danh mục Scope | Scope Identifier | Quyền hạn cấp cho Agent Hands | Rủi ro |
|---|---|---|---|
| **Master Scopes** | `agent:hands:write` | **Scope bắt buộc cho mọi tác vụ ghi nghiệp vụ qua Agent Hands.** Bao gồm tạo đơn, gửi báo giá, đổi trạng thái lead, điều phối sale có kiểm soát. | Cao |
| | `agent:hands:read` | **Scope đọc tổng hợp cho Agent Hands.** Tra cứu lead, sản phẩm, lịch sử hội thoại, tồn kho. | Thấp |
| **Đọc dữ liệu** | `crm.read` | Đọc hồ sơ khách hàng, ghi chú, timeline | Thấp |
| | `messages.read` | Đọc lịch sử trò chuyện trong thread | Thấp |
| | `scoring.read` | Đọc điểm tín nhiệm và phân loại lead | Thấp |
| | `retail.read` | Tra cứu danh mục sản phẩm, bảng giá, tồn kho | Thấp |
| **Ghi nghiệp vụ** | `crm.write` | Tạo/sửa liên hệ, cập nhật ghi chú | Trung bình |
| | `messages.send` | Gửi tin nhắn đơn lẻ trực tiếp cho khách | Trung bình |
| | `deals.write` | Tạo cơ hội bán hàng nháp | Trung bình |
| | `quotes.write` | Lập báo giá nháp cho khách | Trung bình |
| | `deals.transition` | Đề xuất chuyển giai đoạn Deal | Trung bình |
| | `leads.assign` | Điều phối lead cho sale (Yêu cầu `agent:hands:write` + Role Guard) | Trung bình |
| **BỊ CẤM (FORBIDDEN)** | `control.kill-switch.manage` | **NGHIÊM CẤM:** Không cho phép tự tắt kill-switch | Cực cao |
| | `automation.execute` | **NGHIÊM CẤM:** Không cho phép tự kích hoạt workflow nền | Cao |
| | `webhooks.manage` | **NGHIÊM CẤM:** Không cho phép sửa webhook cấu hình | Cực cao |

### 2.2 Cấp Độ Tự Chủ Của Agent (Autonomy Levels - SPEC 048)

| Cấp độ (`AutonomyLevel`) | Tên gọi | Cơ chế thực thi khi Agent gọi Tool ghi |
|---|---|---|
| **L1 (Mặc định)** | **Chờ Duyệt (Human-in-the-Loop)** | Mọi hành động ghi (`deals.write`, `quotes.write`) đều tạo bản ghi nháp `Status = 'PENDING_APPROVAL'`. Nhân viên kinh doanh nhận thông báo và click "Duyệt" trên giao diện CRM trước khi gửi cho khách. |
| **L2** | **Tự Chủ Có Ngưỡng (Thresholded)** | Tự động phê duyệt các Báo giá/Cơ hội có giá trị dưới ngưỡng cấu hình (ví dụ: `< 5.000.000 VNĐ`). Vượt ngưỡng tự động chuyển về L1 chờ duyệt. |
| **L3** | **Tự Động Hoàn Toàn (Full Autonomous)** | Tự động chốt và chuyển trạng thái không cần duyệt (chỉ mở cho các kịch bản mua vé sự kiện, sản phẩm số cố định giá). |

---

## 3. Danh Mục 5 MCP Tools Chuẩn Cung Cấp Cho GOSO

Mỗi Tool được đăng ký vào danh mục MCP Server của GOSO với tiền tố chuẩn `zcrm.` (hoặc `omni.`):

### 3.1 Tool 1: `zcrm.lookup_customer_lead`
- **Tên Tool:** `lookup_customer_lead` (`zcrm.lookup_customer_lead`)
- **Mô tả:** Tra cứu thông tin hồ sơ Lead hoặc Khách hàng tiềm năng theo số điện thoại, email hoặc `external_user_id` (Zalo UID).
- **Yêu cầu Scope:** `agent:hands:read` hoặc `crm.read`
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "phone": { 
        "type": "string", 
        "description": "Số điện thoại khách hàng (định dạng E.164 hoặc 09xxx)" 
      },
      "email": { 
        "type": "string", 
        "description": "Địa chỉ email khách hàng (tùy chọn)" 
      },
      "external_user_id": { 
        "type": "string", 
        "description": "Zalo UID hoặc Telegram Chat ID của khách" 
      },
      "conversation_id": { 
        "type": "string", 
        "description": "ID hội thoại hiện tại để gắn context" 
      }
    }
  }
  ```
- **Output Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "found": { "type": "boolean" },
      "lead_id": { "type": "string" },
      "contact_id": { "type": "string" },
      "full_name": { "type": "string" },
      "phone": { "type": "string" },
      "status": { "type": "string" },
      "score": { "type": "number" },
      "staff_in_charge": {
        "type": "object",
        "properties": {
          "staff_id": { "type": "string" },
          "staff_name": { "type": "string" }
        }
      },
      "tags": { "type": "array", "items": { "type": "string" } },
      "recent_orders_count": { "type": "integer" }
    }
  }
  ```

---

### 3.2 Tool 2: `zcrm.create_crm_order`
- **Tên Tool:** `create_crm_order` (`zcrm.create_crm_order`)
- **Mô tả:** Khởi tạo đơn hàng CRM trực tiếp từ luồng tư vấn của bot khi khách hàng xác nhận chốt đơn.
- **Yêu cầu Scope:** `agent:hands:write`
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "conversation_id": { 
        "type": "string", 
        "description": "ID hội thoại đang diễn ra" 
      },
      "contact_id": { 
        "type": "string", 
        "description": "ID khách hàng trong hệ thống CRM" 
      },
      "shipping_address": { 
        "type": "string", 
        "description": "Địa chỉ giao hàng do khách cung cấp" 
      },
      "items": {
        "type": "array",
        "description": "Danh sách sản phẩm trong đơn",
        "items": {
          "type": "object",
          "properties": {
            "product_id": { "type": "string" },
            "sku": { "type": "string" },
            "quantity": { "type": "integer", "minimum": 1 },
            "unit_price": { "type": "number", "minimum": 0 },
            "discount_percent": { "type": "number", "default": 0 }
          },
          "required": ["product_id", "quantity", "unit_price"]
        }
      },
      "payment_method": { 
        "type": "string", 
        "enum": ["COD", "BANK_TRANSFER", "ONLINE_GATEWAY"],
        "default": "COD"
      },
      "note": { 
        "type": "string", 
        "description": "Ghi chú giao hàng hoặc yêu cầu riêng của khách" 
      }
    },
    "required": ["conversation_id", "contact_id", "shipping_address", "items"]
  }
  ```
- **Xử lý & Cơ chế kiểm soát:**
  - `AutonomyLevel == L1`: Đơn hàng tạo ở trạng thái `DRAFT_PENDING_APPROVAL`. Bắn notification tới sale phụ trách xác nhận.
  - `AutonomyLevel == L2`: Nếu tổng giá trị đơn `< 5.000.000 VNĐ`, tự động kích hoạt `CONFIRMED`. Nếu vượt ngưỡng, chuyển về `PENDING_APPROVAL`.
  - `AutonomyLevel == L3`: Xác nhận đơn ngay lập tức (`CONFIRMED`), tạo vận đơn kho.

---

### 3.3 Tool 3: `zcrm.send_price_quote`
- **Tên Tool:** `send_price_quote` (`zcrm.send_price_quote`)
- **Mô tả:** Lập và gửi bảng báo giá sản phẩm/dịch vụ chính thức cho khách hàng qua tin nhắn hội thoại kèm link chi tiết.
- **Yêu cầu Scope:** `agent:hands:write`
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "conversation_id": { 
        "type": "string", 
        "description": "ID hội thoại hiện tại" 
      },
      "contact_id": { 
        "type": "string", 
        "description": "ID khách hàng nhận báo giá" 
      },
      "valid_days": { 
        "type": "integer", 
        "default": 7, 
        "description": "Thời hạn hiệu lực của báo giá (ngày)" 
      },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "product_id": { "type": "string" },
            "product_name": { "type": "string" },
            "quantity": { "type": "integer", "minimum": 1 },
            "unit_price": { "type": "number", "minimum": 0 },
            "discount_percent": { "type": "number", "default": 0 }
          },
          "required": ["product_id", "quantity", "unit_price"]
        }
      },
      "note": { 
        "type": "string", 
        "description": "Điều khoản thanh toán, bảo hành hoặc ghi chú bổ sung" 
      }
    },
    "required": ["conversation_id", "contact_id", "items"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "quote_id": { "type": "string" },
      "quote_code": { "type": "string" },
      "total_amount": { "type": "number" },
      "status": { "type": "string", "enum": ["PENDING_APPROVAL", "SENT"] },
      "preview_url": { "type": "string" },
      "formatted_summary": { "type": "string" }
    }
  }
  ```

---

### 3.4 Tool 4: `zcrm.update_lead_status`
- **Tên Tool:** `update_lead_status` (`zcrm.update_lead_status`)
- **Mô tả:** Cập nhật trạng thái chu trình Lead (chuyển đổi giai đoạn phễu chăm sóc) dựa trên tiến độ tương tác của khách.
- **Yêu cầu Scope:** `agent:hands:write`
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "lead_id": { 
        "type": "string", 
        "description": "ID hồ sơ Lead cần cập nhật" 
      },
      "target_status": { 
        "type": "string", 
        "enum": ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATING", "WON", "LOST"],
        "description": "Trạng thái mới của Lead" 
      },
      "reason": { 
        "type": "string", 
        "description": "Lý do thay đổi trạng thái (ví dụ: 'Khách đã đồng ý xem báo giá')" 
      },
      "score_delta": { 
        "type": "integer", 
        "description": "Điểm cộng/trừ vào Lead Score (tùy chọn, ví dụ: +15 khi thành QUALIFIED)" 
      }
    },
    "required": ["lead_id", "target_status"]
  }
  ```
- **Ràng buộc Domain Invariant:**
  - Không cho phép nhảy cóc từ `NEW` thẳng sang `WON` mà không qua bước `QUALIFIED` hoặc `PROPOSAL_SENT`.
  - Nếu `target_status == 'LOST'`, bắt buộc phải có trường `reason`.

---

### 3.5 Tool 5: `zcrm.assign_staff_in_charge`
- **Tên Tool:** `assign_staff_in_charge` (`zcrm.assign_staff_in_charge`)
- **Mô tả:** Gán hoặc điều chuyển nhân viên tư vấn phụ trách Lead/Khách hàng có kiểm soát chặt chẽ qua Role Guard và hạn ngạch tải (Capacity Check).
- **Yêu cầu Scope:** `agent:hands:write`
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "lead_id": { 
        "type": "string", 
        "description": "ID hồ sơ Lead cần phân bổ" 
      },
      "conversation_id": { 
        "type": "string", 
        "description": "ID hội thoại hiện tại" 
      },
      "target_staff_id": { 
        "type": "string", 
        "description": "ID nhân viên tư vấn được chỉ định (tùy chọn, nếu trống sẽ auto-round-robin)" 
      },
      "department_id": { 
        "type": "string", 
        "description": "Phòng ban phụ trách tiếp nhận (ví dụ: 'Kinh Doanh Miền Nam')" 
      },
      "reason": { 
        "type": "string", 
        "description": "Lý do gán (ví dụ: 'Khách yêu cầu tư vấn gói Doanh nghiệp lớn')" 
      }
    },
    "required": ["lead_id", "conversation_id"]
  }
  ```
- **Cơ Chế Kiểm Soát Phân Quyền (Role Guard & Validation Invariants):**
  1. **Role Guard Validation:** Bot CHỈ ĐƯỢC gán cho nhân viên có vai trò `SALES_REP` hoặc `SUPPORT_AGENT` đang ở trạng thái `ACTIVE` trong tổ chức. Nghiêm cấm gán vào tài khoản `TENANT_ADMIN`, `SYSTEM_SUPERVISOR` hoặc nhân viên đã bị vô hiệu hóa (disabled/deactivated).
  2. **Workload Capacity Check:** Kiểm tra hạn ngạch số lượng Lead đang xử lý đồng thời (`active_leads_count < max_capacity`). Nếu nhân viên được chỉ định đã quá tải, hệ thống tự động từ chối và fallback sang cơ chế Round-Robin trong cùng phòng ban.
  3. **Audit Log Bắt Buộc:** Mọi hành vi gán nhân viên từ AI Agent đều ghi Structured Audit Log với sự kiện `LEAD_ASSIGNED_BY_AI_AGENT` kèm `agent_id`, `target_staff_id`, và `reason`.

---

## 4. Kiến Trúc Service API Gateway Trong Golang (`omni-core`)

Bounded Context: `internal/service`

### 4.1 Quản Lý Token & Xác Thực Khách (Authorization Bearer & Scopes)

```
[Request từ GOSO MCP Sidecar]
      │
      ▼ HTTP Header: `Authorization: Bearer omni_live_9a8b7c6d5e4f...` (hoặc `X-API-Key`)
[Service API Middleware]
      │
      ├── 1. Trích xuất Token từ `Authorization: Bearer <token>` (fallback `X-API-Key`)
      ├── 2. Trích xuất Prefix (16 ký tự đầu: `omni_live_9a8b`)
      ├── 3. Hash toàn bộ raw key bằng SHA-256
      ├── 4. Tra cứu nhanh trong bảng `service_credentials` (Cache Redis 5 phút)
      │      - Kiểm tra: `is_revoked == false`
      │      - Kiểm tra: `expires_at > NOW()`
      │      - Kiểm tra: `is_kill_switched == false`
      ├── 5. Kiểm tra Quyền Hạn (Scope Verification):
      │      - Tác vụ ghi (POST/PUT/PATCH): Bắt buộc có scope `agent:hands:write`
      │      - Tác vụ đọc (GET): Yêu cầu scope `agent:hands:read` hoặc `crm.read`
      ├── 6. Token Bucket Rate Limiting: 60 req/min/tenant
      └── 7. Nạp `TenantID`, `Scopes`, `AutonomyLevel` vào Context
```

### 4.2 Triển Khai Chốt Chặn Khẩn Cấp (Tenant Kill-Switch)

Khi phát hiện Bot có hành vi bất thường, phát ngôn sai lệch hoặc spam khách hàng:
1. Admin bấm nút **"DẬP CẦU DAO AGENT" (EMERGENCY KILL SWITCH)** trên giao diện Admin.
2. Endpoint kích hoạt: `POST /api/v1/service/credentials/{id}/kill-switch`
3. Hệ thống thực hiện nguyên tử:
   - Đặt `is_kill_switched = true` tại bảng DB.
   - Xóa bỏ Cache Redis xác thực của API Key tương ứng.
   - Phát sự kiện nội bộ `AgentKillSwitchedEvent` ngắt phiên kết nối SSE / gRPC MCP Server với GOSO.
   - Mọi request tiếp theo từ Agent dùng Key này lập tức nhận mã `403 Forbidden: Credential is kill-switched`.

---

## 5. Đặc Tả Wire Protocol & Endpoint Service Gateway

Lớp HTTP Handler: `internal/service/interfaces/http/aigateway_handler.go`

### 5.1 Endpoint Kiểm Tra Danh Tính (`GET /api/v1/service/whoami`)

Được MCP Sidecar của GOSO gọi khi khởi động kết nối socket để kiểm tra tính khả dụng của Token và tập scope được cấp.

#### Request Headers:
```http
GET /api/v1/service/whoami HTTP/1.1
Host: api.admatrix.vn
Authorization: Bearer omni_live_1234567890abcdef1234567890abcdef
```

#### Response JSON:
```json
{
  "tenant_id": "01923e5a-7b3c-7000-8000-000000000001",
  "name": "Agent có tay Zalo Chăm Sóc Khách",
  "token_prefix": "omni_live_123456",
  "scopes": [
    "agent:hands:read",
    "agent:hands:write",
    "crm.read",
    "messages.read",
    "crm.write",
    "messages.send",
    "deals.write",
    "quotes.write",
    "retail.read"
  ],
  "autonomy_level": "L1",
  "rate_limit_per_minute": 120,
  "is_active": true
}
```

### 5.2 Endpoint Tạo Báo Giá Nháp (`POST /api/v1/service/quotes/propose`)

#### Request Headers & Payload:
```http
POST /api/v1/service/quotes/propose HTTP/1.1
Host: api.admatrix.vn
Authorization: Bearer omni_live_1234567890abcdef1234567890abcdef
Content-Type: application/json

{
  "conversation_id": "01923e5a-7b3c-7000-8000-000000000002",
  "contact_id": "01923e5a-7b3c-7000-8000-000000000003",
  "items": [
    {
      "product_id": "01923e5a-7b3c-7000-8000-000000000004",
      "quantity": 2,
      "unit_price": 1500000,
      "discount_percent": 10
    }
  ],
  "note": "Báo giá gói 2 license phần mềm CRM ưu đãi tháng này"
}
```

#### Response JSON:
```json
{
  "success": true,
  "proposal_id": "01923e5a-7b3c-7000-8000-000000000005",
  "status": "PENDING_APPROVAL",
  "requires_approval": true,
  "assigned_staff_id": "usr_01J8F10011223344",
  "preview_url": "https://crm.admatrix.vn/quotes/proposals/01923e5a-7b3c-7000-8000-000000000005",
  "created_at": "2026-10-05T10:15:30Z"
}
```

---

## 6. Bảo Mật & Phòng Chống Gian Lận (Security & Threat Modeling)

1. **Lưu Trữ Token An Toàn (Zero Plaintext Storage):**
   - Chỉ trả chuỗi Token thô (`raw token`) **đúng 1 lần duy nhất** khi người dùng tạo Credential trên Dashboard.
   - DB chỉ lưu chuỗi băm `SHA-256` của token kèm `prefix` 16 ký tự đầu để phục vụ hiển thị định danh.
2. **Ngăn Ngừa Khai Thác Prompt Injection (Jailbreak Mitigation):**
   - Dù kẻ tấn công lừa được LLM ra lệnh mua hàng miễn phí hoặc giảm giá 100%, cơ chế Autonomy Level `L1` vẫn chặn đứng tại tầng Service Gateway, buộc mọi đơn hàng phải qua mắt nhân viên kiểm duyệt.
3. **Giới Hạn Tần Suất Gọi Tool (Tool Call Throttling):**
   - Áp dụng Bucket Limiter cho từng loại tool: Tối đa 10 lần gọi tool ghi (`mutations`) trên 1 cuộc hội thoại trong vòng 5 phút để chống kịch bản loop vô tận của Agent.

---

## 7. Tiêu Chuẩn Giám Sát & Logging (Observability Standard)

Tất cả các lượt gọi tool từ GOSO vào Service Gateway bắt buộc phải ghi Structured Audit Log:

```json
{
  "timestamp": "2026-10-05T10:15:30.120Z",
  "level": "INFO",
  "trace_id": "tr_01J8F4P0P1P2P3P4P5P6P7P8P9",
  "tenant_id": "01923e5a-7b3c-7000-8000-000000000001",
  "bounded_context": "service",
  "submodule": "aigateway",
  "action_taken": "AGENT_TOOL_CALLED",
  "tool_name": "zcrm.create_quote_proposal",
  "credential_prefix": "omni_live_123456",
  "autonomy_level": "L1",
  "status_code": 200,
  "duration_ms": 38
}
```

---

## 8. Danh Sách Kiểm Tra Khi Triển Khai (Go DDD Checklist)

- [ ] Lớp xác thực API Key nằm ở Middleware của `internal/service/interfaces/http`.
- [ ] Token thô chỉ tồn tại trong RAM khi tạo, lưu trữ DB hoàn toàn là SHA-256 hash.
- [ ] Cơ chế Kill-Switch kiểm tra O(1) qua Redis Cache trước khi chuyển request vào Application Command.
- [ ] Tuân thủ triệt để phân loại Scope, tuyệt đối không chấp nhận các Scope bị cấm (`control.kill-switch.manage`, `leads.assign`).
- [ ] Autonomy Gate L1 bắt buộc đẩy các tác vụ tạo Quote/Deal thành trạng thái Chờ Duyệt (`PENDING_APPROVAL`).
