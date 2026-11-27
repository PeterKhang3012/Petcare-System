import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BookingDetails, BookingList } from '../../components/BookingList';
import { DemoClockPanel } from '../../components/DemoClockPanel';
import { StaffRefunds, StaffTransactions } from './StaffPaymentPages';
import { CareActionForm } from '../care/CareActionForm';
import { staff } from '../../services';
import { useLoad } from '../../hooks/useLoad';
import { Empty, Feedback, HistoryList, Pagination, Status } from '../../UI/Feedback';
import type { Resource } from '../../types';
import { dateTime, facilityTime, label } from '../../utils/format';

export function StaffPage() {
  const [search, setSearch] = useSearchParams();
  const view = search.get('view') ?? 'care';
  const group = search.get('group') === 'BOARDING' ? 'BOARDING' : 'CARE';
  const views = [
    ['care', 'Lịch chăm sóc và vệ sinh'],
    ['boarding', 'Lịch lưu trú'],
    ['resources', 'Tài nguyên'],
    ['transactions', 'Giao dịch'],
    ['refunds', 'Hoàn tiền'],
  ];
  return <><h1>Vận hành</h1><div className="actions">
    {views.map(([id, title]) => <button key={id} aria-pressed={view === id}
      className={view === id ? '' : 'secondary'} onClick={() => setSearch({ view: id })}>{title}</button>)}
  </div>
    {view === 'care' && <Schedule key="CARE" group="CARE"/>}
    {view === 'boarding' && <Schedule key="BOARDING" group="BOARDING"/>}
    {view === 'resources' && <>
      <div className="actions" role="group" aria-label="Nhóm tài nguyên">
        <button aria-pressed={group === 'CARE'} className={group === 'CARE' ? '' : 'secondary'}
          onClick={() => setSearch({ view, group: 'CARE' })}>Vị trí chăm sóc và vệ sinh</button>
        <button aria-pressed={group === 'BOARDING'} className={group === 'BOARDING' ? '' : 'secondary'}
          onClick={() => setSearch({ view, group: 'BOARDING' })}>Phòng lưu trú</button>
      </div>
      <Resources key={group} group={group}/>
    </>}
    {view === 'transactions' && <StaffTransactions/>}
    {view === 'refunds' && <StaffRefunds/>}
  </>;
}

function Schedule({ group }: { group: Resource['group'] }) {
  const [filters, setFilters] = useState<{ from?: string; to?: string }>({});
  const [page, setPage] = useState(1);
  const result = useLoad(useCallback(() => staff.schedule(page, filters.from, filters.to, group), [page, filters, group]));
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

function Resources({ group }: { group: Resource['group'] }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState('');
  const [selected, setSelected] = useState<Resource | null>(null);
  const result = useLoad(useCallback(() => staff.resources(page, group, state || undefined), [page, group, state]));
  const resource = result.data?.resources.find(row => row.id === selected?.id) ?? selected;
  return <><div className="toolbar"><label>Trạng thái<select value={state} onChange={event => { setState(event.target.value); setPage(1); setSelected(null); }}><option value="">Tất cả</option>{['READY','OCCUPIED','CLEANING','OUT_OF_SERVICE'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <>{result.data.resources.length ? <ul className="panel list">{result.data.resources.map(row => <li key={row.id}><button className="secondary" aria-pressed={selected?.id === row.id} onClick={() => setSelected(row)}>{row.code}</button><Status value={row.state}/></li>)}</ul> : <Empty>Không tìm thấy tài nguyên phù hợp.</Empty>}
    <Pagination result={result.data} change={value => { setPage(value); setSelected(null); }}/></>}</Feedback>
    {resource && <ResourcePanel key={resource.id} resource={resource} onChange={result.reload}/>}
  </>;
}

function ResourceAllocations({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const result = useLoad(useCallback(() => staff.allocations(id, page), [id, page]));
  return <><h3>Lịch phân bổ sắp tới</h3>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.allocations.length ? <ul className="list">{result.data.allocations.map(item => <li key={item.id}>
        <span>{item.booking_id ? <Link to={'/staff/bookings/' + item.booking_id}>Xem lịch đặt</Link> : 'Bảo trì'}</span>
        <span>{dateTime(item.start_at)} – {dateTime(item.end_at)}</span>
      </li>)}</ul> : <Empty>Chưa có lịch phân bổ.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
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
    {resource.room_tier && <dl className="details">
      <dt>Loại phòng</dt><dd>{resource.species?.map(label).join(', ')} · {resource.room_tier}</dd>
      <dt>Giới hạn cân nặng</dt><dd>{resource.max_weight_inclusive ? 'Tối đa' : 'Dưới'} {resource.max_weight_kg} kg</dd>
      {resource.dimensions_cm && <><dt>Kích thước tham khảo</dt><dd>{resource.dimensions_cm.join(' × ')} cm</dd></>}
    </dl>}
    <ResourceAllocations key={resource.id} id={resource.id}/>
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

function BookingContact({ id }: { id: string }) {
  const result = useLoad(useCallback(() => staff.bookingContact(id), [id]));
  const contact = result.data?.contact;
  return <section className="panel">
    <h2>Liên hệ khách hàng</h2>
    <Feedback {...result} retry={result.reload}>{contact && <dl className="details">
      <dt>Họ tên</dt><dd>{contact.full_name || 'Chưa có thông tin'}</dd>
      <dt>Số điện thoại</dt><dd>{contact.phone ? <a href={'tel:' + contact.phone}>{contact.phone}</a> : 'Chưa có thông tin'}</dd>
    </dl>}</Feedback>
  </section>;
}

function StaffCancellation({ id, priceGroup, reload }: { id: string; priceGroup?: string; reload: () => void }) {
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const previous = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('reason')).trim();
    const details = { reason, species: String(form.get('species')), weight_kg: Number(form.get('weight')),
      coat_type: String(form.get('coat')), customer_agreed: form.has('customerAgreed') };
    if (!reason || !window.confirm('Xác nhận hủy lịch và tạo yêu cầu hoàn 100%?')) return;
    const fingerprint = JSON.stringify(mismatch ? details : { reason });
    if (previous.current?.fingerprint !== fingerprint) previous.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError(undefined);
    try {
      if (mismatch) await staff.cancelPriceGroupBooking(id, details, previous.current.key);
      else await staff.cancelFacilityBooking(id, reason, previous.current.key);
      reload();
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <form className="panel" onSubmit={cancel}>
    <h2>Hủy lịch do ngoại lệ</h2>
    {priceGroup && <label>Trường hợp<select disabled={busy} value={mismatch ? 'group' : 'facility'} onChange={event => setMismatch(event.target.value === 'group')}>
      <option value="facility">Cơ sở không thể phục vụ</option>
      <option value="group">Sai lệch nhóm giá khi tiếp nhận</option>
    </select></label>}
    {mismatch && <>
      <label>Loài thực tế<select name="species" required><option value="">Chọn loài</option><option value="DOG">Chó</option><option value="CAT">Mèo</option></select></label>
      <label>Cân nặng thực tế (kg)<input type="number" name="weight" min="0.01" step="any" required/></label>
      <label>Loại lông thực tế<select name="coat" required><option value="">Chọn loại lông</option><option value="SHORT">Ngắn</option><option value="LONG">Dài</option></select></label>
      <label className="staff-agreement"><input type="checkbox" name="customerAgreed" required/>Khách đã đồng ý hủy để đặt lại hoặc dừng sử dụng dịch vụ.</label>
    </>}
    <Feedback error={error}/>
    <label>Lý do<input name="reason" maxLength={500} required/></label>
    <button className="secondary" disabled={busy}>Hủy lịch và tạo yêu cầu hoàn tiền</button>
  </form>;
}

function RoomTransfer({ id, reload }: { id: string; reload: () => void }) {
  const result = useLoad(useCallback(() => staff.roomOptions(id), [id]));
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const room = String(form.get('room'));
    const reason = String(form.get('reason')).trim();
    if (busy || !room || !reason) return;
    const fingerprint = JSON.stringify([room, reason]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError(undefined);
    try {
      await staff.transferRoom(id, room, reason, request.current.key);
      result.reload();
      reload();
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Điều chuyển phòng</h2>
    <Feedback error={error}/>
    <Feedback {...result} retry={result.reload}>{result.data && (result.data.resources.length ? <form onSubmit={submit}>
      <label>Phòng thay thế<select name="room" required disabled={busy}><option value="">Chọn phòng</option>
        {result.data.resources.map(room => <option key={room.id} value={room.id}>{room.code}</option>)}</select></label>
      <label>Lý do<input name="reason" maxLength={500} required disabled={busy}/></label>
      <button disabled={busy}>Xác nhận điều chuyển</button>
    </form> : <Empty>Chưa có phòng phù hợp cho toàn bộ lịch đặt.</Empty>)}</Feedback>
  </section>;
}

export function StaffBooking() {
  const { id = '' } = useParams();
  const result = useLoad(useCallback(() => staff.booking(id), [id]));
  const group = result.data?.booking.service_snapshot?.type;
  const schedule = group === 'BOARDING' ? 'boarding' : 'care';
  return <><Link to={'/staff?view=' + schedule}>Vận hành</Link><Feedback {...result} retry={result.reload}>{result.data && <>
    <header className="page-heading"><h1>Chi tiết lịch đặt</h1><div className="actions">{group && <Status value={group}/>}<Status value={result.data.booking.status}/></div></header>
    <BookingDetails booking={result.data.booking}/>
    {result.data.resource && <section className="panel">
      <h2>{group === 'BOARDING' ? 'Phòng được phân bổ' : 'Vị trí được phân bổ'}</h2>
      <p>{result.data.resource.code}</p>
    </section>}
    {result.data.booking.status === 'CONFIRMED' && result.data.booking.service_snapshot?.room_tier &&
      <RoomTransfer key={id} id={id} reload={result.reload}/>}
    <DemoClockPanel details={result.data} onChange={result.reload}/>
    <BookingContact key={id} id={id}/>
    {result.data.booking.status === 'CONFIRMED' && <>
      {!(result.data.demo_clock?.is_demo && !result.data.demo_clock.enabled) && <CareActionForm key={id} bookingId={id}/>}
      <StaffCancellation key={id + '-cancel'} id={id} priceGroup={result.data.booking.service_snapshot?.price_rule_id} reload={result.reload}/>
    </>}
    {['CHECKED_IN', 'COMPLETED'].includes(result.data.booking.status) && <Link to="/care">Xem hồ sơ chăm sóc</Link>}
  </>}</Feedback></>;
}
