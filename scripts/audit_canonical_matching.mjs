import fs from "node:fs"
import { dedupeCanonicalSessions as current } from "../src/lib/canonicalSessions.js"
import { dedupeCanonicalSessions as candidate } from "../src/lib/canonicalSessionsCandidate.js"

const raw = JSON.parse(fs.readFileSync(new URL("../public/data/workout_sessions_canonical.json", import.meta.url), "utf8")).all_sessions
if (!Array.isArray(raw) || raw.length < 1000) throw new Error("Historical audit source missing or truncated")
const copy = () => structuredClone(raw)
const oldData = copy()
const newData = copy()
const baseline = current(oldData)
const proposed = candidate(newData)
const rawById = new Map(raw.map(s => [s.session_id, s]))
const baselineIds = new Set(baseline.map(s => s.session_id))
const proposedIds = new Set(proposed.map(s => s.session_id))
const baselineDropped = raw.filter(s => !baselineIds.has(s.session_id))
const candidateDropped = raw.filter(s => !proposedIds.has(s.session_id))
const revived = raw.filter(s => !baselineIds.has(s.session_id) && proposedIds.has(s.session_id))
const newDrops = raw.filter(s => baselineIds.has(s.session_id) && !proposedIds.has(s.session_id))
const source = s => {
  const p = s.preferred_metrics?.distance?.source
  if (p) return p
  if (s.sources?.fitnessview) return "FitnessView"
  if (s.sources?.apple) return "Apple"
  if (s.sources?.technogym) return "Technogym"
  return "Other"
}
const by = (rows, fn) => Object.fromEntries(Object.entries(rows.reduce((acc,s)=>{const k=fn(s);acc[k]=(acc[k]||0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]))
const summarize = arr => ({ count: arr.length, sources: by(arr,source), types: by(arr,s=>s.canonical_type || "Other") })
const date = s => String(s.start_date||"").slice(0,10)
const nearDistance = (a,b) => {
  const da=Number(a.preferred_metrics?.distance?.value)||0, db=Number(b.preferred_metrics?.distance?.value)||0
  if(da<=0||db<=0) return false
  const ua=String(a.preferred_metrics?.distance?.unit||"").toLowerCase(), ub=String(b.preferred_metrics?.distance?.unit||"").toLowerCase()
  if(ua!==ub) return false
  return Math.abs(da-db)/Math.max(da,db) <= .01
}
const hours=(a,b)=>Math.abs(Date.parse(a.start_date)-Date.parse(b.start_date))/3600000
const differentSourceSameDistance = revived.filter(a => raw.some(b => b!==a && baselineIds.has(b.session_id) && date(a)===date(b) && a.canonical_type===b.canonical_type && source(a)!==source(b) && nearDistance(a,b) && hours(a,b)>2)).length
const counts={sourceRecords:raw.length,baseline:baseline.length,candidate:proposed.length,baselineDropped:summarize(baselineDropped),candidateDropped:summarize(candidateDropped),revived:summarize(revived),newDrops:summarize(newDrops),revivedWithSameDistanceCrossSourceMoreThan2h:differentSourceSameDistance}
console.log("[canonical-matching-audit]", JSON.stringify(counts))
if(baseline.length<100 || proposed.length<100) throw Error("Unexpected loss of canonical history")
