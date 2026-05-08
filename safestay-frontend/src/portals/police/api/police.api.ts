import client from '../../../shared/api/client';
import type {
  CriminalProfile,
  MatchAlert,
  CriminalListParams,
  AlertListParams,
  CreateCriminalRequest,
  ReviewAlertRequest,
  StationContactsRequest,
} from '../../../shared/types/police.types';

// ── Criminal Profiles ─────────────────────────────────────────────────────────

function mapCriminal(c: any): CriminalProfile {
  return {
    ...c,
    age: c.age ?? c.approximateAge,
    description: c.description ?? c.crimeDescription,
    distinguishingMarks: c.distinguishingMarks ?? c.identifyingMarks,
    crimeTypes: c.crimeTypes ?? (c.crimeType ? c.crimeType.split(', ').filter(Boolean) : []),
    phone: c.phone ?? (Array.isArray(c.phones) && c.phones.length ? c.phones[0] : c.phones) ?? '',
    emailAddresses: c.emailAddresses ?? (Array.isArray(c.emails) ? c.emails.join(', ') : (c.emails ?? '')),
    aadhaarNumber: c.aadhaarNumber ?? undefined,
    residentialAddress: c.residentialAddress ?? c.lastKnownAddress,
    firNumbers: c.firNumbers
      ? (Array.isArray(c.firNumbers) ? c.firNumbers.join(', ') : c.firNumbers)
      : undefined,
    stationId: c.stationId ?? c.firStationId ?? '',
  };
}

export const getCriminals = async (params?: CriminalListParams) => {
  const res = await client.get<{ data: { profiles: any[]; pagination: { total: number } } }>(
    '/criminals',
    { params }
  );
  const d = res.data.data;
  const list = d.profiles ?? [];
  return { criminals: list.map(mapCriminal), total: d.pagination?.total ?? 0 };
};

export const getCriminal = async (id: string): Promise<CriminalProfile> => {
  const res = await client.get<{ data: any }>(`/criminals/${id}`);
  return mapCriminal(res.data.data);
};

export const createCriminal = async (
  data: CreateCriminalRequest & { photoFile?: File }
): Promise<CriminalProfile> => {
  const { photoFile, ...rest } = data;
  if (photoFile) {
    const form = new FormData();
    Object.entries(rest).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) form.append(k, JSON.stringify(v));
        else form.append(k, String(v));
      }
    });
    form.append('photo', photoFile);
    const res = await client.post<{ data: CriminalProfile }>('/criminals', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  }
  const res = await client.post<{ data: CriminalProfile }>('/criminals', rest);
  return res.data.data;
};

export const updateCriminal = async (
  id: string,
  data: Partial<CreateCriminalRequest>
): Promise<CriminalProfile> => {
  const res = await client.put<{ data: CriminalProfile }>(`/criminals/${id}`, data);
  return res.data.data;
};

// ── Match Alerts ──────────────────────────────────────────────────────────────

function mapAlert(a: any): MatchAlert {
  return {
    ...a,
    score: a.matchScore ?? a.score ?? 0,
    // Preserve the backend enum verbatim (PENDING_REVIEW | CONFIRMED | DISMISSED).
    // The UI filters/badges key off these values directly.
    status: a.status,
    reviewedAt: a.updatedAt,
    dispatchStatus: a.dispatchStatus ?? undefined,
    dispatchedAt: a.dispatchedAt ?? undefined,
    dispatchError: a.dispatchError ?? undefined,
    dispatchToStations: a.dispatchToStations ?? undefined,
    guest: a.guest
      ? {
          fullName: a.guest.fullName,
          phone: a.guest.phoneNumber ?? a.guest.phone ?? '',
          photoUrl: a.guest.photoUrl,
          checkInDate: a.guest.checkInDate ?? undefined,
          room: a.guest.room
            ? {
                roomNumber: a.guest.room.roomNumber,
                hotel: a.guest.hotel ?? a.guest.room?.hotel ?? undefined,
              }
            : a.guest.hotel
            ? { roomNumber: '', hotel: a.guest.hotel }
            : undefined,
        }
      : undefined,
    criminal: a.criminal
      ? {
          fullName: a.criminal.fullName,
          aliases: a.criminal.aliases ?? [],
          crimeTypes: a.criminal.crimeTypes ?? (a.criminal.crimeType ? [a.criminal.crimeType] : []),
          threatLevel: a.criminal.threatLevel,
          caseStatus: a.criminal.caseStatus,
          photoUrl: a.criminal.photoUrl,
        }
      : undefined,
  };
}

export const getAlerts = async (params?: AlertListParams) => {
  const res = await client.get<{
    data: { alerts: any[]; pagination: { total: number; page: number; limit: number } };
  }>('/verification/alerts', { params });
  return {
    alerts: res.data.data.alerts.map(mapAlert),
    total: res.data.data.pagination?.total ?? 0,
  };
};

export const getAlert = async (id: string): Promise<MatchAlert> => {
  const res = await client.get<{ data: any }>(`/verification/alerts/${id}`);
  return mapAlert(res.data.data);
};

export const reviewAlert = async (
  id: string,
  data: ReviewAlertRequest
): Promise<MatchAlert> => {
  const res = await client.patch<{ data: any }>(`/verification/alerts/${id}/review`, {
    status: data.decision,
    notes: data.reviewNotes,
  });
  return mapAlert(res.data.data);
};

export const bulkUploadCriminals = async (
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; failed: number; errors: Array<{ row: number; name?: string; error: string }> }> => {
  const res = await client.post<{ data: { inserted: number; failed: number; errors: Array<{ row: number; name?: string; error: string }> } }>(
    '/criminals/bulk-upload',
    rows
  );
  return res.data.data;
};

export const runVerification = async (): Promise<{ jobId: string; status: string }> => {
  const res = await client.post<{ data: { jobId: string; status: string } }>(
    '/verification/run'
  );
  return res.data.data;
};

// ── Dashboard Stats ──────────────────────────────────────────────────────────
export const getDashboardStats = async () => {
  const res = await client.get<{ data: any }>('/dashboard/stats');
  return res.data.data;
};

export const getHotelStatus = async (params?: { search?: string }) => {
  const res = await client.get<{ data: { hotels: any[]; total: number } }>('/dashboard/hotels', { params });
  return res.data.data;
};

// ── Hotel Guest Surveillance (police read-only) ───────────────────────────────

export const getPoliceHotelGuests = async (
  hotelId: string,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
    activeOnly?: boolean;
    guestType?: 'DOMESTIC' | 'INTERNATIONAL';
    sortBy?: 'checkInDate' | 'checkOutDate' | 'name' | 'room';
    sortOrder?: 'asc' | 'desc';
  }
) => {
  const res = await client.get<{ data: any }>(`/police/hotels/${hotelId}/guests`, { params });
  return res.data.data as {
    hotel: any;
    guests: any[];
    pagination: { total: number; page: number; limit: number; pages: number };
  };
};

export const getPoliceHotelGuest = async (hotelId: string, guestId: string) => {
  const res = await client.get<{ data: any }>(`/police/hotels/${hotelId}/guests/${guestId}`);
  return res.data.data as { hotel: any; guest: any };
};

// ── V2: Station Contacts ──────────────────────────────────────────────────────
export const updateStationContacts = async (
  stationId: string,
  data: StationContactsRequest
): Promise<void> => {
  await client.patch(`/police/stations/${stationId}/contacts`, data);
};
