# PawStay

PawStay là hệ thống đặt lịch chăm sóc và lưu trú thú cưng. Hướng dẫn này chạy Auth, Pet, Booking và Payment cùng database của chúng bằng Docker Compose.

## 1. Chuẩn bị

- Docker Desktop đang chạy ở chế độ Linux containers.
- Node.js 22.19 trở lên và npm nếu cần tạo khóa JWT trên máy.
- Mở PowerShell tại thư mục gốc dự án, nơi có `docker-compose.yml`.

## 2. Chuẩn bị khóa Auth

```powershell
Set-Location Backend/auth-service
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Trong `Backend/auth-service/.env`, đặt `JWT_PRIVATE_KEY_PATH=./keys/private.pem` và `JWT_PUBLIC_KEY_PATH=./keys/public.pem`. Nếu chưa có cặp khóa, chạy `npm run generate:keys`. Compose mount cả hai file cho Auth và chỉ mount khóa công khai cho các service xác minh JWT. [Cấu hình Auth](Backend/auth-service/README.md)

## 3. Chạy stack Docker Compose

Từ thư mục gốc dự án, tạo cấu hình mẫu nếu chưa có các file `.env`:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path Backend/payment-service/.env)) {
    Copy-Item Backend/payment-service/.env.example Backend/payment-service/.env
}
```

- Trong **`.env` gốc**, đặt `JWT_ISSUER` dùng chung cho Auth và các service, điền ba token nội bộ khác nhau và hai mật khẩu MySQL của Compose. Có thể chạy `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` để tạo một giá trị ngẫu nhiên. Chạy lại cho mỗi token hoặc mật khẩu cần điền.
- Trong **`Backend/payment-service/.env`**, điền mã merchant và khóa ký VNPAY Sandbox nếu cần tạo URL thanh toán. Với cổng mặc định, đặt `VNPAY_RETURN_URL=http://localhost:8084/api/payments/vnpay/return`. Khi chưa có frontend, để trống `PAYMENT_FRONTEND_RETURN_URL`. Để thử IPN thật, đăng ký endpoint `/api/payments/vnpay/ipn` qua địa chỉ HTTPS công khai mà VNPAY truy cập được.
- Compose tự cấp URL database và URL nội bộ `http://auth-service:3001`. Auth dùng MongoDB và volume riêng. Khi chạy lần đầu, tài khoản trong MongoDB Auth trên Windows cần được tạo lại hoặc di chuyển riêng. MongoDB replica set, seed tài nguyên Booking và migration MySQL của Payment chạy khi stack khởi động. Booking dùng danh mục mẫu để demo.

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
| Payment | `http://localhost:8084` | `GET /api/payments/vnpay/return` trả 200 khi chưa có frontend |

Nếu đang chạy Auth trực tiếp, dừng tiến trình đó để giải phóng cổng 3001 hoặc đặt `AUTH_HOST_PORT` khác. Nếu cổng khác bị chiếm, đổi `PET_HOST_PORT`, `BOOKING_HOST_PORT` hoặc `PAYMENT_HOST_PORT` trong `.env` gốc và cập nhật URL tương ứng trong Postman. Khi đổi cổng Payment, cập nhật cả `VNPAY_RETURN_URL`.

Xem [hướng dẫn Postman và Maven](Backend/payment-service/run_tutorial.md) để lấy body, header và kết quả mong đợi từ đăng nhập đến tạo booking, thanh toán và kiểm tra đồng bộ.

Xem log hoặc dừng stack:

```powershell
docker compose logs --tail 100 auth-service payment-service booking-service
docker compose down
```

`docker compose down` giữ dữ liệu trong các volume.
