// Galaxy Gym admin panel. Every change is saved as you type (content.js keeps the edits in this browser) and
// shows on the site and in the phone preview straight away.
const G = window.galaxyContent;
const t = JSON.parse(document.getElementById("admin-copy").textContent);
const lang = document.documentElement.lang === "en" ? "en" : "ar";
const langs = lang === "ar" ? ["ar", "en"] : ["en", "ar"];
const fill = (text, values) => text.replace(/\{(\w)\}/g, (_, key) => values[key] ?? "");
let state = G.read();
let uid = 0;

// ---------- building blocks ----------
function h(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value == null) continue;
    if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
    else if (name === "class") node.className = value;
    else if (name === "value") node.value = value;
    else if (name === "checked") node.checked = value;
    else node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child);
  return node;
}
const icon = (path) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = path;
  return svg;
};
const paths = {
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', remove: '<path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/>',
};
const nameOf = (l) => t[l]; // "بالعربي" / "Arabic"

function field({ label, value = "", placeholder = "", hint = "", multiline = false, type = "text", inputLang, inputmode, max, onInput, className = "" }) {
  const id = `f${++uid}`;
  const hintId = hint ? `${id}-hint` : null;
  const control = h(multiline ? "textarea" : "input", {
    id, class: "admin-input", placeholder, maxlength: max, inputmode, lang: inputLang, dir: inputLang ? (inputLang === "ar" ? "rtl" : "ltr") : null,
    "aria-describedby": hintId, ...(multiline ? { rows: 2 } : { type }), oninput: (event) => onInput?.(event.target.value, event.target),
  });
  control.value = value;
  return h("div", { class: `admin-field ${className}` }, h("label", { for: id }, label), control, hint ? h("small", { id: hintId, class: "admin-field-hint" }, hint) : null);
}
// One setting in Arabic and English, the panel's own language first.
function pairField({ label, value = {}, placeholder = {}, multiline = false, max, onInput }) {
  return h("fieldset", { class: "admin-pair" }, h("legend", {}, label),
    langs.map((l) => field({ label: nameOf(l), value: value[l] || "", placeholder: placeholder[l] || "", multiline, max, inputLang: l, onInput: (v) => onInput(l, v) })));
}
// An on/off switch. Switches that show or hide something on the site say which it is now.
function toggle({ label, hint, checked, onChange, shows = false }) {
  const id = `f${++uid}`;
  const stateText = shows ? h("small", { class: "admin-switch-state" }, checked ? t.on : t.off) : null;
  const input = h("input", { id, type: "checkbox", role: "switch", checked, onchange: (event) => { if (stateText) stateText.textContent = event.target.checked ? t.on : t.off; onChange(event.target.checked); } });
  return h("div", { class: "admin-switch" }, input, h("label", { for: id }, h("span", { class: "admin-switch-track", "aria-hidden": "true" }), h("span", {}, h("strong", {}, label), hint ? h("small", {}, hint) : stateText)));
}
const iconButton = (name, label, onClick, extra = {}) => h("button", { type: "button", class: "admin-icon-button", "aria-label": label, title: label, onclick: onClick, ...extra }, icon(paths[name]));
const card = (...children) => h("div", { class: "admin-card" }, ...children);
const note = (text, tone = "") => h("p", { class: `admin-note ${tone}` }, text);
// Arabic-Indic digits and comma decimals become plain numbers.
const toNumber = (text) => {
  const plain = String(text).trim().replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٫,]/g, ".");
  return plain === "" ? null : Number(plain);
};
const shorten = (text, size = 42) => (text.length > size ? `${text.slice(0, size - 1)}…` : text);

// ---------- saving ----------
const status = document.querySelector("[data-status]");
const frame = document.querySelector("[data-preview]");
let saveTimer;
function setStatus(kind) {
  status.dataset.state = kind;
  status.textContent = kind === "saving" ? t.saving : kind === "error" ? t.saveFailed : kind === "saved" ? t.saved : "";
}
function save() {
  clearTimeout(saveTimer);
  try {
    state = G.write(state);
    setStatus("saved");
  } catch {
    setStatus("error");
  }
  G.apply();
  frame?.contentWindow?.postMessage("galaxy-content-changed", location.origin);
  summarize();
}
function commit(change, { now = false } = {}) {
  change(state);
  setStatus("saving");
  clearTimeout(saveTimer);
  saveTimer = now ? save() : setTimeout(save, 350);
}
addEventListener("beforeunload", () => { if (status.dataset.state === "saving") save(); });
// Another tab of the panel saved: start from its version.
addEventListener("storage", (event) => {
  if (event.key !== G.key) return;
  state = G.read();
  for (const id of Object.keys(rendered)) rendered[id] = false;
  show(current, { keepScroll: true });
});

// ---------- summaries (overview cards and the side menu) ----------
// Plans the site shows: the published ones until the panel changes them.
const plansNow = () => (state.plans.edited ? state.plans : G.published);
const visiblePlans = () => plansNow().items.filter((plan) => (plan.name.ar || plan.name.en).trim() && plan.price);
const textCount = () => Object.keys(state.texts.ar).length + Object.keys(state.texts.en).length;
const lookChanged = () => state.look.accent !== G.defaults.accent || !state.look.splash || !state.look.motion;
// "{n} plans shown", with its own wording for one (and, in Arabic, for two).
const counted = (forms, n) => (n === 1 && forms[2] ? forms[2] : n === 2 && forms[3] ? forms[3] : fill(forms[0], { n }));
function summary(id) {
  const o = t.overview;
  const text = (state.announcement.text[lang] || state.announcement.text.ar || state.announcement.text.en || "").trim();
  switch (id) {
    case "announcement": return state.announcement.on && text ? [fill(o.announcement[0], { t: shorten(text, 34) }), true] : [o.announcement[1], false];
    case "plans": return plansNow().on && visiblePlans().length ? [counted(o.plans, visiblePlans().length), state.plans.edited] : [o.plans[1], state.plans.edited];
    case "hours": return state.hours.on && state.hours.rows.length ? [counted(o.hours, state.hours.rows.length), true] : [o.hours[1], false];
    case "contact": return Object.keys(state.contact).length ? [counted(o.contact, Object.keys(state.contact).length), true] : [o.contact[1], false];
    case "texts": return textCount() ? [counted(o.texts, textCount()), true] : [o.texts[1], false];
    case "photos": return Object.keys(state.photos).length ? [counted(o.photos, Object.keys(state.photos).length), true] : [o.photos[1], false];
    case "look": return lookChanged() ? [o.look[0], true] : [o.look[1], false];
    case "backup": return state.savedAt && G.hasEdits(state)
      ? [fill(o.backup[0], { d: new Intl.DateTimeFormat(lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.savedAt)) }), true]
      : [o.backup[1], false];
    default: return ["", false];
  }
}
function summarize() {
  for (const small of document.querySelectorAll("[data-nav-state]")) {
    const [text, active] = summary(small.dataset.navState);
    small.textContent = text;
    small.closest("a").classList.toggle("is-edited", active);
  }
  for (const line of document.querySelectorAll("[data-summary]")) {
    const [text, active] = summary(line.dataset.summary);
    line.textContent = text;
    line.closest(".admin-overview-card").classList.toggle("is-edited", active);
  }
}

// ---------- sections ----------
const sections = {
  overview() {
    const o = t.overview;
    const ids = ["plans", "hours", "announcement", "contact", "texts", "photos", "look", "backup"];
    const icons = Object.fromEntries([...document.querySelectorAll("[data-nav]")].map((link) => [link.dataset.nav, link.querySelector("svg").cloneNode(true)]));
    return [
      G.hasEdits(state) ? null : card(h("h3", {}, o.start), h("p", {}, o.startText)),
      h("h3", { class: "admin-subhead" }, o.lead),
      h("ul", { class: "admin-overview", role: "list" }, ids.map((id) => h("li", { class: "admin-overview-card" },
        h("a", { href: `#${id}` }, icons[id], h("span", {}, h("strong", {}, t.sections[id][0]), h("small", { "data-summary": id }, summary(id)[0])), h("span", { class: "admin-overview-go" }, t.edit))))),
    ];
  },

  announcement() {
    const a = t.announcement;
    const value = () => state.announcement;
    const sample = h("div", { class: "announce admin-sample-bar" }, h("div", { class: "announce-inner" }, h("span", {}, "")));
    const expired = note(a.expired, "is-warning");
    const urlField = field({ label: a.url, value: /^https:/.test(value().link) ? value().link : "", placeholder: "https://", type: "url", inputLang: "en",
      onInput: (v) => commit((s) => { s.announcement.link = v.trim(); }) });
    const refresh = () => {
      const text = value().text[lang] || value().text.ar || value().text.en;
      sample.querySelector("span").textContent = text || a.textHint;
      sample.classList.toggle("is-empty", !text);
      const today = new Date().toISOString().slice(0, 10);
      expired.hidden = !(value().until && value().until < today);
    };
    const select = h("select", { class: "admin-input", id: `f${++uid}`, onchange: (event) => {
      const choice = event.target.value;
      urlField.hidden = choice !== "url";
      commit((s) => { s.announcement.link = choice === "url" ? (urlField.querySelector("input").value.trim()) : choice; });
    } }, a.links.map(([v, label]) => h("option", { value: v }, label)));
    select.value = /^https:/.test(value().link) ? "url" : value().link;
    urlField.hidden = select.value !== "url";
    refresh();
    return [
      card(
        toggle({ label: a.show, shows: true, checked: value().on, onChange: (on) => commit((s) => { s.announcement.on = on; }, { now: true }) }),
        pairField({ label: a.text, value: value().text, placeholder: { [lang]: a.textHint }, multiline: true, max: 220, onInput: (l, v) => { commit((s) => { s.announcement.text[l] = v; }); refresh(); } }),
        h("div", { class: "admin-row" },
          h("div", { class: "admin-field" }, h("label", { for: select.id }, a.link), select),
          field({ label: a.until, value: value().until, type: "date", hint: a.untilHint, onInput: (v) => { commit((s) => { s.announcement.until = v; }); refresh(); } })),
        urlField,
        expired),
      h("p", { class: "admin-subhead" }, a.sample), sample,
    ];
  },

  plans() {
    const p = t.plans;
    // Until the panel changes them, the plans are the published ones (scripts/site-content.mjs).
    const source = () => (state.plans.edited ? state.plans : G.published);
    const own = (s) => { if (!s.plans.edited) s.plans = { ...JSON.parse(JSON.stringify(G.published)), edited: true }; return s.plans; };
    const list = h("div", { class: "admin-plans" });
    const draw = () => list.replaceChildren(...planCards());
    const move = (index, step) => commit((s) => { const items = own(s).items; const [item] = items.splice(index, 1); items.splice(index + step, 0, item); }, { now: true });
    const money = (v) => { const n = toNumber(v); return n > 0 ? Math.round(n * 100) / 100 : null; };
    function planCards() {
      const items = source().items;
      if (!items.length) {
        return [card(h("p", {}, p.empty), h("button", { type: "button", class: "button", onclick: () => {
          commit((s) => { const plans = own(s); plans.items = p.starterNames.map(([months, arName, enName]) => ({ id: G.newId(), name: { ar: arName, en: enName }, months, days: null, price: null, renewal: null, offer: null, freezes: null, perks: { ar: "", en: "" }, popular: false })); plans.on = true; }, { now: true });
          draw();
        } }, icon(paths.plus), p.starter))];
      }
      return items.map((plan, index) => {
        const id = plan.id;
        const edit = (change) => commit((s) => { const item = own(s).items.find((entry) => entry.id === id); if (item) change(item); });
        const priceNote = note("", "is-warning");
        const hiddenNote = note(p.hidden, "is-muted");
        const check = () => {
          const item = source().items.find((entry) => entry.id === id) || plan;
          const read = (key) => box.querySelector(`[data-${key}]`).value.trim();
          const price = toNumber(read("price"));
          const offer = toNumber(read("offer"));
          const renewal = toNumber(read("renewal"));
          priceNote.textContent = read("price") && !(price > 0) ? p.badPrice
            : read("renewal") && !(renewal > 0) ? p.badPrice
            : read("offer") && price > 0 && !(offer > 0 && offer < price) ? p.badOffer : "";
          priceNote.hidden = !priceNote.textContent;
          hiddenNote.hidden = Boolean((item.name.ar || item.name.en).trim() && price > 0);
        };
        // Length: a number of months, or of days (like the 15-day pass).
        const days = field({ label: p.days, value: plan.days ?? "", inputmode: "numeric", inputLang: "en", onInput: (v) => edit((item) => { const n = Math.round(toNumber(v)); item.days = n > 0 && n <= 366 ? n : null; item.months = null; }) });
        const length = h("select", { class: "admin-input", id: `f${++uid}`, onchange: (event) => {
          const value = event.target.value;
          days.hidden = value !== "days";
          edit((item) => {
            if (value === "days") { item.months = null; item.days = Math.round(toNumber(days.querySelector("input").value)) || null; }
            else { item.months = value ? Number(value) : null; item.days = null; }
          });
        } }, h("option", { value: "" }, p.noMonths), p.monthsList.map(([n, label]) => h("option", { value: n }, label)), h("option", { value: "days" }, p.byDays));
        length.value = plan.months ? String(plan.months) : plan.days ? "days" : "";
        days.hidden = length.value !== "days";
        const freezes = h("select", { class: "admin-input", id: `f${++uid}`, onchange: (event) => edit((item) => { item.freezes = event.target.value === "" ? null : Number(event.target.value); }) },
          p.freezeList.map(([n, label]) => h("option", { value: n }, label)));
        freezes.value = plan.freezes ?? "";
        const money3 = [["price", p.price, plan.price, ""], ["renewal", p.renewal, plan.renewal, t.optional], ["offer", p.offer, plan.offer, t.optional]].map(([key, label, value, hint]) => {
          const box = field({ label, value: value ?? "", inputmode: "decimal", inputLang: "en", hint, onInput: (v) => { edit((item) => { item[key] = money(v); }); check(); } });
          box.querySelector("input").dataset[key] = "";
          return box;
        });
        const box = h("article", { class: "admin-card admin-plan" },
          h("header", { class: "admin-plan-head" }, h("h3", {}, `${p.plan} ${index + 1}`),
            h("div", { class: "admin-tools" },
              iconButton("up", t.up, () => { move(index, -1); draw(); }, { disabled: index === 0 }),
              iconButton("down", t.down, () => { move(index, 1); draw(); }, { disabled: index === items.length - 1 }),
              iconButton("remove", t.remove, () => { commit((s) => { const plans = own(s); plans.items = plans.items.filter((item) => item.id !== id); }, { now: true }); draw(); }))),
          pairField({ label: p.name, value: plan.name, placeholder: { [lang]: p.nameHint }, max: 80, onInput: (l, v) => { edit((item) => { item.name[l] = v; }); check(); } }),
          h("div", { class: "admin-row" }, h("div", { class: "admin-field" }, h("label", { for: length.id }, p.months), length), days, h("div", { class: "admin-field" }, h("label", { for: freezes.id }, p.freezes), freezes)),
          h("div", { class: "admin-row admin-row-3" }, money3),
          priceNote,
          pairField({ label: p.perks, value: plan.perks, placeholder: { [lang]: p.perksHint }, multiline: true, max: 600, onInput: (l, v) => edit((item) => { item.perks[l] = v; }) }),
          toggle({ label: p.popular, checked: plan.popular, onChange: (on) => { commit((s) => { for (const item of own(s).items) item.popular = on && item.id === id; }, { now: true }); draw(); } }),
          hiddenNote);
        check();
        return box;
      });
    }
    draw();
    const restore = h("button", { type: "button", class: "button button-quiet button-small", hidden: !state.plans.edited, onclick: () => {
      commit((s) => { s.plans = G.cleanPlans(null); }, { now: true });
      rendered.plans = false;
      show("plans", { keepScroll: true });
    } }, icon(paths.reset), p.restore);
    return [
      card(
        h("p", { class: "admin-note is-muted" }, state.plans.edited ? p.editedNote : p.publishedNote),
        toggle({ label: p.show, shows: true, checked: source().on, onChange: (on) => { commit((s) => { own(s).on = on; }, { now: true }); restore.hidden = false; } }),
        pairField({ label: p.title, value: source().title, placeholder: { ar: "الاشتراكات والأسعار", en: "Prices and memberships" }, max: 120, onInput: (l, v) => commit((s) => { own(s).title[l] = v; }) }),
        pairField({ label: p.note, value: source().note, placeholder: { [lang]: p.noteHint }, multiline: true, max: 400, onInput: (l, v) => commit((s) => { own(s).note[l] = v; }) }),
        restore),
      list,
      h("button", { type: "button", class: "button button-quiet admin-add", onclick: () => {
        commit((s) => { own(s).items.push({ id: G.newId(), name: { ar: "", en: "" }, months: null, days: null, price: null, renewal: null, offer: null, freezes: null, perks: { ar: "", en: "" }, popular: false }); }, { now: true });
        draw();
        list.lastElementChild?.querySelector("input")?.focus();
      } }, icon(paths.plus), p.add),
    ];
  },

  hours() {
    const o = t.hours;
    const list = h("div", { class: "admin-hours" });
    const now = h("p", { class: "admin-now" });
    const refresh = () => {
      const result = G.openState(state.hours);
      now.hidden = !result;
      if (!result) return;
      now.replaceChildren(o.now, h("strong", { class: result.open ? "is-open" : "" }, result.open
        ? `${lang === "ar" ? "مفتوح لغاية" : "open until"} ${G.clock(result.until)}`
        : `${lang === "ar" ? "مسكّر" : "closed"}${result.opens ? ` · ${lang === "ar" ? "بيفتح" : "opens"} ${result.when} ${G.clock(result.opens)}` : ""}`));
    };
    const edit = (index, change) => { commit((s) => { if (s.hours.rows[index]) change(s.hours.rows[index]); }); refresh(); };
    function draw() {
      if (!state.hours.rows.length) { list.replaceChildren(card(h("p", {}, o.empty))); refresh(); return; }
      list.replaceChildren(...state.hours.rows.map((row, index) => {
        const incomplete = note(o.incomplete, "is-muted");
        const check = () => {
          const r = state.hours.rows[index];
          incomplete.hidden = Boolean(r && r.days.length && (r.closed || (r.from && r.to)));
          times.classList.toggle("is-off", Boolean(r?.closed));
        };
        const days = h("div", { class: "admin-days", role: "group", "aria-label": o.days }, o.dayShort.map((label, d) => h("button", {
          type: "button", class: "admin-day", "aria-pressed": String(row.days.includes(d)),
          onclick: (event) => {
            const on = event.currentTarget.getAttribute("aria-pressed") !== "true";
            event.currentTarget.setAttribute("aria-pressed", String(on));
            edit(index, (r) => { r.days = on ? [...r.days, d].sort() : r.days.filter((x) => x !== d); });
            check();
          },
        }, label)));
        const times = h("div", { class: "admin-row" },
          field({ label: o.from, value: row.from, type: "time", onInput: (v) => { edit(index, (r) => { r.from = v; }); check(); } }),
          field({ label: o.to, value: row.to, type: "time", onInput: (v) => { edit(index, (r) => { r.to = v; }); check(); } }));
        const box = h("article", { class: "admin-card admin-hour" },
          h("header", { class: "admin-plan-head" }, h("h3", {}, `${o.row} ${index + 1}`),
            h("div", { class: "admin-tools" },
              iconButton("up", t.up, () => { commit((s) => { const [r] = s.hours.rows.splice(index, 1); s.hours.rows.splice(index - 1, 0, r); }, { now: true }); draw(); }, { disabled: index === 0 }),
              iconButton("down", t.down, () => { commit((s) => { const [r] = s.hours.rows.splice(index, 1); s.hours.rows.splice(index + 1, 0, r); }, { now: true }); draw(); }, { disabled: index === state.hours.rows.length - 1 }),
              iconButton("remove", t.remove, () => { commit((s) => { s.hours.rows.splice(index, 1); }, { now: true }); draw(); }))),
          h("p", { class: "admin-label" }, o.days), days, times,
          toggle({ label: o.closed, checked: row.closed, onChange: (on) => { edit(index, (r) => { r.closed = on; }); check(); } }),
          pairField({ label: o.label, value: row.label, placeholder: { [lang]: o.labelHint }, max: 80, onInput: (l, v) => edit(index, (r) => { r.label[l] = v; }) }),
          incomplete);
        check();
        return box;
      }));
      refresh();
    }
    draw();
    return [
      card(toggle({ label: o.show, shows: true, checked: state.hours.on, onChange: (on) => { commit((s) => { s.hours.on = on; }, { now: true }); refresh(); } })),
      now, list,
      h("button", { type: "button", class: "button button-quiet admin-add", onclick: () => {
        commit((s) => { s.hours.rows.push({ days: [0, 1, 2, 3, 4, 5], from: "", to: "", closed: false, label: { ar: "", en: "" } }); }, { now: true });
        draw();
        list.lastElementChild?.querySelector("input[type=time]")?.focus();
      } }, icon(paths.plus), o.add),
      card(pairField({ label: o.note, value: state.hours.note, placeholder: { [lang]: o.noteHint }, multiline: true, max: 300, onInput: (l, v) => commit((s) => { s.hours.note[l] = v; }) })),
    ];
  },

  contact() {
    const o = t.contact;
    const d = G.defaults;
    const current = (name) => state.contact[name] || "";
    const set = (name, value) => commit((s) => { if (value.trim()) s.contact[name] = value.trim(); else delete s.contact[name]; });
    function phoneField(name, label, placeholder, hint) {
      const result = h("small", { class: "admin-field-hint" });
      const check = (value) => {
        const parts = G.phoneParts(value);
        result.textContent = !value.trim() ? (hint || "") : parts ? o.shows + parts.local : o.badPhone;
        result.classList.toggle("is-warning", Boolean(value.trim()) && !parts);
      };
      const box = field({ label, value: current(name), placeholder, type: "tel", inputmode: "tel", inputLang: "en", onInput: (v) => { set(name, v); check(v); } });
      box.append(result);
      check(current(name));
      return box;
    }
    const mapsHint = h("small", { class: "admin-field-hint" });
    const maps = field({ label: o.maps, value: current("maps"), placeholder: d.maps, type: "url", inputLang: "en", onInput: (v) => {
      set("maps", v);
      mapsHint.textContent = v.trim() && !/^https:\/\/\S+$/.test(v.trim()) ? o.badMaps : "";
    } });
    maps.append(mapsHint);
    const phone = G.phoneParts(d.phone);
    return [card(
      h("div", { class: "admin-row" }, phoneField("phone", o.phone, phone.local), phoneField("whatsapp", o.whatsapp, "", o.whatsappHint)),
      h("div", { class: "admin-row" },
        field({ label: o.instagram, value: current("instagram"), placeholder: `@${d.instagram}`, inputLang: "en", onInput: (v) => set("instagram", v) }),
        field({ label: o.facebook, value: current("facebook"), placeholder: d.facebook, inputLang: "en", onInput: (v) => set("facebook", v) })),
      maps,
      pairField({ label: o.address, value: state.contact.address || {}, placeholder: { ar: d.address.ar[0], en: d.address.en[0] }, max: 300, onInput: (l, v) => commit((s) => {
        const address = { ...(s.contact.address || { ar: "", en: "" }), [l]: v };
        if (address.ar.trim() || address.en.trim()) s.contact.address = address; else delete s.contact.address;
      }) }),
    )];
  },

  texts() {
    const o = t.texts;
    const mount = h("div", { class: "admin-texts" }, note(o.loading, "is-muted"));
    const link = document.querySelector("link[data-texts]");
    fetch(link.href).then((response) => response.json()).then((catalog) => {
      let page = "home";
      let query = "";
      let onlyChanged = false;
      const count = h("p", { class: "admin-count", "aria-live": "polite" });
      const list = h("div", { class: "admin-text-list" });
      const chips = h("div", { class: "admin-chips", role: "group", "aria-label": o.pages }, catalog.pages.map(([id, arLabel, enLabel]) => h("button", {
        type: "button", class: "admin-chip", "aria-pressed": String(id === page), "data-page": id,
        onclick: () => { page = id; chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.page === id))); draw(); previewPage(id === "shared" || id === "home" ? "" : `${id}/`); },
      }, lang === "ar" ? arLabel : enLabel)));
      const search = h("input", { class: "admin-input", type: "search", placeholder: o.search, "aria-label": o.search, oninput: (event) => { query = event.target.value.trim().toLowerCase(); draw(); } });
      const changedOnly = h("label", { class: "admin-check" }, h("input", { type: "checkbox", onchange: (event) => { onlyChanged = event.target.checked; draw(); } }), o.onlyChanged);
      const isChanged = (item) => (item.ar && state.texts.ar[item.ar] !== undefined) || (item.en && state.texts.en[item.en] !== undefined);
      function row(item) {
        const changed = h("span", { class: "admin-badge" }, t.changed);
        const fields = langs.filter((l) => item[l]).map((l) => {
          const original = item[l];
          const originalLine = h("small", { class: "admin-original" }, `${t.original} ${original}`);
          const reset = iconButton("reset", t.reset, () => { control.value = original; update(original); });
          const control = h("textarea", { class: "admin-input", rows: 1, lang: l, dir: l === "ar" ? "rtl" : "ltr", "aria-label": `${nameOf(l)}: ${shorten(original, 60)}` });
          control.value = state.texts[l][original] ?? original;
          const update = (value) => {
            commit((s) => { if (!value.trim() || value.trim() === original) delete s.texts[l][original]; else s.texts[l][original] = value; });
            const edited = state.texts[l][original] !== undefined;
            originalLine.hidden = !edited;
            reset.hidden = !edited;
            changed.hidden = !isChanged(item);
          };
          control.addEventListener("input", () => update(control.value));
          const edited = state.texts[l][original] !== undefined;
          originalLine.hidden = !edited;
          reset.hidden = !edited;
          return h("div", { class: "admin-text-field" }, h("div", { class: "admin-text-input" }, h("span", { class: "admin-lang" }, nameOf(l)), control, reset), originalLine);
        });
        changed.hidden = !isChanged(item);
        return h("article", { class: "admin-text" }, h("header", {}, h("span", { class: "admin-kind" }, o.kinds[item.kind] || o.kinds.text), changed), fields);
      }
      function draw() {
        const items = catalog.items.filter((item) => item.pages.includes(page) || (query && true))
          .filter((item) => !query || `${item.ar} ${item.en} ${state.texts.ar[item.ar] || ""} ${state.texts.en[item.en] || ""}`.toLowerCase().includes(query))
          .filter((item) => !onlyChanged || isChanged(item));
        count.textContent = fill(o.count, { n: items.length });
        list.replaceChildren(...(items.length ? items.map(row) : [note(o.empty, "is-muted")]));
      }
      draw();
      mount.replaceChildren(h("div", { class: "admin-text-tools" }, chips, h("div", { class: "admin-row" }, search, changedOnly)), count, list);
    }).catch(() => mount.replaceChildren(note(o.failed, "is-warning")));
    return [mount];
  },

  photos() {
    for (const item of document.querySelectorAll("[data-photo]")) {
      if (item.dataset.ready) continue;
      item.dataset.ready = "1";
      const name = item.dataset.photo;
      const image = item.querySelector("img");
      const original = image.dataset.src || (image.dataset.src = image.getAttribute("src"));
      const badge = h("span", { class: "admin-badge" }, t.changed);
      const input = h("input", { type: "file", accept: "image/*", class: "visually-hidden", id: `f${++uid}` });
      const choose = h("label", { class: "button button-small", for: input.id }, t.photoHint);
      const reset = h("button", { type: "button", class: "button button-small button-quiet", onclick: async () => {
        await G.photos.remove(name).catch(() => {});
        commit((s) => { delete s.photos[name]; }, { now: true });
        image.src = original;
        paint();
      } }, t.photoReset);
      const paint = () => { const custom = Boolean(state.photos[name]); badge.hidden = !custom; reset.hidden = !custom; item.classList.toggle("is-edited", custom); };
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        item.classList.add("is-busy");
        try {
          const blob = await shrink(file, name === "brand" ? 512 : 1600, name === "brand" ? "image/png" : "image/jpeg");
          await G.photos.put(name, blob);
          commit((s) => { s.photos[name] = { at: new Date().toISOString() }; }, { now: true });
          image.src = URL.createObjectURL(blob);
        } catch {
          setStatus("error");
        }
        item.classList.remove("is-busy");
        paint();
      });
      item.querySelector("figure").append(badge);
      item.append(h("div", { class: "admin-photo-actions" }, input, choose, reset));
      if (state.photos[name]) G.photos.get(name).then((blob) => { if (blob instanceof Blob) image.src = URL.createObjectURL(blob); }).catch(() => {});
      paint();
    }
    return [];
  },

  look() {
    const o = t.look;
    const sample = h("div", { class: "admin-look-sample" }, h("span", { class: "button" }, o.sampleButton), h("span", { class: "hours-now is-open" }, o.sampleChip));
    const paintSample = () => {
      const accent = state.look.accent;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
      sample.style.setProperty("--sun", accent);
      sample.style.setProperty("--sun-rgb", `${r} ${g} ${b}`);
      sample.style.setProperty("--sun-bright", `rgb(${Math.round(r + (255 - r) * 0.3)} ${Math.round(g + (255 - g) * 0.3)} ${Math.round(b + (255 - b) * 0.3)})`);
      const light = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      sample.style.setProperty("--sun-ink", 0.2126 * light(r) + 0.7152 * light(g) + 0.0722 * light(b) > 0.36 ? "#14110b" : "#ffffff");
    };
    const pick = (color) => {
      commit((s) => { s.look.accent = color; }, { now: true });
      swatches.querySelectorAll("input[type=radio]").forEach((input) => { input.checked = input.value === color; });
      custom.value = color;
      paintSample();
    };
    const group = `accent-${++uid}`;
    const custom = h("input", { type: "color", class: "admin-color", value: state.look.accent, "aria-label": o.custom, oninput: (event) => pick(event.target.value.toLowerCase()) });
    const swatches = h("div", { class: "admin-swatches", role: "radiogroup", "aria-label": o.accent },
      o.colors.map(([color, label]) => h("label", { class: "admin-swatch", style: `--swatch:${color}` },
        h("input", { type: "radio", name: group, value: color, checked: state.look.accent === color, onchange: () => pick(color) }), h("span", {}, label))),
      h("label", { class: "admin-swatch admin-swatch-custom" }, custom, h("span", {}, o.custom)));
    paintSample();
    return [
      card(h("p", { class: "admin-label" }, o.accent), swatches, h("p", { class: "admin-subhead" }, o.sample), sample),
      card(
        toggle({ label: o.splash, hint: o.splashHint, checked: state.look.splash, onChange: (on) => commit((s) => { s.look.splash = on; }, { now: true }) }),
        toggle({ label: o.motion, hint: o.motionHint, checked: state.look.motion, onChange: (on) => commit((s) => { s.look.motion = on; }, { now: true }) })),
    ];
  },

  backup() {
    const o = t.backup;
    const message = h("p", { class: "admin-note", role: "status" });
    // The section is drawn again after a restore or a wipe, so the message goes on the new one.
    const tell = (text) => { const live = document.querySelector('#backup [role="status"]'); if (live) live.textContent = text; };
    const storage = h("p", { class: "admin-note is-muted" });
    navigator.storage?.estimate?.().then(({ usage }) => {
      if (usage) storage.textContent = fill(o.storage, { s: usage > 1048576 ? `${(usage / 1048576).toFixed(1)} MB` : `${Math.ceil(usage / 1024)} KB` });
    }).catch(() => {});
    const restoreInput = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden", id: `f${++uid}` });
    restoreInput.addEventListener("change", async () => {
      const file = restoreInput.files?.[0];
      restoreInput.value = "";
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (data?.app !== "galaxy-gym-admin" || !data.state) throw new Error("not a copy");
        const next = G.clean(data.state);
        await G.photos.clear();
        for (const name of Object.keys(next.photos)) {
          const url = data.photos?.[name];
          if (typeof url !== "string" || !url.startsWith("data:image/")) { delete next.photos[name]; continue; }
          await G.photos.put(name, await (await fetch(url)).blob());
        }
        state = next;
        save();
        restart();
        tell(o.restored);
      } catch {
        tell(o.badFile);
      }
    });
    let armed = 0;
    const wipe = h("button", { type: "button", class: "button button-quiet admin-danger", onclick: async () => {
      if (Date.now() - armed > 4000) { armed = Date.now(); wipe.textContent = o.wipeConfirm; setTimeout(() => { wipe.textContent = o.wipe; }, 4000); return; }
      localStorage.removeItem(G.key);
      await G.photos.clear().catch(() => {});
      state = G.read();
      save();
      localStorage.removeItem(G.key);
      restart();
      tell(o.wiped);
    } }, o.wipe);
    return [
      card(h("h3", {}, o.publish), h("ol", { class: "admin-steps" }, o.steps.map((step) => h("li", {}, step)))),
      card(
        h("div", { class: "admin-backup-row" }, h("div", {}, h("strong", {}, o.download), h("small", {}, o.downloadHint)), h("button", { type: "button", class: "button", onclick: download }, o.download)),
        h("div", { class: "admin-backup-row" }, h("div", {}, h("strong", {}, o.restore), h("small", {}, o.restoreHint)), restoreInput, h("label", { class: "button button-quiet", for: restoreInput.id }, o.restore)),
        h("div", { class: "admin-backup-row" }, h("div", {}, h("strong", {}, o.wipe)), wipe),
        message, storage),
    ];
  },
};

async function download() {
  const photos = {};
  for (const name of Object.keys(state.photos)) {
    const blob = await G.photos.get(name).catch(() => null);
    if (blob instanceof Blob) photos[name] = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
  }
  const file = new Blob([JSON.stringify({ app: "galaxy-gym-admin", version: 1, exportedAt: new Date().toISOString(), state, photos }, null, 1)], { type: "application/json" });
  const link = h("a", { href: URL.createObjectURL(file), download: `galaxy-gym-edits-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

// Shrinks a photo on this device before saving it.
async function shrink(file, longest, type) {
  const bitmap = await createImageBitmap(file).catch(() => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  }));
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), type, 0.85));
}

// ---------- navigation and preview ----------
const rendered = {};
let current = "overview";
const previewFor = { overview: "", announcement: "", plans: "prices/", hours: "contact/", contact: "contact/", texts: "", photos: "", look: "", backup: "" };
const pageSelect = document.querySelector("[data-preview-page]");
const base = frame ? new URL(frame.getAttribute("src"), location.href) : null;
function previewPage(path) {
  if (!frame || matchMedia("(max-width: 79.99rem)").matches) return;
  pageSelect.value = path;
  const next = new URL(path, base).href;
  if (frame.src !== next) frame.src = next;
}
pageSelect?.addEventListener("change", () => previewPage(pageSelect.value));
document.querySelector("[data-preview-reload]")?.addEventListener("click", () => frame.contentWindow?.location.reload());

function show(id, { keepScroll = false } = {}) {
  if (!sections[id]) id = "overview";
  current = id;
  for (const section of document.querySelectorAll("[data-section]")) section.hidden = section.id !== id;
  for (const link of document.querySelectorAll("[data-nav]")) {
    if (link.dataset.nav === id) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  }
  if (!rendered[id] || id === "overview") {
    const mount = document.querySelector(`[data-mount="${id}"]`);
    mount.replaceChildren(...sections[id]().filter(Boolean));
    rendered[id] = true;
  }
  previewPage(previewFor[id]);
  // On phones the section menu is a sliding row: bring the chosen section into view.
  if (matchMedia("(max-width: 63.99rem)").matches) document.querySelector(`[data-nav="${id}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  summarize();
  if (!keepScroll) scrollTo({ top: 0, behavior: "instant" });
}
function restart() {
  for (const item of document.querySelectorAll("[data-photo]")) {
    delete item.dataset.ready;
    item.querySelector(".admin-photo-actions")?.remove();
    item.querySelector(".admin-badge")?.remove();
    const image = item.querySelector("img");
    if (image.dataset.src) image.src = image.dataset.src;
  }
  for (const id of Object.keys(rendered)) rendered[id] = false;
  show(current, { keepScroll: true });
}
addEventListener("hashchange", () => show(location.hash.slice(1)));
show(location.hash.slice(1) || "overview", { keepScroll: true });
setStatus(G.hasEdits(state) ? "saved" : "");
