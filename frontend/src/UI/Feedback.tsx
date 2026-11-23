import type { ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { label } from '../utils/format';
import type { Page } from '../types';

export function Feedback({ loading, error, retry, children }: { loading?: boolean; error?: unknown; retry?: () => void; children?: ReactNode }) {
  if (loading) return <p className="feedback" role="status">Đang tải dữ liệu…</p>;
  if (error) return <div className="feedback error" role="alert">{errorMessage(error)} {retry && <button onClick={retry} className="secondary">Thử lại</button>}</div>;
  return children;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="feedback empty">{children}</div>;
}

export function Status({ value }: { value: string }) {
  return <span className={'status status-' + value.toLowerCase()}>{label(value)}</span>;
}

export function Pagination({ result, change }: { result: Page; change: (page: number) => void }) {
  const pages = Math.ceil(result.total / result.limit);
  if (pages <= 1 && result.page <= 1) return null;
  return <nav className="pagination" aria-label="Phân trang">
    <button className="secondary" disabled={result.page <= 1} onClick={() => change(result.page - 1)}>Trang trước</button>
    <span>Trang {result.page} / {Math.max(1, pages)}</span>
    <button className="secondary" disabled={result.page >= pages} onClick={() => change(result.page + 1)}>Trang sau</button>
  </nav>;
}

export function HistoryList({ rows }: { rows: import('../types').History[] }) {
  if (!rows.length) return <Empty>Chưa có lịch sử.</Empty>;
  return <ul className="timeline">{rows.map(row => <li key={row.id}><strong>{label(row.action)}</strong><small>{new Date(row.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small>{row.reason && <p>{row.reason}</p>}</li>)}</ul>;
}
