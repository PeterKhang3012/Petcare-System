# PawStay Pet Service

Backend Node.js/Express/CommonJS/Mongoose cho hồ sơ thú cưng, sở hữu duy nhất `pet_db`. Triển khai theo phạm vi trong `docs/idea.md` và yêu cầu Pet/Booking; giữ công nghệ đang có của Auth. Không thêm vai trò ngoài `USER`/`STAFF` và không sửa Auth.

## Chạy độc lập

Yêu cầu Node.js >=22.19, MongoDB và Auth hiện có đang chạy. Pet có thể dùng standalone MongoDB; Booking bắt buộc replica set. Nên dùng MongoDB demo riêng và tài khoản `readWrite` chỉ trên `pet_db` tại [hướng dẫn hạ tầng](../../infra/pet-booking/README.md).

Từ root của repo:

```powershell
npm ci --prefix Backend/pet-service
# Cấu hình LOCAL_PET_* trong .env gốc dựa trên .env.example.
node scripts/run-local.cjs pet
```

Các biến bắt buộc:

| Biến | Ý nghĩa |
|---|---|
| `MONGODB_URI` | URI chọn đúng `pet_db`, tài khoản riêng; không dùng URI Auth |
| `JWT_PUBLIC_KEY_PATH` | Chỉ public key PEM RSA >=2048 bit; đường dẫn tương đối tính từ service |
| `JWT_ISSUER` | Khớp issuer hiện có của Auth |
| `AUTH_BASE_URL` | Local: `http://127.0.0.1:3001`; container gọi Auth host: `http://host.docker.internal:3001` |
| `BOOKING_TO_PET_TOKEN` | Credential ngẫu nhiên >=32 ký tự, cùng giá trị với outbound của Booking |
| `PORT` | Mặc định 3002 |
| `HTTP_TIMEOUT_MS` | Mặc định 3000, hợp lệ 100–30000 ms |

Không cần private key, tài khoản STAFF hay kết nối database của service khác. Khởi tạo secret bằng `scripts/init-pet-booking-demo.js`; secret được ghi trong `.local/`, không có giá trị mặc định trong Git. Không chạy lại script để ghi đè `.env` hiện có.

## Xác thực và dữ liệu

API `/api/pets` yêu cầu Bearer JWT RS256 đúng issuer, `iat`, `exp`, `sub`, sau đó gọi `GET /api/auth/me` trên **từng request**. Dùng `data.user.id`, role và permissions hiện tại, kiểm tra ID khớp `sub`. Auth từ chối: 401; Auth lỗi, timeout hoặc response sai: 503. Không cache quyền từ JWT để cho qua khi Auth lỗi.

Chỉ `USER` được thao tác hồ sơ của mình. Mọi truy vấn đều kèm `owner_id` từ Auth; đối tượng của người khác trả 404. STAFF không có API liệt kê tất cả Pet và không được tạo/sửa/archive hồ sơ khách. Nhân viên lấy snapshot cần thiết qua Booking.

Collection `pets`: `owner_id`, `name`, `species`, `breed?`, `date_of_birth?`, `weight_kg`, `care_notes?`, `status`, `version`, `created_at`, `updated_at`, `archived_at`. Index `{owner_id,status,created_at,_id}` hỗ trợ danh sách theo chủ và trạng thái. Không liên kết foreign model, populate hoặc truy vấn database bên ngoài.

## API

OpenAPI: [openapi.json](openapi.json). Response thành công `{success:true,data:{...}}`; lỗi `{success:false,code,message}`. Mỗi response có `X-Correlation-ID`; log chỉ ghi service, request ID, HTTP method và status.

| Method/path | Quyền | Kết quả |
|---|---|---|
| `POST /api/pets` | USER | 201, `data.pet` |
| `GET /api/pets?page=1&limit=20&status=ACTIVE` | USER | `data.pets,page,limit,total` |
| `GET /api/pets/:id` | USER/chủ | Kể cả hồ sơ archive |
| `PATCH /api/pets/:id` | USER/chủ | Chỉ hồ sơ ACTIVE |
| `POST /api/pets/:id/archive` | USER/chủ | Archive idempotent |
| `GET /internal/pets/:id/booking-context?owner_id=...` | Booking credential | Context của hồ sơ ACTIVE đúng chủ |
| `GET /health` | Công khai | Liveness |
| `GET /ready` | Công khai | Kết nối `pet_db`; không thay cho kiểm tra Auth khi xử lý request |

Ví dụ tạo:

```http
POST /api/pets
Authorization: Bearer <data.accessToken từ Auth>
Content-Type: application/json

{"name":"Mimi","species":"CAT","weight_kg":3.5,"date_of_birth":"2020-02-29","care_notes":"Ăn thức ăn riêng"}
```

`name` trim, 1–100 ký tự; `species` chỉ DOG/CAT; cân nặng là số hữu hạn >0, tối đa demo 500 kg. `breed` tối đa 100, `care_notes` tối đa 2000 ký tự. Ngày sinh phải là ngày lịch hợp lệ, năm >=1900, không ở tương lai theo ngày Việt Nam. Trường lạ hoặc được bảo vệ như `owner_id`, `role`, `permissions`, `version`, `status`, timestamps bị từ chối 400; không mass assignment. PATCH cần ít nhất một trường chỉnh sửa; ngày sinh khi cung cấp phải là ngày hợp lệ, không nhận `null`.

ID sai định dạng: 400 `VALIDATION_ERROR`. Hồ sơ ngoài quyền: 404 `NOT_FOUND`. Sửa hồ sơ archive: 409 `INVALID_PET_STATE`. Danh sách mặc định chỉ ACTIVE; `status=ARCHIVED` hoặc `status=ALL` xem hồ sơ cũ. `limit` 1–100, `page` 1–10000, thứ tự `created_at DESC,_id DESC`.

Archive dùng body `{}` hoặc không body. Gửi lại không tăng version hoặc đổi `archived_at`. Không xóa dữ liệu, không gọi Booking để hủy lịch cũ. Chủ vẫn xem được hồ sơ và lịch sử qua Booking. Snapshot cũ giữ nguyên; mọi booking-context mới cho hồ sơ archive trả 404.

API nội bộ xác định Booking từ `X-Service-Token`, không từ caller tự khai. Chỉ trả `id,owner_id,name,species,breed,weight_kg,care_notes,version`. Booking phải truyền owner ID từ Auth. Context là snapshot tại thời điểm đọc; archive/sửa đồng thời sau đó không nằm trong transaction xuyên service. Chi tiết tại [hợp đồng tích hợp](../../docs/pet-booking-integration.md).

## Kiểm thử

```powershell
npm test
# Từ repository root, sau khi npm ci ở cả hai service:
node --test --test-timeout=180000 Backend/booking-service/test/integration/*.test.js
node scripts/smoke-pet-booking.js
```

Unit test không cần MongoDB. Integration chạy Pet thật, HTTP Auth/Catalog/Payment doubles được đánh dấu và MongoDB replica set **thật có authentication**, tài khoản riêng, hai process Booking. Cần `mongod` trong PATH hoặc `MONGOD_BINARY`; Windows tự tìm bản cài tại `C:/Program Files/MongoDB/Server`. Mỗi lần chạy tạo thư mục dữ liệu mới trong `.local/test-runs`, không xóa hay reset database đang có. Smoke dùng Auth thật trên database riêng, Catalog fixture và client Payment/Care mô phỏng; xem cách chuẩn bị dependency Auth tại [hạ tầng](../../infra/pet-booking/README.md).

SIGINT/SIGTERM dừng nhận request, chờ request đang chạy và đóng connection. Lỗi trả về không có stack/URI/token. Không có API chuyển chủ, xóa vật lý hoặc quản lý tài khoản.
