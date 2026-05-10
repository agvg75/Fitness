function safeJsonString(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

const SLEEP_UPSERT_TIMEOUT_MS = 15000
const SLEEP_UPSERT_BATCH_SIZE = 50

const withTimeout = (promise, ms = SLEEP_UPSERT_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`upsertSleepRecords: timeout after ${ms}ms`)), ms)
    )
  ])

function stableHash(input) {
  const str = String(input || "")
  let hash = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function removeLocalKey(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

function requireSupabase(supabase, userId, label) {
  if (!supabase || !userId) {
    throw new Error(`${label} requires a Supabase client and user id`)
  }
}

function throwIfError(error, label) {
  if (error) throw new Error(`${label}: ${error.message || String(error)}`)
}

function dateOnly(value) {
  const date = String(value || "").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

function explicitDateOnly(...values) {
  for (const value of values) {
    const date = dateOnly(value)
    if (date) return date
  }
  return null
}

function normalizeOffset(offset) {
  if (!offset) return ""
  if (/^[+-]\d{2}:\d{2}$/.test(offset)) return offset
  if (/^[+-]\d{4}$/.test(offset)) return `${offset.slice(0, 3)}:${offset.slice(3)}`
  return offset
}

function normalizeTimestampInput(value) {
  const raw = String(value || "").trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw
      .replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, "$1")
      .replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}:?\d{2}|Z))?$/)
  if (match) {
    const tz = match[3] === "Z" ? "Z" : normalizeOffset(match[3] || "")
    return `${match[1]}T${match[2]}${tz}`
  }
  return raw
}

function timestampOrNull(value) {
  if (!value) return null
  const date = new Date(normalizeTimestampInput(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function deterministicId(prefix, parts) {
  return `${prefix}_${stableHash(parts.map(part => part == null ? "" : String(part)).join("|"))}`
}

function canonicalSessionId(session) {
  return String(session?.session_id || deterministicId("canonical", [
    session?.canonical_type || session?.type,
    session?.start_date || session?.dateTime || session?.date,
    session?.end_date,
    safeJsonString(session?.sources || session),
  ]))
}

function canonicalSessionToRow(session, userId) {
  return {
    user_id: userId,
    session_id: canonicalSessionId(session),
    canonical_type: session?.canonical_type || session?.type || null,
    start_date: timestampOrNull(session?.start_date || session?.dateTime || session?.date),
    end_date: timestampOrNull(session?.end_date),
    duration_min: session?.duration_min ?? session?.dur ?? null,
    match_confidence: session?.match_confidence || null,
    relationship: session?.relationship || null,
    overlap_summary: session?.overlap_summary || null,
    sources: session?.sources || {},
    preferred_metrics: session?.preferred_metrics || {},
    id: session?.id ?? crypto.randomUUID(),
  }
}

function rowToCanonicalSession(row) {
  return {
    ...(row?.raw || {}),
    session_id: row?.session_id,
    canonical_type: row?.raw?.canonical_type ?? row?.canonical_type,
    start_date: row?.raw?.start_date ?? row?.start_date,
    end_date: row?.raw?.end_date ?? row?.end_date,
    duration_min: row?.raw?.duration_min ?? row?.duration_min,
    trimp: row?.raw?.trimp ?? row?.trimp,
    match_confidence: row?.raw?.match_confidence ?? row?.match_confidence,
    relationship: row?.raw?.relationship ?? row?.relationship,
    overlap_summary: row?.raw?.overlap_summary ?? row?.overlap_summary,
    sources: row?.raw?.sources ?? row?.sources ?? {},
    preferred_metrics: row?.raw?.preferred_metrics ?? row?.preferred_metrics ?? {},
  }
}

export async function loadCanonicalSessions(supabase, userId) {
  requireSupabase(supabase, userId, "loadCanonicalSessions")

  let allSessions = []
  let from = 0
  const PAGE_SIZE = 1000

  while (true) {
    const { data, error } = await supabase
      .from("canonical_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    throwIfError(error, "loadCanonicalSessions")

    if (!data || data.length === 0) break
    allSessions = allSessions.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const data = allSessions
  return data.map(rowToCanonicalSession)
}

/**
 * Merges two canonical session row objects using field-level source priority.
 * existing: the row currently in Supabase (may be null if new record)
 * incoming: the row being imported right now
 * Returns: the merged row to write back to Supabase
 */
function mergeCanonicalSessionRow(existing, incoming) {
  if (!existing) return incoming

  const pick = (existingVal, incomingVal) => {
    const existingNum = Number(existingVal)
    const hasExisting = existingVal != null && (!Number.isFinite(existingNum) || existingNum > 0)
    return hasExisting ? existingVal : incomingVal
  }

  const existingSources = existing.sources || {}
  const incomingSources = incoming.sources || {}
  const mergedSources = { ...existingSources, ...incomingSources }

  const existingIsApple = existingSources.apple != null
  const incomingIsApple = incomingSources.apple != null
  const existingIsFitnessView = existingSources.fitnessview != null
  const incomingIsFitnessView = incomingSources.fitnessview != null
  const existingIsTechnogym = existingSources.technogym != null
  const incomingIsTechnogym = incomingSources.technogym != null

  const existingDist = existing.preferred_metrics?.distance?.value
  const incomingDist = incoming.preferred_metrics?.distance?.value

  let finalDistance
  if (incomingIsTechnogym && Number(incomingDist) > 0) {
    finalDistance = incomingDist
  } else if (existingIsTechnogym && Number(existingDist) > 0) {
    finalDistance = existingDist
  } else {
    finalDistance = pick(existingDist, incomingDist)
  }

  const existingPower = existing.preferred_metrics?.power_avg?.value
  const incomingPower = incoming.preferred_metrics?.power_avg?.value
  const finalPower = incomingIsTechnogym && Number(incomingPower) > 0
    ? incomingPower
    : pick(existingPower, incomingPower)

  const existingCadence = existing.preferred_metrics?.rpm_avg?.value
  const incomingCadence = incoming.preferred_metrics?.rpm_avg?.value
  const finalCadence = incomingIsTechnogym && Number(incomingCadence) > 0
    ? incomingCadence
    : pick(existingCadence, incomingCadence)

  const existingCal = existing.preferred_metrics?.calories?.value
  const incomingCal = incoming.preferred_metrics?.calories?.value

  let finalCalories
  if (existingIsApple && Number(existingCal) > 0) {
    finalCalories = existingCal
  } else if (incomingIsApple && Number(incomingCal) > 0) {
    finalCalories = incomingCal
  } else if (existingIsFitnessView && Number(existingCal) > 0) {
    finalCalories = existingCal
  } else if (incomingIsFitnessView && Number(incomingCal) > 0) {
    finalCalories = incomingCal
  } else {
    finalCalories = pick(existingCal, incomingCal)
  }

  const existingHr = existing.preferred_metrics?.hr?.value
  const incomingHr = incoming.preferred_metrics?.hr?.value
  let finalHr
  if (existingIsApple && Number(existingHr) > 0) {
    finalHr = existingHr
  } else if (incomingIsApple && Number(incomingHr) > 0) {
    finalHr = incomingHr
  } else if (existingIsFitnessView && Number(existingHr) > 0) {
    finalHr = existingHr
  } else if (incomingIsFitnessView && Number(incomingHr) > 0) {
    finalHr = incomingHr
  } else {
    finalHr = pick(existingHr, incomingHr)
  }

  const existingDur = existing.duration_min
  const incomingDur = incoming.duration_min
  let finalDur
  if (existingIsApple && Number(existingDur) > 0) {
    finalDur = existingDur
  } else if (incomingIsApple && Number(incomingDur) > 0) {
    finalDur = incomingDur
  } else if (existingIsFitnessView && Number(existingDur) > 0) {
    finalDur = existingDur
  } else if (incomingIsFitnessView && Number(incomingDur) > 0) {
    finalDur = incomingDur
  } else {
    finalDur = pick(existingDur, incomingDur)
  }

  const typeSpecificity = (type) => {
    if (!type) return 0
    const known = [
      "Functional Strength Training",
      "Traditional Strength Training",
      "Indoor Cycling",
      "Running",
      "Swimming",
      "Walking",
      "Rowing",
      "Cycling",
      "Elliptical",
      "Other",
    ]
    const index = known.indexOf(type)
    return index === -1 ? 1 : known.length - index
  }

  const finalType = typeSpecificity(existing.canonical_type) >= typeSpecificity(incoming.canonical_type)
    ? existing.canonical_type
    : incoming.canonical_type

  const mergedPreferredMetrics = {
    ...(existing.preferred_metrics || {}),
    ...(incoming.preferred_metrics || {}),
    distance: { ...(existing.preferred_metrics?.distance || {}), value: finalDistance },
    calories: { ...(existing.preferred_metrics?.calories || {}), value: finalCalories },
    hr: { ...(existing.preferred_metrics?.hr || {}), value: finalHr },
    power_avg: { ...(existing.preferred_metrics?.power_avg || {}), value: finalPower },
    rpm_avg: { ...(existing.preferred_metrics?.rpm_avg || {}), value: finalCadence },
  }

  return {
    ...existing,
    ...incoming,
    canonical_type: finalType,
    duration_min: finalDur,
    sources: mergedSources,
    preferred_metrics: mergedPreferredMetrics,
    created_at: existing.created_at || incoming.created_at,
    id: existing.id ?? incoming.id,
  }
}

export async function upsertCanonicalSessions(supabase, userId, sessions) {
  requireSupabase(supabase, userId, "upsertCanonicalSessions")
  const incoming = (Array.isArray(sessions) ? sessions : [])
    .map(session => canonicalSessionToRow(session, userId))
    .filter(row => row.session_id)
  if (!incoming.length) return []

  const sessionIds = incoming.map(row => row.session_id)
  const { data: existingRows, error: readError } = await supabase
    .from("canonical_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("session_id", sessionIds)
  throwIfError(readError, "upsertCanonicalSessions:read")

  const existingBySessionId = {}
  ;(existingRows || []).forEach(row => {
    existingBySessionId[row.session_id] = row
  })

  const merged = incoming.map(row =>
    mergeCanonicalSessionRow(existingBySessionId[row.session_id] || null, row)
  )

  const { data, error } = await supabase
    .from("canonical_sessions")
    .upsert(merged, { onConflict: "session_id" })
    .select()
  throwIfError(error, "upsertCanonicalSessions:write")
  return (data || []).map(rowToCanonicalSession)
}

export async function migrateLocalCanonicalSessions(supabase, userId, { removeLocal = false } = {}) {
  const local = readLocalArray("lift_canonical_sessions")
  if (!local.length) return []
  const migrated = await upsertCanonicalSessions(supabase, userId, local)
  if (removeLocal && migrated.length) removeLocalKey("lift_canonical_sessions")
  return migrated
}

function sleepRecordId(record) {
  return String(record?.sleep_id || record?.id || deterministicId("sleep", [
    record?.source,
    record?.date || record?.sleep_date,
    record?.start_at || record?.start_time,
    record?.end_at || record?.end_time,
    record?.duration_min,
  ]))
}

function sleepRecordToRow(record, userId) {
  const sleepDate = explicitDateOnly(
    record?.sleep_date,
    record?.date,
    record?.end_at,
    record?.end_time,
    record?.start_at,
    record?.start_time
  )
  return {
    user_id: userId,
    sleep_id: sleepRecordId(record),
    source: record?.source || null,
    sleep_date: sleepDate,
    start_at: timestampOrNull(record?.start_at || record?.start_time),
    end_at: timestampOrNull(record?.end_at || record?.end_time),
    duration_min: record?.duration_min ?? null,
    time_in_bed_min: record?.time_in_bed_min ?? null,
    sleep_quality: record?.sleep_quality ?? null,
    avg_hr_bpm: record?.avg_hr_bpm ?? null,
    steps: record?.steps ?? null,
    notes: record?.notes || null,
    raw: record || {},
  }
}

function rowToSleepRecord(row) {
  return {
    ...(row?.raw || {}),
    sleep_id: row?.sleep_id,
    source: row?.raw?.source ?? row?.source,
    date: row?.raw?.date ?? row?.sleep_date,
    sleep_date: row?.raw?.sleep_date ?? row?.sleep_date,
    start_at: row?.raw?.start_at ?? row?.start_at,
    end_at: row?.raw?.end_at ?? row?.end_at,
    duration_min: row?.raw?.duration_min ?? row?.duration_min,
    time_in_bed_min: row?.raw?.time_in_bed_min ?? row?.time_in_bed_min,
    sleep_quality: row?.raw?.sleep_quality ?? row?.sleep_quality,
    avg_hr_bpm: row?.raw?.avg_hr_bpm ?? row?.avg_hr_bpm,
    steps: row?.raw?.steps ?? row?.steps,
    notes: row?.raw?.notes ?? row?.notes,
  }
}

export async function loadSleepRecords(supabase, userId) {
  requireSupabase(supabase, userId, "loadSleepRecords")
  const { data, error } = await supabase
    .from("sleep_records")
    .select("*")
    .eq("user_id", userId)
    .order("sleep_date", { ascending: true })
  throwIfError(error, "loadSleepRecords")
  return (data || []).map(rowToSleepRecord)
}

export async function upsertSleepRecords(supabase, userId, records) {
  requireSupabase(supabase, userId, "upsertSleepRecords")
  const inputRecords = Array.isArray(records) ? records : []
  const normalizedRows = inputRecords.map(record => sleepRecordToRow(record, userId))
  const rows = normalizedRows.filter(row => row.sleep_id && row.sleep_date)
  const rejectedRows = normalizedRows
    .map((row, index) => ({ row, record: inputRecords[index] }))
    .filter(({ row }) => !row.sleep_id || !row.sleep_date)
    .map(({ row, record }) => ({
      sleep_date: record?.sleep_date,
      date: record?.date,
      start_time: record?.start_time,
      end_time: record?.end_time,
      start_at: record?.start_at,
      end_at: record?.end_at,
      source: record?.source,
      derived: {
        sleep_id: row.sleep_id,
        sleep_date: row.sleep_date,
      },
      rejectionReason: !row.sleep_id && !row.sleep_date
        ? "missing sleep_id and sleep_date"
        : !row.sleep_id
        ? "missing sleep_id"
        : "missing sleep_date",
    }))
  const sampleRejectedRows = rejectedRows.slice(0, 3)
  console.log("Sleep migration normalization summary", {
    inputRecordCount: inputRecords.length,
    normalizedRowCount: rows.length,
    rejectedRecordCount: rejectedRows.length,
    sampleRejectedRows,
  })
  if (inputRecords.length > 0 && rows.length === 0) {
    console.warn("Sleep migration rejected all rows during normalization", {
      inputRecordCount: inputRecords.length,
      normalizedRowCount: rows.length,
      rejectedRecordCount: rejectedRows.length,
      sampleRejectedRows,
    })
  }
  if (!rows.length) return []
  const writtenRows = []
  for (let index = 0; index < rows.length; index += SLEEP_UPSERT_BATCH_SIZE) {
    const chunk = rows.slice(index, index + SLEEP_UPSERT_BATCH_SIZE)
    const { data, error } = await withTimeout(
      supabase
        .from("sleep_records")
        .upsert(chunk, { onConflict: "user_id,sleep_id" })
        .select()
    )
    throwIfError(error, "upsertSleepRecords")
    writtenRows.push(...(data || []))
  }
  return writtenRows.map(rowToSleepRecord)
}

export async function migrateLocalSleepRecords(supabase, userId, { removeLocal = false } = {}) {
  const local = readLocalArray("lift_sleep_records")
  if (!local.length) return []
  const migrated = await upsertSleepRecords(supabase, userId, local)
  if (removeLocal && migrated.length) removeLocalKey("lift_sleep_records")
  return migrated
}

function healthfitRecordToRow(record, userId) {
  return {
    user_id: userId,
    record_date: explicitDateOnly(record?.record_date, record?.date),
    ctl: record?.ctl ?? null,
    atl: record?.atl ?? null,
    tsb: record?.tsb ?? null,
    acwr: record?.acwr ?? null,
    trimp: record?.trimp ?? null,
    duration_sec: record?.duration_sec ?? null,
    raw: record || {},
  }
}

function rowToHealthfitRecord(row) {
  return {
    ...(row?.raw || {}),
    date: row?.raw?.date ?? row?.record_date,
    record_date: row?.raw?.record_date ?? row?.record_date,
    ctl: row?.raw?.ctl ?? row?.ctl,
    atl: row?.raw?.atl ?? row?.atl,
    tsb: row?.raw?.tsb ?? row?.tsb,
    acwr: row?.raw?.acwr ?? row?.acwr,
    trimp: row?.raw?.trimp ?? row?.trimp,
    duration_sec: row?.raw?.duration_sec ?? row?.duration_sec,
  }
}

export async function loadHealthfitDaily(supabase, userId) {
  requireSupabase(supabase, userId, "loadHealthfitDaily")
  const { data, error } = await supabase
    .from("healthfit_daily")
    .select("*")
    .eq("user_id", userId)
    .order("record_date", { ascending: true })
  throwIfError(error, "loadHealthfitDaily")
  return (data || []).map(rowToHealthfitRecord)
}

export async function upsertHealthfitDaily(supabase, userId, records) {
  requireSupabase(supabase, userId, "upsertHealthfitDaily")
  const rows = (Array.isArray(records) ? records : [])
    .map(record => healthfitRecordToRow(record, userId))
    .filter(row => row.record_date)
  if (!rows.length) return []
  const { data, error } = await supabase
    .from("healthfit_daily")
    .upsert(rows, { onConflict: "user_id,record_date" })
    .select()
  throwIfError(error, "upsertHealthfitDaily")
  return (data || []).map(rowToHealthfitRecord)
}

export async function migrateLocalHealthfitDaily(supabase, userId, store, { removeLocal = false } = {}) {
  const local = readLocalArray("healthfit-daily")
  const stored = store?.get ? await store.get("healthfit-daily") : []
  const records = [...local, ...(Array.isArray(stored) ? stored : [])]
  if (!records.length) return []
  const migrated = await upsertHealthfitDaily(supabase, userId, records)
  if (removeLocal && migrated.length) removeLocalKey("healthfit-daily")
  return migrated
}

function biometricRecordId(record) {
  return String(record?.biometric_id || record?.id || deterministicId("bio", [
    record?.source,
    record?.timestamp || record?.measured_at,
    record?.date || record?.measured_date,
    record?.bp_systolic,
    record?.bp_diastolic,
    record?.weight_lb,
    record?.vo2_max,
  ]))
}

function biometricRecordToRow(record, userId) {
  return {
    user_id: userId,
    biometric_id: biometricRecordId(record),
    source: record?.source || null,
    measured_at: timestampOrNull(record?.measured_at || record?.timestamp),
    measured_date: explicitDateOnly(
      record?.measured_date,
      record?.date,
      record?.measured_at,
      record?.timestamp
    ),
    active_energy_cal: record?.active_energy_cal ?? null,
    resting_energy_cal: record?.resting_energy_cal ?? null,
    resting_hr_bpm: record?.resting_hr_bpm ?? null,
    hrv: record?.hrv ?? null,
    steps: record?.steps ?? null,
    vo2_max: record?.vo2_max ?? null,
    exercise_minutes: record?.exercise_minutes ?? null,
    stand_hours: record?.stand_hours ?? null,
    weight_lb: record?.weight_lb ?? null,
    body_fat_pct: record?.body_fat_pct ?? null,
    bmi: record?.bmi ?? null,
    bp_systolic: record?.bp_systolic ?? null,
    bp_diastolic: record?.bp_diastolic ?? null,
    pulse_bpm: record?.pulse_bpm ?? null,
    raw: record || {},
  }
}

function rowToBiometricRecord(row) {
  return {
    ...(row?.raw || {}),
    biometric_id: row?.biometric_id,
    source: row?.raw?.source ?? row?.source,
    timestamp: row?.raw?.timestamp ?? row?.measured_at,
    measured_at: row?.raw?.measured_at ?? row?.measured_at,
    date: row?.raw?.date ?? row?.measured_date,
    measured_date: row?.raw?.measured_date ?? row?.measured_date,
    active_energy_cal: row?.raw?.active_energy_cal ?? row?.active_energy_cal,
    resting_energy_cal: row?.raw?.resting_energy_cal ?? row?.resting_energy_cal,
    resting_hr_bpm: row?.raw?.resting_hr_bpm ?? row?.resting_hr_bpm,
    hrv: row?.raw?.hrv ?? row?.hrv,
    steps: row?.raw?.steps ?? row?.steps,
    vo2_max: row?.raw?.vo2_max ?? row?.vo2_max,
    exercise_minutes: row?.raw?.exercise_minutes ?? row?.exercise_minutes,
    stand_hours: row?.raw?.stand_hours ?? row?.stand_hours,
    weight_lb: row?.raw?.weight_lb ?? row?.weight_lb,
    body_fat_pct: row?.raw?.body_fat_pct ?? row?.body_fat_pct,
    bmi: row?.raw?.bmi ?? row?.bmi,
    bp_systolic: row?.raw?.bp_systolic ?? row?.bp_systolic,
    bp_diastolic: row?.raw?.bp_diastolic ?? row?.bp_diastolic,
    pulse_bpm: row?.raw?.pulse_bpm ?? row?.pulse_bpm,
  }
}

export async function loadBiometricRecords(supabase, userId) {
  requireSupabase(supabase, userId, "loadBiometricRecords")
  const { data, error } = await supabase
    .from("biometric_records")
    .select("*")
    .eq("user_id", userId)
    .order("measured_date", { ascending: true })
  throwIfError(error, "loadBiometricRecords")
  return (data || []).map(rowToBiometricRecord)
}

export async function upsertBiometricRecords(supabase, userId, records) {
  requireSupabase(supabase, userId, "upsertBiometricRecords")
  const rows = (Array.isArray(records) ? records : [])
    .map(record => biometricRecordToRow(record, userId))
    .filter(row => row.biometric_id)
  if (!rows.length) return []
  const { data, error } = await supabase
    .from("biometric_records")
    .upsert(rows, { onConflict: "user_id,biometric_id" })
    .select()
  throwIfError(error, "upsertBiometricRecords")
  return (data || []).map(rowToBiometricRecord)
}

export async function migrateLocalBiometricRecords(supabase, userId, { removeLocal = false } = {}) {
  const local = readLocalArray("lift_biometric_records")
  if (!local.length) return []
  const migrated = await upsertBiometricRecords(supabase, userId, local)
  if (removeLocal && migrated.length) removeLocalKey("lift_biometric_records")
  return migrated
}
