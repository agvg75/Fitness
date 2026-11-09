import React, { useEffect, useMemo, useState } from "react"
import { findTemporalDuplicateCandidates } from "../lib/temporalDuplicateEvidence.js"
import { reviewPairIdentity, savePairReview, loadPairReviews } from "../lib/duplicateReviewPersistence.js"

const STORE_KEY="lift_duplicate_review_snapshot_v1"
const DECISIONS=new Set(["same","distinct","uncertain"])
const label={same:"Same physical workout",distinct:"Distinct workouts",uncertain:"Needs further review"}
const time=s=>{ const d=Date.parse(s||"");return Number.isFinite(d)?new Date(d).toLocaleString():"Unknown" }
const styles={
  shell:{marginTop:24,padding:18,border:"1px solid #30334c",borderRadius:10,background:"#101225",color:"#ddd"},
  row:{padding:"12px 0",borderBottom:"1px solid #30334c"},
  button:{padding:"6px 10px",borderRadius:6,border:"1px solid #4b526e",background:"#1b2040",color:"#e9e9f3",cursor:"pointer",fontSize:12},
}
export function reviewKey(edge,records) {
  const a=records[edge.firstIndex],b=records[edge.secondIndex]
  const identity=(record,index)=>`${record?.session_id||"noid"}|${record?.start_date||""}|${record?.end_date||""}|${index}`
  return [identity(a,edge.firstIndex),identity(b,edge.secondIndex)].sort().join("::")
}

export default function DuplicateReviewPanel({supabase, userId}){
  const [snapshot,setSnapshot]=useState([])
  const [loadState,setLoadState]=useState("loading")
  const [decisions,setDecisions]=useState({})
  const [legacyDecisions,setLegacyDecisions]=useState({})
  const [saveStatus,setSaveStatus]=useState("")
  const [savingPair,setSavingPair]=useState(null)
  const [remoteReady,setRemoteReady]=useState(false)
  const [category,setCategory]=useState("all")
  const [filter,setFilter]=useState("unreviewed")
  const [limit,setLimit]=useState(25)
  useEffect(()=>{
    let alive=true
    fetch("/data/workout_sessions_canonical.json",{cache:"no-store"})
      .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()})
      .then(json=>{
        if(!alive)return
        const rows=Array.isArray(json)?json:json?.all_sessions
        if(!Array.isArray(rows))throw new Error("Canonical snapshot unavailable")
        setSnapshot(rows);setLoadState("ready")
      })
      .catch(err=>{if(alive)setLoadState(String(err.message||err))})
    try{const saved=JSON.parse(localStorage.getItem(STORE_KEY)||"{}");if(saved&&typeof saved==="object")setLegacyDecisions(saved)}catch{}
    return()=>{alive=false}
  },[])
  useEffect(()=>{
    let alive=true
    setDecisions({})
    setRemoteReady(false)
    if(!supabase || !userId) {
      setSaveStatus("Sign in to sync reviewed pairs with Supabase.")
      return ()=>{alive=false}
    }
    setSaveStatus("Loading saved reviews…")
    loadPairReviews(supabase,userId).then(rows=>{
      if(!alive)return
      setDecisions(rows)
      setRemoteReady(true)
      setSaveStatus("Saved decisions loaded from Supabase.")
    }).catch(err=>{
      if(!alive)return
      setSaveStatus("Cannot load reviewed pairs: "+String(err.message||err))
    })
    return ()=>{alive=false}
  },[supabase,userId])
  const pairs=useMemo(()=>snapshot.length?findTemporalDuplicateCandidates(snapshot):[],[snapshot])
  const categories=useMemo(()=>[...new Set(pairs.map(p=>p.category))].sort(),[pairs])
  const chosen=useMemo(()=>pairs.map(p=>({...p,key:reviewPairIdentity(snapshot[p.firstIndex],snapshot[p.secondIndex])}))
    .filter(p=>(category==="all"||p.category===category)&&
      (filter==="all"||(filter==="unreviewed"?!DECISIONS.has(decisions[p.key]?.decision):decisions[p.key]?.decision===filter))),[pairs,snapshot,category,filter,decisions])
  const reviewed=useMemo(()=>pairs.filter(p=>DECISIONS.has(decisions[reviewPairIdentity(snapshot[p.firstIndex],snapshot[p.secondIndex])]?.decision)).length,[pairs,decisions,snapshot])
  const decide=async(key,decision)=>{
    if(!key || !supabase || !userId || !remoteReady || savingPair) return
    setSavingPair(key)
    setSaveStatus("Saving review…")
    try{
      const {value}=await savePairReview(supabase,userId,key,decision)
      setDecisions(prev=>({...prev,[key]:{decision:value.decision,updated_at:value.updated_at}}))
      setSaveStatus("Review saved to Supabase.")
    }catch(err){
      setSaveStatus("Save failed (decision not applied): "+String(err.message||err))
    }finally{setSavingPair(null)}
  }
  const exportLegacy=()=>{
    const blob=new Blob([JSON.stringify({format:"LIFT duplicate review legacy v1",source:"browser only",decisions:legacyDecisions},null,2)],{type:"application/json"})
    const href=URL.createObjectURL(blob)
    const a=document.createElement("a");a.href=href;a.download="lift_duplicate_review_legacy_backup.json";a.click()
    setTimeout(()=>URL.revokeObjectURL(href),1000)
  }
  const exportDecisions=()=>{
    const rows=pairs.map(p=>({
      pair_key:reviewPairIdentity(snapshot[p.firstIndex],snapshot[p.secondIndex]),first_session_id:snapshot[p.firstIndex]?.session_id,
      second_session_id:snapshot[p.secondIndex]?.session_id,category:p.category,
      overlap_minutes:p.overlapMinutes,overlap_fraction:p.overlapFraction,
      decision:decisions[reviewPairIdentity(snapshot[p.firstIndex],snapshot[p.secondIndex])]?.decision||"unreviewed"
    }))
    const payload={format:"LIFT duplicate review v1",source:"bundled canonical snapshot",criteria:"same category and >=80% of shorter time interval",
      exported_at:new Date().toISOString(),records:rows}
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"})
    const href=URL.createObjectURL(blob)
    const a=document.createElement("a");a.href=href;a.download="lift_duplicate_review.json";a.click()
    setTimeout(()=>URL.revokeObjectURL(href),1000)
  }
  return <section style={styles.shell}>
    <h3 style={{margin:"0 0 8px",fontSize:16}}>Historical duplicate review</h3>
    <p style={{fontSize:12,lineHeight:1.5,color:"#b2b4c7"}}>
      This review uses the bundled historical snapshot, not your live Supabase account.
      Reviewed decisions are stored in your account in Supabase and can be exported. They do not merge, delete,
      exclude, or recalculate workouts. Earlier browser-only decisions are available separately for backup.
    </p>
    <p role="status" style={{fontSize:12,color:saveStatus.startsWith("Save failed")||saveStatus.startsWith("Cannot")?"#fca5a5":"#b2b4c7"}}>{saveStatus}</p>
    {Object.keys(legacyDecisions).length>0&&<button style={styles.button} onClick={exportLegacy}>Export {Object.keys(legacyDecisions).length} earlier browser-only decisions</button>}
    {loadState!=="ready"?<p>Snapshot: {loadState}</p>:<>
      <p style={{fontSize:13}}><strong>{pairs.length}</strong> overlapping candidate pairs,
        <strong> {reviewed}</strong> reviewed, <strong>{pairs.length-reviewed}</strong> awaiting review.
        Snapshot: {snapshot.length} records.</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <label style={{fontSize:12}}>Category <select aria-label="Category" value={category} onChange={e=>{setCategory(e.target.value);setLimit(25)}} style={styles.button}>
          <option value="all">All</option>{categories.map(c=><option value={c} key={c}>{c}</option>)}
        </select></label>
        <label style={{fontSize:12}}>Decision <select aria-label="Decision" value={filter} onChange={e=>{setFilter(e.target.value);setLimit(25)}} style={styles.button}>
          <option value="unreviewed">Unreviewed</option><option value="all">All</option>
          <option value="same">Same workout</option><option value="distinct">Distinct workouts</option><option value="uncertain">Needs review</option>
        </select></label>
        <button style={styles.button} onClick={exportDecisions}>Export review JSON</button>
      </div>
      <p style={{fontSize:11,color:"#a4a7c1"}}>Showing {Math.min(limit,chosen.length)} of {chosen.length} matching pairs. Where one session overlaps multiple records, inspect all related pairs before deciding.</p>
      {chosen.slice(0,limit).map(p=>{
        const a=snapshot[p.firstIndex],b=snapshot[p.secondIndex]
        const source=s=>Object.keys(s?.sources||{}).filter(k=>s.sources[k]).join(" + ")||"unknown"
        return <div key={p.key} style={styles.row}>
          <div style={{fontSize:13,fontWeight:600}}>{p.category} ({(p.overlapFraction*100).toFixed(1)}% overlap, {p.overlapMinutes.toFixed(1)} minutes)</div>
          <div style={{fontSize:12,margin:"6px 0"}}><strong>A:</strong> {time(a?.start_date)} to {time(a?.end_date)}, {source(a)} ({a?.session_id||"no ID"})</div>
          <div style={{fontSize:12,margin:"6px 0"}}><strong>B:</strong> {time(b?.start_date)} to {time(b?.end_date)}, {source(b)} ({b?.session_id||"no ID"})</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
            {["same","distinct","uncertain"].map(k=><button key={k} style={{...styles.button,borderColor:decisions[p.key]?.decision===k?"#8bbbf8":"#4b526e"}} disabled={!remoteReady||!p.key||Boolean(savingPair)} onClick={()=>decide(p.key,k)}>{label[k]}</button>)}
          </div>
        </div>
      })}
      {chosen.length>limit&&<button style={{...styles.button,marginTop:12}} onClick={()=>setLimit(x=>x+25)}>Show 25 more</button>}
    </>}
  </section>
}
