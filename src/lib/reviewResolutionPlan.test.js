import assert from "node:assert/strict"
import test from "node:test"
import {planReviewedWorkoutResolution} from "./reviewResolutionPlan.js"
import {reviewPairIdentity} from "./duplicateReviewPersistence.js"
const row=(id,start)=>({session_id:id,canonical_type:"Running",start_date:start,
  end_date:new Date(Date.parse(start)+40*60000).toISOString(),
  sources:{[id]:{start_date:start}}})
const a=row("a","2026-11-01T13:00:00Z"),b=row("b","2026-11-01T13:02:00Z"),
  c=row("c","2026-11-01T13:04:00Z")
const decisions=(pairs)=>Object.fromEntries(pairs.map(([x,y,d])=>[reviewPairIdentity(x,y),{decision:d}]))
test("unreviewed candidates remain pending, with no eligible pair",()=>{
 const p=planReviewedWorkoutResolution([a,b])
 assert.equal(p.pendingReview,1)
 assert.equal(p.eligibleAfterReview.length,0)
})
test("unique confirmed same pair becomes eligible only after explicit review",()=>{
 const p=planReviewedWorkoutResolution([a,b],decisions([[a,b,"same"]]))
 assert.equal(p.confirmedSame,1)
 assert.equal(p.eligibleAfterReview.length,1)
})
test("distinct decisions never enter eligible merges",()=>{
 const p=planReviewedWorkoutResolution([a,b],decisions([[a,b,"distinct"]]))
 assert.equal(p.confirmedDistinct,1)
 assert.equal(p.eligibleAfterReview.length,0)
})
test("one confirmed pair with a competing unreviewed pair remains blocked",()=>{
 const p=planReviewedWorkoutResolution([a,b,c],decisions([[a,b,"same"]]))
 assert.equal(p.blockedSame.length,1)
 assert.equal(p.eligibleAfterReview.length,0)
 assert.equal(p.blockedSame[0].reason,"unresolved_competing_pair")
})
test("confirmed same pair becomes eligible when all competing edges are distinct",()=>{
 const p=planReviewedWorkoutResolution([a,b,c],
  decisions([[a,b,"same"],[a,c,"distinct"],[b,c,"distinct"]]))
 assert.equal(p.eligibleAfterReview.length,1)
 assert.equal(p.blockedSame.length,0)
})
test("competing confirmed same edges are conflicts, not automatic merges",()=>{
 const p=planReviewedWorkoutResolution([a,b,c],
  decisions([[a,b,"same"],[a,c,"same"],[b,c,"distinct"]]))
 assert.equal(p.eligibleAfterReview.length,0)
 assert.equal(p.blockedSame.length,2)
 assert.ok(p.blockedSame.every(x=>x.reason==="conflicting_confirmed_duplicates"))
})
test("unrelated and stale decisions cannot authorize a merge",()=>{
 const p=planReviewedWorkoutResolution([a,b],{"missing":{decision:"same"}})
 assert.equal(p.staleDecisionCount,1)
 assert.equal(p.eligibleAfterReview.length,0)
})
