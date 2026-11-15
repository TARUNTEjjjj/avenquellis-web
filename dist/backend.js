// The creation API is the C++ generator running in Cloudflare Pages Functions.
export async function generateOnServer(mode, options, {signal} = {}) {
  const controller=new AbortController();
  const abort=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  const timeout=setTimeout(()=>controller.abort(new DOMException('The generator timed out. Try again.','TimeoutError')),20000);
  try {
  let response;
  try {
    response = await fetch('./api/generate', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({mode,...options}), signal: controller.signal
    });
  } catch (error) {
    // A cancelled or timed-out request keeps its own reason. Any other failure means the generator could not
    // be reached: the installed app works offline, but the browser's own message ("Failed to fetch") explains nothing.
    if (controller.signal.aborted) throw error;
    throw Error('Generating new questions needs an internet connection. The problem collection works offline.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw Error('Connect to Avenquellis to generate a practice set.');
  }
  const data = await response.json();
  if (!response.ok || data.engine !== 'cpp-wasm' || !data.result) {
    throw Error(data.error?.message || 'The question generator is unavailable. Try again in a moment.');
  }
  return data.result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort',abort);
  }
}

export function proofRequest(question, answer) {
  return {questionId:question.id,reference:{templateId:question.templateId,seed:question.generator?.seed,exam:question.exam,difficulty:question.requestedDifficulty},answer};
}

// Certificate preparation uses the same C++ checker on device and on the server.
// Prefer the loaded checker: a connected network does not mean the API is reachable.
// This never requests model marks; ordinary prose still needs a separate review.
export async function assessForPractice(question, answer, localGrader) {
  try {
    const result = localGrader?.assess(question, answer);
    if (result?.questionId === question.id &&
        ['verified_certificate', 'incomplete_certificate', 'needs_review'].includes(result.status)) {
      return result;
    }
  } catch { /* A failed local engine can still use the hosted checker. */ }
  return assessOnServer(question, answer);
}

export async function assessOnServer(question, answer) {
  const response = await fetch('./api/assess', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(proofRequest(question,answer)), signal:AbortSignal.timeout(15000)
  });
  // Static hosts and error pages reply with text or HTML rather than the checker's JSON.
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw Error('Connect to Avenquellis to check this proof.');
  }
  const result=await response.json();
  if (!response.ok || result.questionId !== question.id || !result.status) {
    throw Error(result.error?.message || result.error || 'The proof checker could not assess this question.');
  }
  return result;
}
