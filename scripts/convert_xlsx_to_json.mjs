import fs from "fs"
import xlsx from "xlsx"

const workbook = xlsx.readFile("data_source/Andres_Fitness_AllData.xlsx")

function excelDateToISO(serial) {
  if (!serial) return null

  const utc_days = Math.floor(serial - 25569)
  const utc_value = utc_days * 86400

  const date = new Date(utc_value * 1000)

  return date.toISOString().slice(0,10)
}

function sheet(name){
  const ws = workbook.Sheets[name]
  if(!ws) return []
  return xlsx.utils.sheet_to_json(ws,{defval:null})
}

fs.mkdirSync("public/data",{recursive:true})

const bodyWeightDaily = sheet("Body_Weight_Daily").map(r=>({

  date: excelDateToISO(r.date),

  weight_lb: r.weight_lbs_mean ? Number(r.weight_lbs_mean.toFixed(1)) : null,

  weight_lb_min: r.weight_lbs_min ? Number(r.weight_lbs_min.toFixed(1)) : null,

  weight_lb_max: r.weight_lbs_max ? Number(r.weight_lbs_max.toFixed(1)) : null,

  n_measurements: r.n_measurements ?? null,

  body_fat_pct: null,

  active_calories: null,

  vo2max: null

}))

fs.writeFileSync(
  "public/data/fitness_daily.json",
  JSON.stringify(bodyWeightDaily,null,2)
)

fs.writeFileSync(
  "public/data/nutrition_daily.json",
  JSON.stringify(sheet("Nutrition_Daily"),null,2)
)

fs.writeFileSync(
  "public/data/injury_daily.json",
  JSON.stringify(sheet("Injury_Daily"),null,2)
)

fs.writeFileSync(
  "public/data/workout_log.json",
  JSON.stringify(sheet("Workout_Log"),null,2)
)

fs.writeFileSync(
  "public/data/dexa_summary.json",
  JSON.stringify(sheet("DEXA_Summary"),null,2)
)

console.log("Excel converted to JSON")
