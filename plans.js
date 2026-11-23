// Join or renew from the prices page. "Join" / "Renew" on a plan opens this form; it writes the request for the
// gym on WhatsApp and can keep the membership in the visitor's own account page (training-log.js, this device
// only). Without this script the same buttons open WhatsApp with a short message.
import { addDays, currentMembership, fromKey, loadLog, membershipEnd, newId, planMonths, today, update } from "./training-log.js";

const dialog = document.getElementById("join-sheet");
const form = dialog?.querySelector("[data-join-form]");
const j = JSON.parse(document.getElementById("join-copy")?.textContent || "null");
const G = window.galaxyContent;

if (dialog && form && j && G) {
  const ar = document.documentElement.lang !== "en";
  const fill = (text, values) => text.replace(/\{(\w)\}/g, (_, key) => values[key] ?? "");
  const number = new Intl.NumberFormat(ar ? "ar-JO-u-nu-latn" : "en-GB", { maximumFractionDigits: 2 });
  const longDay = new Intl.DateTimeFormat(ar ? "ar-JO-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const formatDay = (key) => longDay.format(fromKey(key));
  const currency = ar ? "د.أ" : "JOD";
  const money = (value) => `${number.format(value)} ${currency}`;
  const pick = (value) => (value?.[ar ? "ar" : "en"] || "").trim();
  const options = form.querySelector("[data-join-plans]");
  const total = form.querySelector("[data-join-total]");
  const send = form.querySelector("[data-join-send]");
  const error = form.querySelector("[data-join-error]");
  const done = form.querySelector("[data-join-done]");
  const title = form.querySelector("[data-join-title]");
  let opener = null;
  let savedFor = "";

  const plans = () => G.plansNow().items.filter((plan) => pick(plan.name) && plan.price);
  const mode = () => form.elements.mode.value;
  const chosen = () => plans().find((plan) => plan.id === form.elements.plan?.value) || plans()[0];
  const cost = (plan, kind) => (kind === "renew" && plan.renewal ? plan.renewal : plan.offer && plan.offer < plan.price ? plan.offer : plan.price);
  const endOf = (plan, start) => (plan.months ? membershipEnd(start, plan.months) : addDays(start, (plan.days || 1) - 1));

  // A renewal starts the day after the membership on record ends (or today, if that has passed).
  function suggestedStart(kind) {
    if (kind !== "renew") return today();
    const log = loadLog();
    const latest = [...log.memberships].sort((a, b) => b.end.localeCompare(a.end))[0];
    const next = latest ? addDays(latest.end, 1) : today();
    return next > today() ? next : today();
  }

  function drawOptions(selected) {
    const kind = mode();
    options.replaceChildren(...plans().map((plan) => {
      const label = document.createElement("label");
      label.className = "join-option";
      const input = Object.assign(document.createElement("input"), { type: "radio", name: "plan", value: plan.id, checked: plan.id === selected });
      const name = Object.assign(document.createElement("span"), { className: "join-option-name", textContent: pick(plan.name) });
      const price = Object.assign(document.createElement("span"), { className: "join-option-price", textContent: money(cost(plan, kind)) });
      label.append(input, name, price);
      return label;
    }));
    if (!form.querySelector('input[name="plan"]:checked')) form.querySelector('input[name="plan"]')?.click();
  }

  function message() {
    const plan = chosen();
    const kind = mode();
    const start = form.elements.start.value || today();
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const lines = [kind === "renew" ? j.renewLine : j.joinLine,
      fill(j.planLine, { n: pick(plan.name), k: kind === "renew" && plan.renewal ? j.kindRenew : j.kindJoin, p: money(cost(plan, kind)) }),
      fill(j.datesLine, { a: formatDay(start), b: formatDay(endOf(plan, start)) })];
    if (name) lines.push(fill(j.nameLine, { n: name }));
    if (phone) lines.push(fill(j.phoneLine, { p: phone }));
    return lines.join("\n");
  }

  function refresh() {
    const plan = chosen();
    if (!plan) return;
    const kind = mode();
    const start = form.elements.start.value || today();
    title.textContent = kind === "renew" ? j.titleRenew : j.titleJoin;
    total.replaceChildren(
      Object.assign(document.createElement("span"), { textContent: j.total }),
      Object.assign(document.createElement("strong"), { textContent: money(cost(plan, kind)) }),
      Object.assign(document.createElement("small"), { textContent: `${pick(plan.name)} · ${fill(j.until, { d: formatDay(endOf(plan, start)) })}` }));
    send.href = G.whatsappLink(message());
  }

  function open(kind, planId, trigger) {
    opener = trigger || null;
    const log = loadLog();
    form.elements.mode.value = kind === "renew" ? "renew" : "join";
    // Renewing from the account page: start from the length of the membership on record.
    const onRecord = kind === "renew" ? currentMembership(log)?.months : 0;
    drawOptions(planId || plans().find((plan) => onRecord && plan.months === onRecord)?.id || plans()[0]?.id);
    form.elements.start.value = suggestedStart(mode());
    form.elements.start.min = today();
    if (!form.elements.name.value) form.elements.name.value = log.profile?.name || "";
    error.hidden = true;
    done.hidden = true;
    savedFor = "";
    refresh();
    dialog.showModal();
  }

  // Buttons on the plans (built into the page, or drawn by content.js after an admin edit).
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-plan-action]");
    if (!button || event.metaKey || event.ctrlKey || event.shiftKey || typeof dialog.showModal !== "function") return;
    event.preventDefault();
    open(button.dataset.planAction, button.dataset.plan, button);
  });
  form.addEventListener("change", (event) => {
    if (event.target.name === "mode") {
      const keep = chosen()?.id;
      drawOptions(keep);
      form.elements.start.value = suggestedStart(mode());
    }
    refresh();
  });
  form.addEventListener("input", () => { if (form.elements.name.value.trim()) error.hidden = true; refresh(); });
  form.addEventListener("submit", (event) => event.preventDefault());
  send.addEventListener("click", (event) => {
    const name = form.elements.name.value.trim();
    if (!name) {
      event.preventDefault();
      error.hidden = false;
      form.elements.name.focus();
      return;
    }
    refresh();
    const plan = chosen();
    const kind = mode();
    const start = form.elements.start.value || today();
    // Sending again (WhatsApp didn't open, say) must not add the same membership twice.
    const what = [kind, plan.id, start].join(" ");
    let saved = savedFor === what;
    if (form.elements.save.checked && !saved) {
      saved = Boolean(update((log) => {
        if (!log.profile.name) log.profile.name = name;
        log.memberships.push({ id: newId(), start, end: endOf(plan, start), months: planMonths.includes(plan.months) ? plan.months : 0, paid: cost(plan, kind) });
      }));
      if (saved) savedFor = what;
    }
    done.querySelector("[data-join-done-text]").textContent = saved ? `${j.done} ${j.doneSaved}` : j.done;
    done.hidden = false;
  });
  form.querySelector("[data-join-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    if (linked()) history.replaceState(history.state, "", location.pathname + location.search);
    opener?.focus();
  });

  // Links from other pages open the form: #renew from the account page, #join-<plan> from the home page's cards.
  const linked = () => location.hash.match(/^#(join|renew)(?:-([a-z0-9]{1,20}))?$/);
  const fromHash = () => {
    const match = linked();
    if (match && !dialog.open) open(match[1], plans().some((plan) => plan.id === match[2]) ? match[2] : null, null);
  };
  fromHash();
  window.addEventListener("hashchange", fromHash);
}
