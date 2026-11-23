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

// Katch–McArdle equation (370 + 21.6 × fat-free mass, from Cunningham 1991): resting energy when a body-scan
// reading gives the fat-free mass.
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

// A body-scan reading turned into body fat % and fat-free mass, read the same way as the Hydrogen calculator.
// Body fat % is the direct reading and wins when both are given. Muscle % comes in two kinds: Omron-type scales give
// skeletal muscle (about 25–45%; they show 50% at most), while Tanita, Xiaomi, Renpho and similar give "muscle mass",
// all lean tissue except bone (about 60–85%). So a muscle reading above 50% is muscle mass, and with bone (about 5% of
// lean mass) it is the fat-free mass. Skeletal muscle is looser: a straight line that puts Omron's "normal" muscle at
// an average build, so the result is rough.
// Returns null without a usable reading; source is "fat", "muscleMass" or "skeletal".
export function scanComposition(sex, weight, { fat = null, muscle = null } = {}) {
  let fatPercent;
  let source;
  if (fat !== null) [fatPercent, source] = [fat, "fat"];
  else if (muscle !== null && muscle > 50) [fatPercent, source] = [100 - muscle / 0.95, "muscleMass"];
  else if (muscle !== null) {
    const leanShare = sex === "m" ? (muscle + 19) / 0.72 : (muscle + 5.5) / 0.47;
    [fatPercent, source] = [100 - Math.min(Math.max(leanShare, 45), 96), "skeletal"];
  } else return null;
  if (!(fatPercent > 0 && fatPercent < 100)) return null;
  return { fatPercent, lean: fatFreeMass(weight, fatPercent), source };
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

// Protein per kg of body weight, or per kg of fat-free mass when a scan reading gives it (for an average build the two
// land close together). Same figures as the Hydrogen calculator.
export const proteinPerKg = { lose: 1.8, keep: 1.6, gain: 1.8 };
export const proteinPerLeanKg = { lose: 2.4, keep: 2.1, gain: 2.4 };

// The day's fuel: resting and maintenance calories, the target for the goal, and the macros on it (protein as above,
// fat 27% of calories, carbohydrate the rest). With fat-free mass the resting calories come from it (Katch–McArdle),
// otherwise from weight, height and age (Mifflin–St Jeor).
export function dailyFuel({ sex, age, height, weight, activity, goal, lean = null }) {
  const resting = lean !== null ? restingEnergyFromLeanMass(lean) : restingEnergy(sex, weight, height, age);
  const maintenance = resting * activity;
  const target = calorieTarget(maintenance, goal, sex);
  const protein = lean !== null ? lean * (proteinPerLeanKg[goal] ?? proteinPerLeanKg.keep) : weight * (proteinPerKg[goal] ?? proteinPerKg.keep);
  const fat = target.calories * 0.27 / 9;
  const carbs = Math.max((target.calories - protein * 4 - fat * 9) / 4, 0);
  return { resting, maintenance, target, protein, carbs, fat };
}

export function macroGrams(calories, protein, fat) {
  if (protein + fat > 100) return null;
  return {
    protein: calories * protein / 400,
    carbs: calories * (100 - protein - fat) / 400,
    fat: calories * fat / 900,
  };
}

// Water a day, in litres: about 33 ml per kg of body weight, plus 350 ml for every 30 minutes of training (as at
// Hydrogen). With a scan reading it follows fat-free mass instead, since the body's water sits in lean tissue (about
// 73% water) far more than in fat: 41 ml per kg of fat-free mass, the same amount for a man at 20% body fat.
export function dailyWater(weight, trainingMinutes = 0, lean = null) {
  const base = lean !== null ? lean * 0.041 : weight * 0.033;
  return base + (trainingMinutes / 30) * 0.35;
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
