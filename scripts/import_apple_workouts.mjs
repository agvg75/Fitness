import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = path.join(__dirname, "../data_source/apple_workouts_clean.csv");
const outputFile = path.join(__dirname, "../public/data/apple_workouts.json");

const typeMap = {
  HKWorkoutActivityTypeRunning: "Running",
  HKWorkoutActivityTypeCycling: "Cycling",
  HKWorkoutActivityTypeWalking: "Walking",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "Traditional Strength Training",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "Functional Strength Training",
  HKWorkoutActivityTypeCoreTraining: "Core Training",
  HKWorkoutActivityTypeElliptical: "Elliptical",
  HKWorkoutActivityTypeRowing: "Rowing",
  HKWorkoutActivityTypeStairClimbing: "Stair Climbing",
  HKWorkoutActivityTypeCooldown: "Cooldown",
  HKWorkoutActivityTypeSwimming: "Swimming",
  HKWorkoutActivityTypeHiking: "Hiking",
  HKWorkoutActivityTypeOther: "Other"
};

function getRawType(row) {
  return (
    row.workoutActivityType ||
    row['"workoutActivityType"'] ||
    row["WorkoutActivityType"] ||
    row["raw_type"] ||
    row["type"] ||
    ""
  ).trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const workouts = [];

fs.createReadStream(inputFile)
  .pipe(
    csv({
      mapHeaders: ({ header }) =>
        header
          .replace(/^\uFEFF/, "")
          .replace(/^"(.*)"$/, "$1")
          .trim()
    })
  )
  // AFTER
  .on("data", (row) => {
    if (workouts.length === 0) {
      console.log("ROW KEYS:", Object.keys(row));
      console.log("FIRST ROW:", row);
    }

    const rawType = getRawType(row);
    const type = typeMap[rawType] || "Other";

    // Distance: read value and unit separately so the canonical builder
    // can apply the correct conversion. Apple Health stores distance in km
    // for metric-locale devices; some export tools normalize to miles.
    const distanceRaw = toNumber(
      row.totalDistance ??
      row.total_distance ??
      row["Total Distance (km)"] ??
      row["Total Distance (mi)"] ??
      row.distance ??
      row.Distance ??
      null
    );

    const distanceUnit = (
      row.totalDistanceUnit ||
      row.total_distance_unit ||
      row.distanceUnit ||
      row.distance_unit ||
      ""
    ).trim().toLowerCase() || (distanceRaw != null ? "km" : null);
    // Default unit assumption: Apple Health exports km unless unit field says otherwise.

    const calories = toNumber(
      row.totalEnergyBurned ??
      row.total_energy_burned ??
      row.activeEnergyBurned ??
      row["Active Energy (kcal)"] ??
      row["Total Energy (kcal)"] ??
      row.calories ??
      row.Calories ??
      null
    );

    const hr = toNumber(
      row.averageHeartRate ??
      row.average_heart_rate ??
      row["Heart Rate (bpm)"] ??
      row.heartRate ??
      row.hr ??
      null
    );

    workouts.push({
      source: "AppleHealth",
      raw_type: rawType,
      type,
      start_date: row.startDate || null,
      end_date: row.endDate || null,
      duration_min: toNumber(row.duration),
      distance: distanceRaw,
      distance_unit: distanceUnit,
      calories,
      hr,
      notes: ""
    });
  })
  .on("end", () => {
    const unique = [];
    const seen = new Set();

    for (const w of workouts) {
      const key = [
        w.start_date || "",
        w.end_date || "",
        w.duration_min ?? "",
        w.type || ""
      ].join("||");

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(w);
      }
    }

    fs.writeFileSync(outputFile, JSON.stringify(unique, null, 2), "utf8");

    const counts = {};
    for (const w of unique) counts[w.type] = (counts[w.type] || 0) + 1;

    console.log("Imported Apple workouts:", workouts.length);
    console.log("Unique Apple workouts written:", unique.length);
    console.log("Type counts:", counts);
    console.log("First 5:", unique.slice(0, 5));
  })
  .on("error", (err) => {
    console.error("Importer failed:", err);
    process.exit(1);
  });