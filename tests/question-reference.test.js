import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest as assess} from '../functions/api/assess.js';
import {getNativeGenerator} from '../server/native-generator/index.js';
import {questionReference} from '../dist/lib/question-reference.js';
import {proofRequest} from '../dist/backend.js';
import {generateMock, questionBank, resolveQuestionRef} from '../dist/lib/questions.js';
import {initExactMath, evaluateExact} from '../dist/math/exact-math.js';
import {evaluationView} from '../dist/math-lab.js';

const base = 'https://avenquellis.pages.dev';
const proof = 'Every common divisor of n and n+k also divides their difference k.';
const generated = generateMock({exam: 'RMO', count: 6, seed: 'versioned-reference'}).questions[0];
const bank = questionBank.find(q => q.type === 'proof');
const withoutVersion = ({version, ...reference}) => reference;
const post = body => assess({request: new Request(base + '/api/assess', {
  method: 'POST', headers: {'Content-Type': 'application/json', Origin: base}, body: JSON.stringify(body)
}), env: {}});

test('sent references carry the saved content version, and questions without one stay unversioned', () => {
  assert.equal(generated.generator.version, '0.1.0');
  assert.deepEqual(questionReference(generated), {
    templateId: generated.templateId, seed: generated.generator.seed, exam: generated.exam,
    difficulty: generated.requestedDifficulty, version: '0.1.0'
  });
  assert.deepEqual(proofRequest(generated, proof), {questionId: generated.id, reference: questionReference(generated), answer: proof});
  // A saved question from before generator metadata, or with a damaged version, sends no version key at all.
  const legacy = {...generated, generator: {kind: generated.generator.kind, seed: generated.generator.seed}};
  assert.equal(Object.hasOwn(questionReference(legacy), 'version'), false);
  assert.equal(Object.hasOwn(questionReference({...generated, generator: {...generated.generator, version: 1}}), 'version'), false);
  assert.equal(Object.hasOwn(questionReference({id: 'official', type: 'proof'}), 'version'), false);
});

test('the synchronized adapter resolves versioned and legacy references and rejects another version', async () => {
  const engine = await getNativeGenerator();
  for (const q of [generated, bank]) {
    const reference = {id: q.id, ...questionReference(q)};
    assert.deepEqual(engine.resolve(reference), q, 'versioned reference');
    // Clients before this release sent no version; such a reference names 0.1.0.
    assert.deepEqual(engine.resolve(withoutVersion(reference)), q, 'legacy unversioned reference');
    assert.deepEqual(resolveQuestionRef(reference), q);
    assert.deepEqual(resolveQuestionRef(withoutVersion(reference)), q);
    for (const version of ['0.2.0', '0.1', '', 'x'.repeat(300)]) {
      assert.equal(engine.resolve({...reference, version}), null, `native rejects version ${JSON.stringify(version)}`);
      assert.equal(resolveQuestionRef({...reference, version}), null, `browser rejects version ${JSON.stringify(version)}`);
    }
    for (const version of [1, null, {}]) {
      assert.equal(engine.resolve({...reference, version}), null);
      assert.equal(resolveQuestionRef({...reference, version}), null);
    }
  }
});

test('the hosted checker grades versioned and legacy references and refuses a mismatched version', async () => {
  const body = proofRequest(generated, proof);
  const versioned = await post(body);
  assert.equal(versioned.status, 200);
  assert.equal((await versioned.json()).questionId, generated.id);
  const legacy = await post({...body, reference: withoutVersion(body.reference)});
  assert.equal(legacy.status, 200);
  assert.equal((await legacy.json()).questionId, generated.id);
  const mismatched = await post({...body, reference: {...body.reference, version: '0.2.0'}});
  assert.equal(mismatched.status, 404);
  assert.match((await mismatched.json()).error, /could not be resolved/);
  // A bank question's id and version alone still name its fixed edition.
  assert.equal((await post({questionId: bank.id, reference: {version: '0.1.0'}, answer: proof})).status, 200);
  assert.equal((await post({questionId: bank.id, reference: {version: '9.0.0'}, answer: proof})).status, 404);
});

test('the shipped arithmetic engine caps long traces and the lab says how many steps it left out', async () => {
  await initExactMath();
  const expression = Array(512).fill('1').join('+');
  const result = evaluateExact(expression);
  assert.equal(result.ok, true);
  assert.equal(result.value, '512');
  assert.ok(Number.isSafeInteger(result.omittedSteps) && result.omittedSteps > 0);
  assert.equal(result.steps.length + result.omittedSteps, 511);
  assert.ok(Buffer.byteLength(JSON.stringify(result.steps)) <= 64 * 1024);
  const view = evaluationView(result);
  assert.match(view, /<strong>512<\/strong>/);
  assert.equal((view.match(/<li>/g) ?? []).length, result.steps.length);
  assert.match(view, new RegExp(`${result.omittedSteps.toLocaleString('en-US')} later steps are not listed`));
  // A short expression has no omitted steps and no note.
  const short = evaluateExact('(1/3 + 1/6) * 4');
  assert.equal(short.omittedSteps, undefined);
  assert.doesNotMatch(evaluationView(short), /not listed/);
  assert.match(evaluationView({ok: true, value: '2', steps: [{expression: '1+1', value: '2'}], omittedSteps: 1}), /first step\. 1 later step is not listed/);
});
