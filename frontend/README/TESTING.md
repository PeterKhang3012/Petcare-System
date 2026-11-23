# Kiểm thử

Chạy `npm run build` trong frontend, `npm test` trong Auth, Pet và Booking, và `mvn test` trong Payment. Kiểm thử HTTP/MySQL từ Maven yêu cầu schema riêng theo [hướng dẫn Payment](../../Backend/payment-service/run_tutorial.md).

Chạy suite giao diện trên stack và database riêng. Các bài test có tạo user, pet, booking, payment và có thể dừng container. Dùng Compose project riêng, một gateway port khác và Vite proxy trỏ đến port đó. Sau khi Playwright sẵn sàng:

Từ thư mục gốc, đảm bảo đã build ảnh của Compose chính, rồi khởi động project kiểm thử:

```powershell
$env:GATEWAY_HOST_PORT = '18080'
$env:PAWSTAY_TEST_VNPAY_SECRET = [guid]::NewGuid().ToString('N')
$env:PAWSTAY_TEST_PROJECT = 'pawstay-frontend-check'
$env:PAWSTAY_TEST_OVERRIDE = (Resolve-Path frontend/tests/compose.integration.yml).Path
docker compose -p $env:PAWSTAY_TEST_PROJECT -f docker-compose.yml -f $env:PAWSTAY_TEST_OVERRIDE up -d --no-build --wait
```

Giữ các biến test trong terminal chạy suite. Mở terminal riêng và chạy `$env:PAWSTAY_GATEWAY_TARGET = 'http://127.0.0.1:18080'`, rồi chạy `npm run dev -- --port 15173` ở `frontend/`. Trong terminal test, vào `frontend/` và chạy:

```powershell
$env:PAWSTAY_TEST_URL = 'http://127.0.0.1:15173'
$env:PAWSTAY_BROWSER_CHANNEL = 'chrome'
npm run test:integration
```

Để chạy nhánh STAFF, truyền `PAWSTAY_TEST_STAFF_USERNAME` và `PAWSTAY_TEST_STAFF_PASSWORD` của tài khoản seed trên stack test. Để chạy nhánh IPN nội bộ, truyền `PAWSTAY_TEST_VNPAY_SECRET` và `PAWSTAY_TEST_VNPAY_TMN` tương ứng với khóa test riêng. Để kiểm tra dừng và khởi động lại container, đặt `PAWSTAY_TEST_PROJECT` có hậu tố `-check`, `PAWSTAY_TEST_OVERRIDE` trỏ tới Compose override riêng chứa cài đặt test, cùng `GATEWAY_HOST_PORT` của stack đó. Suite không gọi hệ thống VNPay.

Khi kiểm tra thủ công, mở trang protected khi chưa đăng nhập, tạo và sửa pet, thử đặt lịch, xem lịch sử, hủy lịch có lý do và kiểm tra trạng thái sau khi tải lại. Với STAFF, thử lọc lịch và tài nguyên, tạo/hủy bảo trì, kiểm tra lịch sử. Với Payment, thử URL Return và tra cứu Payment để phân biệt trạng thái IPN với trạng thái đồng bộ Booking.
