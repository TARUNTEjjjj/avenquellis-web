import assert from 'node:assert/strict';
import test from 'node:test';
import {appendReviewedWriting} from '../dist/handwriting.js';
import {handwritingLimits as limits,inspectPhoto,inspectJpeg} from '../dist/lib/handwriting-image.js';
import {createTranscriptionHandler,transcriptionModel,clientKey} from '../server/handwriting.js';
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
  // Gain maps and motion-photo video follow the primary image; the local preview re-encodes it, the server stays strict.
  assert.deepEqual(inspectPhoto(new Uint8Array([...photo,...photo])),{type:'image/jpeg',width:3,height:4});
  assert.throws(()=>inspectJpeg(new Uint8Array([...photo,...photo]),true));
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
test('a timed-out transcription frees its slot even when the model call never settles',async()=>{
  let calls=0;const env=enabled(()=>++calls<=2?new Promise(()=>{}):{response:'n is even'});const handler=createTranscriptionHandler({timeoutMs:5});
  for(const address of ['a','b'])assert.equal((await handler({request:post(photo,{'cf-connecting-ip':address}),env})).status,504);
  const later=await handler({request:post(photo,{'cf-connecting-ip':'c'}),env});
  assert.equal(later.status,200);assert.deepEqual(await later.json(),{text:'n is even',model:transcriptionModel});assert.equal(calls,3);
});
// A body that sends the JPEG start marker and then stalls.
const stalled=address=>new Request(origin+'/api/transcribe',{method:'POST',duplex:'half',body:new ReadableStream({start(c){c.enqueue(photo.subarray(0,2));}}),headers:{'content-type':'image/jpeg',origin,'cf-connecting-ip':address}});
test('stalled uploads never hold the transcription slots, and an address uploads one photo at a time',async()=>{
  let calls=0;const env=enabled(async()=>{calls++;return {response:'n is even'};});const handler=createTranscriptionHandler({uploadMs:200});
  const first=handler({request:stalled('x'),env});
  // The same address cannot start a second upload while its first is still arriving.
  const second=await handler({request:stalled('x'),env});assert.equal(second.status,429);assert.match((await second.json()).error,/still uploading/);
  // Stalled uploads hold no transcription slot, so other learners are served while they last.
  const other=handler({request:stalled('y'),env});
  for(const address of ['v1','v2','v3'])assert.equal((await handler({request:post(photo,{'cf-connecting-ip':address}),env})).status,200);
  assert.equal(calls,3);
  // Each stalled upload ends as a slow upload, records no cooldown, and the address can then send its photo.
  for(const response of await Promise.all([first,other])){assert.equal(response.status,408);assert.match((await response.json()).error,/took too long to upload/);}
  assert.equal((await handler({request:post(photo,{'cf-connecting-ip':'x'}),env})).status,200);assert.equal(calls,4);
});
test('an isolate reads at most eight uploads at once',async()=>{
  const handler=createTranscriptionHandler({uploadMs:100}),env=enabled(async()=>({response:'n is even'}));
  const pending=Array.from({length:8},(_,i)=>handler({request:stalled('s'+i),env}));
  assert.equal((await handler({request:post(photo,{'cf-connecting-ip':'late'}),env})).status,429);
  for(const response of await Promise.all(pending))assert.equal(response.status,408);
  assert.equal((await handler({request:post(photo,{'cf-connecting-ip':'late'}),env})).status,200);
});
test('one IPv6 /64 network counts as one address: it cannot fill the upload slots or sidestep the cooldown',async()=>{
  let calls=0;const env=enabled(async()=>{calls++;return {response:'n is even'};});const handler=createTranscriptionHandler({uploadMs:200});
  // One client stalls uploads from eight addresses of its own /64. Only the first is read.
  const flood=Array.from({length:8},(_,i)=>handler({request:stalled(`2001:db8:1:2:${(i+1).toString(16)}::9`),env}));
  // So the eight upload slots are not used up, and learners on other networks are served meanwhile.
  for(const address of ['2001:db8:1:3::1','2001:DB8:9::1','198.51.100.7'])assert.equal((await handler({request:post(photo,{'cf-connecting-ip':address}),env})).status,200);
  assert.deepEqual((await Promise.all(flood)).map(response=>response.status),[408,...Array(7).fill(429)]);
  // The one-minute cooldown follows the network too.
  const again=await handler({request:post(photo,{'cf-connecting-ip':'2001:db8:1:3:ffff::2'}),env});
  assert.equal(again.status,429);assert.match((await again.json()).error,/Wait a minute/);assert.equal(calls,3);
  // Every spelling of an address gives the same key; a different /64 gives another.
  assert.equal(clientKey('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff'),clientKey('2001:db8:1:2::1'));
  assert.notEqual(clientKey('2001:db8:1:3::1'),clientKey('2001:db8:1:2::1'));
  assert.equal(clientKey('::1'),clientKey('0:0:0:0:0:0:0:1'));
  // An IPv4 address counts by itself however it is written, and so does a Teredo address behind a shared relay.
  for(const address of ['198.51.100.7','::ffff:198.51.100.7','::FFFF:c633:6407','0:0:0:0:0:ffff:198.51.100.7'])assert.equal(clientKey(address),'198.51.100.7');
  assert.notEqual(clientKey('2001:0:53aa:64c:1::1'),clientKey('2001:0:53aa:64c:2::1'));
  // Text that is not an address stays its own key instead of being grouped with anything.
  for(const text of ['unknown','1::2::3','12345::1','1:2:3:4:5:6:7:8:9','::ffff:999.1.1.1','fe80::1%eth0'])assert.equal(clientKey(text),text);
});
test('a photo still arriving at the upload deadline is reported as a slow connection, not a bad image',async()=>{
  let calls=0;const env=enabled(async()=>{calls++;return {response:'n is even'};});const handler=createTranscriptionHandler({uploadMs:100});
  // A complete, valid photo sent steadily in 32-byte pieces every 20 ms: it never stalls, but takes longer than the deadline.
  let sent=0,cancelled=false;
  const steady=new ReadableStream({async pull(c){await new Promise(resolve=>setTimeout(resolve,20));if(cancelled)return;c.enqueue(photo.subarray(sent,sent+=32));if(sent>=photo.length)c.close();},cancel(){cancelled=true;}},{highWaterMark:0});
  const slow=await handler({request:new Request(origin+'/api/transcribe',{method:'POST',duplex:'half',body:steady,headers:{'content-type':'image/jpeg',origin,'cf-connecting-ip':ip}}),env});
  assert.ok(photo.length/32*20>100);
  assert.equal(slow.status,408);
  const {error}=await slow.json();assert.match(error,/took too long to upload/);assert.match(error,/connection/);assert.doesNotMatch(error,/could not be read/);
  // The model was not called and no cooldown was recorded: the same photo sent at once is transcribed.
  assert.equal(calls,0);assert.equal((await handler({request:post(),env})).status,200);assert.equal(calls,1);
});
test('an upload abandoned before its cleanup runs stops blocking its address after the deadline',async()=>{
  let clock=1000;const handler=createTranscriptionHandler({uploadMs:200,now:()=>clock}),env=enabled(async()=>({response:'n is even'}));
  const abandoned=handler({request:stalled('z'),env});
  assert.equal((await handler({request:stalled('z'),env})).status,429);
  // On the handler's clock the deadline passes as if the first request's cleanup never ran: the address may upload again.
  clock+=1201;await new Promise(resolve=>setTimeout(resolve,100));
  const next=handler({request:stalled('z'),env});
  // The first request's late cleanup leaves the newer upload in place.
  assert.equal((await abandoned).status,408);
  assert.equal((await handler({request:stalled('z'),env})).status,429);
  assert.equal((await next).status,408);
});
