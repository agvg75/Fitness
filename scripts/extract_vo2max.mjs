import { createReadStream, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { createClient } from '@supabase/supabase-js'

const xmlPath = process.argv[2]
const pushToSupabase = process.argv[3] === '--push'
if (!xmlPath) {
  console.error('Usage: node extract_vo2max.mjs <path/to/export.xml> [--push]')
  process.exit(1)
}

const records = []
const rl = createInterface({ input: createReadStream(xmlPath), crlfDelay: Infinity })

rl.on('line', line => {
  if (line.includes('HKQuantityTypeIdentifierVO2Max')) {
    const val = line.match(/value="([^"]+)"/)?.[1]
    const start = line.match(/startDate="([^"]+)"/)?.[1]
    if (val && start && Number.isFinite(parseFloat(val))) {
      records.push({
        biometric_id: `vo2_apple_${start.slice(0, 10).replace(/-/g, '')}`,
        source: 'AppleHealth',
        date: start.slice(0, 10),
        measured_date: start.slice(0, 10),
        measured_at: start,
        vo2_max: parseFloat(parseFloat(val).toFixed(2)),
        unit: 'mL/min/kg'
      })
    }
  }
})

rl.on('close', async () => {
  const byDate = {}
  records.forEach(r => { byDate[r.date] = r })
  const deduped = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  writeFileSync('scripts/vo2max_records.json', JSON.stringify(deduped, null, 2))
  console.log(`Extracted ${deduped.length} records (${records.length} raw)`)
  console.log(`Range: ${deduped[0]?.date} to ${deduped[deduped.length - 1]?.date}`)

  if (!pushToSupabase) {
    console.log('Run with --push to upsert to Supabase')
    return
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const USER_ID = process.env.LIFT_USER_ID
  if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
    console.error('Missing env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, LIFT_USER_ID')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const dates = deduped.map(r => r.measured_date)
  const { data: existingRows, error: existingError } = await supabase
    .from('biometric_records')
    .select('*')
    .eq('user_id', USER_ID)
    .in('measured_date', dates)
  if (existingError) {
    console.error('Supabase existing-row fetch failed:', existingError.message)
    process.exit(1)
  }

  const existingByDate = new Map((existingRows || []).map(row => [row.measured_date, row]))
  const rows = deduped.map(r => {
    const existing = existingByDate.get(r.measured_date) || {}
    const raw = {
      ...(existing.raw || {}),
      apple_vo2max: r
    }
    return {
      user_id: USER_ID,
      biometric_id: existing.biometric_id || r.biometric_id,
      source: existing.source || r.source,
      measured_at: existing.measured_at || r.measured_at,
      measured_date: r.measured_date,
      active_energy_cal: existing.active_energy_cal ?? null,
      resting_energy_cal: existing.resting_energy_cal ?? null,
      resting_hr_bpm: existing.resting_hr_bpm ?? null,
      hrv: existing.hrv ?? null,
      steps: existing.steps ?? null,
      vo2_max: r.vo2_max,
      exercise_minutes: existing.exercise_minutes ?? null,
      stand_hours: existing.stand_hours ?? null,
      weight_lb: existing.weight_lb ?? null,
      body_fat_pct: existing.body_fat_pct ?? null,
      bmi: existing.bmi ?? null,
      bp_systolic: existing.bp_systolic ?? null,
      bp_diastolic: existing.bp_diastolic ?? null,
      pulse_bpm: existing.pulse_bpm ?? null,
      raw
    }
  })
  const { error } = await supabase.from('biometric_records').upsert(rows, { onConflict: 'user_id,measured_date' })
  if (error) {
    console.error('Supabase upsert failed:', error.message)
    process.exit(1)
  }
  console.log(`Pushed ${rows.length} records to Supabase biometric_records`)
})
