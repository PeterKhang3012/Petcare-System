import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLoad } from '../../hooks/useLoad';
import { bookings, pets, staff } from '../../services';
import { Empty, Feedback, Status } from '../../UI/Feedback';
import { dateTime, label, serviceName } from '../../utils/format';
import { FacilityContact } from './FacilityContact';

export function Dashboard() {
  const { user } = useAuth();
  const isStaff = user?.role === 'STAFF';
  const summary = useLoad(useCallback(async () => {
    if (isStaff) {
      const schedule = await staff.schedule(1);
      return { bookings: schedule.bookings, total: schedule.total };
    }
    const [list, petList] = await Promise.all([bookings.list(), pets.list()]);
    return { bookings: list.bookings, total: list.total, pets: petList.total };
  }, [isStaff]));
  return <>
    <section className="hero"><div><span className="eyebrow">PAWSTAY</span><h1>Xin chào, {user?.username}</h1><p>{isStaff ? 'Xem lịch đặt và quản lý tài nguyên chăm sóc.' : 'Sắp xếp lịch chăm sóc cho thú cưng của bạn.'}</p>
    <Link className="button" to={isStaff ? '/staff' : '/bookings/new'}>{isStaff ? 'Mở trang vận hành' : 'Đặt lịch chăm sóc'}</Link></div><div className="paw-print" aria-hidden="true"><i/><i/><i/><i/><b/></div></section>
    <FacilityContact />
    <Feedback {...summary} retry={summary.reload}>{summary.data && <>
      <div className="stats">{summary.data.pets !== undefined && <Link className="panel" to="/pets"><small>Thú cưng đang chăm sóc</small><strong>{summary.data.pets}</strong></Link>}
      <Link className="panel" to={isStaff ? '/staff' : '/bookings'}><small>{isStaff ? 'Lịch trong 7 ngày tới' : 'Tổng số lịch đặt'}</small><strong>{summary.data.total}</strong></Link></div>
      <section className="panel"><h2>{isStaff ? 'Lịch sắp tới' : 'Lịch đặt gần đây'}</h2>
        {summary.data.bookings.length ? <ul className="list">{summary.data.bookings.slice(0, 5).map(row => <li key={row.id}><Link to={isStaff ? '/staff/bookings/' + row.id : '/bookings/' + row.id}>{row.pet_snapshot?.name ?? serviceName(row.service_id)}<small>{dateTime(row.start_at)}</small></Link><Status value={row.status}/></li>)}</ul> : <Empty>Chưa có lịch đặt.</Empty>}
      </section>
    </>}</Feedback>
  </>;
}

export function Profile() {
  const { user } = useAuth();
  return <><h1>Tài khoản</h1><section className="panel"><dl className="details">
    <dt>Tên đăng nhập</dt><dd>{user?.username}</dd>
    <dt>Họ và tên</dt><dd>{user?.full_name || 'Chưa có thông tin'}</dd>
    <dt>Số điện thoại</dt><dd>{user?.phone || 'Chưa có thông tin'}</dd>
    <dt>Vai trò</dt><dd>{user && label(user.role)}</dd>
    {Boolean(user?.permissions.length) && <><dt>Quyền được cấp</dt><dd>{user?.permissions.join(', ')}</dd></>}
  </dl></section></>;
}
