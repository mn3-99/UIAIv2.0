// agent/services/analytics.ts
// Telemetrie legere (doc 02 etape 2 ; doc 12 : scrubbing PII + evenements).

import { randomUUID } from 'node:crypto';
import { scrubSecrets as scrubSecretsUtil } from '../utils/security';

let initialized = false;
const sessionId = randomUUID().slice(0, 12);

export function initTelemetry(): void {
  initialized = true;
}

export interface AnalyticsEvent {
  name: string;
  properties: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
}

/** Nettoyage PII avant emission (doc 12 : scrubbing). */
export function scrubPII(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string') {
      out[k] = scrubSecretsUtil(
        v.replace(/\/(home|Users)\/[^/\s]+/g, '/$1/<redacted>').replace(/\/root\//g, '/<redacted>/'),
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function track(event: string, data?: Record<string, unknown>): void {
  if (!initialized) return;
  const full: AnalyticsEvent = {
    name: event,
    properties: scrubPII(data ?? {}),
    timestamp: Date.now(),
    sessionId,
  };
  if (process.env.UIAI_AGENT_DEBUG) {
    process.stderr.write(`[telemetry] ${full.name} ${JSON.stringify(full.properties)}\n`);
  }
}

export function getSessionId(): string {
  return sessionId;
}
