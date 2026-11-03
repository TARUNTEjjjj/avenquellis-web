import {advancedTemplates} from './advanced-templates.js';
/** Browser-safe, dependency-free original practice question engine. */
export const topics = ['algebra', 'number-theory', 'combinatorics', 'geometry', 'calculus', 'probability'];
export const topicLabels = { algebra: 'Algebra', 'number-theory': 'Number theory', combinatorics: 'Combinatorics', geometry: 'Geometry', calculus: 'Calculus', probability: 'Probability' };
export const difficulties = ['foundation', 'advanced', 'olympiad'];
export const exams = ['CMI', 'ISI', 'RMO'];
const SOURCE = { kind: 'original', label: 'Noether original practice · validated template', rights: 'Original wording and solutions; standard mathematical results.' };
// Authored practice weights emphasize mathematical deductions over the final sentence.
const rub = (...steps) => {
 const weights={1:[10],2:[6,4],3:[4,4,2],4:[3,3,2,2]}[steps.length];
 if(!weights)throw new RangeError('A practice rubric needs one to four criteria.');
 return steps.map((description,i)=>({id:`step-${i+1}`,description,points:weights[i]}));
};
const gcd = (a,b) => b ? gcd(b,a%b) : Math.abs(a);
export const choose = (n,k) => { let r=1; for(let i=1;i<=Math.min(k,n-k);i++) r = r*(n-i+1)/i; return Math.round(r); };
const divisors = n => Array.from({length:n},(_,i)=>i+1).filter(d=>n%d===0);
const fract = (a,b) => { const g=gcd(a,b); return b/g===1 ? `${a/g}` : `${a/g}/${b/g}`; };
function hash(value) { let h=2166136261; for(const c of String(value)) {h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; }
function rng(seed) { let s=hash(seed); return () => {s+=0x6D2B79F5;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;}; }
const int = (r,a,b) => a+Math.floor(r()*(b-a+1));
const templates = [
 {key:'algebra-product',topic:'algebra',level:'foundation',make:r=>{const s=int(r,4,16);return {title:'The sharp product bound',statement:`Let x and y be nonnegative real numbers with x + y = ${s}. Prove that xy ≤ ${s*s}/4, and determine when equality holds.`,solution:`Since (x − y)² ≥ 0, (x + y)² − 4xy ≥ 0. Substituting x + y = ${s} gives xy ≤ ${s*s}/4. Equality holds exactly when x = y = ${s}/2, which satisfies the constraints.`,rubric:rub('Use a valid nonnegative square or AM–GM argument.',`Substitute x + y = ${s} and derive the stated upper bound.`,'Identify and verify the equality case x = y.'),parameters:{s}}}},
 {key:'algebra-cubes',topic:'algebra',level:'advanced',make:r=>{const a=int(r,1,5),b=int(r,6,9),c=int(r,10,13),p=a+b+c,q=a*b+b*c+c*a,z=a*b*c;return {title:'Reconstructing a symmetric sum',type:'numeric',statement:`Real numbers x, y, z satisfy x + y + z = ${p}, xy + yz + zx = ${q}, and xyz = ${z}. Find x³ + y³ + z³.`,answer:a**3+b**3+c**3,solution:`The identity x³ + y³ + z³ = (x + y + z)³ − 3(x + y + z)(xy + yz + zx) + 3xyz gives ${p}³ − 3·${p}·${q} + 3·${z} = ${a**3+b**3+c**3}.`,rubric:rub('State or derive the symmetric cube identity.','Substitute the three supplied symmetric sums.','Evaluate the resulting expression correctly.'),parameters:{a,b,c}}}},
 {key:'algebra-divisors',topic:'algebra',level:'olympiad',make:r=>{const k=int(r,2,7),n=k*k+1;const pairs=divisors(n).map(d=>`(${k+d}, ${k+n/d})`).join(', ');return {title:'A Diophantine factorization',statement:`Find all ordered pairs of positive integers (x, y) satisfying xy = ${k}(x + y) + 1. Prove that your list is complete.`,solution:`Rearranging gives (x − ${k})(y − ${k}) = ${n}. The two factors have the same sign and neither is zero. If both were negative, positivity of x,y would give their product at most (${k} − 1)² < ${n}, impossible. Thus both are positive. Every positive divisor d of ${n} gives x = ${k} + d and y = ${k} + ${n}/d. The complete list is ${pairs}. Substitution verifies every listed pair.`,rubric:rub('Factor the equation after completing the product.','Exclude zero and negative factors using positivity.','Enumerate every positive divisor and corresponding ordered pair.','Verify the constructed pairs satisfy the original equation.'),parameters:{k,n}}}},
 {key:'algebra-functional',topic:'algebra',level:'olympiad',make:r=>{const c=int(r,1,5),a=int(r,1,6);return {title:'Removing the quadratic part',statement:`A continuous function f: ℝ → ℝ satisfies f(x + y) = f(x) + f(y) + ${2*c}xy for all real x,y, and f(1) = ${c+a}. Determine f and prove uniqueness.`,solution:`Define g(x) = f(x) − ${c}x². The equation implies g(x+y)=g(x)+g(y), and g is continuous with g(1)=${a}. Additivity yields g(n)=${a}n for integers n, and g(p/q)=${a}p/q for rational p/q. By density of the rationals and continuity, g(x)=${a}x for every real x. Hence f(x)=${c}x²+${a}x. Direct substitution verifies existence, and the argument proves uniqueness.`,rubric:rub('Subtract the quadratic term to obtain a continuous additive function.','Determine the additive function on integers and rationals.','Use continuity and rational approximation for all real inputs.','Verify the resulting function and uniqueness.'),parameters:{a,c}}}},
 {key:'number-consecutive',topic:'number-theory',level:'foundation',make:r=>{const k=int(r,1,12);return {title:'Three consecutive factors',statement:`Prove that (n + ${k})(n + ${k+1})(n + ${k+2}) is divisible by 6 for every integer n.`,solution:`Among three consecutive integers one is divisible by 3. At least one is even, so the product is divisible by 2 as well. Since gcd(2,3)=1, their product 6 divides the product. This reasoning includes zero and negative factors.`,rubric:rub('Explain why a factor is divisible by 3.','Explain why a factor is even.','Use coprimality to conclude divisibility by 6 for every integer.'),parameters:{k}}}},
 {key:'number-gcd',topic:'number-theory',level:'advanced',make:r=>{const k=int(r,7,30);return {title:'An invariant greatest common divisor',statement:`Prove that gcd(n, n + ${k}) = gcd(n, ${k}) for every positive integer n.`,solution:`If d divides both n and n+${k}, it divides their difference ${k}; hence d is a common divisor of n and ${k}. Conversely, if d divides n and ${k}, it divides n+${k}. The sets of positive common divisors coincide, so their greatest members coincide.`,rubric:rub('Prove every common divisor of n and n+k divides k.','Prove the converse inclusion of common divisors.','Conclude equality of the greatest positive common divisors.'),parameters:{k}}}},
 {key:'number-descent',topic:'number-theory',level:'olympiad',make:()=>({title:'An infinite descent',statement:'Prove that x² + y² = 3z² has no solution in positive integers x, y, z.',solution:'Squares modulo 3 are 0 or 1. For x²+y² to be 0 modulo 3, both x and y must be divisible by 3. Write x=3a,y=3b; the equation becomes 3a²+3b²=z², so z is also divisible by 3, say z=3c. Dividing the original equation by 9 gives a²+b²=3c², a positive solution with c<z. Choosing a solution with minimal positive z produces a contradiction.',rubric:rub('Classify square residues modulo 3.','Deduce that x, y, and z are divisible by 3.','Construct a strictly smaller positive solution.','Apply minimality or infinite descent to rule out any solution.')})},
 {key:'number-cycle',topic:'number-theory',level:'advanced',make:r=>{const n=int(r,21,120);return {title:'A power in a residue cycle',type:'numeric',statement:`Find the remainder when 2^${n} is divided by 7.`,answer:2**(n%3),solution:`Since 2³ ≡ 1 (mod 7), powers of 2 repeat every three exponents. As ${n} ≡ ${n%3} (mod 3), the required remainder is 2^${n%3} = ${2**(n%3)}.`,rubric:rub('Find the period-three cycle modulo 7.','Reduce the exponent modulo 3.','Report the least nonnegative remainder.'),parameters:{n}}}},
 {key:'comb-divisibility',topic:'combinatorics',level:'olympiad',make:r=>{const n=int(r,8,30);return {title:'The odd-part pigeonholes',statement:`Choose any ${n+1} distinct integers from {1,2,…,${2*n}}. Prove that two of the chosen integers have the property that one divides the other.`,solution:`Write every positive integer uniquely as 2^a u with u odd. There are exactly ${n} possible odd parts u in {1,3,…,${2*n-1}}. Among ${n+1} chosen integers, two share the same odd part by the pigeonhole principle. They have forms 2^a u and 2^b u with a<b, so the first divides the second.`,rubric:rub('Represent each number by a power of 2 times its odd part.','Count the possible odd parts.','Apply the pigeonhole principle.','Show that equal odd parts imply divisibility.'),parameters:{n}}}},
 {key:'comb-paths',topic:'combinatorics',level:'foundation',make:r=>{const m=int(r,3,8),n=int(r,3,8);return {title:'Shortest paths on a grid',type:'numeric',statement:`How many paths from (0,0) to (${m},${n}) use only unit steps to the right or upward?`,answer:choose(m+n,m),solution:`Every path contains ${m} right steps and ${n} up steps, for ${m+n} steps total. Choosing the ${m} positions of the right steps determines the path uniquely, so the count is C(${m+n},${m}) = ${choose(m+n,m)}.`,rubric:rub('Determine the number of steps of each type.','Give a bijection with choices of step positions.','Evaluate the binomial coefficient.'),parameters:{m,n}}}},
 {key:'comb-handshake',topic:'combinatorics',level:'advanced',make:()=>({title:'Parity in a network',statement:'In a finite group of people, some pairs shake hands exactly once. Prove that an even number of people have shaken hands with an odd number of others.',solution:'Construct the simple graph whose vertices are people and whose edges are handshakes. The sum of all vertex degrees is twice the number of edges and is therefore even. Even degrees contribute 0 modulo 2 and odd degrees contribute 1, so the number of odd-degree vertices is even.',rubric:rub('Model each handshake as an edge, or use equivalent double counting.','Show that the sum of handshake counts is even.','Deduce that an even number of counts are odd.')})},
 {key:'comb-no-adjacent',topic:'combinatorics',level:'advanced',make:r=>{const n=int(r,6,16);let a=1,b=2;for(let i=2;i<=n;i++){[a,b]=[b,a+b];}return {title:'Subsets with breathing room',type:'numeric',statement:`How many subsets of {1,2,…,${n}} contain no two consecutive integers? Include the empty subset.`,answer:b,solution:`Let A_m be the count for {1,…,m}. Separating subsets according to whether m is included gives A_m=A_(m−1)+A_(m−2). The initial values are A_0=1 and A_1=2. Iterating this recurrence gives A_${n}=${b}.`,rubric:rub('Separate subsets by whether the largest element is present.','Derive the recurrence with correct initial values.','Compute the requested count.'),parameters:{n}}}},
 {key:'geometry-diagonals',topic:'geometry',level:'foundation',make:r=>{const a=int(r,4,12),b=int(r,4,12);return {title:'Four equal areas',statement:`The diagonals of a rectangle of side lengths ${a} and ${b} meet at O. Prove that the four triangles formed by O and consecutive rectangle vertices have equal areas.`,solution:`The diagonals of a rectangle bisect one another, so O is its centre. The two triangles with horizontal bases have base ${a} and height ${b}/2, and area ${a*b}/4 each. The two triangles with vertical bases have base ${b} and height ${a}/2, and the same area ${a*b}/4. Thus all four areas are equal.`,rubric:rub('Locate O at the centre using diagonal bisection.','Compute areas for triangles on each pair of parallel sides.','Conclude all four areas are equal.'),parameters:{a,b}}}},
 {key:'geometry-inradius',topic:'geometry',level:'foundation',make:r=>{const k=int(r,2,10);return {title:'A right triangle’s incircle',type:'numeric',statement:`A triangle has side lengths ${3*k}, ${4*k}, and ${5*k}. Find its inradius.`,answer:k,solution:`By the converse of Pythagoras, the triangle is right-angled. Its area is (${3*k}·${4*k})/2=${6*k*k}; its semiperimeter is ${6*k}. Since area = inradius × semiperimeter, the inradius is ${k}.`,rubric:rub('Recognise and justify the right angle.','Compute area and semiperimeter.','Use area = rs to obtain the inradius.'),parameters:{k}}}},
 {key:'geometry-median',topic:'geometry',level:'advanced',make:()=>({title:'The median identity',statement:'In triangle ABC, M is the midpoint of BC. Prove that AB² + AC² = 2AM² + BC²/2.',solution:'Place M at the origin and represent B by vector v, C by −v, and A by u. Then AB²+AC²=|u−v|²+|u+v|²=2|u|²+2|v|². Since AM²=|u|² and BC²=4|v|², this is 2AM²+BC²/2. The argument applies to every triangle.',rubric:rub('Choose valid midpoint coordinates or an equivalent geometric construction.','Expand the two squared distances and cancel cross terms.','Relate the resulting terms to AM and BC.')})},
 {key:'geometry-viviani',topic:'geometry',level:'olympiad',make:()=>({title:'Three distances, one constant',statement:'Let P lie inside an equilateral triangle of altitude h. Prove that the sum of the perpendicular distances from P to the three sides is h.',solution:'Let the common side length be a and the three distances be d₁,d₂,d₃. Joining P to the vertices partitions the triangle into three triangles with areas ad₁/2, ad₂/2, ad₃/2. Their sum equals the whole area ah/2. Cancelling a/2>0 gives d₁+d₂+d₃=h.',rubric:rub('Partition the triangle by joining P to its vertices.','Express each subtriangle area using its perpendicular distance.','Equate the summed areas to the original area.','Cancel the common factor and conclude.')})},
 {key:'calculus-log',topic:'calculus',level:'advanced',make:()=>({title:'A logarithm below its tangent',statement:'Prove that ln(1+x) ≤ x for every x > −1, and identify every equality case.',solution:'Let f(x)=x−ln(1+x). Then f′(x)=x/(1+x). For −1<x<0 the derivative is negative, while for x>0 it is positive. Thus f attains its unique minimum at x=0, where f(0)=0. Consequently ln(1+x)≤x, with equality only at x=0.',rubric:rub('Define a suitable difference on the full domain.','Differentiate correctly and determine the sign on both sides of zero.','Use the minimum to prove the inequality and equality case.')})},
 {key:'calculus-max',topic:'calculus',level:'foundation',make:r=>{const a=3*int(r,2,6);return {title:'Finding the global maximum',type:'numeric',statement:`Find the maximum of f(x)=x(${a}−x)² on the closed interval [0,${a}].`,answer:4*a**3/27,solution:`f′(x)=(${a}−x)(${a}−3x), so interior critical points give x=${a/3}. The endpoint values are both 0, whereas f(${a/3})=${4*a**3/27}. Comparing these values gives the global maximum ${4*a**3/27}.`,rubric:rub('Differentiate and solve for all interior critical points.','Evaluate the function at critical points and both endpoints.','Compare the values and state the global maximum.'),parameters:{a}}}},
 {key:'calculus-integral',topic:'calculus',level:'advanced',make:r=>{const n=int(r,2,7),d=(n+1)*(n+2);return {title:'A polynomial integral',type:'numeric',statement:`Evaluate ∫₀¹ x^${n}(1−x) dx. Give your answer as a fraction.`,answer:fract(1,d),solution:`Expand the integrand as x^${n}−x^${n+1}. Integrating termwise gives 1/${n+1}−1/${n+2}=1/${d}.`,rubric:rub('Expand the polynomial integrand.','Integrate and evaluate at both limits.','Simplify the resulting fraction.'),parameters:{n}}}},
 {key:'calculus-roots',topic:'calculus',level:'olympiad',make:r=>{const c=int(r,2,15);return {title:'A root that must exist',statement:`Prove that the equation x³+x=${c} has exactly one real solution, and that this solution is positive.`,solution:`Let f(x)=x³+x−${c}. It is continuous, f(0)=−${c}<0, and f(${c})=${c**3}>0, so the intermediate value theorem gives a root in (0,${c}). Since f′(x)=3x²+1>0 for all real x, f is strictly increasing and has at most one root. Therefore exactly one real root exists and it is positive.`,rubric:rub('Use continuity with an interval where the values have opposite signs.','Establish existence of a positive root.','Prove strict monotonicity throughout the real line.','Conclude uniqueness.'),parameters:{c}}}},
 {key:'probability-urn',topic:'probability',level:'foundation',make:r=>{const a=int(r,3,8),b=int(r,3,8);return {title:'Two draws, one colour',type:'numeric',statement:`An urn holds ${a} red and ${b} blue balls. Two balls are drawn uniformly without replacement. Find the probability that both are red.`,answer:fract(a*(a-1),(a+b)*(a+b-1)),solution:`The first ball is red with probability ${a}/${a+b}. Given that it is red, the next is red with probability ${a-1}/${a+b-1}. Multiplying gives ${fract(a*(a-1),(a+b)*(a+b-1))}.`,rubric:rub('Account for sampling without replacement.','Form the product of conditional probabilities or equivalent counting ratio.','Simplify the probability.'),parameters:{a,b}}}},
 {key:'probability-indicators',topic:'probability',level:'advanced',make:r=>{const n=int(r,5,15);return {title:'Expected fixed points',statement:`A permutation of {1,…,${n}} is chosen uniformly at random. Prove that the expected number of fixed points is 1.`,solution:`For each i let I_i be 1 if i is fixed and 0 otherwise. Exactly (${n}−1)! of ${n}! permutations fix i, so E[I_i]=1/${n}. The number of fixed points is X=ΣI_i. By linearity of expectation, E[X]=ΣE[I_i]=${n}·(1/${n})=1. Independence is not required.`,rubric:rub('Define an indicator for each fixed point.','Compute its expectation by counting permutations.','Apply linearity of expectation correctly.','Conclude the value 1 without assuming independence.'),parameters:{n}}}},
 {key:'probability-bayes',topic:'probability',level:'advanced',make:r=>{const n=int(r,3,9);return {title:'Conditioning on at least one head',type:'numeric',statement:`A fair coin is tossed ${n} times. Given that at least one head occurred, what is the probability that exactly one head occurred?`,answer:fract(n,2**n-1),solution:`There are 2^${n} equally likely sequences. Conditioning on at least one head removes only the all-tails sequence, leaving ${2**n-1} equally likely sequences. Exactly ${n} have a single head, so the probability is ${fract(n,2**n-1)}.`,rubric:rub('Describe the conditioned sample space.','Count sequences with exactly one head.','Divide the favourable count by the conditioned total.'),parameters:{n}}}},
 {key:'probability-union',topic:'probability',level:'olympiad',make:r=>{const n=int(r,3,8);return {title:'A bound without independence',statement:`Events A₁,…,A_${n} each have probability at most 1/${2*n}. Prove that the probability that none occurs is at least 1/2. Do not assume independence.`,solution:`The union bound gives P(A₁∪⋯∪A_${n}) ≤ ΣP(A_i) ≤ ${n}/(${2*n})=1/2. Taking complements yields P(no event occurs) ≥ 1−1/2=1/2. The union bound follows because the indicator of a union is at most the sum of the individual indicators, so no independence is needed.`,rubric:rub('Apply or prove the union bound without independence.','Substitute the upper bounds on individual probabilities.','Take complements with the correct inequality direction.'),parameters:{n}}}}
, ...advancedTemplates
];
function normalize(opts={}) {
 const topic = opts.topic && opts.topic!=='all' && opts.topic!=='mixed' ? opts.topic : null;
 if(topic && !topics.includes(topic)) throw new RangeError(`Unknown topic: ${topic}`);
 const aliases={easy:'foundation',medium:'advanced',hard:'olympiad',challenge:'olympiad'};
 const difficulty=aliases[opts.difficulty]||opts.difficulty||'advanced';
 if(!difficulties.includes(difficulty)) throw new RangeError(`Unknown difficulty: ${difficulty}`);
 const exam=String(opts.exam||'CMI').toUpperCase();
 if(!exams.includes(exam)) throw new RangeError(`Unknown exam: ${exam}`);
 if(exam==='RMO' && ['calculus','probability'].includes(topic)) throw new RangeError('RMO practice excludes calculus and probability. Choose algebra, number theory, geometry, or combinatorics.');
 const type=opts.type||(exam==='RMO'?'proof':'all');
 if(!['all','proof','numeric'].includes(type)) throw new RangeError(`Unknown question type: ${type}`);
 if(exam==='RMO' && type==='numeric') throw new RangeError('RMO mock practice uses proof questions. Choose proof format.');
 return {topic,difficulty,exam,type:exam==='RMO'?'proof':type,seed:opts.seed??1};
}
function materialize(template,options,variantSeed) {
 const q=template.make(rng(variantSeed));
 return { id:`${template.key}-${hash(variantSeed).toString(36)}`,title:q.title,statement:q.statement,topic:template.topic,difficulty:template.level,requestedDifficulty:options.difficulty,exam:options.exam,type:q.type||'proof',maxMarks:10,solution:q.solution,rubric:q.rubric,...(q.answer!==undefined?{answer:q.answer}:{}),source:{...SOURCE},templateId:template.key,parameters:q.parameters||{},generator:{kind:'deterministic-template',version:'0.1.0',seed:String(variantSeed)} };
}
function poolFor(o) {
 const pool=templates.filter(t=>(!o.topic||t.topic===o.topic) && (o.exam!=='RMO'||!['calculus','probability'].includes(t.topic)) && (o.type==='all'||(t.make(rng('type-check')).type||'proof')===o.type));
 if(!pool.length) throw new RangeError('No questions match this chapter, track, and format. Choose another format or chapter.');
 return pool;
}
/** Deterministic generation; difficulty is best-fit with actual level disclosed. */
export function generateQuestion(opts={}) {
 const o=normalize(opts),all=poolFor(o),preferred=all.filter(t=>t.level===o.difficulty),pool=preferred.length?preferred:all,r=rng(o.seed);
 return materialize(pool[int(r,0,pool.length-1)],o,`${o.seed}:variant`);
}
/** Balanced original-practice mock, not an official exam-pattern replica. */
export function generateMock(opts={}) {
 const o=normalize(opts), count=opts.count??6;
 if(!Number.isInteger(count)||count<1||count>30) throw new RangeError('count must be an integer between 1 and 30');
 const all=poolFor(o),r=rng(o.seed),preferred=all.filter(t=>t.level===o.difficulty),rest=all.filter(t=>t.level!==o.difficulty);
 const shuffle=arr=>arr.map(t=>({t,key:r()})).sort((a,b)=>a.key-b.key).map(x=>x.t);
 const pool=[...shuffle(preferred),...shuffle(rest)];
 const questions=[], seenStatements=new Set();
 const normalizeStatement=value=>value.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
 // Rotate through all templates so a fixed-statement theorem does not prevent
 // other families from supplying fresh parameter variants. The retry bound is
 // explicit and independent of requested count, so exhaustion cannot hang.
 for(let attempt=0;attempt<4096 && questions.length<count;attempt++) {
  const question=materialize(pool[attempt%pool.length],o,`${o.seed}:mock:${attempt}`);
  const statementKey=normalizeStatement(question.statement);
  if(seenStatements.has(statementKey)) continue;
  seenStatements.add(statementKey);
  questions.push(question);
 }
 if(questions.length!==count) throw new RangeError(`Only ${questions.length} distinct statements could be assembled for these settings within the deterministic retry limit. Reduce count or select mixed topics.`);
 return {id:`mock-${hash(JSON.stringify({...o,count})).toString(36)}`,title:`${o.exam} ${o.topic?topicLabels[o.topic]:'Mixed'} Practice`,exam:o.exam,difficulty:o.difficulty,type:o.type,durationMinutes:Math.max(15,count*15),maxMarks:questions.reduce((sum,q)=>sum+q.maxMarks,0),questions,source:{...SOURCE},notice:'Original practice set. Topic mix, duration, and marks are configurable practice settings, not an official paper pattern. Difficulty is a preference; actual question levels are disclosed. Duplicate statements are excluded.'};
}
export const questionBank=templates.map((t,i)=>materialize(t,{exam:'CMI',difficulty:t.level},`bank:${i+1}`));
export function getQuestion(id) { return questionBank.find(q=>q.id===id)||null; }

const bankTemplates = new Map(questionBank.map((question, index) => [question.id, {
  template: templates[index],
  seed: question.generator.seed,
}]));
const referenceFields = new Set(['id', 'templateId', 'seed', 'exam', 'difficulty']);

/** Reconstruct a question for server-side grading. Pass the exact generator.seed
 * and requestedDifficulty from a generated question. A bank question needs only
 * its id. The caller's question text, answer key and rubric are never accepted.
 */
export function resolveQuestionRef(reference) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return null;
  const prototype = Object.getPrototypeOf(reference);
  if (prototype !== Object.prototype && prototype !== null) return null;
  for (const field in reference) {
    if (!Object.hasOwn(reference, field) || !referenceFields.has(field)) return null;
  }
  const { id, templateId, seed, exam, difficulty } = reference;
  if (typeof id !== 'string' || id.length > 160 || !/^[a-z0-9-]+$/.test(id)) return null;
  if (templateId !== undefined && (typeof templateId !== 'string' || templateId.length > 100)) return null;
  if (seed !== undefined && (typeof seed !== 'string' || seed.length === 0 || seed.length > 256)) return null;
  if (exam !== undefined && !exams.includes(exam)) return null;
  if (difficulty !== undefined && !difficulties.includes(difficulty)) return null;

  const bank = bankTemplates.get(id);
  if (bank) {
    if (templateId !== undefined && templateId !== bank.template.key) return null;
    if (seed !== undefined && seed !== bank.seed) return null;
    if (exam !== undefined && exam !== 'CMI') return null;
    if (difficulty !== undefined && difficulty !== bank.template.level) return null;
    return materialize(bank.template, { exam: 'CMI', difficulty: bank.template.level }, bank.seed);
  }

  if (!templateId || !seed || !exam || !difficulty) return null;
  const template = templates.find(candidate => candidate.key === templateId);
  if (!template || id !== `${template.key}-${hash(seed).toString(36)}`) return null;
  const mockAttempt = /:mock:(0|[1-9][0-9]{0,3})$/.exec(seed);
  if (!seed.endsWith(':variant') && (!mockAttempt || Number(mockAttempt[1]) >= 4096)) return null;
  const result = materialize(template, { exam, difficulty }, seed);
  if (exam === 'RMO' && (result.type !== 'proof' || ['calculus', 'probability'].includes(result.topic))) return null;
  return result;
}
export const engineInfo={version:'0.1.0',mode:'deterministic-template',templateCount:templates.length,scope:'Class 12 foundations and entrance/olympiad proof practice',limitations:['Difficulty tags are author estimates, not calibrated exam percentiles.','Standard theorem templates are finite; parameter variants are not guaranteed to be mathematically novel.','Official papers are linked separately, not represented by generated practice.']};
