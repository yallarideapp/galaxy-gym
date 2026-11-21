const strings = JSON.parse(document.querySelector('#workout-copy').textContent);
// Western digits in both languages, to match the numbers printed on the plates.
const locale = document.documentElement.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB';
const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const storageKey = 'galaxy-gym-workout-v1';
const interpolate = (template, ...values) => template.replace(/\{(\d+)\}/g, (_, index) => values[index]);

const planForm = document.querySelector('#add-exercise');
const exercise = document.querySelector('#exercise');
const sets = document.querySelector('#sets');
const reps = document.querySelector('#reps');
const addButton = planForm.querySelector('button');
const list = document.querySelector('#workout-list');
const rowTemplate = document.querySelector('#exercise-row');
const empty = document.querySelector('#empty-workout');
const totals = document.querySelector('#plan-totals');
const status = document.querySelector('#plan-status');
const resetButton = document.querySelector('#reset-workout');
const logPlanButton = document.querySelector('#log-plan');
const exerciseNames = new Map([...exercise.options].filter((option) => option.value).map((option) => [option.value, option.textContent]));
const maxSets = Number(sets.max);
const maxReps = Number(reps.max);

function validCount(value, max) {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

function readPlan(source) {
  let data;
  try {
    data = JSON.parse(source);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const valid = new Map();
  for (const entry of data) {
    if (!entry || !exerciseNames.has(entry.id) || !validCount(entry.sets, maxSets) || !validCount(entry.reps, maxReps)) continue;
    valid.set(entry.id, { id: entry.id, sets: entry.sets, reps: entry.reps });
  }
  return [...valid.values()];
}

let plan = [];
try {
  plan = readPlan(localStorage.getItem(storageKey));
} catch {
  status.textContent = strings.noStorage;
}

function savePlan(message) {
  try {
    if (plan.length) localStorage.setItem(storageKey, JSON.stringify(plan));
    else localStorage.removeItem(storageKey);
    status.textContent = message;
  } catch {
    status.textContent = strings.noStorage;
  }
}

function renderTotals() {
  empty.hidden = plan.length > 0;
  totals.textContent = interpolate(strings.totals, number.format(plan.length), number.format(plan.reduce((sum, item) => sum + item.sets, 0)));
  resetButton.disabled = !plan.length;
  logPlanButton.disabled = !plan.length;
}

function renderPlan() {
  const chosen = new Set(plan.map((entry) => entry.id));
  for (const option of exercise.options) {
    if (option.value) option.disabled = chosen.has(option.value);
  }
  if (chosen.has(exercise.value)) exercise.value = '';
  addButton.disabled = chosen.size === exerciseNames.size;
  list.replaceChildren();

  for (const entry of plan) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const name = exerciseNames.get(entry.id);
    row.querySelector('[data-exercise-name]').textContent = name;

    for (const input of row.querySelectorAll('[data-count]')) {
      const field = input.dataset.count;
      const max = Number(input.max);
      input.value = entry[field];
      input.setAttribute('aria-label', interpolate(strings.rowControl, input.closest('label').textContent.trim(), name));
      input.addEventListener('change', () => {
        const value = input.valueAsNumber;
        if (!validCount(value, max)) {
          input.value = entry[field];
          status.textContent = interpolate(strings.invalidCount, number.format(1), number.format(max));
          return;
        }
        entry[field] = value;
        renderTotals();
        savePlan(strings.saved);
      });
    }

    const remove = row.querySelector('.workout-remove');
    remove.setAttribute('aria-label', interpolate(strings.rowControl, remove.textContent, name));
    remove.addEventListener('click', () => {
      plan = plan.filter((item) => item.id !== entry.id);
      renderPlan();
      savePlan(strings.removed);
      exercise.focus();
    });
    list.append(row);
  }

  renderTotals();
}

planForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const id = exercise.value;
  if (!exerciseNames.has(id) || plan.some((entry) => entry.id === id)) return;
  if (!validCount(sets.valueAsNumber, maxSets) || !validCount(reps.valueAsNumber, maxReps)) return;
  plan.push({ id, sets: sets.valueAsNumber, reps: reps.valueAsNumber });
  renderPlan();
  savePlan(strings.saved);
  exercise.focus();
});

// Hands the finished plan to the log (workout-log.js), which fills in its form for the member to confirm.
logPlanButton.addEventListener('click', () => {
  if (!plan.length) return;
  document.dispatchEvent(new CustomEvent('galaxy:log-plan', {
    detail: { names: plan.map((entry) => exerciseNames.get(entry.id)), sets: plan.reduce((sum, entry) => sum + entry.sets, 0) },
  }));
});

resetButton.addEventListener('click', () => {
  if (!window.confirm(strings.confirmReset)) return;
  plan = [];
  renderPlan();
  savePlan(strings.resetDone);
  exercise.focus();
});

window.addEventListener('storage', (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  try {
    if (event.storageArea !== localStorage) return;
    plan = readPlan(localStorage.getItem(storageKey));
  } catch {
    status.textContent = strings.noStorage;
    return;
  }
  renderPlan();
});

renderPlan();

const platesForm = document.querySelector('#plates-form');
const plateTarget = document.querySelector('#plate-target');
const barWeight = document.querySelector('#bar-weight');
const plateOutput = document.querySelector('#plates-result');
const plateTotal = document.querySelector('#plates-total');
const plateSide = document.querySelector('#plate-side');
const plateBreakdown = document.querySelector('#plate-breakdown');
const plateStack = document.querySelector('#plate-stack');
const centsPerUnit = 125;

// Use integer multiples of 1.25 kg. Minimize the plate count at the largest
// attainable weight that keeps the total within the requested load.
function findPlates(maxUnits, sizes) {
  const options = sizes.map((size) => ({ size, units: Math.round(size * 100 / centsPerUnit) }));
  const best = Array(maxUnits + 1).fill(null);
  best[0] = { count: 0, option: null };

  for (let units = 1; units <= maxUnits; units += 1) {
    for (const option of options) {
      const previous = best[units - option.units];
      if (previous && (!best[units] || previous.count + 1 < best[units].count)) {
        best[units] = { count: previous.count + 1, option };
      }
    }
  }

  const totalUnits = best.findLastIndex(Boolean);
  const counts = new Map();
  for (let units = totalUnits; units > 0;) {
    const option = best[units].option;
    counts.set(option.size, (counts.get(option.size) ?? 0) + 1);
    units -= option.units;
  }

  return { cents: totalUnits * centsPerUnit, counts };
}

platesForm.addEventListener('input', () => {
  plateTarget.setCustomValidity('');
  plateOutput.hidden = true;
});

platesForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const barCents = Math.round(barWeight.valueAsNumber * 100);
  const targetCents = Math.round(plateTarget.valueAsNumber * 100);
  if (targetCents < barCents) {
    plateTarget.setCustomValidity(strings.targetLowerThanBar);
    plateTarget.reportValidity();
    return;
  }

  const sizes = [...platesForm.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
  const result = findPlates(Math.floor((targetCents - barCents) / (2 * centsPerUnit)), sizes);
  const total = barCents + 2 * result.cents;
  const totalLabel = total === targetCents ? strings.plateExact : strings.plateApproximate;
  plateTotal.textContent = interpolate(totalLabel, number.format(total / 100));
  plateSide.textContent = result.cents ? interpolate(strings.perSide, number.format(result.cents / 100)) : strings.emptyBar;
  const used = sizes.filter((size) => result.counts.has(size)).sort((first, second) => second - first);
  plateBreakdown.textContent = used.map((size) => `${number.format(result.counts.get(size))} × ${number.format(size)}`).join(' + ');
  // One side of the bar, heaviest plate nearest the collar.
  plateStack.replaceChildren(...used.flatMap((size) => Array.from({ length: result.counts.get(size) }, () => {
    const plate = document.createElement('i');
    plate.textContent = number.format(size);
    plate.style.setProperty('--size', String(size));
    return plate;
  })));
  plateStack.hidden = used.length === 0;
  plateOutput.hidden = false;
});
