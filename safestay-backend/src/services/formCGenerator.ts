/**
 * FRRO Form C Generator — V2 Phase 3
 *
 * Automatically generates the mandatory FRRO Form C PDF for international guests.
 * Form C is required by the Foreigners Regional Registration Office (FRRO) for
 * all non-Indian nationals staying at hotels in India.
 *
 * Output: PDF buffer (generated with PDFKit) — caller saves to disk or returns.
 *
 * STEALTH: Generates hotel-safe documents only — no police data included.
 */

import * as path from 'path';
import { logger } from '../utils/logger';

export interface FormCData {
  guestFullName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth?: string; // YYYY-MM-DD
  gender: string;
  arrivalDate: string; // YYYY-MM-DD (check-in date)
  expectedDepartureDate?: string; // YYYY-MM-DD
  purposeOfVisit?: string;
  visaNumber?: string;
  visaValidUpto?: string; // YYYY-MM-DD
  placeOfIssue?: string;
  hotelName: string;
  hotelAddress?: string;
  hotelLicenseNumber?: string;
  roomNumber?: string;
}

export interface FormCResult {
  pdfBuffer: Buffer;
  filename: string;
}

/**
 * Generate FRRO Form C PDF for an international guest.
 */
export async function generateFormC(data: FormCData): Promise<FormCResult> {
  let PDFDocument: new (opts: Record<string, unknown>) => PDFKit.PDFDocument;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    PDFDocument = require('pdfkit');
  } catch {
    throw new Error('pdfkit package is not installed. Run: npm install pdfkit');
  }

  const pdfBuffer = await buildFormCPDF(PDFDocument, data);
  const safePassport = data.passportNumber.replace(/[^A-Z0-9]/gi, '').slice(0, 10);
  const filename = `FormC_${safePassport}_${Date.now()}.pdf`;

  logger.info('[FormCGenerator] Form C generated', {
    passport: data.passportNumber,
    guest: data.guestFullName,
    hotel: data.hotelName,
  });

  return { pdfBuffer, filename };
}

function buildFormCPDF(
  PDFDocument: new (opts: Record<string, unknown>) => PDFKit.PDFDocument,
  data: FormCData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = 595; // A4 points
    const contentWidth = pageWidth - 100; // 50pt margins each side

    // ── Title Block ──────────────────────────────────────────────────────────
    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Government of India', { align: 'center' });
    doc.moveDown(0.2);
    doc
      .fontSize(9)
      .text('Ministry of Home Affairs', { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('FORM C', { align: 'center' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        '(For foreigners — to be completed by the Hotel / Lodge)',
        { align: 'center' }
      );
    doc.moveDown(0.3);
    doc
      .fontSize(8)
      .fillColor('#555')
      .text(
        '[Under Rule 14 of the Registration of Foreigners Rules, 1992]',
        { align: 'center' }
      )
      .fillColor('black');

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(pageWidth - 50, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.6);

    // ── Helper functions ─────────────────────────────────────────────────────
    const field = (label: string, value: string | undefined) => {
      doc.font('Helvetica-Bold').fontSize(9).text(`${label}:`, { continued: true });
      doc.font('Helvetica').text(`  ${value ?? '_______________'}`, { lineGap: 4 });
    };

    const sectionHeader = (title: string) => {
      doc.moveDown(0.4);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1a237e')
        .text(title)
        .fillColor('black');
      doc.moveTo(50, doc.y).lineTo(pageWidth - 50, doc.y).lineWidth(0.5).stroke('#cccccc');
      doc.moveDown(0.4);
    };

    // ── Part A: Guest Identity ───────────────────────────────────────────────
    sectionHeader('Part A — Foreigner Particulars');

    field('Full Name', data.guestFullName.toUpperCase());
    field('Nationality', data.nationality);
    field('Date of Birth', data.dateOfBirth ? formatDate(data.dateOfBirth) : undefined);
    field('Gender', data.gender);
    field('Passport Number', data.passportNumber.toUpperCase());
    field('Place of Issue', data.placeOfIssue);

    // ── Part B: Visa / Entry Details ─────────────────────────────────────────
    sectionHeader('Part B — Visa & Entry Details');

    field('Visa Number', data.visaNumber);
    field('Visa Valid Upto', data.visaValidUpto ? formatDate(data.visaValidUpto) : undefined);
    field('Purpose of Visit', data.purposeOfVisit ?? 'Tourism');

    // ── Part C: Hotel Stay ───────────────────────────────────────────────────
    sectionHeader('Part C — Hotel / Lodge Details');

    field('Hotel / Lodge Name', data.hotelName);
    field('Hotel Address', data.hotelAddress);
    field('Hotel License No.', data.hotelLicenseNumber);
    field('Room Number', data.roomNumber);
    field('Date of Arrival (Check-In)', formatDate(data.arrivalDate));
    field('Expected Departure (Check-Out)',
      data.expectedDepartureDate ? formatDate(data.expectedDepartureDate) : undefined
    );

    // ── Signatures ───────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(pageWidth - 50, doc.y).lineWidth(0.5).stroke('#aaaaaa');
    doc.moveDown(0.6);

    // Two columns for signatures
    const sigColWidth = contentWidth / 2;
    const sigY = doc.y;

    doc.font('Helvetica').fontSize(9);
    doc.text('Signature of Foreign National', 50, sigY, {
      width: sigColWidth,
      align: 'left',
    });
    doc.text(
      `Signature / Stamp of Hotel Manager\n${data.hotelName}`,
      50 + sigColWidth,
      sigY,
      { width: sigColWidth, align: 'left' }
    );

    doc.moveDown(2.5);

    // Blank lines for signatures
    doc.moveTo(50, doc.y).lineTo(50 + sigColWidth - 20, doc.y).stroke('#555');
    doc.moveTo(50 + sigColWidth + 20, doc.y).lineTo(pageWidth - 50, doc.y).stroke('#555');

    doc.moveDown(0.3);
    doc.fontSize(7).fillColor('#888');
    doc.text('(Foreigner)', 50, doc.y, { width: sigColWidth, align: 'left' });
    doc.text('(Hotel Manager)', 50 + sigColWidth, doc.y - doc.currentLineHeight(), {
      width: sigColWidth,
      align: 'left',
    });
    doc.fillColor('black');

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveDown(2);
    doc
      .fontSize(7)
      .fillColor('#aaaaaa')
      .text(
        `Generated by SafeStay Hotel Management System | ${new Date().toLocaleDateString('en-IN')} | This document must be submitted to the local FRRO within 24 hours of guest arrival.`,
        { align: 'center' }
      );

    doc.end();
  });
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
