import assert from 'node:assert/strict';
import test from 'node:test';
import {appendReviewedWriting} from '../dist/handwriting.js';
import {handwritingLimits as limits,inspectPhoto,inspectJpeg} from '../dist/lib/handwriting-image.js';
import {createTranscriptionHandler,transcriptionModel} from '../server/handwriting.js';
const origin='https://avenquellis.example', ip='203.0.113.8';
const photo=Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKVAB//Z', 'base64'));
function post(body=photo,overrides={}){return new Request(origin+'/api/transcribe',{method:'POST',body,headers:{'content-type':'image/jpeg',origin,'cf-connecting-ip':ip,...overrides}});}
const enabled = run=>({AVENQUELLIS_HANDWRITING:'enabled',AI:{run}});
const stampExif=data=>{
  const note=Buffer.from('Exif\0\0PRIVATE-GPS-TEST');
  return new Uint8Array(Buffer.concat([data.subarray(0,2),Buffer.from([255,225,0,note.length+2]),note,data.subarray(2)]));
};

test('a reviewed transcription appends to the existing answer and enforces its limit',()=>{
  assert.equal(appendReviewedWriting('Typed proof.',' Recognized line. ',100),'Typed proof.\nRecognized line.');
  assert.equal(appendReviewedWriting('Typed proof.\n',' Recognized line. ',100),'Typed proof.\nRecognized line.');
  assert.equal(appendReviewedWriting('',' n² − 1 ',20),'n² − 1');
  assert.throws(()=>appendReviewedWriting('typed','new',7),/limit/);
  assert.throws(()=>appendReviewedWriting('typed','  ',100),/empty/);
});
test('bounded image detection and metadata removal reject malformed or trailing data',()=>{
  assert.deepEqual(inspectPhoto(photo),{type:'image/jpeg',width:3,height:4});
  const stripped=inspectJpeg(stampExif(photo),true);assert.equal(stripped.width,3);
  assert.ok(!Buffer.from(stripped.bytes).includes(Buffer.from('PRIVATE-GPS-TEST')));
  assert.throws(()=>inspectPhoto(new TextEncoder().encode('<svg onload=alert(1)>')));
  assert.throws(()=>inspectJpeg(photo.slice(0,-2),true));
  assert.throws(()=>inspectJpeg(new Uint8Array([...photo,3]),true));
  const png=new Uint8Array(33);png.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const view=new DataView(png.buffer);view.setUint32(16,1000);view.setUint32(20,1200);
  assert.equal(inspectPhoto(png).height,1200);view.setUint32(16,100000);assert.throws(()=>inspectPhoto(png),/large/);
});
test('explicit upload uses only a bounded metadata-free JPEG on the fixed hosted vision model',async()=>{
  let calls=0;
  const run=async(model,options)=>{calls++;assert.equal(model,transcriptionModel);assert.equal(options.max_tokens,1400);
    const content=options.messages[1].content;assert.equal(content.length,2);const url=content[1].image_url.url;
    assert.match(url,/^data:image\/jpeg;base64,/);assert.ok(!Buffer.from(url.split(',')[1],'base64').includes(Buffer.from('PRIVATE-GPS-TEST')));
    return {choices:[{finish_reason:'stop',message:{content:'<think>private internal reasoning</think>\nn(n + 1)'}}]};};
  const env=enabled(run),handle=createTranscriptionHandler();
  const status=await handle({request:new Request(origin+'/api/transcribe'),env});assert.equal((await status.json()).available,true);assert.equal(calls,0);
  const response=await handle({request:post(stampExif(photo)),env});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{text:'n(n + 1)',model:transcriptionModel});assert.equal(calls,1);
  assert.equal((await handle({request:post(),env})).status,429);assert.equal(calls,1);
});
test('denies disabled, cross-origin, malformed, oversized and arbitrary requests before inference',async()=>{
  let calls=0;const handler=createTranscriptionHandler(),env=enabled(async()=>{calls++;});
  assert.equal((await handler({request:post(),env:{...env,AVENQUELLIS_HANDWRITING:'disabled'}})).status,503);
  assert.equal((await handler({request:post(photo,{origin:'https://other.example'}),env})).status,403);
  assert.equal((await handler({request:post(photo,{'cf-connecting-ip':''}),env})).status,403);
  assert.equal((await handler({request:post('{}',{'content-type':'application/json'}),env})).status,415);
  assert.equal((await handler({request:post('not an image'),env})).status,400);
  assert.equal((await handler({request:post(photo,{'content-length':String(limits.uploadBytes+1)}),env})).status,413);
  assert.equal((await handler({request:post(new Uint8Array(limits.uploadBytes+1)),env})).status,413);
  const huge=photo.slice();const frame=huge.findIndex((v,i)=>v===192&&huge[i-1]===255);huge[frame+6]=0x7f;huge[frame+7]=0xff;
  assert.equal((await handler({request:post(huge),env})).status,413);assert.equal(calls,0);
});
test('timeouts, truncated output, refusals and provider errors return bounded safe messages',async()=>{
  for(const [reply,status]of [[{choices:[{finish_reason:'length',message:{content:'partial'}}]},502],[{response:'<think>unclosed'},502],[{response:''},502],[{choices:[{finish_reason:'stop',message:{content:'Not a transcription',refusal:'refused'}}]},502],[new Error('INTERNAL_SECRET_123'),503]]){
    const handle=createTranscriptionHandler();const resp=await handle({request:post(),env:enabled(async()=>{if(reply instanceof Error)throw reply;return reply;})});assert.equal(resp.status,status);assert.ok(!(await resp.text()).includes('INTERNAL_SECRET_123'));
  }
  let release;const pending=new Promise(resolve=>{release=resolve;});const timed=createTranscriptionHandler({timeoutMs:5});
  assert.equal((await timed({request:post(),env:enabled(()=>pending)})).status,504);release({response:'eventually'});
});
test('at most two simultaneous native inferences are admitted in an isolate',async()=>{
  let calls=0,finish;const waiting=new Promise(resolve=>{finish=resolve;});const env=enabled(()=>{calls++;return waiting;});const handler=createTranscriptionHandler();
  const a=handler({request:post(photo,{'cf-connecting-ip':'a'}),env}),b=handler({request:post(photo,{'cf-connecting-ip':'b'}),env});
  await new Promise(resolve=>setTimeout(resolve,1));assert.equal(calls,2);
  assert.equal((await handler({request:post(photo,{'cf-connecting-ip':'c'}),env})).status,429);
  finish({response:'n is even'});assert.equal((await a).status,200);assert.equal((await b).status,200);
});
