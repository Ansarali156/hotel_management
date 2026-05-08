import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import BrandLogo from '../../../shared/components/BrandLogo';
import { loginHotel } from '../api/hotel.api';
import { saveAuthSession } from '../../../shared/api/client';

export default function HotelLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email || !password) {
      const msg = 'Please enter email and password';
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    try {
      const { token, refreshToken, hotelId, hotelName } = await loginHotel(email, password);
      // saveAuthSession persists portal + refresh token so the 401 interceptor
      // can silently rotate the access token instead of logging the user out.
      saveAuthSession('HOTEL', token, refreshToken);
      sessionStorage.setItem('hotel_id', hotelId);
      sessionStorage.setItem('hotel_name', hotelName);
      toast.success(`Welcome back, ${hotelName}!`);
      navigate('/hotel/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? 'Invalid email or password';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col">
      {/* Back to home */}
      <div className="p-4">
        <Link
          to="/hotel"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B4332] hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          BACK TO HOME
        </Link>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 sm:p-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-[#1B4332] to-[#012D1D] rounded-xl flex items-center justify-center shadow mb-3 p-2">
              <BrandLogo size={28} color="#ffffff" />
            </div>
            <h1 className="font-headline font-extrabold text-2xl text-[#012D1D] tracking-tight">CHECKINNOW</h1>
            <p className="text-xs font-bold text-on-surface-variant tracking-widest uppercase mt-1">
              Hotel Management Portal
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="hotel-email" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                id="hotel-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                aria-invalid={!!errorMsg}
                className="w-full px-4 py-3 rounded-lg border border-outline-variant/40 bg-[#F4F6F8] text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30 focus:border-[#1B4332]/50"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="hotel-password" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="hotel-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!errorMsg}
                  className="w-full px-4 py-3 pr-11 rounded-lg border border-outline-variant/40 bg-[#F4F6F8] text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30 focus:border-[#1B4332]/50"
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

            {/* Inline error — visible even if toast was missed */}
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
              className="w-full py-3.5 bg-gradient-to-r from-[#1B4332] to-[#012D1D] text-white font-bold rounded-lg shadow hover:shadow-lg hover:shadow-[#1B4332]/20 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
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

          {/* Security note */}
          <div className="mt-6 flex items-start gap-3 bg-[#F4F6F8] rounded-lg p-4">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px] flex-shrink-0 mt-0.5">shield</span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Access to this portal is restricted to authorized CheckInNow partners.
              Unauthorized access attempts are monitored for security purposes.
            </p>
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-on-surface-variant mt-6">
            New property?{' '}
            <Link to="/hotel/register" className="font-bold text-[#1B4332] hover:underline">
              Register your hotel
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
