// The formulas behind the calculator. Metric units throughout: kg, cm, years, kcal.

// Epley equation, for a set of 2–12 repetitions.
export function estimateOneRepMax(weight, repetitions) {
  return repetitions === 1 ? weight : weight * (1 + repetitions / 30);
}

// U.S. Navy circumference method. Returns null when the measurements cannot produce a result.
export function estimateBodyFat(sex, height, waist, neck, hip) {
  const sum = waist + (sex === "f" ? hip : 0) - neck;
  if (height <= 0 || waist <= neck || sum <= 0) return null;

  const circumferenceLog = Math.log10(sum / 2.54);
  const heightLog = Math.log10(height / 2.54);
  const percent = sex === "m"
    ? 86.010 * circumferenceLog - 70.041 * heightLog + 36.76
    : 163.205 * circumferenceLog - 97.684 * heightLog - 78.387;
  return percent > 0 && percent < 100 ? percent : null;
}

export function bodyMassIndex(weight, height) {
  return weight / (height / 100) ** 2;
}

// The adult reference range (BMI 18.5–24.9) expressed as body weight for a given height.
export function referenceWeightRange(height) {
  const metresSquared = (height / 100) ** 2;
  return [18.5 * metresSquared, 24.9 * metresSquared];
}

// Mifflin–St Jeor equation.
export function restingEnergy(sex, weight, height, age) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === "m" ? 5 : -161);
}

// Cunningham equation (1991): resting energy from fat-free mass, for when a body-fat reading is known.
export function restingEnergyFromLeanMass(leanMass) {
  return 370 + 21.6 * leanMass;
}

export function fatFreeMass(weight, fatPercent) {
  return weight * (1 - fatPercent / 100);
}

// Reference bands by sex and age group (18–39, 40–59, 60 and over).
// Each row: [low below, healthy below, high below]; anything above is very high.
// Body fat: Gallagher et al., Am J Clin Nutr 2000. Skeletal muscle: Omron Healthcare tables.
const fatBands = { m: [[8, 20, 25], [11, 22, 28], [13, 25, 30]], f: [[21, 33, 39], [23, 34, 40], [24, 36, 42]] };
const muscleBands = { m: [[33.3, 39.4, 44.1], [33.1, 39.2, 43.9], [32.9, 39, 43.7]], f: [[24.3, 30.4, 35.4], [24.1, 30.2, 35.2], [23.9, 30, 35]] };
const ageGroup = (age) => (age < 40 ? 0 : age < 60 ? 1 : 2);
const levelOf = (value, [low, healthy, high]) => (value < low ? 0 : value < healthy ? 1 : value < high ? 2 : 3);

// 0 below the healthy range, 1 inside it, 2 above it, 3 well above it.
export function bodyFatLevel(sex, age, percent) {
  return levelOf(percent, fatBands[sex][ageGroup(age)]);
}

// 0 low, 1 normal, 2 high, 3 very high.
export function muscleLevel(sex, age, percent) {
  return levelOf(percent, muscleBands[sex][ageGroup(age)]);
}

// The body weights at which this fat-free mass would sit at the bottom and the top of the healthy body-fat range.
export function healthyFatWeightRange(sex, age, leanMass) {
  const [low, healthy] = fatBands[sex][ageGroup(age)];
  return [leanMass / (1 - low / 100), leanMass / (1 - healthy / 100)];
}

// A starting calorie target for the goal. Fat loss never drops below a minimum intake.
export function calorieTarget(maintenance, goal, sex) {
  if (goal === "gain") return { calories: maintenance + 300, floored: false };
  if (goal !== "lose") return { calories: maintenance, floored: false };
  const minimum = sex === "m" ? 1500 : 1200;
  const calories = Math.max(maintenance - 500, minimum);
  return { calories: Math.min(calories, maintenance), floored: maintenance - 500 < minimum };
}

export const proteinPerKg = { lose: 2, keep: 1.6, gain: 1.8 };

// Protein from body weight (or the reference weight passed in its place), fat as a quarter of calories,
// carbohydrate as the remainder.
export function goalMacros(calories, weight, goal) {
  const protein = weight * (proteinPerKg[goal] ?? proteinPerKg.keep);
  const fat = calories * 0.25 / 9;
  const carbs = Math.max((calories - protein * 4 - fat * 9) / 4, 0);
  return { protein, carbs, fat };
}

export function macroGrams(calories, protein, fat) {
  if (protein + fat > 100) return null;
  return {
    protein: calories * protein / 400,
    carbs: calories * (100 - protein - fat) / 400,
    fat: calories * fat / 900,
  };
}

// Rule of thumb: 30–35 ml per kg of body weight a day, in litres.
export function waterRange(weight) {
  return [weight * 0.03, weight * 0.035];
}

// Tanaka equation.
export function estimatedMaxHeartRate(age) {
  return 208 - 0.7 * age;
}

export function heartRateZones(age) {
  const maximum = estimatedMaxHeartRate(age);
  return [0.5, 0.6, 0.7, 0.8, 0.9].map((lower) => [maximum * lower, maximum * (lower + 0.1)]);
}

// Barbell plates: the fewest plates per side that reach the target, or the heaviest load below it.
// Works in whole steps of 1.25 kg (plates are 1.25 kg or multiples of it). Returns null if the bar is heavier than the target.
export function loadBar(target, bar, sizes) {
  const step = 125;
  const targetCents = Math.round(target * 100);
  const barCents = Math.round(bar * 100);
  if (targetCents < barCents) return null;
  const options = sizes.map((size) => ({ size, units: Math.round(size * 100 / step) })).filter((option) => option.units > 0);
  const maxUnits = Math.floor((targetCents - barCents) / (2 * step));
  const best = Array(maxUnits + 1).fill(null);
  best[0] = { count: 0, option: null };
  for (let units = 1; units <= maxUnits; units += 1) {
    for (const option of options) {
      const previous = units >= option.units ? best[units - option.units] : null;
      if (previous && (!best[units] || previous.count + 1 < best[units].count)) best[units] = { count: previous.count + 1, option };
    }
  }
  const totalUnits = best.findLastIndex(Boolean);
  const counts = new Map();
  for (let units = totalUnits; units > 0;) {
    const option = best[units].option;
    counts.set(option.size, (counts.get(option.size) ?? 0) + 1);
    units -= option.units;
  }
  const perSide = totalUnits * step / 100;
  return { total: bar + 2 * perSide, perSide, exact: barCents + 2 * totalUnits * step === targetCents, counts };
}
