import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getGuests, exportGuestCSV, exportGuestPDF, downloadFormC, checkOutGuest } from '../api/hotel.api';
import HotelLayout from '../components/HotelLayout';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function GuestList() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [downloadingFormC, setDownloadingFormC] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const { data: guests = [], isLoading } = useQuery({
    queryKey: ['hotel-guests'],
    queryFn: getGuests,
  });

  const checkoutMutation = useMutation({
    mutationFn: (guestId: string) => checkOutGuest(guestId),
    onSuccess: () => {
      toast.success(t('guests.checkOutSuccess'));
      qc.invalidateQueries({ queryKey: ['hotel-guests'] });
      setCheckingOut(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Checkout failed');
      setCheckingOut(null);
    },
  });

  const active = guests.filter((g: any) => !g.actualCheckout);
  const past = guests.filter((g: any) => g.actualCheckout);

  const handleExportCSV = async () => {
    setExporting('csv');
    try {
      await exportGuestCSV();
      toast.success(t('guests.csvDownloaded'));
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      await exportGuestPDF();
      toast.success(t('guests.pdfDownloaded'));
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleFormC = async (guestId: string) => {
    setDownloadingFormC(guestId);
    try {
      await downloadFormC(guestId);
      toast.success('Form C downloaded');
    } catch {
      toast.error('Form C not available');
    } finally {
      setDownloadingFormC(null);
    }
  };

  const handleCheckout = (guestId: string) => {
    setCheckingOut(guestId);
    checkoutMutation.mutate(guestId);
  };

  const fmtDateTime = (d: string) => {
    try { return format(new Date(d), 'dd MMM yyyy, hh:mm a'); } catch { return '—'; }
  };
  const fmtDate = (d: string) => {
    try { return format(new Date(d), 'dd MMM yyyy'); } catch { return '—'; }
  };

  return (
    <HotelLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-h-primary font-headline tracking-tight">{t('guests.title')}</h1>
            <p className="text-h-secondary text-sm mt-1">{active.length} {t('guests.activeGuests')} · {past.length} {t('guests.pastGuests')}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              disabled={!!exporting}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider border border-h-primary/30 text-h-primary rounded-lg hover:bg-h-primary/5 transition-all disabled:opacity-50"
            >
              {exporting === 'csv' ? (
                <div className="w-3.5 h-3.5 border-2 border-h-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">table_view</span>
              )}
              CSV
            </button>
            <button
              onClick={handleExportPDF}
              disabled={!!exporting}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider bg-h-primary-container text-white rounded-lg hover:bg-h-primary transition-all disabled:opacity-50"
            >
              {exporting === 'pdf' ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              )}
              PDF
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-h-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Currently Staying ───────────────────────── */}
            <section>
              <h2 className="text-xs font-black uppercase tracking-widest text-h-secondary mb-4">{t('guests.activeGuests')}</h2>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {active.length === 0 ? (
                  <p className="text-center py-8 text-on-surface-variant text-sm">{t('guests.noActiveGuests')}</p>
                ) : active.map((g: any) => (
                  <div key={g.id} className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-on-surface">{g.fullName}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{g.phone}</p>
                      </div>
                      <span className="text-xs font-bold text-h-primary-container bg-h-primary/10 px-2 py-0.5 rounded">Room {g.roomId}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-on-surface-variant mb-3">
                      <span>In: {fmtDate(g.arrivalDate)}</span>
                      <span>Out: {g.expectedCheckout ? fmtDate(g.expectedCheckout) : '—'}</span>
                      <span>{g.idType}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCheckout(g.id)}
                        disabled={checkingOut === g.id}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition-all disabled:opacity-50"
                      >
                        {checkingOut === g.id ? (
                          <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-[14px]">logout</span>
                        )}
                        {t('guests.checkOut')}
                      </button>
                      {g.nationality === 'FOREIGN' && (
                        <button
                          onClick={() => handleFormC(g.id)}
                          disabled={downloadingFormC === g.id}
                          className="flex items-center gap-1 h-9 px-3 border border-h-primary/20 text-h-primary text-xs font-bold rounded-lg hover:bg-h-primary/5 transition-all disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">download</span>
                          {t('guests.formC')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block bg-surface-container-lowest rounded-xl overflow-x-auto border border-outline-variant/10">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-high text-[11px] uppercase tracking-wider text-on-surface-variant font-bold h-11">
                      <th className="px-6">{t('checkIn.fullName')}</th>
                      <th className="px-6">{t('guests.room')}</th>
                      <th className="px-6">{t('checkIn.checkInDate')}</th>
                      <th className="px-6">{t('checkIn.expectedCheckout')}</th>
                      <th className="px-6">{t('checkIn.phone')}</th>
                      <th className="px-6">{t('common.edit')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {active.map((g: any) => (
                      <tr key={g.id} className="hover:bg-surface-container-low transition-colors h-14">
                        <td className="px-6 font-semibold">{g.fullName}</td>
                        <td className="px-6 text-on-surface-variant">{g.roomId}</td>
                        <td className="px-6 text-on-surface-variant">{fmtDate(g.arrivalDate)}</td>
                        <td className="px-6 text-on-surface-variant">{g.expectedCheckout ? fmtDate(g.expectedCheckout) : '—'}</td>
                        <td className="px-6 text-on-surface-variant">{g.phone}</td>
                        <td className="px-6">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCheckout(g.id)}
                              disabled={checkingOut === g.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 text-[11px] font-bold rounded-md hover:bg-red-100 transition-all disabled:opacity-50"
                            >
                              {checkingOut === g.id ? (
                                <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <span className="material-symbols-outlined text-[14px]">logout</span>
                              )}
                              {t('guests.checkOut')}
                            </button>
                            {g.nationality === 'FOREIGN' && (
                              <button
                                onClick={() => handleFormC(g.id)}
                                disabled={downloadingFormC === g.id}
                                className="flex items-center gap-1 text-[10px] font-bold text-h-primary uppercase hover:underline disabled:opacity-50"
                              >
                                {downloadingFormC === g.id ? (
                                  <div className="w-3 h-3 border border-h-primary border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <span className="material-symbols-outlined text-[14px]">download</span>
                                )}
                                {t('guests.formC')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {active.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">{t('guests.noActiveGuests')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Past Stays ─────────────────────────────── */}
            {past.length > 0 && (
              <section>
                <h2 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-4">{t('guests.pastGuests')}</h2>
                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {past.slice(0, 50).map((g: any) => (
                    <div key={g.id} className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 opacity-70">
                      <p className="font-semibold text-sm text-on-surface mb-1">{g.fullName}</p>
                      <div className="grid grid-cols-1 gap-1 text-xs text-on-surface-variant">
                        <span>In: {fmtDateTime(g.arrivalDate)}</span>
                        <span>Out: {fmtDateTime(g.actualCheckout!)}</span>
                        <span>{g.phone}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden md:block bg-surface-container-lowest rounded-xl overflow-x-auto border border-outline-variant/10">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-surface-container-high text-[11px] uppercase tracking-wider text-on-surface-variant font-bold h-11">
                        <th className="px-6">Guest</th>
                        <th className="px-6">Check-in</th>
                        <th className="px-6">Checked Out</th>
                        <th className="px-6">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {past.slice(0, 50).map((g: any) => (
                        <tr key={g.id} className="hover:bg-surface-container-low transition-colors h-14 opacity-70">
                          <td className="px-6 font-semibold">{g.fullName}</td>
                          <td className="px-6 text-on-surface-variant">{fmtDateTime(g.arrivalDate)}</td>
                          <td className="px-6 text-on-surface-variant">{fmtDateTime(g.actualCheckout!)}</td>
                          <td className="px-6 text-on-surface-variant">{g.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </HotelLayout>
  );
}
