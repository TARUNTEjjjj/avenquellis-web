import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {onRequest as assess} from '../functions/api/assess.js';
import {onRequest as grade} from '../functions/api/grade.js';

const origin='https://avenquellis.pages.dev';
const routes=[['assess',assess],['grade',grade]];
const request=(path,body,signal)=>new Request(`${origin}/api/${path}`,{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body,duplex:'half',signal
});
const noInference={AI:{run(){assert.fail('Invalid uploads must never request inference');}}};

test('both Pages grading routes bound the whole upload even when cleanup never settles',{timeout:2000},async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const [path,handler] of routes) for(const trickle of [false,true]){
    let controller,cancelled=false,completed=false;
    const body=new ReadableStream({
      start(stream){controller=stream;stream.enqueue(new TextEncoder().encode('{'));},
      cancel(){cancelled=true;return new Promise(()=>{});}
    });
    const responding=handler({request:request(path,body),env:noInference}).then(response=>{completed=true;return response;});
    t.mock.timers.tick(6000);
    if(trickle)controller.enqueue(new TextEncoder().encode(' '));
    await nextTurn();
    t.mock.timers.tick(3999);
    await nextTurn();
    assert.equal(completed,false,'The documented ten-second upload deadline has not elapsed');
    t.mock.timers.tick(1);
    const response=await responding;
    assert.equal(response.status,408,`${path}: ${trickle?'trickling':'stalled'} upload reaches the original deadline`);
    assert.deepEqual(await response.json(),{error:'Request body deadline exceeded.'});
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(cancelled,true);
    assert.equal(body.locked,false);
  }
});

test('both Pages grading routes promptly cancel aborted uploads without exposing the reason',{timeout:2000},async()=>{
  for(const [path,handler] of routes) for(const abortBefore of [false,true]){
    const signal=new AbortController();let cancelled=false;
    const body=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
    const input=request(path,body,signal.signal);
    if(abortBefore)signal.abort(new Error('private submitted proof'));
    const responding=handler({request:input,env:noInference});
    if(!abortBefore)signal.abort(new Error('private submitted proof'));
    const response=await responding;
    assert.equal(response.status,400);
    assert.deepEqual(await response.json(),{error:'Request body was interrupted.'});
    assert.equal(cancelled,true);
    assert.equal(body.locked,false);
  }
});

test('both Pages grading routes keep transport failure details out of their responses',async()=>{
  for(const [path,handler] of routes){
    const body=new ReadableStream({start(stream){stream.error(new Error('private submitted proof'));}});
    const response=await handler({request:request(path,body),env:noInference});
    assert.equal(response.status,400);
    assert.deepEqual(await response.json(),{error:'Request body could not be read.'});
  }
});
