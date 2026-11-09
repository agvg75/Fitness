import assert from "node:assert/strict"
import test from "node:test"
import { summarizeTimeBudget } from "./timeBudgetSummary.js"

test("full overage is different from selected slack", () => {
  const summary = summarizeTimeBudget({
    fixedTotal: 20,
    ranked: [{ min: 25 }, { min: 20 }, { min: 10 }],
    included: [{ min: 25 }],
    budgetMin: 50
  })
  assert.equal(summary.fullEstimate, 75)
  assert.equal(summary.selectedEstimate, 45)
  assert.equal(summary.fullOverageMin, 25)
  assert.equal(summary.selectedOverageMin, 0)
  assert.equal(summary.slackMin, 5)
  assert.equal(summary.fits, false)
})

test("mandatory fixed time over the budget is explicitly flagged", () => {
  const summary = summarizeTimeBudget({ fixedTotal: 35, ranked: [], included: [], budgetMin: 20 })
  assert.equal(summary.fullOverageMin, 15)
  assert.equal(summary.selectedOverageMin, 15)
  assert.equal(summary.slackMin, 0)
})

test("all exercises fitting returns correct remaining minutes", () => {
  const summary = summarizeTimeBudget({ fixedTotal: 10, ranked: [{ min: 12 }, { min: 12 }], included: [{ min: 12 }, { min: 12 }], budgetMin: 40 })
  assert.equal(summary.fits, true)
  assert.equal(summary.slackMin, 6)
  assert.equal(summary.fullOverageMin, 0)
})
