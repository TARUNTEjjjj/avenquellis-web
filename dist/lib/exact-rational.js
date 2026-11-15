// Exact literal-only fallback when the compiled AxiomMath module is unavailable.
// Arithmetic expressions are handled by C++/WebAssembly, never by eval or floats.
const MAX = 9223372036854775807n;
const MIN = -9223372036854775808n;
const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  while (b) {
    const r = a % b;
    a = b;
    b = r;
  }
  return a;
};
function reduced(n, d) {
  if (!d) return null;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  n /= g;
  d /= g;
  if (n < MIN || n > MAX || d > MAX) return null;
  return { n, d, text: d === 1n ? String(n) : `${n}/${d}` };
}
function decimal(s) {
  const m = s.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
  if (!m || !(m[2] || m[3])) return null;
  if (m[2].length > 19 || (m[3] || "").length > 18) return null;
  const f = m[3] || "";
  return reduced(
    (m[1] === "-" ? -1n : 1n) * BigInt((m[2] || "0") + f),
    10n ** BigInt(f.length),
  );
}
export function parseExactLiteral(value) {
  const s = String(value ?? "").trim();
  if (!s || s.length > 200) return null;
  try {
    const parts = s.split("/");
    if (parts.length > 2) return null;
    const a = decimal(parts[0].trim());
    if (!a) return null;
    if (parts.length === 1) return a;
    const b = decimal(parts[1].trim());
    return b ? reduced(a.n * b.d, a.d * b.n) : null;
  } catch {
    return null;
  }
}
const LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
// A literal, or a quotient of two with a nonzero divisor, that is well formed and defined but outside the bounds above.
function beyondBounds(value) {
  const parts = String(value ?? "").trim().split("/").map((part) => part.trim());
  return (
    parts.length <= 2 &&
    parts.every((part) => LITERAL.test(part)) &&
    (parts.length === 1 || /[1-9]/.test(parts[1])) &&
    !parseExactLiteral(value)
  );
}
export function compareExactLiterals(left, right) {
  const a = parseExactLiteral(left),
    b = parseExactLiteral(right);
  if (!b) return {
    ok: false,
    side: "right",
    error: "The answer key cannot be read by the literal fallback. Load the C++ checker.",
  };
  if (!a) return {
    ok: false,
    side: "left",
    // Like the C++ engine's bounds, this message says "exceeds": the answer is not wrong, only too large to check here.
    error: beyondBounds(left)
      ? "This number exceeds the exact checker's bounds: 200 characters, 19 integer digits, 18 fractional digits and a signed 64-bit reduced value."
      : "Enter an exact integer, decimal, or fraction. Expressions require the C++ engine.",
  };
  return {
    ok: true,
    equivalent: a.n === b.n && a.d === b.d,
    left: a.text,
    right: b.text,
  };
}
