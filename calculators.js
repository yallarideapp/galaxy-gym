import {
  estimateOneRepMax, estimateBodyFat, bodyMassIndex, referenceWeightRange, scanComposition, bodyFatLevel, muscleLevel, muscleReadingKind,
  healthyFatWeightRange, dailyFuel, proteinPerKg, proteinPerLeanKg, dailyWater, loadBar, estimatedMaxHeartRate, heartRateZones,
} from "./fitness-math.js";
import { loadLog, recordBody } from "./training-log.js";

const t = JSON.parse(document.getElementById("fitness-copy").textContent);
const root = document.querySelector("[data-calc]");
// Western digits in both languages: they match the plates, machines and scales on the gym floor.
const locale = document.documentElement.lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const loose = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const kilos = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
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
const plateBoxes = Array.from(root.querySelectorAll("[data-plate]"));
const plateStack = root.querySelector("[data-plate-stack]");
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

// Galaxy is a men's gym: every formula uses the men's version.
const sex = "m";

function update() {
  const goal = checked("goal");
  const age = read("age");
  const height = read("height");
  const weight = read("weight");

  // Optional reading from a body-composition scan, body fat % or muscle % (same rules as the Hydrogen calculator).
  // Either one gives the fat-free mass, and the calories, protein and water then follow it.
  const fatReading = read("bodyfat", { optional: true });
  let muscleReading = read("muscle", { optional: true });
  if (fatReading !== null && muscleReading !== null && fatReading + muscleReading > 100) {
    invalidate("muscle", t.scanSum);
    muscleReading = null;
  }
  const scan = weight !== null ? scanComposition(sex, weight, { fat: fatReading, muscle: muscleReading }) : null;
  const lean = scan ? scan.lean : null;
  // A body fat reading, or a muscle-mass reading (close to it), is judged on body fat; skeletal muscle on its own bands,
  // and only a body-fat-based reading gives "a good weight for you" (a skeletal-muscle estimate is too rough for that).
  const rough = scan !== null && scan.source.startsWith("skeletal");
  const byFat = scan !== null && !rough;
  const fatLevel = byFat && age !== null ? bodyFatLevel(sex, age, scan.fatPercent) : null;
  const muscleKind = muscleReading !== null ? muscleReadingKind(muscleReading) : null;
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
    const fuel = dailyFuel({ sex, age, height, weight, activity: Number(activity.value), goal, lean });
    const { resting, maintenance, target } = fuel;
    reveal("resting-basis", lean !== null ? `${fill(t.restingLean, loose.format(lean))}${rough ? ` ${t.restingRough}` : ""}` : "");
    set("target", whole.format(target.calories));
    set("glance-target", whole.format(target.calories));
    set("target-note", t.targetNotes[goal]);
    outputs.get("floor-note").hidden = !target.floored;
    set("maintenance", whole.format(maintenance));
    set("resting", whole.format(resting));

    const grams = { protein: fuel.protein, carbs: fuel.carbs, fat: fuel.fat };
    const energy = { protein: grams.protein * 4, carbs: grams.carbs * 4, fat: grams.fat * 9 };
    const total = energy.protein + energy.carbs + energy.fat;
    set("glance-protein", whole.format(grams.protein));
    for (const [name, node] of shares) node.style.flexGrow = String(Math.max(energy[name] / total, 0.0001));
    for (const name of ["protein", "carbs", "fat"]) {
      set(name, `${whole.format(grams[name])} ${t.grams}`);
      set(`${name}-share`, `${whole.format(energy[name] / total * 100)}%`);
    }
    set("protein-rule", `${t.protein}: ${lean !== null
      ? fill(t.proteinRuleLean, plain.format(proteinPerLeanKg[goal]), loose.format(lean))
      : fill(t.proteinRule, plain.format(proteinPerKg[goal]))}`);
  }

  // Water: body weight (or fat-free mass, with a reading) plus the training time.
  const training = read("training", { optional: true }) ?? 0;
  show("water", weight !== null);
  if (weight !== null) {
    const litres = dailyWater(weight, training, lean);
    const cups = Math.round(litres * 4);
    set("water", decimal.format(litres));
    set("water-cups", fill(t.waterCups[cups > 10 ? 1 : 0], whole.format(cups)));
    reveal("water-basis", lean !== null ? fill(t.waterLean, loose.format(lean)) : "");
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
    const fitted = fatLevel !== null && fatLevel >= 2;
    rows.get("fit-range").hidden = !fitted;
    if (fitted) {
      const [fitLow, fitTop] = healthyFatWeightRange(sex, age, lean);
      set("fit-range", `${span(fitLow, fitTop, loose)} ${t.kg}`);
    }
  }

  // Tape-measure body fat (the men's method: neck and abdomen).
  const neck = read("neck", { optional: true });
  const waist = read("waist", { optional: true });
  const measured = height !== null && neck !== null && waist !== null;
  const tapePercent = measured ? estimateBodyFat(sex, height, waist, neck, 0) : null;
  outputs.get("fat-invalid").hidden = !measured || tapePercent !== null;
  // A body fat or muscle-mass reading wins; then the tape estimate; a skeletal-muscle reading gives a rough figure last.
  const fatSource = byFat ? scan.source : tapePercent !== null ? "tape" : scan ? "skeletal" : null;
  const fatPercent = fatSource === "tape" ? tapePercent : fatSource ? scan.fatPercent : null;
  show("fat", fatPercent !== null || muscleReading !== null);
  blocks.get("fat").hidden = fatPercent === null;
  if (fatPercent !== null) {
    set("fat-percent", decimal.format(fatPercent));
    set("fat-source", t.fatSources[fatSource]);
    const level = age !== null ? bodyFatLevel(sex, age, fatPercent) : null;
    reveal("fat-band", level === null ? "" : t.fatBands[level]);
    outputs.get("fat-band").dataset.level = level === null ? "" : levels[level];
    set("fat-mass", weight === null ? "—" : `${loose.format(weight * fatPercent / 100)} ${t.kg}`);
    set("lean-mass", weight === null ? "—" : `${loose.format(weight * (1 - fatPercent / 100))} ${t.kg}`);
    const both = fatSource !== "tape" && tapePercent !== null;
    rows.get("tape-percent").hidden = !both;
    if (both) set("tape-percent", `${decimal.format(tapePercent)}%`);
  }
  blocks.get("muscle").hidden = muscleReading === null;
  if (muscleReading !== null) {
    reveal("muscle-band", muscleBand === null ? "" : t.muscleBands[muscleBand]);
    outputs.get("muscle-band").dataset.level = muscleBand === null ? "" : ["over", "ok", "ok", "ok"][muscleBand];
    reveal("muscle-kind", t.muscleKinds[muscleKind]);
    set("muscle-percent", `${loose.format(muscleReading)}%`);
    set("muscle-mass", weight === null ? "—" : `${loose.format(weight * muscleReading / 100)} ${t.kg}`);
  }

  show("heart", age !== null);
  if (age !== null) {
    set("max-heart", whole.format(estimatedMaxHeartRate(age)));
    heartRateZones(age).forEach(([low, high], index) => set(`zone-${index}`, span(low, high, whole)));
  }

  // Barbell plates: one side of the bar, heaviest plate nearest the collar.
  const plateTarget = read("plate", { optional: true });
  const bar = read("bar");
  const sizes = plateBoxes.filter((box) => box.checked).map((box) => Number(box.value));
  const loaded = plateTarget !== null && bar !== null ? loadBar(plateTarget, bar, sizes) : null;
  outputs.get("plates-low").hidden = !(plateTarget !== null && bar !== null && !loaded);
  show("plates", loaded !== null);
  if (loaded) {
    set("plates-total", kilos.format(loaded.total));
    set("plates-match", loaded.exact ? t.plateExact : t.plateApproximate);
    outputs.get("plates-match").dataset.level = loaded.exact ? "ok" : "over";
    set("plates-side", loaded.perSide ? fill(t.perSide, kilos.format(loaded.perSide)) : t.emptyBar);
    const used = sizes.filter((size) => loaded.counts.has(size)).sort((a, b) => b - a);
    set("plates-breakdown", used.map((size) => `${whole.format(loaded.counts.get(size))} × ${kilos.format(size)}`).join(" + "));
    plateStack.replaceChildren(...used.flatMap((size) => Array.from({ length: loaded.counts.get(size) }, () => {
      const plate = document.createElement("i");
      plate.textContent = kilos.format(size);
      plate.style.setProperty("--size", String(size));
      return plate;
    })));
    plateStack.hidden = used.length === 0;
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
  if (event.target.matches('input[type="radio"], input[type="checkbox"], select')) update();
});
root.querySelector("form").addEventListener("submit", (event) => event.preventDefault());

// "Save my details to my account": only this button stores anything from the calculator.
const saveStatus = root.querySelector("[data-save-status]");
root.querySelector("[data-save-weight]").addEventListener("click", () => {
  const details = { sex, age: read("age"), height: read("height"), weight: read("weight"), activity: Number(activity.value), goal: checked("goal") };
  const missing = ["age", "height", "weight"].find((key) => details[key] === null);
  if (missing) {
    inputs.get(missing).control.focus();
    return;
  }
  const fat = read("bodyfat", { optional: true });
  const muscle = read("muscle", { optional: true });
  if (fat !== null) details.fat = fat;
  if (muscle !== null) details.muscle = muscle;
  const saved = recordBody(details);
  saveStatus.hidden = false;
  saveStatus.querySelector("span").textContent = saved ? t.weightSaved : t.saveFailed;
  saveStatus.querySelector("a").hidden = !saved;
});

// Details saved in the account fill the form in, with the latest weight the member has logged since.
function fillSaved() {
  const { body, weights } = loadLog();
  if (!body) return;
  const latest = weights.at(-1);
  const values = { age: body.age, height: body.height, weight: latest && latest.date >= body.date ? latest.kg : body.weight, bodyfat: body.fat, muscle: body.muscle };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "number") continue;
    const { control, slider } = inputs.get(key);
    control.value = plain.format(value);
    if (slider) {
      slider.value = String(value);
      paintSlider(slider);
    }
  }
  root.querySelector(`input[name="goal"][value="${body.goal}"]`).checked = true;
  activity.value = String(body.activity);
  root.querySelector("[data-saved-note]").hidden = false;
}
fillSaved();
update();
