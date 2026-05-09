import { useTranslation } from 'react-i18next';
import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import HotelLayout from '../components/HotelLayout';
import { scanRegister, bulkCheckIn } from '../api/hotel.api';
import toast from 'react-hot-toast';

// Mobile-only guard — true if viewport is phone-sized or app is running as installed PWA
function isMobileOrPWA(): boolean {
  const isPWA =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  const isMobileViewport = window.innerWidth < 768;
  return isPWA || isMobileViewport;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScannedGuest {
  fullName: string;
  age: string;
  gender: string;
  phoneNumber: string;
  roomNumber: string;
  checkInDate: string;
  expectedCheckout: string;
  address: string;
  aadhaarNumber: string;
  passportNumber: string;
  guestType: 'DOMESTIC' | 'INTERNATIONAL';
}

const REQUIRED_FIELDS: (keyof ScannedGuest)[] = [
  'fullName', 'age', 'gender', 'phoneNumber', 'roomNumber', 'checkInDate',
];

const FIELD_LABELS: Record<keyof ScannedGuest, string> = {
  fullName: 'Full Name',
  age: 'Age',
  gender: 'Gender',
  phoneNumber: 'Phone',
  roomNumber: 'Room No.',
  checkInDate: 'Check-In Date',
  expectedCheckout: 'Checkout Date',
  address: 'Address',
  aadhaarNumber: 'Aadhaar No.',
  passportNumber: 'Passport No.',
  guestType: 'Guest Type',
};

function emptyGuest(): ScannedGuest {
  return {
    fullName: '', age: '', gender: 'MALE', phoneNumber: '',
    roomNumber: '', checkInDate: new Date().toISOString().split('T')[0],
    expectedCheckout: '', address: '', aadhaarNumber: '',
    passportNumber: '', guestType: 'DOMESTIC',
  };
}

function isMissingRequired(g: ScannedGuest): string[] {
  return REQUIRED_FIELDS.filter((f) => !String(g[f] ?? '').trim());
}

function fromScanned(raw: any): ScannedGuest {
  return {
    fullName: raw.fullName ?? '',
    age: raw.age != null ? String(raw.age) : '',
    gender: ['MALE', 'FEMALE', 'OTHER'].includes(raw.gender) ? raw.gender : 'MALE',
    phoneNumber: raw.phoneNumber ?? '',
    roomNumber: raw.roomNumber ?? '',
    checkInDate: raw.checkInDate ?? new Date().toISOString().split('T')[0],
    expectedCheckout: raw.expectedCheckout ?? '',
    address: raw.address ?? '',
    aadhaarNumber: raw.aadhaarNumber ?? '',
    passportNumber: raw.passportNumber ?? '',
    guestType: raw.guestType === 'INTERNATIONAL' ? 'INTERNATIONAL' : 'DOMESTIC',
  };
}

type Step = 'upload' | 'scanning' | 'review' | 'uploading' | 'done';

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanRegister() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [guests, setGuests] = useState<ScannedGuest[]>([]);
  const [uploadResults, setUploadResults] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPEG, PNG, or WEBP images are supported');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File must be under 20 MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  // ── Scan ───────────────────────────────────────────────────────────────────

  const handleScan = async () => {
    if (!imageFile) return;
    setStep('scanning');
    try {
      const data = await scanRegister(imageFile);
      if (data.guests.length === 0) {
        toast.error('No guest entries found. Try a clearer, well-lit photo.');
        setStep('upload');
        return;
      }
      setGuests(data.guests.map(fromScanned));
      setStep('review');
      toast.success(`Found ${data.guests.length} guest ${data.guests.length === 1 ? 'entry' : 'entries'} — review and correct below`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? err.message ?? 'Scan failed');
      setStep('upload');
    }
  };

  // ── Edit guest row ─────────────────────────────────────────────────────────

  const updateGuest = (idx: number, field: keyof ScannedGuest, value: string) => {
    setGuests((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      // Auto-set guestType based on passportNumber
      if (field === 'passportNumber') {
        next[idx].guestType = value.trim() ? 'INTERNATIONAL' : 'DOMESTIC';
      }
      return next;
    });
  };

  const removeGuest = (idx: number) => {
    setGuests((prev) => prev.filter((_, i) => i !== idx));
    if (expandedRow === idx) setExpandedRow(null);
  };

  const addEmptyRow = () => {
    setGuests((prev) => [...prev, emptyGuest()]);
    setExpandedRow(guests.length);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const allValid = guests.length > 0 && guests.every((g) => isMissingRequired(g).length === 0);

  const handleUpload = async () => {
    if (!allValid) return;
    for (const g of guests) {
      const ageNum = Number(g.age);
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 100) {
        toast.error(`Age for ${g.fullName || 'guest'} must be between 0 and 100`);
        return;
      }
    }
    setStep('uploading');
    try {
      const payload = guests.map((g) => ({
        ...g,
        age: Number(g.age),
        expectedCheckout: g.expectedCheckout || null,
        address: g.address || null,
        aadhaarNumber: g.aadhaarNumber || null,
        passportNumber: g.passportNumber || null,
      }));
      const result = await bulkCheckIn(payload);
      setUploadResults(result.results ?? []);
      setStep('done');
      if (result.failCount === 0) {
        toast.success(`All ${result.successCount} guests checked in!`);
      } else {
        toast(`${result.successCount} checked in, ${result.failCount} failed`, { icon: '⚠️' });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Upload failed');
      setStep('review');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isMobileOrPWA()) {
    return (
      <HotelLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-slate-400 text-4xl">smartphone</span>
          </div>
          <h2 className="text-xl font-bold text-on-surface font-headline mb-2">{t('scanRegister.mobileOnly')}</h2>
          <p className="text-sm text-slate-400 max-w-sm leading-relaxed mb-6">
            Register scanning is designed for on-the-go use at the front desk. Install CheckInNow on your phone and use it from there.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-left max-w-sm w-full space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">How to install</p>
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-on-surface">Android:</span> Open this site in Chrome → tap the menu → "Add to Home screen"
            </p>
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-on-surface">iPhone:</span> Open in Safari → tap Share → "Add to Home Screen"
            </p>
          </div>
          <button
            onClick={() => navigate('/hotel/dashboard')}
            className="mt-8 px-6 py-2.5 bg-h-primary text-white text-sm font-bold rounded-lg hover:bg-h-primary/90 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </HotelLayout>
    );
  }

  return (
    <HotelLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-3">
            <button onClick={() => navigate('/hotel/guests')} className="hover:text-h-primary transition-colors">All Guests</button>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="font-semibold text-slate-700">Scan Register</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-headline text-2xl font-black text-slate-800">{t('scanRegister.title')}</h1>
              <p className="text-slate-500 text-sm mt-1">
                Take a photo of your guest register page — AI extracts all entries automatically.
              </p>
            </div>
            {/* Step indicator */}
            <div className="hidden md:flex items-center gap-2 text-xs font-medium">
              {(['upload', 'review', 'done'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step === s || (step === 'scanning' && s === 'upload') || (step === 'uploading' && s === 'review')
                      ? 'bg-h-primary-container text-white'
                      : (step as string) === 'done' || (s === 'upload' && ['review','uploading','done'].includes(step)) || (s === 'review' && (step as string) === 'done')
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {((step as string) === 'done' && s !== 'done') || (s === 'upload' && ['review','uploading','done'].includes(step)) || (s === 'review' && (step as string) === 'done')
                      ? <span className="material-symbols-outlined text-[14px]">check</span>
                      : i + 1}
                  </div>
                  <span className={step === s || (step === 'scanning' && s === 'upload') || (step === 'uploading' && s === 'review') ? 'text-h-primary-container' : 'text-slate-400'}>
                    {s === 'upload' ? 'Upload' : s === 'review' ? 'Review' : 'Done'}
                  </span>
                  {i < 2 && <span className="text-slate-200 text-lg">›</span>}
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
        {(step === 'upload' || step === 'scanning') && (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Drop zone */}
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => !imageFile && fileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl flex flex-col items-center justify-center min-h-[320px] transition-all cursor-pointer overflow-hidden
                ${isDragging ? 'border-h-primary-container bg-h-primary/5 scale-[1.01]' : imageFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-slate-50 hover:border-h-primary-container/50 hover:bg-slate-100/50'}`}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Register" className="w-full h-full object-contain max-h-72" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
                    className="absolute top-3 right-3 bg-white rounded-full shadow p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      {imageFile?.name}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-h-primary/5 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-h-primary-container text-[40px]">document_scanner</span>
                  </div>
                  <p className="font-bold text-slate-700 text-base">{t('scanRegister.dropPhoto')}</p>
                  <p className="text-slate-400 text-sm mt-1">{t('scanRegister.orClick')}</p>
                  <p className="text-slate-400 text-xs mt-3">JPEG · PNG · WEBP · Max 20 MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {/* Tips + scan button */}
            <div className="flex flex-col gap-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="font-bold text-amber-800 text-sm flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[18px]">tips_and_updates</span>
                  Tips for best results
                </h3>
                <ul className="space-y-2 text-xs text-amber-700">
                  {[
                    'Lay the register flat — avoid curved or bent pages',
                    'Shoot in good lighting — avoid shadows over text',
                    'Keep the camera parallel to the page (no tilt)',
                    'Make sure all columns are visible in the frame',
                    'One page at a time — do not include multiple pages',
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">check</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <h3 className="font-bold text-slate-700 text-sm mb-2">Fields AI will extract</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {Object.entries(FIELD_LABELS).map(([k, label]) => (
                    <div key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${REQUIRED_FIELDS.includes(k as any) ? 'bg-red-400' : 'bg-slate-300'}`} />
                      {label}
                      {REQUIRED_FIELDS.includes(k as any) && <span className="text-red-400">*</span>}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-3">* Required fields</p>
              </div>

              <button
                onClick={handleScan}
                disabled={!imageFile || step === 'scanning'}
                className="w-full h-14 bg-h-primary-container hover:bg-h-primary text-white font-headline font-bold text-lg rounded-xl shadow transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 'scanning' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    AI is reading the register…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">auto_awesome</span>
                    Scan with AI
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Review ─────────────────────────────────────────────── */}
        {(step === 'review' || step === 'uploading') && (
          <div className="space-y-6">
            {/* Summary bar */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-100 px-5 py-4 shadow-sm">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-700">{guests.length} entries extracted</span>
                {guests.some((g) => isMissingRequired(g).length > 0) ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1 rounded-full">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    {guests.filter((g) => isMissingRequired(g).length > 0).length} rows need attention
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    All entries valid
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={addEmptyRow}
                  className="flex items-center gap-1.5 text-sm font-semibold text-h-primary-container hover:underline"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Add Row
                </button>
                <button
                  onClick={() => { setStep('upload'); setGuests([]); }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  ← Rescan
                </button>
              </div>
            </div>

            {/* Guest cards */}
            <div className="space-y-3">
              {guests.map((guest, idx) => {
                const missing = isMissingRequired(guest);
                const isExpanded = expandedRow === idx;
                return (
                  <div
                    key={idx}
                    className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                      missing.length > 0 ? 'border-red-200' : 'border-slate-100'
                    }`}
                  >
                    {/* Row header */}
                    <div
                      className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedRow(isExpanded ? null : idx)}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        missing.length > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {missing.length > 0
                          ? <span className="material-symbols-outlined text-[16px]">warning</span>
                          : <span className="material-symbols-outlined text-[16px]">check</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800 truncate">
                          {guest.fullName || <span className="text-red-400 italic">Name missing</span>}
                        </p>
                        <p className="text-xs text-slate-400">
                          Room {guest.roomNumber || '?'} · {guest.guestType} · {guest.checkInDate || '?'}
                          {missing.length > 0 && (
                            <span className="ml-2 text-red-500 font-medium">
                              Missing: {missing.map((f) => FIELD_LABELS[f as keyof ScannedGuest]).join(', ')}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeGuest(idx); }}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Remove row"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                        <span className={`material-symbols-outlined text-slate-400 text-[20px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          expand_more
                        </span>
                      </div>
                    </div>

                    {/* Expanded edit form */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {/* Full Name */}
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                              Full Name <span className="text-red-400">*</span>
                            </label>
                            <input
                              value={guest.fullName}
                              onChange={(e) => updateGuest(idx, 'fullName', e.target.value)}
                              className={`w-full rounded-lg border px-3 py-2 text-sm ${!guest.fullName ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                            />
                          </div>
                          {/* Age */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                              Age <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="number" min={0} max={100}
                              value={guest.age}
                              onChange={(e) => updateGuest(idx, 'age', e.target.value)}
                              className={`w-full rounded-lg border px-3 py-2 text-sm ${!guest.age ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                            />
                          </div>
                          {/* Gender */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                              Gender <span className="text-red-400">*</span>
                            </label>
                            <select
                              value={guest.gender}
                              onChange={(e) => updateGuest(idx, 'gender', e.target.value)}
                              className={`w-full rounded-lg border px-3 py-2 text-sm ${!guest.gender ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                            >
                              <option value="">Select</option>
                              <option value="MALE">Male</option>
                              <option value="FEMALE">Female</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          {/* Phone */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                              Phone <span className="text-red-400">*</span>
                            </label>
                            <input
                              value={guest.phoneNumber}
                              onChange={(e) => updateGuest(idx, 'phoneNumber', e.target.value)}
                              className={`w-full rounded-lg border px-3 py-2 text-sm ${!guest.phoneNumber ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                            />
                          </div>
                          {/* Room No. */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                              Room No. <span className="text-red-400">*</span>
                            </label>
                            <input
                              value={guest.roomNumber}
                              onChange={(e) => updateGuest(idx, 'roomNumber', e.target.value)}
                              className={`w-full rounded-lg border px-3 py-2 text-sm ${!guest.roomNumber ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                            />
                          </div>
                          {/* Check-in date */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                              Check-In Date <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="date"
                              value={guest.checkInDate}
                              onChange={(e) => updateGuest(idx, 'checkInDate', e.target.value)}
                              className={`w-full rounded-lg border px-3 py-2 text-sm ${!guest.checkInDate ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                            />
                          </div>
                          {/* Checkout date */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                              Checkout Date
                            </label>
                            <input
                              type="date"
                              value={guest.expectedCheckout}
                              onChange={(e) => updateGuest(idx, 'expectedCheckout', e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          {/* Aadhaar */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Aadhaar No.</label>
                            <input
                              maxLength={12}
                              value={guest.aadhaarNumber}
                              onChange={(e) => updateGuest(idx, 'aadhaarNumber', e.target.value.replace(/\D/g, ''))}
                              placeholder="12 digits"
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                            />
                          </div>
                          {/* Passport */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Passport No.</label>
                            <input
                              value={guest.passportNumber}
                              onChange={(e) => updateGuest(idx, 'passportNumber', e.target.value.toUpperCase())}
                              placeholder="For foreign guests"
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono uppercase"
                            />
                          </div>
                          {/* Address */}
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Address</label>
                            <input
                              value={guest.address}
                              onChange={(e) => updateGuest(idx, 'address', e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          {/* Guest type */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Guest Type</label>
                            <select
                              value={guest.guestType}
                              onChange={(e) => updateGuest(idx, 'guestType', e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="DOMESTIC">Domestic</option>
                              <option value="INTERNATIONAL">International</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Upload bar */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 -mx-4 md:-mx-8 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.04)] z-30">
              <div className="text-sm text-slate-500">
                {!allValid
                  ? <span className="text-red-500 font-medium flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">error</span>
                      Fill in all required fields (*) before uploading
                    </span>
                  : <span className="text-emerald-600 font-medium flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      {guests.length} guest{guests.length !== 1 ? 's' : ''} ready to upload
                    </span>
                }
              </div>
              <button
                onClick={handleUpload}
                disabled={!allValid || step === 'uploading'}
                className="bg-h-primary-container hover:bg-h-primary text-white px-8 py-3 rounded-xl font-headline font-bold text-sm shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 'uploading' ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading…</>
                ) : (
                  <><span className="material-symbols-outlined text-[18px]">upload</span> Upload All Guests</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ───────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="max-w-xl mx-auto text-center py-16 space-y-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-emerald-600 text-[40px]">check_circle</span>
            </div>
            <div>
              <h2 className="font-headline text-2xl font-black text-slate-800 mb-2">Upload complete</h2>
              <p className="text-slate-500 text-sm">
                {uploadResults.filter((r) => r.success).length} guests checked in successfully.
                {uploadResults.filter((r) => !r.success).length > 0 && (
                  <span className="text-amber-600 block mt-1">
                    {uploadResults.filter((r) => !r.success).length} failed — see details below.
                  </span>
                )}
              </p>
            </div>

            {/* Result list */}
            <div className="text-left space-y-2">
              {uploadResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${r.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                  <span className="material-symbols-outlined text-[18px]">{r.success ? 'check_circle' : 'error'}</span>
                  <span className="font-medium">
                    {guests[r.index]?.fullName ?? `Row ${r.index + 1}`}
                  </span>
                  {!r.success && <span className="text-xs text-red-500 ml-auto">{r.error}</span>}
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setStep('upload'); setGuests([]); setImageFile(null); setImagePreview(null); setUploadResults([]); }}
                className="px-6 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Scan Another Page
              </button>
              <button
                onClick={() => navigate('/hotel/guests')}
                className="px-6 py-3 rounded-xl bg-h-primary-container text-white text-sm font-bold hover:bg-h-primary transition-colors"
              >
                View Guest List
              </button>
            </div>
          </div>
        )}
      </div>
    </HotelLayout>
  );
}
