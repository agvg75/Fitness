// Pure review-only plan. Never deduplicates sessions or changes training loads.
import { findTemporalDuplicateCandidates } from "./temporalDuplicateEvidence.js"
import { reviewPairIdentity } from "./duplicateReviewPersistence.js"

const decided = new Set(["same", "distinct", "uncertain"])
export function planReviewedWorkoutResolution(sessions, decisions = {}) {
  const records = Array.isArray(sessions) ? sessions : []
  const pairs = findTemporalDuplicateCandidates(records).map(pair => ({
    ...pair,
    pairIdentity: reviewPairIdentity(records[pair.firstIndex], records[pair.secondIndex])
  }))
  const incident = new Map()
  for (const pair of pairs) for (const i of [pair.firstIndex,pair.secondIndex]) {
    if (!incident.has(i)) incident.set(i, [])
    incident.get(i).push(pair)
  }
  const result = {candidatePairs:pairs.length, confirmedDistinct:0, pendingReview:0, uncertain:0,
    confirmedSame:0, eligibleAfterReview:[], blockedSame:[], staleDecisionCount:0,
    explanation:"This is a preview only. No sessions or training loads are changed."}
  const knownKeys = new Set(pairs.map(p=>p.pairIdentity).filter(Boolean))
  result.staleDecisionCount=Object.keys(decisions||{}).filter(key=>!knownKeys.has(key)).length
  const stateOf = pair => {
    const decision = pair.pairIdentity ? decisions?.[pair.pairIdentity]?.decision : null
    return decided.has(decision) ? decision : "unreviewed"
  }
  for (const pair of pairs) {
    const state=stateOf(pair)
    if (state==="distinct") { result.confirmedDistinct++; continue }
    if (state==="uncertain") { result.uncertain++; continue }
    if (state==="unreviewed") { result.pendingReview++; continue }
    result.confirmedSame++
    const neighbors=[...(incident.get(pair.firstIndex)||[]),...(incident.get(pair.secondIndex)||[])]
      .filter(other=>other!==pair)
    const blockers=neighbors.filter(other=>stateOf(other)!=="distinct")
    if (blockers.length) {
      result.blockedSame.push({pairIdentity:pair.pairIdentity, reason: blockers.some(p=>stateOf(p)==="same")
        ? "conflicting_confirmed_duplicates" : "unresolved_competing_pair"})
    } else {
      result.eligibleAfterReview.push({pairIdentity:pair.pairIdentity,
        firstIndex:pair.firstIndex,secondIndex:pair.secondIndex,
        overlapFraction:pair.overlapFraction})
    }
  }
  return result
}
