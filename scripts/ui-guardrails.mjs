#!/usr/bin/env node
/**
 * UI guardrails — permanent quality gate that fails the build when any of these
 * sneaks back into src/:
 *
 *   1. Physical directional utilities (left-N / right-N) in tsx/ts
 *      → this app is RTL-first; use start-N/end-N (or ps/pe/ms/me).
 *   2. Hardcoded hex colors (#rrggbb) in tsx
 *      → component colors must come from theme tokens. Exception: MijlaiLogo.tsx
 *      (a deliberate multi-color brand signature).
 *   3. Inline style={{ }} in the four biggest files unless the line uses var(--)
 *      → dynamic styles must reference theme tokens, not hardcoded values.
 *   4. document.getElementById in src/components
 *      → use refs / the ComposerFocusContext instead of querying the DOM.
 *
 * Run with `npm run guard`; wire into CI or a pre-push hook next to tsc.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;
const BIG_FILES = ['App.tsx', 'ChatMessageItem.tsx', 'MijlaiComposer.tsx', 'MijlaiSidebar.tsx'];
const HEX_EXCEPTIONS = new Set(['MijlaiLogo.tsx']);

/** @param {string} dir @param {string[]} out */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
let violations = 0;

for (const file of files) {
  const rel = file.replace(SRC, '').replace(/^\//, '');
  const lines = readFileSync(file, 'utf8').split('\n');
  const isTsx = file.endsWith('.tsx');
  const isComponent = rel.startsWith('components/');
  const isBigFile = BIG_FILES.includes(rel.split('/').pop() || '');
  const isHexExempt = HEX_EXCEPTIONS.has(rel.split('/').pop() || '');

  lines.forEach((line, i) => {
    const ln = i + 1;
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // 1. physical directional utilities
    if (/[^-a-zA-Z0-9](left|right)-[0-9]/.test(code)) {
      violations++;
      console.error(`${rel}:${ln}  physical direction (use start-*/end-*)`);
    }

    if (isTsx) {
      // 2. hardcoded hex colors
      if (!isHexExempt && /#[0-9a-fA-F]{6}\b/.test(code)) {
        violations++;
        console.error(`${rel}:${ln}  hardcoded hex color (use a theme token)`);
      }
      // 3. inline style in big files must not hardcode colors (must use var(--)
      if (isBigFile && /style=\{\{/.test(code) && !/var\(--/.test(code) && /#[0-9a-fA-F]{3,8}\b|\brgb\(|\bhsl\(/.test(code)) {
        violations++;
        console.error(`${rel}:${ln}  inline style hardcodes a color (use var(--))`);
      }
    }

    // 4. DOM lookups in components
    if (isComponent && /document\.getElementById/.test(code)) {
      violations++;
      console.error(`${rel}:${ln}  document.getElementById (use refs/context)`);
    }
  });
}

if (violations > 0) {
  console.error(`\nui-guardrails: ${violations} violation(s). Fix before merging.`);
  process.exit(1);
}
console.log('ui-guardrails: ok');
