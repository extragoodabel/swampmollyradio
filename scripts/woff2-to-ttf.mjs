// One-off utility: decompress the Intel One Mono Regular .woff2
// shipped with @fontsource/intel-one-mono into a .ttf that
// troika-three-text can parse (troika only accepts TTF). The
// resulting TTF lives in /public/fonts so Vite serves it as a
// static asset.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wawoff from 'wawoff2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const src = path.join(
  ROOT,
  'node_modules',
  '@fontsource',
  'intel-one-mono',
  'files',
  'intel-one-mono-latin-400-normal.woff2',
);
const dst = path.join(ROOT, 'public', 'fonts', 'IntelOneMono-Regular.ttf');

const woff2Buf = await fs.readFile(src);
const ttfBuf = await wawoff.decompress(woff2Buf);

await fs.mkdir(path.dirname(dst), { recursive: true });
await fs.writeFile(dst, Buffer.from(ttfBuf));

console.log(
  `Wrote ${dst} (${(ttfBuf.length / 1024).toFixed(1)} kB) ` +
    `from ${(woff2Buf.length / 1024).toFixed(1)} kB woff2`,
);
