import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../services';
import { Feedback } from '../../UI/Feedback';

export function AuthPage({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const { signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { username: String(form.get('username')).trim(), password: String(form.get('password')) };
    setBusy(true);
    setError(undefined);
    try {
      if (register) {
        const full_name = String(form.get('full_name') ?? '').trim();
        const phone = String(form.get('phone') ?? '').trim();
        if (!full_name || !phone) {
          setError('Vui lòng nhập họ tên và số điện thoại.');
          return;
        }
        const confirm_password = String(form.get('confirm_password') ?? '');
        if (confirm_password !== input.password) {
          setError('Mật khẩu xác nhận không khớp.');
          return;
        }
        await auth.register({ ...input, full_name, phone, confirm_password });
        navigate('/login', { replace: true, state: { registered: true } });
      } else {
        await signIn(input);
        navigate(location.state?.from || '/', { replace: true });
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return <div className="auth-shell">
    <section className="auth-visual"><Brand /><div><span className="eyebrow">CHĂM SÓC THEO LỊCH CỦA BẠN</span><h1>An tâm gửi gắm<br />người bạn nhỏ.</h1><p>Đặt lịch chăm sóc, theo dõi thanh toán và lưu hồ sơ thú cưng tại một nơi.</p></div><div className="paw-print" aria-hidden="true"><i/><i/><i/><i/><b/></div></section>
    <main className="auth-content"><div className="auth-form"><h2>{register ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h2>
      <p className="muted">{register ? 'Bắt đầu với tài khoản khách hàng PawStay.' : 'Đăng nhập để sử dụng PawStay.'}</p>
      {location.state?.registered && <p className="feedback" role="status">Tạo tài khoản thành công. Bạn có thể đăng nhập.</p>}
      {typeof error === 'string' ? <div className="feedback error" role="alert">{error}</div> : <Feedback error={error} />}
      <form onSubmit={submit}>
        {register && <>
          <label>Họ và tên<input name="full_name" required autoComplete="name" /></label>
          <label>Số điện thoại<input type="tel" name="phone" required autoComplete="tel" /></label>
        </>}
        <label>Tên đăng nhập<input name="username" required maxLength={100} autoComplete="username" /></label>
        <label>Mật khẩu<input type="password" name="password" required minLength={register ? 8 : undefined} maxLength={72} autoComplete={register ? 'new-password' : 'current-password'} /></label>
        {register && <label>Xác nhận mật khẩu<input type="password" name="confirm_password" required maxLength={72} autoComplete="new-password" /></label>}
        <button disabled={busy}>{busy ? 'Đang xử lý…' : register ? 'Đăng ký' : 'Đăng nhập'}</button>
      </form>
      <p className="muted">{register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <Link to={register ? '/login' : '/register'}>{register ? 'Đăng nhập' : 'Đăng ký'}</Link></p>
    </div></main>
  </div>;
}
