// The account page around the log: the tabs, the member's name, the membership ring at the top, the
// membership record, the numbers saved from the fitness calculator, and the data row (copy, restore, delete).
import {
  limits, loadLog, update, clearLog, sanitize, newId, today, addDays, fromKey, validDay, membershipEnd,
  currentMembership, membershipState, sessionsBetween, daysBetween, monthSummary,
} from "./training-log.js";
import {
  restingEnergy, restingEnergyFromLeanMass, fatFreeMass, calorieTarget, goalMacros, bodyMassIndex, bodyFatLevel, healthyFatWeightRange,
} from "./fitness-math.js";

const strings = JSON.parse(document.querySelector("#workout-copy").textContent);
const arabic = document.documentElement.lang === "ar";
const locale = arabic ? "ar-JO-u-nu-latn" : "en-GB";
const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
const monthYear = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
const fill = (template, ...values) => template.replace(/\{(\d+)\}/g, (_, index) => values[index]);
const formatDay = (key, format = longDate) => format.format(fromKey(key));
const find = (selector) => document.querySelector(selector);
// The gym's WhatsApp: the admin panel can change the number (content.js).
const ringLength = 100;

let log = loadLog();

// ---- Tabs: one section at a time. The address keeps the open tab (#membership, #log, #body).
const tabList = find("[data-tabs]");
const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
const tabIds = panels.map((panel) => panel.id);

function openTab(id, { focus = false, remember = true } = {}) {
  if (!tabIds.includes(id)) return;
  tabs.forEach((tab, index) => {
    const selected = tabIds[index] === id;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[index].hidden = !selected;
  });
  if (remember && location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  if (focus) tabs[tabIds.indexOf(id)].focus();
}
tabs.forEach((tab, index) => tab.addEventListener("click", () => openTab(tabIds[index])));
// Arrow keys move along the tabs in reading order (right to left in Arabic).
tabList.addEventListener("keydown", (event) => {
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  const forward = arabic ? "ArrowLeft" : "ArrowRight";
  const back = arabic ? "ArrowRight" : "ArrowLeft";
  const next = event.key === forward ? current + 1 : event.key === back ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
  if (next === null) return;
  event.preventDefault();
  openTab(tabIds[(next + tabs.length) % tabs.length], { focus: true });
});

// Links into the page (the glance numbers, the ring, links from other pages) open their tab.
function followHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id === "plates") {
    // The barbell plates now live in the fitness calculator.
    location.replace(new URL("../calculators/#plates", location.href).href);
    return;
  }
  if (id === "plan") {
    openTab("log", { remember: false });
    find("[data-plan-details]").open = true;
    find("[data-plan-details]").scrollIntoView({ block: "start" });
    return;
  }
  if (tabIds.includes(id)) openTab(id, { remember: false });
}
addEventListener("hashchange", followHash);
for (const link of document.querySelectorAll("[data-tab-link]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openTab(link.dataset.tabLink);
    tabList.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}

// ---- Header: name, membership ring, the three numbers at a glance
const title = find("[data-account-title]");
const plan = find("[data-account-plan]");
const since = find("[data-account-since]");
const ring = find("[data-ring]");
const ringLit = find("[data-ring-lit]");
const ringNumber = find("[data-ring-number]");
const ringLabel = find("[data-ring-label]");
const renew = find("[data-renew]");
const nameOpen = find("[data-name-open]");
const nameForm = find("[data-name-form]");
const glance = new Map(Array.from(document.querySelectorAll("[data-glance]"), (node) => [node.dataset.glance, node]));

// The member's daily numbers from what they saved in the calculator (same rules as the calculator).
function bodyNumbers(body) {
  const lean = typeof body.fat === "number" ? fatFreeMass(body.weight, body.fat) : null;
  const resting = lean !== null ? restingEnergyFromLeanMass(lean) : restingEnergy(body.sex, body.weight, body.height, body.age);
  const target = calorieTarget(resting * body.activity, body.goal, body.sex).calories;
  const fatLevel = lean !== null ? bodyFatLevel(body.sex, body.age, body.fat) : null;
  const proteinWeight = lean !== null && fatLevel >= 2 ? Math.min(body.weight, healthyFatWeightRange(body.sex, body.age, lean)[1]) : body.weight;
  return { calories: target, protein: goalMacros(target, proteinWeight, body.goal).protein, bmi: bodyMassIndex(body.weight, body.height) };
}

function renderHeader() {
  const name = log.profile.name ?? "";
  title.textContent = name || strings.title;

  const membership = currentMembership(log);
  const state = membership ? membershipState(membership) : null;
  ring.dataset.phase = state ? state.phase : "none";
  const lit = !state ? 0 : state.phase === "upcoming" ? ringLength : state.phase === "ended" ? 0 : (1 - state.used) * ringLength;
  ringLit.style.strokeDasharray = `${lit.toFixed(2)} ${ringLength}`;
  ringLit.style.opacity = lit > 0 ? "" : "0";
  ringNumber.textContent = !state ? "—" : state.phase === "ended" ? "0" : whole.format(state.days);
  ringLabel.textContent = !state ? strings.noMembership : state.phase === "upcoming" ? strings.daysToStart : state.phase === "ended" ? strings.endedRing : strings.daysLeft;
  const planName = membership ? strings.plans[membership.months] : "";
  plan.textContent = !state ? strings.planLineNone
    : state.phase === "upcoming" ? fill(strings.planLineUpcoming, planName, formatDay(membership.start))
    : state.phase === "ended" ? fill(strings.planLineEnded, planName, formatDay(membership.end))
    : fill(strings.planLine, planName, formatDay(membership.end));

  const first = log.memberships.at(-1);
  since.hidden = !first;
  if (first) since.textContent = fill(strings.memberSince, monthYear.format(fromKey(first.start)));

  // Near the end, or after it, offer the renewal: the prices page opens its renew form (plans.js).
  const due = state && (state.phase === "ending" || state.phase === "ended");
  renew.hidden = !due;

  const now = new Date();
  glance.get("month").textContent = whole.format(monthSummary(log, now.getFullYear(), now.getMonth()).sessions.length);
  const latest = log.weights.at(-1);
  glance.get("weight").textContent = latest ? `${oneDecimal.format(latest.kg)} ${strings.kg}` : "—";
  glance.get("calories").textContent = log.body ? whole.format(bodyNumbers(log.body).calories) : "—";
}

// Name: written once, shown as the page title.
const nameLabels = { add: nameOpen.textContent, edit: nameOpen.dataset.editLabel };
function renderName() {
  nameOpen.textContent = log.profile.name ? nameLabels.edit : nameLabels.add;
}
nameOpen.addEventListener("click", () => {
  nameForm.hidden = false;
  nameOpen.hidden = true;
  nameForm.elements.person.value = log.profile.name ?? "";
  nameForm.elements.person.focus();
});
const closeName = () => {
  nameForm.hidden = true;
  nameOpen.hidden = false;
  nameOpen.focus();
};
find("[data-name-cancel]").addEventListener("click", closeName);
nameForm.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeName();
});
nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = nameForm.elements.person.value.replace(/\s+/g, " ").trim().slice(0, limits.person);
  update((data) => { data.profile = value ? { name: value } : {}; });
  closeName();
});

// ---- My membership
const memberLayout = find(".member-layout");
const memberCard = find("[data-member-card]");
const memberHistory = find("[data-member-history]");
const memberList = find("[data-member-list]");
const memberForm = find("[data-member-form]");
const memberOpen = find("[data-member-open]");
const memberFormTitle = find("[data-member-form-title]");
let formOpen = false;
const memberStatus = find("[data-member-status-text]");
const memberStats = new Map(Array.from(document.querySelectorAll("[data-member-stat]"), (node) => [node.dataset.memberStat, node]));
const removeTemplate = find("#log-row").content.querySelector("[data-log-remove]");

function removeButton(label, onRemove) {
  const button = removeTemplate.cloneNode(true);
  button.removeAttribute("data-log-remove");
  button.setAttribute("aria-label", fill(strings.removeLabel, label));
  button.addEventListener("click", onRemove);
  return button;
}

function removeMembership(entry) {
  if (!window.confirm(strings.membershipConfirmRemove)) return;
  const result = update((data) => { data.memberships = data.memberships.filter((item) => item.id !== entry.id); });
  memberStatus.textContent = result ? strings.membershipRemoved : strings.logNoStorage;
}

const describe = (entry) => `${strings.plans[entry.months]}, ${fill(strings.range, formatDay(entry.start, shortDate), formatDay(entry.end, shortDate))}`;

function renderMembership() {
  const current = currentMembership(log);
  memberLayout.classList.toggle("is-empty", !current);
  memberCard.hidden = !current;
  // With a membership on record, the form waits behind "Add a renewal"; without one, it is the first thing shown.
  memberForm.hidden = Boolean(current) && !formOpen;
  memberOpen.hidden = !current || formOpen;
  memberOpen.setAttribute("aria-expanded", String(!memberForm.hidden));
  memberFormTitle.textContent = current ? memberFormTitle.dataset.titleRenew : memberFormTitle.dataset.titleNew;
  if (current) {
    const state = membershipState(current);
    const day = today();
    const until = current.end < day ? current.end : day;
    const sessions = current.start <= day ? sessionsBetween(log, current.start, until) : [];
    const elapsed = current.start <= day ? daysBetween(current.start, until) + 1 : 0;
    memberCard.dataset.phase = state.phase;
    find("[data-member-plan]").textContent = strings.plans[current.months];
    find("[data-member-status]").textContent = strings.status[state.phase];
    find("[data-member-range]").textContent = fill(strings.range, formatDay(current.start), formatDay(current.end));
    find("[data-member-progress]").style.inlineSize = `${(state.used * 100).toFixed(1)}%`;
    memberStats.get("sessions").textContent = whole.format(sessions.length);
    memberStats.get("days").textContent = whole.format(new Set(sessions.map((entry) => entry.date)).size);
    memberStats.get("week").textContent = elapsed >= 7 ? oneDecimal.format(sessions.length / (elapsed / 7)) : "—";
    find('[data-member-stat-row="paid"]').hidden = typeof current.paid !== "number";
    if (typeof current.paid === "number") memberStats.get("paid").textContent = fill(strings.money, money.format(current.paid));
    const note = find("[data-member-note]");
    note.hidden = !current.note;
    note.textContent = current.note;
    const top = memberCard.querySelector(".member-card-top");
    top.querySelector(".log-remove")?.remove();
    top.append(removeButton(describe(current), () => removeMembership(current)));
  }

  // The full history appears once there is more than one membership.
  memberHistory.hidden = log.memberships.length < 2;
  memberList.replaceChildren(...(log.memberships.length < 2 ? [] : log.memberships.map((entry) => {
    const state = membershipState(entry);
    const row = document.createElement("li");
    const main = document.createElement("div");
    const name = document.createElement("strong");
    const range = document.createElement("span");
    const side = document.createElement("b");
    row.className = "log-row member-row";
    row.dataset.phase = state.phase;
    if (current && entry.id === current.id) row.classList.add("is-current");
    name.textContent = strings.plans[entry.months];
    const chip = document.createElement("small");
    chip.className = "member-status";
    chip.textContent = strings.status[state.phase];
    name.append(" ", chip);
    range.textContent = fill(strings.range, formatDay(entry.start, shortDate), formatDay(entry.end, shortDate));
    const until = entry.end < today() ? entry.end : today();
    const count = entry.start <= today() ? sessionsBetween(log, entry.start, until).length : 0;
    side.textContent = typeof entry.paid === "number" ? fill(strings.money, money.format(entry.paid)) : fill(strings.sessionsCount, whole.format(count));
    main.append(name, range);
    row.append(main, side, removeButton(describe(entry), () => removeMembership(entry)));
    return row;
  })));
}

// The form suggests the next renewal: starting the day after the current membership ends.
function suggestDates() {
  const current = currentMembership(log);
  const state = current ? membershipState(current) : null;
  const start = state && state.phase !== "ended" ? addDays(current.end, 1) : today();
  memberForm.elements.start.value = start;
  memberForm.elements.end.value = membershipEnd(start, Number(memberForm.elements.months.value));
}
const recalculateEnd = () => {
  const start = memberForm.elements.start.value;
  if (validDay(start)) memberForm.elements.end.value = membershipEnd(start, Number(memberForm.elements.months.value));
};
memberOpen.addEventListener("click", () => {
  formOpen = true;
  suggestDates();
  suggestPaid();
  renderMembership();
  memberForm.querySelector('input[name="months"]:checked').focus();
});
// The amount fills in from the gym's prices for the chosen length: the renewal price once there is a
// membership on record, the new-member price before that. Still editable.
const suggestPaid = () => {
  const paid = memberForm.elements.paid;
  const price = window.galaxyContent?.priceFor(memberForm.elements.months.value, log.memberships.length > 0);
  if (paid.value !== "" && paid.dataset.suggested !== paid.value) return;
  paid.value = price ? String(price) : "";
  paid.dataset.suggested = paid.value;
};
memberForm.elements.start.addEventListener("change", recalculateEnd);
for (const option of memberForm.elements.months) option.addEventListener("change", () => { recalculateEnd(); suggestPaid(); });

memberForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const start = memberForm.elements.start.value;
  const end = memberForm.elements.end.value;
  const paidText = memberForm.elements.paid.value.trim();
  const paid = paidText === "" ? null : Number(paidText.replace(/[٫,]/g, "."));
  const problem = !validDay(start) ? ["start", strings.startInvalid]
    : !validDay(end) || end < start || daysBetween(start, end) > 1100 ? ["end", strings.endInvalid]
    : paid !== null && !(Number.isFinite(paid) && paid >= limits.paid[0] && paid <= limits.paid[1]) ? ["paid", strings.paidInvalid] : null;
  if (problem) {
    memberStatus.textContent = problem[1];
    memberForm.elements[problem[0]].focus();
    return;
  }
  const entry = { id: newId(), start, end, months: Number(memberForm.elements.months.value), note: "" };
  if (paid !== null) entry.paid = paid;
  formOpen = false;
  const result = update((data) => { data.memberships.push(entry); });
  memberStatus.textContent = result ? strings.membershipSaved : strings.logNoStorage;
  if (!result) return;
  memberForm.elements.paid.value = "";
  suggestDates();
  suggestPaid();
  memberOpen.focus();
});

// ---- My numbers, from the calculator
const bodyEmpty = find("[data-body-empty]");
const bodyValues = find("[data-body-values]");
const bodyList = find("[data-body-list]");
const bodyUpdated = find("[data-body-updated]");

function renderBody() {
  const body = log.body;
  bodyEmpty.hidden = Boolean(body);
  bodyValues.hidden = !body;
  if (!body) return;
  const numbers = bodyNumbers(body);
  const rows = [
    ["calories", `${whole.format(numbers.calories)} ${strings.kcal}`],
    ["protein", `${whole.format(numbers.protein)} ${strings.grams}`],
    ["bmi", oneDecimal.format(numbers.bmi)],
    ...(typeof body.fat === "number" ? [["fat", `${oneDecimal.format(body.fat)}%`]] : []),
    ...(typeof body.muscle === "number" ? [["muscle", `${oneDecimal.format(body.muscle)}%`]] : []),
    ["height", `${oneDecimal.format(body.height)} ${strings.cm}`],
    ["age", `${whole.format(body.age)} ${strings.years}`],
    ["goal", strings.goals[body.goal]],
    ["activity", strings.activityLevels[[1.2, 1.375, 1.55, 1.725].indexOf(body.activity)]],
  ];
  bodyList.replaceChildren(...rows.map(([key, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    row.dataset.bodyRow = key;
    term.textContent = strings.numberRows[key];
    detail.textContent = value;
    row.append(term, detail);
    return row;
  }));
  bodyUpdated.textContent = fill(strings.updated, formatDay(body.date));
}

// ---- My data: a copy to keep, restoring it, and deleting everything
const backupStatus = find("[data-backup-status]");
find("[data-log-export]").addEventListener("click", () => {
  const data = loadLog();
  const file = new Blob([JSON.stringify({ app: "galaxy-gym-log", version: 1, ...data }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = `galaxy-gym-${today()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  backupStatus.textContent = strings.exported;
});
find("[data-log-import-open]").addEventListener("click", () => find("[data-log-import]").click());
find("[data-log-import]").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  let incoming = null;
  try {
    const data = JSON.parse(await file.text());
    if (data && data.app === "galaxy-gym-log") incoming = sanitize(data);
  } catch {
    incoming = null;
  }
  const hasData = incoming && (incoming.sessions.length || incoming.weights.length || incoming.memberships.length || incoming.body || incoming.profile.name);
  if (!hasData) {
    backupStatus.textContent = strings.importFailed;
    return;
  }
  // Merge: what is already here stays, and the copy fills in the rest.
  const result = update((data) => {
    data.sessions = [...incoming.sessions, ...data.sessions];
    data.weights = [...incoming.weights, ...data.weights];
    data.memberships = [...incoming.memberships, ...data.memberships];
    if (!data.profile.name && incoming.profile.name) data.profile = incoming.profile;
    if (incoming.body && (!data.body || incoming.body.date > data.body.date)) data.body = incoming.body;
  });
  backupStatus.textContent = result
    ? fill(strings.imported, whole.format(incoming.memberships.length), whole.format(incoming.sessions.length), whole.format(incoming.weights.length))
    : strings.logNoStorage;
});
find("[data-clear-all]").addEventListener("click", () => {
  if (!window.confirm(strings.confirmClear)) return;
  backupStatus.textContent = clearLog() ? strings.cleared : strings.logNoStorage;
});

function render() {
  renderHeader();
  renderName();
  renderMembership();
  renderBody();
}

const reload = () => {
  log = loadLog();
  render();
};
document.addEventListener("galaxy:log-changed", reload);
addEventListener("storage", reload);
addEventListener("pageshow", (event) => {
  if (event.persisted) reload();
});

render();
suggestDates();
suggestPaid();
followHash();
