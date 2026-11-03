// Repackage the two optional GPU downloads for reliable Pages uploads.
// The public URLs, canonical bytes, hashes and content types stay the same.
import {cp,mkdir,mkdtemp,readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stage=process.argv[2]?resolve(process.argv[2]):await mkdtemp(join(tmpdir(),'noether-release-'));
await mkdir(stage,{recursive:true});
for(const directory of ['dist','server','functions']) await cp(join(root,directory),join(stage,directory),{recursive:true});
await cp(join(root,'wrangler.jsonc'),join(stage,'wrangler.jsonc'));
const runtime=join(stage,'dist/device-runtime'),pack=join(runtime,'packed');
await mkdir(pack,{recursive:true});
const provenance=JSON.parse(await readFile(join(runtime,'provenance.json'),'utf8'));
const descriptors={};
for(const [name,mime] of [['webllm-0.2.87.js','text/javascript; charset=utf-8'],['qwen3-1.7b-webgpu.wasm','application/wasm']]){
  const source=await readFile(join(runtime,name));
  assert.equal(createHash('sha256').update(source).digest('hex'),provenance.assets.find(a=>a.name===name).sha256);
  const compressed=gzipSync(source,{level:9});
  compressed[9]=255; // Portable gzip OS marker keeps chunks stable across hosts.
  const parts=[];
  for(let pos=0;pos<compressed.length;pos+=196608){
    const part=name+'.'+parts.length+'.bin';
    await writeFile(join(pack,part),compressed.subarray(pos,pos+196608));
    parts.push(part);
  }
  assert.deepEqual(gunzipSync(Buffer.concat(await Promise.all(parts.map(p=>readFile(join(pack,p)))))),source);
  descriptors[name]={mime,parts};
  await unlink(join(runtime,name));
}
const fn=join(stage,'functions/device-runtime');await mkdir(fn,{recursive:true});
const template=await readFile(join(root,'scripts/packed-device.template'),'utf8');
await writeFile(join(fn,'[file].js'),template.replace('DESCRIPTOR',JSON.stringify(descriptors)));
const path=join(stage,'dist/_routes.json'),routes=JSON.parse(await readFile(path,'utf8'));
routes.include.push(...Object.keys(descriptors).map(name=>'/device-runtime/'+name));await writeFile(path,JSON.stringify(routes));
console.log(stage);
