const normalizeExerciseIdentity = value => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "")

export function getPlanExerciseIds(planDay) {
  return (planDay?.sections || []).flatMap(section =>
    (section?.ex || []).map(exercise => exercise?.id).filter(Boolean)
  )
}

export function buildPrescribedPlanExercises(planDay) {
  return (planDay?.sections || []).flatMap(section =>
    (section?.ex || []).map(exercise => {
      const def = exercise.def || []
      return {
        id: exercise.id,
        n: exercise.name,
        fi: null,
        _def: def,
        _sectionH: section.h,
        variants: {
          machine: {
            n: exercise.sub || exercise.name,
            sets: String(def.length || 3),
            reps: def[0]?.r ?? "—",
            load: def[0]?.w ?? "—",
            note: exercise.note || "",
          },
        },
      }
    })
  )
}

export function reorderActivePlanExercises(exercises, savedOrder) {
  if (!Array.isArray(savedOrder) || savedOrder.length === 0) return exercises
  const byId = new Map(exercises.map(exercise => [exercise.id, exercise]))
  const ordered = []
  savedOrder.forEach(id => {
    if (!byId.has(id)) return
    ordered.push(byId.get(id))
    byId.delete(id)
  })
  byId.forEach(exercise => ordered.push(exercise))
  return ordered
}

export function filterActivePlanFieldOverrides(planDay, storedDay = {}) {
  const activeIds = new Set(getPlanExerciseIds(planDay).map(String))
  return Object.fromEntries(
    Object.entries(storedDay || {}).filter(([exerciseId]) => activeIds.has(String(exerciseId)))
  )
}

export function filterRenderableCustomExercises(customExercises, plan) {
  const canonicalIds = new Set()
  const canonicalNames = new Set()
  Object.values(plan || {}).forEach(planDay => {
    ;(planDay?.sections || []).forEach(section => {
      ;(section?.ex || []).forEach(exercise => {
        if (exercise?.id) canonicalIds.add(String(exercise.id))
        const name = normalizeExerciseIdentity(exercise?.name)
        if (name) canonicalNames.add(name)
      })
    })
  })

  return (Array.isArray(customExercises) ? customExercises : []).filter(exercise => {
    if (canonicalIds.has(String(exercise?.id || ""))) return false
    const name = normalizeExerciseIdentity(exercise?.n || exercise?.name || exercise?.exercise_name)
    return !name || !canonicalNames.has(name)
  })
}

export function isPlanDayRenderable(planDay, cardioDay) {
  if (!planDay) return false
  if (getPlanExerciseIds(planDay).length > 0) return true
  if (Array.isArray(planDay.tendon) && planDay.tendon.length > 0) return true
  if (Array.isArray(planDay.warmup) && planDay.warmup.length > 0) return true
  if (Array.isArray(planDay.cooldown) && planDay.cooldown.length > 0) return true
  if (Array.isArray(planDay.stretch) && planDay.stretch.length > 0) return true
  if (String(planDay.topNote || "").trim()) return true
  if (String(planDay.cardio || "").trim()) return true
  return Array.isArray(cardioDay?.sessions) && cardioDay.sessions.length > 0
}
