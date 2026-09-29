# Hướng Dẫn Môi Trường Phát Triển Cục Bộ & Docker Stack (Local Dev & Docker Guide)
## Omni Platform — Go Clean DDD Stack

> **Mục tiêu**: Chuẩn hóa quy trình thiết lập môi trường phát triển cục bộ (Local Development) cho lập trình viên và AI Coding Agents. Đảm bảo toàn bộ hạ tầng phụ trợ (PostgreSQL 16, Redis 7, NSQ, Observability Stack) được khởi tạo nhanh chóng, nhất quán qua Docker Compose.

---

## 1. Yêu Cầu Môi Trường (System Prerequisites)

- **Go**: Phiên bản `>= 1.22` (tận dụng tính năng định tuyến ServeMux cải tiến và `slices.Clone()`).
- **Docker & Docker Compose**: Phiên bản Docker Desktop hoặc OrbStack hỗ trợ Compose v2.
- **Buf CLI**: Phiên bản `>= 1.30.0` (phục vụ biên dịch Protobuf và Connect-RPC).
- **Make**: Tiện ích chạy lệnh tự động hóa.
- **Git & GitHub CLI (`gh`)**: Quản lý source code và tương tác Sprint Board.

---

## 2. Kiến Trúc Local Docker Compose Stack

Môi trường local sử dụng file `docker-compose.dev.yml` (hoặc `docker-compose.yml`) cung cấp các dịch vụ nền tảng:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LOCAL DOCKER COMPOSE STACK                      │
├───────────────────┬───────────────────┬────────────────────────────────┤
│   LƯU TRỮ CHÍNH   │   BỘ ĐỆM & CACHE  │        HÀNG ĐỢI NSQ            │
│   PostgreSQL 16   │      Redis 7      │ - nsqlookupd (4161 HTTP)       │
│    (Port 5432)    │    (Port 6379)    │ - nsqd (4150 TCP / 4151 HTTP)  │
│                   │                   │ - nsqadmin (4171 Web UI)       │
├───────────────────┴───────────────────┴────────────────────────────────┤
│                    HỆ THỐNG GIÁM SÁT OBSERVABILITY                    │
│ - Grafana Loki (3100): Gom Structured JSON logs từ Go stdout          │
│ - Promtail: Thu thập log container đẩy về Loki                        │
│ - Prometheus (9091): Cào metrics từ Go runtime (/metrics)              │
│ - Grafana (3000): Dashboard trực quan hóa lỗi và Circuit Breaker       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Mẫu Cấu Hình `docker-compose.dev.yml` Chuẩn

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: omni-postgres-dev
    environment:
      POSTGRES_USER: omni_user
      POSTGRES_PASSWORD: omni_pass
      POSTGRES_DB: omni_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init-pg-extensions.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U omni_user -d omni_db"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: omni-redis-dev
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  nsqlookupd:
    image: nsqio/nsq:latest
    container_name: omni-nsqlookupd-dev
    command: /nsqlookupd
    ports:
      - "4160:4160"
      - "4161:4161"

  nsqd:
    image: nsqio/nsq:latest
    container_name: omni-nsqd-dev
    command: /nsqd --lookupd-tcp-address=nsqlookupd:4160 --broadcast-address=127.0.0.1
    ports:
      - "4150:4150"
      - "4151:4151"
    depends_on:
      - nsqlookupd

  nsqadmin:
    image: nsqio/nsq:latest
    container_name: omni-nsqadmin-dev
    command: /nsqadmin --lookupd-http-address=nsqlookupd:4161
    ports:
      - "4171:4171"
    depends_on:
      - nsqlookupd

  loki:
    image: grafana/loki:latest
    container_name: omni-loki-dev
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml

  grafana:
    image: grafana/grafana:latest
    container_name: omni-grafana-dev
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    depends_on:
      - loki

volumes:
  pgdata:
  redisdata:
```

---

## 4. Kịch Bản Khởi Tạo Database Extensions (`init-pg-extensions.sql`)

PostgreSQL yêu cầu kích hoạt sẵn các extension phục vụ tìm kiếm không dấu, UUID và full-text search:

```sql
-- Kích hoạt extension sinh UUID v4
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Kích hoạt extension loại bỏ dấu tiếng Việt (Spec 042/050b tìm kiếm sản phẩm & khách hàng)
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Kích hoạt extension chỉ mục 3 ký tự (trigram) phục vụ tìm kiếm mờ (fuzzy search)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

---

## 5. Quy Trình Khởi Động & Phát Triển Cục Bộ

### Bước 1: Khởi động hệ thống hạ tầng
```bash
# Khởi chạy toàn bộ services ngầm
docker compose -f docker-compose.dev.yml up -d

# Kiểm tra trạng thái hoạt động của các container
docker compose -f docker-compose.dev.yml ps
```

### Bước 2: Thiết lập biến môi trường cục bộ
```bash
# Copy file cấu hình mẫu sang file môi trường thực tế
cp .env.example .env
```

### Bước 3: Chạy Database Migration
```bash
# Áp dụng các bảng dữ liệu gốc vào PostgreSQL
go run cmd/migrate/main.go up
```

### Bước 4: Khởi chạy ứng dụng Backend Go
```bash
# Chạy ứng dụng trực tiếp với reload hoặc hot-compile (Air)
go run cmd/server/main.go
```

Khi máy chủ khởi động thành công:
- **HTTP REST & Connect-RPC**: `http://localhost:8080`
- **Realtime WebSocket Hub**: `ws://localhost:8081`
- **NSQ Admin Dashboard**: `http://localhost:4171`
- **Grafana Dashboard**: `http://localhost:3000` (User: `admin`, Pass: `admin`)
- **Prometheus Metrics**: `http://localhost:8080/metrics`

---

## 6. Xử Lý Các Sự Cố Thường Gặp (Troubleshooting)

1. **Lỗi đụng độ cổng (Port Conflict - ví dụ 5432, 6379)**:
   - *Nguyên nhân*: Có dịch vụ PostgreSQL hoặc Redis đang chạy sẵn trực tiếp trên hệ điều hành host.
   - *Khắc phục*: Tạm dừng service local (`sudo systemctl stop postgresql` hoặc kiểm tra Task Manager trên Windows) hoặc đổi cổng ánh xạ trong file docker-compose (vd: `5433:5432`).
2. **NSQ Không Tự Tạo Topic**:
   - Mặc định `nsqd` tự động tạo topic khi producer gửi bản tin đầu tiên. Nếu gặp lỗi kết nối, kiểm tra lại biến `--broadcast-address=127.0.0.1` trong service `nsqd`.
3. **Lỗi thiếu extension `unaccent` khi tìm kiếm khách hàng/sản phẩm**:
   - Truy cập vào Postgres container chạy lệnh: `psql -U omni_user -d omni_db -c 'CREATE EXTENSION IF NOT EXISTS unaccent;'`.
