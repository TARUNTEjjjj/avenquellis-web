import test from 'node:test';
import assert from 'node:assert/strict';
import {generateOnServer} from '../dist/backend.js';

test('cancelling question generation aborts transport and a later request succeeds',async()=>{
  const previous=globalThis.fetch;
  let signal;
  try {
    globalThis.fetch=async(_url,options)=>{
      signal=options.signal;
      return new Promise((_,reject)=>{
        if(signal.aborted)reject(signal.reason);
        else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      });
    };
    const controller=new AbortController();
    const pending=generateOnServer('question',{seed:'cancelled'},{signal:controller.signal});
    controller.abort();
    await assert.rejects(pending,{name:'AbortError'});
    assert.equal(signal.aborted,true);
    await assert.rejects(generateOnServer('question',{}, {signal:controller.signal}),{name:'AbortError'});
    globalThis.fetch=async()=>Response.json({engine:'cpp-wasm',result:{id:'retry'}});
    assert.deepEqual(await generateOnServer('question',{}),{id:'retry'});
  } finally {globalThis.fetch=previous;}
});
