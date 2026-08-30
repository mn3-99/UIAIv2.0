// agent/bridge/pairing.ts
// Gestion du code d'appairage + trusted device tokens (doc 10).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '../setup';
import { signJWT, verifyJWT, generatePairingCode } from './jwt';
import type { TrustedDeviceToken } from './protocol';

interface PairingStore {
  code: string;
  issuedAt: number;
}

const TTL = 5 * 60 * 1000; // 5 min

function pairingPath(): string {
  return join(configDir(), 'bridge.pairing.json');
}

/** Genere et persiste un code d'appairage. */
export function createPairingCode(): string {
  mkdirSync(configDir(), { recursive: true });
  const code = generatePairingCode();
  writeFileSync(pairingPath(), JSON.stringify({ code, issuedAt: Date.now() } satisfies PairingStore));
  return code;
}

/** Verifie un code d'appairage + retourne un JWT (doc 10 : etape 5-6). */
export function redeemPairingCode(code: string): string | null {
  if (!existsSync(pairingPath())) return null;
  const store = JSON.parse(readFileSync(pairingPath(), 'utf8')) as PairingStore;
  if (Date.now() - store.issuedAt > TTL) return null;
  if (store.code !== code) return null;
  return signJWT({ sub: 'bridge-client', tier: 'elevated' }, 3600);
}

/** Cree un trusted device token (appareils deja appaires). */
export function issueTrustedToken(deviceId: string): TrustedDeviceToken {
  const now = Date.now();
  const token: TrustedDeviceToken = {
    deviceId,
    issuedAt: now,
    expiresAt: now + 30 * 24 * 3600 * 1000,
    securityTier: 'elevated',
  };
  return token;
}

/** Valide un JWT bridge (reutilise verifyJWT). */
export function validateBridgeToken(token: string): Record<string, unknown> | null {
  return verifyJWT(token);
}
