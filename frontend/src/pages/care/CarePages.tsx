import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { care, type Visit } from '../../services/care';
import { staff as staffApi } from '../../services';
import { DemoClockPanel } from '../../components/DemoClockPanel';
import { useAuth } from '../../contexts/AuthContext';
import { useLoad } from '../../hooks/useLoad';
import { Empty, Feedback, Pagination, Status } from '../../UI/Feedback';
import { dateTime, label } from '../../utils/format';
import { bookingRejectionMessage } from '../../api/client';
import { CareActionForm, requestPath } from './CareActionForm';
import { CareLogs } from './CareLogs';

export function CarePage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [state, setState] = useState('');
  const result = useLoad(useCallback(() => care.list(page, state || undefined), [page, state]));
  return <><header className="page-heading"><h1>Hồ sơ chăm sóc</h1>
    {user?.role === 'STAFF' && <Link className="button" to="/staff">Mở lịch tiếp nhận</Link>}
  </header><div className="toolbar"><label>Trạng thái<select value={state} onChange={event => { setState(event.target.value); setPage(1); }}>
    <option value="">Tất cả</option><option value="PENDING">Chờ tiếp nhận</option><option value="IN_CARE">Đang chăm sóc</option><option value="COMPLETED">Hoàn tất</option>
  </select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.visits.length ? <ul className="list panel">{result.data.visits.map(visit => <li key={visit.id}>
        <Link to={'/care/visits/' + visit.id}>{visit.snapshot.pet.name}<small>{visit.snapshot.service.name} · {dateTime(visit.snapshot.start_at)}</small></Link>
        <Status value={visit.state}/>
      </li>)}</ul> : <Empty>Chưa có hồ sơ chăm sóc phù hợp.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
  </>;
}

function VisitOverview({ visit, staff }: { visit: Visit; staff: boolean }) {
  return <section className="panel"><dl className="details">
    <dt>Dịch vụ</dt><dd>{visit.snapshot.service.name}</dd>
    <dt>Loài</dt><dd>{label(visit.snapshot.pet.species)}</dd>
    <dt>Lịch đặt</dt><dd><Link to={(staff ? '/staff/bookings/' : '/bookings/') + visit.booking_id}>{visit.booking_id}</Link></dd>
    <dt>Đồng bộ Booking</dt><dd><Status value={visit.sync_state}/></dd>
    {visit.intake && <><dt>Đã tiếp nhận</dt><dd>{dateTime(visit.checked_in_at)}</dd>
      {visit.checked_in_recorded_at && <><dt>Ghi nhận tiếp nhận thực tế</dt><dd>{dateTime(visit.checked_in_recorded_at)}</dd></>}
      <dt>Tình trạng lúc tiếp nhận</dt><dd>{visit.intake.initial_condition}</dd>
      <dt>Hướng dẫn chăm sóc</dt><dd>{visit.intake.care_instructions || '—'}</dd>
      <dt>Đồ dùng gửi kèm</dt><dd>{visit.intake.belongings?.join(', ') || '—'}</dd></>}
    {visit.handover && <><dt>Đã bàn giao</dt><dd>{dateTime(visit.completed_at)}</dd>
      {visit.completed_recorded_at && <><dt>Ghi nhận bàn giao thực tế</dt><dd>{dateTime(visit.completed_recorded_at)}</dd></>}
      <dt>Người nhận</dt><dd>{visit.handover.recipient_name}</dd>
      <dt>Đồ dùng đã trả</dt><dd>{visit.handover.returned_belongings?.join(', ') || '—'}</dd>
      <dt>Ghi chú bàn giao</dt><dd>{visit.handover.notes || '—'}</dd></>}
  </dl>{visit.request_id && <Link to={requestPath(visit.request_id)}>Xem yêu cầu đang xử lý</Link>}</section>;
}

export function CareVisit() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const staff = user?.role === 'STAFF';
  const result = useLoad(useCallback(() => care.get(id), [id]));
  const visit = result.data?.visit;
  const demoBookingId = staff && visit?.demo_clock?.is_demo ? visit.booking_id : undefined;
  const booking = useLoad(useCallback(() => demoBookingId ? staffApi.booking(demoBookingId) : Promise.resolve(undefined), [demoBookingId]));
  const active = visit?.state === 'IN_CARE' && !visit.request_id && (!visit.demo_clock?.is_demo || booking.data?.demo_clock?.enabled === true);
  return <><Link to="/care">Hồ sơ chăm sóc</Link>
    <Feedback {...result} retry={result.reload}>{visit && <>
      <header className="page-heading"><h1>{visit.snapshot.pet.name}</h1><Status value={visit.state}/></header>
      <VisitOverview visit={visit} staff={staff}/>
      {demoBookingId && <Feedback {...booking} retry={booking.reload}>{booking.data && <DemoClockPanel key={demoBookingId} details={booking.data}/>}</Feedback>}
      <CareLogs key={visit.id} id={visit.id} editable={staff} canAdd={staff && active}/>
      {staff && active && <CareActionForm key={visit.id} bookingId={visit.booking_id} checkout/>}
    </>}</Feedback>
  </>;
}

export function CareRequestPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const result = useLoad(useCallback(() => care.request(id), [id]));
  const request = result.data?.request;
  const { reload } = result;
  const pending = request?.status === 'PENDING';
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(reload, 5000);
    return () => window.clearTimeout(timer);
  }, [pending, reload]);
  return <><Link to="/care">Hồ sơ chăm sóc</Link><h1>Yêu cầu chăm sóc</h1>
    <Feedback {...result} retry={reload}>{request && <>
      <section className="panel"><header className="page-heading"><h2>{request.action === 'CHECK_IN' ? 'Tiếp nhận' : 'Bàn giao'}</h2><Status value={request.status}/></header>
        {pending && <p>Đang chờ Booking xác nhận. Trang tự kiểm tra lại.</p>}
        {request.status === 'REJECTED' && <p role="alert">Booking từ chối yêu cầu ({request.result?.status ? request.result.status + ' · ' : ''}{request.result?.code || 'BOOKING_REJECTED'}).
          {' '}{bookingRejectionMessage(request.result?.code, request.result?.message) || 'Kiểm tra trạng thái lịch và điều kiện tiếp nhận/bàn giao.'}
          {' '}Kết quả phiếu này đã được lưu và không thay đổi. Sau khi xử lý nguyên nhân, quay lại lịch đặt hoặc hồ sơ chăm sóc để gửi phiếu mới với mã yêu cầu mới.</p>}
        <div className="actions"><Link className="button secondary" to={'/care/visits/' + request.visit_id}>Xem hồ sơ chăm sóc</Link>
          {pending && <button className="secondary" onClick={reload}>Kiểm tra lại</button>}
          {request.status === 'REJECTED' && user?.role === 'STAFF' && <Link to="/staff">Xem lịch vận hành</Link>}
        </div>
      </section>
    </>}</Feedback>
  </>;
}
