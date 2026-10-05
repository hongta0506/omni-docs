# GOSO & Omni-Core Dual Transport Architecture Specification (REST vs Connect-RPC / gRPC)

> **ĐẶC TẢ KIẾN TRÚC VẬN CHUYỂN KÉP (DUAL-TRANSPORT) VÀ CẤU HÌNH ĐỘNG GIỮA OMNI-CORE VÀ GOSO GATEWAY**  
> **Mã tài liệu:** `SPEC-ARCH-GOSO-005`  
> **Hệ thống liên quan:**  
> - `omni-core` (Golang Clean DDD - Bounded Context `internal/aiagent` & `internal/serviceapi`)  
> - `goso` (Golang Engine & Gateway - Package `gateway/internal/connector` & `gateway/internal/serve`)  
> **Trạng thái:** APPROVED FOR IMPLEMENTATION  
> **Ngôn ngữ chuẩn:** Tiếng Việt (Thuật ngữ kỹ thuật, code identifiers, proto schemas, env variables giữ nguyên Tiếng Anh)  

---

## 1. Mục Tiêu & Bối Cảnh Kỹ Thuật (Context & Goals)

Hệ thống giao tiếp giữa **Omni-Core** (CRM Gateway & Business Logic) và **GOSO** (AI Agent Engine & MCP Tools Runtime) có yêu cầu rất cao về mặt độ trễ (latency) và băng thông khi truyền tải streaming token cho người dùng cuối trên Zalo/Telegram.

### 1.1 Vấn đề với REST / HTTP/1.1 truyền thống
1. **Serialization Overhead:** Bản tin JSON lớn làm tốn CPU giải mã (unmarshal) và cấp phát bộ nhớ (heap escape allocations).
2. **Head-of-Line Blocking & TCP Churn:** HTTP/1.1 tạo/ngắt kết nối liên tục hoặc nghẽn pipeline khi xử lý hàng trăm luồng hội thoại đồng thời.
3. **Độ trễ phản hồi (Time-to-First-Token - TTFT):** Server-Sent Events (SSE) qua HTTP/1.1 có overhead tiêu đề (header) lặp lại và không tối ưu bằng frame nhị phân multiplexing.

### 1.2 Mục tiêu Giải pháp Dual-Transport
1. **Kiến trúc Tách biệt (Decoupled Dual-Transport):** Hỗ trợ song song cả 2 tầng giao vận:
   - **Mode 1: HTTP REST / Webhook** (Tương thích ngược, kiểm thử nhanh, dễ debug qua curl/Postman).
   - **Mode 2: Connect-RPC / gRPC over HTTP/2** (Hiệu năng cao, payload Protobuf nhị phân, streaming 2 chiều, zero-alloc multiplexing).
2. **Cấu hình Động qua File Config & Biến Môi Trường (Config & Env-Driven):** Chuyển đổi linh hoạt giữa REST và gRPC hoàn toàn thông qua cấu hình (`.env` hoặc `config.yaml`), không cần sửa code hay rebuild binary.
3. **Resilience & Graceful Fallback:** Tự động fallback sang REST nếu kênh gRPC gặp sự cố kết nối (tùy chọn qua flag cấu hình).

---

## 2. Ma Trận So Sánh & Lựa Chọn Giao Vận (Transport Matrix)

| Tiêu chí | Mode 1: HTTP REST (Legacy) | Mode 2: Connect-RPC / gRPC (High-Speed) |
|---|---|---|
| **Định dạng dữ liệu** | JSON (Text) | Protocol Buffers (Binary) |
| **Giao thức nền tảng** | HTTP/1.1 | HTTP/2 Multiplexing |
| **Streaming Token** | Server-Sent Events (SSE) / Chunked | Native HTTP/2 Bi-directional Stream |
| **Overhead đóng gói** | Cao (Text parse, CPU unmarshal) | Rất thấp (Compact binary, Zero-copy) |
| **Type Safety** | Runtime JSON validation | Compile-time Protobuf Contract |
| **Độ trễ trung bình** | ~15ms - 35ms (Local network) | ~1.2ms - 3.5ms (Local network) |
| **Mục đích sử dụng** | Dev local, test curl, webhook public | Production high-load, AI agent swarm |

---

## 3. Bản Đồ Cấu Hình & Biến Môi Trường (Config & ENV Contract)

Hệ thống cho phép cấu hình độc lập ở cả 2 phía: `omni-core` và `goso`.

### 3.1 Cấu Hình Phía `omni-core`

Khai báo trong `.env` hoặc file cấu hình YAML (`configs/app.yaml`):

```bash
# ==============================================================================
# OMNI-CORE <-> GOSO AGENT TRANSPORT CONFIGURATION
# ==============================================================================
# Lựa chọn giao vận: 'grpc' (khuyến nghị cho prod) hoặc 'http' (mặc định)
GOSO_TRANSPORT=grpc

# Endpoint kết nối sang GOSO Engine:
# Khi GOSO_TRANSPORT=grpc -> Dùng Connect-RPC URL (HTTP/2)
# Khi GOSO_TRANSPORT=http -> Dùng REST URL (HTTP/1.1)
GOSO_GRPC_ENDPOINT=http://127.0.0.1:8088
GOSO_HTTP_ENDPOINT=http://127.0.0.1:8080

# Chữ ký bảo mật và xác thực 2 đầu
GOSO_SHARED_SECRET=sk_goso_bridge_super_secret_key_2026
GOSO_TIMEOUT_MS=30000

# Cơ chế dự phòng: Tự động fallback sang HTTP REST nếu gRPC mất kết nối
GOSO_ENABLE_FALLBACK=true

# Giới hạn kích thước gói Protobuf / JSON (Bytes)
GOSO_MAX_PAYLOAD_BYTES=10485760
```

### 3.2 Cấu Hình Phía `goso` Gateway

Khai báo trong `goso/.env` hoặc thông qua `gateway/internal/config`:

```bash
# ==============================================================================
# GOSO GATEWAY <-> CRM CONNECTOR TRANSPORT CONFIGURATION
# ==============================================================================
# Lựa chọn giao vận cho CRM Connector: 'grpc' | 'http' | 'mcp-http'
GOSOCRM_TRANSPORT=grpc

# Endpoint trỏ về Omni-Core Service API
GOSOCRM_GRPC_ENDPOINT=http://127.0.0.1:8089
GOSOCRM_HTTP_ENDPOINT=http://127.0.0.1:8089

# Token xác thực gọi CRM Tools
GOSOCRM_AUTH_TOKEN=crm_bearer_token_shared_secret

# Cấu hình cổng lắng nghe Connect-RPC Server nội bộ của GOSO
GOSO_GRPC_PORT=8088
```

---

## 4. Đặc Tả Giao Diện Protobuf (Connect-RPC Schema Contract)

Vị trí lưu trữ: `proto/goso/v1/bridge.proto` (chia sẻ giữa `omni-core` và `goso`).

```protobuf
syntax = "proto3";

package goso.v1;

option go_package = "omni-core/pkg/proto/goso/v1;gosov1";

// Dịch vụ cầu nối phản hồi AI từ GOSO về Omni-Core
service GOSOBridgeService {
  // Đồng bộ: Trả lời toàn bộ câu văn bản
  rpc GenerateReply (GenerateReplyRequest) returns (GenerateReplyResponse);

  // Bất đồng bộ: Truyền luồng token (Streaming Token) thời gian thực
  rpc StreamReply (GenerateReplyRequest) returns (stream StreamReplyChunk);

  // Kiểm tra tình trạng sức khỏe kết nối
  rpc CheckHealth (HealthRequest) returns (HealthResponse);
}

// Dịch vụ thực thi Tools (Agent Hands) từ GOSO gọi sang Omni-Core
service GOSOCRMConnectorService {
  // Liệt kê danh sách công cụ khả dụng
  rpc ListTools (ListToolsRequest) returns (ListToolsResponse);

  // Kích hoạt thực thi công cụ
  rpc InvokeTool (InvokeToolRequest) returns (InvokeToolResponse);
}

message GenerateReplyRequest {
  string session_id = 1;
  string tenant_id = 2;
  string channel_account_id = 3;
  string contact_id = 4;
  string prompt = 5;
  string model = 6;
  repeated ChatHistoryMessage history = 7;
  map<string, string> metadata = 8;
}

message ChatHistoryMessage {
  string role = 1;
  string content = 2;
  int64 timestamp = 3;
}

message GenerateReplyResponse {
  string reply_text = 1;
  int64 prompt_tokens = 2;
  int64 completion_tokens = 3;
  int64 latency_ms = 4;
  string stop_reason = 5;
}

message StreamReplyChunk {
  string delta = 1;
  bool is_finished = 2;
  string stop_reason = 3;
}

message HealthRequest {}
message HealthResponse {
  bool healthy = 1;
  string version = 2;
}

message ListToolsRequest {
  string tenant_id = 1;
}

message ToolDefinition {
  string name = 1;
  string description = 2;
  string input_schema_json = 3;
  bool requires_approval = 4;
}

message ListToolsResponse {
  repeated ToolDefinition tools = 1;
}

message InvokeToolRequest {
  string tenant_id = 1;
  string tool_name = 2;
  string arguments_json = 3;
}

message InvokeToolResponse {
  bool success = 1;
  string output_json = 2;
  string error_message = 3;
}
```

---

## 5. Thiết Kế Kiến Trúc Phần Mềm (Clean DDD Software Design)

### 5.1 Phía `omni-core` (Bounded Context `internal/aiagent`)

Áp dụng mẫu **Factory Pattern** và **Adapter Pattern** để phân tách hoàn toàn tầng nghiệp vụ khỏi tầng giao vận:

```
internal/aiagent/
├── domain/harness/
│   └── harness.go               # Interface Harness: Generate(ctx, prompt) (*Response, error)
├── infrastructure/harness/
│   ├── goso_factory.go          # Factory đọc ENV và trả về Transport phù hợp
│   ├── goso_http_adapter.go     # Triển khai HTTP REST / SSE client
│   └── goso_grpc_adapter.go     # Triển khai Connect-RPC client over HTTP/2
```

#### Factory Pattern implementation logic:
```go
func NewGOSOHarness(cfg Config) (Harness, error) {
    switch strings.ToLower(cfg.Transport) {
    case "grpc", "connect":
        return NewGOSOGRPCAdapter(cfg.GRPCEndpoint, cfg.SharedSecret, cfg.Timeout), nil
    case "http", "rest":
        return NewGOSOHTTPAdapter(cfg.HTTPEndpoint, cfg.SharedSecret, cfg.Timeout), nil
    default:
        return nil, fmt.Errorf("unsupported transport: %s", cfg.Transport)
    }
}
```

### 5.2 Phía `goso` Gateway (`gateway/internal/connector`)

Mở rộng `gateway/internal/connector/connector.go` để hỗ trợ thêm `TransportConnectGRPC`:

```go
const (
    TransportMCPHTTP      = "mcp-http"
    TransportMCPStdio     = "mcp-stdio"
    TransportHTTP         = "http"
    TransportConnectGRPC  = "grpc" // Mở rộng mới
)

func NormalizeTransport(raw string) (string, error) {
    switch strings.ToLower(strings.TrimSpace(raw)) {
    case "", TransportHTTP, "mcp":
        return TransportHTTP, nil
    case TransportConnectGRPC, "connect", "connect-rpc":
        return TransportConnectGRPC, nil // Hỗ trợ gRPC transport
    case TransportMCPHTTP, "sse", "mcp-sse", "streamable-http":
        return TransportMCPHTTP, nil
    case TransportMCPStdio, "stdio":
        return TransportMCPStdio, nil
    default:
        return "", fmt.Errorf("unknown transport %q", raw)
    }
}
```

---

## 6. Kế Hoạch Triển Khai Chi Tiết (Implementation Plan)

### Giai đoạn 1: Chuẩn hóa Hợp đồng Protobuf & Tooling
- [ ] Soạn thảo và kiểm tra cú pháp file schema `proto/goso/v1/bridge.proto`.
- [ ] Chạy `buf generate` sinh code client/server Golang cho `omni-core` (`pkg/proto/goso/v1`).
- [ ] Đồng bộ code sinh sang `goso` (`gateway/internal/proto/gosov1`).

### Giai đoạn 2: Cài đặt Dual-Transport phía `omni-core`
- [ ] Bổ sung bộ nạp cấu hình `GOSO_TRANSPORT`, `GOSO_GRPC_ENDPOINT`, `GOSO_HTTP_ENDPOINT` vào `internal/aiagent/infrastructure/harness/config.go`.
- [ ] Tách `goso_adapter.go` thành `goso_http_adapter.go` và tạo mới `goso_grpc_adapter.go` (dùng Connect-RPC client).
- [ ] Triển khai `goso_factory.go` hỗ trợ auto-fallback sang HTTP khi gRPC connection timeout.
- [ ] Viết unit tests kiểm thử khởi tạo adapter theo từng giá trị ENV.

### Giai đoạn 3: Mở rộng Connector & gRPC Server phía `goso`
- [ ] Cập nhật `NormalizeTransport` trong `goso/gateway/internal/connector/connector.go` chấp nhận `"grpc"`.
- [ ] Viết `grpc_client.go` trong `connector` để gọi CRM Connect-RPC service.
- [ ] Đăng ký Connect-RPC Handler vào `http.ServeMux` trong `goso/gateway/internal/serve/serve.go`.
- [ ] Đọc cấu hình từ `Lookup("GOSOCRM_TRANSPORT")`.

### Giai đoạn 4: Kiểm Thử Nghiệm Thu & Đánh Giá Hiệu Năng (Benchmark Gate)
- [ ] Đo lường độ trễ (latency): So sánh `TTFT` giữa REST và gRPC dưới tải 100 concurrent requests.
- [ ] Kiểm tra tính toàn vẹn: Race condition detector (`go test -race ./...`).
- [ ] Xác nhận kịch bản đổi ENV: Đổi `GOSO_TRANSPORT=http` ➔ chạy qua REST, đổi `GOSO_TRANSPORT=grpc` ➔ chạy qua Connect-RPC.
