// agent/bridge/controller.ts
// Controleur reliant le REPL au bridge (doc 10 : routage + synchronisation).

import type { WebSocket } from 'ws';
import { BridgeServer } from './server';
import type { BridgeFrame, BridgeFrameType } from './protocol';
import { generateId } from './protocol';

type PendingPermission = { resolve: (allowed: boolean) => void };

export class BridgeController {
  private server: BridgeServer;
  private onUserMessage?: (text: string) => void;
  private pending = new Map<string, PendingPermission>();

  constructor(port?: number) {
    this.server = new BridgeServer({
      port,
      onStatus: (s) => console.log(`[bridge] ${s}`),
      onFrame: (frame, ws) => this.route(frame, ws),
    });
  }

  /** Demarre le serveur et affiche l'URL. */
  async start(): Promise<string> {
    return this.server.start();
  }

  setUserMessageHandler(fn: (text: string) => void): void {
    this.onUserMessage = fn;
  }

  private route(frame: BridgeFrame, ws: WebSocket): void {
    switch (frame.type) {
      case 'user_message':
        this.onUserMessage?.(String(frame.payload));
        break;
      case 'permission_response': {
        const { id, allowed } = frame.payload as { id: string; allowed: boolean };
        const p = this.pending.get(id);
        if (p) {
          p.resolve(!!allowed);
          this.pending.delete(id);
        }
        break;
      }
      case 'heartbeat':
        this.server.send(ws, 'heartbeat', { ok: true });
        break;
      default:
        break;
    }
  }

  /** Emets un evenement vers tous les clients web. */
  emit(type: BridgeFrameType, payload: unknown): void {
    this.server.broadcast(type, payload);
  }

  /** Envoie un message assistant (doc 10 : assistant_message). */
  sendAssistant(text: string): void {
    this.emit('assistant_message', { text });
  }

  /** Envoie la progression d'un outil (doc 10 : tool_progress). */
  sendToolProgress(toolName: string, status: string): void {
    this.emit('tool_progress', { toolName, status });
  }

  sendToolResult(toolName: string, result: string): void {
    this.emit('tool_result', { toolName, result: result.slice(0, 4000) });
  }

  /** Synchronise l'etat UI courant (doc 10 : session_status). */
  sendStatus(state: {
    messages: number;
    isStreaming: boolean;
    activeTools: number;
    sessionState: string;
  }): void {
    this.emit('session_status', state);
  }

  /**
   * Demande une permission via le web (doc 10 : permission_request).
   * Retourne une promesse resolue par permission_response. Si aucun client
   * connecte, elle reste en attente (timeout gere par l'appelant).
   */
  requestPermission(toolCall: {
    name: string;
    args: unknown;
  }): Promise<boolean> {
    const id = generateId();
    this.emit('permission_request', { id, toolCall });
    return new Promise<boolean>((resolve) => {
      this.pending.set(id, { resolve });
    });
  }

  get hasClients(): boolean {
    return this.server.clientCount > 0;
  }

  stop(): void {
    this.server.stop();
  }
}
