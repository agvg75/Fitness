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

    {allEx.length === 0 && <div style={{ fontSize: "12px", color: "#333" }}>No exercise data recorded.</div>}
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
const [sessionDur, setSessionDur] = useState("")
const [toast, setToast] = useState(null)

const [cardioType, setCardioType] = useState("")
const [cardioDistance, setCardioDistance] = useState("")
const [cardioCalories, setCardioCalories] = useState("")
const [cardioAvgHr, setCardioAvgHr] = useState("")
const [cardioNotes, setCardioNotes] = useState("")
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
  day: activeDay,
  dayLabel: SMETA[activeDay].label,
  theme: SMETA[activeDay].theme,
  venue: SMETA[activeDay].venue,
  data: JSON.parse(JSON.stringify(sessions[activeDay])),
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
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

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

export default function App() {
  

  const [tab, setTab] = useState("Overview")
  const [rangeKey, setRangeKey] = useState("180D")

  const [daily, setDaily] = useState([])
  const [nutrition, setNutrition] = useState([])
  const [injury, setInjury] = useState([])
  const [dexa, setDexa] = useState([])
  const [error, setError] = useState("")
  const [storedWorkouts, setStoredWorkouts] = useState([])

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

  const latestDateStr = nutritionSeries[nutritionSeries.length - 1]?.date
  if (!latestDateStr) return nutritionSeries

  const latestDate = new Date(`${latestDateStr}T00:00:00`)
  const cutoff = new Date(latestDate)
  cutoff.setDate(cutoff.getDate() - (selectedRangePoints - 1))

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
{tab === "Schedule" && (
  <TabSchedule
    storedWorkouts={storedWorkouts}
    setStoredWorkouts={setStoredWorkouts}
    session={session}
  />
)}

{tab === "Training" && (
  <div>
    <h3>Training</h3>
    <div>This tab is next.</div>
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
