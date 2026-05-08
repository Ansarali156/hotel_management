import { Router } from 'express';
import {
  registerHotel,
  verifyHotelEmail,
  resendHotelOtp,
  getHotelProfile,
  updateHotelProfile,
  listAllHotels,
  deleteHotelAccount,
} from '../controllers/hotel.controller';
import { requireHotelAuth, requirePoliceAuth } from '../middleware/requireAuth';

const router = Router();

// ── Registration / verification — public ──────────────────────────────────────
router.post('/register', registerHotel);
router.post('/verify-email', verifyHotelEmail);
router.post('/resend-otp', resendHotelOtp);

// ── Admin listing (read, demo-open) ───────────────────────────────────────────
// Police-only — exposes hotel email, phone, licence number, address.
router.get('/list', requirePoliceAuth, listAllHotels);

// ── Hotel profile — tied to the authenticated hotel via req.user.hotelId ──────
router.get('/profile', requireHotelAuth, getHotelProfile);
router.put('/profile', requireHotelAuth, updateHotelProfile);
router.delete('/account', requireHotelAuth, deleteHotelAccount);

export default router;
