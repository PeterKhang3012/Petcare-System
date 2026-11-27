import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { staff } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { Feedback } from '../UI/Feedback';
import type { DemoCommand, StaffBookingDetails } from '../types';

const vietnamTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function DemoClockPanel({ details, onChange }: { details: StaffBookingDetails; onChange: () => void }) {
  const { user } = useAuth();
  const clock = details.demo_clock;
  const [tick, setTick] = useState({ clock, elapsed: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const request = useRef<{ command: DemoCommand; key: string } | undefined>(undefined);
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
  async function advance(command: DemoCommand) {
    if (busy) return;
    if (request.current?.command !== command) request.current = { command, key: crypto.randomUUID() };
    setBusy(true); setError(undefined); setNotice('');
    try {
      await staff.advanceDemo(details.booking.id, command, request.current.key);
      request.current = undefined;
      onChange();
    } catch (failure) {
      if (isAxiosError(failure) && failure.response && failure.response.status < 500) request.current = undefined;
      if (isAxiosError(failure) && failure.response?.data?.code === 'DEMO_DISABLED')
        setNotice('Demo đang tắt. Bật lại cấu hình Booking/Care để tiếp tục lượt demo.');
      else setError(failure);
    } finally { setBusy(false); }
  }
  const booking = details.booking;
  return <section className="panel" aria-label="Đồng hồ demo">
    <header className="page-heading"><h2>Đồng hồ trình diễn</h2><span className="status">Chế độ demo</span></header>
    <dl className="details">
      <dt>Giờ thật (GMT+7)</dt><dd data-testid="demo-real-time">{time(clock.real_now)}</dd>
      <dt>Giờ nghiệp vụ (GMT+7)</dt><dd data-testid="demo-business-time">{time(clock.business_now)}</dd>
    </dl>
    {!clock.enabled ? <p className="feedback" role="status">Demo đang tắt. Bật lại cấu hình Booking/Care để tiếp tục lượt demo.</p> :
      <><p>Các nút chỉ chuyển giờ. Tiếp nhận và bàn giao vẫn cần xác nhận bằng phiếu bên dưới.</p>
        <div className="actions">
          {booking.status === 'CONFIRMED' && booking.accepted_payment_id && !clock.is_demo &&
            <button type="button" disabled={busy} onClick={() => advance('TO_APPOINTMENT')}>Demo đến giờ hẹn</button>}
          {booking.status === 'CHECKED_IN' && clock.is_demo && clock.stage !== 'TO_HANDOVER' &&
            <button type="button" disabled={busy} onClick={() => advance('TO_HANDOVER')}>Đến thời điểm bàn giao</button>}
        </div>
      </>}
    {notice && <p role="alert" className="feedback error">{notice}</p>}<Feedback error={error}/>
  </section>;
}
