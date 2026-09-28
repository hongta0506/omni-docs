# Service API & Gateway — API Mapping Chi Tiết (40 Routes)

> Bounded Context: `internal/serviceapi`  
> Phân rã từ backend Fastify (`modules/service-api`, `modules/analytics`, `modules/dashboard`) sang Go Clean Architecture.

---

## 1. Phân Bổ Tầng Giao Thức (Multi-Protocol Delivery)

- **`interfaces/http/` (REST ServeMux Go 1.22+)**: Handlers chuyên biệt:
  - `service_whoami_handler.go`: Kiểm tra danh tính và hạn mức API Key (`/api/v1/service/whoami`).
  - `service_messaging_handler.go`: API gửi tin nhắn từ bên ngoài qua Outbox (`/api/v1/service/messages/send`).
  - `service_leads_handler.go`: Gán lead tự động từ CRM ngoài (`/api/v1/service/leads/assign`).
  - `service_credentials_handler.go`: Quản lý API Key cho Admin (`/api/v1/service/credentials/*`).
  - `service_killswitch_handler.go`: Ngắt khẩn cấp luồng bắn tin (`/api/v1/service/kill-switch/*`).
  - `analytics_handler.go`: Báo cáo chỉ số tổng hợp (`/api/v1/analytics/*`, `/api/v1/dashboard/*`).
- **`interfaces/grpc/` (Connect-RPC)**: Expose service `ExternalServiceGateway` cho typed client SDKs.

---

## 2. Bảng Đối Chiếu Chi Tiết Từng Endpoint

### 2.1 Service External APIs (20 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/service/whoami` | `service_whoami_handler.go:WhoAmI` | `queries.GetServiceCredentialInfo` | `WhoAmI` |
| `POST` | `/api/v1/service/messages/send`| `service_messaging_handler.go:Send`| `commands.EnqueueServiceMessage` | `SendServiceMessage` |
| `POST` | `/api/v1/service/leads/assign` | `service_leads_handler.go:Assign` | `commands.EnqueueLeadAssignment` | `AssignServiceLead` |
| `POST` | `/api/v1/service/contacts/upsert`| `service_contacts_handler.go:Upsert`| `commands.UpsertServiceContact` | `UpsertServiceContact`|
| `GET` | `/api/v1/service/credentials` | `service_credentials_handler.go:List`| `queries.ListServiceCredentials` | `ListCredentials` |
| `POST` | `/api/v1/service/credentials` | `service_credentials_handler.go:Create`| `commands.CreateServiceCredential`| `CreateCredential` |
| `DELETE`| `/api/v1/service/credentials/:id`| `service_credentials_handler.go:Revoke`| `commands.RevokeServiceCredential`| `RevokeCredential` |
| `POST` | `/api/v1/service/kill-switch` | `service_killswitch_handler.go:Engage`| `commands.EngageKillSwitch` | `EngageKillSwitch` |
| `DELETE`| `/api/v1/service/kill-switch` | `service_killswitch_handler.go:Disengage`| `commands.DisengageKillSwitch` | `DisengageKillSwitch` |

### 2.2 Analytics & Executive Dashboard (20 Routes)

| Phương thức | Fastify Route Cũ | Go HTTP Handler (`interfaces/http/`) | Go Application CQRS | Connect-RPC Service Method |
|---|---|---|---|---|
| `GET` | `/api/v1/analytics/overview` | `analytics_handler.go:GetOverview` | `queries.GetAnalyticsOverview` | `GetOverviewMetrics` |
| `GET` | `/api/v1/analytics/conversions` | `analytics_handler.go:GetConversions`| `queries.GetConversionRates` | `GetConversionRates` |
| `GET` | `/api/v1/dashboard/metrics` | `dashboard_handler.go:GetMetrics` | `queries.GetDashboardMetrics` | `GetDashboardMetrics` |
| `GET` | `/api/v1/dashboard/export-excel`| `dashboard_handler.go:ExportExcel` | `queries.GenerateAnalyticsExcel` | `GenerateExcel` |
