import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../../../shared/components/LanguageSwitcher';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { VerificationContext, VerificationJob } from '../context/VerificationContext';
import client, { clearAuthSession, getRefreshToken } from '../../../shared/api/client';

const NAV_KEYS = [
  { to: '/police/dashboard', icon: 'security', key: 'nav.operationsCenter' },
  { to: '/police/hotels', icon: 'apartment', key: 'nav.hotelStatus' },
  { to: '/police/criminals', icon: 'folder_shared', key: 'nav.caseFiles' },
  { to: '/police/alerts', icon: 'location_searching', key: 'nav.matchAlerts' },
  { to: '/police/criminals/new', icon: 'person_add', key: 'nav.addProfile' },
  { to: '/police/settings', icon: 'settings', key: 'nav.stationSettings' },
];

const THREAT_ACCENT: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#d97706',
  LOW: '#4b5563',
};

interface CriminalMatchPayload {
  alertId: string;
  criminalProfile: {
    fullName: string;
    crimeType: string;
    threatLevel: string;
    caseStatus: string;
  };
  guestCheckin: {
    name: string;
    room: string | null;
    hotel: string | null;
  };
  matchedField: string;
  threatLevel: string;
  timestamp: string;
}

// Mirror of backend VerificationProgressPayload
interface VerificationProgressPayload {
  jobId: string;
  type: 'CRIMINAL_VS_GUESTS' | 'GUEST_VS_CRIMINALS' | 'SWEEP';
  status: 'PROCESSING' | 'COMPLETE' | 'FAILED';
  sourceName: string;
  sourceId: string;
  checked: number;
  total: number;
  alertsFound: number;
  pct: number;
  durationMs?: number;
}

// Resolve the backend URL for Socket.IO (same origin as API in dev, or env-configured in prod)
const SOCKET_URL = (() => {
  const api = import.meta.env.VITE_API_BASE_URL ?? '';
  if (api) return api.replace(/\/api\/v\d+\/?$/, '');
  // Dev: backend runs on port 4000 on same host
  return window.location.protocol + '//' + window.location.hostname + ':4000';
})();

export default function PoliceLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const NAV = NAV_KEYS.map((n) => ({ ...n, label: t(n.key as any) }));
  const location = useLocation();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [showAlertBell, setShowAlertBell] = useState(false);
  const [activeJobs, setActiveJobs] = useState<Map<string, VerificationJob>>(new Map());
  // Ref so socket callbacks always see latest state without re-registering listeners
  const activeJobsRef = useRef<Map<string, VerificationJob>>(new Map());

  const policeBadge = sessionStorage.getItem('police_badge') ?? '';

  // Clear unread count when visiting the alerts page
  useEffect(() => {
    if (location.pathname.startsWith('/police/alerts')) {
      setUnreadAlerts(0);
    }
  }, [location.pathname]);

  // Socket.IO connection — auto-reconnect, auth via JWT
  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    if (!token) return;

    let socket: Socket | null = null;
    // Track every setTimeout so we clear them on unmount (MP1)
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    try {
      socket = io(SOCKET_URL, {
        auth: { token },
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 10,
      });

      socket.on('connect', () => {
        // Connected silently — no visible indication to avoid leaking surveillance context
      });

      socket.on('VERIFICATION_PROGRESS', (payload: VerificationProgressPayload) => {
        const job: VerificationJob = { ...payload, updatedAt: Date.now() };
        const next = new Map(activeJobsRef.current);
        next.set(payload.jobId, job);
        setActiveJobs(new Map(next));
        activeJobsRef.current = new Map(next);

        if (payload.status === 'COMPLETE' || payload.status === 'FAILED') {
          // Immediately refresh alerts and stats so new matches appear without delay
          queryClient.invalidateQueries({ queryKey: ['police-alerts'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

          // Remove banner after 8 seconds — tracked so cleanup can cancel it
          const timerId = setTimeout(() => {
            pendingTimers.delete(timerId);
            const cleaned = new Map(activeJobsRef.current);
            cleaned.delete(payload.jobId);
            setActiveJobs(new Map(cleaned));
            activeJobsRef.current = new Map(cleaned);
          }, 8000);
          pendingTimers.add(timerId);
        }
      });

      socket.on('CRIMINAL_MATCH_ALERT', (payload: CriminalMatchPayload) => {
        setUnreadAlerts((n) => n + 1);
        setShowAlertBell(true);

        const accent = THREAT_ACCENT[payload.threatLevel] ?? '#1B4332';
        const hotel = payload.guestCheckin.hotel ?? 'Unknown Hotel';
        const room = payload.guestCheckin.room ? ` · ${payload.guestCheckin.room}` : '';

        toast.custom(
          (tInstance) => (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                toast.dismiss(tInstance.id);
                navigate(`/police/alerts/${payload.alertId}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  toast.dismiss(tInstance.id);
                  navigate(`/police/alerts/${payload.alertId}`);
                }
              }}
              className="flex items-stretch bg-white shadow-lg rounded-lg overflow-hidden cursor-pointer w-[300px] max-w-[calc(100vw-2rem)] border border-slate-200 hover:shadow-xl"
              style={{
                opacity: tInstance.visible ? 1 : 0,
                transform: tInstance.visible ? 'translateY(0)' : 'translateY(-6px)',
                transition: 'opacity 200ms ease-out, transform 200ms ease-out',
              }}
            >
              {/* Threat-level accent strip */}
              <div className="w-1 shrink-0" style={{ background: accent }} />
              <div className="flex-1 min-w-0 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="material-symbols-outlined text-[16px] shrink-0"
                      style={{ color: accent }}
                    >
                      gpp_maybe
                    </span>
                    <p className="text-[13px] font-bold text-slate-900 truncate">
                      {payload.criminalProfile.fullName}
                    </p>
                  </div>
                  <span
                    className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 text-white"
                    style={{ background: accent }}
                  >
                    {payload.threatLevel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 truncate mt-0.5">
                  {hotel}{room} · {payload.matchedField}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(tInstance.id);
                }}
                className="shrink-0 px-2 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Dismiss"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          ),
          {
            duration: 5000,
          }
        );
      });

      socket.on('disconnect', () => {
        // Silent — reconnect handled automatically
      });
    } catch {
      // Socket connection errors are non-fatal — fall back to 15s polling in Alerts.tsx
    }

    return () => {
      pendingTimers.forEach((id) => clearTimeout(id));
      pendingTimers.clear();
      socket?.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    // Best-effort server-side revocation before we wipe the local session.
    try {
      const refreshToken = getRefreshToken();
      await client.post('/auth/police/logout', refreshToken ? { refreshToken } : {});
    } catch {
      /* ignore — local cleanup still happens */
    }
    clearAuthSession();
    navigate('/police/login');
    toast.success('Signed out');
    setLoggingOut(false);
  }, [navigate]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <VerificationContext.Provider value={{ activeJobs }}>
    <div className="bg-[#F8F9FA] min-h-screen">
      {/* ── Mobile sidebar overlay ───────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ── Top nav ──────────────────────────────────────────── */}
      <header className="fixed top-0 w-full z-50 bg-[#1B4332] shadow-sm h-16 flex justify-between items-center px-4 md:px-6">
        <div className="flex items-center gap-3 md:gap-8">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-2 rounded-md hover:bg-white/10 text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
          <span className="text-lg md:text-xl font-bold tracking-tighter text-white font-brand">CheckInNow Intelligence</span>
          <nav className="hidden md:flex gap-6 items-center">
            {[
              { to: '/police/dashboard', label: t('nav.dashboard') },
              { to: '/police/alerts', label: t('nav.intelligence') },
              { to: '/police/criminals', label: t('nav.registry') },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `font-brand text-sm tracking-tight transition-colors ${
                    isActive ? 'text-white border-b-2 border-white pb-1 font-semibold' : 'text-white/80 hover:text-white'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher dark />
          {/* Notification bell with live badge */}
          <button
            onClick={() => { setUnreadAlerts(0); navigate('/police/alerts'); }}
            className="relative hover:bg-white/10 p-2 rounded-full transition-all text-white"
            title={unreadAlerts > 0 ? `${unreadAlerts} new alert${unreadAlerts > 1 ? 's' : ''}` : 'Alerts'}
          >
            <span className={`material-symbols-outlined ${showAlertBell && unreadAlerts > 0 ? 'icon-fill' : ''}`}>
              notifications
            </span>
            {unreadAlerts > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 animate-bounce">
                {unreadAlerts > 99 ? '99+' : unreadAlerts}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/police/settings')}
            className="hover:bg-white/10 p-2 rounded-full transition-all text-white"
            title="Profile & Settings"
          >
            <span className="material-symbols-outlined">account_circle</span>
          </button>
        </div>
      </header>

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        className={`fixed left-0 top-16 h-[calc(100vh-64px)] w-[240px] bg-[#F1F4F6] flex flex-col py-4 border-r border-slate-200/50 z-40 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="px-6 mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-[#1B4332] font-brand">{t('police.sovereignObserver')}</h2>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{t('police.officialPortal')}</p>
            {policeBadge && (
              <p className="text-xs text-slate-500 mt-2">Badge: {policeBadge}</p>
            )}
          </div>
          <button
            onClick={closeSidebar}
            className="md:hidden p-1 rounded-md hover:bg-slate-200 text-slate-500"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `flex items-center gap-3 py-3 transition-all duration-200 ease-out font-brand text-sm font-medium ${
                  isActive
                    ? 'bg-white text-[#1B4332] rounded-l-full ml-2 shadow-sm font-bold px-4'
                    : 'px-6 text-slate-600 hover:text-[#1B4332] hover:bg-white/60 hover:translate-x-1'
                }`
              }
            >
              <span className="material-symbols-outlined text-sm">{icon}</span>
              <span className="flex-1">{label}</span>
              {/* Badge on Match Alerts nav item */}
              {to === '/police/alerts' && unreadAlerts > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {unreadAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 mt-4">
          <button
            onClick={() => { navigate('/police/criminals/new'); closeSidebar(); }}
            className="w-full bg-[#1B4332] text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:brightness-110 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1B4332]/20 active:scale-[0.97] active:translate-y-0 transition-all duration-200"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Dispatch
          </button>
        </div>

        <div className="mt-4 border-t border-slate-200/50 pt-4 space-y-1">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-3 py-2 px-6 text-slate-500 hover:text-red-600 text-sm w-full text-left transition-colors"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            {loggingOut ? t('nav.signingOut') : t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────── */}
      <main className="md:ml-[240px] pt-16 min-h-screen">
        {/* Global verification progress banners */}
        <GlobalVerificationBanners activeJobs={activeJobs} />
        {children}
      </main>
    </div>
    </VerificationContext.Provider>
  );
}

// ── Global verification progress banners (visible on ALL pages) ─────────────

function GlobalVerificationBanners({ activeJobs }: { activeJobs: Map<string, VerificationJob> }) {
  const jobs = Array.from(activeJobs.values());
  if (jobs.length === 0) return null;

  return (
    <div className="px-4 md:px-8 pt-3 space-y-1.5 max-w-3xl">
      {jobs.map((job) => {
        const isDone = job.status === 'COMPLETE';
        const isFailed = job.status === 'FAILED';

        const typeLabel =
          job.type === 'SWEEP' ? 'Network Sweep' :
          job.type === 'CRIMINAL_VS_GUESTS' ? `Criminal: ${job.sourceName}` :
          `Guest: ${job.sourceName}`;

        const entityLabel =
          job.type === 'CRIMINAL_VS_GUESTS' ? 'guests' :
          job.type === 'SWEEP' ? 'criminals' : 'criminals';

        const statusText = isDone ? 'Complete' : isFailed ? 'Failed' : 'Verifying';
        const metricText = isDone
          ? `${job.checked.toLocaleString()} checked · ${job.alertsFound} match${job.alertsFound !== 1 ? 'es' : ''}`
          : `${job.checked.toLocaleString()}/${job.total.toLocaleString()} ${entityLabel} · ${job.alertsFound} match${job.alertsFound !== 1 ? 'es' : ''}`;

        return (
          <div
            key={job.jobId}
            className={`rounded-lg border px-3 py-1.5 flex items-center gap-2.5 text-xs ${
              isDone ? 'bg-emerald-50 border-emerald-200' :
              isFailed ? 'bg-red-50 border-red-200' :
              'bg-blue-50 border-blue-200'
            }`}
          >
            {isDone ? (
              <span className="material-symbols-outlined text-emerald-600 text-[16px] icon-fill shrink-0">check_circle</span>
            ) : isFailed ? (
              <span className="material-symbols-outlined text-red-500 text-[16px] shrink-0">error</span>
            ) : (
              <span
                className="material-symbols-outlined text-blue-600 text-[16px] animate-spin shrink-0"
                style={{ animationDuration: '2s' }}
              >
                progress_activity
              </span>
            )}

            <span className={`font-bold shrink-0 ${isDone ? 'text-emerald-800' : isFailed ? 'text-red-700' : 'text-blue-800'}`}>
              {statusText}
            </span>
            <span className={`font-medium truncate ${isDone ? 'text-emerald-600' : isFailed ? 'text-red-500' : 'text-blue-600'}`}>
              · {typeLabel}
            </span>

            <div className="flex-1 h-1 bg-white/70 rounded-full overflow-hidden min-w-[40px] max-w-[160px]">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  isDone ? 'bg-emerald-500' : isFailed ? 'bg-red-400' : 'bg-blue-500'
                }`}
                style={{ width: `${isDone ? 100 : job.pct}%` }}
              />
            </div>

            <span className={`tabular-nums font-semibold shrink-0 hidden sm:inline ${isDone ? 'text-emerald-700' : isFailed ? 'text-red-600' : 'text-blue-700'}`}>
              {metricText}
            </span>
            <span className={`tabular-nums font-black shrink-0 ${isDone ? 'text-emerald-700' : isFailed ? 'text-red-600' : 'text-blue-700'}`}>
              {isDone ? '100' : job.pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
