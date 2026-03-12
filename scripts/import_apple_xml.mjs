// import_apple_xml.mjs
// Streams export.xml using Node.js built-in readline — no external dependencies.
// Collects WorkoutStatistics distance child elements and swimming lap records,
// attaches real distance values to workouts where totalDistance is absent.
// Usage: node scripts/import_apple_xml.mjs
// Reads:  data_source/export.xml
// Writes: public/data/apple_workouts.json

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile  = path.join(__dirname, "../data_source/export.xml");
const outputFile = path.join(__dirname, "../public/data/apple_workouts.json");

const typeMap = {
  HKWorkoutActivityTypeRunning:                    "Running",
  HKWorkoutActivityTypeCycling:                    "Cycling",
  HKWorkoutActivityTypeWalking:                    "Walking",
  HKWorkoutActivityTypeTraditionalStrengthTraining:"Traditional Strength Training",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "Functional Strength Training",
  HKWorkoutActivityTypeCoreTraining:               "Core Training",
  HKWorkoutActivityTypeElliptical:                 "Elliptical",
  HKWorkoutActivityTypeRowing:                     "Rowing",
  HKWorkoutActivityTypeStairClimbing:              "Stair Climbing",
  HKWorkoutActivityTypeCooldown:                   "Cooldown",
  HKWorkoutActivityTypeSwimming:                   "Swimming",
  HKWorkoutActivityTypeHiking:                     "Hiking",
  HKWorkoutActivityTypeOther:                      "Other",
};

// WorkoutStatistics distance types and their units
const STAT_DISTANCE_TYPES = new Set([
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierDistanceCycling",
  "HKQuantityTypeIdentifierDistanceSwimming",
]);

function attr(tag, name) {
  const re = new RegExp(`${name}=["']([^"']*)["']`);
  const m = tag.match(re);
  return m ? m[1] : null;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const workouts = [];
const seen = new Set();

// WorkoutStatistics distance: keyed by exact startDate string
// value: { sum, unit }
const statDistance = {};

// Swimming lap records: keyed by YYYY-MM-DD day
const swimLaps = {};

let lineCount = 0;
let workoutCount = 0;
let statCount = 0;
let lapCount = 0;
let buffer = "";

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  lineCount++;
  if (lineCount % 500000 === 0) {
    process.stderr.write(
      `  ... ${lineCount.toLocaleString()} lines, ${workoutCount} workouts, ${statCount} stats, ${lapCount} swim laps\n`
    );
  }

  const trimmed = line.trim();

  // Collect WorkoutStatistics distance child elements
  if (trimmed.includes("WorkoutStatistics")) {
    const statType = attr(trimmed, "type") || "";
    if (STAT_DISTANCE_TYPES.has(statType)) {
      const startDate = attr(trimmed, "startDate");
      const sum = attr(trimmed, "sum");
      const unit = attr(trimmed, "unit");
      if (startDate && sum) {
        statDistance[startDate] = { sum: toNumber(sum), unit: unit || "mi" };
        statCount++;
      }
    }
  }

  // Collect standalone swimming lap records (separate <Record> tags)
  if (trimmed.includes("HKQuantityTypeIdentifierDistanceSwimming") && trimmed.includes("<Record")) {
    const startDate = attr(trimmed, "startDate");
    const value = attr(trimmed, "value");
    if (startDate && value) {
      const day = startDate.slice(0, 10);
      swimLaps[day] = (swimLaps[day] || 0) + toNumber(value);
      lapCount++;
    }
  }

  // Accumulate buffer for Workout opening tags
  buffer += " " + trimmed;

  let start;
  while ((start = buffer.indexOf("<Workout ")) !== -1) {
    const selfClose = buffer.indexOf("/>", start);
    const openClose = buffer.indexOf(">", start);
    if (selfClose === -1 && openClose === -1) break;

    let tagEnd, tagStr;
    if (selfClose !== -1 && (openClose === -1 || selfClose < openClose)) {
      tagEnd = selfClose + 2;
      tagStr = buffer.slice(start, tagEnd);
    } else {
      tagEnd = openClose + 1;
      tagStr = buffer.slice(start, tagEnd);
    }

    if (tagStr.includes("workoutActivityType")) {
      const rawType    = attr(tagStr, "workoutActivityType") || "";
      const type       = typeMap[rawType] || "Other";
      const startDate  = attr(tagStr, "startDate") || "";
      const endDate    = attr(tagStr, "endDate")   || "";
      const duration   = toNumber(attr(tagStr, "duration"));
      const sourceName = attr(tagStr, "sourceName") || "";
      let distance     = toNumber(attr(tagStr, "totalDistance"));
      let distUnit     = attr(tagStr, "totalDistanceUnit") || "";
      const calories   = toNumber(attr(tagStr, "totalEnergyBurned"));

      // If totalDistance missing, check WorkoutStatistics (exact startDate match)
      if (distance === 0 && statDistance[startDate]) {
        distance = statDistance[startDate].sum;
        distUnit = statDistance[startDate].unit;
      }

      // Swimming: use summed lap yards (day-level match) if still zero
      if (type === "Swimming" && distance === 0) {
        const day = startDate.slice(0, 10);
        const yards = swimLaps[day] || 0;
        if (yards > 0) { distance = yards; distUnit = "yd"; }
      }

      const key = `${startDate}|${rawType}`;
      if (!seen.has(key)) {
        seen.add(key);
        workouts.push({
          source:        "AppleHealth",
          raw_type:      rawType,
          type,
          start_date:    startDate,
          end_date:      endDate,
          duration_min:  duration,
          distance,
          distance_unit: distUnit,
          calories,
          hr:            0,
          notes:         "",
          source_name:   sourceName,
        });
        workoutCount++;
      }
    }

    buffer = buffer.slice(tagEnd);
  }

  const lastAngle = buffer.lastIndexOf("<Workout ");
  if (lastAngle > 0) { buffer = buffer.slice(lastAngle); }
  else if (buffer.length > 2000) { buffer = buffer.slice(-500); }
});

rl.on("close", () => {
  workouts.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  fs.writeFileSync(outputFile, JSON.stringify(workouts, null, 2));

  const typeCounts = {};
  workouts.forEach(w => { typeCounts[w.type] = (typeCounts[w.type] || 0) + 1; });

  console.log(`\nDone. Lines read: ${lineCount.toLocaleString()}`);
  console.log(`Workouts written: ${workouts.length}`);
  console.log(`WorkoutStatistics distance records: ${statCount}`);
  console.log(`Swim lap records: ${lapCount}`);
  console.log("Type counts:");
  Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${n}  ${t}`));

  // Spot-check recent running
  const runs = workouts.filter(w => w.type === "Running").slice(-5);
  console.log("\nRecent runs:");
  runs.forEach(w => console.log(
    ` ${w.start_date.slice(0,10)}  ${w.distance.toFixed(3)} ${w.distance_unit}  ${w.duration_min.toFixed(1)} min`
  ));

  // Spot-check swimming
  const swims = workouts.filter(w => w.type === "Swimming");
  if (swims.length > 0) {
    console.log("\nSwim sessions:");
    swims.forEach(w => {
      const miles = w.distance_unit === "yd"
        ? (w.distance / 1760).toFixed(3)
        : w.distance.toFixed(3);
      console.log(
        ` ${w.start_date.slice(0,10)}  ${Math.round(w.distance)} ${w.distance_unit || "?"}  (${miles} mi)  ${w.duration_min.toFixed(1)} min`
      );
    });
  }

  if (workouts.length > 0) {
    console.log(`\nDate range: ${workouts[0].start_date} to ${workouts[workouts.length - 1].start_date}`);
  }
});

rl.on("error", (err) => { console.error("Stream error:", err); process.exit(1); });
