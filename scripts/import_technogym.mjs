import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputFile = path.join(__dirname, "../data_source/technogym.json")
const outputFile = path.join(__dirname, "../public/data/technogym_workouts.json")

function extractMetric(pr, name) {
  const item = pr.find(x => x.n === name)
  return item ? item.v : null
}

const raw = JSON.parse(fs.readFileSync(inputFile, "utf8"))

const workouts = raw.map(r => {
  const pr = r.performedData?.pr || []

  const duration_sec = extractMetric(pr, "Duration")
  const calories = extractMetric(pr, "Calories")
  const hr = extractMetric(pr, "AvgHr")
  const distance = extractMetric(pr, "HDistance")

  return {
    source: "Technogym",
    raw_type: "MachineWorkout",
    type: "Machine Cardio",
    start_date: r.on,
    end_date: new Date(new Date(r.on).getTime() + duration_sec * 1000).toISOString(),
    duration_min: duration_sec ? duration_sec / 60 : null,
    distance: distance || null,
    calories: calories || null,
    hr: hr || null,
    power_avg: extractMetric(pr, "AvgPower"),
    rpm_avg: extractMetric(pr, "AvgRpm"),
    level: extractMetric(pr, "Level"),
    vo2: extractMetric(pr, "Vo2"),
    notes: ""
  }
})

fs.writeFileSync(outputFile, JSON.stringify(workouts, null, 2))

console.log("Technogym workouts imported:", workouts.length)
console.log("First 3:", workouts.slice(0,3))