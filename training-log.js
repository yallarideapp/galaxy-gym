// The member's own records, kept only in this browser (localStorage): their name, memberships,
// completed workouts, weight readings and the details they saved from the fitness calculator.
// There is no account on a server and nothing is sent anywhere.
const storageKey = "galaxy-gym-log-v1";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const limits = {
  name: 60, note: 120, person: 40, minutes: [1, 600], weight: [20, 400], fat: [3, 60], muscle: [15, 60], paid: [0, 5000],
};
export const planMonths = [1, 3, 6, 12];
export const activityLevels = [1.2, 1.375, 1.55, 1.725];

const pad = (value) => String(value).padStart(2, "0");
// Calendar dates are the device's own local dates, written YYYY-MM-DD.
export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const today = () => dateKey(new Date());
export const monthKey = (year, month) => `${year}-${pad(month + 1)}`;
export const fromKey = (key) => { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); };
const dayNumber = (key) => Math.round(fromKey(key).getTime() / 86400000);
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
export const addDays = (key, days) => { const date = fromKey(key); date.setDate(date.getDate() + days); return dateKey(date); };

// A real calendar date, any year from 2010 to two years ahead.
export function validDay(value) {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && year >= 2010 && value <= addDays(today(), 730);
}
// A real date that is not in the future: for workouts and readings.
export const validDate = (value) => validDay(value) && value <= today();

// The last day of a membership that starts on `start` and runs for `months` months.
export function membershipEnd(start, months) {
  const [year, month, day] = start.split("-").map(Number);
  const lastOfTarget = new Date(year, month - 1 + months + 1, 0).getDate();
  const end = new Date(year, month - 1 + months, Math.min(day, lastOfTarget));
  end.setDate(end.getDate() - 1);
  return dateKey(end);
}

const text = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const within = (value, [low, high]) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const tenth = (value) => Math.round(value * 10) / 10;

function cleanBody(raw) {
  if (!raw || typeof raw !== "object") return null;
  const body = {
    date: raw.date, sex: raw.sex, age: raw.age, height: raw.height, weight: raw.weight, activity: raw.activity, goal: raw.goal,
  };
  if (!validDate(body.date) || !["m", "f"].includes(body.sex) || !Number.isInteger(body.age) || !within(body.age, [18, 100])
    || !within(body.height, [100, 250]) || !within(body.weight, [25, 350]) || !activityLevels.includes(body.activity)
    || !["lose", "keep", "gain"].includes(body.goal)) return null;
  body.height = tenth(body.height);
  body.weight = tenth(body.weight);
  if (within(raw.fat, limits.fat)) body.fat = tenth(raw.fat);
  // SMM as % of body weight; two decimals, so a reading entered in kg gives the same numbers here as in the calculator.
  if (within(raw.muscle, limits.muscle)) body.muscle = Math.round(raw.muscle * 100) / 100;
  return body;
}

// Accepts anything (stored data, an imported file) and keeps only well-formed entries.
export function sanitize(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sessions = new Map();
  const weights = new Map();
  const memberships = new Map();
  for (const entry of Array.isArray(source.sessions) ? source.sessions.slice(-3000) : []) {
    if (!entry || typeof entry !== "object") continue;
    const id = text(entry.id, 40);
    const name = text(entry.name, limits.name);
    if (!id || !name || !validDate(entry.date) || !Number.isInteger(entry.minutes) || !within(entry.minutes, limits.minutes)) continue;
    sessions.set(id, { id, date: entry.date, name, minutes: entry.minutes, note: text(entry.note, limits.note) });
  }
  // One weight per day: a later reading for the same date replaces the earlier one.
  for (const entry of Array.isArray(source.weights) ? source.weights.slice(-3000) : []) {
    if (!entry || typeof entry !== "object" || !validDate(entry.date) || !within(entry.kg, limits.weight)) continue;
    const reading = { date: entry.date, kg: tenth(entry.kg) };
    if (within(entry.fat, limits.fat)) reading.fat = tenth(entry.fat);
    weights.set(entry.date, reading);
  }
  for (const entry of Array.isArray(source.memberships) ? source.memberships.slice(-200) : []) {
    if (!entry || typeof entry !== "object") continue;
    const id = text(entry.id, 40);
    if (!id || !validDay(entry.start) || !validDay(entry.end) || entry.end < entry.start || daysBetween(entry.start, entry.end) > 1100) continue;
    const membership = { id, start: entry.start, end: entry.end, months: planMonths.includes(entry.months) ? entry.months : 0, note: text(entry.note, limits.note) };
    if (within(entry.paid, limits.paid)) membership.paid = Math.round(entry.paid * 100) / 100;
    memberships.set(id, membership);
  }
  const name = text(source.profile?.name, limits.person);
  return {
    profile: name ? { name } : {},
    memberships: [...memberships.values()].sort((a, b) => b.start.localeCompare(a.start) || b.id.localeCompare(a.id)),
    sessions: [...sessions.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    weights: [...weights.values()].sort((a, b) => a.date.localeCompare(b.date)),
    body: cleanBody(source.body),
  };
}

export function loadLog() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    return sanitize(null);
  }
}

const isEmpty = (log) => !log.sessions.length && !log.weights.length && !log.memberships.length && !log.body && !log.profile.name;

// Returns false when the browser refuses to store it (private mode, storage full).
export function saveLog(log) {
  try {
    if (isEmpty(log)) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...log }));
    return true;
  } catch {
    return false;
  }
}

// Every change goes through here: read what is stored now, change it, store it, and tell the page.
// Reading first means two parts of the page never overwrite each other's changes.
export function update(change) {
  const log = loadLog();
  change(log);
  const clean = sanitize(log);
  if (!saveLog(clean)) return null;
  document.dispatchEvent(new CustomEvent("galaxy:log-changed"));
  return clean;
}

export function clearLog() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    return false;
  }
  document.dispatchEvent(new CustomEvent("galaxy:log-changed"));
  return true;
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Adds or replaces the weight for one day. Returns false if it could not be stored.
export function recordWeight(date, kg, fat) {
  return update((log) => {
    const reading = { date, kg };
    if (typeof fat === "number") reading.fat = fat;
    log.weights.push(reading);
  }) !== null;
}

// Saves the details from the fitness calculator, and today's weight with them.
export function recordBody(body) {
  return update((log) => {
    log.body = { ...body, date: today() };
    const reading = { date: today(), kg: body.weight };
    if (typeof body.fat === "number") reading.fat = body.fat;
    log.weights.push(reading);
  }) !== null;
}

// What one calendar month added up to.
export function monthSummary(log, year, month) {
  const prefix = monthKey(year, month);
  const sessions = log.sessions.filter((entry) => entry.date.startsWith(prefix));
  const minutes = sessions.reduce((sum, entry) => sum + entry.minutes, 0);
  const days = new Map();
  for (const entry of sessions) days.set(entry.date, (days.get(entry.date) ?? 0) + 1);
  const weights = log.weights.filter((entry) => entry.date.startsWith(prefix));
  return {
    sessions, minutes, days,
    average: sessions.length ? minutes / sessions.length : 0,
    weightChange: weights.length > 1 ? tenth(weights.at(-1).kg - weights[0].kg) : null,
  };
}

// The membership that matters today: the one running now, else the next one booked, else the latest that ended.
export function currentMembership(log, day = today()) {
  const running = log.memberships.filter((entry) => entry.start <= day && entry.end >= day).sort((a, b) => b.end.localeCompare(a.end))[0];
  if (running) return running;
  const upcoming = log.memberships.filter((entry) => entry.start > day).sort((a, b) => a.start.localeCompare(b.start))[0];
  return upcoming ?? log.memberships.slice().sort((a, b) => b.end.localeCompare(a.end))[0] ?? null;
}

// Where a membership stands on a given day.
export function membershipState(entry, day = today()) {
  const length = daysBetween(entry.start, entry.end) + 1;
  if (day < entry.start) return { phase: "upcoming", days: daysBetween(day, entry.start), length, used: 0 };
  if (day > entry.end) return { phase: "ended", days: daysBetween(entry.end, day), length, used: 1 };
  const left = daysBetween(day, entry.end) + 1;
  return { phase: left <= 7 ? "ending" : "active", days: left, length, used: (length - left) / length };
}

// Workouts logged between two dates, both included.
export const sessionsBetween = (log, start, end) => log.sessions.filter((entry) => entry.date >= start && entry.date <= end);
