// agent/bridge/server.ts
// Serveur WebSocket local + authentification + heartbeat (doc 10).

import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import type { BridgeFrame, BridgeFrameType } from './protocol';
import { generateId } from './protocol';
import { validateBridgeToken, redeemPairingCode } from './pairing';

export type FrameHandler = (frame: BridgeFrame, ws: WebSocket) => void;

export interface BridgeServerOptions {
  port?: number;
  onFrame: FrameHandler;
  onStatus?: (state: 'listening' | 'closed') => void;
}

export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private onFrame: FrameHandler;
  private onStatus?: (state: 'listening' | 'closed') => void;
  private heartbeats = new Map<WebSocket, NodeJS.Timeout>();
  private authed = new Set<WebSocket>();

  constructor(opts: BridgeServerOptions) {
    this.port = opts.port ?? 8765;
    this.onFrame = opts.onFrame;
    this.onStatus = opts.onStatus;
  }

  get address(): string | null {
    if (!this.wss) return null;
    const addr = this.wss.address() as AddressInfo;
    return `ws://localhost:${addr.port}`;
  }

  get clientCount(): number {
    let n = 0;
    for (const c of this.authed) if (c.readyState === c.OPEN) n++;
    return n;
  }

  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });
      } catch (err) {
        reject(err);
        return;
      }
      this.wss.on('listening', () => {
        this.onStatus?.('listening');
        resolve(this.address ?? `ws://localhost:${this.port}`);
      });
      this.wss.on('connection', (ws) => this.handleConnection(ws));
      this.wss.on('error', (err) => reject(err));
    });
  }

  private handleConnection(ws: WebSocket): void {
    let authed = false;
    // Heartbeat : detecter les deconnexions fantomes (doc 10).
    const hb = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        this.send(ws, 'heartbeat', { ok: true });
      }
    }, 15000);
    this.heartbeats.set(ws, hb);

    ws.on('message', (data) => {
      let frame: BridgeFrame;
      try {
        frame = JSON.parse(data.toString()) as BridgeFrame;
      } catch {
        this.send(ws, 'error', { message: 'invalid frame' });
        return;
      }

      // Etape d'authentification : le premier message est le JWT ou le code
      if (!authed) {
        if (this.tryAuthenticate(ws, frame)) authed = true;
        return;
      }
      this.onFrame(frame, ws);
    });

    ws.on('close', () => {
      const t = this.heartbeats.get(ws);
      if (t) clearInterval(t);
      this.heartbeats.delete(ws);
      this.authed.delete(ws);
    });
  }

  private tryAuthenticate(ws: WebSocket, frame: BridgeFrame): boolean {
    const payload = frame.payload as { token?: string; pairingCode?: string };
    let token: string | null = null;
    if (payload.pairingCode) {
      token = redeemPairingCode(payload.pairingCode);
    } else if (payload.token) {
      const decoded = validateBridgeToken(payload.token);
      token = decoded ? payload.token : null;
    }
    if (!token) {
      this.send(ws, 'error', { message: 'unauthorized' });
      ws.close(4001, 'Unauthorized');
      return false;
    }
    this.authed.add(ws);
    this.send(ws, 'session_status', { state: 'ACTIVE' });
    return true;
  }

  send(ws: WebSocket, type: BridgeFrameType, payload: unknown): void {
    if (ws.readyState !== ws.OPEN) return;
    const frame: BridgeFrame = { type, id: generateId(), payload, timestamp: Date.now() };
    ws.send(JSON.stringify(frame));
  }

  broadcast(type: BridgeFrameType, payload: unknown): void {
    if (!this.wss) return;
    for (const client of this.wss.clients) {
      this.send(client, type, payload);
    }
  }

  stop(): void {
    for (const t of this.heartbeats.values()) clearInterval(t);
    this.heartbeats.clear();
    this.wss?.close();
    this.onStatus?.('closed');
  }
}
