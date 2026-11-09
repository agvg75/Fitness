import assert from "node:assert/strict"
import test from "node:test"
import {reviewPairIdentity,reviewStorageKey,savePairReview,loadPairReviews,normalizeReviewDecision} from "./duplicateReviewPersistence.js"

const rec=(id,start)=>({session_id:id,canonical_type:"Running",start_date:start,end_date:"2026-11-01T14:00:00Z"})
const a=rec("apple","2026-11-01T13:00:00Z"),b=rec("techno","2026-11-01T13:02:00Z")
function mockStore() {
  const rows=new Map()
  const seen=[]
  return {
    seen,
    from(name) {
      assert.equal(name,"user_kv")
      return {
        async upsert(row,opts) {
          assert.equal(opts.onConflict,"user_id,key")
          seen.push({op:"upsert",row})
          rows.set(row.user_id + "|" + row.key,row)
          return {error:null}
        },
        select() {return this},
        eq(field,value) {assert.equal(field,"user_id");this.user=value;return this},
        like(field,pattern) {assert.equal(field,"key");this.pattern=pattern.slice(0,-1);return this},
        order() {return this},
        async range(start,end) {
          const values=[...rows.values()].filter(x=>x.user_id===this.user && x.key.startsWith(this.pattern))
            .sort((x,y)=>x.key.localeCompare(y.key)).slice(start,end+1)
          return {data:values.map(x=>({key:x.key,value:x.value})),error:null}
        }
      }
    }
  }
}
test("review identity is direction-independent and changes with the record timestamps",()=>{
  assert.equal(reviewPairIdentity(a,b),reviewPairIdentity(b,a))
  assert.notEqual(reviewPairIdentity(a,b),reviewPairIdentity(a,{...b,start_date:"2026-11-01T13:03:00Z"}))
  assert.equal(reviewPairIdentity(a,{...a}),null)
})
test("pair key is bounded, deterministic and scoped by both records",()=>{
  const key=reviewStorageKey(reviewPairIdentity(a,b))
  assert.ok(key.startsWith("lift_duplicate_review_v2:"))
  assert.ok(key.length<70)
  assert.notEqual(key,reviewStorageKey(reviewPairIdentity(a,{...b,session_id:"another"})))
})
test("per-pair writes preserve independent decisions and round-trip",async()=>{
  const db=mockStore(),p=reviewPairIdentity(a,b),q=reviewPairIdentity(a,{...b,session_id:"another"})
  await savePairReview(db,"user-1",p,"same","2026-11-09T14:00:00Z")
  await savePairReview(db,"user-1",q,"distinct","2026-11-09T14:01:00Z")
  const result=await loadPairReviews(db,"user-1")
  assert.equal(result[p].decision,"same")
  assert.equal(result[q].decision,"distinct")
  assert.equal(Object.keys(result).length,2)
})
test("records are kept per user and not disclosed to others",async()=>{
  const db=mockStore(),p=reviewPairIdentity(a,b)
  await savePairReview(db,"user-1",p,"same")
  assert.deepEqual(await loadPairReviews(db,"user-2"),{})
})
test("reject unauthenticated saves, unknown decisions, and stale pair identity",async()=>{
  const db=mockStore(),p=reviewPairIdentity(a,b)
  await assert.rejects(()=>savePairReview(db,"",p,"same"))
  await assert.rejects(()=>savePairReview(db,"user-1",p,"merge_now"))
  assert.equal(normalizeReviewDecision({pair_identity:"stale",decision:"same"},p),null)
})
test("Supabase persistence errors are propagated",async()=>{
  const db={from:()=>({upsert:async()=>({error:{message:"Denied"}})})}
  await assert.rejects(()=>savePairReview(db,"user-1",reviewPairIdentity(a,b),"same"),/Denied/)
})
