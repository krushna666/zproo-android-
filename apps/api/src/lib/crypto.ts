import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/*
 * Encryption of personal documents at rest (passport numbers and expiry dates): AES-256-GCM with
 * a random 96-bit IV per value. Stored as `v1.<iv>.<tag>.<ciphertext>` (base64url), so a key
 * rotation can introduce v2 without touching old rows.
 */

const VERSION = 'v1';

export function encryptField(plaintext: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Throws if the value was tampered with or encrypted under another key. */
export function decryptField(stored: string, key: Buffer): string {
  const [version, iv, tag, data] = stored.split('.');
  if (version !== VERSION || !iv || !tag || data === undefined)
    throw new Error('Unknown ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** HMAC-SHA256 signer for opaque ids (flight offers): first 16 hex characters. */
export function hmacSigner(secret: string, purpose: string) {
  const key = createHmac('sha256', secret).update(purpose).digest();
  return (payload: string) => createHmac('sha256', key).update(payload).digest('hex').slice(0, 16);
}
