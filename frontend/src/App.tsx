import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Feedback } from './UI/Feedback';
import { AuthPage } from './pages/auth/AuthPage';
import { Dashboard, Profile } from './pages/dashboard/Dashboard';
import { PetDetail, PetList, PetNew } from './pages/pets/PetPages';
import { BookingNew, BookingPage, BookingsPage } from './pages/bookings/BookingPages';
import { PaymentLookup, PaymentPage } from './pages/payments/PaymentPages';
import { StaffBooking, StaffPage } from './pages/staff/StaffPages';
import type { Role } from './types';

function Protected({ role }: { role?: Role }) {
  const { user, loading, error, retry } = useAuth();
  const location = useLocation();
  if (loading || error) return <div className="workspace"><Feedback loading={loading} error={error} retry={retry}/></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }}/>;
  if (role && user.role !== role) return <section className="panel"><h1>Không có quyền truy cập</h1><p>Trang này dành cho một vai trò khác.</p><Link to="/">Về tổng quan</Link></section>;
  return <Outlet/>;
}

function PublicAuth({ register }: { register?: boolean }) {
  const { user, loading, error, retry } = useAuth();
  if (loading || error) return <div className="workspace"><Feedback loading={loading} error={error} retry={retry}/></div>;
  return user ? <Navigate to="/" replace/> : <AuthPage key={register ? 'register' : 'login'} register={register}/>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<PublicAuth/>}/><Route path="/register" element={<PublicAuth register/>}/>
    <Route element={<Protected/>}><Route element={<Layout/>}>
      <Route index element={<Dashboard/>}/><Route path="profile" element={<Profile/>}/>
      <Route element={<Protected role="USER"/>}>
        <Route path="pets" element={<PetList/>}/><Route path="pets/new" element={<PetNew/>}/><Route path="pets/:id" element={<PetDetail/>}/>
        <Route path="bookings" element={<BookingsPage/>}/><Route path="bookings/new" element={<BookingNew/>}/><Route path="bookings/:id" element={<BookingPage/>}/>
        <Route path="payments" element={<PaymentLookup/>}/><Route path="payments/return" element={<PaymentLookup returned/>}/><Route path="payments/:id" element={<PaymentPage/>}/>
      </Route>
      <Route element={<Protected role="STAFF"/>}><Route path="staff" element={<StaffPage/>}/><Route path="staff/bookings/:id" element={<StaffBooking/>}/></Route>
      <Route path="*" element={<section className="panel"><h1>Trang không tồn tại</h1><Link to="/">Về tổng quan</Link></section>}/>
    </Route></Route>
  </Routes></AuthProvider></BrowserRouter>;
}
