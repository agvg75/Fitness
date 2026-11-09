import assert from "node:assert/strict"
import test from "node:test"
import { attachAcwrToTimeline } from "./acwrTimeline.js"

const dates = Array.from({length: 42}, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 1 + i))
  return d.toISOString().slice(0, 10)
})
const rows = dates.map(date => ({date}))
const uniform = Object.fromEntries(dates.map(date => [date, 10]))

test("ACWR is 1.0 with stable loading once 28 days of history exist", () => {
  const out = attachAcwrToTimeline(rows, uniform)
  assert.equal(out[27].acwr, 1)
  assert.equal(out[41].acwr, 1)
})

test("short chart windows must not change the ACWR at their left boundary", () => {
  const complete = attachAcwrToTimeline(rows, uniform)
  const lastSeven = complete.slice(-7)
  assert.equal(lastSeven[0].acwr, 1)
  assert.equal(lastSeven[6].acwr, 1)
})

test("zero-load history yields missing ACWR, not a fabricated zero ratio", () => {
  const out = attachAcwrToTimeline(rows, {})
  assert.equal(out[41].acwr, null)
})

test("isolated acute spike produces an ACWR greater than baseline", () => {
  const loads = { ...uniform, [dates[41]]: 100 }
  const out = attachAcwrToTimeline(rows, loads)
  assert.ok(out[41].acwr > 1)
})
