// Opt-in, read-only preview of evidence-preserving retention.
// Does not link Apple/Technogym records, delete source events, or write data.
// Existing linked canonical sessions are already represented as one record.
export function previewConservativeRetention(sessions) {
  const records=Array.isArray(sessions)?sessions:[]
  const kept=[]
  const seen=new Map()
  let exactCopies=0
  let conflictingIds=0
  let missingIds=0
  for (const session of records) {
    const id=typeof session?.session_id==="string" && session.session_id.trim()
      ? session.session_id : null
    if(!id) {
      missingIds++
      kept.push(session)
      continue
    }
    const signature=JSON.stringify(session)
    const prior=seen.get(id)
    if(!prior) {
      seen.set(id,new Set([signature]))
      kept.push(session)
    } else if(prior.has(signature)) {
      // Same identity and same complete content: a repeated copy, not an event.
      exactCopies++
    } else {
      // Identity collision with different content needs a review, not deletion.
      conflictingIds++
      prior.add(signature)
      kept.push(session)
    }
  }
  return {
    sessions:kept,
    summary:{
      inputCount:records.length,
      retainedCount:kept.length,
      exactCopiesCollapsed:exactCopies,
      conflictingIds,
      missingIds,
      mode:"dry_run",
      note:"Not suitable for automatic activation until cross-source sessions are reconciled"
    }
  }
}
