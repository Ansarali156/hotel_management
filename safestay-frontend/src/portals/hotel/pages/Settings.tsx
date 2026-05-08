import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HotelLayout from '../components/HotelLayout';
import { deleteHotel, getHotelProfile } from '../api/hotel.api';
import toast from 'react-hot-toast';

type Tab = 'profile' | 'danger';

export default function HotelSettings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('profile');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  const [hotel, setHotel] = useState<Record<string, any>>({});

  useEffect(() => {
    getHotelProfile()
      .then((data) => setHotel(data))
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteHotel(); // clears sessionStorage internally
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

          {/* ── Profile Tab ───────────────────────────────── */}
          {tab === 'profile' && (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              {/* Header */}
              <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-h-primary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-2xl icon-fill">hotel</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-h-primary font-headline">{hotel.name || 'Your Hotel'}</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">{hotel.email}</p>
                </div>
              </div>

              {/* Fields */}
              <div className="px-8 py-2">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-4">{t('settings.accountInfo')}</p>
                <Field label={t('settings.hotelName')} value={hotel.name} />
                <Field label={t('settings.email')} value={hotel.email} />
                <Field label={t('settings.phone')} value={hotel.phone} />
                <Field label={t('settings.licenseNumber')} value={hotel.licenseNumber} />
              </div>

              <div className="px-8 py-2">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-4">{t('settings.propertyDetails')}</p>
                <Field label={t('settings.address')} value={hotel.address} />
                <Field label={t('settings.totalFloors')} value={hotel.totalFloors} />
                <Field label={t('settings.totalRooms')} value={hotel.roomsPerFloor} />
                <Field label="Max Guests / Room" value={hotel.maxGuestsPerRoom} />
                <div className="py-4 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest w-44 shrink-0">{t('settings.roomCategories')}</span>
                  <div className="flex flex-wrap gap-2">
                    {(hotel.categories ?? hotel.roomCategories ?? []).length > 0
                      ? (hotel.categories ?? hotel.roomCategories).map((c: string) => (
                          <span key={c} className="px-3 py-1 bg-h-primary/8 text-h-primary text-xs font-bold rounded-full border border-h-primary/10">{c}</span>
                        ))
                      : <span className="text-slate-300 italic text-sm">Not provided</span>}
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
                      Permanently delete <span className="font-semibold text-slate-600">{hotel.name}</span> and all associated data — rooms, guest records, and check-in history. This cannot be undone.
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
        </div>
      </div>

      {/* ── Delete Confirmation Dialog ─────────────────────── */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!deleteLoading) { setShowDeleteDialog(false); setDeleteConfirmText(''); } }}
          />

          {/* Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col gap-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-3xl icon-fill">delete_forever</span>
              </div>
            </div>

            {/* Title */}
            <div className="text-center">
              <h3 className="text-xl font-bold text-on-surface font-headline">{t('settings.deleteModalTitle')}</h3>
              <p className="text-sm text-slate-400 mt-2">{t('settings.deleteModalAbout')}</p>
            </div>

            {/* Hotel summary */}
            <div className="bg-red-50 rounded-xl p-5 border border-red-100 space-y-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-red-400 text-[18px] icon-fill">hotel</span>
                <span className="text-sm font-bold text-on-surface">{hotel.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-red-400 text-[18px]">mail</span>
                <span className="text-sm text-slate-500">{hotel.email}</span>
              </div>
              {hotel.address && (
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-red-400 text-[18px]">location_on</span>
                  <span className="text-sm text-slate-500 truncate">{hotel.address}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-red-400 text-[18px]">meeting_room</span>
                <span className="text-sm text-slate-500">
                  {(hotel.totalFloors ?? 0) * (hotel.roomsPerFloor ?? 0)} rooms across {hotel.totalFloors ?? 0} floors
                </span>
              </div>
            </div>

            {/* Warning notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex gap-3">
              <span className="material-symbols-outlined text-amber-600 text-[18px] icon-fill shrink-0 mt-0.5">error</span>
              <p className="text-xs text-amber-700 font-medium leading-relaxed">
                {t('settings.deleteModalWarning')}
              </p>
            </div>

            {/* Text confirmation */}
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium">
                {t('settings.deleteModalType')}
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                disabled={deleteLoading}
                className="w-full h-11 px-4 rounded-xl border-2 border-slate-200 focus:border-red-400 focus:outline-none text-sm font-mono transition-colors disabled:opacity-50"
                autoComplete="off"
              />
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(''); }}
                className="h-12 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                {t('settings.noKeepIt')}
              </button>
              <button
                type="button"
                disabled={deleteLoading || deleteConfirmText !== 'DELETE MY ACCOUNT'}
                onClick={handleDelete}
                className="h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleteLoading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting…</>
                ) : (
                  <><span className="material-symbols-outlined text-[16px]">delete_forever</span> {t('settings.yesDelete')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </HotelLayout>
  );
}
