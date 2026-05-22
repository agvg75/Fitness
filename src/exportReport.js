// exportReport.js — LIFT Trainer Snapshot Generator
// Produces a self-contained HTML file with all real app data embedded.

export function generateTrainerReport({
  healthFitDaily = [], biometricRecords = [], dexa = [], ocItems = [],
  sleepRecords = [], canonicalSessions = [], mealRecords = [], schedLog = [],
  liftConfig = {}, tsbV2Panel = null, snapshotDate = ""
}) {
  const date = snapshotDate || new Date().toISOString().slice(0, 10)
  const cfg = liftConfig || {}
  const mtpCeiling = cfg.mtp_ceiling || cfg.run_ceiling || 4.0

  const n = (v, decimals = 1) => {
    const p = parseFloat(v)
    return Number.isFinite(p) ? p.toFixed(decimals) : "—"
  }
  const esc = v => String(v ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
  const iso = v => String(v || "").slice(0, 10)
  const J = v => JSON.stringify(v).replaceAll("</", "<\\/")

  const weightLog = biometricRecords
  const weightSeries = (Array.isArray(weightLog) ? weightLog : [])
    .filter(r => (r.date || r.measured_date || r.timestamp || r.measured_at) && (r.weight_lb ?? r.weight))
    .map(r => ({
      date: iso(r.date || r.measured_date || r.timestamp || r.measured_at),
      weight: Number(r.weight_lb ?? r.weight)
    }))
    .filter(r => r.date && r.weight > 100)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90)
  const latestWeight = weightSeries.length ? weightSeries[weightSeries.length - 1].weight : null

  const dexaSeries = [...dexa]
    .filter(d => d.date || d.scan_date)
    .sort((a, b) => String(a.date || a.scan_date || "").localeCompare(String(b.date || b.scan_date || "")))
    .map(d => ({
      label: d.label || iso(d.date || d.scan_date).slice(0, 7) || "—",
      date: d.date || d.scan_date || "",
      fatPct: Number(d.pct_fat ?? d.body_fat_pct ?? d.fatPct ?? 0),
      fatLb: Number(d.fat_lb ?? d.fat_mass_lb ?? (d.fat_mass_g ? d.fat_mass_g / 453.592 : d.fatMass ? d.fatMass / 453.592 : 0)),
      leanLb: Number(d.lean_lb ?? d.lean_mass_lb ?? (d.lean_mass_g ? d.lean_mass_g / 453.592 : d.leanMass ? d.leanMass / 453.592 : 0)),
      bmd: Number(d.bmd || 0),
      vatArea: Number(d.vat_area ?? d.vatArea ?? 0),
    }))
  const dexaFallback = [
    { label:"Aug '25", date:"2025-08-26", fatPct:33.9, fatLb:58.9, leanLb:109.8, bmd:1.121, vatArea:155 },
    { label:"Nov '25", date:"2025-11-19", fatPct:31.4, fatLb:52.2, leanLb:109.1, bmd:1.110, vatArea:120 },
    { label:"Jan '26", date:"2026-01-14", fatPct:29.8, fatLb:48.0, leanLb:108.0, bmd:1.120, vatArea:135 },
    { label:"Apr '26", date:"2026-04-27", fatPct:25.4, fatLb:41.3, leanLb:115.8, bmd:1.161, vatArea:122 },
  ]
  const dexaData = dexaSeries.length >= 2 ? dexaSeries : dexaFallback
  const latestDexa = dexaData[dexaData.length - 1] || {}

  const fitSeries = (Array.isArray(healthFitDaily) ? healthFitDaily : [])
    .filter(r => r.date && (r.ctl != null || r.atl != null || r.tsb != null))
    .map(r => ({
      date: r.date,
      ctl: r.ctl != null ? Number(Number(r.ctl).toFixed(1)) : null,
      atl: r.atl != null ? Number(Number(r.atl).toFixed(1)) : null,
      tsb: r.tsb != null ? Number(Number(r.tsb).toFixed(1)) : null,
      trimp: r.trimp != null ? Number(Number(r.trimp).toFixed(1)) : null,
      acwr: r.acwr != null ? Number(Number(r.acwr).toFixed(2)) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const lastFit = fitSeries[fitSeries.length - 1]
  const latestFit = lastFit || {}

  const runSessions = [...canonicalSessions]
    .filter(s => {
      const t = String(s.canonical_type || s.type || s.category || s.workout_type || "").toLowerCase()
      return t.includes("run") || t.includes("walk") || t.includes("outdoor running")
    })
    .sort((a, b) => String(a.start_date || a.date || a.dateTime || "").localeCompare(String(b.start_date || b.date || b.dateTime || "")))
    .slice(-40)
    .map(s => {
      const METERS_PER_MILE = 1609.34
      const explicitMi = parseFloat(s.distance_mi) || parseFloat(s.preferred_metrics?.distance_mi) || null
      const rawDist = Number(s.dist ?? s.distance ?? explicitMi ?? 0)
      const distMi = explicitMi != null && explicitMi > 0
        ? Number(explicitMi.toFixed(2))
        : rawDist > 100
          ? Number((rawDist / METERS_PER_MILE).toFixed(2))
          : Number(rawDist.toFixed(2))
      const dur = Number(s.duration_min ?? s.dur_min ??
        (s.duration_sec ? s.duration_sec / 60 : null) ??
        (s.preferred_metrics?.duration_min) ?? 0)
      const paceMin = distMi > 0 && dur > 0 ? dur / distMi : null
      const pace = paceMin != null
        ? `${Math.floor(paceMin)}:${String(Math.round((paceMin % 1) * 60)).padStart(2, "0")}`
        : "—"
      return {
        date: iso(s.start_date || s.date || s.dateTime),
        dist: distMi,
        dur,
        pace,
        mtp: s.mtp_score ?? s.mtpScore ?? null,
      }
    })
    .filter(s => s.dist > 0)

  const strengthSessions = [...canonicalSessions, ...schedLog]
    .filter(s => {
      const t = String(s.canonical_type || s.type || s.category || "").toLowerCase()
      return t.includes("strength") || t.includes("traditional") || t.includes("functional") || t.includes("weight")
    })
    .sort((a, b) => String(a.start_date || a.date || "").localeCompare(String(b.start_date || b.date || "")))
    .slice(-20)
    .map(s => {
      const venue = s.venue || s.location || s.gym ||
        (s.source === "AppleHealth" ? "YMCA" :
          s.source === "KNR" || /knr/i.test(s.source || "") ? "KNR" : "—")
      const exList = Array.isArray(s.exercises)
        ? s.exercises.map(e => e.name || e.exercise || e.exercise_name || e).filter(Boolean).slice(0, 4).join(", ")
        : Array.isArray(s.strength_exercises)
          ? s.strength_exercises.map(e => e.name || e).filter(Boolean).slice(0, 4).join(", ")
          : "—"
      return {
        date: iso(s.start_date || s.date),
        dur: Math.round(Number(s.duration_min ?? s.dur_min ?? s.dur ?? 0)),
        venue,
        exercises: exList,
      }
    })

  const sleepSeries = [...sleepRecords]
    .filter(r => r.sleep_date || r.date || r.start_at)
    .sort((a, b) => String(a.sleep_date || a.date || a.start_at || "").localeCompare(String(b.sleep_date || b.date || b.start_at || "")))
    .slice(-30)
    .map(r => ({
      date: iso(r.sleep_date || r.date || r.start_at),
      hours: Number(
        r.duration_hr ??
        r.hours ??
        r.total_sleep_hr ??
        (r.duration_min ? r.duration_min / 60 : null) ??
        0
      ),
    }))
    .filter(r => r.hours > 0)
  const avgSleep = sleepSeries.length
    ? sleepSeries.reduce((s, r) => s + r.hours, 0) / sleepSeries.length
    : null

  const mealByDate = {}
  ;[...mealRecords].forEach(m => {
    const d = iso(m.date)
    if (!d) return
    if (!mealByDate[d]) mealByDate[d] = { cal: 0, prot: 0, carbs: 0, fat: 0, count: 0 }
    mealByDate[d].cal += Number(m.total_calories ?? m.calories ?? 0)
    mealByDate[d].prot += Number(m.total_protein_g ?? m.protein_g ?? 0)
    mealByDate[d].carbs += Number(m.total_carbs_g ?? m.carbs_g ?? 0)
    mealByDate[d].fat += Number(m.total_fat_g ?? m.fat_g ?? 0)
    mealByDate[d].count++
  })
  const mealSeries = Object.entries(mealByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([mealDate, v]) => ({ date: mealDate, ...v }))

  const activeOC = [...ocItems].filter(i => Number(i.currentScore ?? i.score ?? 0) > 0)
  const cur = tsbV2Panel?.currentRow || {}
  const tsbNow = {
    overall: cur.overallTsb ?? tsbV2Panel?.currentOverallTsb ?? latestFit.tsb ?? null,
    run: cur.runningTsb ?? null,
    cycle: cur.cyclingTsb ?? null,
    swim: cur.swimmingTsb ?? null,
    strength: cur.strengthTsb ?? null,
    upperStrength: cur.upperStrengthTsb ?? null,
    lowerStrength: cur.lowerStrengthTsb ?? null,
  }
  const tsbClass = v => v == null ? "" : v < -9 ? "danger" : v < -7 ? "warn" : v >= 0 ? "good" : ""
  const statusForTsb = v => v == null ? "—" : v < -9 ? "High risk" : v < -7 ? "Moderate risk" : v < 0 ? "Mild fatigue" : "Fresh"

  const races = [
    { date:"2026-06-06", name:"Steamboat Classic 4 Mile", city:"Peoria", dist:"4.0 mi" },
    { date:"2026-07-04", name:"Park 2 Park 5-Mile", city:"Normal", dist:"5.0 mi" },
    { date:"2026-09-07", name:"Bridge to Bridge", city:"Peoria", dist:"4.0 mi" },
    { date:"2026-09-19", name:"St. Jude 10K / Half", city:"Bloomington", dist:"13.1 mi", goal: true },
    { date:"2026-10-18", name:"Naperville Half Marathon", city:"Naperville", dist:"13.1 mi" },
  ].filter(r => r.date >= date)
  // ── Strength baselines from wt-log (live, most recent max per exercise) ─
  // Key mapping: wt-log uses coded keys tied to KNR program slots
  const EX_KEY_LABELS = {
    chest_press: "Chest press", chest_press_sel: "Chest press (sel)", chest_press_machine: "Chest press (machine)",
    incline_press: "Incline press", incline_chest_press: "Incline press",
    low_row_sel: "Low row (sel)", cable_row: "Cable row", pull_down_pure: "Lat pulldown",
    pulldown_pure: "Lat pulldown", lat_pull: "Lat pulldown",
    arm_curl: "Bicep curl", bicep_db: "Bicep curl (DB)", bicep_rope: "Bicep curl (rope)",
    leg_press: "Leg press", leg_curl: "Leg curl", leg_extension: "Leg extension", leg_ext: "Leg extension",
    hip_abduction: "Hip abduction", hip_adduction: "Hip adduction",
    glute_bridge: "Glute bridge", hip_thrust_smith: "Hip thrust (Smith)",
    calf_raise: "Calf raise",
    th1: "Single arm low row (KNR)", th2: "Leg press (KNR)", th3: "Bicep curl (KNR)",
    th4: "Chin/dip assist (KNR)", th5: "Shoulder press (KNR)", th6: "Tricep pulldown (KNR)",
    th8: "Cable row (KNR)",
    f1: "Chest press (KNR-F)", f2: "Seated row (KNR-F)", f3: "Bicep curl (KNR-F)",
    m1: "Leg press (KNR-M)", m2: "Leg curl/ext (KNR-M)",
    push_down: "Tricep pushdown", face_pull: "Face pull",
    shoulder_press_artis: "Shoulder press (Artis)",
    easy_chin_dip: "Chin/dip assist", pull_down_cable: "Lat pulldown (cable)",
  }
  // Parse wt-log to find most recent numeric max per exercise key
  const exMaxByKey = {}
  ;(Array.isArray(schedLog) ? schedLog : []).forEach(entry => {
    const entryDate = (entry.date || "").slice(0, 10)
    const raw = entry.data || {}
    Object.entries(raw).forEach(([key, sets]) => {
      if (!Array.isArray(sets)) return
      sets.forEach(s => {
        const wStr = String(s.w || s.weight || "").replace(/lb|kg/gi, "").trim()
        const w = parseFloat(wStr)
        if (!Number.isFinite(w) || w <= 0) return
        if (!exMaxByKey[key] || w > exMaxByKey[key].lb ||
            (w === exMaxByKey[key].lb && entryDate > exMaxByKey[key].date)) {
          exMaxByKey[key] = { lb: w, date: entryDate }
        }
      })
    })
  })
  // Build display list — labeled exercises only, sorted by weight descending
  const strength_baselines = Object.entries(exMaxByKey)
    .filter(([key]) => EX_KEY_LABELS[key])
    .map(([key, info]) => ({ ex: EX_KEY_LABELS[key], lb: info.lb, date: info.date }))
    .sort((a, b) => b.lb - a.lb)
    .slice(0, 16)  // top 16 by load
  // Fallback if wt-log empty
  if (!strength_baselines.length) {
    strength_baselines.push(
      { ex: "Chest press",      lb: 130, date: "Feb 2026 (KNR baseline)" },
      { ex: "Seated cable row", lb: 80,  date: "Feb 2026 (KNR baseline)" },
      { ex: "Leg press",        lb: 320, date: "Feb 2026 (KNR baseline)" }
    )
  }
  const schedule = [
    ["Monday", "Chest + Arms", "YMCA", ["Chest press", "Lat pulldown", "Bicep curl", "Cable row", "Long bike or treadmill cardio"], "Upper"],
    ["Tuesday", "Legs", "KNR", ["Leg press", "Leg curl", "Leg extension", "Hip thrust", "Hip abduction/adduction", "Calf raise if MTP-safe"], "Lower"],
    ["Wednesday", "Rest / Recovery", "—", ["No strength", "No structured cardio", "Optional easy bike commute", "Tendon protocol, 20 min"], "Recovery"],
    ["Thursday", "Back + Arms", "KNR", ["Seated cable row", "Lat pulldown", "Bicep curl", "Shoulder press", "Optional swim or bike"], "Upper"],
    ["Friday", "Legs + Some Chest", "KNR", ["Leg press", "Leg extension", "Leg curl", "Chest press", "Hip work"], "Mixed"],
    ["Saturday", "Long Run + Hip/Legs", "YMCA", ["Long run within MTP ceiling", "Hip abduction", "Hip adduction", "Glute work", "Run precedes lifting"], "Lower + Cardio"],
    ["Sunday", "Long Run only", "—", ["Run only, no strength", "Zone 2 effort", "MTP protocol applies"], "Cardio"],
  ]

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>LIFT — Andrés Vidal-Gadea | Trainer Snapshot ${esc(date)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
:root{--bg:#0d0f12;--bg2:#141720;--bg3:#1c2030;--border:#2a2f3e;--accent:#e88c2a;--accent2:#3a7bd5;--accent3:#4caf7d;--danger:#d95f5f;--warn:#e8b84a;--text:#d4d8e8;--muted:#6b7290;--mono:'IBM Plex Mono',monospace;--sans:'IBM Plex Sans',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:var(--sans);background:var(--bg);color:var(--text);font-size:14px}header{background:var(--bg2);border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}.logo{font-family:var(--mono);font-size:22px;font-weight:600;color:var(--accent);letter-spacing:4px}.logo span{color:var(--muted);font-size:13px;letter-spacing:1px;margin-left:12px}.snap-tag{font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--bg3);border:1px solid var(--border);padding:4px 10px;border-radius:2px}.snap-tag b{color:var(--accent)}nav{background:var(--bg2);border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;position:sticky;top:57px;z-index:99}.tab-btn{font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;padding:10px 14px;cursor:pointer;white-space:nowrap}.tab-btn.active{color:var(--accent);border-bottom-color:var(--accent)}main{padding:20px 24px;max-width:1200px;margin:0 auto}.tab-panel{display:none}.tab-panel.active{display:block}.card{background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:18px;margin-bottom:14px}.card-title{font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border)}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}.stat-box{background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:14px}.stat-label{font-family:var(--mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}.stat-value{font-family:var(--mono);font-size:24px;font-weight:600;color:var(--accent);line-height:1}.stat-sub{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px}.good{color:var(--accent3)}.warn{color:var(--warn)}.danger{color:var(--danger)}.chart-wrap{position:relative;width:100%;height:260px;margin-bottom:6px}.chart-wrap.tall{height:320px}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}@media(max-width:768px){.grid-2{grid-template-columns:1fr}header{display:block}.logo span{display:block;margin:6px 0 0}.schedule-grid{grid-template-columns:repeat(2,1fr)}}table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px}th{text-align:left;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);padding:7px 10px;border-bottom:1px solid var(--border)}td{padding:7px 10px;border-bottom:1px solid rgba(42,47,62,0.5)}tr:hover td{background:var(--bg3)}.td-r{text-align:right}.td-good{color:var(--accent3)}.td-warn{color:var(--warn)}.td-danger{color:var(--danger)}.note-box{background:rgba(58,123,213,0.06);border:1px solid rgba(58,123,213,0.2);border-radius:4px;padding:10px 14px;font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:14px}.note-box b{color:var(--accent2)}.badge{display:inline-block;font-family:var(--mono);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:2px;font-weight:500}.badge-ok{background:rgba(76,175,125,0.15);color:var(--accent3);border:1px solid rgba(76,175,125,0.3)}.badge-warn{background:rgba(232,184,74,0.15);color:var(--warn);border:1px solid rgba(232,184,74,0.3)}.badge-danger{background:rgba(217,95,95,0.15);color:var(--danger);border:1px solid rgba(217,95,95,0.3)}.schedule-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:8px}.day-card{background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:12px;min-height:200px}.day-name{font-family:var(--mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)}.day-theme{font-size:12px;font-weight:600;margin-bottom:8px}.day-item{font-size:11px;color:var(--muted);margin-bottom:3px;line-height:1.4;padding-left:10px;position:relative}.day-item:before{content:"·";position:absolute;left:0;color:var(--accent)}.day-venue{font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:8px;padding-top:6px;border-top:1px solid var(--border)}
</style>
</head>
<body>
<header><div class="logo">LIFT <span>Longitudinal Intelligence for Fitness Training</span></div><div class="snap-tag">Snapshot: <b>${esc(date)}</b> | Andrés Vidal-Gadea</div></header>
<nav>
  <button class="tab-btn active" onclick="showTab('overview',this)">Overview</button>
  <button class="tab-btn" onclick="showTab('load',this)">Training Load</button>
  <button class="tab-btn" onclick="showTab('body',this)">Body Comp</button>
  <button class="tab-btn" onclick="showTab('running',this)">Running</button>
  <button class="tab-btn" onclick="showTab('strength',this)">Strength</button>
  <button class="tab-btn" onclick="showTab('schedule',this)">Schedule</button>
  <button class="tab-btn" onclick="showTab('oc',this)">Capacity</button>
  <button class="tab-btn" onclick="showTab('sleep',this)">Sleep</button>
  ${mealSeries.length ? '<button class="tab-btn" onclick="showTab(\'nutrition\',this)">Nutrition</button>' : ""}
</nav>
<main>
<div id="tab-overview" class="tab-panel active">
  <div class="note-box"><b>Trainer reference snapshot.</b> Body composition anchored to ${esc(latestDexa.label || "latest")} DEXA. Weight from most recent scale reading. TSB from personalized Banister model (τ₁=${cfg.tau1||27}d, τ₂=${cfg.tau2||18}d).${fitSeries.length === 0 || runSessions.length === 0 ? ' <b style="color:var(--warn)">⚠ Some charts empty — generate this report after the app fully loads and syncs (wait for session count to appear in the app).</b>' : ''}</div>
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-label">Current Weight</div><div class="stat-value">${latestWeight ? latestWeight.toFixed(1) : n((latestDexa.fatLb || 0) + (latestDexa.leanLb || 0))}</div><div class="stat-sub">lb | scale reading</div></div>
    <div class="stat-box"><div class="stat-label">Body Fat</div><div class="stat-value warn">${n(latestDexa.fatPct)}%</div><div class="stat-sub">${n(latestDexa.fatLb)} lb fat · target 21%</div></div>
    <div class="stat-box">
      <div class="stat-label">To Phase 1 (21%)</div>
      <div class="stat-value">${(() => {
        // Use DEXA fat lb and lean lb directly — most accurate ground truth
        const fatLb = latestDexa.fatLb
        const leanLb = latestDexa.leanLb
        if (!fatLb || !leanLb) return "—"
        // At 21% BF: fat / (fat + lean) = 0.21 → fat = 0.21 × (fat + lean) / 0.79
        const targetFatLb = (leanLb * 0.21) / 0.79
        const tolose = fatLb - targetFatLb
        return tolose > 0 ? tolose.toFixed(1) : "0"
      })()}</div>
      <div class="stat-sub">lb fat to lose · target 21% · ~1.7 lb/mo</div>
    </div>
    <div class="stat-box"><div class="stat-label">Lean Mass</div><div class="stat-value good">${n(latestDexa.leanLb)}</div><div class="stat-sub">lb lean · ${esc(latestDexa.label)}</div></div>
    <div class="stat-box"><div class="stat-label">BMD</div><div class="stat-value good">${n(latestDexa.bmd, 3)}</div><div class="stat-sub">g/cm²</div></div>
    <div class="stat-box"><div class="stat-label">TSB Overall</div><div class="stat-value ${tsbClass(tsbNow.overall)}">${tsbNow.overall != null ? tsbNow.overall.toFixed(1) : "—"}</div><div class="stat-sub">threshold −7</div></div>
    <div class="stat-box"><div class="stat-label">CTL / ATL</div><div class="stat-value" style="font-size:18px">${latestFit.ctl != null ? latestFit.ctl.toFixed(0) : "—"} / ${latestFit.atl != null ? latestFit.atl.toFixed(0) : "—"}</div><div class="stat-sub">fitness / fatigue</div></div>
    <div class="stat-box"><div class="stat-label">Active OC Issues</div><div class="stat-value ${activeOC.length ? "warn" : "good"}">${activeOC.length}</div><div class="stat-sub">${activeOC.length ? activeOC.map(i => esc(i.location || i.label || "issue")).join(", ") : "All clear"}</div></div>
    <div class="stat-box"><div class="stat-label">Avg Sleep (30d)</div><div class="stat-value ${avgSleep != null ? (avgSleep >= 7.5 ? "good" : avgSleep >= 6.5 ? "warn" : "danger") : ""}">${avgSleep != null ? avgSleep.toFixed(1) : "—"}</div><div class="stat-sub">hrs · target 7.5h</div></div>
  </div>
  <div class="grid-2">
    <div class="card"><div class="card-title">Upcoming Races</div><table><thead><tr><th>Date</th><th>Event</th><th>City</th><th>Dist</th></tr></thead><tbody>${races.map(r => `<tr><td>${esc(r.date)}</td><td style="font-weight:${r.goal ? "600" : "400"};color:${r.goal ? "var(--accent)" : "inherit"}">${esc(r.name)}</td><td>${esc(r.city)}</td><td class="td-r">${esc(r.dist)}</td></tr>`).join("")}</tbody></table></div>
    <div class="card"><div class="card-title">DEXA Anchors</div><table><thead><tr><th>Scan</th><th>BF%</th><th>Fat</th><th>Lean</th><th>BMD</th></tr></thead><tbody>${dexaData.map(d => `<tr><td>${esc(d.label)}</td><td class="td-r td-warn">${n(d.fatPct)}%</td><td class="td-r">${n(d.fatLb)}</td><td class="td-r td-good">${n(d.leanLb)}</td><td class="td-r">${n(d.bmd,3)}</td></tr>`).join("")}</tbody></table></div>
  </div>
  <div class="card"><div class="card-title">Compartment TSB — current</div><table><thead><tr><th>Compartment</th><th>TSB</th><th>Status</th></tr></thead><tbody>${[
    ["Overall", tsbNow.overall], ["Run / Walk", tsbNow.run], ["Cycling", tsbNow.cycle], ["Swimming", tsbNow.swim], ["Strength", tsbNow.strength], ["Upper Strength", tsbNow.upperStrength], ["Lower Strength", tsbNow.lowerStrength],
  ].map(([label, val]) => `<tr><td>${label}</td><td class="td-r ${tsbClass(val) ? `td-${tsbClass(val)}` : ""}">${val != null ? val.toFixed(1) : "—"}</td><td>${statusForTsb(val)}</td></tr>`).join("")}</tbody></table></div>
</div>

<div id="tab-load" class="tab-panel">
  <div class="note-box"><b>Source:</b> HealthFit daily export. Real CTL/ATL/TSB/TRIMP/ACWR values are embedded from loaded app state.</div>
  <div class="stat-grid"><div class="stat-box"><div class="stat-label">CTL</div><div class="stat-value">${lastFit?.ctl ?? "—"}</div></div><div class="stat-box"><div class="stat-label">ATL</div><div class="stat-value warn">${lastFit?.atl ?? "—"}</div></div><div class="stat-box"><div class="stat-label">TSB</div><div class="stat-value ${tsbClass(lastFit?.tsb)}">${lastFit?.tsb ?? "—"}</div></div><div class="stat-box"><div class="stat-label">ACWR</div><div class="stat-value">${lastFit?.acwr ?? "—"}</div></div></div>
  <div class="card"><div class="card-title">CTL / ATL / TSB — ${fitSeries.length} days loaded</div><div class="chart-wrap tall"><canvas id="loadChart"></canvas></div></div>
  <div class="grid-2"><div class="card"><div class="card-title">Daily TRIMP</div><div class="chart-wrap"><canvas id="trimpChart"></canvas></div></div><div class="card"><div class="card-title">ACWR</div><div class="chart-wrap"><canvas id="acwrChart"></canvas></div></div></div>
</div>

<div id="tab-body" class="tab-panel">
  <div class="note-box"><b>Weight trend:</b> ${weightSeries.length} scale readings. <b>DEXA:</b> ${dexaData.length} scans with fat and lean mass values.</div>
  <div class="grid-2"><div class="card"><div class="card-title">Scale Weight — last 90 days</div><div class="chart-wrap tall"><canvas id="weightChart"></canvas></div></div><div class="card"><div class="card-title">Body Fat % — DEXA anchors + 21% target</div><div class="chart-wrap tall"><canvas id="bfChart"></canvas></div></div></div>
  <div class="grid-2"><div class="card"><div class="card-title">Fat vs Lean Mass</div><div class="chart-wrap"><canvas id="compChart"></canvas></div></div><div class="card"><div class="card-title">DEXA Detail</div><table><thead><tr><th>Scan</th><th>BF%</th><th>Fat lb</th><th>Lean lb</th><th>BMD</th><th>VAT</th></tr></thead><tbody>${dexaData.map(d => `<tr><td>${esc(d.label)}</td><td class="td-r td-warn">${n(d.fatPct)}%</td><td class="td-r">${n(d.fatLb)}</td><td class="td-r td-good">${n(d.leanLb)}</td><td class="td-r">${n(d.bmd,3)}</td><td class="td-r">${d.vatArea || "—"}</td></tr>`).join("")}</tbody></table></div></div>
</div>

<div id="tab-running" class="tab-panel">
  <div class="note-box"><b>MTP Protocol:</b> Current ceiling <b>${esc(mtpCeiling)} miles</b>. Running view shows actual session history, not a projection.</div>
  <div class="stat-grid"><div class="stat-box"><div class="stat-label">Run Sessions</div><div class="stat-value">${runSessions.length}</div></div><div class="stat-box"><div class="stat-label">Longest Recent Run</div><div class="stat-value">${runSessions.length ? Math.max(...runSessions.map(s => s.dist)).toFixed(1) : "—"}</div><div class="stat-sub">miles</div></div><div class="stat-box"><div class="stat-label">Run TSB</div><div class="stat-value ${tsbClass(tsbNow.run)}">${tsbNow.run != null ? tsbNow.run.toFixed(1) : "—"}</div></div></div>
  <div class="card"><div class="card-title">Run Distance History</div><div class="chart-wrap"><canvas id="runChart"></canvas></div></div>
  <div class="card"><div class="card-title">Run Log</div><table><thead><tr><th>Date</th><th>Distance</th><th>Duration</th><th>Pace</th><th>MTP</th></tr></thead><tbody>${runSessions.slice(-20).reverse().map(s => `<tr><td>${esc(s.date)}</td><td class="td-r">${s.dist.toFixed(2)}</td><td class="td-r">${s.dur > 0 ? s.dur.toFixed(0) : "—"}</td><td class="td-r">${s.pace || "—"}</td><td class="td-r">${s.mtp ?? "—"}</td></tr>`).join("")}</tbody></table></div>
</div>

<div id="tab-strength" class="tab-panel">
  <div class="note-box"><b>KNR e1RM baselines.</b> Upper TSB: ${tsbNow.upperStrength != null ? tsbNow.upperStrength.toFixed(1) : "—"} | Lower TSB: ${tsbNow.lowerStrength != null ? tsbNow.lowerStrength.toFixed(1) : "—"}.</div>
  <div class="grid-2"><div class="card"><div class="card-title">Strength — recent max loads from training log</div><table><thead><tr><th>Exercise</th><th>Max load (lb)</th><th>Last logged</th></tr></thead><tbody>${strength_baselines.map(b => `<tr><td>${esc(b.ex)}</td><td class="td-r td-good">${b.lb}</td><td style="color:var(--muted);font-size:10px">${esc(b.date || "")}</td></tr>`).join("")}</tbody></table></div><div class="card"><div class="card-title">Strength TSB</div><table><tbody>${[["Overall Strength", tsbNow.strength], ["Upper", tsbNow.upperStrength], ["Lower", tsbNow.lowerStrength]].map(([label, val]) => `<tr><td>${label}</td><td class="td-r ${tsbClass(val) ? `td-${tsbClass(val)}` : ""}">${val != null ? val.toFixed(1) : "—"}</td><td>${statusForTsb(val)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><div class="card-title">Recent Strength Sessions</div><table><thead><tr><th>Date</th><th>Venue</th><th>Duration</th><th>Exercises logged</th></tr></thead><tbody>${strengthSessions.slice(-15).reverse().map(s => `<tr><td>${esc(s.date)}</td><td>${esc(s.venue)}</td><td class="td-r">${s.dur > 0 ? `${s.dur} min` : "—"}</td><td>${esc(s.exercises)}</td></tr>`).join("")}</tbody></table></div>
</div>

<div id="tab-schedule" class="tab-panel">
  <div class="note-box"><b>Current weekly training structure.</b> Full exercise lists per day, with Wednesday and Sunday no-strength rules represented.</div>
  <div class="schedule-grid">${schedule.map(([day, theme, venue, items, comp]) => `<div class="day-card"><div class="day-name">${day}</div><div class="day-theme">${theme}</div>${items.map(i => `<div class="day-item">${esc(i)}</div>`).join("")}<div class="day-venue">${esc(venue)} · ${esc(comp)}</div></div>`).join("")}</div>
</div>

<div id="tab-oc" class="tab-panel">
  <div class="note-box"><b>Operational Capacity</b> tracks active injuries and protocol constraints.</div>
  <div class="stat-grid"><div class="stat-box"><div class="stat-label">Active Issues</div><div class="stat-value ${activeOC.length ? "warn" : "good"}">${activeOC.length}</div></div><div class="stat-box"><div class="stat-label">Upper TSB</div><div class="stat-value">${tsbNow.upperStrength != null ? tsbNow.upperStrength.toFixed(1) : "—"}</div></div><div class="stat-box"><div class="stat-label">Lower TSB</div><div class="stat-value">${tsbNow.lowerStrength != null ? tsbNow.lowerStrength.toFixed(1) : "—"}</div></div><div class="stat-box"><div class="stat-label">Run TSB</div><div class="stat-value">${tsbNow.run != null ? tsbNow.run.toFixed(1) : "—"}</div></div></div>
  <div class="card"><div class="card-title">Active Issues</div>${activeOC.length ? activeOC.map(x => `<div style="background:var(--bg3);border:1px solid rgba(217,95,95,0.3);border-radius:4px;padding:12px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b>${esc(x.label || x.location || "Issue")}</b><span class="badge badge-${Number(x.currentScore ?? x.score ?? 0) >= 3 ? "danger" : Number(x.currentScore ?? x.score ?? 0) >= 2 ? "warn" : "ok"}">Score ${esc(x.currentScore ?? x.score ?? 0)}/5</span></div><div style="font-family:var(--mono);font-size:11px;color:var(--muted)">Location: ${esc(x.location)} | Episodes: ${esc(x.episodeCount || 1)}</div></div>`).join("") : '<div class="td-good">No active issues.</div>'}</div>
  <div class="card"><div class="card-title">Left MTP Protocol — Active Constraints</div>${["Run ceiling " + mtpCeiling + " miles until 3 consecutive score-0 sessions.", "Advance ceiling 10% per qualifying block.", "Ankle warm-up required before every run.", "Heavy calf raises: minimum 48 hours before run days.", "Rowing machine excluded during active MTP protocol."].map(p => `<div class="day-item">${esc(p)}</div>`).join("")}</div>
</div>

<div id="tab-sleep" class="tab-panel">
  <div class="note-box"><b>Source:</b> SleepCycle / manual entries. Target 7.5h. Bars are color-coded by threshold.</div>
  <div class="stat-grid"><div class="stat-box"><div class="stat-label">30-Day Average</div><div class="stat-value ${avgSleep != null ? (avgSleep >= 7.5 ? "good" : avgSleep >= 6.5 ? "warn" : "danger") : ""}">${avgSleep != null ? avgSleep.toFixed(1) : "—"}</div></div><div class="stat-box"><div class="stat-label">Nights on Target</div><div class="stat-value">${sleepSeries.filter(r => r.hours >= 7.5).length}</div><div class="stat-sub">of last ${sleepSeries.length}</div></div><div class="stat-box"><div class="stat-label">Nights &lt; 6.5h</div><div class="stat-value danger">${sleepSeries.filter(r => r.hours < 6.5).length}</div></div></div>
  <div class="card"><div class="card-title">Sleep — last ${sleepSeries.length} nights</div><div class="chart-wrap"><canvas id="sleepChart"></canvas></div></div>
</div>

${mealSeries.length ? `<div id="tab-nutrition" class="tab-panel">
  <div class="note-box"><b>Meal logging started:</b> ${esc(mealSeries[0]?.date)}. Fixed subtotal: 758 cal / 93g protein; dinner is the tracked variable.</div>
  <div class="stat-grid"><div class="stat-box"><div class="stat-label">Days Logged</div><div class="stat-value">${mealSeries.length}</div></div><div class="stat-box"><div class="stat-label">Avg Dinner Cal</div><div class="stat-value">${n(mealSeries.reduce((s, m) => s + m.cal, 0) / mealSeries.length, 0)}</div></div><div class="stat-box"><div class="stat-label">Est Daily Total</div><div class="stat-value">${n(758 + mealSeries.reduce((s, m) => s + m.cal, 0) / mealSeries.length, 0)}</div></div></div>
  <div class="card"><div class="card-title">Meal Log</div><table><thead><tr><th>Date</th><th>Meal</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${[...mealRecords].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 20).map(m => `<tr><td>${esc(iso(m.date))}</td><td>${esc(m.meal || m.meal_type || m.preset_name)}</td><td class="td-r">${Math.round(Number(m.total_calories ?? m.calories ?? 0))}</td><td class="td-r td-good">${Math.round(Number(m.total_protein_g ?? m.protein_g ?? 0))}g</td><td class="td-r">${Math.round(Number(m.total_carbs_g ?? m.carbs_g ?? 0))}g</td><td class="td-r">${Math.round(Number(m.total_fat_g ?? m.fat_g ?? 0))}g</td></tr>`).join("")}</tbody></table></div>
</div>` : ""}
</main>
<script>
const fitData = ${J(fitSeries)};
const weightData = ${J(weightSeries)};
const dexaData = ${J(dexaData)};
const runData = ${J(runSessions)};
const sleepData = ${J(sleepSeries)};
const mtpCeiling = ${JSON.stringify(Number(mtpCeiling) || 4.0)};
Chart.defaults.color = '#6b7290';
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.font.size = 11;
const gridColor = 'rgba(42,47,62,0.8)';
const baseOpts = { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{labels:{boxWidth:12,padding:14}}, tooltip:{backgroundColor:'#1c2030',borderColor:'#2a2f3e',borderWidth:1,titleColor:'#e8d4b0',bodyColor:'#d4d8e8'}}, scales:{x:{grid:{color:gridColor},ticks:{maxTicksLimit:10}}, y:{grid:{color:gridColor}}} };
function showTab(name, btn){document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.getElementById('tab-'+name).classList.add('active');btn.classList.add('active');}
function chart(id, config){const el=document.getElementById(id); if(el && window.Chart) new Chart(el, config);}
const d = fitData.slice(-90), labels = d.map(r=>r.date);
chart('loadChart',{type:'line',data:{labels,datasets:[{label:'CTL',data:d.map(r=>r.ctl),borderColor:'#3a7bd5',backgroundColor:'rgba(58,123,213,0.08)',borderWidth:2,pointRadius:0,fill:true,tension:0.3},{label:'ATL',data:d.map(r=>r.atl),borderColor:'#d95f5f',borderWidth:2,pointRadius:0,tension:0.3},{label:'TSB',data:d.map(r=>r.tsb),borderColor:'#e8b84a',borderWidth:1.5,pointRadius:0,tension:0.3,yAxisID:'y2'}]},options:{...baseOpts,scales:{x:baseOpts.scales.x,y:baseOpts.scales.y,y2:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#e8b84a'}}}}});
chart('trimpChart',{type:'bar',data:{labels,datasets:[{label:'TRIMP',data:d.map(r=>r.trimp),backgroundColor:d.map(r=>(r.trimp||0)>80?'rgba(217,95,95,0.7)':'rgba(58,123,213,0.5)'),borderWidth:0}]},options:{...baseOpts,plugins:{...baseOpts.plugins,legend:{display:false}}}});
const ad = d.filter(r=>r.acwr!=null);
chart('acwrChart',{type:'line',data:{labels:ad.map(r=>r.date),datasets:[{label:'ACWR',data:ad.map(r=>r.acwr),borderColor:'#e8b84a',backgroundColor:'rgba(232,184,74,0.08)',borderWidth:2,pointRadius:0,fill:true,tension:0.3},{label:'1.3 upper',data:ad.map(()=>1.3),borderColor:'rgba(217,95,95,0.5)',borderDash:[4,4],borderWidth:1,pointRadius:0},{label:'0.8 lower',data:ad.map(()=>0.8),borderColor:'rgba(76,175,125,0.5)',borderDash:[4,4],borderWidth:1,pointRadius:0}]},options:{...baseOpts,scales:{x:baseOpts.scales.x,y:{...baseOpts.scales.y,min:0,max:2.5}}}});
chart('weightChart',{type:'line',data:{labels:weightData.map(r=>r.date),datasets:[{label:'Weight (lb)',data:weightData.map(r=>r.weight),borderColor:'#3a7bd5',backgroundColor:'rgba(58,123,213,0.06)',borderWidth:1.5,pointRadius:0,fill:true,tension:0.2}]},options:baseOpts});
chart('bfChart',{type:'line',data:{labels:dexaData.map(r=>r.label),datasets:[{label:'Body Fat %',data:dexaData.map(r=>r.fatPct),borderColor:'#e8b84a',backgroundColor:'rgba(232,184,74,0.1)',borderWidth:2.5,pointRadius:6,fill:true,tension:0.2},{label:'Target (21%)',data:dexaData.map(()=>21),borderColor:'rgba(76,175,125,0.6)',borderDash:[6,4],borderWidth:1.5,pointRadius:0}]},options:baseOpts});
chart('compChart',{type:'bar',data:{labels:dexaData.map(r=>r.label),datasets:[{label:'Fat (lb)',data:dexaData.map(r=>r.fatLb),backgroundColor:'rgba(217,95,95,0.6)'},{label:'Lean (lb)',data:dexaData.map(r=>r.leanLb),backgroundColor:'rgba(76,175,125,0.6)'}]},options:{...baseOpts,scales:{x:baseOpts.scales.x,y:{...baseOpts.scales.y,min:0,max:180}}}});
chart('runChart',{type:'bar',data:{labels:runData.map(r=>r.date),datasets:[{label:'Distance (mi)',data:runData.map(r=>r.dist),backgroundColor:runData.map(r=>r.mtp>=2?'rgba(217,95,95,0.7)':r.mtp===1?'rgba(232,184,74,0.6)':'rgba(58,123,213,0.6)'),borderWidth:0},{label:'Ceiling',data:runData.map(()=>mtpCeiling),borderColor:'rgba(232,140,42,0.6)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,type:'line'}]},options:baseOpts});
chart('sleepChart',{type:'bar',data:{labels:sleepData.map(r=>r.date),datasets:[{label:'Sleep (hrs)',data:sleepData.map(r=>r.hours),backgroundColor:sleepData.map(r=>r.hours>=7.5?'rgba(76,175,125,0.6)':r.hours>=6.5?'rgba(232,184,74,0.5)':'rgba(217,95,95,0.6)'),borderWidth:0},{label:'Target (7.5h)',data:sleepData.map(()=>7.5),borderColor:'rgba(76,175,125,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,type:'line'}]},options:{...baseOpts,scales:{x:baseOpts.scales.x,y:{...baseOpts.scales.y,min:0,max:10}}}});
<\/script>
</body>
</html>`

  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `LIFT_Snapshot_${date}.html`
  a.click()
  URL.revokeObjectURL(url)
}
