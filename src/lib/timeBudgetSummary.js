// Time budget summary is kept pure so the UI and regression tests share
// the same definitions of complete-plan duration and selected-plan duration.
const round = value => Math.round(value * 10) / 10

export function summarizeTimeBudget({ fixedTotal, ranked, included, budgetMin }) {
  const estimate = items => (items || []).reduce((sum, item) => sum + (Number(item.min) || 0), 0)
  const fullEstimate = round(fixedTotal + estimate(ranked))
  const selectedEstimate = round(fixedTotal + estimate(included))
  return {
    fullEstimate,
    selectedEstimate,
    fits: fullEstimate <= budgetMin,
    fullOverageMin: round(Math.max(0, fullEstimate - budgetMin)),
    selectedOverageMin: round(Math.max(0, selectedEstimate - budgetMin)),
    slackMin: round(Math.max(0, budgetMin - selectedEstimate))
  }
}
