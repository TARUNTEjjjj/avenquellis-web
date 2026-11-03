/** Only native-validated readings can contribute to the published proposal or its rubric details. */
export function applyNativeConsensus(question, answer, modelResult, grader) {
  const checked = grader.compare(question, answer, modelResult.reviews);
  const reviews = checked.reviews.map((row, i) => {
    const old = modelResult.reviews[i];
    if (row.status === 'proposal') return row;
    return {...row, failure: old?.failure || {code: 'native_reading_invalid', message:'The reading did not pass native evidence validation.'}};
  });
  const criteria = question.rubric.map(c => {
    const readers = reviews.map(row => ({
      reviewer:row.reviewer, points:row.status === 'proposal' ? row.criterionScores[c.id] : null,
      quotes:(row.evidence || []).filter(e=>e.criterionId === c.id).map(e=>e.quote)
    }));
    const both=readers.every(r=>r.points!==null), match=both && readers[0].points===readers[1].points;
    return {id:c.id,description:c.description,maxPoints:c.points,reviewers:readers,
      agreedPoints:match ? readers[0].points : null,status:match?'agreement':both?'disagreement':'insufficient_reviews'};
  });
  const complete = reviews.every(r=>r.status==='proposal');
  const agree = checked.suggestedScore !== null;
  return {...modelResult,...checked, reviews, criterionProposals:criteria,score:null,provisionalScore:null,
    suggestedCriterionScores:agree?{...reviews[0].criterionScores}:null,
    reviewerScoreRange:complete?{min:Math.min(...reviews.map(r=>r.score)),max:Math.max(...reviews.map(r=>r.score))}:null,
    reviewReason:agree?'agreement_requires_human_validation':complete?'reviewer_disagreement':'evaluator_failure',
    uncertainty:{kind:agree?'agreement':complete?'disagreement':'insufficient_reviews', calibrated:false,
      explanation:'Both readers share a model. Matching marks and evidence excerpts do not establish mathematical correctness.'},
    provenance:{...modelResult.provenance,...checked.provenance},assessmentType:'model_assisted_review'};
}
