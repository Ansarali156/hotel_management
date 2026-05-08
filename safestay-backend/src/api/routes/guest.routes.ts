/**
 * Guest routes — hotel portal only.
 *
 * V1.5 additions: CSV and PDF export endpoints
 * V2 Phase 3 additions: Aadhaar OCR, OTA parser, Form C download
 */

import { Router } from 'express';
import multer from 'multer';
import { guestUpload } from '../../config/multer';
import {
  checkInGuest,
  checkOutGuest,
  getGuestLedger,
  getActiveGuests,
  exportGuestCSV,
  exportGuestPDF,
  ocrAadhaarCard,
  parseOtaBooking,
  downloadFormC,
  scanRegisterPage,
  bulkCheckIn,
} from '../controllers/guest.controller';
import { requireHotelAuth } from '../middleware/requireAuth';

const router = Router();

// ── Core V1 ───────────────────────────────────────────────────────────────────

// guestPhoto & idDocument fields are REQUIRED — validated in controller
router.post(
  '/checkin',
  requireHotelAuth,
  guestUpload.fields([
    { name: 'guestPhoto', maxCount: 1 },
    { name: 'idDocument', maxCount: 1 },
    { name: 'formC', maxCount: 1 }, // International only
  ]),
  checkInGuest
);

router.post('/checkout/:guestId', requireHotelAuth, checkOutGuest);

router.get('/ledger', requireHotelAuth, getGuestLedger);
router.get('/active', requireHotelAuth, getActiveGuests);

// ── V1.5: Exports ─────────────────────────────────────────────────────────────

router.get('/export/csv', requireHotelAuth, exportGuestCSV);
router.get('/export/pdf', requireHotelAuth, exportGuestPDF);

// ── V2 Phase 3: Aadhaar OCR ───────────────────────────────────────────────────

const ocrUpload = multer({
  dest: './uploads/ocr_tmp',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG/PNG/WEBP images are accepted for OCR'));
    }
  },
});

router.post('/ocr-aadhaar', requireHotelAuth, ocrUpload.single('idImage'), ocrAadhaarCard);

// ── V2 Phase 3: OTA Booking Parser ────────────────────────────────────────────

router.post('/parse-ota', requireHotelAuth, parseOtaBooking);

// ── V2 Phase 3: Form C Download ───────────────────────────────────────────────

router.get('/form-c/:guestId', requireHotelAuth, downloadFormC);

// ── Register Page Scan (Gemini Vision) ───────────────────────────────────────

const registerScanUpload = multer({
  dest: './uploads/register_scan_tmp',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG/PNG/WEBP images are accepted'));
    }
  },
});

router.post('/scan-register', requireHotelAuth, registerScanUpload.single('registerImage'), scanRegisterPage);

// ── Bulk Check-In (from scanned register) ────────────────────────────────────

router.post('/bulk-checkin', requireHotelAuth, bulkCheckIn);

export default router;
