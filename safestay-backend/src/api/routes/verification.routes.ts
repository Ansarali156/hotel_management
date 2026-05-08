import { Router } from 'express';
import {
  triggerManualVerification,
  getMatchAlert,
  getMatchAlerts,
  reviewMatchAlert,
} from '../controllers/verification.controller';
import { requirePoliceAuth, requireMinRank } from '../middleware/requireAuth';

const router = Router();

// Every alert endpoint is police-only. MatchAlerts expose criminal PII and
// live guest PII (hotel, room, phone, check-in time); leaving the reads open
// let anyone on the internet enumerate every alert in the database.
//
// Rank gates:
//   - run  : rank <=12 (Head Constable or senior) — initiates expensive
//            full-jurisdiction re-verification
//   - review: rank <=10 (SI or senior) — closes out alerts (HIGH trust)
router.post('/run', requirePoliceAuth, requireMinRank(12), triggerManualVerification);
router.patch('/alerts/:alertId/review', requirePoliceAuth, requireMinRank(10), reviewMatchAlert);
router.get('/alerts', requirePoliceAuth, getMatchAlerts);
router.get('/alerts/:alertId', requirePoliceAuth, getMatchAlert);

export default router;
