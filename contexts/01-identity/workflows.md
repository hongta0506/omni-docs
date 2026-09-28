# Identity & Settings — Đặc Tả Luồng Nghiệp Vụ & Sơ Đồ UML (Workflows)

> **Bounded Context:** `internal/identity`  
> **Phạm vi:** Luồng xoay vòng Refresh Token chống Replay Attack, Cây phân quyền RBAC phân cấp, và Cơ chế phân giải Claims.

---

## 1. Sơ Đồ Xoay Vòng Refresh Token & Chống Replay Attack (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App (Browser / App)
    participant AuthAPI as Auth HTTP Handler
    participant AuthApp as Auth CQRS Application
    participant TokenRepo as Session & Token Repository
    participant Audit as Security Audit Log

    Note over Client,AuthAPI: Trường hợp 1: Refresh Token Hợp Lệ
    Client->>AuthAPI: POST /api/v1/auth/refresh (RefreshToken = RT_1)
    AuthAPI->>AuthApp: HandleRefreshTokenCommand(RT_1)
    AuthApp->>TokenRepo: FindSessionByToken(RT_1)
    TokenRepo-->>AuthApp: Session Found (Status = Active, Consumed = False)
    AuthApp->>TokenRepo: MarkConsumed(RT_1) & Insert(RT_2)
    AuthApp->>AuthApp: GenerateAccessToken(Claims)
    AuthApp-->>AuthAPI: New Access Token + Refresh Token RT_2
    AuthAPI-->>Client: HTTP 200 OK

    Note over Client,AuthAPI: Trường hợp 2: Token Replay Attack (RT_1 Bị Kẻ Gian Dùng Lại)
    actor Hacker as Kẻ Tấn Công
    Hacker->>AuthAPI: POST /api/v1/auth/refresh (RefreshToken = RT_1)
    AuthAPI->>AuthApp: HandleRefreshTokenCommand(RT_1)
    AuthApp->>TokenRepo: FindSessionByToken(RT_1)
    TokenRepo-->>AuthApp: Session Found BUT Consumed == TRUE!
    
    rect rgb(255, 230, 230)
        Note over AuthApp,Audit: PHÁT HIỆN TẤN CÔNG REPLAY -> HỦY TOÀN BỘ PHIÊN
        AuthApp->>TokenRepo: RevokeAllSessionTokens(SessionID)
        AuthApp->>Audit: LogSecurityIncident(CRITICAL, ReplayAttack, UserID, IP)
        AuthApp-->>AuthAPI: Return ErrTokenReplayed (HTTP 401)
    end
    AuthAPI-->>Hacker: HTTP 401 Unauthorized (Session Revoked)
```

---

## 2. Sơ Đồ Đánh Giá Phân Quyền Động Đa Tầng (RBAC Decision Tree)

Quy trình middleware và authorizer thẩm định yêu cầu truy cập tài nguyên:

```mermaid
flowchart TD
    Req([HTTP / Connect-RPC Request]) --> ExtClaims[Trích xuất UserClaims từ JWT Context]
    ExtClaims --> CheckActive{Tài khoản & Tenant có Active?}
    CheckActive -- Không --> Err403[Từ chối: 403 Forbidden - Account Suspended]
    
    CheckActive -- Có --> IsSuperAdmin{Role == SuperAdmin?}
    IsSuperAdmin -- Có --> Allow([Chấp thuận 100% quyền])
    
    IsSuperAdmin -- Không --> MatchPermission{Có Permission tương ứng Resource:Action?}
    MatchPermission -- Không --> ErrDeny[Từ chối: 403 Forbidden - Permission Denied]
    
    MatchPermission -- Có --> CheckScope{Kiểm tra Scope của quyền}
    CheckScope -- Global / Tenant --> Allow
    CheckScope -- Department --> DeptFilter[Tiêm bộ lọc: DepartmentID IN Subtree]
    CheckScope -- Personal --> PersonalFilter[Tiêm bộ lọc: OwnerID == UserID]
    
    DeptFilter --> CheckMasking{Yêu cầu truy cập trường nhạy cảm SĐT?}
    PersonalFilter --> CheckMasking
    
    CheckMasking -- Không có quyền unmask --> ApplyMask[Áp dụng mặt nạ: 091***678]
    CheckMasking -- Có quyền unmask --> KeepRaw[Giữ nguyên số & Ghi Audit Log]
    
    ApplyMask --> Allow
    KeepRaw --> Allow
```

---

## 3. Cấu Trúc Cây Phòng Ban & Thuật Toán Chống Vòng Lặp (Department Hierarchy)

```mermaid
graph TD
    subgraph OrganizationTree [Cơ Cấu Phòng Ban Mẫu]
        HQ[Tổng Công Ty - Level 0] --> South[Khối Miền Nam - Level 1]
        HQ --> North[Khối Miền Bắc - Level 1]
        South --> SaleTeam1[Đội Sales 1 - Level 2]
        South --> SaleTeam2[Đội Sales 2 - Level 2]
        North --> SaleNorth[Đội Sales Hà Nội - Level 2]
    end

    subgraph CircularPrevention [Thuật Toán Chống Vòng Lặp]
        CheckLoop{Đổi cha của Khối Miền Nam thành Đội Sales 1?}
        CheckLoop --> ScanAncestors[Truy ngược danh sách Tổ Tiên / Ancestors]
        ScanAncestors --> FoundDescendant[Phát hiện Đội Sales 1 là con của Khối Miền Nam!]
        FoundDescendant --> Reject[Từ chối: ErrCircularHierarchyDetected]
    end
```
