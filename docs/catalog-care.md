# Catalog và Care

Hai backend Node.js/Express/CommonJS/Mongoose, dùng `catalog_db` và `care_db`. Transaction yêu cầu MongoDB replica set. Compose tận dụng `booking-mongodb` hiện có.

## Chạy

Từ root của repo nhánh develop:

```powershell
npm ci --prefix Backend/catalog-service
npm ci --prefix Backend/care-service
```

Điền phần `LOCAL_CATALOG_*`, `LOCAL_CARE_*` và các biến dùng chung trong `.env` gốc trước khi chạy:

| Biến | Catalog | Care |
|---|---|---|
| PORT | 3004 | 3006 |
| MONGODB_URI | URI replica set chọn đúng catalog_db | URI replica set chọn đúng care_db |
| AUTH_BASE_URL | URL Auth hiện có | Như Catalog |
| JWT_PUBLIC_KEY_PATH / JWT_ISSUER | Public key RSA và issuer của Auth | Như Catalog; không private key |
| BOOKING_TO_CATALOG_TOKEN | Secret 32+ ký tự, khớp Booking; khác các credential khác | Không dùng |
| BOOKING_BASE_URL / CARE_TO_BOOKING_TOKEN | Không dùng | URL Booking / credential Care hiện có |
| HTTP_TIMEOUT_MS | 3000, hợp lệ 100–10000 | Như Catalog |
| WORKER_ENABLED / WORKER_INTERVAL_MS | Không dùng | true / 5000, có thể chạy nhiều instance |

```powershell
node scripts/run-local.cjs catalog seed
node scripts/run-local.cjs catalog
# Terminal khác:
node scripts/run-local.cjs care
```

Hoặc điền BOOKING_TO_CATALOG_TOKEN vào `.env` gốc rồi dùng Compose hiện có: `docker compose up -d --build --wait`. Catalog tự seed idempotent trước khi khởi động; Care chạy worker cùng server. Thêm CATALOG_HOST_PORT/CARE_HOST_PORT nếu cần đổi cổng host. Chỉ ba biến Catalog của Booking được đổi sang HTTP; build/command/port/volume của các service cũ được giữ nguyên. Xem [README gốc](../README.md) để chuẩn bị public key và cấu hình stack.

Mỗi service chỉ truy cập database của mình; trao đổi qua HTTP. API nghiệp vụ verify JWT RS256/issuer/iat/exp và gọi `/api/auth/me` lấy `data.user` hiện tại, khớp ID với sub. Auth từ chối ->401, thiếu quyền ->403, lỗi/timeout/response sai ->503. Không tin owner/actor/role/permissions từ client. Các service có `/health`, `/ready`, correlation ID và graceful shutdown; không log token, body hoặc secret.

## Catalog

API `/api/catalog` cần Bearer JWT. Service/price version ID là chuỗi, không ObjectId. Danh sách page 1–10000, limit 1–100.

| API | Quyền / dữ liệu |
|---|---|
| GET `/api/catalog/services` | USER/STAFF; page, limit, type, species |
| GET `/api/catalog/services/:service_id` | USER/STAFF; thông tin dịch vụ và giá hiện hành |
| GET `/api/catalog/services/:service_id/price-history` | STAFF; lịch sử phân trang |
| PATCH `/api/catalog/services/:service_id/price` | STAFF có UPDATE_SERVICE_PRICE hiện tại |
| POST `/internal/catalog/quotes` | X-Service-Token BOOKING_TO_CATALOG_TOKEN; response data.quote đúng Booking adapter |

Đổi giá: `{"unit_price":170000,"reason":"Điều chỉnh chi phí","expected_price_version":"bath-v1"}`. Giá nguyên VND >0, safe integer, không ép kiểu; reason trim 1–500 ký tự. Transaction tạo phiên bản/audit bất biến và CAS con trỏ hiện hành. Cùng expected version chỉ một cập nhật thành công, bên thua 409 PRICE_VERSION_CONFLICT. Lịch sử giữ giá trước/sau, phiên bản trước, actor Auth, thời gian server và lý do; không có API sửa/xóa lịch sử.

Quote: `{"service_id":"bath","species":"CAT","weight_kg":3}`. Trả `service_id,name,type,price_version_id,unit_price,currency,unit,duration_minutes,allowed_species,min_weight_kg,max_weight_kg`. BOARDING: NIGHT và duration=null. Phiên bản cũ được giữ lại nên đọc con trỏ và phiên bản tương ứng không trộn giá khi có cập nhật đồng thời. Booking tiếp tục kiểm tra điều kiện, tính lịch/số đêm/tổng và cấp tài nguyên; Catalog không sửa booking/giao dịch đã có.

Seed riêng có bath (150000 VND/lần, 60 phút), boarding (200000 VND/đêm), chó/mèo 0–40 kg. Chạy lại không tạo trùng, không reset giá/version/history và không cấp quyền hay tạo tài khoản. Không có fixture runtime hoặc fallback giá cũ.

## Care

API `/api/care` cần Bearer JWT. USER chỉ đọc dữ liệu thuộc owner_id của mình; STAFF làm nghiệp vụ cơ sở. Visit dùng ObjectId riêng, booking_id unique; API không nhận owner_id, pet_id hoặc actor tự khai.

| API | Quyền |
|---|---|
| POST `/api/care/bookings/:booking_id/check-in` | STAFF |
| POST `/api/care/bookings/:booking_id/check-out` | STAFF |
| GET `/api/care/visits` | USER/chủ hoặc STAFF; page, limit, state |
| GET `/api/care/visits/:visit_id` | USER/chủ hoặc STAFF |
| GET `/api/care/requests/:request_id` | USER/chủ hoặc STAFF; trạng thái đồng bộ |
| GET `/api/care/visits/:visit_id/logs` | USER/chủ hoặc STAFF; phân trang |
| POST `/api/care/visits/:visit_id/logs` | STAFF, lượt đang phục vụ và không chờ bàn giao |
| PATCH `/api/care/visits/:visit_id/logs/:log_id` | STAFF, expected_version và reason bắt buộc |

Tiếp nhận:

```json
{"request_id":"arrival-001","initial_condition":"Tỉnh táo","care_instructions":"Ăn thức ăn riêng","belongings":["Vòng cổ"],"reason":"Đã kiểm tra tiếp nhận"}
```

Bàn giao:

```json
{"request_id":"departure-001","recipient_name":"Chủ đã xác minh","returned_belongings":["Vòng cổ"],"notes":"Đã trả đủ đồ","reason":"Đã xác nhận bàn giao"}
```

Text tình trạng/hướng dẫn/notes tối đa 2000 ký tự, người nhận 100; tối đa 20 món, mỗi món 100; reason bắt buộc 1–500. Request ID 1–128 ký tự `[A-Za-z0-9._:-]`. Danh sách page 1–10000, limit 1–100; ID sai 400, ngoài sở hữu 404.

Care lấy `data.booking` qua API STAFF Booking bằng token hiện tại để chốt owner/Pet/snapshot. Commit phiếu chờ + request/payload/fingerprint trước khi gọi Booking. Chỉ gửi `{request_id,booking_id,actor_id,reason}` với credential Care đến API check-in/out. Không lưu Bearer token. Care chỉ hoàn tất khi Booking chấp nhận; Booking vẫn quyết định CHECKED_IN/COMPLETED và OCCUPIED/CLEANING.

Care state PENDING -> IN_CARE -> COMPLETED; sync state PENDING/SYNCED/REJECTED tách riêng. HTTP 201 thành công, replay 200; 202 chờ đồng bộ có request_id. Cùng ID khác nội dung/actor trả 409 IDEMPOTENCY_CONFLICT. Snapshot không đổi theo Pet về sau. Không sửa tài nguyên READY hay trạng thái thanh toán.

Worker claim lease trong DB, backoff 1 giây–5 phút, lease `3*HTTP_TIMEOUT_MS+1000` ms và token riêng mỗi claim. Restart/nhiều instance dùng đúng payload/ID đã lưu. Worker đọc receipt rồi replay payload cũ để Booking kiểm tra fingerprint (lookup hiện không trả fingerprint), không kết luận từ trạng thái Booking đơn lẻ. Timeout/5xx/response sai giữ PENDING; từ chối chắc chắn 400/401/403/404/409/422 lưu REJECTED và dừng retry. Giải quyết nguyên nhân rồi dùng ID mới; không đảo ngược Booking. API trạng thái không lộ lease, fingerprint hay payload nội bộ.

Nhật ký: `{"request_id":"log-001","activity":"FEED","notes":"Đã ăn"}`. Activity BATH/FEED/CLEAN/REST/OBSERVE/PREPARE_HANDOVER, notes 1–2000 ký tự. Tạo lại cùng ID/nội dung không sinh mục trùng. Sửa: `{"expected_version":1,"notes":"Đính chính lượng ăn","reason":"Bổ sung quan sát"}`; có thể sửa activity. CAS chống ghi đè, lưu before/after, actor, thời gian, reason. STAFF có thể đính chính có audit sau hoàn tất; chỉ ghi hoạt động mới yêu cầu lượt đang phục vụ. Không xóa vật lý, không thêm bệnh án/upload.

## Đồng hồ demo Booking/Care

Booking là nguồn thời gian duy nhất. `PAWSTAY_DEMO_ENABLED` mặc định `false`, cần bật ở cả Booking và Care, cấm bật trong `NODE_ENV=production`. Xem [cách bật và trình diễn](../README.md#5-đồng-hồ-demo-cho-từng-booking).

STAFF gọi `POST /api/staff/bookings/:id/demo-clock` với `Idempotency-Key` và body chỉ chứa `{"command":"TO_APPOINTMENT"}` hoặc `{"command":"TO_HANDOVER"}`. Lệnh đầu yêu cầu `CONFIRMED` và `accepted_payment_id`; lệnh sau yêu cầu booking demo `CHECKED_IN`. Backend lấy mốc từ `start_at`/`end_at`, không nhận giờ tùy ý và không tự chuyển trạng thái. Lặp lệnh, kể cả khóa mới, giữ nguyên các anchor; transaction dùng lại guard Pet/resource. Cùng khóa khác nội dung trả `409 IDEMPOTENCY_CONFLICT`.

API chi tiết STAFF giữ `data.booking` và thêm tùy chọn `data.demo_clock` gồm `enabled,is_demo,real_now,business_now,version,stage`. Có trường này khi demo đang bật hoặc booking đã được đánh dấu demo. `booking.demo_clock` lưu anchor thật/nghiệp vụ, người kích hoạt, thời gian ghi nhận và phiên bản bền vững. Giờ nghiệp vụ bằng anchor nghiệp vụ cộng thời gian thật đã trôi qua. Khi tắt cờ, API đọc vẫn trả timeline này với `enabled=false`; thao tác mô phỏng mới trả `409 DEMO_DISABLED`. Receipt thành công trước đó vẫn có thể phục hồi khi cờ đã tắt.

Care tiếp tục dùng hai API check-in/out hiện tại. Kết quả nội bộ Booking bổ sung các mốc phục vụ cần thiết cho lượt demo; worker lưu đúng `checked_in_at`/`completed_at` từ Booking, kèm `checked_in_recorded_at`/`completed_recorded_at` là giờ thật. Khi thêm nhật ký demo, Care lấy `business_now` từ `GET /internal/bookings/:id/care-time` bằng credential `CARE_TO_BOOKING_TOKEN`, lưu `occurred_at` và `demo_clock_version`; `created_at` và lịch sử chỉnh sửa giữ thời gian audit thật. Visit chỉ lưu dấu demo/phiên bản, không tự tính một đồng hồ khác. Nhật ký cũ không có các trường này vẫn hiển thị như trước.

Hold, xác nhận Payment, hủy/hoàn tiền, `liveAllocation`, lease và backoff luôn dùng giờ thật. Chỉ cửa sổ phục vụ, mốc tiếp nhận/bàn giao và `occurred_at` của lượt demo dùng giờ nghiệp vụ. Các guard trạng thái, tài nguyên, bảo trì và xung đột vẫn được kiểm tra. Không có API điều khiển demo cho USER hoặc frontend gọi endpoint nội bộ.

## Test

Một file test/service, không phụ thuộc scripts/test-support của repository. Cần dependencies của Booking hiện có và hai service mới. Unit chạy bằng npm test; để chạy integration thật, đặt URI của replica set TEST có quyền tạo database test riêng:

```powershell
$env:TEST_MONGODB_URI = '<URI replica set test; không dùng database production>'
npm test --prefix Backend/catalog-service
npm test --prefix Backend/care-service
```

Tests dùng database `catalog_test_<random>`, `care_test_<random>`, `booking_test_<random>`, không drop/reset DB cũ. Thiếu URI: integration hiển thị skip, không tính là pass. Integration dùng Catalog/Booking thật, MongoDB thật; Auth/Pet HTTP doubles và Payment client mô phỏng qua API nội bộ đã có. Care cố ý làm mất response sau Booking commit và kiểm tra worker mới/lease hết hạn; không tuyên bố tích hợp VNPAY thật hoặc concurrency từ DB mock.
