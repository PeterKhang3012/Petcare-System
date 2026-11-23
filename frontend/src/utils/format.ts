export const money = (amount: number, currency = 'VND') => new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount);
export const dateTime = (value?: string) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
export const facilityTime = (value: string) => value.length === 16 ? value + ':00+07:00' : value + '+07:00';
export const labels: Record<string, string> = {
  ACTIVE: 'Đang chăm sóc', ARCHIVED: 'Đã lưu trữ', DOG: 'Chó', CAT: 'Mèo',
  PENDING_PAYMENT: 'Chờ thanh toán', CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đã nhận thú cưng',
  COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn',
  PENDING: 'Đang chờ', SUCCEEDED: 'Thành công', FAILED: 'Thất bại',
  DELIVERED: 'Đã đồng bộ', REJECTED: 'Booking từ chối',
  DEAD_LETTER: 'Đã dừng thử đồng bộ',
  READY: 'Sẵn sàng', OCCUPIED: 'Đang sử dụng', CLEANING: 'Đang vệ sinh',
  OUT_OF_SERVICE: 'Ngừng phục vụ', CARE: 'Chăm sóc', BOARDING: 'Lưu trú',
  SCHEDULED: 'Đã lên lịch', CREATED: 'Đã tạo lịch', CLEANING_COMPLETED: 'Hoàn tất vệ sinh',
  MAINTENANCE_CREATED: 'Đã lên lịch bảo trì', MAINTENANCE_CANCELLED: 'Đã hủy bảo trì',
  MAINTENANCE_STATE: 'Đã cập nhật trạng thái bảo trì', USER: 'Khách hàng', STAFF: 'Nhân viên',
};
export const label = (value: string) => labels[value] ?? value;
export const serviceName = (id: string) => ({ bath: 'Tắm & chăm sóc', boarding: 'Lưu trú qua đêm' }[id] ?? id);
