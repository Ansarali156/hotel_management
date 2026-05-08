import { Router } from 'express';
import {
  createPoliceUser,
  listPoliceUsers,
  deactivatePoliceUser,
  updateStationContacts,
  getStationContacts,
  getPoliceHotelGuests,
  getPoliceHotelGuest,
} from '../controllers/police.controller';
import { requirePoliceAuth } from '../middleware/requireAuth';

const router = Router();

// Every police admin action must sit behind requirePoliceAuth.  Previously
// `POST /police/users` was open to the internet, which let anyone create a
// new police account and own the entire police portal.
router.post('/users', requirePoliceAuth, createPoliceUser);
router.get('/users', requirePoliceAuth, listPoliceUsers);
router.delete('/users/:id', requirePoliceAuth, deactivatePoliceUser);

// Station alert contacts — contain phone/email PII for on-call officers.
router.get('/stations/:stationId/contacts', requirePoliceAuth, getStationContacts);
router.patch('/stations/:stationId/contacts', requirePoliceAuth, updateStationContacts);

// Hotel guest surveillance (read-only). Frontend HotelDetail / GuestDetail
// pages depend on these. Note the order: more specific (:guestId) BEFORE
// the list route would matter only if the param shapes overlapped — Express
// parses both fine here, but we keep list first for readability.
router.get('/hotels/:hotelId/guests', requirePoliceAuth, getPoliceHotelGuests);
router.get('/hotels/:hotelId/guests/:guestId', requirePoliceAuth, getPoliceHotelGuest);

export default router;
