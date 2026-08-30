// agent/services/diagnosticTracking.ts
// Metriques de performance (doc 12 : diagnosticTracking).

interface Timer {
  start: number;
  label: string;
}

class DiagnosticTracker {
  private timers = new Map<string, Timer>();
  private metrics: Record<string, number> = {};

  start(label: string): void {
    this.timers.set(label, { start: Date.now(), label });
  }

  end(label: string): number {
    const t = this.timers.get(label);
    if (!t) return 0;
    const ms = Date.now() - t.start;
    this.timers.delete(label);
    this.metrics[label] = (this.metrics[label] ?? 0) + ms;
    return ms;
  }

  record(key: string, value: number): void {
    this.metrics[key] = (this.metrics[key] ?? 0) + value;
  }

  snapshot(): Record<string, number> {
    return { ...this.metrics };
  }
}

export const diagnostics = new DiagnosticTracker();

/** Mesure une fonction async (doc 12 : diagnostic). */
export async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  diagnostics.start(label);
  try {
    return await fn();
  } finally {
    diagnostics.end(label);
  }
}
