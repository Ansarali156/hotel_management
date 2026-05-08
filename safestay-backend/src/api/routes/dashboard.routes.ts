import { Router } from 'express';
import { getDashboardStats, getHotelStatus } from '../controllers/dashboard.controller';
import { requirePoliceAuth } from '../middleware/requireAuth';

const router = Router();

// Dashboard exposes operational metrics + hotel occupancy — police-only.
router.get('/stats', requirePoliceAuth, getDashboardStats);
router.get('/hotels', requirePoliceAuth, getHotelStatus);

export default router;
