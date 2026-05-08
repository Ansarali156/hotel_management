import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getAlerts, runVerification, getDashboardStats } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { MatchAlert } from '../../../shared/types/police.types';
import { useVerificationContext } from '../context/VerificationContext';
import { VerificationProgressBanner } from './Alerts';

const THREAT_CHIP: Record<string, string> = {
  CRITICAL: 'bg-p-error-container text-p-on-error-container',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-slate-100 text-slate-500',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_REVIEW: 'text-amber-600',
  CONFIRMED: 'text-emerald-600',
  DISMISSED: 'text-p-on-surface-variant',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Awaiting Review',
  CONFIRMED: 'Confirmed',
  DISMISSED: 'Dismissed',
};

export default function PoliceDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeJobs } = useVerificationContext();
  const runningJobs = Array.from(activeJobs.values());

  const { data: alertsData } = useQuery({
    queryKey: ['police-alerts', { limit: 5 }],
    queryFn: () => getAlerts({ limit: 5 }),
    refetchInterval: 15_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 15_000,
  });

  const verifyMutation = useMutation({
    mutationFn: runVerification,
    onSuccess: (data) => {
      toast.success(`Verification started! Watch progress above.`);
      // Refetch alerts after a delay to pick up new matches
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['police-alerts'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      }, 5000);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to queue verification');
    },
  });

  const alerts: MatchAlert[] = alertsData?.alerts ?? [];
  const total = alertsData?.total ?? 0;

  // Use backend-computed stats (not limited by the 5-alert fetch)
  const pending = stats?.pendingAlerts ?? 0;
  const critical = stats?.criticalAlerts ?? 0;
  const aadhaarMatches = stats?.aadhaarMatches ?? 0;

  return (
    <PoliceLayout>
      <div className="p-4 md:p-8 max-w-[1600px]">
        {/* Header */}
        <header className="mb-10">
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-p-on-surface mb-2">
            {t('police.dashTitle')}
          </h1>
          <p className="text-p-on-surface-variant font-body">
            {t('police.dashSubtitle')}
          </p>
        </header>

        {/* Live overview */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#1B4332] animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">{t('police.liveOverview')}</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {[
              { icon: 'apartment', label: t('police.activeHotels'), value: stats?.totalHotels ?? '—', trend: t('police.clickToView'), to: '/police/hotels' },
              { icon: 'groups', label: t('police.activeGuests'), value: stats?.totalActiveGuests ?? '—', trend: t('police.clickToView'), to: '/police/hotels' },
              { icon: 'database', label: t('police.criminalProfiles'), value: stats?.totalActiveCriminals ?? '—', trend: t('police.clickToView'), to: '/police/criminals' },
            ].map(({ icon, label, value, trend, to }) => (
              <button
                key={label}
                onClick={() => navigate(to)}
                className="bg-white p-4 md:p-6 rounded-xl border border-transparent hover:border-p-primary/30 hover:shadow-md transition-all text-left group cursor-pointer"
              >
                <div className="flex justify-between items-start mb-2 md:mb-4">
                  <span className="material-symbols-outlined text-slate-400 text-[18px] md:text-[24px] group-hover:text-p-primary transition-colors">{icon}</span>
                  <span className="material-symbols-outlined text-slate-300 text-sm group-hover:text-p-primary transition-colors">arrow_forward</span>
                </div>
                <p className="text-p-on-surface-variant text-[10px] md:text-xs font-semibold mb-1">{label}</p>
                <h4 className="text-2xl md:text-3xl font-headline font-bold text-p-on-surface">{value}</h4>
                <div className="mt-2 md:mt-4 text-[10px] text-p-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity">{trend}</div>
              </button>
            ))}

            <button
              onClick={() => navigate('/police/alerts?status=PENDING_REVIEW')}
              className="bg-white p-4 md:p-6 rounded-xl border-l-4 border-amber-500 shadow-sm hover:shadow-md transition-all text-left group cursor-pointer"
            >
              <div className="flex justify-between items-start mb-1">
                <p className="text-p-on-surface-variant text-[10px] md:text-xs font-semibold">{t('police.awaitingReview')}</p>
                <span className="material-symbols-outlined text-amber-400 text-sm group-hover:text-amber-600 transition-colors">arrow_forward</span>
              </div>
              <h4 className="text-2xl md:text-3xl font-headline font-bold text-amber-600">{pending}</h4>
              <p className="mt-2 md:mt-4 text-xs text-slate-500">{t('police.awaitingReviewSub')}</p>
            </button>

            <button
              onClick={() => navigate('/police/alerts?status=PENDING_REVIEW')}
              className="bg-white p-4 md:p-6 rounded-xl border-l-4 border-red-500 shadow-sm hover:shadow-md transition-all text-left group cursor-pointer"
            >
              <div className="flex justify-between items-start mb-1">
                <p className="text-p-on-surface-variant text-[10px] md:text-xs font-semibold">{t('police.criticalAlerts')}</p>
                <span className="material-symbols-outlined text-red-400 text-sm group-hover:text-red-600 transition-colors">arrow_forward</span>
              </div>
              <h4 className="text-2xl md:text-3xl font-headline font-bold text-red-600">{critical}</h4>
              <p className="mt-2 md:mt-4 text-xs text-red-600 font-medium">{t('police.criticalAlertsSub')}</p>
            </button>

            <button
              onClick={() => navigate('/police/alerts')}
              className="bg-white p-4 md:p-6 rounded-xl border-l-4 border-p-tertiary shadow-sm hover:shadow-md transition-all text-left group cursor-pointer"
            >
              <div className="flex justify-between items-start mb-1">
                <p className="text-p-on-surface-variant text-[10px] md:text-xs font-semibold">{t('police.aadhaarMatches')}</p>
                <span className="material-symbols-outlined text-p-tertiary/50 text-sm group-hover:text-p-tertiary transition-colors">arrow_forward</span>
              </div>
              <h4 className="text-2xl md:text-3xl font-headline font-bold text-p-tertiary">{aadhaarMatches}</h4>
              <p className="mt-2 md:mt-4 text-xs text-p-tertiary font-medium">{t('police.aadhaarMatchesSub')}</p>
            </button>
          </div>
        </section>

        {/* Recent match alerts table */}
        <section className="mb-12">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">{t('police.recentAlerts')}</h3>
            <button
              onClick={() => navigate('/police/alerts')}
              className="text-p-primary text-xs font-bold hover:underline"
            >
              {t('police.viewAllAlerts')}
            </button>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {alerts.length === 0 ? (
              <div className="bg-white rounded-xl px-6 py-10 text-center text-p-on-surface-variant text-sm">{t('police.noAlerts')}</div>
            ) : alerts.map((alert) => (
              <div
                key={alert.id}
                onClick={() => navigate(`/police/alerts/${alert.id}`)}
                className="bg-white rounded-xl p-4 border-l-4 cursor-pointer hover:shadow-sm transition-all border-p-outline-variant/30"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-sm text-p-on-surface">{alert.guest?.fullName ?? '—'}</p>
                    <p className="text-xs text-slate-500">{alert.guest?.room?.hotel?.name ?? '—'}</p>
                  </div>
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-md uppercase ${THREAT_CHIP[alert.criminal?.threatLevel ?? ''] ?? 'bg-slate-100 text-slate-500'}`}>
                    {alert.criminal?.threatLevel ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2 py-0.5 bg-p-primary-container text-p-on-primary-container font-bold rounded">
                    {Math.round(alert.score * 100)}%
                  </span>
                  <span className="text-slate-600">vs {alert.criminal?.fullName ?? '—'}</span>
                  <span className={`font-bold italic ml-auto ${STATUS_COLOR[alert.status] ?? ''}`}>{STATUS_LABEL[alert.status] ?? alert.status}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl overflow-hidden shadow-sm">
            <div className="glass-header grid grid-cols-7 px-6 py-4 border-b border-p-outline-variant/10">
              {['Guest', 'Hotel', 'Matched Profile', 'Score', 'Threat', 'Status', 'Time'].map((h) => (
                <div key={h} className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{h}</div>
              ))}
            </div>
            <div className="divide-y divide-slate-50">
              {alerts.length === 0 ? (
                <div className="px-6 py-10 text-center text-p-on-surface-variant text-sm">{t('police.noAlerts')}</div>
              ) : alerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => navigate(`/police/alerts/${alert.id}`)}
                  className="grid grid-cols-7 px-6 py-5 items-center hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <div className="text-sm font-semibold">{alert.guest?.fullName ?? '—'}</div>
                  <div className="text-xs text-slate-500">{alert.guest?.room?.hotel?.name ?? '—'}</div>
                  <div className="text-xs font-medium text-slate-700">{alert.criminal?.fullName ?? '—'}</div>
                  <div>
                    <span className="px-2 py-1 bg-p-primary-container text-p-on-primary-container text-[10px] font-bold rounded-md">
                      {Math.round(alert.score * 100)}%
                    </span>
                  </div>
                  <div>
                    <span className={`px-2 py-1 text-[10px] font-bold rounded-md uppercase ${THREAT_CHIP[alert.criminal?.threatLevel ?? ''] ?? 'bg-slate-100 text-slate-500'}`}>
                      {alert.criminal?.threatLevel ?? '—'}
                    </span>
                  </div>
                  <div className={`text-xs font-bold italic ${STATUS_COLOR[alert.status] ?? ''}`}>{STATUS_LABEL[alert.status] ?? alert.status}</div>
                  <div className="text-xs text-slate-400">{format(new Date(alert.createdAt), 'HH:mm:ss')}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Live verification progress banners */}
        {runningJobs.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">{t('police.verificationInProgress')}</h3>
            </div>
            <div className="space-y-3">
              {runningJobs.map((job) => (
                <VerificationProgressBanner key={job.jobId} job={job} />
              ))}
            </div>
          </section>
        )}

        {/* Run verification CTA */}
        <section>
          <div className="relative overflow-hidden bg-[#1B4332] rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                  <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#grid)" />
              </svg>
            </div>
            <div className="relative z-10">
              <h2 className="text-2xl font-brand font-bold text-white mb-2">{t('police.runVerification')}</h2>
              <p className="text-white/70 font-body max-w-lg">
                {t('police.runVerificationSub')}
              </p>
            </div>
            <div className="relative z-10 shrink-0">
              <button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="bg-white text-[#1B4332] px-8 py-4 rounded-xl font-bold text-sm tracking-tight flex items-center gap-3 hover:bg-slate-100 transition-all active:scale-95 shadow-lg disabled:opacity-60"
              >
                <span className="material-symbols-outlined icon-fill">manage_search</span>
                {verifyMutation.isPending ? t('police.queuing') : t('police.runNow')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </PoliceLayout>
  );
}
