const DAY_MS = 24 * 60 * 60 * 1000
const EXCLUDED_OMISSION_REASONS = new Set([
  "intentional",
  "substituted",
  "oc_blocked",
  "contraindicated",
])

const EVIDENCE_BY_REASON = {
  time: "explicit_time_omission",
  intentional: "explicit_intentional_skip",
  substituted: "explicit_substitution",
  oc_blocked: "explicit_oc_block",
  contraindicated: "explicit_contraindication",
  unknown: "unknown_omission",
}

function parseLocalDate(value) {
  const date = String(value || "").slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
  const check = new Date(dayNumber * DAY_MS)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return { date, dayNumber }
}

function formatDayNumber(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)
}

export function getLocalTrainingWeekStart(value) {
  const parsed = parseLocalDate(value)
  if (!parsed) return null
  const sundayBasedDay = new Date(parsed.dayNumber * DAY_MS).getUTCDay()
  const daysSinceMonday = (sundayBasedDay + 6) % 7
  return formatDayNumber(parsed.dayNumber - daysSinceMonday)
}

export function getLocalTrainingWeekEnd(value) {
  const weekStart = parseLocalDate(getLocalTrainingWeekStart(value))
  return weekStart ? formatDayNumber(weekStart.dayNumber + 6) : null
}

export function isSameLocalTrainingWeek(left, right) {
  const leftStart = getLocalTrainingWeekStart(left)
  return leftStart != null && leftStart === getLocalTrainingWeekStart(right)
}

export function getCandidateExpiration(value) {
  const weekEnd = getLocalTrainingWeekEnd(value)
  return weekEnd ? `${weekEnd}T23:59:59.999` : null
}

export function makeMissedWorkCandidateId(sourceSessionId, sourceExerciseId) {
  return `missed:${encodeURIComponent(String(sourceSessionId))}:${encodeURIComponent(String(sourceExerciseId))}`
}

function sourceSessionId(session) {
  return session?.session_id ?? session?.id ?? null
}

function isFinalized(session) {
  if (session?.finalized === false || session?.status === "draft") return false
  if (session?.finalized === true) return true
  return sourceSessionId(session) != null && Boolean(session?.logged_at || session?.date)
}

function isCarryoverOrigin(session, exerciseId) {
  const disposition = session?.omission_dispositions?.[exerciseId]
  return Boolean(
    session?.carryover_provenance?.[exerciseId] ||
    session?.carryover_exercise_ids?.includes?.(exerciseId) ||
    disposition?.carryover_candidate_id ||
    disposition?.source_type === "carryover"
  )
}

function prescribedItems(session) {
  const context = session?.prescription_context
  return [
    ...(context?.prescribed_strength_ids || []).map(exerciseId => ({ exerciseId, kind: "strength" })),
    ...(context?.prescribed_tendon_ids || []).map(exerciseId => ({ exerciseId, kind: "tendon" })),
  ]
}

function includedExerciseIds(session) {
  return new Set([
    ...(session?.exercises || []).map(exercise => exercise?.exercise_id),
    ...(session?.tendon_work || []).map(exercise => exercise?.id || exercise?.exercise_id),
  ].filter(Boolean))
}

const excludedRecord = (base, exclusionReason) => ({
  ...base,
  confidence_class: "excluded",
  exclusion_reason: exclusionReason,
})

export function deriveMissedWorkCandidates({ sessions = [], evaluationDate } = {}) {
  const evaluation = parseLocalDate(evaluationDate)
  const candidates = []
  const exclusions = []

  for (const session of Array.isArray(sessions) ? sessions : []) {
    const sessionId = sourceSessionId(session)
    const context = session?.prescription_context
    const sourceDate = parseLocalDate(context?.session_date || session?.date)
    const sessionBase = { source_session_id: sessionId }

    if (!context) {
      exclusions.push(excludedRecord(sessionBase, "insufficient_historical_prescription"))
      continue
    }
    if (!isFinalized(session)) {
      exclusions.push(excludedRecord(sessionBase, "source_not_finalized"))
      continue
    }
    if (sessionId == null || !sourceDate || !evaluation) {
      exclusions.push(excludedRecord(sessionBase, "invalid_source"))
      continue
    }

    const weekStart = getLocalTrainingWeekStart(sourceDate.date)
    const expiresAt = getCandidateExpiration(sourceDate.date)
    const included = includedExerciseIds(session)

    for (const { exerciseId, kind } of prescribedItems(session)) {
      const disposition = session?.omission_dispositions?.[exerciseId] || { reason: "unknown" }
      const omissionReason = EVIDENCE_BY_REASON[disposition.reason] ? disposition.reason : "unknown"
      const base = {
        candidate_id: makeMissedWorkCandidateId(sessionId, exerciseId),
        source_session_id: sessionId,
        source_session_date: sourceDate.date,
        source_day: context.day || session.day || null,
        source_exercise_id: exerciseId,
        source_prescription_kind: kind,
        source_plan_fingerprint: context.plan_fingerprint || null,
        omission_reason: included.has(exerciseId) ? null : omissionReason,
        evidence_class: included.has(exerciseId) ? "included" : EVIDENCE_BY_REASON[omissionReason],
        week_start: weekStart,
        expires_at: expiresAt,
      }

      if (included.has(exerciseId)) {
        exclusions.push(excludedRecord(base, "included"))
      } else if (isCarryoverOrigin(session, exerciseId)) {
        exclusions.push(excludedRecord(base, "carryover_recursion_guard"))
      } else if (EXCLUDED_OMISSION_REASONS.has(omissionReason)) {
        exclusions.push(excludedRecord(base, `explicit_${omissionReason}`))
      } else if (evaluation.dayNumber <= sourceDate.dayNumber) {
        exclusions.push(excludedRecord(base, "evaluation_not_later_than_source"))
      } else if (!isSameLocalTrainingWeek(sourceDate.date, evaluation.date)) {
        exclusions.push(excludedRecord(base, "week_expired"))
      } else {
        candidates.push({
          ...base,
          confidence_class: omissionReason === "time" ? "high" : "possible",
        })
      }
    }
  }

  return { candidates, exclusions }
}
