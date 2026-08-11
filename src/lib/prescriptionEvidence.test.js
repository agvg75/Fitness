import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  buildPrescriptionContext,
  characterizeFinalizedSession,
  sanitizeOmissionDispositions,
} from "./prescriptionEvidence.js"

const TUESDAY_IDS = ["t1", "t_abd", "t2a", "t2b", "t_hec", "t6b", "t7", "t8"]
const WEDNESDAY_TENDON_IDS = [
  "tibialis_raise_wed", "eccentric_calf_raise_wed", "hip_flexor_iso_wed", "face_pull_band_wed",
  "tke_band_wed", "eccentric_bicep_curl_wed", "arm_pump_curl_wed", "arm_pump_pushdown_wed",
]
const exercise = id => ({ id, name: id, def: [{ r: "8", w: "10" }] })
const planDay = ids => ({ sections: [{ h: "Main", ex: ids.map(exercise) }] })

function extractBalanced(source, startIndex, open, close) {
  let depth = 0
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1
    if (source[index] === close) depth -= 1
    if (depth === 0) return source.slice(startIndex, index + 1)
  }
  throw new Error(`Unbalanced ${open}${close}`)
}

async function currentPlanIds(day, nextDay, field) {
  const source = await readFile(new URL("../App.jsx", import.meta.url), "utf8")
  const start = source.indexOf(`  ${day}: {`, source.indexOf("const PLAN ="))
  const end = source.indexOf(`  ${nextDay}: {`, start)
  const block = source.slice(start, end)
  const listStart = block.indexOf(`${field}: [`) + `${field}: `.length
  if (listStart < `${field}: `.length) return []
  return [...extractBalanced(block, listStart, "[", "]").matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1])
}

test("Tuesday snapshot contains exactly the approved authoritative IDs", async () => {
  const ids = await currentPlanIds("Tue", "Wed", "sections")
  assert.deepEqual(ids, TUESDAY_IDS)
  const context = buildPrescriptionContext({ planDay: planDay(ids), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  assert.deepEqual(context.prescribed_strength_ids, TUESDAY_IDS)
})

test("custom work and saved ordering cannot affect snapshot membership", () => {
  const context = buildPrescriptionContext({
    planDay: planDay(TUESDAY_IDS), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1",
    customExercises: [{ id: "custom_hip_adduction" }], exerciseOrder: ["custom_hip_adduction", "t8"],
  })
  assert.deepEqual(context.prescribed_strength_ids, TUESDAY_IDS)
  assert.equal(context.prescribed_strength_ids.includes("custom_hip_adduction"), false)
})

test("fingerprint ignores decoration but changes with prescribed volume", () => {
  const base = buildPrescriptionContext({ planDay: planDay(["t1"]), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  const decorated = buildPrescriptionContext({
    planDay: planDay(["t1"]), day: "Tue", sessionDate: "2026-08-12", releaseId: "r2",
    fields: { t1: { load: "999" } }, exerciseOrder: ["t1"], customExercises: [{ id: "custom_x" }],
  })
  const changedPlan = planDay(["t1"])
  changedPlan.sections[0].ex[0].def[0].w = "20"
  const changed = buildPrescriptionContext({ planDay: changedPlan, day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  assert.equal(base.plan_fingerprint, decorated.plan_fingerprint)
  assert.notEqual(base.plan_fingerprint, changed.plan_fingerprint)
})

test("Wednesday snapshot has zero strength and exactly eight tendon IDs", async () => {
  const tendonIds = await currentPlanIds("Wed", "Thu", "tendon")
  assert.deepEqual(tendonIds, WEDNESDAY_TENDON_IDS)
  const context = buildPrescriptionContext({
    planDay: { sections: [], tendon: tendonIds.map(exercise) }, day: "Wed", sessionDate: "2026-08-12", releaseId: "r1",
  })
  assert.deepEqual(context.prescribed_strength_ids, [])
  assert.deepEqual(context.prescribed_tendon_ids, WEDNESDAY_TENDON_IDS)
})

test("six included Tuesday exercises produce exactly two omissions", () => {
  const prescription_context = buildPrescriptionContext({ planDay: planDay(TUESDAY_IDS), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  const exercises = TUESDAY_IDS.slice(0, 6).map(exercise_id => ({ exercise_id, actual: { sets: "3", reps: "8", load: "10" } }))
  const evidence = characterizeFinalizedSession({ prescription_context, exercises })
  assert.deepEqual(evidence.filter(item => !item.included).map(item => item.exercise_id), ["t7", "t8"])
})

test("draft sessions do not generate finalized evidence", () => {
  const prescription_context = buildPrescriptionContext({ planDay: planDay(TUESDAY_IDS), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  assert.deepEqual(characterizeFinalizedSession({ prescription_context, exercises: [] }, { finalized: false }), [])
})

test("included default fields still count as included and variants are not substitutions", () => {
  const prescription_context = buildPrescriptionContext({ planDay: planDay(["t1"]), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  const [evidence] = characterizeFinalizedSession({ prescription_context, exercises: [{ exercise_id: "t1", variant: "machine" }] })
  assert.equal(evidence.evidence_class, "included")
  assert.equal(evidence.omission_reason, null)
})

test("explicit time and intentional omissions remain distinct", () => {
  const prescription_context = buildPrescriptionContext({ planDay: planDay(["t1", "t8"]), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  const evidence = characterizeFinalizedSession({ prescription_context, exercises: [], omission_dispositions: { t1: { reason: "time" }, t8: { reason: "intentional" } } })
  assert.deepEqual(evidence.map(item => item.evidence_class), ["explicit_time_omission", "explicit_intentional_skip"])
})

test("structured substitution and OC block remain distinct", () => {
  const prescription_context = buildPrescriptionContext({ planDay: planDay(["t1", "t8"]), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  const evidence = characterizeFinalizedSession({
    prescription_context,
    exercises: [{ exercise_id: "custom_bridge", variant: "custom" }],
    omission_dispositions: {
      t1: { reason: "substituted", substitute_exercise_id: "custom_bridge" },
      t8: { reason: "oc_blocked", oc_item_id: "oc-knee" },
    },
  })
  assert.equal(evidence[0].evidence_class, "explicit_substitution")
  assert.equal(evidence[0].substitute_exercise_id, "custom_bridge")
  assert.equal(evidence[1].evidence_class, "explicit_oc_block")
})

test("only absent authoritative IDs can retain omission dispositions", () => {
  const context = buildPrescriptionContext({ planDay: planDay(["t1", "t8"]), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  assert.deepEqual(sanitizeOmissionDispositions(context, ["t1"], {
    t1: { reason: "time" }, custom_fake: { reason: "time" }, t8: { reason: "contraindicated" },
  }), { t8: { reason: "contraindicated", substitute_exercise_id: null, oc_item_id: null } })
})

test("legacy entries remain valid and new metadata survives serialization hydration", () => {
  const legacy = { id: 1, exercises: [{ exercise_id: "t1" }] }
  assert.deepEqual(characterizeFinalizedSession(legacy), [])
  const prescription_context = buildPrescriptionContext({ planDay: planDay(["t1", "t8"]), day: "Tue", sessionDate: "2026-08-11", releaseId: "r1" })
  const entry = { id: 2, prescription_context, omission_dispositions: { t8: { reason: "time", substitute_exercise_id: null, oc_item_id: null } } }
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), entry)
})
