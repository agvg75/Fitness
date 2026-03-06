import fs from "fs"
import xlsx from "xlsx"

const workbook = xlsx.readFile("data_source/Andres_Fitness_AllData.xlsx")

function sheet(name) {
  const ws = workbook.Sheets[name]
  if (!ws) return []
  return xlsx.utils.sheet_to_json(ws, { defval: null })
}

fs.mkdirSync("public/data", { recursive: true })

// Main daily fitness data
const bodyWeightDaily = sheet("Body_Weight_Daily").map(row => ({
  date: row.date ?? null,
  weight_lb: row.weight_lbs_mean ?? null,
  weight_lb_min: row.weight_lbs_min ?? null,
  weight_lb_max: row.weight_lbs_max ?? null,
  n_measurements: row.n_measurements ?? null,
  body_fat_pct: null,
  active_calories: null,
  vo2max: null
}))

fs.writeFileSync(
  "public/data/fitness_daily.json",
  JSON.stringify(bodyWeightDaily, null, 2)
)

// Optional richer sheets, if present
fs.writeFileSync(
  "public/data/nutrition_log.json",
  JSON.stringify(sheet("Nutrition_Log"), null, 2)
)

fs.writeFileSync(
  "public/data/nutrition_daily.json",
  JSON.stringify(sheet("Nutrition_Daily"), null, 2)
)

fs.writeFileSync(
  "public/data/injury_log.json",
  JSON.stringify(sheet("Injury_Log"), null, 2)
)

fs.writeFileSync(
  "public/data/injury_daily.json",
  JSON.stringify(sheet("Injury_Daily"), null, 2)
)

fs.writeFileSync(
  "public/data/dexa_summary.json",
  JSON.stringify(sheet("DEXA_Summary"), null, 2)
)

fs.writeFileSync(
  "public/data/workout_log.json",
  JSON.stringify(sheet("Workout_Log"), null, 2)
)

console.log("Excel converted to JSON")
