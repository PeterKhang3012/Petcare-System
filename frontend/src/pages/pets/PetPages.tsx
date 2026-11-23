import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLoad } from '../../hooks/useLoad';
import { pets } from '../../services';
import type { Pet, PetInput } from '../../types';
import { Empty, Feedback, Pagination, Status } from '../../UI/Feedback';
import { label } from '../../utils/format';

export function PetList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ACTIVE');
  const result = useLoad(useCallback(() => pets.list(page, status), [page, status]));
  return <><header className="page-heading"><h1>Thú cưng</h1><Link className="button" to="/pets/new">Thêm thú cưng</Link></header>
    <div className="toolbar"><label>Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="ACTIVE">Đang chăm sóc</option><option value="ARCHIVED">Đã lưu trữ</option><option value="ALL">Tất cả</option></select></label></div>
    <Feedback {...result} retry={result.reload}>{result.data && <>{result.data.pets.length ? <div className="card-grid">{result.data.pets.map(pet => <Link className="panel pet-card" to={'/pets/' + pet.id} key={pet.id}><span className="pet-icon" aria-hidden="true">{pet.species === 'DOG' ? '🐶' : '🐱'}</span><h2>{pet.name}</h2><p>{label(pet.species)} · {pet.weight_kg} kg</p><Status value={pet.status} /></Link>)}</div> : <Empty>Chưa có thú cưng ở trạng thái này.</Empty>}<Pagination result={result.data} change={setPage} /></>}</Feedback>
  </>;
}

function PetForm({ pet, saved }: { pet?: Pet; saved: (pet: Pet) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: PetInput = {
      name: String(form.get('name')).trim(), species: form.get('species') as PetInput['species'], weight_kg: Number(form.get('weight')),
      breed: String(form.get('breed')).trim(), care_notes: String(form.get('notes')).trim(),
    };
    const birth = String(form.get('birth'));
    if (birth) input.date_of_birth = birth;
    setBusy(true);
    setError(undefined);
    try { saved((await (pet ? pets.update(pet.id, input) : pets.create(input))).pet); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <form className="panel form-grid" onSubmit={submit}>
    <label>Tên thú cưng<input name="name" required maxLength={100} defaultValue={pet?.name}/></label>
    <label>Loài<select name="species" defaultValue={pet?.species ?? 'DOG'}><option value="DOG">Chó</option><option value="CAT">Mèo</option></select></label>
    <label>Cân nặng (kg)<input name="weight" type="number" step="any" min="0.01" max="500" required defaultValue={pet?.weight_kg}/></label>
    <label>Giống<input name="breed" maxLength={100} defaultValue={pet?.breed}/></label>
    <label>Ngày sinh<input name="birth" type="date" required={Boolean(pet?.date_of_birth)} defaultValue={pet?.date_of_birth}/></label>
    <label className="full">Ghi chú chăm sóc<textarea name="notes" maxLength={2000} defaultValue={pet?.care_notes}/></label>
    <Feedback error={error} /><div className="full"><button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button></div>
  </form>;
}

export function PetNew() {
  const navigate = useNavigate();
  return <><h1>Thêm thú cưng</h1><PetForm saved={pet => navigate('/pets/' + pet.id, { replace: true })} /></>;
}

export function PetDetail() {
  const { id = '' } = useParams();
  const result = useLoad(useCallback(() => pets.get(id), [id]));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const pet = result.data?.pet;
  async function archive() {
    if (!window.confirm('Lưu trữ thú cưng này?')) return;
    setBusy(true); setError(undefined);
    try { await pets.archive(id); result.reload(); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <><Link to="/pets">Danh sách thú cưng</Link><Feedback {...result} retry={result.reload}>{pet && <>
    <header className="page-heading"><h1>{pet.name}</h1><Status value={pet.status}/></header><Feedback error={error}/>
    {editing ? <><PetForm pet={pet} saved={() => { setEditing(false); result.reload(); }}/><button className="secondary" onClick={() => setEditing(false)}>Hủy chỉnh sửa</button></> :
    <section className="panel"><dl className="details"><dt>Loài</dt><dd>{label(pet.species)}</dd><dt>Cân nặng</dt><dd>{pet.weight_kg} kg</dd><dt>Giống</dt><dd>{pet.breed || '—'}</dd><dt>Ngày sinh</dt><dd>{pet.date_of_birth || '—'}</dd><dt>Ghi chú chăm sóc</dt><dd>{pet.care_notes || '—'}</dd></dl>
      {pet.status === 'ACTIVE' && <div className="actions"><button onClick={() => setEditing(true)}>Chỉnh sửa</button><button className="secondary" disabled={busy} onClick={archive}>Lưu trữ</button></div>}
    </section>}
  </>}</Feedback></>;
}
