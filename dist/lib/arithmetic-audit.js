/** Check explicit arithmetic equalities only. These checks never certify a proof. */
export function auditArithmetic(answer, check) {
  if (typeof answer !== "string" || answer.length > 50000)
    throw new TypeError("Proof text must contain at most 50,000 characters.");
  if (typeof check !== "function")
    return {
      checked: 0,
      contradictions: 0,
      claims: [],
      notice: "The exact arithmetic checker is unavailable.",
    };
  const claims = [];
  let lineNumber = 0;
  for (const line of answer.split("\n")) {
    lineNumber++;
    const text = line.trim();
    if (!text.includes("=")) continue;
    // Only whole lines in a bounded ASCII arithmetic grammar are candidates.
    if (!/^[\d\s.+\-*/()=]+$/.test(text) || text.length > 4096) continue;
    const parts = text.split("=").map((x) => x.trim());
    if (parts.some((x) => !x) || parts.length > 12) continue;
    for (let i = 0; i < parts.length - 1 && claims.length < 100; i++) {
      let result;
      try {
        result = check(parts[i], parts[i + 1]);
      } catch {
        result = { ok: false, error: "Checker did not complete." };
      }
      claims.push({
        line: lineNumber,
        left: parts[i],
        right: parts[i + 1],
        status: result.ok
          ? result.equivalent
            ? "verified"
            : "contradiction"
          : "unsupported",
        normalizedLeft: result.left ?? null,
        normalizedRight: result.right ?? null,
        error: result.error ?? null,
      });
    }
    if (claims.length >= 100) break;
  }
  return {
    checked: claims.filter((c) => c.status !== "unsupported").length,
    contradictions: claims.filter((c) => c.status === "contradiction").length,
    claims,
    notice:
      "Only explicit arithmetic equalities were checked. Logical steps, variables, theorem applications, inequalities, and the complete proof still require review.",
  };
}
