# Hợp đồng bàn giao Pet / Booking

## Phạm vi và nguồn dữ liệu

Triển khai đúng hai service CommonJS/Express/Mongoose theo mã Auth hiện tại, dù `idea.md` dự kiến FastAPI/MySQL. Không sửa bất kỳ file Auth, không thêm Admin, refresh/logout, Catalog, Payment, Care, VNPAY, frontend hay Word. Không tìm thấy bản Word trong workspace khi khảo sát; yêu cầu đính kèm và `docs/idea.md` là căn cứ triển khai.

| Nguồn | Dữ liệu quyết định |
|---|---|
| Auth hiện có | Account, USER/STAFF, permissions hiện tại |
| Pet / `pet_db` | Hồ sơ, owner_id, status ACTIVE/ARCHIVED, version |
| Catalog bên ngoài | Danh mục, điều kiện, duration, phiên bản/đơn giá |
| Booking / `booking_db` | Booking, resource, allocation, trạng thái, snapshot tổng tiền |
| Payment bên ngoài | Giao dịch đã xác minh, đối chiếu và hoàn tiền |
| Care bên ngoài | Phiếu, nhật ký, bàn giao và yêu cầu chuyển trạng thái |

Mỗi ứng dụng dùng connection riêng chọn đúng database; không import model bên kia, không populate hay đọc chéo. Compose/test cấp readWrite chỉ đúng database, thử truy cập chéo bị MongoDB từ chối. `src/platform.js` được đóng gói độc lập ở mỗi service, không phụ thuộc thư mục Auth hay service khác lúc chạy.

## Response, lỗi và request ID

```json
{"success":true,"data":{"booking":{"id":"...","status":"PENDING_PAYMENT"}}}
```

```json
{"success":false,"code":"PRICE_CHANGED","message":"The price changed; confirm the new quote","details":{"quote":{"price_version_id":"bath-v2"}}}
```

400 `VALIDATION_ERROR`; 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `PRICE_CHANGED`, `SLOT_UNAVAILABLE`, `PET_TIME_CONFLICT`, `BOOKING_EXPIRED`, `INVALID_BOOKING_STATE`, `IDEMPOTENCY_CONFLICT`, Pet bổ sung `INVALID_PET_STATE`; 503 `DEPENDENCY_UNAVAILABLE`; 500 lỗi nội bộ được che thông tin. Auth giữ nguyên response riêng.

Gửi `X-Correlation-ID` 1–100 ký tự `[A-Za-z0-9._:-]`, hoặc service sinh UUID; ID đi theo HTTP outbound và response. Không log token, secret, private key, body hay connection URI. Timestamp UTC ISO-8601; ngày lưu trú diễn giải Asia/Ho_Chi_Minh; tiền integer VND trong miền safe integer. ID Auth/Pet/Booking/resource hiện tại là ObjectId 24 hex; ID dịch vụ và price version là chuỗi <=100 ký tự. Event/request/idempotency key dùng `[A-Za-z0-9._:-]`, 1–128 ký tự. Danh sách page 1–10000, limit 1–100.

## Auth -> hai service

Đã đọc lại controller/routes/service/JWT của Auth:

- `POST /api/auth/register` chỉ nhận username/password, tạo USER.
- `POST /api/auth/login` trả `data.accessToken`, `data.user`.
- `GET /api/auth/me` trả `{success:true,data:{user:{id,username,role,permissions}}}`.

Public business API: verify Bearer bằng **public** RSA key, RS256, issuer, iat/exp; gọi `/api/auth/me` và khớp `data.user.id === sub`. Quyền hiện tại lấy từ `/me`; không tin role/permissions/owner/actor frontend. Auth từ chối 401/403 -> 401; timeout/network/5xx/response sai ->503. Không fallback quyền JWT. Không đọc `auth_db`. Auth private key chỉ thuộc Auth; smoke tạo key tạm cho instance Auth test riêng, không đọc/copy key Auth đang có.

## Danh tính service

| Credential | Caller -> Receiver | Quyền |
|---|---|---|
| BOOKING_TO_PET_TOKEN | Booking -> Pet | ACTIVE booking-context đúng chủ |
| BOOKING_TO_CATALOG_TOKEN | Booking -> Catalog | Báo giá hiện hành qua adapter |
| PAYMENT_TO_BOOKING_TOKEN | Payment -> Booking | payment-context và payment-events |
| CARE_TO_BOOKING_TOKEN | Care -> Booking | check-in, check-out, lookup receipt |
| BOOKING_TO_PAYMENT_TOKEN | Booking -> Payment | Gửi đề nghị hoàn tiền Outbox |

Truyền qua `X-Service-Token`. Mỗi hướng có secret riêng >=32 ký tự, so sánh digest constant-time. Caller được suy ra từ credential đã cấu hình; tên service/body/header tự khai không có quyền. Care credential gọi payment-events trả 403, Payment gọi Care trả 403; credential không biết trả 401. Dữ liệu này chỉ được lưu server-side, không trên frontend/Git. Secret chưa cấu hình cho dependency tùy chọn không tạo quyền ngầm. Không gửi user JWT thay service identity.

## Pet -> Booking

```http
GET /internal/pets/<pet_id>/booking-context?owner_id=<Auth user id>
X-Service-Token: <BOOKING_TO_PET_TOKEN>
```

```json
{"success":true,"data":{"pet":{"id":"...","owner_id":"...","name":"Mimi","species":"CAT","breed":"Domestic","weight_kg":3,"care_notes":"Ăn riêng","version":2}}}
```

404 thống nhất cho không tồn tại, sai chủ, ARCHIVED. Booking lấy owner ID từ Auth, tự đối chiếu response Pet, không nhận owner từ client. Context chỉ có thông tin cần kiểm tra và snapshot, không hồ sơ Auth. Cập nhật/archive Pet sau khi context đã được đọc có thể xảy ra trước commit Booking; không hứa transaction xuyên service. Snapshot là dữ liệu hợp lệ tại lần đọc, không bị sửa theo Pet về sau. Booking không gọi Pet lại khi Payment xác nhận hoặc Care phục vụ booking đã tồn tại.

## Catalog adapter

HTTP mode mặc định, không kết nối thì 503, không dùng giá client hoặc giá cũ. Gọi:

```http
POST <CATALOG_BASE_URL>/internal/catalog/quotes
X-Service-Token: <BOOKING_TO_CATALOG_TOKEN>
Content-Type: application/json

{"service_id":"bath","species":"CAT","weight_kg":3}
```

```json
{"success":true,"data":{"quote":{"service_id":"bath","name":"Bath","type":"CARE","price_version_id":"bath-v1","unit_price":150000,"currency":"VND","unit":"SERVICE","duration_minutes":60,"allowed_species":["DOG","CAT"],"min_weight_kg":0,"max_weight_kg":40}}}
```

BOARDING: `type=BOARDING`, `unit=NIGHT`, `duration_minutes=null`. Price version opaque string; amount nguyên >0; CARE duration nguyên 1–600 phút. Điều kiện species/weight phải rõ; Booking kiểm tra lại và tính quantity/nights/tổng, bảo vệ overflow. 404 khi service không tồn tại. Timeout mặc định 3 giây, tối đa response 64 KiB, không theo redirect.

Booking so sánh `expected_price_version`, sai trả 409 `PRICE_CHANGED` kèm `details.quote`, chưa tạo allocation/hold. Giá chốt tại lần lập quote trước transaction; Catalog đổi sau đó không đòi transaction xuyên DB. Booking không có API đổi giá hoặc cập nhật Catalog. Fixture chỉ đọc `fixtures/catalog.json` bật rõ bằng `CATALOG_MODE=fixture`, cấm production. Fixture và HTTP test double không là bằng chứng tích hợp Catalog thật.

## Payment -> Booking

`GET /internal/bookings/:id/payment-context` chỉ Payment. Response `data.booking` có `booking_id,owner_id,amount,currency,price_version_id,expires_at,status`. Lấy từ snapshot, không gọi lại Catalog. Payment phải kiểm tra quyền sở hữu khi nhận yêu cầu thanh toán từ khách. Booking chỉ cung cấp context cho PENDING_PAYMENT còn hạn; không có token user trên endpoint này.

```http
POST /internal/bookings/payment-events
X-Service-Token: <PAYMENT_TO_BOOKING_TOKEN>
Content-Type: application/json

{"event_id":"payment-event-01","booking_id":"<id>","payment_id":"payment-attempt-01","amount":150000,"currency":"VND","result":"SUCCEEDED"}
```

Payment phải xác minh cổng thanh toán trước khi phát sự kiện; Booking không nhận/xác minh IPN VNPAY. Không gửi timestamp để quyết định expiry. `result`: SUCCEEDED/FAILED/PENDING; timeout chưa rõ kết quả dùng PENDING. Receipt theo event_id, fingerprint toàn bộ nội dung; payload thay đổi cùng ID trả 409. Khác event cùng payment ID không xác nhận booking thứ hai. Trạng thái, allocation, history, receipt và binding payment ID commit nguyên tử.

HTTP 200 cho sự kiện hợp lệ có kết luận nghiệp vụ (kể cả ngoại lệ):

```json
{"success":true,"data":{"accepted":false,"outcome":"BOOKING_EXPIRED","retryable":false,"booking_id":"...","booking_status":"EXPIRED"}}
```

| Outcome | Ý nghĩa / phía Payment xử lý |
|---|---|
| CONFIRMED | Full payment khớp, hold còn hạn, Booking xác nhận |
| ALREADY_ACCEPTED | Cùng khoản đã được nhận trước đó; không ghi lặp |
| BOOKING_NOT_FOUND | Không có booking, đưa xử lý ngoại lệ |
| BOOKING_EXPIRED / BOOKING_CANCELLED / trạng thái khác | Không khôi phục lịch, đối chiếu/hoàn tiền theo nghiệp vụ Payment |
| AMOUNT_OR_CURRENCY_MISMATCH | Số tiền/currency sai, không xác nhận |
| PAYMENT_ALREADY_USED | Payment ID đã gắn booking khác |
| ANOTHER_PAYMENT_ACCEPTED | Booking đã nhận khoản khác, không ghi đè |
| PAYMENT_PENDING / PAYMENT_FAILED | Không có kết quả success mới, không xác nhận |
| SUCCESS_PRESERVED | FAILED/PENDING khác không ghi đè success |

HTTP 400: sửa payload; 401/403: sửa credential/capability; 409 idempotency conflict: dừng và điều tra, không đổi nội dung dưới cùng event ID. Timeout/network/503: retry **cùng event_id và payload**. HTTP 200 + retryable=false là kết luận cuối cho sự kiện; không retry vô hạn để tìm cách xác nhận hold đã hết hạn. Replay trả đúng kết quả lưu trước, kể cả trạng thái booking hiện đã tiến xa hơn.

## Booking -> Payment Outbox

Hủy confirmed hợp lệ lưu Outbox cùng transaction:

```http
POST <PAYMENT_BASE_URL>/internal/payment/refund-requests
X-Service-Token: <BOOKING_TO_PAYMENT_TOKEN>
Content-Type: application/json

{"event_id":"<uuid>","booking_id":"...","payment_id":"...","amount":150000,"currency":"VND","reason":"Khách hủy đủ điều kiện"}
```

Payment cần deduplicate event_id và phản hồi 200/201/202 `{success:true,data:{event_id:"<cùng ID>"}}`. Worker chỉ đánh dấu DELIVERED sau ack khớp ID. Mất ack, timeout hoặc lỗi giữ PENDING để retry. Lease trong DB 60 giây, nhiều worker an toàn; phía Payment cũng phải chống lặp vì có thể nhận nhiều lần sau crash. Chưa có URL Payment thì không thử gửi, sự kiện không mất. Booking không tự ghi hoàn tiền thành công hay giữ bảng giao dịch thay Payment.

## Care -> Booking

```http
POST /internal/bookings/check-in
X-Service-Token: <CARE_TO_BOOKING_TOKEN>
Content-Type: application/json

{"request_id":"care-arrival-01","booking_id":"...","actor_id":"<STAFF id>","reason":"Đã kiểm tra tiếp nhận"}
```

Check-out dùng `/internal/bookings/check-out`, body cùng cấu trúc nhưng **request_id mới**. Care phải gọi Auth kiểm tra STAFF hiện tại trước khi phát request, lưu phiếu/yêu cầu ở database riêng, rồi xác nhận actor bằng credential Care. API công khai không có actor tự khai.

Booking lưu fingerprint gồm action và toàn bộ body, HTTP status và kết quả bền vững. Cùng request_id/cùng payload trả lại; đổi action, booking, reason hoặc actor trả 409. Sai trạng thái/thời gian/resource là 409 có receipt, muốn thử lại sau khi thay đổi điều kiện dùng request_id mới. Nếu HTTP timeout, tra `GET /internal/care/requests/:requestId` cùng credential; `data.result` có HTTP status cũ và data/error. Không tìm thấy receipt: gửi lại nguyên ID/payload, không tự tạo ID mới khi chưa rõ kết quả.

Check-in yêu cầu CONFIRMED, đúng cửa sổ, resource READY, không occupancy khác và không overlap preparation/cleaning/maintenance. Check-out yêu cầu CHECKED_IN và resource thực tế đúng booking, chuyển COMPLETED + CLEANING trong transaction. Allocation vệ sinh giữ đến ít nhất scheduled end + buffer; nếu phục vụ muộn phải mở rộng và kiểm tra booking tương lai, trả 409 khi có xung đột. Không tạo phiếu nhận, nhật ký hay bàn giao trong `booking_db`.

## Chống đặt trùng

Booking collections: `resources`, `bookings`, `allocations`, `petguards`, `processeds`, `histories`, `maintenances`, `paymentclaims`, `outboxes`. Không collection giao dịch/phiếu chăm sóc. Allocation tách khỏi trạng thái thực tế, lưu `[start,end)`, active và hold_until. COMPLETED giữ allocation buffer; CANCELLED/EXPIRED giải phóng nguyên tử.

Mọi mutation lịch theo cùng thứ tự khóa bằng ghi:

1. Pet guard `_id=pet_id`, `$inc version` (nếu thao tác liên quan Pet).
2. Resource records theo ObjectId tăng dần, `$inc schedule_version`.
3. Đọc lại trạng thái, overlap, receipts trong transaction mới; áp dụng thay đổi cùng history.

Create khóa mọi resource phù hợp trước khi chọn, nên transaction tranh capacity hoặc cùng Pet chắc chắn xung đột trên record ổn định. Maintenance chỉ khóa resource, không lấy Pet sau đó; không tạo thứ tự ngược. Cancel, expire, Payment, Care dùng Pet -> resource; vệ sinh/reconcile chỉ resource. Không chỉ đọc overlap rồi insert, không mutex trong process. Mọi DB operation trong transaction chạy tuần tự; HTTP Pet/Catalog đã hoàn tất trước callback có thể retry.

Snapshot isolation + majority, retry có giới hạn. Unique indexes xử lý race key request/payment binding. Unknown commit result retry commit, không chạy lại callback sau khi kết quả commit chưa rõ. Client dùng lại key sau 503/timeout để phục hồi. Worker lấy hold từ DB, không setTimeout giữ chỗ trong RAM và không TTL xóa lịch sử. Allocations hold quá hạn không chặn chỗ dù worker chậm; receipt Payment kiểm tra thời gian thật tại mỗi lần xử lý, không tin caller.

Clock giữa các host cần đồng bộ khi triển khai thực tế; cấu hình này dùng clock của từng process, giống mô hình đề xuất. Replica set một node demo không chứng minh khả năng chịu mất node hoặc partition nhiều máy.

Tham chiếu thiết kế: [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), [MongoDB transaction considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/). Chúng giải thích transaction/session và giới hạn, không thay cho bằng chứng concurrency thật ở test dự án.
