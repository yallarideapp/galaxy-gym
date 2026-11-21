// The hexagon cluster leans a little toward the pointer, and drifts apart slightly as the page scrolls.
// The lights-on sequence itself is CSS (hero-motion.css); this file only adds the depth.
const cluster = document.querySelector("[data-hex-cluster]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

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
