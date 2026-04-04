import { readFileSync } from 'fs'

const data = JSON.parse(readFileSync('public/data/workout_sessions_canonical.json', 'utf8'))
const sessions = data.all_sessions

console.log('Total sessions:', sessions.length)
console.log('\nFirst 5 start_dates:')
sessions.slice(0, 5).forEach(s => console.log(' raw:', JSON.stringify(s.start_date), '  parsed:', new Date(s.start_date).toISOString()))

console.log('\nLast 5 start_dates:')
sessions.slice(-5).forEach(s => console.log(' raw:', JSON.stringify(s.start_date), '  parsed:', new Date(s.start_date).toISOString()))

const cutoff = new Date()
cutoff.setDate(cutoff.getDate() - 28)
console.log('\nCutoff date:', cutoff.toISOString())

const recent = sessions.filter(s => new Date(s.start_date) >= cutoff)
console.log('Sessions in last 28 days:', recent.length)

const runs = recent.filter(s => s.canonical_type === 'Running')
console.log('Running sessions:', runs.length)
runs.forEach(r => console.log(' ', r.start_date, r.duration_min + 'min', JSON.stringify(r.preferred_metrics?.distance)))
