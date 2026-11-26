export const TURN = Math.PI * 2;
const view = { surface: "torus", yaw: 0.36, pitch: 0.56, distance: 4.35 };
let unmount = null;

function vecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vecCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function vecNormalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}

export function clampPitch(pitch) {
  return Math.min(1.42, Math.max(-1.42, pitch));
}

export function orbitCameraEye(yaw, pitch, distance = 4.35) {
  const cp = Math.cos(pitch);
  return [
    distance * Math.sin(yaw) * cp,
    distance * Math.sin(pitch),
    distance * Math.cos(yaw) * cp,
  ];
}

export function lookAtMatrix4(eye, target = [0, 0, 0], up = [0, 1, 0]) {
  const zAxis = vecNormalize(vecSub(eye, target));
  const xAxis = vecNormalize(vecCross(up, zAxis));
  const yAxis = vecCross(zAxis, xAxis);
  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -(xAxis[0] * eye[0] + xAxis[1] * eye[1] + xAxis[2] * eye[2]),
    -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]),
    -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]),
    1,
  ]);
}

export function perspectiveMatrix4(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY * 0.5);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / Math.max(0.25, aspect), 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0,
  ]);
}

export function mat4Mul(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

export function projectPoint3D(pt, mvp, width, height) {
  const x = pt[0], y = pt[1], z = pt[2];
  const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
  const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
  const cz = mvp[2] * x + mvp[6] * y + mvp[10] * z + mvp[14];
  const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (cw <= 0.05) return { visible: false, x: 0, y: 0, depth: cw };
  const nx = cx / cw, ny = cy / cw;
  return {
    visible: Math.abs(nx) <= 2 && Math.abs(ny) <= 2,
    x: (nx * 0.5 + 0.5) * width,
    y: (0.5 - ny * 0.5) * height,
    depth: cz / cw,
  };
}

// Coordinates use [x, z_up, y] so mathematical z maps to vertical screen +Y.
export const surfaceDefinitions = {
  torus: {
    name: "Torus",
    equation: "(√(x² + y²) − 1)² + z² = 0.36²",
    description: "A genus-1 compact manifold of tube radius 0.36 around the unit circle.",
    rgb: [0.46, 0.93, 0.80],
    rim: [0.35, 0.72, 0.98],
    uSegs: 42,
    vSegs: 24,
    pointAt(s, t) {
      const u = s * TURN, v = t * TURN;
      const radius = 1 + 0.36 * Math.cos(v);
      return [radius * Math.cos(u), 0.36 * Math.sin(v), radius * Math.sin(u)];
    },
    geodesic(phase) {
      const u = phase, v = phase * 3;
      const radius = 1 + 0.38 * Math.cos(v);
      return [radius * Math.cos(u), 0.38 * Math.sin(v), radius * Math.sin(u)];
    },
  },
  mobius: {
    name: "Möbius strip",
    equation: "r = 1 + v cos(u/2) · non-orientable surface",
    description: "A half-twisted non-orientable band with 0 ≤ u ≤ 2π and −0.36 ≤ v ≤ 0.36.",
    rgb: [0.74, 0.65, 1.0],
    rim: [0.48, 0.92, 0.82],
    uSegs: 56,
    vSegs: 14,
    pointAt(s, t) {
      const u = s * TURN, v = 0.36 * (2 * t - 1);
      const radius = 1 + v * Math.cos(u * 0.5);
      return [radius * Math.cos(u), v * Math.sin(u * 0.5), radius * Math.sin(u)];
    },
    geodesic(phase) {
      const u = phase % (TURN * 2), v = 0.32 * Math.sin(phase * 0.5);
      const radius = 1 + v * Math.cos(u * 0.5);
      return [radius * Math.cos(u), v * Math.sin(u * 0.5), radius * Math.sin(u)];
    },
  },
  saddle: {
    name: "Saddle",
    equation: "z = x² − y² · harmonic (Δz = 0)",
    description: "A hyperbolic paraboloid of negative Gaussian curvature everywhere.",
    rgb: [0.49, 0.76, 0.98],
    rim: [0.54, 0.95, 0.82],
    uSegs: 28,
    vSegs: 28,
    pointAt(s, t) {
      const x = s * 2 - 1, y = t * 2 - 1;
      return [x * 1.15, (x * x - y * y) * 0.85, y * 1.15];
    },
    geodesic(phase) {
      const x = 0.75 * Math.cos(phase), y = 0.75 * Math.sin(phase);
      return [x * 1.15, (x * x - y * y) * 0.85, y * 1.15];
    },
  },
  enneper: {
    name: "Enneper",
    equation: "x = u − u³/3 + uv² · minimal surface (H = 0)",
    description: "A self-intersecting classical minimal surface with conformal isothermal coordinates.",
    rgb: [0.36, 0.88, 0.78],
    rim: [0.76, 0.66, 0.98],
    uSegs: 28,
    vSegs: 28,
    pointAt(s, t) {
      const u = (s * 2 - 1) * 0.95, v = (t * 2 - 1) * 0.95;
      const x = u - (u * u * u) / 3 + u * v * v;
      const y = v - (v * v * v) / 3 + v * u * u;
      const z = u * u - v * v;
      return [x * 0.78, z * 0.78, y * 0.78];
    },
    geodesic(phase) {
      const u = 0.72 * Math.cos(phase), v = 0.72 * Math.sin(phase);
      const x = u - (u * u * u) / 3 + u * v * v;
      const y = v - (v * v * v) / 3 + v * u * u;
      const z = u * u - v * v;
      return [x * 0.78, z * 0.78, y * 0.78];
    },
  },
};

export function surfacePointAndNormal(key, s, t) {
  const def = surfaceDefinitions[key] || surfaceDefinitions.torus;
  const eps = 1e-4;
  const p = def.pointAt(s, t);
  const pu = def.pointAt(s + eps, t);
  const pv = def.pointAt(s, t + eps);
  const du = [(pu[0] - p[0]) / eps, (pu[1] - p[1]) / eps, (pu[2] - p[2]) / eps];
  const dv = [(pv[0] - p[0]) / eps, (pv[1] - p[1]) / eps, (pv[2] - p[2]) / eps];
  const normal = vecNormalize(vecCross(du, dv));
  return { point: p, normal, du, dv };
}

export function buildSurfaceMesh(key) {
  const def = surfaceDefinitions[key] || surfaceDefinitions.torus;
  const { uSegs, vSegs, rgb, rim } = def;
  const grid = [];
  for (let i = 0; i <= uSegs; i++) {
    const row = [];
    for (let j = 0; j <= vSegs; j++) {
      row.push(surfacePointAndNormal(key, i / uSegs, j / vSegs));
    }
    grid.push(row);
  }

  const pos = [], norm = [], col = [], tris = [];
  const linePos = [], lineCol = [], lines = [];
  const pushTri = (a, b, c) => {
    pos.push(...a.point, ...b.point, ...c.point);
    norm.push(...a.normal, ...b.normal, ...c.normal);
    for (const vtx of [a, b, c]) {
      const mix = 0.5 + 0.5 * vtx.normal[1];
      col.push(
        rgb[0] * (0.7 + 0.3 * mix) + rim[0] * (1 - mix) * 0.25,
        rgb[1] * (0.7 + 0.3 * mix) + rim[1] * (1 - mix) * 0.25,
        rgb[2] * (0.7 + 0.3 * mix) + rim[2] * (1 - mix) * 0.25,
        0.74,
      );
    }
    tris.push({ p0: a.point, p1: b.point, p2: c.point, n: a.normal, col: [...rgb, 0.62] });
  };

  for (let i = 0; i < uSegs; i++) {
    for (let j = 0; j < vSegs; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      pushTri(a, b, c);
      pushTri(a, c, d);
    }
  }

  const wireA = [...rgb, 0.55], wireB = [0.85, 0.93, 1.0, 0.24];
  for (let i = 0; i <= uSegs; i += 3) {
    for (let j = 0; j < vSegs; j++) {
      const a = grid[i][j].point, b = grid[i][j + 1].point;
      const c = i % 6 === 0 ? wireA : wireB;
      linePos.push(...a, ...b); lineCol.push(...c, ...c);
      lines.push({ a, b, col: c });
    }
  }
  for (let j = 0; j <= vSegs; j += 3) {
    for (let i = 0; i < uSegs; i++) {
      const a = grid[i][j].point, b = grid[i + 1][j].point;
      const c = j % 6 === 0 ? wireA : wireB;
      linePos.push(...a, ...b); lineCol.push(...c, ...c);
      lines.push({ a, b, col: c });
    }
  }

  // Reference equatorial circle around origin
  const ringPts = 84;
  for (let i = 0; i < ringPts; i++) {
    const a0 = (i / ringPts) * TURN, a1 = ((i + 1) / ringPts) * TURN;
    const p0 = [1.55 * Math.cos(a0), -0.62, 1.55 * Math.sin(a0)];
    const p1 = [1.55 * Math.cos(a1), -0.62, 1.55 * Math.sin(a1)];
    const c = [0.55, 0.66, 0.85, 0.22];
    linePos.push(...p0, ...p1); lineCol.push(...c, ...c);
    lines.push({ a: p0, b: p1, col: c });
  }

  return {
    pos: new Float32Array(pos),
    norm: new Float32Array(norm),
    col: new Float32Array(col),
    linePos: new Float32Array(linePos),
    lineCol: new Float32Array(lineCol),
    tris,
    lines,
  };
}

const SURF_VS = `#version 300 es
  in vec3 aPos;
  in vec3 aNorm;
  in vec4 aCol;
  uniform mat4 uMvp;
  out vec3 vPos;
  out vec3 vNorm;
  out vec4 vCol;
  void main() {
    vPos = aPos;
    vNorm = normalize(aNorm);
    vCol = aCol;
    gl_Position = uMvp * vec4(aPos, 1.0);
  }`;

const SURF_FS = `#version 300 es
  precision highp float;
  in vec3 vPos;
  in vec3 vNorm;
  in vec4 vCol;
  uniform vec3 uEye;
  out vec4 fragColor;
  void main() {
    vec3 N = normalize(vNorm);
    vec3 V = normalize(uEye - vPos);
    vec3 L = normalize(vec3(2.4, 3.2, 2.5));
    vec3 H = normalize(L + V);
    float diff = abs(dot(N, L)) * 0.68 + 0.32;
    float spec = pow(max(abs(dot(N, H)), 0.0), 34.0) * 0.45;
    float fres = pow(1.0 - max(abs(dot(N, V)), 0.0), 2.5) * 0.36;
    vec3 rgb = vCol.rgb * diff + vec3(0.84, 0.96, 1.0) * (spec + fres);
    fragColor = vec4(rgb, vCol.a);
  }`;

const LINE_VS = `#version 300 es
  in vec3 aPos;
  in vec4 aCol;
  uniform mat4 uMvp;
  uniform float uPointSize;
  out vec4 vCol;
  void main() {
    vCol = aCol;
    gl_Position = uMvp * vec4(aPos, 1.0);
    gl_PointSize = uPointSize;
  }`;

const LINE_FS = `#version 300 es
  precision highp float;
  in vec4 vCol;
  uniform float uIsPoint;
  out vec4 fragColor;
  void main() {
    if (uIsPoint > 0.5) {
      vec2 d = gl_PointCoord * 2.0 - 1.0;
      float r2 = dot(d, d);
      if (r2 > 1.0) discard;
      fragColor = vec4(vCol.rgb, vCol.a * (1.0 - smoothstep(0.55, 1.0, r2)));
    } else {
      fragColor = vCol;
    }
  }`;

function linkProgram(gl, vsSrc, fsSrc) {
  const mk = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); throw new Error("shader"); }
    return sh;
  };
  const vs = mk(gl.VERTEX_SHADER, vsSrc), fs = mk(gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.deleteProgram(prog); throw new Error("link"); }
  return prog;
}

function createWebGL2Backend(canvas) {
  let gl = null;
  try { gl = canvas.getContext("webgl2", { antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return null; }
  if (!gl) return null;
  let surfProg, lineProg;
  try {
    surfProg = linkProgram(gl, SURF_VS, SURF_FS);
    lineProg = linkProgram(gl, LINE_VS, LINE_FS);
  } catch { return null; }

  const buffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
  const [bPos, bNorm, bCol, bLPos, bLCol, bPPos, bPCol] = buffers;
  const vaoSurf = gl.createVertexArray(), vaoLine = gl.createVertexArray(), vaoPt = gl.createVertexArray();
  const bindAttr = (prog, name, buf, size) => {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  gl.bindVertexArray(vaoSurf);
  bindAttr(surfProg, "aPos", bPos, 3); bindAttr(surfProg, "aNorm", bNorm, 3); bindAttr(surfProg, "aCol", bCol, 4);
  gl.bindVertexArray(vaoLine);
  bindAttr(lineProg, "aPos", bLPos, 3); bindAttr(lineProg, "aCol", bLCol, 4);
  gl.bindVertexArray(vaoPt);
  bindAttr(lineProg, "aPos", bPPos, 3); bindAttr(lineProg, "aCol", bPCol, 4);
  gl.bindVertexArray(null);

  let uploadedKey = null, uploadedMesh = null;
  return {
    kind: "webgl2",
    isLost: () => gl.isContextLost(),
    render({ surfaceKey, mesh, mvp, eye, tracer, width, height, dpr }) {
      if (gl.isContextLost()) return false;
      if (uploadedKey !== surfaceKey) {
        uploadedKey = surfaceKey; uploadedMesh = mesh;
        gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bNorm); gl.bufferData(gl.ARRAY_BUFFER, mesh.norm, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bCol); gl.bufferData(gl.ARRAY_BUFFER, mesh.col, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bLPos); gl.bufferData(gl.ARRAY_BUFFER, mesh.linePos, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bLCol); gl.bufferData(gl.ARRAY_BUFFER, mesh.lineCol, gl.STATIC_DRAW);
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.05, 0.08, 0.14, 0.92);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(surfProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(surfProg, "uMvp"), false, mvp);
      gl.uniform3f(gl.getUniformLocation(surfProg, "uEye"), eye[0], eye[1], eye[2]);
      gl.bindVertexArray(vaoSurf);
      gl.drawArrays(gl.TRIANGLES, 0, uploadedMesh.pos.length / 3);

      gl.useProgram(lineProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, "uMvp"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(lineProg, "uIsPoint"), 0.0);
      gl.uniform1f(gl.getUniformLocation(lineProg, "uPointSize"), 1.0);
      gl.bindVertexArray(vaoLine);
      gl.drawArrays(gl.LINES, 0, uploadedMesh.linePos.length / 3);

      if (tracer) {
        gl.uniform1f(gl.getUniformLocation(lineProg, "uIsPoint"), 1.0);
        gl.uniform1f(gl.getUniformLocation(lineProg, "uPointSize"), 13 * dpr);
        gl.bindVertexArray(vaoPt);
        gl.bindBuffer(gl.ARRAY_BUFFER, bPPos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tracer), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bPCol); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.99, 0.94, 0.65, 1.0]), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.POINTS, 0, 1);
      }
      gl.bindVertexArray(null);
      return true;
    },
    dispose() {
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteVertexArray(vaoSurf); gl.deleteVertexArray(vaoLine); gl.deleteVertexArray(vaoPt);
      gl.deleteProgram(surfProg); gl.deleteProgram(lineProg);
    },
  };
}

function createCanvas2DBackend(canvas) {
  let ctx = null;
  try { ctx = canvas.getContext("2d"); } catch { return null; }
  if (!ctx) return null;
  const rgba = (c) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${(c[3] ?? 1).toFixed(2)})`;
  return {
    kind: "canvas2d",
    isLost: () => false,
    render({ surfaceKey, mesh, mvp, eye, tracer, width, height, dpr }) {
      const def = surfaceDefinitions[surfaceKey] || surfaceDefinitions.torus;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const grad = ctx.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, width * 0.6);
      grad.addColorStop(0, `rgba(${Math.round(def.rgb[0] * 255)},${Math.round(def.rgb[1] * 255)},${Math.round(def.rgb[2] * 255)},0.14)`);
      grad.addColorStop(1, "rgba(11,16,28,0)");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);

      const draw = [];
      for (const t of mesh.tris) {
        const a = projectPoint3D(t.p0, mvp, width, height);
        const b = projectPoint3D(t.p1, mvp, width, height);
        const c = projectPoint3D(t.p2, mvp, width, height);
        if (!a.visible || !b.visible || !c.visible) continue;
        const l = Math.abs(t.n[0] * 0.4 + t.n[1] * 0.75 + t.n[2] * 0.5);
        const shade = 0.45 + 0.55 * l;
        draw.push({ k: "t", d: (a.depth + b.depth + c.depth) / 3, a, b, c, col: [t.col[0] * shade, t.col[1] * shade, t.col[2] * shade, 0.52] });
      }
      for (const l of mesh.lines) {
        const a = projectPoint3D(l.a, mvp, width, height);
        const b = projectPoint3D(l.b, mvp, width, height);
        if (!a.visible && !b.visible) continue;
        draw.push({ k: "l", d: (a.depth + b.depth) * 0.5, a, b, col: l.col });
      }
      draw.sort((u, v) => v.d - u.d);
      for (const item of draw) {
        if (item.k === "t") {
          ctx.beginPath(); ctx.moveTo(item.a.x, item.a.y); ctx.lineTo(item.b.x, item.b.y); ctx.lineTo(item.c.x, item.c.y);
          ctx.closePath(); ctx.fillStyle = rgba(item.col); ctx.fill();
        } else {
          ctx.beginPath(); ctx.moveTo(item.a.x, item.a.y); ctx.lineTo(item.b.x, item.b.y);
          ctx.strokeStyle = rgba(item.col); ctx.lineWidth = Math.max(1, dpr * 1.1); ctx.stroke();
        }
      }
      if (tracer && eye) {
        const q = projectPoint3D(tracer, mvp, width, height);
        if (q.visible) {
          ctx.beginPath(); ctx.arc(q.x, q.y, 4.2 * dpr, 0, TURN);
          ctx.fillStyle = "rgba(255, 240, 166, 0.95)"; ctx.fill();
        }
      }
      return true;
    },
    dispose() {},
  };
}

function bindCardTilt(signal) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)");
  if (reduced.matches || coarse.matches) return;
  for (const card of document.querySelectorAll(".exam-card, .topic-list > button, .proof-card")) {
    card.classList.add("tilt-3d");
    card.addEventListener("pointermove", (e) => {
      if (reduced.matches) return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      card.style.setProperty("--rx", `${((0.5 - py) * 7).toFixed(2)}deg`);
      card.style.setProperty("--ry", `${((px - 0.5) * 7).toFixed(2)}deg`);
      card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      card.style.setProperty("--sheen", "1");
    }, { signal });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--sheen", "0");
    }, { signal });
  }
}

export function stopOrbit() {
  if (unmount) unmount();
  unmount = null;
}

const meshCache = new Map();
function getMesh(key) {
  if (!meshCache.has(key)) meshCache.set(key, buildSurfaceMesh(key));
  return meshCache.get(key);
}

export function mountOrbit(canvas, paused = false) {
  stopOrbit();
  if (!canvas || typeof document === "undefined") return;
  const figure = canvas.closest?.("[data-surface-lab]");
  if (!figure) return;

  const buttons = [...figure.querySelectorAll("[data-surface]")];
  const label = figure.querySelector("[data-surface-name]");
  const equation = figure.querySelector("[data-surface-equation]");
  const motionPreference = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener() {} };
  const listeners = new AbortController();
  const options = { signal: listeners.signal };

  let backend = createWebGL2Backend(canvas) || createCanvas2DBackend(canvas);
  if (figure?.dataset) figure.dataset.renderer = backend?.kind || "none";

  let width = 0, height = 0, frame = 0, resizeRaf = 0, lastTime = null, phase = 0.5;
  let visible = true, disposed = false, drag = null;

  bindCardTilt(listeners.signal);

  function draw() {
    if (disposed || !backend || width < 1 || height < 1) return;
    if (backend.isLost()) {
      backend.dispose();
      backend = createCanvas2DBackend(canvas);
      if (figure?.dataset) figure.dataset.renderer = backend?.kind || "none";
      if (!backend) return;
    }
    const dpr = Math.min(typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1, 2);
    const pw = Math.max(120, Math.round(width * dpr));
    const ph = Math.max(120, Math.round(height * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw; canvas.height = ph;
    }
    const def = surfaceDefinitions[view.surface] || surfaceDefinitions.torus;
    const eye = orbitCameraEye(view.yaw, view.pitch, view.distance);
    const mvp = mat4Mul(perspectiveMatrix4(0.68, pw / Math.max(1, ph), 0.1, 30), lookAtMatrix4(eye));
    backend.render({
      surfaceKey: view.surface,
      mesh: getMesh(view.surface),
      mvp,
      eye,
      tracer: def.geodesic(phase),
      width: pw,
      height: ph,
      dpr,
    });
  }

  function shouldRotate() {
    return !disposed && visible && !drag && !paused && !motionPreference.matches && !document.hidden;
  }

  function animate(now) {
    frame = 0;
    if (!shouldRotate()) return;
    if (lastTime !== null) {
      const dt = Math.min(now - lastTime, 48);
      view.yaw = (view.yaw + dt * 0.00024) % TURN;
      phase = (phase + dt * 0.0008) % (TURN * 2);
    }
    lastTime = now;
    draw();
    frame = requestAnimationFrame(animate);
  }

  function refresh() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTime = null;
    draw();
    if (shouldRotate() && typeof requestAnimationFrame === "function") frame = requestAnimationFrame(animate);
  }

  function resize() {
    const host = canvas.parentElement || canvas;
    const bounds = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: 320, height: 220 };
    width = bounds.width || 320;
    height = bounds.height || 220;
    draw();
  }

  function selectSurface(key) {
    if (!Object.hasOwn(surfaceDefinitions, key)) return;
    view.surface = key;
    const model = surfaceDefinitions[key];
    if (label) label.textContent = model.name;
    if (equation) equation.textContent = model.equation;
    canvas.setAttribute?.("aria-label", `${model.name}. ${model.description} Drag or use arrow keys to rotate.`);
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.surface === key));
    refresh();
  }

  for (const button of buttons) button.addEventListener("click", () => selectSurface(button.dataset.surface), options);

  canvas.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-", "_"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") { view.yaw = 0.36; view.pitch = 0.56; view.distance = 4.35; }
    else if (event.key === "ArrowLeft") view.yaw -= 0.14;
    else if (event.key === "ArrowRight") view.yaw += 0.14;
    else if (event.key === "ArrowUp") view.pitch = clampPitch(view.pitch + 0.12);
    else if (event.key === "ArrowDown") view.pitch = clampPitch(view.pitch - 0.12);
    else if (event.key === "+" || event.key === "=") view.distance = Math.max(2.4, view.distance - 0.35);
    else if (event.key === "-" || event.key === "_") view.distance = Math.min(7.5, view.distance + 0.35);
    refresh();
  }, options);

  canvas.addEventListener("pointerdown", (event) => {
    if (drag || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
    refresh();
  }, options);

  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    view.yaw += (event.clientX - drag.x) * 0.009;
    view.pitch = clampPitch(view.pitch + (event.clientY - drag.y) * 0.008);
    drag.x = event.clientX; drag.y = event.clientY;
    draw();
  }, options);

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null; refresh();
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, endDrag, options);

  canvas.addEventListener?.("webglcontextlost", (e) => {
    e.preventDefault();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    backend?.dispose();
    backend = createCanvas2DBackend(canvas);
    draw();
  }, options);

  document.addEventListener("visibilitychange", refresh, options);
  motionPreference.addEventListener?.("change", refresh, options);

  const sizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
        if (resizeRaf || disposed) return;
        resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; if (!disposed) resize(); });
      })
    : null;
  sizeObserver?.observe(canvas.parentElement || canvas);

  const visibilityObserver = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        refresh();
      })
    : null;
  visibilityObserver?.observe(canvas);

  resize();
  selectSurface(view.surface);

  unmount = () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    if (drag && canvas.hasPointerCapture?.(drag.id)) canvas.releasePointerCapture(drag.id);
    listeners.abort();
    sizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    backend?.dispose();
  };
  return unmount;
}
