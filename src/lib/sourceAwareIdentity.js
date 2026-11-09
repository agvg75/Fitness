// Evidence-only pairing for canonical workout audit.
// No data modifications or automatic deduplication.
const finitePositive = v => Number.isFinite(Number(v)) && Number(v) > 0
const normal = v => String(v || "").trim().toLowerCase()
const typeFamily = value => {
  const v = normal(value)
  if (/run|jog|treadmill/.test(v)) return "running"
  if (/cycl|bike|spin/.test(v)) return "cycling"
  if (/walk/.test(v)) return "walking"
  if (/swim/.test(v)) return "swimming"
  if (/strength|weight train|resistance/.test(v)) return "strength"
  if (/row/.test(v)) return "rowing"
  return v
}
export function distanceInMiles(metric) {
  if (!finitePositive(metric?.value)) return null
  const units = normal(metric.unit)
  const conversions = {
    mi: 1, mile: 1, miles: 1,
    km: 1 / 1.609344, kilometer: 1 / 1.609344, kilometers: 1 / 1.609344,
    m: 1 / 1609.344, meter: 1 / 1609.344, meters: 1 / 1609.344,
    yd: 1 / 1760, yard: 1 / 1760, yards: 1 / 1760,
  }
  return units in conversions ? Number(metric.value) * conversions[units] : null
}
const sourceEntries = session => Object.entries(session?.sources || {}).filter(([,value]) => value && typeof value === "object")
export function sourceKinds(session) {
  return sourceEntries(session).map(([name]) => name.toLowerCase()).sort()
}
export function timingPrecision(session) {
  if (sourceEntries(session).some(([,entry]) => normal(entry.timing_precision) === "date_only")) return "date_only"
  const a = Date.parse(session?.start_date || "")
  const b = Date.parse(session?.end_date || "")
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? "timed" : "unknown"
}
export function sessionLocalDate(session) {
  const entries = sourceEntries(session)
  // A date-only record carries a calendar date, not a midnight workout time.
  const dateOnly = entries.find(([,entry]) => normal(entry.timing_precision) === "date_only")
  if (dateOnly) {
    const day = String(dateOnly[1].start_date || "").slice(0,10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  }
  // Raw device timestamps with an offset retain the workout's original day.
  const timed = entries.find(([,entry]) => /\d{4}-\d{2}-\d{2}/.test(String(entry.start_date || "")))
  if (timed) return String(timed[1].start_date).slice(0,10)
  return String(session?.start_date || "").slice(0,10)
}
export function matchEvidence(a,b) {
  if (!a || !b || a === b) return { classification:"not_match",reason:"self_or_missing" }
  if (typeFamily(a.canonical_type) !== typeFamily(b.canonical_type)) return { classification:"not_match",reason:"modality_mismatch" }
  const idsA=new Set(sourceKinds(a)),idsB=new Set(sourceKinds(b))
  // Distinct provenance is necessary but not sufficient evidence for a duplicate.
  const differentSources=[...idsA].some(x=>!idsB.has(x)) || [...idsB].some(x=>!idsA.has(x))
  const startA=Date.parse(a.start_date||""),startB=Date.parse(b.start_date||"")
  const endA=Date.parse(a.end_date||""),endB=Date.parse(b.end_date||"")
  const da=distanceInMiles(a.preferred_metrics?.distance),db=distanceInMiles(b.preferred_metrics?.distance)
  const distanceSimilar=da!=null && db!=null && Math.abs(da-db)/Math.max(da,db)<=.015
  const durA=Number(a.duration_min),durB=Number(b.duration_min)
  const durationSimilar=finitePositive(durA)&&finitePositive(durB)&&Math.abs(durA-durB)/Math.max(durA,durB)<=.2
  const precisionA=timingPrecision(a),precisionB=timingPrecision(b)
  if (precisionA==="date_only" || precisionB==="date_only") {
    if (sessionLocalDate(a)!==sessionLocalDate(b)) return {classification:"not_match",reason:"different_calendar_day"}
    if (!differentSources) return {classification:"insufficient_evidence",reason:"date_only_same_source"}
    if (distanceSimilar && durationSimilar) return { classification:"possible_duplicate", reason:"date_only_distance_and_duration",differentSources }
    if (distanceSimilar) return { classification:"review", reason:"date_only_distance_only",differentSources }
    return {classification:"insufficient_evidence",reason:"date_only_not_corroborrated"}
  }
  if (precisionA!=="timed" || precisionB!=="timed") return {classification:"insufficient_evidence",reason:"missing_workout_times"}
  if (![startA,startB,endA,endB].every(Number.isFinite)) return {classification:"insufficient_evidence",reason:"invalid_workout_times"}
  const overlap=Math.max(0,Math.min(endA,endB)-Math.max(startA,startB))
  if (!overlap) return {classification:"not_match",reason:"no_temporal_overlap"}
  const fraction=overlap/Math.min(endA-startA,endB-startB)
  if (fraction>=.8 && (distanceSimilar || durationSimilar) && differentSources) return {classification:"strong_duplicate_evidence",reason:"timed_overlap_cross_source",overlapFraction:fraction}
  if (fraction>=.5 && differentSources && (distanceSimilar || durationSimilar)) return {classification:"review",reason:"partial_timed_overlap",overlapFraction:fraction}
  return {classification:"not_match",reason:"low_temporal_overlap"}
}
export function findSourceAwareCandidates(sessions) {
  const rows=Array.isArray(sessions)?sessions:[]
  const byDay=new Map()
  rows.forEach((session,i)=>{
    const day=sessionLocalDate(session)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
    // Cross-midnight workouts may begin on adjacent local calendar days.
    // Candidate matches still require corroborating evidence in matchEvidence.
    const days=[day]
    if(timingPrecision(session)==="timed") {
      const time=Date.parse(`${day}T12:00:00Z`)
      if(Number.isFinite(time)) {
        days.push(new Date(time-86400000).toISOString().slice(0,10))
        days.push(new Date(time+86400000).toISOString().slice(0,10))
      }
    }
    for(const target of days) {
      if(!byDay.has(target)) byDay.set(target,[])
      byDay.get(target).push({session,i})
    }
  })
  const output=[]
  const visited=new Set()
  byDay.forEach(group=>{
    for(let i=0;i<group.length;i++) for(let j=i+1;j<group.length;j++) {
      const a=group[i],b=group[j]
      const pairKey=`${Math.min(a.i,b.i)}:${Math.max(a.i,b.i)}`
      if(visited.has(pairKey)) continue
      visited.add(pairKey)
      const evidence=matchEvidence(a.session,b.session)
      if (["possible_duplicate","strong_duplicate_evidence","review"].includes(evidence.classification)) {
        output.push({ first:a.session.session_id,second:b.session.session_id,...evidence })
      }
    }
  })
  return output
}
