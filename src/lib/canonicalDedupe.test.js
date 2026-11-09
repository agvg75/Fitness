import assert from "node:assert/strict"
import test from "node:test"
import { dedupeCanonicalSessions, makeCanonicalSessionFromScheduleLog } from "./canonicalSessions.js"

const session = ({ id, start, end, distance = 3, source = "apple", type = "Running" }) => ({
  session_id: id,
  canonical_type: type,
  start_date: start,
  end_date: end,
  duration_min: (Date.parse(end) - Date.parse(start)) / 60000,
  preferred_metrics: { distance: { value: distance, unit: "mi", source } },
  sources: { [source]: { id } },
})

test("two separate same-day workouts with identical distance survive", () => {
  const a = session({ id: "morning", start: "2026-01-08T07:00:00Z", end: "2026-01-08T07:30:00Z" })
  const b = session({ id: "evening", start: "2026-01-08T17:00:00Z", end: "2026-01-08T17:30:00Z" })
  assert.equal(dedupeCanonicalSessions([a, b]).length, 2)
})

test("distinct same-day workouts in the former historical fuzzy window survive", () => {
  const a = session({ id: "first", start: "2025-12-08T09:00:00Z", end: "2025-12-08T09:30:00Z" })
  const b = session({ id: "second", start: "2025-12-08T11:00:00Z", end: "2025-12-08T11:30:00Z", distance: 3.05 })
  assert.equal(dedupeCanonicalSessions([a, b]).length, 2)
})

test("corroborated Apple and Technogym records of one workout merge", () => {
  const apple = session({ id: "apple-101", start: "2026-01-09T09:00:00Z", end: "2026-01-09T09:40:00Z", source: "apple" })
  const technogym = session({ id: "tg-505", start: "2026-01-09T09:03:00Z", end: "2026-01-09T09:42:00Z", source: "technogym" })
  const merged = dedupeCanonicalSessions([apple, technogym])
  assert.equal(merged.length, 1)
  assert.ok(merged[0].sources.apple)
  assert.ok(merged[0].sources.technogym)
})

test("schedule-only sessions without measured duration do not invent 60 minutes", () => {
  const result = makeCanonicalSessionFromScheduleLog({
    session_id: "lift-01", date: "2026-10-02", exercises: [
      { exercise_id: "row", actual: { sets: 3 } }
    ]
  })
  assert.equal(result.duration_min, null)
  assert.equal(result.end_date, null)
  assert.equal(result.duration_provenance, "missing")
  assert.equal(result.trimp_provenance, "strength_sets_proxy")
})

