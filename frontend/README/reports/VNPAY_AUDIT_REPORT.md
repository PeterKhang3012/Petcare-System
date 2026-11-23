# Báo cáo đánh giá VNPay

**Kết luận: TƯƠNG ĐỐI ĐÚNG.** Kiến trúc tách Return, IPN và Outbox. Khả năng liên thông với VNPay Sandbox bên ngoài vẫn **CHƯA XÁC MINH**.

| Bước | Mã nguồn và hành vi hiện tại |
| --- | --- |
| 1–5. Tạo giao dịch | PaymentController xác thực USER. PaymentServiceImpl đọc context từ Booking, xác nhận owner và hold, dùng số tiền từ Booking, lưu attempt với khóa idempotency theo owner. VnpayClient tạo mã tham chiếu từ UUID và sinh URL với số tiền nhân 100. |
| 6–7. Điều hướng và Return | Frontend mở link HTTPS do POST trả về. VnpayCallbackController chỉ trả JSON hoặc 303 tới trang cấu hình và không chuyển tiếp query. Frontend dùng GET Payment để xem trạng thái. |
| 8–12. IPN và giao dịch MySQL | VnpayClient kiểm tra merchant, khóa trùng, ký HMAC-SHA512 trên tên đã sắp xếp và giá trị form-encode ASCII, so sánh hash bằng hàm constant-time. VnpayIpnServiceImpl khóa attempt theo tham chiếu, kiểm tra số tiền, mã phản hồi và số giao dịch, ghi trạng thái và Outbox trong cùng transaction. |
| 13–14. Đồng bộ Booking | PaymentOutboxWorker dùng lease, retry có backoff và DEAD_LETTER. Booking xác minh số tiền, đơn vị, trạng thái và hạn; lưu biên nhận event và PaymentClaim trong transaction, rồi trả kết quả. |

### Tình huống cần đối soát

- **CRITICAL — Nhiều attempt cho cùng booking:** [PaymentServiceImpl](../../../Backend/payment-service/src/main/java/com/pawstay/payment/service/impl/PaymentServiceImpl.java) dùng khóa duy nhất theo owner và idempotency key. Nhiều khóa vẫn có thể tạo nhiều attempt khi giữ chỗ còn hiệu lực. [Booking](../../../Backend/booking-service/src/booking.js) chỉ chấp nhận một payment ID. Một attempt khác có thể đã thu tiền trước khi được Booking từ chối. Đây là phát hiện từ source, chưa xác minh bằng giao dịch nhà cung cấp. Cần guard một attempt đang hoạt động cho mỗi booking và quy trình hoàn tiền hoặc đối soát.
- **HIGH — IPN muộn:** Payment vẫn có thể ghi thành công sau hạn; Booking trả `BOOKING_EXPIRED` hoặc `BOOKING_CANCELLED`. Nhân viên cần xử lý khoản đã thu. Kiểm tra bằng stack riêng theo thời hạn giữ chỗ, rồi đối chiếu Payment, Outbox và Booking. Cần workflow xử lý khoản thu không được gắn với lịch.
- **HIGH — Thứ tự sự kiện:** Một attempt chuyển khỏi PENDING sẽ không được đổi trạng thái bởi IPN đến sau. Điều này chặn replay và giữ thành công đã ghi. Trường hợp IPN thất bại đến trước một thông báo thành công của cùng attempt cần đối chiếu với quy tắc của VNPay và kiểm tra qua Sandbox trước khi quyết định cơ chế đối soát.
- **MEDIUM — Return thiếu định danh giao dịch:** GET trả 303 đến một URL cố định. Khi có nhiều tab/giao dịch, người dùng phải chọn mã đúng. Frontend giữ trang theo dõi khi mở VNPay ở tab mới và cho tra cứu theo mã. Nếu thay đổi Backend, có thể dùng định danh tham chiếu đã xác thực để điều hướng về trang đúng.
- **MEDIUM — IP Edge:** [PaymentController](../../../Backend/payment-service/src/main/java/com/pawstay/payment/controller/PaymentController.java) lấy servlet remote address để ký URL. Qua Nginx, địa chỉ này có thể là IP proxy. Kiểm tra trường `vnp_IpAddr` ở môi trường HTTPS và cấu hình tin cậy địa chỉ proxy nếu cần.

Stack chính có cấu hình merchant và khóa, nhưng Return mặc định đi qua gateway localhost. Trạng thái đăng ký IPN HTTPS ở cổng quản trị VNPay chưa có bằng chứng. Nhánh IPN thử bằng khóa riêng kiểm tra hành vi nội bộ, còn thành công/thất bại/hủy trên Sandbox thật vẫn cần xác minh.
