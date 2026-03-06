import React, { useState, useEffect, useMemo } from "react"

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

  const [daily, setDaily] = useState([])
  const [nutrition, setNutrition] = useState([])
  const [injury, setInjury] = useState([])
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadData() {
      try {
        const base = import.meta.env.BASE_URL

        const d = await fetch(`${base}data/fitness_daily.json`).then(r => {
          if (!r.ok) throw new Error(`fitness_daily.json failed: ${r.status}`)
          return r.json()
        })

        const n = await fetch(`${base}data/nutrition_daily.json`).then(r => {
          if (!r.ok) throw new Error(`nutrition_daily.json failed: ${r.status}`)
          return r.json()
        })

        const i = await fetch(`${base}data/injury_daily.json`).then(r => {
          if (!r.ok) throw new Error(`injury_daily.json failed: ${r.status}`)
          return r.json()
        })

        setDaily(Array.isArray(d) ? d : [])
        setNutrition(Array.isArray(n) ? n : [])
        setInjury(Array.isArray(i) ? i : [])
      } catch (err) {
        console.log("Data load error", err)
        setError(String(err))
      }
    }

    loadData()
  }, [])

  const latestWeight = useMemo(() => {
    if (!daily.length) return null
    return daily[daily.length - 1]
  }, [daily])

  const recentWeights = useMemo(() => {
    if (!daily.length) return []
    return daily.slice(-10).reverse()
  }, [daily])

  const latestNutrition = useMemo(() => {
    if (!nutrition.length) return null
    return nutrition[nutrition.length - 1]
  }, [nutrition])

  const latestInjury = useMemo(() => {
    if (!injury.length) return null
    return injury[injury.length - 1]
  }, [injury])

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

          <div style={{ ...cardStyle(), maxWidth: "800px" }}>
            <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "12px" }}>
              Recent Weight Entries
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
