import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAlert, reviewAlert } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [showNotesError, setShowNotesError] = useState(false);

  const { data: alert, isLoading } = useQuery({
    queryKey: ['police-alert', id],
    queryFn: () => getAlert(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (decision: 'CONFIRMED' | 'DISMISSED') =>
      reviewAlert(id!, { decision, reviewNotes: notes }),
    onSuccess: (_, decision) => {
      toast.success(decision === 'CONFIRMED' ? 'Match confirmed and escalated' : 'Alert dismissed as false positive');
      queryClient.invalidateQueries({ queryKey: ['police-alerts'] });
      navigate('/police/alerts');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Review failed');
    },
  });

  if (isLoading || !alert) {
    return (
      <PoliceLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </div>
      </PoliceLayout>
    );
  }

  const score = Math.round(alert.score * 100);
  const scoreColor = score >= 80 ? 'text-p-tertiary' : score >= 60 ? 'text-amber-600' : 'text-slate-500';

  return (
    <PoliceLayout>
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-10 flex justify-between items-end">
          <div>
            <button
              onClick={() => navigate('/police/alerts')}
              className="flex items-center gap-1 text-p-primary text-xs font-bold mb-3 hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to Alerts
            </button>
            <h1 className="text-3xl font-black text-p-on-surface tracking-tight font-headline">Alert Detail</h1>
            <p className="text-p-on-surface-variant font-medium mt-1">System-Generated Biometric Match &amp; Review</p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest ${
              alert.status === 'PENDING_REVIEW' ? 'bg-p-error-container text-p-on-error-container' :
              alert.status === 'CONFIRMED' ? 'bg-p-tertiary-container text-p-on-tertiary-container' :
              'bg-p-surface-container-highest text-p-on-surface-variant'
            }`}>
              {alert.status === 'PENDING_REVIEW' ? 'Pending Review' : alert.status}
            </span>
            <span className="bg-p-surface-container-highest text-p-on-surface-variant px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest">
              Ref: {alert.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>

        {/* Analysis grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Guest profile */}
          <section className="bg-white rounded-xl p-8 border border-p-outline-variant/10 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-6xl">hotel</span>
            </div>
            <div className="flex items-start gap-6 mb-8">
              {alert.guest?.photoUrl ? (
                <img src={alert.guest.photoUrl} alt="" className="w-[120px] h-[120px] rounded-lg object-cover border-2 border-white shadow-md" />
              ) : (
                <div className="w-[120px] h-[120px] rounded-lg bg-p-surface-container-high flex items-center justify-center border-2 border-white shadow-md">
                  <span className="material-symbols-outlined text-5xl text-p-outline">person</span>
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-p-on-surface leading-tight">{alert.guest?.fullName ?? '—'}</h3>
                <p className="text-p-primary font-semibold text-sm">{alert.guest?.room?.hotel?.name ?? ''}</p>
                <p className="text-p-on-surface-variant text-xs mt-2 uppercase tracking-tighter">
                  Check-in: {format(new Date(alert.createdAt), 'MMM dd, yyyy · HH:mm')}
                </p>
              </div>
            </div>
            <div className="bg-p-surface-container-low p-4 rounded-lg">
              <h4 className="text-xs font-bold text-p-on-surface-variant uppercase tracking-widest mb-3">Stay Details</h4>
              <dl className="grid grid-cols-2 gap-y-3 gap-x-4">
                <div>
                  <dt className="text-[10px] text-slate-500 uppercase font-bold">Room</dt>
                  <dd className="text-sm font-medium">{alert.guest?.room?.roomNumber ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-500 uppercase font-bold">Phone</dt>
                  <dd className="text-sm font-medium">{alert.guest?.phone ?? '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Criminal profile */}
          <section className="bg-white rounded-xl p-8 border-l-[3px] border-l-p-error border-y border-r border-p-outline-variant/10 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-6xl text-p-error">gavel</span>
            </div>
            <div className="flex items-start gap-6 mb-8">
              {alert.criminal?.photoUrl ? (
                <img src={alert.criminal.photoUrl} alt="" className="w-[120px] h-[120px] rounded-lg object-cover grayscale border-2 border-white shadow-md" />
              ) : (
                <div className="w-[120px] h-[120px] rounded-lg bg-p-surface-container-high flex items-center justify-center border-2 border-white shadow-md">
                  <span className="material-symbols-outlined text-5xl text-p-outline">person_off</span>
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-p-on-surface leading-tight">{alert.criminal?.fullName ?? '—'}</h3>
                <p className="text-p-error font-bold text-sm tracking-wide">{alert.criminal?.caseStatus?.replace(/_/g, ' ')}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="bg-p-error-container/20 text-p-error px-2 py-0.5 rounded text-[10px] font-bold">
                    {alert.criminal?.threatLevel} THREAT
                  </span>
                  {alert.criminal?.crimeTypes.slice(0, 2).map((c) => (
                    <span key={c} className="bg-p-error-container/20 text-p-error px-2 py-0.5 rounded text-[10px] font-bold">{c}</span>
                  ))}
                </div>
              </div>
            </div>
            {alert.criminal?.aliases && alert.criminal.aliases.length > 0 && (
              <div className="bg-p-error-container/5 p-4 rounded-lg border border-p-error/10">
                <h4 className="text-xs font-bold text-p-error uppercase tracking-widest mb-2">Known Aliases</h4>
                <p className="text-sm">{alert.criminal.aliases.join(', ')}</p>
              </div>
            )}
          </section>

          {/* Match analysis */}
          <section className="lg:col-span-2 bg-p-surface-container-low rounded-xl p-8 border border-p-outline-variant/15">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-p-on-surface">Match Analysis</h3>
                  <span className="bg-p-tertiary text-p-on-tertiary px-3 py-0.5 rounded-full text-xs font-bold">Computed Score</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-p-surface-container-highest h-4 rounded-full overflow-hidden">
                    <div
                      className="bg-p-tertiary h-full transition-all"
                      style={{ width: `${score}%`, boxShadow: '0 0 12px rgba(0,110,46,0.3)' }}
                    />
                  </div>
                  <span className={`text-3xl font-black ${scoreColor}`}>{score}%</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-p-outline-variant/30 text-[10px] font-black uppercase text-p-on-surface-variant tracking-widest">
                    <th className="py-3 px-4">Identifier</th>
                    <th className="py-3 px-4">Weight</th>
                    <th className="py-3 px-4 text-center">Match</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium">
                  {Object.entries(alert.matchBreakdown ?? {}).map(([k, v]) => (
                    <tr key={k} className="hover:bg-white/40 transition-colors">
                      <td className="py-3 px-4 capitalize">{k}</td>
                      <td className="py-3 px-4 font-bold">{Math.round(Number(v) * 100)}%</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`material-symbols-outlined text-base ${Number(v) > 0 ? 'text-p-tertiary' : 'text-p-error'}`}>
                          {Number(v) > 0 ? 'check_circle' : 'cancel'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Action section */}
          {alert.status === 'PENDING_REVIEW' ? (
            <section className="lg:col-span-2 mt-4">
              <div className="bg-p-surface-container-highest p-8 rounded-xl border border-p-outline-variant/20 shadow-inner">
                <div className="mb-6">
                  <label htmlFor="officer-review-notes" className="block text-sm font-bold text-p-on-surface mb-2 uppercase tracking-tight">
                    Officer Review Notes <span className="text-p-error">*</span>
                  </label>
                  <textarea
                    id="officer-review-notes"
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setShowNotesError(false); }}
                    rows={4}
                    placeholder="Required: Document reasoning for match confirmation or dismissal…"
                    aria-invalid={showNotesError}
                    aria-describedby={showNotesError ? 'officer-review-notes-error' : undefined}
                    className={`w-full bg-white rounded-lg text-sm p-4 outline-none placeholder-p-on-surface-variant/40 resize-none border-2 ${
                      showNotesError
                        ? 'border-p-error focus:ring-p-error focus:border-p-error'
                        : 'border-p-outline-variant/30 focus:ring-p-primary focus:border-p-primary'
                    }`}
                  />
                  {showNotesError && (
                    <p id="officer-review-notes-error" role="alert" className="mt-2 flex items-center gap-2 text-sm text-p-error font-semibold">
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">error</span>
                      Review notes are required before confirming or dismissing.
                    </p>
                  )}
                </div>
                <div className="flex flex-col md:flex-row justify-end gap-4">
                  <button
                    onClick={() => {
                      if (!notes.trim()) { setShowNotesError(true); toast.error('Please add review notes'); return; }
                      mutation.mutate('DISMISSED');
                    }}
                    disabled={mutation.isPending}
                    className="px-10 py-3 border-2 border-p-error text-p-error font-black uppercase text-xs tracking-widest hover:bg-p-error/5 transition-all active:scale-95 disabled:opacity-60 rounded"
                  >
                    Dismiss — False Positive
                  </button>
                  <button
                    onClick={() => {
                      if (!notes.trim()) { setShowNotesError(true); toast.error('Please add review notes'); return; }
                      mutation.mutate('CONFIRMED');
                    }}
                    disabled={mutation.isPending}
                    className="px-10 py-3 bg-[#1B4332] text-white font-black uppercase text-xs tracking-widest hover:bg-[#153427] shadow-lg transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60 rounded"
                  >
                    <span className="material-symbols-outlined text-sm">shield</span>
                    {mutation.isPending ? t('police.processing') : 'Confirm Match & Escalate'}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="lg:col-span-2 mt-4">
              <div className="bg-p-surface-container-highest p-8 rounded-xl border border-p-outline-variant/20">
                <h4 className="text-sm font-bold text-p-on-surface uppercase tracking-tight mb-2">Review Notes</h4>
                <p className="text-sm text-p-on-surface-variant">{alert.reviewNotes ?? 'No notes recorded.'}</p>
                <p className="text-xs text-p-on-surface-variant mt-4">
                  Reviewed: {alert.reviewedAt ? format(new Date(alert.reviewedAt), 'MMM dd, yyyy · HH:mm') : '—'}
                </p>
              </div>
            </section>
          )}
        </div>

        {/* V2: Dispatch Status Panel */}
        {alert.dispatchStatus && (
          <div className={`mt-8 rounded-xl p-6 border flex items-start gap-4 ${
            alert.dispatchStatus === 'SENT'
              ? 'bg-emerald-50 border-emerald-200'
              : alert.dispatchStatus === 'FAILED'
              ? 'bg-red-50 border-red-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <span className={`material-symbols-outlined text-2xl icon-fill flex-shrink-0 ${
              alert.dispatchStatus === 'SENT' ? 'text-emerald-600' :
              alert.dispatchStatus === 'FAILED' ? 'text-red-600' : 'text-amber-600'
            }`}>
              {alert.dispatchStatus === 'SENT' ? 'mark_email_read' : alert.dispatchStatus === 'FAILED' ? 'error' : 'schedule_send'}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-black uppercase tracking-widest mb-1 ${
                alert.dispatchStatus === 'SENT' ? 'text-emerald-700' :
                alert.dispatchStatus === 'FAILED' ? 'text-red-700' : 'text-amber-700'
              }`}>
                Alert Dispatch — {alert.dispatchStatus}
              </p>
              {alert.dispatchStatus === 'SENT' && alert.dispatchedAt && (
                <p className="text-xs text-emerald-600">
                  Sent {format(new Date(alert.dispatchedAt), 'MMM dd, yyyy · HH:mm')} via email &amp; WhatsApp
                </p>
              )}
              {alert.dispatchStatus === 'FAILED' && alert.dispatchError && (
                <p className="text-xs text-red-600">Error: {alert.dispatchError}</p>
              )}
              {alert.dispatchStatus === 'PENDING' && (
                <p className="text-xs text-amber-600">Dispatch queued — waiting for confirmation</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-12 text-center text-p-on-surface-variant opacity-40 text-[10px] font-bold uppercase tracking-[0.2em]">
          Secure Surveillance Node • ID {alert.id.slice(0, 8).toUpperCase()} • System Time: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}
        </div>
      </div>
    </PoliceLayout>
  );
}
