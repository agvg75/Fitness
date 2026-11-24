import { buildReentryPlan } from "./comebackPlan.js"
import { normalizeSessionType, toDateKey } from "./recentTrainingFocus.js"

export function lastRecordedStrengthDate(canonical = [], schedule = [], selectedDate) {
  const target = toDateKey(selectedDate)
  if (!target) return { lastDate: null, days: null }
  const dates = []
  for (const x of canonical || []) {
    if (x?.excluded || x?.deleted || x?.is_preview) continue
    if (normalizeSessionType(x?.canonical_type ?? x?.type ?? x?.modality) !== "strength") continue
    const date = toDateKey(x?.start_date ?? x?.date)
    if (date && date < target) dates.push(date)
  }
  for (const x of schedule || []) {
    if (x?.excluded || x?.deleted || x?.is_preview) continue
    if (!(x?.exercises || []).some(ex => ex && ex.variant !== "cardio" && ex.completed !== false && !ex.omitted)) continue
    const date = toDateKey(x?.date)
    if (date && date < target) dates.push(date)
  }
  if (!dates.length) return { lastDate: null, days: null }
  const lastDate = dates.sort().at(-1)
  return { lastDate, days: Math.round((Date.parse(target + "T00:00Z") - Date.parse(lastDate + "T00:00Z")) / 86400000) }
}
export function activeComeback(state, userId, selectedDate) {
  return Boolean(state && userId && state.userId === userId && state.startDate <= selectedDate &&
    Number.isInteger(state.daysOff) && state.daysOff >= 14 && Number.isInteger(state.week) && state.week >= 1 &&
    buildReentryPlan(state.daysOff)?.weeks >= state.week)
}
const positiveNumber = v => /^\d+(?:\.\d+)?$/.test(String(v ?? "")) && Number(v) > 0 ? Number(v) : null
export function proposeComeback({ exercises = [], fields = {}, day, daysOff, week = 1, readiness = "hold", injuryBlock = false } = {}) {
  const plan = buildReentryPlan(daysOff)
  const step = plan?.steps[week - 1]
  if (!step || !Number.isInteger(week) || week < 1) return { eligible: false, plan, step: null, proposals: [], warning: "No valid comeback week." }
  const eligible = !injuryBlock && (readiness === "progress" || readiness === "hold")
  const warning = injuryBlock ? "Injury restrictions require manual review before applying a ramp." :
    readiness === "deload" ? "Recovery controller requests deload; no automatic comeback adjustment." :
    "Illustrative percentages, not measured capacity. Confirm machines, symptoms, and recovery."
  const proposals = []
  for (const ex of exercises || []) {
    if (!ex?.id) continue
    const base = ex.variants?.[ex.activeVariant || "machine"] || ex.variants?.machine
    if (!base) continue
    const before = { sets: String(base.sets ?? ""), reps: String(base.reps ?? ""), load: String(base.load ?? "") }
    const current = fields[day + "_" + ex.id] || {}
    if (["sets","reps","load"].some(k => Object.prototype.hasOwnProperty.call(current,k) && String(current[k] ?? "") !== before[k])) continue
    const after = { ...before }
    const sets = positiveNumber(before.sets), load = positiveNumber(before.load)
    if (sets && Number.isInteger(sets)) after.sets = String(Math.max(1, Math.min(sets, Math.round(sets * step.volumeFactor))))
    if (load) after.load = String(Math.min(load, Math.round(load * step.loadFactor * 10) / 10))
    if (after.sets !== before.sets || after.load !== before.load) proposals.push({ id: ex.id, name: ex.n || ex.name || ex.id, before, after })
  }
  return { eligible, plan, step, proposals: eligible ? proposals : [], warning }
}
