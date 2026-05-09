import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HotelLayout from '../components/HotelLayout';
import { deleteHotel, getHotelProfile, getRooms, addRoom, deleteRoom, updateHotelProfile } from '../api/hotel.api';
import toast from 'react-hot-toast';
import type { Room } from '../../../shared/types/hotel.types';

type Tab = 'profile' | 'rooms' | 'danger';

export default function HotelSettings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('profile');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [hotel, setHotel] = useState<Record<string, any>>({});
  
  // Room Management State
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [newRoom, setNewRoom] = useState({ floor: '', roomNumber: '', category: '' });

  useEffect(() => {
    fetchProfile();
    fetchRooms();
  }, []);

  const fetchProfile = () => {
    setProfileLoading(true);
    getHotelProfile()
      .then((data) => {
        setHotel(data);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  };

  const fetchRooms = () => {
    setRoomsLoading(true);
    getRooms()
      .then(setRooms)
      .catch(() => {})
      .finally(() => setRoomsLoading(false));
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoom.floor || !newRoom.roomNumber || !newRoom.category) {
      toast.error('Please fill all fields');
      return;
    }
    setAddLoading(true);
    try {
      await addRoom({
        floor: Number(newRoom.floor),
        roomNumber: newRoom.roomNumber,
        category: newRoom.category
      });
      toast.success('Room added successfully');
      setNewRoom({ floor: '', roomNumber: '', category: '' });
      fetchRooms();
      fetchProfile(); // Refresh profile to see updated floor/room counts
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to add room');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm('Are you sure you want to delete this room?')) return;
    try {
      await deleteRoom(roomId);
      toast.success('Room deleted');
      fetchRooms();
      fetchProfile();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to delete room');
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteHotel(); 
      toast.success('Hotel account deleted successfully.');
      navigate('/hotel/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to delete hotel. Please try again.');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <div className="py-4 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest w-44 shrink-0">{label}</span>
      <span className="text-sm font-medium text-on-surface">{value || <span className="text-slate-300 italic">{t('settings.notProvided')}</span>}</span>
    </div>
  );

  // Group rooms by floor for overview
  const floors = Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b);

  return (
    <HotelLayout>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-h-primary tracking-tight font-headline">{t('settings.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('settings.subtitle')}</p>
      </div>

      <div className="flex gap-8 flex-col lg:flex-row">
        {/* ── Sidebar tabs ──────────────────────────────────── */}
        <aside className="lg:w-52 shrink-0">
          <nav className="flex lg:flex-col gap-1">
            {[
              { key: 'profile' as Tab, icon: 'business', label: t('settings.hotelProfile') },
              { key: 'rooms' as Tab, icon: 'door_open', label: 'Room Management' },
              { key: 'danger' as Tab, icon: 'delete_forever', label: t('settings.deleteHotel'), danger: true },
            ].map(({ key, icon, label, danger }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-left transition-all ${
                  tab === key
                    ? danger
                      ? 'bg-red-50 text-red-600'
                      : 'bg-h-primary/5 text-h-primary'
                    : danger
                    ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                    : 'text-slate-500 hover:text-h-primary hover:bg-slate-50'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${tab === key && danger ? 'icon-fill' : tab === key ? 'icon-fill' : ''}`}>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Content ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {profileLoading ? (
            <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-slate-100">
              <div className="w-8 h-8 border-2 border-h-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Profile Tab ───────────────────────────────── */}
              {tab === 'profile' && (
                <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
                  <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-h-primary-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-2xl icon-fill">hotel</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-h-primary font-headline">{hotel.name || 'Your Hotel'}</h2>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{hotel.email}</p>
                    </div>
                  </div>

                  <div className="px-8 py-2">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-4">{t('settings.accountInfo')}</p>
                    <Field label={t('settings.hotelName')} value={hotel.name} />
                    <Field label={t('settings.email')} value={hotel.email} />
                    <Field label={t('settings.phone')} value={hotel.contactNumber} />
                    <Field label={t('settings.licenseNumber')} value={hotel.licenseNumber} />
                  </div>

                  <div className="px-8 py-2">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-4">{t('settings.propertyDetails')}</p>
                    <Field label={t('settings.address')} value={hotel.address} />
                    <Field label={t('settings.totalFloors')} value={hotel.totalFloors} />
                    <Field label={t('settings.totalRooms')} value={rooms.length} />
                    <Field label="Max Guests / Room" value={hotel.maxGuestsPerRoom} />
                    
                    <div className="py-4 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest w-44 shrink-0">{t('settings.roomCategories')}</span>
                      <div className="flex flex-wrap gap-2">
                        {(hotel.roomCategories || []).map((c: string) => (
                          <span key={c} className="px-3 py-1 bg-h-primary/8 text-h-primary text-xs font-bold rounded-full border border-h-primary/10">{c}</span>
                        ))}
                      </div>
                    </div>
                    <Field label="Hotel ID" value={hotel.id} />
                  </div>

                  <div className="px-8 py-6 bg-slate-50 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                      {t('settings.updateNote')}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Room Management Tab ───────────────────────── */}
              {tab === 'rooms' && (
                <div className="space-y-6">
                  {/* Add Room Form */}
                  <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100">
                      <h2 className="text-xl font-bold text-h-primary font-headline">Add Room</h2>
                    </div>
                    <form onSubmit={handleAddRoom} className="p-8">
                      <div className="flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[120px] space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Floor</label>
                          <input
                            type="number"
                            value={newRoom.floor}
                            onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
                            placeholder="Floor"
                            className="w-full h-11 px-4 rounded-xl border-2 border-slate-100 focus:border-h-primary focus:outline-none text-sm font-medium transition-colors"
                          />
                        </div>
                        <div className="flex-1 min-w-[150px] space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Room Number</label>
                          <input
                            type="text"
                            value={newRoom.roomNumber}
                            onChange={(e) => setNewRoom({ ...newRoom, roomNumber: e.target.value })}
                            placeholder="Room Number"
                            className="w-full h-11 px-4 rounded-xl border-2 border-slate-100 focus:border-h-primary focus:outline-none text-sm font-medium transition-colors"
                          />
                        </div>
                        <div className="flex-1 min-w-[150px] space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</label>
                          <select
                            value={newRoom.category}
                            onChange={(e) => setNewRoom({ ...newRoom, category: e.target.value })}
                            className="w-full h-11 px-4 rounded-xl border-2 border-slate-100 focus:border-h-primary focus:outline-none text-sm font-medium transition-colors bg-white"
                          >
                            <option value="">Category...</option>
                            {hotel.roomCategories?.map((c: string) => (
                              <option key={c} value={c}>{c}</option>
                            )) || (
                              <>
                                <option value="Standard">Standard</option>
                                <option value="Deluxe">Deluxe</option>
                                <option value="Suite">Suite</option>
                              </>
                            )}
                          </select>
                        </div>
                        <button
                          type="submit"
                          disabled={addLoading}
                          className="h-11 px-6 bg-h-primary text-white text-sm font-bold rounded-xl hover:bg-h-primary/90 transition-all flex items-center gap-2 whitespace-nowrap"
                        >
                          {addLoading ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span className="material-symbols-outlined text-[18px]">add</span>
                          )}
                          Add Room
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Room Overview */}
                  <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100">
                      <h2 className="text-xl font-bold text-h-primary font-headline">Room Overview</h2>
                    </div>
                    <div className="p-8 space-y-8">
                      {roomsLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-6 h-6 border-2 border-h-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <>
                          {floors.map(floor => (
                            <div key={floor} className="space-y-4">
                              <h3 className="text-xs font-black text-h-primary uppercase tracking-[0.2em]">FLOOR {floor}</h3>
                              <div className="flex flex-wrap gap-4">
                                {rooms.filter(r => r.floor === floor).map(room => (
                                  <div key={room.id} className="relative group">
                                    <div className={`w-24 h-24 rounded-xl border flex flex-col items-center justify-center transition-all ${
                                      room.status === 'OCCUPIED' 
                                        ? 'bg-red-50 border-red-100 text-red-600' 
                                        : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                    }`}>
                                      <span className="text-lg font-bold">{room.roomNumber}</span>
                                      <span className="text-[9px] font-medium opacity-70">{room.category}</span>
                                      <span className="text-[9px] font-bold mt-1 uppercase tracking-tighter">{room.status}</span>
                                    </div>
                                    <button
                                      onClick={() => handleDeleteRoom(room.id)}
                                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-all scale-90"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {rooms.length === 0 && (
                            <div className="text-center py-12 text-slate-400 italic">No rooms configured yet.</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Danger / Delete Tab ───────────────────────── */}
              {tab === 'danger' && (
                <div className="space-y-4">
                  <div className="bg-surface-container-lowest rounded-xl border border-red-100 overflow-hidden">
                    <div className="px-8 py-6 border-b border-red-50">
                      <h2 className="text-lg font-bold text-red-600 font-headline flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] icon-fill">warning</span>
                        {t('settings.dangerZone')}
                      </h2>
                      <p className="text-sm text-slate-400 mt-1">{t('settings.dangerZoneText')}</p>
                    </div>

                    <div className="px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-on-surface">{t('settings.deleteAccount')}</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md">
                          Permanently delete <span className="font-semibold text-slate-600">{hotel.name}</span> and all associated data. This cannot be undone.
                        </p>
                      </div>
                      <button
                        onClick={() => { setDeleteConfirmText(''); setShowDeleteDialog(true); }}
                        className="shrink-0 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-all flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                        {t('settings.deleteBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Delete Confirmation Dialog ─────────────────────── */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!deleteLoading) setShowDeleteDialog(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col gap-6">
            <div className="text-center">
              <h3 className="text-xl font-bold text-on-surface font-headline">{t('settings.deleteModalTitle')}</h3>
              <p className="text-sm text-slate-400 mt-2">{t('settings.deleteModalAbout')}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium">{t('settings.deleteModalType')}</p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                disabled={deleteLoading}
                className="w-full h-11 px-4 rounded-xl border-2 border-slate-200 focus:border-red-400 focus:outline-none text-sm font-mono transition-colors disabled:opacity-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setShowDeleteDialog(false)}
                className="h-12 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm"
              >
                {t('settings.noKeepIt')}
              </button>
              <button
                type="button"
                disabled={deleteLoading || deleteConfirmText !== 'DELETE MY ACCOUNT'}
                onClick={handleDelete}
                className="h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center"
              >
                {deleteLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('settings.yesDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </HotelLayout>
  );
}
