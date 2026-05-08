// src/exportReport.js
// Generates a self-contained trainer snapshot HTML file and triggers download.
// Called from ImportTab with current app state.
// No external dependencies. No Supabase calls.

export function generateTrainerReport({ healthFitDaily, biometricRecords, dexaData, ocItems, snapshotDate }) {
  const cutoff = new Date(snapshotDate)
  cutoff.setDate(cutoff.getDate() - 180)

  const fitData = (Array.isArray(healthFitDaily) ? healthFitDaily : [])
    .filter(r => r.date && new Date(r.date) >= cutoff)
    .map(r => ({
      date: r.date,
      ctl: r.ctl != null ? Number(r.ctl) : 0,
      atl: r.atl != null ? Number(r.atl) : 0,
      tsb: r.tsb != null ? Number(r.tsb) : 0,
      trimp: r.trimp != null ? Number(r.trimp) : 0,
      dur: r.duration_min != null ? Number(r.duration_min) : 0,
      steps: r.steps != null ? Number(r.steps) : 0,
      acwr: r.acwr != null ? Number(r.acwr) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const weightByDate = {}
  ;(Array.isArray(biometricRecords) ? biometricRecords : []).forEach(r => {
    const d = r.date
    const w = r.weight_lb ?? r.weight_lbs ?? r.weight_lbs_mean ?? null
    if (!d || !w || Number(w) < 100) return
    if (!weightByDate[d] || Number(w) > weightByDate[d]) {
      weightByDate[d] = Number(w)
    }
  })

  const weightData = Object.entries(weightByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, weight]) => ({ date, weight: Math.round(weight * 10) / 10 }))

  const activeOC = (Array.isArray(ocItems) ? ocItems : [])
    .filter(x => x.status !== "resolved" && Number(x.currentScore || 0) > 0)
    .map(x => ({
      label: x.label || x.id,
      key: x.key,
      score: x.currentScore,
      status: x.status || "active",
      location: x.location,
    }))

  const dexaSafe = Array.isArray(dexaData) ? dexaData : []
  const latestDexa = dexaSafe[dexaSafe.length - 1] || null
  const latestFit = fitData[fitData.length - 1] || null

  const html = buildHTML({
    fitData,
    weightData,
    dexaData: dexaSafe,
    activeOC,
    latestDexa,
    latestFit,
    snapshotDate,
  })

  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `LIFT_Trainer_Snapshot_${snapshotDate}.html`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 200)
}

function buildHTML({ fitData, weightData, dexaData, activeOC, latestDexa, latestFit, snapshotDate }) {
  const fitJSON = JSON.stringify(fitData)
  const weightJSON = JSON.stringify(weightData)
  const dexaJSON = JSON.stringify(dexaData)
  const ocJSON = JSON.stringify(activeOC)

  const curCtl = latestFit?.ctl ?? "—"
  const curAtl = latestFit?.atl ?? "—"
  const curTsb = latestFit?.tsb ?? "—"
  const curAcwr = latestFit?.acwr != null ? Number(latestFit.acwr).toFixed(2) : "—"

  const dxFatPct = latestDexa?.fatPct ?? "—"
  const dxFatMass = latestDexa ? (latestDexa.fatMass / 453.592).toFixed(1) : "—"
  const dxLeanMass = latestDexa ? (latestDexa.leanMass / 453.592).toFixed(1) : "—"
  const dxTotal = latestDexa ? (latestDexa.totalMass / 453.592).toFixed(1) : "—"
  const dxBmd = latestDexa?.bmd ?? "—"
  const dxLabel = latestDexa?.label ?? "—"
  const fatToLose = latestDexa
    ? ((latestDexa.fatMass / 453.592) - (latestDexa.totalMass / 453.592) * 0.21).toFixed(1)
    : "—"

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LIFT — Andrés Vidal-Gadea | Trainer Snapshot ${snapshotDate}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
:root{--bg:#0d0f12;--bg2:#141720;--bg3:#1c2030;--border:#2a2f3e;--accent:#e88c2a;--accent2:#3a7bd5;--accent3:#4caf7d;--danger:#d95f5f;--warn:#e8b84a;--text:#d4d8e8;--muted:#6b7290;--mono:'IBM Plex Mono',monospace;--sans:'IBM Plex Sans',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--sans);background:var(--bg);color:var(--text);min-height:100vh;font-size:14px}
header{background:var(--bg2);border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.logo{font-family:var(--mono);font-size:22px;font-weight:600;color:var(--accent);letter-spacing:4px}
.logo span{color:var(--muted);font-weight:300;font-size:13px;letter-spacing:1px;margin-left:12px}
.snap-tag{font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--bg3);border:1px solid var(--border);padding:4px 10px;border-radius:2px}
.snap-tag b{color:var(--accent)}
nav{background:var(--bg2);border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap}
.tab-btn{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;padding:12px 16px;cursor:pointer;white-space:nowrap}
.tab-btn:hover{color:var(--text)}.tab-btn.active{color:var(--accent);border-bottom-color:var(--accent)}
main{padding:24px;max-width:1200px;margin:0 auto}.tab-panel{display:none}.tab-panel.active{display:block}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:20px;margin-bottom:16px}
.card-title{font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.stat-box{background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:16px}
.stat-label{font-family:var(--mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.stat-value{font-family:var(--mono);font-size:26px;font-weight:600;color:var(--accent);line-height:1}
.stat-sub{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px}
.good{color:var(--accent3)}.warn{color:var(--warn)}.danger{color:var(--danger)}
.chart-wrap{position:relative;width:100%;height:280px;margin-bottom:8px}.chart-wrap.tall{height:340px}.chart-wrap.short{height:180px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:768px){.grid-2{grid-template-columns:1fr}header{display:block}.logo span{display:block;margin:6px 0 0}}
table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px}
th{text-align:left;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--border)}
td{padding:8px 10px;border-bottom:1px solid rgba(42,47,62,0.5)}tr:hover td{background:var(--bg3)}
.td-num{text-align:right;color:var(--accent)}.td-good{color:var(--accent3)}.td-warn{color:var(--warn)}.td-danger{color:var(--danger)}
.badge{display:inline-block;font-family:var(--mono);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:3px 8px;border-radius:2px;font-weight:500}
.badge-active{background:rgba(217,95,95,0.15);color:var(--danger);border:1px solid rgba(217,95,95,0.3)}
.note-box{background:rgba(58,123,213,0.06);border:1px solid rgba(58,123,213,0.2);border-radius:4px;padding:12px 14px;font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:16px}
.note-box b{color:var(--accent2)}.protocol-box{background:rgba(232,140,42,0.05);border:1px solid rgba(232,140,42,0.2);border-radius:4px;padding:14px;margin-top:12px}
.protocol-title{font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
.protocol-item{font-size:12px;color:var(--text);margin-bottom:4px;padding-left:12px;position:relative}.protocol-item::before{content:'-';position:absolute;left:0;color:var(--accent)}
.schedule-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:8px}@media(max-width:768px){.schedule-grid{grid-template-columns:repeat(2,1fr)}}
.day-card{background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:12px;min-height:180px}.day-name{font-family:var(--mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.day-item{font-size:11px;color:var(--text);margin-bottom:4px;line-height:1.4}.day-venue{font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:6px}
.filter-btn{font-family:var(--mono);font-size:10px;letter-spacing:1px;padding:5px 12px;border-radius:2px;border:1px solid var(--border);background:var(--bg3);color:var(--muted);cursor:pointer}.filter-btn.active{border-color:var(--accent);color:var(--accent)}
</style>
</head>
<body>
<header><div class="logo">LIFT <span>Longitudinal Intelligence for Fitness Training</span></div><div class="snap-tag">Snapshot: <b>${snapshotDate}</b> &nbsp;|&nbsp; Andrés Vidal-Gadea</div></header>
<nav>
  <button class="tab-btn active" onclick="showTab('overview',this)">Overview</button>
  <button class="tab-btn" onclick="showTab('load',this)">Training Load</button>
  <button class="tab-btn" onclick="showTab('body',this)">Body Composition</button>
  <button class="tab-btn" onclick="showTab('running',this)">Running</button>
  <button class="tab-btn" onclick="showTab('schedule',this)">Schedule</button>
  <button class="tab-btn" onclick="showTab('oc',this)">Operational Capacity</button>
</nav>
<main>
<div id="tab-overview" class="tab-panel active">
  <div class="note-box"><b>Trainer reference snapshot.</b> Values are sourced from currently loaded LIFT state. Body composition is anchored to the ${dxLabel} DEXA scan.</div>
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-label">Body Weight</div><div class="stat-value">${dxTotal}</div><div class="stat-sub">lb | ${dxLabel} DEXA</div></div>
    <div class="stat-box"><div class="stat-label">Body Fat</div><div class="stat-value warn">${dxFatPct}%</div><div class="stat-sub">${dxFatMass} lb fat mass | Target: 21%</div></div>
    <div class="stat-box"><div class="stat-label">Lean Mass</div><div class="stat-value good">${dxLeanMass}</div><div class="stat-sub">lb lean mass</div></div>
    <div class="stat-box"><div class="stat-label">BMD</div><div class="stat-value good">${dxBmd}</div><div class="stat-sub">g/cm2</div></div>
    <div class="stat-box"><div class="stat-label">Fat to Phase 1</div><div class="stat-value">${fatToLose}</div><div class="stat-sub">lb remaining to 21%</div></div>
    <div class="stat-box"><div class="stat-label">Training CTL</div><div class="stat-value">${curCtl}</div><div class="stat-sub">Latest HealthFit export</div></div>
    <div class="stat-box"><div class="stat-label">TSB</div><div class="stat-value ${Number(curTsb) < -7 ? "danger" : Number(curTsb) < 0 ? "warn" : "good"}">${curTsb}</div><div class="stat-sub">Personal threshold: -7</div></div>
    <div class="stat-box"><div class="stat-label">Active Injuries</div><div class="stat-value ${activeOC.length > 0 ? "danger" : "good"}">${activeOC.length}</div><div class="stat-sub">${activeOC.map(x => x.label).join(", ") || "None"}</div></div>
  </div>
  <div class="grid-2">
    <div class="card"><div class="card-title">Race Calendar</div><table><tbody><tr><td>Jul 4, 2026</td><td>Park 2 Park 5-Mile</td></tr><tr><td>Sep 19, 2026</td><td>St. Jude 10K / Half Marathon</td></tr><tr><td>Oct 17-18, 2026</td><td>Naperville Half / Chicago Fall Classic</td></tr></tbody></table></div>
    <div class="card"><div class="card-title">DEXA Summary</div><table><thead><tr><th>Scan</th><th>BF%</th><th>Fat (lb)</th><th>Lean (lb)</th></tr></thead><tbody id="dexa-tbody"></tbody></table></div>
  </div>
</div>
<div id="tab-load" class="tab-panel">
  <div class="note-box"><b>Source:</b> Loaded HealthFit daily state. Personalized Banister model threshold: TSB below -7 combined with high 14-day load.</div>
  <div class="stat-grid"><div class="stat-box"><div class="stat-label">CTL</div><div class="stat-value">${curCtl}</div></div><div class="stat-box"><div class="stat-label">ATL</div><div class="stat-value warn">${curAtl}</div></div><div class="stat-box"><div class="stat-label">TSB</div><div class="stat-value">${curTsb}</div></div><div class="stat-box"><div class="stat-label">ACWR</div><div class="stat-value">${curAcwr}</div></div></div>
  <div class="card"><div class="card-title">CTL / ATL / TSB</div><button class="filter-btn active" onclick="setRange(60,this)">60 days</button> <button class="filter-btn" onclick="setRange(90,this)">90 days</button> <button class="filter-btn" onclick="setRange(180,this)">All</button><div class="chart-wrap tall"><canvas id="loadChart"></canvas></div></div>
  <div class="grid-2"><div class="card"><div class="card-title">Daily TRIMP</div><div class="chart-wrap"><canvas id="trimpChart"></canvas></div></div><div class="card"><div class="card-title">ACWR</div><div class="chart-wrap"><canvas id="acwrChart"></canvas></div></div></div>
  <div class="card"><div class="card-title">Daily Steps</div><div class="chart-wrap short"><canvas id="stepsChart"></canvas></div></div>
</div>
<div id="tab-body" class="tab-panel"><div class="grid-2"><div class="card"><div class="card-title">Body Weight Trend</div><div class="chart-wrap tall"><canvas id="weightChart"></canvas></div></div><div class="card"><div class="card-title">Body Fat % - DEXA Anchors</div><div class="chart-wrap tall"><canvas id="bfChart"></canvas></div></div></div><div class="card"><div class="card-title">Fat vs Lean Mass</div><div class="chart-wrap"><canvas id="compChart"></canvas></div></div></div>
<div id="tab-running" class="tab-panel"><div class="note-box"><b>MTP Protocol:</b> 3 consecutive score-0 sessions required before advancing 10%. Current ceiling: 3.0 miles.</div><div class="card"><div class="card-title">Projected Distance Ramp to Half Marathon</div><div class="chart-wrap"><canvas id="rampChart"></canvas></div></div></div>
<div id="tab-schedule" class="tab-panel"><div class="note-box"><b>Current weekly training plan.</b> Wednesday and Sunday are no-strength days. Saturday: run precedes lifting.</div><div class="schedule-grid"><div class="day-card"><div class="day-name">Monday</div><div class="day-item">Chest + Arms</div><div class="day-venue">YMCA</div></div><div class="day-card"><div class="day-name">Tuesday</div><div class="day-item">Legs</div></div><div class="day-card"><div class="day-name">Wednesday</div><div class="day-item">Rest / Recovery</div></div><div class="day-card"><div class="day-name">Thursday</div><div class="day-item">Back + Arms</div></div><div class="day-card"><div class="day-name">Friday</div><div class="day-item">Legs + Some Chest</div></div><div class="day-card"><div class="day-name">Saturday</div><div class="day-item">Long Run + Hip / Legs</div></div><div class="day-card"><div class="day-name">Sunday</div><div class="day-item">Long Run only</div></div></div></div>
<div id="tab-oc" class="tab-panel"><div class="note-box"><b>Operational Capacity</b> tracks active injuries and protocol modifications.</div><div class="card"><div class="card-title">Active Issues</div><div id="oc-active-list"></div></div><div class="card"><div class="card-title">Left MTP Protocol Modifications</div><div class="protocol-box"><div class="protocol-title">Active constraints</div><div class="protocol-item">Ankle warm-up required before every run.</div><div class="protocol-item">Heavy calf raises minimum 48 hours before run days.</div><div class="protocol-item">Rowing excluded during MTP recovery.</div><div class="protocol-item">Run ceiling 3.0 miles until 3 consecutive score-0 sessions.</div></div></div></div>
</main>
<script>
const fitData = ${fitJSON};
const weightData = ${weightJSON};
const dexaData = ${dexaJSON};
const activeOC = ${ocJSON};
Chart.defaults.color = '#6b7290';
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.font.size = 11;
const gridColor = 'rgba(42,47,62,0.8)';
const baseOpts = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12, padding: 16 } }, tooltip: { backgroundColor: '#1c2030', borderColor: '#2a2f3e', borderWidth: 1, titleColor: '#e8d4b0', bodyColor: '#d4d8e8' } }, scales: { x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: gridColor } } } };
function showTab(name, btn) { document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.getElementById('tab-' + name).classList.add('active'); btn.classList.add('active'); }
const dexaTbody = document.getElementById('dexa-tbody');
dexaData.forEach(d => { const fatLb = (d.fatMass / 453.592).toFixed(1); const leanLb = (d.leanMass / 453.592).toFixed(1); dexaTbody.innerHTML += \`<tr><td>\${d.label}</td><td class="td-num td-warn">\${d.fatPct}%</td><td class="td-num">\${fatLb}</td><td class="td-num td-good">\${leanLb}</td></tr>\`; });
const ocList = document.getElementById('oc-active-list');
if (activeOC.length === 0) ocList.innerHTML = '<div style="font-family:var(--mono);font-size:12px;color:var(--accent3);padding:8px 0">No active issues.</div>';
else activeOC.forEach(x => { ocList.innerHTML += \`<div style="background:var(--bg3);border:1px solid rgba(217,95,95,0.3);border-radius:4px;padding:14px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-family:var(--mono);font-size:13px;font-weight:600">\${x.label}</span><span class="badge badge-active">\${x.status}</span></div><div style="font-family:var(--mono);font-size:11px;color:var(--muted)">Score: \${x.score} | Location: \${x.location || '-'}</div></div>\`; });
let loadChart, trimpChart, acwrChart, stepsChart;
function buildLoadCharts(range) {
  const d = fitData.slice(-range); const labels = d.map(r => r.date);
  if (loadChart) loadChart.destroy();
  loadChart = new Chart(document.getElementById('loadChart'), { type: 'line', data: { labels, datasets: [{ label: 'CTL', data: d.map(r => r.ctl), borderColor: '#3a7bd5', backgroundColor: 'rgba(58,123,213,0.1)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 }, { label: 'ATL', data: d.map(r => r.atl), borderColor: '#d95f5f', borderWidth: 2, pointRadius: 0, tension: 0.3 }, { label: 'TSB', data: d.map(r => r.tsb), borderColor: '#e8b84a', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y2' }] }, options: { ...baseOpts, scales: { x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: gridColor } }, y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#e8b84a' } } } } });
  if (trimpChart) trimpChart.destroy();
  trimpChart = new Chart(document.getElementById('trimpChart'), { type: 'bar', data: { labels, datasets: [{ label: 'TRIMP', data: d.map(r => r.trimp), backgroundColor: d.map(r => r.trimp > 80 ? 'rgba(217,95,95,0.7)' : 'rgba(58,123,213,0.5)'), borderWidth: 0 }] }, options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } } } });
  const ad = d.filter(r => r.acwr != null);
  if (acwrChart) acwrChart.destroy();
  acwrChart = new Chart(document.getElementById('acwrChart'), { type: 'line', data: { labels: ad.map(r => r.date), datasets: [{ label: 'ACWR', data: ad.map(r => r.acwr), borderColor: '#e8b84a', backgroundColor: 'rgba(232,184,74,0.08)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 }, { label: 'Upper (1.3)', data: ad.map(() => 1.3), borderColor: 'rgba(217,95,95,0.5)', borderDash: [4,4], borderWidth: 1, pointRadius: 0 }, { label: 'Lower (0.8)', data: ad.map(() => 0.8), borderColor: 'rgba(76,175,125,0.5)', borderDash: [4,4], borderWidth: 1, pointRadius: 0 }] }, options: { ...baseOpts, scales: { x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: gridColor }, min: 0, max: 3 } } } });
  if (stepsChart) stepsChart.destroy();
  stepsChart = new Chart(document.getElementById('stepsChart'), { type: 'bar', data: { labels, datasets: [{ label: 'Steps', data: d.map(r => r.steps), backgroundColor: 'rgba(76,175,125,0.4)', borderWidth: 0 }] }, options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } } } });
}
function setRange(r, btn) { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); buildLoadCharts(r); }
buildLoadCharts(60);
new Chart(document.getElementById('weightChart'), { type: 'line', data: { labels: weightData.map(r => r.date), datasets: [{ label: 'Weight (lb)', data: weightData.map(r => r.weight), borderColor: '#3a7bd5', backgroundColor: 'rgba(58,123,213,0.06)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.2 }] }, options: baseOpts });
const dxLabels = dexaData.map(d => d.label);
new Chart(document.getElementById('bfChart'), { type: 'line', data: { labels: dxLabels, datasets: [{ label: 'Body Fat %', data: dexaData.map(d => d.fatPct), borderColor: '#e8b84a', backgroundColor: 'rgba(232,184,74,0.1)', borderWidth: 2.5, pointRadius: 6, fill: true, tension: 0.2 }, { label: 'Target (21%)', data: dxLabels.map(() => 21), borderColor: 'rgba(76,175,125,0.6)', borderDash: [6,4], borderWidth: 1.5, pointRadius: 0 }] }, options: baseOpts });
new Chart(document.getElementById('compChart'), { type: 'bar', data: { labels: dxLabels, datasets: [{ label: 'Fat (lb)', data: dexaData.map(d => (d.fatMass / 453.592).toFixed(1)), backgroundColor: 'rgba(217,95,95,0.6)' }, { label: 'Lean (lb)', data: dexaData.map(d => (d.leanMass / 453.592).toFixed(1)), backgroundColor: 'rgba(76,175,125,0.6)' }] }, options: baseOpts });
const rampLabels = [], rampMiles = []; let cur = 3.0; const start = new Date('2026-05-18');
for (let w = 0; w < 20; w++) { const d = new Date(start); d.setDate(d.getDate() + w * 7); rampLabels.push(d.toISOString().slice(0, 10)); if (w > 0 && w % 2 === 0) cur = Math.min(cur * 1.1, 13.1); rampMiles.push(parseFloat(cur.toFixed(1))); }
new Chart(document.getElementById('rampChart'), { type: 'line', data: { labels: rampLabels, datasets: [{ label: 'Long Run (mi)', data: rampMiles, borderColor: '#3a7bd5', backgroundColor: 'rgba(58,123,213,0.08)', borderWidth: 2, pointRadius: 4, fill: true, tension: 0.2 }, { label: 'Half Marathon (13.1)', data: rampLabels.map(() => 13.1), borderColor: 'rgba(232,140,42,0.7)', borderDash: [6,4], borderWidth: 1.5, pointRadius: 0 }] }, options: baseOpts });
<\/script>
</body>
</html>`
}
