// agent/bridge/protocol.ts
// Protocole de communication du bridge (doc 10).

export type BridgeFrameType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_progress'
  | 'tool_result'
  | 'permission_request'
  | 'permission_response'
  | 'attachment_upload'
  | 'session_status'
  | 'heartbeat'
  | 'error';

export interface BridgeFrame {
  type: BridgeFrameType;
  id: string;
  payload: unknown;
  timestamp: number;
}

export type BridgeWorkMode = 'single-session' | 'worktree' | 'same-dir';

export type BridgeSessionState =
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'ACTIVE'
  | 'IDLE'
  | 'DISCONNECTED'
  | 'TOOL_EXECUTING'
  | 'WAITING_PERMISSION'
  | 'STREAMING';

export interface TrustedDeviceToken {
  deviceId: string;
  issuedAt: number;
  expiresAt: number;
  securityTier: 'basic' | 'elevated';
}

/** Genere un id de frame. */
export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
