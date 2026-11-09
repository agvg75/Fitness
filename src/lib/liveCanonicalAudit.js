import {findTemporalDuplicateCandidates} from "./temporalDuplicateEvidence.js"
import {reviewPairIdentity} from "./duplicateReviewPersistence.js"
import {planReviewedWorkoutResolution} from "./reviewResolutionPlan.js"

// Read-only assessment. The live remote session list and bundled historical
// snapshot may have different identities and completeness; they are never
// silently combined for duplicate review.
export function assessLiveCanonicalHistory(sessions, decisions = {}) {
  const rows=Array.isArray(sessions)?sessions:[]
  const idCounts=new Map()
  const sourceCounts={}
  let invalidTimes=0, dateOnly=0, missingId=0
  for(const row of rows) {
    const id=typeof row?.session_id==="string" ? row.session_id.trim() : ""
    if(id) idCounts.set(id,(idCounts.get(id)||0)+1)
    else missingId++
    const sources=Object.entries(row?.sources||{}).filter(([,value])=>value && typeof value==="object")
    const key=sources.map(([name])=>name.toLowerCase()).sort().join("+")||"none"
    sourceCounts[key]=(sourceCounts[key]||0)+1
    if(sources.some(([,value])=>String(value.timing_precision||"").toLowerCase()==="date_only")) dateOnly++
    const a=Date.parse(row?.start_date||""),b=Date.parse(row?.end_date||"")
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a) invalidTimes++
  }
  const pairs=findTemporalDuplicateCandidates(rows)
  const hasStableId=(p)=>Boolean(rows[p.firstIndex]?.session_id && rows[p.secondIndex]?.session_id &&
    idCounts.get(rows[p.firstIndex].session_id)===1 && idCounts.get(rows[p.secondIndex].session_id)===1)
  const ambiguousIdentityPairs=pairs.filter(p=>!hasStableId(p)).length
  const pairKeys=new Set(pairs.map(p=>reviewPairIdentity(rows[p.firstIndex],rows[p.secondIndex])).filter(Boolean))
  const decisionKeys=Object.keys(decisions||{})
  const resolution=planReviewedWorkoutResolution(rows,decisions)
  return {
    records:rows.length,sourceCounts,missingId,
    duplicateSessionIds:[...idCounts.values()].filter(n=>n>1).length,
    invalidTimes,dateOnly,
    overlappingPairs:pairs.length,
    ambiguousIdentityPairs,
    matchedSavedDecisions:decisionKeys.filter(k=>pairKeys.has(k)).length,
    staleSavedDecisions:decisionKeys.filter(k=>!pairKeys.has(k)).length,
    confirmedSame:resolution.confirmedSame,
    confirmedDistinct:resolution.confirmedDistinct,
    pendingReview:resolution.pendingReview,
    reviewBlocked:resolution.blockedSame.length,
    eligibleAfterReview:resolution.eligibleAfterReview.length,
    mode:"read_only",
    warning:"Assessment does not modify canonical sessions or training-load calculations"
  }
}
