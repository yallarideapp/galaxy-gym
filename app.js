// Galaxy Gym as a web app: the "install the app" block, a class on <html> inside the installed app,
// and the offline worker (sw.js, registered next to this file so it also works under /galaxy-gym/).
(() => {
  const script = document.currentScript;
  const root = document.documentElement;
  const standalone = () => {
    try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch { return false; }
  };
  if (standalone()) root.classList.add("is-app");

  // Chrome and Android offer a real install prompt; keep it for the button instead of the browser's own bar.
  let prompt = null;
  addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); prompt = event; });
  addEventListener("appinstalled", () => { prompt = null; hideInstall(); });

  const blocks = [...document.querySelectorAll("[data-install]")];
  function hideInstall() { for (const block of blocks) block.hidden = true; }

  function platform() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Macintosh/.test(ua) && /Version\/\d+.*Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|OPR/.test(ua)) return "mac";
    return "other";
  }

  if (!standalone()) {
    for (const block of blocks) {
      block.hidden = false;
      const button = block.querySelector("[data-install-button]");
      const lists = [...block.querySelectorAll("[data-install-help]")];
      button.addEventListener("click", async () => {
        if (prompt) {
          const event = prompt;
          prompt = null;
          try {
            await event.prompt();
            const choice = await event.userChoice;
            if (choice?.outcome === "accepted") hideInstall();
            return;
          } catch { /* fall through to the steps */ }
        }
        const open = button.getAttribute("aria-expanded") !== "true";
        const kind = platform();
        button.setAttribute("aria-expanded", String(open));
        for (const list of lists) list.hidden = !open || list.dataset.installHelp !== kind;
        if (open) block.querySelector(`[data-install-help="${kind}"]`)?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    }
  }

  if (!("serviceWorker" in navigator) || !window.isSecureContext || !script?.src) return;
  const worker = new URL("sw.js", script.src);
  addEventListener("load", () => {
    navigator.serviceWorker.register(worker).then(() => {
      // Save this page, its fonts and the home page, so they open without a connection next time. Inside
      // the installed app, save every page of this language too (once per launch).
      const pages = new Set();
      const add = (href) => { const url = new URL(href, location.href); if (url.origin === location.origin) pages.add(url.href.split("#")[0]); };
      add(location.href);
      for (const link of document.querySelectorAll('link[rel="preload"][as="font"], .site-header .brand, .legal-brand')) add(link.getAttribute("href"));
      let everything = standalone();
      try { if (everything && sessionStorage.getItem("gg-saved")) everything = false; else if (everything) sessionStorage.setItem("gg-saved", "1"); } catch { /* private mode */ }
      if (everything) for (const link of document.querySelectorAll(".site-menu nav a[href], .dock a[href], .footer-bottom a[href]")) add(link.getAttribute("href"));
      navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: "save-pages", urls: [...pages] }));
    }).catch(() => { /* the site works the same without it */ });
  });
})();
