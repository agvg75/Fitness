import { createReadStream, writeFileSync } from 'fs'
import { createInterface } from 'readline'

const rl = createInterface({
  input: createReadStream('data_source/export.xml'),
  crlfDelay: Infinity
})

const byDay = {}

rl.on('line', line => {
  if (!line.includes('HKQuantityTypeIdentifierBodyMass')) return
  if (!line.includes('startDate')) return

  const date = line.match(/startDate="([^"]+)"/)?.[1]
  const val  = line.match(/value="([^"]+)"/)?.[1]
  const unit = line.match(/\bunit="([^"]+)"/)?.[1]

  if (!date || !val) return

  const day = date.slice(0, 10)
  const lbs = unit === 'lb' ? Number(val) : Number(val) * 2.20462

  // keep first reading of the day (scale readings are most reliable early)
  if (!byDay[day]) {
    byDay[day] = { date: day, weight_lb: Number(lbs.toFixed(1)), source: 'AppleHealth' }
  }
})

rl.on('close', () => {
  const rows = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
  writeFileSync('public/data/body_weight.json', JSON.stringify(rows, null, 2))
  console.log(`Wrote ${rows.length} daily weight records`)
  console.log('First:', rows[0])
  console.log('Last: ', rows[rows.length - 1])
})
