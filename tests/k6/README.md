# k6 Load Tests — TourGuide API

## Yêu cầu

- [k6](https://k6.io/) — cài qua winget:
  ```powershell
  winget install k6 --source winget
  ```
- API đang chạy tại `http://localhost:5010`
- 5 tài khoản test đã tồn tại trong DB

---

## Bước 1: Tạo tài khoản test

```powershell
.\tests\k6\setup_users.ps1
# hoặc chỉ định URL khác:
.\tests\k6\setup_users.ps1 -ApiUrl http://localhost:5010
```

Script sẽ tạo 5 tài khoản `test1@tourguide.test` → `test5@tourguide.test` với mật khẩu `Test@123`.  
Nếu tài khoản đã tồn tại (409) thì bỏ qua — chạy lại script bất cứ lúc nào cũng an toàn.

---

## Bước 2: Chạy test

```powershell
# Chạy cơ bản (profile medium — mặc định)
& "C:\Program Files\k6\k6.exe" run tests\k6\poi_concurrent.js

# Xem dashboard real-time trong browser (http://localhost:5665)
& "C:\Program Files\k6\k6.exe" run --out web-dashboard tests\k6\poi_concurrent.js
```

---

## Tùy chỉnh qua biến môi trường

| Biến          | Mặc định                | Mô tả                                    |
|---------------|-------------------------|------------------------------------------|
| `BASE_URL`    | `http://localhost:5010` | URL của API                              |
| `PROFILE`     | `medium`                | Cường độ test: `light` / `medium` / `heavy` |
| `P99_MS`      | `2000`                  | Ngưỡng p99 latency (ms)                  |
| `FAIL_PCT`    | `0.05`                  | Ngưỡng tỉ lệ lỗi (0.05 = 5%)            |
| `TEST_PASSWORD` | `Test@123`            | Mật khẩu chung cho tài khoản test        |
| `ACCOUNTS`    | _(5 tài khoản mặc định)_ | JSON array override tài khoản           |
| `POIS`        | _(5 POI mặc định)_      | JSON array override POI                  |

### Profiles

| Profile  | Spike VUs | Steady VUs | Max VUs |
|----------|-----------|------------|---------|
| `light`  | 10        | 3          | 15      |
| `medium` | 20        | 5          | 30      |
| `heavy`  | 50        | 10         | 60      |

### Ví dụ

```powershell
# Test nặng hơn, ngưỡng p99 = 3s
& "C:\Program Files\k6\k6.exe" run `
    --env PROFILE=heavy `
    --env P99_MS=3000 `
    tests\k6\poi_concurrent.js

# Test với API production
& "C:\Program Files\k6\k6.exe" run `
    --env BASE_URL=https://api.tourguide.vn `
    --env PROFILE=light `
    tests\k6\poi_concurrent.js

# Override POI tùy chỉnh
& "C:\Program Files\k6\k6.exe" run `
    --env POIS='[{"placeId":5,"lat":10.77,"lon":106.69}]' `
    tests\k6\poi_concurrent.js
```

---

## Kịch bản trong poi_concurrent.js

| Kịch bản   | Mô tả                    | Bắt đầu | Thời gian |
|------------|--------------------------|---------|-----------|
| `poi_spike`   | N VU vào cùng lúc (spike) | 0s      | 30s       |
| `poi_steady`  | N VU liên tục             | 35s     | 60s       |
| `poi_rampup`  | Tăng dần 1 → max VU       | 2m      | 80s       |

Mỗi iteration: **check-in** → đứng 2–5 giây → **check-out**

---

## Đọc kết quả

```
========================================================
  TOURGUIDE LOAD TEST - KET QUA
========================================================
  3 kich ban  |  591 requests  |  2.9 req/s  |  ~7s
  Profile: medium  (spike:20 steady:5 max:30)

  KB1  Spike    20 VU dong thoi                  30s
  KB2  Steady    5 VU lien tuc                   60s
  KB3  Ramp-up   1 ->  30 VU tang dan            80s
  --------------------------------------------------------
  TONG QUAN
  --------------------------------------------------------
    Requests   :   591   RPS     : 2.9 req/s
    Check-in   :   295   Check-out: 291
    Loi HTTP   :     4   (0.7%)   Duplicate: 0
    Avg HTTP   : 396ms
  --------------------------------------------------------
  LATENCY CHECKIN  (0ms ────────── 1000ms ───── 2000ms)
  --------------------------------------------------------
    avg  [████░░░░░░░░░░░░░░░░]   380ms
    med  [██░░░░░░░░░░░░░░░░░░]   198ms
    p90  [███████░░░░░░░░░░░░░]   735ms
    p95  [████████░░░░░░░░░░░░]   832ms
    p99  [█████████░░░░░░░░░░░]   898ms  <- nguong 2000ms

    Checkout avg: 413ms   p99: 835ms
  --------------------------------------------------------
  THRESHOLDS
  --------------------------------------------------------
    [PASS]  HTTP   fail rate      0.7%  (limit: < 5%)
    [PASS]  Checkin fail rate     1.4%  (limit: < 5%)
    [PASS]  Checkin p99          898ms  (limit: < 2000ms)
  ========================================================
  KET LUAN: TAT CA THRESHOLD PASS - HE THONG ON DINH
  ========================================================
```

**Bar chart latency**: mỗi `█` = ~83ms (tổng 24 ký tự = 2000ms). P99 càng ngắn càng tốt.

---

## Test heartbeat (heartbeat_load.js)

Mô phỏng 100 device cập nhật `LastSeenAt` đồng thời — giống app thực gửi heartbeat mỗi 5s.

```powershell
# Mode A: Gọi Supabase trực tiếp (giống mobile app)
& "C:\Program Files\k6\k6.exe" run `
    --env SUPABASE_URL=https://xxx.supabase.co `
    --env SUPABASE_KEY=your-anon-key `
    tests\k6\heartbeat_load.js

# Mode B: Gọi qua API (nếu có endpoint /api/devices/{id}/heartbeat)
& "C:\Program Files\k6\k6.exe" run `
    --env BASE_URL=http://localhost:5010 `
    tests\k6\heartbeat_load.js
```

Ngưỡng: `heartbeat_ms p(95) < 500ms`, lỗi `< 1%`

---

## Troubleshooting

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `EMAXCONNSESSION` 500 | Supabase free tier giới hạn ~15 kết nối đồng thời | Dùng profile `light` hoặc nâng plan |
| Login 400 tất cả account | Tài khoản chưa tạo hoặc sai password | Chạy lại `setup_users.ps1` |
| `k6 not recognized` | k6 chưa trong PATH | Dùng full path `& "C:\Program Files\k6\k6.exe"` |
| p99 = N/A | k6 không tính p99 mặc định | Đã fix bằng `summaryTrendStats` trong options |
