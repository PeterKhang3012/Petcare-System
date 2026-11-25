import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLoad } from '../../hooks/useLoad';
import { catalog, type CatalogService } from '../../services/catalog';
import { Empty, Feedback, Pagination, Status } from '../../UI/Feedback';
import { dateTime, label, money } from '../../utils/format';

const price = (service: CatalogService) =>
  money(service.unit_price, service.currency) + (service.unit === 'NIGHT' ? ' / đêm' : ' / lượt');

export function CatalogPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [species, setSpecies] = useState('');
  const result = useLoad(useCallback(() => catalog.list(page, { type: type || undefined, species: species || undefined }), [page, type, species]));
  return <><h1>Danh mục dịch vụ</h1>
    <div className="toolbar"><label>Loại dịch vụ<select value={type} onChange={event => { setType(event.target.value); setPage(1); }}>
      <option value="">Tất cả</option><option value="CARE">Chăm sóc</option><option value="BOARDING">Lưu trú</option>
    </select></label><label>Loài<select value={species} onChange={event => { setSpecies(event.target.value); setPage(1); }}>
      <option value="">Tất cả</option><option value="DOG">Chó</option><option value="CAT">Mèo</option>
    </select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.services.length ? <div className="card-grid">{result.data.services.map(service => <Link className="panel pet-card" key={service.service_id} to={'/catalog/' + encodeURIComponent(service.service_id)}>
        <Status value={service.type}/><h2>{service.name}</h2><p>{service.allowed_species.map(label).join(', ')}</p><strong>{price(service)}</strong>
      </Link>)}</div> : <Empty>Không tìm thấy dịch vụ phù hợp.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
  </>;
}

export function CatalogDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const result = useLoad(useCallback(() => catalog.get(id), [id]));
  const [notice, setNotice] = useState('');
  const service = result.data?.service;
  return <><Link to="/catalog">Danh mục dịch vụ</Link>
    {notice && <p className="feedback" role="status">{notice}</p>}
    <Feedback {...result} retry={result.reload}>{service && <>
      <header className="page-heading"><h1>{service.name}</h1><Status value={service.type}/></header>
      <section className="panel"><p className="amount">{price(service)}</p><dl className="details">
        <dt>Loài</dt><dd>{service.allowed_species.map(label).join(', ')}</dd>
        <dt>Cân nặng</dt><dd>{service.min_weight_kg}–{service.max_weight_kg} kg</dd>
        {service.duration_minutes != null && <><dt>Thời lượng</dt><dd>{service.duration_minutes} phút</dd></>}
      </dl>{user?.role === 'USER' && <Link className="button" to={'/bookings/new?service=' + encodeURIComponent(id)}>Đặt dịch vụ này</Link>}</section>
      {user?.role === 'STAFF' && user.permissions.includes('UPDATE_SERVICE_PRICE') && <PriceForm key={service.price_version_id} service={service} reload={result.reload} saved={() => { setNotice('Đã cập nhật giá dịch vụ.'); result.reload(); }}/>}
      {user?.role === 'STAFF' && <PriceHistory id={id}/>}
    </>}</Feedback>
  </>;
}

function PriceForm({ service, saved, reload }: { service: CatalogService; saved: () => void; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(undefined);
    try {
      await catalog.update(service.service_id, {
        unit_price: Number(form.get('price')),
        reason: String(form.get('reason')).trim(),
        expected_price_version: service.price_version_id,
      });
      saved();
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Cập nhật giá</h2><form className="form-grid" onSubmit={submit}>
    <label>Giá mới (VND)<input name="price" type="number" step="1" min="1" max={Number.MAX_SAFE_INTEGER} defaultValue={service.unit_price} required/></label>
    <label>Lý do<input name="reason" maxLength={500} required/></label>
    <div className="full"><Feedback error={error} retry={reload}/><button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu giá mới'}</button></div>
  </form></section>;
}

function PriceHistory({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const result = useLoad(useCallback(() => catalog.history(id, page), [id, page]));
  return <section className="panel"><h2>Lịch sử giá</h2>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.history.length ? <ul className="timeline">{result.data.history.map(version => <li key={version.price_version_id}>
        <strong>{version.old_unit_price != null && money(version.old_unit_price, version.currency) + ' → '}{money(version.unit_price, version.currency)}</strong>
        <small>{dateTime(version.created_at)}</small><p>{version.reason}</p>
      </li>)}</ul> : <Empty>Chưa có phiên bản giá.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
  </section>;
}
