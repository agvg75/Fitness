// import_apple_xml.mjs
// Replaces import_apple_workouts.mjs (CSV-based).
// Streams export.xml using Node's built-in readline + simple tag parsing.
// No external dependencies beyond Node.js core.
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

// Extract a named attribute value from a tag string.
// Handles both single and double quoted values.
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
let lineCount = 0;
let workoutCount = 0;

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

// Buffer for tags that span multiple lines (rare in Apple Health but possible)
let buffer = "";

rl.on("line", (line) => {
  lineCount++;
  if (lineCount % 500000 === 0) {
    process.stderr.write(`  ... ${lineCount.toLocaleString()} lines read, ${workoutCount} workouts found\n`);
  }

  // Accumulate buffer for multi-line tags
  buffer += " " + line.trim();

  // Process any complete <Workout .../> or <Workout ...> tags in buffer
  let start;
  while ((start = buffer.indexOf("<Workout ")) !== -1) {
    // Find end of this tag
    const selfClose = buffer.indexOf("/>", start);
    const openClose = buffer.indexOf(">", start);

    // If neither found yet, wait for more lines
    if (selfClose === -1 && openClose === -1) break;

    let tagEnd;
    let tagStr;
    if (selfClose !== -1 && (openClose === -1 || selfClose < openClose)) {
      tagEnd = selfClose + 2;
      tagStr = buffer.slice(start, tagEnd);
    } else {
      tagEnd = openClose + 1;
      tagStr = buffer.slice(start, tagEnd);
    }

    // Only process if we have the full tag (contains workoutActivityType)
    if (tagStr.includes("workoutActivityType")) {
      const rawType   = attr(tagStr, "workoutActivityType") || "";
      const type      = typeMap[rawType] || "Other";
      const startDate = attr(tagStr, "startDate") || "";
      const endDate   = attr(tagStr, "endDate")   || "";
      const duration  = toNumber(attr(tagStr, "duration"));
      const distance  = toNumber(attr(tagStr, "totalDistance"));
      const distUnit  = attr(tagStr, "totalDistanceUnit") || "";
      const calories  = toNumber(attr(tagStr, "totalEnergyBurned"));
      const sourceName = attr(tagStr, "sourceName") || "";

      // Dedup key: startDate + type
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
          distance:      distance,
          distance_unit: distUnit,
          calories,
          hr:            0,   // HR comes from WorkoutStatistics; omitted for now
          notes:         "",
          source_name:   sourceName,
        });
        workoutCount++;
      }
    }

    buffer = buffer.slice(tagEnd);
  }

  // Keep buffer trim — drop anything before the last potential tag start
  const lastAngle = buffer.lastIndexOf("<Workout ");
  if (lastAngle > 0) {
    buffer = buffer.slice(lastAngle);
  } else if (buffer.length > 2000) {
    buffer = buffer.slice(-500);
  }
});

rl.on("close", () => {
  // Sort by start_date ascending
  workouts.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  fs.writeFileSync(outputFile, JSON.stringify(workouts, null, 2));

  const typeCounts = {};
  workouts.forEach(w => { typeCounts[w.type] = (typeCounts[w.type] || 0) + 1; });

  console.log(`\nDone. Lines read: ${lineCount.toLocaleString()}`);
  console.log(`Workouts written: ${workouts.length}`);
  console.log("Type counts:");
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${n}  ${t}`));

  // Date range
  if (workouts.length > 0) {
    console.log(`Date range: ${workouts[0].start_date} → ${workouts[workouts.length - 1].start_date}`);
  }
});

rl.on("error", (err) => {
  console.error("Stream error:", err);
  process.exit(1);
});
