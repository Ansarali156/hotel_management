import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPoliceHotelGuests } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import { format } from 'date-fns';

type GuestType = 'ALL' | 'DOMESTIC' | 'INTERNATIONAL';
type SortBy = 'checkInDate' | 'checkOutDate' | 'name' | 'room';
type SortOrder = 'asc' | 'desc';

const GUEST_TYPE_CHIP: Record<string, string> = {
  DOMESTIC:      'bg-blue-50 text-blue-700',
  INTERNATIONAL: 'bg-amber-50 text-amber-700',
};

const GENDER_ICON: Record<string, string> = {
  MALE: 'male', FEMALE: 'female', OTHER: 'transgender',
};

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'checkInDate',  label: 'Check-In Date' },
  { value: 'checkOutDate', label: 'Check-Out Date' },
  { value: 'name',         label: 'Name' },
  { value: 'room',         label: 'Room No.' },
];

export default function HotelDetail() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [search, setSearch]       = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [guestType, setGuestType] = useState<GuestType>('ALL');
  const [sortBy, setSortBy]       = useState<SortBy>('checkInDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage]           = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['police-hotel-guests', hotelId, search, activeOnly, guestType, sortBy, sortOrder, page],
    queryFn: () =>
      getPoliceHotelGuests(hotelId!, {
        page,
        limit,
        search: search || undefined,
        activeOnly: activeOnly || undefined,
        guestType: guestType === 'ALL' ? undefined : guestType,
        sortBy,
        sortOrder,
      }),
    enabled: !!hotelId,
    placeholderData: (prev) => prev,
  });

  const hotel      = data?.hotel;
  const guests     = data?.guests ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination ? Math.max(1, pagination.pages) : 1;

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortBy }) => {
    if (sortBy !== field) return <span className="material-symbols-outlined text-[14px] text-slate-300">unfold_more</span>;
    return (
      <span className="material-symbols-outlined text-[14px] text-[#1B4332]">
        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
      </span>
    );
  };

  return (
    <PoliceLayout>
      <div className="p-4 md:p-8 max-w-[1440px] mx-auto">

        {/* Back button */}
        <button
          onClick={() => navigate('/police/hotels')}
          className="flex items-center gap-1 text-sm text-p-on-surface-variant hover:text-[#1B4332] mb-6 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          All Hotels
        </button>

        {/* Hotel info card */}
        {hotel ? (
          <div className="bg-white rounded-2xl p-5 md:p-6 mb-8 shadow-sm border border-slate-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#1B4332]/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#1B4332] text-2xl">apartment</span>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-p-on-surface tracking-tight">
                  {hotel.name}
                </h1>
                {hotel.address && (
                  <p className="text-sm text-p-on-surface-variant mt-0.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">location_on</span>
                    {hotel.address}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              {[
                { label: 'Total Floors',   value: hotel.totalFloors ?? '—',   icon: 'stacks',      color: 'text-slate-700' },
                { label: 'Rooms/Floor',    value: hotel.roomsPerFloor ?? '—', icon: 'meeting_room', color: 'text-slate-700' },
                { label: 'Total Guests',   value: pagination?.total ?? '—',   icon: 'group',       color: 'text-p-primary' },
                { label: 'Active Now',     value: guests.filter((g: any) => g.isActive).length + (activeOnly ? '' : '+'), icon: 'how_to_reg', color: 'text-emerald-600' },
              ].map((s) => (
                <div key={s.label} className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
                  <span className={`material-symbols-outlined text-xl ${s.color}`}>{s.icon}</span>
                  <div>
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isLoading ? (
          <div className="bg-white rounded-2xl p-6 mb-8 animate-pulse h-36" />
        ) : null}

        {/* Guest list header + filters */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="font-headline text-xl font-bold text-p-on-surface shrink-0">{t('police.guestRegister')}</h2>

            <div className="flex items-center gap-2 flex-1 sm:justify-end flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder={t('police.searchGuests')}
                  className="w-full h-9 pl-9 pr-3 rounded-lg bg-white border border-slate-200 text-sm focus:border-[#1B4332] focus:outline-none transition-colors"
                />
              </div>

              {/* Active only toggle */}
              <button
                onClick={() => { setActiveOnly((v) => !v); setPage(1); }}
                className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all ${
                  activeOnly
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">how_to_reg</span>
                Active only
              </button>
            </div>
          </div>

          {/* Filter row — guest type + sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Guest type filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
              {(['ALL', 'DOMESTIC', 'INTERNATIONAL'] as GuestType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setGuestType(t); setPage(1); }}
                  className={`h-7 px-3 rounded text-[11px] font-bold transition-all ${
                    guestType === t
                      ? t === 'DOMESTIC'
                        ? 'bg-blue-600 text-white'
                        : t === 'INTERNATIONAL'
                        ? 'bg-amber-500 text-white'
                        : 'bg-[#1B4332] text-white'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t === 'ALL' ? 'All Types' : t === 'DOMESTIC' ? 'Domestic' : 'International'}
                </button>
              ))}
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mr-1">Sort:</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleSort(opt.value)}
                  className={`h-7 px-2.5 rounded text-[11px] font-bold flex items-center gap-0.5 border transition-all ${
                    sortBy === opt.value
                      ? 'bg-[#1B4332] text-white border-[#1B4332]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {opt.label}
                  <SortIcon field={opt.value} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Guest list */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : guests.length === 0 ? (
          <div className="bg-white rounded-xl py-16 text-center border border-slate-100">
            <span className="material-symbols-outlined text-slate-300 text-5xl mb-3 block">group_off</span>
            <p className="text-p-on-surface-variant text-sm">
              {search || activeOnly || guestType !== 'ALL' ? 'No guests match the current filter.' : 'No guests found for this hotel.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 mb-6">
              {guests.map((g: any) => (
                <div
                  key={g.id}
                  onClick={() => navigate(`/police/hotels/${hotelId}/guests/${g.id}`)}
                  className="bg-white rounded-xl p-4 border border-slate-100 cursor-pointer hover:shadow-md active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-slate-400 text-base">
                        {GENDER_ICON[g.gender] ?? 'person'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-p-on-surface text-sm truncate">{g.fullName}</p>
                      <p className="text-xs text-slate-500">{g.phoneNumber}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                      g.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {g.isActive ? 'Active' : 'Checked Out'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">meeting_room</span>
                      Room {g.room?.roomNumber ?? '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">login</span>
                      {format(new Date(g.checkInDate), 'dd MMM yyyy')}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${GUEST_TYPE_CHIP[g.guestType]}`}>
                      {g.guestType}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 mb-6">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold h-11">
                    <th className="px-5">
                      <button className="flex items-center gap-1" onClick={() => toggleSort('name')}>
                        Guest <SortIcon field="name" />
                      </button>
                    </th>
                    <th className="px-4">{t('police.phoneCol')}</th>
                    <th className="px-4">
                      <button className="flex items-center gap-1" onClick={() => toggleSort('room')}>
                        Room <SortIcon field="room" />
                      </button>
                    </th>
                    <th className="px-4">{t('police.typeCol')}</th>
                    <th className="px-4">
                      <button className="flex items-center gap-1" onClick={() => toggleSort('checkInDate')}>
                        Check-In <SortIcon field="checkInDate" />
                      </button>
                    </th>
                    <th className="px-4">
                      <button className="flex items-center gap-1" onClick={() => toggleSort('checkOutDate')}>
                        Check-Out <SortIcon field="checkOutDate" />
                      </button>
                    </th>
                    <th className="px-4 text-center">{t('police.statusCol')}</th>
                    <th className="px-4 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {guests.map((g: any, i: number) => (
                    <tr
                      key={g.id}
                      onClick={() => navigate(`/police/hotels/${hotelId}/guests/${g.id}`)}
                      className={`h-13 cursor-pointer hover:bg-slate-50 transition-colors ${
                        i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-slate-400 text-sm">
                              {GENDER_ICON[g.gender] ?? 'person'}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-p-on-surface">{g.fullName}</p>
                            <p className="text-[10px] text-slate-400">Age {g.age} · {g.gender}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 text-slate-600">{g.phoneNumber}</td>
                      <td className="px-4">
                        <span className="font-mono text-sm font-bold text-p-on-surface">{g.room?.roomNumber ?? '—'}</span>
                        {g.room?.floor && <span className="text-[10px] text-slate-400 ml-1">Fl.{g.room.floor}</span>}
                      </td>
                      <td className="px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${GUEST_TYPE_CHIP[g.guestType]}`}>
                          {g.guestType === 'DOMESTIC' ? 'Domestic' : 'International'}
                        </span>
                      </td>
                      <td className="px-4 text-xs text-slate-500">
                        {format(new Date(g.checkInDate), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 text-xs text-slate-400">
                        {g.checkOutDate ? format(new Date(g.checkOutDate), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          g.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {g.isActive ? 'Active' : 'Out'}
                        </span>
                      </td>
                      <td className="px-4">
                        <span className="material-symbols-outlined text-slate-300 text-lg">chevron_right</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between py-2 px-1">
                <p className="text-xs text-slate-500">
                  Showing <b>{(page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)}</b> of <b>{pagination.total}</b> guests
                </p>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                        pg === page ? 'bg-[#1B4332] text-white' : 'hover:bg-slate-100 text-p-on-surface'
                      }`}
                    >
                      {pg}
                    </button>
                  ))}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PoliceLayout>
  );
}
