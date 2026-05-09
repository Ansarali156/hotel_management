import client, { clearAuthSession } from '../../../shared/api/client';
import type {
  Room,
  RoomWithGuest,
  Guest,
  CheckInRequest,
} from '../../../shared/types/hotel.types';

// Read hotelId from sessionStorage (set at login)
const getHotelId = () => sessionStorage.getItem('hotel_id') ?? '';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginHotel = async (
  email: string,
  password: string
): Promise<{
  token: string;
  refreshToken?: string;
  hotelId: string;
  hotelName: string;
}> => {
  // The backend returns both the modern {accessToken, refreshToken, hotel{...}}
  // shape and the legacy {token, hotelId, hotelName} fields. We read the
  // modern fields when present so the silent-refresh interceptor has a
  // refresh token to rotate, and fall back to the legacy fields otherwise.
  const res = await client.post<{
    data: {
      accessToken?: string;
      refreshToken?: string;
      hotel?: { id: string; name: string };
      token?: string;
      hotelId?: string;
      hotelName?: string;
    };
  }>('/auth/hotel/login', { email, password });

  const payload = res.data.data;
  return {
    token: payload.accessToken ?? payload.token ?? '',
    refreshToken: payload.refreshToken,
    hotelId: payload.hotel?.id ?? payload.hotelId ?? '',
    hotelName: payload.hotel?.name ?? payload.hotelName ?? '',
  };
};

/** POST /auth/hotel/logout — revokes the refresh token server-side. */
export const logoutHotel = async (refreshToken?: string | null): Promise<void> => {
  try {
    await client.post('/auth/hotel/logout', refreshToken ? { refreshToken } : {});
  } catch {
    /* Server-side revocation is best-effort — local cleanup still runs. */
  }
};

// ── Rooms ─────────────────────────────────────────────────────────────────────
// Server uses backend field names (phoneNumber, checkInDate); UI types use
// phone + arrivalDate. Normalise at the edge so components stay simple.
const normaliseGuest = (g: any) => {
  if (!g) return null;
  return {
    ...g,
    phone: g.phone ?? g.phoneNumber ?? '',
    arrivalDate: g.arrivalDate ?? g.checkInDate ?? '',
  };
};

export const getRooms = async (): Promise<Room[]> => {
  const hotelId = getHotelId();
  const res = await client.get<{ data: Record<string, any[]> }>('/rooms/grid', { params: { hotelId } });
  return Object.values(res.data.data)
    .flat()
    .map((r) => ({ ...r, currentGuest: normaliseGuest(r.guests?.[0] ?? null) }));
};

export const getRoom = async (id: string): Promise<RoomWithGuest> => {
  const hotelId = getHotelId();
  const res = await client.get<{ data: any }>(`/rooms/${id}`, { params: { hotelId } });
  const r = res.data.data;
  const activeGuest = normaliseGuest(r.guests?.[0] ?? null);
  return { ...r, guest: activeGuest, currentGuest: activeGuest };
};

export const addRoom = async (data: { floor: number; roomNumber: string; category: string }): Promise<Room> => {
  const hotelId = getHotelId();
  const res = await client.post<{ data: Room }>(`/rooms?hotelId=${hotelId}`, data);
  return res.data.data;
};

export const deleteRoom = async (roomId: string): Promise<void> => {
  const hotelId = getHotelId();
  await client.delete(`/rooms/${roomId}?hotelId=${hotelId}`);
};

export const updateRoomStatus = async (roomId: string, status: 'AVAILABLE' | 'MAINTENANCE'): Promise<Room> => {
  const hotelId = getHotelId();
  const res = await client.patch<{ data: Room }>(`/rooms/${roomId}/status?hotelId=${hotelId}`, { status });
  return res.data.data;
};

// ── Guests ────────────────────────────────────────────────────────────────────
export const checkInGuest = async (
  data: CheckInRequest & { idPhotoFile?: File; guestPhotoFile?: File }
): Promise<{ guestId: string }> => {
  const hotelId = getHotelId();
  const { idPhotoFile, guestPhotoFile, foreignDetails, ...rest } = data;

  const form = new FormData();
  form.append('fullName', rest.fullName);
  form.append('age', String(rest.age));
  form.append('gender', rest.gender);
  form.append('phoneNumber', rest.phone);
  form.append('roomNumber', rest.roomNumber);
  form.append('checkInDate', rest.checkInDate
    ? new Date(rest.checkInDate).toISOString()
    : new Date().toISOString());
  if (rest.expectedCheckout)
    form.append('expectedCheckout', new Date(rest.expectedCheckout).toISOString());
  if (rest.email) form.append('email', rest.email);
  if (rest.address) form.append('address', rest.address);
  if (rest.aadhaarNumber) form.append('aadhaarNumber', rest.aadhaarNumber);
  if (rest.passportNumber) form.append('passportNumber', rest.passportNumber);
  if (rest.voterId) form.append('voterId', rest.voterId);
  if (rest.drivingLicense) form.append('drivingLicense', rest.drivingLicense);
  form.append('guestType', rest.nationality === 'FOREIGN' ? 'INTERNATIONAL' : 'DOMESTIC');

  if (rest.nationality === 'FOREIGN' && foreignDetails) {
    if (foreignDetails.passportNationality) form.append('passportNationality', foreignDetails.passportNationality);
    if (foreignDetails.passportPlaceOfIssue) form.append('passportPlaceOfIssue', foreignDetails.passportPlaceOfIssue);
    if (foreignDetails.passportDateOfIssue) form.append('passportDateOfIssue', foreignDetails.passportDateOfIssue);
    if (foreignDetails.passportExpiry) form.append('passportExpiry', foreignDetails.passportExpiry);
    if (foreignDetails.visaNumber) form.append('visaNumber', foreignDetails.visaNumber);
    if (foreignDetails.visaType) form.append('visaType', foreignDetails.visaType);
    if (foreignDetails.visaValidTill) form.append('visaValidTill', foreignDetails.visaValidTill);
  }

  if (guestPhotoFile) form.append('guestPhoto', guestPhotoFile);
  if (idPhotoFile) form.append('idDocument', idPhotoFile);

  const res = await client.post<{ data: { guestId: string } }>(`/guests/checkin?hotelId=${hotelId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

// ── Hotel Profile ─────────────────────────────────────────────────────────────
export const getHotelProfile = async (): Promise<any> => {
  const hotelId = getHotelId();
  const res = await client.get<{ data: any }>('/hotels/profile', { params: { hotelId } });
  return res.data.data;
};

export const updateHotelProfile = async (data: any): Promise<any> => {
  const hotelId = getHotelId();
  const res = await client.patch<{ data: any }>(`/hotels/profile?hotelId=${hotelId}`, data);
  return res.data.data;
};

export const checkOutGuest = async (guestId: string): Promise<void> => {
  const hotelId = getHotelId();
  await client.post(`/guests/checkout/${guestId}?hotelId=${hotelId}`);
};

export const getGuests = async (): Promise<Guest[]> => {
  const hotelId = getHotelId();
  const res = await client.get<{ data: { guests: any[]; pagination: any } }>('/guests/active', { params: { hotelId } });
  return res.data.data.guests.map((g) => ({
    id: g.id,
    fullName: g.fullName,
    age: g.age,
    gender: g.gender,
    phone: g.phoneNumber,
    email: g.email ?? undefined,
    idType: g.guestType === 'INTERNATIONAL' ? 'Passport' : 'ID Document',
    idNumber: '',
    address: g.address ?? '',
    arrivalDate: g.checkInDate,
    expectedCheckout: g.expectedCheckout ?? '',
    actualCheckout: g.checkOutDate ?? null,
    roomId: g.room?.roomNumber ?? g.roomId,
    hotelId: g.hotelId ?? '',
    nationality: g.guestType === 'INTERNATIONAL' ? 'FOREIGN' : ('INDIAN' as const),
    createdAt: g.checkInDate,
    formCPath: g.formCPath ?? undefined,
  }));
};

// ── Delete Hotel ──────────────────────────────────────────────────────────────
export const deleteHotel = async (): Promise<void> => {
  const hotelId = getHotelId();
  await client.delete('/hotels/account', { params: { hotelId } });
  clearAuthSession();
};

// ── Hotel Registration ─────────────────────────────────────────────────────────
export const hotelRegister = async (data: {
  hotelName: string;
  email: string;
  password: string;
  totalFloors: number;
  rooms: { floor: number; roomNumber: string; category: string }[];
  contactNumber?: string;
  address?: string;
  licenseNumber?: string;
  maxGuestsPerRoom?: number;
}): Promise<{ hotelId: string }> => {
  const res = await client.post<{ data: { hotelId: string } }>('/hotels/register', data);
  return res.data.data;
};

// ── V2: Export ─────────────────────────────────────────────────────────────────
export const exportGuestCSV = async (): Promise<void> => {
  const hotelId = getHotelId();
  const res = await client.get('/guests/export/csv', { params: { hotelId }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guests_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportGuestPDF = async (): Promise<void> => {
  const hotelId = getHotelId();
  const res = await client.get('/guests/export/pdf', { params: { hotelId }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guests_${new Date().toISOString().split('T')[0]}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── V2: OCR Aadhaar ───────────────────────────────────────────────────────────
export interface OcrResult {
  aadhaarNumber?: string;
  fullName?: string;
  name?: string;
  dob?: string;
  dateOfBirth?: string;
  age?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  address?: string;
  phoneNumber?: string;
  confidence: number;
}

export const ocrAadhaar = async (file: File): Promise<OcrResult> => {
  const form = new FormData();
  form.append('idImage', file);
  const res = await client.post<{ data: OcrResult }>('/guests/ocr-aadhaar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

// ── V2: OCR Passport + Visa ──────────────────────────────────────────────────
export interface PassportVisaOcrResult {
  fullName?: string;
  passportNumber?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  placeOfIssue?: string;
  dateOfIssue?: string;
  dateOfExpiry?: string;
  visaNumber?: string;
  visaType?: string;
  visaValidFrom?: string;
  visaValidTill?: string;
  confidence: number;
}

export const ocrPassportVisa = async (passportFile: File, visaFile?: File): Promise<PassportVisaOcrResult> => {
  const form = new FormData();
  form.append('passportImage', passportFile);
  if (visaFile) form.append('visaImage', visaFile);
  const res = await client.post<{ data: PassportVisaOcrResult }>('/guests/ocr-passport-visa', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

// ── V2: OTA Parser ────────────────────────────────────────────────────────────
export interface OtaParseResult {
  guestName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  roomType?: string;
  platform?: string;
  confidence: number;
}

export const parseOtaBooking = async (rawText: string): Promise<OtaParseResult> => {
  const res = await client.post<{ data: OtaParseResult }>('/guests/parse-ota', { rawText });
  return res.data.data;
};

// ── V2: Form C ────────────────────────────────────────────────────────────────
export const downloadFormC = async (guestId: string): Promise<void> => {
  const hotelId = getHotelId();
  const res = await client.get(`/guests/form-c/${guestId}`, { params: { hotelId }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `form_c_${guestId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Register Scan ─────────────────────────────────────────────────────────────
export const scanRegister = async (
  imageFile: File
): Promise<{ guests: any[]; count: number }> => {
  const form = new FormData();
  form.append('registerImage', imageFile);
  const res = await client.post<{ data: { guests: any[]; count: number } }>(
    '/guests/scan-register',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data.data;
};

export const bulkCheckIn = async (
  guests: object[]
): Promise<{ results: any[]; successCount: number; failCount: number }> => {
  const hotelId = getHotelId();
  const res = await client.post<{ data: { results: any[]; successCount: number; failCount: number } }>(
    `/guests/bulk-checkin?hotelId=${hotelId}`,
    { guests }
  );
  return res.data.data;
};
