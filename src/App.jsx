import React, { useState, useEffect, useMemo, useCallback } from "react"
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
  "ufd-meal-presets",
  "wt-log",
  "wt-sessions",
  "ufd-workouts"
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
  { key: "30D",  label: "30 days",  points: 30  },
  { key: "90D",  label: "90 days",  points: 90  },
  { key: "180D", label: "6 months", points: 180 },
  { key: "1Y",   label: "1 year",   points: 365 },
  { key: "ALL",  label: "All",      points: null }
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
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
const SDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const SMETA = {
  Mon: { label: "Monday", theme: "Upper Push", venue: "YMCA", color: "#d97706" },
  Tue: { label: "Tuesday", theme: "Legs", venue: "KNR", color: "#3b82f6" },
  Wed: { label: "Wednesday", theme: "Shoulder & Arms", venue: "YMCA", color: "#d97706" },
  Thu: { label: "Thursday", theme: "Back / Biceps", venue: "KNR", color: "#3b82f6" },
  Fri: { label: "Friday", theme: "Hips / Upper + Swim", venue: "KNR", color: "#3b82f6" },
  Sat: { label: "Saturday", theme: "Hip Legs + Long Run", venue: "YMCA", color: "#d97706" },
  Sun: { label: "Sunday", theme: "Rest / Easy Swim", venue: "—", color: "#444" }
}

const mk = (r, w) => ({ r: String(r), w: String(w) })

const PLAN = {
Mon: {
  cardio: "Speed run, 20 to 30 min, Zone 3 to 4, easy jog warm-up 5 min first",
  warmup: [],
  topNote: null,
  sections: [
    {
      h: "A, Push Primary",
      ex: [
        { id: "m1", name: "Chest Press", sub: "Technogym machine", def: [mk(6,110), mk(6,110), mk(6,110)], note: "2-0-2 tempo, full ROM" },
        { id: "m2", name: "Incline Press", sub: "DB incline / Smith low angle", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Low incline, shoulder-safe" }
      ]
    },
    {
      h: "B, Shoulder",
      ex: [
        { id: "m3", name: "Face Pull / ER", sub: "Cable or resistance band", def: [mk(12,"—"), mk(12,"—"), mk(12,"—")], note: "Rear delt and cuff" },
        { id: "m4", name: "Shoulder Press", sub: "Technogym / DB", def: [mk(10,"—"), mk(10,"—")], note: "Neutral grip if neck tight" }
      ]
    },
    {
      h: "C, Triceps",
      ex: [
        { id: "m5", name: "Triceps Overhead", sub: "Cable / 30 lb DB", def: [mk(10,30), mk(10,30)], note: "Full stretch at top" },
        { id: "m6", name: "Triceps Pushdown", sub: "Cable pressdown", def: [mk(10,35), mk(10,35), mk(10,35)], note: "Elbows fixed" }
      ]
    }
  ]
},

  Tue: {
  cardio: null,
  warmup: [
    "Stationary bike 5 to 10 min",
    "Standing calf raises 2x8 off step",
    "Bodyweight squat 2x8",
    "Ankle inversion and dorsiflexion 2x10",
    "Towel scrunches 5 sets"
  ],
  topNote: null,
  sections: [
    {
      h: "Glutes / Hips",
      ex: [
        { id: "t1", name: "Hip Thrust", sub: "Machine or Smith bar", def: [mk(10,115), mk(10,135), mk(10,165)], note: "Pause at top" }
      ]
    },
    {
      h: "Quads / Posterior Chain",
      ex: [
        { id: "t2", name: "Leg Press, Heel Drive", sub: "Machine", def: [mk(15,160), mk(15,160), mk(15,160)], note: "Endurance mode" },
        { id: "t3", name: "KB RDL", sub: "Kettlebell", def: [mk(10,50), mk(10,50), mk(10,50)], note: "Hinge not squat" },
        { id: "t6", name: "Leg Curl", sub: "Machine", def: [mk(10,100), mk(10,100), mk(10,100)], note: "Slow lower" },
        { id: "t7", name: "Leg Extension", sub: "Machine", def: [mk(10,80), mk(10,80), mk(10,80)], note: "Controlled" }
      ]
    },
    {
      h: "Hip Stability",
      ex: [
        { id: "t4", name: "Lateral Band Walk", sub: "Green band", def: [mk("2 laps","band"), mk("2 laps","band")], note: "Maintain tension" },
        { id: "t5", name: "Monster Walk", sub: "Green band", def: [mk("2 laps","band"), mk("2 laps","band")], note: "Forward / diagonal" }
      ]
    },
    {
      h: "Core",
      ex: [
        { id: "t8", name: "Marches w/ Band", sub: "3x10 each side", def: [mk("10e","band"), mk("10e","band"), mk("10e","band")], note: "Pelvic neutral" },
        { id: "t9", name: "90/90 Bicycle", sub: "3x30 sec", def: [mk("30s","BW"), mk("30s","BW"), mk("30s","BW")], note: "Slow and controlled" }
      ]
    }
  ]
},

  Wed: {
  cardio: "Easy run, 30 min, Zone 2, conversational pace, run before lifting",
  warmup: [],
  topNote: null,
  sections: [
    {
      h: "Rear / Side Delt",
      ex: [
        { id: "w1", name: "Rear Delt Fly", sub: "Reverse pec deck / cable", def: [mk(12,7), mk(12,7), mk(12,7)], note: "Perfect control" },
        { id: "w2", name: "Lateral Raise", sub: "Cable / DB", def: [mk(12,"—"), mk(12,"—"), mk(12,"—"), mk(12,"—")], note: "No swing" }
      ]
    },
    {
      h: "Shoulder Health",
      ex: [
        { id: "w3", name: "Face Pull / ER", sub: "Cable / band", def: [mk(12,"—"), mk(12,"—")], note: "Skip if done Monday" }
      ]
    },
    {
      h: "Triceps",
      ex: [
        { id: "w4", name: "Triceps Pushdown", sub: "Cable pressdown", def: [mk(10,35), mk(10,35), mk(10,35)], note: "2-0-2 tempo" }
      ]
    }
  ]
},

  Thu: {
  cardio: null,
  warmup: [
    "Cable shoulder ER/IR 2x10",
    "Banded X's 2x8 each side",
    "Arm circles 2x30 sec"
  ],
  topNote: "KNR Day 4, confirm exact movements and loads with your kinesiologist each session.",
  sections: [
    {
      h: "Back Primary",
      ex: [
        { id: "th1", name: "Lat Pulldown", sub: "Machine or cable", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Elbows to ribs" },
        { id: "th2", name: "Seated Row", sub: "Cable", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Scap retraction" },
        { id: "th3", name: "Chest-Supported Row", sub: "Machine or incline DB", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Chest on pad" }
      ]
    },
    {
      h: "Biceps",
      ex: [
        { id: "th4", name: "Biceps Curl", sub: "Cable or DB", def: [mk(10,25), mk(10,25), mk(10,25)], note: "No sway" },
        { id: "th5", name: "Hammer Curl", sub: "DB alternating", def: [mk(10,"—"), mk(10,"—")], note: "Neutral grip" }
      ]
    }
  ]
},

Fri: {
  cardio: "Swim, 1000 m, no backstroke, pull buoy or fins if toe irritated",
  warmup: [
    "Cat/Cows 10 slow",
    "Glute Bridges 2x10",
    "Hip CARs 8 each side",
    "Arm circles 2x30 sec"
  ],
  topNote: null,
  sections: [
    {
      h: "Hip",
      ex: [
        { id: "f1", name: "Hip Abduction", sub: "Abductor machine", def: [mk(10,100), mk(10,100), mk(10,100)], note: "Controlled return" },
        { id: "f2", name: "Hip Adduction", sub: "Adductor machine", def: [mk(10,60), mk(10,60), mk(10,60)], note: "Pelvic control" },
        { id: "f3", name: "KB Swing", sub: "Kettlebell", def: [mk(10,25), mk(10,25), mk(10,25)], note: "Power from glutes" }
      ]
    },
    {
      h: "Anti-rotation Core",
      ex: [
        { id: "f4", name: "Pallof Press", sub: "Cable", def: [mk("10e",30), mk("10e",30), mk("10e",30)], note: "No rotation" }
      ]
    },
    {
      h: "Shoulder Health",
      ex: [
        { id: "f5", name: "Shoulder Clock w/ Band", sub: "Band", def: [mk("5e","band"), mk("5e","band"), mk("5e","band")], note: "Light only" }
      ]
    },
    {
      h: "Core",
      ex: [
        { id: "f6", name: "Russian Twists", sub: "3x30 sec", def: [mk("30s","BW"), mk("30s","BW"), mk("30s","BW")], note: "Controlled" }
      ]
    }
  ]
},

Sat: {
  cardio: "Long easy run, 45 to 60 min, Zone 2, conversational, run before lifting",
  warmup: [],
  topNote: null,
  sections: [
    {
      h: "A, Calf / Ankle",
      ex: [
        { id: "s1", name: "Seated Calf Raise", sub: "Machine or seated DB", def: [mk(12,"—"), mk(12,"—"), mk(12,"—"), mk(12,"—")], note: "Soleus focus" },
        { id: "s2", name: "Single-Leg Calf Raise", sub: "DB or BW", def: [mk("10/leg","BW"), mk("10/leg","BW"), mk("10/leg","BW")], note: "3-count lower" },
        { id: "s3", name: "Tibialis Raise", sub: "Wall shin raises", def: [mk(15,"BW"), mk(15,"BW"), mk(15,"BW")], note: "Toes up" }
      ]
    },
    {
      h: "B, Hip-Dominant Posterior Chain",
      ex: [
        { id: "s4", name: "Romanian Deadlift", sub: "DB or barbell", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Flat back" },
        { id: "s5", name: "Hamstring Eccentric Curl", sub: "Leg curl", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "4 sec lowering" },
        { id: "s6", name: "Hip Thrust", sub: "Machine or Smith", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Lighter than Tue" }
      ]
    },
    {
      h: "C, Hip Stability / Core",
      ex: [
        { id: "s7", name: "Adductor Machine", sub: "Inner thigh", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Progress slowly" },
        { id: "s8", name: "Pallof Press", sub: "Cable anti-rotation", def: [mk(10,"—"), mk(10,"—"), mk(10,"—")], note: "Brace" }
      ]
    }
  ]
},

Sun: {
  cardio: "Rest or easy swim, optional 20 to 30 min, no resistance training today",
  warmup: [],
  topNote: null,
  sections: []
  }
}

const defaultForDay = d => {
  const o = {}
  ;(PLAN[d]?.sections || []).forEach(s => s.ex.forEach(e => {
    o[e.id] = e.def.map(x => ({ ...x }))
  }))
  return o
}

const todayDayKey = () => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()]

const SDAY_TYPES = {
  Mon: ["Running", "Traditional Strength Training"],
  Tue: ["Traditional Strength Training"],
  Wed: ["Running", "Traditional Strength Training"],
  Thu: ["Traditional Strength Training"],
  Fri: ["Swimming", "Functional Strength Training"],
  Sat: ["Running", "Traditional Strength Training"],
  Sun: []
}

const fmtDateTime = iso => {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " , " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

function WarmupRow({ text }) {
  const [done, setDone] = useState(false)

  return (
    <div
      onClick={() => setDone(v => !v)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "4px 0",
        cursor: "pointer",
        fontSize: "12px",
        color: done ? "#444" : "#888",
        textDecoration: done ? "line-through" : "none"
      }}
    >
      <div
        style={{
          width: "14px",
          height: "14px",
          border: "1px solid #333",
          borderRadius: "3px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: done ? "#1e3a1e" : "transparent"
        }}
      >
        {done && <span style={{ fontSize: "9px", color: "#4a8" }}>✓</span>}
      </div>
      {text}
    </div>
  )
}

function ExCard({ ex, setData, onUpdate, onAdd, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: "8px", marginBottom: "7px", overflow: "hidden" }}>
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 12px 8px", cursor: "pointer" }}
      >
        <div>
          <div style={{ fontSize: "15px", fontWeight: "700", color: "#e0e0e0" }}>{ex.name}</div>
          <div style={{ fontSize: "11px", color: "#3a3a3a", marginTop: "1px" }}>{ex.sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <div style={{ fontSize: "11px", color: "#444", textAlign: "right", maxWidth: "180px", fontStyle: "italic", lineHeight: 1.35 }}>{ex.note}</div>
          <div style={{ color: "#333", fontSize: "12px", marginTop: "1px" }}>{collapsed ? "▸" : "▾"}</div>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 12px 10px", borderTop: "1px solid #161616" }}>
          <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 14px 1fr 22px", gap: "4px", padding: "8px 0 4px" }}>
            {["SET", "REPS", "", "LOAD", ""].map((h, i) => (
              <div key={i} style={{ fontSize: "9px", letterSpacing: "0.14em", color: "#333", textAlign: "center" }}>{h}</div>
            ))}
          </div>

          {setData.map((s, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr 14px 1fr 22px", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
              <div style={{ fontSize: "10px", color: "#3a3a3a", textAlign: "center" }}>S{i + 1}</div>

              <input
                type="text"
                value={s.r}
                onChange={e => onUpdate(i, "r", e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ background: "#161616", border: "1px solid #242424", borderRadius: "4px", color: "#e0e0e0", fontSize: "12px", padding: "4px 6px", textAlign: "center", width: "100%" }}
              />

              <div style={{ textAlign: "center", fontSize: "10px", color: "#333" }}>@</div>

              <input
                type="text"
                value={s.w}
                onChange={e => onUpdate(i, "w", e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ background: "#161616", border: "1px solid #242424", borderRadius: "4px", color: "#e0e0e0", fontSize: "12px", padding: "4px 6px", textAlign: "center", width: "100%" }}
              />

              <button
                onClick={e => { e.stopPropagation(); onRemove(i) }}
                style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "13px", padding: 0, visibility: setData.length > 1 ? "visible" : "hidden" }}
              >
                ×
              </button>
            </div>
          ))}

          <button
            onClick={e => { e.stopPropagation(); onAdd() }}
            style={{ marginTop: "4px", width: "100%", background: "none", border: "1px dashed #1e1e1e", borderRadius: "4px", color: "#333", fontSize: "10px", padding: "4px 0", cursor: "pointer" }}
          >
            + add set
          </button>
        </div>
      )}
    </div>
  )
}

function ScheduleLogView({ log, expanded, setExpanded, onDelete, onEdit }) {
  const toggle = id => setExpanded(p => ({ ...p, [id]: !p[id] }))

  if (!log.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#2e2e2e" }}>
        <div style={{ fontSize: "28px", fontWeight: "700" }}>No sessions logged yet</div>
        <div style={{ fontSize: "13px", color: "#333", marginTop: "10px" }}>Complete a session and press Log Session.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#333", textTransform: "uppercase", marginBottom: "14px" }}>
        Session History , {log.length} {log.length === 1 ? "entry" : "entries"}
      </div>

      {log.map(entry => {
        const m = SMETA[entry.day]
        const allEx = []
        ;(PLAN[entry.day]?.sections || []).forEach(sec => sec.ex.forEach(ex => {
          if (entry.data[ex.id]) allEx.push({ ex, sets: entry.data[ex.id] })
        }))

        const open = expanded[entry.id]

        return (
          <div key={entry.id} style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderLeft: `3px solid ${m.color}`, borderRadius: "8px", marginBottom: "10px", overflow: "hidden" }}>
            <div onClick={() => toggle(entry.id)} style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#d0d0d0" }}>
                  {entry.dayLabel} <span style={{ color: m.color }}>{entry.theme}</span>
                  <span style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", background: m.venue === "KNR" ? "#0d1f38" : "#1e1200", color: m.venue === "KNR" ? "#3b82f6" : "#d97706", padding: "2px 7px", borderRadius: "3px", marginLeft: "8px" }}>{m.venue}</span>
                </div>
                <div style={{ fontSize: "10px", color: "#3a3a3a", marginTop: "3px" }}>{fmtDateTime(entry.date)}</div>
              </div>

              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button onClick={e => { e.stopPropagation(); onEdit(entry.id) }} style={{ background: "none", border: "1px solid #222", borderRadius: "4px", color: "#555", fontSize: "10px", padding: "4px 10px", cursor: "pointer" }}>Edit</button>
                <button onClick={e => { e.stopPropagation(); onDelete(entry.id) }} style={{ background: "none", border: "1px solid #1e1e1e", borderRadius: "4px", color: "#3a3a3a", fontSize: "10px", padding: "4px 10px", cursor: "pointer" }}>Delete</button>
                <span style={{ color: "#333", fontSize: "12px", marginLeft: "4px" }}>{open ? "▴" : "▾"}</span>
              </div>
            </div>

{open && (
  <div style={{ padding: "10px 14px 14px", borderTop: "1px solid #161616" }}>
    {entry.cardio && (
      <div style={{ marginBottom: "10px", padding: "8px 10px", background: "#101622", border: "1px solid #1a2a44", borderRadius: "6px", fontSize: "11px", color: "#9ec5ff" }}>
        <strong>{entry.cardio.type}</strong>
        {entry.cardio.distance != null && <> , distance: {entry.cardio.distance}</>}
        {entry.cardio.duration != null && <> , duration: {entry.cardio.duration} min</>}
        {entry.cardio.calories != null && <> , calories: {entry.cardio.calories}</>}
        {entry.cardio.avg_hr != null && <> , avg HR: {entry.cardio.avg_hr}</>}
        {entry.cardio.notes && <div style={{ marginTop: "4px", color: "#7f93b8" }}>{entry.cardio.notes}</div>}
      </div>
    )}

    {allEx.length === 0 && (!entry.customExercises || entry.customExercises.length === 0) && <div style={{ fontSize: "12px", color: "#333" }}>No exercise data recorded.</div>}
    {allEx.map(({ ex, sets }) => (
                  <div key={ex.id} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "3px 0", borderBottom: "1px solid #121212" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#a0a0a0", minWidth: "190px" }}>{ex.name}</span>
                    <span style={{ fontSize: "11px", color: "#444" }}>
                      {sets.map((s, i) => (
                        <span key={i}>
                          {i > 0 && <span style={{ color: "#2a2a2a" }}> · </span>}
                          <span style={{ color: "#c0c0c0" }}>{s.r}</span>
                          <span style={{ color: "#333" }}>@</span>
                          <span style={{ color: "#888" }}>{s.w}</span>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
    {(entry.customExercises || []).map(ex => (
      <div key={ex.id} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "3px 0", borderBottom: "1px solid #121212" }}>
        <span style={{ fontSize: "13px", fontWeight: "600", color: "#7a7aaa", minWidth: "190px" }}>{ex.name} {ex.note && <span style={{ fontSize: "10px", color: "#3a3a5a", fontStyle: "italic" }}>{ex.note}</span>}</span>
        <span style={{ fontSize: "11px", color: "#444" }}>
          {(ex.sets || []).map((s, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: "#2a2a2a" }}> · </span>}
              <span style={{ color: "#9090c0" }}>{s.r}</span>
              <span style={{ color: "#333" }}>@</span>
              <span style={{ color: "#6060a0" }}>{s.w}</span>
            </span>
          ))}
        </span>
      </div>
    ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TabSchedule({ storedWorkouts, setStoredWorkouts, session }) {
  const [activeDay, setActiveDay] = useState(todayDayKey())
  const [schedView, setSchedView] = useState("schedule")
  const [sessions, setSessions] = useState(() => {
    const o = {}
    SDAYS.forEach(d => { o[d] = defaultForDay(d) })
    return o
  })
  const [schedLog, setSchedLog] = useState([])
  const [undo, setUndo] = useState(null)
  const [expandedLog, setExpandedLog] = useState({})
const [sessionDate, setSessionDate] = useState(todayISO())
const [sessionTime, setSessionTime] = useState("")
const [sessionDur, setSessionDur] = useState("")
const [toast, setToast] = useState(null)

const [cardioType, setCardioType] = useState("")
const [cardioDistance, setCardioDistance] = useState("")
const [cardioCalories, setCardioCalories] = useState("")
const [cardioAvgHr, setCardioAvgHr] = useState("")
const [cardioNotes, setCardioNotes] = useState("")

// Custom (free-text) exercises per day
const [customExsByDay, setCustomExsByDay] = useState({})

// Form state for adding a new custom exercise
const [newExName, setNewExName] = useState("")
const [newExSets, setNewExSets] = useState("3")
const [newExReps, setNewExReps] = useState("10")
const [newExWeight, setNewExWeight] = useState("")
const [newExNote, setNewExNote] = useState("")

const customExs = customExsByDay[activeDay] || []

const addCustomEx = () => {
  const name = newExName.trim()
  if (!name) return
  const sets = Math.max(1, Math.min(10, parseInt(newExSets) || 3))
  const setData = Array.from({ length: sets }, () => ({
    r: newExReps.trim() || "10",
    w: newExWeight.trim() || "—"
  }))
  const entry = { id: `cx-${Date.now()}`, name, note: newExNote.trim(), sets: setData }
  setCustomExsByDay(prev => ({
    ...prev,
    [activeDay]: [...(prev[activeDay] || []), entry]
  }))
  setNewExName(""); setNewExSets("3"); setNewExReps("10"); setNewExWeight(""); setNewExNote("")
}

const updateCustomSet = (exId, si, field, val) => {
  setCustomExsByDay(prev => {
    const arr = (prev[activeDay] || []).map(ex => {
      if (ex.id !== exId) return ex
      const sets = ex.sets.map((s, i) => i === si ? { ...s, [field]: val } : s)
      return { ...ex, sets }
    })
    return { ...prev, [activeDay]: arr }
  })
}

const addCustomSet = exId => {
  setCustomExsByDay(prev => {
    const arr = (prev[activeDay] || []).map(ex => {
      if (ex.id !== exId) return ex
      const last = ex.sets[ex.sets.length - 1] || { r: "10", w: "—" }
      return { ...ex, sets: [...ex.sets, { ...last }] }
    })
    return { ...prev, [activeDay]: arr }
  })
}

const removeCustomSet = (exId, si) => {
  setCustomExsByDay(prev => {
    const arr = (prev[activeDay] || []).map(ex => {
      if (ex.id !== exId) return ex
      if (ex.sets.length <= 1) return ex
      return { ...ex, sets: ex.sets.filter((_, i) => i !== si) }
    })
    return { ...prev, [activeDay]: arr }
  })
}

const removeCustomEx = exId => {
  setCustomExsByDay(prev => ({
    ...prev,
    [activeDay]: (prev[activeDay] || []).filter(ex => ex.id !== exId)
  }))
}
 const saveScheduleKey = async (key, value) => {
  await store.set(key, value)

  

  if (!supabase || !session?.user?.id) return



  const { error } = await supabase
    .from("user_kv")
    .upsert(
      {
        user_id: session.user.id,
        key,
        value,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,key" }
    )

  if (error) {
    console.error(`Failed to sync ${key}:`, error)
  }
}

  useEffect(() => {
  ;(async () => {
    const lg = await store.get("wt-log")
    const ss = await store.get("wt-sessions")

    if (Array.isArray(lg)) setSchedLog(lg)

    if (ss && typeof ss === "object") {
      setSessions(prev => {
        const next = { ...prev }
        SDAYS.forEach(d => {
          if (ss[d]) next[d] = { ...prev[d], ...ss[d] }
        })
        return next
      })
    }
  })()
}, [session?.user?.id])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const updateSet = (day, exId, si, field, val) => {
    setSessions(prev => {
      const d = { ...prev[day] }
      const sets = [...(d[exId] || [])]
      sets[si] = { ...sets[si], [field]: val }
      d[exId] = sets
      return { ...prev, [day]: d }
    })
  }

  const addSet = (day, exId) => {
    setSessions(prev => {
      const d = { ...prev[day] }
      const sets = [...(d[exId] || [])]
      const last = sets[sets.length - 1] || { r: "—", w: "—" }
      sets.push({ ...last })
      d[exId] = sets
      return { ...prev, [day]: d }
    })
  }

  const removeSet = (day, exId, si) => {
    setSessions(prev => {
      const d = { ...prev[day] }
      const sets = [...(d[exId] || [])]
      if (sets.length <= 1) return prev
      sets.splice(si, 1)
      d[exId] = sets
      return { ...prev, [day]: d }
    })
  }

  const resetDay = day => {
    setSessions(prev => ({ ...prev, [day]: defaultForDay(day) }))
    showToast("Reset to defaults")
  }

  const saveSession = async () => {
    const dateStr = sessionDate || todayISO()
    const isoNow = dateStr + "T12:00:00.000Z"

const entry = {
  id: Date.now(),
  date: isoNow,
  sessionDate: dateStr,
  sessionTime: sessionTime || "",
  dateTime: sessionTime ? `${dateStr}T${sessionTime}` : dateStr,
  day: activeDay,
  dayLabel: SMETA[activeDay].label,
  theme: SMETA[activeDay].theme,
  venue: SMETA[activeDay].venue,
  data: JSON.parse(JSON.stringify(sessions[activeDay])),
  customExercises: JSON.parse(JSON.stringify(customExs)),
  cardio: cardioType
    ? {
        type: cardioType,
        distance: cardioDistance ? Number(cardioDistance) : null,
        duration: sessionDur ? Number(sessionDur) : null,
        calories: cardioCalories ? Number(cardioCalories) : null,
        avg_hr: cardioAvgHr ? Number(cardioAvgHr) : null,
        notes: cardioNotes || ""
      }
    : null
}

    const newLog = [entry, ...schedLog]
    setSchedLog(newLog)

    const types = SDAY_TYPES[activeDay] || []
    const summaryIds = types.map((_, i) => entry.id + i)

const summaryEntries = types.map((type, i) => ({
  id: summaryIds[i],
  date: dateStr,
  time: sessionTime || "",
  dateTime: sessionTime ? `${dateStr}T${sessionTime}` : dateStr,
  type,
  dur: sessionDur ? parseInt(sessionDur) : 0,
  hr: cardioAvgHr ? Number(cardioAvgHr) : null,
  distance: cardioDistance ? Number(cardioDistance) : null,
  calories: cardioCalories ? Number(cardioCalories) : null,
  notes: cardioNotes
    ? `from Schedule , ${SMETA[activeDay].theme} , ${cardioNotes}`
    : `from Schedule , ${SMETA[activeDay].theme}`,
  _scheduleId: entry.id
}))

if (summaryEntries.length > 0) {
  const existing = await store.get("ufd-workouts") || storedWorkouts
const merged = [...(Array.isArray(existing) ? existing : []), ...summaryEntries]
  .sort((a, b) =>
    String(a.dateTime || a.date || "").localeCompare(String(b.dateTime || b.date || ""))
  )

  setStoredWorkouts(merged)
  await saveScheduleKey("ufd-workouts", merged)
}

setUndo(entry)
await saveScheduleKey("wt-log", newLog)
await saveScheduleKey("wt-sessions", sessions)
setCardioType("")
setCardioDistance("")
setCardioCalories("")
setCardioAvgHr("")
setCardioNotes("")
setCustomExsByDay(prev => ({ ...prev, [activeDay]: [] }))
showToast("Session saved")
  }

  const undoSave = async () => {
    if (!undo) return

    const newLog = schedLog.filter(e => e.id !== undo.id)
    setSchedLog(newLog)

    const newWorkouts = storedWorkouts.filter(w => w._scheduleId !== undo.id)
    setStoredWorkouts(newWorkouts)

setUndo(null)
await saveScheduleKey("wt-log", newLog)
await saveScheduleKey("ufd-workouts", newWorkouts)
showToast("Entry removed")
  }

  const deleteEntry = async id => {
  const newLog = schedLog.filter(e => e.id !== id)
setSchedLog(newLog)
await saveScheduleKey("wt-log", newLog)
showToast("Entry deleted")
  }

  const editEntry = id => {
    const entry = schedLog.find(e => e.id === id)
    if (!entry) return

    setSessions(prev => ({ ...prev, [entry.day]: JSON.parse(JSON.stringify(entry.data)) }))
    const newLog = schedLog.filter(e => e.id !== id)
    setSchedLog(newLog)
   saveScheduleKey("wt-log", newLog)
    setActiveDay(entry.day)
    setSchedView("schedule")
    showToast(`Loaded ${entry.dayLabel} for editing`)
  }

  const plan = PLAN[activeDay]
  const meta = SMETA[activeDay]
  const dayData = sessions[activeDay] || {}
  const isRest = plan.sections.length === 0

  return (
    <div style={{ color: "#d8d8d8", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "3px", background: "#0a0a0a", borderRadius: "8px", padding: "4px", border: "1px solid #1a1a1a", flexWrap: "wrap" }}>
          {SDAYS.map(d => {
            const m = SMETA[d]
            const active = d === activeDay && schedView === "schedule"

            return (
              <button
                key={d}
                onClick={() => { setActiveDay(d); setSchedView("schedule") }}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  cursor: "pointer",
                  background: active ? m.color + "22" : "transparent",
                  fontSize: "12px",
                  fontWeight: active ? "700" : "500",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: active ? m.color : "#3a3a3a",
                  borderRadius: "6px"
                }}
              >
                {d}
                <div style={{ fontSize: "8px", opacity: 0.7, marginTop: "1px", color: m.venue === "KNR" ? "#3b82f6" : m.venue === "—" ? "#333" : "#d97706" }}>{m.venue}</div>
              </button>
            )
          })}
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={() => setSchedView(v => v === "log" ? "schedule" : "log")} style={buttonStyle(false)}>
            {schedView === "log" ? "◀ Schedule" : `Log (${schedLog.length})`}
          </button>
          {schedView === "schedule" && <button onClick={() => resetDay(activeDay)} style={buttonStyle(false)}>Reset</button>}
        </div>
      </div>

      {schedView === "log" && (
        <ScheduleLogView
          log={schedLog}
          expanded={expandedLog}
          setExpanded={setExpandedLog}
          onDelete={deleteEntry}
          onEdit={editEntry}
        />
      )}

      {schedView === "schedule" && (
        <>
          <div style={{ marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid #1a1a1a" }}>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#e8e8e8", lineHeight: 1 }}>
              {meta.label}
              <span style={{ fontSize: "14px", fontWeight: "600", color: meta.color, marginLeft: "8px" }}>{meta.theme}</span>
              <span style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.12em", background: meta.venue === "KNR" ? "#0d1f38" : meta.venue === "—" ? "#151515" : "#1e1200", color: meta.venue === "KNR" ? "#3b82f6" : meta.venue === "—" ? "#444" : "#d97706", padding: "2px 7px", borderRadius: "3px", marginLeft: "8px" }}>{meta.venue}</span>
            </div>
          </div>

          {plan.cardio && (
            <div style={{ background: "#111", border: "1px solid #1a1a1a", borderLeft: `3px solid ${meta.color}`, borderRadius: "8px", padding: "11px 14px", marginBottom: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "0.18em", color: "#444", textTransform: "uppercase", marginBottom: "7px" }}>Cardio</div>
              <div style={{ fontSize: "12px", color: "#aaa", lineHeight: 1.6 }}>{plan.cardio}</div>
            </div>
          )}

          {plan.warmup.length > 0 && (
            <div style={{ background: "#111", border: "1px solid #1a1a1a", borderLeft: "3px solid #444", borderRadius: "8px", padding: "11px 14px", marginBottom: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "0.18em", color: "#444", textTransform: "uppercase", marginBottom: "7px" }}>Warm-Up</div>
              {plan.warmup.map((w, i) => <WarmupRow key={i} text={w} />)}
            </div>
          )}

          {plan.topNote && (
            <div style={{ background: "#1a1200", border: "1px solid #3a2800", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#c08a30", lineHeight: 1.5 }}>
              {plan.topNote}
            </div>
          )}

          {isRest && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#2e2e2e" }}>
              <div style={{ fontSize: "36px", fontWeight: "800", letterSpacing: "0.1em" }}>REST</div>
              <div style={{ fontSize: "13px", color: "#333", marginTop: "10px" }}>Recovery is adaptation. Sleep well. Walk. Stretch.</div>
            </div>
          )}

          {plan.sections.map((sec, si) => (
            <div key={si} style={{ marginBottom: "6px" }}>
              <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase", color: "#333", padding: "8px 2px 6px", borderBottom: "1px solid #161616", marginBottom: "8px" }}>{sec.h}</div>
              {sec.ex.map(ex => {
                const setData = dayData[ex.id] || ex.def
                return (
                  <ExCard
                    key={ex.id}
                    ex={ex}
                    setData={setData}
                    onUpdate={(si, f, v) => updateSet(activeDay, ex.id, si, f, v)}
                    onAdd={() => addSet(activeDay, ex.id)}
                    onRemove={si => removeSet(activeDay, ex.id, si)}
                  />
                )
              })}
            </div>
          ))}

          {/* Custom (free-text) exercises for this day */}
          {(customExs.length > 0 || !isRest) && (
            <div style={{ marginBottom: "6px" }}>
              <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase", color: "#333", padding: "8px 2px 6px", borderBottom: "1px solid #161616", marginBottom: "8px" }}>
                Additional Exercises
              </div>

              {customExs.map(ex => (
                <div key={ex.id} style={{ background: "#111", border: "1px solid #1a1a1a", borderLeft: "3px solid #2a2a3a", borderRadius: "8px", marginBottom: "7px", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#e0e0e0" }}>{ex.name}</div>
                      {ex.note && <div style={{ fontSize: "11px", color: "#3a3a3a", fontStyle: "italic" }}>{ex.note}</div>}
                    </div>
                    <button onClick={() => removeCustomEx(ex.id)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "16px", padding: "0 4px" }}>×</button>
                  </div>
                  <div style={{ padding: "0 12px 10px", borderTop: "1px solid #161616" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 14px 1fr 22px", gap: "4px", padding: "8px 0 4px" }}>
                      {["SET", "REPS", "", "LOAD", ""].map((h, i) => (
                        <div key={i} style={{ fontSize: "9px", letterSpacing: "0.14em", color: "#333", textAlign: "center" }}>{h}</div>
                      ))}
                    </div>
                    {ex.sets.map((s, si) => (
                      <div key={si} style={{ display: "grid", gridTemplateColumns: "26px 1fr 14px 1fr 22px", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ fontSize: "10px", color: "#3a3a3a", textAlign: "center" }}>S{si + 1}</div>
                        <input type="text" value={s.r} onChange={e => updateCustomSet(ex.id, si, "r", e.target.value)}
                          style={{ background: "#161616", border: "1px solid #242424", borderRadius: "4px", color: "#e0e0e0", fontSize: "12px", padding: "4px 6px", textAlign: "center", width: "100%" }} />
                        <div style={{ textAlign: "center", fontSize: "10px", color: "#333" }}>@</div>
                        <input type="text" value={s.w} onChange={e => updateCustomSet(ex.id, si, "w", e.target.value)}
                          style={{ background: "#161616", border: "1px solid #242424", borderRadius: "4px", color: "#e0e0e0", fontSize: "12px", padding: "4px 6px", textAlign: "center", width: "100%" }} />
                        <button onClick={() => removeCustomSet(ex.id, si)}
                          style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "13px", padding: 0, visibility: ex.sets.length > 1 ? "visible" : "hidden" }}>×</button>
                      </div>
                    ))}
                    <button onClick={() => addCustomSet(ex.id)}
                      style={{ marginTop: "4px", width: "100%", background: "none", border: "1px dashed #1e1e1e", borderRadius: "4px", color: "#333", fontSize: "10px", padding: "4px 0", cursor: "pointer" }}>
                      + add set
                    </button>
                  </div>
                </div>
              ))}

              {/* Add exercise form */}
              <div style={{ background: "#0d0d0d", border: "1px dashed #252540", borderRadius: "8px", padding: "12px", marginTop: "6px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "0.16em", color: "#3a3a5a", textTransform: "uppercase", marginBottom: "10px" }}>Add Exercise</div>
                <input
                  type="text"
                  placeholder="Exercise name"
                  value={newExName}
                  onChange={e => setNewExName(e.target.value)}
                  style={{ width: "100%", background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "12px", padding: "7px 10px", boxSizing: "border-box", marginBottom: "8px" }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <div>
                    <div style={{ fontSize: "9px", color: "#3a3a5a", marginBottom: "3px", letterSpacing: "0.1em" }}>SETS</div>
                    <input type="number" min="1" max="10" value={newExSets} onChange={e => setNewExSets(e.target.value)}
                      style={{ width: "100%", background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "12px", padding: "6px 8px", boxSizing: "border-box", textAlign: "center" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "9px", color: "#3a3a5a", marginBottom: "3px", letterSpacing: "0.1em" }}>REPS</div>
                    <input type="text" placeholder="10" value={newExReps} onChange={e => setNewExReps(e.target.value)}
                      style={{ width: "100%", background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "12px", padding: "6px 8px", boxSizing: "border-box", textAlign: "center" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "9px", color: "#3a3a5a", marginBottom: "3px", letterSpacing: "0.1em" }}>LOAD</div>
                    <input type="text" placeholder="lb / BW / —" value={newExWeight} onChange={e => setNewExWeight(e.target.value)}
                      style={{ width: "100%", background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "12px", padding: "6px 8px", boxSizing: "border-box", textAlign: "center" }} />
                  </div>
                </div>
                <input type="text" placeholder="Note (optional)" value={newExNote} onChange={e => setNewExNote(e.target.value)}
                  style={{ width: "100%", background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "12px", padding: "6px 10px", boxSizing: "border-box", marginBottom: "8px" }} />
                <button onClick={addCustomEx}
                  style={{ width: "100%", padding: "8px 0", background: newExName.trim() ? "#1a1b3a" : "#0d0e1c", border: `1px solid ${newExName.trim() ? "#4a4d6a" : "#1a1b2e"}`, borderRadius: "6px", color: newExName.trim() ? "#ced2f0" : "#2a2a4a", cursor: newExName.trim() ? "pointer" : "default", fontSize: "12px", fontWeight: "600" }}>
                  Add to session
                </button>
              </div>
            </div>
          )}

          {!isRest && (
            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #1a1a1a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "10px", color: "#4a4d6a", whiteSpace: "nowrap" }}>Session date</div>
<input
  type="date"
  value={sessionDate}
  max={todayISO()}
  onChange={e => setSessionDate(e.target.value)}
  style={{ background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "5px 8px" }}
/>

<input
  type="time"
  value={sessionTime}
  onChange={e => setSessionTime(e.target.value)}
  style={{ background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "5px 8px", marginLeft: "8px" }}
/>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ fontSize: "10px", color: "#4a4d6a", whiteSpace: "nowrap" }}>Duration</div>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    placeholder="min"
                    value={sessionDur}
                    onChange={e => setSessionDur(e.target.value)}
                    style={{ background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "5px 8px", width: "64px", textAlign: "center" }}
                  />
                </div>
                <button onClick={() => setSessionDate(todayISO())} style={buttonStyle(false)}>Today</button>
              </div>
<div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
  <div style={{ fontSize: "10px", color: "#4a4d6a", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>
    Cardio details
  </div>

  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", marginBottom: "8px" }}>
    <select
      value={cardioType}
      onChange={e => setCardioType(e.target.value)}
      style={{ background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "8px" }}
    >
      <option value="">No cardio</option>
      <option value="Running">Running</option>
      <option value="Cycling">Cycling</option>
      <option value="Swimming">Swimming</option>
      <option value="Rowing">Rowing</option>
      <option value="Walking">Walking</option>
      <option value="Other">Other</option>
    </select>

    <input
      type="number"
      step="0.1"
      placeholder="Distance"
      value={cardioDistance}
      onChange={e => setCardioDistance(e.target.value)}
      style={{ background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "8px" }}
    />

    <input
      type="number"
      placeholder="Active calories"
      value={cardioCalories}
      onChange={e => setCardioCalories(e.target.value)}
      style={{ background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "8px" }}
    />

    <input
      type="number"
      placeholder="Avg HR"
      value={cardioAvgHr}
      onChange={e => setCardioAvgHr(e.target.value)}
      style={{ background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "8px" }}
    />
  </div>

  <textarea
    value={cardioNotes}
    onChange={e => setCardioNotes(e.target.value)}
    placeholder="Cardio notes, pace, splits, pool length, route, etc."
    style={{ width: "100%", minHeight: "60px", resize: "vertical", background: "#111", border: "1px solid #1a1b2e", borderRadius: "6px", color: "#ced2f0", fontSize: "11px", padding: "8px", boxSizing: "border-box" }}
  />
</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveSession}
                  style={{
                    flex: 1,
                    padding: "13px 0",
                    background: meta.color,
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "800",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: meta.venue === "KNR" ? "#fff" : "#0a0a0a",
                    cursor: "pointer"
                  }}
                >
                  Log {meta.label}
                </button>

                {undo && (
                  <button onClick={undoSave} style={buttonStyle(false)}>Undo</button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {toast && (
        <div style={{ position: "fixed", top: "16px", right: "16px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "9px 16px", fontSize: "12px", color: "#c0c0c0", zIndex: 200, pointerEvents: "none" }}>
          {toast}
        </div>
      )}
    </div>
  )
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

function TrainingDashboard({ workouts, recentNutrition }) {
  const fmt0 = n => Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString() : "0"
  const fmt1 = n => Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "0.0"

  const [rangeMode, setRangeMode] = useState("weekly")
  const [timeWindow, setTimeWindow] = useState("180D")

  const timeWindowDays = { "30D": 30, "90D": 90, "180D": 180, "1Y": 365, "ALL": null }
  const timeWindowLabel = { "30D": "30 days", "90D": "90 days", "180D": "6 months", "1Y": "1 year", "ALL": "All time" }

  const filteredWorkouts = useMemo(() => {
    const cutoff = timeWindowDays[timeWindow]
    if (cutoff == null) return workouts
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - cutoff)
    cutoffDate.setHours(0, 0, 0, 0)
    return workouts.filter(w => {
      const d = new Date(w.dateTime || w.date)
      return !Number.isNaN(d.getTime()) && d >= cutoffDate
    })
  }, [workouts, timeWindow])

  const startOfWeek = d => {
    const x = new Date(d)
    const day = x.getDay()
    const diff = day === 0 ? -6 : 1 - day
    x.setDate(x.getDate() + diff)
    x.setHours(0, 0, 0, 0)
    return x
  }

  const startOfMonth = d => {
    const x = new Date(d)
    x.setDate(1)
    x.setHours(0, 0, 0, 0)
    return x
  }

  const startOfYear = d => {
    const x = new Date(d)
    x.setMonth(0, 1)
    x.setHours(0, 0, 0, 0)
    return x
  }

  const formatBucketLabel = (date, mode) => {
    const d = new Date(date)
    if (mode === "weekly") return `${d.getMonth() + 1}/${d.getDate()}`
    if (mode === "monthly") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (mode === "yearly") return `${d.getFullYear()}`
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const chartData = useMemo(() => {
    const grouped = {}

    filteredWorkouts.forEach(w => {
      const rawDate = new Date(w.dateTime || w.date)
      let bucketDate

      if (rangeMode === "weekly") {
        bucketDate = startOfWeek(rawDate)
      } else if (rangeMode === "monthly") {
        bucketDate = startOfMonth(rawDate)
      } else if (rangeMode === "yearly") {
        bucketDate = startOfYear(rawDate)
      } else {
        bucketDate = new Date(rawDate)
        bucketDate.setHours(0, 0, 0, 0)
      }

      const key = bucketDate.toISOString().slice(0, 10)

      if (!grouped[key]) {
        grouped[key] = {
          bucket: key,
          label: formatBucketLabel(bucketDate, rangeMode),
          cardioDistance: 0,
          cardioCalories: 0,
          cardioMinutes: 0,
          strengthSessions: 0,
          totalWorkouts: 0
        }
      }

      grouped[key].totalWorkouts += 1

if (w.category === "Strength") {
  grouped[key].strengthSessions += 1
} else if (
  ["Running", "Walking", "Cycling", "Swimming", "Elliptical", "Rowing", "Stairs", "Machine Cardio"].includes(w.category)
) {
  grouped[key].cardioDistance += Number(w.distance || 0)
  grouped[key].cardioCalories += Number(w.calories || 0)
  grouped[key].cardioMinutes += Number(w.dur || 0)
}
    })

    return Object.values(grouped).sort((a, b) => a.bucket.localeCompare(b.bucket))
  }, [filteredWorkouts, rangeMode])

  const totals = useMemo(() => {
    return chartData.reduce(
      (acc, row) => {
        acc.cardioDistance += row.cardioDistance
        acc.cardioCalories += row.cardioCalories
        acc.cardioMinutes += row.cardioMinutes
        acc.strengthSessions += row.strengthSessions
        acc.totalWorkouts += row.totalWorkouts
        return acc
      },
      {
        cardioDistance: 0,
        cardioCalories: 0,
        cardioMinutes: 0,
        strengthSessions: 0,
        totalWorkouts: 0
      }
    )
  }, [chartData])

  const cardStyle = {
    background: "#101622",
    border: "1px solid #1a2a44",
    borderRadius: "8px",
    padding: "14px",
    textAlign: "center"
  }

  const labelStyle = {
    fontSize: "11px",
    color: "#8fa8d8",
    letterSpacing: "0.08em",
    textTransform: "uppercase"
  }

  const valueStyle = {
    fontSize: "22px",
    fontWeight: "700",
    marginTop: "4px",
    color: "#ced2f0"
  }

  const rangeButton = mode => ({
    padding: "8px 12px",
    background: rangeMode === mode ? "#252640" : "#0d0e1c",
    border: "1px solid #1a1b2e",
    borderRadius: "8px",
    color: "#ced2f0",
    cursor: "pointer"
  })

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div style={{ fontSize: "18px", fontWeight: "700", color: "#ced2f0" }}>
          Training Dashboard
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {["30D", "90D", "180D", "1Y", "ALL"].map(k => (
              <button key={k} onClick={() => setTimeWindow(k)} style={{
                padding: "5px 10px", fontSize: "12px",
                background: timeWindow === k ? "#252640" : "#0d0e1c",
                border: timeWindow === k ? "1px solid #4a9ee8" : "1px solid #1a1b2e",
                borderRadius: "6px", color: timeWindow === k ? "#ffffff" : "#ced2f0",
                cursor: "pointer", fontWeight: timeWindow === k ? "600" : "400"
              }}>{timeWindowLabel[k]}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {["weekly", "monthly", "yearly"].map(m => (
              <button key={m} onClick={() => setRangeMode(m)} style={{
                padding: "4px 8px", fontSize: "11px",
                background: rangeMode === m ? "#1a1b2e" : "transparent",
                border: rangeMode === m ? "1px solid #4a9ee8" : "1px solid #1a1b2e",
                borderRadius: "5px", color: rangeMode === m ? "#a0b0e0" : "#607090",
                cursor: "pointer", textTransform: "capitalize"
              }}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Cardio Distance (mi)</div>
<div style={valueStyle}>{fmt1(totals.cardioDistance)}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Cardio Calories (kcal)</div>
<div style={valueStyle}>{fmt0(totals.cardioCalories)}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Cardio Minutes (min)</div>
<div style={valueStyle}>{fmt0(totals.cardioMinutes)}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Strength Sessions</div>
<div style={valueStyle}>{fmt0(totals.strengthSessions)}</div>
        </div>

       <div style={cardStyle}>
  <div style={labelStyle}>Total Workouts</div>
  <div style={valueStyle}>{fmt0(totals.totalWorkouts)}</div>
</div>

<div style={cardStyle}>
  <div style={labelStyle}>Calories (7d avg)</div>
  <div style={valueStyle}>{fmt0(recentNutrition.avgCalories)}</div>
</div>

<div style={cardStyle}>
  <div style={labelStyle}>Protein (7d avg g)</div>
  <div style={valueStyle}>{fmt0(recentNutrition.avgProtein)}</div>
</div>

</div>

      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#ced2f0", marginBottom: "12px" }}>
  Cardio Distance (mi)
</div>
<ResponsiveContainer width="100%" height={240}>
  <BarChart data={chartData}>
    <CartesianGrid stroke="#1a1b2e" />
    <XAxis dataKey="label" />
    <YAxis unit="" />
    <Tooltip formatter={(value) => [fmt1(value), "Distance (mi)"]} />
<Bar dataKey="cardioDistance" name="Cardio Distance (mi)" fill="#4a9ee8" />
  </BarChart>
</ResponsiveContainer>
        </div>

        <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#ced2f0", marginBottom: "12px" }}>
            Cardio Calories
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid stroke="#1a1b2e" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="cardioCalories" name="Cardio Calories" fill="#ff9f6e" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#ced2f0", marginBottom: "12px" }}>
            Cardio Minutes
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid stroke="#1a1b2e" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="cardioMinutes" name="Cardio Minutes" fill="#4ae890" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#ced2f0", marginBottom: "12px" }}>
            Strength Sessions
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid stroke="#1a1b2e" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="strengthSessions" name="Strength Sessions" fill="#ffd166" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
function buildTrainingSummary(workouts) {
  const now = new Date()
  const daysAgo = n => {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d
  }

const last28 = workouts.filter(w => new Date(w.dateTime || w.date) >= daysAgo(28))
  const summary = {
    runningDistance28: 0,
    swimmingDistance28: 0,
    cyclingDistance28: 0,
    cardioMinutes28: 0,
    strengthSessions28: 0,
    totalWorkouts28: 0
  }

  last28.forEach(w => {
    summary.totalWorkouts28 += 1

    if (w.category === "Strength") {
      summary.strengthSessions28 += 1
      return
    }

    if (
      ["Running", "Walking", "Cycling", "Swimming", "Elliptical", "Rowing", "Stairs", "Machine Cardio"].includes(w.category)
    ) {
      summary.cardioMinutes28 += Number(w.dur || 0)
    }

    if (w.category === "Running" || w.category === "Walking") {
      summary.runningDistance28 += Number(w.distance || 0)
    } else if (w.category === "Swimming") {
      summary.swimmingDistance28 += Number(w.distance || 0)
    } else if (w.category === "Cycling") {
      summary.cyclingDistance28 += Number(w.distance || 0)
    }
  })

  return {
    ...summary,
    runningDistanceWeekly: summary.runningDistance28 / 4,
    swimmingDistanceWeekly: summary.swimmingDistance28 / 4,
    cyclingDistanceWeekly: summary.cyclingDistance28 / 4,
    cardioMinutesWeekly: summary.cardioMinutes28 / 4,
    strengthSessionsWeekly: summary.strengthSessions28 / 4
  }
}
function linearSlope(data, getValue) {
  if (!data || data.length < 2) return 0

  const first = data[0]
  const last = data[data.length - 1]

  const days =
    (new Date(last.date) - new Date(first.date)) /
    (1000 * 60 * 60 * 24)

  if (days === 0) return 0

  const change = getValue(last) - getValue(first)

  return change / days
}

function projectValue(current, slopePerDay, days, floor = 0) {
  return Math.max(floor, current + slopePerDay * days)
}

function estimateMilestoneDate(current, slopePerDay, target) {
  if (slopePerDay === 0) return null

  const days = (target - current) / slopePerDay

  if (days <= 0) return null

  const d = new Date()
  d.setDate(d.getDate() + days)

  return d.toISOString().slice(0, 10)
}
function estimateMaintenanceCalories({ currentWeight, recentCardioMinutes, bmr }) {
  const baseBmr =
    Number(bmr) > 0
      ? Number(bmr)
      : Number(currentWeight) > 0
      ? Number(currentWeight) * 11
      : 1800

  const activityAdjustment = Number(recentCardioMinutes || 0) * 4

  return baseBmr + activityAdjustment
}
function buildBodyForecast({
  daily,
  nutritionRows = [],
  recentCardioMinutes = 0,
  bmr = null
}) {
  const phase1TargetWeight = 150
  const finalTargetWeight = 145

  if (!daily || !daily.length) return null

  const getWeight = d => {
    const candidates = [
      d.weight_lb,
      d.weight,
      d.weight_lbs_mean,
      d.weight_lbs,
      d["Weight (lb)"],
      d["Weight (lb, same-day if available)"]
    ]

    for (const v of candidates) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return n
    }

    return null
  }

  const weightRows = daily
    .map(d => ({
      ...d,
      _weight: getWeight(d)
    }))
    .filter(d => d._weight != null)
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  if (!weightRows.length) return null

  const currentWeight = weightRows[weightRows.length - 1]._weight

  const recentWeights = weightRows.slice(-28)
  const observedSlope = linearSlope(recentWeights, d => d._weight)

  const estimatedMaintenance = estimateMaintenanceCalories({
    currentWeight,
    recentCardioMinutes,
    bmr
  })

  const calorieRows = (Array.isArray(nutritionRows) ? nutritionRows : [])
    .filter(r => Number(r.calories) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  const recentCalorieRows = calorieRows.slice(-21)

  const avgLoggedCalories =
    recentCalorieRows.length
      ? recentCalorieRows.reduce((sum, r) => sum + Number(r.calories || 0), 0) / recentCalorieRows.length
      : 0

  const loggingCoverage = recentCalorieRows.length / 21

  const energyBalanceSlope =
    avgLoggedCalories > 0 && Number.isFinite(estimatedMaintenance)
      ? (avgLoggedCalories - estimatedMaintenance) / 3500
      : observedSlope

  let blendedSlope =
    loggingCoverage >= 0.5
      ? observedSlope * 0.35 + energyBalanceSlope * 0.65
      : observedSlope

  if (!Number.isFinite(blendedSlope)) blendedSlope = observedSlope
  if (!Number.isFinite(blendedSlope)) blendedSlope = 0

  const distanceTo150 = currentWeight - phase1TargetWeight
  const distanceTo145 = currentWeight - finalTargetWeight

  let taperMultiplier = 1

  if (currentWeight <= finalTargetWeight) {
    taperMultiplier = 0
  } else if (currentWeight <= phase1TargetWeight) {
    taperMultiplier = 0.35
  } else if (distanceTo150 <= 5) {
    taperMultiplier = 0.55
  } else if (distanceTo150 <= 10) {
    taperMultiplier = 0.75
  }

  const projectedSlope = blendedSlope * taperMultiplier

  const boundedSlope = Math.max(-0.2, Math.min(0.1, projectedSlope))

  return {
    currentWeight,
    phase1TargetWeight,
    finalTargetWeight,
    estimatedMaintenance,
    avgLoggedCalories: Math.round(avgLoggedCalories),
    loggingCoverage: Number(loggingCoverage.toFixed(2)),
    observedSlope,
    energyBalanceSlope,
    blendedSlope: boundedSlope,
    weight1m: Math.max(finalTargetWeight, projectValue(currentWeight, boundedSlope, 30)),
    weight3m: Math.max(finalTargetWeight, projectValue(currentWeight, boundedSlope, 90)),
    weight6m: Math.max(finalTargetWeight, projectValue(currentWeight, boundedSlope, 180)),
    weight12m: Math.max(finalTargetWeight, projectValue(currentWeight, boundedSlope, 365)),
    eta150: estimateMilestoneDate(currentWeight, boundedSlope, 150),
    eta145: estimateMilestoneDate(currentWeight, boundedSlope, 145)
  }
}
function buildTrainingForecast(
  summary,
  penalties = { running: 1, swimming: 1, cycling: 1, lifting: 1 },
  weeklyBuckets = []
) {
  if (!summary) return null

  const runningSlopePerWeek =
    clampTrainingSlope(
      "running",
      computeBlendedWeeklySlope(weeklyBuckets, "running") * penalties.running
    )

  const swimmingSlopePerWeek =
    clampTrainingSlope(
      "swimming",
      computeBlendedWeeklySlope(weeklyBuckets, "swimming") * penalties.swimming
    )

  const cyclingSlopePerWeek =
    clampTrainingSlope(
      "cycling",
      computeBlendedWeeklySlope(weeklyBuckets, "cycling") * penalties.cycling
    )

  const strengthSlopePerWeek =
    clampTrainingSlope(
      "strength",
      computeBlendedWeeklySlope(weeklyBuckets, "strength") * penalties.lifting
    )

  const cardioPenalty = Math.min(
    penalties.running ?? 1,
    penalties.swimming ?? 1,
    penalties.cycling ?? 1
  )

  const cardioMinutesSlopePerWeek =
    clampTrainingSlope(
      "cardioMinutes",
      computeBlendedWeeklySlope(weeklyBuckets, "cardioMinutes") * cardioPenalty
    )

  const runningCurrent = Number(summary.runningDistanceWeekly || 0)
  const swimmingCurrent = Number(summary.swimmingDistanceWeekly || 0)
  const cyclingCurrent = Number(summary.cyclingDistanceWeekly || 0)
  const strengthCurrent = Number(summary.strengthSessionsWeekly || 0)
  const cardioMinutesCurrent = Number(summary.cardioMinutesWeekly || 0)

  const runningSlopePerDay = runningSlopePerWeek / 7
  const swimmingSlopePerDay = swimmingSlopePerWeek / 7
  const cyclingSlopePerDay = cyclingSlopePerWeek / 7
  const strengthSlopePerDay = strengthSlopePerWeek / 7
  const cardioMinutesSlopePerDay = cardioMinutesSlopePerWeek / 7

  return {
    runningCurrent,
    runningSlopePerWeek,
    running1m: projectValue(runningCurrent, runningSlopePerDay, 30),
    running3m: projectValue(runningCurrent, runningSlopePerDay, 90),
    running6m: projectValue(runningCurrent, runningSlopePerDay, 180),
    running12m: projectValue(runningCurrent, runningSlopePerDay, 365),
    eta20Run: estimateMilestoneDate(runningCurrent, runningSlopePerDay, 20),
    eta30Run: estimateMilestoneDate(runningCurrent, runningSlopePerDay, 30),

    swimmingCurrent,
    swimmingSlopePerWeek,
    swimming1m: projectValue(swimmingCurrent, swimmingSlopePerDay, 30),
    swimming3m: projectValue(swimmingCurrent, swimmingSlopePerDay, 90),
    swimming6m: projectValue(swimmingCurrent, swimmingSlopePerDay, 180),
    swimming12m: projectValue(swimmingCurrent, swimmingSlopePerDay, 365),
    eta2Swim: estimateMilestoneDate(swimmingCurrent, swimmingSlopePerDay, 2),
    eta5Swim: estimateMilestoneDate(swimmingCurrent, swimmingSlopePerDay, 5),

    cyclingCurrent,
    cyclingSlopePerWeek,
    cycling1m: projectValue(cyclingCurrent, cyclingSlopePerDay, 30),
    cycling3m: projectValue(cyclingCurrent, cyclingSlopePerDay, 90),
    cycling6m: projectValue(cyclingCurrent, cyclingSlopePerDay, 180),
    cycling12m: projectValue(cyclingCurrent, cyclingSlopePerDay, 365),
    eta25Bike: estimateMilestoneDate(cyclingCurrent, cyclingSlopePerDay, 25),
    eta50Bike: estimateMilestoneDate(cyclingCurrent, cyclingSlopePerDay, 50),

    strengthCurrent,
    strengthSlopePerWeek,
    strength1m: projectValue(strengthCurrent, strengthSlopePerDay, 30),
    strength3m: projectValue(strengthCurrent, strengthSlopePerDay, 90),
    strength6m: projectValue(strengthCurrent, strengthSlopePerDay, 180),
    strength12m: projectValue(strengthCurrent, strengthSlopePerDay, 365),
    eta3Strength: estimateMilestoneDate(strengthCurrent, strengthSlopePerDay, 3),
    eta4Strength: estimateMilestoneDate(strengthCurrent, strengthSlopePerDay, 4),

    cardioMinutesCurrent,
    cardioMinutesSlopePerWeek,
    cardioMinutes1m: Math.max(0, projectValue(cardioMinutesCurrent, cardioMinutesSlopePerDay, 30)),
    cardioMinutes3m: Math.max(0, projectValue(cardioMinutesCurrent, cardioMinutesSlopePerDay, 90)),
    cardioMinutes6m: Math.max(0, projectValue(cardioMinutesCurrent, cardioMinutesSlopePerDay, 180)),
    cardioMinutes12m: Math.max(0, projectValue(cardioMinutesCurrent, cardioMinutesSlopePerDay, 365))
  }
}
function safeNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseWorkoutDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a, b) {
  const ms = 1000 * 60 * 60 * 24
  return Math.round((a.getTime() - b.getTime()) / ms)
}

function getWorkoutTypeLabel(workout) {
  return String(
    workout?.canonical_type ||
      workout?.type ||
      workout?.activityType ||
      workout?.sport ||
      workout?.category ||
      ""
  ).toLowerCase()
}

function extractRunDistanceMiles(workout) {
  const type = getWorkoutTypeLabel(workout)
  if (!type.includes("run") && !type.includes("jog") && type !== "running") return 0

  const miles =
    safeNum(workout?.distanceMiles) ||
    safeNum(workout?.miles) ||
    safeNum(workout?.distance_miles) ||
    safeNum(workout?.distance)

  if (miles > 0) return miles

  const km =
    safeNum(workout?.distanceKm) ||
    safeNum(workout?.kilometers) ||
    safeNum(workout?.distance_km)

  if (km > 0) return km * 0.621371

  const meters =
    safeNum(workout?.distanceMeters) ||
    safeNum(workout?.meters) ||
    safeNum(workout?.distance_m)

  if (meters > 0) return meters / 1609.34

  return 0
}

function extractWorkoutDurationMin(workout) {
  const pm = workout?.preferred_metrics || {}

  const candidates = [
    pm?.duration?.value,
    pm?.duration?.raw,
    pm?.elapsed_time?.value,
    pm?.elapsed_time?.raw,
    pm?.moving_time?.value,
    pm?.moving_time?.raw,

    workout?.durationMin,
    workout?.minutes,
    workout?.duration,
    workout?.dur,

    workout?.sources?.apple?.duration,
    workout?.sources?.apple?.duration_min,
    workout?.sources?.apple?.minutes,

    workout?.duration_min
  ]

  for (const candidate of candidates) {
    const n = Number(candidate)
    if (!Number.isFinite(n) || n <= 0) continue

    if (n > 600) return n / 60
    return n
  }

  return 0
}


function extractRunPaceMinPerMile(workout) {
  const explicit =
    safeNum(workout?.paceMinPerMile) ||
    safeNum(workout?.pace_min_per_mile)

  if (explicit > 0) return explicit

  const miles = extractRunDistanceMiles(workout)
  const mins = extractWorkoutDurationMin(workout)

  if (miles > 0 && mins > 0) return mins / miles
  return 0
}

function computeEnduranceInputs(workouts, asOfDate = new Date()) {
  const runs28 = []
  const runs84 = []

  ;(workouts || []).forEach(workout => {
    const dt = parseWorkoutDate(
  workout?.dateTime ||
    workout?.date ||
    workout?.start_date ||
    workout?.startDate ||
    workout?.start
)
    if (!dt) return

    const ageDays = daysBetween(asOfDate, dt)
    if (ageDays < 0) return

    const type = getWorkoutTypeLabel(workout)
    if (!type.includes("run") && !type.includes("jog") && type !== "running") return

    const miles = extractRunDistanceMiles(workout)
    const durationMin = extractWorkoutDurationMin(workout)
    const pace = extractRunPaceMinPerMile(workout)

    const row = { miles, durationMin, pace, dt }

    if (ageDays <= 28) runs28.push(row)
    if (ageDays <= 84) runs84.push(row)
  })

  const sumMiles28 = runs28.reduce((s, r) => s + safeNum(r.miles), 0)
  const sumMiles84 = runs84.reduce((s, r) => s + safeNum(r.miles), 0)

  const validPaces28 = runs28.map(r => r.pace).filter(v => v > 0)
  const validPaces84 = runs84.map(r => r.pace).filter(v => v > 0)

  const avgPace28 =
    validPaces28.length
      ? validPaces28.reduce((s, v) => s + v, 0) / validPaces28.length
      : 0

  const avgPace84 =
    validPaces84.length
      ? validPaces84.reduce((s, v) => s + v, 0) / validPaces84.length
      : 0

  return {
    runs28Count: runs28.length,
    runs84Count: runs84.length,
    milesPer4Weeks: Math.round(sumMiles28 * 10) / 10,
    milesPer12Weeks: Math.round(sumMiles84 * 10) / 10,
    weeklyRunMiles28: Math.round((sumMiles28 / 4) * 10) / 10,
    weeklyRunMiles84: Math.round((sumMiles84 / 12) * 10) / 10,
    avgPace28: avgPace28 ? Math.round(avgPace28 * 100) / 100 : 0,
    avgPace84: avgPace84 ? Math.round(avgPace84 * 100) / 100 : 0
  }
}

function paceToScore(minPerMile) {
  if (!Number.isFinite(minPerMile) || minPerMile <= 0) return 0

  if (minPerMile <= 8.0) return 100
  if (minPerMile <= 9.0) return 90
  if (minPerMile <= 10.0) return 80
  if (minPerMile <= 11.0) return 70
  if (minPerMile <= 12.0) return 60
  if (minPerMile <= 13.0) return 50
  if (minPerMile <= 14.0) return 40
  return 30
}

function mileageToScore(weeklyMiles) {
  if (!Number.isFinite(weeklyMiles) || weeklyMiles <= 0) return 0

  if (weeklyMiles >= 25) return 100
  if (weeklyMiles >= 20) return 90
  if (weeklyMiles >= 15) return 80
  if (weeklyMiles >= 10) return 65
  if (weeklyMiles >= 7) return 55
  if (weeklyMiles >= 4) return 45
  if (weeklyMiles >= 2) return 30
  return 15
}

function buildEnduranceForecast({
  workouts,
  trainingSummary,
  penalties
}) {
  const inputs = computeEnduranceInputs(workouts)
  const cardioMinutesWeekly = safeNum(trainingSummary?.cardioMinutesWeekly)
  const cyclingMilesWeekly = safeNum(trainingSummary?.cyclingDistanceWeekly)

  const runPenalty =
    penalties?.running != null
      ? penalties.running
      : 1

  // Aerobic volume score: weekly cardio minutes across all modalities.
  // Ceiling at 150 min/week (well above typical training load) to produce a 0-100 scale.
  const cardioScore = Math.min(100, Math.round((cardioMinutesWeekly / 150) * 100))

  // Cycling contributes aerobic base. Apply a 0.35 run-equivalent factor
  // (reflects typical energy cost ratio for steady-state cycling vs running).
  const cyclingEquivMiles = cyclingMilesWeekly * 0.35
  const aerobicVolumeScore = mileageToScore(
    inputs.weeklyRunMiles28 + cyclingEquivMiles
  )

  // Running-specific scores. If fewer than 2 runs in the last 28 days,
  // fall back to the 84-day history with a 0.55 recency discount.
  const hasRecentRuns = inputs.runs28Count >= 2
  const runPaceScore = hasRecentRuns
    ? paceToScore(inputs.avgPace28)
    : inputs.runs84Count >= 3
      ? paceToScore(inputs.avgPace84) * 0.55
      : 0
  const runVolumeScore = hasRecentRuns
    ? mileageToScore(inputs.weeklyRunMiles28)
    : inputs.runs84Count >= 3
      ? mileageToScore(inputs.weeklyRunMiles84) * 0.55
      : 0

  // Weighted formula:
  // Aerobic volume (multi-modal)  40%
  // Running pace                  25%
  // Running volume                20%
  // Cardio minutes consistency    15%
  const swimmingMilesWeekly = safeNum(trainingSummary?.swimmingDistanceWeekly)
const swimScore = Math.min(100, Math.round((swimmingMilesWeekly / 2) * 100))
const baseReadinessRaw =
    aerobicVolumeScore * 0.30 +
    runPaceScore       * 0.20 +
    runVolumeScore     * 0.15 +
    cardioScore        * 0.15 +
    swimScore          * 0.10 +
    Math.min(100, Math.round((cyclingMilesWeekly / 40) * 100)) * 0.10

  const readinessNow = Math.max(
    0,
    Math.min(100, Math.round(baseReadinessRaw * runPenalty))
  )

  // Slope: compare total cardio-equivalent miles over the last 28 days
  // versus the prior 28 days (days 29-56). This reflects training trajectory,
  // not injury-phase vs baseline comparison.
  const prior28Inputs = computeEnduranceInputs(
    workouts,
    (() => { const d = new Date(); d.setDate(d.getDate() - 28); return d })()
  )
  const recentEquiv = inputs.weeklyRunMiles28 + cyclingMilesWeekly * 0.35
  const priorEquiv  = prior28Inputs.weeklyRunMiles28 +
    safeNum(trainingSummary?.cyclingDistanceWeekly) * 0.35

  // Scale slope: 1 equivalent mile/week improvement -> ~3 readiness points/month.
  // Cap at +/-4 points/month so the projection stays plausible.
  const rawSlopePerMonth = (recentEquiv - priorEquiv) * 3
  const readinessSlopePerMonth = Math.max(-4, Math.min(4, rawSlopePerMonth))

  const projectReadiness = months => {
    const projected = readinessNow + readinessSlopePerMonth * months
    return Math.max(0, Math.min(100, Math.round(projected)))
  }

  return {
    readinessNow,
    readiness1m: projectReadiness(1),
    readiness3m: projectReadiness(3),
    readiness6m: projectReadiness(6),
    readiness12m: projectReadiness(12),
    weeklyRunMiles28: inputs.weeklyRunMiles28,
    avgPace28: inputs.avgPace28,
    runs28Count: inputs.runs28Count,
    cardioMinutesWeekly,
    runPenalty
  }
}
function formatRaceTime(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "NA"

  const totalSeconds = Math.round(totalMinutes * 60)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function predictRaceTimeFromPace(distanceMiles, paceMinPerMile) {
  if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) return null
  if (!Number.isFinite(paceMinPerMile) || paceMinPerMile <= 0) return null
  return distanceMiles * paceMinPerMile
}

function adjustEquivalentRacePace({
  avgPace28,
  readiness,
  weeklyRunMiles28,
  runPenalty
}) {
  const basePace = Number(avgPace28 || 0)
  if (!Number.isFinite(basePace) || basePace <= 0) return null

  const readinessBoost =
    readiness >= 80 ? -1.0 :
    readiness >= 65 ? -0.7 :
    readiness >= 50 ? -0.4 :
    readiness >= 35 ? -0.15 :
    readiness >= 20 ? 0 :
    0.25

  const mileageBoost =
    weeklyRunMiles28 >= 20 ? -0.5 :
    weeklyRunMiles28 >= 15 ? -0.35 :
    weeklyRunMiles28 >= 10 ? -0.2 :
    weeklyRunMiles28 >= 6 ? -0.05 :
    weeklyRunMiles28 >= 3 ? 0.1 :
    0.25

  const injurySlowdown =
    runPenalty >= 0.95 ? 0 :
    runPenalty >= 0.8 ? 0.2 :
    runPenalty >= 0.6 ? 0.45 :
    0.8

  const predictedPace = Math.max(6.5, basePace + readinessBoost + mileageBoost + injurySlowdown)
  return Number(predictedPace.toFixed(2))
}

function buildRacePrediction(enduranceForecast) {
  if (!enduranceForecast) return null

  const {
    readinessNow,
    readiness1m,
    readiness3m,
    readiness6m,
    readiness12m,
    avgPace28,
    weeklyRunMiles28,
    runPenalty
  } = enduranceForecast

  const predictedPaceNow = adjustEquivalentRacePace({
    avgPace28,
    readiness: readinessNow,
    weeklyRunMiles28,
    runPenalty
  })

  if (!predictedPaceNow) {
    return {
      predictedPaceNow: null,
      fiveK: "NA",
      tenK: "NA",
      halfMarathon: "NA",
      half1m: "NA",
      half3m: "NA",
      half6m: "NA",
      half12m: "NA"
    }
  }

  const predictForReadiness = readiness => {
    const pace = adjustEquivalentRacePace({
      avgPace28,
      readiness,
      weeklyRunMiles28,
      runPenalty
    })
    if (!pace) return "NA"
    return formatRaceTime(predictRaceTimeFromPace(13.1094, pace))
  }

  return {
    predictedPaceNow,
    fiveK: formatRaceTime(predictRaceTimeFromPace(3.1069, predictedPaceNow)),
    tenK: formatRaceTime(predictRaceTimeFromPace(6.2137, predictedPaceNow)),
    halfMarathon: formatRaceTime(predictRaceTimeFromPace(13.1094, predictedPaceNow)),
    half1m: predictForReadiness(readiness1m),
    half3m: predictForReadiness(readiness3m),
    half6m: predictForReadiness(readiness6m),
    half12m: predictForReadiness(readiness12m)
  }
}
function getInjuryPenalties() {
  const injuries = JSON.parse(localStorage.getItem("injuries") || "[]")
  const today = new Date()

  const penalties = {
    running: 1,
    swimming: 1,
    cycling: 1,
    lifting: 1
  }

  injuries.forEach(entry => {
    const recoveryDays = Number(entry.recoveryDays || 0)
    const severity = Number(entry.severity || 0)

    const start = new Date()
    const end = new Date(start)
    end.setDate(start.getDate() + recoveryDays)

    if (today <= end) {
      const reduction = Math.min(0.8, severity / 10)
      const multiplier = 1 - reduction

      if (entry.affectsRunning) penalties.running = Math.min(penalties.running, multiplier)
      if (entry.affectsSwimming) penalties.swimming = Math.min(penalties.swimming, multiplier)
      if (entry.affectsCycling) penalties.cycling = Math.min(penalties.cycling, multiplier)
      if (entry.affectsLifting) penalties.lifting = Math.min(penalties.lifting, multiplier)
    }
  })

  return penalties
}
function buildWeeklyTrainingBuckets(workouts) {
  const startOfWeek = dateValue => {
    const d = new Date(dateValue)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  const buckets = {}

  workouts.forEach(w => {
    const weekStart = startOfWeek(w.dateTime || w.date)
    const key = weekStart.toISOString().slice(0, 10)

    if (!buckets[key]) {
      buckets[key] = {
        weekStart: key,
        running: 0,
        swimming: 0,
        cycling: 0,
        strength: 0,
        cardioMinutes: 0
      }
    }

    if (w.category === "Running" || w.category === "Walking") {
      buckets[key].running += Number(w.distance || 0)
      buckets[key].cardioMinutes += Number(w.dur || 0)
    } else if (w.category === "Swimming") {
      buckets[key].swimming += Number(w.distance || 0)
      buckets[key].cardioMinutes += Number(w.dur || 0)
    } else if (w.category === "Cycling") {
      buckets[key].cycling += Number(w.distance || 0)
      buckets[key].cardioMinutes += Number(w.dur || 0)
    } else if (w.category === "Strength") {
      buckets[key].strength += 1
    } else if (
      ["Elliptical", "Rowing", "Stairs", "Machine Cardio"].includes(w.category)
    ) {
      buckets[key].cardioMinutes += Number(w.dur || 0)
    }
  })

  const ordered = Object.values(buckets).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  )

const trimmed = ordered.slice(-52)

const maxLoad = Math.max(
  ...trimmed.map(w =>
    (w.running || 0) +
    (w.swimming || 0) * 2 +
    (w.cycling || 0) * 0.4 +
    (w.strength || 0) * 2 +
    (w.cardioMinutes || 0) * 0.08
  ),
  1
)

return trimmed.map(w => {
  const loadRaw =
      (w.running || 0) +
      (w.swimming || 0) * 2 +
      (w.cycling || 0) * 0.4 +
      (w.strength || 0) * 2 +
      (w.cardioMinutes || 0) * 0.08

  return {
    ...w,
    trainingLoad: loadRaw / maxLoad
  }
})
}
function computeWeeklySlope(buckets, key, windowSize = null) {
  if (!Array.isArray(buckets) || buckets.length < 2) return 0

  const source = windowSize ? buckets.slice(-windowSize) : buckets
  if (source.length < 2) return 0

  const values = source.map((b, i) => ({
    x: i,
    y: Number(b[key] || 0)
  }))

  const n = values.length
  const sumX = values.reduce((s, p) => s + p.x, 0)
  const sumY = values.reduce((s, p) => s + p.y, 0)
  const sumXY = values.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = values.reduce((s, p) => s + p.x * p.x, 0)

  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return 0

  return (n * sumXY - sumX * sumY) / denom
}

function computeBlendedWeeklySlope(
  buckets,
  key,
  shortWindow = 4,
  longWindow = 12,
  shortWeight = 0.7,
  longWeight = 0.3
) {
  const shortSlope = computeWeeklySlope(buckets, key, shortWindow)
  const longSlope = computeWeeklySlope(buckets, key, longWindow)

  if (!Number.isFinite(shortSlope) && !Number.isFinite(longSlope)) return 0
  if (!Number.isFinite(shortSlope)) return longSlope || 0
  if (!Number.isFinite(longSlope)) return shortSlope || 0

  return shortSlope * shortWeight + longSlope * longWeight
}

function clampTrainingSlope(key, slope) {
  const limits = {
    running: [-1.5, 2.5],
    swimming: [-0.5, 1.5],
    cycling: [-2.5, 5],
    strength: [-0.25, 0.25],
    cardioMinutes: [-20, 30]
  }

  const [minVal, maxVal] = limits[key] || [-10, 10]
  return Math.max(minVal, Math.min(maxVal, slope))
}
export default function App() {
  const [tab, setTab] = useState("Overview")
  const [rangeKey, setRangeKey] = useState("180D")
  const [workouts, setWorkouts] = useState([])
  const [daily, setDaily] = useState([])
  const [nutrition, setNutrition] = useState([])
  const [injury, setInjury] = useState([])
  const [dexa, setDexa] = useState([])
const [error, setError] = useState("")
const [storedWorkouts, setStoredWorkouts] = useState([])
const [canonicalSessions, setCanonicalSessions] = useState([])
const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
useEffect(() => {
  const handler = () => setIsMobile(window.innerWidth < 768)
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
  const handler = () => setIsMobile(window.innerWidth < 768)
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
  const activeWorkouts =
    canonicalSessions && canonicalSessions.length > 0
      ? canonicalSessions
      : workouts
const fmt0 = n => Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString() : "0"
const fmt1 = n => Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "0.0"

function normalizeWorkoutType(type, workout) {
  const t = String(type || "").toLowerCase()

  if (t.includes("traditional strength")) return "Strength"
  if (t.includes("functional strength")) return "Strength"
  if (t.includes("core")) return "Strength"

  if (t.includes("running")) return "Running"
  if (t.includes("walking")) return "Walking"
  if (t.includes("cycling")) return "Cycling"
  if (t.includes("swimming")) return "Swimming"
  if (t.includes("elliptical")) return "Elliptical"
  if (t.includes("rowing")) return "Rowing"
  if (t.includes("stair")) return "Stairs"

  // For Machine Cardio, check rpm_avg as the definitive bike signal,
  // then fall back to sub-type string matching
  if (t.includes("machine cardio") || t === "other") {
    const rpmAvg =
      workout?.preferred_metrics?.rpm_avg?.value ??
      workout?.sources?.technogym?.rpm_avg ??
      workout?.rpm_avg ??
      null

    // rpm_avg being non-null (even zero) means it was a bike session
    if (rpmAvg !== null && Number.isFinite(Number(rpmAvg))) return "Cycling"

    const powerAvg =
      workout?.preferred_metrics?.power_avg?.value ??
      workout?.sources?.technogym?.power_avg ??
      null

    // power_avg without rpm could be a bike too (some sessions only log power)
    // only use this if the raw_type gives no further info
    const tgRaw = String(workout?.sources?.technogym?.raw_type || "").toLowerCase()
    if (powerAvg !== null && Number.isFinite(Number(powerAvg)) && tgRaw.includes("machine")) return "Cycling"

    const tgType = String(
      workout?.sources?.technogym?.type ||
      workout?.sources?.technogym?.raw_type ||
      workout?.sources?.technogym?.activity_type ||
      ""
    ).toLowerCase()

    if (tgType.includes("cycl") || tgType.includes("bike") || tgType.includes("spin")) return "Cycling"
    if (tgType.includes("run") || tgType.includes("tread")) return "Running"
    if (tgType.includes("row")) return "Rowing"
    if (tgType.includes("swim")) return "Swimming"
    if (tgType.includes("ellip")) return "Elliptical"
    if (tgType.includes("stair") || tgType.includes("climb")) return "Stairs"
    if (tgType.includes("strength") || tgType.includes("weight") || tgType.includes("train")) return "Strength"
    // Default Machine Cardio stays as-is so it still gets cardioMinutes credit
    if (t.includes("machine cardio")) return "Machine Cardio"
  }

  return "Other"
}

function formatBucketLabel(dateStr, mode) {
  const d = new Date(dateStr)
  if (!Number.isFinite(d.getTime())) return String(dateStr || "")

  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(-2)

  if (mode === "weekly") return `${dd}/${mm}`
  if (mode === "monthly") return `${dd}/${mm}`
  if (mode === "yearly") return `${mm}/${yy}`
  return `${mm}/${yy}`
}
function extractDistanceInfo(workout) {
  const pmDist = workout?.preferred_metrics?.distance

  const candidates = [
    {
      value: pmDist?.value,
      unit: pmDist?.unit || workout?.sources?.apple?.distance_unit || workout?.sources?.technogym?.distance_unit || (pmDist?.source === "Technogym" ? "m" : "")

    },
    {
      value: pmDist?.raw,
      unit: pmDist?.unit
    },
    {
      value: pmDist?.amount,
      unit: pmDist?.unit
    },
    {
      value: pmDist?.qty,
      unit: pmDist?.unit
    },
    {
      value: pmDist?.distance,
      unit: pmDist?.unit
    },

    {
      value: workout?.distance,
      unit: workout?.distance_unit || workout?.unit
    },
    {
      value: workout?.distanceMiles,
      unit: "mi"
    },
    {
      value: workout?.distance_miles,
      unit: "mi"
    },
    {
      value: workout?.miles,
      unit: "mi"
    },
    {
      value: workout?.distanceKm,
      unit: "km"
    },
    {
      value: workout?.distance_km,
      unit: "km"
    },
    {
      value: workout?.km,
      unit: "km"
    },
    {
      value: workout?.distanceMeters,
      unit: "m"
    },
    {
      value: workout?.distance_m,
      unit: "m"
    },
    {
      value: workout?.meters,
      unit: "m"
    },
    {
      value: workout?.total_distance,
      unit: workout?.total_distance_unit
    },
    {
      value: workout?.sources?.apple?.distance,
      unit: workout?.sources?.apple?.distance_unit
    },
    {
      value: workout?.sources?.technogym?.distance,
      unit: workout?.sources?.technogym?.distance_unit || "m"
    }
  ]

  for (const c of candidates) {
    const v = Number(c?.value)
    if (Number.isFinite(v) && v > 0) {
      return {
        value: v,
        unit: String(c?.unit || "").toLowerCase()
      }
    }
  }

  return { value: 0, unit: "" }
}


function extractDurationMin(workout) {
  const candidates = [
    workout?.dur,
    workout?.duration_min,
    workout?.durationMin,
    workout?.minutes,
    workout?.duration,
    workout?.preferred_metrics?.duration?.value,
    workout?.total_duration_min,
    // Canonical session nested sources
    workout?.sources?.apple?.duration_min,
    workout?.sources?.apple?.duration,
    workout?.sources?.technogym?.duration_min,
    workout?.sources?.technogym?.duration,
    workout?.overlap_summary?.duration_min
  ]

  for (const c of candidates) {
    const v = Number(c)
    if (Number.isFinite(v) && v > 0) {
      // Guard against seconds being returned as minutes (>600 min = implausible)
      if (v > 600) return v / 60
      return v
    }
  }

  return 0
}

function normalizeDistanceToMiles(workout) {
  const { value, unit } = extractDistanceInfo(workout)
  if (!Number.isFinite(value) || value <= 0) return 0

  if (
    unit === "mi" ||
    unit === "mile" ||
    unit === "miles"
  ) {
    return value
  }

  if (
    unit === "km" ||
    unit === "kilometer" ||
    unit === "kilometers"
  ) {
    return value / 1.60934
  }

  if (
    unit === "m" ||
    unit === "meter" ||
    unit === "meters"
  ) {
    return value / 1609.34
  }
  if (
    unit === "m" ||
    unit === "meter" ||
    unit === "meters"
  ) {
    return value / 1609.34
  }

  if (
    unit === "yd" ||
    unit === "yard" ||
    unit === "yards"
  ) {
    return value / 1760
  }

  if (workout?.source === "ManualSchedule") {
    return value
  }
  if (workout?.source === "ManualSchedule") {
    return value
  }

  if (workout?.source === "Technogym") {
    return value / 1609.34
  }

  if (workout?.sources?.technogym && !workout?.sources?.apple) {
    return value / 1609.34
  }

  if (workout?.sources?.technogym && workout?.sources?.apple) {
    return value / 1609.34
  }

  return value
}

function summarizeDailyNutrition(entries) {
  const grouped = {}

  ;(Array.isArray(entries) ? entries : []).forEach(entry => {
    const date = entry.date || null
    if (!date) return

    if (!grouped[date]) {
      grouped[date] = {
        date,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0
      }
    }

    grouped[date].calories += Number(entry.calories || 0)
    grouped[date].protein_g += Number(entry.protein_g || 0)
    grouped[date].carbs_g += Number(entry.carbs_g || 0)
    grouped[date].fat_g += Number(entry.fat_g || 0)
  })

  return Object.values(grouped).sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || ""))
  )
}

function roundToNearest(value, step = 25) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value / step) * step
}

function estimateDynamicCalorieTarget({
  currentWeight,
  estimatedMaintenance,
  primaryGoal = 150,
  lowerGoal = 145,
  minimumCalories = 1200
}) {
  const weight = Number(currentWeight || 0)
  const maintenance = Number(estimatedMaintenance || 0)

  if (!Number.isFinite(weight) || !Number.isFinite(maintenance) || maintenance <= 0) {
    return {
      estimatedMaintenance: maintenance || 0,
      targetCalories: minimumCalories,
      deficit: 0,
      phase: "unknown",
      distanceTo150: null,
      distanceTo145: null
    }
  }

  const distanceTo150 = weight - primaryGoal
  const distanceTo145 = weight - lowerGoal

  let deficit = 0
  let phase = "maintenance"

  if (weight <= lowerGoal) {
    deficit = 0
    phase = "at_or_below_145"
  } else if (weight <= primaryGoal) {
    deficit = 100
    phase = "between_145_and_150"
  } else if (distanceTo150 >= 30) {
    deficit = 450
    phase = "aggressive_cut"
  } else if (distanceTo150 >= 20) {
    deficit = 375
    phase = "standard_cut"
  } else if (distanceTo150 >= 10) {
    deficit = 275
    phase = "moderate_cut"
  } else if (distanceTo150 >= 5) {
    deficit = 175
    phase = "gentle_cut"
  } else {
    deficit = 100
    phase = "goal_approach"
  }

  const targetCalories = Math.max(
    minimumCalories,
    roundToNearest(maintenance - deficit, 25)
  )

  return {
    estimatedMaintenance: maintenance,
    targetCalories,
    deficit,
    phase,
    distanceTo150: Math.round(distanceTo150 * 10) / 10,
    distanceTo145: Math.round(distanceTo145 * 10) / 10
  }
}

const normalizedActiveWorkouts = useMemo(() => {
  return activeWorkouts.map(w => {
    const rawType = w.canonical_type || w.type || "Other"
    const category = normalizeWorkoutType(rawType, w)

    // Normalize date: canonical sessions use "2026-01-01 15:46:19 -0600" or ISO format
    let dateStr = w.date || null
    if (!dateStr && w.start_date) {
      // Replace space-separated offset format to make it parseable
      const raw = String(w.start_date)
const cleaned = raw.replace(/ ([+-])/, 'T$1')
const d = new Date(cleaned)
dateStr = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) + 'T12:00:00' : null
    }

    // For indoor sessions with no GPS distance, derive a duration-based proxy
    let distance = normalizeDistanceToMiles(w)
    if (distance === 0) {
      const dur = extractDurationMin(w)
      if (dur > 0) {
        if (category === "Cycling") distance = dur / 3.0       // ~20 mph indoor equivalent
        else if (category === "Machine Cardio") distance = dur / 4.5  // conservative fallback
        else if (category === "Rowing") distance = dur / 5.0
      }
    }

    return {
      ...w,
      date: dateStr,
      dateTime: dateStr,
      type: rawType,
      category,
      distance,
      calories: w.preferred_metrics?.calories?.value ?? w.calories ?? 0,
      hr: w.preferred_metrics?.hr?.value ?? w.hr ?? null,
      dur: extractDurationMin(w)
    }
  })
}, [activeWorkouts])
function sameDay(a, b) {
  return String(a || "").slice(0, 10) === String(b || "").slice(0, 10)
}
function closeEnough(a, b, tol = 10) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol
}
const normalizedStoredWorkouts = useMemo(() => {
  return (Array.isArray(storedWorkouts) ? storedWorkouts : []).map(w => {
    const rawType = w.type || "Other"
    const category = normalizeWorkoutType(rawType, w)

    return {
      ...w,
      source: "ManualSchedule",
      date: w.date || null,
      time: w.time || "",
      dateTime: w.dateTime || (w.date && w.time ? `${w.date}T${w.time}` : w.date || null),
      type: rawType,
      category,
      distance: normalizeDistanceToMiles(w),
      calories: Number(w.calories || 0),
      hr: w.hr != null ? Number(w.hr) : null,
      dur: extractDurationMin(w)
    }
  })
}, [storedWorkouts])

const operationalWorkouts = useMemo(() => {
  const imported = Array.isArray(normalizedActiveWorkouts) ? normalizedActiveWorkouts : []
  const manual = Array.isArray(normalizedStoredWorkouts) ? normalizedStoredWorkouts : []

  return [...imported, ...manual].sort((a, b) =>
    String(a.dateTime || a.date || "").localeCompare(String(b.dateTime || b.date || ""))
  )
}, [normalizedActiveWorkouts, normalizedStoredWorkouts])


const [session, setSession] = useState(null)
const [email, setEmail] = useState("avidal@ilstu.edu")
const [authMsg, setAuthMsg] = useState("")
  const [hydrated, setHydrated] = useState(false)

  const [mealEntries, setMealEntries] = useState([])
  const [mealPresets, setMealPresets] = useState(defaultMealPresets)
const dailyNutritionSummary = useMemo(() => {
  return summarizeDailyNutrition(mealEntries)
}, [mealEntries])
  const [showMealDialog, setShowMealDialog] = useState(false)
  const [mealDate, setMealDate] = useState(todayISO())
  const [mealTab, setMealTab] = useState("Breakfast")
  const [customMealName, setCustomMealName] = useState("")
  const [customMeal, setCustomMeal] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" })
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [rawNutrition, setRawNutrition] = useState({ breakfast: "", lunch: "", dinner: "", snacks: "" })
console.log("canonical sessions loaded:", canonicalSessions.length)
useEffect(() => {
  console.log(
    "types:",
    [...new Set(normalizedActiveWorkouts.map(w => w.type))].sort()
  )
}, [normalizedActiveWorkouts])
 

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

        const bw = await fetch(`${base}data/body_weight.json`).then(r => r.ok ? r.json() : []).catch(() => [])
        const dx = await fetch(`${base}data/dexa_summary.json`).then(r => {
          if (!r.ok) throw new Error("dexa_summary.json failed")
          return r.json()
        })
        const w = await fetch(`${base}data/workouts_merged.json`).then(r => {
          if (!r.ok) throw new Error("workouts_merged.json failed")
          return r.json()
        })
        const cs = await fetch(`${base}data/workout_sessions_canonical.json`).then(r => {
  if (!r.ok) throw new Error("workout_sessions_canonical.json failed")
  return r.json()
})
        const bwRows = Array.isArray(bw) ? bw : []
        const dailyMap = {}
        ;(Array.isArray(d) ? d : []).forEach(row => { if (row.date) dailyMap[row.date] = row })
        bwRows.forEach(row => {
          if (dailyMap[row.date] == null) dailyMap[row.date] = row
          else dailyMap[row.date] = { ...dailyMap[row.date], weight_lb: row.weight_lb }
        })
        const mergedDaily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))
        setDaily(mergedDaily)
        setNutrition(Array.isArray(n) ? n : [])
        setInjury(Array.isArray(i) ? i : [])
        setDexa(Array.isArray(dx) ? dx : [])
        setWorkouts(Array.isArray(w) ? w : [])
        setCanonicalSessions(Array.isArray(cs?.all_sessions) ? cs.all_sessions : [])
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

  const sub = supabase.auth.onAuthStateChange(async (_evt, sess) => {
    setSession(sess)

    if (sess?.user?.id) {
      const localMeals = JSON.parse(localStorage.getItem("ufd-meal-entries") || "[]")

      if (localMeals.length > 0) {
        console.log("Migrating local meals to Supabase...")

        try {
          await syncMealsToSupabase(localMeals, sess.user.id)
          localStorage.removeItem("ufd-meal-entries")
        } catch (err) {
          console.error("Meal migration failed:", err)
        }
      }
    }
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
  useEffect(() => {
  ;(async () => {
    const wo = await store.get("ufd-workouts")
    if (Array.isArray(wo)) setStoredWorkouts(wo)
  })()
}, [])

useEffect(() => {
  if (!hydrated) return
  if (!session?.user?.id) return

  ;(async () => {
    try {
      await syncMealsToSupabase(mealEntries, session.user.id)
    } catch (err) {
      const msg = err?.message || "Unknown sync error"
      console.error("Initial meal sync failed:", err)
      setAuthMsg(`Meal sync failed: ${msg}`)
    }
  })()
}, [hydrated, session?.user?.id])
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
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - selectedRangePoints)
  cutoff.setHours(0, 0, 0, 0)
  return daily.filter(row => {
    const d = new Date(String(row.date || "").slice(0, 10) + "T12:00:00")
    return Number.isFinite(d.getTime()) && d >= cutoff
  })
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
    const currentWeight =
      Number(d.weight_lb ?? d.weight ?? d.weight_lbs_mean)

    const start = Math.max(0, i - 6)
    const subset = filteredDaily
      .slice(start, i + 1)
      .map(x => Number(x.weight_lb ?? x.weight ?? x.weight_lbs_mean))
      .filter(v => !Number.isNaN(v) && Number.isFinite(v))

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

const overviewWeightDomain = useMemo(() => {
  const vals = weightSmoothed
    .map(row => Number(row.weight))
    .filter(v => Number.isFinite(v) && v > 0)

  if (!vals.length) return [140, 190]

  return [
    Math.floor(Math.min(...vals)) - 2,
    Math.ceil(Math.max(...vals)) + 2
  ]
}, [weightSmoothed])
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

const latestDate = new Date()
const cutoff = new Date(latestDate)
cutoff.setDate(cutoff.getDate() - selectedRangePoints)

  return nutritionSeries.filter(row => {
    if (!row.date) return false
    const rowDate = new Date(`${row.date}T00:00:00`)
    return rowDate >= cutoff && rowDate <= latestDate
  })
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

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: e
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
async function syncMealsToSupabase(entries, currentUserId) {
  if (!supabase || !currentUserId) return

  const rows = (entries || []).map(m => ({
    id: crypto.randomUUID(),
    user_id: currentUserId,
    logged_at: m.created_at || new Date().toISOString(),
    meal_date: m.date,
    meal_type: m.meal_type,
    label: m.preset_name ?? m.name ?? m.meal_type ?? null,
    calories: Number(m.calories ?? 0),
    protein_g: Number(m.protein_g ?? 0),
    carbs_g: Number(m.carbs_g ?? 0),
    fat_g: Number(m.fat_g ?? 0),
    fiber_g: Number(m.fiber_g ?? 0),
    source: "app"
  }))

  const { error: deleteError } = await supabase
    .from("meals")
    .delete()
    .eq("user_id", currentUserId)

  if (deleteError) {
    console.error("Meal sync delete error:", deleteError)
    throw deleteError
  }

  if (rows.length > 0) {
    const { data, error: insertError } = await supabase
      .from("meals")
      .insert(rows)
      .select()

    if (insertError) {
      console.error("Meal sync insert error:", insertError)
      throw insertError
    }

    console.log("Meals synced:", data)
  }
}
async function loadMealsFromSupabase(userId) {
  if (!supabase || !userId) return

  const { data, error } = await supabase
    .from("meals")
    .select("*")
    .eq("user_id", userId)
    .order("meal_date", { ascending: true })

  if (error) {
    console.error("Meal load error:", error)
    return
  }

  const rows = (data || []).map(r => ({
    id: r.id,
    date: r.meal_date,
    meal_type: r.meal_type,
    preset_name: r.label,
    calories: r.calories,
    protein_g: r.protein_g,
    carbs_g: r.carbs_g,
    fat_g: r.fat_g,
    fiber_g: r.fiber_g,
    created_at: r.logged_at
  }))

  setMealEntries(rows)
}
async function persistMealEntries(nextEntries) {
  setMealEntries(nextEntries)

  await store.set("ufd-meal-entries", nextEntries)

  const currentUserId = session?.user?.id
  if (!currentUserId) {
    console.log("No active session, meals saved locally only.")
    return
  }

  try {
    await syncMealsToSupabase(nextEntries, currentUserId)
  } catch (err) {
    const msg = err?.message || "Unknown sync error"
    console.error("Meal sync failed:", err)
    setAuthMsg(`Meal sync failed: ${msg}`)
  }
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

const trainingSummary = useMemo(() => {
  return buildTrainingSummary(operationalWorkouts)
}, [operationalWorkouts])

const weeklyTrainingBuckets = useMemo(() => {
  return buildWeeklyTrainingBuckets(operationalWorkouts)
}, [operationalWorkouts])
useEffect(() => {
  console.log("LIFT ingestion check")
  console.log("operationalWorkouts count:", operationalWorkouts?.length ?? 0)
  console.log("trainingSummary:", trainingSummary)
  console.log("weeklyTrainingBuckets last 6:", weeklyTrainingBuckets?.slice?.(-6) ?? [])
}, [operationalWorkouts, trainingSummary, weeklyTrainingBuckets])
const trainingLoadChartData = useMemo(() => {
  if (!weeklyTrainingBuckets?.length) return []

  const daysByRange = {
    "30D": 30,
    "90D": 90,
    "180D": 180,
    "1Y": 365,
    "ALL": null
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const cutoffDays = daysByRange[rangeKey] ?? 180

  let visibleBuckets = weeklyTrainingBuckets

  if (cutoffDays != null) {
    visibleBuckets = weeklyTrainingBuckets.filter(w => {
      const dt = new Date(w.weekStart)
      if (Number.isNaN(dt.getTime())) return false
      const diffDays = Math.floor((today - dt) / (1000 * 60 * 60 * 24))
      return diffDays <= cutoffDays
    })
  }

  if (!visibleBuckets.length) return []

const maxLoadVisible = Math.max(
  ...visibleBuckets.map(w =>
    (w.running || 0) +
    (w.swimming || 0) +
    (w.cycling || 0) * 0.4 +
    (w.strength || 0) * 2 +
    (w.cardioMinutes || 0) * 0.08
  ),
  1
)

  return visibleBuckets.map((w, i) => ({
    label: fmtShortDate(w.weekStart),
    running: w.running ?? 0,
    swimming: w.swimming ?? 0,
    cycling: w.cycling ?? 0,
    strength: w.strength ?? 0,
trainingLoadPct: Math.round(((
  (w.running || 0) +
  (w.swimming || 0) +
  (w.cycling || 0) * 0.4 +
  (w.strength || 0) * 2 +
  (w.cardioMinutes || 0) * 0.08
) / maxLoadVisible) * 100),

  }))
}, [weeklyTrainingBuckets, rangeKey])
const vo2ProxyData = useMemo(() => {
  const runs = (operationalWorkouts || [])
    .map(w => {
      const type = String(
        w?.type ||
        w?.canonical_type ||
        w?.activityType ||
        w?.sport ||
        w?.category ||
        ""
      ).toLowerCase()

      const isRun =
        type.includes("run") ||
        type.includes("jog") ||
        type === "running"

      if (!isRun) return null

      const date =
        w?.date ||
        (w?.dateTime ? String(w.dateTime).slice(0, 10) : null) ||
        (w?.start_date ? String(w.start_date).slice(0, 10) : null)

      const distanceMiles =
        Number(w?.distance) ||
        Number(w?.distanceMiles) ||
        Number(w?.miles) ||
        Number(w?.distance_miles) ||
        0

      const durationMin =
        Number(w?.dur) ||
        Number(w?.durationMin) ||
        Number(w?.duration_min) ||
        Number(w?.minutes) ||
        Number(w?.duration) ||
        0

      if (!date || distanceMiles <= 0 || durationMin <= 0) return null

      const paceMinPerMile = durationMin / distanceMiles
      if (!Number.isFinite(paceMinPerMile) || paceMinPerMile <= 0) return null

      const metersPerMin = 1609.34 / paceMinPerMile
      const vo2 =
        -4.6 +
        (0.182258 * metersPerMin) +
        (0.000104 * metersPerMin * metersPerMin)

      return {
        date,
        label: fmtShortDate(date),
        vo2: Number(vo2.toFixed(1)),
        paceMinPerMile: Number(paceMinPerMile.toFixed(2)),
        distanceMiles: Number(distanceMiles.toFixed(2)),
        durationMin: Number(durationMin.toFixed(1))
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return runs
}, [operationalWorkouts])

const vo2ProxySmoothed = useMemo(() => {
  if (!vo2ProxyData.length) return []

  return vo2ProxyData.map((row, i) => {
    const start = Math.max(0, i - 4)
    const subset = vo2ProxyData
      .slice(start, i + 1)
      .map(x => Number(x.vo2))
      .filter(Number.isFinite)

    const avg = subset.length
      ? subset.reduce((a, b) => a + b, 0) / subset.length
      : null

    return {
      ...row,
      vo2_5pt: avg == null ? null : Number(avg.toFixed(1))
    }
  })
}, [vo2ProxyData])
const vo2ProxySummary = useMemo(() => {
  if (!vo2ProxySmoothed.length) {
    return {
      count: 0,
      latestRaw: null,
      latestSmoothed: null,
      bestRaw: null,
      bestSmoothed: null
    }
  }

  const latest = vo2ProxySmoothed[vo2ProxySmoothed.length - 1]

  const rawVals = vo2ProxySmoothed
    .map(r => Number(r.vo2))
    .filter(Number.isFinite)

  const smoothVals = vo2ProxySmoothed
    .map(r => Number(r.vo2_5pt))
    .filter(Number.isFinite)

  return {
    count: vo2ProxySmoothed.length,
    latestRaw: Number.isFinite(Number(latest?.vo2)) ? Number(latest.vo2) : null,
    latestSmoothed: Number.isFinite(Number(latest?.vo2_5pt)) ? Number(latest.vo2_5pt) : null,
    bestRaw: rawVals.length ? Math.max(...rawVals) : null,
    bestSmoothed: smoothVals.length ? Math.max(...smoothVals) : null
  }
}, [vo2ProxySmoothed])

useEffect(() => {
  const runLike = (operationalWorkouts || []).filter(w => {
    const type = String(
      w?.type ||
      w?.canonical_type ||
      w?.activityType ||
      w?.sport ||
      w?.category ||
      ""
    ).toLowerCase()

    return type.includes("run") || type.includes("jog") || type === "running"
  })

  const runLikeWithDistance = runLike.filter(w => {
    const distanceMiles =
      Number(w?.distance) ||
      Number(w?.distanceMiles) ||
      Number(w?.miles) ||
      Number(w?.distance_miles) ||
      0

    const durationMin =
      Number(w?.dur) ||
      Number(w?.durationMin) ||
      Number(w?.duration_min) ||
      Number(w?.minutes) ||
      Number(w?.duration) ||
      0

    return distanceMiles > 0 && durationMin > 0
  })

  console.log("VO2 proxy check")
  console.log("operationalWorkouts count:", operationalWorkouts?.length ?? 0)
  console.log("run-like count:", runLike.length)
  console.log("run-like with distance+dur count:", runLikeWithDistance.length)
  console.log("vo2ProxyData count:", vo2ProxyData?.length ?? 0)
  console.log("vo2ProxySummary:", vo2ProxySummary)
  console.log("vo2ProxyData first 5:", vo2ProxyData?.slice?.(0, 5) ?? [])
  console.log("vo2ProxySmoothed last 5:", vo2ProxySmoothed?.slice?.(-5) ?? [])
}, [operationalWorkouts, vo2ProxyData, vo2ProxySmoothed, vo2ProxySummary])

useEffect(() => {
  const runLike = (operationalWorkouts || []).filter(w => {
    const type = String(
      w?.type ||
      w?.canonical_type ||
      w?.activityType ||
      w?.sport ||
      w?.category ||
      ""
    ).toLowerCase()

    return (
      type.includes("run") ||
      type.includes("jog") ||
      type === "running"
    )
  })

  const runDistanceAudit = runLike.map(w => ({
    date: w?.date ?? null,
    start_date: w?.start_date ?? null,
    end_date: w?.end_date ?? null,
    type: w?.type ?? null,
    canonical_type: w?.canonical_type ?? null,

    distance: w?.distance ?? null,
    dur: w?.dur ?? null,

    preferred_distance_value: w?.preferred_metrics?.distance?.value ?? null,
    preferred_distance_json: (() => {
      try {
        return JSON.stringify(w?.preferred_metrics?.distance ?? null)
      } catch {
        return null
      }
    })(),

    apple_distance: w?.sources?.apple?.distance ?? null,
    apple_source_json: (() => {
      try {
        return JSON.stringify(w?.sources?.apple ?? null)
      } catch {
        return null
      }
    })(),

    technogym_distance: w?.sources?.technogym?.distance ?? null,
    technogym_source_json: (() => {
      try {
        return JSON.stringify(w?.sources?.technogym ?? null)
      } catch {
        return null
      }
    })(),

    normalized_distance_from_helper: normalizeDistanceToMiles(w),
    extracted_duration_min: extractDurationMin(w)
  }))

  console.log("VO2 run distance audit summary:", {
    total_runs: runDistanceAudit.length,
    runs_with_existing_distance_field: runDistanceAudit.filter(r =>
      Number.isFinite(Number(r.distance)) && Number(r.distance) > 0
    ).length,
    runs_with_any_source_distance: runDistanceAudit.filter(r =>
      Number.isFinite(Number(r.preferred_distance_value)) ||
      Number.isFinite(Number(r.apple_distance)) ||
      Number.isFinite(Number(r.technogym_distance))
    ).length,
    runs_with_normalized_distance_from_helper: runDistanceAudit.filter(r =>
      Number.isFinite(Number(r.normalized_distance_from_helper)) &&
      Number(r.normalized_distance_from_helper) > 0
    ).length,
    runs_with_existing_duration_field: runDistanceAudit.filter(r =>
      Number.isFinite(Number(r.dur)) && Number(r.dur) > 0
    ).length,
    runs_with_extracted_duration: runDistanceAudit.filter(r =>
      Number.isFinite(Number(r.extracted_duration_min)) &&
      Number(r.extracted_duration_min) > 0
    ).length
  })

  console.log("VO2 run distance audit first 10:", runDistanceAudit.slice(0, 10))
}, [operationalWorkouts])



const vo2OverviewDomain = useMemo(() => {
  const vals = vo2ProxySmoothed
    .flatMap(row => [Number(row.vo2), Number(row.vo2_5pt)])
    .filter(v => Number.isFinite(v) && v > 0)

  if (!vals.length) return [20, 50]

  return [
    Math.floor(Math.min(...vals)) - 2,
    Math.ceil(Math.max(...vals)) + 2
  ]
}, [vo2ProxySmoothed])
const trainingLoadDistanceMax = useMemo(() => {
  if (!trainingLoadChartData?.length) return 12

  const vals = trainingLoadChartData.flatMap(row => [
    Number(row.running || 0),
    Number(row.swimming || 0),
    Number(row.cycling || 0)
  ]).filter(Number.isFinite)

  if (!vals.length) return 12

  const maxVal = Math.max(...vals)
  return Math.max(6, Math.ceil(maxVal * 1.1))
}, [trainingLoadChartData])
const bodyForecast = useMemo(() => {
  return buildBodyForecast({
    daily,
    nutritionRows: dailyNutritionSummary,
    recentCardioMinutes: trainingSummary?.cardioMinutesWeekly || 0,
    bmr: null
  })
}, [daily, dailyNutritionSummary, trainingSummary])

const injuryPenalties = useMemo(() => {
  return getInjuryPenalties()
}, [tab, activeWorkouts])
const latestTrainingLoadPct = useMemo(() => {
  const last = weeklyTrainingBuckets?.[weeklyTrainingBuckets.length - 1]
  if (!last) return null
  return Math.round((Number(last.trainingLoad || 0)) * 100)
}, [weeklyTrainingBuckets])



const operationalScore = useMemo(() => {
  const vals = [
    injuryPenalties?.running ?? 1,
    injuryPenalties?.swimming ?? 1,
    injuryPenalties?.cycling ?? 1,
    injuryPenalties?.lifting ?? 1
  ]
    .map(Number)
    .filter(Number.isFinite)

  const pct = vals.length
    ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100)
    : 100

  const background =
    pct >= 85
      ? "rgba(34,197,94,0.16)"
      : pct >= 60
      ? "rgba(250,204,21,0.16)"
      : "rgba(239,68,68,0.16)"

  return { pct, background }
}, [injuryPenalties])
const operationalCapacityData = useMemo(() => {
  const entries = Array.isArray(injury) ? injury : []
  if (!entries.length) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const parseDate = value => {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const daysBetween = (a, b) =>
    Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))

  const classifyInjury = row => {
    const text = String(
      row?.type ||
      row?.injury_type ||
      row?.category ||
      row?.name ||
      row?.label ||
      ""
    ).toLowerCase()

    if (
      text.includes("flu") ||
      text.includes("covid") ||
      text.includes("cold") ||
      text.includes("virus") ||
      text.includes("strep") ||
      text.includes("infection") ||
      text.includes("illness")
    ) {
      return "disease"
    }

    if (
      text.includes("fatigue") ||
      text.includes("sore") ||
      text.includes("soreness") ||
      text.includes("sleep") ||
      text.includes("recovery") ||
      text.includes("tired")
    ) {
      return "fatigue"
    }

    return "acute"
  }

  const categoryTau = {
    acute: 28,
    disease: 10,
    fatigue: 5
  }

  const getSeverity = row => {
    const val =
      Number(row?.severity) ||
      Number(row?.severityScore) ||
      Number(row?.score) ||
      0

    return Math.max(0, Math.min(10, val))
  }

  const getPeakLoss = row => {
    const severity = getSeverity(row)
    return Math.max(0, Math.min(0.8, severity / 10))
  }

  const datedEntries = entries
    .map(row => {
      const start =
        parseDate(row?.date) ||
        parseDate(row?.start_date) ||
        parseDate(row?.startDate)

      if (!start) return null

      return {
        ...row,
        _start: start,
        _category: classifyInjury(row),
        _peakLoss: getPeakLoss(row)
      }
    })
    .filter(Boolean)
    .sort((a, b) => a._start - b._start)

  if (!datedEntries.length) return []

  const firstDate = new Date(datedEntries[0]._start)
  firstDate.setHours(0, 0, 0, 0)

  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 60)

  const series = []

  for (
    let d = new Date(firstDate);
    d <= endDate;
    d.setDate(d.getDate() + 1)
  ) {
    const acuteLoss = datedEntries
      .filter(e => e._category === "acute")
      .reduce((sum, e) => {
        const age = daysBetween(d, e._start)
        if (age < 0) return sum
        const tau = categoryTau.acute
        return sum + e._peakLoss * Math.exp(-age / tau)
      }, 0)

    const diseaseLoss = datedEntries
      .filter(e => e._category === "disease")
      .reduce((sum, e) => {
        const age = daysBetween(d, e._start)
        if (age < 0) return sum
        const tau = categoryTau.disease
        return sum + e._peakLoss * Math.exp(-age / tau)
      }, 0)

    const fatigueLoss = datedEntries
      .filter(e => e._category === "fatigue")
      .reduce((sum, e) => {
        const age = daysBetween(d, e._start)
        if (age < 0) return sum
        const tau = categoryTau.fatigue
        return sum + e._peakLoss * Math.exp(-age / tau)
      }, 0)

    const totalMultiplier =
      Math.max(0, 1 - acuteLoss) *
      Math.max(0, 1 - diseaseLoss) *
      Math.max(0, 1 - fatigueLoss)

    series.push({
      date: d.toISOString().slice(0, 10),
      label: fmtShortDate(d.toISOString().slice(0, 10)),
      acuteLossPct: Number((acuteLoss * 100).toFixed(1)),
      diseaseLossPct: Number((diseaseLoss * 100).toFixed(1)),
      fatigueLossPct: Number((fatigueLoss * 100).toFixed(1)),
      operationalPct: Number((totalMultiplier * 100).toFixed(1))
    })
  }

  return series
}, [injury])

const operationalCapacityDomain = useMemo(() => {
  return [0, 100]
}, [])
const bodyCompositionOverviewData = useMemo(() => {
  const dexaPts = Array.isArray(dexaSeries)
    ? dexaSeries
        .filter(row => row?.date)
        .map(row => ({
          date: row.date,
          label: fmtShortDate(row.date),
          dexaBF: row?.pct_fat != null ? Number(row.pct_fat) : null,
          estimatedBF: null
        }))
    : []

  const currentPt =
    estimatedCurrentBF != null
      ? [{
          date: new Date().toISOString().slice(0, 10),
          label: daily?.length ? fmtShortDate(daily[daily.length - 1]?.date) : "Current",
          dexaBF: null,
          estimatedBF: Number(estimatedCurrentBF)
        }]
      : []

  const merged = [...dexaPts, ...currentPt]
    .filter(row => row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return merged
}, [dexaSeries, estimatedCurrentBF, daily])

const bodyCompositionOverviewDomain = useMemo(() => {
  const vals = bodyCompositionOverviewData
    .flatMap(row => [Number(row.dexaBF), Number(row.estimatedBF)])
    .filter(v => Number.isFinite(v) && v > 0)

  if (!vals.length) return [10, 35]

  return [
    Math.floor(Math.min(...vals)) - 1,
    Math.ceil(Math.max(...vals)) + 1
  ]
}, [bodyCompositionOverviewData])
const trainingForecast = useMemo(() => {
  return buildTrainingForecast(trainingSummary, injuryPenalties, weeklyTrainingBuckets)
}, [trainingSummary, injuryPenalties, weeklyTrainingBuckets])

const enduranceForecast = useMemo(() => {
  return buildEnduranceForecast({
    workouts: operationalWorkouts,
    trainingSummary,
    penalties: injuryPenalties
  })
}, [operationalWorkouts, trainingSummary, injuryPenalties])

const racePrediction = useMemo(() => {
  return buildRacePrediction(enduranceForecast)
}, [enduranceForecast])
const readinessProjectionData = useMemo(() => {
  if (!enduranceForecast) return []

  const anchors = [
    { month: 0, readiness: Number(enduranceForecast.readinessNow ?? 0) },
    { month: 1, readiness: Number(enduranceForecast.readiness1m ?? 0) },
    { month: 3, readiness: Number(enduranceForecast.readiness3m ?? 0) },
    { month: 6, readiness: Number(enduranceForecast.readiness6m ?? 0) },
    { month: 12, readiness: Number(enduranceForecast.readiness12m ?? 0) }
  ].filter(d => Number.isFinite(d.readiness))

  if (!anchors.length) return []

  const interpolateBaseReadiness = month => {
    if (month <= anchors[0].month) return anchors[0].readiness

    for (let i = 1; i < anchors.length; i += 1) {
      const prev = anchors[i - 1]
      const curr = anchors[i]

      if (month <= curr.month) {
        const frac = (month - prev.month) / (curr.month - prev.month || 1)
        return prev.readiness + frac * (curr.readiness - prev.readiness)
      }
    }

    const last = anchors[anchors.length - 1]
    const prev = anchors.length > 1 ? anchors[anchors.length - 2] : last
    const slope = (last.readiness - prev.readiness) / (last.month - prev.month || 1)

    return Math.max(0, Math.min(100, last.readiness + slope * (month - last.month)))
  }

const eventThresholds = {
  fiveK: 45,
  tenK: 58,
  half: 70,
  tri: 88
}

  const logisticPct = (baseReadiness, threshold, steepness = 0.18) => {
    const x = baseReadiness - threshold
    return Math.max(0, Math.min(100, 100 / (1 + Math.exp(-steepness * x))))
  }

  const maxMonth = 24
  const series = []

  for (let month = 0; month <= maxMonth; month += 1) {
    const base = interpolateBaseReadiness(month)

    series.push({
      month,
      label: month === 0 ? "Now" : `${month}M`,
      baseReadiness: Number(base.toFixed(1)),
      fiveK: Number(logisticPct(base, eventThresholds.fiveK, 0.30).toFixed(1)),
tenK: Number(logisticPct(base, eventThresholds.tenK, 0.24).toFixed(1)),
half: Number(logisticPct(base, eventThresholds.half, 0.20).toFixed(1)),
tri: Number(logisticPct(base, eventThresholds.tri, 0.18).toFixed(1))
    })
  }

  return series
}, [enduranceForecast])
const eventReadinessMarkers = useMemo(() => {
  if (!readinessProjectionData?.length) return []

  const defs = [
    { key: "fiveK", label: "5K", color: "#ef4444" },
    { key: "tenK", label: "10K", color: "#22c55e" },
    { key: "half", label: "Half", color: "#facc15" },
    { key: "tri", label: "Tri", color: "#a78bfa" }
  ]

  const targetPct = 80

  const findReadyMonth = key => {
    const hit = readinessProjectionData.find(d => Number(d[key] || 0) >= targetPct)
    return hit ? hit.month : null
  }

  return defs.map(d => ({
    ...d,
    month: findReadyMonth(d.key),
    targetPct
  }))
}, [readinessProjectionData])
const readinessProjectionMaxMonth = useMemo(() => {
  const dataMax = readinessProjectionData.length
    ? Math.max(...readinessProjectionData.map(d => Number(d.month || 0)))
    : 12

  const markerVals = eventReadinessMarkers
    .map(m => (m.month == null ? null : Number(m.month)))
    .filter(Number.isFinite)

  const markerMax = markerVals.length ? Math.max(...markerVals) : 12

  return Math.max(12, Math.ceil(markerMax), Math.ceil(dataMax))
}, [readinessProjectionData, eventReadinessMarkers])
const cardioMinutesForecastChart = useMemo(() => {
  if (!weeklyTrainingBuckets || !weeklyTrainingBuckets.length) return []

  const lastBucket = weeklyTrainingBuckets[weeklyTrainingBuckets.length - 1]
  const baseDate = new Date(lastBucket.weekStart)

  const actual = weeklyTrainingBuckets.map(w => ({
    label: formatBucketLabel(new Date(w.weekStart), "monthly"),
    actual: Number(w.cardioMinutes || 0),
    forecast: null
  }))

  const projected = [
    { weeks: 4, value: trainingForecast.cardioMinutes1m },
    { weeks: 13, value: trainingForecast.cardioMinutes3m },
    { weeks: 26, value: trainingForecast.cardioMinutes6m },
    { weeks: 52, value: trainingForecast.cardioMinutes12m }
  ].map(({ weeks, value }) => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + weeks * 7)

    return {
      label: formatBucketLabel(d, "monthly"),
      actual: null,
      forecast: Number(value || 0)
    }
  })

return [...actual, ...projected]
}, [weeklyTrainingBuckets, trainingForecast])

// Body weight forecast chart: last 90 days of actuals + projected points
const bodyWeightForecastChart = useMemo(() => {
  if (!bodyForecast || !weightSmoothed.length) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 90)

  const actuals = weightSmoothed
    .filter(d => new Date(d.date) >= cutoff)
    .map(d => ({
      label: fmtShortDate(d.date),
      actual: d.avg != null ? Number(d.avg.toFixed(1)) : null,
      forecast: null,
      phase1: null,
      target: null
    }))

  const addFuture = (days, value) => {
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return {
      label: fmtShortDate(d.toISOString().slice(0, 10)),
      actual: null,
      forecast: Number(value.toFixed(1)),
      phase1: bodyForecast.phase1TargetWeight,
      target: bodyForecast.finalTargetWeight
    }
  }

  const projected = [
    addFuture(30,  bodyForecast.weight1m),
    addFuture(90,  bodyForecast.weight3m),
    addFuture(180, bodyForecast.weight6m),
    addFuture(365, bodyForecast.weight12m)
  ]

  return [...actuals, ...projected]
}, [weightSmoothed, bodyForecast])

// Per-modality volume forecast charts (actuals from weeklyBuckets + projected points)
const makeVolumeForecastChart = (field, forecastKeys) => {
  if (!weeklyTrainingBuckets?.length || !trainingForecast) return []
  const lastBucket = weeklyTrainingBuckets[weeklyTrainingBuckets.length - 1]
  const baseDate = new Date(lastBucket.weekStart)

  const actual = weeklyTrainingBuckets.slice(-24).map(w => ({
    label: formatBucketLabel(new Date(w.weekStart), "monthly"),
    actual: Number(w[field] || 0),
    forecast: null
  }))

  const projected = [
    { weeks: 4,  value: trainingForecast[forecastKeys[0]] },
    { weeks: 13, value: trainingForecast[forecastKeys[1]] },
    { weeks: 26, value: trainingForecast[forecastKeys[2]] },
    { weeks: 52, value: trainingForecast[forecastKeys[3]] }
  ].map(({ weeks, value }) => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + weeks * 7)
    return {
      label: formatBucketLabel(d, "monthly"),
      actual: null,
      forecast: Number((value || 0).toFixed(2))
    }
  })

  return [...actual, ...projected]
}

const runningForecastChart  = useMemo(() =>
  makeVolumeForecastChart("running",  ["running1m",  "running3m",  "running6m",  "running12m"]),
  [weeklyTrainingBuckets, trainingForecast])

const swimmingForecastChart = useMemo(() =>
  makeVolumeForecastChart("swimming", ["swimming1m", "swimming3m", "swimming6m", "swimming12m"]),
  [weeklyTrainingBuckets, trainingForecast])

const cyclingForecastChart  = useMemo(() =>
  makeVolumeForecastChart("cycling",  ["cycling1m",  "cycling3m",  "cycling6m",  "cycling12m"]),
  [weeklyTrainingBuckets, trainingForecast])

const strengthForecastChart = useMemo(() =>
  makeVolumeForecastChart("strength", ["strength1m", "strength3m", "strength6m", "strength12m"]),
  [weeklyTrainingBuckets, trainingForecast])

const recentNutrition = useMemo(() => {
  const rows = dailyNutritionSummary.slice(-7)

  if (!rows.length) {
    return {
      avgCalories: 0,
      avgProtein: 0
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.calories += Number(r.calories || 0)
      acc.protein += Number(r.protein_g || 0)
      return acc
    },
    { calories: 0, protein: 0 }
  )

  return {
    avgCalories: totals.calories / rows.length,
    avgProtein: totals.protein / rows.length
  }
}, [dailyNutritionSummary])

const calorieTarget = useMemo(() => {
  const currentWeight = Number(bodyForecast?.currentWeight || 0)
  const recentCardioMinutes = Number(trainingSummary?.cardioMinutesWeekly || 0)

  const estimatedMaintenance = estimateMaintenanceCalories({
    currentWeight,
    recentCardioMinutes,
    bmr: null
  })

  return estimateDynamicCalorieTarget({
    currentWeight,
    estimatedMaintenance,
    primaryGoal: 150,
    lowerGoal: 145,
    minimumCalories: 1200
  })
}, [bodyForecast, trainingSummary])
const calorieDelta = useMemo(() => {
  const avg = Number(nutritionSummary?.avgCalories || 0)
  const target = Number(calorieTarget?.targetCalories || 0)
  if (!avg || !target) return null
  return Math.round(avg - target)
}, [nutritionSummary, calorieTarget])

const calorieChartData = useMemo(() => {
  return filteredNutrition.map(row => ({
    ...row,
    target: calorieTarget.targetCalories
  }))
}, [filteredNutrition, calorieTarget])
return (
  <div
    style={{
      background: "#07080e",
      color: "#ced2f0",
      minHeight: "100vh",
      fontFamily: "Arial",
      padding: "16px",
      boxSizing: "border-box",
      width: "100%",
      overflowX: "hidden"
    }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
        <div>
  <div style={{ fontSize: "64px", fontWeight: "800", lineHeight: 1, marginTop: 0, marginBottom: "6px" }}>
    L.I.F.T.
  </div>
  <div style={{ fontSize: 12, opacity: 0.6 }}>Build check: Mar 12</div>
  <div style={{ fontSize: "13px", opacity: 0.85, marginBottom: "4px" }}>
    Longitudinal Integrated Fitness Tracker
  </div>
  {!hydrated && <div style={{ fontSize: "12px", opacity: 0.8 }}>Loading synced data...</div>}
</div>

        <div style={{ ...cardStyle(), minWidth: "0", flex: "1 1 280px", maxWidth: "420px" }}>
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

      <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: "1 1 auto",
              minWidth: "70px",
              padding: "10px 8px",
              background: tab === t ? "#252640" : "#0d0e1c",
              border: tab === t ? "1px solid #4a9ee8" : "1px solid #1a1b2e",
              borderRadius: "8px",
              color: tab === t ? "#ffffff" : "#ced2f0",
              cursor: "pointer",
              textAlign: "center",
              fontSize: "13px",
              fontWeight: tab === t ? "600" : "400"
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
      <h3 style={{ margin: 0 }}>Overview</h3>
      <div style={{ display: "flex", gap: "6px" }}>
        {[
          { key: "30D",  label: "30 days"  },
          { key: "90D",  label: "90 days"  },
          { key: "180D", label: "6 months" },
          { key: "1Y",   label: "1 year"   },
          { key: "ALL",  label: "All"      }
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setRangeKey(opt.key)}
            style={{
              padding: "6px 12px",
              background: rangeKey === opt.key ? "#252640" : "#0d0e1c",
              border: rangeKey === opt.key ? "1px solid #4a9ee8" : "1px solid #1a1b2e",
              borderRadius: "6px",
              color: rangeKey === opt.key ? "#ffffff" : "#ced2f0",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: rangeKey === opt.key ? "600" : "400"
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: "16px", marginBottom: "20px" }}>
      <div style={{ ...cardStyle(), minWidth: 0 }}>
        <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Current Weight</div>
        <div style={{ fontSize: "30px", fontWeight: "bold" }}>
          {bodyForecast?.currentWeight != null ? `${f1(bodyForecast.currentWeight)} lb` : "NA"}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
          latest body-weight state
        </div>
      </div>

      <div style={{ ...cardStyle(), minWidth: 0 }}>
        <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Calories vs Target</div>
        <div style={{ fontSize: "30px", fontWeight: "bold" }}>
          {nutritionSummary?.avgCalories != null && calorieTarget?.targetCalories != null
            ? `${Math.round(nutritionSummary.avgCalories)} / ${Math.round(calorieTarget.targetCalories)}`
            : "NA"}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
          delta: {nutritionSummary?.avgCalories != null && calorieTarget?.targetCalories != null
            ? `${Math.round(nutritionSummary.avgCalories - calorieTarget.targetCalories) > 0 ? "+" : ""}${Math.round(nutritionSummary.avgCalories - calorieTarget.targetCalories)} kcal`
            : "NA"}
        </div>
      </div>

<div style={{ ...cardStyle(), minWidth: 0 }}>
  <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>VO₂ Proxy</div>
  <div style={{ fontSize: "30px", fontWeight: "bold" }}>
    {vo2ProxySummary?.latestSmoothed != null ? f1(vo2ProxySummary.latestSmoothed) : "NA"}
  </div>
  <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
    {vo2ProxySummary?.count
      ? `latest raw ${f1(vo2ProxySummary.latestRaw)}, best ${f1(vo2ProxySummary.bestSmoothed)}, n=${vo2ProxySummary.count}`
      : "rolling run-based aerobic estimate"}
  </div>
</div>


      <div
        style={{
          ...cardStyle(),
          minWidth: 0,
          background:
            (() => {
              const vals = [
                injuryPenalties?.running ?? 1,
                injuryPenalties?.swimming ?? 1,
                injuryPenalties?.cycling ?? 1,
                injuryPenalties?.lifting ?? 1
              ]
                .map(Number)
                .filter(Number.isFinite)

              const pct = vals.length
                ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100)
                : 100

              return pct >= 85
                ? "rgba(34,197,94,0.16)"
                : pct >= 60
                ? "rgba(250,204,21,0.16)"
                : "rgba(239,68,68,0.16)"
            })()
        }}
      >
        <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Operational</div>
        <div style={{ fontSize: "30px", fontWeight: "bold" }}>
          {(() => {
            const vals = [
              injuryPenalties?.running ?? 1,
              injuryPenalties?.swimming ?? 1,
              injuryPenalties?.cycling ?? 1,
              injuryPenalties?.lifting ?? 1
            ]
              .map(Number)
              .filter(Number.isFinite)

            return vals.length
              ? `${Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100)}%`
              : "100%"
          })()}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
          average training capacity across modalities
        </div>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))"









, gap: "16px", marginBottom: "20px", alignItems: "start" }}>
      <div style={{ ...cardStyle(), minWidth: "0" }}>
        <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Calories Trend ({rangeOptions.find(r => r.key === rangeKey)?.label ?? rangeKey})</div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
  data={calorieChartData}
  margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
>
            <CartesianGrid stroke="#1a1b2e" />
            <XAxis
  dataKey="label"
  label={{
    value: "Date",
    position: "bottom",
    offset: 10,
    fill: "#ced2f0"
  }}
/>
            <YAxis
  domain={[0, chartMaxCalories]}
  label={{
    value: "Calories (kcal/day)",
    angle: -90,
    position: "insideLeft",
    offset: 15,
    fill: "#ced2f0",
    style: { textAnchor: "middle" }
  }}
/>
            <Tooltip />
            <Legend verticalAlign="top" height={36} />
            <Line
              type="monotone"
              dataKey="calories"
              stroke="#4acfe8"
              strokeWidth={2}
              dot={false}
              name="Calories"
            />
            <Line
              type="monotone"
              dataKey="target"
              stroke="#ffd166"
              strokeDasharray="6 6"
              dot={false}
              name="Target"
            />
            <Line
              type="monotone"
              dataKey="calories7"
              stroke="#ffffff"
              strokeWidth={2}
              dot={false}
              name="7 day avg"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle(), minWidth: "0" }}>
        <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Weight Trend, actual and 7 day average ({rangeOptions.find(r => r.key === rangeKey)?.label ?? rangeKey})</div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
  data={weightSmoothed}
  margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
>
            <CartesianGrid stroke="#1a1b2e" />
            <XAxis
  dataKey="label"
  label={{
    value: "Date",
    position: "bottom",
    offset: 10,
    fill: "#ced2f0"
  }}
/>
            <YAxis
              domain={overviewWeightDomain}
              label={{
  value: "Body weight (lb)",
  angle: -90,
  position: "insideLeft",
  offset: 15,
  fill: "#ced2f0",
  style: { textAnchor: "middle" }
}}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === "weight") return [`${Number(value).toFixed(1)} lb`, "Weight"]
                if (name === "avg") return [`${Number(value).toFixed(1)} lb`, "7 day avg"]
                return [value, name]
              }}
            />
            <Legend verticalAlign="top" height={36} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#4a9ee8"
              strokeWidth={2}
              dot={false}
              name="Weight"
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="#ffd166"
              strokeWidth={3}
              dot={false}
              name="7 day avg"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))"








, gap: "16px", marginBottom: "20px", alignItems: "start" }}>
      <div style={{ ...cardStyle(), minWidth: "0" }}>
        <div style={{ fontWeight: "bold", marginBottom: "12px" }}>
          Training Load
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart
  data={trainingLoadChartData}
  margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
>
            <CartesianGrid stroke="#1a1b2e" />
            <XAxis
  dataKey="label"
  label={{
    value: "Date",
    position: "bottom",
    offset: 10,
    fill: "#ced2f0"
  }}
/>
            <YAxis
              yAxisId="distance"
              orientation="left"
              label={{
  value: "Training load (%)",
  angle: -90,
  position: "insideLeft",
  offset: 15,
  fill: "#ced2f0",
  style: { textAnchor: "middle" }
}}
            />
            <YAxis
              yAxisId="strength"
              orientation="right"
              label={{
  value: "Miles per week",
  angle: 90,
  position: "insideRight",
  offset: -15,
  fill: "#a78bfa",
  style: { textAnchor: "middle" }
}}
              allowDecimals={false}
            />
            <Tooltip />
            <Legend verticalAlign="top" height={36} />

            <Area
              yAxisId="strength"
              type="monotone"
              dataKey="trainingLoadPct"
              stroke="none"
              fill="#6b7280"
              fillOpacity={0.22}
              name="Normalized training load"
            />

            <Line
              yAxisId="strength"
              type="monotone"
              dataKey="running"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              name="Run miles"
            />

            <Line
              yAxisId="strength"
              type="monotone"
              dataKey="swimming"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              name="Swim miles"
            />

            <Line
              yAxisId="distance"
              type="monotone"
              dataKey="cycling"
              stroke="#facc15"
              strokeWidth={2}
              dot={false}
              name="Cycle miles"
            />

            <Line
              yAxisId="strength"
              type="monotone"
              dataKey="strength"
              stroke="#a78bfa"
              strokeWidth={3}
              strokeDasharray="6 4"
              dot={false}
              name="Strength sessions"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle(), minWidth: "0" }}>
  <div style={{ fontWeight: "bold", marginBottom: "12px", minHeight: "20px" }}>
    Performance Readiness
  </div>

  <div style={{ marginBottom: "14px" }}>

<ResponsiveContainer width="100%" height={300}>
      <LineChart
  data={readinessProjectionData}
  margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
>
        <CartesianGrid stroke="#1a1b2e" />
        <XAxis
          type="number"
          dataKey="month"
          domain={[0, readinessProjectionMaxMonth]}
          allowDecimals={false}
          tickCount={Math.min(readinessProjectionMaxMonth + 1, 8)}
          label={{
  value: "Months from now",
  position: "bottom",
  offset: 10,
  fill: "#ced2f0"
}}
        />
        <YAxis
          domain={[0, 100]}
          label={{
  value: "Completion readiness (%)",
  angle: -90,
  position: "insideLeft",
  offset: 15,
  fill: "#ced2f0",
  style: { textAnchor: "middle" }
}}
        />
        <Tooltip
          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
          labelFormatter={value => `${value} months`}
        />
        <Legend verticalAlign="top" height={36} />

        <Line
          type="monotone"
          dataKey="fiveK"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          name="5K"
        />

        <Line
          type="monotone"
          dataKey="tenK"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          name="10K"
        />

        <Line
          type="monotone"
          dataKey="half"
          stroke="#facc15"
          strokeWidth={2}
          dot={false}
          name="Half marathon"
        />

        <Line
          type="monotone"
          dataKey="tri"
          stroke="#a78bfa"
          strokeWidth={3}
          dot={false}
          name="Olympic triathlon"
        />

        {eventReadinessMarkers
          .filter(marker => marker.month != null)
          .map(marker => (
            <ReferenceLine
              key={marker.key}
              x={marker.month}
              stroke={marker.color}
              strokeDasharray="6 4"
              label={{
  value: marker.label,
  angle: -90,
  position: "top",
  fill: marker.color
}}
            />
          ))}
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>
</div>

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))"









, gap: "16px", marginBottom: "20px", alignItems: "start" }}>
<div style={{ ...cardStyle(), minWidth: "0" }}>
  <div style={{ fontWeight: "bold", marginBottom: "12px", minHeight: "20px" }}>
    Body Composition
  </div>

  <ResponsiveContainer width="100%" height={300}>
    <LineChart
      data={bodyCompositionOverviewData}
      margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
    >
      <CartesianGrid stroke="#1a1b2e" />
      <XAxis
        dataKey="label"
        label={{
          value: "Date",
          position: "bottom",
          offset: 10,
          fill: "#ced2f0"
        }}
      />
      <YAxis
        domain={bodyCompositionOverviewDomain}
        label={{
          value: "Body fat (%)",
          angle: -90,
          position: "insideLeft",
          offset: 15,
          fill: "#ced2f0",
          style: { textAnchor: "middle" }
        }}
      />
      <Tooltip
        formatter={(value, name) => {
          if (name === "dexaBF") return [`${Number(value).toFixed(1)}%`, "DEXA BF"]
          if (name === "estimatedBF") return [`${Number(value).toFixed(1)}%`, "Estimated BF"]
          return [value, name]
        }}
      />
      <Legend verticalAlign="top" height={36} />

      <Line
        type="monotone"
        dataKey="dexaBF"
        stroke="#ffd166"
        strokeWidth={3}
        dot
        name="DEXA BF"
      />

      <Line
        type="monotone"
        dataKey="estimatedBF"
        stroke="#4a9ee8"
        strokeWidth={2}
        dot
        name="Estimated current BF"
      />
    </LineChart>
  </ResponsiveContainer>
</div>

<div style={{ ...cardStyle(), minWidth: "0" }}>
  <div style={{ fontWeight: "bold", marginBottom: "12px", minHeight: "20px" }}>
    Operational Capacity
  </div>

  <ResponsiveContainer width="100%" height={300}>
    <LineChart
      data={operationalCapacityData}
      margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
    >
      <CartesianGrid stroke="#1a1b2e" />
      <XAxis
        dataKey="label"
        label={{
          value: "Date",
          position: "bottom",
          offset: 10,
          fill: "#ced2f0"
        }}
      />
      <YAxis
        domain={operationalCapacityDomain}
        label={{
          value: "Operational capacity (%)",
          angle: -90,
          position: "insideLeft",
          offset: 15,
          fill: "#ced2f0",
          style: { textAnchor: "middle" }
        }}
      />
      <Tooltip
        formatter={(value, name) => {
          if (name === "operationalPct") return [`${Number(value).toFixed(1)}%`, "Operational"]
          if (name === "acuteLossPct") return [`${Number(value).toFixed(1)}%`, "Acute burden"]
          if (name === "diseaseLossPct") return [`${Number(value).toFixed(1)}%`, "Disease burden"]
          if (name === "fatigueLossPct") return [`${Number(value).toFixed(1)}%`, "Fatigue burden"]
          return [value, name]
        }}
      />
      <Legend verticalAlign="top" height={36} />

      <Line
        type="monotone"
        dataKey="operationalPct"
        stroke="#e5e7eb"
        strokeWidth={3}
        dot={false}
        name="Operational"
      />

      <Line
        type="monotone"
        dataKey="acuteLossPct"
        stroke="#ef4444"
        strokeWidth={2}
        dot={false}
        name="Acute"
      />

      <Line
        type="monotone"
        dataKey="diseaseLossPct"
        stroke="#f59e0b"
        strokeWidth={2}
        dot={false}
        name="Disease"
      />

      <Line
        type="monotone"
        dataKey="fatigueLossPct"
        stroke="#a78bfa"
        strokeWidth={2}
        dot={false}
        name="Fatigue"
      />
    </LineChart>
  </ResponsiveContainer>
</div>
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
                  <Legend verticalAlign="top" height={36} />
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
            <div style={cardStyle()}>
  <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Target Calories</div>
  <div style={{ fontSize: "30px", fontWeight: "bold" }}>
    {Math.round(calorieTarget.targetCalories)}
  </div>
  <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
    Maintenance est: {Math.round(calorieTarget.estimatedMaintenance)}
  </div>
  <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>
    Deficit: {Math.round(calorieTarget.deficit)} kcal, phase: {calorieTarget.phase}
  </div>
  <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>
    To 150: {calorieTarget.distanceTo150 ?? "NA"} lb, to 145: {calorieTarget.distanceTo145 ?? "NA"} lb
  </div>
</div>
          </div>

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Calories Trend ({rangeKey})</div>
           <ResponsiveContainer width="100%" height={260}>
  <LineChart
  data={calorieChartData}
  margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, chartMaxCalories]} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="calories" stroke="#4acfe8" strokeWidth={2} dot={false} />
<Line type="monotone" dataKey="target" stroke="#ffd166" strokeDasharray="6 6" dot={false} name="Target" />
<Line type="monotone" dataKey="calories7" stroke="#ffffff" strokeWidth={2} dot={false} />
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
                  <Legend verticalAlign="top" height={36} />
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
    <Legend verticalAlign="top" height={36} />
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

          <div style={{ ...cardStyle(), marginBottom: "20px", maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Macro Share of Calories (%)</div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={filteredNutrition}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
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



      
{tab === "Schedule" && (
  <TabSchedule
    storedWorkouts={storedWorkouts}
    setStoredWorkouts={setStoredWorkouts}
    session={session}
  />
)}

{tab === "Training" && (
  <TrainingDashboard
    workouts={operationalWorkouts}
    recentNutrition={recentNutrition}
  />
)}
{tab === "Injury" && (
  <div style={{ padding: "16px" }}>
    <h3>Injury Log</h3>

    <div style={{ display: "grid", gap: "10px", maxWidth: "500px" }}>

      <input
        placeholder="Injury name"
        onChange={e => window.injuryName = e.target.value}
      />

      <input
        placeholder="Body region"
        onChange={e => window.injuryRegion = e.target.value}
      />

      <input
        type="number"
        placeholder="Severity 1-10"
        onChange={e => window.injurySeverity = e.target.value}
      />

<input
  type="number"
  placeholder="Recovery days"
  onChange={e => window.injuryRecovery = e.target.value}
/>

<label>
  <input
    type="checkbox"
    onChange={e => window.injuryAffectsRunning = e.target.checked}
  />
  Affects running
</label>

<label>
  <input
    type="checkbox"
    onChange={e => window.injuryAffectsSwimming = e.target.checked}
  />
  Affects swimming
</label>

<label>
  <input
    type="checkbox"
    onChange={e => window.injuryAffectsCycling = e.target.checked}
  />
  Affects cycling
</label>

<label>
  <input
    type="checkbox"
    onChange={e => window.injuryAffectsLifting = e.target.checked}
  />
  Affects lifting
</label>

      <label>
        <input
          type="checkbox"
          onChange={e => window.injuryAffectsRunning = e.target.checked}
        />
        Affects running
      </label>

      <label>
        <input
          type="checkbox"
          onChange={e => window.injuryAffectsSwimming = e.target.checked}
        />
        Affects swimming
      </label>

      <label>
        <input
          type="checkbox"
          onChange={e => window.injuryAffectsCycling = e.target.checked}
        />
        Affects cycling
      </label>

      <label>
        <input
          type="checkbox"
          onChange={e => window.injuryAffectsLifting = e.target.checked}
        />
        Affects lifting
      </label>

      <button
        onClick={() => {

          const entry = {
            id: Date.now(),
            name: window.injuryName || "",
            region: window.injuryRegion || "",
            severity: Number(window.injurySeverity || 0),
            recoveryDays: Number(window.injuryRecovery || 0),
            affectsRunning: !!window.injuryAffectsRunning,
            affectsSwimming: !!window.injuryAffectsSwimming,
            affectsCycling: !!window.injuryAffectsCycling,
            affectsLifting: !!window.injuryAffectsLifting
          }

          const existing = JSON.parse(localStorage.getItem("injuries") || "[]")
          existing.push(entry)
          localStorage.setItem("injuries", JSON.stringify(existing))

          alert("Injury saved")

        }}
      >
        Save Injury
      </button>

    </div>

    <div style={{ marginTop: "24px" }}>
      <h4>Saved injuries</h4>

      {(JSON.parse(localStorage.getItem("injuries") || "[]")).map(entry => (
        <div
          key={entry.id}
          style={{
            border: "1px solid #1a1b2e",
            borderRadius: "8px",
            padding: "10px",
            marginBottom: "10px",
            maxWidth: "500px"
          }}
        >
          <div><strong>{entry.name}</strong></div>
          <div>Region: {entry.region}</div>
          <div>Severity: {entry.severity}</div>
          <div>Recovery days: {entry.recoveryDays}</div>
          <div>
            Affects:
            {entry.affectsRunning ? " running" : ""}
            {entry.affectsSwimming ? " swimming" : ""}
            {entry.affectsCycling ? " cycling" : ""}
            {entry.affectsLifting ? " lifting" : ""}
          </div>
        </div>
      ))}
    </div>
<div style={{ marginTop: "24px" }}>
  <h4>Recent weekly buckets</h4>
  <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>
    {JSON.stringify(weeklyTrainingBuckets, null, 2)}
  </pre>
</div>
  </div>
)}
{tab === "Forecast" && (
  <div>
    <h3>Forecast</h3>

    {/* ── Body Weight ─────────────────────────────────────────── */}
    <div style={{ ...cardStyle(), marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
        <div style={{ fontWeight: "bold" }}>Body Weight Forecast</div>
        {bodyForecast && (
          <div style={{ display: "flex", gap: "16px", fontSize: "12px", opacity: 0.75 }}>
            <span>Current: <strong style={{ color: "#4a9ee8" }}>{bodyForecast.currentWeight.toFixed(1)} lb</strong></span>
            <span>Phase 1 target: <strong style={{ color: "#ffd166" }}>{bodyForecast.phase1TargetWeight} lb</strong></span>
            <span>Final target: <strong style={{ color: "#4ade80" }}>{bodyForecast.finalTargetWeight} lb</strong></span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={bodyWeightForecastChart} margin={{ top: 10, right: 20, left: 55, bottom: 20 }}>
          <CartesianGrid stroke="#1a1b2e" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis domain={["auto", "auto"]} label={{ value: "Weight (lb)", angle: -90, position: "insideLeft", offset: 15, fill: "#ced2f0", style: { textAnchor: "middle" } }} />
          <Tooltip formatter={(v, n) => [v != null ? `${v} lb` : "—", n === "actual" ? "Actual (7d avg)" : "Projected"]} />
          <Legend verticalAlign="top" height={28} />
          <Line type="monotone" dataKey="actual"   name="Actual (7d avg)" stroke="#4a9ee8" strokeWidth={2} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="forecast" name="Projected"       stroke="#ffd166" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4 }} connectNulls={false} />
          {bodyForecast && <ReferenceLine y={bodyForecast.phase1TargetWeight} stroke="#ffd166" strokeDasharray="3 3" label={{ value: "Phase 1", fill: "#ffd166", fontSize: 11 }} />}
          {bodyForecast && <ReferenceLine y={bodyForecast.finalTargetWeight}  stroke="#4ade80" strokeDasharray="3 3" label={{ value: "Target",  fill: "#4ade80",  fontSize: 11 }} />}
        </ComposedChart>
      </ResponsiveContainer>
      {bodyForecast && (
        <div style={{ display: "flex", gap: "20px", fontSize: "12px", opacity: 0.7, marginTop: "8px", flexWrap: "wrap" }}>
          <span>1 month: {bodyForecast.weight1m.toFixed(1)} lb</span>
          <span>3 months: {bodyForecast.weight3m.toFixed(1)} lb</span>
          <span>6 months: {bodyForecast.weight6m.toFixed(1)} lb</span>
          <span>12 months: {bodyForecast.weight12m.toFixed(1)} lb</span>
          <span>ETA 150 lb: {bodyForecast.eta150 || "not on trend"}</span>
          <span>ETA 145 lb: {bodyForecast.eta145 || "not on trend"}</span>
        </div>
      )}
    </div>

    {/* ── Endurance Readiness ─────────────────────────────────── */}
    <div style={{ ...cardStyle(), marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
        <div style={{ fontWeight: "bold" }}>Endurance Readiness</div>
        <div style={{ fontSize: "12px", opacity: 0.7 }}>
          Composite: aerobic volume (multi-modal) · running pace · cardio consistency
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px", marginBottom: "14px" }}>
        {[
          { label: "Now",      value: enduranceForecast.readinessNow  },
          { label: "1 month",  value: enduranceForecast.readiness1m   },
          { label: "3 months", value: enduranceForecast.readiness3m   },
          { label: "6 months", value: enduranceForecast.readiness6m   },
          { label: "12 months",value: enduranceForecast.readiness12m  }
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", opacity: 0.6, marginBottom: "4px" }}>{label}</div>
            <div style={{ fontSize: "22px", fontWeight: "700",
              color: value >= 60 ? "#4ade80" : value >= 35 ? "#ffd166" : "#ff8a8a" }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={readinessProjectionData} margin={{ top: 10, right: 20, left: 55, bottom: 20 }}>
          <CartesianGrid stroke="#1a1b2e" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} label={{ value: "Readiness score", angle: -90, position: "insideLeft", offset: 15, fill: "#ced2f0", style: { textAnchor: "middle" } }} />
          <Tooltip />
          <Legend verticalAlign="top" height={28} />
          <Line type="monotone" dataKey="baseReadiness" name="Readiness"      stroke="#4a9ee8" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="fiveK"         name="5K readiness"   stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" dot={false} />
          <Line type="monotone" dataKey="tenK"          name="10K readiness"  stroke="#22c55e" strokeWidth={1} strokeDasharray="4 3" dot={false} />
          <Line type="monotone" dataKey="half"          name="Half readiness" stroke="#facc15" strokeWidth={1} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
        Running: {enduranceForecast.weeklyRunMiles28} mi/week · pace {enduranceForecast.avgPace28 || "NA"} min/mi · cardio {Math.round(enduranceForecast.cardioMinutesWeekly)} min/week · run modifier {((enduranceForecast.runPenalty ?? 1) * 100).toFixed(0)}%
      </div>
    </div>

    {/* ── Cardio Minutes ──────────────────────────────────────── */}
    <div style={{ ...cardStyle(), marginBottom: "20px" }}>
      <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Cardio Minutes, Actual vs Forecast</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={cardioMinutesForecastChart} margin={{ top: 10, right: 20, left: 55, bottom: 20 }}>
          <CartesianGrid stroke="#1a1b2e" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis label={{ value: "Min / week", angle: -90, position: "insideLeft", offset: 15, fill: "#ced2f0", style: { textAnchor: "middle" } }} tickFormatter={v => fmt0(v)} />
          <Tooltip formatter={(v, n) => [v == null ? "—" : fmt0(v), n === "actual" ? "Actual min/week" : "Forecast min/week"]} />
          <Legend verticalAlign="top" height={28} />
          <Line type="monotone" dataKey="actual"   name="Actual min/week"   stroke="#4a9ee8" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          <Line type="monotone" dataKey="forecast" name="Forecast min/week" stroke="#ffd166" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>

    {/* ── Per-modality volume charts ───────────────────────────── */}
    {trainingForecast && (
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))"










, gap: "16px" }}>
        {[
          { title: "Running Volume (mi/week)",   data: runningForecastChart,  color: "#ef4444", eta: `ETA 20 mi/wk: ${trainingForecast.eta20Run || "not on trend"} · ETA 30 mi/wk: ${trainingForecast.eta30Run || "not on trend"}` },
          { title: "Cycling Volume (mi/week)",   data: cyclingForecastChart,  color: "#4acfe8", eta: `ETA 25 mi/wk: ${trainingForecast.eta25Bike || "not on trend"} · ETA 50 mi/wk: ${trainingForecast.eta50Bike || "not on trend"}` },
          { title: "Swimming Volume (mi/week)",  data: swimmingForecastChart, color: "#a78bfa", eta: `ETA 2 mi/wk: ${trainingForecast.eta2Swim || "not on trend"} · ETA 5 mi/wk: ${trainingForecast.eta5Swim || "not on trend"}` },
          { title: "Strength Sessions (per week)", data: strengthForecastChart, color: "#ffd166", eta: `ETA 3/wk: ${trainingForecast.eta3Strength || "not on trend"} · ETA 4/wk: ${trainingForecast.eta4Strength || "not on trend"}` }
        ].map(({ title, data, color, eta }) => (
          <div key={title} style={{ ...cardStyle() }}>
            <div style={{ fontWeight: "bold", marginBottom: "10px", fontSize: "13px" }}>{title}</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data} margin={{ top: 5, right: 10, left: 40, bottom: 15 }}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v, n) => [v != null ? Number(v).toFixed(2) : "—", n === "actual" ? "Actual" : "Projected"]} />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: "11px" }} />
                <Bar  dataKey="actual"   name="Actual"    fill={color} opacity={0.7} />
                <Line dataKey="forecast" name="Projected" stroke={color} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "6px" }}>{eta}</div>
          </div>
        ))}
      </div>
    )}

  </div>
)}
{tab === "Log" && (
  <div>
    <h3>Log</h3>
    <div>This tab is next.</div>
  </div>
)}

{tab !== "Overview" && tab !== "Body Comp" && tab !== "Calories" && tab !== "Injury" && tab !== "Forecast" && tab !== "Schedule" && tab !== "Training" && tab !== "Log" && (
  <div>
    <h3>{tab}</h3>
    <div>This tab is next.</div>
  </div>
)}
    </div>
  )
}
