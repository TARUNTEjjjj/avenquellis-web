export function summarizeProgress(history, reviews, topics) {
  const first = new Map();
  for (const attempt of [...history].sort(
    (a, b) => a.finishedAt - b.finishedAt,
  ))
    for (const r of attempt.results || []) {
      const q = attempt.questions?.find((q) => q.id === r.id);
      const identity = q?.statement
        ? JSON.stringify([
            q.topic,
            q.type,
            q.statement.normalize("NFC").replace(/\s+/g, " ").trim(),
          ])
        : r.id;
      if (
        r.type === "numeric" &&
        r.status === "auto_checked" &&
        String(r.answer || "").trim() &&
        !first.has(identity)
      )
        first.set(identity, r);
    }
  const numeric = [...first.values()],
    correct = numeric.filter((r) => r.score === r.maxMarks).length;
  const latestReview = new Map();
  for (const review of [...reviews].reverse())
    latestReview.set(
      `${review.attemptId || "standalone"}:${review.questionId}`,
      review,
    );
  return {
    attempted: numeric.length,
    correct,
    accuracy: numeric.length
      ? Math.round((correct / numeric.length) * 100)
      : null,
    topics: topics.map((topic) => {
      const n = numeric.filter((r) => r.topic === topic);
      return {
        topic,
        attempted: n.length,
        correct: n.filter((r) => r.score === r.maxMarks).length,
        accuracy: n.length
          ? Math.round(
              (n.filter((r) => r.score === r.maxMarks).length / n.length) * 100,
            )
          : null,
      };
    }),
    reviewed: latestReview.size,
  };
}
