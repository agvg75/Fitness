import { getPlanExerciseIds } from "./scheduleAuthority.js"

export function openPrimarySectionForSelectedDay(openSections, planDay) {
  const hasConventionalStrength = getPlanExerciseIds(planDay).length > 0
  const hasPrescribedTendonWork = Array.isArray(planDay?.tendon) && planDay.tendon.length > 0
  if (hasConventionalStrength || !hasPrescribedTendonWork) return openSections
  if (openSections?.tendon === true) return openSections
  return { ...openSections, tendon: true }
}
