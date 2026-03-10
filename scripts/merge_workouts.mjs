import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manualPath = path.join(__dirname, "../public/data/workout_log.json");
const applePath = path.join(__dirname, "../public/data/apple_workouts.json");
const outputPath = path.join(__dirname, "../public/data/workouts_merged.json");

function roundDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(1);
}

function normalizeType(workout) {
  return (workout.type || workout.workout_type || "").toString().trim();
}

function normalizeStart(workout) {
  return (workout.start_date || workout.date || "").toString().trim();
}

function normalizeEnd(workout) {
  return (workout.end_date || "").toString().trim();
}

function isRealWorkout(workout) {
  const hasType = !!normalizeType(workout);
  const hasStart = !!normalizeStart(workout);
  const hasDuration = workout.duration_min !== null && workout.duration_min !== undefined && workout.duration_min !== "";
  return hasType || (hasStart && hasDuration);
}

function toCanonicalWorkout(workout, defaultSource = "Manual") {
  return {
    source: workout.source || defaultSource,
    type: workout.type || workout.workout_type || "Other",
    start_date: workout.start_date || workout.date || null,
    end_date: workout.end_date || null,
    duration_min: workout.duration_min ?? null,
    distance: workout.distance ?? null,
    calories: workout.calories ?? null,
    hr: workout.hr ?? null,
    notes: workout.notes ?? ""
  };
}

function workoutKey(workout) {
  return [
    normalizeStart(workout),
    normalizeEnd(workout),
    roundDuration(workout.duration_min)
  ].join("||");
}

function choosePreferred(existing, candidate) {
  const existingIsApple = existing.source === "AppleHealth";
  const candidateIsApple = candidate.source === "AppleHealth";

  const existingIsManual = !existingIsApple;
  const candidateIsManual = !candidateIsApple;

  if (existingIsManual && candidateIsApple) return existing;
  if (existingIsApple && candidateIsManual) return candidate;

  if (existingIsApple && candidateIsApple) {
    const existingTyped = (existing.type || "").trim() && existing.type !== "Other";
    const candidateTyped = (candidate.type || "").trim() && candidate.type !== "Other";

    if (!existingTyped && candidateTyped) return candidate;
    if (existingTyped && !candidateTyped) return existing;
  }

  const existingNotes = (existing.notes || "").trim().length;
  const candidateNotes = (candidate.notes || "").trim().length;
  if (candidateNotes > existingNotes) return candidate;

  return existing;
}

async function main() {
  const manualRaw = JSON.parse(await fs.readFile(manualPath, "utf8"));
  const appleRaw = JSON.parse(await fs.readFile(applePath, "utf8"));

  if (!Array.isArray(manualRaw)) {
    throw new Error("workout_log.json is not a JSON array.");
  }
  if (!Array.isArray(appleRaw)) {
    throw new Error("apple_workouts.json is not a JSON array.");
  }

  const manualWorkouts = manualRaw
    .filter(isRealWorkout)
    .map(w => toCanonicalWorkout(w, "Manual"));

  const appleWorkouts = appleRaw
    .filter(isRealWorkout)
    .map(w => toCanonicalWorkout(w, "AppleHealth"));

  const mergedMap = new Map();

  for (const workout of [...manualWorkouts, ...appleWorkouts]) {
    const key = workoutKey(workout);

    if (!mergedMap.has(key)) {
      mergedMap.set(key, workout);
    } else {
      const preferred = choosePreferred(mergedMap.get(key), workout);
      mergedMap.set(key, preferred);
    }
  }

  const merged = Array.from(mergedMap.values()).sort((a, b) => {
    const aTime = new Date(a.start_date || 0).getTime();
    const bTime = new Date(b.start_date || 0).getTime();
    return aTime - bTime;
  });

  await fs.writeFile(outputPath, JSON.stringify(merged, null, 2), "utf8");

  console.log(`Merged workouts written to ${outputPath}`);
  console.log(`Manual input rows: ${manualRaw.length}`);
  console.log(`Apple input rows: ${appleRaw.length}`);
  console.log(`Manual valid workouts: ${manualWorkouts.length}`);
  console.log(`Apple valid workouts: ${appleWorkouts.length}`);
  console.log(`Final merged workouts: ${merged.length}`);
}

main().catch(err => {
  console.error("Merge failed:");
  console.error(err);
  process.exit(1);
});