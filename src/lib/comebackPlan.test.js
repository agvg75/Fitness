import test from "node:test"
import assert from "node:assert/strict"
import { buildReentryPlan, countRecordedComebacks } from "./comebackPlan.js"
test("breaks shorter than 14 days have no ramp",()=>{assert.equal(buildReentryPlan(13),null);assert.equal(buildReentryPlan(null),null)})
test("20-day gap produces one-week illustrative plan",()=>{
  const p=buildReentryPlan(20);assert.equal(p.weeks,1);assert.equal(p.steps[0].loadFactor,0.8);assert.equal(p.steps[0].volumeFactor,0.67)
})
test("70-day gap yields five gradual illustrative weeks",()=>{
  const p=buildReentryPlan(70);assert.equal(p.weeks,5);assert.deepEqual(p.steps.map(s=>s.volumeFactor),[0.5,0.7,0.8,0.9,1]);assert.equal(p.steps[0].loadFactor,0.7)
})
test("long gaps cap at eight weeks",()=>{const p=buildReentryPlan(500);assert.equal(p.weeks,8);assert.equal(p.restartAsBeginner,true)})
test("recorded comeback means at least seven missing whole days",()=>{
  assert.equal(countRecordedComebacks(["2026-11-01","2026-11-08","2026-11-16","2026-11-20"]),1)
})
test("duplicate records are not extra comebacks",()=>{
  assert.equal(countRecordedComebacks(["2026-11-16","2026-11-01","2026-11-16"]),1)
})
test("invalid numeric inputs produce no ramp",()=>{assert.equal(buildReentryPlan(Infinity),null);assert.equal(buildReentryPlan(NaN),null)})
