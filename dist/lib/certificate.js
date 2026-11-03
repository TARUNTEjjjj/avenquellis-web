/** A small proof language for two exact Noether templates. All numeral checks use BigInt. */
const HEADER = 'NOETHER-PROOF/1';
const MAX_TEXT = 2048;
const MAX_COEFFICIENT = 1000000n;
const GCD_CONCLUSION = 'same-positive-divisors -> equal-maxima';

const families = new Map([
  ['number-consecutive', {
    title: 'Three consecutive factors', difficulty: 'foundation', minimum: 1, maximum: 12,
    statement: k => `Prove that (n + ${k})(n + ${k + 1})(n + ${k + 2}) is divisible by 6 for every integer n.`,
    rubric: [
      'Explain why a factor is divisible by 3.',
      'Explain why a factor is even.',
      'Use coprimality to conclude divisibility by 6 for every integer.'
    ],
    fields: ['mod3', 'mod2', 'bezout'],
    blanks: ['_ _ _', '_ _', '_ _'],
    instructions: 'Choose an offset 0, 1 or 2 to select a factor n+k+offset. On mod3, enter one offset for each residue of n modulo 3, in order 0, 1, 2. Each selected factor must be divisible by 3. On mod2, enter offsets for residues 0, 1 so each selected factor is even. On bezout, enter two integers u v satisfying 2u+3v=1. Separate numbers with spaces. Keep family and k as supplied.'
  }],
  ['number-gcd', {
    title: 'An invariant greatest common divisor', difficulty: 'advanced', minimum: 7, maximum: 30,
    statement: k => `Prove that gcd(n, n + ${k}) = gcd(n, ${k}) for every positive integer n.`,
    rubric: [
      'Prove every common divisor of n and n+k divides k.',
      'Prove the converse inclusion of common divisors.',
      'Conclude equality of the greatest positive common divisors.'
    ],
    fields: ['forward', 'reverse', 'conclusion'],
    blanks: ['_ _', '_ _', '_'],
    instructions: `On forward, enter integers A B proving k = A·n + B·(n+k) for every positive integer n. On reverse, enter integers C D proving n+k = C·n + D·k for every such n. When both inclusions hold, invoke the inference rule by entering “${GCD_CONCLUSION}” on conclusion. Separate coefficients with spaces. Keep family and k as supplied.`
  }]
]);

/** Bind the verifier to the theorem and rubric semantics, not merely a caller-provided family tag. */
function matchQuestion(question) {
  const family = families.get(question?.templateId);
  if (!family || question.type !== 'proof' || question.topic !== 'number-theory' ||
      question.title !== family.title || question.difficulty !== family.difficulty ||
      question.maxMarks !== 10 || question.source?.kind !== 'original' ||
      question.generator?.kind !== 'deterministic-template' || question.generator.version !== '0.1.0') return null;
  if (typeof question.id !== 'string' || !question.id.startsWith(`${question.templateId}-`)) return null;
  const suffix = question.id.slice(question.templateId.length + 1);
  if (!/^[a-z0-9]{1,7}$/.test(suffix)) return null;
  const params = question.parameters;
  if (!params || Object.keys(params).length !== 1 || !Object.hasOwn(params, 'k') ||
      !Number.isSafeInteger(params.k) || params.k < family.minimum || params.k > family.maximum) return null;
  if (question.statement !== family.statement(params.k) || !Array.isArray(question.rubric) ||
      question.rubric.length !== family.rubric.length) return null;
  const weights = [4, 4, 2];
  for (const [index, description] of family.rubric.entries()) {
    const criterion = question.rubric[index];
    if (criterion?.id !== `step-${index + 1}` || criterion.description !== description ||
        criterion.points !== weights[index] || Object.keys(criterion).length !== 3) return null;
  }
  return family;
}

export function certificateHelp(question) {
  const family = matchQuestion(question);
  if (!family) return null;
  const lines = [HEADER, `family: ${question.templateId}`, `k: ${question.parameters.k}`];
  family.fields.forEach((field, i) => lines.push(`${field}: ${family.blanks[i]}`));
  return {instructions: family.instructions, scaffold: lines.join('\n'), fields: [...family.fields]};
}

function parseFields(text, family, question) {
  if (text.length > MAX_TEXT) return {error: 'Certificate exceeds the 2,048-character limit.'};
  const lines = text.replace(/\r\n/g, '\n').split('\n').slice(1);
  const allowed = new Set(['family', 'k', ...family.fields]);
  const fields = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = /^([a-z0-9]+):[ \t]*([^\x00-\x08\x0a-\x1f\x7f]*)$/.exec(line);
    if (!match || !allowed.has(match[1]) || fields.has(match[1])) {
      return {error: 'Use each named field once. Put any free-form proof in a separate answer.'};
    }
    fields.set(match[1], match[2].trim());
  }
  if (fields.get('family') !== question.templateId || fields.get('k') !== String(question.parameters.k)) {
    return {error: 'The family and k fields must identify this exact question.'};
  }
  return {fields};
}

function integers(value, count) {
  if (!value) return null;
  const tokens = value.split(/[ \t]+/);
  if (tokens.length !== count || tokens.some(token => !/^[+-]?\d{1,7}$/.test(token))) return null;
  const numbers = tokens.map(token => BigInt(token));
  if (numbers.some(n => n < -MAX_COEFFICIENT || n > MAX_COEFFICIENT)) return null;
  return numbers;
}

function checkResidues(value, modulus, k) {
  const offsets = integers(value, modulus);
  if (!offsets) return {verified: false, feedback: `Supply ${modulus} integer offsets for residues 0 to ${modulus - 1}.`};
  const divisor = BigInt(modulus);
  for (const [r, offset] of offsets.entries()) {
    if (offset < 0n || offset > 2n) return {verified: false, feedback: `At residue ${r}, choose one of the three actual factor offsets 0, 1 or 2.`};
    if ((BigInt(r) + k + offset) % divisor !== 0n) {
      return {verified: false, feedback: `At residue ${r}, n+k+${offset} is not a multiple of ${modulus}.`};
    }
  }
  return {verified: true, feedback: `Every residue of n modulo ${modulus} has a selected factor divisible by ${modulus}. This covers all integers, including zero and negative n.`};
}

function checkConsecutive(fields, k) {
  const byThree = checkResidues(fields.get('mod3'), 3, k);
  const byTwo = checkResidues(fields.get('mod2'), 2, k);
  const pair = integers(fields.get('bezout'), 2);
  let conclusion;
  if (!pair || 2n * pair[0] + 3n * pair[1] !== 1n) {
    conclusion = {verified: false, feedback: 'Enter integers u v for which 2u+3v=1.'};
  } else if (!byThree.verified || !byTwo.verified) {
    conclusion = {verified: false, feedback: 'The Bézout identity holds. Complete both residue tables to establish the divisibility conclusion.'};
  } else {
    conclusion = {verified: true, feedback: 'Let P be the product. The tables give P=2a=3b for integers a,b. From 2u+3v=1, P=2uP+3vP=6(ub+va), so 6 divides P.'};
  }
  return [byThree, byTwo, conclusion];
}

function checkGcd(fields, k) {
  const forward = integers(fields.get('forward'), 2);
  // Compare both coefficients of n and constant terms. Equality holds identically.
  const forwardValid = Boolean(forward && forward[0] + forward[1] === 0n && forward[1] * k === k);
  const reverse = integers(fields.get('reverse'), 2);
  const reverseValid = Boolean(reverse && reverse[0] === 1n && reverse[1] * k === k);
  const ruleSelected = fields.get('conclusion') === GCD_CONCLUSION;
  const conclusionValid = forwardValid && reverseValid && ruleSelected;
  return [
    {verified: forwardValid, feedback: forwardValid
      ? 'The forward linear combination equals k for every n. Each common divisor of n and n+k therefore divides k.'
      : 'Check the coefficient of n and the constant term in A·n+B·(n+k)=k.'},
    {verified: reverseValid, feedback: reverseValid
      ? 'The reverse linear combination equals n+k for every n. Each common divisor of n and k therefore divides n+k.'
      : 'Check the coefficient of n and the constant term in C·n+D·k=n+k.'},
    {verified: conclusionValid, feedback: conclusionValid
      ? 'Both inclusions hold. The positive common-divisor sets coincide, contain 1, and are finite since n>0. Their greatest elements coincide.'
      : 'Establish both inclusions and explicitly invoke the rule that identical positive-divisor sets have equal greatest elements.'}
  ];
}

/** A null result leaves the answer to its existing prose-review workflow. */
export function verifyCertificate(question, answer) {
  const family = matchQuestion(question);
  if (!family || typeof answer !== 'string' || !/^NOETHER-PROOF\/1(?:\r?\n|$)/.test(answer)) return null;
  const parsed = parseFields(answer, family, question);
  let checks;
  if (parsed.error) {
    checks = family.fields.map(() => ({verified: false, feedback: parsed.error}));
  } else {
    const k = BigInt(question.parameters.k);
    checks = question.templateId === 'number-consecutive' ? checkConsecutive(parsed.fields, k) : checkGcd(parsed.fields, k);
  }
  const criteria = question.rubric.map((criterion, i) => ({
    id: criterion.id, verified: checks[i].verified,
    points: checks[i].verified ? criterion.points : 0,
    maxPoints: criterion.points, feedback: checks[i].feedback
  }));
  const complete = criteria.every(criterion => criterion.verified);
  const lowerBoundPoints = criteria.reduce((sum, criterion) => sum + criterion.points, 0);
  return {
    schemaVersion: HEADER, status: complete ? 'verified_certificate' : 'incomplete_certificate',
    complete, score: complete ? lowerBoundPoints : null, lowerBoundPoints, maxMarks: question.maxMarks, criteria,
    feedback: parsed.error ? [parsed.error] : criteria.filter(c => !c.verified).map(c => c.feedback),
    notice: complete
      ? 'Every required inference in this structured proof was verified with exact integer arithmetic.'
      : 'Only established certificate steps count toward the lower bound. An incomplete certificate has no final score. A reviewer can assess other arguments.'
  };
}
