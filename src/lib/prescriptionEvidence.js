const OMIT_REASON_TO_EVIDENCE = {
  time: "explicit_time_omission",
  intentional: "explicit_intentional_skip",
  substituted: "explicit_substitution",
  oc_blocked: "explicit_oc_block",
  contraindicated: "explicit_contraindication",
  unknown: "unknown_omission",
}

export const OMISSION_REASONS = Object.freeze(Object.keys(OMIT_REASON_TO_EVIDENCE))

const normalizeValue = value => value == null ? "" : String(value)

const prescriptionItem = exercise => ({
  id: String(exercise?.id || ""),
  sets: (exercise?.def || []).map(set => ({
    reps: normalizeValue(set?.r),
    load: normalizeValue(set?.w),
  })),
})

export function getAuthoritativeStrengthPrescription(planDay) {
  return (planDay?.sections || []).flatMap(section =>
    (section?.ex || []).filter(exercise => exercise?.id).map(prescriptionItem)
  )
}

export function getAuthoritativeTendonPrescription(planDay) {
  return (planDay?.tendon || []).filter(exercise => exercise?.id).map(prescriptionItem)
}

// FNV-1a 64-bit is compact, deterministic in browsers, and sufficient for a
// versioned change detector. The canonical input is retained in the session via
// the prescribed ID lists; this is not used as a security primitive.
export function fingerprintPrescription(payload) {
  const canonical = JSON.stringify(payload)
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `plan-v1-${hash.toString(16).padStart(16, "0")}`
}

export function buildPrescriptionContext({ planDay, day, sessionDate, releaseId }) {
  const strength = getAuthoritativeStrengthPrescription(planDay)
  const tendon = getAuthoritativeTendonPrescription(planDay)
  const fingerprintInput = { day, strength, tendon }
  return {
    release_id: String(releaseId || "dev"),
    plan_fingerprint: fingerprintPrescription(fingerprintInput),
    day,
    session_date: String(sessionDate || "").slice(0, 10),
    prescribed_strength_ids: strength.map(item => item.id),
    prescribed_tendon_ids: tendon.map(item => item.id),
  }
}

export function sanitizeOmissionDispositions(prescriptionContext, includedExerciseIds, dispositions = {}) {
  const included = new Set(includedExerciseIds || [])
  return Object.fromEntries(
    (prescriptionContext?.prescribed_strength_ids || []).flatMap(exerciseId => {
      if (included.has(exerciseId)) return []
      const disposition = dispositions?.[exerciseId]
      const reason = OMISSION_REASONS.includes(disposition?.reason) ? disposition.reason : "unknown"
      return [[exerciseId, {
        reason,
        substitute_exercise_id: reason === "substituted" ? disposition?.substitute_exercise_id || null : null,
        oc_item_id: reason === "oc_blocked" ? disposition?.oc_item_id || null : null,
      }]]
    })
  )
}

export function characterizeFinalizedSession(session, { finalized = true } = {}) {
  if (!finalized || !session?.prescription_context) return []
  const prescribedIds = session.prescription_context.prescribed_strength_ids || []
  const includedIds = new Set((session.exercises || []).map(exercise => exercise?.exercise_id).filter(Boolean))
  const dispositions = sanitizeOmissionDispositions(
    session.prescription_context,
    includedIds,
    session.omission_dispositions
  )

  return prescribedIds.map(exerciseId => {
    const included = includedIds.has(exerciseId)
    const disposition = dispositions[exerciseId] || { reason: "unknown" }
    return {
      exercise_id: exerciseId,
      prescribed: true,
      included,
      omission_reason: included ? null : disposition.reason,
      substitute_exercise_id: included ? null : disposition.substitute_exercise_id || null,
      oc_item_id: included ? null : disposition.oc_item_id || null,
      evidence_class: included ? "included" : OMIT_REASON_TO_EVIDENCE[disposition.reason] || "unknown_omission",
    }
  })
}
