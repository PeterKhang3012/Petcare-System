import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLoad } from '../../hooks/useLoad';
import { payments } from '../../services';
import { Feedback, Status } from '../../UI/Feedback';
import { dateTime, money } from '../../utils/format';
import { existingPaymentKey, knownPayment, rememberPayment, rememberPaymentKey } from '../../utils/paymentStorage';

export function PaymentLookup({ returned = false }: { returned?: boolean }) {
  const { user } = useAuth();
  const latest = user && knownPayment(user.id);
  const navigate = useNavigate();
  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('id')).trim();
    navigate('/payments/' + encodeURIComponent(value));
  }
  return <><h1>{returned ? 'Kiểm tra thanh toán' : 'Thanh toán'}</h1>
    {returned && <p className="feedback">Bạn đã quay lại từ trang thanh toán. Hãy nhập mã giao dịch để kiểm tra trạng thái.</p>}
    <section className="panel"><h2>Tra cứu theo mã giao dịch</h2><form onSubmit={lookup}>
      <label>Mã thanh toán<input name="id" required pattern="[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"/></label>
      <button>Tra cứu</button>
    </form>{latest && <Link to={'/payments/' + latest}>Giao dịch gần nhất đã mở trên thiết bị</Link>}</section>
  </>;
}

export function PaymentPage() {
  const { id = '' } = useParams();
  return <PaymentDetail key={id} id={id}/>;
}

function PaymentDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [resumedUrl, setResumedUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const result = useLoad(useCallback(() => payments.get(id), [id]));
  const payment = result.data;
  const pending = payment?.status === 'PENDING' && Boolean(!payment.expires_at || Date.parse(payment.expires_at) > Date.now());
  const candidateUrl: unknown = resumedUrl || location.state?.paymentUrl;
  const checkoutUrl = typeof candidateUrl === 'string' && /^https:\/\//i.test(candidateUrl) ? candidateUrl : undefined;
  const storedKey = user && payment && knownPayment(user.id, payment.booking_id) === id ? existingPaymentKey(user.id, payment.booking_id) : null;
  const refresh = Boolean(payment && (payment.booking_sync_status === 'PENDING' ||
    payment.status === 'PENDING' && (!payment.expires_at || Date.parse(payment.expires_at) > Date.now())));
  useEffect(() => {
    if (!refresh) return;
    const timer = window.setTimeout(result.reload, 7000);
    return () => window.clearTimeout(timer);
  }, [refresh, result.reload]);
  async function continuePayment(retry: boolean) {
    if (!payment || !user) return;
    const key = retry ? 'retry-' + id : storedKey;
    if (!key) return;
    setBusy(true); setError(undefined);
    try {
      const next = await payments.create(payment.booking_id, key);
      if (retry) {
        rememberPaymentKey(user.id, next.booking_id, key);
        rememberPayment(user.id, next.booking_id, next.payment_id);
        navigate('/payments/' + next.payment_id, { replace: true, state: { paymentUrl: next.payment_url } });
      } else if (next.payment_id === id) {
        setResumedUrl(next.payment_url);
        result.reload();
      }
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <><Link to="/payments">Tra cứu thanh toán</Link><h1>Chi tiết thanh toán</h1>
    <Feedback {...result} retry={result.reload}>{payment && <section className="panel">
      <div className="page-heading"><p className="amount">{money(payment.amount, payment.currency)}</p><Status value={payment.status}/></div>
      <dl className="details"><dt>Mã thanh toán</dt><dd>{payment.payment_id}</dd><dt>Lịch đặt</dt><dd><Link to={'/bookings/' + payment.booking_id}>{payment.booking_id}</Link></dd>
      <dt>Hạn thanh toán</dt><dd>{dateTime(payment.expires_at)}</dd>
      {payment.booking_sync_status && <><dt>Đồng bộ lịch đặt</dt><dd><Status value={payment.booking_sync_status}/></dd></>}
      {payment.booking_sync_outcome && <><dt>Kết quả đồng bộ</dt><dd>{payment.booking_sync_outcome}</dd></>}
      </dl>
      {payment.status === 'PENDING' && <p>{pending ? 'Trạng thái được cập nhật khi máy chủ nhận kết quả từ VNPay.' : 'Đã qua thời hạn thanh toán của lịch này. Nếu đã chuyển tiền, hãy kiểm tra lại trạng thái.'}</p>}
      <Feedback error={error}/><div className="actions">
      {pending && checkoutUrl && <a className="button" href={checkoutUrl} target="_blank" rel="noopener noreferrer">Mở VNPay trong tab mới</a>}
      {pending && !checkoutUrl && storedKey && <button disabled={busy} onClick={() => continuePayment(false)}>Lấy lại liên kết VNPay</button>}
      {payment.status === 'FAILED' && Date.parse(payment.expires_at ?? '') > Date.now() && <button disabled={busy} onClick={() => continuePayment(true)}>Thử thanh toán lại</button>}
      <button className="secondary" onClick={result.reload}>Kiểm tra trạng thái</button></div>
    </section>}</Feedback></>;
}
