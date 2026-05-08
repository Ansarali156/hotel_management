import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNowStrict } from 'date-fns';
import { getGuests } from '../api/hotel.api';
import type { Guest } from '../../../shared/types/hotel.types';

const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

const LAST_SEEN_KEY = 'hotel_notifications_last_seen';

const readLastSeen = (): number => {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
};

export default function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => readLastSeen());
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const { data: guests = [] } = useQuery({
    queryKey: ['hotel-guests-bell'],
    queryFn: getGuests,
    refetchInterval: 30_000, // refresh every 30s
    staleTime: 15_000,
  });

  // Recent check-ins within the notification window
  const recent = useMemo(() => {
    const now = Date.now();
    return (guests as Guest[])
      .filter((g) => {
        const t = new Date(g.arrivalDate).getTime();
        return Number.isFinite(t) && now - t <= RECENT_WINDOW_MS;
      })
      .sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime())
      .slice(0, 10);
  }, [guests]);

  // Unread = recent items newer than lastSeen
  const unread = useMemo(
    () => recent.filter((g) => new Date(g.arrivalDate).getTime() > lastSeen).length,
    [recent, lastSeen],
  );

  const markAllSeen = () => {
    const now = Date.now();
    localStorage.setItem(LAST_SEEN_KEY, String(now));
    setLastSeen(now);
  };

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) markAllSeen();
      return next;
    });
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={t('notifications.title', 'Notifications')}
        title={unread > 0 ? t('notifications.newCount', { count: unread, defaultValue: `${unread} new` }) : t('notifications.title', 'Notifications')}
        className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
      >
        <span className={`material-symbols-outlined text-[20px] ${unread > 0 ? 'text-[#1B4332]' : ''}`}>
          notifications
        </span>
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {t('notifications.title', 'Notifications')}
            </h3>
            {recent.length > 0 && (
              <Link
                to="/hotel/guests"
                onClick={() => setOpen(false)}
                className="text-xs font-bold text-[#1B4332] hover:underline"
              >
                {t('notifications.viewAll', 'View all')}
              </Link>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <span className="material-symbols-outlined text-slate-300 text-[32px]">notifications_none</span>
                <p className="mt-2 text-xs text-slate-500">
                  {t('notifications.empty', 'No recent activity')}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {recent.map((g) => {
                  const when = formatDistanceToNowStrict(new Date(g.arrivalDate), { addSuffix: true });
                  return (
                    <li key={g.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-[#1B4332] text-[18px] mt-0.5">person_add</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{g.fullName}</p>
                          <p className="text-xs text-slate-500">
                            {t('notifications.checkedIn', 'Checked in')} · {g.roomId ? `Room ${g.roomId}` : ''}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{when}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
