import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookingDetails, BookingList } from '../../components/BookingList';
import { PaymentPolicy } from '../../components/PaymentPolicy';
import { useLoad } from '../../hooks/useLoad';
import { bookings, payments, pets } from '../../services';
import { bookingPath, bookingServices, catalog, type CatalogService } from '../../services/catalog';
import { Empty, Feedback, HistoryList, Pagination, Status } from '../../UI/Feedback';
import { useAuth } from '../../contexts/AuthContext';
import type { Booking, BookingInput, Quote } from '../../types';
import { dateTime, label, money } from '../../utils/format';
import { knownPayment, paymentKey, rememberPayment } from '../../utils/paymentStorage';
import { isAxiosError } from 'axios';

const states = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED'];
const careTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const careDate = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

export function BookingsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const result = useLoad(useCallback(() => bookings.list(page, status || undefined), [page, status]));
  return <><header className="page-heading"><h1>Lịch đặt</h1><div className="actions">
    <Link className="button" to={bookingPath('CARE')}>Đặt lịch chăm sóc</Link>
    <Link className="button secondary" to={bookingPath('BOARDING')}>Đặt lưu trú</Link>
  </div></header>
    <div className="toolbar"><label>Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      <option value="">Tất cả</option>{states.map(value => <option key={value} value={value}>{label(value)}</option>)}
    </select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <><BookingList rows={result.data.bookings} /><Pagination result={result.data} change={setPage}/></>}</Feedback>
  </>;
}

export function LegacyBookingNew() {
  const [search] = useSearchParams();
  const serviceId = search.get('service');
  const result = useLoad(useCallback(() => serviceId ? catalog.get(serviceId) : Promise.resolve(undefined), [serviceId]));
  if (!serviceId) return <Navigate to={bookingPath('CARE')} replace/>;
  if (result.data) return <Navigate to={bookingPath(result.data.service.type, serviceId)} replace/>;
  return <Feedback {...result} retry={result.reload}/>;
}

export function BookingNew({ type }: { type: CatalogService['type'] }) {
  const [petPage, setPetPage] = useState(1);
  const petList = useLoad(useCallback(() => pets.list(petPage), [petPage]));
  const catalog = useLoad(useCallback(() => bookingServices(type), [type]));
  const [search] = useSearchParams();
  const [selection, setSelection] = useState('');
  const [petId, setPetId] = useState('');
  const pet = petList.data?.pets.find(item => item.id === petId);
  const boarding = type === 'BOARDING';
  const services = (catalog.data ?? []).filter(service => !boarding || !pet
    || service.allowed_species.includes(pet.species) && pet.weight_kg >= service.min_weight_kg
      && (service.max_weight_inclusive === false ? pet.weight_kg < service.max_weight_kg : pet.weight_kg <= service.max_weight_kg));
  const selected = services.find(service => service.service_id === (selection || search.get('service'))) ?? services[0];
  const serviceId = selected?.service_id ?? '';
  const daily = selected?.unit === 'DAY';
  const [review, setReview] = useState<{ input: BookingInput; quote: Quote; available: number; key: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const retryKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const navigate = useNavigate();
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const slots = useLoad(useCallback(() => !boarding && serviceId && petId && date
    ? bookings.careSlots(date, petId, serviceId) : Promise.resolve(undefined), [boarding, serviceId, petId, date]));
  const selectedSlot = slots.data?.slots.find(slot => slot.start_at === start && slot.available > 0);
  async function quote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !serviceId || (!boarding && !selectedSlot)) return;
    const form = new FormData(event.currentTarget);
    const input: BookingInput = { pet_id: String(form.get('pet')), service_id: serviceId,
      ...(boarding ? { check_in_date: String(form.get('checkIn')), check_out_date: String(form.get('checkOut')),
        ...(daily ? { check_in_time: String(form.get('arrivalTime')), check_out_time: String(form.get('departureTime')) } : {}) } :
        { start_at: start }) };
    setError(undefined); setBusy(true); setReview(undefined);
    try {
      const [price, capacity] = await Promise.all([bookings.quote(input), bookings.availability(input)]);
      const fingerprint = JSON.stringify({ ...input, expected_price_version: price.quote.price_version_id, expected_pet_version: price.quote.pet_version });
      const key = retryKey.current?.fingerprint === fingerprint ? retryKey.current.key : crypto.randomUUID();
      retryKey.current = { fingerprint, key };
      setReview({ input, quote: price.quote, available: capacity.available.length, key });
      if (!boarding && !capacity.available.length) {
        setStart('');
        slots.reload();
      }
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  async function create() {
    if (!review) return;
    setBusy(true); setError(undefined);
    try {
      const result = await bookings.create({ ...review.input, expected_price_version: review.quote.price_version_id, expected_pet_version: review.quote.pet_version }, review.key);
      navigate('/bookings/' + result.booking.id, { replace: true });
    } catch (failure) {
      setError(failure);
      const code = isAxiosError(failure) && failure.response?.data?.code;
      if (code === 'PRICE_CHANGED' || code === 'SLOT_UNAVAILABLE' || code === 'PET_TIME_CONFLICT') {
        setReview(undefined);
        if (!boarding && code !== 'PRICE_CHANGED') {
          setStart('');
          slots.reload();
        }
      }
    } finally { setBusy(false); }
  }
  return <><Link to="/bookings">Danh sách lịch đặt</Link><h1>{boarding ? 'Đặt lưu trú' : 'Đặt lịch chăm sóc'}</h1>
    <Feedback {...catalog} retry={catalog.reload}>{catalog.data && (!catalog.data.length ? <Empty>Chưa có dịch vụ đang hoạt động.</Empty> :
    <Feedback {...petList} retry={petList.reload}>{petList.data && (petList.data.pets.length ? <>
      <form className="panel form-grid" onSubmit={quote} onChange={() => { setReview(undefined); setError(undefined); }} key={petPage}>
        <label>Thú cưng<select name="pet" value={petId} disabled={busy} onChange={event => { setPetId(event.target.value); setStart(''); }} required><option value="">Chọn thú cưng</option>{petList.data.pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
        <label>{boarding ? 'Loại chỗ lưu trú' : 'Dịch vụ chăm sóc'}<select value={serviceId} disabled={busy || !services.length} onChange={event => { setSelection(event.target.value); setStart(''); }} required>{!services.length && <option value="">Không có phòng phù hợp</option>}{services.map(service => <option key={service.service_id} value={service.service_id}>{service.name}</option>)}</select></label>
        {boarding ? <><label>Ngày nhận thú cưng<input type="date" name="checkIn" min={careDate.format(new Date())} disabled={busy} required/></label><label>Ngày trả thú cưng<input type="date" name="checkOut" min={careDate.format(new Date())} disabled={busy} required/></label>
          {daily && <>
            <label>Giờ nhận (GMT+7)<input type="time" name="arrivalTime" min="08:00" max="18:00" disabled={busy} required/></label>
            <label>Giờ trả (GMT+7)<input type="time" name="departureTime" min="08:00" max="18:00" disabled={busy} required/></label>
            <section className="full stay-rules" aria-labelledby="stay-rules-title">
              <h2 id="stay-rules-title">Quy định thời gian và cách tính phí lưu trú</h2>
              <p>Thời gian lưu trú từ 1–14 đêm. Khách có thể gửi và đón thú cưng trong khung giờ 08:00–18:00.</p>
              <h3>Ngày gửi thú cưng</h3>
              <ul>
                <li>Gửi trước 14:00: tính phí 1 ngày.</li>
                <li>Gửi từ 14:00 trở đi: tính phí nửa ngày.</li>
              </ul>
              <h3>Ngày đón thú cưng</h3>
              <ul>
                <li>Đón trước 14:00: tính phí nửa ngày.</li>
                <li>Đón từ 14:00 trở đi: tính phí 1 ngày.</li>
              </ul>
              <p>Những ngày lưu trú giữa ngày gửi và ngày đón được tính phí trọn ngày.</p>
            </section>
          </>}</> :
          <>
            <label>Ngày chăm sóc<input type="date" name="date" min={careDate.format(new Date())} value={date} disabled={busy} onChange={event => { setDate(event.target.value); setStart(''); }} required/></label>
            {petId && date && <fieldset className="full care-slots" disabled={busy}>
              <legend>Khung giờ chăm sóc (GMT+7)</legend>
              <Feedback {...slots} retry={slots.reload}>{slots.data && <div className="care-slot-grid">{slots.data.slots.map(slot => (
                <label key={slot.start_at} className="care-slot">
                  <input type="radio" name="start" value={slot.start_at} checked={start === slot.start_at} onChange={() => setStart(slot.start_at)} disabled={!slot.available} />
                  <span>{careTime.format(new Date(slot.start_at))}–{careTime.format(new Date(slot.end_at))}
                    <small>{slot.status === 'AVAILABLE' ? `Còn ${slot.available} chỗ` : slot.status === 'PET_BUSY' ? 'Thú cưng đã có lịch' : slot.status === 'FULL' ? 'Hết chỗ' : 'Ngoài thời gian đặt'}</small>
                  </span>
                </label>
              ))}</div>}</Feedback>
            </fieldset>}
          </>}
        <div className="full"><button disabled={busy || !serviceId || (!boarding && !selectedSlot)}>Kiểm tra chỗ và báo giá</button></div>
      </form><Pagination result={petList.data} change={page => { setPetPage(page); setPetId(''); setStart(''); setReview(undefined); }}/></> :
      <Empty>Hãy <Link to="/pets/new">thêm thú cưng</Link> trước khi đặt lịch.</Empty>)}</Feedback>)}</Feedback>
    <Feedback error={error} loading={busy}/>
    {review && <section className="panel"><h2>Báo giá</h2><p className="amount">{money(review.quote.total_amount, review.quote.currency)}</p>
      {boarding ? <dl className="details">
        <dt>Nhận thú cưng</dt><dd>{dateTime(review.quote.start_at)}</dd>
        <dt>Trả thú cưng</dt><dd>{dateTime(review.quote.end_at)}</dd>
        {review.quote.nights !== undefined && <><dt>Số đêm</dt><dd>{review.quote.nights}</dd></>}
        {daily && review.quote.quantity !== undefined && <><dt>Số ngày tính phí</dt><dd>{review.quote.quantity.toLocaleString('vi-VN')}</dd></>}
      </dl> : <p>{dateTime(review.quote.start_at)} – {dateTime(review.quote.end_at)}</p>}<p>{review.available ? `Hiện có ${review.available} chỗ phù hợp. Chỗ được giữ sau khi đặt lịch thành công.` : 'Hiện không còn chỗ phù hợp.'}</p>
      <button disabled={busy || !review.available} onClick={create}>Xác nhận đặt lịch</button></section>}
  </>;
}

function BookingActions({ booking, reload }: { booking: Booking; reload: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const cancelKey = useRef<{ reason: string; key: string } | null>(null);
  const paymentId = booking.accepted_payment_id || (user && knownPayment(user.id, booking.id));
  async function pay() {
    if (!user || !policyAccepted || busy) return;
    setError(undefined); setBusy(true);
    try {
      const payment = await payments.create(booking.id, paymentKey(user.id, booking.id), policyAccepted);
      rememberPayment(user.id, booking.id, payment.payment_id);
      navigate('/payments/' + payment.payment_id, { state: { paymentUrl: payment.payment_url, policyAccepted } });
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  function isLateCancellation() {
    return booking.status === 'CONFIRMED' && Date.parse(booking.start_at) - Date.now() < 24 * 60 * 60 * 1000;
  }
  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    const message = isLateCancellation()
      ? 'Còn dưới 24 giờ trước giờ hẹn. Bạn sẽ không được hoàn tiền nếu hủy. Tiếp tục hủy lịch?'
      : 'Bạn muốn hủy lịch này?';
    if (!window.confirm(message)) return;
    const value = reason.trim();
    if (cancelKey.current?.reason !== value) cancelKey.current = { reason: value, key: crypto.randomUUID() };
    setError(undefined); setBusy(true);
    try { await bookings.cancel(booking.id, value, cancelKey.current.key); reload(); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <><Feedback error={error}/>
    {booking.status === 'PENDING_PAYMENT' && !paymentId && <section className="panel">
      <PaymentPolicy accepted={policyAccepted} onChange={setPolicyAccepted} disabled={busy}/>
      <button disabled={busy || !policyAccepted} onClick={pay}>Khởi tạo thanh toán</button>
    </section>}
    {paymentId && <div className="actions"><Link className="button secondary" to={'/payments/' + paymentId}>Xem thanh toán</Link></div>}
  {booking.status === 'CANCELLED' && booking.accepted_payment_id && <p className="feedback">Lịch đã hủy. Hãy liên hệ cơ sở để đối soát khoản tiền đã thanh toán.</p>}
  {['PENDING_PAYMENT', 'CONFIRMED'].includes(booking.status) && <form className="panel" onSubmit={cancel}>
    <h2>Hủy lịch</h2>
    {isLateCancellation() && <p className="feedback">Hủy dưới 24 giờ trước giờ hẹn sẽ không được hoàn tiền.</p>}
    <label>Lý do<input maxLength={500} required value={reason} onChange={event => setReason(event.target.value)}/></label>
    <button className="secondary" disabled={busy}>Xác nhận hủy lịch</button></form>}</>;
}

export function BookingPage() {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  const result = useLoad(useCallback(() => bookings.get(id), [id]));
  const history = useLoad(useCallback(() => bookings.history(id, page), [id, page]));
  const booking = result.data?.booking;
  return <><Link to="/bookings">Danh sách lịch đặt</Link>
    <Feedback {...result} retry={result.reload}>{booking && <>
      <header className="page-heading"><h1>Chi tiết lịch đặt</h1><Status value={booking.status}/></header>
      <BookingDetails booking={booking}/><BookingActions key={id} booking={booking} reload={() => { result.reload(); history.reload(); }}/>
      <section className="panel"><h2>Lịch sử thay đổi</h2><Feedback {...history} retry={history.reload}>{history.data && <><HistoryList rows={history.data.history}/><Pagination result={history.data} change={setPage}/></>}</Feedback></section>
    </>}</Feedback></>;
}
