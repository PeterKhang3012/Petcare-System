import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLoad } from '../../hooks/useLoad';
import { catalog, type CatalogService, type PriceRule } from '../../services/catalog';
import { Empty, Feedback, Pagination, Status } from '../../UI/Feedback';
import { dateTime, label, money } from '../../utils/format';

const price = (service: CatalogService) =>
  (service.price_rules?.length ? 'Từ ' + money(Math.min(...service.price_rules.map(rule => rule.unit_price)), service.currency) : money(service.unit_price, service.currency)) +
  (service.unit === 'NIGHT' ? ' / đêm' : ' / lượt');

const weightRange = (rule: PriceRule) => rule.min_weight_kg === 0 ? `Dưới ${rule.max_weight_kg} kg` :
  `${rule.min_weight_kg} đến ${rule.max_inclusive ? '' : 'dưới '}${rule.max_weight_kg} kg`;
const ruleLabel = (rule: PriceRule) => [label(rule.species), weightRange(rule), rule.coat_type === 'SHORT' ? 'Lông ngắn' : rule.coat_type === 'LONG' ? 'Lông dài' : 'Lông ngắn hoặc dài'].join(' · ');

function PriceTable({ rules, currency }: { rules: PriceRule[]; currency: string }) {
  return <section className="panel"><h2>Bảng giá theo thú cưng</h2>
    {(['DOG', 'CAT'] as const).map(species => {
      const groups = new Map<string, PriceRule[]>();
      for (const rule of rules.filter(rule => rule.species === species).sort((a, b) => a.min_weight_kg - b.min_weight_kg)) {
        const range = weightRange(rule);
        const group = groups.get(range) ?? [];
        group.push(rule);
        groups.set(range, group);
      }
      if (!groups.size) return null;
      const separateCoats = rules.some(rule => rule.species === species && rule.coat_type);
      const columns = separateCoats
        ? [{ coat: 'SHORT', title: 'Lông ngắn' }, { coat: 'LONG', title: 'Lông dài' }]
        : [{ coat: undefined, title: 'Lông ngắn hoặc dài' }];
      return <div className="catalog-price-group" key={species}>
        <table className="catalog-price-table">
          <caption>{label(species)} <span>Giá mỗi lượt</span></caption>
          <thead><tr><th scope="col">Cân nặng</th>{columns.map(column => <th scope="col" key={column.title}>{column.title}</th>)}</tr></thead>
          <tbody>{[...groups].map(([range, group]) => <tr key={range}>
            <th scope="row">{range}</th>
            {columns.map(column => {
              const rule = group.find(rule => rule.coat_type === column.coat) ?? group.find(rule => !rule.coat_type);
              return <td key={column.title}>{rule ? money(rule.unit_price, currency) : '—'}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>;
    })}
  </section>;
}

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
        {!service.price_rules?.length && <><dt>Cân nặng</dt><dd>{service.min_weight_kg}–{service.max_weight_kg} kg</dd></>}
        {service.duration_minutes != null && <><dt>Thời lượng</dt><dd>{service.duration_minutes} phút</dd></>}
      </dl>{user?.role === 'USER' && <Link className="button" to={'/bookings/new?service=' + encodeURIComponent(id)}>Đặt dịch vụ này</Link>}</section>
      {Boolean(service.price_rules?.length) && <PriceTable rules={service.price_rules!} currency={service.currency}/>}
      {user?.role === 'STAFF' && user.permissions.includes('UPDATE_SERVICE_PRICE') && <PriceForm key={service.price_version_id} service={service} reload={result.reload} saved={() => { setNotice('Đã cập nhật giá dịch vụ.'); result.reload(); }}/>}
      {user?.role === 'STAFF' && <PriceHistory id={id} rules={service.price_rules}/>}
    </>}</Feedback>
  </>;
}

function PriceForm({ service, saved, reload }: { service: CatalogService; saved: () => void; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [ruleId, setRuleId] = useState(service.price_rules?.[0]?.price_rule_id);
  const rule = service.price_rules?.find(item => item.price_rule_id === ruleId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(undefined);
    try {
      await catalog.update(service.service_id, {
        unit_price: Number(form.get('price')),
        reason: String(form.get('reason')).trim(),
        expected_price_version: service.price_version_id,
        price_rule_id: ruleId,
      });
      saved();
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Cập nhật giá</h2><form className="form-grid" onSubmit={submit}>
    {rule && <label>Nhóm giá<select value={ruleId} onChange={event => setRuleId(event.target.value)}>{service.price_rules?.map(item => <option key={item.price_rule_id} value={item.price_rule_id}>{ruleLabel(item)}</option>)}</select></label>}
    <label>Giá mới (VND)<input key={ruleId} name="price" type="number" step="1" min="1" max={Number.MAX_SAFE_INTEGER} defaultValue={rule?.unit_price ?? service.unit_price} required/></label>
    <label>Lý do<input name="reason" maxLength={500} required/></label>
    <div className="full"><Feedback error={error} retry={reload}/><button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu giá mới'}</button></div>
  </form></section>;
}

function PriceHistory({ id, rules }: { id: string; rules?: PriceRule[] }) {
  const [page, setPage] = useState(1);
  const result = useLoad(useCallback(() => catalog.history(id, page), [id, page]));
  return <section className="panel"><h2>Lịch sử giá</h2>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {result.data.history.length ? <ul className="timeline">{result.data.history.map(version => {
        const rule = rules?.find(item => item.price_rule_id === version.price_rule_id);
        return <li key={version.price_version_id}>
        {rule && <p>{ruleLabel(rule)}</p>}
        <strong>{version.old_unit_price != null && money(version.old_unit_price, version.currency) + ' → '}{money(version.unit_price, version.currency)}</strong>
        <small>{dateTime(version.created_at)}</small><p>{version.reason}</p>
      </li>; })}</ul> : <Empty>Chưa có phiên bản giá.</Empty>}
      <Pagination result={result.data} change={setPage}/>
    </>}</Feedback>
  </section>;
}
