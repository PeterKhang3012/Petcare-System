import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PaymentPolicy } from '../../components/PaymentPolicy';
import { useAuth } from '../../contexts/AuthContext';
import { useLoad } from '../../hooks/useLoad';
import { payments } from '../../services';
import { Feedback, Status } from '../../UI/Feedback';
import { dateTime, money } from '../../utils/format';
import type { Payment } from '../../types';
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

export function PaymentReturn() {
  const { user, loading, error, retry } = useAuth();
  const location = useLocation();
  const [query] = useSearchParams();
  const id = query.get('payment_id') ?? '';
  const paymentId = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ? id : '';
  if (loading || error) return <main className="workspace"><Feedback loading={loading} error={error} retry={retry} /></main>;
  if (user?.role === 'USER') {
    return paymentId ? <Navigate to={'/payments/' + paymentId} replace /> : <main className="workspace"><PaymentLookup returned /><Link to="/">Về trang chủ</Link></main>;
  }
  return <main className="workspace">
    <section className="panel">
      <h1>Kết quả thanh toán VNPAY</h1>
      <p>Hãy dùng phiên đăng nhập của bạn để xem biên nhận và trạng thái giao dịch.</p>
      <div className="actions">
        {!user && <Link className="button" to="/login" state={{ from: location.pathname + location.search }}>Đăng nhập để xem giao dịch</Link>}
        <Link to="/">Về trang chủ</Link>
      </div>
    </section>
  </main>;
}

function PaymentReceipt({ payment }: { payment: Payment }) {
  return <><h1>Biên nhận thanh toán điện tử</h1>
    <section className="panel">
      <div className="page-heading"><h2>PawStay</h2><span className="status">Đã thanh toán</span></div>
      <dl className="details">
        <dt>Mã thanh toán</dt><dd>{payment.payment_id}</dd>
        <dt>Lịch đặt</dt><dd><Link to={'/bookings/' + payment.booking_id}>{payment.booking_id}</Link></dd>
        <dt>Phương thức</dt><dd>VNPAY</dd>
        {payment.verified_at && <><dt>Thời điểm xác nhận</dt><dd>{dateTime(payment.verified_at)}</dd></>}
        <dt>Số tiền đã thanh toán</dt><dd><strong className="amount">{money(payment.amount, payment.currency)}</strong></dd>
        {payment.booking_sync_status && <><dt>Đồng bộ lịch đặt</dt><dd><Status value={payment.booking_sync_status}/></dd></>}
        {payment.booking_sync_outcome && <><dt>Kết quả đồng bộ</dt><dd>{payment.booking_sync_outcome}</dd></>}
      </dl>
      <Link className="button" to="/">Về trang chủ</Link>
    </section>
  </>;
}

function PaymentDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [policyAccepted, setPolicyAccepted] = useState(location.state?.policyAccepted === true);
  const [resumedUrl, setResumedUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const result = useLoad(useCallback(() => payments.get(id), [id]));
  const payment = result.data;
  const pending = payment?.status === 'PENDING' && Boolean(!payment.expires_at || Date.parse(payment.expires_at) > Date.now());
  const candidateUrl: unknown = resumedUrl || location.state?.paymentUrl;
  const checkoutUrl = typeof candidateUrl === 'string' && /^https:\/\//i.test(candidateUrl) ? candidateUrl : undefined;
  const storedKey = user && payment && knownPayment(user.id, payment.booking_id) === id ? existingPaymentKey(user.id, payment.booking_id) : null;
  const canRetry = payment?.status === 'FAILED' && Date.parse(payment.expires_at ?? '') > Date.now();
  const refresh = Boolean(payment && (payment.booking_sync_status === 'PENDING' ||
    payment.status === 'PENDING' && (!payment.expires_at || Date.parse(payment.expires_at) > Date.now())));
  useEffect(() => {
    if (!refresh) return;
    const timer = window.setTimeout(result.reload, 7000);
    return () => window.clearTimeout(timer);
  }, [refresh, result.reload]);
  async function continuePayment(retry: boolean) {
    if (!payment || !user || !policyAccepted || busy) return;
    const key = retry ? 'retry-' + id : storedKey;
    if (!key) return;
    setBusy(true); setError(undefined);
    try {
      const next = await payments.create(payment.booking_id, key, policyAccepted);
      if (retry) {
        rememberPaymentKey(user.id, next.booking_id, key);
        rememberPayment(user.id, next.booking_id, next.payment_id);
        navigate('/payments/' + next.payment_id, { replace: true, state: { paymentUrl: next.payment_url, policyAccepted } });
      } else if (next.payment_id === id) {
        setResumedUrl(next.payment_url);
        result.reload();
      }
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <><Link to="/payments">Tra cứu thanh toán</Link>
    <Feedback {...result} retry={result.reload}>{payment && (payment.status === 'SUCCEEDED' ? <PaymentReceipt payment={payment} /> : <><h1>Chi tiết thanh toán</h1><section className="panel">
      <div className="page-heading"><p className="amount">{money(payment.amount, payment.currency)}</p><Status value={payment.status}/></div>
      <dl className="details"><dt>Mã thanh toán</dt><dd>{payment.payment_id}</dd><dt>Lịch đặt</dt><dd><Link to={'/bookings/' + payment.booking_id}>{payment.booking_id}</Link></dd>
      <dt>Hạn thanh toán</dt><dd>{dateTime(payment.expires_at)}</dd>
      {payment.booking_sync_status && <><dt>Đồng bộ lịch đặt</dt><dd><Status value={payment.booking_sync_status}/></dd></>}
      {payment.booking_sync_outcome && <><dt>Kết quả đồng bộ</dt><dd>{payment.booking_sync_outcome}</dd></>}
      </dl>
      {payment.status === 'PENDING' && <p>{pending ? 'Trạng thái được cập nhật khi máy chủ nhận kết quả từ VNPay.' : 'Đã qua thời hạn thanh toán của lịch này. Nếu đã chuyển tiền, hãy kiểm tra lại trạng thái.'}</p>}
      {(canRetry || (pending && (checkoutUrl || storedKey))) &&
        <PaymentPolicy accepted={policyAccepted} onChange={setPolicyAccepted} disabled={busy}/>}
      <Feedback error={error}/><div className="actions">
      {pending && checkoutUrl && (policyAccepted
        ? <a className="button" href={checkoutUrl}>Thanh toán qua VNPAY</a>
        : <button disabled>Thanh toán qua VNPAY</button>)}
      {pending && !checkoutUrl && storedKey && <button disabled={busy || !policyAccepted} onClick={() => continuePayment(false)}>Lấy lại liên kết VNPay</button>}
      {canRetry && <button disabled={busy || !policyAccepted} onClick={() => continuePayment(true)}>Thử thanh toán lại</button>}
      <button className="secondary" onClick={result.reload}>Kiểm tra trạng thái</button></div>
    </section></>)}</Feedback></>;
}
