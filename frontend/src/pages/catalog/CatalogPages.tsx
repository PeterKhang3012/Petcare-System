import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLoad } from '../../hooks/useLoad';
import { bookingPath, bookingServices, catalog, type CatalogService, type PriceRule } from '../../services/catalog';
import { Empty, Feedback, Pagination, Status } from '../../UI/Feedback';
import { dateTime, label, money } from '../../utils/format';

const price = (service: CatalogService) =>
  (service.price_rules?.length ? 'Từ ' + money(Math.min(...service.price_rules.map(rule => rule.unit_price)), service.currency) : money(service.unit_price, service.currency)) +
  (service.unit === 'DAY' ? ' / ngày' : service.unit === 'NIGHT' ? ' / đêm' : ' / lượt');

const weightRange = (rule: PriceRule) => rule.min_weight_kg === 0 ? `Dưới ${rule.max_weight_kg} kg` :
  `${rule.min_weight_kg} đến ${rule.max_inclusive ? '' : 'dưới '}${rule.max_weight_kg} kg`;
const ruleLabel = (rule: PriceRule) => [label(rule.species), weightRange(rule), rule.coat_type === 'SHORT' ? 'Lông ngắn' : rule.coat_type === 'LONG' ? 'Lông dài' : undefined].filter(Boolean).join(' · ');

function StayPriceTable({ service }: { service: CatalogService }) {
  return <section className="panel"><h2>Bảng giá theo cân nặng</h2>
    <div className="catalog-price-group"><table className="catalog-price-table">
      <caption>{service.name} <span>{service.unit === 'NIGHT' ? 'Giá mỗi đêm' : 'Giá mỗi ngày'}</span></caption>
      <thead><tr><th scope="col">Cân nặng</th><th scope="col">Đơn giá</th></tr></thead>
      <tbody>{service.price_rules?.map(rule => <tr key={rule.price_rule_id}>
        <th scope="row">{weightRange(rule)}</th><td>{money(rule.unit_price, service.currency)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

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

const staySpecies = ['DOG', 'CAT'] as const;
const roomTiers = ['S', 'M', 'L', 'XL'];

export function StayCatalog() {
  const { user } = useAuth();
  const result = useLoad(useCallback(() => bookingServices('BOARDING'), []));
  const services = result.data ?? [];
  return <><Link to="/catalog">Danh mục dịch vụ</Link>
    <header className="page-heading"><h1>Stay · Lưu trú</h1>
      {user?.role === 'USER' && services.length > 0 &&
        <Link className="button" to={bookingPath('BOARDING')}>Đặt dịch vụ</Link>}
    </header>
    <Feedback {...result} retry={result.reload}>{result.data && (services.length ? <>
      {staySpecies.map(species => {
        const rooms = services.filter(service => service.room_tier && service.allowed_species.includes(species))
          .sort((a, b) => roomTiers.indexOf(a.room_tier ?? '') - roomTiers.indexOf(b.room_tier ?? ''));
        if (!rooms.length) return null;
        const bands = [...new Map(rooms.flatMap(room => room.price_rules ?? []).map(rule => [weightRange(rule), rule])).entries()]
          .sort((a, b) => a[1].min_weight_kg - b[1].min_weight_kg);
        return <section className="panel" key={species}>
          <div className="stay-price-scroll" tabIndex={0} role="region" aria-label={`Bảng giá lưu trú cho ${label(species)}`}>
            <table className="catalog-price-table stay-price-table">
              <caption>{species === 'DOG' ? 'Dog Stay' : 'Cat Stay'} <span>Đơn giá mỗi ngày · Gồm thức ăn cơ bản</span></caption>
              <thead><tr><th scope="col">Hạng phòng</th>{bands.map(([range]) => <th scope="col" key={range}>{range}</th>)}</tr></thead>
              <tbody>{rooms.map(room => <tr key={room.service_id}>
                <th scope="row">{user?.role === 'STAFF'
                  ? <Link to={'/catalog/' + encodeURIComponent(room.service_id)}>{room.room_tier}</Link> : room.room_tier}</th>
                {bands.map(([range]) => {
                  const rule = room.price_rules?.find(rule => weightRange(rule) === range);
                  return <td key={range}>{rule ? money(rule.unit_price, room.currency) : '—'}</td>;
                })}
              </tr>)}</tbody>
            </table>
          </div>
          <small>— Hạng phòng không hỗ trợ mức cân nặng này.</small>
        </section>;
      })}
      {services.filter(service => !service.room_tier).map(service => <section className="panel" key={service.service_id}>
        <h2><Link to={'/catalog/' + encodeURIComponent(service.service_id)}>{service.name}</Link></h2>
        <p>{price(service)}</p>
      </section>)}
    </> : <Empty>Chưa có dịch vụ lưu trú.</Empty>)}</Feedback>
  </>;
}

export function CatalogPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [species, setSpecies] = useState('');
  const result = useLoad(useCallback(async () => {
    const [care, stay] = await Promise.all([
      type === 'BOARDING' ? undefined : catalog.list(page, { type: 'CARE', species: species || undefined }),
      type === 'CARE' || page > 1 ? [] : bookingServices('BOARDING'),
    ]);
    return { care, stay: stay.filter(service => !species || service.allowed_species.some(item => item === species)) };
  }, [page, type, species]));
  const care = result.data?.care;
  const stay = result.data?.stay ?? [];
  return <><h1>Danh mục dịch vụ</h1>
    <div className="toolbar"><label>Loại dịch vụ<select value={type} onChange={event => { setType(event.target.value); setPage(1); }}>
      <option value="">Tất cả</option><option value="CARE">Chăm sóc</option><option value="BOARDING">Lưu trú</option>
    </select></label><label>Loài<select value={species} onChange={event => { setSpecies(event.target.value); setPage(1); }}>
      <option value="">Tất cả</option><option value="DOG">Chó</option><option value="CAT">Mèo</option>
    </select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <>
      {(care?.services.length || stay.length) ? <div className="card-grid">{care?.services.map(service => <Link className="panel pet-card" key={service.service_id} to={'/catalog/' + encodeURIComponent(service.service_id)}>
        <Status value={service.type}/><h2>{service.name}</h2><p>{service.allowed_species.map(label).join(', ')}</p><strong>{price(service)}</strong>
      </Link>)}
        {stay.length > 0 && <Link className="panel pet-card" to="/catalog/stay">
          <Status value="BOARDING"/><h2>Stay</h2>
          <p>{staySpecies.filter(item => stay.some(service => service.allowed_species.includes(item))).map(label).join(', ')}</p>
          <strong>Xem bảng giá lưu trú</strong>
        </Link>}
      </div> : <Empty>Không tìm thấy dịch vụ phù hợp.</Empty>}
      {care && <Pagination result={care} change={setPage}/>}
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
        {service.room_tier && <><dt>Loại phòng</dt><dd>{service.room_tier}</dd><dt>Giá phòng</dt><dd>Bao gồm thức ăn cơ bản</dd></>}
        {!service.price_rules?.length && <><dt>Cân nặng</dt><dd>{service.min_weight_kg}–{service.max_weight_kg} kg</dd></>}
        {service.duration_minutes != null && <><dt>Thời lượng</dt><dd>{service.duration_minutes} phút</dd></>}
      </dl>{user?.role === 'USER' && <Link className="button" to={bookingPath(service.type, id)}>Đặt dịch vụ này</Link>}</section>
      {Boolean(service.price_rules?.length) && (service.room_tier
        ? <StayPriceTable service={service}/>
        : <PriceTable rules={service.price_rules!} currency={service.currency}/>)}
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
    <label>Giá mới (VND)<input key={ruleId} name="price" type="number" step={service.unit === 'DAY' ? 2 : 1} min={service.unit === 'DAY' ? 2 : 1} max={Number.MAX_SAFE_INTEGER} defaultValue={rule?.unit_price ?? service.unit_price} required/></label>
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
