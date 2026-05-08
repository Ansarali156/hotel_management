import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getHotelStatus } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import { format } from 'date-fns';

export default function HotelStatus() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['hotel-status', search],
    queryFn: () => getHotelStatus({ search: search || undefined }),
    refetchInterval: 60_000,
  });

  const hotels = data?.hotels ?? [];
  const totalGuests = hotels.reduce((s: number, h: any) => s + h.activeGuests, 0);
  const totalOccupied = hotels.reduce((s: number, h: any) => s + h.occupiedRooms, 0);

  return (
    <PoliceLayout>
      <div className="p-4 md:p-8 max-w-[1600px]">
        {/* Header */}
        <header className="mb-8">
          <h1 className="font-headline text-2xl md:text-4xl font-extrabold tracking-tight text-p-on-surface mb-2">
            Hotel Status
          </h1>
          <p className="text-p-on-surface-variant font-body text-sm">
            Overview of all registered hotels, occupancy, and active guests in your jurisdiction.
          </p>
        </header>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 md:gap-6 mb-8">
          <div className="bg-white p-4 md:p-6 rounded-xl">
            <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider">{t('police.hotels')}</p>
            <h4 className="text-2xl md:text-3xl font-headline font-bold text-p-on-surface mt-1">{data?.total ?? '—'}</h4>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-xl">
            <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider">{t('police.activeGuests')}</p>
            <h4 className="text-2xl md:text-3xl font-headline font-bold text-emerald-600 mt-1">{totalGuests}</h4>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-xl">
            <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider">{t('police.occupiedRooms')}</p>
            <h4 className="text-2xl md:text-3xl font-headline font-bold text-amber-600 mt-1">{totalOccupied}</h4>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
            <input
              type="text"
              placeholder="Search hotels by name or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-slate-200 text-sm focus:border-[#1B4332] focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Hotels list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hotels.length === 0 ? (
          <div className="bg-white rounded-xl px-6 py-16 text-center">
            <span className="material-symbols-outlined text-slate-300 text-5xl mb-4 block">apartment</span>
            <p className="text-p-on-surface-variant">No hotels found{search ? ' matching your search' : ''}</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {hotels.map((h: any) => (
                <div key={h.id} onClick={() => navigate(`/police/hotels/${h.id}`)} className="bg-white rounded-xl p-4 border border-slate-100 cursor-pointer active:scale-[0.99] hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-p-on-surface text-sm truncate">{h.name}</p>
                      {h.address && <p className="text-xs text-slate-500 truncate mt-0.5">{h.address}</p>}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-emerald-600">{h.activeGuests}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-p-on-surface">{h.totalRooms}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">{t('police.rooms')}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-amber-600">{h.occupiedRooms}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">{t('police.occupied')}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-emerald-600">{h.activeGuests}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Guests</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <span className="material-symbols-outlined text-[14px]">mail</span>
                    <span className="truncate">{h.email}</span>
                  </div>
                  {h.phone && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <span className="material-symbols-outlined text-[14px]">call</span>
                      <span>{h.phone}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold h-12">
                      <th className="px-6">{t('police.hotelCol')}</th>
                      <th className="px-4">{t('police.cityCol')}</th>
                      <th className="px-4 text-center">{t('police.rooms')}</th>
                      <th className="px-4 text-center">{t('police.occupied')}</th>
                      <th className="px-4 text-center">{t('police.activeGuests')}</th>
                      <th className="px-4">Contact</th>
                      <th className="px-4">{t('police.sinceCol')}</th>
                      <th className="px-4 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {hotels.map((h: any) => {
                      const occupancy = h.totalRooms > 0 ? Math.round((h.occupiedRooms / h.totalRooms) * 100) : 0;
                      return (
                        <tr key={h.id} onClick={() => navigate(`/police/hotels/${h.id}`)} className="hover:bg-slate-50 transition-colors h-14 cursor-pointer">
                          <td className="px-6">
                            <p className="font-semibold text-p-on-surface group-hover:text-[#1B4332]">{h.name}</p>
                          </td>
                          <td className="px-4 text-slate-500 text-xs max-w-[160px] truncate">{h.address ?? '—'}</td>
                          <td className="px-4 text-center font-medium">{h.totalRooms}</td>
                          <td className="px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                              occupancy >= 80 ? 'bg-red-50 text-red-600' :
                              occupancy >= 50 ? 'bg-amber-50 text-amber-600' :
                              'bg-emerald-50 text-emerald-600'
                            }`}>
                              {h.occupiedRooms} <span className="text-[10px] font-normal">({occupancy}%)</span>
                            </span>
                          </td>
                          <td className="px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-p-primary-container text-p-on-primary-container text-xs font-bold">
                              {h.activeGuests}
                            </span>
                          </td>
                          <td className="px-4 text-xs text-slate-500">{h.email}</td>
                          <td className="px-4 text-xs text-slate-400">
                            {h.registeredSince ? format(new Date(h.registeredSince), 'dd MMM yyyy') : '—'}
                          </td>
                          <td className="px-4">
                            <span className="material-symbols-outlined text-slate-300 text-lg">chevron_right</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </PoliceLayout>
  );
}
