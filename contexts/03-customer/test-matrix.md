# Customer & Lead — Kịch Bản Kiểm Thử Toàn Diện (Test Scenarios & Quality Matrix)

> **Bounded Context:** `internal/customer`  
> **Nguyên tắc:** Test-Driven Development (TDD) & Spec-Driven Verification.  
> **Mục tiêu:** Kiểm thử tường minh từ Unit Invariants, Concurrency & Race Conditions, đến End-to-End Integration Tests.

---

## Ma Trận Kiểm Thử Nghiệp Vụ (Quality & Invariant Matrix)

| ID | Nhóm Kiểm Thử | Tầng Thực Thi | Mục Tiêu Bắt Buộc | Rủi Ro Nếu Không Test |
|---|---|---|---|---|
| **TC-CUST-01** | Phone E.164 Normalization | Domain Unit | Số điện thoại VN các định dạng (`091...`, `8491...`, `+8491...`) phải chuẩn hóa về `+8491...` | Trùng lặp contact do sai định dạng |
| **TC-CUST-02** | Phone Uniqueness per Tenant | Infra / Integration | 2 Contact cùng Tenant không thể có cùng `primary_phone` | Rò rỉ dữ liệu, xung đột hồ sơ |
| **TC-CUST-03** | Two-Ledger Immutability | Domain / App Unit | Handler CRM không được phép thay đổi trực tiếp `ChannelProfile` | Xung đột sync từ Gateway ngoại vi |
| **TC-CUST-04** | Lead Pool Race Condition | Concurrency Stress | 10 Sales đồng thời claim 1 Lead duy nhất trong Pool -> chỉ đúng 1 người thành công | 1 khách hàng bị gán cho nhiều Sales |
| **TC-CUST-05** | SLA Auto-Revoke Invariant | App / Worker | Sau 24h không tương tác -> thu hồi về Pool; Có tương tác trước 24h -> không thu hồi | Bỏ sót khách hoặc thu hồi nhầm |
| **TC-CUST-06** | Smart Merge Transaction | Integration DB | Hợp nhất chuyển giao toàn bộ Đơn hàng, Notes, Profiles nguyên tử; Chặn gộp vòng tròn | Mất dữ liệu đơn hàng, deadlock |
| **TC-CUST-07** | B2B Tax Code Validation | Domain Unit | Kiểm tra cấu trúc MST Việt Nam (10 hoặc 13 số hợp lệ) | Nhập sai thông tin xuất hóa đơn |

---

## 1. TC-CUST-01: Kiểm Thử Chuẩn Hóa Số Điện Thoại E.164 (Unit Test)

### Mục tiêu
Kiểm thử bộ chuẩn hóa `pkg/phone` và Value Object `PhoneVO` đối với số điện thoại Việt Nam và quốc tế.

### Test Cases Matrix
```
| Input Phone         | Expected Output   | Status  | Ghi chú                           |
|---------------------|-------------------|---------|-----------------------------------|
| "0912345678"        | "+84912345678"    | PASS    | Định dạng chuẩn nội địa 10 số     |
| "84912345678"       | "+84912345678"    | PASS    | Thiếu dấu cộng phía trước         |
| "+84 912 345 678"   | "+84912345678"    | PASS    | Có dấu khoảng trắng               |
| "0912.345.678"      | "+84912345678"    | PASS    | Có dấu chấm phân cách             |
| "091-234-5678"      | "+84912345678"    | PASS    | Có dấu gạch ngang                 |
| "012345678"         | ERROR             | FAIL    | Đầu số không hợp lệ               |
| "abcdef"            | ERROR             | FAIL    | Chứa ký tự chữ                    |
| "+1 202 555 0123"   | "+12025550123"    | PASS    | Số điện thoại quốc tế Mỹ (+1)     |
```

### Mã Kiểm Thử Mẫu (Go Native Testing)
```go
func TestPhoneVO_Normalization(t *testing.T) {
    cases := []struct {
        input    string
        expected string
        hasErr   bool
    }{
        {"0912345678", "+84912345678", false},
        {"84912345678", "+84912345678", false},
        {"+84 912 345 678", "+84912345678", false},
        {"012345678", "", true},
    }

    for _, tc := range cases {
        vo, err := NewPhoneVO(tc.input)
        if tc.hasErr {
            assert.Error(t, err)
        } else {
            assert.NoError(t, err)
            assert.Equal(t, tc.expected, vo.String())
        }
    }
}
```

---

## 2. TC-CUST-04: Kiểm Thử Tranh Chấp Claim Lead (Concurrency Race Condition)

### Mục tiêu
Đảm bảo khi nhiều nhân viên kinh doanh cùng bấm nút "Nhận Lead" (Claim Lead) trên giao diện cùng một mili-giây, cơ chế khóa dòng (Pessimistic Locking `SELECT ... FOR UPDATE`) của PostgreSQL và Bun ORM phải đảm bảo:
- **Chỉ 1 nhân viên nhận thành công (HTTP 200).**
- **Các nhân viên còn lại nhận thông báo lỗi hợp lệ (HTTP 409 Conflict: `ErrLeadAlreadyClaimed`).**
- **Không xảy ra tình trạng 1 Lead bị ghi đè hai người.**

### Kịch Bản Tái Hiện Đa Luồng (Go Test Concurrency)
```go
func TestLeadPool_ConcurrentClaim_RaceCondition(t *testing.T) {
    db := setupTestDB(t)
    leadID := seedUnassignedLead(t, db)
    salesCount := 10

    var wg sync.WaitGroup
    var successCount int64
    var conflictCount int64

    for i := 1; i <= salesCount; i++ {
        wg.Add(1)
        salesID := uuid.New()
        go func(sid uuid.UUID) {
            defer wg.Done()
            cmd := ClaimLeadCommand{LeadID: leadID, SalesID: sid}
            err := claimLeadHandler.Handle(context.Background(), cmd)
            if err == nil {
                atomic.AddInt64(&successCount, 1)
            } else if errors.Is(err, domain.ErrLeadAlreadyClaimed) {
                atomic.AddInt64(&conflictCount, 1)
            }
        }(salesID)
    }

    wg.Wait()

    assert.Equal(t, int64(1), successCount, "Chỉ duy nhất 1 sales nhận được lead")
    assert.Equal(t, int64(salesCount-1), conflictCount, "Tất cả sales còn lại phải nhận ErrLeadAlreadyClaimed")
}
```

---

## 3. TC-CUST-05: Kiểm Thử Thu Hồi Lead Quá Hạn Tương Tác (SLA Auto-Revoke)

### Kịch bản 1: Vi phạm SLA 24h -> Tự động thu hồi
- **Setup:**
  - Lead `L1` được gán cho Sales B lúc `T0`.
  - Không có bản ghi nào trong `contact_notes`, `appointments`, hoặc tin nhắn gửi đi từ Sales B.
  - Chỉnh đồng hồ hệ thống sang `T0 + 24h + 1m`.
- **Action:** Chạy hàm `slaWatcherWorker.ScanAndRevoke(ctx)`.
- **Assert:**
  - `L1.AssignedUserID` trở về `nil`.
  - `L1.Status` trở về `Unassigned`.
  - Tạo 1 bản ghi `ContactActivity` với `type = "lead_revoked_sla"`.
  - Transactional Outbox có `LeadRevokedEvent`.

### Kịch bản 2: Có tương tác trước 24h -> Không thu hồi
- **Setup:**
  - Lead `L2` được gán cho Sales B lúc `T0`.
  - Lúc `T0 + 12h`, Sales B tạo một Note: "Đã gọi điện khách hẹn chiều mai tư vấn".
  - Chỉnh đồng hồ hệ thống sang `T0 + 25h`.
- **Action:** Chạy hàm `slaWatcherWorker.ScanAndRevoke(ctx)`.
- **Assert:**
  - `L2.AssignedUserID` vẫn giữ nguyên Sales B.
  - Không có sự kiện thu hồi nào được phát sinh.

---

## 4. TC-CUST-06: Kiểm Thử Hợp Nhất Trùng Lặp (Smart Merge & Deadlock Prevention)

### Kịch bản 1: Hợp nhất dữ liệu toàn vẹn
- **Dữ liệu đầu vào:**
  - Contact A: 2 Đơn hàng (Tổng 3 triệu), 1 Note, 1 Zalo Profile (`zalo_111`).
  - Contact B: 1 Đơn hàng (Tổng 2 triệu), 1 Lịch hẹn, 1 FB Profile (`fb_222`).
- **Thực hiện:** Gọi lệnh `MergeContact(Source=A, Target=B)`.
- **Kết quả kỳ vọng:**
  - Contact A: `is_merged = true`, `merged_into_id = B.ID`.
  - Contact B:
    - Sở hữu cả 3 đơn hàng, tổng chi tiêu tự động cộng dồn thành 5 triệu (`TotalSpent = 5,000,000`).
    - Kế thừa cả Zalo Profile (`zalo_111`) và FB Profile (`fb_222`).
    - Lịch sử tương tác gộp chung cả Note và Lịch hẹn.

### Kịch bản 2: Ngăn chặn vòng lặp Circular Merge
- **Thực hiện:**
  - Bước 1: Gộp Contact A vào B thành công.
  - Bước 2: Cố tình gọi gộp Contact B vào Contact A.
- **Kết quả kỳ vọng:**
  - Lệnh ở Bước 2 bị chặn ngay tại tầng Domain với lỗi `domain.ErrCircularMergeDetected`.
  - Database rollback 100%, không bị treo (lock/deadlock).
