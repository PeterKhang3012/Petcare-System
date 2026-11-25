import { useCallback, useRef, useState, type FormEvent } from 'react';
import { care, activities, type Activity, type CareLog } from '../../services/care';
import { useLoad } from '../../hooks/useLoad';
import { Empty, Feedback, Pagination } from '../../UI/Feedback';
import { dateTime } from '../../utils/format';

export function CareLogs({ id, editable, canAdd }: { id: string; editable: boolean; canAdd: boolean }) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string>();
  const [notice, setNotice] = useState('');
  const result = useLoad(useCallback(() => care.logs(id, page), [id, page]));
  const saved = () => {
    setNotice(editing ? 'Đã lưu chỉnh sửa nhật ký.' : 'Đã thêm nhật ký chăm sóc.');
    setEditing(undefined);
    result.reload();
  };
  return <section className="panel"><h2>Nhật ký chăm sóc</h2>
    {notice && <p role="status" className="feedback">{notice}</p>}
    {canAdd && <LogForm id={id} saved={saved}/>}
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.logs.length ? <ul className="timeline">{result.data.logs.map(log => <li key={log.id}>
        <strong>{activities[log.activity]}</strong><small>{dateTime(log.created_at)} · Phiên bản {log.version}</small><p>{log.notes}</p>
        {Boolean(log.edits?.length) && <details><summary>Lịch sử chỉnh sửa</summary><ul className="timeline">{log.edits.map(edit => <li key={edit.from_version}>
          <small>{dateTime(edit.at)}</small><p>{edit.reason}</p>
          <p>Trước: {activities[edit.before.activity]} · {edit.before.notes}</p>
          <p>Sau: {activities[edit.after.activity]} · {edit.after.notes}</p>
        </li>)}</ul></details>}
        {editable && (editing === log.id ? <><LogForm key={log.version} id={id} log={log} saved={saved} reload={result.reload}/>
          <button type="button" className="secondary" onClick={() => setEditing(undefined)}>Hủy chỉnh sửa</button></> :
          <button type="button" className="secondary" onClick={() => setEditing(log.id)}>Sửa nhật ký</button>)}
      </li>)}</ul> : <Empty>Chưa có nhật ký chăm sóc.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
  </section>;
}

function LogForm({ id, log, saved, reload }: { id: string; log?: CareLog; saved: () => void; reload?: () => void }) {
  const request = useRef<{ fingerprint: string; id: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const input = { activity: form.get('activity') as Activity, notes: String(form.get('notes')).trim() };
    setBusy(true); setError(undefined);
    try {
      if (log) {
        await care.editLog(id, log.id, { ...input, expected_version: log.version, reason: String(form.get('reason')).trim() });
      } else {
        const fingerprint = JSON.stringify(input);
        if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
        await care.addLog(id, { ...input, request_id: request.current.id });
        request.current = undefined;
        element.reset();
      }
      saved();
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="form-grid">
    <label>Hoạt động<select name="activity" defaultValue={log?.activity}>{Object.entries(activities).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
    <label>Ghi chú<textarea name="notes" defaultValue={log?.notes} maxLength={2000} required/></label>
    {log && <label>Lý do chỉnh sửa<input name="reason" maxLength={500} required/></label>}
    <div className="full"><Feedback error={error} retry={reload}/><button disabled={busy}>{busy ? 'Đang lưu…' : log ? 'Lưu chỉnh sửa' : 'Thêm nhật ký'}</button></div>
  </form>;
}
