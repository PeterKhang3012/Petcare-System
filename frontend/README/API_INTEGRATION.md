# Danh mục API PawStay

Frontend gọi các route dưới đây qua Nginx. Các route mặc định nhận Bearer JWT, trừ nơi ghi công khai. Auth lấy vai trò hiện hành trong MongoDB. Pet, Booking và Payment kiểm tra quyền ở Backend; route khách hàng yêu cầu USER. Phản hồi Node có `success` và `data` hoặc `message`; Pet và Booking có thêm `code` khi lỗi. Payment trả DTO trực tiếp; lỗi có `status`, `error` và `message`. Tham số `page,limit` dùng ở danh sách phân trang; `:id` là ObjectId, riêng Payment dùng UUID.

| Method và route | Service, quyền | Đầu vào và đầu ra | Lỗi chính |
| --- | --- | --- | --- |
| POST `/api/auth/register` | Auth, công khai | `username,password` → `data.user` | 400, 409 tên trùng |
| POST `/api/auth/login` | Auth, công khai | `username,password` → `data.accessToken,user` | 400, 401 |
| GET `/api/auth/me` | Auth | Bearer → `data.user` | 401 |
| GET `/api/pets` | Pet, USER | `page,limit,status` → `data.pets,page,limit,total` | 400, 401, 403, 503 |
| POST `/api/pets` | Pet, USER | `name,species,weight_kg`; tùy chọn `breed,date_of_birth,care_notes` → `data.pet` | 400, 401, 403 |
| GET/PATCH `/api/pets/:id` | Pet, USER sở hữu | GET đọc; PATCH trường chỉnh sửa → `data.pet` | 400, 404, 409 khi đã lưu trữ |
| POST `/api/pets/:id/archive` | Pet, USER sở hữu | Body rỗng → `data.pet` | 400, 404 |
| POST `/api/bookings/quotes` | Booking, USER | `pet_id,service_id,start_at` hoặc `pet_id,service_id,check_in_date,check_out_date` → `data.quote` | 400, 404, 409, 503 |
| GET `/api/bookings/availability` | Booking, USER | Cùng đầu vào báo giá qua query → `data.available` | 400, 404, 409, 503 |
| POST `/api/bookings` | Booking, USER | Đầu vào báo giá + `expected_price_version` + `Idempotency-Key` → `data.booking` | 400, 404, 409, 503 |
| GET `/api/bookings` | Booking, USER | `page,limit,status,pet_id` → `data.bookings` và phân trang | 400, 401, 403 |
| GET `/api/bookings/:id` | Booking, USER sở hữu | `:id` → `data.booking` | 400, 404 |
| GET `/api/bookings/:id/history` | Booking, USER sở hữu | `page,limit` → `data.history` và phân trang | 400, 404 |
| POST `/api/bookings/:id/cancel` | Booking, USER sở hữu | `reason`, `Idempotency-Key` → booking và `refund_request` nếu có | 400, 404, 409 |
| GET `/api/staff/bookings` và `/api/staff/bookings/:id` | Booking, STAFF | Danh sách nhận `from,to,page,limit`; chi tiết nhận ID → `data.bookings` hoặc `data.booking` | 400, 401, 403, 404 |
| GET `/api/staff/resources` | Booking, STAFF | `group,state,page,limit` → `data.resources` | 400, 403 |
| GET `/api/staff/resources/:id/history` và `/maintenance` | Booking, STAFF | `page,limit` → `data.history` hoặc `data.maintenance` | 400, 403, 404 |
| POST `/api/staff/resources/:id/cleaning-complete` | Booking, STAFF | `reason` → `data.resource` | 400, 403, 404, 409 |
| POST `/api/staff/resources/:id/maintenance` | Booking, STAFF | `reason,start_at,end_at` → `data.maintenance` | 400, 403, 404, 409 |
| POST `/api/staff/resources/:id/maintenance/:maintenanceId/cancel` | Booking, STAFF | `reason` → `data.maintenance` | 400, 403, 404, 409 |
| POST `/api/payments` | Payment, USER sở hữu booking | `booking_id`, `Idempotency-Key` → DTO Payment và URL nếu còn hiệu lực | 400, 401, 403, 404, 409, 503 |
| GET `/api/payments/:paymentId` | Payment, USER sở hữu | UUID → DTO gồm trạng thái Payment và Outbox nếu có | 400, 401, 403, 404, 503 |
| GET `/api/payments/vnpay/return` | Payment, công khai | Trình duyệt VNPay quay lại; 303 nếu cấu hình hợp lệ, nếu không thì JSON 200 | Lỗi proxy khi Payment gián đoạn |
| GET `/api/payments/vnpay/ipn` | Payment, chữ ký VNPay | Query `vnp_*` → `RspCode,Message` | HTTP 200 với mã nghiệp vụ khi sai chữ ký, số tiền, tham chiếu, trùng hay cần retry |
| GET `/healthz` | Nginx | 200 và nội dung `ok` | Chỉ kiểm tra tiến trình gateway |

Các route business trong bảng đã có giao diện. Return và IPN do Payment xử lý. Các route nội bộ đi qua mạng Docker với token theo hướng gọi:

| Method và route | Bên gọi → đích | Hợp đồng |
| --- | --- | --- |
| GET `/internal/pets/:id/booking-context` | Booking → Pet | `owner_id` qua query, trả `data.pet` đang ACTIVE; 400/403/404 khi sai |
| GET `/internal/bookings/:id/payment-context` | Payment → Booking | Trả `data.booking` chứa số tiền, chủ sở hữu và thời hạn; 403/404/409 |
| POST `/internal/bookings/payment-events` | Payment → Booking | `event_id,booking_id,payment_id,amount,currency,result` → biên nhận `accepted,outcome,retryable` |
| POST `/internal/bookings/check-in` và `/check-out` | Care → Booking | `request_id,booking_id,actor_id,reason` → kết quả nghiệp vụ; 400/403/404/409 |
| GET `/internal/care/requests/:requestId` | Care → Booking | Trả `data.request_id,result`; 403/404 |
| GET `/live`, `/ready` | Nội bộ Pet và Booking | Trạng thái sống và khả năng phục vụ; readiness có thể trả 503 |

Nguồn chi tiết: [Pet OpenAPI](../../Backend/pet-service/openapi.json), [Booking OpenAPI](../../Backend/booking-service/openapi.json), [Auth routes](../../Backend/auth-service/src/routes/auth.routes.js) và [Payment controllers](../../Backend/payment-service/src/main/java/com/pawstay/payment/controller/). Chưa có API danh mục công khai, tra cứu danh sách Payment theo tài khoản, đổi thông tin tài khoản, CRUD tài khoản STAFF hoặc API khách thao tác check-in/out.
