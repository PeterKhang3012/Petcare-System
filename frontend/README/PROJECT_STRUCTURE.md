# Cấu trúc frontend

- `src/api/` cấu hình Axios, Bearer JWT, lỗi HTTP và khóa idempotency.
- `src/services/` chứa client Auth, Pet, Booking, Staff và Payment theo DTO thực tế.
- `src/contexts/` khôi phục phiên và làm mới thông tin qua Auth; `src/App.tsx` kiểm soát route và vai trò.
- `src/pages/` chứa các màn hình nghiệp vụ; `src/components/` chứa layout và thành phần ghép; `src/UI/` xử lý phản hồi, trạng thái và phân trang.
- `src/types/`, `src/utils/` và `src/styles/` chứa DTO, định dạng, bộ nhớ giao dịch cục bộ và CSS dùng chung.
- `tests/integration.mjs` chạy Playwright trên giao diện và gửi request qua Vite proxy để kiểm tra dữ liệu.
