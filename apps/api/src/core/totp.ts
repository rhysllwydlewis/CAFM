import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** TOTP (RFC 6238): six digits, 30-second steps, SHA-1, as every authenticator app expects. */
export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) throw new Error('Not a base32 string');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function stepAt(ms: number): number {
  return Math.floor(ms / 1000 / TOTP_STEP_SECONDS);
}

export function codeFor(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Checks a code against the current step and one either side (clock drift). Returns the step it matched, so the
 * caller can refuse the same step twice, or null. Steps at or before `lastStep` are refused.
 */
export function verifyCode(secret: string, code: string, lastStep: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = stepAt(now);
  let matched: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(codeFor(secret, step));
    // Every candidate is compared, so timing does not show which one was close.
    if (timingSafeEqual(expected, Buffer.from(code)) && step > lastStep) matched = step;
  }
  return matched;
}

export function otpauthUri(secret: string, account: string, issuer = 'FM Stead'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/** Recovery codes look like `k3f9-x7qm-2p8d`: easy to read out and type, 60 bits each. */
export function newRecoveryCodes(count = 10): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(12);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  });
}

export function normaliseRecoveryCode(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(`recovery:${normaliseRecoveryCode(code)}`)
    .digest('hex');
}

function encryptionKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured) return createHash('sha256').update(configured).digest();
  // Never fall back to a known key in production: a secret encrypted with it would protect nothing.
  if (process.env.NODE_ENV === 'production') throw new Error('MFA_ENCRYPTION_KEY is not set');
  return createHash('sha256').update('fmstead-local-development-mfa-key').digest();
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, tag, body] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !body) throw new Error('Unreadable MFA secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
