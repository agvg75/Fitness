import { deriveMissedWorkCandidates, getLocalTrainingWeekEnd, getLocalTrainingWeekStart } from "./missedWorkCandidates.js"
import { scoreMissedWorkReceivingDays } from "./missedWorkCompatibility.js"

const DAY_MS = 86400000
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const ACTION_LABELS = {
  use_existing_slot: "Use existing slot",
  add: "Could add",
  not_recommended: "Not recommended",
}
const REASON_LABELS = {
  time: "ran out of time",
  unknown: "reason unknown",
  intentional: "intentional skip",
  substituted: "substituted",
  oc_blocked: "OC / injury blocked",
  contraindicated: "contraindicated",
}

const parseCivilDate = value => {
  const date = String(value || "").slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const dayNumber = Math.floor(Date.UTC(+match[1], +match[2] - 1, +match[3]) / DAY_MS)
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10) === date ? { date, dayNumber } : null
}

export function buildRemainingWeekReceivingDates(selectedDate) {
  const selected = parseCivilDate(selectedDate)
  const weekEnd = parseCivilDate(getLocalTrainingWeekEnd(selectedDate))
  if (!selected || !weekEnd) return []
  return Array.from({ length: weekEnd.dayNumber - selected.dayNumber + 1 }, (_, offset) => {
    const dayNumber = selected.dayNumber + offset
    return {
      date: new Date(dayNumber * DAY_MS).toISOString().slice(0, 10),
      day: DAY_KEYS[new Date(dayNumber * DAY_MS).getUTCDay()],
    }
  })
}

function planExerciseNames(currentPlan) {
  const names = new Map()
  Object.values(currentPlan || {}).forEach(planDay => {
    ;(planDay?.sections || []).forEach(section => {
      ;(section?.ex || []).forEach(exercise => names.set(exercise.id, exercise.name || exercise.n || exercise.id))
    })
    ;(planDay?.tendon || []).forEach(exercise => names.set(exercise.id, exercise.name || exercise.n || exercise.id))
  })
  return names
}

function sourceExerciseName(candidate, sessions, names) {
  const source = (sessions || []).find(session => String(session?.session_id ?? session?.id) === String(candidate.source_session_id))
  const logged = (source?.exercises || []).find(exercise => exercise?.exercise_id === candidate.source_exercise_id)
  const tendon = (source?.tendon_work || []).find(exercise => (exercise?.id || exercise?.exercise_id) === candidate.source_exercise_id)
  return logged?.exercise_name || tendon?.name || names.get(candidate.source_exercise_id) || candidate.source_exercise_id
}

function previewRationale(result) {
  const factors = new Set((result.score_breakdown || []).map(item => item.factor))
  if (result.action === "use_existing_slot") {
    const recovery = factors.has("recovery_72h_plus") ? "72+ h recovery" : factors.has("recovery_48_71h") ? "48–71 h recovery" : "limited recovery"
    const overlap = factors.has("high_tissue_overlap") ? "; existing day has substantial overlap" : ""
    return `${recovery}, existing slot, no duplicate needed${overlap}`
  }
  if (result.action === "add") {
    const time = `estimated +${result.candidate_estimated_minutes} min`
    const budget = factors.has("receiving_day_over_budget")
      ? "would exceed current provisional day budget"
      : factors.has("spare_estimated_time") ? "within current provisional day budget" : "using provisional day budget"
    return `${time}, ${budget}`
  }
  return result.rationale
}

const debugDetails = (candidate, result = {}) => ({
  candidate_id: candidate?.candidate_id || null,
  source_exercise_id: candidate?.source_exercise_id || null,
  source_date: candidate?.source_session_date || null,
  omission_reason: candidate?.omission_reason || null,
  confidence_class: candidate?.confidence_class || "excluded",
  compatibility_score: result.score ?? null,
  score_breakdown: result.score_breakdown || [],
  hard_exclusions: result.hard_exclusions || [],
  existing_slot_id: result.existing_slot_id || null,
  estimated_added_minutes: result.candidate_estimated_minutes ?? null,
})

// Validation-only projection. `use_existing_slot` means visual priority for an
// already-prescribed exercise; it never restores volume or changes membership,
// order, sets, reps, load, or RPE. Static budgets remain provisional config.
export function selectMissedWorkPreview({
  sessions = [], selectedDate, selectedDay, currentPlan = {}, currentCardio = {}, ocState = [],
} = {}) {
  const receivingDates = buildRemainingWeekReceivingDates(selectedDate)
  const selectedReceiving = receivingDates.find(item => item.date === String(selectedDate || "").slice(0, 10) && item.day === selectedDay)
  if (!selectedReceiving) return { actionable: [], excluded: [], priority_markers: {}, has_preview: false }

  const { candidates, exclusions: upstreamExclusions } = deriveMissedWorkCandidates({ sessions, evaluationDate: selectedDate })
  const names = planExerciseNames(currentPlan)
  const actionable = []
  const excluded = []

  for (const candidate of candidates) {
    const results = scoreMissedWorkReceivingDays({
      candidate,
      sourceSession: (sessions || []).find(session => String(session?.session_id ?? session?.id) === String(candidate.source_session_id)),
      currentPlan,
      currentCardio,
      receivingDates,
      ocState,
    })
    const result = results.find(option => option.receiving_date === selectedReceiving.date && option.receiving_day === selectedReceiving.day)
    if (!result) continue
    const row = {
      ...result,
      source_session_id: candidate.source_session_id,
      source_session_date: candidate.source_session_date,
      source_day: candidate.source_day,
      source_exercise_id: candidate.source_exercise_id,
      exercise_name: sourceExerciseName(candidate, sessions, names),
      existing_slot_name: result.existing_slot_id ? names.get(result.existing_slot_id) || result.existing_slot_id : null,
      action_label: ACTION_LABELS[result.action],
      uncertainty_label: candidate.confidence_class === "possible" ? "Possible missed work" : "Missed work",
      omission_label: REASON_LABELS[candidate.omission_reason] || "reason unknown",
      preview_rationale: previewRationale(result),
      debug: debugDetails(candidate, result),
    }
    if (result.action === "not_recommended") excluded.push(row)
    else actionable.push(row)
  }

  const selectedDayNumber = parseCivilDate(selectedDate)?.dayNumber
  upstreamExclusions.forEach(exclusion => {
    const source = parseCivilDate(exclusion.source_session_date)
    if (!source || !selectedDayNumber || source.dayNumber >= selectedDayNumber) return
    if (getLocalTrainingWeekStart(source.date) !== getLocalTrainingWeekStart(selectedDate)) return
    if (["included", "evaluation_not_later_than_source"].includes(exclusion.exclusion_reason)) return
    excluded.push({
      action: "not_recommended",
      action_label: ACTION_LABELS.not_recommended,
      source_session_id: exclusion.source_session_id,
      source_session_date: exclusion.source_session_date,
      source_day: exclusion.source_day,
      source_exercise_id: exclusion.source_exercise_id,
      exercise_name: sourceExerciseName(exclusion, sessions, names),
      omission_label: REASON_LABELS[exclusion.omission_reason] || exclusion.exclusion_reason,
      uncertainty_label: "Excluded missed work",
      preview_rationale: String(exclusion.exclusion_reason || "ineligible").replaceAll("_", " "),
      debug: debugDetails(exclusion, { hard_exclusions: [exclusion.exclusion_reason] }),
    })
  })

  const priority_markers = Object.fromEntries(
    actionable.filter(row => row.action === "use_existing_slot" && row.existing_slot_id).map(row => [row.existing_slot_id, {
      slot_id: row.existing_slot_id,
      label: `Priority from ${row.source_day}`,
      source_session_id: row.source_session_id,
      source_date: row.source_session_date,
      candidate_id: row.candidate_id,
    }])
  )

  return {
    actionable,
    excluded,
    priority_markers,
    has_preview: actionable.length > 0 || excluded.length > 0,
  }
}
