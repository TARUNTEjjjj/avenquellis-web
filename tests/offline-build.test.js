import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {buildOffline,MAX_ASSET_BYTES} from '../scripts/build-offline.mjs';

async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'noether-offline-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const files={'index.html':'<!doctype html><title>Original app</title>','app.js':'export const version=1;','style.css':'body{color:white}','register-offline.js':'// register','manifest.webmanifest':'{"name":"Noether"}','icon.svg':'<svg/>','lib/engine.wasm':new Uint8Array([0,97,115,109,1,0,0,0])};
  await mkdir(join(directory,'lib'));
  for(const [path,content]of Object.entries(files))await writeFile(join(directory,path),content);
  return {directory,files};
}
async function runtime(directory,files){
  const handlers={},storage=new Map();let networkCalls=0,skipCalls=0,claimCalls=0;
  const caches={
    async open(key){if(!storage.has(key))storage.set(key,new Map());const data=storage.get(key);return {async put(url,response){data.set(String(url),response.clone());},async match(url){return data.get(String(url))?.clone();}};},
    async keys(){return [...storage.keys()];},async has(key){return storage.has(key);},async delete(key){return storage.delete(key);}
  };
  const context=vm.createContext({URL,Response,Request,Headers,AbortController,Uint8Array,TextEncoder,console,setTimeout,clearTimeout,crypto:webcrypto,caches,
    self:{registration:{scope:'https://math.example/lab/'},addEventListener(type,callback){handlers[type]=callback;},async skipWaiting(){skipCalls++;},clients:{async claim(){claimCalls++;}}},
    fetch:async url=>{networkCalls++;const path=new URL(url).pathname.replace('/lab/','')||'index.html';if(!(path in files))return new Response('missing',{status:404});return new Response(files[path]);}
  });
  vm.runInContext(await readFile(join(directory,'sw.js'),'utf8'),context);
  async function lifecycle(type){let pending;handlers[type]({waitUntil(p){pending=p;}});await pending;}
  async function request(url,{method='GET',mode='cors'}={}){let pending;handlers.fetch({request:{url,method,mode},respondWith(p){pending=p;}});return pending?await pending:undefined;}
  return {context,storage,caches,handlers,lifecycle,request,counters:()=>({networkCalls,skipCalls,claimCalls})};
}
test('offline build hashes recursive wasm and is stable without manifest recursion',async t=>{
  const {directory}=await fixture(t);
  const first=await buildOffline({directory}),second=await buildOffline({directory});
  assert.equal(first.version,second.version);assert.ok(first.assets.some(a=>a.url==='lib/engine.wasm'));
  assert.ok(!first.assets.some(a=>['sw.js','offline-assets.json'].includes(a.url)));
  await writeFile(join(directory,'lib/engine.wasm'),new Uint8Array([0,97,115,109,1,0,0,1]));
  const changed=await buildOffline({directory});assert.notEqual(changed.version,first.version);
});
test('offline build excludes maps, PDFs, credential names and oversized files',async t=>{
  const {directory}=await fixture(t);
  for(const name of ['app.js.map','.env','credentials.json','api-key.json','paper.pdf'])await writeFile(join(directory,name),'not an offline asset');
  await writeFile(join(directory,'large.js'),Buffer.alloc(MAX_ASSET_BYTES+1));
  const manifest=await buildOffline({directory});
  for(const name of ['app.js.map','.env','credentials.json','api-key.json','paper.pdf','large.js'])assert.ok(!manifest.assets.some(a=>a.url===name),name);
  assert.ok(manifest.skipped.includes('large.js'));
});
test('service worker serves one immutable snapshot while online HTML has changed',async t=>{
  const {directory,files}=await fixture(t);await buildOffline({directory});const app=await runtime(directory,files);
  await app.lifecycle('install');
  files['index.html']='<!doctype html><title>New incompatible app</title>';
  files['app.js']='export const version=2;';
  assert.match(await(await app.request('https://math.example/lab/',{mode:'navigate'})).text(),/Original app/);
  assert.match(await(await app.request('https://math.example/lab/app.js')).text(),/version=1/);
  assert.deepEqual(app.counters().skipCalls,0);assert.deepEqual(app.counters().claimCalls,0);
});
test('external PDFs, POSTs and unrelated same-origin paths are never intercepted',async t=>{
  const {directory,files}=await fixture(t);await buildOffline({directory});const app=await runtime(directory,files);
  assert.equal(await app.request('https://official.example/paper.pdf'),undefined);
  assert.equal(await app.request('https://math.example/api/evaluate',{method:'POST'}),undefined);
  assert.equal(await app.request('https://math.example/lab/paper.pdf',{mode:'navigate'}),undefined);
  assert.equal(await app.request('https://math.example/account'),undefined);
});
test('failed installation removes only incomplete new cache and preserves old version',async t=>{
  const {directory,files}=await fixture(t);await buildOffline({directory});const app=await runtime(directory,files);
  app.storage.set('noether-offline:/lab/:old',new Map());
  files['app.js']='truncated';
  await assert.rejects(app.lifecycle('install'),/Asset/);
  assert.deepEqual([...app.storage.keys()],['noether-offline:/lab/:old']);
});
test('activation cleans only this app scope and never forces an active-page reload',async t=>{
  const {directory,files}=await fixture(t);await buildOffline({directory});const app=await runtime(directory,files);
  await app.lifecycle('install');app.storage.set('noether-offline:/lab/:old',new Map());app.storage.set('noether-offline:/different/:old',new Map());app.storage.set('unrelated-cache',new Map());
  await app.lifecycle('activate');
  assert.ok(!app.storage.has('noether-offline:/lab/:old'));assert.ok(app.storage.has('noether-offline:/different/:old'));assert.ok(app.storage.has('unrelated-cache'));
  assert.equal(app.counters().skipCalls,0);assert.equal(app.counters().claimCalls,0);
});
test('offline navigation falls back after network failure and status confirms complete cache',async t=>{
  const {directory,files}=await fixture(t);const manifest=await buildOffline({directory});const app=await runtime(directory,files);await app.lifecycle('install');
  app.context.fetch=async()=>{throw new TypeError('offline');};
  assert.match(await(await app.request('https://math.example/lab/',{mode:'navigate'})).text(),/Original app/);
  let pending,report;app.handlers.message({data:{type:'NOETHER_OFFLINE_STATUS'},ports:[{postMessage(value){report=value;}}],waitUntil(value){pending=value;}});await pending;
  assert.equal(report.ready,true);assert.equal(report.version,manifest.version);
});

test('canonical index redirects are avoided during install, navigation and cache repair',async t=>{
  const {directory,files}=await fixture(t);
  await buildOffline({directory});
  const app=await runtime(directory,files);
  const root='https://math.example/lab/';
  const indexUrl=root+'index.html';
  const networkUrls=[];
  const serve=app.context.fetch;
  app.context.fetch=async(url, options)=>{
    networkUrls.push(url);
    if(url===indexUrl){
      if(options.redirect==='error')throw new TypeError('Redirect rejected');
      return Response.redirect(root,308);
    }
    return serve(url,options);
  };
  await app.lifecycle('install');
  const cache=[...app.storage.values()][0];
  assert.ok(cache.has(indexUrl));
  assert.equal(cache.has(root),false);
  assert.equal(await(await app.request(indexUrl,{mode:'navigate'})).text(),files['index.html']);
  cache.delete(indexUrl);
  assert.equal(await(await app.request(indexUrl)).text(),files['index.html']);
  assert.ok(cache.has(indexUrl));
  assert.equal(networkUrls.filter(url=>url===root).length,3);
  assert.ok(!networkUrls.includes(indexUrl));
});
