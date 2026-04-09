function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function stableHash(input) {
  const str = String(input || "")
  let hash = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

function makeSessionId(prefix, payload) {
  return `${prefix}_${stableHash(safeStringify(payload) || String(Date.now()))}`
}

function normalizeCanonicalType(type) {
  return String(type || "").trim().toLowerCase()
}

function isPositiveNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

function getCanonicalDistanceMetric(session) {
  return session?.preferred_metrics?.distance || null
}

function getTechnogymDistanceMetric(session) {
  const distance = Number(session?.sources?.technogym?.distance)
  if (!Number.isFinite(distance) || distance <= 0) return null
  return {
    value: distance,
    unit: session?.sources?.technogym?.distance_unit || "m",
    source: "technogym",
    rationale: "Carried forward from Technogym HDistance during canonical session merge"
  }
}

function shouldCarryForwardTechnogymDistance(winner, loser) {
  const winnerDistance = getCanonicalDistanceMetric(winner)
  const winnerValue = Number(winnerDistance?.value)
  const loserTechnoDistance = getTechnogymDistanceMetric(loser)
  return (!Number.isFinite(winnerValue) || winnerValue <= 0) && loserTechnoDistance
}

function canonicalSessionQualityScore(session) {
  const sources = session?.sources || {}
  let score = 0
  if (sources.apple) score += 2
  if (sources.technogym) score += 3
  if (sources.schedule) score += 1
  if (isPositiveNumber(session?.preferred_metrics?.distance?.value)) score += 2
  if (isPositiveNumber(session?.preferred_metrics?.hr?.value)) score += 1
  if (isPositiveNumber(session?.preferred_metrics?.calories?.value)) score += 1
  if (isPositiveNumber(session?.preferred_metrics?.power_avg?.value)) score += 1
  if (isPositiveNumber(session?.preferred_metrics?.rpm_avg?.value)) score += 1
  if (isPositiveNumber(session?.duration_min)) score += 1
  return score
}

function mergeSessionSources(winner, loser) {
  return {
    ...(winner?.sources || {}),
    apple: winner?.sources?.apple || loser?.sources?.apple || null,
    technogym: winner?.sources?.technogym || loser?.sources?.technogym || null,
    schedule: winner?.sources?.schedule || loser?.sources?.schedule || null
  }
}

function mergePreferredMetrics(winner, loser) {
  const merged = {
    ...(loser?.preferred_metrics || {}),
    ...(winner?.preferred_metrics || {})
  }

  if (shouldCarryForwardTechnogymDistance(winner, loser)) {
    const technoDistance = getTechnogymDistanceMetric(loser)
    merged.distance = {
      ...(winner?.preferred_metrics?.distance || {}),
      ...technoDistance
    }
  } else if (!merged.distance && loser?.preferred_metrics?.distance) {
    merged.distance = { ...loser.preferred_metrics.distance }
  }

  return merged
}

function mergeCanonicalSessionPair(a, b) {
  const winner = canonicalSessionQualityScore(a) >= canonicalSessionQualityScore(b) ? a : b
  const loser = winner === a ? b : a

  return {
    ...loser,
    ...winner,
    sources: mergeSessionSources(winner, loser),
    preferred_metrics: mergePreferredMetrics(winner, loser)
  }
}

function getDuplicateSessionKey(session) {
  const startMs = toMsForScheduleSeeds(session?.start_date || session?.dateTime || session?.date)
  const endMs = toMsForScheduleSeeds(session?.end_date)
  const type = normalizeCanonicalType(session?.canonical_type || session?.type)
  if (!Number.isFinite(startMs) || !type) {
    return session?.session_id || makeSessionId("session", session)
  }

  const roundedStart = Math.round(startMs / (5 * 60 * 1000))
  const roundedEnd = Number.isFinite(endMs) ? Math.round(endMs / (5 * 60 * 1000)) : "na"
  return `${type}|${roundedStart}|${roundedEnd}`
}

export function dedupeCanonicalSessions(sessions) {
  const deduped = new Map()

  ;(Array.isArray(sessions) ? sessions : []).forEach(session => {
    const key = getDuplicateSessionKey(session)
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, session)
      return
    }
    deduped.set(key, mergeCanonicalSessionPair(existing, session))
  })

  return [...deduped.values()].sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")))
}

function estimateScheduleStrengthTrimp(entry) {
  const exList = Array.isArray(entry?.exercises) ? entry.exercises : []
  const strengthEx = exList.filter(ex => ex?.variant !== "cardio")
  if (!strengthEx.length) return 40
  const totalSets = strengthEx.reduce((acc, ex) => {
    const actualSets = ex?.actual?.sets
    const prescribedSets = ex?.prescribed?.sets
    const sets = Number(actualSets ?? prescribedSets ?? 0)
    return acc + (Number.isFinite(sets) && sets > 0 ? sets : 3)
  }, 0)
  return Math.round(Math.min(80, 8 + totalSets * 3.5))
}

export function safeCloneForScheduleSeeds(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value))
}

function normalizeOffsetForScheduleSeeds(offset) {
  if (!offset) return ""
  if (/^[+-]\d{2}:\d{2}$/.test(offset)) return offset
  if (/^[+-]\d{4}$/.test(offset)) return offset.slice(0, 3) + ":" + offset.slice(3)
  return offset
}

function normalizeDateStringForScheduleSeeds(value) {
  const raw = String(value || "").trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}:?\d{2}|Z))?$/)
  if (m) {
    const tz = m[3] === "Z" ? "Z" : normalizeOffsetForScheduleSeeds(m[3] || "")
    return m[1] + "T" + m[2] + tz
  }
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export function toMsForScheduleSeeds(value) {
  const normalized = normalizeDateStringForScheduleSeeds(value)
  if (!normalized) return null
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

export function normalizeWorkoutTypeForScheduleSeeds(type, workout) {
  const t = String(type || "").toLowerCase()

  if (t.includes("traditional strength")) return "Strength"
  if (t.includes("functional strength")) return "Strength"
  if (t.includes("core")) return "Strength"

  if (t.includes("running")) return "Running"
  if (t.includes("walking")) return "Walking"
  if (t.includes("cycling")) return "Cycling"
  if (t.includes("swimming")) return "Swimming"
  if (t.includes("elliptical")) return "Elliptical"
  if (t.includes("rowing")) return "Rowing"
  if (t.includes("stair")) return "Stairs"

  if (t.includes("machine cardio") || t === "other") {
    const rpmAvg =
      workout?.preferred_metrics?.rpm_avg?.value ??
      workout?.sources?.technogym?.rpm_avg ??
      workout?.rpm_avg ??
      null

    if (rpmAvg !== null && Number.isFinite(Number(rpmAvg))) return "Cycling"

    const powerAvg =
      workout?.preferred_metrics?.power_avg?.value ??
      workout?.sources?.technogym?.power_avg ??
      null

    const tgRaw = String(workout?.sources?.technogym?.raw_type || "").toLowerCase()
    if (powerAvg !== null && Number.isFinite(Number(powerAvg)) && tgRaw.includes("machine")) return "Cycling"

    const tgType = String(
      workout?.sources?.technogym?.type ||
      workout?.sources?.technogym?.raw_type ||
      workout?.sources?.technogym?.activity_type ||
      ""
    ).toLowerCase()

    if (tgType.includes("cycl") || tgType.includes("bike") || tgType.includes("spin")) return "Cycling"
    if (tgType.includes("run") || tgType.includes("tread")) return "Running"
    if (tgType.includes("row")) return "Rowing"
    if (tgType.includes("swim")) return "Swimming"
    if (tgType.includes("ellip")) return "Elliptical"
    if (tgType.includes("stair") || tgType.includes("climb")) return "Stairs"
    if (tgType.includes("strength") || tgType.includes("weight") || tgType.includes("train")) return "Strength"
    return "Machine Cardio"
  }

  return "Other"
}

export function makeCanonicalSessionFromScheduleLog(entry) {
  const startDate =
    entry?.logged_at ||
    (entry?.date ? `${String(entry.date).slice(0, 10)}T12:00:00` : null)
  const durationMin = 60
  const startMs = toMsForScheduleSeeds(startDate)
  const endDate = Number.isFinite(startMs)
    ? new Date(startMs + durationMin * 60000).toISOString()
    : null

  return {
    session_id: `schedule_${entry?.session_id || entry?.id || stableHash(JSON.stringify(entry || {}))}`,
    match_confidence: "single_source",
    relationship: "schedule_only",
    canonical_type: "Traditional Strength Training",
    start_date: startDate,
    end_date: endDate,
    duration_min: durationMin,
    overlap_summary: null,
    trimp: estimateScheduleStrengthTrimp(entry),
    sources: {
      apple: null,
      technogym: null,
      schedule: safeCloneForScheduleSeeds(entry)
    },
    preferred_metrics: {
      hr: { value: null, source: null },
      calories: { value: null, source: null },
      distance: { value: null, source: null, rationale: null, unit: null },
      power_avg: { value: null, source: null },
      level: { value: null, source: null },
      rpm_avg: { value: null, source: null },
      vo2: { value: null, source: null, note: null }
    }
  }
}

export function isObviousScheduleCanonicalDuplicate(canonical, scheduleSeed) {
  const canonicalType = normalizeWorkoutTypeForScheduleSeeds(canonical?.canonical_type || canonical?.type, canonical)
  const scheduleType = normalizeWorkoutTypeForScheduleSeeds(scheduleSeed?.canonical_type || scheduleSeed?.type, scheduleSeed)
  if (canonicalType !== "Strength" || scheduleType !== "Strength") return false

  const canonicalDate = String(canonical?.start_date || canonical?.dateTime || canonical?.date || "").slice(0, 10)
  const scheduleDate = String(scheduleSeed?.start_date || scheduleSeed?.dateTime || scheduleSeed?.date || "").slice(0, 10)
  if (!canonicalDate || canonicalDate !== scheduleDate) return false

  const canonicalMs = toMsForScheduleSeeds(canonical?.start_date || canonical?.dateTime || canonical?.date)
  const scheduleMs = toMsForScheduleSeeds(scheduleSeed?.start_date || scheduleSeed?.dateTime || scheduleSeed?.date)
  if (Number.isFinite(canonicalMs) && Number.isFinite(scheduleMs) && Math.abs(canonicalMs - scheduleMs) > 3 * 60 * 60 * 1000) {
    return false
  }

  const canonicalDur = Number(canonical?.duration_min ?? canonical?.dur_min ?? canonical?.dur ?? 0) || 0
  const scheduleDur = Number(scheduleSeed?.duration_min ?? scheduleSeed?.dur_min ?? scheduleSeed?.dur ?? 0) || 0
  if (canonicalDur > 0 && scheduleDur > 0 && Math.abs(canonicalDur - scheduleDur) > 90) return false

  return true
}

export function mergeCanonicalSessionsWithScheduleSeeds(canonicalSessions, scheduleSeeds) {
  const merged = (Array.isArray(canonicalSessions) ? canonicalSessions : []).map(session => ({
    ...session,
    sources: { ...(session?.sources || {}) }
  }))

  ;(Array.isArray(scheduleSeeds) ? scheduleSeeds : []).forEach(seed => {
    const matchIdx = merged.findIndex(session => isObviousScheduleCanonicalDuplicate(session, seed))
    if (matchIdx >= 0) {
      const existing = merged[matchIdx]
      merged[matchIdx] = {
        ...existing,
        sources: {
          ...(existing?.sources || {}),
          schedule: seed?.sources?.schedule || null
        }
      }
      return
    }
    merged.push(seed)
  })

  return dedupeCanonicalSessions(merged)
}
