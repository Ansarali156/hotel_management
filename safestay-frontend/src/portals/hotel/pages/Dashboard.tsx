import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRooms } from '../api/hotel.api';
import type { Room, FloorGroup } from '../../../shared/types/hotel.types';
import HotelLayout from '../components/HotelLayout';
import RoomDetailPanel from '../components/RoomDetailPanel';

const STATUS_DOT: Record<string, string> = {
  AVAILABLE: 'bg-blue-500',
  OCCUPIED: 'bg-emerald-500',
  MAINTENANCE: 'bg-amber-500',
  CHECKOUT: 'bg-slate-400',
};

function groupByFloor(rooms: Room[]): FloorGroup[] {
  const map = new Map<number, Room[]>();
  for (const r of rooms) {
    const arr = map.get(r.floor) ?? [];
    arr.push(r);
    map.set(r.floor, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([floor, rooms]) => ({ floor, rooms }));
}

export default function HotelDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const { data: rooms = [], isLoading, refetch } = useQuery({
    queryKey: ['hotel-rooms'],
    queryFn: getRooms,
    refetchInterval: 30_000,
  });

  const floors = groupByFloor(rooms);
  const stats = {
    total: rooms.length,
    occupied: rooms.filter((r) => r.status === 'OCCUPIED').length,
    available: rooms.filter((r) => r.status === 'AVAILABLE').length,
    maintenance: rooms.filter((r) => r.status === 'MAINTENANCE').length,
  };

  return (
    <HotelLayout>
      <div className="space-y-8">
        {/* Page header + legend */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h1 className="text-3xl font-black text-h-primary font-headline tracking-tight">{t('dashboard.title')}</h1>
            <p className="text-h-secondary text-sm font-medium mt-1">
              {stats.total} {t('dashboard.totalRooms')} &nbsp;|&nbsp;
              <span className="text-emerald-700">{Math.round((stats.available / (stats.total || 1)) * 100)}% {t('dashboard.available')}</span>
            </p>
          </div>

          <div className="bg-surface-container-lowest p-4 rounded-lg flex flex-wrap items-center gap-6 border border-outline-variant/20">
            {[
              { dot: 'bg-emerald-500', label: t('dashboard.occupied') },
              { dot: 'bg-blue-500', label: t('dashboard.available') },
              { dot: 'bg-amber-500', label: t('dashboard.maintenance') },
              { dot: 'bg-slate-400', label: t('dashboard.checkOut') },
            ].map(({ dot, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${dot}`} />
                <span className="text-xs font-bold font-headline tracking-wide text-h-secondary uppercase">{label}</span>
              </div>
            ))}
            <button
              onClick={() => navigate('/hotel/check-in')}
              className="ml-2 bg-h-primary-container text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-h-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              {t('dashboard.checkIn')}
            </button>
          </div>
        </section>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: t('dashboard.totalRooms'), value: stats.total, color: 'text-h-primary' },
            { label: t('dashboard.occupied'), value: stats.occupied, color: 'text-emerald-700' },
            { label: t('dashboard.available'), value: stats.available, color: 'text-blue-600' },
            { label: t('dashboard.maintenance'), value: stats.maintenance, color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">{label}</p>
              <p className={`text-3xl font-black font-headline ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Floor grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-h-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-12">
            {floors.map(({ floor, rooms: floorRooms }) => (
              <section key={floor}>
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="text-sm font-black font-headline uppercase tracking-[0.2em] text-h-primary whitespace-nowrap">
                    {t('dashboard.floor')} {String(floor).padStart(2, '0')}
                  </h2>
                  <div className="flex-grow h-px bg-outline-variant/20" />
                  <span className="text-[10px] font-bold text-slate-400 font-headline whitespace-nowrap">
                    {floorRooms.length} UNITS
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                  {floorRooms.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoomId(room.id)}
                      className="aspect-square bg-white border border-outline-variant/30 flex flex-col items-center justify-center relative hover:border-h-primary-container/50 hover:shadow-sm transition-all group cursor-pointer rounded-sm"
                    >
                      <span className="text-xl font-bold font-headline text-h-primary">{room.roomNumber}</span>
                      <span className="text-[9px] text-slate-400 font-medium mt-0.5">{room.category}</span>
                      <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${STATUS_DOT[room.status] ?? 'bg-slate-300'}`} />
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {floors.length === 0 && (
              <div className="text-center py-24 text-on-surface-variant">
                <span className="material-symbols-outlined text-5xl mb-4 block">hotel</span>
                <p className="font-medium">{t('dashboard.noRooms')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Room detail slide-in panel */}
      {selectedRoomId && (
        <RoomDetailPanel
          roomId={selectedRoomId}
          onClose={() => setSelectedRoomId(null)}
          onRefresh={refetch}
        />
      )}
    </HotelLayout>
  );
}
