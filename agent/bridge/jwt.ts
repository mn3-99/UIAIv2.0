// agent/bridge/jwt.ts
// JWT signe par HMAC (doc 10 : authentification). Pas de dependance externe.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.UIAI_BRIDGE_SECRET ?? 'uiai-bridge-dev-secret-change-me';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/** Signe un payload (doc 10 : JWT). */
export function signJWT(payload: Record<string, unknown>, expiresInSec = 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const sig = createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Verifie un JWT (doc 10 : validation). */
export function verifyJWT(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p)) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Code d'appairage (doc 10 : pairing code, ex: ABCD-1234). */
export function generatePairingCode(): string {
  const a = randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  const n = randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  return `${a}-${n}`;
}
