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
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

let STORE_USER_ID = null
const setStoreUser = userId => {
  STORE_USER_ID = userId || null
}

const SYNC_KEYS = new Set([
  "ufd-meal-entries",
  "ufd-meal-presets"
])

const store = {
  async get(key) {
    try {
      if (supabase && STORE_USER_ID && SYNC_KEYS.has(key)) {
        const { data, error } = await supabase
          .from("user_kv")
          .select("value")
          .eq("user_id", STORE_USER_ID)
          .eq("key", key)
          .maybeSingle()

        if (!error && data && data.value != null) {
          try {
            localStorage.setItem(key, JSON.stringify(data.value))
          } catch {}
          return data.value
        }
      }

      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) : null
    } catch {
      return null
    }
  },

  async set(key, value) {
    try {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {}

      if (supabase && STORE_USER_ID && SYNC_KEYS.has(key)) {
        const payload = {
          user_id: STORE_USER_ID,
          key,
          value,
          updated_at: new Date().toISOString()
        }

        const { error } = await supabase
          .from("user_kv")
          .upsert(payload, { onConflict: "user_id,key" })

        if (error) return false
      }

      return true
    } catch {
      return false
    }
  }
}

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

const defaultMealPresets = {
  Breakfast: [
    { id: "b1", name: "Greek yogurt + banana + granola + honey", calories: 420, protein_g: 22, carbs_g: 58, fat_g: 8, fiber_g: 4 },
    { id: "b2", name: "Bagel + cream cheese + 2 eggs + ham", calories: 520, protein_g: 30, carbs_g: 42, fat_g: 24, fiber_g: 2 },
    { id: "b3", name: "3 eggs + 4 ham slices", calories: 320, protein_g: 31, carbs_g: 2, fat_g: 20, fiber_g: 0 }
  ],
  Lunch: [
    { id: "l1", name: "Protein bar + 2 yogurts", calories: 350, protein_g: 37, carbs_g: 28, fat_g: 9, fiber_g: 2 },
    { id: "l2", name: "Sandwich + yogurt", calories: 500, protein_g: 30, carbs_g: 45, fat_g: 18, fiber_g: 3 },
    { id: "l3", name: "Ham and eggs", calories: 350, protein_g: 32, carbs_g: 3, fat_g: 22, fiber_g: 0 }
  ],
  Dinner: [
    { id: "d1", name: "Fish + vegetables + yogurt", calories: 420, protein_g: 32, carbs_g: 28, fat_g: 16, fiber_g: 5 },
    { id: "d2", name: "Bagel + eggs + ham", calories: 520, protein_g: 30, carbs_g: 42, fat_g: 24, fiber_g: 2 },
    { id: "d3", name: "Broccoli + peas/carrots + protein add on", calories: 360, protein_g: 26, carbs_g: 30, fat_g: 12, fiber_g: 6 }
  ],
  Snacks: [
    { id: "s1", name: "Protein bar", calories: 190, protein_g: 20, carbs_g: 19, fat_g: 6, fiber_g: 2 },
    { id: "s2", name: "Light yogurt", calories: 80, protein_g: 12, carbs_g: 7, fat_g: 0, fiber_g: 0 },
    { id: "s3", name: "Small apple", calories: 55, protein_g: 0, carbs_g: 15, fat_g: 0, fiber_g: 3 }
  ]
}

function cardStyle() {
  return {
    background: "#0d0e1c",
    border: "1px solid #1a1b2e",
    borderRadius: "12px",
    padding: "16px",
    minWidth: "220px"
  }
}

function inputStyle() {
  return {
    background: "#07080e",
    color: "#ced2f0",
    border: "1px solid #1a1b2e",
    borderRadius: "8px",
    padding: "10px",
    width: "100%",
    boxSizing: "border-box"
  }
}

function buttonStyle(active = false) {
  return {
    padding: "8px 12px",
    background: active ? "#4a9ee8" : "#0d0e1c",
    border: "1px solid #1a1b2e",
    borderRadius: "8px",
    color: "#ced2f0",
    cursor: "pointer"
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

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function deriveDailyNutrition(entries) {
  const byDate = {}

  for (const row of entries || []) {
    const date = row.date ?? row.Date
    if (!date) continue

    if (!byDate[date]) {
      byDate[date] = {
        date,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        meal_count: 0,
        meals: []
      }
    }

    byDate[date].calories += toNum(row.calories)
    byDate[date].protein_g += toNum(row.protein_g)
    byDate[date].carbs_g += toNum(row.carbs_g)
    byDate[date].fat_g += toNum(row.fat_g)
    byDate[date].fiber_g += toNum(row.fiber_g)
    byDate[date].meal_count += 1
    byDate[date].meals.push(row)
  }

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

function rollingAverage(rows, key, window = 7) {
  return rows.map((row, i) => {
    const start = Math.max(0, i - window + 1)
    const subset = rows.slice(start, i + 1)
    const vals = subset.map(x => toNum(x[key]))
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    return { ...row, [`${key}_${window}d`]: Number(avg.toFixed(1)) }
  })
}

function projectWeightTrend(weights, nutritionSeries, weeks = 12) {
  if (!weights.length) return []

  const lastWeights = weights.slice(-21)
  if (lastWeights.length < 2) return []

  const first = toNum(lastWeights[0].weight_lb)
  const last = toNum(lastWeights[lastWeights.length - 1].weight_lb)
  const days = Math.max(1, lastWeights.length - 1)
  let weeklySlope = ((last - first) / days) * 7

  if (weeklySlope < -1.5) weeklySlope = -1.5
  if (weeklySlope > 1.5) weeklySlope = 1.5

  const recentNutrition = nutritionSeries.slice(-14)
  const proteinTarget = 140
  const proteinHitRate = recentNutrition.length
    ? recentNutrition.filter(r => toNum(r.protein_g) >= proteinTarget).length / recentNutrition.length
    : 0
  const loggingRate = recentNutrition.length / 14

  const confidence = Math.min(1, Math.max(0.2, (loggingRate * 0.6) + (proteinHitRate * 0.4)))
  const conservativeSlope = weeklySlope * 0.6
  const optimisticSlope = weeklySlope * (0.9 + 0.2 * proteinHitRate)

  const latestDate = lastWeights[lastWeights.length - 1].date
  const latestWeight = toNum(lastWeights[lastWeights.length - 1].weight_lb)
  const baseDate = new Date(`${latestDate}T00:00:00`)

  const out = []
  for (let w = 0; w <= weeks; w += 1) {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + w * 7)
    const date = d.toISOString().slice(0, 10)

    out.push({
      date,
      label: w === 0 ? "Now" : `+${w}w`,
      baseline: Number((latestWeight + weeklySlope * w).toFixed(1)),
      conservative: Number((latestWeight + conservativeSlope * w).toFixed(1)),
      optimistic: Number((latestWeight + optimisticSlope * w).toFixed(1)),
      confidence_pct: Math.round(confidence * 100)
    })
  }

  return out
}

export default function App() {
  const [tab, setTab] = useState("Overview")
  const [rangeKey, setRangeKey] = useState("180D")

  const [daily, setDaily] = useState([])
  const [nutrition, setNutrition] = useState([])
  const [injury, setInjury] = useState([])
  const [dexa, setDexa] = useState([])
  const [error, setError] = useState("")

  const [session, setSession] = useState(null)
  const [email, setEmail] = useState("avidal@ilstu.edu")
  const [authMsg, setAuthMsg] = useState("")
  const [hydrated, setHydrated] = useState(false)

  const [mealEntries, setMealEntries] = useState([])
  const [mealPresets, setMealPresets] = useState(defaultMealPresets)

  const [showMealDialog, setShowMealDialog] = useState(false)
  const [mealDate, setMealDate] = useState(todayISO())
  const [mealTab, setMealTab] = useState("Breakfast")
  const [customMealName, setCustomMealName] = useState("")
  const [customMeal, setCustomMeal] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" })
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [rawNutrition, setRawNutrition] = useState({ breakfast: "", lunch: "", dinner: "", snacks: "" })

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

  useEffect(() => {
    if (!supabase) return

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data?.session ?? null)
    })()

    const sub = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess)
    })

    return () => sub.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setHydrated(false)
    setStoreUser(session?.user?.id || null)

    ;(async () => {
      const storedMeals = await store.get("ufd-meal-entries")
      const storedPresets = await store.get("ufd-meal-presets")
      if (Array.isArray(storedMeals)) setMealEntries(storedMeals)
      if (storedPresets && typeof storedPresets === "object") {
        setMealPresets({ ...defaultMealPresets, ...storedPresets })
      }
      setHydrated(true)
    })()
  }, [session])

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

  const mergedDailyWeights = useMemo(() => {
    return [...daily].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [daily])

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
        label: fmtShortDate(d.date),
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
        const label = date && !String(date).startsWith("scan-") ? String(date).slice(0, 7) : `scan-${idx + 1}`

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
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
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

  const mealDerivedDays = useMemo(() => deriveDailyNutrition(mealEntries), [mealEntries])

  const nutritionSeries = useMemo(() => {
    const staticDays = [...nutrition]
      .map((row, idx) => {
        const date = row.date ?? row.Date ?? `row-${idx + 1}`
        return {
          date,
          calories: toNum(row.calories ?? row.kcal ?? row.energy_kcal ?? row.Calories),
          protein_g: toNum(row.protein_g ?? row.protein ?? row.Protein ?? row.proteingrams),
          carbs_g: toNum(row.carbs_g ?? row.carbs ?? row.Carbs ?? row.carbgrams),
          fat_g: toNum(row.fat_g ?? row.fat ?? row.Fat ?? row.fatgrams),
          fiber_g: toNum(row.fiber_g ?? row.fiber ?? row.Fiber),
          source: "archive"
        }
      })
      .filter(row => row.date)

    const derivedDays = mealDerivedDays.map(row => ({ ...row, source: "cloud_meals" }))

    const map = {}
    staticDays.forEach(row => {
      map[row.date] = row
    })
    derivedDays.forEach(row => {
      map[row.date] = row
    })

    const merged = Object.values(map)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map(row => ({ ...row, label: fmtShortDate(row.date) }))

    const withCalories = rollingAverage(merged, "calories", 7)
    const withProtein = rollingAverage(withCalories, "protein_g", 7)

    return withProtein.map(row => {
      const proteinCal = toNum(row.protein_g) * 4
      const carbsCal = toNum(row.carbs_g) * 4
      const fatCal = toNum(row.fat_g) * 9
      return {
        ...row,
        protein_7d: row.protein_g_7d,
        calories_7d: row.calories_7d,
        protein_pct: row.calories > 0 ? Number(((proteinCal / row.calories) * 100).toFixed(1)) : 0,
        carbs_pct: row.calories > 0 ? Number(((carbsCal / row.calories) * 100).toFixed(1)) : 0,
        fat_pct: row.calories > 0 ? Number(((fatCal / row.calories) * 100).toFixed(1)) : 0
      }
    })
  }, [nutrition, mealDerivedDays])

  const filteredNutrition = useMemo(() => {
    if (!nutritionSeries.length) return []
    if (selectedRangePoints == null) return nutritionSeries
    return nutritionSeries.slice(-selectedRangePoints)
  }, [nutritionSeries, selectedRangePoints])

  const nutritionSummary = useMemo(() => {
    if (!filteredNutrition.length) return null

    const n = filteredNutrition.length
    const proteinTarget = 140
    const avgCalories = filteredNutrition.reduce((sum, row) => sum + toNum(row.calories), 0) / n
    const avgProtein = filteredNutrition.reduce((sum, row) => sum + toNum(row.protein_g), 0) / n
    const avgCarbs = filteredNutrition.reduce((sum, row) => sum + toNum(row.carbs_g), 0) / n
    const avgFat = filteredNutrition.reduce((sum, row) => sum + toNum(row.fat_g), 0) / n
    const proteinHitDays = filteredNutrition.filter(row => toNum(row.protein_g) >= proteinTarget).length
    const cloudDays = filteredNutrition.filter(row => row.source === "cloud_meals").length

    return {
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      proteinTarget,
      proteinHitDays,
      cloudDays
    }
  }, [filteredNutrition])

  const forecastSeries = useMemo(() => {
    return projectWeightTrend(mergedDailyWeights, nutritionSeries, 12)
  }, [mergedDailyWeights, nutritionSeries])

  const forecastOverlay = useMemo(() => {
    const recentWeight = mergedDailyWeights.slice(-28).map(row => ({
      date: row.date,
      label: fmtShortDate(row.date),
      weight_lb: toNum(row.weight_lb)
    }))

    const recentNutrition = nutritionSeries.slice(-28).map(row => ({
      date: row.date,
      label: fmtShortDate(row.date),
      calories_7d: toNum(row.calories_7d),
      protein_7d: toNum(row.protein_7d)
    }))

    const map = {}
    recentWeight.forEach(row => {
      map[row.date] = { date: row.date, label: row.label, weight_lb: row.weight_lb, calories_7d: null, protein_7d: null }
    })
    recentNutrition.forEach(row => {
      if (!map[row.date]) map[row.date] = { date: row.date, label: row.label, weight_lb: null, calories_7d: null, protein_7d: null }
      map[row.date].calories_7d = row.calories_7d
      map[row.date].protein_7d = row.protein_7d
    })

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [mergedDailyWeights, nutritionSeries])

  const sendLink = async () => {
    if (!supabase) {
      setAuthMsg("Supabase env vars are missing.")
      return
    }

    setAuthMsg("")
    const e = String(email || "").trim()
    if (!e.includes("@")) {
      setAuthMsg("Enter a valid email.")
      return
    }

    const redirectTo = window.location.origin + window.location.pathname
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: redirectTo }
    })

    if (authError) setAuthMsg(`Login failed: ${authError.message}`)
    else setAuthMsg("Magic link sent. Open your email and click the link.")
  }

  const doSignOut = async () => {
    if (!supabase) return
    setAuthMsg("")
    const { error: authError } = await supabase.auth.signOut()
    if (authError) setAuthMsg(`Sign out failed: ${authError.message}`)
  }

  async function persistMealEntries(nextEntries) {
    setMealEntries(nextEntries)
    await store.set("ufd-meal-entries", nextEntries)
  }

  async function persistMealPresets(nextPresets) {
    setMealPresets(nextPresets)
    await store.set("ufd-meal-presets", nextPresets)
  }

  async function addPresetMeal(preset) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: mealDate,
      meal_type: mealTab,
      preset_name: preset.name,
      calories: toNum(preset.calories),
      protein_g: toNum(preset.protein_g),
      carbs_g: toNum(preset.carbs_g),
      fat_g: toNum(preset.fat_g),
      fiber_g: toNum(preset.fiber_g),
      notes: "",
      created_at: new Date().toISOString()
    }

    const nextEntries = [...mealEntries, entry].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    await persistMealEntries(nextEntries)
    setShowMealDialog(false)
  }

  async function addCustomMeal() {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: mealDate,
      meal_type: mealTab,
      preset_name: customMealName || "Custom",
      calories: toNum(customMeal.calories),
      protein_g: toNum(customMeal.protein_g),
      carbs_g: toNum(customMeal.carbs_g),
      fat_g: toNum(customMeal.fat_g),
      fiber_g: toNum(customMeal.fiber_g),
      notes: rawNutrition[mealTab.toLowerCase()] || "",
      created_at: new Date().toISOString()
    }

    const nextEntries = [...mealEntries, entry].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    await persistMealEntries(nextEntries)

    if (saveAsPreset && customMealName.trim()) {
      const nextPresets = {
        ...mealPresets,
        [mealTab]: [
          ...(mealPresets[mealTab] || []),
          {
            id: `${mealTab}-${Date.now()}`,
            name: customMealName.trim(),
            calories: toNum(customMeal.calories),
            protein_g: toNum(customMeal.protein_g),
            carbs_g: toNum(customMeal.carbs_g),
            fat_g: toNum(customMeal.fat_g),
            fiber_g: toNum(customMeal.fiber_g)
          }
        ]
      }
      await persistMealPresets(nextPresets)
    }

    setCustomMealName("")
    setCustomMeal({ calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" })
    setSaveAsPreset(false)
    setRawNutrition(prev => ({ ...prev, [mealTab.toLowerCase()]: "" }))
    setShowMealDialog(false)
  }

  async function deleteMealEntry(entryId) {
    const nextEntries = mealEntries.filter(row => row.id !== entryId)
    await persistMealEntries(nextEntries)
  }

  const todayMeals = useMemo(() => {
    return mealEntries
      .filter(row => row.date === mealDate)
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
  }, [mealEntries, mealDate])

  const chartMaxCalories = useMemo(() => {
    if (!filteredNutrition.length) return 2500
    return Math.max(2500, ...filteredNutrition.map(r => toNum(r.calories) + 100))
  }, [filteredNutrition])

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
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: "6px" }}>ANDRÉS FITNESS ARCHIVE</h2>
          {!hydrated && <div style={{ fontSize: "12px", opacity: 0.7 }}>Loading synced data...</div>}
        </div>

        <div style={{ ...cardStyle(), minWidth: "320px", maxWidth: "420px" }}>
          <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Sync</div>
          {session ? (
            <>
              <div style={{ fontSize: "14px", marginBottom: "10px" }}>
                Signed in as <span style={{ color: "#4a9ee8" }}>{session.user.email}</span>
              </div>
              <button onClick={doSignOut} style={buttonStyle(false)}>Sign out</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: "13px", opacity: 0.8, marginBottom: "8px" }}>
                Sign in to sync meal entries and presets across phone and desktop.
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email"
                  style={{ ...inputStyle(), maxWidth: "230px" }}
                />
                <button onClick={sendLink} style={buttonStyle(true)}>Send link</button>
              </div>
            </>
          )}
          {authMsg && <div style={{ marginTop: "8px", fontSize: "12px", color: "#ffd166" }}>{authMsg}</div>}
          {!supabase && <div style={{ marginTop: "8px", fontSize: "12px", color: "#ff8a8a" }}>Supabase env vars not found. Sync is disabled.</div>}
        </div>
      </div>

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
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{latestWeight?.weight_lb ?? "NA"} lb</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>{latestWeight?.date ?? "No date"}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Weight Records</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{daily.length}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Nutrition Days</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutritionSeries.length}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>Latest: {latestNutrition?.date ?? "NA"}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Cloud Meal Entries</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{mealEntries.length}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>Sync-backed phone logging</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            {rangeOptions.map(opt => (
              <button key={opt.key} onClick={() => setRangeKey(opt.key)} style={buttonStyle(rangeKey === opt.key)}>
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Weight Trend ({rangeKey})</div>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={weightSmoothed}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis domain={[120, "dataMax + 2"]} tickCount={6} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="#4a9ee8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="avg" stroke="#ffd166" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "Body Comp" && (
        <div>
          <h3>Body Composition</h3>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Latest DEXA Weight</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{latestDexa ? `${f1(latestDexa.total_lb)} lb` : "NA"}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>{latestDexa?.date ?? "No scan"}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Latest DEXA Body Fat</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{latestDexa?.pct_fat != null ? `${f1(latestDexa.pct_fat)}%` : "NA"}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Lean Mass Anchor</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{latestLeanAnchor != null ? `${f1(latestLeanAnchor)} lb` : "NA"}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>latest DEXA lean mass</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Estimated Current BF%</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{estimatedCurrentBF != null ? `${f1(estimatedCurrentBF)}%` : "NA"}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>from current weight and latest lean anchor</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ ...cardStyle(), minWidth: "0" }}>
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>DEXA Composition by Scan</div>
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
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>DEXA Body Fat %</div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dexaSeries}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[20, "dataMax + 3"]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="pct_fat" stroke="#ffd166" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === "Calories" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h3 style={{ marginTop: 0 }}>Calories</h3>
            <button onClick={() => setShowMealDialog(true)} style={buttonStyle(true)}>Add meal</button>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            {rangeOptions.map(opt => (
              <button key={opt.key} onClick={() => setRangeKey(opt.key)} style={buttonStyle(rangeKey === opt.key)}>
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Nutrition Days</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutritionSeries.length}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>Cloud-derived days: {nutritionSummary?.cloudDays ?? 0}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Avg Calories</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutritionSummary ? Math.round(nutritionSummary.avgCalories) : "NA"}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>over {rangeKey}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Avg Protein</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutritionSummary ? `${Math.round(nutritionSummary.avgProtein)} g` : "NA"}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
                target days: {nutritionSummary ? `${nutritionSummary.proteinHitDays}/${filteredNutrition.length}` : "NA"}
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Avg Carbs / Fat</div>
              <div style={{ fontSize: "20px", fontWeight: "bold" }}>
                {nutritionSummary ? `${Math.round(nutritionSummary.avgCarbs)} g / ${Math.round(nutritionSummary.avgFat)} g` : "NA"}
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Calories Trend ({rangeKey})</div>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={filteredNutrition}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, chartMaxCalories]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="calories" stroke="#4a9ee8" strokeWidth={2} dot={false} name="Calories" />
                <Line type="monotone" dataKey="calories_7d" stroke="#ffd166" strokeWidth={3} dot={false} name="7 day avg" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ ...cardStyle(), minWidth: "0" }}>
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Daily Macros (g)</div>
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
              <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Protein vs Target</div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={filteredNutrition}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="protein_g" name="Protein (g)" fill="#4ae890" />
                  <Line type="monotone" dataKey="protein_7d" stroke="#ffd166" strokeWidth={3} dot={false} name="7 day avg" />
                  <ReferenceLine y={140} stroke="#ff6b9d" strokeDasharray="4 4" label="140g" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Macro Share of Calories (%)</div>
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

          <div style={{ ...cardStyle(), maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Recent Meal Entries ({mealDate})</div>
            {!todayMeals.length ? (
              <div>No synced meal entries for this date.</div>
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {todayMeals.map(row => (
                  <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid #1a1b2e", paddingBottom: "8px" }}>
                    <div>
                      <div><strong>{row.meal_type}</strong>, {row.preset_name}</div>
                      <div style={{ fontSize: "12px", opacity: 0.7 }}>{row.calories} kcal, {row.protein_g} g protein, {row.carbs_g} g carbs, {row.fat_g} g fat</div>
                    </div>
                    <button onClick={() => deleteMealEntry(row.id)} style={{ ...buttonStyle(false), padding: "6px 8px" }}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showMealDialog && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "12px" }}>
              <div style={{ width: "980px", maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "12px", padding: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0 }}>Add Meal</h3>
                  <button onClick={() => setShowMealDialog(false)} style={buttonStyle(false)}>Close</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 260px) 1fr", gap: "16px" }}>
                  <div>
                    <div style={{ ...cardStyle(), marginBottom: "16px", minWidth: 0 }}>
                      <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Date</div>
                      <input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} style={inputStyle()} />
                    </div>

                    <div style={{ ...cardStyle(), minWidth: 0 }}>
                      <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Meal Type</div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {["Breakfast", "Lunch", "Dinner", "Snacks"].map(name => (
                          <button key={name} onClick={() => setMealTab(name)} style={buttonStyle(mealTab === name)}>{name}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ ...cardStyle(), marginBottom: "16px", minWidth: 0 }}>
                      <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Presets, {mealTab}</div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {(mealPresets[mealTab] || []).map(preset => (
                          <button
                            key={preset.id || preset.name}
                            onClick={() => addPresetMeal(preset)}
                            style={{
                              textAlign: "left",
                              background: "#14152a",
                              color: "#ced2f0",
                              border: "1px solid #1a1b2e",
                              borderRadius: "8px",
                              padding: "12px",
                              cursor: "pointer"
                            }}
                          >
                            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{preset.name}</div>
                            <div style={{ fontSize: "12px", opacity: 0.8 }}>{preset.calories} kcal, {preset.protein_g} g protein, {preset.carbs_g} g carbs, {preset.fat_g} g fat</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ ...cardStyle(), minWidth: 0 }}>
                      <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Custom or Raw Entry</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        <input value={customMealName} onChange={e => setCustomMealName(e.target.value)} placeholder="Meal name" style={inputStyle()} />
                        <input value={customMeal.calories} onChange={e => setCustomMeal(prev => ({ ...prev, calories: e.target.value }))} placeholder="Calories" style={inputStyle()} />
                        <input value={customMeal.protein_g} onChange={e => setCustomMeal(prev => ({ ...prev, protein_g: e.target.value }))} placeholder="Protein g" style={inputStyle()} />
                        <input value={customMeal.carbs_g} onChange={e => setCustomMeal(prev => ({ ...prev, carbs_g: e.target.value }))} placeholder="Carbs g" style={inputStyle()} />
                        <input value={customMeal.fat_g} onChange={e => setCustomMeal(prev => ({ ...prev, fat_g: e.target.value }))} placeholder="Fat g" style={inputStyle()} />
                        <input value={customMeal.fiber_g} onChange={e => setCustomMeal(prev => ({ ...prev, fiber_g: e.target.value }))} placeholder="Fiber g" style={inputStyle()} />
                      </div>

                      <div style={{ marginBottom: "10px" }}>
                        <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "6px" }}>Raw note or raw label for this {mealTab.toLowerCase()}</div>
                        <textarea
                          value={rawNutrition[mealTab.toLowerCase()] || ""}
                          onChange={e => setRawNutrition(prev => ({ ...prev, [mealTab.toLowerCase()]: e.target.value }))}
                          placeholder="Example, bagel with cream cheese and two eggs and ham"
                          style={{ ...inputStyle(), minHeight: "70px", resize: "vertical" }}
                        />
                      </div>

                      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "14px" }}>
                        <input type="checkbox" checked={saveAsPreset} onChange={e => setSaveAsPreset(e.target.checked)} />
                        Save this custom meal as a future preset
                      </label>

                      <button onClick={addCustomMeal} style={buttonStyle(true)}>Save custom meal</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "Forecast" && (
        <div>
          <h3>Forecast</h3>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Forecast Basis</div>
              <div style={{ fontSize: "20px", fontWeight: "bold" }}>Recent weight trend</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>weighted by recent nutrition logging and protein adherence</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>7 day Calories</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutritionSeries.length ? Math.round(toNum(nutritionSeries[nutritionSeries.length - 1].calories_7d)) : "NA"}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>7 day Protein</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{nutritionSeries.length ? `${Math.round(toNum(nutritionSeries[nutritionSeries.length - 1].protein_7d))} g` : "NA"}</div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Projection Confidence</div>
              <div style={{ fontSize: "30px", fontWeight: "bold" }}>{forecastSeries.length ? `${forecastSeries[0].confidence_pct}%` : "NA"}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>depends on recent weight and nutrition completeness</div>
            </div>
          </div>

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Combined Recent Trends, Weight with Nutrition</div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={forecastOverlay}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" domain={[120, "dataMax + 5"]} />
                <YAxis yAxisId="right" orientation="right" domain={[0, "dataMax + 200"]} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="weight_lb" stroke="#4a9ee8" strokeWidth={3} dot={false} name="Weight" />
                <Line yAxisId="right" type="monotone" dataKey="calories_7d" stroke="#ffd166" strokeWidth={2} dot={false} name="Calories 7d" />
                <Line yAxisId="right" type="monotone" dataKey="protein_7d" stroke="#4ae890" strokeWidth={2} dot={false} name="Protein 7d" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div style={{ ...cardStyle(), maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>12 Week Trend Projection</div>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={forecastSeries}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis domain={[120, "dataMax + 4"]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="baseline" stroke="#4a9ee8" strokeWidth={3} dot={false} name="Baseline trend" />
                <Line type="monotone" dataKey="optimistic" stroke="#4ae890" strokeWidth={2} dot={false} name="Optimistic" />
                <Line type="monotone" dataKey="conservative" stroke="#e8c94a" strokeWidth={2} dot={false} name="Conservative" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "Injury" && (
        <div>
          <h3>Injury Log</h3>
          <div>Injury entries loaded: {injury.length}</div>
          <div style={{ marginTop: "10px" }}>Latest injury date: {latestInjury?.date ?? "NA"}</div>
        </div>
      )}

      {tab !== "Overview" && tab !== "Body Comp" && tab !== "Calories" && tab !== "Injury" && tab !== "Forecast" && (
        <div>
          <h3>{tab}</h3>
          <div>This tab is next.</div>
        </div>
      )}
    </div>
  )
}
