/**
 * Adaptive Stream Batcher — frame-locked UI commits for SSE token streams.
 *
 * Problem: LLM streams emit 30–120 tokens/sec. Committing each token to React
 * state forces a full message-list reconciliation + markdown re-parse per token,
 * which saturates the main thread and drops frames (the "janky streaming" issue).
 *
 * Solution: accumulate tokens cheaply in a plain string and commit at most once
 * per animation frame (≤60 commits/sec, typically far fewer since rAF aligns to
 * real paint). While the tab is hidden we skip scheduling entirely — tokens keep
 * buffering and the final `flushNow()` on stream end guarantees zero token loss.
 *
 * Measurable effect: React state updates drop from O(tokens) to O(frames);
 * markdown parsing is amortized to display refresh rate.
 */
export interface StreamBatcher {
  /** Mark pending data and schedule a frame-aligned commit (coalesced). */
  schedule: () => void;
  /** Commit immediately and synchronously (call on stream end/stop/error). */
  flushNow: () => void;
  /** Cancel any pending frame without committing (unmount safety). */
  dispose: () => void;
}

export function createStreamBatcher(commit: () => void): StreamBatcher {
  let rafId: number | null = null;
  let dirty = false;

  const flush = () => {
    rafId = null;
    if (!dirty) return;
    dirty = false;
    commit();
  };

  return {
    schedule() {
      dirty = true;
      if (rafId !== null) return;
      // Hidden tab: don't paint at all — done/error handlers call flushNow().
      if (typeof document !== 'undefined' && document.hidden) return;
      rafId = requestAnimationFrame(flush);
    },
    flushNow() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (!dirty) return;
      dirty = false;
      commit();
    },
    dispose() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      dirty = false;
    }
  };
}
