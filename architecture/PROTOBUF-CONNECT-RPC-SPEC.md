# Quy Chuẩn Protobuf & Connect-RPC (Protobuf & Connect-RPC Specification)
## Omni Core Platform — NextGen High-Performance RPC Delivery

> **Mục tiêu**: Chuẩn hóa toàn bộ quy trình thiết kế định dạng dữ liệu (Protobuf schemas), công cụ sinh mã nguồn (Buf Build CLI), cấu trúc thư mục, quy ước đặt tên và ánh xạ mã lỗi cho tầng giao tiếp Connect-RPC (HTTP/2 h2c & gRPC tương thích) trên nền tảng **Omni Core**.

---

## 1. Tại Sao Chọn Connect-RPC?

1. **Đa Giao Thức Tự Nhiên (Native Multi-Protocol)**:
   - Hỗ trợ đồng thời 3 giao thức trên cùng một cổng máy chủ: **Connect Protocol** (JSON/Binary qua HTTP/1.1 và HTTP/2), **gRPC chuẩn** (HTTP/2), và **gRPC-Web** (cho trình duyệt Web frontend).
   - **Không cần Envoy Proxy**: Frontend `omni-web` có thể gọi trực tiếp dịch vụ backend mà không cần cấu hình proxy phức tạp như gRPC truyền thống.
2. **Type-Safe Tuyệt Đối**: Toàn bộ Request, Response, Streaming DTO đều được sinh tự động từ file `.proto`, loại bỏ hoàn toàn việc viết tay DTO không đồng bộ giữa frontend và backend.
3. **Hiệu Năng & Concurrency Go Native**: Tốc độ tuần tự hóa Binary Protobuf nhanh hơn 5-10 lần so với JSON reflection, giảm thiểu áp lực cấp phát bộ nhớ (GC allocation) trên Go runtime.

---

## 2. Cấu Trúc Thư Mục Protobuf & Sinh Mã Nguồn (Directory Standards)

Toàn bộ schema protobuf được quản lý tập trung và biên dịch vào thư mục sinh mã tự động `gen/proto/`:

```
omni-core/
├── proto/
│   ├── buf.yaml                     # Cấu hình Buf module & quy tắc lint/breaking check
│   ├── buf.gen.yaml                 # Cấu hình plugins sinh mã Go
│   └── omni/
│       ├── common/
│       │   └── v1/
│       │       ├── pagination.proto # DTO phân trang dùng chung
│       │       └── error.proto      # Định dạng chi tiết ngoại lệ
│       ├── identity/v1/             # Bounded Context 1: Identity & Settings
│       ├── channel/v1/              # Bounded Context 2: Channel & Gateway
│       ├── customer/v1/             # Bounded Context 3: Customer & Lead
│       │   ├── contact.proto
│       │   └── customer_service.proto
│       ├── conversation/v1/         # Bounded Context 4: Conversation & Media
│       ├── deal/v1/                 # Bounded Context 5: Deal & E-commerce
│       ├── marketing/v1/            # Bounded Context 6: Marketing & Automation
│       ├── aiagent/v1/              # Bounded Context 7: AI Agent & Knowledge
│       └── serviceapi/v1/           # Bounded Context 8: Service API & Gateway
│
└── gen/                             # Thư mục sinh mã tự động (Do NOT edit manually)
    └── proto/
        └── go/
            └── omni/
                ├── common/v1/
                └── customer/v1/
                    ├── contact.pb.go
                    └── customer_serviceconnect/
                        └── customer_service.connect.go
```

---

## 3. Cấu Hình Công Cụ Buf (`buf.yaml` & `buf.gen.yaml`)

### 3.1 Cấu hình module & quy chuẩn Lint (`proto/buf.yaml`)
```yaml
version: v2
name: buf.build/omni/omni-core
lint:
  use:
    - DEFAULT
    - PACKAGE_DIRECTORY_MATCH
    - SERVICE_PASCAL_CASE
    - FIELD_LOWER_SNAKE_CASE
breaking:
  use:
    - FILE
```

### 3.2 Cấu hình sinh mã nguồn Go & Connect-Go (`proto/buf.gen.yaml`)
```yaml
version: v2
plugins:
  - remote: buf.build/protocolbuffers/go:v1.33.0
    out: gen/proto/go
    opt:
      - paths=source_relative
  - remote: buf.build/connectrpc/go:v1.16.1
    out: gen/proto/go
    opt:
      - paths=source_relative
```

---

## 4. Quy Chuẩn Đặt Tên & Thiết Kế Schema (Schema Design Guidelines)

1. **Package Versioning**: Bắt buộc tuân thủ cấu trúc `omni.<bc_name>.v1`.
2. **Quy Ước Request / Response**:
   - Mọi RPC method đều phải có Request và Response struct riêng biệt mang tên `<MethodName>Request` và `<MethodName>Response`. Không dùng chung request/response giữa các RPC methods.
3. **Phân Trang Chuẩn Hóa**:
   - Sử dụng `omni.common.v1.PaginationRequest` và `omni.common.v1.PaginationResponse` nhúng trong truy vấn danh sách (Flat Lists).

### Ví dụ Schema Chuẩn: `proto/omni/customer/v1/customer_service.proto`

```protobuf
syntax = "proto3";

package omni.customer.v1;

option go_package = "omni-core/gen/proto/go/omni/customer/v1;customerv1";

import "omni/common/v1/pagination.proto";

service CustomerService {
  // Lấy chi tiết thông tin khách hàng
  rpc GetContact(GetContactRequest) returns (GetContactResponse);
  
  // Truy vấn danh sách khách hàng có phân trang
  rpc ListContacts(ListContactsRequest) returns (ListContactsResponse);
  
  // Gộp hai hồ sơ khách hàng (Spec 057 P5)
  rpc MergeContacts(MergeContactsRequest) returns (MergeContactsResponse);
}

message Contact {
  string id = 1;
  string tenant_id = 2;
  string full_name = 3;
  string phone = 4;
  int64 total_spent = 5;
  int32 purchase_count = 6;
  bool is_merged = 7;
  string merged_into_id = 8;
  int64 created_at_unix = 9;
}

message GetContactRequest {
  string contact_id = 1;
}

message GetContactResponse {
  Contact contact = 1;
}

message ListContactsRequest {
  omni.common.v1.PaginationRequest pagination = 1;
  string search = 2;
}

message ListContactsResponse {
  repeated Contact items = 1;
  omni.common.v1.PaginationResponse pagination = 2;
}

message MergeContactsRequest {
  string source_contact_id = 1;
  string target_contact_id = 2;
  string reason = 3;
}

message MergeContactsResponse {
  Contact merged_contact = 1;
}
```

---

## 5. Quy Chuẩn Ánh Xạ Mã Lỗi Tầng Interfaces (Connect-RPC Error Mapping)

Mọi ngoại lệ từ tầng Application và Domain (sử dụng `pkg/errors`) khi trả về qua Connect-RPC bắt buộc phải ánh xạ sang mã `connect.Code` tương thích theo ma trận sau:

| Domain Error (`pkg/errors`) | Connect-RPC Code | HTTP Status Tương Đương | Phân Loại (Sprint 7) |
|---|---|:---:|:---:|
| `CodeNotFound` | `connect.CodeNotFound` | `404` | Terminal |
| `CodeInvalidInput` | `connect.CodeInvalidArgument` | `400` | Terminal |
| `CodeConflict` | `connect.CodeAlreadyExists` | `409` | Terminal |
| `CodeUnauthorized` | `connect.CodeUnauthenticated` | `401` | SecurityPolicy |
| `CodeForbidden` | `connect.CodePermissionDenied` | `403` | SecurityPolicy |
| `CodeRateLimited` | `connect.CodeResourceExhausted`| `429` | Transient |
| `CodeInternal` | `connect.CodeInternal` | `500` | Transient / Terminal |

### Đoạn Mã Xử Lý Mẫu Trong Connect Service (`interfaces/grpc/`)
```go
func (s *CustomerConnectServer) GetContact(
    ctx context.Context,
    req *connect.Request[customerv1.GetContactRequest],
) (*connect.Response[customerv1.GetContactResponse], error) {
    claims, err := auth.UserClaimsFromContext(ctx)
    if err != nil {
        return nil, connect.NewError(connect.CodeUnauthenticated, err)
    }

    result, err := s.queryHandler.Handle(ctx, queries.GetContactQuery{
        TenantID:  claims.TenantID,
        ContactID: req.Msg.ContactId,
    })
    if err != nil {
        if errors.IsNotFound(err) {
            return nil, connect.NewError(connect.CodeNotFound, err)
        }
        return nil, connect.NewError(connect.CodeInternal, err)
    }

    return connect.NewResponse(&customerv1.GetContactResponse{
        Contact: toProtoContact(result),
    }), nil
}
```

---

## 6. Lệnh Vận Hành & Biên Dịch (CLI Workflow)

```bash
# Di chuyển vào thư mục proto
cd proto

# Kiểm tra cú pháp và quy chuẩn linting
buf lint

# Kiểm tra tính tương thích ngược, chống phá vỡ hợp đồng dữ liệu
buf breaking --against ".git#branch=staging"

# Biên dịch Protobuf schemas sinh mã nguồn Go và Connect-RPC
buf generate
```
