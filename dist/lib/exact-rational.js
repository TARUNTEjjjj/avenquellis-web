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
export function compareExactLiterals(left, right) {
  const a = parseExactLiteral(left),
    b = parseExactLiteral(right);
  return a && b
    ? {
        ok: true,
        equivalent: a.n === b.n && a.d === b.d,
        left: a.text,
        right: b.text,
      }
    : {
        ok: false,
        error:
          "Enter an exact integer, decimal, or fraction. Expressions require the C++ engine.",
      };
}
