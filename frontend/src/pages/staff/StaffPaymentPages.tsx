import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLoad } from '../../hooks/useLoad';
import { staff } from '../../services';
import { Empty, Feedback, Pagination, Status } from '../../UI/Feedback';
import { dateTime, money } from '../../utils/format';

const refundStatus: Record<string, string> = {
  REQUESTED: 'Chờ STAFF xác nhận',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Đã hoàn tiền',
  REJECTED: 'Bị từ chối',
};
const checkStatus: Record<string, string> = {
  REQUESTED: 'Đã yêu cầu đối chiếu',
  AWAITING_RESPONSE: 'Đang chờ phản hồi VNPAY',
  VERIFIED: 'Đã xác minh phản hồi VNPAY',
  UNVERIFIED: 'Chưa xác minh được phản hồi VNPAY',
};

export function StaffTransactions() {
  const [page, setPage] = useState(1);
  const [exceptions, setExceptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const result = useLoad(useCallback(() => staff.transactions(page, exceptions), [page, exceptions]));
  async function reconcile(id: string) {
    setBusy(true);
    setError(undefined);
    try { await staff.reconcile(id); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); result.reload(); }
  }
  return <section className="panel"><h2>Giao dịch thanh toán</h2>
    <div className="actions">
      <button className={exceptions ? 'secondary' : ''} aria-pressed={!exceptions} onClick={() => { setExceptions(false); setPage(1); }}>Tất cả giao dịch</button>
      <button className={exceptions ? '' : 'secondary'} aria-pressed={exceptions} onClick={() => { setExceptions(true); setPage(1); }}>Ngoại lệ</button>
      <button className="secondary" onClick={result.reload}>Cập nhật</button>
    </div>
    <Feedback error={error}/>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.transactions.length > 0 ? <ul className="list">{result.data.transactions.map(item => <li key={item.payment_id}>
        <div>
          <strong>{item.payment_id}</strong>
          <small>{dateTime(item.created_at)} · <Link to={'/staff/bookings/' + item.booking_id}>Xem lịch đặt</Link></small>
          {item.sync_status && <small>Đồng bộ lịch đặt <Status value={item.sync_status}/> {item.booking_outcome}</small>}
          {item.reconciliation_result && <small>{checkStatus[item.reconciliation_result]} · {dateTime(item.requested_at ?? undefined)}
            {item.response_code && ` · Mã phản hồi ${item.response_code}`}
            {item.transaction_status && ` · Trạng thái VNPAY ${item.transaction_status}`}</small>}
        </div>
        <strong>{money(item.amount, item.currency)}</strong>
        <Status value={item.status}/>
        <button disabled={busy} onClick={() => reconcile(item.payment_id)}>Yêu cầu đối chiếu</button>
      </li>)}</ul> : <Empty>Chưa có giao dịch phù hợp.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
  </section>;
}

export function StaffRefunds() {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const result = useLoad(useCallback(() => staff.refunds(page), [page]));
  async function confirm(id: string, amount: string) {
    if (!window.confirm(`Xác nhận gửi yêu cầu hoàn ${amount} qua VNPAY Sandbox?`)) return;
    setBusy(true);
    setError(undefined);
    try { await staff.confirmRefund(id); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); result.reload(); }
  }
  return <section className="panel"><h2>Yêu cầu hoàn tiền</h2>
    <div className="actions"><button className="secondary" onClick={result.reload}>Cập nhật</button></div>
    <Feedback error={error}/>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.refunds.length > 0 ? <ul className="list">{result.data.refunds.map(item => <li key={item.event_id}>
        <div>
          <details>
            <summary>{money(item.amount, item.currency)} · {refundStatus[item.status] ?? item.status}</summary>
            <dl className="details">
              <dt>Mã yêu cầu</dt><dd>{item.event_id}</dd>
              <dt>Giao dịch gốc</dt><dd>{item.payment_id}</dd>
              <dt>Lịch đặt</dt><dd><Link to={'/staff/bookings/' + item.booking_id}>{item.booking_id}</Link></dd>
              <dt>Lý do</dt><dd>{item.reason}</dd>
              <dt>Ngày tạo</dt><dd>{dateTime(item.created_at)}</dd>
              {item.confirmed_by && <><dt>Người xác nhận</dt><dd>{item.confirmed_by} · {dateTime(item.confirmed_at ?? undefined)}</dd></>}
              {item.status === 'PROCESSING' && <><dt>Đối chiếu hoàn tiền</dt><dd>Cần đối chiếu thủ công với VNPAY khi chưa có kết quả cuối.</dd></>}
              {item.gateway_check && <><dt>Đối chiếu phản hồi</dt><dd>{checkStatus[item.gateway_check]}</dd></>}
              {item.gateway_transaction_no && <><dt>Mã giao dịch hoàn</dt><dd>{item.gateway_transaction_no}</dd></>}
              {item.gateway_response_code && <><dt>Mã phản hồi VNPAY</dt><dd>{item.gateway_response_code}</dd></>}
              {item.gateway_status && <><dt>Trạng thái VNPAY</dt><dd>{item.gateway_status}</dd></>}
            </dl>
          </details>
        </div>
        {item.status === 'REQUESTED' && <button disabled={busy} onClick={() => confirm(item.event_id, money(item.amount, item.currency))}>Xác nhận gửi VNPAY</button>}
      </li>)}</ul> : <Empty>Chưa có yêu cầu hoàn tiền.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
  </section>;
}
