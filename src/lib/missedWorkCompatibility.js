const DAY_MS = 86400000

const profile = (movement_pattern, primary_regions, training_role, burden, compound_class, estimated_minutes, extra = {}) => ({
  movement_pattern, primary_regions, training_role, burden, compound_class, estimated_minutes,
  lower_body_load: "none", upper_body_load: "none", tendon_sensitive: false,
  optional_or_drop_first: false, ...extra,
})

const AUGUST_EXERCISE_PROFILES = {
  chinups: profile("vertical_pull", ["back", "biceps"], "compound", "medium", "compound", 6, { upper_body_load: "medium" }),
  chest_press_machine: profile("horizontal_push", ["chest", "triceps", "shoulder"], "compound", "high", "heavy_compound", 8, { upper_body_load: "high" }),
  incline_chest_press: profile("incline_push", ["chest", "triceps", "shoulder"], "compound", "high", "heavy_compound", 8, { upper_body_load: "high" }),
  machine_flys: profile("chest_fly", ["chest", "shoulder"], "isolation", "low", "non_compound", 5, { upper_body_load: "low" }),
  triceps_pulldown: profile("elbow_extension", ["triceps", "elbow"], "accessory", "medium", "non_compound", 5, { upper_body_load: "medium" }),
  triceps_overhead: profile("elbow_extension", ["triceps", "elbow", "shoulder"], "isolation", "medium", "non_compound", 4, { upper_body_load: "medium" }),
  cable_incline_pushdown: profile("elbow_extension", ["triceps", "chest"], "accessory", "low", "non_compound", 5, { upper_body_load: "low" }),
  lateral_raise: profile("shoulder_abduction", ["shoulder"], "isolation", "low", "non_compound", 5, { upper_body_load: "low" }),
  rear_delt_fly: profile("scapular_retraction", ["rear_shoulder", "upper_back"], "accessory", "low", "non_compound", 5, { upper_body_load: "low" }),
  face_pull_er: profile("external_rotation", ["shoulder", "upper_back"], "corrective", "low", "non_compound", 4, { upper_body_load: "low", tendon_sensitive: true }),
  eccentric_lateral_raise_mon: profile("shoulder_abduction", ["shoulder"], "tendon", "low", "non_compound", 4, { upper_body_load: "low", tendon_sensitive: true }),

  t1: profile("hip_extension", ["glutes", "hamstrings"], "compound", "high", "heavy_compound", 8, { lower_body_load: "high" }),
  t_abd: profile("hip_abduction", ["lateral_hip"], "isolation", "medium", "non_compound", 5, { lower_body_load: "medium" }),
  t2a: profile("knee_dominant_press", ["quads", "glutes", "foot"], "compound", "high", "heavy_compound", 9, { lower_body_load: "high" }),
  t2b: profile("unilateral_knee_press", ["left_quad", "left_glute", "left_foot"], "corrective", "medium", "non_compound", 6, { lower_body_load: "medium", tendon_sensitive: true }),
  t_hec: profile("knee_flexion_eccentric", ["hamstrings", "knee"], "corrective", "high", "non_compound", 7, { lower_body_load: "high", tendon_sensitive: true }),
  t6b: profile("unilateral_knee_extension", ["left_quad", "left_knee"], "corrective", "medium", "non_compound", 5, { lower_body_load: "medium", tendon_sensitive: true }),
  t7: profile("anti_extension", ["core"], "core", "low", "non_compound", 4, { upper_body_load: "low" }),
  t8: profile("trunk_control", ["core", "hip_flexors"], "core", "low", "non_compound", 4),
  mtp_balance: profile("foot_control", ["foot", "ankle"], "tendon", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
  eccentric_calf_raise: profile("plantar_flexion_eccentric", ["calf", "achilles", "foot"], "tendon", "medium", "non_compound", 4, { lower_body_load: "medium", tendon_sensitive: true }),
  tibialis_raise_dorsiflexion: profile("dorsiflexion", ["shin", "ankle", "foot"], "tendon", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
  tke_patellar: profile("knee_extension_terminal", ["knee", "patellar_tendon"], "tendon", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
  single_leg_balance: profile("balance", ["foot", "ankle", "knee"], "corrective", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),

  tibialis_raise_wed: profile("dorsiflexion", ["shin", "ankle", "foot"], "tendon", "low", "non_compound", 4, { lower_body_load: "low", tendon_sensitive: true }),
  eccentric_calf_raise_wed: profile("plantar_flexion_eccentric", ["calf", "achilles"], "tendon", "medium", "non_compound", 5, { lower_body_load: "medium", tendon_sensitive: true }),
  hip_flexor_iso_wed: profile("hip_flexion_isometric", ["hip_flexors"], "corrective", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
  face_pull_band_wed: profile("external_rotation", ["shoulder", "upper_back"], "corrective", "low", "non_compound", 4, { upper_body_load: "low", tendon_sensitive: true }),
  tke_band_wed: profile("knee_extension_terminal", ["knee", "patellar_tendon"], "tendon", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
  eccentric_bicep_curl_wed: profile("elbow_flexion_eccentric", ["biceps", "elbow"], "tendon", "medium", "non_compound", 4, { upper_body_load: "medium", tendon_sensitive: true }),
  arm_pump_curl_wed: profile("elbow_flexion", ["biceps", "elbow"], "pump", "low", "non_compound", 4, { upper_body_load: "low", optional_or_drop_first: true }),
  arm_pump_pushdown_wed: profile("elbow_extension", ["triceps", "elbow"], "pump", "low", "non_compound", 4, { upper_body_load: "low", optional_or_drop_first: true }),

  th10: profile("vertical_pull", ["back", "biceps"], "compound", "high", "heavy_compound", 8, { upper_body_load: "high" }),
  th11: profile("trunk_flexion", ["core", "hip_flexors"], "core", "medium", "non_compound", 5),
  th5: profile("elbow_flexion", ["biceps", "elbow"], "accessory", "high", "non_compound", 6, { upper_body_load: "high" }),
  th8: profile("neutral_elbow_flexion", ["biceps", "forearm", "elbow"], "accessory", "medium", "non_compound", 6, { upper_body_load: "medium" }),
  th_alt: profile("elbow_flexion_variant", ["biceps", "forearm", "elbow"], "accessory", "medium", "non_compound", 6, { upper_body_load: "medium" }),
  th1: profile("horizontal_pull", ["back", "biceps"], "compound", "high", "heavy_compound", 8, { upper_body_load: "high" }),
  th2: profile("vertical_pull", ["back", "biceps"], "compound", "high", "heavy_compound", 8, { upper_body_load: "high" }),
  th_sp: profile("vertical_push", ["shoulder", "triceps"], "compound", "high", "heavy_compound", 8, { upper_body_load: "high" }),
  th9: profile("loaded_carry", ["core", "grip"], "core", "medium", "non_compound", 5, { upper_body_load: "medium" }),
  eccentric_lateral_raise: profile("shoulder_abduction", ["shoulder"], "tendon", "low", "non_compound", 4, { upper_body_load: "low", tendon_sensitive: true }),
  eccentric_biceps_curl: profile("elbow_flexion_eccentric", ["biceps", "elbow"], "tendon", "medium", "non_compound", 4, { upper_body_load: "medium", tendon_sensitive: true }),
  face_pull_tendon: profile("external_rotation", ["shoulder", "upper_back"], "tendon", "low", "non_compound", 4, { upper_body_load: "low", tendon_sensitive: true }),
  pre_run_ankle_primer: profile("plantar_flexion", ["calf", "ankle"], "corrective", "low", "non_compound", 2, { lower_body_load: "low", tendon_sensitive: true, optional_or_drop_first: true }),

  f4: profile("hip_extension", ["glutes", "hamstrings"], "compound", "medium", "compound", 7, { lower_body_load: "medium" }),
  f5: profile("hip_hinge", ["hamstrings", "glutes", "lower_back"], "compound", "high", "heavy_compound", 8, { lower_body_load: "high" }),
  f5b: profile("spinal_hip_extension", ["lower_back", "glutes", "hamstrings"], "accessory", "medium", "non_compound", 5, { lower_body_load: "medium" }),
  f_le: profile("bilateral_knee_extension", ["quads", "knees"], "isolation", "medium", "non_compound", 5, { lower_body_load: "medium" }),
  f2: profile("hip_adduction", ["adductors", "hip"], "isolation", "medium", "non_compound", 5, { lower_body_load: "medium" }),
  f7: profile("anti_rotation", ["core"], "core", "low", "non_compound", 4),
  f0: profile("chest_fly", ["chest", "shoulder"], "isolation", "low", "non_compound", 5, { upper_body_load: "low", optional_or_drop_first: true }),
  tibialis_raise_primer: profile("dorsiflexion", ["shin", "ankle", "foot"], "corrective", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
  eccentric_calf_lighter: profile("plantar_flexion_eccentric", ["calf", "achilles"], "tendon", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
  hip_flexor_isometric: profile("hip_flexion_isometric", ["hip_flexors"], "corrective", "low", "non_compound", 3, { lower_body_load: "low", tendon_sensitive: true }),
}

export const AUGUST_EXERCISE_TAXONOMY = Object.freeze(Object.fromEntries(
  Object.entries(AUGUST_EXERCISE_PROFILES).map(([id, values]) => [id, Object.freeze({ id, ...values })])
))

const RELATIONSHIPS = {
  "chinups|th10": "exact", "t1|f4": "exact",
  "eccentric_lateral_raise_mon|eccentric_lateral_raise": "exact",
  "eccentric_bicep_curl_wed|eccentric_biceps_curl": "exact",
  "machine_flys|f0": "close", "t6b|f_le": "close",
  "face_pull_er|face_pull_band_wed": "close", "face_pull_er|face_pull_tendon": "close",
  "face_pull_band_wed|face_pull_tendon": "close",
  "triceps_pulldown|arm_pump_pushdown_wed": "close", "cable_incline_pushdown|arm_pump_pushdown_wed": "close",
  "tibialis_raise_dorsiflexion|tibialis_raise_wed": "close", "tibialis_raise_wed|tibialis_raise_primer": "close",
  "eccentric_calf_raise|eccentric_calf_raise_wed": "close", "eccentric_calf_raise_wed|eccentric_calf_lighter": "close",
  "hip_flexor_iso_wed|hip_flexor_isometric": "close", "tke_patellar|tke_band_wed": "close",
  "t7|f7": "related", "chest_press_machine|f0": "related", "incline_chest_press|f0": "related",
  "t_hec|f5": "related", "t_hec|f5b": "related", "t2a|f_le": "related", "th11|f7": "related",
}

const relationKey = (left, right) => [left, right].sort().join("|")
const CURATED_RELATIONSHIPS = new Map(Object.entries(RELATIONSHIPS).map(([key, value]) => [relationKey(...key.split("|")), value]))

export function getExerciseRelationship(leftId, rightId) {
  if (leftId === rightId) return "exact"
  return CURATED_RELATIONSHIPS.get(relationKey(leftId, rightId)) || "none"
}

const parseDate = value => {
  const date = String(value || "").slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const n = Math.floor(Date.UTC(+match[1], +match[2] - 1, +match[3]) / DAY_MS)
  return new Date(n * DAY_MS).toISOString().slice(0, 10) === date ? { date, n } : null
}
const dayDiff = (left, right) => parseDate(right)?.n - parseDate(left)?.n
const weekStart = value => {
  const parsed = parseDate(value); if (!parsed) return null
  const offset = (new Date(parsed.n * DAY_MS).getUTCDay() + 6) % 7
  return new Date((parsed.n - offset) * DAY_MS).toISOString().slice(0, 10)
}

export function isRenderablePlanDay(planDay, cardioDay) {
  if (!planDay) return false
  return Boolean((planDay.sections || []).some(section => section?.ex?.length) || planDay.tendon?.length ||
    planDay.warmup?.length || planDay.cooldown?.length || String(planDay.topNote || "").trim() ||
    String(planDay.cardio || "").trim() || cardioDay?.sessions?.length)
}

export function classifyCardioSession(session) {
  const mod = String(session?.mod || "").toLowerCase()
  const text = `${session?.type || ""} ${session?.intensity || ""} ${session?.goal || ""}`.toLowerCase()
  const duration = Number(session?.dMax ?? session?.dMin ?? 0)
  if (mod === "run" && (/long|race/.test(text) || duration >= 50)) return "major"
  if (mod === "run" && duration >= 25) return "moderate"
  if ((mod === "bike" || mod === "swim") && duration >= 60 && /hard|race|interval/.test(text)) return "major"
  return "low"
}

export function getMajorCardioAnchors(currentCardio, receivingDates) {
  return (receivingDates || []).flatMap(({ day, date }) =>
    (currentCardio?.[day]?.sessions || []).flatMap(session => {
      const burden = classifyCardioSession(session)
      return burden === "major" ? [{ day, date, burden, modality: session.mod, type: session.type }] : []
    })
  )
}

const prescribedIds = day => [
  ...(day?.sections || []).flatMap(section => (section?.ex || []).map(ex => ex.id)),
  ...(day?.tendon || []).map(ex => ex.id),
].filter(Boolean)

export function estimateResistanceMinutes(planDay, taxonomy = AUGUST_EXERCISE_TAXONOMY) {
  return prescribedIds(planDay).reduce((total, id) => total + (taxonomy[id]?.estimated_minutes || 5), 0)
}

const DAY_TIME_BUDGETS = { Mon: 90, Tue: 75, Wed: 30, Thu: 90, Fri: 65, Sat: 0, Sun: 0 }

const normalizeRegion = value => {
  const region = String(value || "").toLowerCase()
  if (/toe|mtp|foot/.test(region)) return "foot"
  if (/achilles|calf/.test(region)) return "calf_achilles"
  if (/knee|patellar/.test(region)) return "knee"
  if (/hip|glute|adductor/.test(region)) return "hip"
  if (/shoulder|delt|rotator/.test(region)) return "shoulder"
  if (/elbow|bicep|tricep/.test(region)) return "elbow"
  if (/back/.test(region)) return "back"
  return region.trim()
}

function relevantOcState(profileData, exerciseId, ocState = []) {
  const profileRegions = new Set(profileData.primary_regions.flatMap(region => [String(region), normalizeRegion(region)]))
  return (ocState || []).filter(item => {
    if (Number(item?.currentScore || 0) <= 0 && !item?.active && !item?.hard_contraindication) return false
    return item?.exercise_ids?.includes?.(exerciseId) || item?.affected_exercise_ids?.includes?.(exerciseId) ||
      item?.regions?.some?.(region => profileRegions.has(String(region)) || profileRegions.has(normalizeRegion(region))) ||
      profileRegions.has(String(item?.location)) || profileRegions.has(normalizeRegion(item?.location))
  })
}

function deterministicRationale(action, candidateId, day, slotId, breakdown, exclusions) {
  if (exclusions.length) return `Not recommended for ${day}: ${exclusions.join("; ").replaceAll("_", " ")}.`
  const exact = breakdown.some(item => item.factor === "exact_existing_slot")
  const close = breakdown.some(item => item.factor === "close_existing_slot")
  const recovery = breakdown.find(item => item.factor.startsWith("recovery_"))?.factor.replace("recovery_", "").replaceAll("_", " ")
  const overlap = breakdown.some(item => item.factor === "high_tissue_overlap")
  const lead = action === "use_existing_slot"
    ? `Use ${day}'s existing ${slotId} slot${exact ? "; it is an exact match" : close ? "; it is a curated close equivalent" : ""}.`
    : `Adding ${candidateId} to ${day} is plausible.`
  return `${lead}${recovery ? ` Recovery is ${recovery}.` : ""}${overlap ? " The day already has substantial overlapping work." : ""}`
}

export function scoreMissedWorkReceivingDays({
  candidate, sourceSession = null, currentPlan = {}, currentCardio = {}, receivingDates = [], ocState = [],
  taxonomy = AUGUST_EXERCISE_TAXONOMY, dayTimeBudgets = DAY_TIME_BUDGETS,
} = {}) {
  if (!candidate || candidate.confidence_class === "excluded" || candidate.hard_exclusions?.length) return []
  const sourceDate = parseDate(candidate.source_session_date)
  const candidateProfile = taxonomy[candidate.source_exercise_id]
  if (!sourceDate || !candidateProfile) return []

  return (receivingDates || []).flatMap(({ day, date }) => {
    const receiving = parseDate(date)
    if (!receiving || receiving.n <= sourceDate.n || weekStart(date) !== weekStart(sourceDate.date)) return []
    const planDay = currentPlan?.[day]
    if (!isRenderablePlanDay(planDay, currentCardio?.[day])) return []

    const ids = prescribedIds(planDay)
    const relationships = ids.map(id => ({ id, relationship: getExerciseRelationship(candidate.source_exercise_id, id) }))
    const exactSlot = relationships.find(item => item.relationship === "exact")
    const closeSlot = relationships.find(item => item.relationship === "close")
    const relatedSlots = relationships.filter(item => item.relationship === "related")
    const existingSlot = exactSlot || closeSlot || null
    const recoveryHours = (receiving.n - sourceDate.n) * 24
    const hardExclusions = []
    const ocMatches = relevantOcState(candidateProfile, candidate.source_exercise_id, ocState)
    const explicitTime = candidate.omission_reason === "time"

    if (candidate.source_prescription_kind === "tendon" && !explicitTime) hardExclusions.push("unknown_tendon_omission")
    if (candidateProfile.optional_or_drop_first && !explicitTime) hardExclusions.push("optional_or_drop_first")
    if (candidateProfile.tendon_sensitive && ocMatches.length) hardExclusions.push("tendon_or_corrective_oc_contraindication")
    if (ocMatches.some(item => item.hard_contraindication || item.contraindicated)) hardExclusions.push("relevant_oc_contraindication")
    if (recoveryHours < 24) hardExclusions.push("recovery_under_24h")
    if (candidateProfile.compound_class === "heavy_compound" && recoveryHours < 48) hardExclusions.push("heavy_compound_recovery_under_48h")
    if (candidateProfile.compound_class === "heavy_compound" && ocMatches.length) hardExclusions.push("heavy_compound_oc_caution")

    const receivingProfiles = ids.map(id => taxonomy[id]).filter(Boolean)
    const sharedRegions = receivingProfiles.filter(p => p.primary_regions.some(region => candidateProfile.primary_regions.includes(region)))
    const heavyOverlap = sharedRegions.some(p => p.burden === "high")
    if (candidateProfile.compound_class === "heavy_compound" && heavyOverlap && !exactSlot) hardExclusions.push("heavy_compound_receiving_day_overlap")
    if (candidateProfile.compound_class === "heavy_compound" && !existingSlot) hardExclusions.push("heavy_compound_requires_compatible_slot")

    const laterAnchors = getMajorCardioAnchors(currentCardio, receivingDates)
      .filter(anchor => parseDate(anchor.date)?.n > receiving.n)
    const nextMajorRun = laterAnchors.find(anchor => anchor.modality === "run")
    const hoursToMajorRun = nextMajorRun ? dayDiff(date, nextMajorRun.date) * 24 : null
    if (candidateProfile.lower_body_load === "high" && hoursToMajorRun != null && hoursToMajorRun <= 48 && !exactSlot) {
      hardExclusions.push("lower_body_load_before_major_run")
    }

    const scheduledMinutes = estimateResistanceMinutes(planDay, taxonomy)
    const candidateMinutes = existingSlot ? 0 : candidateProfile.estimated_minutes
    const totalMinutes = scheduledMinutes + candidateMinutes
    const budget = dayTimeBudgets[day] ?? 75
    const breakdown = [{ factor: "neutral_base", points: 50 }]
    if (exactSlot) breakdown.push({ factor: "exact_existing_slot", points: 30 })
    else if (closeSlot) breakdown.push({ factor: "close_existing_slot", points: 18 })
    if (recoveryHours >= 72) breakdown.push({ factor: "recovery_72h_plus", points: 15 })
    else if (recoveryHours >= 48) breakdown.push({ factor: "recovery_48_71h", points: 8 })
    else breakdown.push({ factor: "recovery_24_47h", points: 0 })
    if (["accessory", "isolation", "core", "pump"].includes(candidateProfile.training_role)) breakdown.push({ factor: "accessory_or_core_role", points: 10 })
    if (["corrective", "tendon"].includes(candidateProfile.training_role) && !ocMatches.length) breakdown.push({ factor: "corrective_clearance", points: 5 })
    if (heavyOverlap) breakdown.push({ factor: "high_tissue_overlap", points: -20 })
    else if (sharedRegions.length) breakdown.push({ factor: "moderate_tissue_overlap", points: -8 })
    if (relatedSlots.length && !existingSlot) breakdown.push({ factor: "related_volume_already_present", points: -12 })
    if (budget > 0 && totalMinutes <= budget - 10) breakdown.push({ factor: "spare_estimated_time", points: 10 })
    if (budget > 0 && totalMinutes > budget) breakdown.push({ factor: "receiving_day_over_budget", points: -20 })
    else if (budget > 0 && scheduledMinutes >= budget * 0.85 && candidateMinutes > 0) breakdown.push({ factor: "receiving_day_near_budget", points: -10 })
    if (hoursToMajorRun != null && hoursToMajorRun <= 48 && candidateProfile.lower_body_load !== "none") breakdown.push({ factor: "major_run_within_48h", points: -25 })
    if (candidateProfile.compound_class === "heavy_compound") breakdown.push({ factor: "heavy_compound", points: -15 })
    if (candidateProfile.optional_or_drop_first) breakdown.push({ factor: "optional_or_drop_first", points: -30 })

    const score = breakdown.reduce((sum, item) => sum + item.points, 0)
    let action = existingSlot ? "use_existing_slot" : "add"
    if (hardExclusions.length || (!exactSlot && score < 45) || (candidateProfile.compound_class === "heavy_compound" && !exactSlot)) action = "not_recommended"
    return [{
      candidate_id: candidate.candidate_id,
      source_plan_fingerprint: candidate.source_plan_fingerprint,
      receiving_day: day,
      receiving_date: date,
      action,
      score,
      confidence: candidate.confidence_class,
      hard_exclusions: [...new Set(hardExclusions)],
      score_breakdown: breakdown,
      existing_slot_id: existingSlot?.id || null,
      existing_slot_relationship: existingSlot?.relationship || "none",
      receiving_day_estimated_minutes: scheduledMinutes,
      candidate_estimated_minutes: candidateMinutes,
      estimated_total_after_add: totalMinutes,
      rationale: deterministicRationale(action, candidate.source_exercise_id, day, existingSlot?.id, breakdown, [...new Set(hardExclusions)]),
    }]
  })
}
