export interface Hotel {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  licenseNumber?: string;
  totalFloors: number;
  roomsPerFloor: number;
  maxGuestsPerRoom?: number;
  categories: string[];
  roomCategories?: string[];
  contactNumber?: string;
  createdAt?: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  category: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'CHECKOUT';
  hotelId: string;
  currentGuest?: Guest | null;
}

export interface Guest {
  id: string;
  fullName: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone: string;
  email?: string;
  idType: string;
  idNumber: string;
  address: string;
  arrivalDate: string;
  expectedCheckout: string;
  actualCheckout?: string | null;
  roomId: string;
  hotelId: string;
  photoUrl?: string;
  idPhotoUrl?: string;
  nationality: 'INDIAN' | 'FOREIGN';
  createdAt: string;
  formCPath?: string;
  // Domestic fields
  fatherName?: string;
  panCard?: string;
  aadhaarNumber?: string;
  voterId?: string;
  drivingLicense?: string;
  // International fields
  passportNumber?: string;
  passportNationality?: string;
  passportPlaceOfIssue?: string;
  passportDateOfIssue?: string;
  passportExpiry?: string;
  visaNumber?: string;
  visaType?: string;
  visaValidTill?: string;
  guestType?: 'DOMESTIC' | 'INTERNATIONAL';
}

export interface RoomWithGuest extends Room {
  guest?: Guest | null;
}

export interface FloorGroup {
  floor: number;
  rooms: Room[];
}

export interface HotelStats {
  totalRooms: number;
  occupied: number;
  available: number;
  maintenance: number;
}

export interface RegisterRequest {
  hotelName: string;
  email: string;
  password: string;
  totalFloors: number;
  rooms: { floor: number; roomNumber: string; category: string }[];
  contactNumber?: string;
  address?: string;
  licenseNumber?: string;
  maxGuestsPerRoom?: number;
}

export interface ForeignGuestDetails {
  passportNationality?: string;
  passportPlaceOfIssue?: string;
  passportDateOfIssue?: string;
  passportExpiry?: string;
  visaNumber?: string;
  visaType?: string;
  visaValidTill?: string;
}

export interface CheckInRequest {
  roomNumber: string;
  fullName: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone: string;
  email?: string;
  idType: string;
  idNumber: string;
  address: string;
  checkInDate: string;
  expectedCheckout: string;
  aadhaarNumber?: string;
  passportNumber?: string;
  voterId?: string;
  drivingLicense?: string;
  nationality?: 'INDIAN' | 'FOREIGN';
  foreignDetails?: ForeignGuestDetails;
}
