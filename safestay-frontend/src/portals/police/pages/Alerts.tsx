import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAlerts } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import type { MatchAlert } from '../../../shared/types/police.types';
import { formatDistanceToNow } from 'date-fns';
import { useVerificationContext, VerificationJob } from '../context/VerificationContext';

// Left border colour = urgency of the response needed
const BORDER_COLOR: Record<string, string> = {
  PENDING_REVIEW: 'border-amber-500',
  CONFIRMED: 'border-emerald-500',
  DISMISSED: 'border-slate-300',
};

// Response badge styling
const RESPONSE_BADGE: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  PENDING_REVIEW: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Awaiting Review', icon: 'pending' },
  CONFIRMED:      { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Match Confirmed', icon: 'check_circle' },
  DISMISSED:      { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Dismissed', icon: 'cancel' },
};

// Tab labels → API filter values
const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Awaiting Review', value: 'PENDING_REVIEW' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Dismissed', value: 'DISMISSED' },
];

const SCORE_COLOR = (score: number) => {
  if (score >= 0.8) return 'text-red-600';
  if (score >= 0.6) return 'text-amber-500';
  return 'text-slate-500';
};

const SCORE_BAR = (score: number) => {
  if (score >= 0.8) return 'bg-red-500';
  if (score >= 0.6) return 'bg-amber-500';
  return 'bg-slate-400';
};

export default function Alerts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read initial filter from URL (e.g. /police/alerts?status=PENDING_REVIEW from dashboard)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [minScore, setMinScore] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Sync URL param changes (e.g. back/forward navigation)
  useEffect(() => {
    const s = searchParams.get('status') ?? '';
    setStatusFilter(s);
    setPage(1);
  }, [searchParams]);

  const { activeJobs } = useVerificationContext();
  const runningJobs = Array.from(activeJobs.values());

  const { data, isLoading } = useQuery({
    queryKey: ['police-alerts', { statusFilter, minScore, search, page }],
    queryFn: () =>
      getAlerts({
        status: statusFilter || undefined,
        minScore: minScore > 0 ? minScore / 100 : undefined,
        search: search || undefined,
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
    refetchInterval: 15_000,
  });

  const alerts: MatchAlert[] = data?.alerts ?? [];
  const total = data?.total ?? 0;
  const awaitingCount = alerts.filter((a) => a.status === 'PENDING_REVIEW').length;

  return (
    <PoliceLayout>
      <main className="p-4 md:p-8 min-h-screen">
        {/* Header */}
        <header className="mb-6 md:mb-8">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-p-on-surface font-headline">{t('police.alertsTitle')}</h1>
            <div className="flex items-center gap-2 text-p-on-surface-variant font-medium flex-wrap">
              {awaitingCount > 0 && (
                <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
                  {awaitingCount} Awaiting Review
                </span>
              )}
              <span className="text-sm">Verification results requiring officer response</span>
            </div>
          </div>
        </header>

        {/* Filter bar */}
        <section className="bg-p-surface-container-low rounded-xl p-4 mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-white/50 p-1 rounded-lg border border-p-outline-variant/20">
              {FILTER_TABS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => { setStatusFilter(value); setPage(1); }}
                  className={`px-2 sm:px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    statusFilter === value ? 'bg-white shadow-sm text-p-primary' : 'text-p-on-surface-variant hover:bg-white/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-xs font-semibold text-p-on-surface-variant bg-white px-3 py-2 rounded-lg border border-p-outline-variant/20 ml-auto">
              {total} Results
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-p-on-surface-variant text-lg">search</span>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t('police.searchAlerts')}
                className="w-full bg-white border-p-outline-variant/30 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-p-primary focus:border-p-primary outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-p-on-surface-variant uppercase tracking-wider whitespace-nowrap">Score: {minScore}%+</span>
              <input
                type="range" min={0} max={90} step={10} value={minScore}
                onChange={(e) => { setMinScore(Number(e.target.value)); setPage(1); }}
                className="flex-1 sm:w-32 h-1.5 bg-p-surface-container-highest rounded-lg appearance-none cursor-pointer accent-p-primary"
              />
            </div>
          </div>
        </section>

        {/* Live verification progress banners */}
        {runningJobs.length > 0 && (
          <div className="space-y-3 mb-4">
            {runningJobs.map((job) => (
              <VerificationProgressBanner key={job.jobId} job={job} />
            ))}
          </div>
        )}

        {/* Alert cards */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-24 text-p-on-surface-variant">
              <span className="material-symbols-outlined text-5xl mb-4 block">notifications_none</span>
              <p className="font-medium">{t('police.noAlertsMatch')}</p>
            </div>
          ) : alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onClick={() => navigate(`/police/alerts/${alert.id}`)} />
          ))}
        </div>

        {/* Pagination */}
        {total > 20 && (
          <footer className="mt-12 flex items-center justify-between text-p-on-surface-variant">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60">Page {page}</p>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="p-2 hover:bg-p-surface-container rounded-lg disabled:opacity-30">
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)} className="p-2 hover:bg-p-surface-container rounded-lg disabled:opacity-30">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </footer>
        )}
      </main>
    </PoliceLayout>
  );
}

export function VerificationProgressBanner({ job }: { job: VerificationJob }) {
  const isCriminal = job.type === 'CRIMINAL_VS_GUESTS';
  const isSweep = job.type === 'SWEEP';
  const isDone = job.status === 'COMPLETE';
  const isFailed = job.status === 'FAILED';

  const label = isCriminal
    ? `Criminal profile: ${job.sourceName}`
    : isSweep
    ? `Network Sweep`
    : `Guest check-in: ${job.sourceName}`;

  const subLabel = isCriminal
    ? `Sweeping active hotel guests for match`
    : isSweep
    ? `Matching all active criminals against all hotel guests`
    : `Checking against wanted criminals`;

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-4 ${
      isDone ? 'bg-emerald-50 border-emerald-200' : isFailed ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
    }`}>
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
        isDone ? 'bg-emerald-100' : isFailed ? 'bg-red-100' : 'bg-blue-100'
      }`}>
        {isDone ? (
          <span className="material-symbols-outlined text-emerald-600 text-xl icon-fill">check_circle</span>
        ) : isFailed ? (
          <span className="material-symbols-outlined text-red-500 text-xl">error</span>
        ) : (
          <span className="material-symbols-outlined text-blue-600 text-xl animate-pulse">radar</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold truncate ${isDone ? 'text-emerald-800' : isFailed ? 'text-red-700' : 'text-blue-800'}`}>
          {isDone ? 'Verification complete' : isFailed ? 'Verification failed' : 'Verifying…'}&nbsp;·&nbsp;{label}
        </p>
        <p className={`text-xs mt-0.5 ${isDone ? 'text-emerald-600' : isFailed ? 'text-red-500' : 'text-blue-600'}`}>
          {isDone
            ? `${job.checked.toLocaleString()} checked · ${job.alertsFound} match${job.alertsFound !== 1 ? 'es' : ''} found — results updated`
            : isFailed
            ? 'An error occurred during verification'
            : `${job.checked.toLocaleString()} / ${job.total.toLocaleString()} ${isCriminal ? 'guests' : 'criminals'} checked · ${job.alertsFound} match${job.alertsFound !== 1 ? 'es' : ''} found · ${subLabel}`
          }
        </p>
        {!isFailed && (
          <div className="mt-2 h-1.5 w-full bg-white/70 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${job.pct}%` }}
            />
          </div>
        )}
      </div>
      <div className={`shrink-0 text-right ${isDone ? 'text-emerald-700' : isFailed ? 'text-red-600' : 'text-blue-700'}`}>
        <p className="text-lg font-black font-headline">{isDone ? '100' : job.pct}%</p>
        <p className="text-[10px] font-bold uppercase tracking-wider">
          {isDone ? 'Done' : isFailed ? 'Failed' : 'In Progress'}
        </p>
      </div>
    </div>
  );
}

function AlertCard({ alert, onClick }: { alert: MatchAlert; onClick: () => void }) {
  const score = alert.score;
  const pct = Math.round(score * 100);
  const response = RESPONSE_BADGE[alert.status] ?? RESPONSE_BADGE.PENDING_REVIEW;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border-l-[6px] ${BORDER_COLOR[alert.status] ?? 'border-slate-300'} flex flex-col md:flex-row md:items-center p-4 md:p-5 gap-4 md:gap-6 hover:shadow-md transition-shadow cursor-pointer`}
    >
      {/* Guest side */}
      <div className="flex items-center gap-4 md:w-[260px] md:shrink-0">
        {alert.guest?.photoUrl ? (
          <img src={alert.guest.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover grayscale" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-p-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-p-outline text-2xl">person</span>
          </div>
        )}
        <div>
          <p className="font-headline font-bold text-p-on-surface leading-tight">{alert.guest?.fullName ?? '—'}</p>
          <p className="text-xs text-p-on-surface-variant font-medium">{alert.guest?.phone ?? ''}</p>
          <div className="mt-1 flex gap-1 flex-wrap">
            {alert.guest?.room?.hotel?.name && (
              <span className="text-[10px] bg-p-surface-container text-p-on-surface px-1.5 py-0.5 rounded uppercase font-bold">
                {alert.guest.room.hotel.name}
              </span>
            )}
            {alert.guest?.room?.roomNumber && (
              <span className="text-[10px] bg-p-surface-container text-p-on-surface px-1.5 py-0.5 rounded uppercase font-bold">
                Room {alert.guest.room.roomNumber}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: match score */}
      <div className="flex-1 flex flex-col items-center justify-center border-y md:border-y-0 md:border-x border-p-outline-variant/10 py-3 md:py-0 md:px-6">
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-black font-headline ${SCORE_COLOR(score)}`}>{pct}%</span>
          <span className="text-xs font-bold text-p-on-surface-variant uppercase tracking-tighter">Confidence</span>
        </div>
        <div className="w-full max-w-[200px] h-2 bg-p-surface-container rounded-full mt-3 overflow-hidden">
          <div className={`h-full ${SCORE_BAR(score)}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {Object.entries(alert.matchBreakdown ?? {}).map(([k, v]) => (
            <span
              key={k}
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                v > 0
                  ? `bg-current/5 ${SCORE_COLOR(score)} border-current/20`
                  : 'bg-p-surface-container text-p-on-surface-variant border-p-outline-variant/20'
              }`}
            >
              <span className="material-symbols-outlined text-[12px] icon-fill">{v > 0 ? 'check_circle' : 'pending'}</span>
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* Criminal side */}
      <div className="flex items-center gap-4 md:w-[280px] md:shrink-0">
        {alert.criminal?.photoUrl ? (
          <div className="relative">
            <img src={alert.criminal.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
            <div className={`absolute -bottom-1 -right-1 rounded-full p-1 border-2 border-white ${SCORE_BAR(score)}`}>
              <span className="material-symbols-outlined text-white text-[10px] icon-fill">warning</span>
            </div>
          </div>
        ) : (
          <div className="w-14 h-14 rounded-full bg-p-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-p-outline text-2xl">person_off</span>
          </div>
        )}
        <div>
          <p className={`font-headline font-bold leading-tight ${SCORE_COLOR(score)}`}>
            {alert.criminal?.fullName ?? '—'}
          </p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-p-on-surface-variant uppercase">
              {alert.criminal?.crimeTypes?.slice(0, 1).join(', ')}
            </span>
            {alert.criminal?.threatLevel && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest uppercase ${
                alert.criminal.threatLevel === 'CRITICAL' ? 'bg-red-600 text-white' :
                alert.criminal.threatLevel === 'HIGH' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                {alert.criminal.threatLevel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: verification + response status */}
      <div className="ml-auto flex flex-col items-end gap-2 shrink-0 min-w-[120px]">
        {/* Verification status — always "Done" since the record exists */}
        <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
          <span className="material-symbols-outlined text-[12px] icon-fill">verified</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">Verified</span>
        </div>

        {/* Response status */}
        <div className={`flex items-center gap-1 ${response.bg} ${response.text} px-2 py-0.5 rounded-full`}>
          <span className="material-symbols-outlined text-[12px] icon-fill">{response.icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">{response.label}</span>
        </div>

        <span className="text-[10px] text-p-on-surface-variant">
          {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
        </span>
        <button className="text-p-primary font-bold text-sm hover:underline flex items-center gap-1">
          Review <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
