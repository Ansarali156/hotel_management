import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checkInGuest, getRooms, ocrAadhaar, ocrPassportVisa, parseOtaBooking } from '../api/hotel.api';
import type { CheckInRequest } from '../../../shared/types/hotel.types';
import HotelLayout from '../components/HotelLayout';
import toast from 'react-hot-toast';

const INDIAN_ID_TYPES = ['Aadhaar Card', 'Voter ID', 'Driving License', 'Passport', 'Other'];
const FOREIGN_ID_TYPES = ['Passport', 'Other'];

const VISA_TYPES = [
  'Tourist',
  'Business',
  'Student',
  'Employment',
  'Medical',
  'Transit',
  'Diplomatic',
  'Research',
  'Other',
];

export default function CheckIn() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const guestPhotoRef = useRef<HTMLInputElement>(null);
  const idPhotoRef = useRef<HTMLInputElement>(null);
  const passportPhotoRef = useRef<HTMLInputElement>(null);
  const visaPhotoRef = useRef<HTMLInputElement>(null);

  const [nationality, setNationality] = useState<'INDIAN' | 'FOREIGN'>('INDIAN');
  const [guestPhotoFile, setGuestPhotoFile] = useState<File | null>(null);
  const [guestPhotoName, setGuestPhotoName] = useState('');
  const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
  const [idPhotoName, setIdPhotoName] = useState('');
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  // Passport/Visa OCR state
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportFileName, setPassportFileName] = useState('');
  const [visaFile, setVisaFile] = useState<File | null>(null);
  const [visaFileName, setVisaFileName] = useState('');
  const [passportOcrScanning, setPassportOcrScanning] = useState(false);
  const [passportOcrDone, setPassportOcrDone] = useState(false);
  const [otaText, setOtaText] = useState('');
  const [otaParsing, setOtaParsing] = useState(false);
  const [showOtaPanel, setShowOtaPanel] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Omit<CheckInRequest, 'nationality'>>({
    roomNumber: '',
    fullName: '',
    age: 18,
    gender: 'MALE',
    phone: '',
    email: '',
    idType: 'Aadhaar Card',
    idNumber: '',
    address: '',
    checkInDate: new Date().toISOString().split('T')[0],
    expectedCheckout: '',
    aadhaarNumber: '',
    passportNumber: '',
  });

  // Foreign-only extra fields
  const [foreignForm, setForeignForm] = useState({
    passportNationality: '',
    passportPlaceOfIssue: '',
    passportDateOfIssue: '',
    passportExpiry: '',
    visaNumber: '',
    visaType: 'Tourist',
    visaValidTill: '',
  });

  const { data: rooms = [] } = useQuery({ queryKey: ['hotel-rooms'], queryFn: getRooms });

  // Pre-select room if navigated from dashboard.
  // Must run inside useEffect — calling setState directly during render
  // triggers re-renders that stomp on user input (D-01 root cause).
  const stateRoom = (location.state as any)?.roomNumber;
  useEffect(() => {
    if (!stateRoom || form.roomNumber || rooms.length === 0) return;
    const match = rooms.find((r) => r.roomNumber === stateRoom && r.status === 'AVAILABLE');
    if (match) setForm((f) => ({ ...f, roomNumber: match.roomNumber }));
    // We intentionally exclude form.roomNumber: we only want to seed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRoom, rooms]);

  const availableRooms = rooms.filter((r) => r.status === 'AVAILABLE');

  const handleGuestPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGuestPhotoFile(file);
    setGuestPhotoName(file.name);
  };

  const handleNationalityChange = (nat: 'INDIAN' | 'FOREIGN') => {
    setNationality(nat);
    // Reset ID type to match the new nationality's allowed types
    if (nat === 'FOREIGN') {
      setForm((f) => ({ ...f, idType: 'Passport' }));
    } else {
      setForm((f) => ({ ...f, idType: 'Aadhaar Card' }));
    }
    setOcrDone(false);
    setIdPhotoFile(null);
    setIdPhotoName('');
  };

  const mutation = useMutation({
    mutationFn: () =>
      checkInGuest({
        ...form,
        nationality,
        guestPhotoFile: guestPhotoFile ?? undefined,
        idPhotoFile: idPhotoFile ?? undefined,
        // Map idNumber to the correct document field based on idType
        passportNumber: nationality === 'FOREIGN' ? form.idNumber
          : form.idType === 'Passport' ? form.idNumber
          : form.passportNumber,
        voterId: form.idType === 'Voter ID' ? form.idNumber : undefined,
        drivingLicense: form.idType === 'Driving License' ? form.idNumber : undefined,
        ...(nationality === 'FOREIGN' ? { foreignDetails: foreignForm } : {}),
      } as any),
    onSuccess: () => {
      toast.success(t('checkIn.success'));
      navigate('/hotel/dashboard');
    },
    onError: (err: any) => {
      const status = err.response?.status;
      if (status === 409) {
        toast.error(t('checkIn.duplicateId'));
      } else {
        toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Check-in failed');
      }
    },
  });

  const handleIdPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdPhotoFile(file);
    setIdPhotoName(file.name);
    setOcrDone(false);

    // Auto-trigger OCR for Aadhaar cards (Indian guests only)
    if (form.idType === 'Aadhaar Card' && nationality === 'INDIAN') {
      setOcrScanning(true);
      try {
        const result = await ocrAadhaar(file);
        if (result.confidence >= 0.5) {
          setForm((prev) => ({
            ...prev,
            ...(result.aadhaarNumber ? { aadhaarNumber: result.aadhaarNumber, idNumber: result.aadhaarNumber } : {}),
            ...((result.fullName || result.name) && !prev.fullName ? { fullName: (result.fullName || result.name)! } : {}),
            ...(result.age && result.age > 0 && result.age < 120 ? { age: result.age } : {}),
            ...(result.gender ? { gender: result.gender } : {}),
            ...(result.address ? { address: result.address } : {}),
            ...(result.phoneNumber ? { phone: result.phoneNumber } : {}),
          }));
          if (!result.age && (result.dob || result.dateOfBirth)) {
            const dobStr = result.dob || result.dateOfBirth;
            const year = new Date(dobStr!).getFullYear();
            const age = new Date().getFullYear() - year;
            if (age > 0 && age < 120) setForm((f) => ({ ...f, age }));
          }
          setOcrDone(true);
          toast.success(t('checkIn.aadhaarScanned'));
        } else {
          toast(t('checkIn.ocrLow'), { icon: '⚠️' });
        }
      } catch {
        toast(t('checkIn.ocrFail'), { icon: '⚠️' });
      } finally {
        setOcrScanning(false);
      }
    }
  };

  // Passport image upload + OCR
  const handlePassportPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPassportFile(file);
    setPassportFileName(file.name);
    setIdPhotoFile(file); // Also use as ID document
    setIdPhotoName(file.name);
    triggerPassportVisaOcr(file, visaFile);
  };

  // Visa image upload + OCR
  const handleVisaPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVisaFile(file);
    setVisaFileName(file.name);
    triggerPassportVisaOcr(passportFile, file);
  };

  // Trigger passport+visa OCR when passport image is available
  const triggerPassportVisaOcr = async (passport: File | null, visa: File | null) => {
    if (!passport) return;
    setPassportOcrScanning(true);
    setPassportOcrDone(false);
    try {
      const result = await ocrPassportVisa(passport, visa || undefined);
      if (result.confidence >= 0.4) {
        if (result.fullName) setForm((f) => ({ ...f, fullName: result.fullName!, idNumber: result.passportNumber || f.idNumber }));
        if (result.passportNumber) setForm((f) => ({ ...f, idNumber: result.passportNumber! }));
        if (result.gender) setForm((f) => ({ ...f, gender: result.gender! }));
        if (result.dateOfBirth) {
          const year = new Date(result.dateOfBirth).getFullYear();
          const age = new Date().getFullYear() - year;
          if (age > 0 && age < 120) setForm((f) => ({ ...f, age }));
        }
        setForeignForm((f) => ({
          ...f,
          ...(result.nationality ? { passportNationality: result.nationality } : {}),
          ...(result.placeOfIssue ? { passportPlaceOfIssue: result.placeOfIssue } : {}),
          ...(result.dateOfIssue ? { passportDateOfIssue: result.dateOfIssue } : {}),
          ...(result.dateOfExpiry ? { passportExpiry: result.dateOfExpiry } : {}),
          ...(result.visaNumber ? { visaNumber: result.visaNumber } : {}),
          ...(result.visaType ? { visaType: result.visaType } : {}),
          ...(result.visaValidTill ? { visaValidTill: result.visaValidTill } : {}),
        }));
        setPassportOcrDone(true);
        toast.success('Passport & visa scanned — fields auto-filled!');
      } else {
        toast('Low confidence — please verify fields manually', { icon: '⚠️' });
      }
    } catch {
      toast('Document scan failed — fill fields manually', { icon: '⚠️' });
    } finally {
      setPassportOcrScanning(false);
    }
  };

  const handleOtaParse = async () => {
    if (!otaText.trim()) return;
    setOtaParsing(true);
    try {
      const result = await parseOtaBooking(otaText);
      if (result.confidence < 0.7) {
        toast('Booking text not recognized well — please verify', { icon: '⚠️' });
      }
      if (result.guestName) setForm((f) => ({ ...f, fullName: result.guestName! }));
      if (result.checkInDate) setForm((f) => ({ ...f, checkInDate: result.checkInDate! }));
      if (result.checkOutDate) setForm((f) => ({ ...f, expectedCheckout: result.checkOutDate! }));
      setShowOtaPanel(false);
      setOtaText('');
      if (result.platform) toast.success(`${result.platform} booking parsed`);
      else toast.success('Booking details filled');
    } catch {
      toast.error('Could not parse booking text');
    } finally {
      setOtaParsing(false);
    }
  };

  const validateId = (type: string, value: string) => {
    if (!value) return '';
    switch (type) {
      case 'Aadhaar Card':
        return /^\d{12}$/.test(value.replace(/\s/g, '')) ? '' : 'Aadhaar must be exactly 12 digits';
      case 'Passport':
        return /^[a-zA-Z0-9]{6,9}$/.test(value) ? '' : 'Passport must be 6-9 alphanumeric characters';
      case 'Voter ID':
        return /^[a-zA-Z0-9]{10}$/.test(value) ? '' : 'Voter ID must be 10 alphanumeric characters';
      case 'Driving License':
        return /^[A-Z]{2}[0-9A-Z]{5,13}$/.test(value.toUpperCase()) ? '' : 'Invalid Driving License format (State Code + Numbers)';
      default:
        return '';
    }
  };

  const handleIdNumberChange = (value: string) => {
    // Use the freshest idType from the form ref (avoids stale-closure bugs
    // when the user changed ID type and immediately edited the number).
    set('idNumber', value);
    setErrors((prev) => ({ ...prev, idNumber: validateId(form.idType, value) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const idError = validateId(form.idType, form.idNumber);
    if (idError) {
      setErrors(prev => ({ ...prev, idNumber: idError }));
      toast.error(idError);
      return;
    }
    if (!guestPhotoFile) { toast.error('Guest photo is required'); return; }
    if (!form.roomNumber) { toast.error('Please select a room'); return; }
    if (nationality === 'FOREIGN') {
      if (!foreignForm.passportNationality) { toast.error('Please enter passport nationality'); return; }
      if (!foreignForm.passportExpiry) { toast.error('Please enter passport expiry date'); return; }
      if (!foreignForm.visaNumber) { toast.error('Please enter visa number'); return; }
      if (!foreignForm.visaValidTill) { toast.error('Please enter visa validity date'); return; }
    }
    mutation.mutate();
  };

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setForeign = (key: keyof typeof foreignForm, value: string) =>
    setForeignForm((f) => ({ ...f, [key]: value }));

  const idTypes = nationality === 'FOREIGN' ? FOREIGN_ID_TYPES : INDIAN_ID_TYPES;

  return (
    <HotelLayout>
      {/* Breadcrumb */}
      <div className="mb-8">
        <nav className="flex text-xs font-medium text-slate-400 gap-2 mb-2 items-center">
          <button onClick={() => navigate('/hotel/dashboard')} className="hover:text-h-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">hotel</span> Room Overview
          </button>
          <span>/</span>
          <span className="text-h-primary font-semibold">New Check-In</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-extrabold text-h-primary tracking-tight font-headline">{t('checkIn.title')}</h1>
          <button
            type="button"
            onClick={() => setShowOtaPanel((p) => !p)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border border-h-primary/30 text-h-primary rounded-lg hover:bg-h-primary/5 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">content_paste</span>
            Paste OTA Booking
          </button>
        </div>
        {showOtaPanel && (
          <div className="mt-4 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/20">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
              Paste booking confirmation text (OYO, MakeMyTrip, Airbnb, Booking.com…)
            </p>
            <textarea
              value={otaText}
              onChange={(e) => setOtaText(e.target.value)}
              rows={5}
              placeholder="Paste full booking confirmation email or SMS here…"
              className="w-full border border-outline-variant/30 rounded-lg text-sm p-3 resize-none focus:outline-none focus:ring-1 focus:ring-h-primary placeholder-slate-300"
            />
            <div className="flex justify-end gap-3 mt-3">
              <button type="button" onClick={() => { setShowOtaPanel(false); setOtaText(''); }} className="text-xs font-bold text-slate-400 hover:text-error uppercase tracking-widest">Cancel</button>
              <button
                type="button"
                onClick={handleOtaParse}
                disabled={otaParsing || !otaText.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-h-primary-container text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-h-primary transition-all disabled:opacity-50"
              >
                {otaParsing ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>}
                Auto-fill
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          {/* ── Left column: form ──────────────────────────────── */}
          <div className="lg:col-span-8 space-y-6 lg:space-y-10">

            {/* Section 1: Guest Identity */}
            <section className="bg-surface-container-lowest rounded-xl p-5 md:p-8 border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-8 h-8 rounded-full bg-h-primary-container text-white flex items-center justify-center text-xs font-bold">01</span>
                <h2 className="text-lg font-bold text-h-primary font-headline">{t('checkIn.guestInfo')}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Indian flow keeps the name in Section 1; foreign flow uses
                    the dedicated "Name as per Passport" field below to avoid
                    rendering two inputs that share state (D-01). */}
                {nationality === 'INDIAN' && (
                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="guest-fullname" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.fullName')} <span className="text-error">*</span></label>
                    <input id="guest-fullname" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="As per ID" className="input-underline h-11 px-4 rounded-none" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="ci-age" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.age')} <span className="text-error">*</span></label>
                    <input id="ci-age" name="age" required type="number" min={1} max={120} value={form.age} onChange={(e) => set('age', Number(e.target.value))} className="input-underline h-11 px-4 rounded-none" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ci-gender" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.gender')} <span className="text-error">*</span></label>
                    <select id="ci-gender" name="gender" value={form.gender} onChange={(e) => set('gender', e.target.value)} className="input-underline h-11 px-4 rounded-none">
                      <option value="MALE">{t('checkIn.male')}</option>
                      <option value="FEMALE">{t('checkIn.female')}</option>
                      <option value="OTHER">{t('checkIn.other')}</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="ci-phone" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.phone')} <span className="text-error">*</span></label>
                  <input id="ci-phone" name="phone" required type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={nationality === 'FOREIGN' ? '+1 / +44 / +...' : '+91'} className="input-underline h-11 px-4 rounded-none" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ci-email" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.email')}</label>
                  <input id="ci-email" name="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Optional" className="input-underline h-11 px-4 rounded-none" />
                </div>
              </div>
            </section>

            {/* Section 2: Identification */}
            <section className="bg-surface-container-lowest rounded-xl p-5 md:p-8 border border-outline-variant/10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-h-primary-container text-white flex items-center justify-center text-xs font-bold">02</span>
                  <h2 className="text-lg font-bold text-h-primary font-headline">{t('checkIn.identification')}</h2>
                </div>
                <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant/20">
                  {(['INDIAN', 'FOREIGN'] as const).map((nat) => (
                    <button
                      key={nat}
                      type="button"
                      onClick={() => handleNationalityChange(nat)}
                      className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                        nationality === nat ? 'bg-white text-h-primary shadow-sm' : 'text-slate-400 hover:text-h-primary'
                      }`}
                    >
                      {nat === 'INDIAN' ? t('checkIn.indian') : t('checkIn.foreign')}
                    </button>
                  ))}
                </div>
              </div>

              {/* ID Type + ID Number (both nationalities) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-1">
                  <label htmlFor="ci-id-type" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.idType')} <span className="text-error">*</span></label>
                  <select
                    id="ci-id-type"
                    name="idType"
                    value={form.idType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      set('idType', newType);
                      const error = validateId(newType, form.idNumber);
                      setErrors(prev => ({ ...prev, idNumber: error }));
                    }}
                    className="input-underline h-11 px-4 rounded-none"
                  >
                    {idTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="ci-id-number" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                    {nationality === 'FOREIGN' ? t('checkIn.passportNumber') : t('checkIn.idNumber')} <span className="text-error">*</span>
                  </label>
                  <input
                    id="ci-id-number"
                    name="idNumber"
                    required
                    value={form.idNumber}
                    onChange={(e) => handleIdNumberChange(e.target.value)}
                    placeholder={nationality === 'FOREIGN' ? 'A1234567' : t('checkIn.enterIdNumber')}
                    className={`input-underline h-11 px-4 rounded-none transition-colors ${errors.idNumber ? 'border-error ring-1 ring-error/20' : ''}`}
                  />
                  {errors.idNumber && (
                    <p className="text-[10px] font-bold text-error mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">error</span>
                      {errors.idNumber}
                    </p>
                  )}
                </div>
              </div>

              {/* FOREIGN: Passport Details */}
              {nationality === 'FOREIGN' && (
                <div className="space-y-6">
                  {/* Passport Details sub-section */}
                  <div className="border-t border-outline-variant/20 pt-6">
                    <div className="flex items-center gap-2 mb-5">
                      <span className="text-base">🪪</span>
                      <h3 className="text-sm font-bold text-h-primary uppercase tracking-wider">{t('checkIn.passportDetails')}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.passportFullName')} <span className="text-error">*</span>
                        </label>
                        <p className="text-[11px] text-slate-400 italic">{t('checkIn.passportFullNameHint')}</p>
                        <input
                          id="guest-fullname"
                          name="fullName"
                          required
                          value={form.fullName}
                          onChange={(e) => set('fullName', e.target.value)}
                          placeholder={t('checkIn.passportNamePlaceholder')}
                          className="input-underline h-11 px-4 rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.passportNationality')} <span className="text-error">*</span>
                        </label>
                        <input
                          id="ci-passport-nationality"
                          name="passportNationality"
                          required
                          value={foreignForm.passportNationality}
                          onChange={(e) => setForeign('passportNationality', e.target.value)}
                          placeholder={t('checkIn.passportNationalityPlaceholder')}
                          className="input-underline h-11 px-4 rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.passportPlaceOfIssue')}
                        </label>
                        <input
                          id="ci-passport-place"
                          name="passportPlaceOfIssue"
                          value={foreignForm.passportPlaceOfIssue}
                          onChange={(e) => setForeign('passportPlaceOfIssue', e.target.value)}
                          placeholder={t('checkIn.passportPlaceOfIssuePlaceholder')}
                          className="input-underline h-11 px-4 rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.passportDateOfIssue')}
                        </label>
                        <input
                          id="ci-passport-issued"
                          name="passportDateOfIssue"
                          type="date"
                          value={foreignForm.passportDateOfIssue}
                          onChange={(e) => setForeign('passportDateOfIssue', e.target.value)}
                          className="input-underline h-11 px-4 rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.passportExpiry')} <span className="text-error">*</span>
                        </label>
                        <input
                          id="ci-passport-expiry"
                          name="passportExpiry"
                          required
                          type="date"
                          value={foreignForm.passportExpiry}
                          onChange={(e) => setForeign('passportExpiry', e.target.value)}
                          className="input-underline h-11 px-4 rounded-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Visa Details sub-section */}
                  <div className="border-t border-outline-variant/20 pt-6">
                    <div className="flex items-center gap-2 mb-5">
                      <span className="text-base">🛂</span>
                      <h3 className="text-sm font-bold text-h-primary uppercase tracking-wider">{t('checkIn.visaDetails')}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.visaNumber')} <span className="text-error">*</span>
                        </label>
                        <input
                          id="ci-visa-number"
                          name="visaNumber"
                          required
                          value={foreignForm.visaNumber}
                          onChange={(e) => setForeign('visaNumber', e.target.value)}
                          placeholder={t('checkIn.visaNumberPlaceholder')}
                          className="input-underline h-11 px-4 rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.visaType')} <span className="text-error">*</span>
                        </label>
                        <select
                          id="ci-visa-type"
                          name="visaType"
                          value={foreignForm.visaType}
                          onChange={(e) => setForeign('visaType', e.target.value)}
                          className="input-underline h-11 px-4 rounded-none"
                        >
                          {VISA_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('checkIn.visaValidTill')} <span className="text-error">*</span>
                        </label>
                        <input
                          id="ci-visa-valid"
                          name="visaValidTill"
                          required
                          type="date"
                          value={foreignForm.visaValidTill}
                          onChange={(e) => setForeign('visaValidTill', e.target.value)}
                          className="input-underline h-11 px-4 rounded-none md:w-1/2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INDIAN: Aadhaar field */}
              {nationality === 'INDIAN' && form.idType === 'Aadhaar Card' && (
                <div className="border-t border-outline-variant/20 pt-6">
                  <div className="space-y-1">
                    <label htmlFor="ci-aadhaar" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.aadhaarNumber')}</label>
                    <input
                      id="ci-aadhaar"
                      name="aadhaarNumber"
                      value={form.aadhaarNumber}
                      onChange={(e) => set('aadhaarNumber', e.target.value)}
                      placeholder={t('checkIn.aadhaarPlaceholder')}
                      maxLength={14}
                      className="input-underline h-11 px-4 rounded-none md:w-1/2"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Stay Details */}
            <section className="bg-surface-container-lowest rounded-xl p-5 md:p-8 border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-8 h-8 rounded-full bg-h-primary-container text-white flex items-center justify-center text-xs font-bold">03</span>
                <h2 className="text-lg font-bold text-h-primary font-headline">{t('checkIn.stayDetails')}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="space-y-1">
                  <label htmlFor="ci-room" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.roomNumber')} <span className="text-error">*</span></label>
                  <select id="ci-room" name="roomNumber" required value={form.roomNumber} onChange={(e) => set('roomNumber', e.target.value)} className="input-underline h-11 px-4 rounded-none">
                    <option value="">{t('checkIn.selectRoom')}</option>
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.roomNumber}>Room {r.roomNumber} ({r.category})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="ci-checkin-date" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.checkInDate')} <span className="text-error">*</span></label>
                  <input id="ci-checkin-date" name="checkInDate" required type="date" value={form.checkInDate} onChange={(e) => set('checkInDate', e.target.value)} className="input-underline h-11 px-4 rounded-none" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ci-expected-checkout" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('checkIn.expectedCheckout')}</label>
                  <input id="ci-expected-checkout" name="expectedCheckout" type="date" value={form.expectedCheckout} onChange={(e) => set('expectedCheckout', e.target.value)} className="input-underline h-11 px-4 rounded-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="ci-address" className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  {nationality === 'FOREIGN' ? t('checkIn.homeCountryAddress') : t('checkIn.permanentAddress')} <span className="text-error">*</span>
                </label>
                <textarea id="ci-address" name="address" required value={form.address} onChange={(e) => set('address', e.target.value)} placeholder={nationality === 'FOREIGN' ? t('checkIn.addressForeignPlaceholder') : t('checkIn.addressPlaceholder')} rows={3} className="input-underline px-4 pt-3 rounded-none resize-none" />
              </div>
            </section>
          </div>

          {/* ── Right column: uploads ──────────────────────────── */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              {/* Guest face photo — REQUIRED for all guests */}
              <div className="bg-surface-container-lowest rounded-xl p-6 border border-h-primary/20 shadow-sm">
                <h3 className="text-sm font-bold text-h-primary mb-1 font-headline flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">face</span>
                  Guest Photo <span className="text-error">*</span>
                </h3>
                <p className="text-[10px] text-slate-400 mb-4">Clear face photo required for identity verification</p>
                <div
                  onClick={() => guestPhotoRef.current?.click()}
                  className={`aspect-square max-h-40 w-full bg-surface-container-low rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group ${
                    guestPhotoName ? 'border-h-primary-container' : 'border-outline-variant hover:border-h-primary'
                  }`}
                >
                  {guestPhotoName ? (
                    <>
                      <span className="material-symbols-outlined text-h-primary-container text-3xl icon-fill">check_circle</span>
                      <span className="text-xs font-bold text-h-primary-container text-center px-2 truncate w-full">{guestPhotoName}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-slate-400 text-3xl group-hover:text-h-primary transition-colors">person</span>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Click to add photo</span>
                    </>
                  )}
                </div>
                <input ref={guestPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleGuestPhotoChange} />
              </div>

              {/* ID Document photo — INDIAN */}
              {nationality === 'INDIAN' && (
                <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
                  <h3 className="text-sm font-bold text-h-primary mb-4 font-headline flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">badge</span>
                    {t('checkIn.idDocument')}
                  </h3>
                  <div
                    onClick={() => idPhotoRef.current?.click()}
                    className="aspect-[1.6/1] bg-surface-container-low rounded-lg border-2 border-dashed border-outline-variant hover:border-h-primary transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
                  >
                    {idPhotoName ? (
                      <>
                        <span className="material-symbols-outlined text-h-primary-container text-3xl icon-fill">check_circle</span>
                        <span className="text-xs font-bold text-h-primary-container text-center px-2 truncate w-full">{idPhotoName}</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-slate-400 text-3xl group-hover:text-h-primary transition-colors">add_a_photo</span>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Click to scan ID</span>
                      </>
                    )}
                  </div>
                  <input ref={idPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleIdPhotoChange} />
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-on-surface-variant">
                      OCR:{' '}
                      <span className={`font-bold ${ocrScanning ? 'text-amber-600' : ocrDone ? 'text-emerald-600' : idPhotoName ? 'text-h-primary' : 'text-slate-400'}`}>
                        {ocrScanning ? t('checkIn.ocrScanning') : ocrDone ? t('checkIn.ocrAutoFilled') : idPhotoName ? t('checkIn.ocrUploaded') : t('checkIn.ocrWaiting')}
                      </span>
                    </span>
                    {ocrScanning && <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />}
                    {ocrDone && <span className="material-symbols-outlined text-emerald-600 text-[16px] icon-fill">check_circle</span>}
                  </div>
                  {ocrDone && <p className="text-[10px] text-emerald-600 mt-1 font-semibold">Name, age, gender, address & Aadhaar auto-filled from scan</p>}
                </div>
              )}

              {/* Passport + Visa uploads — FOREIGN */}
              {nationality === 'FOREIGN' && (
                <>
                  {/* Passport Upload */}
                  <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
                    <h3 className="text-sm font-bold text-h-primary mb-4 font-headline flex items-center gap-2">
                      <span className="text-base">🪪</span> {t('checkIn.passportFront')}
                    </h3>
                    <div
                      onClick={() => passportPhotoRef.current?.click()}
                      className="aspect-[1.6/1] bg-surface-container-low rounded-lg border-2 border-dashed border-outline-variant hover:border-h-primary transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
                    >
                      {passportFileName ? (
                        <>
                          <span className="material-symbols-outlined text-h-primary-container text-3xl icon-fill">check_circle</span>
                          <span className="text-xs font-bold text-h-primary-container text-center px-2 truncate w-full">{passportFileName}</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-slate-400 text-3xl group-hover:text-h-primary transition-colors">add_a_photo</span>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Scan passport photo page</span>
                        </>
                      )}
                    </div>
                    <input ref={passportPhotoRef} type="file" accept="image/*" className="hidden" onChange={handlePassportPhotoChange} />
                  </div>

                  {/* Visa Upload */}
                  <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
                    <h3 className="text-sm font-bold text-h-primary mb-4 font-headline flex items-center gap-2">
                      <span className="text-base">🛂</span> {t('checkIn.visaPage')}
                    </h3>
                    <div
                      onClick={() => visaPhotoRef.current?.click()}
                      className="aspect-[1.6/1] bg-surface-container-low rounded-lg border-2 border-dashed border-outline-variant hover:border-h-primary transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
                    >
                      {visaFileName ? (
                        <>
                          <span className="material-symbols-outlined text-h-primary-container text-3xl icon-fill">check_circle</span>
                          <span className="text-xs font-bold text-h-primary-container text-center px-2 truncate w-full">{visaFileName}</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-slate-400 text-3xl group-hover:text-h-primary transition-colors">add_a_photo</span>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Scan visa stamp/sticker</span>
                        </>
                      )}
                    </div>
                    <input ref={visaPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleVisaPhotoChange} />
                  </div>

                  {/* Passport/Visa OCR status */}
                  <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-on-surface-variant">
                        Document OCR:{' '}
                        <span className={`font-bold ${passportOcrScanning ? 'text-amber-600' : passportOcrDone ? 'text-emerald-600' : passportFileName ? 'text-h-primary' : 'text-slate-400'}`}>
                          {passportOcrScanning ? t('checkIn.ocrScanning') : passportOcrDone ? t('checkIn.ocrAutoFilled') : passportFileName ? t('checkIn.ocrUploaded') : t('checkIn.ocrWaiting')}
                        </span>
                      </span>
                      {passportOcrScanning && <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />}
                      {passportOcrDone && <span className="material-symbols-outlined text-emerald-600 text-[16px] icon-fill">check_circle</span>}
                    </div>
                    {passportOcrDone && <p className="text-[10px] text-emerald-600 mt-1 font-semibold">Passport & visa details auto-filled from scan</p>}
                  </div>
                </>
              )}

              {/* Protocol note */}
              <div className={`rounded-xl p-4 border ${nationality === 'FOREIGN' ? 'bg-amber-50 border-amber-200' : 'bg-h-primary/5 border-h-primary/10'}`}>
                <div className="flex gap-3">
                  <span className={`material-symbols-outlined icon-fill ${nationality === 'FOREIGN' ? 'text-amber-600' : 'text-h-primary'}`}>info</span>
                  <div>
                    <p className={`text-xs font-bold mb-1 ${nationality === 'FOREIGN' ? 'text-amber-700' : 'text-h-primary'}`}>
                      {t('checkIn.guestProtocol')}
                    </p>
                    <p className="text-[11px] text-on-primary-fixed-variant leading-relaxed">
                      {nationality === 'FOREIGN'
                        ? t('checkIn.foreignProtocolText')
                        : t('checkIn.guestProtocolText')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="mt-8 md:mt-16 pt-6 md:pt-8 border-t border-outline-variant/20 flex flex-col gap-4">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-h-primary-container text-white py-4 rounded-lg font-bold text-sm tracking-widest uppercase hover:bg-h-primary transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {mutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">lock</span>
                {t('checkIn.submitCheckIn')}
              </>
            )}
          </button>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/hotel/dashboard')}
              className="text-sm font-bold text-slate-400 hover:text-error transition-colors uppercase tracking-widest"
            >
              {t('checkIn.cancelRevert')}
            </button>
          </div>
        </div>
      </form>
    </HotelLayout>
  );
}
