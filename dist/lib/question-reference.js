// The generation metadata a grading host needs to rebuild a saved question from its own catalog.
// The question engine resolves a reference only to the content of its family's version, so a
// saved question keeps naming exactly what its learner saw. generator.version is that content
// version, and generated and bank questions have always stored it (as 0.1.0 until now). A question
// without one sends no version, which the engine reads as 0.1.0, the version of every question
// issued before references carried one.
// The hosted adapter accepted `version` before this app sent it, as the engine's migration order requires.
export function questionReference(question) {
  const reference = {
    templateId: question.templateId,
    seed: question.generator?.seed,
    exam: question.exam,
    difficulty: question.requestedDifficulty,
  };
  if (typeof question.generator?.version === 'string') reference.version = question.generator.version;
  return reference;
}
