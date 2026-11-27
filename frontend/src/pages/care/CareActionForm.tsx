import { useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { care } from '../../services/care';
import { Feedback } from '../../UI/Feedback';

export const requestPath = (id: string) => '/care/requests/' + encodeURIComponent(id);

export function CareActionForm({ bookingId, checkout = false }: { bookingId: string; checkout?: boolean }) {
  const request = useRef<{ fingerprint: string; id: string; input: { recipient: string; condition: string; notes: string; belongings: string[]; reason: string } } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
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
    if (!request.current || (!uncertain && request.current.fingerprint !== fingerprint))
      request.current = { fingerprint, id: crypto.randomUUID(), input: { recipient, condition, notes, belongings, reason } };
    const input = request.current.input;
    const common = { request_id: request.current.id, reason: input.reason };
    setBusy(true); setError(undefined); setValidation('');
    try {
      const outcome = checkout
        ? await care.checkOut(bookingId, { ...common, recipient_name: input.recipient, notes: input.notes, returned_belongings: input.belongings })
        : await care.checkIn(bookingId, { ...common, initial_condition: input.condition, care_instructions: input.notes, belongings: input.belongings });
      navigate(requestPath(outcome.request.request_id));
    } catch (failure) {
      const requestId = isAxiosError(failure) ? failure.response?.data?.details?.request_id : undefined;
      if (typeof requestId === 'string') navigate(requestPath(requestId));
      else {
        const final = isAxiosError(failure) && failure.response && [400, 401, 403, 404, 409, 422].includes(failure.response.status);
        if (final) request.current = undefined;
        setUncertain(!final); setError(failure);
      }
    } finally { setBusy(false); }
  }
  return <section className="panel"><h2>{checkout ? 'Bàn giao thú cưng' : 'Tiếp nhận thú cưng'}</h2>
    <form onSubmit={submit} className="form-grid">
      {checkout ? <label>Tên người nhận<input name="recipient" maxLength={100} readOnly={busy || uncertain} required/></label> :
        <label>Tình trạng lúc tiếp nhận<textarea name="condition" maxLength={2000} readOnly={busy || uncertain} required/></label>}
      <label>Lý do<input name="reason" maxLength={500} readOnly={busy || uncertain} required/></label>
      <label>{checkout ? 'Đồ dùng đã trả' : 'Đồ dùng gửi kèm'}<textarea name="belongings" readOnly={busy || uncertain} placeholder="Mỗi món một dòng"/></label>
      <label>{checkout ? 'Ghi chú bàn giao' : 'Hướng dẫn chăm sóc'}<textarea name="notes" maxLength={2000} readOnly={busy || uncertain}/></label>
      <div className="full">{validation && <p className="feedback error" role="alert">{validation}</p>}<Feedback error={error}/>
        {uncertain && <p className="feedback" role="status">Chưa xác định kết quả. Gửi lại phiếu đang chờ để kiểm tra; nội dung được giữ nguyên.</p>}
        <button disabled={busy}>{busy ? 'Đang gửi…' : uncertain ? 'Gửi lại phiếu đang chờ' : checkout ? 'Xác nhận bàn giao' : 'Xác nhận tiếp nhận'}</button></div>
    </form>
  </section>;
}
