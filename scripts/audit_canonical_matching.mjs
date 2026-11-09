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
const fuzzyLosers = oldData.filter(s => s.dedupedBy && !baselineIds.has(s.session_id))
const fuzzyOnlyPreserved = fuzzyLosers.filter(s => proposedIds.has(s.session_id))
const sourcePair = (s, winner) => `${source(s)} -> ${source(winner)}`
const matchedByWinner = fuzzyLosers.map(s => ({ s, winner: rawById.get(String(s.dedupedBy)) })).filter(({winner})=>winner)
const strongDifferentSource = matchedByWinner.filter(({s,winner})=>source(s)!==source(winner) && nearDistance(s,winner))
const sameSourceGap = matchedByWinner.filter(({s,winner})=>source(s)===source(winner) && hours(s,winner)>2)
const dateOnly = s => s.start_date===s.end_date || /T0[456]:00:00/.test(s.start_date||"")
const ambiguousMidnight = matchedByWinner.filter(({s,winner})=>dateOnly(s)||dateOnly(winner))
console.log("[canonical-fuzzy-audit]", JSON.stringify({
  allFuzzyDropped:fuzzyLosers.length,
  fuzzyRestoredByCandidate:fuzzyOnlyPreserved.length,
  fuzzyDropSourcePairs:by(matchedByWinner,({s,winner})=>sourcePair(s,winner)),
  strongCrossSource:strongDifferentSource.length,
  sameSourceMoreThan2h:sameSourceGap.length,
  dateOnlyInvolved:ambiguousMidnight.length,
  sameSourceGapExamples:sameSourceGap.slice(0,12).map(({s,winner})=>({
    ids:[s.session_id,winner.session_id], times:[s.start_date,winner.start_date],
    distance:[s.preferred_metrics?.distance?.value,winner.preferred_metrics?.distance?.value],
    unit:[s.preferred_metrics?.distance?.unit,winner.preferred_metrics?.distance?.unit]
  }))
}))
const plausibleTwin = s => {
  const peers = baseline.filter(other => other.canonical_type === s.canonical_type && date(other) === date(s))
  return peers.map(other => ({
    other,
    gap: hours(s,other),
    distMatch: nearDistance(s,other),
    sameSource: source(s) === source(other)
  })).sort((a,b) => (a.distMatch===b.distMatch ? 0 : a.distMatch ? -1 : 1) || a.gap-b.gap)[0]
}
const restoredEvidence = revived.map(s => ({s,match:plausibleTwin(s)})).filter(x=>x.match)
const reportBucket = ({match}) => {
  const g=match.gap
  const band= !Number.isFinite(g) ? "no_timestamp" : g<=.25 ? "<=15min" : g<=2 ? "15min-2h" : g<=8 ? "2-8h" : ">8h"
  return (match.distMatch ? "same_dist_" : "other_dist_") + (match.sameSource ? "same_src_" : "diff_src_") + band
}
console.log("[canonical-restored-evidence]", JSON.stringify({
  count:restoredEvidence.length,
  buckets:by(restoredEvidence, reportBucket),
  missingPeer:revived.length-restoredEvidence.length,
  examplesStrongPotentiallySeparate:restoredEvidence.filter(x=>x.match.sameSource && x.match.gap>2 && x.match.distMatch).slice(0,8).map(({s,match})=>({
    ids:[s.session_id,match.other.session_id],starts:[s.start_date,match.other.start_date],
    sources:[source(s),source(match.other)],distances:[s.preferred_metrics?.distance,match.other.preferred_metrics?.distance]
  }))
}))
console.log("[canonical-matching-audit]", JSON.stringify(counts))
if(baseline.length<100 || proposed.length<100) throw Error("Unexpected loss of canonical history")
