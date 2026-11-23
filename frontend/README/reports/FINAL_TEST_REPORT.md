# Báo cáo kiểm thử tích hợp PawStay

Kiểm thử ngày 23/11/2026 trên Docker Desktop, Node.js 24, Chrome qua Playwright và Java 21. Suite HTTP đi qua Vite proxy và Nginx đến các service thật. Stack kiểm thử dùng MongoDB/MySQL riêng. Kịch bản tạo dữ liệu qua API và xác minh bằng lần đọc sau đó. IPN cục bộ dùng khóa test dành riêng cho stack.

| Khu vực | Kết quả | Bằng chứng |
| --- | --- | --- |
| Build frontend | Đạt | TypeScript và Vite build thành công. |
| Chrome desktop và 390 px | Đạt | Đăng ký, đăng nhập, sửa hồ sơ, đặt lịch, khởi tạo Payment, kiểm tra Return, tải lại phiên, xử lý 401, dùng trang STAFF và đăng xuất. Ở 390 px, trang tài khoản không cuộn ngang. |
| Auth | Đạt | Từ chối trùng tên, sai mật khẩu, thiếu hoặc sai JWT, và USER truy cập route STAFF. Suite Auth kiểm tra thêm token hết hạn, sai chữ ký và sai issuer. |
| Pet | Đạt | Tạo/đọc/sửa/lưu trữ, chặn tài khoản khác, không tìm thấy ID, chặn sửa sau khi lưu trữ. |
| Booking | Đạt | Báo giá/chốt lịch tắm và lưu trú, từ chối dữ liệu hoặc pet sai, từ chối lịch trùng, xử lý hai yêu cầu đồng thời cùng khóa, hủy lặp chỉ ghi một sự kiện lịch sử. |
| STAFF | Đạt | Đọc lịch, đọc tài nguyên và lịch sử, tạo/hủy bảo trì và xác nhận tài nguyên sẵn sàng. |
| Payment và VNPay cục bộ | Đạt | Tạo/replay, sai booking hoặc chủ sở hữu, Return không ghi trạng thái, sai chữ ký/số tiền, IPN hợp lệ và trùng. IPN test thất bại giữ booking chờ, lỗi đến sau thành công bị bỏ qua, IPN thành công đến sau khi hủy không mở lại lịch. Payment lưu đúng trạng thái sau restart. |
| Gián đoạn Booking | Đạt | Gateway trả 502 cho route Booking trong khi health của Nginx vẫn 200. Payment xác nhận IPN và giữ Outbox PENDING. Sau khi Booking chạy lại, Outbox DELIVERED và Booking CONFIRMED với đúng payment ID. |
| Unit test service | Đạt một phần | Auth 2, Pet 2, Booking 7 và Payment 9 test đạt. Maven bỏ qua 13 ca yêu cầu schema test theo cấu hình tùy chọn. Booking test adapter kiểm tra timeout. |
| Booking integration có sẵn | Bị chặn | `npm run test:integration` lỗi `MODULE_NOT_FOUND` do thiếu `scripts/test-support`. |
| Gián đoạn MySQL | Đạt phần khôi phục | Dừng MySQL của Payment trên stack riêng, GET Payment chạm timeout gateway và trả 504. Sau khi MySQL chạy và healthy, GET trở lại 404 cho mã test không tồn tại. |
| VNPay Sandbox bên ngoài | Chưa xác minh | Stack chính dùng Return localhost. Cấu hình frontend Return hiện không phải URL HTTP(S) hợp lệ, endpoint đang trả JSON 200. Cấu hình IPN hiện tại không có URL HTTPS hợp lệ và chưa xác minh đăng ký ở VNPay. Chưa có giao dịch Sandbox thành công, thất bại hoặc hủy. |
| Tải và gián đoạn diện rộng | Chưa chạy | Đã thử hai request đồng thời, restart service và ngắt MySQL. Chưa benchmark nhiều người dùng, thử crash giữa lúc commit hoặc xác minh IPN đến sau khi hold hết hạn. |

Ưu tiên xử lý hoàn tiền, giới hạn attempt có thể thu tiền trên cùng booking và cấu hình HTTPS cho Sandbox. Xem [đánh giá hệ thống](SYSTEM_AUDIT_REPORT.md), [đánh giá VNPay](VNPAY_AUDIT_REPORT.md) và [suite tích hợp](../../tests/integration.mjs).
