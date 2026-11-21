const root = document.documentElement;

for (const button of document.querySelectorAll("[data-open-dialog]")) {
  const dialog = document.getElementById(button.dataset.openDialog);
  button.addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    button.setAttribute("aria-expanded", "true");
  });
  dialog.addEventListener("close", () => {
    button.setAttribute("aria-expanded", "false");
    button.focus({ preventScroll: true });
  });
  dialog.querySelector("[data-close-dialog]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

const language = document.querySelector("[data-language]");
if (language) {
  const alternatePath = language.getAttribute("href");
  const updateLanguageLink = () => {
    const anchor = location.hash && document.getElementById(location.hash.slice(1));
    language.href = anchor ? alternatePath + location.hash : alternatePath;
  };
  window.addEventListener("hashchange", updateLanguageLink);
  updateLanguageLink();
}

const viewer = document.querySelector(".viewer");
if (viewer) {
  const gallery = Array.from(document.querySelectorAll("[data-gallery]"));
  const photo = viewer.querySelector("img");
  const caption = viewer.querySelector(".viewer-controls p");
  let currentPhoto = 0;

  const showPhoto = (index) => {
    currentPhoto = (index + gallery.length) % gallery.length;
    const link = gallery[currentPhoto];
    photo.src = link.href;
    photo.alt = link.querySelector("img").alt;
    caption.textContent = photo.alt;
  };

  for (const [index, link] of gallery.entries()) {
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof viewer.showModal !== "function") return;
      event.preventDefault();
      showPhoto(index);
      viewer.showModal();
    });
  }

  viewer.querySelector(".viewer-close").addEventListener("click", () => viewer.close());
  viewer.querySelector(".viewer-previous").addEventListener("click", () => showPhoto(currentPhoto - 1));
  viewer.querySelector(".viewer-next").addEventListener("click", () => showPhoto(currentPhoto + 1));
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const forward = event.key === (root.dir === "rtl" ? "ArrowLeft" : "ArrowRight");
    showPhoto(currentPhoto + (forward ? 1 : -1));
  });
}

// Photos below the first screen start dim and come on like the gym's lamps when they scroll into view.
const lamps = document.querySelectorAll(".area img, .crew > img, .gallery-photo img, .page-photo img");
if (lamps.length && "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const switchOn = new IntersectionObserver((entries) => {
    let order = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.style.animationDelay = `${order * 110}ms`;
      entry.target.classList.replace("is-unlit", "is-lit");
      switchOn.unobserve(entry.target);
      order += 1;
    }
  }, { threshold: 0.2 });
  for (const lamp of lamps) {
    if (lamp.getBoundingClientRect().top < innerHeight * 0.9) continue;
    lamp.classList.add("is-unlit");
    switchOn.observe(lamp);
  }
}

const prefetched = new Set();
function prefetchRoute(event) {
  const link = event.target.closest("a[href]");
  if (!link || link.target || link.hasAttribute("download")) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname === location.pathname || !url.pathname.endsWith("/")) return;
  if (prefetched.has(url.pathname)) return;
  prefetched.add(url.pathname);
  const resource = document.createElement("link");
  resource.rel = "prefetch";
  resource.href = url.pathname;
  document.head.append(resource);
}

if (!navigator.connection?.saveData) {
  document.addEventListener("pointerover", prefetchRoute, { passive: true });
  document.addEventListener("focusin", prefetchRoute);
}
