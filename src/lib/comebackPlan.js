// Descriptive comeback framework; not individualized load prescription.
// Gaps in the record are not proof of inactivity.
export function buildReentryPlan(daysOff) {
  if (!Number.isFinite(daysOff) || daysOff < 14) return null
  const days = Math.floor(daysOff)
  const weeks = days < 28 ? 1 : Math.min(8, Math.max(2, Math.round(days / 14)))
  const firstLoad = days < 28 ? 0.8 : days < 84 ? 0.7 : days < 365 ? 0.6 : 0.5
  const steps = Array.from({ length: weeks }, (_, i) => ({
    week: i + 1,
    loadFactor: Math.round((firstLoad + (1 - firstLoad) * i / weeks) * 100) / 100,
    volumeFactor: weeks === 1 ? 0.67 : ([0.5, 0.7, 0.8, 0.9][i] ?? 1),
    effort: i === 0 ? "Leave ample reps in reserve" : "Advance only if recovery permits",
  }))
  return {
    daysOff: days, weeks, steps, restartAsBeginner: days >= 365,
    firstSession: "Consider a light, low-volume primer, avoiding failure. Confirm current symptoms and training records first.",
    advisory: "Illustrative progression, not a validated individual prescription. Load and volume percentages are heuristic.",
  }
}
export function countRecordedComebacks(dates, gapDays = 7) {
  const ordered = [...new Set((dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort()
  let count = 0
  for (let i = 1; i < ordered.length; i++) {
    const a = Date.parse(ordered[i - 1] + "T00:00:00Z"), b = Date.parse(ordered[i] + "T00:00:00Z")
    if (Number.isFinite(a) && Number.isFinite(b) && (b - a) / 86400000 - 1 >= gapDays) count++
  }
  return count
}
