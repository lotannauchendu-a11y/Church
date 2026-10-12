// Assembles src/* into a single self-contained index.html.
// Usage: node build.mjs [--artifact out.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(dir, 'src', f), 'utf8');
const head = src('head.html');
const body = src('body.html');
const shared = src('shared.js');
const scripts = ['textures.js', 'engine.js', 'world.js', 'game.js', 'main.js'].map(src).join('\n');
const inner = `${body}
<script id="shared-src">
${shared}
</script>
<script>
${scripts}
</script>
`;
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${head}
</head>
<body>
${inner}</body>
</html>
`;
writeFileSync(join(dir, 'index.html'), full);
const i = process.argv.indexOf('--artifact');
if (i > 0) writeFileSync(process.argv[i + 1], `${head}\n${inner}`);
console.log('built index.html', (full.length / 1024).toFixed(1) + ' KB');
