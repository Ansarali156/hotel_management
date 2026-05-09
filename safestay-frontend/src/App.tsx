import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PwaInstallPrompt } from './shared/components/PwaInstallPrompt';
import { ConnectionStatus } from './shared/components/ConnectionStatus';
import { ErrorBoundary } from './shared/components/ErrorBoundary';

// Hotel portal pages
import HotelLanding from './portals/hotel/pages/Landing';
import HotelLogin from './portals/hotel/pages/Login';
import HotelRegister from './portals/hotel/pages/Register';
import HotelDashboard from './portals/hotel/pages/Dashboard';
import CheckIn from './portals/hotel/pages/CheckIn';
import GuestList from './portals/hotel/pages/GuestList';
import ScanRegister from './portals/hotel/pages/ScanRegister';
import HotelSettings from './portals/hotel/pages/Settings';
import Maintenance from './portals/hotel/pages/Maintenance';

// Police portal pages
import PoliceLogin from './portals/police/pages/Login';
import PoliceDashboard from './portals/police/pages/Dashboard';
import Criminals from './portals/police/pages/Criminals';
import CriminalDetail from './portals/police/pages/CriminalDetail';
import AddCriminal from './portals/police/pages/AddCriminal';
import Alerts from './portals/police/pages/Alerts';
import AlertDetail from './portals/police/pages/AlertDetail';
import StationSettings from './portals/police/pages/StationSettings';
import HotelStatus from './portals/police/pages/HotelStatus';
import HotelDetail from './portals/police/pages/HotelDetail';
import PoliceGuestDetail from './portals/police/pages/PoliceGuestDetail';

// VITE_PORTAL=police → this deployment is police-only (root → /police/login)
// VITE_PORTAL=hotel  → hotel-only (default)
const isPolicePortal = import.meta.env.VITE_PORTAL === 'police';

// ── Protected route wrappers ──────────────────────────────────────────────────

function HotelProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('auth_token');
  if (!token) return <Navigate to="/hotel/login" replace />;
  return <>{children}</>;
}

function PoliceProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('auth_token');
  if (!token) return <Navigate to="/police/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Root redirect — controlled by VITE_PORTAL env var */}
        <Route
          path="/"
          element={<Navigate to={isPolicePortal ? '/police/login' : '/hotel'} replace />}
        />

        {/* Hotel portal — public */}
        <Route path="/hotel" element={<HotelLanding />} />
        <Route path="/hotel/login" element={<HotelLogin />} />
        <Route path="/hotel/register" element={<HotelRegister />} />

        {/* Hotel portal — protected */}
        <Route path="/hotel/dashboard" element={<HotelProtectedRoute><HotelDashboard /></HotelProtectedRoute>} />
        <Route path="/hotel/check-in" element={<HotelProtectedRoute><CheckIn /></HotelProtectedRoute>} />
        <Route path="/hotel/guests" element={<HotelProtectedRoute><GuestList /></HotelProtectedRoute>} />
        <Route path="/hotel/scan-register" element={<HotelProtectedRoute><ScanRegister /></HotelProtectedRoute>} />
        <Route path="/hotel/maintenance" element={<HotelProtectedRoute><Maintenance /></HotelProtectedRoute>} />
        <Route path="/hotel/settings" element={<HotelProtectedRoute><HotelSettings /></HotelProtectedRoute>} />
        {/* Catch-all for /hotel/* */}
        <Route path="/hotel/*" element={<Navigate to="/hotel/dashboard" replace />} />

        {/* Police portal — public */}
        <Route path="/police/login" element={<PoliceLogin />} />

        {/* Police portal — protected */}
        <Route path="/police/dashboard" element={<PoliceProtectedRoute><PoliceDashboard /></PoliceProtectedRoute>} />
        <Route path="/police/criminals" element={<PoliceProtectedRoute><Criminals /></PoliceProtectedRoute>} />
        <Route path="/police/criminals/new" element={<PoliceProtectedRoute><AddCriminal /></PoliceProtectedRoute>} />
        <Route path="/police/criminals/:id" element={<PoliceProtectedRoute><CriminalDetail /></PoliceProtectedRoute>} />
        <Route path="/police/criminals/:id/edit" element={<PoliceProtectedRoute><CriminalDetail /></PoliceProtectedRoute>} />
        <Route path="/police/alerts" element={<PoliceProtectedRoute><Alerts /></PoliceProtectedRoute>} />
        <Route path="/police/alerts/:id" element={<PoliceProtectedRoute><AlertDetail /></PoliceProtectedRoute>} />
        <Route path="/police/hotels" element={<PoliceProtectedRoute><HotelStatus /></PoliceProtectedRoute>} />
        <Route path="/police/hotels/:hotelId" element={<PoliceProtectedRoute><HotelDetail /></PoliceProtectedRoute>} />
        <Route path="/police/hotels/:hotelId/guests/:guestId" element={<PoliceProtectedRoute><PoliceGuestDetail /></PoliceProtectedRoute>} />
        <Route path="/police/settings" element={<PoliceProtectedRoute><StationSettings /></PoliceProtectedRoute>} />
        {/* Catch-all for /police/* */}
        <Route path="/police" element={<Navigate to="/police/login" replace />} />
        <Route path="/police/*" element={<Navigate to="/police/login" replace />} />

        {/* Fallback */}
        <Route
          path="*"
          element={<Navigate to={isPolicePortal ? '/police/login' : '/hotel'} replace />}
        />
      </Routes>

      {/* PWA Features — Toaster is mounted in main.tsx (single instance to avoid duplicate toasts, M19) */}
      <PwaInstallPrompt />
      <ConnectionStatus />
    </BrowserRouter>
    </ErrorBoundary>
  );
}
