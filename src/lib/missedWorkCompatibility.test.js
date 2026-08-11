import assert from "node:assert/strict"
import test from "node:test"
import { CARDIO } from "../scheduleData.js"
import {
  AUGUST_EXERCISE_TAXONOMY,
  classifyCardioSession,
  estimateResistanceMinutes,
  getExerciseRelationship,
  scoreMissedWorkReceivingDays,
} from "./missedWorkCompatibility.js"

const ex = id => ({ id, def: [{ r: "8", w: "10" }] })
const day = (strength = [], tendon = [], extra = {}) => ({
  sections: strength.length ? [{ h: "Main", ex: strength.map(ex) }] : [],
  tendon: tendon.map(ex),
  ...extra,
})

const PLAN = {
  Mon: day(["chinups", "chest_press_machine", "incline_chest_press", "machine_flys", "triceps_pulldown", "triceps_overhead", "cable_incline_pushdown", "lateral_raise", "rear_delt_fly", "face_pull_er"], ["eccentric_lateral_raise_mon"]),
  Tue: day(["t1", "t_abd", "t2a", "t2b", "t_hec", "t6b", "t7", "t8"], ["mtp_balance", "eccentric_calf_raise", "tibialis_raise_dorsiflexion", "tke_patellar", "single_leg_balance"]),
  Wed: day([], ["tibialis_raise_wed", "eccentric_calf_raise_wed", "hip_flexor_iso_wed", "face_pull_band_wed", "tke_band_wed", "eccentric_bicep_curl_wed", "arm_pump_curl_wed", "arm_pump_pushdown_wed"], { topNote: "Recovery and restricted pump" }),
  Thu: day(["th10", "th11", "th5", "th8", "th_alt", "th1", "th2", "th_sp", "th9"], ["eccentric_lateral_raise", "eccentric_biceps_curl", "face_pull_tendon", "pre_run_ankle_primer"]),
  Fri: day(["f4", "f5", "f5b", "f_le", "f2", "f7", "f0"], ["tibialis_raise_primer", "eccentric_calf_lighter", "hip_flexor_isometric"]),
  Sat: day([], [], { topNote: "Long swim" }),
  Sun: day([], [], { topNote: "Long run" }),
}

const RECEIVING = [
  { day: "Wed", date: "2026-08-12" }, { day: "Thu", date: "2026-08-13" },
  { day: "Fri", date: "2026-08-14" }, { day: "Sat", date: "2026-08-15" },
  { day: "Sun", date: "2026-08-16" },
]

const candidate = (id, overrides = {}) => ({
  candidate_id: `missed:session:${id}`,
  source_session_id: "session",
  source_session_date: "2026-08-11",
  source_day: "Tue",
  source_exercise_id: id,
  source_prescription_kind: "strength",
  source_plan_fingerprint: "plan-v1-source",
  omission_reason: "time",
  evidence_class: "explicit_time_omission",
  confidence_class: "high",
  week_start: "2026-08-10",
  expires_at: "2026-08-16T23:59:59.999",
  ...overrides,
})

const score = (item, overrides = {}) => scoreMissedWorkReceivingDays({
  candidate: item, currentPlan: PLAN, currentCardio: CARDIO, receivingDates: RECEIVING, ...overrides,
})
const option = (item, receivingDay, overrides) => score(item, overrides).find(row => row.receiving_day === receivingDay)

test("taxonomy covers every current August structured strength and tendon ID", () => {
  const ids = Object.values(PLAN).flatMap(planDay => [
    ...(planDay.sections || []).flatMap(section => section.ex.map(item => item.id)),
    ...(planDay.tendon || []).map(item => item.id),
  ])
  assert.deepEqual(ids.filter(id => !AUGUST_EXERCISE_TAXONOMY[id]), [])
  assert.ok(ids.every(id => AUGUST_EXERCISE_TAXONOMY[id].id === id))
})

test("Tuesday Hip Thrust uses Friday existing slot and never adds a duplicate", () => {
  const friday = option(candidate("t1"), "Fri")
  assert.equal(friday.action, "use_existing_slot")
  assert.equal(friday.existing_slot_id, "f4")
  assert.equal(friday.existing_slot_relationship, "exact")
  assert.equal(friday.candidate_estimated_minutes, 0)
})

test("Tuesday bilateral Leg Press is not recommended for Friday", () => {
  const friday = option(candidate("t2a"), "Fri")
  assert.equal(friday.action, "not_recommended")
  assert.ok(friday.hard_exclusions.includes("heavy_compound_requires_compatible_slot"))
  assert.ok(friday.hard_exclusions.includes("lower_body_load_before_major_run"))
})

test("eccentric hamstring curl is blocked by Friday posterior-chain and run context", () => {
  const friday = option(candidate("t_hec"), "Fri")
  assert.equal(friday.action, "not_recommended")
  assert.ok(friday.score_breakdown.some(item => item.factor === "high_tissue_overlap"))
  assert.ok(friday.hard_exclusions.includes("lower_body_load_before_major_run"))
})

test("unilateral and bilateral leg extensions are close but not identical", () => {
  assert.equal(getExerciseRelationship("t6b", "f_le"), "close")
  const friday = option(candidate("t6b"), "Fri")
  assert.equal(friday.action, "use_existing_slot")
  assert.equal(friday.existing_slot_relationship, "close")
})

test("plank can be added near a later core slot without claiming equivalence", () => {
  assert.equal(getExerciseRelationship("t7", "f7"), "related")
  const friday = option(candidate("t7"), "Fri")
  assert.equal(friday.existing_slot_id, null)
  assert.notEqual(friday.existing_slot_relationship, "exact")
})

test("Monday Face Pull recognizes Wednesday and Thursday corrective slots", () => {
  const monday = candidate("face_pull_er", { source_session_date: "2026-08-10", source_day: "Mon" })
  assert.equal(option(monday, "Wed").existing_slot_id, "face_pull_band_wed")
  assert.equal(option(monday, "Thu").existing_slot_id, "face_pull_tendon")
})

test("Monday chest press and Friday cable crossover are related, never equivalent", () => {
  assert.equal(getExerciseRelationship("chest_press_machine", "f0"), "related")
  const friday = option(candidate("chest_press_machine", { source_session_date: "2026-08-10", source_day: "Mon" }), "Fri")
  assert.notEqual(friday.action, "use_existing_slot")
  assert.equal(friday.existing_slot_id, null)
})

test("Wednesday optional pump work is not redistributed by default", () => {
  const pump = candidate("arm_pump_curl_wed", {
    source_session_date: "2026-08-12", source_day: "Wed", source_prescription_kind: "tendon",
    omission_reason: "unknown", evidence_class: "unknown_omission", confidence_class: "possible",
  })
  const thursday = option(pump, "Thu")
  assert.equal(thursday.action, "not_recommended")
  assert.ok(thursday.hard_exclusions.includes("unknown_tendon_omission"))
  assert.ok(thursday.hard_exclusions.includes("optional_or_drop_first"))
})

test("unknown tendon is excluded while explicit-time tendon still receives conservative scoring", () => {
  const unknown = candidate("face_pull_band_wed", {
    source_session_date: "2026-08-12", source_day: "Wed", source_prescription_kind: "tendon",
    omission_reason: "unknown", confidence_class: "possible",
  })
  assert.ok(option(unknown, "Thu").hard_exclusions.includes("unknown_tendon_omission"))
  const timed = { ...unknown, omission_reason: "time", evidence_class: "explicit_time_omission", confidence_class: "high" }
  const thursday = option(timed, "Thu")
  assert.equal(thursday.action, "use_existing_slot")
  assert.equal(thursday.existing_slot_id, "face_pull_tendon")
})

test("symptom-sensitive explicit-time tendon work is blocked by relevant OC state", () => {
  const timed = candidate("tibialis_raise_wed", {
    source_session_date: "2026-08-12", source_day: "Wed", source_prescription_kind: "tendon",
  })
  const thursday = option(timed, "Thu", { ocState: [{ id: "oc-toe", location: "Toe L", currentScore: 2 }] })
  assert.equal(thursday.action, "not_recommended")
  assert.ok(thursday.hard_exclusions.includes("tendon_or_corrective_oc_contraindication"))
})

test("heavy compound under 48 hours is a hard exclusion", () => {
  const mondayHeavy = candidate("chest_press_machine", { source_session_date: "2026-08-10", source_day: "Mon" })
  const tuesdayOnly = [{ day: "Tue", date: "2026-08-11" }]
  const result = scoreMissedWorkReceivingDays({ candidate: mondayHeavy, currentPlan: PLAN, currentCardio: CARDIO, receivingDates: tuesdayOnly })[0]
  assert.ok(result.hard_exclusions.includes("heavy_compound_recovery_under_48h"))
  assert.equal(result.action, "not_recommended")
})

test("lower-body addition before Sunday major run is hard-blocked", () => {
  const friday = option(candidate("t_hec"), "Fri")
  assert.ok(friday.hard_exclusions.includes("lower_body_load_before_major_run"))
})

test("exact slot has lower added time than an add action", () => {
  const exact = option(candidate("t1"), "Fri")
  const addition = option(candidate("t7"), "Fri")
  assert.equal(exact.candidate_estimated_minutes, 0)
  assert.ok(addition.candidate_estimated_minutes > 0)
})

test("a clearly long receiving day penalizes an accessory addition", () => {
  const longPlan = { ...PLAN, Thu: day(Array(18).fill("th8"), []) }
  const thursday = option(candidate("lateral_raise"), "Thu", { currentPlan: longPlan })
  assert.ok(thursday.score_breakdown.some(item => item.factor === "receiving_day_over_budget"))
})

test("source fingerprint is preserved and never replaced with current PLAN identity", () => {
  assert.equal(option(candidate("t7"), "Fri").source_plan_fingerprint, "plan-v1-source")
})

test("candidate from a prior week yields no receiving options", () => {
  assert.deepEqual(score(candidate("t7", { source_session_date: "2026-08-02", week_start: "2026-07-27" })), [])
})

test("scoring does not mutate candidate, PLAN, CARDIO, or receiving dates", () => {
  const item = candidate("t7")
  const before = JSON.stringify({ item, PLAN, CARDIO, RECEIVING })
  score(item)
  assert.equal(JSON.stringify({ item, PLAN, CARDIO, RECEIVING }), before)
})

test("cardio burden classification distinguishes Sunday anchor", () => {
  assert.equal(classifyCardioSession(CARDIO.Sun.sessions[0]), "major")
  assert.equal(classifyCardioSession(CARDIO.Thu.sessions[0]), "moderate")
  assert.equal(classifyCardioSession(CARDIO.Fri.sessions[0]), "low")
  assert.ok(estimateResistanceMinutes(PLAN.Fri) > 0)
})
