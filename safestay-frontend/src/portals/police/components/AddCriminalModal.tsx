/**
 * AddCriminalModal — inline modal version of the Add Criminal form.
 * Used from the Criminal Registry page so officers never leave the list context.
 */

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCriminal } from '../api/police.api';
import toast from 'react-hot-toast';

const THREAT_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const CASE_STATUSES = [
  'ABSCONDING', 'WANTED', 'IN_CUSTODY', 'UNDER_INVESTIGATION', 'PAROLE', 'ARRESTED', 'RELEASED',
] as const;

interface Props {
  onClose: () => void;
}

export default function AddCriminalModal({ onClose }: Props) {
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
    caseStatus: 'WANTED' as string,
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

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
        age: form.age ? Number(form.age) : undefined,
        gender: form.gender || undefined,
        description: form.description || undefined,
        distinguishingMarks: form.distinguishingMarks || undefined,
        crimeTypes: form.crimeTypes,
        crimeDescription: form.crimeDescription || undefined,
        caseStatus: form.caseStatus,
        threatLevel: form.threatLevel,
        firNumbers: form.firNumbers || undefined,
        warrantNumber: form.warrantNumber || undefined,
        aadhaarNumber: form.aadhaarNumber || undefined,
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
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to create profile');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) { toast.error('Full name is required'); return; }
    if (form.crimeTypes.length === 0) { toast.error('Add at least one crime type'); return; }
    mutation.mutate();
  };

  const DOCS = [
    { label: 'Aadhaar Card #', key: 'aadhaarNumber', placeholder: 'XXXX-XXXX-XXXX' },
    { label: 'Voter ID', key: 'voterId', placeholder: 'ABC1234567' },
    { label: 'Driving License', key: 'drivingLicense', placeholder: 'DL-XXXXXXXXXXXX' },
    { label: 'Passport #', key: 'passport', placeholder: 'PXXXXXXXX' },
    { label: 'Phone', key: 'phone', placeholder: '+91 00000 00000' },
    { label: 'Email', key: 'emailAddresses', placeholder: 'example@host.com' },
  ] as const;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-xl font-black text-[#1B4332] font-brand tracking-tight">Add Criminal Profile</h2>
            <p className="text-xs text-p-on-surface-variant mt-0.5">New entry in the Sovereign Observer database</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <span className="material-symbols-outlined text-p-outline">close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <form id="add-criminal-form" onSubmit={handleSubmit}>
            <div className="flex gap-6">
              {/* Left: form fields */}
              <div className="flex-1 space-y-8 min-w-0">

                {/* Identity */}
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-p-on-surface-variant mb-4 flex items-center gap-2">
                    <span className="h-px flex-1 bg-p-outline-variant/20" />
                    Identity
                    <span className="h-px flex-1 bg-p-outline-variant/20" />
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Full Legal Name *</label>
                      <input
                        required
                        value={form.fullName}
                        onChange={(e) => set('fullName', e.target.value)}
                        placeholder="As per official records"
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none transition-colors"
                      />
                    </div>

                    {/* Aliases */}
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Known Aliases</label>
                      <div className="mt-1.5 flex flex-wrap gap-2 p-3 bg-p-surface-container-low rounded-lg min-h-[42px] items-center">
                        {form.aliases.map((a) => (
                          <span key={a} className="bg-p-secondary/10 text-p-secondary text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                            {a}
                            <button type="button" onClick={() => setForm((f) => ({ ...f, aliases: f.aliases.filter((x) => x !== a) }))}>
                              <span className="material-symbols-outlined text-[13px]">close</span>
                            </button>
                          </span>
                        ))}
                        <input
                          value={aliasInput}
                          onChange={(e) => setAliasInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                          placeholder="Add alias, press Enter"
                          className="bg-transparent text-sm outline-none w-32"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Age</label>
                      <input type="number" value={form.age} onChange={(e) => set('age', e.target.value)}
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Gender</label>
                      <select value={form.gender} onChange={(e) => set('gender', e.target.value)}
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none">
                        <option value="">Select</option>
                        <option>Male</option>
                        <option>Female</option>
                        <option>Non-binary</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Physical Description</label>
                      <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
                        rows={2} placeholder="Build, height, complexion, hair…"
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none resize-none" />
                    </div>
                  </div>
                </section>

                {/* Case details */}
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-p-on-surface-variant mb-4 flex items-center gap-2">
                    <span className="h-px flex-1 bg-p-outline-variant/20" />
                    Case Details
                    <span className="h-px flex-1 bg-p-outline-variant/20" />
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Crime types */}
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Crime Type *</label>
                      <div className="mt-1.5 flex flex-wrap gap-2 p-3 bg-p-surface-container-low rounded-lg min-h-[42px]">
                        {form.crimeTypes.map((c) => (
                          <span key={c} className="bg-p-error/10 text-p-error text-xs font-bold px-2.5 py-1 rounded flex items-center gap-1.5">
                            {c}
                            <button type="button" onClick={() => setForm((f) => ({ ...f, crimeTypes: f.crimeTypes.filter((x) => x !== c) }))}>
                              <span className="material-symbols-outlined text-[13px]">close</span>
                            </button>
                          </span>
                        ))}
                        <div className="flex items-center gap-1">
                          <input
                            value={crimeInput}
                            onChange={(e) => setCrimeInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCrime(); } }}
                            placeholder="Add crime, press Enter"
                            className="bg-transparent text-sm outline-none w-36"
                          />
                          <button type="button" onClick={addCrime} className="text-p-primary">
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Case Status *</label>
                      <select value={form.caseStatus} onChange={(e) => set('caseStatus', e.target.value)}
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none">
                        {CASE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Threat Level</label>
                      <div className="flex gap-3 mt-2.5">
                        {THREAT_LEVELS.map((t) => (
                          <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="modal-threat" value={t} checked={form.threatLevel === t}
                              onChange={() => set('threatLevel', t)} className="accent-[#1B4332]" />
                            <span className={`text-xs font-bold ${t === 'CRITICAL' || t === 'HIGH' ? 'text-p-error' : t === 'MEDIUM' ? 'text-amber-600' : 'text-p-tertiary'}`}>{t}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">FIR Numbers</label>
                      <input value={form.firNumbers} onChange={(e) => set('firNumbers', e.target.value)}
                        placeholder="Comma-separated"
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Warrant #</label>
                      <input value={form.warrantNumber} onChange={(e) => set('warrantNumber', e.target.value)}
                        placeholder="WRNT-2024-XXXX"
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none uppercase" />
                    </div>
                  </div>
                </section>

                {/* Documents */}
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-p-on-surface-variant mb-4 flex items-center gap-2">
                    <span className="h-px flex-1 bg-p-outline-variant/20" />
                    Documents &amp; Contact
                    <span className="h-px flex-1 bg-p-outline-variant/20" />
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {DOCS.map(({ label, key, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">{label}</label>
                        <input
                          value={(form as any)[key]}
                          onChange={(e) => set(key as keyof typeof form, e.target.value)}
                          placeholder={placeholder}
                          className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wide">Last Known Address</label>
                      <input value={form.residentialAddress} onChange={(e) => set('residentialAddress', e.target.value)}
                        placeholder="Street, City, State, PIN"
                        className="mt-1.5 w-full border-b-2 border-p-outline-variant/40 focus:border-[#1B4332] bg-transparent py-2 text-sm outline-none" />
                    </div>
                  </div>
                </section>

              </div>

              {/* Right: photo upload — sticky */}
              <div className="w-44 shrink-0">
                <div
                  onClick={() => photoRef.current?.click()}
                  className="aspect-[3/4] border-2 border-dashed border-p-outline-variant/40 rounded-xl flex flex-col items-center justify-center bg-p-surface-container-low cursor-pointer hover:border-[#1B4332]/50 transition-all overflow-hidden"
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-p-outline text-3xl mb-2">photo_camera</span>
                      <p className="text-[11px] text-p-on-surface-variant text-center px-3">Click to upload mugshot</p>
                    </>
                  )}
                </div>
                <input ref={photoRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }
                  }} />
                {photoPreview && (
                  <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    className="mt-2 w-full text-xs text-red-500 font-bold text-center hover:underline">
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-slate-100 flex justify-between items-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-p-on-surface-variant hover:text-p-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            form="add-criminal-form"
            type="submit"
            disabled={mutation.isPending}
            className="bg-[#1B4332] text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:opacity-90 disabled:opacity-60 flex items-center gap-2 transition-all"
          >
            {mutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">save</span>
                Save Profile
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
