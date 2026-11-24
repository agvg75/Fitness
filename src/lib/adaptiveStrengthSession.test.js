import test from "node:test"
import assert from "node:assert/strict"
import { proposeAdaptiveStrengthSession as run } from "./adaptiveStrengthSession.js"
const exercise = [{id:"chest",n:"Chest press",activeVariant:"machine",variants:{machine:{sets:"3",reps:"8",load:"110"}}}]
const log = (date, actual={sets:3,reps:8,load:100}, extra={}) => ({date,session_id:date,exercises:[{exercise_id:"chest",variant:"machine",actual,...extra}]})
const testCase = (overrides={}) => run({exercises:exercise,scheduleLog:[log("2026-11-20"),log("2026-11-17")],selectedDate:"2026-11-23",day:"Mon",...overrides})
test("two same variant observations below template suggest last recorded load",()=>{
 const x=testCase(); assert.equal(x.proposals.length,1); assert.equal(x.proposals[0].after.load,"100")
})
test("manual edits protected",()=>assert.equal(testCase({fields:{Mon_chest:{sets:"4"}}}).proposals.length,0))
test("one observation insufficient to change load",()=>assert.equal(testCase({scheduleLog:[log("2026-11-20")]}).proposals.length,0))
test("no load increase",()=>assert.equal(testCase({scheduleLog:[log("2026-11-20",{sets:3,reps:8,load:120}),log("2026-11-17",{sets:3,reps:8,load:120})]}).proposals.length,0))
test("exercise gap reduces one set only if other recorded training exists recently",()=>{
 const x=testCase({scheduleLog:[log("2026-10-30"),{date:"2026-11-22",session_id:"another",exercises:[]}]})
 assert.equal(x.proposals[0].after.sets,"2");assert.equal(x.proposals[0].after.load,"110")
})
test("stale records block adaptation",()=>{
 const x=testCase({scheduleLog:[log("2026-10-01")]});assert.equal(x.eligible,false);assert.equal(x.proposals.length,0)
})
test("deload can propose one fewer set",()=>{
 const x=testCase({readiness:"deload"});assert.equal(x.proposals[0].after.sets,"2");assert.equal(x.proposals[0].after.load,"110")
})
test("other exercise IDs cannot influence this exercise",()=>{
 const x=testCase({scheduleLog:[{date:"2026-11-20",exercises:[{exercise_id:"row",actual:{sets:3,reps:8,load:70}}]}]});assert.equal(x.proposals.length,0)
})
test("other variants cannot influence numeric loads",()=>{
 const x=testCase({scheduleLog:[log("2026-11-20",undefined,{variant:"db"}),log("2026-11-17",undefined,{variant:"db"})]});assert.equal(x.proposals.length,0)
})
test("invalid and future dates excluded",()=>assert.equal(testCase({scheduleLog:[log("2026-11-31"),log("2026-11-28")]}).proposals.length,0))
test("duplicate sessions do not count twice",()=>assert.equal(testCase({scheduleLog:[log("2026-11-20"),log("2026-11-20")]}).proposals.length,0))
test("unconfirmed workouts excluded",()=>assert.equal(testCase({scheduleLog:[log("2026-11-20",undefined,{completed:false}),log("2026-11-17",undefined,{omitted:true})]}).proposals.length,0))
test("never treat bodyweight as a number",()=>{
 const x=testCase({exercises:[{id:"chest",n:"Chin up",activeVariant:"machine",variants:{machine:{sets:"3",reps:"8",load:"BW"}}}]});assert.equal(x.proposals.length,0)
})
test("pure, no input mutation",()=>{
 const a={exercises:exercise,scheduleLog:[log("2026-11-20"),log("2026-11-17")],selectedDate:"2026-11-23",day:"Mon"}
 const s=JSON.stringify(a);run(a);assert.equal(JSON.stringify(a),s)
})
