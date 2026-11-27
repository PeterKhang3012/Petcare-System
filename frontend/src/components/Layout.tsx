import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { bookingPath } from '../services/catalog';
import { label } from '../utils/format';

export function Brand() { return <Link to="/" className="brand"><span className="logo" aria-hidden="true">✦</span><span>PawStay<small>Chăm sóc thú cưng</small></span></Link>; }

export function Layout() {
  const { user, signOut } = useAuth();
  return <div className="shell">
    <aside className="sidebar"><Brand /><nav aria-label="Điều hướng chính">
      <NavLink to="/" end>Tổng quan</NavLink>
      <NavLink to="/catalog">Danh mục dịch vụ</NavLink>
      {user?.role === 'USER' && <><NavLink to="/pets">Thú cưng</NavLink><NavLink to={bookingPath('CARE')}>Chăm sóc</NavLink><NavLink to={bookingPath('BOARDING')}>Lưu trú</NavLink><NavLink to="/bookings" end>Lịch đặt</NavLink><NavLink to="/payments">Thanh toán</NavLink></>}
      {user?.role === 'STAFF' && <NavLink to="/staff">Vận hành</NavLink>}
      <NavLink to="/care">Hồ sơ chăm sóc</NavLink>
      <NavLink to="/profile">Tài khoản</NavLink>
    </nav><div className="sidebar-account"><span>{user?.username}</span>{user && <small>{label(user.role)}</small>}<button className="secondary" onClick={signOut}>Đăng xuất</button></div></aside>
    <main className="workspace"><Outlet /></main>
  </div>;
}
