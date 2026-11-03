// The creation API is the C++ generator running in Cloudflare Pages Functions.
export async function generateOnServer(mode, options) {
  const response = await fetch('./api/generate', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({mode,...options}), signal: AbortSignal.timeout(20000)
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw Error('Connect to Avenquellis to generate a practice set.');
  }
  const data = await response.json();
  if (!response.ok || data.engine !== 'cpp-wasm' || !data.result) {
    throw Error(data.error?.message || 'The question generator is unavailable. Try again in a moment.');
  }
  return data.result;
}

export function proofRequest(question, answer) {
  return {questionId:question.id,reference:{templateId:question.templateId,seed:question.generator?.seed,exam:question.exam,difficulty:question.requestedDifficulty},answer};
}

export async function assessOnServer(question, answer) {
  const response = await fetch('./api/assess', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(proofRequest(question,answer)), signal:AbortSignal.timeout(15000)
  });
  const result=await response.json();
  if (!response.ok || result.questionId !== question.id || !result.status) {
    throw Error(result.error?.message || result.error || 'The proof checker could not assess this question.');
  }
  return result;
}
