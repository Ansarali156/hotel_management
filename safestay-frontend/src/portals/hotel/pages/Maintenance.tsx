import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getRooms } from '../api/hotel.api';
import HotelLayout from '../components/HotelLayout';
import RoomDetailPanel from '../components/RoomDetailPanel';
import type { Room, FloorGroup } from '../../../shared/types/hotel.types';

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

export default function Maintenance() {
  const { t } = useTranslation();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const { data: rooms = [], isLoading, refetch } = useQuery({
    queryKey: ['hotel-rooms'],
    queryFn: getRooms,
  });

  const maintenanceRooms = rooms.filter(r => r.status === 'MAINTENANCE');
  const floors = groupByFloor(maintenanceRooms);

  return (
    <HotelLayout>
      <div className="space-y-8">
        <section>
          <h1 className="text-3xl font-black text-h-primary font-headline tracking-tight">
            {t('dashboard.maintenance')}
          </h1>
          <p className="text-h-secondary text-sm font-medium mt-1">
            {maintenanceRooms.length} rooms currently under maintenance
          </p>
        </section>

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
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {floorRooms.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoomId(room.id)}
                      className="p-6 bg-white border-2 border-amber-100 rounded-xl flex flex-col items-center justify-center relative hover:border-amber-300 hover:shadow-md transition-all group cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-amber-500 text-3xl mb-2">engineering</span>
                      <span className="text-xl font-bold font-headline text-h-primary">{room.roomNumber}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{room.category}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {maintenanceRooms.length === 0 && (
              <div className="text-center py-32 bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/50">
                <span className="material-symbols-outlined text-6xl text-slate-200 mb-4 block">check_circle</span>
                <p className="text-slate-400 font-medium">No rooms are currently under maintenance.</p>
                <p className="text-xs text-slate-300 mt-1">You can put rooms under maintenance from the Room Overview.</p>
              </div>
            )}
          </div>
        )}
      </div>

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
