// Conservative, read-only proposal. The scheduled plan is authoritative.
const validDate = value => {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/u.exec(String(value || ""))
  if (!match) return null
  const d = new Date(match[1] + "T00:00:00Z")
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === match[1] ? match[1] : null
}
const dayNumber = value => Date.parse(value + "T00:00:00Z") / 86400000
const asInt = value => {
  if (!/^\d+$/u.test(String(value ?? ""))) return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
const asLoad = value => {
  if (!/^\d+(?:\.\d+)?$/u.test(String(value ?? ""))) return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}
export function proposeAdaptiveStrengthSession({ exercises = [], scheduleLog = [], selectedDate, readiness = "progress", fields = {}, day } = {}) {
  const date = validDate(selectedDate)
  if (!date || !day) return { eligible: false, warnings: ["Select a valid date."], proposals: [], evidence: null }
  const target = dayNumber(date)
  const logs = (Array.isArray(scheduleLog) ? scheduleLog : [])
    .filter(x => x && !x.excluded && !x.deleted && !x.is_preview)
    .map(x => ({ ...x, _date: validDate(x.date || x.logged_at) }))
    .filter(x => x._date && dayNumber(x._date) <= target && target - dayNumber(x._date) <= 84)
  const latest = logs.reduce((max, x) => Math.max(max, dayNumber(x._date)), -Infinity)
  const stale = !Number.isFinite(latest) || target - latest > 28
  const warnings = []
  if (stale) warnings.push("Recent LIFT schedule-log data are absent. Check import and synchronization before adapting a session.")
  if (readiness === "deload") warnings.push("Recovery controller is in deload mode. Injury restrictions remain authoritative.")
  if (readiness === "hold") warnings.push("Recovery controller is in hold mode. Do not automatically increase loads.")
  if (!["progress", "hold", "deload"].includes(readiness)) warnings.push("Readiness unknown; no adjustments will be offered.")
  const proposals = []
  for (const ex of Array.isArray(exercises) ? exercises : []) {
    if (!ex?.id || !ex?.variants) continue
    const id = String(ex.id), variantKey = ex.activeVariant || "machine"
    const template = ex.variants[variantKey] || ex.variants.machine || Object.values(ex.variants)[0]
    if (!template) continue
    const key = day + "_" + id
    const before = { sets: String(template.sets ?? ""), reps: String(template.reps ?? ""), load: String(template.load ?? "") }
    // Saved drafts sometimes contain template-equivalent values. Only protect an
    // explicit departure from the template, not its unmodified cached defaults.
    if (["sets","reps","load"].some(k =>
      Object.prototype.hasOwnProperty.call(fields[key] || {}, k) &&
      String(fields[key][k] ?? "") !== before[k]
    )) continue
    const after = { ...before }
    const reasons = [], history = [], seen = new Set()
    for (const log of logs) {
      for (const item of Array.isArray(log.exercises) ? log.exercises : []) {
        if (String(item?.exercise_id ?? "") !== id) continue
        if (item?.variant && item.variant !== variantKey) continue
        if (item?.omitted || item?.completed === false || !item?.actual) continue
        const identity = log._date + ":" + String(log.session_id || log.id || "") + ":" + variantKey
        if (seen.has(identity)) continue
        seen.add(identity)
        history.push({ date: log._date, load: asLoad(item.actual.load), reps: asInt(item.actual.reps) })
      }
    }
    history.sort((a,b) => b.date.localeCompare(a.date))
    const gap = history.length ? target - dayNumber(history[0].date) : null
    const plannedSets = asInt(before.sets)
    if (!stale && plannedSets != null && plannedSets > 1 && ((gap != null && gap >= 14) || readiness === "deload")) {
      after.sets = String(plannedSets - 1)
      reasons.push(gap != null && gap >= 14 ? "No matching logged exercise for " + gap + " days. Verify history before reducing one set." : "Deload readiness: optional one-set reduction.")
    }
    if (!stale && readiness !== "deload" && gap != null && gap <= 14 && history.length >= 2) {
      const two = history.slice(0, 2)
      const loads = two.map(x => x.load), baseLoad = asLoad(before.load)
      if (baseLoad != null && loads.every(x => x != null) && Math.max(...loads) < baseLoad) {
        after.load = String(loads[0])
        reasons.push("Two same-variant logged loads below template. Confirm machine and units.")
      }
      const reps = two.map(x => x.reps), baseReps = asInt(before.reps)
      if (baseReps != null && reps.every(x => x != null) && Math.max(...reps) < baseReps) {
        after.reps = String(Math.min(...reps))
        reasons.push("Two recent rep counts below the template. Review before applying.")
      }
    }
    if (stale || !["progress","hold","deload"].includes(readiness)) continue
    if (Object.keys(before).some(k => before[k] !== after[k])) {
      proposals.push({ id, name: String(ex.n || ex.name || id), before, after, reasons, historyCount: history.length, lastLoggedDate: history[0]?.date || null })
    }
  }
  return { eligible: !stale && ["progress","hold","deload"].includes(readiness),
    warnings, proposals, evidence: { lastScheduleLogDay: Number.isFinite(latest) ? logs.find(x => dayNumber(x._date) === latest)?._date : null,
      source: "LIFT schedule log (matching exercise ID and variant)", windowDays: 84 } }
}
