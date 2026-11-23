# Tích hợp VNPay

1. Frontend gửi `booking_id` và `Idempotency-Key`. Payment lấy chủ sở hữu, số tiền và hạn giữ chỗ từ Booking. Backend tạo một attempt MySQL và sinh URL ký HMAC-SHA512.
2. Giao diện hiển thị URL từ POST Payment và mở VNPay ở tab mới. Trang theo dõi đọc GET Payment. GET không trả URL; để lấy lại liên kết của giao dịch do thiết bị này tạo, frontend gọi lại POST bằng cùng khóa.
3. Return cho trình duyệt có thể chuyển hướng đến `/payments/return` nếu quản trị viên cấu hình `PAYMENT_FRONTEND_RETURN_URL` phù hợp. Trang đó cho tra mã giao dịch và liên kết giao dịch gần nhất đã lưu.
4. IPN xác minh chữ ký, mã merchant, tham chiếu, số tiền và mã giao dịch. Payment và Outbox ghi trong cùng giao dịch MySQL. Worker gửi sự kiện đến Booking; Booking xác minh lại số tiền, thời hạn và ghi chuyển trạng thái.
5. Giao diện hiển thị các trạng thái Payment và đồng bộ Booking độc lập. Trạng thái trên URL Return không được dùng để ghi hoặc xác nhận thanh toán.

Để kiểm thử Sandbox thật, xác nhận merchant, URL HTTPS IPN đã đăng ký và Return URL truy cập được. Thử thành công, thất bại và hủy bằng dữ liệu do Sandbox cung cấp. So sánh mã giao dịch và số tiền rồi chờ trạng thái cuối của cả hai service. Nếu đóng tab VNPay, dùng trang Payment để tra lại. [Báo cáo kiểm thử](reports/FINAL_TEST_REPORT.md)

Tham khảo [đặc tả thanh toán VNPay 2.1.0](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html) và [API truy vấn và hoàn tiền](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html).
