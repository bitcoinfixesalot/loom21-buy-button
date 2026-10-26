// Two builds: dist/buy-button.js, one minified IIFE for a <script> tag, and dist/esm/ for npm. No runtime
// dependencies: the QR encoder is our own (src/qr.ts).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const banner = { js: `/*! @loom21/buy-button v${version} | MIT | https://github.com/bitcoinfixesalot/loom21-buy-button */` };
const common = { bundle: true, target: 'es2022', legalComments: 'none', banner, define: { __VERSION__: JSON.stringify(version) } };

await build({
  ...common,
  entryPoints: ['src/buy-button.ts'],
  outfile: 'dist/buy-button.js',
  format: 'iife',
  minify: true,
  sourcemap: 'linked',
});

await build({
  ...common,
  entryPoints: ['src/index.ts'],
  outdir: 'dist/esm',
  format: 'esm',
  minify: true,
  sourcemap: true,
});

console.log(`Built @loom21/buy-button v${version}`);
