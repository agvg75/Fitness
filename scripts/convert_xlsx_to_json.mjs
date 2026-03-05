import fs from "fs"
import xlsx from "xlsx"

const workbook = xlsx.readFile("data_source/Andres_Fitness_AllData.xlsx")

function sheet(name) {
  const ws = workbook.Sheets[name]
  if (!ws) return []
  return xlsx.utils.sheet_to_json(ws)
}

fs.mkdirSync("public/data", { recursive: true })

fs.writeFileSync(
  "public/data/fitness_daily.json",
  JSON.stringify(sheet("Daily"), null, 2)
)

fs.writeFileSync(
  "public/data/nutrition_log.json",
  JSON.stringify(sheet("Nutrition_Log"), null, 2)
)

fs.writeFileSync(
  "public/data/injury_log.json",
  JSON.stringify(sheet("Injury_Log"), null, 2)
)

console.log("Excel converted to JSON")
