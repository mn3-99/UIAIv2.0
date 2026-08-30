// agent/bridge/bridgeMain.ts
// Cycle de vie du bridge (doc 10 : lancement + code d'appairage).

import { createPairingCode } from './pairing';
import { BridgeController } from './controller';
import type { BridgeWorkMode } from './protocol';

export interface BridgeMainOptions {
  port?: number;
  mode?: BridgeWorkMode;
}

/**
 * Lance le bridge (doc 10).
 * Genere un code d'appairage affiche a l'utilisateur, demarre le serveur WS,
 * et renvoie le controleur pour integration dans le REPL.
 */
export async function runBridge(opts: BridgeMainOptions = {}): Promise<BridgeController> {
  const code = createPairingCode();
  const controller = new BridgeController(opts.port);
  const url = await controller.start();
  console.log(`\n[bridge] Mode: ${opts.mode ?? 'single-session'}`);
  console.log(`[bridge] URL:  ${url}`);
  console.log(`[bridge] Pairing code: ${code}`);
  console.log('[bridge] Entrez ce code sur l\'interface web pour appairer.\n');
  return controller;
}
