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

// A starting calorie target for the goal. Fat loss never drops below a minimum intake.
export function calorieTarget(maintenance, goal, sex) {
  if (goal === "gain") return { calories: maintenance + 300, floored: false };
  if (goal !== "lose") return { calories: maintenance, floored: false };
  const minimum = sex === "m" ? 1500 : 1200;
  const calories = Math.max(maintenance - 500, minimum);
  return { calories: Math.min(calories, maintenance), floored: maintenance - 500 < minimum };
}

export const proteinPerKg = { lose: 2, keep: 1.6, gain: 1.8 };

// Protein from body weight, fat as a quarter of calories, carbohydrate as the remainder.
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
