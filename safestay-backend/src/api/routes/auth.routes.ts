import { Router } from 'express';
import {
  hotelLogin,
  policeLogin,
  hotelRefresh,
  policeRefresh,
  hotelLogout,
  policeLogout,
} from '../controllers/auth.controller';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Stricter rate limit on login endpoints — mitigates brute force (H3)
router.post('/hotel/login', authRateLimiter, hotelLogin);
router.post('/police/login', authRateLimiter, policeLogin);

// Refresh — rotates the refresh token so the old one becomes a replay probe
// instead of a valid re-entry. Rate limited identically to login.
router.post('/hotel/refresh', authRateLimiter, hotelRefresh);
router.post('/police/refresh', authRateLimiter, policeRefresh);

// Logout — revokes the presented refresh token and, if a bearer access token
// is on the Authorization header, pushes its jti to the Redis blocklist.
router.post('/hotel/logout', hotelLogout);
router.post('/police/logout', policeLogout);

export default router;
