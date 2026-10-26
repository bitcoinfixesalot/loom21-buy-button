// Fails the build when the script-tag bundle is over its budget, gzipped.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT = 15 * 1024;
const file = 'dist/buy-button.js';
const raw = readFileSync(file);
const gzipped = gzipSync(raw, { level: 9 }).length;
const kb = n => (n / 1024).toFixed(2) + ' KB';

console.log(`${file}: ${kb(raw.length)} minified, ${kb(gzipped)} gzipped (limit ${kb(LIMIT)})`);
if (gzipped > LIMIT) {
  console.error(`Over the size budget by ${kb(gzipped - LIMIT)}.`);
  process.exit(1);
}
