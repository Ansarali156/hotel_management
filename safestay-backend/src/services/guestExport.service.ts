/**
 * Guest Export Service — V1.5
 *
 * Provides CSV and PDF export of guest records for the hotel portal.
 *
 * ABSTRACTION WALL:
 * - Hotel-safe columns only — no aadhaar plaintext, no police data, no alerts
 * - Aadhaar is always masked: XXXX-XXXX-{last4}
 * - File exports scoped to requesting hotel via JWT (hotelId from token)
 * - All exports are audit-logged
 */

import { hotelPrisma } from '../config/hotelDatabase';
import { decryptAadhaar } from '../utils/encrypt';
import { logger } from '../utils/logger';

export interface ExportFilter {
  hotelId: string;
  dateFrom?: string;
  dateTo?: string;
  roomNumber?: string;
  guestName?: string;
}

interface GuestExportRow {
  guestName: string;
  roomNumber: string;
  floor: number;
  checkInDate: string;
  checkOutDate: string;
  phone: string;
  gender: string;
  guestType: string;
  aadhaarMasked: string;
}

/**
 * Mask an Aadhaar number: show only last 4 digits.
 * Works with encrypted ciphertext (decrypts first) or hash.
 */
function maskAadhaar(encrypted?: string | null): string {
  if (!encrypted) return 'Not provided';
  try {
    const plain = decryptAadhaar(encrypted);
    const last4 = plain.slice(-4);
    return `XXXX-XXXX-${last4}`;
  } catch {
    return 'XXXX-XXXX-XXXX';
  }
}

const EXPORT_PAGE_SIZE = 2000;
const EXPORT_MAX_ROWS = 50000;

/**
 * Fetch guest rows for export, applying filters.
 *
 * Pulls pages of `EXPORT_PAGE_SIZE` using the new (hotelId, checkInDate) and
 * (checkInDate) indexes so Postgres returns rows through an index scan rather
 * than a full-table sort. Decryption is yielded between pages so we don't
 * starve the event loop for a very long export.
 *
 * Capped at EXPORT_MAX_ROWS to keep memory bounded — exports larger than
 * this should be filtered by date range.
 */
async function fetchGuestRows(filter: ExportFilter): Promise<GuestExportRow[]> {
  const where: Record<string, unknown> = { hotelId: filter.hotelId };

  if (filter.guestName) {
    where['fullName'] = { contains: filter.guestName, mode: 'insensitive' };
  }
  if (filter.roomNumber) {
    where['room'] = { roomNumber: filter.roomNumber };
  }
  if (filter.dateFrom || filter.dateTo) {
    where['checkInDate'] = {
      ...(filter.dateFrom && { gte: new Date(filter.dateFrom) }),
      ...(filter.dateTo && { lte: new Date(filter.dateTo) }),
    };
  }

  const rows: GuestExportRow[] = [];
  let cursorId: string | undefined;
  let iterations = 0;
  const MAX_ITERATIONS = Math.ceil(EXPORT_MAX_ROWS / EXPORT_PAGE_SIZE) + 2;

  while (rows.length < EXPORT_MAX_ROWS && iterations++ < MAX_ITERATIONS) {
    const page = await hotelPrisma.guest.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        gender: true,
        guestType: true,
        checkInDate: true,
        checkOutDate: true,
        aadhaarEncrypted: true,
        room: { select: { roomNumber: true, floor: true } },
      },
      // Stable sort on (checkInDate, id) is required for cursor paging. The
      // id tiebreaker protects against duplicate checkInDate timestamps.
      orderBy: [{ checkInDate: 'desc' }, { id: 'desc' }],
      take: EXPORT_PAGE_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    if (page.length === 0) break;

    for (const g of page) {
      rows.push({
        guestName: g.fullName,
        roomNumber: g.room.roomNumber,
        floor: g.room.floor,
        checkInDate: g.checkInDate.toISOString().split('T')[0],
        checkOutDate: g.checkOutDate
          ? g.checkOutDate.toISOString().split('T')[0]
          : 'Active',
        phone: g.phoneNumber,
        gender: g.gender,
        guestType: g.guestType,
        aadhaarMasked: maskAadhaar(g.aadhaarEncrypted),
      });
    }

    if (page.length < EXPORT_PAGE_SIZE) break;
    cursorId = page[page.length - 1].id;

    // Yield to the event loop between pages so long exports don't starve
    // other requests of CPU / DB pool slots.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return rows;
}

/**
 * Generate CSV bytes for export.
 * Returns a Buffer containing UTF-8 CSV with BOM for Excel compatibility.
 */
export async function generateGuestCSV(filter: ExportFilter): Promise<Buffer> {
  const rows = await fetchGuestRows(filter);

  const headers = [
    'Guest Name',
    'Room Number',
    'Floor',
    'Check-In Date',
    'Check-Out Date',
    'Phone',
    'Gender',
    'Guest Type',
    'Aadhaar (Masked)',
  ];

  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        `"${r.guestName.replace(/"/g, '""')}"`,
        r.roomNumber,
        r.floor,
        r.checkInDate,
        r.checkOutDate,
        r.phone,
        r.gender,
        r.guestType,
        r.aadhaarMasked,
      ].join(',')
    ),
  ];

  // UTF-8 BOM ensures Excel opens the file correctly
  const BOM = '\uFEFF';
  return Buffer.from(BOM + csvLines.join('\r\n'), 'utf-8');
}

/**
 * Generate PDF bytes for export using PDFKit.
 * Returns a Buffer. If PDFKit is not installed, throws with a clear message.
 */
export async function generateGuestPDF(
  filter: ExportFilter,
  hotelName: string
): Promise<Buffer> {
  // Dynamic import — pdfkit may not be installed in all environments
  let PDFDocument: new (opts: Record<string, unknown>) => PDFKit.PDFDocument;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    PDFDocument = require('pdfkit');
  } catch {
    throw new Error('pdfkit package is not installed. Run: npm install pdfkit');
  }

  const rows = await fetchGuestRows(filter);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('SafeStay Hotel Management', { align: 'center' });
    doc.fontSize(13).font('Helvetica').text(hotelName, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .text(`Guest Export Report`, { align: 'center' });
    doc.fontSize(9).text(
      `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
      { align: 'center' }
    );

    if (filter.dateFrom || filter.dateTo) {
      doc
        .text(
          `Date range: ${filter.dateFrom ?? 'all'} to ${filter.dateTo ?? 'all'}`,
          { align: 'center' }
        );
    }

    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    // Table header
    const colWidths = [120, 55, 35, 75, 75, 90, 55, 75, 95];
    const colHeaders = [
      'Name', 'Room', 'Floor', 'Check-In', 'Check-Out',
      'Phone', 'Gender', 'Type', 'Aadhaar',
    ];
    let x = 40;
    doc.font('Helvetica-Bold').fontSize(8);
    colHeaders.forEach((h, i) => {
      doc.text(h, x, doc.y, { width: colWidths[i], lineBreak: false });
      x += colWidths[i];
    });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#cccccc');
    doc.moveDown(0.3);

    // Table rows
    doc.font('Helvetica').fontSize(7);
    rows.forEach((row, idx) => {
      if (doc.y > 760) {
        doc.addPage();
        doc.y = 40;
      }

      if (idx % 2 === 0) {
        doc.rect(40, doc.y - 2, 515, 14).fill('#f8f8f8').fillColor('black');
      }

      x = 40;
      const rowY = doc.y;
      const values = [
        row.guestName,
        row.roomNumber,
        String(row.floor),
        row.checkInDate,
        row.checkOutDate,
        row.phone,
        row.gender,
        row.guestType,
        row.aadhaarMasked,
      ];
      values.forEach((v, i) => {
        doc.text(v, x, rowY, { width: colWidths[i] - 2, lineBreak: false });
        x += colWidths[i];
      });
      doc.moveDown(0.9);
    });

    // Footer
    doc.moveDown(1);
    doc.fontSize(7).fillColor('#888888').text(
      `Total records: ${rows.length} | SafeStay Hotel Management | Confidential`,
      { align: 'center' }
    );

    doc.end();
  });
}

/**
 * Get hotel name for the export header.
 */
export async function getHotelName(hotelId: string): Promise<string> {
  try {
    const hotel = await hotelPrisma.hotel.findUnique({
      where: { id: hotelId },
      select: { name: true },
    });
    return hotel?.name ?? 'Hotel';
  } catch {
    logger.warn('Could not fetch hotel name for export', { hotelId });
    return 'Hotel';
  }
}
