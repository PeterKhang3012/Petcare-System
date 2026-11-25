import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookingDetails, BookingList } from '../../components/BookingList';
import { CareActionForm } from '../care/CareActionForm';
import { staff } from '../../services';
import { useLoad } from '../../hooks/useLoad';
import { Empty, Feedback, HistoryList, Pagination, Status } from '../../UI/Feedback';
import type { Resource } from '../../types';
import { dateTime, facilityTime, label } from '../../utils/format';

export function StaffPage() {
  const [view, setView] = useState('schedule');
  return <><h1>Vận hành</h1><div className="actions">
    <button className={view === 'schedule' ? '' : 'secondary'} onClick={() => setView('schedule')}>Lịch chăm sóc</button>
    <button className={view === 'resources' ? '' : 'secondary'} onClick={() => setView('resources')}>Tài nguyên</button>
  </div>{view === 'schedule' ? <Schedule/> : <Resources/>}</>;
}

function Schedule() {
  const [filters, setFilters] = useState<{ from?: string; to?: string }>({});
  const [page, setPage] = useState(1);
  const result = useLoad(useCallback(() => staff.schedule(page, filters.from, filters.to), [page, filters]));
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get('from'));
    const to = String(form.get('to'));
    setFilters({ from: from ? facilityTime(from) : undefined, to: to ? facilityTime(to) : undefined });
    setPage(1);
  }
  return <><form className="panel form-grid" onSubmit={filter}><label>Từ (GMT+7)<input type="datetime-local" name="from"/></label><label>Đến (GMT+7)<input type="datetime-local" name="to"/></label><div className="full"><button>Lọc lịch</button></div></form>
    <Feedback {...result} retry={result.reload}>{result.data && <><BookingList rows={result.data.bookings} base="/staff/bookings"/><Pagination result={result.data} change={setPage}/></>}</Feedback></>;
}

function Resources() {
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState('');
  const [state, setState] = useState('');
  const [selected, setSelected] = useState<Resource | null>(null);
  const result = useLoad(useCallback(() => staff.resources(page, group || undefined, state || undefined), [page, group, state]));
  const resource = result.data?.resources.find(row => row.id === selected?.id) ?? selected;
  return <><div className="toolbar"><label>Nhóm<select value={group} onChange={event => { setGroup(event.target.value); setPage(1); setSelected(null); }}><option value="">Tất cả</option>{['CARE','BOARDING'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
    <label>Trạng thái<select value={state} onChange={event => { setState(event.target.value); setPage(1); setSelected(null); }}><option value="">Tất cả</option>{['READY','OCCUPIED','CLEANING','OUT_OF_SERVICE'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <>{result.data.resources.length ? <ul className="panel list">{result.data.resources.map(row => <li key={row.id}><button className="secondary" aria-pressed={selected?.id === row.id} onClick={() => setSelected(row)}>{row.code}</button><span>{label(row.group)}</span><Status value={row.state}/></li>)}</ul> : <Empty>Không tìm thấy tài nguyên phù hợp.</Empty>}
    <Pagination result={result.data} change={value => { setPage(value); setSelected(null); }}/></>}</Feedback>
    {resource && <ResourcePanel key={resource.id} resource={resource} onChange={result.reload}/>}
  </>;
}

function ResourcePanel({ resource, onChange }: { resource: Resource; onChange: () => void }) {
  const [historyPage, setHistoryPage] = useState(1);
  const [maintenancePage, setMaintenancePage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState('');
  const history = useLoad(useCallback(() => staff.history(resource.id, historyPage), [resource.id, historyPage]));
  const maintenance = useLoad(useCallback(() => staff.maintenance(resource.id, maintenancePage), [resource.id, maintenancePage]));
  async function act(event: FormEvent<HTMLFormElement>, operation: (form: FormData) => Promise<unknown>, success: string) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true); setError(undefined); setMessage('');
    try {
      await operation(form); element.reset(); history.reload(); maintenance.reload(); onChange(); setMessage(success);
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <section className="panel"><header className="page-heading"><h2>{resource.code}</h2><Status value={resource.state}/></header>
    <Feedback error={error}/>{message && <p className="feedback" role="status">{message}</p>}
    {resource.state === 'CLEANING' && <form onSubmit={event => act(event, form => staff.clean(resource.id, String(form.get('reason')).trim()), 'Đã ghi nhận hoàn tất vệ sinh.')}>
      <label>Ghi chú vệ sinh<input name="reason" maxLength={500} required/></label><button disabled={busy}>Hoàn tất vệ sinh</button></form>}
    <h3>Lên lịch bảo trì</h3><form className="form-grid" onSubmit={event => act(event, form => staff.createMaintenance(resource.id, {
      start_at: facilityTime(String(form.get('start'))), end_at: facilityTime(String(form.get('end'))), reason: String(form.get('reason')).trim(),
    }), 'Đã lên lịch bảo trì.')}>
      <label>Bắt đầu (GMT+7)<input type="datetime-local" required name="start"/></label><label>Kết thúc (GMT+7)<input type="datetime-local" required name="end"/></label>
      <label className="full">Lý do bảo trì<input name="reason" maxLength={500} required/></label><div className="full"><button disabled={busy}>Lưu lịch bảo trì</button></div></form>
    <h3>Lịch bảo trì</h3><Feedback {...maintenance} retry={maintenance.reload}>{maintenance.data && <>
      {maintenance.data.maintenance.length ? <ul className="list">{maintenance.data.maintenance.map(row => <li key={row.id}><div><strong>{row.reason}</strong><small>{dateTime(row.start_at)} – {dateTime(row.end_at)}</small><span>{row.status === 'ACTIVE' ? 'Đang hiệu lực' : label(row.status)}</span></div>
      {row.status === 'ACTIVE' && Date.parse(row.end_at) > Date.now() && <form onSubmit={event => act(event, form => staff.cancelMaintenance(resource.id, row.id, String(form.get('reason')).trim()), 'Đã hủy bảo trì.')}><label>Lý do hủy<input name="reason" maxLength={500} required/></label><button className="secondary" disabled={busy}>Hủy bảo trì</button></form>}</li>)}</ul> : <Empty>Chưa có lịch bảo trì.</Empty>}
      <Pagination result={maintenance.data} change={setMaintenancePage}/></>}</Feedback>
    <h3>Lịch sử tài nguyên</h3><Feedback {...history} retry={history.reload}>{history.data && <><HistoryList rows={history.data.history}/><Pagination result={history.data} change={setHistoryPage}/></>}</Feedback>
  </section>;
}

export function StaffBooking() {
  const { id = '' } = useParams();
  const result = useLoad(useCallback(() => staff.booking(id), [id]));
  return <><Link to="/staff">Vận hành</Link><Feedback {...result} retry={result.reload}>{result.data && <>
    <header className="page-heading"><h1>Chi tiết lịch đặt</h1><Status value={result.data.booking.status}/></header>
    <BookingDetails booking={result.data.booking}/>
    {result.data.booking.status === 'CONFIRMED' && <CareActionForm key={id} bookingId={id}/>}
    {['CHECKED_IN', 'COMPLETED'].includes(result.data.booking.status) && <Link to="/care">Xem hồ sơ chăm sóc</Link>}
  </>}</Feedback></>;
}
