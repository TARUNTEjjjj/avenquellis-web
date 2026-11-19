/** Same-origin Cloudflare Pages Function entry for a host-managed practice catalog and quota. */
import {boundedInput, evaluateProof, readEvaluatorConfig, reserveBindingSlots, EvaluatorError} from './provider.js';
import {makeSpanReviewRequest} from './span-v2.js';
import {isWellFormedText} from './index.js';
import {readJson} from './service.js';
import {applyNativeConsensus} from './native-consensus.js';
export {applyNativeConsensus} from './native-consensus.js';

const allowedKeys = new Set(['questionId', 'answer', 'reference']);
const json = (data, status = 200) => Response.json(data, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
});

/** The host resolves questions from trusted source and reserves quota before starting two model calls. */
export function createPagesReviewHandler({resolveQuestion, admit, loadGrader, assessmentOnly = false}) {
  if (typeof resolveQuestion !== 'function' || typeof admit !== 'function') {
    throw new TypeError('Supply a canonical question resolver and a review admission policy.');
  }
  if ((assessmentOnly || loadGrader !== undefined) && typeof loadGrader !== 'function') throw new TypeError('A native grading runtime is required.');
  // Counts only model reviews, from admission until the native recheck finishes.
  let active = 0;
  return async function onRequest(context) {
    const {request, env} = context;
    if (request.method !== 'POST') return json({error: 'Use POST.'}, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({error: 'Origin not allowed.'}, 403);
    try {
      const input = await readJson(request);
      if (Object.keys(input).some(key => !allowedKeys.has(key))) {
        return json({error: 'Send only questionId, answer and optional reference.'}, 400);
      }
      // Assessment never calls the model, so it allows assessProof's 50,000 characters; model review keeps the provider's 20,000.
      if (typeof input.questionId !== 'string' || !input.questionId.trim() || input.questionId.length > 200 ||
          typeof input.answer !== 'string' || (!assessmentOnly && !input.answer.trim()) ||
          input.answer.length > (assessmentOnly ? 50000 : 20000) || !isWellFormedText(input.answer)) {
        return json({error: assessmentOnly
          ? 'A valid question ID and a well-formed answer of up to 50,000 characters are required.'
          : 'A valid question ID and a well-formed answer of 1–20,000 characters are required.'}, 400);
      }
      if (input.reference !== undefined && (input.reference === null || typeof input.reference !== 'object' ||
          Array.isArray(input.reference) || JSON.stringify(input.reference).length > 2048)) {
        return json({error: 'Invalid question reference.'}, 400);
      }
      const configEnv = {
        EVALUATOR_PROVIDER: 'workers-ai', AI: env.AI,
        EVALUATOR_MODEL: env.EVALUATOR_MODEL,
        EVALUATOR_PROTOCOL: env.EVALUATOR_PROTOCOL,
        EVALUATOR_TIMEOUT_MS: env.EVALUATOR_TIMEOUT_MS,
        EVALUATOR_MAX_TOKENS: env.EVALUATOR_MAX_TOKENS
      };
      let question;
      try {
        question = await resolveQuestion({questionId: input.questionId, reference: input.reference, context});
      } catch { return json({error: 'The question catalog is unavailable.'}, 503); }
      if (!question || question.id !== input.questionId || question.type !== 'proof') {
        return json({error: 'This proof question could not be resolved from the practice catalog.'}, 404);
      }
      let grader;
      if (loadGrader) {
        try {
          grader = await loadGrader();
          const assessment = grader.assess(question, input.answer);
          if (assessmentOnly || assessment.status !== 'needs_review') return json(assessment);
        } catch { return json({error:'The native proof grader is unavailable.',code:'native_unavailable'},503); }
      }
      const config = readEvaluatorConfig(configEnv);
      // Input the evaluator would refuse fails here, before admission spends the caller's allowance.
      const prepared = boundedInput({question, answer: input.answer});
      if (config.protocol === 'span-v2') makeSpanReviewRequest(prepared.question, prepared.answer, 0, config.maxTokens);
      if (active >= 2) return json({error: 'Two reviews are already running in this instance.'}, 429);
      // Calls from earlier reviews can hold the binding past their deadline, so both passes are
      // reserved here, before admission, and held until the evaluation starts them.
      const reservation = reserveBindingSlots(config);
      if (!reservation) return json({error: 'The evaluator is busy. Try again later.', code: 'provider_busy'}, 429);
      active++;
      try {
        let admitted;
        try { admitted = await admit({request, env, question}); }
        catch { return json({error: 'The review admission service is unavailable.'}, 503); }
        if (admitted instanceof Response) return admitted;
        if (admitted !== true) return json({error: 'This review was not admitted.'}, 429);
        const result = await evaluateProof({question, answer: input.answer}, {env: configEnv, reservation});
        if (!grader) return json(result);
        try { return json(applyNativeConsensus(question,input.answer,result,grader)); }
        catch { return json({error:'The native proof review could not be validated.',code:'native_validation_failed'},503); }
      } finally {
        active--;
        reservation.release();
      }
    } catch (error) {
      if (error instanceof EvaluatorError) return json({error: error.message, code: error.code}, 503);
      return json({error: error instanceof SyntaxError ? 'Malformed JSON request.' : error.message}, error.status || 400);
    }
  };
}
