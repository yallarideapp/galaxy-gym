import {
  estimateOneRepMax, estimateBodyFat, bodyMassIndex, referenceWeightRange, restingEnergy,
  restingEnergyFromLeanMass, fatFreeMass, bodyFatLevel, muscleLevel, healthyFatWeightRange,
  calorieTarget, goalMacros, proteinPerKg, waterRange, estimatedMaxHeartRate, heartRateZones,
} from "./fitness-math.js";

const t = JSON.parse(document.getElementById("fitness-copy").textContent);
const root = document.querySelector("[data-calc]");
// Western digits in both languages: they match the plates, machines and scales on the gym floor.
const locale = document.documentElement.lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const loose = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-GB", { useGrouping: false, maximumFractionDigits: 2 });
// A numeric range always reads low to high, left to right, even inside Arabic text.
const span = (low, high, format) => `\u2066${format.format(low)}–${format.format(high)}\u2069`;

const inputs = new Map(Array.from(root.querySelectorAll("[data-input]"), (control) => {
  const field = control.closest("[data-field]");
  return [control.dataset.input, {
    control, field,
    slider: field.querySelector("[data-slider]"),
    error: field.querySelector("[data-error]"),
    min: Number(control.dataset.min), max: Number(control.dataset.max), step: Number(control.dataset.step),
    integer: control.hasAttribute("data-integer"),
  }];
}));
const outputs = new Map(Array.from(root.querySelectorAll("[data-out]"), (node) => [node.dataset.out, node]));
const cards = new Map(Array.from(root.querySelectorAll("[data-card]"), (node) => [node.dataset.card, {
  values: node.querySelector("[data-values]"), empty: node.querySelector("[data-empty]"),
}]));
const activity = root.querySelector("[data-activity]");
const marker = root.querySelector('[data-marker="bmi"]');
const shares = new Map(Array.from(root.querySelectorAll("[data-share]"), (node) => [node.dataset.share, node]));
const rows = new Map(Array.from(root.querySelectorAll("[data-row]"), (node) => [node.dataset.row, node]));
const blocks = new Map(Array.from(root.querySelectorAll("[data-block]"), (node) => [node.dataset.block, node]));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const levels = ["low", "ok", "over", "high"];

function parseNumber(value) {
  let digits = value.trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[٫,]/g, ".");
  if ((digits.match(/\./g) ?? []).length > 1) return NaN;
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(digits) ? Number(digits) : NaN;
}

// Reads one number box. Returns null (and shows why) when the value is missing or outside its limits.
function read(key, { optional = false } = {}) {
  const input = inputs.get(key);
  const raw = input.control.value.trim();
  let message = "";
  let value = null;
  if (!raw) {
    if (!optional) message = t.required;
  } else {
    value = parseNumber(raw);
    if (!Number.isFinite(value)) message = t.invalid;
    else if (input.integer && !Number.isInteger(value)) message = t.integer;
    else if (value < input.min || value > input.max) message = t.range.replace("{min}", plain.format(input.min)).replace("{max}", plain.format(input.max));
    if (message) value = null;
  }
  input.error.textContent = message;
  input.error.hidden = !message;
  if (message) input.control.setAttribute("aria-invalid", "true");
  else input.control.removeAttribute("aria-invalid");
  return value;
}

function paintSlider(slider) {
  const share = (slider.value - slider.min) / (slider.max - slider.min) * 100;
  slider.style.setProperty("--fill", `${share}%`);
}

function show(key, ready) {
  const card = cards.get(key);
  card.values.hidden = !ready;
  card.empty.hidden = ready;
}

// Headline numbers flash the logo's orange for a moment when they change, so the eye finds what moved.
function set(key, text) {
  const node = outputs.get(key);
  if (node.textContent === text) return;
  const first = node.textContent === "" || node.textContent === "—";
  node.textContent = text;
  if (!first && node.hasAttribute("data-tick") && !reducedMotion.matches && node.animate) {
    node.animate([{ color: "#ffc66e", transform: "translateY(-.06em)" }, {}], { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)" });
  }
}
function reveal(key, text) {
  const node = outputs.get(key);
  node.hidden = !text;
  node.textContent = text;
}
function invalidate(key, message) {
  const input = inputs.get(key);
  input.error.textContent = message;
  input.error.hidden = false;
  input.control.setAttribute("aria-invalid", "true");
}
const fill = (template, ...values) => template.replace(/\{(\d+)\}/g, (_, index) => values[index]);
const checked = (name) => root.querySelector(`input[name="${name}"]:checked`).value;

function update() {
  const sex = checked("sex");
  const goal = checked("goal");
  const age = read("age");
  const height = read("height");
  const weight = read("weight");

  // Optional reading from a body-composition scan. Body fat sharpens the calorie and protein numbers;
  // either reading adds context to the BMI.
  const fatReading = read("bodyfat", { optional: true });
  let muscleReading = read("muscle", { optional: true });
  if (fatReading !== null && muscleReading !== null && fatReading + muscleReading > 100) {
    invalidate("muscle", t.scanSum);
    muscleReading = null;
  }
  const lean = fatReading !== null && weight !== null ? fatFreeMass(weight, fatReading) : null;
  const fatLevel = fatReading !== null && age !== null ? bodyFatLevel(sex, age, fatReading) : null;
  const muscleBand = muscleReading !== null && age !== null ? muscleLevel(sex, age, muscleReading) : null;

  // Calories, then the macros built on them.
  const energyReady = age !== null && height !== null && weight !== null;
  show("energy", energyReady);
  show("macros", energyReady);
  if (!energyReady) {
    set("glance-target", "—");
    set("glance-protein", "—");
  }
  if (energyReady) {
    const resting = lean !== null ? restingEnergyFromLeanMass(lean) : restingEnergy(sex, weight, height, age);
    reveal("resting-basis", lean !== null ? fill(t.restingLean, loose.format(lean)) : "");
    const maintenance = resting * Number(activity.value);
    const target = calorieTarget(maintenance, goal, sex);
    set("target", whole.format(target.calories));
    set("glance-target", whole.format(target.calories));
    set("target-note", t.targetNotes[goal]);
    outputs.get("floor-note").hidden = !target.floored;
    set("maintenance", whole.format(maintenance));
    set("resting", whole.format(resting));

    // Above the healthy body-fat range, protein follows the weight this lean mass would have inside the range.
    const leanBased = lean !== null && fatLevel !== null && fatLevel >= 2;
    const proteinWeight = leanBased ? Math.min(weight, healthyFatWeightRange(sex, age, lean)[1]) : weight;
    const grams = goalMacros(target.calories, proteinWeight, goal);
    const energy = { protein: grams.protein * 4, carbs: grams.carbs * 4, fat: grams.fat * 9 };
    const total = energy.protein + energy.carbs + energy.fat;
    set("glance-protein", whole.format(grams.protein));
    for (const [name, node] of shares) node.style.flexGrow = String(Math.max(energy[name] / total, 0.0001));
    for (const name of ["protein", "carbs", "fat"]) {
      set(name, `${whole.format(grams[name])} ${t.grams}`);
      set(`${name}-share`, `${whole.format(energy[name] / total * 100)}%`);
    }
    set("protein-rule", `${t.protein}: ${leanBased
      ? fill(t.proteinRuleLean, plain.format(proteinPerKg[goal]), loose.format(proteinWeight))
      : fill(t.proteinRule, plain.format(proteinPerKg[goal]))}`);
  }

  show("water", weight !== null);
  if (weight !== null) {
    const [low, high] = waterRange(weight);
    set("water", span(low, high, decimal));
    set("water-cups", fill(t.waterCups, whole.format(low * 4), whole.format(high * 4)));
  }

  const bmiReady = height !== null && weight !== null;
  show("bmi", bmiReady);
  if (!bmiReady) set("glance-bmi", "—");
  if (bmiReady) {
    const index = bodyMassIndex(weight, height);
    const [under, standard, above, high] = t.bmiBands;
    set("bmi", decimal.format(index));
    set("glance-bmi", decimal.format(index));
    set("bmi-band", age !== null && age < 20 ? t.bmiAdult : index < 18.5 ? under : index < 25 ? standard : index < 30 ? above : high);
    outputs.get("bmi-band").dataset.level = age !== null && age < 20 ? "" : index < 18.5 ? "low" : index < 25 ? "ok" : index < 30 ? "over" : "high";
    marker.style.left = `${Math.min(Math.max((index - 15) / 20, 0), 1) * 100}%`;
    const [low, top] = referenceWeightRange(height);
    set("bmi-range", `${span(low, top, loose)} ${t.kg}`);

    // With a reading, say what the BMI can't: whether the weight is muscle or fat.
    const over = index >= 25;
    const verdict = fatLevel !== null
      ? [t.fatVerdicts.low, over ? t.fatVerdicts.okOver : t.fatVerdicts.ok, t.fatVerdicts.high, t.fatVerdicts.veryHigh][fatLevel]
      : muscleBand !== null ? t.muscleVerdicts[over ? "over" : "within"][muscleBand] : "";
    reveal("bmi-verdict", verdict);
    outputs.get("bmi-note").hidden = Boolean(verdict);
    const fitted = lean !== null && fatLevel !== null && fatLevel >= 2;
    rows.get("fit-range").hidden = !fitted;
    if (fitted) {
      const [fitLow, fitTop] = healthyFatWeightRange(sex, age, lean);
      set("fit-range", `${span(fitLow, fitTop, loose)} ${t.kg}`);
    }
  }

  // Tape-measure body fat: the waist box changes meaning with sex, and women add a hip measurement.
  const female = sex === "f";
  const waistField = inputs.get("waist").field;
  waistField.querySelector("[data-label]").textContent = female ? t.waistFemale : t.waistMale;
  waistField.querySelector("[data-hint]").textContent = female ? t.waistFemaleHint : t.waistMaleHint;
  const hip = inputs.get("hip");
  hip.field.hidden = !female;
  hip.control.disabled = !female;
  const neck = read("neck", { optional: true });
  const waist = read("waist", { optional: true });
  const hips = female ? read("hip", { optional: true }) : 0;
  const measured = height !== null && neck !== null && waist !== null && hips !== null;
  const tapePercent = measured ? estimateBodyFat(sex, height, waist, neck, hips) : null;
  outputs.get("fat-invalid").hidden = !measured || tapePercent !== null;
  // The scan reading wins; the tape estimate stands in when there is none.
  const fatPercent = fatReading ?? tapePercent;
  show("fat", fatPercent !== null || muscleReading !== null);
  blocks.get("fat").hidden = fatPercent === null;
  if (fatPercent !== null) {
    set("fat-percent", decimal.format(fatPercent));
    set("fat-source", fatReading !== null ? t.fatFromReading : t.fatFromTape);
    const level = age !== null ? bodyFatLevel(sex, age, fatPercent) : null;
    reveal("fat-band", level === null ? "" : t.fatBands[level]);
    outputs.get("fat-band").dataset.level = level === null ? "" : levels[level];
    set("fat-mass", weight === null ? "—" : `${loose.format(weight * fatPercent / 100)} ${t.kg}`);
    set("lean-mass", weight === null ? "—" : `${loose.format(weight * (1 - fatPercent / 100))} ${t.kg}`);
    const both = fatReading !== null && tapePercent !== null;
    rows.get("tape-percent").hidden = !both;
    if (both) set("tape-percent", `${decimal.format(tapePercent)}%`);
  }
  blocks.get("muscle").hidden = muscleReading === null;
  if (muscleReading !== null) {
    reveal("muscle-band", muscleBand === null ? "" : t.muscleBands[muscleBand]);
    outputs.get("muscle-band").dataset.level = muscleBand === null ? "" : ["over", "ok", "ok", "ok"][muscleBand];
    set("muscle-percent", `${loose.format(muscleReading)}%`);
    set("muscle-mass", weight === null ? "—" : `${loose.format(weight * muscleReading / 100)} ${t.kg}`);
  }

  show("heart", age !== null);
  if (age !== null) {
    set("max-heart", whole.format(estimatedMaxHeartRate(age)));
    heartRateZones(age).forEach(([low, high], index) => set(`zone-${index}`, span(low, high, whole)));
  }

  const lifted = read("lift", { optional: true });
  const reps = read("reps", { optional: true });
  const liftReady = lifted !== null && reps !== null;
  show("lift", liftReady);
  if (liftReady) {
    const maximum = estimateOneRepMax(lifted, reps);
    set("one-rep", loose.format(maximum));
    for (const part of [90, 80, 70, 60]) set(`lift-${part}`, `${loose.format(maximum * part / 100)} ${t.kg}`);
  }
}

for (const input of inputs.values()) {
  const { control, slider } = input;
  control.addEventListener("input", () => {
    if (slider) {
      const value = parseNumber(control.value);
      if (Number.isFinite(value)) {
        slider.value = String(value);
        paintSlider(slider);
      }
    }
    update();
  });
  // Arrow keys nudge the value by one step, like a native number box.
  control.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const value = parseNumber(control.value);
    if (!Number.isFinite(value)) return;
    event.preventDefault();
    const next = Math.min(input.max, Math.max(input.min, value + (event.key === "ArrowUp" ? input.step : -input.step)));
    control.value = plain.format(next);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (slider) {
    slider.addEventListener("input", () => {
      control.value = plain.format(Number(slider.value));
      paintSlider(slider);
      update();
    });
    paintSlider(slider);
  }
}
root.addEventListener("change", (event) => {
  if (event.target.matches('input[type="radio"], select')) update();
});
root.querySelector("form").addEventListener("submit", (event) => event.preventDefault());
update();
