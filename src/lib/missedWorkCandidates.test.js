import assert from "node:assert/strict"
import test from "node:test"
import {
  deriveMissedWorkCandidates,
  getCandidateExpiration,
  getLocalTrainingWeekEnd,
  getLocalTrainingWeekStart,
  isSameLocalTrainingWeek,
  makeMissedWorkCandidateId,
} from "./missedWorkCandidates.js"

const makeSession = ({
  prescribed = ["t8"],
  tendon = [],
  included = [],
  includedTendon = [],
  reasons = { t8: { reason: "time" } },
  date = "2026-08-11",
  finalized = true,
  fingerprint = "plan-v1-source",
  extra = {},
} = {}) => ({
  id: 101,
  session_id: "session-tue-101",
  finalized,
  logged_at: `${date}T05:30:00`,
  date,
  day: "Tue",
  prescription_context: {
    release_id: "release-source",
    plan_fingerprint: fingerprint,
    day: "Tue",
    session_date: date,
    prescribed_strength_ids: prescribed,
    prescribed_tendon_ids: tendon,
  },
  omission_dispositions: reasons,
  exercises: included.map(exercise_id => ({ exercise_id, actual: { sets: "3", reps: "8", load: "10" } })),
  tendon_work: includedTendon.map(id => ({ id })),
  ...extra,
})

const derive = (session, evaluationDate = "2026-08-14") =>
  deriveMissedWorkCandidates({ sessions: [session], evaluationDate })

test("local Monday-Sunday week helpers preserve civil dates", () => {
  assert.equal(getLocalTrainingWeekStart("2026-08-11"), "2026-08-10")
  assert.equal(getLocalTrainingWeekEnd("2026-08-11"), "2026-08-16")
  assert.equal(getCandidateExpiration("2026-08-11"), "2026-08-16T23:59:59.999")
  assert.equal(isSameLocalTrainingWeek("2026-08-10", "2026-08-16"), true)
  assert.equal(isSameLocalTrainingWeek("2026-08-16", "2026-08-17"), false)
})

test("explicit time omission creates one high-confidence candidate", () => {
  const { candidates } = derive(makeSession())
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].source_exercise_id, "t8")
  assert.equal(candidates[0].confidence_class, "high")
  assert.equal(candidates[0].evidence_class, "explicit_time_omission")
})

test("unknown omission creates a possible candidate", () => {
  const { candidates } = derive(makeSession({ reasons: {} }))
  assert.equal(candidates[0].confidence_class, "possible")
  assert.equal(candidates[0].evidence_class, "unknown_omission")
})

for (const [reason, exclusion] of [
  ["intentional", "explicit_intentional"],
  ["substituted", "explicit_substituted"],
  ["oc_blocked", "explicit_oc_blocked"],
  ["contraindicated", "explicit_contraindicated"],
]) {
  test(`${reason} omission is excluded`, () => {
    const { candidates, exclusions } = derive(makeSession({ reasons: { t8: { reason } } }))
    assert.deepEqual(candidates, [])
    assert.equal(exclusions[0].confidence_class, "excluded")
    assert.equal(exclusions[0].exclusion_reason, exclusion)
  })
}

test("included exercise, including untouched defaults, is not a candidate", () => {
  const { candidates, exclusions } = derive(makeSession({ included: ["t8"] }))
  assert.deepEqual(candidates, [])
  assert.equal(exclusions[0].exclusion_reason, "included")
})

test("custom exercise absence cannot create a candidate", () => {
  const session = makeSession({ prescribed: ["t8"], reasons: {} })
  session.custom_exercises = [{ exercise_id: "custom_missing" }]
  const { candidates } = derive(session)
  assert.deepEqual(candidates.map(item => item.source_exercise_id), ["t8"])
})

test("legacy session is marked insufficient without inferred candidates", () => {
  const legacy = { id: 9, session_id: "legacy", date: "2026-08-11", logged_at: "2026-08-11T05:30:00", exercises: [] }
  const { candidates, exclusions } = derive(legacy)
  assert.deepEqual(candidates, [])
  assert.equal(exclusions[0].exclusion_reason, "insufficient_historical_prescription")
})

test("candidate remains valid later in the same week", () => {
  assert.equal(derive(makeSession(), "2026-08-16").candidates.length, 1)
})

test("candidate expires after Sunday and is invisible the following Monday", () => {
  for (const evaluationDate of ["2026-08-17", "2026-08-20"]) {
    const { candidates, exclusions } = derive(makeSession(), evaluationDate)
    assert.deepEqual(candidates, [])
    assert.equal(exclusions[0].exclusion_reason, "week_expired")
  }
})

test("Sunday source cannot create Monday debt", () => {
  const { candidates, exclusions } = derive(makeSession({ date: "2026-08-16" }), "2026-08-17")
  assert.deepEqual(candidates, [])
  assert.equal(exclusions[0].exclusion_reason, "week_expired")
})

test("source fingerprint remains unchanged when a current PLAN argument is supplied", () => {
  const session = makeSession({ fingerprint: "plan-v1-immutable-source" })
  const result = deriveMissedWorkCandidates({
    sessions: [session], evaluationDate: "2026-08-14", currentPlan: { Tue: { sections: [] } },
  })
  assert.equal(result.candidates[0].source_plan_fingerprint, "plan-v1-immutable-source")
})

test("candidate ID is deterministic and scoped to session plus exercise", () => {
  const first = derive(makeSession()).candidates[0].candidate_id
  const second = derive(makeSession()).candidates[0].candidate_id
  assert.equal(first, second)
  assert.equal(first, makeMissedWorkCandidateId("session-tue-101", "t8"))
  assert.notEqual(first, makeMissedWorkCandidateId("session-tue-102", "t8"))
})

test("carryover-origin work cannot recursively generate a candidate", () => {
  const session = makeSession({ extra: { carryover_provenance: { t8: { candidate_id: "prior" } } } })
  const { candidates, exclusions } = derive(session)
  assert.deepEqual(candidates, [])
  assert.equal(exclusions[0].exclusion_reason, "carryover_recursion_guard")
})

test("multiple omissions create independent candidates", () => {
  const session = makeSession({
    prescribed: ["t7", "t8"],
    reasons: { t7: { reason: "time" }, t8: { reason: "unknown" } },
  })
  const { candidates } = derive(session)
  assert.deepEqual(candidates.map(item => item.source_exercise_id), ["t7", "t8"])
  assert.notEqual(candidates[0].candidate_id, candidates[1].candidate_id)
})

test("fully completed finalized session creates no candidates", () => {
  const { candidates } = derive(makeSession({ prescribed: ["t7", "t8"], included: ["t7", "t8"] }))
  assert.deepEqual(candidates, [])
})

test("draft session creates no candidate", () => {
  const { candidates, exclusions } = derive(makeSession({ finalized: false }))
  assert.deepEqual(candidates, [])
  assert.equal(exclusions[0].exclusion_reason, "source_not_finalized")
})

test("structured tendon membership uses tendon_work inclusion", () => {
  const session = makeSession({ prescribed: [], tendon: ["tendon_a", "tendon_b"], includedTendon: ["tendon_a"], reasons: {} })
  const { candidates, exclusions } = derive(session)
  assert.deepEqual(candidates.map(item => item.source_exercise_id), ["tendon_b"])
  assert.equal(candidates[0].source_prescription_kind, "tendon")
  assert.equal(exclusions.find(item => item.source_exercise_id === "tendon_a")?.exclusion_reason, "included")
})
