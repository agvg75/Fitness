import assert from "node:assert/strict"
import test from "node:test"
import {assessLiveCanonicalHistory} from "./liveCanonicalAudit.js"
import {reviewPairIdentity} from "./duplicateReviewPersistence.js"
const w=(id,source,start,category="Running")=>({session_id:id,canonical_type:category,start_date:start,end_date:new Date(Date.parse(start)+40*60000).toISOString(),sources:{[source]:{start_date:start}}})
const a=w("a","apple","2026-11-01T13:00:00Z"),b=w("b","technogym","2026-11-01T13:02:00Z")
test("assess live list uses only provided records without combining bundled snapshot",()=>{
  const x=assessLiveCanonicalHistory([a,b])
  assert.equal(x.records,2)
  assert.equal(x.overlappingPairs,1)
  assert.equal(x.pendingReview,1)
  assert.deepEqual(x.sourceCounts,{apple:1,technogym:1})
})
test("approved decisions from live pair identity are counted but do not mutate records",()=>{
  const old=JSON.stringify([a,b])
  const x=assessLiveCanonicalHistory([a,b],{[reviewPairIdentity(a,b)]:{decision:"same"}})
  assert.equal(x.eligibleAfterReview,1)
  assert.equal(x.matchedSavedDecisions,1)
  assert.equal(JSON.stringify([a,b]),old)
})
test("stale snapshot decisions are not automatically applied to unrelated live pairs",()=>{
  const x=assessLiveCanonicalHistory([a,b],{"snapshot-pair":{decision:"same"}})
  assert.equal(x.staleSavedDecisions,1)
  assert.equal(x.eligibleAfterReview,0)
})
test("missing and repeated identifiers are explicitly counted",()=>{
  const x=assessLiveCanonicalHistory([a,{...a},{...b,session_id:null}])
  assert.equal(x.duplicateSessionIds,1)
  assert.equal(x.missingId,1)
  assert.ok(x.ambiguousIdentityPairs>=1)
})
test("date-only and invalid timestamps are reported without invented overlap",()=>{
  const x=assessLiveCanonicalHistory([a,{...b,start_date:"2026-11-01",end_date:null,
    sources:{fitnessview:{timing_precision:"date_only"}}}])
  assert.equal(x.dateOnly,1)
  assert.equal(x.invalidTimes,1)
  assert.equal(x.overlappingPairs,0)
})
