/**
 * WhatsApp Alert Service — V2 Phase 1
 *
 * Sends high-priority match alerts via Twilio WhatsApp API.
 *
 * PRIVACY RULES:
 * - Message body is max 160 characters
 * - No guest name, Aadhaar, or criminal name in message body
 * - Only reference ID, score, and portal deep-link
 */

import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface WhatsAppAlertOptions {
  to: string[]; // E.164 format: +919999999999
  refId: string; // MatchAlert ID (short reference)
  matchScore: number;
  threatLevel: string;
  policePortalAlertUrl: string;
}

export interface WhatsAppResult {
  success: boolean;
  messageIds?: string[];
  error?: string;
}

export async function sendAlertWhatsApp(options: WhatsAppAlertOptions): Promise<WhatsAppResult> {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_WHATSAPP_FROM
  ) {
    logger.warn('[WhatsAppService] Twilio credentials not configured — skipping WhatsApp dispatch');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  let twilio: { (sid: string, token: string): { messages: { create: (opts: Record<string, string>) => Promise<{ sid: string }> } } };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    twilio = require('twilio');
  } catch {
    logger.warn('[WhatsAppService] twilio package not installed — skipping WhatsApp dispatch');
    return { success: false, error: 'twilio not installed' };
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  const scorePercent = Math.round(options.matchScore * 100);
  const refShort = options.refId.slice(-8).toUpperCase();

  // Message must be < 160 chars; no guest/criminal PII
  const message =
    `SAFESTAY ALERT [REF:${refShort}]: Priority match detected. ` +
    `Score: ${scorePercent}%. Threat: ${options.threatLevel}. ` +
    `Portal: ${options.policePortalAlertUrl}`;

  const results: string[] = [];
  const errors: string[] = [];

  for (const phone of options.to) {
    // Ensure E.164 format
    const to = phone.startsWith('+') ? `whatsapp:${phone}` : `whatsapp:+${phone}`;
    try {
      const msg = await client.messages.create({
        body: message,
        from: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
        to,
      });
      results.push(msg.sid);
      logger.info('[WhatsAppService] Alert sent', { to: phone, sid: msg.sid, refId: options.refId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(errMsg);
      logger.error('[WhatsAppService] Failed to send', { to: phone, error: errMsg });
    }
  }

  return {
    success: errors.length === 0,
    messageIds: results,
    error: errors.length ? errors.join('; ') : undefined,
  };
}
