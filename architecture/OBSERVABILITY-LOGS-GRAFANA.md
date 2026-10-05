# Observability Architecture: Grafana + Loki + Promtail

Tài liệu thiết kế và vận hành hệ thống giám sát tập trung (Centralized Observability & Logging) cho `omni-core`.

---

## 1. Tổng quan Kiến trúc

```
+-------------------------------------------------------------+
|                        Docker Host                          |
|                                                             |
|  +-----------------+         +---------------------------+  |
|  |    omni-core    |         |        omni-postgres      |  |
|  | (slog JSON out) |         |      (Postgres engine)    |  |
|  +--------+--------+         +-------------+-------------+  |
|           | stdout                         | stdout         |
|           +----------------+---------------+                |
|                            |                                |
|                            v                                |
|                /var/run/docker.sock                         |
|                            |                                |
|                            v                                |
|                 +--------------------+                      |
|                 |   omni-promtail    | (Log Shipper)        |
|                 +----------+---------+                      |
|                            | Push API (:3100)               |
|                            v                                |
|                 +--------------------+                      |
|                 |     omni-loki      | (Log Storage Engine) |
|                 +----------+---------+                      |
|                            | Datasource                     |
|                            v                                |
|                 +--------------------+                      |
|                 |    omni-grafana    | (:3000) (Dashboard)  |
|                 +--------------------+                      |
+-------------------------------------------------------------+
```

---

## 2. Các thành phần

### 2.1. `slog` HTTP Middleware (`internal/shared/middleware/logger.go`)
- Chặn mọi HTTP request và Connect-RPC call vào server.
- Ghi nhận có cấu trúc (Structured JSON): `time`, `level`, `msg="http_request"`, `method`, `path`, `status`, `duration_ms`, `remote_addr`.
- Phân loại `level`: `INFO` (2xx, 3xx), `WARN` (4xx), `ERROR` (5xx).

### 2.2. Grafana Loki (`deploy/observability/loki/loki-config.yaml`)
- Engine lưu trữ log tối ưu theo dạng index nhãn (labels) thay vì toàn văn, giảm thiểu RAM so với Elasticsearch.
- Lắng nghe cổng nội bộ `3100`.

### 2.3. Promtail (`deploy/observability/promtail/promtail-config.yaml`)
- Thu thập log realtime từ Docker daemon socket `/var/run/docker.sock`.
- Tự động gắn tag: `container`, `service`, `level`.
- Đẩy log về Loki qua endpoint `http://loki:3100/loki/api/v1/push`.

### 2.4. Grafana Dashboard (`omni-grafana`)
- Giao diện trực quan hóa, truy cập tại `http://localhost:3000`.
- Mặc định: user `admin`, password `admin`.
- Tự động nạp sẵn Loki datasource (`deploy/observability/grafana/provisioning/datasources/loki.yaml`).

---

## 3. Hướng dẫn sử dụng

### 3.1. Khởi chạy toàn bộ hệ thống
```bash
docker compose up -d
```

### 3.2. Truy cập Grafana xem Log
1. Mở trình duyệt: `http://localhost:3000`
2. Đăng nhập: `admin` / `admin`
3. Vào mục **Explore** (biểu tượng la bàn).
4. Chọn datasource **Loki**.
5. Nhập truy vấn LogQL:
   - Xem toàn bộ log của `omni-core`: `{service="omni-core"}`
   - Chỉ xem log lỗi (ERROR): `{service="omni-core", level="ERROR"}`
   - Lọc các request Connect-RPC thất bại: `{service="omni-core"} |= "status=500"`
