export function onRequestGet({env}) {
  return Response.json({available:env.NOETHER_HOSTED_GRADING==='enabled' && typeof env.AI?.run==='function',model:env.EVALUATOR_MODEL,mode:'practice-marks'}, {headers:{'Cache-Control':'no-store'}});
}
