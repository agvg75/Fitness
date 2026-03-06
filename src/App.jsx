import React, { useState, useEffect, useMemo } from "react"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area,
  ComposedChart,
  ReferenceLine
} from "recharts"

const tabs = [
  "Overview",
  "Body Comp",
  "Training",
  "Forecast",
  "Schedule",
  "Log",
  "Calories",
  "Injury"
]

const rangeOptions = [
  { key: "30D", label: "30D", points: 30 },
  { key: "90D", label: "90D", points: 90 },
  { key: "180D", label: "180D", points: 180 },
  { key: "1Y", label: "1Y", points: 365 },
  { key: "ALL", label: "ALL", points: null }
]

function cardStyle() {
  return {
    background: "#0d0e1c",
    border: "1px solid #1a1b2e",
    borderRadius: "12px",
    padding: "16px",
    minWidth: "220px"
  }
}

function kgToLb(v) {
  if (v == null || Number.isNaN(Number(v))) return null
  return Number(v) * 2.20462
}

function f1(v) {
  if (v == null || Number.isNaN(Number(v))) return "NA"
  return Number(v).toFixed(1)
}
function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "NA"
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
export default function App() {
  const [tab, setTab] = useState("Overview")
  const [rangeKey, setRangeKey] = useState("180D")

  const [daily, setDaily] = useState([])
  const [nutrition, setNutrition] = useState([])
  const [injury, setInjury] = useState([])
  const [dexa, setDexa] = useState([])
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadData() {
      try {
        const base = import.meta.env.BASE_URL

        const d = await fetch(`${base}data/fitness_daily.json`).then(r => {
          if (!r.ok) throw new Error("fitness_daily.json failed")
          return r.json()
        })

        const n = await fetch(`${base}data/nutrition_daily.json`).then(r => {
          if (!r.ok) throw new Error("nutrition_daily.json failed")
          return r.json()
        })

        const i = await fetch(`${base}data/injury_daily.json`).then(r => {
          if (!r.ok) throw new Error("injury_daily.json failed")
          return r.json()
        })

        const dx = await fetch(`${base}data/dexa_summary.json`).then(r => {
          if (!r.ok) throw new Error("dexa_summary.json failed")
          return r.json()
        })

        setDaily(Array.isArray(d) ? d : [])
        setNutrition(Array.isArray(n) ? n : [])
        setInjury(Array.isArray(i) ? i : [])
        setDexa(Array.isArray(dx) ? dx : [])
      } catch (err) {
        console.log(err)
        setError(String(err))
      }
    }

    loadData()
  }, [])

  const latestWeight = useMemo(() => {
    if (!daily.length) return null
    return daily[daily.length - 1]
  }, [daily])

  const latestNutrition = useMemo(() => {
    if (!nutrition.length) return null
    return nutrition[nutrition.length - 1]
  }, [nutrition])

  const latestInjury = useMemo(() => {
    if (!injury.length) return null
    return injury[injury.length - 1]
  }, [injury])
  const nutritionSeries = useMemo(() => {
    if (!nutrition.length) return []

    const sorted = [...nutrition]
      .map((row, idx) => {
        const date = row.date ?? row.Date ?? `row-${idx + 1}`

        const calories = toNum(
          row.calories ?? row.kcal ?? row.energy_kcal ?? row.Calories
        )

        const protein_g = toNum(
          row.protein_g ?? row.protein ?? row.Protein ?? row.proteingrams
        )

        const carbs_g = toNum(
          row.carbs_g ?? row.carbs ?? row.Carbs ?? row.carbgrams
        )

        const fat_g = toNum(
          row.fat_g ?? row.fat ?? row.Fat ?? row.fatgrams
        )

        const fiber_g = toNum(
          row.fiber_g ?? row.fiber ?? row.Fiber
        )

        return {
          date,
          label: fmtShortDate(date),
          calories,
          protein_g,
          carbs_g,
          fat_g,
          fiber_g
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    return sorted.map((row, i) => {
      const start = Math.max(0, i - 6)
      const subset = sorted.slice(start, i + 1)

      const avgCalories =
        subset.reduce((sum, x) => sum + toNum(x.calories), 0) / subset.length

      const avgProtein =
        subset.reduce((sum, x) => sum + toNum(x.protein_g), 0) / subset.length

      const proteinCal = row.protein_g * 4
      const carbsCal = row.carbs_g * 4
      const fatCal = row.fat_g * 9

      return {
        ...row,
        calories_7d: Number(avgCalories.toFixed(1)),
        protein_7d: Number(avgProtein.toFixed(1)),
        protein_pct: row.calories > 0 ? Number(((proteinCal / row.calories) * 100).toFixed(1)) : 0,
        carbs_pct: row.calories > 0 ? Number(((carbsCal / row.calories) * 100).toFixed(1)) : 0,
        fat_pct: row.calories > 0 ? Number(((fatCal / row.calories) * 100).toFixed(1)) : 0
      }
    })
  }, [nutrition])

  const filteredNutrition = useMemo(() => {
    if (!nutritionSeries.length) return []
    if (selectedRangePoints == null) return nutritionSeries
    return nutritionSeries.slice(-selectedRangePoints)
  }, [nutritionSeries, selectedRangePoints])

  const nutritionSummary = useMemo(() => {
    if (!filteredNutrition.length) return null

    const n = filteredNutrition.length

    const avgCalories =
      filteredNutrition.reduce((sum, row) => sum + toNum(row.calories), 0) / n

    const avgProtein =
      filteredNutrition.reduce((sum, row) => sum + toNum(row.protein_g), 0) / n

    const avgCarbs =
      filteredNutrition.reduce((sum, row) => sum + toNum(row.carbs_g), 0) / n

    const avgFat =
      filteredNutrition.reduce((sum, row) => sum + toNum(row.fat_g), 0) / n

    const proteinTarget = 140

    const proteinHitDays = filteredNutrition.filter(
      row => toNum(row.protein_g) >= proteinTarget
    ).length

    return {
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      proteinTarget,
      proteinHitDays
    }
  }, [filteredNutrition])
  const selectedRangePoints = useMemo(() => {
    const match = rangeOptions.find(r => r.key === rangeKey)
    return match ? match.points : 180
  }, [rangeKey])

  const filteredDaily = useMemo(() => {
    if (!daily.length) return []
    if (selectedRangePoints == null) return daily
    return daily.slice(-selectedRangePoints)
  }, [daily, selectedRangePoints])

  const recentWeights = useMemo(() => {
    if (!filteredDaily.length) return []
    return filteredDaily.slice(-10).reverse()
  }, [filteredDaily])

  const weightSmoothed = useMemo(() => {
    if (!filteredDaily.length) return []

    return filteredDaily.map((d, i) => {
      const currentWeight = Number(d.weight_lb)
      const start = Math.max(0, i - 6)
      const subset = filteredDaily
        .slice(start, i + 1)
        .map(x => Number(x.weight_lb))
        .filter(v => !Number.isNaN(v))

      const avg = subset.length
        ? subset.reduce((a, b) => a + b, 0) / subset.length
        : null

      return {
        date: d.date,
        weight: Number.isNaN(currentWeight) ? null : currentWeight,
        avg: avg == null ? null : Number(avg.toFixed(2))
      }
    })
  }, [filteredDaily])

  const dexaSeries = useMemo(() => {
    if (!dexa.length) return []

    return dexa
      .map((row, idx) => {
        const date = row["Scan date"]?.slice?.(0, 10) ?? row.date ?? `scan-${idx + 1}`
        const totalLb = kgToLb(row["Total mass (kg)"])
        const fatLb = kgToLb(row["Fat mass (kg)"])
        const leanLb = kgToLb(row["Lean mass (kg)"])
        const leanBmcLb = kgToLb(row["Lean+BMC (kg)"])
        const pctFat = row["% fat"] == null ? null : Number(row["% fat"])

const label = date && !date.startsWith("scan-") ? date.slice(0, 7) : `scan-${idx + 1}`
  return {
          date,
          label,
          total_lb: totalLb == null ? null : Number(totalLb.toFixed(1)),
          fat_lb: fatLb == null ? null : Number(fatLb.toFixed(1)),
          lean_lb: leanLb == null ? null : Number(leanLb.toFixed(1)),
          lean_bmc_lb: leanBmcLb == null ? null : Number(leanBmcLb.toFixed(1)),
          pct_fat: pctFat
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [dexa])

  const latestDexa = useMemo(() => {
    if (!dexaSeries.length) return null
    return dexaSeries[dexaSeries.length - 1]
  }, [dexaSeries])

  const latestLeanAnchor = useMemo(() => {
    if (!latestDexa) return null
    return latestDexa.lean_lb
  }, [latestDexa])

  const estimatedCurrentBF = useMemo(() => {
    if (!latestWeight || latestLeanAnchor == null) return null
    const wt = Number(latestWeight.weight_lb)
    if (!wt || wt <= 0) return null
    return ((wt - latestLeanAnchor) / wt) * 100
  }, [latestWeight, latestLeanAnchor])

  return (
    <div
      style={{
        background: "#07080e",
        color: "#ced2f0",
        minHeight: "100vh",
        fontFamily: "Arial",
        padding: "25px"
      }}
    >
      <h2 style={{ marginTop: 0 }}>ANDRÉS FITNESS ARCHIVE</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 12px",
              background: tab === t ? "#252640" : "#0d0e1c",
              border: "1px solid #1a1b2e",
              borderRadius: "8px",
              color: "#ced2f0",
              cursor: "pointer"
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: "20px", color: "#ff8a8a" }}>
          Data load error: {error}
        </div>
      )}

      {tab === "Overview" && (
        <div>
          <h3>Overview</h3>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Current Weight</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>
                {latestWeight?.weight_lb ?? "NA"} lb
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                {latestWeight?.date ?? "No date"}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Weight Records</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{daily.length}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Nutrition Days</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutrition.length}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                Latest: {latestNutrition?.date ?? "NA"}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Injury Entries</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{injury.length}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                Latest: {latestInjury?.date ?? "NA"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            {rangeOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setRangeKey(opt.key)}
                style={{
                  padding: "6px 10px",
                  background: rangeKey === opt.key ? "#4a9ee8" : "#0d0e1c",
                  border: "1px solid #1a1b2e",
                  borderRadius: "8px",
                  color: "#ced2f0",
                  cursor: "pointer"
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
              Weight Trend ({rangeKey})
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={weightSmoothed}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="date" />
                <YAxis domain={[120, "dataMax + 2"]} tickCount={6} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#4a9ee8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#ffd166"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ ...cardStyle(), maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
              Recent Weight Entries ({rangeKey})
            </div>

            {!recentWeights.length ? (
              <div>No weight data loaded.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #252640" }}>
                    <th style={{ padding: "8px 4px" }}>Date</th>
                    <th style={{ padding: "8px 4px" }}>Weight</th>
                    <th style={{ padding: "8px 4px" }}>Min</th>
                    <th style={{ padding: "8px 4px" }}>Max</th>
                    <th style={{ padding: "8px 4px" }}>N</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWeights.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #1a1b2e" }}>
                      <td style={{ padding: "8px 4px" }}>{row.date ?? "NA"}</td>
                      <td style={{ padding: "8px 4px" }}>{row.weight_lb ?? "NA"}</td>
                      <td style={{ padding: "8px 4px" }}>{row.weight_lb_min ?? "NA"}</td>
                      <td style={{ padding: "8px 4px" }}>{row.weight_lb_max ?? "NA"}</td>
                      <td style={{ padding: "8px 4px" }}>{row.n_measurements ?? "NA"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "Body Comp" && (
        <div>
          <h3>Body Composition</h3>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Latest DEXA Weight</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>
                {latestDexa ? `${f1(latestDexa.total_lb)} lb` : "NA"}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                {latestDexa?.date ?? "No scan"}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Latest DEXA Body Fat</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>
                {latestDexa?.pct_fat != null ? `${f1(latestDexa.pct_fat)}%` : "NA"}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Lean Mass Anchor</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>
                {latestLeanAnchor != null ? `${f1(latestLeanAnchor)} lb` : "NA"}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                latest DEXA lean mass
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Estimated Current BF%</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>
                {estimatedCurrentBF != null ? `${f1(estimatedCurrentBF)}%` : "NA"}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                from current weight and latest lean anchor
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ ...cardStyle(), minWidth: "0" }}>
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
                DEXA Composition by Scan
              </div>

              <ResponsiveContainer width="100%" height={300}>
<BarChart data={dexaSeries}>
  <CartesianGrid stroke="#1a1b2e" />
  <XAxis dataKey="label" />
  <YAxis domain={[100, "dataMax + 5"]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="lean_lb" name="Lean (lb)" stackId="a" fill="#4a9ee8" />
                  <Bar dataKey="fat_lb" name="Fat (lb)" stackId="a" fill="#e8704a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...cardStyle(), minWidth: "0" }}>
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
                DEXA Body Fat %
              </div>

              <ResponsiveContainer width="100%" height={300}>
<LineChart data={dexaSeries}>
  <CartesianGrid stroke="#1a1b2e" />
  <XAxis dataKey="label" />
  <YAxis domain={[20, "dataMax + 3"]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="pct_fat"
                    stroke="#ffd166"
                    strokeWidth={3}
                    dot={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...cardStyle(), maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
              DEXA Scan Summary
            </div>

            {!dexaSeries.length ? (
              <div>No DEXA data loaded.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #252640" }}>
                    <th style={{ padding: "8px 4px" }}>Date</th>
                    <th style={{ padding: "8px 4px" }}>Total</th>
                    <th style={{ padding: "8px 4px" }}>Lean</th>
                    <th style={{ padding: "8px 4px" }}>Fat</th>
                    <th style={{ padding: "8px 4px" }}>Body Fat %</th>
                  </tr>
                </thead>
                <tbody>
                  {dexaSeries.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #1a1b2e" }}>
                      <td style={{ padding: "8px 4px" }}>{row.date}</td>
                      <td style={{ padding: "8px 4px" }}>{f1(row.total_lb)} lb</td>
                      <td style={{ padding: "8px 4px" }}>{f1(row.lean_lb)} lb</td>
                      <td style={{ padding: "8px 4px" }}>{f1(row.fat_lb)} lb</td>
                      <td style={{ padding: "8px 4px" }}>{f1(row.pct_fat)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "Calories" && (
        <div>
          <h3>Calories</h3>

          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            {rangeOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setRangeKey(opt.key)}
                style={{
                  padding: "6px 10px",
                  background: rangeKey === opt.key ? "#4a9ee8" : "#0d0e1c",
                  border: "1px solid #1a1b2e",
                  borderRadius: "8px",
                  color: "#ced2f0",
                  cursor: "pointer"
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Nutrition Records</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutrition.length}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                Latest: {latestNutrition?.date ?? "NA"}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Avg Calories</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>
                {nutritionSummary ? Math.round(nutritionSummary.avgCalories) : "NA"}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                over {rangeKey}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Avg Protein</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>
                {nutritionSummary ? `${Math.round(nutritionSummary.avgProtein)} g` : "NA"}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                target days: {nutritionSummary ? `${nutritionSummary.proteinHitDays}/${filteredNutrition.length}` : "NA"}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Avg Carbs / Fat</div>
              <div style={{ fontSize: "20px", fontWeight: "bold" }}>
                {nutritionSummary
                  ? `${Math.round(nutritionSummary.avgCarbs)} g / ${Math.round(nutritionSummary.avgFat)} g`
                  : "NA"}
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
              Calories Trend ({rangeKey})
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={filteredNutrition}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="calories"
                  stroke="#4a9ee8"
                  strokeWidth={2}
                  dot={false}
                  name="Calories"
                />
                <Line
                  type="monotone"
                  dataKey="calories_7d"
                  stroke="#ffd166"
                  strokeWidth={3}
                  dot={false}
                  name="7 day avg"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ ...cardStyle(), minWidth: "0" }}>
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
                Daily Macros (g)
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={filteredNutrition}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="protein_g" name="Protein (g)" stackId="a" fill="#4ae890" />
                  <Bar dataKey="carbs_g" name="Carbs (g)" stackId="a" fill="#4a9ee8" />
                  <Bar dataKey="fat_g" name="Fat (g)" stackId="a" fill="#e8c94a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...cardStyle(), minWidth: "0" }}>
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
                Protein vs Target
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={filteredNutrition}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="protein_g" name="Protein (g)" fill="#4ae890" />
                  <Line
                    type="monotone"
                    dataKey="protein_7d"
                    stroke="#ffd166"
                    strokeWidth={3}
                    dot={false}
                    name="7 day avg"
                  />
                  <ReferenceLine
                    y={140}
                    stroke="#ff6b9d"
                    strokeDasharray="4 4"
                    label="140g"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...cardStyle(), maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
              Macro Share of Calories (%)
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={filteredNutrition}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="protein_pct" stackId="1" stroke="#4ae890" fill="#4ae890" name="Protein %" />
                <Area type="monotone" dataKey="carbs_pct" stackId="1" stroke="#4a9ee8" fill="#4a9ee8" name="Carbs %" />
                <Area type="monotone" dataKey="fat_pct" stackId="1" stroke="#e8c94a" fill="#e8c94a" name="Fat %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "Injury" && (
        <div>
          <h3>Injury Log</h3>
          <div>Injury entries loaded: {injury.length}</div>
          <div style={{ marginTop: "10px" }}>
            Latest injury date: {latestInjury?.date ?? "NA"}
          </div>
        </div>
      )}

      {tab !== "Overview" && tab !== "Body Comp" && tab !== "Calories" && tab !== "Injury" && (
        <div>
          <h3>{tab}</h3>
          <div>This tab is next.</div>
        </div>
      )}
    </div>
  )
}
