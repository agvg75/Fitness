import fs from "fs"
import xlsx from "xlsx"
import { createClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Supabase credentials — process.env first (Vercel), then .env.local fallback
// ---------------------------------------------------------------------------
function readEnvFile(path) {
  try {
    return fs.readFileSync(path, "utf8")
  } catch {
    return ""
  }
}

function getEnvVar(key) {
  if (process.env[key]) return process.env[key]
  for (const file of [".env.local", ".env"]) {
    const content = readEnvFile(file)
    const match = content.match(new RegExp(`^${key}=(.+)`, "m"))
    if (match) return match[1].trim()
  }
  return null
}

const SUPABASE_URL = getEnvVar("VITE_SUPABASE_URL")
const SUPABASE_ANON_KEY = getEnvVar("VITE_SUPABASE_ANON_KEY")

// ---------------------------------------------------------------------------
// Helpers shared with Excel conversion
// ---------------------------------------------------------------------------
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

function numOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeDate(v) {
  if (v == null || v === "") return null

  if (typeof v === "string") {
    const s = v.trim()
    if (!s) return null

    // M/D/YY or M/D/YYYY
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (mdy) {
      let [, m, d, y] = mdy
      if (y.length === 2) y = `20${y}`
      return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    }

    const dt = new Date(s)
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)

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

// ---------------------------------------------------------------------------
// HealthFit CSV → CTL/ATL/TSB/TRIMP lookup
// Looks for Fitness*.csv in data_source/ or the project root.
// HealthFit export columns vary; we try several known names.
// ---------------------------------------------------------------------------
function loadHealthFitCsv() {
  const candidates = [
    ...fs.readdirSync("data_source").map(f => `data_source/${f}`),
    ...fs.readdirSync(".").filter(f => !f.startsWith(".") && !fs.statSync(f).isDirectory())
  ].filter(f => /Fitness\d+.*\.csv$/i.test(f))

  if (!candidates.length) {
    console.warn(
      "[fitness_daily] No HealthFit CSV found (Fitness*.csv). CTL/ATL/TSB/TRIMP will be null."
    )
    return new Map()
  }

  // Use the most recently named file (timestamps are in the filename)
  candidates.sort()
  const chosen = candidates[candidates.length - 1]
  console.log(`[fitness_daily] Merging CTL/ATL/TSB/TRIMP from ${chosen}`)

  const wb = xlsx.readFile(chosen, { type: "file" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null })

  // Column name aliases used by HealthFit exports
  const pick = (row, ...keys) => {
    for (const k of keys) {
      const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
      if (v != null && v !== "") return numOrNull(v)
    }
    return null
  }

  const map = new Map()
  for (const row of rows) {
    const date = normalizeDate(
      row.Date ?? row.date ?? row.DATE ?? row["Date"]
    )
    if (!date) continue
    map.set(date, {
      ctl:   pick(row, "CTL", "Fitness", "Training Load", "Chronic Training Load"),
      atl:   pick(row, "ATL", "Fatigue", "Acute Training Load"),
      tsb:   pick(row, "TSB", "Form", "Training Stress Balance"),
      trimp: pick(row, "TRIMP", "Load", "Training Load Value"),
    })
  }

  console.log(`[fitness_daily] Loaded ${map.size} CTL/ATL/TSB rows from ${chosen}`)
  return map
}

// ---------------------------------------------------------------------------
// Fetch biometric daily rows from Supabase lift_biometric_records
// ---------------------------------------------------------------------------
async function fetchFitnessDaily(healthFitMap) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      "[fitness_daily] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not found in .env.local or .env. " +
      "Skipping Supabase fetch — fitness_daily.json will be empty."
    )
    return []
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  let allRows = []
  const PAGE = 1000
  let from = 0

  for (;;) {
    const { data, error } = await supabase
      .from("biometric_records")
      .select(
        "measured_date,active_energy_cal,exercise_minutes,stand_hours,steps," +
        "resting_hr_bpm,hrv,vo2_max,resting_energy_cal"
      )
      .order("measured_date", { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error("[fitness_daily] Supabase error:", error.message)
      return []
    }

    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(`[fitness_daily] Fetched ${allRows.length} rows from biometric_records`)

  return allRows
    .map(row => {
      const date = row.measured_date
        ? String(row.measured_date).slice(0, 10)
        : null
      if (!date) return null

      const hf = healthFitMap.get(date) || {}

      return {
        date,
        active_energy_cal:   numOrNull(row.active_energy_cal),
        resting_energy_cal:  numOrNull(row.resting_energy_cal),
        resting_hr_bpm:      numOrNull(row.resting_hr_bpm),
        hrv:                 numOrNull(row.hrv),
        steps:               numOrNull(row.steps),
        vo2_max:             numOrNull(row.vo2_max),
        exercise_minutes:    numOrNull(row.exercise_minutes),
        stand_hours:         numOrNull(row.stand_hours),
        ctl:                 hf.ctl  ?? null,
        atl:                 hf.atl  ?? null,
        tsb:                 hf.tsb  ?? null,
        trimp:               hf.trimp ?? null,
      }
    })
    .filter(r => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------
// Excel-derived datasets (unchanged)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
fs.mkdirSync("public/data", { recursive: true })

const healthFitMap = loadHealthFitCsv()
const fitnessDaily = await fetchFitnessDaily(healthFitMap)

if (fitnessDaily.length > 0) {
  const latest = fitnessDaily[fitnessDaily.length - 1].date
  console.log(
    `[fitness_daily] Writing ${fitnessDaily.length} rows (latest: ${latest}) to public/data/fitness_daily.json`
  )
} else {
  console.warn("[fitness_daily] No rows written — fitness_daily.json will be empty array.")
}

fs.writeFileSync("public/data/fitness_daily.json", JSON.stringify(fitnessDaily, null, 2))
fs.writeFileSync("public/data/nutrition_daily.json", JSON.stringify(nutritionDaily, null, 2))
fs.writeFileSync("public/data/injury_daily.json", JSON.stringify(injuryDaily, null, 2))
fs.writeFileSync("public/data/dexa_summary.json", JSON.stringify(dexaSummary, null, 2))
fs.writeFileSync("public/data/workout_log.json", JSON.stringify(workoutLog, null, 2))

console.log("Excel converted to JSON")
