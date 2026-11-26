import test from "node:test";
import assert from "node:assert/strict";
import {
  TURN,
  surfaceDefinitions,
  surfacePointAndNormal,
  buildSurfaceMesh,
  orbitCameraEye,
  lookAtMatrix4,
} from "../dist/orbit.js";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("SO(3) lookAt camera frames remain orthonormal with determinant +1", () => {
  for (let i = 0; i < 16; i++) {
    const yaw = -Math.PI + (TURN * i) / 16;
    const pitch = -1.2 + (2.4 * i) / 15;
    const eye = orbitCameraEye(yaw, pitch, 4.35);
    assert.ok(Math.abs(Math.hypot(...eye) - 4.35) < 1e-12);
    const V = lookAtMatrix4(eye);
    const r0 = [V[0], V[4], V[8]];
    const r1 = [V[1], V[5], V[9]];
    const r2 = [V[2], V[6], V[10]];
    assert.ok(Math.abs(dot(r0, r0) - 1) < 1e-6);
    assert.ok(Math.abs(dot(r1, r1) - 1) < 1e-6);
    assert.ok(Math.abs(dot(r2, r2) - 1) < 1e-6);
    assert.ok(Math.abs(dot(r0, r1)) < 1e-6);
    assert.ok(Math.abs(dot(r0, r2)) < 1e-6);
    assert.ok(Math.abs(dot(r1, r2)) < 1e-6);
    const det =
      r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
      r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
      r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
    assert.ok(Math.abs(det - 1) < 1e-6);
  }
});

test("torus vertices satisfy exact implicit equation (sqrt(x^2 + y^2) - 1)^2 + z^2 = 0.36^2", () => {
  const def = surfaceDefinitions.torus;
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 10; j++) {
      const [x, zUp, y] = def.pointAt(i / 12, j / 10);
      const rRing = Math.hypot(x, y);
      const residual = (rRing - 1) ** 2 + zUp ** 2 - 0.36 ** 2;
      assert.ok(Math.abs(residual) < 1e-12, `residual=${residual}`);
    }
  }
});

test("Mobius strip proves non-orientability: unit normal reverses after one full loop", () => {
  // Note s=0 and s=1 wrap u from 0 to 2pi at center circle t=0.5 (v=0)
  const start = surfacePointAndNormal("mobius", 0, 0.5);
  const end = surfacePointAndNormal("mobius", 1, 0.5);
  assert.ok(Math.hypot(...start.point.map((v, i) => v - end.point[i])) < 1e-12);
  const cosAngle = dot(start.normal, end.normal);
  assert.ok(Math.abs(cosAngle + 1) < 1e-4, `Expected opposite normals, got dot=${cosAngle}`);
});

test("Enneper minimal surface preserves conformal isotropy (E = G, F = 0)", () => {
  for (const [s, t] of [[0.3, 0.4], [0.7, 0.25], [0.55, 0.8]]) {
    const { du, dv, normal } = surfacePointAndNormal("enneper", s, t);
    const E = dot(du, du), G = dot(dv, dv), F = dot(du, dv);
    assert.ok(Math.abs(E - G) / E < 1e-3, `Conformal E != G: ${E} vs ${G}`);
    assert.ok(Math.abs(F) / E < 1e-3, `Conformal F != 0: ${F}`);
    assert.ok(Math.abs(dot(normal, du)) < 1e-6);
    assert.ok(Math.abs(dot(normal, dv)) < 1e-6);
  }
});

test("all 4 Olympiad manifolds generate valid finite WebGL2 & fallback buffers", () => {
  for (const key of Object.keys(surfaceDefinitions)) {
    const mesh = buildSurfaceMesh(key);
    assert.ok(mesh.pos.length > 0 && mesh.pos.length % 9 === 0);
    assert.equal(mesh.pos.length, mesh.norm.length);
    assert.ok(mesh.linePos.length > 0 && mesh.linePos.length % 6 === 0);
    for (const v of mesh.pos) assert.ok(Number.isFinite(v));
  }
});
