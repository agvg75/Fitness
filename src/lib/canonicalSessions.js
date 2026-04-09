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

export function dedupeCanonicalSessions(sessions) {
  const seen = new Set()
  return (Array.isArray(sessions) ? sessions : []).filter(session => {
    const key = session?.session_id || makeSessionId("session", session)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")))
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
    canonical_type: "Strength",
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
