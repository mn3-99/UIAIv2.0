#!/usr/bin/env node
/**
 * Fails the build if physical directional utilities creep back into src/.
 * This app is RTL-first (dir="rtl"); use logical utilities instead:
 *   left-N / right-N  ->  start-N / end-N
 *   pr-N / pl-N       ->  ps-N / pe-N
 *   mr-N / ml-N       ->  ms-N / me-N
 * Exit 1 (with locations) when violations are found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;
const EXT = /\.(tsx?|css)$/;
// Boundary-safe physical utility patterns: class-start, not mid-word.
const PATTERNS = [
  { re: /(^|[^-a-zA-Z0-9])(left|right)-[0-9]/g, label: 'physical position (use start-* / end-*)' },
  { re: /(^|[^-a-zA-Z0-9])(pr|pl|mr|ml)-[0-9]/g, label: 'physical spacing (use ps-*/pe-*/ms-*/me-*)' },
];

/** @param {string} dir @param {string[]} out */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

let violations = 0;
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''); // strip comments
    for (const { re, label } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code))) {
        violations++;
        console.error(`${file}:${i + 1}  ${label}\n    ${line.trim().slice(0, 140)}`);
      }
    }
  });
}

if (violations > 0) {
  console.error(`\ncheck-physical-props: ${violations} violation(s) — RTL must stay logical.`);
  process.exit(1);
}
console.log('check-physical-props: ok (no physical directional utilities in src/)');
