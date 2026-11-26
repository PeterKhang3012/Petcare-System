# PawStay

PawStay là hệ thống đặt lịch chăm sóc và lưu trú thú cưng. Hướng dẫn này chạy Auth, Pet, Booking, Catalog, Care và Payment cùng database của chúng bằng Docker Compose.

## 1. Chuẩn bị

- Docker Desktop đang chạy ở chế độ Linux containers.
- Node.js 22.19 trở lên và npm nếu chạy frontend hoặc service trực tiếp trên máy.
- Mở PowerShell tại thư mục gốc dự án, nơi có `docker-compose.yml`.

## 2. Khóa Auth và dữ liệu seed

Khi chạy Docker Compose, `jwt-keys-init` tạo cặp khóa trong `Backend/auth-service/keys/` nếu thư mục chưa có khóa. Cặp hợp lệ đã có được giữ nguyên. Nếu chỉ còn khóa riêng, Compose tạo lại khóa công khai tương ứng. Nếu chỉ còn khóa công khai hoặc hai khóa không khớp, Compose dừng khởi động Auth để bạn khôi phục đúng cặp. Auth đọc khóa riêng từ thư mục này. Các service khác đọc khóa công khai từ volume dùng chung.

Auth tự seed tài khoản STAFF từ `Backend/auth-service/scripts/data/staff.json` trước khi mở cổng. Tài khoản đã có cùng vai trò và quyền được giữ nguyên, kể cả mật khẩu. Đổi thông tin seed mẫu trước khi đưa gateway ra Internet. Booking tự seed tài nguyên còn thiếu và giữ nguyên trạng thái tài nguyên đã có. Khi chạy Auth trực tiếp ngoài Docker, xem [cấu hình Auth](Backend/auth-service/README.md).

## 3. Chạy stack Docker Compose

Từ thư mục gốc dự án, tạo cấu hình mẫu nếu chưa có các file `.env`:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path Backend/payment-service/.env)) {
    Copy-Item Backend/payment-service/.env.example Backend/payment-service/.env
}
```

- Trong **`.env` gốc**, đặt `JWT_ISSUER` dùng chung cho Auth và các service, điền bốn token nội bộ khác nhau và hai mật khẩu MySQL của Compose. Có thể chạy `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` để tạo một giá trị ngẫu nhiên. Chạy lại cho mỗi token hoặc mật khẩu cần điền.
- Compose tự cấp URL database và URL nội bộ `http://auth-service:3001`. Auth dùng MongoDB và volume riêng. Khi chạy lần đầu, tài khoản trong MongoDB Auth trên Windows cần được tạo lại hoặc di chuyển riêng. MongoDB replica set, seed tài nguyên Booking và migration MySQL của Payment chạy khi stack khởi động. Catalog được seed idempotent khi khởi động; Booking lấy báo giá qua HTTP từ Catalog.
- Trong **`Backend/payment-service/.env`**, điền mã merchant và khóa ký VNPAY Sandbox nếu cần tạo URL thanh toán. Compose mặc định dùng `http://localhost:8080/api/payments/vnpay/return` và đưa khách về `http://localhost:5173/payments/return`. Nếu dùng frontend tại origin khác, đặt `PAYMENT_FRONTEND_RETURN_URL` trong **`.env` gốc** theo đúng origin đăng nhập. Khi triển khai qua HTTPS, đặt `VNPAY_RETURN_URL` trong **`.env` gốc** và đăng ký endpoint `/api/payments/vnpay/ipn` qua địa chỉ HTTPS công khai mà VNPAY truy cập được.

```powershell
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
```

## 4. Kiểm tra và test bằng Postman

| Service | Địa chỉ mặc định | Kiểm tra |
| --- | --- | --- |
| Auth | `http://localhost:3001` | Đăng nhập qua `POST /api/auth/login` |
| Pet | `http://localhost:3002` | `GET /ready` trả 200 |
| Booking | `http://localhost:3003` | `GET /ready` trả 200 |
| Catalog | `http://localhost:3004` | `GET /ready` trả 200 |
| Care | `http://localhost:3006` | `GET /ready` trả 200 |
| Payment | `http://localhost:8084` | `GET /api/payments/vnpay/return` trả 200 khi chưa có frontend |

| Đường dẫn qua gateway | Service |
| --- | --- |
| `GET /healthz` | Nginx |
| `/api/auth/register`, `/api/auth/login`, `/api/auth/me` | Auth |
| `/api/pets` | Pet |
| `/api/bookings`, `/api/staff` | Booking |
| `/api/payments`, gồm Return và IPN | Payment |
| `/api/catalog` | Catalog |
| `/api/care` | Care |

Các endpoint `/internal/*` dùng mạng Docker. Compose hiện sử dụng danh mục Booking mẫu cho demo.

Xem [hướng dẫn Postman và Maven](Backend/payment-service/run_tutorial.md) để lấy body, header và kết quả mong đợi từ đăng nhập đến tạo booking, thanh toán và kiểm tra đồng bộ.

Xem log hoặc dừng stack:

```powershell
docker compose logs --tail 100 auth-service payment-service booking-service
docker compose down
```

`docker compose down` giữ dữ liệu trong các volume.

Hướng dẫn API, đổi giá, tiếp nhận/nhật ký/bàn giao và kiểm thử: [Catalog và Care](docs/catalog-care.md).
