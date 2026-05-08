import { Router } from 'express';
import { getRoomGrid, updateRoomStatus, getRoomDetails } from '../controllers/room.controller';
import { requireHotelAuth } from '../middleware/requireAuth';

const router = Router();

router.get('/grid', requireHotelAuth, getRoomGrid);
router.get('/:roomId', requireHotelAuth, getRoomDetails);
router.patch('/:roomId/status', requireHotelAuth, updateRoomStatus);

export default router;
