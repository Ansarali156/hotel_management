import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPoliceHotelGuest } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import { format } from 'date-fns';

const THREAT_CHIP: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-amber-100 text-amber-700',
  LOW:      'bg-slate-100 text-slate-600',
};
const STATUS_CHIP: Record<string, string> = {
  ABSCONDING:         'bg-red-600 text-white',
  WANTED:             'border border-red-500 text-red-600',
  IN_CUSTODY:         'bg-blue-100 text-blue-700',
  ARRESTED:           'bg-blue-100 text-blue-700',
  UNDER_INVESTIGATION:'bg-amber-100 text-amber-700',
  PAROLE:             'bg-slate-100 text-slate-600',
  RELEASED:           'bg-slate-100 text-slate-500',
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-p-on-surface">{value}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
        <span className="material-symbols-outlined text-[#1B4332] text-[18px]">{icon}</span>
        <h3 className="font-bold text-sm text-p-on-surface uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
        {children}
      </div>
    </div>
  );
}

export default function PoliceGuestDetail() {
  const { hotelId, guestId } = useParams<{ hotelId: string; guestId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['police-guest', hotelId, guestId],
    queryFn: () => getPoliceHotelGuest(hotelId!, guestId!),
    enabled: !!hotelId && !!guestId,
  });

  const hotel = data?.hotel;
  const g     = data?.guest;

  return (
    <PoliceLayout>
      <div className="p-4 md:p-8 max-w-[1100px] mx-auto">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-slate-400 mb-6">
          <button onClick={() => navigate('/police/hotels')} className="hover:text-[#1B4332] transition-colors">
            Hotels
          </button>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <button onClick={() => navigate(`/police/hotels/${hotelId}`)} className="hover:text-[#1B4332] transition-colors">
            {hotel?.name ?? 'Hotel'}
          </button>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-p-on-surface font-medium">{g?.fullName ?? 'Guest'}</span>
        </nav>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !g ? (
          <div className="bg-white rounded-xl py-16 text-center border border-slate-100">
            <span className="material-symbols-outlined text-slate-300 text-5xl mb-3 block">person_off</span>
            <p className="text-p-on-surface-variant">{t('police.guestNotFound')}</p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Hero card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 md:p-6">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#1B4332]/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#1B4332] text-3xl">
                    {g.gender === 'FEMALE' ? 'face_3' : 'face'}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-p-on-surface tracking-tight">
                        {g.fullName}
                      </h1>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Age {g.age} · {g.gender} · {g.guestType}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase shrink-0 ${
                      g.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {g.isActive ? 'Currently Checked In' : 'Checked Out'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 mt-3 text-sm text-slate-600">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-slate-400">apartment</span>
                      {hotel?.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-slate-400">meeting_room</span>
                      Room {g.room?.roomNumber ?? '—'}
                      {g.room?.floor && ` (Floor ${g.room.floor})`}
                      {g.room?.category && ` · ${g.room.category}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-slate-400">call</span>
                      {g.phoneNumber}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stay timeline */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Check-In</p>
                  <p className="text-sm font-bold text-p-on-surface">
                    {format(new Date(g.checkInDate), 'dd MMM yyyy')}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {format(new Date(g.checkInDate), 'hh:mm a')}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Expected Out</p>
                  <p className="text-sm font-bold text-p-on-surface">
                    {g.expectedCheckout ? format(new Date(g.expectedCheckout), 'dd MMM yyyy') : '—'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Actual Out</p>
                  <p className="text-sm font-bold text-p-on-surface">
                    {g.checkOutDate ? format(new Date(g.checkOutDate), 'dd MMM yyyy') : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Identity documents */}
            <Section title="Identity Documents" icon="badge">
              <Field label="Aadhaar"           value={g.aadhaarNumber} />
              <Field label="PAN Card"         value={g.panCard} />
              <Field label="Voter ID"          value={g.voterId} />
              <Field label="Driving Licence"   value={g.drivingLicense} />
              <Field label="Passport Number"   value={g.passportNumber} />
              <Field label="Nationality"       value={g.passportNationality} />
              <Field label="Passport Place"    value={g.passportPlaceOfIssue} />
              <Field label="Passport Issued"   value={g.passportDateOfIssue ? format(new Date(g.passportDateOfIssue), 'dd MMM yyyy') : null} />
              <Field label="Passport Expiry"   value={g.passportExpiry ? format(new Date(g.passportExpiry), 'dd MMM yyyy') : null} />
            </Section>

            {/* Visa details (international only) */}
            {g.guestType === 'INTERNATIONAL' && (g.visaNumber || g.visaType || g.visaValidTill) && (
              <Section title="Visa Details" icon="travel_explore">
                <Field label="Visa Number"  value={g.visaNumber} />
                <Field label="Visa Type"    value={g.visaType} />
                <Field label="Valid Till"   value={g.visaValidTill ? format(new Date(g.visaValidTill), 'dd MMM yyyy') : null} />
              </Section>
            )}

            {/* Personal details */}
            <Section title="Personal Details" icon="person">
              <Field label="Father's Name" value={g.fatherName} />
              <Field label="Email"         value={g.email} />
              <Field label="Address"       value={g.address} />
            </Section>

            {/* Match Alerts */}
            {g.matchAlerts && g.matchAlerts.length > 0 && (
              <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-red-50 border-b border-red-100">
                  <span className="material-symbols-outlined text-red-600 text-[18px]">warning</span>
                  <h3 className="font-bold text-sm text-red-700 uppercase tracking-wide">
                    Criminal Match Alerts ({g.matchAlerts.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {g.matchAlerts.map((alert: any) => (
                    <div
                      key={alert.id}
                      onClick={() => navigate(`/police/alerts/${alert.id}`)}
                      className="p-4 md:p-5 flex items-start gap-4 cursor-pointer hover:bg-red-50/30 transition-colors"
                    >
                      {/* Score ring */}
                      <div className="shrink-0 w-12 h-12 rounded-full border-2 border-red-300 flex flex-col items-center justify-center">
                        <span className="text-sm font-black text-red-600 leading-none">
                          {Math.round((alert.matchScore ?? 0) * 100)}
                        </span>
                        <span className="text-[8px] text-red-400 font-bold">SCORE</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-bold text-p-on-surface text-sm">{alert.criminal?.fullName}</p>
                          {alert.criminal?.threatLevel && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${THREAT_CHIP[alert.criminal.threatLevel]}`}>
                              {alert.criminal.threatLevel}
                            </span>
                          )}
                          {alert.criminal?.caseStatus && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_CHIP[alert.criminal.caseStatus] ?? 'bg-slate-100 text-slate-500'}`}>
                              {alert.criminal.caseStatus.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mb-1">{alert.criminal?.crimeType}</p>
                        {alert.matchBreakdown && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Object.entries(alert.matchBreakdown as Record<string, number>).map(([k, v]) => (
                              <span key={k} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                                {k}: {Math.round(v * 100)}%
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                          alert.status === 'CONFIRMED' ? 'bg-red-100 text-red-700' :
                          alert.status === 'DISMISSED' ? 'bg-slate-100 text-slate-500' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {alert.status?.replace(/_/g, ' ')}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {format(new Date(alert.createdAt), 'dd MMM yyyy')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </PoliceLayout>
  );
}
