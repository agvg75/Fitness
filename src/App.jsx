import React, { useState, useEffect, useMemo } from "react"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
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

export default function App() {
  const [tab, setTab] = useState("Overview")
  const [rangeKey, setRangeKey] = useState("180D")

  const [daily, setDaily] = useState([])
  const [nutrition, setNutrition] = useState([])
  const [injury, setInjury] = useState([])
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

        setDaily(Array.isArray(d) ? d : [])
        setNutrition(Array.isArray(n) ? n : [])
        setInjury(Array.isArray(i) ? i : [])
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

    const series = filteredDaily.map(d => Number(d.weight_lb)).filter(v => !Number.isNaN(v))

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

      {tab === "Calories" && (
        <div>
          <h3>Calories</h3>
          <div>Nutrition records loaded: {nutrition.length}</div>
          <div style={{ marginTop: "10px" }}>
            Latest nutrition date: {latestNutrition?.date ?? "NA"}
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

      {tab !== "Overview" && tab !== "Calories" && tab !== "Injury" && (
        <div>
          <h3>{tab}</h3>
          <div>This tab is next.</div>
        </div>
      )}
    </div>
  )
}
