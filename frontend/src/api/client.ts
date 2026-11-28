import axios from 'axios';

const tokenKey = 'pawstay.session';
export const session = {
  get: () => sessionStorage.getItem(tokenKey),
  set: (token: string) => sessionStorage.setItem(tokenKey, token),
  clear: () => sessionStorage.removeItem(tokenKey),
};
export const api = axios.create({ baseURL: '/api', timeout: 35000 });
api.interceptors.request.use(config => {
  const token = session.get();
  if (token && !config.url?.match(/^\/auth\/(login|register)$/)) config.headers.Authorization = 'Bearer ' + token;
  return config;
});
api.interceptors.response.use(response => response, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 &&
      error.config?.headers.Authorization === 'Bearer ' + session.get()) {
    session.clear();
    window.dispatchEvent(new Event('pawstay:session-expired'));
  }
  return Promise.reject(error);
});
export async function data<T>(request: Promise<{ data: { data: T } }>) {
  return (await request).data.data;
}
export const pathId = encodeURIComponent;
export const idempotency = (key: string) => ({ headers: { 'Idempotency-Key': key } });
export function bookingRejectionMessage(code?: string, message?: string) {
  const messages: Record<string, string> = {
    'Outside the configured check-in window': 'Ngoài cửa sổ tiếp nhận của lịch đặt. Kiểm tra giờ hẹn và giờ nghiệp vụ; nếu đang demo, chọn giờ hợp lệ trước khi gửi phiếu mới.',
    'Check-in requires CONFIRMED': 'Tiếp nhận yêu cầu lịch ở trạng thái CONFIRMED và đã chấp nhận thanh toán.',
    'Check-in requires CONFIRMED with an accepted payment': 'Tiếp nhận yêu cầu lịch ở trạng thái CONFIRMED và đã chấp nhận thanh toán.',
    'Check-out requires this booking to occupy the resource': 'Bàn giao yêu cầu lịch đang CHECKED_IN và đang sử dụng đúng tài nguyên.',
    'The resource or pet is not ready for check-in (including preparation/cleaning allocations)': 'Tài nguyên hoặc thú cưng chưa sẵn sàng: cần READY, không có lượt đang chiếm chỗ, bảo trì hoặc lịch xung đột kể cả thời gian chuẩn bị/vệ sinh.',
    'Actual service/cleaning would overlap a future allocation; resolve the conflict before retrying with a new request_id': 'Thời gian phục vụ hoặc vệ sinh sẽ trùng lịch kế tiếp. Xử lý xung đột rồi gửi phiếu bàn giao mới.',
  };
  const codes: Record<string, string> = {
    DEMO_DISABLED: 'Demo đang tắt. Bật cấu hình demo cho cả Booking và Care ngoài production để tiếp tục.',
    DEMO_TIME_OUT_OF_RANGE: 'Giờ chọn nằm ngoài khoảng hợp lệ. Trước tiếp nhận, chọn trong cửa sổ tiếp nhận; khi đang chăm sóc, chọn từ giờ tiếp nhận đến giờ bàn giao đã hẹn.',
    DEMO_TIME_BACKWARDS: 'Không thể lùi giờ nghiệp vụ. Chọn mốc phía trước đồng hồ đang chạy.',
    UNAUTHORIZED: 'Phiên đăng nhập hoặc xác thực dịch vụ không hợp lệ.',
    FORBIDDEN: 'Không có quyền thực hiện thao tác này.',
  };
  return messages[message || ''] || codes[code || ''];
}
export function errorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return 'Đã xảy ra lỗi. Vui lòng thử lại.';
  if (!error.response) return 'Không kết nối được hoặc yêu cầu quá thời gian. Vui lòng thử lại.';
  const { status, data } = error.response;
  if (status === 401) return 'Thông tin đăng nhập không đúng hoặc phiên đã hết hạn.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
  const bookingMessage = bookingRejectionMessage(data?.code, data?.message);
  if (bookingMessage) return bookingMessage;
  if (status === 409 && data?.code === 'PRICE_CHANGED') return 'Giá hoặc hồ sơ thú cưng đã thay đổi. Hãy yêu cầu báo giá mới trước khi đặt lịch.';
  if (status === 409 && data?.code === 'SLOT_UNAVAILABLE') return 'Chỗ vừa hết. Hãy chọn thời gian khác.';
  if (status === 409 && data?.code === 'PET_TIME_CONFLICT') return 'Thú cưng đã có lịch trùng với thời gian này.';
  if (status === 400 && data?.code === 'PET_COAT_REQUIRED') return 'Hãy cập nhật loại lông trong hồ sơ thú cưng rồi báo giá lại.';
  if (status === 400 && data?.code === 'PET_PRICE_NOT_SUPPORTED') return 'Dịch vụ này chưa có nhóm giá phù hợp với cân nặng của thú cưng.';
  if (status === 409 && data?.code === 'PRICE_VERSION_CONFLICT') return 'Giá vừa được thay đổi. Hãy tải lại giá hiện tại trước khi cập nhật.';
  if (status === 409 && data?.code === 'LOG_VERSION_CONFLICT') return 'Nhật ký vừa được chỉnh sửa. Hãy tải lại phiên bản mới nhất.';
  if (status === 409 && data?.code === 'SYNC_IN_PROGRESS') return 'Đã có yêu cầu đang đồng bộ. Hãy xem trạng thái trong hồ sơ chăm sóc.';
  if (status === 409) return 'Thao tác xung đột với dữ liệu hiện tại. Hãy kiểm tra lại trạng thái.';
  if (status >= 500) return 'Dịch vụ tạm thời không phản hồi. Vui lòng thử lại sau.';
  return 'Yêu cầu không hợp lệ. Vui lòng kiểm tra thông tin đã nhập.';
}
