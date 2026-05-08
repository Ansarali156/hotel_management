import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import BrandLogo from '../../../shared/components/BrandLogo';
import { hotelRegister, loginHotel } from '../api/hotel.api';
import { saveAuthSession } from '../../../shared/api/client';

// ── Types ──────────────────────────────────────────────────────────────────────
type WizardStep = 'floors' | 'rooms' | 'categories';

interface Room {
  floor: number;
  roomNumber: string;
  category: string;
}

const CATEGORY_OPTIONS = ['Single', 'Double', 'Deluxe', 'Suite', 'Family Room'];
const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// ── Component ──────────────────────────────────────────────────────────────────
export default function HotelRegister() {
  const navigate = useNavigate();

  // Account credentials
  const [hotelName, setHotelName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Optional details
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [maxGuestsPerRoom, setMaxGuestsPerRoom] = useState(3);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('floors');
  const [totalFloors, setTotalFloors] = useState(1);
  const [floorRoomInputs, setFloorRoomInputs] = useState<Record<number, string>>({});
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);

  // ── Wizard helpers ───────────────────────────────────────────────────────────

  const addRoom = (floor: number) => {
    const input = (floorRoomInputs[floor] ?? '').trim();
    if (!input) return;
    if (rooms.find((r) => r.floor === floor && r.roomNumber === input)) {
      toast.error(`Room ${input} already added on Floor ${floor}`);
      return;
    }
    setRooms((prev) => [...prev, { floor, roomNumber: input, category: '' }]);
    setFloorRoomInputs((prev) => ({ ...prev, [floor]: '' }));
  };

  const removeRoom = (floor: number, roomNumber: string) => {
    setRooms((prev) => prev.filter((r) => !(r.floor === floor && r.roomNumber === roomNumber)));
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const roomsPerCategory = (cat: string) => rooms.filter((r) => r.category === cat).length;

  const assignNextUnassigned = (cat: string) => {
    const idx = rooms.findIndex((r) => r.category === '');
    if (idx === -1) return;
    const updated = [...rooms];
    updated[idx] = { ...updated[idx], category: cat };
    setRooms(updated);
  };

  const unassignLast = (cat: string) => {
    const lastIdx = [...rooms].map((r, i) => (r.category === cat ? i : -1)).filter((i) => i >= 0).pop();
    if (lastIdx === undefined) return;
    const updated = [...rooms];
    updated[lastIdx] = { ...updated[lastIdx], category: '' };
    setRooms(updated);
  };

  // ── Wizard validation ────────────────────────────────────────────────────────

  const wizardComplete = () => {
    if (rooms.length === 0) return false;
    if (rooms.some((r) => !r.category)) return false;
    return true;
  };

  const canGoToRooms = () => totalFloors >= 1;
  const canGoToCategories = () => rooms.length > 0;
  const canSubmit = () => {
    if (!hotelName.trim()) return false;
    if (!email.trim()) return false;
    if (!STRONG_PASSWORD_RE.test(password)) return false;
    if (password !== confirmPassword) return false;
    if (!wizardComplete()) return false;
    return true;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit()) {
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
      } else if (!STRONG_PASSWORD_RE.test(password)) {
        toast.error('Password must be 8+ chars with upper, lower, digit and special char');
      } else if (!wizardComplete()) {
        toast.error('Please complete the Building Setup Wizard');
      } else {
        toast.error('Please fill in all required fields');
      }
      return;
    }

    setLoading(true);
    try {
      await hotelRegister({
        hotelName: hotelName.trim(),
        email: email.trim(),
        password,
        totalFloors,
        rooms,
        contactNumber: contactNumber.trim() || undefined,
        address: address.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
        maxGuestsPerRoom,
      });

      // Auto-login after registration — persist the refresh token alongside
      // the access token so the interceptor can rotate it silently later.
      const { token, refreshToken, hotelId, hotelName: name } = await loginHotel(
        email.trim(),
        password
      );
      saveAuthSession('HOTEL', token, refreshToken);
      sessionStorage.setItem('hotel_id', hotelId);
      sessionStorage.setItem('hotel_name', name);
      toast.success('Hotel registered successfully!');
      navigate('/hotel/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? 'Registration failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel (marketing) ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[42%] bg-gradient-to-b from-[#1B4332] to-[#012D1D] flex-col justify-between p-12 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center p-1.5">
              <BrandLogo size={24} color="#ffffff" />
            </div>
            <span className="font-headline font-extrabold text-2xl text-white tracking-tight">CheckInNow</span>
          </div>

          <h2 className="font-headline font-black text-4xl text-white leading-tight mb-4">
            Get your hotel<br />online in minutes.
          </h2>
          <p className="text-white/60 text-sm leading-relaxed max-w-xs">
            Fill in the details and your entire room inventory will be ready the moment you submit.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: 'auto_awesome', label: 'Automatic room grid created instantly' },
              { icon: 'qr_code_scanner', label: 'Aadhaar-ready guest check-in' },
              { icon: 'verified_user', label: 'Email verified secure account' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#52b788] text-[20px]">check_circle</span>
                <span className="text-white/80 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-white/30 text-xs">
          Already registered?{' '}
          <Link to="/hotel/login" className="text-white/60 font-bold hover:text-white transition-colors">
            Sign In →
          </Link>
        </p>
      </div>

      {/* ── Right panel (form) ─────────────────────────────────────────────── */}
      <div className="flex-1 bg-[#FAFBFC] overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-10">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div className="w-8 h-8 bg-gradient-to-br from-[#1B4332] to-[#012D1D] rounded-lg flex items-center justify-center p-1">
              <BrandLogo size={18} color="#ffffff" />
            </div>
            <span className="font-headline font-extrabold text-xl text-[#012D1D]">CheckInNow</span>
          </div>

          <h1 className="font-headline font-black text-2xl text-[#012D1D] mb-1">Create Your Hotel Account</h1>
          <p className="text-sm text-on-surface-variant mb-8">We'll set up your account and room inventory together.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ── Account Credentials ───────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">Account Credentials</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">Hotel Name</label>
                  <input
                    type="text"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    placeholder="Enter hotel name"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hotel@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 pr-9 rounded-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
                        <span className="material-symbols-outlined text-[18px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Confirm Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                    />
                  </div>
                </div>
                {password && !STRONG_PASSWORD_RE.test(password) && (
                  <p className="text-xs text-red-500">Use 8+ chars with upper, lower, digit and special char</p>
                )}
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>
            </section>

            {/* ── Building Setup Wizard ─────────────────────────────────── */}
            <section className="border-2 border-amber-400/60 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="bg-amber-50 px-4 py-3 flex items-center justify-between border-b border-amber-200">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-[18px]">domain</span>
                  <span className="text-xs font-bold text-amber-800">Building Setup Wizard</span>
                  {!wizardComplete() && (
                    <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase">No Rooms Added</span>
                  )}
                  {wizardComplete() && (
                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">Complete</span>
                  )}
                </div>
                {/* Step indicator */}
                <div className="flex gap-1">
                  {(['floors', 'rooms', 'categories'] as WizardStep[]).map((s, i) => (
                    <div key={s} className={`w-2 h-2 rounded-full ${wizardStep === s ? 'bg-amber-600' : 'bg-amber-200'}`} />
                  ))}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-amber-100">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: wizardStep === 'floors' ? '33%' : wizardStep === 'rooms' ? '66%' : '100%' }}
                />
              </div>

              <div className="p-4 bg-white">
                {/* Step 1: Number of Floors */}
                {wizardStep === 'floors' && (
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Step 1: Number of Floors</p>
                    <p className="text-sm text-on-surface mb-3">How many floors does your hotel have?</p>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={totalFloors}
                      onChange={(e) => setTotalFloors(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-32 px-3 py-2 rounded-lg border border-outline-variant/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                    />
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => canGoToRooms() && setWizardStep('rooms')}
                        disabled={!canGoToRooms()}
                        className="px-5 py-2 bg-[#1B4332] text-white text-sm font-bold rounded-lg hover:bg-[#012D1D] disabled:opacity-40 flex items-center gap-1.5"
                      >
                        Next: Room Numbers
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Room Numbers per floor */}
                {wizardStep === 'rooms' && (
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Step 2: Add Room Numbers</p>
                    <div className="space-y-4">
                      {Array.from({ length: totalFloors }, (_, i) => i + 1).map((floor) => {
                        const floorRooms = rooms.filter((r) => r.floor === floor);
                        return (
                          <div key={floor}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-[#012D1D]">Floor {floor}</span>
                              <span className="text-xs text-on-surface-variant">{floorRooms.length} room{floorRooms.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex gap-2 mb-2">
                              <input
                                type="text"
                                value={floorRoomInputs[floor] ?? ''}
                                onChange={(e) => setFloorRoomInputs((prev) => ({ ...prev, [floor]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRoom(floor))}
                                placeholder={`e.g. ${floor}01, then Enter`}
                                className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                              />
                              <button
                                type="button"
                                onClick={() => addRoom(floor)}
                                className="px-3 py-2 bg-[#1B4332] text-white text-sm font-bold rounded-lg hover:bg-[#012D1D]"
                              >
                                Add
                              </button>
                            </div>
                            {floorRooms.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {floorRooms.map((r) => (
                                  <span key={r.roomNumber} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1B4332]/10 text-[#1B4332] text-xs font-bold rounded-full">
                                    {r.roomNumber}
                                    <button type="button" onClick={() => removeRoom(floor, r.roomNumber)} className="hover:text-red-500">
                                      <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardStep('floors')}
                        className="px-4 py-2 border border-outline-variant/40 text-sm font-bold rounded-lg hover:bg-[#F4F6F8] flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canGoToCategories()) { toast.error('Add at least one room'); return; }
                          // Reset categories if rooms changed
                          setRooms((prev) => prev.map((r) => ({ ...r, category: '' })));
                          setSelectedCategories([]);
                          setWizardStep('categories');
                        }}
                        disabled={!canGoToCategories()}
                        className="px-5 py-2 bg-[#1B4332] text-white text-sm font-bold rounded-lg hover:bg-[#012D1D] disabled:opacity-40 flex items-center gap-1.5"
                      >
                        Next: Assign Categories
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Assign Categories */}
                {wizardStep === 'categories' && (
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Step 3: Assign Room Categories</p>
                    <p className="text-xs text-on-surface-variant mb-3">Select room types and assign each room:</p>

                    {/* Category toggles */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {CATEGORY_OPTIONS.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            selectedCategories.includes(cat)
                              ? 'bg-[#1B4332] text-white border-[#1B4332]'
                              : 'bg-white text-on-surface-variant border-outline-variant/40 hover:border-[#1B4332]/40'
                          }`}
                        >
                          {selectedCategories.includes(cat) && '✓ '}{cat}
                        </button>
                      ))}
                    </div>

                    {/* Rooms list */}
                    <div className="mb-4">
                      <p className="text-xs font-bold text-[#012D1D] mb-2">Rooms ({rooms.length} total)</p>
                      <div className="space-y-2 max-h-[280px] overflow-y-auto">
                        {rooms.map((room, idx) => (
                          <div key={`${room.floor}-${room.roomNumber}`} className="flex items-center justify-between bg-white border border-outline-variant/40 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-[#012D1D] min-w-[40px]">Floor {room.floor}</span>
                              <span className="text-xs font-bold text-[#1B4332]">Room {room.roomNumber}</span>
                            </div>
                            {selectedCategories.length > 0 ? (
                              <div className="flex gap-1">
                                {selectedCategories.map((cat) => (
                                  <button
                                    key={cat}
                                    type="button"
                                    onClick={() => {
                                      const updated = [...rooms];
                                      updated[idx].category = room.category === cat ? '' : cat;
                                      setRooms(updated);
                                    }}
                                    className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
                                      room.category === cat
                                        ? 'bg-[#1B4332] text-white'
                                        : 'bg-[#F4F6F8] text-on-surface-variant border border-outline-variant/40 hover:border-[#1B4332]/40'
                                    }`}
                                  >
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-on-surface-variant italic">Select categories above</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedCategories.length > 0 && (
                      <div className="mb-2 text-xs text-on-surface-variant">
                        {rooms.filter((r) => r.category === '').length} room(s) unassigned · {rooms.filter((r) => r.category !== '').length} assigned
                      </div>
                    )}

                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardStep('rooms')}
                        className="px-4 py-2 border border-outline-variant/40 text-sm font-bold rounded-lg hover:bg-[#F4F6F8] flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Hotel Details (Optional) ──────────────────────────────── */}
            <section>
              <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">Hotel Details (Optional)</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Contact Number</label>
                    <div className="flex">
                      <span className="px-2.5 py-2.5 bg-[#F4F6F8] border border-r-0 border-outline-variant/40 rounded-l-lg text-xs text-on-surface-variant">+91</span>
                      <input
                        type="tel"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="10-digit number"
                        className="flex-1 px-3 py-2.5 rounded-r-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Max Guests/Room</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={maxGuestsPerRoom}
                      onChange={(e) => setMaxGuestsPerRoom(parseInt(e.target.value) || 3)}
                      className="w-full px-3 py-2.5 rounded-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">Hotel Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Full street address"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">License Number</label>
                  <input
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="Reg./License No."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"
                  />
                </div>
              </div>
            </section>

            {/* ── Wizard not complete warning ───────────────────────────── */}
            {!wizardComplete() && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <span className="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
                <p className="text-xs text-amber-800 font-medium">Complete Building Setup to continue</p>
              </div>
            )}

            {/* ── Submit button ─────────────────────────────────────────── */}
            <button
              type="submit"
              disabled={loading || !canSubmit()}
              className="w-full py-3.5 bg-gradient-to-r from-[#1B4332] to-[#012D1D] text-white font-bold rounded-lg shadow hover:shadow-lg hover:shadow-[#1B4332]/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Complete Building Setup to continue
                </>
              )}
            </button>

            <p className="text-center text-xs text-on-surface-variant">
              By clicking continue, you agree to CheckInNow's Terms of Service and Privacy Policy.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
