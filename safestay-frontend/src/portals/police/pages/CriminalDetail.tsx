import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCriminal, updateCriminal } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
// format is still used for updatedAt

const THREAT_CHIP: Record<string, string> = {
  CRITICAL: 'bg-p-error-container text-p-on-error-container',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-p-surface-container-highest text-p-outline',
};

const STATUS_CHIP: Record<string, string> = {
  ABSCONDING: 'bg-p-error text-white',
  WANTED: 'border border-p-error text-p-error',
  IN_CUSTODY: 'bg-p-secondary-container text-p-on-secondary-container',
  ARRESTED: 'bg-p-secondary-container text-p-on-secondary-container',
  UNDER_INVESTIGATION: 'bg-amber-100 text-amber-700',
  PAROLE: 'bg-slate-100 text-slate-600',
  RELEASED: 'bg-p-surface-container-highest text-p-on-surface-variant',
};

export default function CriminalDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const { data: criminal, isLoading } = useQuery({
    queryKey: ['police-criminal', id],
    queryFn: () => getCriminal(id!),
    enabled: !!id,
  });

  // Edit form state
  const [form, setForm] = useState<Record<string, any>>({});

  const mutation = useMutation({
    mutationFn: (data: any) => updateCriminal(id!, data),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['police-criminal', id] });
      queryClient.invalidateQueries({ queryKey: ['police-criminals'] });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Update failed');
    },
  });

  const startEdit = () => {
    if (!criminal) return;
    setForm({
      fullName: criminal.fullName,
      age: criminal.age ?? '',
      gender: criminal.gender ?? '',
      threatLevel: criminal.threatLevel,
      caseStatus: criminal.caseStatus,
      description: criminal.description ?? '',
      distinguishingMarks: criminal.distinguishingMarks ?? '',
      aliases: [...(criminal.aliases ?? [])],
      crimeTypes: [...(criminal.crimeTypes ?? [])],
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    const ageNum = Number(form.age);
    if (form.age !== '' && (isNaN(ageNum) || ageNum < 0 || ageNum > 100)) {
      toast.error('Age must be between 0 and 100');
      return;
    }
    mutation.mutate(form);
  };

  if (isLoading || !criminal) {
    return (
      <PoliceLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </div>
      </PoliceLayout>
    );
  }

  return (
    <PoliceLayout>
      <div className="max-w-5xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <button
              onClick={() => navigate('/police/criminals')}
              className="flex items-center gap-1 text-p-primary text-xs font-bold mb-3 hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to Profiles
            </button>
            <h1 className="text-3xl font-black text-p-on-surface tracking-tight font-headline">{t('police.criminalProfile')}</h1>
            <p className="text-p-on-surface-variant font-medium mt-1">Sovereign Observer Registry Entry</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${THREAT_CHIP[criminal.threatLevel] ?? ''}`}>
              {criminal.threatLevel} THREAT
            </span>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${STATUS_CHIP[criminal.caseStatus] ?? 'bg-slate-100 text-slate-500'}`}>
              {criminal.caseStatus.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Photo panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 border border-p-outline-variant/10 shadow-sm sticky top-8">
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-p-surface-container-high flex items-center justify-center mb-6">
                {criminal.photoUrl ? (
                  <img src={criminal.photoUrl} alt="" className="w-full h-full object-cover grayscale" />
                ) : (
                  <span className="material-symbols-outlined text-7xl text-p-outline">person_off</span>
                )}
              </div>
              <h2 className="text-xl font-bold text-p-on-surface text-center">{criminal.fullName}</h2>
              {criminal.aliases && criminal.aliases.length > 0 && (
                <p className="text-xs text-p-on-surface-variant text-center mt-1">
                  aka {criminal.aliases.join(', ')}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {criminal.crimeTypes.map((c) => (
                  <span key={c} className="bg-p-error-container/20 text-p-error px-2 py-0.5 rounded text-[10px] font-bold">
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-p-outline-variant/10">
                <p className="text-[10px] text-slate-400 uppercase font-bold text-center">
                  Last updated {format(new Date(criminal.updatedAt), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2 space-y-6">
            {!isEditing ? (
              <>
                {/* Personal info */}
                <section className="bg-white rounded-xl p-6 border border-p-outline-variant/10 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-bold text-p-on-surface-variant uppercase tracking-widest">Personal Information</h3>
                    <button
                      onClick={startEdit}
                      className="flex items-center gap-1.5 text-p-primary text-xs font-bold hover:underline"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span> Edit Profile
                    </button>
                  </div>
                  <dl className="grid grid-cols-2 gap-y-5 gap-x-6">
                    <div>
                      <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Full Name</dt>
                      <dd className="text-sm font-semibold">{criminal.fullName}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Age</dt>
                      <dd className="text-sm font-semibold">{criminal.age ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Gender</dt>
                      <dd className="text-sm font-semibold">{criminal.gender ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Registry ID</dt>
                      <dd className="text-sm font-semibold font-mono">{criminal.id.slice(0, 12).toUpperCase()}</dd>
                    </div>
                    {criminal.phone && (
                      <div>
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Phone</dt>
                        <dd className="text-sm font-semibold">{criminal.phone}</dd>
                      </div>
                    )}
                    {criminal.emailAddresses && (
                      <div>
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Email(s)</dt>
                        <dd className="text-sm font-semibold break-all">{criminal.emailAddresses}</dd>
                      </div>
                    )}
                    {criminal.firNumbers && (
                      <div>
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">FIR Number(s)</dt>
                        <dd className="text-sm font-semibold">{criminal.firNumbers}</dd>
                      </div>
                    )}
                    {criminal.warrantNumber && (
                      <div>
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Warrant No.</dt>
                        <dd className="text-sm font-semibold">{criminal.warrantNumber}</dd>
                      </div>
                    )}
                    {criminal.aadhaarNumber && (
                      <div>
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Aadhaar</dt>
                        <dd className="text-sm font-mono font-semibold">{criminal.aadhaarNumber}</dd>
                      </div>
                    )}
                    {criminal.drivingLicense && (
                      <div>
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Driving License</dt>
                        <dd className="text-sm font-mono font-semibold">{criminal.drivingLicense}</dd>
                      </div>
                    )}
                    {criminal.passport && (
                      <div>
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Passport</dt>
                        <dd className="text-sm font-mono font-semibold">{criminal.passport}</dd>
                      </div>
                    )}
                    {criminal.residentialAddress && (
                      <div className="col-span-2">
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Residential Address</dt>
                        <dd className="text-sm text-p-on-surface">{criminal.residentialAddress}</dd>
                      </div>
                    )}
                    {criminal.distinguishingMarks && (
                      <div className="col-span-2">
                        <dt className="text-[10px] text-slate-400 uppercase font-bold mb-1">Distinguishing Marks</dt>
                        <dd className="text-sm font-semibold">{criminal.distinguishingMarks}</dd>
                      </div>
                    )}
                  </dl>
                  {criminal.description && (
                    <div className="mt-5 pt-4 border-t border-p-outline-variant/10">
                      <dt className="text-[10px] text-slate-400 uppercase font-bold mb-2">Case Notes</dt>
                      <p className="text-sm text-p-on-surface-variant leading-relaxed">{criminal.description}</p>
                    </div>
                  )}
                </section>

                {/* Aliases */}
                {criminal.aliases && criminal.aliases.length > 0 && (
                  <section className="bg-white rounded-xl p-6 border border-p-outline-variant/10 shadow-sm">
                    <h3 className="text-sm font-bold text-p-on-surface-variant uppercase tracking-widest mb-4">Known Aliases</h3>
                    <div className="flex flex-wrap gap-2">
                      {criminal.aliases.map((alias) => (
                        <span key={alias} className="bg-p-surface-container-high text-p-on-surface px-3 py-1 rounded-full text-xs font-semibold">
                          {alias}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Match history stub */}
                <section className="bg-white rounded-xl p-6 border border-p-outline-variant/10 shadow-sm">
                  <h3 className="text-sm font-bold text-p-on-surface-variant uppercase tracking-widest mb-4">Match History</h3>
                  <p className="text-sm text-p-on-surface-variant">
                    View alerts linked to this profile in the{' '}
                    <button
                      onClick={() => navigate('/police/alerts')}
                      className="text-p-primary font-bold hover:underline"
                    >
                      Match Alerts
                    </button>{' '}
                    section.
                  </p>
                </section>
              </>
            ) : (
              /* Edit form */
              <section className="bg-white rounded-xl p-6 border border-p-outline-variant/10 shadow-sm">
                <h3 className="text-sm font-bold text-p-on-surface-variant uppercase tracking-widest mb-6">{t('police.editProfile')}</h3>
                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Full Name</label>
                    <input
                      value={form.fullName ?? ''}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      className="w-full bg-p-surface-container-low border border-p-outline-variant/30 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-p-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Age</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={form.age ?? ''}
                        onChange={(e) => setForm({ ...form, age: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="w-full bg-p-surface-container-low border border-p-outline-variant/30 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-p-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Gender</label>
                      <select
                        value={form.gender ?? ''}
                        onChange={(e) => setForm({ ...form, gender: e.target.value })}
                        className="w-full bg-p-surface-container-low border border-p-outline-variant/30 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-p-primary"
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Threat Level</label>
                      <select
                        value={form.threatLevel ?? ''}
                        onChange={(e) => setForm({ ...form, threatLevel: e.target.value })}
                        className="w-full bg-p-surface-container-low border border-p-outline-variant/30 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-p-primary"
                      >
                        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Case Status</label>
                      <select
                        value={form.caseStatus ?? ''}
                        onChange={(e) => setForm({ ...form, caseStatus: e.target.value })}
                        className="w-full bg-p-surface-container-low border border-p-outline-variant/30 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-p-primary"
                      >
                        {['WANTED', 'ABSCONDING', 'ARRESTED', 'IN_CUSTODY', 'UNDER_INVESTIGATION', 'PAROLE', 'RELEASED'].map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Case Notes</label>
                    <textarea
                      value={form.description ?? ''}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={4}
                      className="w-full bg-p-surface-container-low border border-p-outline-variant/30 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-p-primary resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-p-outline-variant/10">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-2 border border-p-outline-variant rounded-lg text-sm font-bold text-p-on-surface-variant hover:bg-p-surface-container transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={mutation.isPending}
                    className="px-6 py-2 bg-[#1B4332] text-white rounded-lg text-sm font-bold hover:bg-[#153427] transition-all disabled:opacity-60"
                  >
                    {mutation.isPending ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="mt-12 text-center text-p-on-surface-variant opacity-40 text-[10px] font-bold uppercase tracking-[0.2em]">
          Sovereign Observer Registry • Entry {criminal.id.slice(0, 8).toUpperCase()} • Classified
        </div>
      </div>
    </PoliceLayout>
  );
}
