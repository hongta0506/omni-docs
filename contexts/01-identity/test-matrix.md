# Identity & Settings — Kịch Bản Kiểm Thử Toàn Diện (Test Scenarios & Quality Matrix)

> **Bounded Context:** `internal/identity`  
> **Mục tiêu:** Kiểm thử an toàn bảo mật, chống Replay Attack, thẩm định tính toàn vẹn cây phòng ban và phân quyền động.

---

## Ma Trận Kiểm Thử Nghiệp Vụ (Quality & Invariant Matrix)

| ID | Nhóm Kiểm Thử | Tầng Thực Thi | Mục Tiêu Bắt Buộc | Rủi Ro Nếu Không Test |
|---|---|---|---|---|
| **TC-IDEN-01** | Multi-Tenant Claim Isolation | Context / Handler Unit | Request không có TenantID hợp lệ phải bị chặn 401; User Tenant A không được thấy Tenant B | Rò rỉ dữ liệu giữa các công ty |
| **TC-IDEN-02** | Refresh Token Rotation & Replay | Application Unit | Khi dùng lại Refresh Token cũ, toàn bộ session bị thu hồi lập tức | Kẻ trộm token chiếm quyền vĩnh viễn |
| **TC-IDEN-03** | Department Tree Circular Loop | Domain / App Unit | Cấm trỏ cha của một node vào con hoặc cháu của chính nó | Treo đệ quy vô tận, sập service |
| **TC-IDEN-04** | Dynamic RBAC Evaluation | Application Unit | User với Scope Personal chỉ xem được dữ liệu của mình; Scope Dept thấy cả cây con | Nhân viên xem trộm doanh số nhau |
| **TC-IDEN-05** | Sensitive Phone Masking | Interface DTO Unit | User không có quyền unmask chỉ nhận chuỗi số có dấu sao (`***`) | Nhân viên đánh cắp dữ liệu khách |

---

## 1. TC-IDEN-02: Kiểm Thử Xoay Vòng Refresh Token & Phát Hiện Replay Attack

### Kịch Bản Tái Hiện (Go Test)
```go
func TestRefreshToken_Rotation_And_ReplayAttack(t *testing.T) {
    repo := setupSessionRepo(t)
    authApp := NewAuthApplication(repo)

    // Bước 1: Login thành công, nhận token ban đầu
    session := createActiveSession(t, repo)
    rt1 := session.InitialRefreshToken

    // Bước 2: Refresh token lần 1 hợp lệ
    res1, err := authApp.RefreshToken(context.Background(), rt1)
    assert.NoError(t, err)
    assert.NotEmpty(t, res1.AccessToken)
    assert.NotEqual(t, rt1, res1.RefreshToken, "Refresh token phải được đổi mới (Rotation)")

    rt2 := res1.RefreshToken

    // Bước 3: Kẻ gian cố tình dùng lại rt1 (Replay Attack)
    _, errReplay := authApp.RefreshToken(context.Background(), rt1)
    assert.ErrorIs(t, errReplay, domain.ErrTokenReplayDetected)

    // Bước 4: Kiểm tra session đã bị hủy bỏ toàn bộ
    sessAfter, _ := repo.FindByID(session.ID)
    assert.True(t, sessAfter.IsRevoked, "Toàn bộ phiên phải bị thu hồi")

    // Bước 5: Cả rt2 của người dùng hợp pháp cũng không còn dùng được nữa (Bắt đăng nhập lại)
    _, errLegit := authApp.RefreshToken(context.Background(), rt2)
    assert.Error(t, errLegit, "Token hợp pháp cũng bị vô hiệu hóa sau vụ tấn công")
}
```

---

## 2. TC-IDEN-03: Kiểm Thử Chống Vòng Lặp Cây Phòng Ban (Circular Hierarchy)

### Kịch bản
- **Khởi tạo:**
  - `Node A` (Root) -> `Node B` (Child of A) -> `Node C` (Child of B).
- **Thao tác vi phạm:**
  - Cố tình gọi `UpdateDepartment(ID=A, ParentID=C)`.
- **Kỳ vọng:**
  - Trả về lỗi `domain.ErrCircularHierarchyDetected`.
  - Database không thay đổi `parent_id` của `Node A`.
