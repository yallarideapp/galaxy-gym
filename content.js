// Galaxy Gym content layer. Applies the edits made in the admin panel (/admin/) to every page:
// announcement bar, prices, opening hours, contact details, texts, photos, colour and motion.
// Preview mode: the edits live in this browser (localStorage, photos in IndexedDB). The same state shape can
// later come from a server so every visitor sees them. window.galaxyContent is used by admin.js and account.js.
(() => {
  const KEY = "galaxy-gym-admin-v1";
  const root = document.documentElement;
  const lang = root.lang === "en" ? "en" : "ar";
  const ar = lang === "ar";
  const route = document.body?.dataset.route || "";
  const defaults = {
    phone: "962791081877",
    whatsapp: "962791081877",
    instagram: "galaxy_gym_jo",
    facebook: "GalaxyGymJo",
    maps: "https://www.google.com/maps?cid=13503154910704371947",
    address: {
      ar: ["إربد، إيدون، 100 متر شرق دوار العيادات سابقاً."],
      en: ["Aydoun, Irbid, 100 m east of the former Clinics Roundabout.", "Aydoun, Irbid, 100 metres east of the former Clinics Roundabout."],
    },
    accent: "#f6ae45",
  };
  const words = {
    ar: {
      days: ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"],
      everyDay: "كل يوم", closed: "مسكّر", hoursTitle: "أوقات الدوام", openNow: "مفتوح هلأ", closedNow: "مسكّر هلأ",
      until: "لغاية {t}", opensAt: "بيفتح {d} {t}", today: "اليوم", tomorrow: "بكرا", am: "ص", pm: "م",
      plansTitle: "الاشتراكات والأسعار", currency: "د.أ", popular: "الأكثر طلباً", offer: "عرض", instead: "بدل {p}",
      perMonth: "يعني {p} بالشهر", code: "فئة {c}", fresh: "اشتراك جديد", renew: "تجديد الاشتراك: {p}", freeze: "التجميد: {f}", best: "أوفر بالشهر",
      join: "اشترك", renewAction: "جدّد", joinText: "مرحبا جالاكسي جيم، بدي أشترك بـ «{n}».", renewText: "مرحبا جالاكسي جيم، بدي أجدد اشتراكي: «{n}».",
      month: (n) => (n === 1 ? "شهر" : n === 2 ? "شهرين" : n === 12 ? "سنة" : n === 24 ? "سنتين" : n <= 10 ? `${n} أشهر` : `${n} شهر`),
      day: (n) => (n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوم`),
      times: (n) => (n === 0 ? "لا يوجد" : n === 1 ? "مرة وحدة" : n === 2 ? "مرتين" : n <= 10 ? `${n} مرات` : `${n} مرة`),
      close: "إخفاء الإعلان", preview: "معاينة: تعديلات لوحة التحكم ظاهرة على هذا الجهاز فقط.", openAdmin: "لوحة التحكم",
    },
    en: {
      days: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      everyDay: "Every day", closed: "Closed", hoursTitle: "Opening hours", openNow: "Open now", closedNow: "Closed now",
      until: "until {t}", opensAt: "opens {d} {t}", today: "today", tomorrow: "tomorrow", am: "AM", pm: "PM",
      plansTitle: "Prices and memberships", currency: "JOD", popular: "Most popular", offer: "Offer", instead: "was {p}",
      perMonth: "{p} a month", code: "Plan {c}", fresh: "New member", renew: "Renewal: {p}", freeze: "Freezes: {f}", best: "Best monthly value",
      join: "Join", renewAction: "Renew", joinText: "Hi Galaxy Gym, I'd like to join: “{n}”.", renewText: "Hi Galaxy Gym, I'd like to renew: “{n}”.",
      month: (n) => (n === 12 ? "1 year" : n === 24 ? "2 years" : n === 1 ? "1 month" : `${n} months`),
      day: (n) => (n === 1 ? "1 day" : `${n} days`),
      times: (n) => (n === 0 ? "none" : n === 1 ? "once" : n === 2 ? "twice" : `${n} times`),
      close: "Hide announcement", preview: "Preview: admin panel edits show on this device only.", openAdmin: "Admin panel",
    },
  };
  const w = words[lang];
  const fill = (text, values) => text.replace(/\{(\w)\}/g, (_, k) => values[k] ?? "");
  const number = new Intl.NumberFormat(ar ? "ar-JO-u-nu-latn" : "en-GB", { maximumFractionDigits: 2 });

  // ---------- reading and checking the saved edits ----------
  const str = (value, max = 600) => (typeof value === "string" ? value.slice(0, max) : "");
  const pair = (value, max) => ({ ar: str(value?.ar, max), en: str(value?.en, max) });
  const time = (value) => (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "");
  const day = (value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");
  const money = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 100000 ? Math.round(value * 100) / 100 : null);
  const whole = (value, max) => (Number.isInteger(value) && value > 0 && value <= max ? value : null);
  const newId = () => Math.random().toString(36).slice(2, 10);
  function link(value) {
    if (typeof value !== "string") return "";
    if (/^(page:(prices|contact|training|club|calculators|account)|whatsapp)$/.test(value)) return value;
    return /^https:\/\/[^\s"'<>]{3,500}$/.test(value) ? value : "";
  }

  // Plans count as edited once the admin panel has touched them; until then the published ones show.
  function cleanPlans(raw) {
    return {
      on: raw?.on === true,
      edited: raw?.edited === true,
      title: pair(raw?.title, 120),
      note: pair(raw?.note, 400),
      items: (Array.isArray(raw?.items) ? raw.items : []).slice(0, 12).map((plan) => ({
        id: /^[a-z0-9]{1,20}$/.test(plan?.id) ? plan.id : newId(),
        code: str(plan?.code, 6).trim(),
        name: pair(plan?.name, 80), months: whole(plan?.months, 60), days: plan?.months ? null : whole(plan?.days, 366),
        price: money(plan?.price), renewal: money(plan?.renewal), offer: money(plan?.offer),
        freezes: Number.isInteger(plan?.freezes) && plan.freezes >= 0 && plan.freezes <= 12 ? plan.freezes : null,
        perks: pair(plan?.perks, 600), popular: plan?.popular === true,
      })),
    };
  }
  const published = (() => {
    try { return { ...cleanPlans(JSON.parse(document.getElementById("site-plans")?.textContent || "null")), edited: false }; } catch { return cleanPlans(null); }
  })();

  function clean(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const texts = { ar: {}, en: {} };
    for (const l of ["ar", "en"]) {
      const list = s.texts?.[l];
      if (list && typeof list === "object") {
        for (const [from, to] of Object.entries(list).slice(0, 3000)) if (typeof to === "string" && from.length <= 2000) texts[l][from] = to.slice(0, 2000);
      }
    }
    const contact = {};
    for (const field of ["phone", "whatsapp", "instagram", "facebook", "maps"]) {
      if (typeof s.contact?.[field] === "string" && s.contact[field].trim()) contact[field] = s.contact[field].trim().slice(0, 500);
    }
    if (s.contact?.address && (s.contact.address.ar || s.contact.address.en)) contact.address = pair(s.contact.address, 300);
    const hours = {
      on: s.hours?.on === true,
      note: pair(s.hours?.note, 300),
      rows: (Array.isArray(s.hours?.rows) ? s.hours.rows : []).slice(0, 14).map((row) => ({
        days: [...new Set((Array.isArray(row?.days) ? row.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d < 7))].sort(),
        from: time(row?.from), to: time(row?.to), closed: row?.closed === true, label: pair(row?.label, 80),
      })),
    };
    const plans = cleanPlans(s.plans);
    const announcement = { on: s.announcement?.on === true, text: pair(s.announcement?.text, 220), link: link(s.announcement?.link), until: day(s.announcement?.until) };
    const photos = {};
    if (s.photos && typeof s.photos === "object") {
      for (const [name, value] of Object.entries(s.photos).slice(0, 40)) if (/^[a-z0-9-]{1,40}$/.test(name) && value) photos[name] = { at: str(value.at, 40) };
    }
    const look = {
      accent: /^#[0-9a-f]{6}$/i.test(s.look?.accent || "") ? s.look.accent.toLowerCase() : defaults.accent,
      splash: s.look?.splash !== false,
      motion: s.look?.motion !== false,
    };
    return { v: 1, savedAt: str(s.savedAt, 40), texts, contact, hours, plans, announcement, photos, look };
  }

  function read() {
    try { return clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { return clean(null); }
  }
  function write(state) {
    const next = clean({ ...state, savedAt: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  const hasEdits = (s) => Object.keys(s.texts.ar).length + Object.keys(s.texts.en).length + Object.keys(s.contact).length + Object.keys(s.photos).length > 0
    || s.hours.on || s.plans.edited || s.announcement.on || s.look.accent !== defaults.accent || !s.look.splash || !s.look.motion;

  // ---------- photos in IndexedDB ----------
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("galaxy-gym-admin", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("photos");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function store(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", mode);
      const request = action(tx.objectStore("photos"));
      tx.oncomplete = () => { db.close(); resolve(request?.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
  // Kept as bytes rather than a Blob: Safari can't store Blobs in IndexedDB in some modes.
  const photos = {
    get: async (name) => {
      const record = await store("readonly", (s) => s.get(name));
      return record instanceof Blob ? record : record?.data ? new Blob([record.data], { type: record.type || "image/jpeg" }) : null;
    },
    put: async (name, blob) => {
      const data = await blob.arrayBuffer();
      return store("readwrite", (s) => s.put({ type: blob.type, data }, name));
    },
    remove: (name) => store("readwrite", (s) => s.delete(name)),
    clear: () => store("readwrite", (s) => s.clear()),
  };

  // ---------- small helpers ----------
  function phoneParts(input) {
    let digits = String(input || "").replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) digits = digits.slice(1);
    else if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = "962" + digits.slice(1);
    else if (/^7\d{8}$/.test(digits)) digits = "962" + digits;
    if (!/^\d{8,15}$/.test(digits)) return null;
    const rest = digits.startsWith("962") ? digits.slice(3) : "";
    const group = rest.length === 9 ? [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5)] : rest.length === 8 ? [rest.slice(0, 1), rest.slice(1, 4), rest.slice(4)] : null;
    return {
      digits,
      tel: `tel:+${digits}`,
      local: group ? `0${group.join(" ")}` : `+${digits}`,
      intl: group ? `+962 ${group.join(" ")}` : `+${digits}`,
    };
  }
  const handle = (value, fallback) => (String(value || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram|facebook)\.com\//i, "").replace(/\/.*$/, "") || fallback);
  const siteBase = () => document.querySelector(".site-header .brand, .legal-brand")?.getAttribute("href") || (ar ? "/" : "/en/");
  // WhatsApp follows the phone number unless the admin panel sets its own.
  const whatsappNumber = () => (phoneParts(current.contact.whatsapp) || phoneParts(current.contact.phone))?.digits || defaults.whatsapp;
  const whatsappLink = (text) => `https://wa.me/${whatsappNumber()}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  function resolveLink(value) {
    if (value === "whatsapp") return { href: whatsappLink(""), external: true };
    if (value.startsWith("page:")) return { href: `${siteBase()}${value.slice(5)}/`, external: false };
    return value ? { href: value, external: true } : null;
  }
  function el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value === false || value == null) continue;
      if (name === "class") node.className = value; else node.setAttribute(name, value === true ? "" : value);
    }
    for (const child of children.flat()) if (child != null && child !== false) node.append(child);
    return node;
  }
  const pick = (value) => (value?.[lang] || "").trim();

  // ---------- hours ----------
  const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  function clock(hhmm) {
    if (!hhmm) return "";
    let h = Number(hhmm.slice(0, 2));
    const m = hhmm.slice(3);
    const suffix = h < 12 || h === 24 ? w.am : w.pm;
    h = h % 12 || 12;
    return `${h}:${m} ${suffix}`;
  }
  function dayList(days) {
    if (days.length === 7) return w.everyDay;
    const runs = [];
    for (const d of days) {
      const last = runs.at(-1);
      if (last && d === last[1] + 1) last[1] = d; else runs.push([d, d]);
    }
    return runs.map(([a, b]) => (a === b ? w.days[a] : b === a + 1 ? `${w.days[a]}${ar ? "، " : ", "}${w.days[b]}` : `${w.days[a]} – ${w.days[b]}`)).join(ar ? "، " : ", ");
  }
  function ammanNow(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((p) => [p.type, p.value]));
    const order = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
    return { day: order.indexOf(parts.weekday), minute: Number(parts.hour) * 60 + Number(parts.minute) };
  }
  // Open rows: each row is open from `from` to `to` on its days; a `to` at or before `from` runs past midnight.
  function openState(hours, date) {
    const rows = hours.rows.filter((row) => !row.closed && row.days.length && row.from && row.to);
    if (!rows.length) return null;
    const now = ammanNow(date);
    for (const row of rows) {
      const from = minutes(row.from);
      const to = minutes(row.to) <= from ? minutes(row.to) + 1440 : minutes(row.to);
      if (row.days.includes(now.day) && now.minute >= from && now.minute < to) return { open: true, until: row.to };
      const yesterday = (now.day + 6) % 7;
      if (to > 1440 && row.days.includes(yesterday) && now.minute < to - 1440) return { open: true, until: row.to };
    }
    for (let ahead = 0; ahead < 7; ahead++) {
      const d = (now.day + ahead) % 7;
      const starts = rows.filter((row) => row.days.includes(d)).map((row) => minutes(row.from)).filter((m) => ahead > 0 || m > now.minute).sort((a, b) => a - b);
      if (starts.length) {
        const hhmm = `${String(Math.floor(starts[0] / 60)).padStart(2, "0")}:${String(starts[0] % 60).padStart(2, "0")}`;
        return { open: false, opens: hhmm, when: ahead === 0 ? w.today : ahead === 1 ? w.tomorrow : w.days[d] };
      }
    }
    return { open: false };
  }
  function renderHours(slot, hours) {
    const heading = slot.dataset.hours === "h2" ? "h2" : "h3";
    const rows = hours.rows.filter((row) => row.days.length && (row.closed || (row.from && row.to)));
    if (!hours.on || !rows.length) { slot.hidden = true; slot.replaceChildren(); return; }
    const state = openState(hours);
    const status = state && el("span", { class: `hours-now ${state.open ? "is-open" : "is-closed"}` },
      state.open ? `${w.openNow} · ${fill(w.until, { t: clock(state.until) })}` : `${w.closedNow}${state.opens ? ` · ${fill(w.opensAt, { d: state.when, t: clock(state.opens) })}` : ""}`);
    slot.replaceChildren(el("div", { class: "hours-card" },
      el("div", { class: "hours-head" }, el(heading, {}, w.hoursTitle), status),
      el("dl", { class: "hours-rows" }, rows.map((row) => el("div", {},
        el("dt", {}, dayList(row.days), pick(row.label) ? el("small", {}, pick(row.label)) : null),
        el("dd", {}, row.closed ? w.closed : el("bdi", {}, `${clock(row.from)} – ${clock(row.to)}`))))),
      pick(hours.note) ? el("p", { class: "hours-note" }, pick(hours.note)) : null));
    slot.hidden = false;
  }

  // ---------- prices ----------
  const price = (value) => `${number.format(value)} ${w.currency}`;
  // The prices page is built with the published plans in it: keep those unless the admin panel changed them.
  // Same markup as renderPlansHtml() in scripts/site-content.mjs: keep the two in step.
  const builtPlans = new WeakMap();
  function bestValue(items) {
    const monthly = items.filter((plan) => plan.months && plan.price).map((plan) => ({ id: plan.id, rate: (plan.offer && plan.offer < plan.price ? plan.offer : plan.price) / plan.months }));
    return monthly.length < 2 ? null : monthly.sort((a, b) => a.rate - b.rate)[0].id;
  }
  function renderPlans(slot, plans) {
    if (!builtPlans.has(slot)) builtPlans.set(slot, { html: slot.innerHTML, hidden: slot.hidden });
    if (!plans.edited) {
      const built = builtPlans.get(slot);
      if (slot.innerHTML !== built.html) slot.innerHTML = built.html;
      slot.hidden = built.hidden;
      return;
    }
    const items = plans.items.filter((plan) => pick(plan.name) && plan.price);
    if (!plans.on || !items.length) { slot.hidden = true; slot.replaceChildren(); return; }
    const best = bestValue(items);
    const heading = slot.dataset.plans === "h1" ? "h1" : "h2";
    // The home page's short cards: "Join" opens the form on the prices page (the header button links there on every page).
    const compact = slot.dataset.plans === "compact";
    const pricesHref = document.querySelector(".header-join")?.getAttribute("href") || (ar ? "/prices/" : "/en/prices/");
    slot.replaceChildren(...[
      compact ? null : el("div", { class: "plans-head" }, el(heading, { id: "plans-title" }, pick(plans.title) || w.plansTitle), pick(plans.note) ? el("p", {}, pick(plans.note)) : null),
      el("ul", { class: "plans-grid", role: "list" }, items.map((plan) => {
        const offer = plan.offer && plan.offer < plan.price ? plan.offer : null;
        const paid = offer || plan.price;
        const name = pick(plan.name);
        const length = plan.months ? w.month(plan.months) : plan.days ? w.day(plan.days) : "";
        const perks = pick(plan.perks).split("\n").map((line) => line.trim()).filter(Boolean);
        const badge = plan.popular ? w.popular : offer ? w.offer : plan.id === best ? w.best : "";
        const action = (kind, label, text) => el("a", { class: `button${kind === "renew" ? " button-quiet" : ""}`, href: whatsappLink(fill(text, { n: name })), target: "_blank", rel: "noopener noreferrer", "data-plan-action": kind, "data-plan": plan.id }, label);
        if (compact) {
          return el("li", { class: `plan is-compact${plan.popular ? " is-popular" : ""}${offer ? " has-offer" : ""}${plan.months ? "" : " is-pass"}`, "data-plan-id": plan.id },
            el("div", { class: "plan-ribbon" }, plan.code ? el("span", { class: "plan-code" }, fill(w.code, { c: plan.code })) : null, el("h3", {}, name)),
            badge ? el("span", { class: "plan-badge" }, badge) : null,
            length && length !== name ? el("p", { class: "plan-length" }, length) : null,
            el("div", { class: "plan-cost" },
              el("p", { class: "plan-price" }, el("strong", {}, number.format(paid)), el("span", {}, ` ${w.currency}`), offer ? el("s", {}, fill(w.instead, { p: price(plan.price) })) : null),
              plan.months > 1 ? el("p", { class: "plan-month" }, fill(w.perMonth, { p: price(Math.round((paid / plan.months) * 10) / 10) })) : null),
            plan.renewal ? el("p", { class: "plan-renew" }, fill(w.renew, { p: price(plan.renewal) })) : null,
            el("div", { class: "plan-action" }, el("a", { class: "button", href: `${pricesHref}#join-${plan.id}`, "data-plan": plan.id }, w.join)));
        }
        return el("li", { class: `plan${plan.popular ? " is-popular" : ""}${offer ? " has-offer" : ""}${plan.months ? "" : " is-pass"}`, "data-plan-id": plan.id },
          el("div", { class: "plan-ribbon" }, plan.code ? el("span", { class: "plan-code" }, fill(w.code, { c: plan.code })) : null, el("h3", {}, name)),
          badge ? el("span", { class: "plan-badge" }, badge) : null,
          length && length !== name ? el("p", { class: "plan-length" }, length) : null,
          el("div", { class: "plan-cost" },
            plan.renewal ? el("p", { class: "plan-kind" }, w.fresh) : null,
            el("p", { class: "plan-price" }, el("strong", {}, number.format(paid)), el("span", {}, ` ${w.currency}`), offer ? el("s", {}, fill(w.instead, { p: price(plan.price) })) : null),
            plan.months > 1 ? el("p", { class: "plan-month" }, fill(w.perMonth, { p: price(Math.round((paid / plan.months) * 10) / 10) })) : null),
          plan.renewal ? el("p", { class: "plan-renew" }, fill(w.renew, { p: price(plan.renewal) })) : null,
          plan.freezes != null ? el("p", { class: "plan-freeze" }, el("span", {}, fill(w.freeze, { f: w.times(plan.freezes) })),
            plan.freezes ? el("span", { class: "plan-pips", "aria-hidden": "true" }, Array.from({ length: Math.min(plan.freezes, 6) }, () => el("i"))) : null) : null,
          perks.length ? el("ul", { class: "plan-perks" }, perks.map((perk) => el("li", {}, perk))) : null,
          el("div", { class: "plan-action" }, action("join", w.join, w.joinText), plan.renewal ? action("renew", w.renewAction, w.renewText) : null));
      }))].filter(Boolean));
    slot.hidden = false;
  }
  // The amount for a membership of this length (a renewal uses the renewal price when there is one).
  const plansNow = () => (current.plans.edited ? current.plans : published);
  function priceFor(months, renewal = false) {
    const plans = plansNow();
    const plan = plans.on && plans.items.find((item) => item.months === Number(months) && item.price);
    if (!plan) return null;
    if (renewal && plan.renewal) return plan.renewal;
    return plan.offer && plan.offer < plan.price ? plan.offer : plan.price;
  }

  // ---------- applying everything ----------
  const changed = new Map(); // text node → original value
  const attributes = [];     // [element, attribute, original value]
  let objectUrls = [];
  function setText(node, value) {
    if (!changed.has(node)) changed.set(node, node.nodeValue);
    node.nodeValue = value;
  }
  function setAttribute(node, name, value) {
    attributes.push([node, name, node.getAttribute(name)]);
    if (value == null) node.removeAttribute(name); else node.setAttribute(name, value);
  }
  function restore() {
    for (const [node, value] of changed) node.nodeValue = value;
    changed.clear();
    for (const [node, name, value] of attributes.reverse()) if (value == null) node.removeAttribute(name); else node.setAttribute(name, value);
    attributes.length = 0;
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
    document.querySelectorAll("[data-content-added]").forEach((node) => node.remove());
  }
  const skip = "script,style,template,noscript,textarea,[data-content-skip]";
  function textNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (!node.nodeValue.trim() || node.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const list = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) list.push(node);
    return list;
  }
  const squash = (text) => text.replace(/\s+/g, " ").trim();

  function applyLook(look) {
    const style = root.style;
    if (look.accent === defaults.accent) {
      for (const name of ["--sun", "--sun-bright", "--sun-ink", "--sun-rgb"]) style.removeProperty(name);
    } else {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(look.accent.slice(i, i + 2), 16));
      const mix = (c) => Math.round(c + (255 - c) * 0.3);
      const light = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const luminance = 0.2126 * light(r) + 0.7152 * light(g) + 0.0722 * light(b);
      style.setProperty("--sun", look.accent);
      style.setProperty("--sun-bright", `rgb(${mix(r)} ${mix(g)} ${mix(b)})`);
      style.setProperty("--sun-ink", luminance > 0.36 ? "#14110b" : "#ffffff");
      style.setProperty("--sun-rgb", `${r} ${g} ${b}`);
    }
    root.classList.toggle("gg-calm", !look.motion);
  }

  async function apply() {
    const s = (current = read());
    applyLook(s.look);
    if (route === "admin") return;
    restore();

    // Texts, then contact details, on the text as it now reads.
    const map = new Map(Object.entries(s.texts[lang]).map(([from, to]) => [squash(from), to]));
    const address = pick(s.contact.address);
    if (address) for (const original of defaults.address[lang]) map.set(squash(original), address);
    const phone = phoneParts(s.contact.phone);
    const whats = phoneParts(s.contact.whatsapp) || phone;
    const oldPhone = phoneParts(defaults.phone);
    const instagram = handle(s.contact.instagram, defaults.instagram);
    for (const node of textNodes()) {
      const original = node.nodeValue;
      let value = original;
      const key = squash(value);
      if (map.has(key)) value = value.replace(value.trim(), map.get(key));
      const anchor = node.parentElement?.closest("a[href]");
      const href = anchor?.getAttribute("href") || "";
      if (phone && !href.includes("wa.me/")) value = value.replace(oldPhone.local, phone.local);
      if (whats && href.includes("wa.me/")) value = value.replace(oldPhone.intl, whats.intl).replace(oldPhone.local, whats.local);
      if (instagram !== defaults.instagram) value = value.replace(`@${defaults.instagram}`, `@${instagram}`);
      if (value !== original) setText(node, value);
    }
    const facebook = handle(s.contact.facebook, defaults.facebook);
    const maps = /^https:\/\/\S+$/.test(s.contact.maps || "") ? s.contact.maps : "";
    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href");
      let next = href;
      if (phone && href.startsWith("tel:")) next = phone.tel;
      if (whats && href.includes("wa.me/")) next = href.replace(/wa\.me\/\d+/, `wa.me/${whats.digits}`);
      if (instagram !== defaults.instagram) next = next.replace(`instagram.com/${defaults.instagram}`, `instagram.com/${instagram}`);
      if (facebook !== defaults.facebook) next = next.replace(`facebook.com/${defaults.facebook}`, `facebook.com/${facebook}`);
      if (maps && /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(href)) next = maps;
      if (next !== href) setAttribute(anchor, "href", next);
    }

    // Prices and hours fill their places on the page.
    for (const slot of document.querySelectorAll("[data-plans]")) renderPlans(slot, s.plans);
    for (const slot of document.querySelectorAll("[data-hours]")) renderHours(slot, s.hours);

    // Announcement bar, and a small notice that these are preview edits (not inside the admin's own preview).
    const today = new Date().toISOString().slice(0, 10);
    const text = pick(s.announcement.text);
    const dismissed = (() => { try { return sessionStorage.getItem("gg-announce-closed") === text; } catch { return false; } })();
    if (s.announcement.on && text && (!s.announcement.until || s.announcement.until >= today) && !dismissed) {
      const target = resolveLink(s.announcement.link);
      const message = target ? el("a", { href: target.href, ...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, text) : el("span", {}, text);
      const bar = el("div", { class: "announce", role: "note", "data-content-added": true, "data-content-skip": true },
        el("div", { class: "container announce-inner" }, message,
          el("button", { type: "button", class: "announce-close", "aria-label": w.close }, "×")));
      bar.querySelector("button").addEventListener("click", () => { try { sessionStorage.setItem("gg-announce-closed", text); } catch { /* private mode */ } bar.remove(); });
      document.body.prepend(bar);
    }
    if (hasEdits(s) && window.top === window) {
      document.body.prepend(el("div", { class: "preview-bar", "data-content-added": true, "data-content-skip": true },
        el("span", {}, w.preview), el("a", { href: `${siteBase()}admin/` }, w.openAdmin)));
    }

    // Photos: swap the site's own files for the ones chosen in the admin panel.
    const names = Object.keys(s.photos);
    if (names.length && "indexedDB" in window) {
      const images = [...document.querySelectorAll("img")];
      await Promise.all(names.map(async (name) => {
        const blob = await photos.get(name).catch(() => null);
        if (!(blob instanceof Blob)) return;
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        const pattern = new RegExp(`/${name}(-\\d+)?\\.(webp|jpg|png)(\\s|$)`);
        for (const image of images) {
          if (!pattern.test(image.getAttribute("src") || "") && !pattern.test(image.getAttribute("srcset") || "")) continue;
          setAttribute(image, "srcset", null);
          setAttribute(image, "sizes", null);
          setAttribute(image, "src", url);
        }
      }));
    }
  }

  let current = read();
  const done = () => root.classList.remove("gg-pending");
  apply().catch(() => {}).finally(done);
  // The admin panel saves in another tab or in the preview frame's parent: follow its changes.
  addEventListener("storage", (event) => { if (event.key === KEY || event.key === null) apply().catch(() => {}); });
  addEventListener("message", (event) => { if (event.origin === location.origin && event.data === "galaxy-content-changed") apply().catch(() => {}); });

  window.galaxyContent = {
    key: KEY, defaults, read, write, clean, hasEdits, photos, phoneParts, handle, openState, clock, dayList,
    whatsappLink, priceFor, plansNow, apply, newId, lang, published, cleanPlans,
  };
})();
