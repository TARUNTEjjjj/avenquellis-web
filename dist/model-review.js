import {certificateResult} from './certificate-ui.js';
import {preloadNativeGrader} from './lib/native-grader.js';
import {applyNativeConsensus} from './lib/native-consensus.js';
import {validateModelReviews} from './lib/backup.js';
import {resolveQuestionRef} from './lib/questions.js';
import {optionalResource} from './lib/startup.js';
const storageKey='avenquellis.prose-reviews.v1';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const refFor=q=>({templateId:q.templateId,seed:q.generator?.seed,exam:q.exam,difficulty:q.requestedDifficulty});
const rubricRows=r=>(r||[]).map(c=>({id:c.id,description:c.description,points:c.points}));
// Earlier releases hashed advanced-template rubrics in this row order; their saved reviews keep matching.
const legacyRows=r=>(r||[]).map(c=>({id:c.id,points:c.points,description:c.description}));
function canonical(q){const known=resolveQuestionRef({id:q.id,...refFor(q)});return known?.type==='proof' && known.statement===q.statement && JSON.stringify(rubricRows(known.rubric))===JSON.stringify(rubricRows(q.rubric))?known:null;}
async function keyFor(q,answer,rows=rubricRows){const bytes=new TextEncoder().encode(JSON.stringify([q.id,q.statement,rows(q.rubric),answer]));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
let cachedText, cachedRecords = [];
export function modelReviewRecords() {
  try {
    const text = localStorage.getItem(storageKey) ?? localStorage.getItem('noether.prose-reviews.v1');
    if (text !== cachedText) {
      cachedRecords = validateModelReviews(JSON.parse(text) ?? [], false);
      cachedText = text;
    }
    return cachedRecords;
  } catch { return []; }
}
export function replaceModelReviews(records) {
  try {
    const checked = validateModelReviews(records, false);
    const encoded = JSON.stringify(checked);
    localStorage.setItem(storageKey, encoded);
    cachedText = encoded;
    cachedRecords = checked;
    return true;
  } catch { return false; }
}
export async function rememberModelReview(q, answer, review) {
  const key = await keyFor(q, answer), legacy = await keyFor(q, answer, legacyRows);
  const records = modelReviewRecords().filter(row => (row.key !== key && row.key !== legacy) || row.review.provider !== review.provider);
  const latest = [{key, review}, ...records];
  // Evict both readings of the least recent answer together.
  const keys = new Set([...new Set(latest.map(row => row.key))].slice(0, 20));
  return replaceModelReviews(latest.filter(row => keys.has(row.key)));
}
export async function storedModelReviews(q, answer) {
  if (q?.type !== 'proof' || !answer) return [];
  const keys = [await keyFor(q, answer), await keyFor(q, answer, legacyRows)];
  return modelReviewRecords().filter(row => keys.includes(row.key)).map(row => row.review)
    .sort((a, b) => Number(a.provider === 'browser-webllm') - Number(b.provider === 'browser-webllm'));
}
function compact(r,q){return {model:r.provenance?.model,provider:r.provenance?.provider,promptVersion:r.provenance?.promptVersion,date:new Date().toISOString(),max:q.maxMarks,suggested:r.suggestedScore,range:r.reviewerScoreRange,criteria:r.criterionProposals||[],reviews:(r.reviews||[]).map(v=>({number:v.reviewer,status:v.status,score:v.score,rationale:v.rationale,gaps:v.gaps,code:v.failure?.code})),notice:r.uncertainty?.explanation};}
function criterionView(c) {
  const [a,b]=c.reviewers, both=a?.points!=null && b?.points!=null;
  const agreed=both && a.points===b.points, tally=agreed?`${a.points} / ${c.maxPoints}`:both?`${a.points} vs ${b.points} / ${c.maxPoints}`:'Needs review';
  const evidence=[...new Set(c.reviewers.flatMap(v=>v.quotes||[]))].slice(0,4);
  return `<article class="grade-criterion"><div class="grade-criterion-head"><strong>${escape(c.description)}</strong><span class="grade-tally ${agreed && a.points===c.maxPoints?'full':agreed?'partial':''}">${escape(tally)}</span></div><p class="tiny">${agreed?'Both readings agree':c.reviewers.map(v=>`Reading ${escape(v.reviewer)}: ${v.points==null?'unavailable':escape(v.points)+' / '+escape(c.maxPoints)}`).join(' · ')}</p>${evidence.map(t=>`<blockquote>${escape(t)}</blockquote>`).join('')}</article>`;
}
export function modelResult(r){
  const local=r.provider==='browser-webllm';
  const valid=r.reviews.filter(v=>v.status==='proposal');
  const title=Number.isInteger(r.suggested)?`Suggested mark · ${r.suggested} / ${r.max}`:r.range?`Readings differ · ${r.range.min}–${r.range.max} / ${r.max}`:valid.length?'One reading available · needs another review':'Could not assign a mark';
  const reason=r.reviews.some(v=>v.code==='daily_quota')?'The free daily allowance has been reached.':r.reviews.some(v=>v.code==='timeout')?'A reading timed out.':r.reviews.some(v=>['provider_busy','provider_failure'].includes(v.code))?'The hosted reviewer was unavailable.':!valid.length?'Neither reading supplied valid rubric evidence.':'';
  const gaps=[...new Set(valid.flatMap(v=>v.gaps||[]))].slice(0,3);
  return `<section class="model-result" aria-label="Model marking proposal"><h3>${local?'Experimental local feedback':escape(title)}</h3>${local?'<p>The local model matched 3 of its 12 proposed marks in our 24-proof pilot. Use its comments to revisit your proof; ask a human to decide the mark.</p>':''}<p class="tiny">Practice feedback · ${escape(r.model)}${local?'':r.promptVersion?.endsWith('-v2')?' · reviewer v2':' · reviewer v1'} · ${escape(new Date(r.date).toLocaleDateString())}</p>${r.imported?'<p class="tiny">Imported practice review · provider identity and result unverified.</p>':''}${reason?`<p>${escape(reason)}</p>`:''}${gaps.length?`<div class="grade-gaps"><strong>What to revisit</strong><ul>${gaps.map(g=>`<li>${escape(g)}</li>`).join('')}</ul></div>`:''}${r.criteria.map(criterionView).join('')}${valid.map(v=>`<details class="details"><summary>Reading ${escape(v.number)} · ${escape(v.score)} / ${escape(r.max)}</summary><p>${escape(v.rationale)}</p>${(v.gaps||[]).map(g=>`<p class="tiny">${escape(g)}</p>`).join('')}</details>`).join('')}<p class="tiny spacer">Two readings use the same model. A human reviewer can assess an alternative argument or resolve a disputed mark.</p></section>`;
}
export function modelPanel(){return `<section class="card spacer" id="prose-model"><span class="eyebrow">FREE-FORM PROOF MARKING</span><h3>Request a review of your argument</h3><p>Write your proof above. Two readings compare your reasoning with the rubric and cite passages for each proposed award. If the readings disagree or lack evidence, your proof stays open for review. <a href="#sources">See the comparison with human graders.</a></p><div data-host-choice hidden><button class="button violet" data-host-grade type="button">Mark my proof</button><p class="tiny">This sends your proof and the problem to Cloudflare Workers AI for practice marking.</p></div><div data-device-choice><details class="details"><summary>Experimental feedback on this device</summary><p class="tiny">Runs locally on a WebGPU-capable device. The first use downloads roughly 1 GB of Qwen3 model files and needs about 2 GB of GPU memory. Your proof stays in this browser. In a 24-proof pilot this model agreed on a mark 12 times and matched the human score only 3 times.</p><button class="button secondary" data-device-grade type="button">Load model for local feedback</button></details></div><p data-model-status class="tiny" role="status"></p><div data-model-result aria-live="polite"></div></section>`;}
async function hostedAvailable(){try{const response=await fetch('./api/grade-status',{cache:'no-store',signal:AbortSignal.timeout(10000)});return response.ok && (await response.json()).available===true;}catch{return false;}}
export function bindModelPanel(q,field){
 const panel=document.getElementById('prose-model');if(!panel||!field)return;
 const status=panel.querySelector('[data-model-status]'),output=panel.querySelector('[data-model-result]'),host=panel.querySelector('[data-host-grade]'),device=panel.querySelector('[data-device-grade]');
 const question=canonical(q);if(!question){panel.hidden=true;return;}
 let revision=0,busy=false;
 const current=(rev)=>panel.isConnected && rev===revision;
 const refresh = async () => {
   const rev = ++revision;
   output.replaceChildren();
   status.textContent = '';
   const prior = await storedModelReviews(q, field.value);
   if (current(rev)) output.innerHTML = prior.map(modelResult).join('');
 };
 field.addEventListener('input',refresh);void refresh();
 void hostedAvailable().then(available=>{if(!panel.isConnected)return;panel.querySelector('[data-host-choice]').hidden=!available;const details=panel.querySelector('[data-device-choice] details');details.open=!available;if(!navigator.gpu){device.disabled=true;details.querySelector('p').textContent='This browser does not expose WebGPU. Try a WebGPU-capable browser or use hosted marking when available.';}});
 const grade=async(location)=>{
   if(busy)return;const answer=field.value;if(!answer.trim()||answer.length>20000){status.textContent='Enter a proof of 1–20,000 characters first.';return;}
   const rev=++revision;busy=true;host.disabled=true;device.disabled=true;output.replaceChildren();status.textContent=location==='cloud'?'Reading your proof twice…':'Preparing the on-device model…';
   try{let result;
     if(location==='cloud'){const response=await fetch('./api/grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId:q.id,reference:refFor(q),answer}),signal:AbortSignal.timeout(100000)});if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Hosted marking is unavailable. Try the on-device option.');const data=await response.json();if(!response.ok)throw new Error(data.error?.message||data.error||'Hosted marking is unavailable.');result=data;}
     else {
       const {gradeOnDevice, releaseDeviceModel} = await import('./device-runtime/device.js');
       try {
         result = await gradeOnDevice(question, answer, progress => {
           if (current(rev)) status.textContent = progress?.text || 'Reading your proof locally…';
         });
       } finally {
         // Cached model files remain available for the next review without holding GPU memory between tests.
         await releaseDeviceModel().catch(() => {});
       }
     }
     if (result?.lowerBoundPoints != null) {
       if (current(rev)) {
         output.innerHTML=certificateResult(result);
         status.textContent='Certificate checked by Avenquellis.';
       }
       return;
     }
     if(location==='device'){
       // A stalled checker download gets the same deadline as at startup, not an endless wait.
       const grader=await optionalResource(preloadNativeGrader);
       if(!grader)throw new Error('The proof checker could not load. Your draft is saved.');
       result=applyNativeConsensus(question,answer,result,grader);
     }
     const review = compact(result, q);
     const hasMarks = review.reviews.some(v => v.status === 'proposal');
     const persisted = hasMarks && await rememberModelReview(q, answer, review);
     if (!current(rev) || field.value !== answer) return;
     const prior = await storedModelReviews(q, answer);
     if (!current(rev)) return;
     // A failed retry remains visible without replacing the previous completed review.
     const display = persisted ? prior : [...prior, review];
     output.innerHTML = display.map(modelResult).join('');
     status.textContent = persisted ? 'Practice review saved on this device.' : hasMarks ? 'Practice review ready. Browser storage is unavailable.' : 'Review incomplete. You can try again or request human review.';
   }catch(error){if(current(rev))status.textContent=error?.name==='TimeoutError'?'The reviewer timed out. Your draft is saved.':error?.message||'Marking failed. Your draft is saved.';}
   finally{busy=false;host.disabled=false;device.disabled=!navigator.gpu;}
 };host.onclick=()=>grade('cloud');device.onclick=()=>grade('device');
}
export async function showModelReport(q, answer, slot) {
  if (!slot) return;
  const reviews = await storedModelReviews(q, answer);
  if (slot.isConnected) slot.innerHTML = reviews.map(modelResult).join('');
}
