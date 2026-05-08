import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getRoom, checkOutGuest } from '../api/hotel.api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface Props {
  roomId: string;
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'text-blue-600',
  OCCUPIED: 'text-emerald-600',
  MAINTENANCE: 'text-amber-600',
  CHECKOUT: 'text-slate-500',
};

const STATUS_DOT: Record<string, string> = {
  AVAILABLE: 'bg-blue-600',
  OCCUPIED: 'bg-emerald-600',
  MAINTENANCE: 'bg-amber-500',
  CHECKOUT: 'bg-slate-400',
};

export default function RoomDetailPanel({ roomId, onClose, onRefresh }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: room, isLoading } = useQuery({
    queryKey: ['hotel-room', roomId],
    queryFn: () => getRoom(roomId),
  });

  const checkoutMutation = useMutation({
    mutationFn: () => checkOutGuest(room!.currentGuest!.id),
    onSuccess: () => {
      toast.success('Guest checked out successfully');
      queryClient.invalidateQueries({ queryKey: ['hotel-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['hotel-room', roomId] });
      onRefresh();
      setShowConfirm(false);
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Checkout failed');
    },
  });

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-on-surface/20 backdrop-blur-[1px] z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <section className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)] flex flex-col z-50 animate-[slideIn_0.2s_ease-out]">
        {isLoading || !room ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-h-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="p-8 border-b border-surface-container-low flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-headline font-extrabold text-h-primary tracking-tight">
                  Room {room.roomNumber}
                </h2>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[room.status] ?? 'bg-slate-400'}`} />
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${STATUS_BADGE[room.status] ?? 'text-slate-500'}`}>
                    {room.status.charAt(0) + room.status.slice(1).toLowerCase()}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">· {room.category}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-8">
              {room.currentGuest ? (
                <>
                  {/* Guest card */}
                  <article className="bg-surface-container-lowest p-6 rounded-lg border border-outline-variant/20">
                    <div className="flex gap-5">
                      <div className="w-[72px] h-[72px] rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-4xl text-outline">
                          {room.currentGuest.gender === 'FEMALE' ? 'face_3' : 'person'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-on-surface leading-tight">{room.currentGuest.fullName}</h3>
                        <div className="mt-1 flex flex-wrap gap-2 text-sm text-on-surface-variant">
                          <span>Age: {room.currentGuest.age}</span>
                          <span>·</span>
                          <span>{(room.currentGuest.gender ?? '').charAt(0) + (room.currentGuest.gender ?? '').slice(1).toLowerCase()}</span>
                          <span>·</span>
                          <span className="text-[11px] px-1.5 py-0.5 bg-surface-container-high rounded font-bold">
                            {room.currentGuest.guestType}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-h-primary-container">phone</span>
                          <span className="text-sm font-medium text-h-primary-container">
                            {room.currentGuest.phone}
                          </span>
                        </div>
                        {room.currentGuest.email && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-h-secondary">mail</span>
                            <span className="text-sm text-h-secondary truncate">{room.currentGuest.email}</span>
                          </div>
                        )}
                        {room.currentGuest.fatherName && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-h-secondary">family_restroom</span>
                            <span className="text-sm text-h-secondary">S/O {room.currentGuest.fatherName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>

                  {/* ID details */}
                  {(room.currentGuest.aadhaarNumber || room.currentGuest.panCard || room.currentGuest.voterId ||
                    room.currentGuest.drivingLicense || room.currentGuest.passportNumber) && (
                    <section className="space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] text-h-secondary">Identity Documents</h4>
                      <div className="grid grid-cols-1 gap-2">
                        {room.currentGuest.aadhaarNumber && (
                          <div className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20">
                            <span className="material-symbols-outlined text-h-secondary text-[18px]">verified_user</span>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-on-surface-variant">Aadhaar</p>
                              <p className="text-sm font-mono font-bold text-on-surface">{room.currentGuest.aadhaarNumber}</p>
                            </div>
                          </div>
                        )}
                        {room.currentGuest.panCard && (
                          <div className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20">
                            <span className="material-symbols-outlined text-h-secondary text-[18px]">badge</span>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-on-surface-variant">PAN Card</p>
                              <p className="text-sm font-mono font-bold text-on-surface">{room.currentGuest.panCard}</p>
                            </div>
                          </div>
                        )}
                        {room.currentGuest.voterId && (
                          <div className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20">
                            <span className="material-symbols-outlined text-h-secondary text-[18px]">how_to_vote</span>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-on-surface-variant">Voter ID</p>
                              <p className="text-sm font-mono font-bold text-on-surface">{room.currentGuest.voterId}</p>
                            </div>
                          </div>
                        )}
                        {room.currentGuest.drivingLicense && (
                          <div className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20">
                            <span className="material-symbols-outlined text-h-secondary text-[18px]">directions_car</span>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-on-surface-variant">Driving Licence</p>
                              <p className="text-sm font-mono font-bold text-on-surface">{room.currentGuest.drivingLicense}</p>
                            </div>
                          </div>
                        )}
                        {room.currentGuest.passportNumber && (
                          <div className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20">
                            <span className="material-symbols-outlined text-h-secondary text-[18px]">travel_explore</span>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-on-surface-variant">
                                Passport {room.currentGuest.passportNationality ? `· ${room.currentGuest.passportNationality}` : ''}
                              </p>
                              <p className="text-sm font-mono font-bold text-on-surface">{room.currentGuest.passportNumber}</p>
                              {room.currentGuest.passportPlaceOfIssue && (
                                <p className="text-xs text-on-surface-variant mt-1">Issued: {room.currentGuest.passportPlaceOfIssue}</p>
                              )}
                              {room.currentGuest.passportDateOfIssue && (
                                <p className="text-xs text-on-surface-variant">
                                  {format(new Date(room.currentGuest.passportDateOfIssue), 'dd MMM yyyy')}
                                </p>
                              )}
                              {room.currentGuest.passportExpiry && (
                                <p className="text-xs text-on-surface-variant">
                                  Expires: {format(new Date(room.currentGuest.passportExpiry), 'dd MMM yyyy')}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Visa details (international) */}
                  {room.currentGuest.visaNumber && (
                    <section className="space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] text-h-secondary">Visa Details</h4>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20">
                          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                            {room.currentGuest.visaNumber && (
                              <>
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-on-surface-variant">Visa Number</p>
                                  <p className="font-mono font-bold text-on-surface">{room.currentGuest.visaNumber}</p>
                                </div>
                                {room.currentGuest.visaType && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Visa Type</p>
                                    <p className="font-bold text-on-surface">{room.currentGuest.visaType}</p>
                                  </div>
                                )}
                              </>
                            )}
                            {room.currentGuest.visaValidTill && (
                              <div className="col-span-2">
                                <p className="text-[10px] font-bold uppercase text-on-surface-variant">Valid Till</p>
                                <p className="font-bold text-on-surface">
                                  {format(new Date(room.currentGuest.visaValidTill), 'dd MMM yyyy')}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Stay info */}
                  <section className="space-y-4">
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] text-h-secondary">Stay Information</h4>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                      <div>
                        <p className="text-xs text-on-surface-variant mb-1">Check-in</p>
                        <p className="font-medium text-on-surface">
                          {room.currentGuest.arrivalDate
                            ? format(new Date(room.currentGuest.arrivalDate), 'MMM dd, yyyy')
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-on-surface-variant mb-1">Expected Checkout</p>
                        <p className="font-medium text-on-surface">
                          {room.currentGuest.expectedCheckout
                            ? format(new Date(room.currentGuest.expectedCheckout), 'MMM dd, yyyy')
                            : '—'}
                        </p>
                      </div>
                      {room.currentGuest.address && (
                        <div className="col-span-2">
                          <p className="text-xs text-on-surface-variant mb-2">Address</p>
                          <p className="text-sm text-on-surface">{room.currentGuest.address}</p>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <span className="material-symbols-outlined text-5xl text-outline mb-3">hotel</span>
                  <p className="font-medium text-on-surface-variant">
                    {room.status === 'AVAILABLE' ? 'This room is available for check-in.' : `Status: ${room.status}`}
                  </p>
                  {room.status === 'AVAILABLE' && (
                    <button
                      onClick={() => { onClose(); navigate('/hotel/check-in', { state: { roomNumber: room.roomNumber } }); }}
                      className="mt-4 bg-h-primary-container text-white text-sm font-bold px-6 py-2.5 rounded-lg hover:bg-h-primary transition-colors"
                    >
                      Check In Guest
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            {room.currentGuest && (
              <footer className="p-8 bg-surface-container-low flex flex-col gap-3">
                <button
                  onClick={() => setShowConfirm(true)}
                  className="w-full h-12 border border-error text-error font-bold rounded-lg hover:bg-error-container/20 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  Check Out Guest
                </button>
              </footer>
            )}
          </>
        )}

        {/* Checkout confirmation modal */}
        {showConfirm && (
          <div className="absolute inset-0 bg-on-background/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-6 border border-outline-variant/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-error">warning</span>
                </div>
                <h3 className="text-lg font-bold text-on-surface">Confirm Check-out</h3>
              </div>
              <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
                Are you sure you want to check out{' '}
                <span className="font-bold text-on-surface">{room?.currentGuest?.fullName}</span>?
                This action will finalize the stay record.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 h-11 text-sm font-bold text-h-secondary border border-outline-variant/30 rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => checkoutMutation.mutate()}
                  disabled={checkoutMutation.isPending}
                  className="flex-1 h-11 text-sm font-bold text-white bg-error rounded-lg hover:brightness-110 transition-all disabled:opacity-60"
                >
                  {checkoutMutation.isPending ? 'Processing…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
