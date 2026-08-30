// agent/utils/startupProfiler.ts
// Profilage du temps d'evaluation des modules (doc 02).

interface Mark {
  label: string;
  at: number;
}

const marks: Mark[] = [];
const t0 = Date.now();

export function mark(label: string): void {
  marks.push({ label, at: Date.now() - t0 });
}

export function report(): string {
  const lines = marks.map((m, i) => {
    const prev = i === 0 ? 0 : marks[i - 1].at;
    return `  +${String(m.at).padStart(5)}ms (${String(m.at - prev).padStart(4)}ms) ${m.label}`;
  });
  return [`startup profile (total ${Date.now() - t0}ms):`, ...lines].join('\n');
}

export function isDebug(): boolean {
  return Boolean(process.env.UIAI_AGENT_DEBUG);
}
