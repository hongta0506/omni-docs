# Channel & Gateway — Kịch Bản Kiểm Thử Toàn Diện (Test Scenarios & Quality Matrix)

> **Bounded Context:** `internal/channel`  
> **Mục tiêu:** Kiểm thử kết nối socket, cơ chế Sticky Proxy, chống ban tài khoản, và Rate Limiting.

---

## Ma Trận Kiểm Thử Nghiệp Vụ (Quality & Invariant Matrix)

| ID | Nhóm Kiểm Thử | Tầng Thực Thi | Mục Tiêu Bắt Buộc | Rủi Ro Nếu Không Test |
|---|---|---|---|---|
| **TC-CHAN-01** | Sticky Proxy Binding | Domain / Infra Unit | Mỗi tài khoản mạng xã hội luôn chỉ gọi qua 1 Proxy duy nhất trong phiên | Đổi IP liên tục làm khóa tài khoản |
| **TC-CHAN-02** | Rate Limiter Backpressure | Concurrency Stress | Bắn 100 tin nhắn cùng lúc -> Rate Limiter phải xếp hàng và giữ đúng nhịp delay | Bị Zalo/Telegram gắn cờ spam và ban nick |
| **TC-CHAN-03** | QR Code Expiration | Domain / App Unit | Mã QR quá 120s không quét phải tự hủy và báo lỗi expired | Treo tài nguyên bộ nhớ |
| **TC-CHAN-04** | Session Watchdog Failover | Background Worker | Khi mất mạng, worker tự reconnect với exponential backoff (tối đa 5 lần) | Rớt kết nối nhưng nhân viên không biết |
| **TC-CHAN-05** | Credential AES-256 Storage | Infra Unit | Token và Cookie đăng nhập lưu trong DB phải được mã hóa, không để lộ plain text | Rò rỉ tài khoản mạng xã hội của khách |
| **TC-CHAN-06** | Official Webhook HMAC Verification | Security / Infra Unit | Chặn tất cả webhook giả mạo không khớp chữ ký SHA256 từ Meta/Zalo OA | Giả mạo tin nhắn khách hàng tấn công hệ thống |
| **TC-CHAN-07** | Unofficial Random Jitter Delay | Concurrency Unit | Các tin nhắn Unofficial gửi ra ngoài phải có jitter ngẫu nhiên 3-7s, không gửi cố định chu kỳ | AI của nền tảng phát hiện bot tự động hóa |

---

## 1. TC-CHAN-02: Kiểm Thử Rate Limiter Gửi Tin Nhắn Ra Ngoài (Token Bucket)

### Kịch Bản Tái Hiện (Go Test)
```go
func TestChannelRateLimiter_Backpressure(t *testing.T) {
    limiter := NewChannelRateLimiter(RateLimitConfig{
        MaxPerMinute: 30, // Tối đa 30 tin/phút -> ~2s/tin
        Burst:        1,
    })

    start := time.Now()
    messagesSent := 0

    for i := 0; i < 5; i++ {
        err := limiter.Wait(context.Background(), "zalo_account_01")
        assert.NoError(t, err)
        messagesSent++
    }

    elapsed := time.Since(start)
    // 5 tin nhắn với tần suất 2s/tin phải mất ít nhất 8 giây
    assert.GreaterOrEqual(t, elapsed.Seconds(), float64(8), "Rate limiter phải cưỡng chế khoảng delay an toàn")
    assert.Equal(t, 5, messagesSent)
}
```
