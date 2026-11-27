import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookingDetails, BookingList } from '../../components/BookingList';
import { PaymentPolicy } from '../../components/PaymentPolicy';
import { useLoad } from '../../hooks/useLoad';
import { bookings, payments, pets } from '../../services';
import { bookingServices } from '../../services/catalog';
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
  return <><header className="page-heading"><h1>Lịch đặt</h1><Link className="button" to="/bookings/new">Đặt lịch chăm sóc</Link></header>
    <div className="toolbar"><label>Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      <option value="">Tất cả</option>{states.map(value => <option key={value} value={value}>{label(value)}</option>)}
    </select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <><BookingList rows={result.data.bookings} /><Pagination result={result.data} change={setPage}/></>}</Feedback>
  </>;
}

export function BookingNew() {
  const [petPage, setPetPage] = useState(1);
  const petList = useLoad(useCallback(() => pets.list(petPage), [petPage]));
  const catalog = useLoad(bookingServices);
  const [search] = useSearchParams();
  const [selection, setSelection] = useState('');
  const services = catalog.data ?? [];
  const selected = services.find(service => service.service_id === (selection || search.get('service'))) ?? services[0];
  const serviceId = selected?.service_id ?? '';
  const [review, setReview] = useState<{ input: BookingInput; quote: Quote; available: number; key: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const retryKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const navigate = useNavigate();
  const boarding = selected?.type === 'BOARDING';
  const [petId, setPetId] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const slots = useLoad(useCallback(() => !boarding && serviceId && petId && date
    ? bookings.careSlots(date, petId, serviceId) : Promise.resolve(undefined), [boarding, serviceId, petId, date]));
  const selectedSlot = slots.data?.slots.find(slot => slot.start_at === start && slot.available > 0);
  async function quote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!boarding && !selectedSlot) return;
    const form = new FormData(event.currentTarget);
    const input: BookingInput = { pet_id: String(form.get('pet')), service_id: serviceId,
      ...(boarding ? { check_in_date: String(form.get('checkIn')), check_out_date: String(form.get('checkOut')) } :
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
  return <><Link to="/bookings">Danh sách lịch đặt</Link><h1>Đặt lịch chăm sóc</h1>
    <Feedback {...catalog} retry={catalog.reload}>{catalog.data && (!services.length ? <Empty>Chưa có dịch vụ đang hoạt động.</Empty> :
    <Feedback {...petList} retry={petList.reload}>{petList.data && (petList.data.pets.length ? <>
      <form className="panel form-grid" onSubmit={quote} onChange={() => { setReview(undefined); setError(undefined); }} key={petPage}>
        <label>Thú cưng<select name="pet" value={petId} disabled={busy} onChange={event => { setPetId(event.target.value); setStart(''); }} required><option value="">Chọn thú cưng</option>{petList.data.pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
        <label>Dịch vụ<select value={serviceId} disabled={busy} onChange={event => { setSelection(event.target.value); setStart(''); }} required>{services.map(service => <option key={service.service_id} value={service.service_id}>{service.name}</option>)}</select></label>
        {boarding ? <><label>Ngày nhận thú cưng<input type="date" name="checkIn" required/></label><label>Ngày trả thú cưng<input type="date" name="checkOut" required/></label></> :
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
        <div className="full"><button disabled={busy || (!boarding && !selectedSlot)}>Kiểm tra chỗ và báo giá</button></div>
      </form><Pagination result={petList.data} change={page => { setPetPage(page); setPetId(''); setStart(''); setReview(undefined); }}/></> :
      <Empty>Hãy <Link to="/pets/new">thêm thú cưng</Link> trước khi đặt lịch.</Empty>)}</Feedback>)}</Feedback>
    <Feedback error={error} loading={busy}/>
    {review && <section className="panel"><h2>Báo giá</h2><p className="amount">{money(review.quote.total_amount, review.quote.currency)}</p>
      <p>{dateTime(review.quote.start_at)} – {dateTime(review.quote.end_at)}</p><p>{review.available ? `Hiện có ${review.available} chỗ phù hợp. Chỗ được giữ sau khi đặt lịch thành công.` : 'Hiện không còn chỗ phù hợp.'}</p>
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
  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || !window.confirm('Bạn muốn hủy lịch này?')) return;
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
    <h2>Hủy lịch</h2><label>Lý do<input maxLength={500} required value={reason} onChange={event => setReason(event.target.value)}/></label>
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
