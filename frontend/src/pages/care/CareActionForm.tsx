import { useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { care } from '../../services/care';
import { Feedback } from '../../UI/Feedback';

export const requestPath = (id: string) => '/care/requests/' + encodeURIComponent(id);

export function CareActionForm({ bookingId, checkout = false }: { bookingId: string; checkout?: boolean }) {
  const request = useRef<{ fingerprint: string; id: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [validation, setValidation] = useState('');
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? '').trim();
    const belongings = get('belongings').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (belongings.length > 20 || belongings.some(item => item.length > 100)) {
      setValidation('Nhập tối đa 20 món, mỗi dòng tối đa 100 ký tự.');
      return;
    }
    const recipient = get('recipient');
    const condition = get('condition');
    const notes = get('notes');
    const reason = get('reason');
    const fingerprint = JSON.stringify({ recipient, condition, notes, belongings, reason });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    const common = { request_id: request.current.id, reason };
    setBusy(true); setError(undefined); setValidation('');
    try {
      const outcome = checkout
        ? await care.checkOut(bookingId, { ...common, recipient_name: recipient, notes, returned_belongings: belongings })
        : await care.checkIn(bookingId, { ...common, initial_condition: condition, care_instructions: notes, belongings });
      navigate(requestPath(outcome.request.request_id));
    } catch (failure) {
      const requestId = isAxiosError(failure) ? failure.response?.data?.details?.request_id : undefined;
      if (typeof requestId === 'string') navigate(requestPath(requestId));
      else setError(failure);
    } finally { setBusy(false); }
  }
  return <section className="panel"><h2>{checkout ? 'Bàn giao thú cưng' : 'Tiếp nhận thú cưng'}</h2>
    <form onSubmit={submit} className="form-grid">
      {checkout ? <label>Tên người nhận<input name="recipient" maxLength={100} required/></label> :
        <label>Tình trạng lúc tiếp nhận<textarea name="condition" maxLength={2000} required/></label>}
      <label>Lý do<input name="reason" maxLength={500} required/></label>
      <label>{checkout ? 'Đồ dùng đã trả' : 'Đồ dùng gửi kèm'}<textarea name="belongings" placeholder="Mỗi món một dòng"/></label>
      <label>{checkout ? 'Ghi chú bàn giao' : 'Hướng dẫn chăm sóc'}<textarea name="notes" maxLength={2000}/></label>
      <div className="full">{validation && <p className="feedback error" role="alert">{validation}</p>}<Feedback error={error}/>
        <button disabled={busy}>{busy ? 'Đang gửi…' : checkout ? 'Xác nhận bàn giao' : 'Xác nhận tiếp nhận'}</button></div>
    </form>
  </section>;
}
