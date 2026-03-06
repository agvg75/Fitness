import React, { useState, useEffect } from "react"

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
      <h2>ANDRÉS FITNESS ARCHIVE</h2>

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
              color: "#ced2f0"
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

      <div>
        {tab === "Overview" && (
          <div>
            <h3>Overview</h3>
            <div>Total weight records: {daily.length}</div>
            <div>Total nutrition days: {nutrition.length}</div>
            <div>Total injury entries: {injury.length}</div>
          </div>
        )}

        {tab === "Calories" && (
          <div>
            <h3>Calories</h3>
            <div>Nutrition records loaded: {nutrition.length}</div>
          </div>
        )}

        {tab === "Injury" && (
          <div>
            <h3>Injury Log</h3>
            <div>Injury entries loaded: {injury.length}</div>
          </div>
        )}
      </div>
    </div>
  )
}
