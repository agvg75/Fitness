import assert from "node:assert/strict"
import test from "node:test"
import { dedupeCanonicalSessions, makeCanonicalSessionFromScheduleLog } from "./canonicalSessions.js"
import { loadSleepRecords, loadHealthfitDaily, loadBiometricRecords, upsertCanonicalSessions } from "./persistence.js"

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

function mockSupabase(records, tableName) {
  let calls = 0
  const from = (table) => {
    assert.equal(table, tableName)
    let orderCount = 0
    const query = {
      select() { return this },
      eq() { return this },
      order() { orderCount++; return this },
      async range(from, to) {
        calls++
        assert.equal(orderCount, 2, "stable date and id ordering")
        return { data: records.slice(from, to + 1), error: null }
      }
    }
    return query
  }
  return { from, getCalls: () => calls }
}

for (const [label, fn, dateField] of [
  ["sleep", loadSleepRecords, "sleep_date"],
  ["healthfit", loadHealthfitDaily, "record_date"],
  ["biometric", loadBiometricRecords, "measured_date"]
]) {
  test(`${label} pagination retrieves every row beyond 1000`, async () => {
    const records = Array.from({ length: 1101 }, (_, i) => ({
      id: String(i + 1), [dateField]: "2026-01-01", raw: {}
    }))
    const sb = mockSupabase(records,
      label === "sleep" ? "sleep_records" :
      label === "healthfit" ? "healthfit_daily" : "biometric_records")
    const result = await fn(sb, "test-user")
    assert.equal(result.length, 1101)
    assert.equal(sb.getCalls(), 3)
  })
}

test("canonical-session upsert persists TRIMP and its provenance", async () => {
  let written = null
  const sb = {
    from(name) {
      assert.equal(name, "canonical_sessions")
      return {
        select() { return this },
        eq() { return this },
        async in() { return { data: [], error: null } },
        upsert(rows) {
          written = rows
          return this
        },
        then(resolve) { return resolve({ data: written, error: null }) },
      }
    }
  }
  await upsertCanonicalSessions(sb, "test-user", [{
    session_id: "schedule_example", canonical_type: "Traditional Strength Training",
    start_date: "2026-11-08T12:00:00Z", duration_min: null,
    duration_provenance: "missing", trimp: 21,
    trimp_provenance: "strength_sets_proxy",
    sources: { schedule: { session_id: "example" } }
  }])
  assert.equal(written.length, 1)
  assert.equal(written[0].trimp, 21)
  assert.equal(written[0].raw.duration_provenance, "missing")
  assert.equal(written[0].raw.trimp_provenance, "strength_sets_proxy")
})
