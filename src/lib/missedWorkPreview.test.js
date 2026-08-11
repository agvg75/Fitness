import assert from "node:assert/strict"
import test from "node:test"
import { CARDIO } from "../scheduleData.js"
import { selectMissedWorkPreview } from "./missedWorkPreview.js"

const ex = (id, name = id, sets = [{ r: "8", w: "10" }]) => ({ id, name, def: sets })
const day = (strength = [], tendon = [], extra = {}) => ({ sections: strength.length ? [{ h: "Main", ex: strength }] : [], tendon, ...extra })
const PLAN = {
  Tue: day(["t1", "t_abd", "t2a", "t2b", "t_hec", "t6b", "t7", "t8"].map(id => ex(id, { t1: "Hip Thrust", t7: "Plank" }[id] || id))),
  Wed: day([], [ex("face_pull_band_wed", "Face Pull"), ex("arm_pump_curl_wed", "Arm Pump Curl")], { topNote: "Recovery" }),
  Thu: day([ex("face_pull_tendon", "Face Pull"), ex("th9", "Suitcase Carry")]),
  Fri: day([ex("f4", "Hip Thrust", [{ r: "10", w: "120" }]), ex("f5", "Romanian Deadlift"), ex("f5b", "Back Extension"), ex("f_le", "Leg Extension"), ex("f2", "Hip Adduction"), ex("f7", "Pallof Press"), ex("f0", "Cable Crossover")]),
  Sat: day([], [], { topNote: "Long swim" }),
  Sun: day([], [], { topNote: "Long run" }),
}

const session = ({ omitted = ["t1"], reasons = { t1: { reason: "time" } }, date = "2026-08-11", id = "tue-session", tendon = [], tendonDone = [], extra = {} } = {}) => {
  const prescribed = ["t1", "t_abd", "t2a", "t2b", "t_hec", "t6b", "t7", "t8"]
  return {
    id, session_id: id, date, day: "Tue", logged_at: `${date}T05:30:00`,
    prescription_context: { day: "Tue", session_date: date, plan_fingerprint: "plan-source", prescribed_strength_ids: prescribed, prescribed_tendon_ids: tendon },
    omission_dispositions: reasons,
    exercises: prescribed.filter(exerciseId => !omitted.includes(exerciseId)).map(exercise_id => ({ exercise_id, actual: { sets: "3", reps: "8", load: "10" } })),
    tendon_work: tendonDone.map(tendonId => ({ id: tendonId })),
    ...extra,
  }
}

const preview = (sessions, selectedDate = "2026-08-14", selectedDay = "Fri", overrides = {}) => selectMissedWorkPreview({
  sessions, selectedDate, selectedDay, currentPlan: PLAN, currentCardio: CARDIO, ...overrides,
})

test("Tuesday timed Hip Thrust produces Friday existing-slot preview and marker", () => {
  const result = preview([session()])
  assert.equal(result.actionable[0].action, "use_existing_slot")
  assert.equal(result.actionable[0].existing_slot_id, "f4")
  assert.equal(result.priority_markers.f4.label, "Priority from Tue")
})

test("existing-slot preview does not mutate membership or prescribed volume", () => {
  const before = JSON.stringify(PLAN.Fri)
  const result = preview([session()])
  assert.equal(JSON.stringify(PLAN.Fri), before)
  assert.deepEqual(PLAN.Fri.sections[0].ex.find(item => item.id === "f4").def, [{ r: "10", w: "120" }])
  assert.equal(result.priority_markers.f4.slot_id, "f4")
})

test("Plank can preview Could add while remaining outside prescribed membership", () => {
  const result = preview([session({ omitted: ["t7"], reasons: { t7: { reason: "time" } } })])
  const row = result.actionable.find(item => item.source_exercise_id === "t7")
  assert.equal(row.action, "add")
  assert.equal(row.action_label, "Could add")
  assert.equal(PLAN.Fri.sections[0].ex.some(item => item.id === "t7"), false)
})

for (const id of ["t2a", "t_hec"]) {
  test(`${id} is not exposed as an actionable Friday addition`, () => {
    const result = preview([session({ omitted: [id], reasons: { [id]: { reason: "time" } } })])
    assert.equal(result.actionable.some(item => item.source_exercise_id === id), false)
    assert.equal(result.excluded.some(item => item.source_exercise_id === id), true)
  })
}

test("unknown tendon and optional pump omissions stay out of normal recommendations", () => {
  const wed = session({
    omitted: [], date: "2026-08-12", id: "wed-session", tendon: ["face_pull_band_wed", "arm_pump_curl_wed"], tendonDone: [], reasons: {},
    extra: { day: "Wed", prescription_context: { day: "Wed", session_date: "2026-08-12", plan_fingerprint: "wed-source", prescribed_strength_ids: [], prescribed_tendon_ids: ["face_pull_band_wed", "arm_pump_curl_wed"] } },
  })
  const result = preview([wed], "2026-08-13", "Thu")
  assert.deepEqual(result.actionable, [])
  assert.ok(result.excluded.some(item => item.source_exercise_id === "face_pull_band_wed"))
  assert.ok(result.excluded.some(item => item.source_exercise_id === "arm_pump_curl_wed"))
})

test("unknown strength is visibly uncertain and time omission is explicit", () => {
  const unknown = preview([session({ omitted: ["t7"], reasons: {} })]).actionable[0]
  const timed = preview([session({ omitted: ["t7"], reasons: { t7: { reason: "time" } } })]).actionable[0]
  assert.equal(unknown.uncertainty_label, "Possible missed work")
  assert.equal(unknown.omission_label, "reason unknown")
  assert.equal(timed.uncertainty_label, "Missed work")
  assert.equal(timed.omission_label, "ran out of time")
})

test("selected Schedule date controls derivation, excluding future source sessions", () => {
  const plank = session({ omitted: ["t7"], reasons: { t7: { reason: "time" } } })
  assert.equal(preview([plank], "2026-08-12", "Wed").actionable.length > 0, true)
  assert.equal(preview([session()], "2026-08-10", "Mon").has_preview, false)
})

test("prior-week and legacy sessions do not generate previews", () => {
  const prior = session({ date: "2026-08-04" })
  const legacy = { id: "legacy", session_id: "legacy", date: "2026-08-11", logged_at: "2026-08-11T05:30:00", exercises: [] }
  assert.equal(preview([prior]).has_preview, false)
  assert.equal(preview([legacy]).has_preview, false)
})

test("preview selector is pure and debug mirrors compatibility output", () => {
  const log = [session()]
  const before = JSON.stringify({ PLAN, CARDIO, log })
  const result = preview(log)
  assert.equal(JSON.stringify({ PLAN, CARDIO, log }), before)
  const row = result.actionable[0]
  assert.equal(row.debug.candidate_id, row.candidate_id)
  assert.equal(row.debug.source_exercise_id, row.source_exercise_id)
  assert.equal(row.debug.compatibility_score, row.score)
  assert.deepEqual(row.debug.score_breakdown, row.score_breakdown)
  assert.deepEqual(row.debug.hard_exclusions, row.hard_exclusions)
  assert.equal(row.debug.existing_slot_id, row.existing_slot_id)
  assert.equal(row.debug.estimated_added_minutes, row.candidate_estimated_minutes)
})

test("no recommendations preserve an empty rendering projection", () => {
  const result = preview([session({ omitted: [] })])
  assert.deepEqual(result.actionable, [])
  assert.equal(result.has_preview, false)
  assert.deepEqual(result.priority_markers, {})
})
