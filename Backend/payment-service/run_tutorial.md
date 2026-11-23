# Kiểm thử PawStay Payment bằng Postman

## 1. Khởi động

Nếu dùng Docker Compose, làm theo [README gốc](../../README.md) và đặt cả bốn biến URL của Postman thành `http://localhost:8080` hoặc URL gateway đã cấu hình. Các bước dưới đây dùng khi chạy từng service trực tiếp.

- Chạy MongoDB dành cho Auth/Pet và replica set ghi được cho Booking. Tạo schema MySQL 8.4 riêng `payment_db`.
- Mở terminal riêng tại từng thư mục service. Chạy `npm start` cho Auth và Pet. Tại Booking, chạy `npm run seed` rồi `npm start`. Nếu chưa có dependencies, cài bằng `npm ci` trước.
- Khi chưa có Catalog, cấu hình rõ `CATALOG_MODE=fixture` trong Booking local để dùng dịch vụ mẫu `bath` hoặc `boarding`. Fixture chỉ phục vụ demo.
- Trong Payment, kiểm tra `PAYMENT_DB_*`, `AUTH_SERVICE_URL`, `BOOKING_SERVICE_URL`, `JWT_ISSUER` và `JWT_PUBLIC_KEY_PATH`. Khi chạy từ thư mục Payment, khóa công khai của Auth có thể đặt là `../auth-service/keys/public.pem`. Đồng bộ `PAYMENT_TO_BOOKING_TOKEN` với Booking. Chạy `mvn spring-boot:run` từ thư mục Payment Service.
- Với cổng mặc định, đặt `VNPAY_RETURN_URL=http://localhost:8084/api/payments/vnpay/return`. Có thể để trống `PAYMENT_FRONTEND_RETURN_URL`. Để chạy sandbox thật, điền mã merchant và hash secret rồi đăng ký IPN HTTPS công khai trỏ tới `/api/payments/vnpay/ipn` trên VNPAY Sandbox. Localhost dùng được cho trình duyệt Return trong demo local. Máy chủ VNPAY cần truy cập IPN qua mạng.

## 2. Biến môi trường Postman

| Biến | Giá trị local mặc định hoặc cách lấy |
| --- | --- |
| `auth_url` | `http://localhost:3001` |
| `pet_url` | `http://localhost:3002` |
| `booking_url` | `http://localhost:3003` |
| `payment_url` | `http://localhost:8084` |
| `username`, `password` | Tài khoản khách dùng riêng cho demo |
| `access_token` | `data.accessToken` từ Login |
| `pet_id` | `data.pet.id` từ Create Pet |
| `start_at` | Giờ tương lai trong giờ mở cửa, dạng `YYYY-MM-DDT09:00:00+07:00` |
| `price_version_id` | `data.quote.price_version_id` từ Quote |
| `booking_id` | `data.booking.id` từ Create Booking |
| `payment_id` | `payment_id` từ Create Payment |

Giữ mật khẩu và token trong biến cục bộ hoặc Postman Vault. Cập nhật các cổng nếu môi trường của bạn khác mặc định.

## 3. Gửi request theo thứ tự

Trong Postman, với các request POST bên dưới, chọn **Body → raw → JSON** và đặt `Content-Type: application/json`. Các bước từ tạo thú cưng trở đi dùng header `Authorization: Bearer {{access_token}}`, trừ hai callback VNPAY.

| Bước | Method và URL | Header thêm | Body | Kết quả |
| --- | --- | --- | --- | --- |
| Đăng ký nếu cần | `POST {{auth_url}}/api/auth/register` |  | `{"username":"{{username}}","password":"{{password}}"}` | 201 |
| Đăng nhập | `POST {{auth_url}}/api/auth/login` |  | `{"username":"{{username}}","password":"{{password}}"}` | 200, lưu `data.accessToken` |
| Tạo Pet | `POST {{pet_url}}/api/pets` | Bearer | `{"name":"Mimi","species":"CAT","weight_kg":3.5}` | 201, lưu `data.pet.id` |
| Báo giá | `POST {{booking_url}}/api/bookings/quotes` | Bearer | `{"pet_id":"{{pet_id}}","service_id":"bath","start_at":"{{start_at}}"}` | 200, lưu `data.quote.price_version_id` |
| Tạo booking | `POST {{booking_url}}/api/bookings` | Bearer, `Idempotency-Key: booking-demo-001` | `{"pet_id":"{{pet_id}}","service_id":"bath","start_at":"{{start_at}}","expected_price_version":"{{price_version_id}}"}` | 201, lưu `data.booking.id`, trạng thái `PENDING_PAYMENT` |
| Tạo Payment | `POST {{payment_url}}/api/payments` | Bearer, `Idempotency-Key: payment-demo-001` | `{"booking_id":"{{booking_id}}"}` | 201, lưu `payment_id` và mở URL từ trường `payment_url` trong trình duyệt |
| Xem Payment | `GET {{payment_url}}/api/payments/{{payment_id}}` | Bearer |  | 200, kiểm tra `status` và `booking_sync_status` nếu đã có Outbox |
| Xem Booking | `GET {{booking_url}}/api/bookings/{{booking_id}}` | Bearer |  | 200, kiểm tra `data.booking.status` |

Dùng khóa mới khi tạo booking hoặc lần thanh toán mới. Gửi lại đúng request tạo Payment với cùng khóa để kiểm tra HTTP 200 và cùng `payment_id`. Gửi trường `amount` trong body để kiểm tra 400. Bỏ Bearer trên GET Payment để kiểm tra 401. Dùng token của chủ khác để kiểm tra 404 khi xem Payment.

### Callback và worker

| Kiểm tra | Input và header | Kết quả mong đợi |
| --- | --- | --- |
| Return độc lập | `GET {{payment_url}}/api/payments/vnpay/return`, No Auth, không body | JSON 200 nếu chưa có frontend, trạng thái Payment giữ nguyên |
| IPN sai chữ ký | `GET {{payment_url}}/api/payments/vnpay/ipn?vnp_TxnRef=invalid&vnp_SecureHash=invalid`, No Auth, không body | HTTP 200 với `RspCode: "97"`, dữ liệu giữ nguyên |
| Thanh toán Sandbox thật | Hoàn thành giao dịch trên trình duyệt khi hold còn hạn. VNPAY gửi query đã ký đến IPN. | Payment `SUCCEEDED`, sau đó `booking_sync_status: "DELIVERED"` và Booking `CONFIRMED` |
| Khôi phục khi Booking gián đoạn | Trên môi trường demo, tạo Payment trước, dừng Booking rồi hoàn tất thanh toán sandbox hoặc để bộ test tự động mô phỏng HTTP 503. Chạy lại Booking trước khi hết hold. | Payment vẫn `SUCCEEDED`, đồng bộ từ `PENDING` sang `DELIVERED`. Nếu Booking nhận sau khi hold hết hạn, đồng bộ `REJECTED` với `BOOKING_EXPIRED` |

Worker tự gửi JSON có `event_id`, `booking_id`, `payment_id`, `amount`, `currency`, `result` tới `POST /internal/bookings/payment-events`, với `Content-Type: application/json`, `X-Service-Token` và `X-Correlation-ID`. Khi kiểm tra hợp đồng ở local, có thể gọi **GET** `{{booking_url}}/internal/bookings/{{booking_id}}/payment-context` bằng `X-Service-Token: {{payment_to_booking_token}}` để đọc snapshot hold. Chạy luồng thanh toán qua IPN/worker để xác minh đồng bộ.

## 4. Test Maven

Trong thư mục Payment Service, chạy `mvn verify` cho bộ mặc định. Để chạy thêm test HTTP/MySQL, dùng schema MySQL riêng và có thể xóa sau khi test. Ví dụ PowerShell:

```powershell
$env:PAYMENT_DB_URL = 'jdbc:mysql://127.0.0.1:3306/payment_db_test'
$env:PAYMENT_DB_USERNAME = '<test-user>'
$env:PAYMENT_DB_PASSWORD = '<test-password>'
$env:PAYMENT_MYSQL_TEST = 'true'
mvn verify
```

Các test tích hợp chạy Flyway và dùng callback ký bằng khóa test cùng HTTP fixture cho Booking. Chạy một giao dịch sandbox riêng để xác nhận toàn bộ đường đi qua VNPAY và Booking thật.
