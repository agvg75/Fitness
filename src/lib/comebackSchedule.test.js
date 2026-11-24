import test from "node:test"
import assert from "node:assert/strict"
import { lastRecordedStrengthDate, activeComeback, proposeComeback } from "./comebackSchedule.js"
const ex=[{id:"press",n:"Press",variants:{machine:{sets:"4",reps:"8",load:"100"}}}]
const base={exercises:ex,day:"Mon",daysOff:56,week:1,readiness:"progress"}
test("eight week layoff illustrative first week halves four sets and reduces numeric load",()=>{
 const p=proposeComeback(base);assert.equal(p.proposals[0].after.sets,"2");assert.equal(p.proposals[0].after.load,"70")
})
test("no automatic increase above template",()=>{
 const p=proposeComeback({...base,week:4});assert.ok(Number(p.proposals[0]?.after.load ?? 100)<=100)
})
test("manual edit is protected",()=>assert.equal(proposeComeback({...base,fields:{Mon_press:{load:"95"}}}).proposals.length,0))
test("cached template fields remain eligible",()=>assert.equal(proposeComeback({...base,fields:{Mon_press:{sets:4,reps:8,load:100}}}).proposals.length,1))
test("injury blocks application",()=>assert.equal(proposeComeback({...base,injuryBlock:true}).eligible,false))
test("deload blocks application",()=>assert.equal(proposeComeback({...base,readiness:"deload"}).eligible,false))
test("no break is not an adjustment",()=>assert.equal(proposeComeback({...base,daysOff:7}).eligible,false))
test("out of range week is invalid",()=>assert.equal(proposeComeback({...base,week:7}).eligible,false))
test("bodyweight is not converted to numeric load",()=>{
 const p=proposeComeback({...base,exercises:[{id:"press",variants:{machine:{sets:4,reps:8,load:"BW"}}}]})
 assert.equal(p.proposals[0].after.load,"BW")
})
test("missing history is unknown rather than presumed layoff",()=>assert.equal(lastRecordedStrengthDate([],[],"2026-11-23").days,null))
test("run only does not count as strength",()=>{
 const p=lastRecordedStrengthDate([{date:"2026-11-01",canonical_type:"Running"},{date:"2026-11-03",canonical_type:"Strength"}],[],"2026-11-23")
 assert.equal(p.days,20)
})
test("only dates before selected workout are used",()=>{
 const p=lastRecordedStrengthDate([{date:"2026-12-01",canonical_type:"Strength"},{date:"2026-11-01",canonical_type:"Strength"}],[],"2026-11-23")
 assert.equal(p.days,22)
})
test("schedule cardio-only does not count as strength",()=>{
 const p=lastRecordedStrengthDate([],[{date:"2026-11-21",exercises:[{variant:"cardio"}]},{date:"2026-11-01",exercises:[{exercise_id:"press"}]}],"2026-11-23")
 assert.equal(p.days,22)
})
test("comeback state is user scoped",()=>{
 const state={userId:"u1",startDate:"2026-11-23",daysOff:56,week:1}
 assert.equal(activeComeback(state,"u1","2026-11-23"),true)
 assert.equal(activeComeback(state,"u2","2026-11-23"),false)
 assert.equal(activeComeback(state,"u1","2026-11-22"),false)
})
test("proposal is pure",()=>{
 const x={...base,fields:{}};const s=JSON.stringify(x);proposeComeback(x);assert.equal(JSON.stringify(x),s)
})
