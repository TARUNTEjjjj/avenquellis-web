export function onRequestGet({env}) {
  return Response.json({available:env.AVENQUELLIS_HOSTED_GRADING==='enabled' && typeof env.AI?.run==='function',model:env.EVALUATOR_MODEL,protocol:env.EVALUATOR_PROTOCOL||'verbatim-v1',mode:'practice-marks'}, {headers:{'Cache-Control':'no-store'}});
}
