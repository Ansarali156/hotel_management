import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import client, { saveAuthSession } from '../../../shared/api/client';
import BrandLogo from '../../../shared/components/BrandLogo';

export default function PoliceLogin() {
  const navigate = useNavigate();
  const [badgeId, setBadgeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!badgeId || !password) {
      const msg = 'Please enter badge ID and password';
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    try {
      const res = await client.post<{
        data: {
          // Modern response shape
          accessToken?: string;
          refreshToken?: string;
          officer?: {
            id: string;
            badgeId: string;
            fullName: string;
            stationId: string | null;
            jurisdictionPath: string;
          };
          // Legacy fields retained for backward compatibility
          token?: string;
          officerId?: string;
          badgeId?: string;
          fullName?: string;
          rankLevel?: number | null;
          rankTitle?: string | null;
          stationId?: string | null;
          jurisdictionPath?: string;
        };
      }>('/auth/police/login', { badgeId, password });

      const p = res.data.data;
      const accessToken = p.accessToken ?? p.token ?? '';
      const officerId = p.officer?.id ?? p.officerId ?? '';
      const fullName = p.officer?.fullName ?? p.fullName ?? '';
      const stationId = p.officer?.stationId ?? p.stationId ?? null;
      const jurisdictionPath = p.officer?.jurisdictionPath ?? p.jurisdictionPath ?? '';

      saveAuthSession('POLICE', accessToken, p.refreshToken);
      sessionStorage.setItem('police_badge', badgeId);
      sessionStorage.setItem('police_officer_id', officerId);
      sessionStorage.setItem('police_full_name', fullName);
      if (stationId) sessionStorage.setItem('police_station_id', stationId);
      if (jurisdictionPath) sessionStorage.setItem('police_jurisdiction', jurisdictionPath);
      toast.success(`Welcome, ${fullName}`);
      navigate('/police/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? 'Invalid badge ID or password';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center px-4">
      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
        {/* Header band */}
        <div className="bg-[#1a3a5c] px-8 py-6 flex flex-col items-center">
          <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center mb-3 p-2">
            <BrandLogo size={28} color="#ffffff" />
          </div>
          <h1 className="font-headline font-extrabold text-xl text-white tracking-tight">CHECKINNOW</h1>
          <p className="text-xs font-bold text-white/60 tracking-widest uppercase mt-1">
            Police Portal
          </p>
        </div>

        {/* Form */}
        <div className="px-8 py-8">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Badge ID */}
            <div>
              <label htmlFor="police-badge" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Badge / Admin ID
              </label>
              <input
                id="police-badge"
                name="badgeId"
                type="text"
                value={badgeId}
                onChange={(e) => setBadgeId(e.target.value)}
                placeholder="Enter your badge ID"
                autoComplete="username"
                aria-invalid={!!errorMsg}
                className="w-full px-4 py-3 rounded-lg border border-outline-variant/40 bg-[#F4F6F8] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c]/50"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="police-password" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="police-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!errorMsg}
                  className="w-full px-4 py-3 pr-11 rounded-lg border border-outline-variant/40 bg-[#F4F6F8] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c]/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Inline error — keeps the failure state visible after toast fades */}
            {errorMsg && (
              <div role="alert" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                <span className="material-symbols-outlined text-[18px] mt-px">error</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#1a3a5c] text-white font-bold rounded-lg shadow hover:bg-[#0d2640] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="material-symbols-outlined text-[20px] animate-spin" aria-hidden="true">progress_activity</span>
              ) : (
                <>
                  SIGN IN
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">login</span>
                </>
              )}
            </button>
          </form>

          {/* Security notice */}
          <div className="mt-6 flex items-start gap-3 bg-[#F4F6F8] rounded-lg p-4">
            <span className="material-symbols-outlined text-[#1a3a5c] text-[20px] flex-shrink-0 mt-0.5">gpp_good</span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              This portal is restricted to authorized law enforcement personnel only.
              All access attempts are logged and monitored.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-white/30">
        POWERED BY CHECKINNOW NETWORK · PROFESSIONAL EDITION
      </p>
    </div>
  );
}
