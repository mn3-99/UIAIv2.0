// agent/entrypoints/daemonWorker.ts
// Mode daemon worker : sous-processus lean pour agents (doc 02).
// Implementation complete avec le mode multi-agent (doc 11).

export async function runDaemonWorker(args: string[]): Promise<void> {
  // Worker lean : pas d'UI, lit des requetes JSON sur stdin, ecrit sur stdout.
  process.stderr.write(`uiai-agent: daemon worker demarre (args: ${args.join(' ') || 'aucun'})\n`);
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    // Echo placeholder — doc 11 branchera le QueryEngine ici.
    process.stdout.write(JSON.stringify({ type: 'ack', received: String(chunk).trim() }) + '\n');
  }
}
