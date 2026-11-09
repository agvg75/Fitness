import assert from "node:assert/strict"
import test from "node:test"
import { loadSleepRecords, loadHealthfitDaily, loadBiometricRecords, upsertCanonicalSessions } from "./persistence.js"

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
