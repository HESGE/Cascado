import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await rm('dist', { recursive:true, force:true });
await mkdir('dist', { recursive:true });
for (const file of ['index.html','src','icons','assets','sw.js','manifest.webmanifest']) {
  await cp(file, `dist/${file}`, { recursive:true });
}
// A changed shell must get a new immutable cache, even for a patch release.
const hash = createHash('sha256');
async function filesIn(directory) {
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=`${directory}/${entry.name}`;
    if(entry.isDirectory())result.push(...await filesIn(file));else result.push(file);
  }
  return result.sort();
}
for (const file of ['index.html','manifest.webmanifest','sw.js', ...await filesIn('src'), ...await filesIn('icons'), ...await filesIn('assets')]) {
  hash.update(file).update(await readFile(file));
}
const fingerprint = hash.digest('hex').slice(0, 12);
const worker = await readFile('dist/sw.js','utf8');
await writeFile('dist/sw.js',worker.replace("const VERSION = 'v1.0.0'",`const VERSION = 'v1.0.0-${fingerprint}'`));
console.log('Version statique prête dans dist/ (aucune dépendance distante).');
