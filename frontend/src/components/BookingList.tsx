import { Link } from 'react-router-dom';
import { Empty, Status } from '../UI/Feedback';
import type { Booking } from '../types';
import { dateTime, money, serviceName } from '../utils/format';

export function BookingList({ rows, base = '/bookings' }: { rows: Booking[]; base?: string }) {
  if (!rows.length) return <Empty>Chưa có lịch đặt phù hợp.</Empty>;
  return <ul className="list panel">{rows.map(item => <li key={item.id}>
    <Link to={base + '/' + item.id}><strong>{item.pet_snapshot?.name ?? serviceName(item.service_id)}</strong><small>{serviceName(item.service_id)} · {dateTime(item.start_at)}</small></Link>
    <span>{money(item.total_amount, item.currency)}</span><Status value={item.status}/>
  </li>)}</ul>;
}

export function BookingDetails({ booking }: { booking: Booking }) {
  return <section className="panel"><dl className="details">
    <dt>Mã lịch</dt><dd>{booking.id}</dd><dt>Thú cưng</dt><dd>{booking.pet_snapshot?.name ?? booking.pet_id}</dd>
    <dt>Dịch vụ</dt><dd>{serviceName(booking.service_id)}</dd><dt>Bắt đầu</dt><dd>{dateTime(booking.start_at)}</dd>
    <dt>Kết thúc</dt><dd>{dateTime(booking.end_at)}</dd><dt>Tổng tiền</dt><dd>{money(booking.total_amount, booking.currency)}</dd>
    {booking.status === 'PENDING_PAYMENT' && <><dt>Hạn giữ chỗ</dt><dd>{dateTime(booking.expires_at)}</dd></>}
  </dl></section>;
}
