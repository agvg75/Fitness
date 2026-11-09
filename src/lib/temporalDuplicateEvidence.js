// Read-only, minute-based duplicate-candidate matching.
// Rule: same normalized activity category and intersection >= 80%
// of the shorter valid activity interval. No calendar-day or
// distance criteria. This function never merges or mutates records.

const category = value => {
  const s=String(value ?? "").trim().toLowerCase()
  if (!s || s==="other" || s==="unknown" || s==="machine cardio") return null
  if (/run|jog|treadmill/.test(s)) return "running"
  if (/swim/.test(s)) return "swimming"
  if (/strength|weight train|resistance/.test(s)) return "strength"
  if (/cycl|bike|spin/.test(s)) return "cycling"
  if (/walk/.test(s)) return "walking"
  if (/row/.test(s)) return "rowing"
  if (/elliptical/.test(s)) return "elliptical"
  if (/hik/.test(s)) return "hiking"
  if (/stair/.test(s)) return "stair climbing"
  if (/core/.test(s)) return "core"
  return null // Unrecognized types should not be conflated.
}
function interval(record) {
  if (Object.values(record?.sources || {}).some(v=>v && String(v.timing_precision||"").toLowerCase()==="date_only")) return null
  const start=Date.parse(record?.start_date ?? "")
  const end=Date.parse(record?.end_date ?? "")
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) return null
  return {start,end,duration:(end-start)/60000}
}
export function temporalDuplicateEvidence(a,b,threshold=0.8) {
  if(!a || !b || a===b) return {classification:"not_match",reason:"missing_or_self"}
  const ca=category(a.canonical_type||a.type),cb=category(b.canonical_type||b.type)
  if(!ca||!cb) return {classification:"insufficient_evidence",reason:"unknown_category"}
  if(ca!==cb) return {classification:"not_match",reason:"different_categories"}
  const ia=interval(a),ib=interval(b)
  if(!ia||!ib) return {classification:"insufficient_evidence",reason:"missing_precise_times"}
  const minutes=Math.max(0,Math.min(ia.end,ib.end)-Math.max(ia.start,ib.start))/60000
  const overlapFraction=minutes/Math.min(ia.duration,ib.duration)
  return {
    classification:overlapFraction+1e-10>=threshold?"duplicate_candidate":"not_match",
    reason:overlapFraction+1e-10>=threshold?"same_category_80_percent_shorter":"insufficient_overlap",
    category:ca,overlapMinutes:minutes,overlapFraction,
    firstDurationMin:ia.duration,secondDurationMin:ib.duration
  }
}
export function findTemporalDuplicateCandidates(sessions,threshold=0.8) {
  const rows=Array.isArray(sessions)?sessions:[]
  const timed=rows.map((record,index)=>({record,index,span:interval(record),type:category(record?.canonical_type||record?.type)}))
    .filter(x=>x.span && x.type)
    .sort((a,b)=>a.span.start-b.span.start)
  const output=[]
  for(let i=0;i<timed.length;i++) {
    const a=timed[i]
    for(let j=i+1;j<timed.length;j++) {
      const b=timed[j]
      if(b.span.start>=a.span.end) break
      if(a.type!==b.type) continue
      const evidence=temporalDuplicateEvidence(a.record,b.record,threshold)
      if(evidence.classification==="duplicate_candidate") {
        output.push({first:a.record?.session_id??null,second:b.record?.session_id??null,
          firstIndex:a.index,secondIndex:b.index,...evidence})
      }
    }
  }
  return output
}
export function auditTemporalRetention(originalSessions,retainedSessions) {
  const original=Array.isArray(originalSessions)?originalSessions:[]
  const retained=Array.isArray(retainedSessions)?retainedSessions:[]
  const candidates=findTemporalDuplicateCandidates(original)
  const retainedIds=new Set(retained.map(s=>s?.session_id).filter(Boolean))
  const inputIdCounts=new Map()
  original.forEach(s=>{
    if(s?.session_id) inputIdCounts.set(s.session_id,(inputIdCounts.get(s.session_id)||0)+1)
  })
  const corroborated=new Set()
  for(const match of candidates) {
    if(match.first && match.second && inputIdCounts.get(match.first)===1 && inputIdCounts.get(match.second)===1) {
      if(retainedIds.has(match.first)) corroborated.add(match.second)
      if(retainedIds.has(match.second)) corroborated.add(match.first)
    }
  }
  let removedWithTemporalMatch=0,removedWithoutTemporalMatch=0,unresolvedIdentity=0
  for(const s of original) {
    const id=s?.session_id
    if(!id||inputIdCounts.get(id)!==1){unresolvedIdentity++;continue}
    if(retainedIds.has(id))continue
    if(corroborated.has(id))removedWithTemporalMatch++
    else removedWithoutTemporalMatch++
  }
  return {
    originalCount:original.length,retainedCount:retained.length,
    candidatePairs:candidates.length,removedWithTemporalMatch,
    removedWithoutTemporalMatch,unresolvedIdentity,
    rule:"same known category; overlap minutes >= 80% of shorter workout",
    mode:"read_only",
    warning:"Pairs may be ambiguous or many-to-one; do not automatically delete or merge"
  }
}
