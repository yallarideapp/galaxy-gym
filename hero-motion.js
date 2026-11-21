// Home page motion. The lights-on sequence and the opening screen are CSS (hero-motion.css).
// This file draws the galaxy once, lets a tap skip the opening screen, and adds depth:
// the hexagon cluster leans a little toward the pointer and drifts as the page scrolls.
const root = document.documentElement;
const cluster = document.querySelector("[data-hex-cluster]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Opening screen: any tap or key press jumps straight to the hexagon opening.
const splash = document.querySelector("[data-splash]");
if (splash && root.classList.contains("is-splash")) {
  const opening = () => splash.getAnimations().find((animation) => animation.animationName === "splash-open");
  const skip = () => {
    const elapsed = opening()?.currentTime;
    if (typeof elapsed === "number" && elapsed < 1700) root.style.setProperty("--splash-exit", `${Math.round(elapsed)}ms`);
  };
  const finish = () => {
    removeEventListener("keydown", skip);
    splash.remove();
  };
  splash.addEventListener("pointerdown", skip, { once: true });
  addEventListener("keydown", skip, { once: true });
  splash.addEventListener("animationend", (event) => {
    if (event.animationName === "splash-open") finish();
  });
}

// The galaxy: two spiral arms of lamp-white and logo-orange points around a soft core.
// Drawn once per size; CSS tilts the disc and turns it, so nothing runs per frame.
const galaxy = document.querySelector("[data-galaxy]");
if (galaxy) {
  // A small seeded generator, so the same galaxy comes back after every resize.
  const random = (seed) => () => {
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  let drawnSize = 0;

  function draw() {
    const cssSize = galaxy.clientWidth;
    const size = Math.min(Math.round(cssSize * Math.min(devicePixelRatio || 1, 2)), 1500);
    if (!size || size === drawnSize) return;
    drawnSize = size;
    galaxy.width = size;
    galaxy.height = size;
    const context = galaxy.getContext("2d");
    const next = random(20261121);
    const centre = size / 2;
    const reach = size * 0.48;
    const scale = size / 1000;

    const core = context.createRadialGradient(centre, centre, 0, centre, centre, reach * 0.4);
    core.addColorStop(0, "rgba(255,220,165,.4)");
    core.addColorStop(0.4, "rgba(246,174,69,.13)");
    core.addColorStop(1, "rgba(246,174,69,0)");
    context.fillStyle = core;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = "lighter";

    // Where a point at this distance sits on arm 0 or 1; the arms wind about 290° from core to rim.
    const armAngle = (arm, distance) => arm * Math.PI + distance * 5.1;
    const dot = (x, y, radius, colour) => {
      context.fillStyle = colour;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    };

    // A soft haze along each arm, built from many faint overlapping discs.
    for (let index = 0; index < 520; index += 1) {
      const distance = 0.1 + 0.88 * next();
      const angle = armAngle(index % 2, distance) + (next() - 0.5) * 0.3;
      const radius = (22 + 46 * next()) * scale * (0.6 + distance);
      const x = centre + Math.cos(angle) * distance * reach;
      const y = centre + Math.sin(angle) * distance * reach;
      const haze = context.createRadialGradient(x, y, 0, x, y, radius);
      const strength = 0.04 * (1 - distance ** 3);
      haze.addColorStop(0, next() < 0.45 ? `rgba(246,174,69,${strength})` : `rgba(255,255,255,${strength * 0.8})`);
      haze.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = haze;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    // Stars: most follow the arms with some scatter, the rest fill the disc between them.
    const points = Math.round(2100 * Math.min(1, cssSize / 820) + 700);
    for (let index = 0; index < points; index += 1) {
      const loose = next() < 0.2;
      const distance = loose ? Math.sqrt(next()) : 0.06 + 0.94 * next() ** 0.85;
      const scatter = (next() + next() + next() - 1.5) * (0.42 - 0.16 * distance);
      const angle = loose ? next() * Math.PI * 2 : armAngle(index % 2, distance) + scatter;
      const bright = next();
      const radius = (0.55 + bright ** 3 * 0.95) * scale;
      const alpha = (loose ? 0.3 : 0.42 + 0.58 * bright) * (0.3 + 0.7 * (1 - distance ** 3));
      dot(centre + Math.cos(angle) * distance * reach, centre + Math.sin(angle) * distance * reach, radius,
        next() < 0.26 ? `rgba(255,190,96,${alpha})` : `rgba(255,255,255,${alpha})`);
    }
  }

  draw();
  // No need to keep turning it once the hero has scrolled out of view.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      galaxy.style.animationPlayState = entry.isIntersecting ? "running" : "paused";
    }).observe(galaxy);
  }
  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 200);
  });
}

if (cluster) {
  const hero = cluster.closest(".hero");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let scrollShift = 0;
  let frame = 0;

  function paint() {
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y + scrollShift - current.y) * 0.12;
    cluster.style.setProperty("--px", current.x.toFixed(2));
    cluster.style.setProperty("--py", current.y.toFixed(2));
    const settled = Math.abs(target.x - current.x) < 0.05 && Math.abs(target.y + scrollShift - current.y) < 0.05;
    frame = settled ? 0 : requestAnimationFrame(paint);
  }

  function schedule() {
    if (!frame && !reducedMotion.matches) frame = requestAnimationFrame(paint);
  }

  hero.addEventListener("pointermove", (event) => {
    if (!finePointer.matches) return;
    const bounds = hero.getBoundingClientRect();
    target.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * -14;
    target.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -10;
    schedule();
  });
  hero.addEventListener("pointerleave", () => {
    target.x = 0;
    target.y = 0;
    schedule();
  });
  window.addEventListener("scroll", () => {
    const bounds = hero.getBoundingClientRect();
    if (bounds.bottom < 0) return;
    scrollShift = Math.min(18, Math.max(0, -bounds.top / 22));
    schedule();
  }, { passive: true });
  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches) return;
    cancelAnimationFrame(frame);
    frame = 0;
    cluster.style.removeProperty("--px");
    cluster.style.removeProperty("--py");
  });
}
