// My log (completed workouts, the month's summary and calendar) and My weight, on the account page.
// The data lives in training-log.js; every change goes through update(), which tells the page to redraw.
import { limits, loadLog, update, newId, today, fromKey, monthKey, validDate, recordWeight, monthSummary } from "./training-log.js";

const root = document.querySelector("[data-log]");
const strings = JSON.parse(document.querySelector("#workout-copy").textContent);
const arabic = document.documentElement.lang === "ar";
// Western digits in both languages, like the rest of the site.
const locale = arabic ? "ar-JO-u-nu-latn" : "en-GB";
const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
// A signed change, kept left to right so the sign stays in front of the number inside Arabic text.
const signed = (value) => `⁦${value > 0 ? "+" : value < 0 ? "−" : ""}${oneDecimal.format(Math.abs(value))}⁩`;
const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
const monthName = new Intl.DateTimeFormat(locale, { month: "long" });
const dayTitle = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
const dayShort = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric" });
const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: "short" });
const weekdayNarrow = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
const fill = (template, ...values) => template.replace(/\{(\d+)\}/g, (_, index) => values[index]);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const find = (selector) => document.querySelector(selector);
const title = find("[data-log-title]");
const previous = find("[data-log-previous]");
const next = find("[data-log-next]");
const calendar = find("[data-log-calendar]");
const compare = find("[data-log-compare]");
const recap = find("[data-log-recap]");
const list = find("[data-log-list]");
const more = find("[data-log-more]");
const empty = find("[data-log-empty]");
const rowTemplate = find("#log-row");
const form = find("[data-log-form]");
const status = find("[data-log-status]");
const stats = new Map(Array.from(root.querySelectorAll("[data-log-stat]"), (node) => [node.dataset.logStat, node]));
const shortList = 5;

const now = new Date();
let log = loadLog();
let view = { year: now.getFullYear(), month: now.getMonth() };
let lit = "";
// A logged plan keeps its exercise and set count as the workout's note.
let pendingNote = "";

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return fill(strings.timeM, whole.format(rest));
  return rest ? fill(strings.timeHM, whole.format(hours), whole.format(rest)) : fill(strings.timeH, whole.format(hours));
}

// Saves a change and reports it; the page redraws from the "galaxy:log-changed" event.
function apply(change, message, target = status) {
  const result = update(change);
  target.textContent = result ? message : strings.logNoStorage;
  return result;
}

// The week starts on Saturday, as calendars in Jordan do.
function renderCalendar(summary) {
  const first = new Date(view.year, view.month, 1);
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const offset = (first.getDay() + 1) % 7;
  const current = today();
  const chosen = form.elements.date.value;
  const cells = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const label = document.createElement("span");
    label.className = "log-weekday";
    label.setAttribute("aria-hidden", "true");
    label.textContent = weekdayNarrow.format(new Date(2023, 0, 7 + weekday));
    cells.push(label);
  }
  for (let blank = 0; blank < offset; blank += 1) cells.push(document.createElement("span"));
  for (let day = 1; day <= days; day += 1) {
    const key = `${monthKey(view.year, view.month)}-${String(day).padStart(2, "0")}`;
    const count = summary.days.get(key) ?? 0;
    const button = document.createElement("button");
    const face = document.createElement("span");
    button.type = "button";
    button.className = "log-day";
    button.dataset.date = key;
    button.disabled = key > current;
    if (count) button.classList.add("is-trained");
    if (key === current) button.classList.add("is-today");
    if (key === chosen) button.setAttribute("aria-pressed", "true");
    if (key === lit) button.classList.add("is-new");
    button.setAttribute("aria-label", count ? fill(strings.dayCount, dayTitle.format(fromKey(key)), whole.format(count)) : dayTitle.format(fromKey(key)));
    face.textContent = whole.format(day);
    button.append(face);
    cells.push(button);
  }
  calendar.replaceChildren(...cells);
}

function removeButton(label, onRemove) {
  const remove = rowTemplate.content.querySelector("[data-log-remove]").cloneNode(true);
  remove.setAttribute("aria-label", fill(strings.removeLabel, label));
  remove.addEventListener("click", onRemove);
  return remove;
}

function renderList(summary) {
  empty.hidden = summary.sessions.length > 0;
  more.hidden = summary.sessions.length <= shortList;
  more.textContent = list.classList.contains("is-short") ? fill(strings.showAll, whole.format(summary.sessions.length)) : strings.showLess;
  list.replaceChildren(...summary.sessions.map((entry) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector("[data-log-day]").textContent = whole.format(fromKey(entry.date).getDate());
    row.querySelector("[data-log-weekday]").textContent = weekdayShort.format(fromKey(entry.date));
    row.querySelector("[data-log-name]").textContent = entry.name;
    const note = row.querySelector("[data-log-note]");
    note.textContent = entry.note;
    note.hidden = !entry.note;
    row.querySelector("[data-log-minutes]").textContent = duration(entry.minutes);
    row.querySelector("[data-log-remove]").replaceWith(removeButton(`${entry.name}, ${dayTitle.format(fromKey(entry.date))}`, () => {
      if (!window.confirm(strings.logConfirmRemove)) return;
      apply((data) => { data.sessions = data.sessions.filter((item) => item.id !== entry.id); }, strings.logRemoved);
    }));
    return row;
  }));
}

function render() {
  const summary = monthSummary(log, view.year, view.month);
  const before = new Date(view.year, view.month - 1, 1);
  const last = monthSummary(log, before.getFullYear(), before.getMonth());
  const isCurrent = view.year === now.getFullYear() && view.month === now.getMonth();

  title.textContent = monthTitle.format(new Date(view.year, view.month, 1));
  next.disabled = isCurrent;
  stats.get("sessions").textContent = whole.format(summary.sessions.length);
  stats.get("time").textContent = summary.minutes ? duration(summary.minutes) : "—";
  stats.get("days").textContent = whole.format(summary.days.size);
  stats.get("average").textContent = summary.sessions.length ? duration(summary.average) : "—";

  const difference = summary.sessions.length - last.sessions.length;
  compare.hidden = !last.sessions.length;
  if (!compare.hidden) {
    compare.textContent = difference > 0 ? fill(strings.compareMore, whole.format(difference))
      : difference < 0 ? fill(strings.compareLess, whole.format(-difference)) : strings.compareSame;
  }

  // In the first days of a new month, lead with what last month added up to.
  const showRecap = isCurrent && now.getDate() <= 10 && last.sessions.length > 0;
  recap.hidden = !showRecap;
  if (showRecap) recap.textContent = fill(strings.recap, monthName.format(before), whole.format(last.sessions.length), whole.format(last.days.size), duration(last.minutes));

  renderCalendar(summary);
  renderList(summary);
  renderWeight();
  lit = "";
}

function showMonth(year, month) {
  const target = new Date(year, month, 1);
  if (target > new Date(now.getFullYear(), now.getMonth(), 1)) return;
  view = { year: target.getFullYear(), month: target.getMonth() };
  render();
}

more.addEventListener("click", () => {
  list.classList.toggle("is-short");
  render();
});
previous.addEventListener("click", () => showMonth(view.year, view.month - 1));
next.addEventListener("click", () => showMonth(view.year, view.month + 1));

// Choosing a day on the calendar puts it in the form, ready to log.
calendar.addEventListener("click", (event) => {
  const day = event.target.closest(".log-day");
  if (!day || day.disabled) return;
  form.elements.date.value = day.dataset.date;
  for (const button of calendar.querySelectorAll("[aria-pressed]")) button.removeAttribute("aria-pressed");
  day.setAttribute("aria-pressed", "true");
  form.elements.name.focus({ preventScroll: matchMedia("(min-width: 58.01rem)").matches });
});

form.elements.date.max = today();
form.elements.date.value = today();
form.elements.date.addEventListener("change", () => {
  const value = form.elements.date.value;
  if (validDate(value)) showMonth(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1);
});

// A quick pick starts the name, or adds to it.
for (const pick of root.querySelectorAll("[data-log-quick]")) {
  pick.addEventListener("click", () => {
    const name = form.elements.name;
    const parts = name.value.split(/\s*[،,+]\s*/).filter(Boolean);
    if (!parts.includes(pick.textContent)) parts.push(pick.textContent);
    name.value = parts.join(arabic ? "، " : ", ").slice(0, limits.name);
    name.focus({ preventScroll: true });
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = form.elements.name.value.replace(/\s+/g, " ").trim();
  const date = form.elements.date.value;
  const minutes = form.elements.minutes.valueAsNumber;
  const problem = !name ? ["name", strings.nameRequired]
    : !validDate(date) ? ["date", strings.dateInvalid]
    : !Number.isInteger(minutes) || minutes < limits.minutes[0] || minutes > limits.minutes[1] ? ["minutes", strings.minutesInvalid] : null;
  if (problem) {
    status.textContent = problem[1];
    form.elements[problem[0]].focus();
    return;
  }
  lit = date;
  view = { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 };
  const saved = apply((data) => { data.sessions.push({ id: newId(), date, name, minutes, note: pendingNote }); }, strings.logSaved);
  if (!saved) return;
  form.elements.name.value = "";
  pendingNote = "";
});

// "Log this plan as a workout" in the plan panel fills the form in; the member still presses the button.
document.addEventListener("galaxy:log-plan", (event) => {
  const { names, sets } = event.detail;
  const shown = names.slice(0, 2).join(arabic ? "، " : ", ");
  form.elements.name.value = (names.length > 2 ? fill(strings.planNameMore, shown) : shown).slice(0, limits.name);
  pendingNote = fill(strings.planNote, whole.format(names.length), whole.format(sets));
  form.elements.date.value = today();
  showMonth(now.getFullYear(), now.getMonth());
  status.textContent = strings.planReady;
  form.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
  form.elements.minutes.focus({ preventScroll: true });
});

// ---- My weight
const weightForm = find("[data-weight-form]");
const weightStatus = find("[data-weight-status]");
const weightLatest = find("[data-weight-latest]");
const weightChart = find("[data-weight-chart]");
const weightChange = find("[data-weight-change]");
const weightAll = find("[data-weight-all]");
const weightList = find("[data-weight-list]");

function renderWeight() {
  const readings = log.weights;
  const latest = readings.at(-1);
  weightLatest.hidden = !latest;
  if (latest) weightLatest.querySelector("b").textContent = oneDecimal.format(latest.kg);

  // The line: up to the last 20 readings, oldest on the left.
  const recent = readings.slice(-20);
  weightChart.toggleAttribute("hidden", recent.length < 2);
  if (recent.length > 1) {
    const low = Math.min(...recent.map((entry) => entry.kg));
    const high = Math.max(...recent.map((entry) => entry.kg));
    const span = Math.max(high - low, 1);
    const points = recent.map((entry, index) => [12 + index * (576 / (recent.length - 1)), 104 - ((entry.kg - low) / span) * 88]);
    weightChart.querySelector("polyline").setAttribute("points", points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
    weightChart.querySelector("g").innerHTML = points.map(([x, y]) => `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`).join("");
    weightChart.setAttribute("aria-label", fill(strings.weightChart, whole.format(recent.length), oneDecimal.format(recent[0].kg), oneDecimal.format(recent.at(-1).kg)));
  }

  const change = monthSummary(log, view.year, view.month).weightChange;
  weightChange.hidden = change === null;
  if (change !== null) weightChange.textContent = fill(strings.weightChange, monthName.format(new Date(view.year, view.month, 1)), signed(change));

  weightAll.hidden = !readings.length;
  weightList.replaceChildren(...[...readings].reverse().map((entry) => {
    const row = document.createElement("li");
    const day = document.createElement("bdi");
    const value = document.createElement("strong");
    row.className = "log-row log-row-weight";
    day.className = "log-row-day";
    day.textContent = dayShort.format(fromKey(entry.date));
    value.textContent = `${oneDecimal.format(entry.kg)} ${strings.kg}`;
    if (entry.fat) {
      const fat = document.createElement("small");
      fat.textContent = ` ${fill(strings.fatReading, oneDecimal.format(entry.fat))}`;
      value.append(fat);
    }
    const remove = removeButton(`${value.textContent}, ${day.textContent}`, () => {
      apply((data) => { data.weights = data.weights.filter((item) => item.date !== entry.date); }, strings.weightRemoved, weightStatus);
    });
    row.append(day, value, remove);
    return row;
  }));
}

weightForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const kg = weightForm.elements.kg.valueAsNumber;
  if (!Number.isFinite(kg) || kg < limits.weight[0] || kg > limits.weight[1]) {
    weightStatus.textContent = strings.weightInvalid;
    weightForm.elements.kg.focus();
    return;
  }
  if (!recordWeight(today(), kg)) {
    weightStatus.textContent = strings.logNoStorage;
    return;
  }
  weightForm.reset();
  weightStatus.textContent = strings.weightSaved;
});

// Redraw whenever the records change: here, in account.js, or in another tab.
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
