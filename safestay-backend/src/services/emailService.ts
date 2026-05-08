/**
 * Email Service — Resend (HTTP API) primary, Gmail SMTP fallback for local dev
 *
 * Render free tier blocks outbound SMTP (ports 465/587), so nodemailer/Gmail
 * cannot be used in production. Resend sends over HTTPS and works everywhere.
 *
 * Set RESEND_API_KEY in Render env vars to enable email delivery.
 * GMAIL_USER + GMAIL_APP_PASSWORD are kept for local development only.
 */

import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ── Transport selection ───────────────────────────────────────────────────────

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  return new Resend(env.RESEND_API_KEY);
}

function getSmtpTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });
}

const FROM_ADDRESS = 'SafeStay Network <onboarding@resend.dev>';

// ── OTP Email ─────────────────────────────────────────────────────────────────

export async function sendOtpEmail(to: string, otp: string, hotelName: string): Promise<boolean> {
  const html = buildOtpEmailHTML(hotelName, otp);
  const subject = `SafeStay — Your Verification Code: ${otp}`;
  return sendEmail({ to, subject, html });
}

// ── Police OTP Email ──────────────────────────────────────────────────────────

export async function sendPoliceOtpEmail(to: string, otp: string, officerName: string): Promise<boolean> {
  const subject = `SafeStay Police Portal — Verification Code: ${otp}`;
  const html = buildPoliceOtpEmailHTML(officerName, otp);
  return sendEmail({ to, subject, html });
}

// ── Core send function ────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
  const resend = getResend();

  if (resend) {
    // Production path: Resend HTTP API (works on Render)
    try {
      const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      });
      if (error) {
        logger.error('[EmailService] Resend error', { to, error: error.message });
        return false;
      }
      logger.info('[EmailService] Email sent via Resend', { to });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[EmailService] Resend exception', { to, error: msg });
      return false;
    }
  }

  // Local dev fallback: Gmail SMTP
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    logger.warn('[EmailService] No email transport configured (set RESEND_API_KEY)', { to });
    return false;
  }
  try {
    const transporter = getSmtpTransporter();
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    logger.info('[EmailService] Email sent via Gmail SMTP', { to });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[EmailService] Gmail SMTP failed', { to, error: msg });
    return false;
  }
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function buildOtpEmailHTML(hotelName: string, otp: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
  <div style="max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #1B5E20; padding: 28px 32px;">
      <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 700;">SafeStay Network</h1>
    </div>
    <div style="padding: 36px 32px;">
      <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1a1a; font-weight: 700;">Verify your email</h2>
      <p style="margin: 0 0 28px; color: #666; font-size: 15px; line-height: 1.5;">
        Hi! You're registering <strong>${hotelName}</strong> on SafeStay.<br>
        Use the code below to verify your email address.
      </p>
      <div style="background: #F1F8E9; border: 2px solid #AED581; border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 28px;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #558B2F; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;">Your verification code</p>
        <p style="margin: 0; font-size: 48px; font-weight: 900; letter-spacing: 12px; color: #1B5E20; font-family: 'Courier New', monospace;">${otp}</p>
      </div>
      <div style="background: #FFF9C4; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: #F57F17;">
          This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
        </p>
      </div>
      <p style="margin: 0; font-size: 13px; color: #999; line-height: 1.5;">
        If you didn't register a hotel on SafeStay, you can safely ignore this email.
      </p>
    </div>
    <div style="background: #f9f9f9; padding: 20px 32px; border-top: 1px solid #eee;">
      <p style="margin: 0; font-size: 11px; color: #bbb; text-align: center;">
        SafeStay Network · Hotel Management Platform · This is an automated message
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

function buildPoliceOtpEmailHTML(officerName: string, otp: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
  <div style="max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #1B4332; padding: 28px 32px;">
      <h1 style="margin: 0; color: white; font-size: 18px; font-weight: 700;">SafeStay Intelligence Portal</h1>
      <p style="margin: 4px 0 0; color: rgba(255,255,255,0.7); font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Law Enforcement Division</p>
    </div>
    <div style="padding: 36px 32px;">
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #1a1a1a; font-weight: 700;">Email Verification</h2>
      <p style="margin: 0 0 24px; color: #666; font-size: 14px; line-height: 1.6;">
        Hello <strong>${officerName}</strong>,<br>
        Use this code to verify your email and complete your officer registration.
      </p>
      <div style="background: #F0FDF4; border: 2px solid #86EFAC; border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; font-size: 11px; color: #15803D; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;">Verification Code</p>
        <p style="margin: 0; font-size: 44px; font-weight: 900; letter-spacing: 14px; color: #1B4332; font-family: 'Courier New', monospace;">${otp}</p>
      </div>
      <div style="background: #FEF9C3; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 12px; color: #854D0E;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      </div>
      <p style="margin: 0; font-size: 12px; color: #999; line-height: 1.5;">
        If you did not initiate this registration, please ignore this email.
        This system is for authorized law enforcement personnel only.
      </p>
    </div>
    <div style="background: #f9f9f9; padding: 16px 32px; border-top: 1px solid #eee;">
      <p style="margin: 0; font-size: 11px; color: #bbb; text-align: center;">
        SafeStay Network · Intelligence Division · Confidential
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

// ── Alert Email ───────────────────────────────────────────────────────────────

export interface AlertEmailOptions {
  to: string[];
  refId: string;
  matchScore: number;
  threatLevel: string;
  hotelName: string;
  hotelLocation?: string;
  checkInDate: string;
  triggeredBy: string;
  policePortalAlertUrl: string;
}

export interface EmailResult {
  success: boolean;
  messageIds?: string[];
  error?: string;
}

export async function sendAlertEmail(options: AlertEmailOptions): Promise<EmailResult> {
  const scorePercent = Math.round(options.matchScore * 100);
  const html = buildAlertEmailHTML({ ...options, scorePercent });
  const subject = `SafeStay Priority Alert — REF:${options.refId.slice(-8).toUpperCase()}`;

  const results: string[] = [];
  const errors: string[] = [];

  for (const recipient of options.to) {
    const ok = await sendEmail({ to: recipient, subject, html });
    if (ok) {
      results.push('sent');
      logger.info('[EmailService] Alert email sent', { to: recipient, refId: options.refId });
    } else {
      errors.push(`failed:${recipient}`);
    }
  }

  return {
    success: errors.length === 0,
    messageIds: results,
    error: errors.length ? errors.join('; ') : undefined,
  };
}

function buildAlertEmailHTML(opts: AlertEmailOptions & { scorePercent: number }): string {
  const threatColor =
    opts.threatLevel === 'CRITICAL' ? '#d32f2f' :
    opts.threatLevel === 'HIGH' ? '#f57c00' : '#388e3c';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: auto; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
    <div style="background: #1a237e; color: white; padding: 24px 32px;">
      <h2 style="margin: 0; font-size: 20px;">SafeStay Network — Priority Alert</h2>
      <p style="margin: 8px 0 0; opacity: 0.8; font-size: 14px;">REF: ${opts.refId.slice(-8).toUpperCase()}</p>
    </div>
    <div style="padding: 32px;">
      <div style="background: #fff3e0; border-left: 4px solid ${threatColor}; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 18px; font-weight: bold; color: ${threatColor};">Threat Level: ${opts.threatLevel}</p>
        <p style="margin: 8px 0 0; color: #555;">Match Confidence: <strong>${opts.scorePercent}%</strong></p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #888; width: 40%;">Hotel</td><td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: 500;">${opts.hotelName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #888;">Check-In Date</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${opts.checkInDate}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #888;">Triggered By</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${opts.triggeredBy}</td></tr>
      </table>
      <div style="margin-top: 32px; text-align: center;">
        <a href="${opts.policePortalAlertUrl}" style="background: #1a237e; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">View Full Alert Details</a>
        <p style="margin-top: 12px; font-size: 12px; color: #888;">Requires authenticated police portal access</p>
      </div>
    </div>
    <div style="background: #f5f5f5; padding: 16px 32px; border-top: 1px solid #eee;">
      <p style="margin: 0; font-size: 11px; color: #aaa; text-align: center;">SafeStay Network — Confidential Law Enforcement Communication</p>
    </div>
  </div>
</body>
</html>`.trim();
}
