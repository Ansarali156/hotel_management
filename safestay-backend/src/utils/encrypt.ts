/**
 * AES-256-GCM encryption for Aadhaar numbers.
 *
 * Storage format:  iv:authTag:ciphertext   (all hex, colon-delimited)
 * Key source:      AADHAAR_ENCRYPTION_KEY  (must be 64 hex chars = 32 bytes)
 *
 * SECURITY CONTRACT:
 * - Plaintext MUST NEVER be logged or returned in API responses
 * - aadhaarEncrypted is stored in DB (reversible — police use only)
 * - aadhaarHash (SHA-256) is stored for match-scoring without decryption
 */

import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;    // 128-bit IV
const TAG_LENGTH = 16;   // 128-bit authentication tag

/**
 * Encrypts an Aadhaar number with AES-256-GCM.
 * Returns iv:authTag:ciphertext (hex).
 */
export const encryptAadhaar = (plaintext: string): string => {
  const key = Buffer.from(env.AADHAAR_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypts an AES-256-GCM encrypted Aadhaar number.
 * Throws if ciphertext is tampered (authentication failure).
 */
export const decryptAadhaar = (ciphertext: string): string => {
  const key = Buffer.from(env.AADHAAR_ENCRYPTION_KEY, 'hex');
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

/**
 * Returns the SHA-256 hex digest of the Aadhaar plaintext.
 * Used for match-scoring so the engine never needs to decrypt.
 */
export const hashAadhaar = (plaintext: string): string => {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
};
