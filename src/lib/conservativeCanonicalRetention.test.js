import assert from "node:assert/strict"
import test from "node:test"
import { previewConservativeRetention } from "./conservativeCanonicalRetention.js"

const workout=(id,at)=>({
  session_id:id,canonical_type:"Running",
  start_date:at,end_date:new Date(Date.parse(at)+30*60000).toISOString(),
  duration_min:30,preferred_metrics:{distance:{value:3.1,unit:"mi"}},
  sources:{apple:{start_date:at}}
})
test("same-day equal-distance distinct workouts both survive",()=>{
  const a=workout("morning","2026-11-01T13:00:00Z")
  const b=workout("evening","2026-11-01T19:00:00Z")
  const result=previewConservativeRetention([a,b])
  assert.equal(result.sessions.length,2)
})
test("same identity with identical complete payload collapses one copy",()=>{
  const a=workout("one","2026-11-01T13:00:00Z")
  const result=previewConservativeRetention([a,structuredClone(a)])
  assert.equal(result.sessions.length,1)
  assert.equal(result.summary.exactCopiesCollapsed,1)
})
test("same identity with conflicting payload is preserved for review",()=>{
  const a=workout("one","2026-11-01T13:00:00Z")
  const b=workout("one","2026-11-01T19:00:00Z")
  const result=previewConservativeRetention([a,b])
  assert.equal(result.sessions.length,2)
  assert.equal(result.summary.conflictingIds,1)
})
test("unknown identity records survive without speculative merging",()=>{
  const a=workout(null,"2026-11-01T13:00:00Z")
  const result=previewConservativeRetention([a,structuredClone(a)])
  assert.equal(result.sessions.length,2)
  assert.equal(result.summary.missingIds,2)
})
test("preview never changes supplied records",()=>{
  const a=workout("one","2026-11-01T13:00:00Z")
  const before=JSON.stringify(a)
  previewConservativeRetention([a])
  assert.equal(JSON.stringify(a),before)
})
