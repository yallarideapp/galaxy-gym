// The member's own training log: completed workouts and body-weight readings.
// Everything stays in this browser (localStorage). There is no account and nothing is sent anywhere.
const storageKey = "galaxy-gym-log-v1";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const limits = { name: 60, note: 120, minutes: [1, 600], weight: [20, 400], fat: [3, 60] };

const pad = (value) => String(value).padStart(2, "0");
// Calendar dates are the device's own local dates, written YYYY-MM-DD.
export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const today = () => dateKey(new Date());
export const monthKey = (year, month) => `${year}-${pad(month + 1)}`;

export function validDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && value <= today();
}

const text = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const within = (value, [low, high]) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;

// Accepts anything (stored data, an imported file) and keeps only well-formed entries.
export function sanitize(raw) {
  const sessions = new Map();
  const weights = new Map();
  if (raw && typeof raw === "object") {
    for (const entry of Array.isArray(raw.sessions) ? raw.sessions.slice(-3000) : []) {
      if (!entry || typeof entry !== "object") continue;
      const id = text(entry.id, 40);
      const name = text(entry.name, limits.name);
      if (!id || !name || !validDate(entry.date) || !Number.isInteger(entry.minutes) || !within(entry.minutes, limits.minutes)) continue;
      sessions.set(id, { id, date: entry.date, name, minutes: entry.minutes, note: text(entry.note, limits.note) });
    }
    // One weight per day: a later reading for the same date replaces the earlier one.
    for (const entry of Array.isArray(raw.weights) ? raw.weights.slice(-3000) : []) {
      if (!entry || typeof entry !== "object" || !validDate(entry.date) || !within(entry.kg, limits.weight)) continue;
      const reading = { date: entry.date, kg: Math.round(entry.kg * 10) / 10 };
      if (within(entry.fat, limits.fat)) reading.fat = Math.round(entry.fat * 10) / 10;
      weights.set(entry.date, reading);
    }
  }
  return {
    sessions: [...sessions.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    weights: [...weights.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function loadLog() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    return sanitize(null);
  }
}

// Returns false when the browser refuses to store it (private mode, storage full).
export function saveLog(log) {
  try {
    if (log.sessions.length || log.weights.length) localStorage.setItem(storageKey, JSON.stringify({ version: 1, sessions: log.sessions, weights: log.weights }));
    else localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Adds or replaces the weight for one day and stores it. Returns false if it could not be stored.
export function recordWeight(date, kg, fat) {
  const log = loadLog();
  const reading = { date, kg };
  if (typeof fat === "number") reading.fat = fat;
  return saveLog(sanitize({ sessions: log.sessions, weights: [...log.weights, reading] }));
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
    weightChange: weights.length > 1 ? Math.round((weights.at(-1).kg - weights[0].kg) * 10) / 10 : null,
  };
}
