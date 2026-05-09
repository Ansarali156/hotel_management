import { useTranslation } from 'react-i18next';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCriminal } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import toast from 'react-hot-toast';

const THREAT_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const CASE_STATUSES = ['ABSCONDING', 'WANTED', 'IN_CUSTODY', 'UNDER_INVESTIGATION', 'PAROLE', 'ARRESTED', 'RELEASED'] as const;

export default function AddCriminal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const photoRef = useRef<HTMLInputElement>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [crimeInput, setCrimeInput] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    aliases: [] as string[],
    age: '',
    gender: '',
    description: '',
    distinguishingMarks: '',
    crimeTypes: [] as string[],
    crimeDescription: '',
    caseStatus: 'ABSCONDING' as string,
    threatLevel: 'HIGH' as string,
    firNumbers: '',
    warrantNumber: '',
    aadhaarNumber: '',
    voterId: '',
    drivingLicense: '',
    passport: '',
    phone: '',
    emailAddresses: '',
    residentialAddress: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addAlias = () => {
    const t = aliasInput.trim();
    if (t && !form.aliases.includes(t)) {
      setForm((f) => ({ ...f, aliases: [...f.aliases, t] }));
      setAliasInput('');
    }
  };

  const addCrime = () => {
    const t = crimeInput.trim();
    if (t && !form.crimeTypes.includes(t)) {
      setForm((f) => ({ ...f, crimeTypes: [...f.crimeTypes, t] }));
      setCrimeInput('');
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      createCriminal({
        fullName: form.fullName,
        aliases: form.aliases.length ? form.aliases : undefined,
        age: form.age && Number(form.age) >= 0 && Number(form.age) <= 100
          ? Number(form.age)
          : undefined,
        gender: form.gender || undefined,
        description: form.description || undefined,
        distinguishingMarks: form.distinguishingMarks || undefined,
        crimeTypes: form.crimeTypes,
        crimeDescription: form.crimeDescription || undefined,
        caseStatus: form.caseStatus,
        threatLevel: form.threatLevel,
        firNumbers: form.firNumbers || undefined,
        warrantNumber: form.warrantNumber || undefined,
        // Strip spaces and dashes before validating (handles 1234-5678-9012 and 1234 5678 9012)
        aadhaarNumber: (() => {
          const cleaned = form.aadhaarNumber.replace(/[\s\-]/g, '');
          return cleaned.length === 12 && /^\d{12}$/.test(cleaned) ? cleaned : undefined;
        })(),
        voterId: form.voterId || undefined,
        drivingLicense: form.drivingLicense || undefined,
        passport: form.passport || undefined,
        phone: form.phone || undefined,
        emailAddresses: form.emailAddresses || undefined,
        residentialAddress: form.residentialAddress || undefined,
        photoFile: photoFile ?? undefined,
      }),
    onSuccess: () => {
      toast.success('Criminal profile created');
      queryClient.invalidateQueries({ queryKey: ['police-criminals'] });
      navigate('/police/criminals');
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      let msg = data?.error || data?.message || 'Failed to create profile';
      if (data?.code === 'VALIDATION_ERROR' && Array.isArray(data?.details)) {
        const detailsStr = data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
        if (detailsStr) msg = `Validation failed: ${detailsStr}`;
      }
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) { toast.error('Full name is required'); return; }
    if (form.crimeTypes.length === 0) { toast.error('Add at least one crime type'); return; }
    const ageNum = Number(form.age);
    if (form.age !== '' && (isNaN(ageNum) || ageNum < 0 || ageNum > 100)) {
      toast.error('Age must be between 0 and 100');
      return;
    }
    const aadhaarCleaned = form.aadhaarNumber.replace(/\s/g, '');
    if (!aadhaarCleaned || !/^\d{12}$/.test(aadhaarCleaned)) {
      toast.error('Aadhaar number is required (12 digits)');
      return;
    }
    mutation.mutate();
  };

  return (
    <PoliceLayout>
      <div className="max-w-6xl mx-auto px-10 py-10 pb-28">
        {/* Breadcrumb + header */}
        <header className="mb-10">
          <nav className="flex items-center gap-2 text-p-on-surface-variant text-xs mb-3 font-brand">
            <button onClick={() => navigate('/police/criminals')} className="hover:text-p-primary transition-colors">Case Files</button>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="font-semibold text-p-on-surface">Add Criminal Profile</span>
          </nav>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-[#1B4332]">{t('police.addCriminalTitle')}</h1>
          <p className="text-p-on-surface-variant mt-1 text-sm">Create a new entry in the Sovereign Observer database. Fields marked * are mandatory.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-12 gap-10 items-start">
            {/* Left column: form */}
            <div className="col-span-8 space-y-12">
              {/* Identity */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-p-on-surface-variant shrink-0">Identity Information</h3>
                  <div className="h-px w-full bg-p-outline-variant/20" />
                </div>
                <div className="grid grid-cols-2 gap-6 font-brand">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">
                      Full Legal Name <span className="text-p-error">*</span>
                    </label>
                    <input
                      required
                      value={form.fullName}
                      onChange={(e) => set('fullName', e.target.value)}
                      placeholder="Enter given names and surname"
                      className="input-filled w-full py-3 px-4 rounded-t-lg"
                    />
                  </div>

                  {/* Aliases */}
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Known Aliases</label>
                    <div className="flex flex-wrap gap-2 p-3 bg-p-surface-container-low rounded-lg min-h-[44px] items-center">
                      {form.aliases.map((a) => (
                        <span key={a} className="bg-p-secondary/10 text-p-secondary text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                          {a}
                          <button type="button" onClick={() => setForm((f) => ({ ...f, aliases: f.aliases.filter((x) => x !== a) }))}>
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </span>
                      ))}
                      <input
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                        placeholder="Add alias…"
                        className="bg-transparent border-none focus:ring-0 text-sm p-0 w-24 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Age</label>
                    <input type="number" min="0" max="100" value={form.age} onChange={(e) => set('age', e.target.value)} className="input-filled w-full py-3 px-4 rounded-t-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Gender</label>
                    <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className="input-filled w-full py-3 px-4 rounded-t-lg">
                      <option value="">Select</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Non-binary</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Physical Description <span className="text-p-error">*</span></label>
                    <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Build, height, hair color, eye color…" className="input-filled w-full py-3 px-4 rounded-t-lg resize-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Distinguishing Marks</label>
                    <input value={form.distinguishingMarks} onChange={(e) => set('distinguishingMarks', e.target.value)} placeholder="Tattoos, scars, birthmarks" className="input-filled w-full py-3 px-4 rounded-t-lg" />
                  </div>
                </div>
              </section>

              {/* Case details */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-p-on-surface-variant shrink-0">{t('police.criminalRecords')} &amp; Case Details</h3>
                  <div className="h-px w-full bg-p-outline-variant/20" />
                </div>
                <div className="grid grid-cols-2 gap-6 font-brand">
                  {/* Crime types */}
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Crime Type <span className="text-p-error">*</span></label>
                    <div className="flex flex-wrap gap-2 p-3 bg-p-surface-container-low rounded-lg">
                      {form.crimeTypes.map((c) => (
                        <span key={c} className="bg-p-error/10 text-p-error text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 border border-p-error/20">
                          {c}
                          <button type="button" onClick={() => setForm((f) => ({ ...f, crimeTypes: f.crimeTypes.filter((x) => x !== c) }))}>
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input
                          value={crimeInput}
                          onChange={(e) => setCrimeInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCrime(); } }}
                          placeholder="Add crime type…"
                          className="bg-transparent border-none focus:ring-0 text-sm px-2 outline-none"
                        />
                        <button type="button" onClick={addCrime} className="text-p-primary text-xs font-bold flex items-center gap-1 px-2 hover:underline">
                          <span className="material-symbols-outlined text-[16px]">add_circle</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Detailed Description of Offenses</label>
                    <textarea value={form.crimeDescription} onChange={(e) => set('crimeDescription', e.target.value)} rows={4} className="input-filled w-full py-3 px-4 rounded-t-lg resize-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Current Status <span className="text-p-error">*</span></label>
                    <select value={form.caseStatus} onChange={(e) => set('caseStatus', e.target.value)} className="input-filled w-full py-3 px-4 rounded-t-lg">
                      {CASE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Threat Level</label>
                    <div className="flex items-center gap-4 mt-2">
                      {THREAT_LEVELS.map((t) => (
                        <label key={t} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="threat"
                            value={t}
                            checked={form.threatLevel === t}
                            onChange={() => set('threatLevel', t)}
                            className="text-p-primary focus:ring-0 border-p-outline-variant"
                          />
                          <span className={`text-xs font-bold ${t === 'CRITICAL' || t === 'HIGH' ? 'text-p-error' : t === 'MEDIUM' ? 'text-amber-600' : 'text-p-tertiary'}`}>{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">FIR Records</label>
                    <input value={form.firNumbers} onChange={(e) => set('firNumbers', e.target.value)} placeholder="FIR numbers, comma-separated" className="input-filled w-full py-3 px-4 rounded-t-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">Warrant #</label>
                    <input value={form.warrantNumber} onChange={(e) => set('warrantNumber', e.target.value)} placeholder="WRNT-2024-XXXX" className="input-filled w-full py-3 px-4 rounded-t-lg font-mono uppercase" />
                  </div>
                </div>
              </section>

              {/* Documents */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-p-on-surface-variant shrink-0">{t('police.officialDocs')} &amp; Contact</h3>
                  <div className="h-px w-full bg-p-outline-variant/20" />
                </div>
                <div className="grid grid-cols-3 gap-6 font-brand">
                  {[
                    { label: 'Aadhaar Card #', key: 'aadhaarNumber', placeholder: 'XXXXXXXXXXXX', required: true },
                    { label: 'Voter ID', key: 'voterId', placeholder: 'ABC1234567' },
                    { label: 'Driving License', key: 'drivingLicense', placeholder: 'DL-XXXXXXXXXXXX' },
                    { label: 'Passport #', key: 'passport', placeholder: 'PXXXXXXXX' },
                    { label: 'Phone Numbers', key: 'phone', placeholder: '+91 00000 00000' },
                    { label: 'Email Addresses', key: 'emailAddresses', placeholder: 'example@host.com', span: 2 },
                    { label: 'Primary Residential Address', key: 'residentialAddress', placeholder: 'Street, Building, City, State, PIN', span: 3 },
                  ].map(({ label, key, placeholder, span, required }: any) => (
                    <div key={key} className={span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : ''}>
                      <label className="block text-xs font-bold text-p-on-surface-variant mb-1.5 uppercase tracking-wide">
                        {label} {required && <span className="text-p-error">*</span>}
                      </label>
                      <input
                        required={required}
                        value={(form as any)[key]}
                        onChange={(e) => set(key as keyof typeof form, e.target.value)}
                        placeholder={placeholder}
                        className="input-filled w-full py-3 px-4 rounded-t-lg"
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Right column: photo upload */}
            <div className="col-span-4 sticky top-28">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-p-outline-variant/10">
                <label className="block text-xs font-bold text-p-on-surface-variant mb-4 uppercase tracking-wide">
                  Official Mugshot / Identification Photo
                </label>
                <div
                  onClick={() => photoRef.current?.click()}
                  className="aspect-[3/4] border-2 border-dashed border-p-outline-variant/40 rounded-lg flex flex-col items-center justify-center bg-background group cursor-pointer hover:border-p-primary/50 transition-all overflow-hidden"
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <div className="w-20 h-20 bg-p-primary/5 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-p-primary text-[32px]">photo_camera</span>
                      </div>
                      <p className="text-sm font-bold text-p-on-surface mb-1">Upload Photo</p>
                      <p className="text-[11px] text-p-on-surface-variant text-center px-4">
                        Drag and drop or click to browse.<br />JPG, PNG (Max 5MB)
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }
                  }}
                />
                <div className="mt-6 p-4 bg-p-primary-container/30 rounded-lg">
                  <div className="flex gap-3">
                    <span className="material-symbols-outlined text-p-primary">info</span>
                    <div>
                      <h4 className="text-xs font-bold text-p-on-primary-container">Security Protocol</h4>
                      <p className="text-[11px] text-p-on-primary-container/80 mt-1 leading-relaxed">
                        All images are processed through the biometric engine for feature extraction.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-[240px] right-0 bg-white border-t border-p-outline-variant/20 px-10 py-6 flex items-center justify-between z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-p-tertiary" />
          <p className="text-xs font-medium text-p-on-surface-variant font-brand">Draft — not yet saved</p>
        </div>
        <div className="flex items-center gap-8">
          <button type="button" onClick={() => navigate('/police/criminals')} className="text-sm font-semibold text-p-secondary hover:text-p-on-surface transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="bg-[#1B4332] text-white px-10 py-3.5 rounded-lg font-headline font-bold text-base shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center gap-3 disabled:opacity-60"
          >
            {mutation.isPending ? t('police.saving') : (
              <>
                <span>{t('police.saveProfile')}</span>
                <span className="material-symbols-outlined">save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </PoliceLayout>
  );
}
