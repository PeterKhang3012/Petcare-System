# PawStay Booking Service

Backend Node.js/Express/CommonJS/Mongoose, sở hữu duy nhất `booking_db`. Quản lý resource, maintenance, booking, allocation, snapshot giá/Pet, lịch sử, idempotency receipt và Outbox đề nghị hoàn tiền. Không triển khai Catalog, Payment, Care, VNPAY, bảng giá, nhật ký chăm sóc hay frontend.

## Chạy độc lập

Cần Node.js >=22.19, **MongoDB replica set writable**, Pet và Auth. Dùng tài khoản `readWrite` chỉ trên `booking_db`. Startup và `/ready` từ chối standalone, không bỏ transaction để chạy tiếp. [Compose demo riêng](../../infra/pet-booking/README.md) không tác động MongoDB/Auth hiện tại.

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Cấu hình .env theo môi trường trước khi chạy.
npm run seed
npm start
# Worker riêng, nếu cần scale; API cũng chạy worker mặc định:
npm run worker
```

Seed chỉ `$setOnInsert` theo `code` unique: CARE-01, CARE-02, STAY-DOG-01, STAY-CAT-01. Chạy lại giữ nguyên mọi trạng thái, phân bổ, giá, lịch sử và tài khoản. Không tạo STAFF hoặc quyền. Nhiều worker được phép chạy đồng thời.

| Biến | Mặc định / yêu cầu |
|---|---|
| `MONGODB_URI` | Bắt buộc chọn `booking_db`, có replicaSet và tài khoản riêng |
| `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER`, `AUTH_BASE_URL` | Public key/issuer/URL của Auth hiện có; không private key |
| `PET_BASE_URL` | Bắt buộc, URL Pet |
| `BOOKING_TO_PET_TOKEN` | Outbound Booking -> Pet, cùng giá trị ở Pet |
| `PAYMENT_TO_BOOKING_TOKEN` | Inbound chỉ Payment, khác token Care |
| `CARE_TO_BOOKING_TOKEN` | Inbound chỉ Care |
| `CATALOG_MODE` | `http`; `fixture` chỉ khi bật rõ ràng, cấm trong NODE_ENV=production |
| `CATALOG_BASE_URL`, `BOOKING_TO_CATALOG_TOKEN` | HTTP Catalog; chưa có URL thì quote/create trả 503 |
| `PAYMENT_BASE_URL`, `BOOKING_TO_PAYMENT_TOKEN` | HTTP gửi đề nghị hoàn tiền; thiếu URL thì giữ Outbox chờ |
| `PORT`, `HTTP_TIMEOUT_MS` | 3003 / 3000 ms; timeout hợp lệ 100–30000 |
| `WORKER_ENABLED`, `WORKER_INTERVAL_MS` | true / 5000 ms; false để chạy worker riêng |

Credentials mỗi hướng gọi phải khác nhau, >=32 ký tự ngẫu nhiên; không có secret mặc định. Các API người dùng xác minh JWT RS256/issuer/thời hạn, gọi Auth `/api/auth/me` lấy quyền hiện tại, khớp ID với `sub`, fail closed 401/503. Không tin owner, role hoặc actor từ frontend. `UPDATE_SERVICE_PRICE` không mở bất kỳ API sửa giá booking nào.

## Cấu hình thời gian demo

| Biến | Mặc định demo | Validation |
|---|---|---|
| `OPEN_TIME` / `CLOSE_TIME` | 08:00 / 18:00 | HH:mm, mở < đóng, trong cùng ngày |
| `BOARDING_CHECK_IN_TIME` / `BOARDING_CHECK_OUT_TIME` | 14:00 / 12:00 | Trong giờ hoạt động |
| `PREPARATION_MINUTES` | 15 | 0–240 |
| `CLEANING_MINUTES` | 30 | 1–240 |
| `CHECK_IN_EARLY_MINUTES` | 60 | 0–1440 |
| `CHECK_IN_LATE_MINUTES` | 120 | 0–1440; vẫn phải trước end_at |

Ngày/giờ cơ sở dùng `Asia/Ho_Chi_Minh` (UTC+07:00). Timestamps lưu UTC. Chăm sóc lấy duration từ Catalog, phải nằm trọn trong giờ mở cửa, kể cả giây/millisecond. Chuẩn bị/vệ sinh có thể nằm ngoài giờ mở. Lưu trú lấy ngày địa phương, tối thiểu 1, tối đa demo 365 đêm; thời điểm bắt đầu phải ở tương lai và tối đa 366 ngày trước. Client không quyết định end_at, duration, amount hoặc status.

Khoảng phân bổ là `[start,end)`. Chăm sóc có chín khung 60 phút trong hai khoảng 08:00–12:00 và 13:00–18:00 (GMT+7). Mỗi khung gồm chuẩn bị và vệ sinh. Lưu trú vẫn phân bổ từ `start_at - preparation` đến `end_at + cleaning`. Cùng một thú cưng không thể có các booking còn hiệu lực chồng khoảng phục vụ.

## API

Đặc tả đầy đủ: [openapi.json](openapi.json). Contract liên service: [pet-booking-integration.md](../../docs/pet-booking-integration.md).

| Method/path | Quyền | Nghiệp vụ |
|---|---|---|
| `POST /api/bookings/quotes` | USER | Pet context + báo giá; không giữ chỗ |
| `GET /api/bookings/availability` | USER | Dùng `date`, `pet_id` và `service_id` để xem số chỗ và trạng thái theo khung chăm sóc. Query theo thời gian như quote vẫn trả danh sách tài nguyên phù hợp. |
| `POST /api/bookings` | USER | Bắt buộc Idempotency-Key; tạo hold 15 phút |
| `GET /api/bookings` | USER | Chỉ của mình; filter status/pet_id, page/limit |
| `GET /api/bookings/:id` | USER/chủ | Booking và snapshot |
| `GET /api/bookings/:id/history` | USER/chủ | Lịch sử phân trang |
| `POST /api/bookings/:id/cancel` | USER/chủ | Idempotency-Key và reason |
| `GET /api/staff/bookings` | STAFF | Lịch, from/to, mặc định 7 ngày, tối đa 31 ngày |
| `GET /api/staff/bookings/:id` | STAFF | Snapshot phục vụ lượt đó |
| `GET /api/staff/resources` | STAFF | page/limit, group/state |
| `POST /api/staff/resources/:id/cleaning-complete` | STAFF | CLEANING -> READY, reason bắt buộc |
| `POST /api/staff/resources/:id/maintenance` | STAFF | start_at/end_at/reason; xung đột trả 409 |
| `POST /api/staff/resources/:id/maintenance/:maintenanceId/cancel` | STAFF | Hủy khoảng tạm ngừng, reason |
| `GET /api/staff/resources/:id/maintenance` | STAFF | Khoảng tạm ngừng, phân trang |
| `GET /api/staff/resources/:id/history` | STAFF | Audit vận hành, phân trang |
| `GET /internal/bookings/:id/payment-context` | Payment | Số tiền snapshot của hold còn hạn |
| `POST /internal/bookings/payment-events` | Payment | Receipt + xét kết quả nguyên tử |
| `POST /internal/bookings/check-in` | Care | Chuyển trạng thái và chiếm resource nguyên tử |
| `POST /internal/bookings/check-out` | Care | Hoàn tất và resource CLEANING nguyên tử |
| `GET /internal/care/requests/:requestId` | Care | Tra cứu receipt sau timeout |
| `GET /health`, `GET /ready` | Công khai | Liveness / DB replica-set readiness |

Mọi danh sách `limit` 1–100, `page` 1–10000. Body lạ/trường hệ thống bị từ chối; ID sai 400; tài nguyên khách khác 404. Response thành công `{success:true,data}`; lỗi `{success:false,code,message,details?}`. Có `X-Correlation-ID`, không log URL/body/credential. Không có PATCH status, API STAFF tạo hộ khách hoặc override chính sách.

Ví dụ quote chăm sóc:

```json
{"pet_id":"<ObjectId của Pet>","service_id":"bath","start_at":"2030-01-02T09:00:00+07:00"}
```

Ví dụ lưu trú (thay ngày phù hợp thời điểm chạy):

```json
{"pet_id":"<ObjectId của Pet>","service_id":"boarding","check_in_date":"2030-01-02","check_out_date":"2030-01-04"}
```

Tạo booking dùng cùng body với `expected_price_version` từ `data.quote.price_version_id` và header `Idempotency-Key`. Quote/availability không có trường expected version. Trong fixture hiện tại: `bath-v1`/150000 VND/lần/60 phút; `boarding-v1`/200000 VND/đêm. Đây là dữ liệu demo chỉ đọc, không phải tích hợp Catalog thật. Không có fallback tự động từ HTTP sang fixture.

409 `PRICE_CHANGED` chứa báo giá mới tại `details.quote`, chưa tạo hold/allocation. Khách phải xác nhận phiên bản mới bằng request tạo mới. Booking chốt giá từ lần gọi Catalog trước transaction; không có transaction xuyên database. Replay cùng key/cùng payload trả booking đã tạo, không gọi Pet/Catalog lại, không tăng thời hạn. Khác payload trả `IDEMPOTENCY_CONFLICT`.

## Trạng thái, thanh toán và hủy

`PENDING_PAYMENT -> CONFIRMED -> CHECKED_IN -> COMPLETED`; `PENDING_PAYMENT -> CANCELLED/EXPIRED`; `CONFIRMED -> CANCELLED` khi còn >=24 giờ. Hold đúng 15 phút từ thời gian tạo phía server. Kiểm tra expiry ngay lúc Payment/hủy/đọc xử lý, không chờ worker. Allocation của hold quá hạn được bỏ qua khi xét khả dụng ngay cả trước khi worker dọn trạng thái.

Payment không được dùng timestamp tự gửi để vượt expiry. Xét amount/currency đúng snapshot, receipt `event_id` và payment ID unique. Khoản khác/FAILED/PENDING không ghi đè success. Sự kiện đến muộn hoặc booking đã hủy/hết hạn nhận kết quả ngoại lệ, không khôi phục booking. Chi tiết outcome và retry tại contract.

Hủy confirmed ghi Outbox `REFUND_REQUESTED` trong cùng transaction với trạng thái/allocation/history. Worker gửi adapter Payment theo `event_id`, lease bền vững 60 giây, backoff tối đa 1 giờ, retry khi restart. Không có Payment URL thì giữ PENDING, không mất sự kiện. DELIVERED nghĩa là Payment đã nhận yêu cầu, **không phải đã hoàn tiền**. Không có bảng giao dịch hay trạng thái hoàn tiền thay Payment.

Care phải kiểm tra STAFF trước khi xác nhận `actor_id`. Booking tự quyết định trạng thái. Check-in cần resource READY, không occupancy khác, không maintenance hay buffer xung đột; nếu sớm trong cửa sổ thì mở rộng allocation bắt đầu sau khi kiểm tra xung đột. Check-out chuyển CLEANING, giữ allocation ít nhất đến end_at + buffer; checkout muộn mở rộng tới now + buffer. Nếu phần mở rộng xung đột booking/maintenance tương lai, trả 409 để xử lý vận hành trước khi gửi request_id mới; không sửa lịch của khách khác. Care giữ phiếu/nhật ký ở database riêng, không ghi vào Booking.

Maintenance có audit actor/time/reason. Worker đồng bộ READY/CLEANING -> OUT_OF_SERVICE khi khoảng tạm ngừng bắt đầu; kết thúc -> CLEANING, cần nhân viên xác nhận vệ sinh. OCCUPIED không bị worker ghi đè. Tình trạng thực tế không cấm mọi booking tương lai: xét allocation + maintenance tại thời gian được yêu cầu.

## Chống trùng và phục hồi

Chi tiết tại [hợp đồng và thiết kế](../../docs/pet-booking-integration.md#chống-đặt-trùng). Mọi writer lịch lấy **pet-schedule guard trước, rồi resource records theo ID tăng dần** (thao tác chỉ resource không lấy Pet). Ghi tăng version tạo write conflict thật ở MongoDB. Tạo booking khóa các resource tương thích để chọn một chỗ sau khi đọc lại allocation trong snapshot transaction. Đây là đánh đổi đơn giản, phù hợp một cơ sở; thông lượng thấp hơn thiết kế khóa một ứng viên/lần.

Transaction chỉ `booking_db`, readConcern snapshot/writeConcern majority. Retry transient/write-conflict/duplicate-key race tối đa 7 lần, đọc lại ở transaction mới. Commit không rõ kết quả chỉ retry chính commit tối đa 5 lần, sau đó 503 và yêu cầu dùng lại key. Không HTTP trong callback retry, không Promise.all trong transaction, không mutex process, không TTL xóa booking/history. Index unique đảm bảo resource code, processed scope/key, payment ID, allocation booking ID và Outbox event ID.

Expiry worker đọc hold quá hạn từ DB theo batch, từng booking qua cùng guard/transaction. API và nhiều worker có thể cùng xử lý mà chỉ ghi một chuyển trạng thái. Idempotency receipt được giữ bền vững; hiện chưa có chính sách lưu trữ dài hạn/purge tự động.

## Kiểm thử và vận hành

```powershell
npm test
npm run test:integration
# Từ root, chuẩn bị dependency Auth theo hướng dẫn hạ tầng rồi:
node scripts/smoke-pet-booking.js
node scripts/check-pet-booking-contracts.js
```

Integration dùng replica set MongoDB thật có auth, account per database và ít nhất hai **process** Booking. Auth/Catalog/Payment doubles chỉ nằm trong test harness. Clock cố định chỉ được inject ở IPC test host, không có test API/biến đổi giờ trong server production. Smoke dùng Auth thật/dữ liệu riêng, real clock, Catalog fixture và Payment/Care client mô phỏng. Không dùng mock DB để kết luận concurrency.

SIGTERM/SIGINT dừng nhận request, chờ request/worker đang chạy rồi đóng DB. `/ready` xác nhận replica set/database, không bảo đảm upstream hoạt động; từng request vẫn fail closed nếu upstream lỗi. Cấu hình demo chưa bao gồm TLS/service discovery nhiều máy, distributed clock synchronization hay triển khai production. Catalog/Payment/Care thực tế cần tuân contract trước khi tích hợp.
