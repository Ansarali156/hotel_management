export interface PoliceUser {
  id: string;
  badgeId: string;
  name: string;
  rank: string;
  rankLevel: number;
  jurisdictionPath: string;
  stationId: string;
}

export interface CriminalProfile {
  id: string;
  fullName: string;
  aliases?: string[];
  age?: number;
  gender?: string;
  description?: string;
  distinguishingMarks?: string;
  crimeTypes: string[];
  crimeDescription?: string;
  caseStatus: 'ABSCONDING' | 'IN_CUSTODY' | 'UNDER_INVESTIGATION' | 'PAROLE' | 'ARRESTED' | 'RELEASED' | 'WANTED';
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  firNumbers?: string;
  warrantNumber?: string;
  aadhaarNumber?: string;
  drivingLicense?: string;
  passport?: string;
  phone?: string;
  emailAddresses?: string;
  residentialAddress?: string;
  photoUrl?: string;
  stationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchAlert {
  id: string;
  guestId: string;
  criminalId: string;
  score: number;
  matchBreakdown: Record<string, number>;
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'DISMISSED';
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  dispatchStatus?: 'PENDING' | 'SENT' | 'FAILED';
  dispatchedAt?: string;
  dispatchError?: string;
  dispatchToStations?: string[];
  guest?: {
    fullName: string;
    phone: string;
    room?: { roomNumber: string; hotel?: { name: string } };
    photoUrl?: string;
    checkInDate?: string;
  };
  criminal?: {
    fullName: string;
    aliases?: string[];
    crimeTypes: string[];
    threatLevel: string;
    caseStatus: string;
    photoUrl?: string;
  };
}

export interface StationContactsRequest {
  alertEmailContacts: string[];
  alertWhatsappNumbers: string[];
  alertsEnabled: boolean;
}

export interface DashboardStats {
  activeHotels: number;
  totalGuests: number;
  totalCriminals: number;
  pendingAlerts: number;
  criticalAlerts: number;
  confirmedMatches: number;
}

export interface CriminalListParams {
  search?: string;
  threatLevel?: string;
  caseStatus?: string;
  page?: number;
  limit?: number;
}

export interface AlertListParams {
  status?: string;
  minScore?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCriminalRequest {
  fullName: string;
  aliases?: string[];
  age?: number;
  gender?: string;
  description?: string;
  distinguishingMarks?: string;
  crimeTypes: string[];
  crimeDescription?: string;
  caseStatus: string;
  threatLevel: string;
  firNumbers?: string;
  warrantNumber?: string;
  aadhaarNumber?: string;
  voterId?: string;
  drivingLicense?: string;
  passport?: string;
  phone?: string;
  emailAddresses?: string;
  residentialAddress?: string;
}

export interface ReviewAlertRequest {
  decision: 'CONFIRMED' | 'DISMISSED';
  reviewNotes: string;
}
