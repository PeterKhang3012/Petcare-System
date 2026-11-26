import { useState, type FormEvent } from 'react';
import { api, data } from '../../api/client';
import { useLoad } from '../../hooks/useLoad';
import { Feedback } from '../../UI/Feedback';

interface Contact {
  hotline: string;
  address: string;
  can_edit: boolean;
}

const contactUrl = '/facility/contact';
const loadContact = () => data<Contact>(api.get(contactUrl));

export function FacilityContact() {
  const contact = useLoad(loadContact);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await api.put(contactUrl, { hotline: form.get('hotline'), address: form.get('address') });
      setEditing(false);
      contact.reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const current = contact.data;
  return <section className="panel">
    <h2>Thông tin cơ sở</h2>
    <dl className="details">
      <dt>Giờ làm việc</dt><dd>08:00–12:00 và 13:00–18:00</dd>
      {current && <>
        <dt>Hotline</dt><dd><a href={'tel:' + current.hotline}>{current.hotline}</a></dd>
        <dt>Địa chỉ</dt><dd>{current.address || 'Chưa cập nhật'}</dd>
      </>}
    </dl>
    <Feedback {...contact} retry={contact.reload} />
    {current?.can_edit && (editing ? <form className="form-grid" onSubmit={save}>
      <label>Hotline<input name="hotline" type="tel" defaultValue={current.hotline} pattern={'[+]?[0-9]{7,15}'} title="Nhập từ 7 đến 15 chữ số, có thể bắt đầu bằng dấu +" required /></label>
      <label>Địa chỉ<input name="address" defaultValue={current.address} maxLength={300} /></label>
      <div className="full"><Feedback error={error} />
        <div className="actions">
          <button disabled={busy}>Lưu thông tin</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(false); setError(undefined); }}>Hủy</button>
        </div>
      </div>
    </form> : <button type="button" className="secondary" onClick={() => setEditing(true)}>Chỉnh sửa thông tin liên hệ</button>)}
  </section>;
}
