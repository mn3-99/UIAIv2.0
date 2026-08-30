// agent/bridge/index.ts
// Point d'entree du module Bridge (doc 10).

export { runBridge } from './bridgeMain';
export { BridgeController } from './controller';
export { BridgeServer } from './server';
export { createPairingCode, redeemPairingCode, validateBridgeToken } from './pairing';
export { signJWT, verifyJWT } from './jwt';
export * from './protocol';
