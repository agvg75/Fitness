import fs from "fs"
import xlsx from "xlsx"

const workbook = xlsx.readFile("data_source/Andres_Fitness_AllData.xlsx")

function sheet(name) {
  const ws = workbook.Sheets[name]
  if (!ws) {
    console.warn(`Missing sheet: ${name}`)
    return []
  }
  return xlsx.utils.sheet_to_json(ws, { defval: null })
}

function round1(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Number(n.toFixed(1)) : null
}

function round2(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null
}

function normalizeDate(v) {
  if (v == null || v === "") return null

  if (typeof v === "string") {
    const s = v.trim()
    if (!s) return null

    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)

    return s
  }

  if (typeof v === "number") {
    const parsed = xlsx.SSF.parse_date_code(v)
    if (parsed) {
      const yyyy = String(parsed.y).padStart(4, "0")
      const mm = String(parsed.m).padStart(2, "0")
      const dd = String(parsed.d).padStart(2, "0")
      return `${yyyy}-${mm}-${dd}`
    }
  }

  return null
}

fs.mkdirSync("public/data", { recursive: true })

const weightDaily = sheet("Body_Weight_Daily").map(row => ({
  date: normalizeDate(row.date),
  weight_lb: round1(row.weight_lbs_mean),
  weight_lb_min: round1(row.weight_lbs_min),
  weight_lb_max: round1(row.weight_lbs_max),
  n_measurements: row.n_measurements == null ? null : Number(row.n_measurements)
}))

const nutritionDaily = sheet("Nutrition_Daily").map(row => ({
  date: normalizeDate(row.date ?? row.Date),
  calories: row.calories ?? row.Calories ?? row.kcal ?? row.Kcal ?? null,
  protein_g: row.protein_g ?? row["Protein (g)"] ?? row.protein ?? null,
  carbs_g: row.carbs_g ?? row["Carbs (g)"] ?? row.carbs ?? null,
  fat_g: row.fat_g ?? row["Fat (g)"] ?? row.fat ?? null,
  notes: row.notes ?? row.Notes ?? null
}))

const injuryDaily = sheet("Injury_Daily").map(row => ({
  date: normalizeDate(row.date ?? row.Date),
  injury: row.injury ?? row.Injury ?? row.area ?? row.Area ?? null,
  status: row.status ?? row.Status ?? null,
  pain: row.pain ?? row.Pain ?? row.pain_score ?? row["Pain Score"] ?? null,
  notes: row.notes ?? row.Notes ?? null
}))

const dexaSummary = sheet("DEXA_Summary").map(row => ({
  "Scan date": normalizeDate(row["Scan date"] ?? row["Scan Date"] ?? row.date ?? row.Date),
  "Total mass (kg)": round2(row["Total mass (kg)"] ?? row["Total mass"] ?? row["Total (kg)"]),
  "Fat mass (kg)": round2(row["Fat mass (kg)"] ?? row["Fat mass"] ?? row["Fat (kg)"]),
  "Lean mass (kg)": round2(row["Lean mass (kg)"] ?? row["Lean mass"] ?? row["Lean (kg)"]),
  "Lean+BMC (kg)": round2(row["Lean+BMC (kg)"] ?? row["Lean + BMC (kg)"] ?? row["Lean+BMC"]),
  "% fat": round1(row["% fat"] ?? row["Percent fat"] ?? row["Body fat %"])
}))

const workoutLog = sheet("Workout_Log").map(row => ({
  date: normalizeDate(row.date ?? row.Date),
  workout_type: row.workout_type ?? row["Workout Type"] ?? row.type ?? null,
  duration_min: row.duration_min ?? row["Duration (min)"] ?? row.duration ?? null,
  notes: row.notes ?? row.Notes ?? null
}))

fs.writeFileSync("public/data/fitness_daily.json", JSON.stringify(weightDaily, null, 2))
fs.writeFileSync("public/data/nutrition_daily.json", JSON.stringify(nutritionDaily, null, 2))
fs.writeFileSync("public/data/injury_daily.json", JSON.stringify(injuryDaily, null, 2))
fs.writeFileSync("public/data/dexa_summary.json", JSON.stringify(dexaSummary, null, 2))
fs.writeFileSync("public/data/workout_log.json", JSON.stringify(workoutLog, null, 2))

console.log("Excel converted to JSON")
