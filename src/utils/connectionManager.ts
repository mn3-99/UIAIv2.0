export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export type ConnectionListener = (status: ConnectionStatus, isForegroundSync: boolean) => void;

class ConnectionManager {
  private status: ConnectionStatus = navigator.onLine ? 'connected' : 'offline';
  private listeners: Set<ConnectionListener> = new Set();
  private isCheckingHealth = false;
  private reconnectAttempt = 0;
  private reconnectTimeoutId: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      
      // Initial background ping check
      setTimeout(() => this.checkHealth(true), 1000);
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public isOnline(): boolean {
    return this.status !== 'offline';
  }

  public subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    // Immediately notify current status
    listener(this.status, false);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(isForegroundSync = false) {
    this.listeners.forEach((listener) => {
      try {
        listener(this.status, isForegroundSync);
      } catch (err) {
        console.error('Error in ConnectionManager listener:', err);
      }
    });
  }

  private setStatus(newStatus: ConnectionStatus, isForegroundSync = false) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.notifyListeners(isForegroundSync);
    }
  }

  private handleOnline = () => {
    console.log('🌐 Network online event received. Triggering connection check...');
    this.reconnectAttempt = 0;
    this.setStatus('reconnecting');
    this.checkHealth(true);
  };

  private handleOffline = () => {
    console.warn('⚠️ Network offline event received.');
    this.setStatus('offline');
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('📱 App returned to foreground (visibilitychange). Running silent background sync...');
      // Quietly check connection health without page reload or UX disruption
      this.checkHealth(true, true);
    }
  };

  /**
   * Check connection health against backend /api/ping with timeout
   */
  public async checkHealth(silent = true, isForegroundSync = false): Promise<boolean> {
    if (this.isCheckingHealth) return this.status === 'connected';
    this.isCheckingHealth = true;

    if (!navigator.onLine) {
      this.setStatus('offline', isForegroundSync);
      this.isCheckingHealth = false;
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch('/api/ping', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        this.reconnectAttempt = 0;
        if (this.reconnectTimeoutId) {
          clearTimeout(this.reconnectTimeoutId);
          this.reconnectTimeoutId = null;
        }
        this.setStatus('connected', isForegroundSync);
        this.isCheckingHealth = false;
        return true;
      } else {
        throw new Error(`Ping failed with status ${res.status}`);
      }
    } catch (err) {
      if (!silent) {
        console.warn('Health check ping failed:', err);
      }
      this.setStatus('reconnecting', isForegroundSync);
      this.scheduleReconnect();
      this.isCheckingHealth = false;
      return false;
    }
  }

  /**
   * Exponential backoff with jitter for automatic silent reconnection
   */
  private scheduleReconnect() {
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    if (!navigator.onLine) return;

    this.reconnectAttempt++;
    // Exponential backoff: 1s, 2s, 4s, 8s max
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt - 1), 8000);
    // Add ±20% jitter
    const jitter = baseDelay * (Math.random() * 0.4 - 0.2);
    const delay = Math.round(baseDelay + jitter);

    console.log(`🔄 Connection manager scheduling reconnect attempt #${this.reconnectAttempt} in ${delay}ms...`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.checkHealth(true);
    }, delay);
  }

  public destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    this.listeners.clear();
  }
}

export const connectionManager = new ConnectionManager();
