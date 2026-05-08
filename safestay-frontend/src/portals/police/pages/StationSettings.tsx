import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { updateStationContacts } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import client from '../../../shared/api/client';
import toast from 'react-hot-toast';

interface StationContactsData {
  id: string;
  name: string;
  alertEmailContacts: string[];
  alertWhatsappNumbers: string[];
  alertsEnabled: boolean;
}

const getStationContacts = async (stationId: string): Promise<StationContactsData> => {
  const res = await client.get<{ data: StationContactsData }>(`/police/stations/${stationId}/contacts`);
  return res.data.data;
};

// Decode the `stationId` claim from the JWT stored in sessionStorage.
// The police login flow (auth.controller.ts) puts `stationId` on the JWT
// and also copies it to `sessionStorage.police_station_id`. We trust the
// sessionStorage copy first and fall back to decoding the token.
function getOfficerStationId(): string {
  try {
    const cached = sessionStorage.getItem('police_station_id');
    if (cached) return cached;
    const token = sessionStorage.getItem('auth_token');
    if (!token) return '';
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return '';
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.stationId === 'string' ? payload.stationId : '';
  } catch {
    return '';
  }
}

export default function StationSettings() {
  const { t } = useTranslation();
  const stationId: string = getOfficerStationId();

  const { data: station, isLoading } = useQuery({
    queryKey: ['station-contacts', stationId],
    queryFn: () => getStationContacts(stationId),
    enabled: !!stationId,
  });

  const [emails, setEmails] = useState<string[]>([]);
  const [whatsapp, setWhatsapp] = useState<string[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    if (station) {
      setEmails(station.alertEmailContacts ?? []);
      setWhatsapp(station.alertWhatsappNumbers ?? []);
      setAlertsEnabled(station.alertsEnabled ?? true);
    }
  }, [station]);

  const mutation = useMutation({
    mutationFn: () =>
      updateStationContacts(stationId, {
        alertEmailContacts: emails,
        alertWhatsappNumbers: whatsapp,
        alertsEnabled,
      }),
    onSuccess: () => toast.success('Station alert contacts saved'),
    onError: (err: any) => toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Save failed'),
  });

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || emails.includes(e)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error('Invalid email address'); return; }
    setEmails((prev) => [...prev, e]);
    setNewEmail('');
  };

  const addPhone = () => {
    const p = newPhone.trim();
    if (!p || whatsapp.includes(p)) return;
    if (!/^\+\d{10,15}$/.test(p)) { toast.error('Format: +919876543210'); return; }
    setWhatsapp((prev) => [...prev, p]);
    setNewPhone('');
  };

  if (isLoading) {
    return (
      <PoliceLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </div>
      </PoliceLayout>
    );
  }

  return (
    <PoliceLayout>
      <div className="max-w-3xl mx-auto p-8">
        <div className="mb-10">
          <h1 className="text-3xl font-black text-p-on-surface tracking-tight font-headline">{t('police.stationTitle')}</h1>
          <p className="text-p-on-surface-variant text-sm mt-1">{station?.name ?? 'Your Station'} — Configure who receives priority match alerts</p>
        </div>

        {!stationId ? (
          <div className="bg-p-error-container/10 border border-p-error/20 rounded-xl p-6 text-sm text-p-error">
            Station ID not found in your profile. Please log out and log in again.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Alerts toggle */}
            <section className="bg-white rounded-xl p-6 border border-p-outline-variant/15 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-p-on-surface">{t('police.alertDispatchLabel')}</h2>
                  <p className="text-xs text-p-on-surface-variant mt-0.5">Send email + WhatsApp when match score ≥ 70%</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAlertsEnabled((p) => !p)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${alertsEnabled ? 'bg-[#1B4332]' : 'bg-p-outline'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${alertsEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
            </section>

            {/* Email contacts */}
            <section className="bg-white rounded-xl p-6 border border-p-outline-variant/15 shadow-sm">
              <h2 className="text-sm font-bold text-p-on-surface mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-p-primary">email</span>
                Email Alert Recipients
              </h2>
              <p className="text-xs text-p-on-surface-variant mb-4">Up to 10 addresses. All receive the same alert.</p>
              <div className="space-y-2 mb-4">
                {emails.map((e) => (
                  <div key={e} className="flex items-center justify-between bg-p-surface-container-low rounded-lg px-4 py-2">
                    <span className="text-sm font-medium">{e}</span>
                    <button
                      type="button"
                      onClick={() => setEmails((prev) => prev.filter((x) => x !== e))}
                      className="text-p-error hover:bg-p-error/10 rounded p-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                ))}
                {emails.length === 0 && (
                  <p className="text-xs text-p-on-surface-variant italic">{t('police.noEmailContacts')}</p>
                )}
              </div>
              {emails.length < 10 && (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                    placeholder="officer@police.gov.in"
                    className="flex-1 border border-p-outline-variant/30 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-p-primary"
                  />
                  <button
                    type="button"
                    onClick={addEmail}
                    className="px-4 py-2 bg-p-primary-container text-white text-xs font-bold rounded-lg hover:bg-p-primary transition-all"
                  >
                    Add
                  </button>
                </div>
              )}
            </section>

            {/* WhatsApp contacts */}
            <section className="bg-white rounded-xl p-6 border border-p-outline-variant/15 shadow-sm">
              <h2 className="text-sm font-bold text-p-on-surface mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-p-primary">chat</span>
                WhatsApp Alert Numbers
              </h2>
              <p className="text-xs text-p-on-surface-variant mb-4">Up to 10 numbers. Format: +919876543210</p>
              <div className="space-y-2 mb-4">
                {whatsapp.map((p) => (
                  <div key={p} className="flex items-center justify-between bg-p-surface-container-low rounded-lg px-4 py-2">
                    <span className="text-sm font-medium">{p}</span>
                    <button
                      type="button"
                      onClick={() => setWhatsapp((prev) => prev.filter((x) => x !== p))}
                      className="text-p-error hover:bg-p-error/10 rounded p-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                ))}
                {whatsapp.length === 0 && (
                  <p className="text-xs text-p-on-surface-variant italic">{t('police.noWhatsapp')}</p>
                )}
              </div>
              {whatsapp.length < 10 && (
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPhone())}
                    placeholder="+919876543210"
                    className="flex-1 border border-p-outline-variant/30 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-p-primary"
                  />
                  <button
                    type="button"
                    onClick={addPhone}
                    className="px-4 py-2 bg-p-primary-container text-white text-xs font-bold rounded-lg hover:bg-p-primary transition-all"
                  >
                    Add
                  </button>
                </div>
              )}
            </section>

            {/* Save */}
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="w-full bg-[#1B4332] text-white py-4 rounded-xl font-black text-sm tracking-widest uppercase hover:bg-[#153427] transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {mutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-sm">save</span>
              )}
              Save Alert Settings
            </button>
          </div>
        )}
      </div>
    </PoliceLayout>
  );
}
