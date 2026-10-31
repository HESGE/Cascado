import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
const files = (await readdir('src')).filter(name => name.endsWith('.js')).map(name => `src/${name}`);
files.push('sw.js');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
console.log('Syntaxe JavaScript et manifest valides.');
