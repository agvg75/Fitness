import assert from "node:assert/strict"
import test from "node:test"
import { calculateBanisterFromDailyTrimp } from "./banisterTimeline.js"

const config = { tau1: 27, tau2: 18 }

test("a first training day begins with zero pre-day TSB", () => {
  const result = calculateBanisterFromDailyTrimp({ "2026-11-01": 100 }, {
    ...config, asOfDate: "2026-11-01"
  })
  assert.equal(result.tsb, 0)
  assert.equal(result.ctl, 3.7)
  assert.equal(result.atl, 5.6)
})

test("rest day changes CTL and ATL, with pre-day TSB using the prior day", () => {
  const result = calculateBanisterFromDailyTrimp({ "2026-11-01": 100 }, {
    ...config, asOfDate: "2026-11-02"
  })
  assert.equal(result.ctl, 3.6)
  assert.equal(result.atl, 5.2)
  assert.equal(result.tsb, -1.9)
})

test("TSB is not frozen at last workout after a long rest period", () => {
  const load = { "2026-11-01": 100 }
  const old = calculateBanisterFromDailyTrimp(load, {
    ...config, asOfDate: "2026-11-02"
  })
  const recovered = calculateBanisterFromDailyTrimp(load, {
    ...config, asOfDate: "2026-12-01"
  })
  assert.ok(recovered.tsb > old.tsb)
  assert.ok(recovered.ctl < old.ctl)
  assert.ok(recovered.atl < old.atl)
})

test("future workouts never contribute to current readiness", () => {
  const result = calculateBanisterFromDailyTrimp({
    "2026-11-01": 100, "2026-12-01": 200
  }, { ...config, asOfDate: "2026-11-02" })
  assert.deepEqual(Object.keys(result.dailyTrimp), ["2026-11-01"])
})

test("no valid load produces no estimate rather than a fabricated value", () => {
  assert.equal(calculateBanisterFromDailyTrimp({}, {
    ...config, asOfDate: "2026-11-02"
  }), null)
})
