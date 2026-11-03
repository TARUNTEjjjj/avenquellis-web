/** Original exercise wording around standard mathematical results.
 * Difficulty is an editorial estimate, not a calibrated examination percentile.
 * Every proof is supplied in full; alternative valid arguments deserve credit.
 */
const integer = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const rubric = steps => steps.map(([points, description], i) => ({id:`step-${i+1}`,points,description}));
const exercise = (key, topic, level, make) => ({key,topic,level,make});

export const advancedTemplates = [
  exercise('advanced-algebra-schur','algebra','olympiad',() => ({
    title:'A cubic inequality with two equality patterns',
    statement:'For nonnegative real numbers a,b,c, prove a³+b³+c³+3abc ≥ a²b+a²c+b²a+b²c+c²a+c²b. Determine all equality cases.',
    solution:'The inequality is symmetric, so reorder the variables as a≥b≥c≥0. Let S denote the left side minus the right side. Direct expansion gives S=(a−b)²(a+b−c)+c(a−c)(b−c). Both terms are nonnegative: a+b−c≥a≥0 and a−c,b−c≥0. Thus S≥0. If a>b, then the first term is strictly positive, so equality forces a=b. With a=b, S=c(a−c)²; hence either c=a or c=0. Restoring all permutations, equality occurs when all three variables are equal, or when one is zero and the other two are equal. Each stated case gives S=0 by substitution.',
    rubric:rubric([[2,'Justify a symmetric ordering or an equivalent valid reduction.'],[3,'Obtain a correct decomposition or another complete proof of nonnegativity.'],[3,'Analyze necessity of all equality cases, including zeros.'],[2,'Verify the cases and restore permutations.']])
  })),
  exercise('advanced-algebra-integer-factorization','algebra','olympiad',r => {
    const n=integer(r,4,7),offset=integer(r,-4,3),roots=Array.from({length:n},(_,i)=>offset+i);
    const product=roots.map(a=>a===0?'x':`(x ${a<0?'+':'−'} ${Math.abs(a)})`).join('');
    return {title:'Integer values that forbid a factorization',
      statement:`Let P(x)=${product}−1. Prove that P cannot be written as the product of two nonconstant polynomials with integer coefficients.`,
      solution:`Suppose P=FG with nonconstant integer-coefficient polynomials F,G. Their degrees are both less than ${n}. At each of the ${n} distinct integers ${roots.join(', ')}, P takes the value −1, so the two integers F(a),G(a) must be 1 and −1 in some order. Therefore (F+G)(a)=0 at all these ${n} points. Since deg(F+G)<${n} unless it is the zero polynomial, the root bound forces F+G=0 identically. Thus P=−F². But P is monic, whereas the leading coefficient of −F² is negative. This contradiction rules out the proposed factorization.`,
      rubric:rubric([[3,'Use the integer values at every specified point to deduce F(a)+G(a)=0.'],[3,'Apply the polynomial root bound with the correct degree justification.'],[2,'Derive P=−F² from F+G=0.'],[2,'Use the leading coefficient to obtain a contradiction.']]),parameters:{n,offset,roots}};
  }),
  exercise('advanced-algebra-parallelogram-function','algebra','advanced',r => {
    const k=integer(r,2,9);
    return {title:'A quadratic law on all integers',
      statement:`Find every function f:ℤ→ℤ satisfying f(m+n)+f(m−n)=2f(m)+2f(n) for all integers m,n, with f(1)=${k}. Prove both existence and uniqueness.`,
      solution:`Putting m=n=0 gives f(0)=0. Putting m=0 then gives f(−n)=f(n). With n=1, the equation becomes f(m+1)−2f(m)+f(m−1)=${2*k}. Starting from f(0)=0 and f(1)=${k}, induction yields f(m)=${k}m² for all m≥0: if the formula holds at m and m−1, the recurrence gives f(m+1)=${k}[2m²−(m−1)²+2]=${k}(m+1)². Evenness extends this to negative integers. Finally, substituting f(m)=${k}m² into the original equation verifies it, since (m+n)²+(m−n)²=2m²+2n². Thus the solution exists and is unique.`,
      rubric:rubric([[2,'Establish the value at zero and evenness.'],[3,'Derive and solve the second-difference recurrence for nonnegative integers.'],[2,'Extend the conclusion to all negative integers.'],[3,'Verify the original two-variable equation and uniqueness.']]),parameters:{k}};
  }),
  exercise('advanced-algebra-product-extremum','algebra','olympiad',r => {
    const k=integer(r,2,6);
    return {title:'A sharp product bound under two constraints',
      statement:`Real numbers x,y,z satisfy x+y+z=0 and x²+y²+z²=${6*k*k}. Prove |xyz|≤${2*k**3}, and find every equality case without using calculus.`,
      solution:`Since x+y=−z, the inequality x²+y²≥(x+y)²/2 gives ${6*k*k}≥3z²/2, so −${2*k}≤z≤${2*k}. Also xy=[(x+y)²−x²−y²]/2=z²−${3*k*k}, hence xyz=z³−${3*k*k}z. The identities ${2*k**3}−(z³−${3*k*k}z)=(${2*k}−z)(z+${k})²≥0 and ${2*k**3}+(z³−${3*k*k}z)=(z+${2*k})(z−${k})²≥0 give the bound. Equality requires z∈{−${2*k},−${k},${k},${2*k}}. Solving x+y=−z and xy=z²−${3*k*k} in these cases shows that the full list consists of permutations of (${2*k},−${k},−${k}) and (−${2*k},${k},${k}). Direct substitution verifies all of them.`,
      rubric:rubric([[2,'Obtain the valid interval for one variable from the quadratic constraint.'],[3,'Express the product as a cubic and prove both bounds algebraically.'],[3,'Recover all equality triples from the simultaneous constraints.'],[2,'Verify the equality triples in both original constraints.']]),parameters:{k}};
  }),

  exercise('advanced-number-least-prime','number-theory','olympiad',() => ({
    title:'The smallest prime creates a contradiction',
    statement:'Prove that there is no integer n>1 for which n divides 2ⁿ−1. You may use Fermat’s little theorem.',
    solution:'Suppose such n exists. It must be odd, because 2ⁿ−1 is odd. Let p be the smallest prime divisor of n, so p is odd. Let d be the least positive integer with 2ᵈ≡1 (mod p); it exists by Fermat’s theorem. The division algorithm shows that d divides every exponent e for which 2ᵉ≡1 (mod p): write e=qd+r, 0≤r<d, and minimality forces r=0. Consequently d divides n and p−1. But gcd(n,p−1)=1: any prime dividing that gcd would be a prime divisor of n smaller than p. Thus d=1. This says 2≡1 (mod p), an impossibility. Hence no n>1 works.',
    rubric:rubric([[2,'Choose the least prime divisor and handle parity.'],[3,'Define multiplicative order and justify its divisibility properties.'],[3,'Show that n and p−1 are coprime using minimality of p.'],[2,'Derive and explain the contradiction d=1.']])
  })),
  exercise('advanced-number-sum-square-valuation','number-theory','olympiad',r => {
    const p=[3,7,11,19,23][integer(r,0,4)];
    return {title:'Prime exponents in a sum of two squares',
      statement:`Let x,y be integers, not both zero. Prove that the exponent of the prime ${p} in the prime factorization of x²+y² is even. You may use Fermat’s little theorem.`,
      solution:`First prove that ${p}|u²+v² implies ${p}|u and ${p}|v. If v is not divisible by ${p}, the residue t=u/v is defined modulo ${p} and t²≡−1. Raising to the odd power (${p}−1)/2 gives t^(${p}−1)≡−1, contradicting Fermat's theorem. If v is divisible by ${p}, the original congruence immediately gives ${p}|u. Now let t≥0 be the largest integer such that ${p}ᵗ divides both x and y. It is finite because they are not both zero. Write x=${p}ᵗu,y=${p}ᵗv, where u,v are not both divisible by ${p}. The preliminary result gives ${p}∤u²+v². Thus x²+y²=${p}^(2t)(u²+v²) has exact prime exponent 2t, which is even.`,
      rubric:rubric([[3,'Prove the modular obstruction for a nonzero quotient using Fermat.'],[2,'Cover the case when one coordinate is divisible by the prime.'],[3,'Factor out the largest common prime power and establish that the remaining sum is not divisible.'],[2,'Conclude the exact even exponent, including zero-coordinate cases.']]),parameters:{p}};
  }),
  exercise('advanced-number-binary-binomial','number-theory','olympiad',() => ({
    title:'Binary digits hidden in a binomial coefficient',
    statement:'For a positive integer n, let s₂(n) be the number of 1s in its binary expansion. Prove that the highest power of 2 dividing the integer C(2n,n) is exactly 2 raised to the power s₂(n).',
    solution:'For any positive integer m, counting the factors divisible by 2, then the extra factors divisible by 4, and so on, gives v₂(m!)=Σ(j≥1)⌊m/2ʲ⌋. Write m=Σ(i≥0)εᵢ2ⁱ with εᵢ∈{0,1}. Interchanging these finite sums gives Σ(j≥1)⌊m/2ʲ⌋=Σ(i≥1)εᵢ(2ⁱ−1)=m−s₂(m). Therefore v₂(C(2n,n))=[2n−s₂(2n)]−2[n−s₂(n)]. Multiplication by 2 shifts the binary expansion, so s₂(2n)=s₂(n). The exponent is consequently s₂(n), proving the exact divisibility assertion.',
    rubric:rubric([[3,'Derive the factorial valuation by counting prime factors.'],[3,'Convert the floor sum into m−s₂(m) using binary digits.'],[2,'Apply the valuation formula to the binomial coefficient.'],[2,'Use the binary shift to obtain the exact exponent.']])
  })),
  exercise('advanced-number-fourth-power-composite','number-theory','olympiad',() => ({
    title:'A power expression that is never prime',
    statement:'Prove that n⁴+4ⁿ is composite for every integer n>1. Give an argument that covers both parities of n.',
    solution:'If n is even, n⁴ and 4ⁿ are both divisible by 16, and their sum is at least 32, so the sum is composite. If n is odd, then n≥3. Put b=2^((n−1)/2), an integer at least 2. Now 4ⁿ=4b⁴, and direct expansion gives n⁴+4b⁴=(n²−2nb+2b²)(n²+2nb+2b²). The first factor equals (n−b)²+b² and is at least 4; the second is larger and is also an integer. Thus both factors are greater than 1. This proves compositeness for odd n as well, completing the argument.',
    rubric:rubric([[2,'Handle all even n with a proper nontrivial divisor.'],[2,'Choose an integer auxiliary power for odd n.'],[3,'Derive or verify the fourth-power factorization.'],[3,'Prove both factors exceed 1 and cover the complete domain.']])
  })),

  exercise('advanced-comb-subsequence','combinatorics','olympiad',r => {
    const a=integer(r,3,5),b=integer(r,3,5),n=(a-1)*(b-1)+1;
    return {title:'Two kinds of monotone subsequence',
      statement:`A sequence contains ${n} pairwise distinct real numbers. Prove that it has either an increasing subsequence of length ${a} or a decreasing subsequence of length ${b}. A subsequence keeps the original order but need not use adjacent terms.`,
      solution:`At each position i assign the pair (uᵢ,vᵢ), where uᵢ is the longest increasing subsequence ending there and vᵢ is the longest decreasing one ending there. Suppose neither required subsequence exists. Then 1≤uᵢ≤${a-1} and 1≤vᵢ≤${b-1}, leaving only ${(a-1)*(b-1)} possible pairs. Yet the pairs at distinct positions are different: if i<j and the ith value is smaller, append the jth value to an increasing subsequence ending at i to get uⱼ≥uᵢ+1; if it is larger, get vⱼ≥vᵢ+1. Distinctness of the values ensures one case holds. Thus ${n} positions require ${n} different pairs, contradicting the available count.`,
      rubric:rubric([[3,'Define both longest-ending-subsequence labels precisely.'],[3,'Prove that different positions have different label pairs.'],[2,'Bound the label ranges under the contrary assumption.'],[2,'Apply the counting contradiction.']]),parameters:{a,b,n}};
  }),
  exercise('advanced-comb-triangle-free','combinatorics','olympiad',() => ({
    title:'The edge limit for a triangle-free network',
    statement:'A simple graph on n vertices has no triangle. Prove that its number m of edges is at most n²/4. Show that the bound is attained whenever n is even.',
    solution:'Write d(v) for the degree of vertex v. If uv is an edge, u and v have no common neighbor, since that would create a triangle. Their neighbor sets are disjoint subsets of the n vertices, so d(u)+d(v)≤n. Summing over all edges gives Σv d(v)²≤mn, because each degree d(v) is counted once for each of its d(v) incident edges. The handshake identity gives Σv d(v)=2m. Cauchy–Schwarz now yields 4m²≤nΣv d(v)²≤mn². For m>0, division gives m≤n²/4; for m=0 it is immediate. If n is even, split the vertices into two equal groups and join every pair in different groups. This graph has no triangle and has (n/2)² edges, so it attains the bound.',
    rubric:rubric([[3,'Establish the degree-sum bound for each edge using absence of triangles.'],[3,'Double-count the edge sum as the sum of squared degrees.'],[2,'Apply Cauchy–Schwarz and handle m=0.'],[2,'Construct and verify an equality example.']])
  })),
  exercise('advanced-comb-toggle-invariant','combinatorics','olympiad',r => {
    const m=integer(r,3,6),n=integer(r,3,7);
    return {title:'Exactly which boards can be switched?',
      statement:`A ${m}×${n} board starts with every cell white. An operation reverses every color in one complete row or one complete column. Prove that a target coloring is reachable if and only if the four corner cells of every rectangle formed by two rows and two columns contain an even number of black cells.`,
      solution:'Encode white by 0 and black by 1, with addition modulo 2. In any fixed rectangle, a row or column operation changes either zero or two of its four corners; therefore the parity of the corner sum stays even. This proves necessity. Conversely suppose every rectangle has even corner sum, and denote the target cell values by bᵢⱼ. Rectangles using row 1 and column 1 give bᵢⱼ=bᵢ₁+b₁ⱼ+b₁₁ modulo 2; this identity also holds when i=1 or j=1. Starting from zero, toggle row i exactly when bᵢ₁=1. Then toggle column j exactly when b₁ⱼ+b₁₁=1 modulo 2. The final value at (i,j) is bᵢ₁+b₁ⱼ+b₁₁=bᵢⱼ. These operations construct the target, proving sufficiency.',
      rubric:rubric([[3,'Identify the invariant and show every permitted move preserves it.'],[3,'Derive the cell identity from the rectangle condition.'],[2,'Give explicit row and column operations.'],[2,'Verify every resulting cell, proving sufficiency.']]),parameters:{m,n}};
  }),
  exercise('advanced-comb-tournament-path','combinatorics','advanced',() => ({
    title:'Ordering winners without assuming transitivity',
    statement:'In a tournament, every pair of players plays once and each game has exactly one winner. Prove that all players can be listed in an order such that each player except the last defeated the player immediately after them. No assumption is made that winning is transitive.',
    solution:'Induct on the number of players. One player is immediate. Remove a player x and use the inductive hypothesis to order the others v₁,…,vₖ with vᵢ defeating vᵢ₊₁. If x defeats v₁, insert x at the beginning. Otherwise, if x defeats any player in the list, let j be the first such index. Then j≥2 and vⱼ₋₁ defeats x, because x did not defeat that player and there are no draws. Insert x between vⱼ₋₁ and vⱼ. Both new adjacent games have the required direction, and all other adjacent relations remain valid. If x defeats nobody in the list, vₖ defeats x, so append x at the end. These cases exhaust every possibility and complete the induction.',
    rubric:rubric([[2,'Set up induction with a correct base case.'],[3,'Choose an insertion position using the first player defeated by the new player.'],[3,'Verify the two new adjacency relations and preserve the others.'],[2,'Handle insertion at both ends and conclude.']])
  })),

  exercise('advanced-geometry-radius-inequality','geometry','olympiad',() => ({
    title:'Comparing the two radii of a triangle',
    statement:'For a nondegenerate triangle with inradius r and circumradius R, prove R≥2r. Determine precisely when equality occurs. You may use Heron’s formula and the identity Δ=abc/(4R), where Δ is the area.',
    solution:'Let s=(a+b+c)/2 and set x=s−a, y=s−b, z=s−c. All three numbers are positive by the strict triangle inequalities, and a=y+z, b=z+x, c=x+y. Using Δ=rs, Δ=abc/(4R), and Heron’s formula Δ²=sxyz, we obtain R/r=abc·s/(4Δ²)=(x+y)(y+z)(z+x)/(4xyz). The inequalities x+y≥2√(xy), y+z≥2√(yz), z+x≥2√(zx) imply the numerator is at least 8xyz. Hence R/r≥2. Equality in all three inequalities holds exactly when x=y=z, which is equivalent to a=b=c. An equilateral triangle indeed gives equality.',
    rubric:rubric([[2,'Use triangle inequalities to obtain positive substitution variables.'],[3,'Derive the ratio of radii from the area identities.'],[3,'Apply the product inequality and track equality requirements.'],[2,'Translate and verify the equilateral equality case.']])
  })),
  exercise('advanced-geometry-perpendicular-feet','geometry','olympiad',() => ({
    title:'Three perpendicular feet on one line',
    statement:'Let A,B,C be the vertices of a nondegenerate triangle and let P be a point on its circumcircle distinct from A,B,C. Let X,Y,Z be the perpendicular projections of P onto the full lines AB,BC,CA, respectively. Prove that X,Y,Z are collinear. Projections may lie on extensions of the sides.',
    solution:'First handle diameter cases. If P is antipodal to A, the inscribed right angles give X=B and Z=C, while Y is on BC, so collinearity holds. If P is antipodal to B, similarly X=A and Y=C, with Z on CA. If P is antipodal to C, Y=B and Z=A, with X on AB. Now exclude these cases and use directed angles modulo 180°, covering side extensions. If two feet coincide, collinearity is immediate; otherwise assume they are distinct. No foot can equal a triangle vertex, since that would make P antipodal to another vertex, a case already handled. Since PX⊥AB and PY⊥BC, the four points P,X,B,Y lie on a circle with diameter PB. Likewise P,Y,C,Z lie on a circle with diameter PC. The equal-angle property gives ∠(YX,YP)=∠(BX,BP) and ∠(YP,YZ)=∠(CP,CZ). Because BX lies on BA and CZ lies on CA, adding gives ∠(YX,YZ)=∠(BA,BP)+∠(CP,CA). On the original circumcircle, the angles ∠(BA,BP) and ∠(CA,CP) subtend the same chord AP, so they are equal modulo 180°. The sum is therefore zero. Thus the lines YX and YZ coincide and the three feet are collinear.',
    rubric:rubric([[3,'Identify the two right-angle cyclic quadrilaterals.'],[3,'Relate directed angles correctly, including exterior projections.'],[2,'Use the original circumcircle to cancel the angles.'],[2,'Conclude collinearity and account for antipodal and coincident-foot cases.']])
  })),
  exercise('advanced-geometry-angle-bisector','geometry','advanced',() => ({
    title:'An exact length for an angle bisector',
    statement:'In a nondegenerate triangle ABC, write a=BC, b=CA and c=AB. The internal bisector of angle A meets BC at D. Prove AD²=bc[1−a²/(b+c)²]. You may use the angle-bisector theorem and Stewart’s theorem.',
    solution:'By the angle-bisector theorem, BD/DC=c/b. Combining this with BD+DC=a gives BD=ac/(b+c) and DC=ab/(b+c). Stewart’s theorem for the cevian AD states b²·BD+c²·DC=a(AD²+BD·DC). Substitution makes the left side a(b²c+c²b)/(b+c)=abc, while BD·DC=a²bc/(b+c)². Divide by a>0 and rearrange: AD²=bc−a²bc/(b+c)², as required. The bracket is positive because the strict triangle inequality gives a<b+c; thus the formula is consistent with a positive cevian length.',
    rubric:rubric([[3,'Compute both side segments with the correct side correspondence.'],[3,'Apply Stewart’s theorem correctly to AD.'],[2,'Simplify to the claimed identity.'],[2,'Check positivity using the nondegenerate triangle assumption.']])
  })),
  exercise('advanced-geometry-tangent-ratio','geometry','olympiad',() => ({
    title:'Tangents determine a squared side ratio',
    statement:'The tangents to the circumcircle of a nondegenerate triangle ABC at B and C meet at a finite point T. Suppose the line AT meets the interior of segment BC at D. Prove BD/DC=AB²/AC².',
    solution:'The tangent lengths satisfy TB=TC. By the tangent–chord theorem, the sine of angle ABT equals sin∠ACB and the sine of angle ACT equals sin∠ABC; supplementary-angle choices do not change these sines. Taking ordinary triangle areas therefore gives [ABT]/[ACT]=AB·TB·sin∠ABT/(AC·TC·sin∠ACT)=AB·sin∠ACB/(AC·sin∠ABC). The sine rule in ABC gives sin∠ACB/sin∠ABC=AB/AC, so the area ratio is AB²/AC². On the other hand, use the common base AT for the two triangles. Since A,D,T are collinear and D lies inside BC, the perpendicular distances of B and C from AT have ratio BD/DC (both equal the respective segment times the same positive sine of the angle between the lines). Thus the same area ratio is BD/DC, proving the identity.',
    rubric:rubric([[2,'Use equal tangent lengths and the tangent–chord theorem with correct angles.'],[3,'Compute the area ratio and apply the sine rule.'],[3,'Relate the same area ratio to BD/DC using distances from AT.'],[2,'Combine the ratios while respecting the stated nondegeneracy assumptions.']])
  })),

  exercise('advanced-calculus-real-root-inequality','calculus','olympiad',() => ({
    title:'An inequality encoded by real polynomial roots',
    statement:'Let P be a real polynomial of degree n≥2 with n distinct real roots. Prove that [P′(x)]²−P(x)P″(x)>0 for every real x. Also prove that P′ has exactly one root between each pair of consecutive roots of P and no other roots.',
    solution:'Write P(x)=a∏(i=1 to n)(x−rᵢ), where a≠0 and r₁<⋯<rₙ. Away from the roots, logarithmic differentiation gives P′/P=Σ1/(x−rᵢ). Differentiating again gives (P″P−P′²)/P²=−Σ1/(x−rᵢ)². Thus P′²−PP″=P²Σ1/(x−rᵢ)²>0 there. At a root rᵢ, distinctness gives P′(rᵢ)=a∏(j≠i)(rᵢ−rⱼ)≠0, so the expression is again positive. Rolle’s theorem supplies a root of P′ in each of the n−1 disjoint intervals (rᵢ,rᵢ₊₁). Since P′ has degree n−1, these exhaust all its roots and each has multiplicity one. There are therefore no extra roots anywhere else.',
    rubric:rubric([[3,'Derive and differentiate the logarithmic-derivative identity off the roots.'],[2,'Establish strict positivity at the roots separately.'],[3,'Apply Rolle’s theorem in every consecutive-root interval.'],[2,'Use the degree bound to establish exact counts and absence of other roots.']])
  })),
  exercise('advanced-calculus-sharp-area','calculus','olympiad',() => ({
    title:'A sharp bound that no smooth arch attains',
    statement:'Let f be differentiable on [0,1], with f(0)=f(1)=0 and |f′(x)|≤1 for 0<x<1. Prove |∫₀¹f(x)dx|<1/4. Show nevertheless that no smaller constant can replace 1/4 for all such functions.',
    solution:'The mean value theorem applied between 0 and x and between x and 1 gives |f(x)|≤x and |f(x)|≤1−x. Hence |∫f|≤∫|f|≤∫min(x,1−x)=1/4. If equality held, the continuous nonnegative difference min(x,1−x)−|f(x)| would have zero integral, so it would vanish everywhere. Since min(x,1−x)>0 in (0,1), continuity would force f to have a constant sign there. Thus f would equal either the tent function min(x,1−x) or its negative, neither differentiable at 1/2. Equality is impossible. For sharpness, let ε>0 and set fε(x)=√(1/4+ε²)−√((x−1/2)²+ε²). It vanishes at both ends, is differentiable, and |fε′(x)|=|x−1/2|/√((x−1/2)²+ε²)<1. The elementary bound 0≤√(t²+ε²)−|t|≤ε shows uniform convergence to the tent function as ε→0, so its integrals tend to 1/4. No smaller universal constant is possible.',
    rubric:rubric([[2,'Use both endpoint constraints to obtain the tent-function envelope.'],[3,'Integrate the bound and rigorously exclude equality using differentiability.'],[3,'Construct and verify a differentiable approximating family satisfying the derivative bound.'],[2,'Show its integrals approach 1/4, establishing sharpness.']])
  })),
  exercise('advanced-calculus-weighted-rolle','calculus','advanced',r => {
    const k=integer(r,2,7);
    return {title:'A derivative relation at an unknown interior point',
      statement:`Suppose f is continuous on [a,b], differentiable on (a,b), and f(a)=f(b)=0, where a<b. Prove that there is c∈(a,b) such that f′(c)=${k}f(c). Then explain why the same conclusion holds with ${k} replaced by any real constant.`,
      solution:`Define g(x)=e^(−${k}x)f(x). It is continuous on [a,b], differentiable on (a,b), and has g(a)=g(b)=0. Rolle's theorem yields an interior c with g′(c)=0. By the product rule, g′(c)=e^(−${k}c)[f′(c)−${k}f(c)]. The exponential is nonzero, so f′(c)=${k}f(c). The proof works for any real constant λ after replacing g by e^(−λx)f(x). It requires no second derivative or continuity of f′, and includes the identically zero function.`,
      rubric:rubric([[3,'Find the exponential integrating factor or an equivalent valid auxiliary function.'],[3,'Verify all hypotheses and apply Rolle’s theorem.'],[2,'Differentiate correctly and isolate the required relation.'],[2,'Justify the general real-constant case without extra regularity assumptions.']]),parameters:{k}};
  }),
  exercise('advanced-calculus-root-classification','calculus','olympiad',r => {
    const n=[3,5,7,9][integer(r,0,3)];
    return {title:'Classifying all roots as a parameter moves',
      statement:`For every real parameter t, determine the number of distinct real roots of x^${n}−${n}x−t=0. Identify all parameter values at which a multiple real root occurs and determine its multiplicity.`,
      solution:`Let F(x)=x^${n}−${n}x−t. Its derivative is ${n}(x^${n-1}−1), positive for |x|>1 and negative for |x|<1. Thus F increases on (−∞,−1), decreases on (−1,1), and increases on (1,∞). Moreover F(−1)=${n-1}−t, F(1)=−${n-1}−t, and its limits at −∞ and +∞ are respectively −∞ and +∞. Strict monotonicity and the intermediate value theorem give three distinct roots when |t|<${n-1}; two distinct roots when |t|=${n-1}; and one when |t|>${n-1}. A multiple root must also satisfy F′=0, so it can only be at x=±1. At t=${n-1}, x=−1 is a root; at t=−${n-1}, x=1 is a root. Since F″(±1)=${n*(n-1)}(±1)^${n-2} is nonzero, these roots have multiplicity exactly two. All other roots are simple.`,
      rubric:rubric([[3,'Determine the derivative signs and exact monotonicity intervals.'],[3,'Use extrema and end behavior to count roots in every parameter range.'],[2,'Find the only possible multiple-root locations and parameters.'],[2,'Establish multiplicity exactly two and simplicity elsewhere.']]),parameters:{n}};
  }),

  exercise('advanced-probability-permutation-cycles','probability','olympiad',r => {
    const n=integer(r,6,14);
    return {title:'The expected number of permutation cycles',
      statement:`A permutation of {1,…,${n}} is chosen uniformly at random and written as disjoint cycles. Prove that its expected number of cycles is 1+1/2+⋯+1/${n}. Count a fixed point as a one-element cycle.`,
      solution:`Build a permutation of m elements from one of m−1 elements: either make m a singleton cycle, or insert m immediately after any one of the m−1 existing labels in its cycle. These m choices, combined with all (m−1)! old permutations, give each permutation of m exactly once. Indeed, deleting m reverses the construction uniquely and reveals whether it was a singleton or its preceding label. Therefore a uniform old permutation and a uniform independent insertion choice produce a uniform new permutation. Insertion after an existing label leaves the number of cycles unchanged; the singleton choice adds one cycle and has probability 1/m. If E_m is the expected cycle count, E_m=E_(m−1)+1/m, with E_1=1. Iterating to m=${n} proves the stated sum.`,
      rubric:rubric([[3,'Construct the insertion/deletion bijection for permutations.'],[3,'Justify uniformity and the probability of adding a cycle.'],[2,'Derive the expectation recurrence without assuming cycle independence.'],[2,'Solve the recurrence with the correct base case.']]),parameters:{n}};
  }),
  exercise('advanced-probability-hidden-urn','probability','advanced',r => {
    const a=integer(r,4,9),b=integer(r,1,3),k=integer(r,2,5);
    return {title:'Learning which urn was selected',
      statement:`Urn A contains ${a} red and ${b} blue balls; urn B contains ${b} red and ${a} blue balls. One urn is chosen with probability 1/2 and kept fixed. Draws from it are uniform with replacement. After observing ${k} consecutive red draws, find the probability the next draw is red. Prove that the corresponding prediction strictly increases as the number of observed red draws increases from 0 onward.`,
      solution:`Let H_j be the event that the first j draws are all red. Conditional on A, P(H_j)=(${a}/${a+b})ʲ; conditional on B it is (${b}/${a+b})ʲ. Bayes' theorem gives q_j=P(A|H_j)=${a}ʲ/(${a}ʲ+${b}ʲ)=1/[1+(${b}/${a})ʲ]. For j=0 this is 1/2, as it must be before any observations. Conditional independence of successive draws given the urn gives P(next red|H_j)=q_j·${a}/${a+b}+(1−q_j)·${b}/${a+b}=[${a}^(j+1)+${b}^(j+1)]/[${a+b}(${a}ʲ+${b}ʲ)]. In particular the requested answer is [${a}^${k+1}+${b}^${k+1}]/[${a+b}(${a}^${k}+${b}^${k})]. Since 0<${b}/${a}<1, q_j strictly increases with j. The prediction is an affine function of q_j with positive slope (${a}−${b})/${a+b}, so it too strictly increases.`,
      rubric:rubric([[3,'Compute likelihoods for the fixed hidden urn with replacement.'],[3,'Derive the posterior and next-draw probability by conditioning.'],[2,'Prove strict monotonicity of the posterior for every nonnegative count.'],[2,'Transfer monotonicity to the prediction and include the zero-observation case.']]),parameters:{a,b,k}};
  }),
  exercise('advanced-probability-absorbing-walk','probability','olympiad',r => {
    const n=integer(r,5,12),i=integer(r,1,n-1);
    return {title:'Both the destination and duration of a random walk',
      statement:`A token starts at integer ${i} on {0,1,…,${n}}. At each move, a fair independent coin moves it one step left or right. It stops on reaching 0 or ${n}. Find, with proof, the probability it stops at ${n} and its expected number of moves. Justify that the stopping time has finite expectation.`,
      solution:`From any interior state, ${n} consecutive left moves force absorption within ${n} moves. Thus each block of ${n} future moves has conditional absorption probability at least 2^(−${n}). Consequently P(T>k·${n})≤(1−2^(−${n}))ᵏ, which proves almost-sure absorption and, by summing the geometric tail, finite expectation. For a start at j, let p_j be the chance of finishing at ${n} and e_j the mean duration. First-step conditioning gives p_j=(p_(j−1)+p_(j+1))/2, p_0=0,p_${n}=1. Its unique solution is p_j=j/${n}, because a sequence with zero second differences is affine. Likewise e_j=1+(e_(j−1)+e_(j+1))/2 with e_0=e_${n}=0. The sequence j(${n}−j) satisfies this recurrence. Any difference of two solutions has zero second differences and zero endpoints, so it is zero. Hence the answers are ${i}/${n} and ${i*(n-i)} moves.`,
      rubric:rubric([[3,'Prove a geometric tail bound and finite expectation.'],[2,'Set up and solve the absorption-probability recurrence.'],[3,'Derive and solve the duration recurrence with correct boundary values.'],[2,'Establish uniqueness and evaluate both expressions at the given start.']]),parameters:{n,i}};
  }),
  exercise('advanced-probability-parity-conditioning','probability','olympiad',r => {
    const n=integer(r,4,9),d=integer(r,3,5);
    return {title:'Conditioning an independent selection on even size',
      statement:`Each element of {1,…,${n}} is selected independently with probability p=1/${d}. Let S be the selected set. Find P(|S| is even) and P(1∈S given that |S| is even). Prove your formulas without listing all subsets.`,
      solution:`For m independent selections, let E_m and O_m be the probabilities of even and odd counts. The binomial theorem gives E_m+O_m=1 and E_m−O_m=Σ(j=0 to m)(−1)ʲC(m,j)pʲ(1−p)^(m−j)=(1−2p)ᵐ. Thus E_m=[1+(1−2p)ᵐ]/2 and O_m=[1−(1−2p)ᵐ]/2. Now 1∈S together with even total size means that element 1 is selected and the other ${n-1} elements have odd selected count. These events are independent, so their joint probability is p·O_${n-1}. Dividing by E_${n}>0 gives P(1∈S||S| even)=p[1−(1−2p)^${n-1}]/[1+(1−2p)^${n}]. Substitute p=1/${d} to obtain the requested two probabilities. The positivity of the conditioning event also follows from the positive probability of selecting nothing.`,
      rubric:rubric([[3,'Use the binomial theorem to compute the difference of parity probabilities.'],[2,'Solve for both even and odd probabilities.'],[3,'Identify the correct independent event for the conditional numerator.'],[2,'Divide by the nonzero conditioning probability and substitute the parameters.']]),parameters:{n,d}}
  })
];
