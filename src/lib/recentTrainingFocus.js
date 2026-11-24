import { buildReentryPlan, countRecordedComebacks } from "./comebackPlan.js"
// Recent-training awareness: looks at what was actually done over the last
// month (and the three months before it) and proposes where to focus now,
// instead of assuming the full weekly program is being followed.
//
// Pure functions, no React and no storage. Every threshold below is a
// conservative coaching heuristic, not a fitted or validated parameter.

export const FOCUS_CONFIG = {
  recentDays: 28,          // "past month"
  baselineDays: 84,        // the 12 weeks before that ("medium past")
  layoffDays: 14,          // no training of any kind for this long = layoff
  returnGapDays: 10,       // a gap this long inside the last month = returning
  lapsedDays: 21,          // a modality untouched this long has lapsed
  overdueIntervals: 2.5,   // untouched for this many of its usual intervals = overdue
  overdueMinDays: 7,
  fadingRatio: 0.5,        // recent weekly rate below half of baseline = fading
  buildingRatio: 1.5,      // recent weekly rate above 1.5x baseline = building
  spikeRatio: 1.5,         // last 7 days above 1.5x the prior three weeks = spike
  minBaselinePerWeek: 0.5, // below this, the modality was never a habit
  staleDataDays: 5,        // newest record older than this = warn before advising
  maxFocusItems: 3,
  // Load (strength) or volume (cardio) to restart at, by days since last done.
  reentrySteps: [
    { maxDays: 10, factor: 1.0 },
    { maxDays: 21, factor: 0.9 },
    { maxDays: 42, factor: 0.8 },
    { maxDays: 84, factor: 0.7 },
    { maxDays: Infinity, factor: 0.6 },
  ],
}

export const DOMAIN_LABELS = {
  strength: "Strength",
  run: "Running",
  bike: "Cycling",
  swim: "Swimming",
  walk: "Walking",
  cardio_other: "Other cardio",
}

export const PATTERN_LABELS = {
  upper_push: "Upper push",
  upper_pull: "Upper pull",
  lower_push_quad: "Quads",
  posterior_chain: "Posterior chain",
  hip_accessory: "Hip accessory",
  core: "Core",
  arm_flexion: "Arm flexion",
}

const DAY_MS = 86400000

export function toDateKey(value) {
  if (value == null) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value))
  if (!match) return null
  const key = match[1]
  const parsed = new Date(`${key}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null
}

function dayNumber(dateKey) {
  return Math.round(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS)
}

// Maps the many source labels (Apple, Technogym, HealthFit, manual) to one domain.
export function normalizeSessionType(raw) {
  const t = String(raw ?? "").toLowerCase()
  if (!t) return null
  if (/cooldown|cool down|warm ?up|stretch|mobility|yoga|mind/.test(t)) return null
  if (/strength|weight|functional|core|resistance|gym/.test(t)) return "strength"
  if (/run|jog/.test(t)) return "run"
  if (/cycl|bike|spin/.test(t)) return "bike"
  if (/swim|pool/.test(t)) return "swim"
  if (/walk|hik/.test(t)) return "walk"
  if (/row|ellipt|stair|cardio|hiit/.test(t)) return "cardio_other"
  return null
}

function parseSetCount(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 12) : 1
}

// Flattens canonical sessions and the schedule log into dated events.
// patternOf(exercise) should return a movement pattern key or null.
export function buildTrainingEvents({ canonicalSessions = [], scheduleLog = [], patternOf = null } = {}) {
  const events = []
  for (const session of Array.isArray(canonicalSessions) ? canonicalSessions : []) {
    if (session?.excluded || session?.deleted || session?.is_preview) continue
    const date = toDateKey(session?.start_date ?? session?.date)
    const domain = normalizeSessionType(session?.canonical_type ?? session?.type ?? session?.modality)
    if (!date || !domain) continue
    const minutes = Number(session?.duration_min)
    events.push({ date, domain, minutes: Number.isFinite(minutes) ? minutes : null })
  }
  for (const entry of Array.isArray(scheduleLog) ? scheduleLog : []) {
    const date = toDateKey(entry?.date)
    if (!date) continue
    const exercises = Array.isArray(entry?.exercises) ? entry.exercises : []
    if (exercises.some(ex => ex?.variant !== "cardio")) events.push({ date, domain: "strength", minutes: null })
    for (const exercise of exercises) {
      const pattern = typeof patternOf === "function" ? patternOf(exercise) : exercise?.movement_pattern
      if (exercise?.variant === "cardio" || !pattern || !PATTERN_LABELS[pattern]) continue
      events.push({ date, domain: "strength", pattern, sets: parseSetCount(exercise?.actual?.sets ?? exercise?.sets) })
    }
    for (const cardio of Array.isArray(entry?.cardio) ? entry.cardio : []) {
      const domain = normalizeSessionType(cardio?.modality ?? cardio?.type ?? cardio?.name ?? cardio?.n)
      if (domain && domain !== "strength") events.push({ date, domain, minutes: null })
    }
  }
  return events
}

export function reentryFactor(daysSince, config = FOCUS_CONFIG) {
  if (daysSince == null) return config.reentrySteps[config.reentrySteps.length - 1].factor
  return config.reentrySteps.find(step => daysSince <= step.maxDays).factor
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function trackSummary(dateSet, todayN, config) {
  const ages = [...dateSet].map(key => todayN - dayNumber(key)).filter(age => age >= 0)
  const recent = ages.filter(age => age < config.recentDays).length
  const baseline = ages.filter(age => age >= config.recentDays && age < config.recentDays + config.baselineDays).length
  const last7 = ages.filter(age => age < 7).length
  const daysSince = ages.length ? Math.min(...ages) : null
  const perWeekRecent = recent / (config.recentDays / 7)
  const perWeekBaseline = baseline / (config.baselineDays / 7)
  const ratio = perWeekBaseline > 0 ? perWeekRecent / perWeekBaseline : null
  const wasHabit = perWeekBaseline >= config.minBaselinePerWeek

  let state = "steady"
  if (daysSince == null) state = "absent"
  else if (daysSince > config.lapsedDays) state = wasHabit || recent === 0 ? "lapsed" : "absent"
  else if (wasHabit && daysSince >= Math.max(config.overdueMinDays, config.overdueIntervals * (7 / perWeekBaseline))) state = "overdue"
  else if (!wasHabit && baseline === 0) state = "new"
  else if (wasHabit && ratio < config.fadingRatio) state = "fading"
  else if (ratio != null && ratio > config.buildingRatio && perWeekRecent >= 1) state = "building"

  return {
    sessionsLast7: last7,
    sessionsRecent: recent,
    sessionsBaseline: baseline,
    perWeekRecent: round1(perWeekRecent),
    perWeekBaseline: round1(perWeekBaseline),
    daysSince,
    ratio: ratio == null ? null : round1(ratio),
    state,
    reentryFactor: reentryFactor(daysSince, config),
  }
}

export function summarizeRecentTraining(events, { today = new Date(), planDaysPerWeek = 7, config = FOCUS_CONFIG } = {}) {
  const todayKey = toDateKey(today)
  if (!todayKey) throw new Error("summarizeRecentTraining requires a valid date")
  const todayN = dayNumber(todayKey)
  const horizon = config.recentDays + config.baselineDays
  const usable = (Array.isArray(events) ? events : []).filter(event => {
    const key = toDateKey(event?.date)
    if (!key || !event.domain) return false
    const age = todayN - dayNumber(key)
    return age >= 0 && age < horizon
  })

  const anyDates = new Set()
  const byDomain = new Map()
  const byPattern = new Map()
  const patternSets = new Map()
  for (const event of usable) {
    anyDates.add(event.date)
    if (!byDomain.has(event.domain)) byDomain.set(event.domain, new Set())
    byDomain.get(event.domain).add(event.date)
    if (event.pattern) {
      if (!byPattern.has(event.pattern)) byPattern.set(event.pattern, new Set())
      byPattern.get(event.pattern).add(event.date)
      if (todayN - dayNumber(event.date) < config.recentDays) {
        patternSets.set(event.pattern, (patternSets.get(event.pattern) || 0) + (event.sets || 1))
      }
    }
  }

  const overall = trackSummary(anyDates, todayN, config)
  const base = {
    asOf: todayKey,
    planDaysPerWeek,
    dataThrough: anyDates.size ? [...anyDates].sort().pop() : null,
    dataAgeDays: overall.daysSince,
    activeDays: {
      last7: overall.sessionsLast7,
      recent: overall.sessionsRecent,
      perWeekRecent: overall.perWeekRecent,
      perWeekBaseline: overall.perWeekBaseline,
    },
  }

  if (!anyDates.size) {
    return {
      ...base,
      status: "no_data",
      dataIsStale: true,
      longestRecentGapDays: null,
      recommendedDaysThisWeek: null,
      reentryPlan: null,
      comebacks: 0,
      domains: [],
      patterns: [],
      focus: [{
        id: "check-data", kind: "data", title: "Verify your workout records",
        reason: "No eligible training events appear in this 16-week window. This can mean an import or synchronization gap, not necessarily inactivity.",
      }],
      headline: "No recent training records available for this comparison.",
    }
  }

  // Longest run of consecutive days without training inside the recent window.
  const recentAges = [...anyDates].map(key => todayN - dayNumber(key)).filter(age => age < config.recentDays).sort((a, b) => a - b)
  let longestGap = recentAges.length ? recentAges[0] : config.recentDays
  for (let i = 1; i < recentAges.length; i += 1) longestGap = Math.max(longestGap, recentAges[i] - recentAges[i - 1] - 1)
  if (recentAges.length) longestGap = Math.max(longestGap, config.recentDays - 1 - recentAges[recentAges.length - 1])

  const priorThreeWeeksPerWeek = (overall.sessionsRecent - overall.sessionsLast7) / ((config.recentDays - 7) / 7)
  let status = "steady"
  if (overall.daysSince >= config.layoffDays) status = "layoff"
  else if (longestGap >= config.returnGapDays) status = "returning"
  else if (overall.sessionsLast7 >= 4 && overall.sessionsLast7 > config.spikeRatio * Math.max(priorThreeWeeksPerWeek, 1)) status = "ramping"
  else if (overall.perWeekBaseline >= 2 && overall.perWeekRecent <= 0.6 * overall.perWeekBaseline) status = "reduced"
  else if (overall.perWeekRecent >= overall.perWeekBaseline * 1.25 && overall.perWeekRecent >= 3) status = "building"

  // Weekly target grows from what was actually done, one day at a time,
  // rather than jumping to the full program.
  const recentRate = overall.sessionsRecent / (config.recentDays / 7)
  let recommended
  if (status === "layoff") recommended = overall.daysSince >= 28 ? 2 : 3
  else if (status === "ramping") recommended = Math.max(2, Math.round(priorThreeWeeksPerWeek) + 1)
  else recommended = Math.round(recentRate) + 1
  recommended = Math.max(1, Math.min(Math.max(1, planDaysPerWeek), recommended))

  const domains = [...byDomain.entries()]
    .map(([id, dates]) => ({ id, label: DOMAIN_LABELS[id] || id, ...trackSummary(dates, todayN, config) }))
    .filter(d => d.state !== "absent")
    .sort((a, b) => b.perWeekBaseline + b.perWeekRecent - (a.perWeekBaseline + a.perWeekRecent))
  const patterns = [...byPattern.entries()]
    .map(([id, dates]) => ({ id, label: PATTERN_LABELS[id] || id, setsRecent: patternSets.get(id) || 0, ...trackSummary(dates, todayN, config) }))
    .sort((a, b) => a.setsRecent - b.setsRecent)

  const focus = []
  // This is a comparison of recorded activity, not verified inactivity.
  // A return can only be counted if records exist on both sides of a gap.
  const comebacks = countRecordedComebacks([...anyDates])
  const reentryGap = status === "layoff" ? overall.daysSince : status === "returning" ? longestGap : null
  const reentryPlan = buildReentryPlan(reentryGap)
  if (status === "layoff" || status === "returning") {
    const gap = status === "layoff" ? overall.daysSince : longestGap
    focus.push({
      id: "reentry", kind: "volume",
      title: `Re-entry week: ${recommended} sessions, not the full program`,
      reason: `${status === "layoff" ? `Nothing recorded for ${gap} days` : `There was a ${gap}-day gap in the last month`}. Verify that training was logged, then review recent load, recovery and any injury constraints before resuming.`,
    })
  } else if (status === "ramping") {
    focus.push({
      id: "hold", kind: "volume",
      title: `Hold at ${recommended} sessions this week`,
      reason: `${overall.sessionsLast7} training days in the last 7 against about ${round1(priorThreeWeeksPerWeek)} per week before that. Let the base catch up before adding more.`,
    })
  }

  const drifting = [...domains.map(d => ({ ...d, kind: "domain" })), ...patterns.map(p => ({ ...p, kind: "pattern" }))]
    .filter(t => ["lapsed", "overdue", "fading"].includes(t.state) && t.perWeekBaseline >= config.minBaselinePerWeek)
    // What has gone longest untouched outranks what has merely thinned out.
    .map(t => ({ ...t, priority: { lapsed: 4, overdue: 3, fading: t.daysSince < 7 ? 0 : 1 }[t.state] + t.perWeekBaseline * (1 - Math.min(1, t.ratio ?? 0)) }))
    .sort((a, b) => b.priority - a.priority)
  for (const t of drifting) {
    if (focus.length >= config.maxFocusItems) break
    const since = t.daysSince == null ? "not done in the last 16 weeks" : `last done ${t.daysSince} days ago`
    const restart = "If you restore this activity, adjust duration and load to current recovery and injury status rather than assuming prior capacity."
    focus.push({
      id: `${t.kind}:${t.id}`, kind: t.kind,
      title: t.state === "fading" ? `${t.label} has thinned out` : `Bring back ${t.label.toLowerCase()}`,
      reason: `${t.perWeekBaseline} per week over the previous three months, ${t.perWeekRecent} per week in the last month (${since}). ${restart}`,
      reentryFactor: t.reentryFactor,
    })
  }

  if (!focus.length) {
    const trained = patterns.filter(p => p.sessionsRecent > 0)
    const least = trained.length >= 3 ? trained[0] : null
    const most = trained.length >= 3 ? trained[trained.length - 1] : null
    if (least && most && most.setsRecent >= 2 * Math.max(1, least.setsRecent)) {
      focus.push({
        id: `pattern:${least.id}`, kind: "pattern",
        title: `Give ${least.label.toLowerCase()} more of the week`,
        reason: `${least.setsRecent} sets in the last month against ${most.setsRecent} for ${most.label.toLowerCase()}. Nothing has lapsed, so this is a balance call.`,
      })
    } else {
      focus.push({
        id: "progress", kind: "volume",
        title: "Consistent month: progress as programmed",
        reason: `${overall.perWeekRecent} training days per week, in line with the previous three months, and nothing has lapsed.`,
      })
    }
  }

  const headlineByStatus = {
    layoff: `No training recorded for ${overall.daysSince} days.`,
    returning: `Coming back from a ${longestGap}-day gap.`,
    ramping: "Sharp increase this week.",
    reduced: "Training less than your three-month norm.",
    building: "Building above your three-month norm.",
    steady: "In line with your three-month norm.",
  }

  return {
    ...base,
    status,
    dataIsStale: overall.daysSince > config.staleDataDays,
    longestRecentGapDays: longestGap,
    recommendedDaysThisWeek: recommended,
    reentryPlan,
    comebacks,
    domains,
    patterns,
    focus: focus.slice(0, config.maxFocusItems),
    headline: `${overall.sessionsBaseline === 0 ? "Insufficient historical records to establish a three-month comparison." : headlineByStatus[status]} You averaged ${overall.perWeekRecent} recorded training days per week over the last month; the schedule lists ${planDaysPerWeek} planned training days.`,
  }
}
