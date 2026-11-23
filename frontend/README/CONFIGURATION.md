# Cấu hình

| Biến | Phạm vi | Mặc định |
| --- | --- | --- |
| `PAWSTAY_GATEWAY_TARGET` | Vite proxy trong dev và preview | `http://127.0.0.1:8080` |
| `VITE_SERVICE_IDS` | Mã dịch vụ cho form đặt lịch | `bath,boarding` |

Booking hiện dùng hai mã từ danh mục fixture của Backend. Frontend gửi mã để Backend xác nhận giá và tình trạng chỗ. Với mã khác, cấu hình danh sách và chọn loại lịch khi đặt.

Trình duyệt gửi request cùng origin tới `/api/*`. Dev và preview đi qua proxy Vite. Khi phục vụ thư mục `dist/`, cấu hình web server chuyển `/api/*` đến API Gateway và trả `index.html` cho các route SPA. Dùng HTTPS khi triển khai bên ngoài máy local.

JWT nằm trong `sessionStorage`; tải lại tab sẽ gọi `/api/auth/me`. Logout xóa JWT phía trình duyệt. Mã giao dịch và khóa idempotency lưu theo tài khoản trên thiết bị. Các biến `VITE_*` có thể đọc từ bundle. Cất khóa VNPay, JWT private key và service token ở Backend.
