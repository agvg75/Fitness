import assert from "node:assert/strict"
import test from "node:test"
import {distanceInMiles,timingPrecision,sessionLocalDate,matchEvidence,findSourceAwareCandidates} from "./sourceAwareIdentity.js"

const timed=(id,source,start,end,value=3.1,unit="mi",kind="Running")=>({
  session_id:id,canonical_type:kind,start_date:start,end_date:end,
  duration_min:(Date.parse(end)-Date.parse(start))/60000,
  preferred_metrics:{distance:{value,unit}},
  sources:{[source]:{start_date:start}}
})
const dateOnly=(id,day,value=3.1,duration=30,kind="Running")=>({
  session_id:id,canonical_type:kind,start_date:`${day}T05:00:00.000Z`,
  end_date:`${day}T05:00:00.000Z`,
  duration_min:duration,preferred_metrics:{distance:{value,unit:"mi"}},
  sources:{fitnessview:{start_date:`${day}T00:00:00`,timing_precision:"date_only"}}
})
test("meters, yards and km normalize to miles without assuming unknown units",()=>{
  assert.ok(Math.abs(distanceInMiles({value:1609.344,unit:"m"})-1)<.00001)
  assert.ok(Math.abs(distanceInMiles({value:1760,unit:"yd"})-1)<.00001)
  assert.ok(Math.abs(distanceInMiles({value:1.609344,unit:"km"})-1)<.00001)
  assert.equal(distanceInMiles({value:3,unit:"unknown"}),null)
  assert.equal(distanceInMiles({value:3}),null)
})
test("date-only FitnessView midnight is not a 05:00 exercise",()=>{
  const x=dateOnly("fv","2025-11-02")
  assert.equal(timingPrecision(x),"date_only")
  assert.equal(sessionLocalDate(x),"2025-11-02")
})
test("same distance on same day but separate timed sessions never automatically match",()=>{
  const a=timed("early","apple","2025-11-04T12:00:00Z","2025-11-04T12:40:00Z")
  const b=timed("late","technogym","2025-11-04T18:00:00Z","2025-11-04T18:40:00Z",4988.9664,"m")
  assert.equal(matchEvidence(a,b).classification,"not_match")
})
test("date-only and timed source with matching distance and duration need review",()=>{
  const a=dateOnly("fv","2025-11-02",3.1,40)
  const b=timed("apple","apple","2025-11-02T13:00:00Z","2025-11-02T13:40:00Z",3.1)
  assert.equal(matchEvidence(a,b).classification,"possible_duplicate")
  assert.equal(findSourceAwareCandidates([a,b]).length,1)
})
test("timed cross-source overlap with matching units has strong duplicate evidence",()=>{
  const a=timed("apple","apple","2026-01-01T15:00:00Z","2026-01-01T15:40:00Z")
  const b=timed("tg","technogym","2026-01-01T15:02:00Z","2026-01-01T15:42:00Z",4988.9664,"m")
  assert.equal(matchEvidence(a,b).classification,"strong_duplicate_evidence")
})
test("different modalities and calendar days never pair",()=>{
  const a=dateOnly("fv","2025-11-02",3,30)
  const b=timed("walk","apple","2025-11-02T12:00:00Z","2025-11-02T12:30:00Z",3,"mi","Walking")
  const c=dateOnly("fv-next","2025-11-03",3,30)
  assert.equal(matchEvidence(a,b).classification,"not_match")
  assert.equal(matchEvidence(a,c).classification,"not_match")
})
