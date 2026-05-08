import { useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import BrandLogo from '../../../shared/components/BrandLogo';
import LanguageSwitcher from '../../../shared/components/LanguageSwitcher';
import NotificationBell from './NotificationBell';
import { logoutHotel } from '../api/hotel.api';
import { clearAuthSession, getRefreshToken } from '../../../shared/api/client';

export default function HotelLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const NAV = [
    { to: '/hotel/dashboard', icon: 'hotel', label: t('nav.roomOverview') },
    { to: '/hotel/check-in', icon: 'person_add', label: t('nav.checkInGuest') },
    { to: '/hotel/guests', icon: 'groups', label: t('nav.allGuests') },
    { to: '/hotel/scan-register', icon: 'document_scanner', label: t('nav.scanRegister'), mobileOnly: true },
    { to: '/hotel/settings', icon: 'settings', label: t('nav.settings') },
  ];

  const hotelName = sessionStorage.getItem('hotel_name') ?? '';

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // Tell the backend to revoke the refresh token and blocklist the access
      // token's JTI. Best-effort — we wipe local state either way.
      await logoutHotel(getRefreshToken());
    } catch {
      /* server revocation failed — local cleanup still runs */
    } finally {
      clearAuthSession();
      navigate('/hotel/login');
      toast.success('Signed out');
      setLoggingOut(false);
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen bg-surface">
      {/* ── Mobile overlay ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        className={`w-[240px] h-screen fixed left-0 top-0 bg-white flex flex-col py-4 border-r border-slate-100 z-50 transition-transform duration-300 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Brand */}
        <div className="px-6 mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BrandLogo size={26} color="#1b4332" />
              <span className="font-headline font-black text-lg text-h-primary tracking-tight">CheckInNow</span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">
              {t('nav.hotelManagement')}
            </p>
          </div>
          <button
            onClick={closeSidebar}
            className="md:hidden p-1 rounded-md hover:bg-slate-100 text-slate-400"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Hotel name */}
        {hotelName && (
          <div className="px-6 mb-4">
            <p className="text-xs font-bold text-h-primary truncate">{hotelName}</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(({ to, icon, label, mobileOnly }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ease-out ${
                  isActive
                    ? 'bg-h-primary-container text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:translate-x-0.5'
                } ${mobileOnly ? 'md:hidden' : ''}`
              }
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto px-4 border-t border-slate-50 pt-4">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            {loggingOut ? t('nav.signingOut') : t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────── */}
      <div className="flex-1 md:ml-[240px] flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 w-full sticky top-0 z-40 bg-white flex justify-between items-center px-4 md:px-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded-md hover:bg-slate-100 text-slate-500"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="material-symbols-outlined text-[22px]">menu</span>
            </button>
            <span className="text-base font-bold font-headline text-h-primary">
              {hotelName || 'CheckInNow'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell />
            <Link to="/hotel/settings" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
