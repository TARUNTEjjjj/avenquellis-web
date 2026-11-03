import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const components = [
  {repository:'noether-question-engine',source:'src/index.js',destination:'dist/lib/questions.js'},
  {repository:'noether-proof-grader',source:'src/index.js',destination:'dist/lib/grader.js'}
];
// Read and validate both sources before replacing either vendored module.
const inputs = await Promise.all(components.map(async item => {
  const sourceRoot = resolve(root, '..', item.repository);
  const bytes = await readFile(join(sourceRoot,item.source));
  const pkg = JSON.parse(await readFile(join(sourceRoot,'package.json'),'utf8'));
  if (!bytes.length) throw new Error(`Source is empty: ${item.repository}/${item.source}`);
  return {...item,bytes,packageName:pkg.name,version:pkg.version,sha256:createHash('sha256').update(bytes).digest('hex')};
}));
await mkdir(join(root,'dist/lib'), {recursive:true});
for (const item of inputs) {
  const destination = join(root,item.destination);
  await writeFile(destination + '.tmp',item.bytes);
  await rename(destination + '.tmp',destination);
}
const provenance = {formatVersion:1,description:'Vendored browser modules copied byte-for-byte from sibling repositories. Run npm run sync:engines after changing the engines.',components:inputs.map(({bytes,...item}) => item)};
await writeFile(join(root,'dist/lib/vendor-provenance.json'),JSON.stringify(provenance,null,2) + '\n');
console.log(`Synchronized ${inputs.length} browser engine modules and recorded their SHA-256 hashes.`);
