const TURN = Math.PI * 2;
const view = { surface: "torus", yaw: 0.32, pitch: 0.62 };
let unmount = null;

// The wire coordinates never change during rotation. Store each polyline once.
function curve(segments, pointAt) {
  const points = new Float32Array((segments + 1) * 3);
  for (let index = 0; index <= segments; index++) {
    points.set(pointAt(index / segments), index * 3);
  }
  return points;
}

function wireGrid(pointAt, uLines, vLines, closeU = false, closeV = false) {
  const lines = [];
  for (let index = 0; index < uLines + (closeU ? 0 : 1); index++) {
    lines.push({
      points: curve(48, (v) => pointAt(index / uLines, v)),
      accent: index % 3 === 0,
    });
  }
  for (let index = 0; index < vLines + (closeV ? 0 : 1); index++) {
    lines.push({
      points: curve(80, (u) => pointAt(u, index / vLines)),
      accent: index % 3 === 0,
    });
  }
  return lines;
}

// Coordinates are stored as [x, z, y] so the mathematical z-axis points up.
const surfaces = {
  torus: {
    name: "Torus",
    equation: "(√(x² + y²) − 1)² + z² = 0.36²",
    description: "A tube of radius 0.36 around a circle of radius 1.",
    color: "128,238,209",
    lines: wireGrid(
      (s, t) => {
        const u = s * TURN,
          v = t * TURN,
          radius = 1 + 0.36 * Math.cos(v);
        return [radius * Math.cos(u), 0.36 * Math.sin(v), radius * Math.sin(u)];
      },
      24,
      18,
      true,
      true,
    ),
  },
  mobius: {
    name: "Möbius strip",
    equation: "r = 1 + v cos(u/2)\nx = r cos u, y = r sin u, z = v sin(u/2)",
    description: "A half-twisted band with 0 ≤ u ≤ 2π and −0.36 ≤ v ≤ 0.36.",
    color: "188,166,255",
    lines: wireGrid(
      (s, t) => {
        const u = s * TURN,
          v = 0.36 * (2 * t - 1),
          radius = 1 + v * Math.cos(u / 2);
        return [
          radius * Math.cos(u),
          v * Math.sin(u / 2),
          radius * Math.sin(u),
        ];
      },
      40,
      12,
      true,
    ),
  },
  saddle: {
    name: "Saddle",
    equation: "z = x² − y²,   −1 ≤ x, y ≤ 1",
    description:
      "A hyperbolic paraboloid that rises along x and falls along y.",
    color: "126,194,251",
    lines: wireGrid(
      (s, t) => {
        const x = s * 2 - 1,
          y = t * 2 - 1;
        return [x, x * x - y * y, y];
      },
      22,
      22,
    ),
  },
};
const orbitRing = curve(120, (t) => [
  1.68 * Math.cos(t * TURN),
  0,
  1.68 * Math.sin(t * TURN),
]);
const clampPitch = (pitch) => Math.min(1.45, Math.max(-1.45, pitch));

export function stopOrbit() {
  if (unmount) unmount();
  unmount = null;
}

export function mountOrbit(canvas, paused = false) {
  stopOrbit();
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const figure = canvas.closest("[data-surface-lab]");
  if (!context || !figure) return;
  const buttons = [...figure.querySelectorAll("[data-surface]")];
  const label = figure.querySelector("[data-surface-name]");
  const equation = figure.querySelector("[data-surface-equation]");
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let width = 0,
    height = 0,
    frame = 0,
    lastTime = null;
  let visible = true,
    disposed = false,
    drag = null;

  function draw() {
    if (disposed || width < 1 || height < 1) return;
    const model = surfaces[view.surface];
    context.clearRect(0, 0, width, height);
    const glow = context.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      width * 0.52,
    );
    glow.addColorStop(0, `rgba(${model.color},0.09)`);
    glow.addColorStop(1, `rgba(${model.color},0)`);
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    const yawCos = Math.cos(view.yaw),
      yawSin = Math.sin(view.yaw);
    const pitchCos = Math.cos(view.pitch),
      pitchSin = Math.sin(view.pitch);
    const scale = Math.min(width * 0.265, height * 0.43);
    function stroke(points, color, weight) {
      context.beginPath();
      for (let i = 0; i < points.length; i += 3) {
        const x = points[i] * yawCos - points[i + 2] * yawSin;
        const back = points[i] * yawSin + points[i + 2] * yawCos;
        const up = points[i + 1] * pitchCos - back * pitchSin;
        const depth = points[i + 1] * pitchSin + back * pitchCos;
        const perspective = (scale * 5.5) / (5.5 - depth);
        const px = width / 2 + x * perspective,
          py = height / 2 - up * perspective;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.strokeStyle = color;
      context.lineWidth = weight;
      context.stroke();
    }
    if (view.surface === "torus") stroke(orbitRing, "#8495b344", 0.65);
    for (const line of model.lines) {
      stroke(
        line.points,
        `rgba(${model.color},${line.accent ? "0.78" : "0.32"})`,
        line.accent ? 1 : 0.65,
      );
    }
  }

  function shouldRotate() {
    return (
      !disposed &&
      visible &&
      !drag &&
      !paused &&
      !motionPreference.matches &&
      !document.hidden
    );
  }
  function animate(now) {
    frame = 0;
    if (!shouldRotate()) return;
    if (lastTime !== null)
      view.yaw = (view.yaw + Math.min(now - lastTime, 48) * 0.0002) % TURN;
    lastTime = now;
    draw();
    frame = requestAnimationFrame(animate);
  }
  function refresh() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
    draw();
    if (shouldRotate()) frame = requestAnimationFrame(animate);
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    draw();
  }
  function selectSurface(key) {
    if (!Object.hasOwn(surfaces, key)) return;
    view.surface = key;
    const model = surfaces[key];
    label.textContent = model.name;
    equation.textContent = model.equation;
    canvas.setAttribute(
      "aria-label",
      `${model.name}. ${model.description} Drag or use arrow keys to rotate.`,
    );
    for (const button of buttons)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.surface === key),
      );
    refresh();
  }
  for (const button of buttons)
    button.addEventListener(
      "click",
      () => selectSurface(button.dataset.surface),
      options,
    );
  canvas.addEventListener(
    "keydown",
    (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(
          event.key,
        )
      )
        return;
      event.preventDefault();
      if (event.key === "Home") {
        view.yaw = 0.32;
        view.pitch = 0.62;
      } else if (event.key === "ArrowLeft") view.yaw -= 0.14;
      else if (event.key === "ArrowRight") view.yaw += 0.14;
      else
        view.pitch = clampPitch(
          view.pitch + (event.key === "ArrowUp" ? 0.12 : -0.12),
        );
      refresh();
    },
    options,
  );
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (drag || !event.isPrimary || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      refresh();
    },
    options,
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      view.yaw += (event.clientX - drag.x) * 0.009;
      view.pitch = clampPitch(view.pitch + (event.clientY - drag.y) * 0.008);
      drag.x = event.clientX;
      drag.y = event.clientY;
      draw();
    },
    options,
  );
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    refresh();
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(name, endDrag, options);
  document.addEventListener("visibilitychange", refresh, options);
  motionPreference.addEventListener("change", refresh, options);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(canvas);
  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    refresh();
  });
  visibilityObserver.observe(canvas);
  resize();
  selectSurface(view.surface);
  unmount = () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    if (drag && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
    listeners.abort();
    sizeObserver.disconnect();
    visibilityObserver.disconnect();
  };
  return unmount;
}
