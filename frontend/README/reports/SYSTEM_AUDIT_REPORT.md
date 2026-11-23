# Báo cáo đánh giá hệ thống PawStay

## Kiến trúc và luồng dữ liệu

- Trình duyệt → Vite proxy → Nginx → Auth, Pet, Booking hoặc Payment. Nginx dùng đường dẫn theo nhóm, giữ Bearer, Idempotency-Key và query IPN, bỏ X-Service-Token từ phía client và tắt retry upstream. Kết nối upstream giới hạn 3 giây, đọc 30 giây. Lỗi kết nối thường là 502; timeout đọc có thể là 504. Cổng Compose chỉ bind loopback. Frontend gọi cùng origin để tránh phụ thuộc CORS.
- Auth giữ user, role và quyền trong MongoDB riêng. JWT ký RS256, issuer cấu hình chung, mặc định hết hạn sau 1 giờ. `/me` tra tài khoản hiện hành. Pet, Booking và Payment xác minh token rồi đối chiếu Auth. USER sở hữu dữ liệu; STAFF dùng namespace vận hành.
- Pet và Booking dùng các database logic riêng trên MongoDB replica set. Booking gọi Pet để xác nhận pet ACTIVE, lưu snapshot và liên kết allocation, lịch sử, biên nhận và PaymentClaim bằng ID. Transaction và khóa ghi tài nguyên bảo vệ thay đổi đồng thời.
- Payment dùng MySQL với migration Flyway. Payment gọi Booking lấy chủ sở hữu/số tiền, ghi attempt và Outbox, rồi gửi kết quả về Booking qua mạng nội bộ. Booking đóng hoặc xác nhận hold theo trạng thái và thời hạn.

## Phát hiện và công việc cần xử lý

| Mức | Vấn đề, nguyên nhân và ảnh hưởng | Cách đối chiếu và hướng xử lý |
| --- | --- | --- |
| CRITICAL | **Đăng ký hoàn tiền chưa có luồng hoàn chỉnh.** Booking ghi `REFUND_REQUESTED` khi hủy lịch đã trả tiền; Compose chưa cấu hình đích refund, và Payment thiếu route nhận yêu cầu. Khoản thu có thể còn ở VNPay sau khi lịch đã hủy. | Đối chiếu [Booking](../../../Backend/booking-service/src/booking.js), [adapter](../../../Backend/booking-service/src/adapters.js) và [Payment controllers](../../../Backend/payment-service/src/main/java/com/pawstay/payment/controller/). Trên Sandbox, xác nhận lịch rồi hủy trước ít nhất 24 giờ và đối chiếu refund event với giao dịch nhà cung cấp. Cần API hoàn tiền idempotent, quy trình đối soát và trạng thái người dùng có thể tra cứu. |
| HIGH | **Danh mục và Care còn thiếu trong Compose.** Booking chạy với danh mục fixture, bị từ chối ở chế độ production. Check-in/out chỉ nhận service token của Care, trong khi Compose chưa chạy Care. | Xem [Compose](../../../docker-compose.yml), [Booking config](../../../Backend/booking-service/src/config.js) và [route nội bộ](../../../Backend/booking-service/src/app.js). Kiểm tra danh sách service rồi thử chế độ production ở môi trường kiểm thử. Cần Catalog thật và tích hợp Care trước khi xác nhận quy trình vận hành đầy đủ. |
| HIGH | **Seed STAFF có mật khẩu dạng rõ trong dữ liệu theo dõi bởi Git.** Nếu dùng lại giá trị mặc định khi triển khai, tài khoản vận hành có thể bị chiếm. | Đối chiếu danh sách file Git và cách [seed Auth](../../../Backend/auth-service/scripts/seed-staff.js) nạp file dữ liệu. Xoay mật khẩu đã dùng và cấp thông tin seed qua môi trường có kiểm soát. |
| MEDIUM | **Kiểm thử tích hợp cũ của Booking thiếu helper.** Bài test thoát ở bước import nên nhóm kiểm thử transaction nhiều tiến trình chưa có bằng chứng từ suite đó. | Chạy `npm run test:integration` trong Booking. Điểm lỗi nằm ở [system.test.js](../../../Backend/booking-service/test/integration/system.test.js). Khôi phục helper và chạy lại suite với MongoDB replica set riêng. |
| MEDIUM | **Health của gateway chỉ kiểm tra Nginx.** Probe có thể xanh trong khi upstream đang lỗi. | Trên stack riêng, dừng một upstream và so sánh `/healthz` với request thực đến service. Bổ sung giám sát độc lập cho readiness của từng service và cảnh báo lỗi 5xx. |

Các phát hiện dựa trên source được phân biệt với kết quả chạy thực trong [báo cáo kiểm thử](FINAL_TEST_REPORT.md). Mọi đề xuất sửa Backend cần được phê duyệt trước khi triển khai.
