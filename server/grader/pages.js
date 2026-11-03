/** Same-origin Cloudflare Pages Function entry for a host-managed practice catalog and quota. */
import {evaluateProof, readEvaluatorConfig, EvaluatorError} from './provider.js';
import {readJson} from './service.js';

const allowedKeys = new Set(['questionId', 'answer', 'reference']);
const json = (data, status = 200) => Response.json(data, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
});

/** The host resolves questions from trusted source and reserves quota before starting two model calls. */
export function createPagesReviewHandler({resolveQuestion, admit}) {
  if (typeof resolveQuestion !== 'function' || typeof admit !== 'function') {
    throw new TypeError('Supply a canonical question resolver and a review admission policy.');
  }
  let active = 0;
  return async function onRequest(context) {
    const {request, env} = context;
    if (request.method !== 'POST') return json({error: 'Use POST.'}, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({error: 'Origin not allowed.'}, 403);
    if (active >= 2) return json({error: 'Two reviews are already running in this instance.'}, 429);
    active++;
    try {
      const input = await readJson(request);
      if (Object.keys(input).some(key => !allowedKeys.has(key))) {
        return json({error: 'Send only questionId, answer and optional reference.'}, 400);
      }
      if (typeof input.questionId !== 'string' || !input.questionId.trim() || input.questionId.length > 200 ||
          typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 20000) {
        return json({error: 'A valid question ID and answer of 1–20,000 characters are required.'}, 400);
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
      readEvaluatorConfig(configEnv);
      let question;
      try {
        question = await resolveQuestion({questionId: input.questionId, reference: input.reference, context});
      } catch { return json({error: 'The question catalog is unavailable.'}, 503); }
      if (!question || question.id !== input.questionId || question.type !== 'proof') {
        return json({error: 'This proof question could not be resolved from the practice catalog.'}, 404);
      }
      let admitted;
      try { admitted = await admit({request, env, question}); }
      catch { return json({error: 'The review admission service is unavailable.'}, 503); }
      if (admitted instanceof Response) return admitted;
      if (admitted !== true) return json({error: 'This review was not admitted.'}, 429);
      const result = await evaluateProof({question, answer: input.answer}, {env: configEnv});
      return json(result);
    } catch (error) {
      if (error instanceof EvaluatorError) return json({error: error.message, code: error.code}, 503);
      return json({error: error instanceof SyntaxError ? 'Malformed JSON request.' : error.message}, error.status || 400);
    } finally {
      active--;
    }
  };
}
