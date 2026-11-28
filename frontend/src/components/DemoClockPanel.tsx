import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { staff } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { Feedback } from '../UI/Feedback';
import type { DemoClockInput, StaffBookingDetails } from '../types';

const vietnamTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

const localInput = (value: string) => new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 19);

export function DemoClockPanel({ details }: { details: StaffBookingDetails }) {
  const { user } = useAuth();
  const [applied, setApplied] = useState<StaffBookingDetails>();
  const clock = applied?.booking.id === details.booking.id && applied.booking.status === details.booking.status
    ? applied.demo_clock : details.demo_clock;
  const booking = details.booking;
  const [tick, setTick] = useState({ clock, elapsed: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(() => localInput(booking.status === 'CHECKED_IN' ? booking.end_at :
    clock?.is_demo ? new Date(Math.min(Date.parse(clock.business_now) + 60000, Date.parse(clock.max_time || booking.end_at) - 1000)).toISOString() : booking.start_at));
  const [uncertain, setUncertain] = useState(false);
  const request = useRef<{ input: DemoClockInput; key: string } | undefined>(undefined);
  useEffect(() => {
    if (!clock || user?.role !== 'STAFF') return;
    const started = performance.now();
    setTick({ clock, elapsed: 0 });
    const timer = window.setInterval(() => setTick({ clock, elapsed: performance.now() - started }), 1000);
    return () => window.clearInterval(timer);
  }, [clock, user?.role]);
  if (!clock || user?.role !== 'STAFF') return null;
  const elapsed = tick.clock === clock ? tick.elapsed : 0;
  const time = (value: string) => vietnamTime.format(new Date(Date.parse(value) + elapsed));
  async function advance(input: DemoClockInput) {
    if (busy) return;
    if (!request.current) request.current = { input, key: crypto.randomUUID() };
    setBusy(true); setError(undefined); setNotice('');
    try {
      const updated = await staff.advanceDemo(booking.id, request.current.input, request.current.key);
      setApplied(updated);
      request.current = undefined;
      setUncertain(false);
      setNotice('Đã áp dụng giờ nghiệp vụ tại Booking. Đồng hồ tiếp tục chạy.');
    } catch (failure) {
      const final = isAxiosError(failure) && failure.response && failure.response.status < 500;
      if (final) request.current = undefined;
      setUncertain(!final);
      if (isAxiosError(failure) && failure.response?.data?.code === 'DEMO_DISABLED')
        setNotice('Demo đang tắt. Bật lại cấu hình Booking/Care để tiếp tục lượt demo.');
      else setError(failure);
    } finally { setBusy(false); }
  }
  const reception = booking.status === 'CONFIRMED' && Boolean(booking.accepted_payment_id);
  const serving = booking.status === 'CHECKED_IN' && clock.is_demo;
  const controls = clock.enabled && (reception || serving);
  return <section className="panel" aria-label="Đồng hồ demo">
    <header className="page-heading"><h2>Đồng hồ trình diễn</h2><span className="status">Demo {clock.enabled ? 'đang bật' : 'đang tắt'} · {clock.is_demo ? 'đã kích hoạt' : 'chưa kích hoạt'}</span></header>
    <dl className="details">
      <dt>Giờ thật (GMT+7)</dt><dd data-testid="demo-real-time">{time(clock.real_now)}</dd>
      <dt>Giờ nghiệp vụ (GMT+7)</dt><dd data-testid="demo-business-time">{time(clock.business_now)}</dd>
    </dl>
    {!clock.enabled ? <p className="feedback" role="status">Demo đang tắt. Bật lại cấu hình Booking/Care để tiếp tục lượt demo.</p> :
      <><p>Áp dụng giờ tại backend trước khi gửi phiếu. Giờ chọn theo GMT+7 và không được lùi; tiếp nhận, bàn giao vẫn cần xác nhận bằng phiếu.</p>
        {!controls && <p role="status">{booking.status === 'CONFIRMED' ? 'Cần khoản thanh toán được Booking chấp nhận để bắt đầu demo.' :
          booking.status === 'CHECKED_IN' ? 'Chỉ lượt đã tiếp nhận bằng đồng hồ demo mới được chỉnh giờ.' :
          'Chỉ điều khiển giờ khi lịch đã xác nhận thanh toán hoặc lượt demo đang chăm sóc.'}</p>}
        {reception && details.resource && details.resource.state !== 'READY' &&
          <p role="status">Tài nguyên {details.resource.code} đang {details.resource.state}. Cần READY và hết xung đột trước khi tiếp nhận; chỉnh giờ không bỏ qua điều kiện này.</p>}
        {controls && <form className="form-grid" onSubmit={event => { event.preventDefault(); void advance({ command: 'SET_TIME', time: new Date(selected + '+07:00').toISOString() }); }}>
          <label>Ngày/giờ mô phỏng (GMT+7)<input type="datetime-local" step="1" value={selected}
            min={clock.min_time ? localInput(clock.min_time) : undefined} max={clock.max_time ? localInput(clock.max_time) : undefined}
            onChange={event => setSelected(event.target.value)} readOnly={busy || uncertain} required/></label>
          <div><button type="submit" disabled={busy || uncertain}>Áp dụng giờ mô phỏng</button></div>
          <p className="full">{clock.min_time && clock.max_time && <>Khoảng giờ hợp lệ: {vietnamTime.format(new Date(clock.min_time))} – {vietnamTime.format(new Date(clock.max_time))}. </>}
            Nếu đồng hồ đã chạy qua mốc chọn, hãy chọn mốc phía trước.</p>
        </form>}
        <div className="actions">
          {reception && !clock.is_demo &&
            <button type="button" disabled={busy || uncertain} onClick={() => advance({ command: 'TO_APPOINTMENT' })}>Demo đến giờ hẹn</button>}
          {serving && clock.stage !== 'TO_HANDOVER' &&
            <button type="button" disabled={busy || uncertain} onClick={() => advance({ command: 'TO_HANDOVER' })}>Đến thời điểm bàn giao</button>}
        </div>
      </>}
    {uncertain && <p role="status">Chưa rõ kết quả chỉnh giờ. <button type="button" disabled={busy} onClick={() => request.current && advance(request.current.input)}>Thử lại yêu cầu chỉnh giờ</button></p>}
    {notice && <p role="status" className="feedback">{notice}</p>}<Feedback error={error}/>
  </section>;
}
