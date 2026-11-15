import test from 'node:test';import assert from 'node:assert/strict';import {summarizeProgress,pendingReviews} from '../dist/lib/progress.js';
test('progress counts first answered exact checks and excludes retries, blanks and pending checks',()=>{const r=(id,score,answer='1',status='auto_checked')=>({id,score,answer,status,maxMarks:10,type:'numeric',topic:'algebra'});const x=summarizeProgress([{finishedAt:2,results:[r('a',10),r('b',10)]},{finishedAt:1,results:[r('a',0),r('b',0,''),r('c',null,'2+2','checker_unavailable')]}],[],['algebra']);assert.equal(x.attempted,2);assert.equal(x.correct,1);assert.equal(x.accuracy,50);assert.equal(x.topics[0].accuracy,50)});

test('regenerated identical statements count once even when seeded IDs differ',()=>{const make=(id,score,time)=>({finishedAt:time,questions:[{id,topic:'algebra',type:'numeric',statement:'Find  2 + 2.'}],results:[{id,type:'numeric',topic:'algebra',status:'auto_checked',answer:'4',score,maxMarks:10}]});const s=summarizeProgress([make('seed2',10,2),make('seed1',0,1)],[],['algebra']);assert.equal(s.attempted,1);assert.equal(s.correct,0);});

test('a blank response needs no review; an answered one waits for an assessment linked to its attempt',()=>{
  const r=(id,answer,status='needs_review',type='proof')=>({id,type,status,answer,score:null,maxMarks:10});
  // An RMO mock with one written proof and five left blank.
  const attempt={attemptId:'attempt-1',results:[r('p1','Suppose the claim fails.'),r('p2',''),r('p3',' \n '),r('p4',''),r('p5',''),r('p6','')]};
  assert.equal(pendingReviews(attempt,[]),1);
  assert.equal(pendingReviews(attempt,[{attemptId:'attempt-1',questionId:'p1'}]),0);
  // A review of a detached draft, or of another attempt, leaves the response pending.
  assert.equal(pendingReviews(attempt,[{attemptId:null,questionId:'p1'},{attemptId:'attempt-2',questionId:'p1'}]),1);
  // Unchecked numeric answers wait too, until a later visit checks them; checked ones never do.
  const mixed={attemptId:'attempt-3',results:[r('n1','2+2','checker_unavailable','numeric'),r('n2','4','auto_checked','numeric'),r('c','w','verified_certificate')]};
  assert.equal(pendingReviews(mixed,[]),1);
  // An official-paper response has no rubric and no review to link to the attempt: it is compared with the
  // official paper, so it never waits, answered or not.
  const reference={attemptId:'attempt-4',results:[r('ref1','My working','needs_review','reference'),r('ref2','','needs_review','reference')]};
  assert.equal(pendingReviews(reference,[]),0);
  // A numeric answer beyond the checker's bounds can never be checked or reviewed: it does not wait, and it is not counted.
  const beyond=r('n3','99999999999999999999','beyond_checker_bounds','numeric');
  assert.equal(pendingReviews({...mixed,results:[...mixed.results,beyond]},[]),1);
  assert.equal(summarizeProgress([{finishedAt:1,results:[{...beyond,topic:'algebra'}]}],[],['algebra']).attempted,0);
});
