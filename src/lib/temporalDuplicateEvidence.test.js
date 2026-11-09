import assert from "node:assert/strict"
import test from "node:test"
import { temporalDuplicateEvidence, findTemporalDuplicateCandidates, auditTemporalRetention } from "./temporalDuplicateEvidence.js"
const record=(id,type,start,duration=40)=>({
  session_id:id,canonical_type:type,start_date:start,
  end_date:new Date(Date.parse(start)+duration*60000).toISOString(),
  sources:{apple:{start_date:start}}
})
test("same category overlap exactly 80% of shorter interval",()=>{
 const a=record("a","Running","2026-01-01T10:00:00Z")
 const b=record("b","Running","2026-01-01T10:08:00Z")
 const x=temporalDuplicateEvidence(a,b)
 assert.equal(x.classification,"duplicate_candidate")
 assert.equal(x.overlapMinutes,32)
 assert.equal(x.overlapFraction,.8)
})
test("overlap less than 80 percent is not duplicate even same day",()=>{
 const a=record("a","Running","2026-01-01T10:00:00Z")
 const b=record("b","Running","2026-01-01T10:09:00Z")
 assert.equal(temporalDuplicateEvidence(a,b).classification,"not_match")
})
test("different workout categories never match despite full overlap",()=>{
 const a=record("a","Running","2026-01-01T10:00:00Z")
 const b=record("b","Swimming","2026-01-01T10:00:00Z")
 assert.equal(temporalDuplicateEvidence(a,b).reason,"different_categories")
})
test("short recording nested within a long one counts using shorter duration",()=>{
 const a=record("a","Traditional Strength Training","2026-01-01T10:00:00Z",100)
 const b=record("b","Strength","2026-01-01T10:10:00Z",20)
 assert.equal(temporalDuplicateEvidence(a,b).overlapFraction,1)
})
test("cross midnight uses actual minutes, not dates",()=>{
 const a=record("a","Running","2026-01-01T23:50:00Z")
 const b=record("b","Running","2026-01-02T00:00:00Z")
 assert.equal(temporalDuplicateEvidence(a,b).overlapMinutes,30)
 assert.equal(findTemporalDuplicateCandidates([a,b]).length,0)
 const c=record("c","Run","2026-01-01T23:55:00Z")
 assert.equal(findTemporalDuplicateCandidates([a,c]).length,1)
})
test("date-only and missing endpoints cannot count as duplicate",()=>{
 const a=record("a","Running","2026-01-01T10:00:00Z")
 const b={...a,session_id:"b",sources:{fitnessview:{timing_precision:"date_only"}}}
 assert.equal(temporalDuplicateEvidence(a,b).reason,"missing_precise_times")
 assert.equal(findTemporalDuplicateCandidates([a,b]).length,0)
})
test("same source overlapping records remain candidates for review",()=>{
 const a=record("a","Cycling","2026-01-01T10:00:00Z")
 const b=record("b","Bike","2026-01-01T10:02:00Z")
 assert.equal(findTemporalDuplicateCandidates([a,b]).length,1)
})
test("audit identifies removed record with retained timed counterpart",()=>{
 const a=record("a","Running","2026-01-01T10:00:00Z")
 const b=record("b","Running","2026-01-01T10:02:00Z")
 const c=record("c","Running","2026-01-01T19:00:00Z")
 const audit=auditTemporalRetention([a,b,c],[a])
 assert.equal(audit.removedWithTemporalMatch,1)
 assert.equal(audit.removedWithoutTemporalMatch,1)
 assert.equal(audit.candidatePairs,1)
})
