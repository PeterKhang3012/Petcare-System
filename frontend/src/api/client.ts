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
export function errorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return 'Đã xảy ra lỗi. Vui lòng thử lại.';
  if (!error.response) return 'Không kết nối được hoặc yêu cầu quá thời gian. Vui lòng thử lại.';
  const { status, data } = error.response;
  if (status === 401) return 'Thông tin đăng nhập không đúng hoặc phiên đã hết hạn.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
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
