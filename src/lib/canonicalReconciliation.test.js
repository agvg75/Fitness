import assert from "node:assert/strict"
import test from "node:test"
import { dedupeCanonicalSessions, reconcileCanonicalSessions, mergeCanonicalSessionsPreferPrimary } from "./canonicalSessions.js"

const workout = (id, source, start, minutes=40, type="Running") => ({
  session_id:id,canonical_type:type,
  start_date:start,
  end_date:new Date(Date.parse(start)+minutes*60000).toISOString(),
  duration_min:minutes,
  preferred_metrics:{distance:{value:3.1,unit:"mi",source}},
  sources:{[source]:{start_date:start,distance:3.1,distance_unit:"mi"}}
})
test("same day, same distance, different times remain separate",()=>{
  const a=workout("early","apple","2026-11-01T13:00:00Z")
  const b=workout("late","technogym","2026-11-01T19:00:00Z")
  assert.equal(dedupeCanonicalSessions([a,b]).length,2)
})
test("matching timed workouts from independent sources uniquely merge",()=>{
  const a=workout("apple","apple","2026-11-01T13:00:00Z")
  const b=workout("techno","technogym","2026-11-01T13:02:00Z")
  const r=reconcileCanonicalSessions([a,b])
  assert.equal(r.sessions.length,1)
  assert.equal(r.summary.automaticMerges,1)
  assert.ok(r.sessions[0].sources.apple)
  assert.ok(r.sessions[0].sources.technogym)
})
test("same-source overlaps remain for review without losing recordings",()=>{
  const a=workout("apple1","apple","2026-11-01T13:00:00Z")
  const b=workout("apple2","apple","2026-11-01T13:02:00Z")
  const r=reconcileCanonicalSessions([a,b])
  assert.equal(r.sessions.length,2)
  assert.equal(r.review.length,1)
  assert.equal(r.review[0].reason,"shared_or_unknown_source")
})
test("multiple candidate matches remain unresolved rather than greedy mergers",()=>{
  const a=workout("a","apple","2026-11-01T13:00:00Z")
  const b=workout("b","technogym","2026-11-01T13:01:00Z")
  const c=workout("c","fitnessview","2026-11-01T13:02:00Z")
  const r=reconcileCanonicalSessions([a,b,c])
  assert.equal(r.sessions.length,3)
  assert.equal(r.summary.automaticMerges,0)
  assert.equal(r.review.length,3)
})
test("calendar boundaries do not prevent genuine timed matches",()=>{
  const a=workout("a","apple","2026-11-01T23:58:00Z")
  const b=workout("b","technogym","2026-11-02T00:00:00Z")
  assert.equal(dedupeCanonicalSessions([a,b]).length,1)
})
test("different categories never merge even if same exact time",()=>{
  const a=workout("run","apple","2026-11-01T13:00:00Z")
  const b=workout("swim","technogym","2026-11-01T13:00:00Z",40,"Swimming")
  assert.equal(dedupeCanonicalSessions([a,b]).length,2)
})
test("date-only records are preserved and never merged by invented clock times",()=>{
  const a=workout("a","apple","2026-11-01T13:00:00Z")
  const b={...workout("b","fitnessview","2026-11-01T13:00:00Z"),sources:{fitnessview:{timing_precision:"date_only",start_date:"2026-11-01"}}}
  assert.equal(dedupeCanonicalSessions([a,b]).length,2)
})
test("full identical copies collapse, but conflicting IDs with different content remain",()=>{
  const a=workout("a","apple","2026-11-01T13:00:00Z")
  const b=workout("a","apple","2026-11-01T16:00:00Z")
  const r=reconcileCanonicalSessions([a,structuredClone(a),b])
  assert.equal(r.sessions.length,2)
  assert.equal(r.summary.exactCopiesCollapsed,1)
})
test("mergePreferPrimary cannot discard same-day independent workouts",()=>{
  const a=workout("a","apple","2026-11-01T13:00:00Z")
  const b=workout("b","technogym","2026-11-01T19:00:00Z")
  assert.equal(mergeCanonicalSessionsPreferPrimary([a],[b]).length,2)
})
test("reconciliation does not modify source session objects",()=>{
  const a=workout("a","apple","2026-11-01T13:00:00Z")
  const b=workout("b","technogym","2026-11-01T13:02:00Z")
  const before=JSON.stringify([a,b])
  reconcileCanonicalSessions([a,b])
  assert.equal(JSON.stringify([a,b]),before)
})
