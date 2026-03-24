import React, { useState, useEffect, useMemo, useCallback } from "react"
import { PROG, CARDIO } from "./scheduleData.js"
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
  "ufd-workouts",
  "oc-items"
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
  "Schedule",
  "Forecast",
  "Operational Capacity",
  "Training",
  "Calories",
  "Body Comp",
  "Import",
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
                  <span style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", background: entry.venue === "knr" ? "#0d1f38" : "#1e1200", color: entry.venue === "knr" ? "#3b82f6" : "#d97706", padding: "2px 7px", borderRadius: "3px", marginLeft: "8px" }}>{entry.venue_label || entry.venue || m.venue}</span>
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
    {Array.isArray(entry.cardio) && entry.cardio.filter(c => c.modality || c.duration).map((c, i) => (
      <div key={i} style={{ marginBottom: "6px", padding: "8px 10px", background: "#101622", border: "1px solid #1a2a44", borderRadius: "6px", fontSize: "11px", color: "#9ec5ff" }}>
        <strong style={{ textTransform: "capitalize" }}>{c.modality || "Cardio"}</strong>
        {c.duration && <> , {c.duration} min</>}
        {c.notes && <div style={{ marginTop: "4px", color: "#7f93b8" }}>{c.notes}</div>}
      </div>
    ))}

    {allEx.length === 0 && !(entry.exercises || []).some(ex => ex.variant === "custom") && <div style={{ fontSize: "12px", color: "#333" }}>No exercise data recorded.</div>}
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
    {(entry.exercises || []).filter(ex => ex.variant === "custom").map(ex => (
      <div key={ex.exercise_id} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "3px 0", borderBottom: "1px solid #121212" }}>
        <span style={{ fontSize: "13px", fontWeight: "600", color: "#7a7aaa", minWidth: "190px" }}>{ex.exercise_name} {ex.notes && <span style={{ fontSize: "10px", color: "#3a3a5a", fontStyle: "italic" }}>{ex.notes}</span>}</span>
        <span style={{ fontSize: "11px", color: "#9090c0" }}>
          {ex.actual?.sets && <span>{ex.actual.sets}×{ex.actual.reps}</span>}
          {ex.actual?.load && <><span style={{ color: "#333" }}>@</span><span style={{ color: "#6060a0" }}>{ex.actual.load}</span></>}
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

// ─── Operational Capacity constants ───────────────────────────────────────────
const SCORE_LABELS = ["Resolved", "Mild", "Discomfort", "Pain", "Impairment", "Severe"]

const OC_KEY_META = {
  tendonStatus: { label: "Tendon",     halfLifeHours: 168, scope: "regional", color: "#f59e0b" },
  muscleStatus: { label: "Muscle",     halfLifeHours: 72,  scope: "regional", color: "#ef4444" },
  jointStatus:  { label: "Joint",      halfLifeHours: 120, scope: "regional", color: "#3b82f6" },
  sleepDebt:    { label: "Sleep Debt", halfLifeHours: 48,  scope: "global",   color: "#a78bfa" },
  illnessLoad:  { label: "Illness",    halfLifeHours: 72,  scope: "global",   color: "#22c55e" },
}

const OC_BODY_REGIONS = [
  "Head", "Neck",
  "Shoulder L", "Shoulder R", "Upper Arm L", "Upper Arm R",
  "Elbow L", "Elbow R", "Forearm L", "Forearm R", "Wrist L", "Wrist R",
  "Chest", "Upper Back", "Lower Back", "Core/Abs",
  "Hip L", "Hip R", "Glute L", "Glute R",
  "Quad L", "Quad R", "Hamstring L", "Hamstring R",
  "IT Band L", "IT Band R", "Knee L", "Knee R",
  "Shin L", "Shin R", "Calf L", "Calf R",
  "Ankle L", "Ankle R",
  "Toe L", "Toe R",
]

// [x%, y%] for front (f) and back (b) silhouette images.
// Anatomical convention: patient's LEFT appears on viewer's RIGHT (x > 50) in front view.
// Back view keeps the same L→right / R→left orientation (transparent-body convention).
const OC_REGION_COORDS = {
  "Head":        { f: [50, 4.5], b: [50, 4.5] },
  "Neck":        { f: [50, 10],  b: [50, 10]  },
  "Shoulder L":  { f: [75, 19],  b: [75, 19]  },
  "Shoulder R":  { f: [25, 19],  b: [25, 19]  },
  "Upper Arm L": { f: [81, 29],  b: [81, 29]  },
  "Upper Arm R": { f: [19, 29],  b: [19, 29]  },
  "Elbow L":     { f: [85, 40],  b: [85, 40]  },
  "Elbow R":     { f: [15, 40],  b: [15, 40]  },
  "Forearm L":   { f: [88, 49],  b: [88, 49]  },
  "Forearm R":   { f: [12, 49],  b: [12, 49]  },
  "Wrist L":     { f: [90, 58],  b: [90, 58]  },
  "Wrist R":     { f: [10, 58],  b: [10, 58]  },
  "Chest":       { f: [50, 26],  b: null       },
  "Upper Back":  { f: null,      b: [50, 24]  },
  "Lower Back":  { f: null,      b: [50, 42]  },
  "Core/Abs":    { f: [50, 38],  b: null       },
  "Hip L":       { f: [65, 52],  b: [65, 52]  },
  "Hip R":       { f: [35, 52],  b: [35, 52]  },
  "Glute L":     { f: null,      b: [65, 57]  },
  "Glute R":     { f: null,      b: [35, 57]  },
  "Quad L":      { f: [66, 63],  b: null       },
  "Quad R":      { f: [34, 63],  b: null       },
  "Hamstring L": { f: null,      b: [66, 63]  },
  "Hamstring R": { f: null,      b: [34, 63]  },
  "IT Band L":   { f: [69, 68],  b: [69, 68]  },
  "IT Band R":   { f: [31, 68],  b: [31, 68]  },
  "Knee L":      { f: [66, 74],  b: [66, 74]  },
  "Knee R":      { f: [34, 74],  b: [34, 74]  },
  "Shin L":      { f: [67, 82],  b: null       },
  "Shin R":      { f: [33, 82],  b: null       },
  "Calf L":      { f: null,      b: [67, 82]  },
  "Calf R":      { f: null,      b: [33, 82]  },
  "Ankle L":     { f: [67, 91],  b: [67, 91]  },
  "Ankle R":     { f: [33, 91],  b: [33, 91]  },
  "Toe L":       { f: [70, 96],  b: [70, 96]  },
  "Toe R":       { f: [30, 96],  b: [30, 96]  },
}

// Body silhouette images — coordinates in OC_REGION_COORDS are CSS percentages
// (0–100) of the container's width/height, matching the 364×952 PNG dimensions.
function BodySilhouetteImg({ side }) {
  const src = side === "back" ? "/back_body_clean.png" : "/front_body_clean.png"
  return (
    <img src={src} alt={side + " body"} style={{ width: "100%", display: "block", background: "transparent" }} />
  )
}
// Keep a thin shim so any remaining references compile during transition
function BodySilhouetteSVG() {
  return <BodySilhouetteImg side="front" />
}

function computeReadinessDetail(ocItems, sleepRecords, healthFitDaily) {
  // ── Injury penalty (existing formula) ──────────────────────────
  const active = (ocItems || []).filter(i => i.currentScore > 0)
  const regional = active.filter(i => OC_KEY_META[i.key]?.scope === "regional").map(i => i.currentScore)
  const global   = active.filter(i => OC_KEY_META[i.key]?.scope === "global").map(i => i.currentScore)
  const maxRegional = regional.length ? Math.max(...regional) : 0
  const maxGlobal   = global.length   ? Math.max(...global)   : 0
  const sumAll      = active.reduce((s, i) => s + i.currentScore, 0)
  const injuryPenalty = active.length ? Math.round(maxRegional * 12 + maxGlobal * 10 + sumAll * 1.5) : 0

  // ── Sleep penalty — average of last 7 nights ───────────────────
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600000
  const recentSleep = (Array.isArray(sleepRecords) ? sleepRecords : [])
    .filter(r => r.date && new Date(r.date).getTime() >= sevenDaysAgo && r.duration_min != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)
  const avgSleepHours = recentSleep.length
    ? recentSleep.reduce((s, r) => s + (r.duration_min || 0), 0) / recentSleep.length / 60
    : null
  const sleepPenalty = avgSleepHours == null ? 0
    : avgSleepHours < 5.5 ? 20
    : avgSleepHours < 6   ? 10
    : 0

  // ── Training load penalty — most recent TSB ────────────────────
  const latestTsb = (Array.isArray(healthFitDaily) ? healthFitDaily : [])
    .filter(r => r.tsb != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.tsb ?? null
  const tsbPenalty = latestTsb == null ? 0
    : latestTsb < -30 ? 20
    : latestTsb < -20 ? 10
    : 0

  const score = Math.max(0, 100 - injuryPenalty - sleepPenalty - tsbPenalty)
  return { score, injuryPenalty, sleepPenalty, tsbPenalty, avgSleepHours, latestTsb, active }
}

function computeReadiness(items) {
  return computeReadinessDetail(items, [], []).score
}

function computeOcPredictedScore(item) {
  const hoursElapsed = (Date.now() - new Date(item.startDate).getTime()) / 3600000
  return Math.max(0, (item.initialScore || item.currentScore) * Math.pow(0.5, hoursElapsed / (item.halfLifeHours || 72)))
}

function computeOcRecoveryDate(item) {
  const score = item.initialScore || item.currentScore
  if (!score) return null
  const hoursToResolve = (item.halfLifeHours || 72) * Math.log2(score / 0.25)
  if (!Number.isFinite(hoursToResolve) || hoursToResolve <= 0) return null
  const recoveryMs = new Date(item.startDate).getTime() + hoursToResolve * 3600000
  const d = new Date(recoveryMs)
  return d < new Date() ? "Soon" : d.toISOString().slice(0, 10)
}

// ─── TabOperationalCapacity ────────────────────────────────────────────────────
function TabOperationalCapacity({ ocItems, setOcItems, session, operationalCapacityData, healthFitDaily, sleepRecords }) {
  const [selectedId, setSelectedId] = useState(null)
  const [addForm, setAddForm] = useState({ key: "muscleStatus", location: "Quad L", currentScore: 1, halfLifeHours: null })

  const selectedItem = ocItems.find(i => i.id === selectedId) || null
  const rd = computeReadinessDetail(ocItems, sleepRecords, healthFitDaily)
  const readiness = rd.score
  const readinessColor = readiness >= 80 ? "#4ade80" : readiness >= 60 ? "#fbbf24" : readiness >= 40 ? "#f97316" : "#ef4444"
  const active = rd.active
  const maxReg = active.filter(i => OC_KEY_META[i.key]?.scope === "regional").reduce((m, i) => Math.max(m, i.currentScore), 0)
  const maxGlb = active.filter(i => OC_KEY_META[i.key]?.scope === "global").reduce((m, i) => Math.max(m, i.currentScore), 0)

  const saveOcItems = async items => {
    await store.set("oc-items", items)
    if (supabase && session?.user?.id) {
      await supabase.from("user_kv").upsert(
        { user_id: session.user.id, key: "oc-items", value: items, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      )
    }
  }

  const addItem = () => {
    if (!addForm.currentScore) return
    const meta = OC_KEY_META[addForm.key] || OC_KEY_META.muscleStatus
    const item = {
      id: Date.now(),
      key: addForm.key,
      location: addForm.location,
      label: `${meta.label} — ${addForm.location}`,
      currentScore: Number(addForm.currentScore),
      initialScore: Number(addForm.currentScore),
      startDate: new Date().toISOString(),
      halfLifeHours: Number(addForm.halfLifeHours) || meta.halfLifeHours,
      episodeCount: 0,
      lastResolvedDate: null,
      chronicity: "acute",
    }
    const updated = [item, ...ocItems]
    setOcItems(updated)
    saveOcItems(updated)
  }

  const updateItem = (id, changes) => {
    const updated = ocItems.map(i => i.id === id ? { ...i, ...changes } : i)
    setOcItems(updated)
    saveOcItems(updated)
  }

  const removeItem = id => {
    const updated = ocItems.filter(i => i.id !== id)
    setOcItems(updated)
    saveOcItems(updated)
    if (selectedId === id) setSelectedId(null)
  }

  const resolveItem = id => {
    const item = ocItems.find(i => i.id === id)
    if (!item) return
    const episodeCount = (item.episodeCount || 0) + 1
    const lastResolvedDate = new Date().toISOString()
    const daysSinceLast = item.lastResolvedDate
      ? (Date.now() - new Date(item.lastResolvedDate).getTime()) / 86400000 : null
    const chronicity = episodeCount >= 2 || (daysSinceLast != null && daysSinceLast < 90) ? "chronic" : item.chronicity
    updateItem(id, { currentScore: 0, episodeCount, lastResolvedDate, chronicity })
    setSelectedId(null)
  }

  const renderSilhouette = side => {
    const ck = side === "front" ? "f" : "b"
    return (
      <div style={{ position: "relative" }}>
        <BodySilhouetteImg side={side} />
        {active.map(item => {
          const coords = OC_REGION_COORDS[item.location]?.[ck]
          if (!coords) return null
          const meta = OC_KEY_META[item.key] || OC_KEY_META.muscleStatus
          const sz = 8 + item.currentScore * 4
          const chronic = item.chronicity === "chronic"
          return (
            <div
              key={item.id}
              onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
              title={`${item.location} — ${SCORE_LABELS[item.currentScore]}`}
              style={{
                position: "absolute", left: `${coords[0]}%`, top: `${coords[1]}%`,
                width: sz, height: sz, borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                background: chronic ? "transparent" : meta.color,
                border: `2px solid ${meta.color}`,
                boxShadow: selectedId === item.id ? `0 0 10px ${meta.color}` : "none",
                cursor: "pointer", zIndex: 10, transition: "box-shadow 0.15s",
              }}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ padding: "16px", maxWidth: "900px" }}>

      {/* ── Readiness score ──────────────────────────────────────── */}
      <div style={{ ...cardStyle(), marginBottom: "16px", display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
        <div style={{ minWidth: "90px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "2px" }}>Readiness</div>
          <div style={{ fontSize: "60px", fontWeight: "800", color: readinessColor, lineHeight: 1 }}>{readiness}</div>
          <div style={{ fontSize: "10px", color: "#555" }}>/100</div>
        </div>
        <div style={{ flex: 1, minWidth: "160px" }}>
          <div style={{ height: "8px", background: "#1a1b2e", borderRadius: "4px", overflow: "hidden", marginBottom: "10px" }}>
            <div style={{ height: "100%", width: `${readiness}%`, background: readinessColor, transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
            <span style={{ color: "#4ade80" }}>● ≥80 Full</span>
            <span style={{ color: "#fbbf24" }}>● 60–79 Reduced</span>
            <span style={{ color: "#f97316" }}>● 40–59 Limited</span>
            <span style={{ color: "#ef4444" }}>● &lt;40 Restricted</span>
          </div>
          {/* ── Penalty breakdown ── */}
          <div style={{ fontSize: "11px", color: "#667", marginTop: "4px", display: "grid", gap: "3px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: rd.injuryPenalty > 0 ? "#f97316" : "#445" }}>
                Injury{active.length > 0 ? ` (${active.length} active, reg ${maxReg} / glb ${maxGlb})` : ""}
              </span>
              <span style={{ fontWeight: "600", color: rd.injuryPenalty > 0 ? "#f97316" : "#445" }}>
                {rd.injuryPenalty > 0 ? `−${rd.injuryPenalty}` : "0"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: rd.sleepPenalty > 0 ? "#a78bfa" : "#445" }}>
                Sleep{rd.avgSleepHours != null ? ` (7d avg ${rd.avgSleepHours.toFixed(1)}h)` : " (no data)"}
              </span>
              <span style={{ fontWeight: "600", color: rd.sleepPenalty > 0 ? "#a78bfa" : "#445" }}>
                {rd.sleepPenalty > 0 ? `−${rd.sleepPenalty}` : "0"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: rd.tsbPenalty > 0 ? "#ef4444" : "#445" }}>
                Training load{rd.latestTsb != null ? ` (TSB ${rd.latestTsb > 0 ? "+" : ""}${Number(rd.latestTsb).toFixed(1)})` : " (no data)"}
              </span>
              <span style={{ fontWeight: "600", color: rd.tsbPenalty > 0 ? "#ef4444" : "#445" }}>
                {rd.tsbPenalty > 0 ? `−${rd.tsbPenalty}` : "0"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body map ─────────────────────────────────────────────── */}
      <div style={{ ...cardStyle(), marginBottom: "16px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "10px" }}>
          Body Map — tap a dot to inspect
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          {["front", "back"].map(side => (
            <div key={side} style={{ flex: "0 0 auto", width: "140px" }}>
              <div style={{ fontSize: "9px", color: "#444", textAlign: "center", marginBottom: "3px", letterSpacing: "0.1em" }}>{side.toUpperCase()}</div>
              {renderSilhouette(side)}
            </div>
          ))}
        </div>
        <div style={{ fontSize: "9px", color: "#444", textAlign: "center", marginTop: "6px" }}>
          ● acute &nbsp; ○ chronic
        </div>
      </div>

      {/* ── Quick Add + Active Issues ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "16px" }}>

        <div style={cardStyle()}>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "10px" }}>Add Issue</div>
          <div style={{ display: "grid", gap: "8px" }}>
            <select value={addForm.key} onChange={e => setAddForm(f => ({ ...f, key: e.target.value, halfLifeHours: null }))} style={inputStyle()}>
              {Object.entries(OC_KEY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <select value={addForm.location} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))} style={inputStyle()}>
              {OC_BODY_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div>
              <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                Severity: {addForm.currentScore}/5 — {SCORE_LABELS[Number(addForm.currentScore)]}
              </div>
              <input type="range" min={0} max={5} step={1} value={addForm.currentScore}
                onChange={e => setAddForm(f => ({ ...f, currentScore: Number(e.target.value) }))}
                style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                Half-life: {addForm.halfLifeHours ?? OC_KEY_META[addForm.key]?.halfLifeHours ?? 72}h
              </div>
              <input type="number" min={1} max={720}
                placeholder={`default ${OC_KEY_META[addForm.key]?.halfLifeHours ?? 72}h`}
                value={addForm.halfLifeHours ?? ""}
                onChange={e => setAddForm(f => ({ ...f, halfLifeHours: e.target.value ? Number(e.target.value) : null }))}
                style={{ ...inputStyle(), padding: "6px 10px" }} />
            </div>
            <button onClick={addItem} style={{ ...buttonStyle(true), fontSize: "12px" }}>+ Add Issue</button>
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "10px" }}>
            Active Issues ({active.length})
          </div>
          {active.length === 0 && (
            <div style={{ fontSize: "12px", color: "#444", textAlign: "center", padding: "24px 0" }}>No active issues</div>
          )}
          {active.map(item => {
            const meta = OC_KEY_META[item.key] || OC_KEY_META.muscleStatus
            const pred = computeOcPredictedScore(item)
            const recov = computeOcRecoveryDate(item)
            return (
              <div key={item.id}
                onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                style={{
                  padding: "8px 10px", marginBottom: "6px", borderRadius: "6px", cursor: "pointer",
                  border: `1px solid ${selectedId === item.id ? meta.color : "#1a1b2e"}`,
                  background: selectedId === item.id ? "#111" : "transparent",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: meta.color }}>{item.location}</span>
                  <span style={{ fontSize: "10px", color: "#555" }}>{meta.label}{item.chronicity === "chronic" ? " ⟳" : ""}</span>
                  <span style={{ fontSize: "18px", fontWeight: "800", color: meta.color }}>{item.currentScore}</span>
                </div>
                <div style={{ fontSize: "10px", color: "#444", marginTop: "2px" }}>
                  pred {pred.toFixed(1)} · recovery {recov || "—"}
                </div>
              </div>
            )
          })}
          {ocItems.filter(i => i.currentScore === 0 && i.episodeCount > 0).length > 0 && (
            <div style={{ fontSize: "10px", color: "#333", marginTop: "8px", textAlign: "center" }}>
              {ocItems.filter(i => i.currentScore === 0 && i.episodeCount > 0).length} resolved
            </div>
          )}
        </div>
      </div>

      {/* ── Update panel ─────────────────────────────────────────── */}
      {selectedItem && (
        <div style={{ ...cardStyle(), marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
            <div>
              <span style={{ fontSize: "13px", fontWeight: "700", color: OC_KEY_META[selectedItem.key]?.color }}>{selectedItem.label}</span>
              {selectedItem.chronicity === "chronic" && (
                <span style={{ marginLeft: "8px", fontSize: "9px", background: "#1a1b2e", padding: "2px 6px", borderRadius: "4px", color: "#a78bfa", letterSpacing: "0.1em" }}>CHRONIC</span>
              )}
            </div>
            <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                Score: {selectedItem.currentScore}/5 — {SCORE_LABELS[selectedItem.currentScore]}
              </div>
              <input type="range" min={0} max={5} step={1} value={selectedItem.currentScore}
                onChange={e => updateItem(selectedItem.id, { currentScore: Number(e.target.value) })}
                style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Half-life (hrs)</div>
              <input type="number" min={1} max={720} value={selectedItem.halfLifeHours}
                onChange={e => updateItem(selectedItem.id, { halfLifeHours: Number(e.target.value) || selectedItem.halfLifeHours })}
                style={{ ...inputStyle(), padding: "6px 10px" }} />
            </div>
          </div>
          <div style={{ fontSize: "11px", color: "#555", display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
            <span>Started: {selectedItem.startDate?.slice(0, 10)}</span>
            <span>·</span>
            <span>Predicted now: {computeOcPredictedScore(selectedItem).toFixed(1)}</span>
            <span>·</span>
            <span>Recovery: {computeOcRecoveryDate(selectedItem) || "—"}</span>
            <span>·</span>
            <span>Episodes: {(selectedItem.episodeCount || 0) + 1}</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => resolveItem(selectedItem.id)}
              style={{ ...buttonStyle(false), fontSize: "11px", color: "#4ade80", borderColor: "#4ade80" }}>
              Mark Resolved
            </button>
            <button onClick={() => removeItem(selectedItem.id)}
              style={{ ...buttonStyle(false), fontSize: "11px", color: "#ef4444", borderColor: "#ef4444" }}>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* ── Operational Capacity history chart ───────────────────── */}
      <div style={{ ...cardStyle(), minWidth: "0" }}>
        <div style={{ fontSize: "12px", fontWeight: "700", marginBottom: "12px" }}>Operational Capacity History</div>
        {(!operationalCapacityData || operationalCapacityData.length === 0) ? (
          <div style={{ fontSize: "12px", color: "#444", textAlign: "center", padding: "40px 0" }}>
            No injury history — chart will populate once data is imported.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={operationalCapacityData} margin={{ top: 20, right: 20, left: 55, bottom: 35 }}>
              <CartesianGrid stroke="#1a1b2e" />
              <XAxis dataKey="label" label={{ value: "Date", position: "bottom", offset: 10, fill: "#ced2f0" }} />
              <YAxis domain={[0, 100]} label={{ value: "Operational capacity (%)", angle: -90, position: "insideLeft", offset: 15, fill: "#ced2f0", style: { textAnchor: "middle" } }} />
              <Tooltip formatter={(v, n) => {
                const lbl = { operationalPct: "Operational", acuteLossPct: "Acute burden", diseaseLossPct: "Disease burden", fatigueLossPct: "Fatigue burden" }
                return [`${Number(v).toFixed(1)}%`, lbl[n] || n]
              }} />
              <Legend verticalAlign="top" height={36} />
              <Line type="monotone" dataKey="operationalPct" stroke="#e5e7eb" strokeWidth={3} dot={false} name="Operational" />
              <Line type="monotone" dataKey="acuteLossPct"   stroke="#ef4444" strokeWidth={2} dot={false} name="Acute" />
              <Line type="monotone" dataKey="diseaseLossPct" stroke="#f59e0b" strokeWidth={2} dot={false} name="Disease" />
              <Line type="monotone" dataKey="fatigueLossPct" stroke="#a78bfa" strokeWidth={2} dot={false} name="Fatigue" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ─── TabSchedule ──────────────────────────────────────────────────────────────
function TabSchedule({ storedWorkouts, setStoredWorkouts, session, schedLog, setSchedLog, readinessScore, ocItems = [] }) {
  const [activeDay, setActiveDay] = useState(todayDayKey())
  const [schedView, setSchedView] = useState("schedule")
  const [expandedLog, setExpandedLog] = useState({})
  const [toast, setToast] = useState(null)
  const [openSections, setOpenSections] = useState({ stretch: true, warmup: true, main: true, core: true, cardio: true })
  const [variants, setVariants] = useState({})
  const [fields, setFields] = useState({})
  const [cardioEntries, setCardioEntries] = useState({}) // { day: [{modality, duration, notes}] }
  const [checkedItems, setCheckedItems] = useState({})   // { "day_section_index": bool }
  const [customItems, setCustomItems] = useState({})     // { "day_stretch": [{n,d}], "day_warmup": [...], "day_core": [...] }
  const [customExercises, setCustomExercises] = useState({}) // { day: [{id,n,sets,reps,load,notes}] }
  const [savedEntries, setSavedEntries] = useState({})   // { day: { ymca: entry|null, knr: entry|null } }
  const [justUndone, setJustUndone] = useState(null)    // "ymca" | "knr" | null
  const [sessionDate, setSessionDate] = useState(todayISO())

  const SPLIT_DAYS = ["Tue", "Thu"]
  const isSplitDay = SPLIT_DAYS.includes(activeDay)

  const VENUE_TIMES = { ymca: "05:30", knr: "09:35" }
  const VENUE_LABELS = { ymca: "YMCA (5:30–7:00)", knr: "KNR (9:35–10:45)" }

  const saveScheduleKey = async (key, value) => {
    await store.set(key, value)
    if (!supabase || !session?.user?.id) return
    const { error } = await supabase.from("user_kv").upsert(
      { user_id: session.user.id, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    )
    if (error) console.error(`Failed to sync ${key}:`, error)
  }

  // ── Load from storage ──────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const lg = await store.get("wt-log")
      const ss = await store.get("wt-sessions")
      const ci = await store.get("wt-custom-items")
      const cx = await store.get("wt-custom-exercises")
      // Fetch wt-log from Supabase and merge with localStorage
      if (supabase) {
        try {
          const { data } = await supabase.from("user_kv").select("value").eq("key", "wt-log")
          const sbLg = data?.[0]?.value
          console.log("wt-log from Supabase:", Array.isArray(sbLg) ? sbLg.length + " entries" : "not array", data)
          if (Array.isArray(sbLg)) {
            const local = Array.isArray(lg) ? lg : []
            const merged = Object.values(
              [...local, ...sbLg].reduce((acc, e) => { acc[e.id] = e; return acc }, {})
            ).sort((a, b) => b.id - a.id)
            setSchedLog(merged)
            await store.set("wt-log", merged)
          } else if (Array.isArray(lg)) {
            setSchedLog(lg)
          }
        } catch {
          if (Array.isArray(lg)) setSchedLog(lg)
        }
      } else if (Array.isArray(lg)) {
        setSchedLog(lg)
      }
      if (ss && typeof ss === "object") {
        const newFields = {}, newVariants = {}
        SDAYS.forEach(d => {
          if (!ss[d]) return
          Object.keys(ss[d]).forEach(exId => {
            const v = ss[d][exId]
            if (v && typeof v === "object" && !Array.isArray(v) && v.sets) {
              newFields[`${d}_${exId}`] = { sets: v.sets, reps: v.reps, load: v.load, notes: v.notes || "" }
              if (v.variant) newVariants[exId] = v.variant
            }
          })
        })
        if (Object.keys(newFields).length) setFields(prev => ({ ...prev, ...newFields }))
        if (Object.keys(newVariants).length) setVariants(prev => ({ ...prev, ...newVariants }))
      }
      if (ci && typeof ci === "object") setCustomItems(ci)
      if (cx && typeof cx === "object") setCustomExercises(cx)
    })()
  }, [session?.user?.id])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const CARDIO_INJURY_REGIONS = {
    run:  ["Ankle", "Toe", "Knee", "Shin"],
    bike: ["Knee", "Hip", "Glute"],
    swim: ["Shoulder"],
  }
  const getInjuryNote = (keywords) => {
    if (!keywords?.length) return null
    const hits = ocItems.filter(i => i.currentScore >= 3 && keywords.some(kw => (i.location || "").includes(kw)))
    if (!hits.length) return null
    return hits.map(i => `${i.location} (${SCORE_LABELS[i.currentScore] || i.currentScore})`).join(", ")
  }
  const injuryTag = (note) => note ? (
    <div style={{ fontSize: 10, color: "#f97316", marginTop: 4, display: "flex", alignItems: "flex-start", gap: 4 }}>
      <span style={{ flexShrink: 0 }}>⚠</span>
      <span>Active injury: {note} — monitor and modify if symptomatic</span>
    </div>
  ) : null

  const getProgDay = (day) => PROG[day] || { stretch: [], warmup: [], exercises: [], core: [] }
  const getVariant = (exId) => variants[exId] || "machine"

  const getF = (day, exId) => {
    const k = `${day}_${exId}`
    const prog = getProgDay(day)
    const ex = prog.exercises?.find(e => e.id === exId)
    if (!ex) return {}
    const vk = getVariant(exId)
    const rx = ex.variants[vk]
    return fields[k] || { sets: rx.sets, reps: rx.reps, load: rx.load, notes: "" }
  }

  const setF = (day, exId, fKey, val) => {
    setFields(prev => {
      const k = `${day}_${exId}`
      return { ...prev, [k]: { ...(prev[k] || {}), [fKey]: val } }
    })
  }

  const setVariantFn = (day, exId, vk) => {
    setVariants(prev => ({ ...prev, [exId]: vk }))
    const ex = getProgDay(day).exercises?.find(e => e.id === exId)
    if (ex) {
      const v = ex.variants[vk]
      const k = `${day}_${exId}`
      setFields(prev => ({ ...prev, [k]: { sets: v.sets, reps: v.reps, load: v.load, notes: prev[k]?.notes || "" } }))
    }
  }

  const isChanged = (day, exId) => {
    const ex = getProgDay(day).exercises?.find(e => e.id === exId)
    if (!ex) return false
    const rx = ex.variants[getVariant(exId)]
    const f = getF(day, exId)
    return f.sets !== rx.sets || f.reps !== rx.reps || f.load !== rx.load
  }

  // ── Checked items ──────────────────────────────────────────────────────
  const checkKey = (day, section, idx) => `${day}_${section}_${idx}`
  const isChecked = (day, section, idx) => !!checkedItems[checkKey(day, section, idx)]
  const toggleCheck = (day, section, idx) => {
    setCheckedItems(prev => ({ ...prev, [checkKey(day, section, idx)]: !prev[checkKey(day, section, idx)] }))
  }

  // ── Custom items (stretch, warmup, core) ───────────────────────────────
  const customKey = (day, section) => `${day}_${section}`
  const getCustomItems = (day, section) => customItems[customKey(day, section)] || []

  const addCustomItem = (day, section) => {
    const name = prompt(`Add item to ${section}:`)
    if (!name?.trim()) return
    const detail = prompt("Description (optional):") || ""
    const updated = { ...customItems, [customKey(day, section)]: [...getCustomItems(day, section), { n: name.trim(), d: detail.trim() }] }
    setCustomItems(updated)
    saveScheduleKey("wt-custom-items", updated)
  }

  const removeCustomItem = (day, section, idx) => {
    const arr = getCustomItems(day, section).filter((_, i) => i !== idx)
    const updated = { ...customItems, [customKey(day, section)]: arr }
    setCustomItems(updated)
    saveScheduleKey("wt-custom-items", updated)
  }

  // ── Custom exercises ───────────────────────────────────────────────────
  const getCustomExercises = (day) => customExercises[day] || []

  const addCustomExercise = (day) => {
    const name = prompt("Exercise name:")
    if (!name?.trim()) return
    const newEx = { id: `custom_${Date.now()}`, n: name.trim(), sets: "3", reps: "10", load: "", notes: "" }
    const updated = { ...customExercises, [day]: [...getCustomExercises(day), newEx] }
    setCustomExercises(updated)
    saveScheduleKey("wt-custom-exercises", updated)
  }

  const removeCustomExercise = (day, exId) => {
    const updated = { ...customExercises, [day]: getCustomExercises(day).filter(e => e.id !== exId) }
    setCustomExercises(updated)
    saveScheduleKey("wt-custom-exercises", updated)
  }

  const setCustomExF = (day, exId, fKey, val) => {
    setCustomExercises(prev => {
      const arr = (prev[day] || []).map(e => e.id === exId ? { ...e, [fKey]: val } : e)
      const updated = { ...prev, [day]: arr }
      saveScheduleKey("wt-custom-exercises", updated)
      return updated
    })
  }

  // ── Cardio entries ─────────────────────────────────────────────────────
  const getCardioEntries = (day) => {
    if (cardioEntries[day]?.length) return cardioEntries[day]
    const cd = CARDIO[day]
    const sessions = cd.sessions || []
    if (sessions.length > 0) return sessions.map(s => ({ modality: s.mod, duration: `${s.dMin}-${s.dMax}`, notes: "" }))
    return [{ modality: cd.mod || "run", duration: "", notes: "" }]
  }

  const setCardioEntryF = (day, idx, fKey, val) => {
    setCardioEntries(prev => {
      const arr = [...getCardioEntries(day)]
      arr[idx] = { ...arr[idx], [fKey]: val }
      return { ...prev, [day]: arr }
    })
  }

  const addCardioEntry = (day) => {
    setCardioEntries(prev => ({ ...prev, [day]: [...getCardioEntries(day), { modality: "run", duration: "", notes: "" }] }))
  }

  const removeCardioEntry = (day, idx) => {
    const arr = getCardioEntries(day).filter((_, i) => i !== idx)
    setCardioEntries(prev => ({ ...prev, [day]: arr.length ? arr : undefined }))
  }

  // ── Build session store ────────────────────────────────────────────────
  const buildSessionsStore = () => {
    const out = {}
    SDAYS.forEach(d => {
      out[d] = {}
      ;(getProgDay(d).exercises || []).forEach(ex => {
        const k = `${d}_${ex.id}`
        const f = fields[k]
        if (f) out[d][ex.id] = { ...f, variant: getVariant(ex.id) }
      })
    })
    return out
  }

  // ── Log session ────────────────────────────────────────────────────────
  const logSession = async (venue) => {
    const day = activeDay
    const prog = getProgDay(day)
    const ts = new Date(`${sessionDate}T${VENUE_TIMES[venue] || "12:00"}:00`).toISOString()

    const exercises = (prog.exercises || []).map(ex => {
      const vk = getVariant(ex.id)
      const rx = ex.variants[vk]
      const f = getF(day, ex.id)
      return {
        exercise_id: ex.id, exercise_name: ex.n, variant: vk, variant_name: rx.n,
        prescribed: { sets: rx.sets, reps: rx.reps, load: rx.load },
        actual: { sets: f.sets || rx.sets, reps: f.reps || rx.reps, load: f.load || rx.load },
        notes: f.notes || "", changed: isChanged(day, ex.id),
      }
    })

    const customExs = getCustomExercises(day).map(e => ({
      exercise_id: e.id, exercise_name: e.n, variant: "custom", variant_name: e.n,
      prescribed: { sets: e.sets, reps: e.reps, load: e.load },
      actual: { sets: e.sets, reps: e.reps, load: e.load },
      notes: e.notes || "", changed: false,
    }))

    const checkedStretch = getProgDay(day).stretch?.map((item, i) => ({ ...item, done: isChecked(day, "stretch", i) }))
    const checkedWarmup = getProgDay(day).warmup?.map((item, i) => ({ ...item, done: isChecked(day, "warmup", i) }))

    const entry = {
      id: Date.now(),
      session_id: ts.replace(/\D/g, "").slice(0, 17),
      logged_at: ts, date: sessionDate,
      day, dayLabel: SMETA[day]?.label || day,
      venue: venue || "ymca",
      venue_label: VENUE_LABELS[venue] || "",
      program: "Kinesiology (primary)",
      exercises: [...exercises, ...customExs],
      cardio: getCardioEntries(day),
      stretch_completed: checkedStretch,
      warmup_completed: checkedWarmup,
      source: "LIFT Schedule Tab", apple_watch_sync_pending: true,
      data: Object.fromEntries(exercises.map(ex => [ex.exercise_id, [{ r: ex.actual.reps, w: ex.actual.load }]])),
    }

    const newLog = [entry, ...schedLog]
    setSchedLog(newLog)
    setSavedEntries(prev => ({ ...prev, [day]: { ...(prev[day] || {}), [venue]: entry } }))

    await saveScheduleKey("wt-log", newLog)
    await saveScheduleKey("wt-sessions", buildSessionsStore())

    const types = SDAY_TYPES[day] || []
    const allCardio = getCardioEntries(day)
    if (types.length > 0 && allCardio.some(c => c.duration)) {
      const summaryEntries = allCardio.filter(c => c.duration).map((c, i) => ({
        id: entry.id + i, date: sessionDate, time: VENUE_TIMES[venue] || "", dateTime: ts,
        type: c.modality === "run" ? "Running" : c.modality === "bike" ? "Cycling" : c.modality === "swim" ? "Swimming" : "Other",
        dur: parseInt(c.duration) || 0, hr: null, distance: null, calories: null,
        notes: `from Schedule , ${SMETA[day]?.theme || day}${c.notes ? " , " + c.notes : ""}`,
        _scheduleId: entry.id,
      }))
      const existing = await store.get("ufd-workouts") || storedWorkouts
      const merged = [...(Array.isArray(existing) ? existing : []), ...summaryEntries]
        .sort((a, b) => String(a.dateTime || a.date || "").localeCompare(String(b.dateTime || b.date || "")))
      setStoredWorkouts(merged)
      await saveScheduleKey("ufd-workouts", merged)
    }

    showToast(`${VENUE_LABELS[venue] || "Session"} logged`)
  }

  const undoSession = async (venue) => {
    const day = activeDay
    const entry = savedEntries[day]?.[venue]
    if (!entry) return
    const newLog = schedLog.filter(e => e.id !== entry.id)
    setSchedLog(newLog)
    const newWorkouts = storedWorkouts.filter(w => w._scheduleId !== entry.id)
    setStoredWorkouts(newWorkouts)
    setSavedEntries(prev => ({ ...prev, [day]: { ...(prev[day] || {}), [venue]: null } }))
    setJustUndone(venue)
    await saveScheduleKey("wt-log", newLog)
    await saveScheduleKey("ufd-workouts", newWorkouts)
    setTimeout(() => setJustUndone(null), 4000)
    showToast("Session removed")
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
    setActiveDay(entry.day)
    setSchedView("schedule")
    showToast(`Loaded ${entry.dayLabel} for editing`)
  }

  const toggleSection = k => setOpenSections(prev => ({ ...prev, [k]: !prev[k] }))

  // ── Styles ─────────────────────────────────────────────────────────────
  const secHdr = (key, label, dot, meta) => (
    <div onClick={() => toggleSection(key)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: openSections[key] ? "1px solid #1a1a1a" : "none" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: dot }}>{label}</span>
      {meta && <span style={{ fontSize: 10, color: "#555", marginLeft: "auto" }}>{meta}</span>}
      <span style={{ fontSize: 10, color: "#444", marginLeft: meta ? 0 : "auto", display: "inline-block", transform: openSections[key] ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
    </div>
  )

  const addBtn = (onClick) => (
    <button onClick={onClick}
      style={{ width: "100%", marginTop: 8, padding: "6px", border: "0.5px dashed #333", borderRadius: 5, background: "transparent", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
      + Add item
    </button>
  )

  // ── Checklist section (stretch / warmup / core) ───────────────────────
  const checklistSection = (day, section, items, dot, label, meta) => {
    const custom = getCustomItems(day, section)
    const allItems = [...(items || []), ...custom]
    if (!openSections[section]) return (
      <div style={{ border: "0.5px solid #1a1a1a", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
        {secHdr(section, label, dot, meta)}
      </div>
    )
    return (
      <div style={{ border: "0.5px solid #1a1a1a", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
        {secHdr(section, label, dot, meta)}
        <div style={{ padding: "6px 14px 10px" }}>
          {allItems.map((item, i) => {
            const isCustom = i >= (items || []).length
            const customIdx = i - (items || []).length
            const checked = isChecked(day, section, i)
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0", borderBottom: i < allItems.length - 1 ? "1px solid #111" : "none" }}>
                <input type="checkbox" checked={checked} onChange={() => toggleCheck(day, section, i)}
                  style={{ marginTop: 3, flexShrink: 0, accentColor: dot }} />
                <div style={{ flex: 1, opacity: checked ? 0.5 : 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: checked ? "#555" : "#d8d8d8", textDecoration: checked ? "line-through" : "none" }}>{item.n}</div>
                  {item.d && <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{item.d}</div>}
                </div>
                {isCustom && (
                  <button onClick={() => removeCustomItem(day, section, customIdx)}
                    style={{ background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 12, padding: "0 4px" }}>✕</button>
                )}
              </div>
            )
          })}
          {addBtn(() => addCustomItem(day, section))}
        </div>
      </div>
    )
  }

  // ── Exercise card ──────────────────────────────────────────────────────
  const exCard = (ex, day, isCustom = false) => {
    const vk = isCustom ? "custom" : getVariant(ex.id)
    const v = isCustom ? ex : ex.variants?.[vk]
    const f = isCustom ? ex : getF(day, ex.id)
    const chg = isCustom ? false : isChanged(day, ex.id)
    const vColors = { machine: "#3b82f6", db: "#22c55e", friendly: "#f97316" }
    const vBgs    = { machine: "rgba(59,130,246,0.12)", db: "rgba(34,197,94,0.12)", friendly: "rgba(249,115,22,0.12)" }
    const fl = ex.fi === "toe" ? "Toe-safe" : "Shoulder-safe"

    const fieldInput = (lbl, fKey, rxVal) => (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>{lbl}</div>
        <input type="text" value={(isCustom ? ex[fKey] : f[fKey]) || ""}
          onChange={e => isCustom ? setCustomExF(day, ex.id, fKey, e.target.value) : setF(day, ex.id, fKey, e.target.value)}
          style={{ width: "100%", padding: "5px 7px", border: `0.5px solid ${!isCustom && (f[fKey] || "") !== rxVal ? "#d97706" : "#252525"}`, borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: !isCustom && (f[fKey] || "") !== rxVal ? "rgba(217,119,6,0.1)" : "#111", fontFamily: "inherit", outline: "none" }} />
        {!isCustom && <div style={{ fontSize: 9, color: "#444" }}>Rx: {rxVal}</div>}
      </div>
    )

    return (
      <div key={ex.id} style={{ marginTop: 10, border: `0.5px solid ${chg ? "#d97706" : "#1e1e1e"}`, borderRadius: 7, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px 7px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap", background: "#0d0d0d" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#d8d8d8" }}>{ex.n}</span>
            {chg && <span style={{ fontSize: 9, fontWeight: 700, color: "#d97706", background: "rgba(217,119,6,0.15)", borderRadius: 3, padding: "1px 5px" }}>modified</span>}
            {isCustom && <span style={{ fontSize: 9, color: "#7F77DD", background: "rgba(127,119,221,0.15)", borderRadius: 3, padding: "1px 5px" }}>custom</span>}
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {!isCustom && ["machine", "db", "friendly"].map(k => {
              const lbl = k === "machine" ? "Machine" : k === "db" ? "DB" : fl
              const active = vk === k
              return (
                <button key={k} onClick={() => setVariantFn(day, ex.id, k)}
                  style={{ padding: "3px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `0.5px solid ${active ? vColors[k] : "#222"}`, background: active ? vBgs[k] : "transparent", color: active ? vColors[k] : "#444" }}>
                  {lbl}
                </button>
              )
            })}
            {isCustom && (
              <button onClick={() => removeCustomExercise(day, ex.id)}
                style={{ padding: "3px 7px", borderRadius: 4, fontSize: 10, cursor: "pointer", border: "0.5px solid #333", background: "transparent", color: "#555" }}>
                Remove
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "4px 12px 10px", background: "#0a0a0a" }}>
          {!isCustom && <div style={{ fontSize: 11, color: "#555", padding: "4px 0 6px" }}>{v?.n}</div>}
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            {fieldInput("Sets", "sets", v?.sets)}
            {fieldInput("Reps", "reps", v?.reps)}
            {fieldInput("Load", "load", v?.load)}
          </div>
          {v?.note && <div style={{ fontSize: 11, color: "#555", lineHeight: 1.4, paddingTop: 5, borderTop: "1px solid #1a1a1a", marginBottom: 4 }}>{v.note}</div>}
          {!isCustom && injuryTag(getInjuryNote(
            ex.fi === "shoulder" ? ["Shoulder"] : ex.fi === "toe" ? ["Toe", "Ankle"] : null
          ))}
          <textarea value={(isCustom ? ex.notes : f.notes) || ""}
            onChange={e => isCustom ? setCustomExF(day, ex.id, "notes", e.target.value) : setF(day, ex.id, "notes", e.target.value)}
            placeholder="Session note (optional)" rows={1}
            style={{ width: "100%", marginTop: 4, padding: "4px 7px", border: "0.5px solid #1e1e1e", borderRadius: 5, fontSize: 11, color: "#666", background: "#111", fontFamily: "inherit", resize: "none", outline: "none" }} />
        </div>
      </div>
    )
  }

  // ── Cardio block ───────────────────────────────────────────────────────
  const cardioBlock = (day) => {
    const cd = CARDIO[day]
    const prescribedSessions = cd.sessions || []
    const entries = getCardioEntries(day)
    const modColor = { run: "#ef4444", bike: "#d97706", swim: "#0ea5e9", walk: "#22c55e", row: "#8b5cf6" }
    const modLabel = { run: "Run", bike: "Bike", swim: "Swim", walk: "Walk", row: "Row" }

    return (
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#7F77DD", background: "rgba(127,119,221,0.12)", borderRadius: 4, padding: "2px 8px", display: "inline-block", marginBottom: 10 }}>{cd.goal}</div>

        {prescribedSessions.map((ps, pi) => (
          <div key={pi} style={{ marginBottom: 8, padding: "8px 10px", background: "#0d0d0d", borderRadius: 6, border: `0.5px solid ${modColor[ps.mod] || "#333"}44` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${modColor[ps.mod] || "#888"}22`, color: modColor[ps.mod] || "#888" }}>{modLabel[ps.mod] || ps.mod}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#d8d8d8" }}>{ps.type}</div>
              <div style={{ fontSize: 10, color: "#555", marginLeft: "auto" }}>{ps.dMin}–{ps.dMax} min · {ps.dist}</div>
            </div>
            <div style={{ fontSize: 11, color: "#555" }}>{ps.rationale}</div>
            {ps.cnote && <div style={{ fontSize: 10, color: "#444", marginTop: 3, fontStyle: "italic" }}>{ps.cnote}</div>}
            {injuryTag(getInjuryNote(CARDIO_INJURY_REGIONS[ps.mod]))}
          </div>
        ))}

        <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 6px" }}>Log actual</div>
        {entries.map((entry, idx) => {
          const mc = modColor[entry.modality] || "#888"
          return (
            <div key={idx} style={{ marginBottom: 10, padding: "10px 12px", border: `0.5px solid #1e1e1e`, borderRadius: 7, background: "#0a0a0a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <select value={entry.modality} onChange={e => setCardioEntryF(day, idx, "modality", e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${mc}22`, color: mc, border: `0.5px solid ${mc}`, outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {["run", "bike", "swim", "walk", "row"].map(m => <option key={m} value={m}>{modLabel[m]}</option>)}
                </select>
                {idx === 0 && <span style={{ fontSize: 11, color: "#555" }}>{cd.type} · {cd.intensity}</span>}
                {idx > 0 && <span style={{ fontSize: 10, color: "#444" }}>Additional session</span>}
                {idx > 0 && (
                  <button onClick={() => removeCardioEntry(day, idx)}
                    style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 12 }}>✕</button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Duration (min)</div>
                  <input type="text" value={entry.duration} onChange={e => setCardioEntryF(day, idx, "duration", e.target.value)}
                    placeholder={idx === 0 ? `${cd.dMin}–${cd.dMax} min` : "minutes"}
                    style={{ width: "100%", padding: "5px 7px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none" }} />
                  {idx === 0 && <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>Target: {cd.dMin}–{cd.dMax} min</div>}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Distance / notes</div>
                  <input type="text" value={entry.notes} onChange={e => setCardioEntryF(day, idx, "notes", e.target.value)}
                    placeholder={idx === 0 ? cd.dist : "e.g. 2 miles"}
                    style={{ width: "100%", padding: "5px 7px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none" }} />
                </div>
              </div>
            </div>
          )
        })}
        {addBtn(() => addCardioEntry(day))}
        {cd.cnote && <div style={{ fontSize: 10, color: "#555", lineHeight: 1.4, marginTop: 8 }}>{cd.cnote}</div>}
      </div>
    )
  }

  // ── Log bar ────────────────────────────────────────────────────────────
  const logBar = () => {
    const day = activeDay
    const saved = savedEntries[day] || {}
    const venues = isSplitDay ? ["ymca", "knr"] : ["ymca"]

    return (
      <div style={{ marginTop: 16 }}>
        {/* Date picker */}
        <div style={{ marginBottom: 10, padding: "10px 14px", border: "0.5px solid #1a1a1a", borderRadius: 8, background: "#0a0a0a", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#555", whiteSpace: "nowrap" }}>Session date</div>
          <input type="date" value={sessionDate} max={todayISO()} onChange={e => setSessionDate(e.target.value)}
            style={{ flex: 1, padding: "5px 8px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: sessionDate !== todayISO() ? "#d97706" : "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none", colorScheme: "dark" }} />
          {sessionDate !== todayISO() && (
            <button onClick={() => setSessionDate(todayISO())}
              style={{ padding: "4px 10px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 11, color: "#666", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>Today</button>
          )}
        </div>

        {justUndone && (
          <div style={{ padding: "10px 14px", background: "rgba(153,60,29,0.15)", border: "0.5px solid #993C1D", borderRadius: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>Session removed</div>
          </div>
        )}

        {venues.map(venue => {
          const entry = saved[venue]
          const label = isSplitDay ? VENUE_LABELS[venue] : "Log this session"
          const timeLabel = isSplitDay ? ` · ${VENUE_TIMES[venue]}` : ""

          if (entry) {
            const changed = entry.exercises?.filter(x => x.changed) || []
            return (
              <div key={venue} style={{ marginBottom: 10 }}>
                <div style={{ padding: "10px 14px", background: "rgba(15,110,86,0.15)", border: "0.5px solid #0F6E56", borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{label} — logged</div>
                  <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginTop: 2 }}>{new Date(entry.logged_at).toLocaleString()} · {entry.session_id}</div>
                  {changed.length > 0 && <div style={{ fontSize: 10, color: "#d97706", marginTop: 3 }}>{changed.length} exercise(s) modified from prescription</div>}
                  {entry.cardio?.length > 0 && (
                    <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>
                      Cardio: {entry.cardio.map(c => `${c.duration}min ${c.modality}`).join(" + ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => undoSession(venue)}
                    style={{ flex: 1, padding: 10, background: "transparent", color: "#888", border: "0.5px solid #333", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Undo save
                  </button>
                  <button onClick={() => logSession(venue)}
                    style={{ flex: 1, padding: 10, background: "#185FA5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Re-log
                  </button>
                </div>
              </div>
            )
          }

          return (
            <button key={venue} onClick={() => logSession(venue)}
              style={{ width: "100%", padding: 13, background: venue === "knr" ? "#0F6E56" : "#185FA5", color: "#fff", border: "none", borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
              Log {label}{timeLabel}
            </button>
          )
        })}
      </div>
    )
  }

  const prog = getProgDay(activeDay)
  const meta = SMETA[activeDay] || {}

  return (
    <div style={{ color: "#d8d8d8", position: "relative" }}>
      {/* Day navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 3, background: "#0a0a0a", borderRadius: 8, padding: 4, border: "1px solid #1a1a1a", flexWrap: "wrap" }}>
          {SDAYS.map(d => {
            const m = SMETA[d] || {}
            const active = d === activeDay && schedView === "schedule"
            const isSplit = SPLIT_DAYS.includes(d)
            return (
              <button key={d} onClick={() => { setActiveDay(d); setSchedView("schedule"); setSavedEntries(prev => ({ ...prev })) }}
                style={{ padding: "6px 12px", border: "none", cursor: "pointer", background: active ? (m.color || "#185FA5") + "22" : "transparent", fontSize: 12, fontWeight: active ? 700 : 500, letterSpacing: "0.06em", textTransform: "uppercase", color: active ? (m.color || "#185FA5") : "#3a3a3a", borderRadius: 6, position: "relative" }}>
                {d}
                {isSplit && <div style={{ fontSize: 7, color: "#7F77DD", marginTop: 1 }}>split</div>}
                {!isSplit && <div style={{ fontSize: 8, opacity: 0.7, marginTop: 1, color: m.venue === "KNR" ? "#3b82f6" : m.venue === "—" ? "#333" : "#d97706" }}>{m.venue}</div>}
              </button>
            )
          })}
        </div>
        <button onClick={() => setSchedView(v => v === "log" ? "schedule" : "log")} style={buttonStyle(false)}>
          {schedView === "log" ? "◀ Schedule" : `Log (${schedLog.length})`}
        </button>
      </div>

      {schedView === "log" && (
        <ScheduleLogView log={schedLog} expanded={expandedLog} setExpanded={setExpandedLog} onDelete={deleteEntry} onEdit={editEntry} />
      )}

      {schedView === "schedule" && (
        <>
          {readinessScore != null && readinessScore < 80 && (
            <div style={{
              padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "12px",
              background: readinessScore >= 60 ? "rgba(251,191,36,0.08)" : readinessScore >= 40 ? "rgba(249,115,22,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${readinessScore >= 60 ? "#fbbf24" : readinessScore >= 40 ? "#f97316" : "#ef4444"}`,
              color: readinessScore >= 60 ? "#fbbf24" : readinessScore >= 40 ? "#f97316" : "#ef4444",
            }}>
              ⚠ Readiness {readinessScore}% —{" "}
              {readinessScore >= 60
                ? "consider reducing today's load by 20 to 30%"
                : readinessScore >= 40
                ? "substitute high-impact activity with low-impact alternative or shift session"
                : "flag for rest or minimal movement only. Long-term targets remain on track."}
            </div>
          )}
          {/* Day header */}
          <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #1a1a1a" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8e8", lineHeight: 1 }}>
              {meta.label || activeDay}
              <span style={{ fontSize: 13, fontWeight: 600, color: meta.color || "#185FA5", marginLeft: 8 }}>{meta.theme}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: "#7F77DD", background: "rgba(127,119,221,0.15)", padding: "2px 7px", borderRadius: 3, marginLeft: 6 }}>Kinesiology</span>
              {isSplitDay && <span style={{ fontSize: 9, fontWeight: 600, color: "#0ea5e9", background: "rgba(14,165,233,0.15)", padding: "2px 7px", borderRadius: 3, marginLeft: 6 }}>Split day</span>}
            </div>
            {isSplitDay && (
              <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                YMCA 5:30–7:00 am · KNR 9:35–10:45 am
              </div>
            )}
          </div>

          {/* Stretch */}
          {prog.stretch?.length > 0 && checklistSection(activeDay, "stretch", prog.stretch, "#7F77DD", "Stretch", "~5 min")}

          {/* Warmup */}
          {prog.warmup?.length > 0 && checklistSection(activeDay, "warmup", prog.warmup, "#BA7517", "Warm-up", "")}

          {/* Main program */}
          <div style={{ border: "0.5px solid #1a1a1a", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
            {secHdr("main", "Main program", "#185FA5", "")}
            {openSections.main && (
              <div style={{ padding: "4px 14px 12px" }}>
                {prog.exercises?.length > 0
                  ? prog.exercises.map(ex => exCard(ex, activeDay))
                  : <div style={{ textAlign: "center", padding: 16, color: "#444", fontSize: 13 }}>Active recovery — no resistance training today.</div>}
                {getCustomExercises(activeDay).map(ex => exCard(ex, activeDay, true))}
                {addBtn(() => addCustomExercise(activeDay))}
              </div>
            )}
          </div>

          {/* Core */}
          {prog.core?.length > 0 && checklistSection(activeDay, "core", prog.core, "#3B6D11", "Core", "~5 min")}

          {/* Cardio */}
          <div style={{ border: "0.5px solid #1a1a1a", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
            {secHdr("cardio", "Cardio prescription", "#993C1D", "")}
            {openSections.cardio && cardioBlock(activeDay)}
          </div>

          {logBar()}
        </>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid #333", color: "#e8e8e8", padding: "8px 20px", borderRadius: 8, fontSize: 13, zIndex: 999, pointerEvents: "none" }}>
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

function TrainingDashboard({ workouts, recentNutrition, healthFitDaily = [] }) {
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

  const pmfChartData = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    cutoff.setHours(0, 0, 0, 0)
    return (Array.isArray(healthFitDaily) ? healthFitDaily : [])
      .filter(r => r.date && new Date(r.date) >= cutoff)
      .map(r => ({
        date: r.date,
        label: String(r.date).slice(5),
        ctl:  r.ctl  != null ? Number(r.ctl)  : null,
        atl:  r.atl  != null ? Number(r.atl)  : null,
        tsb:  r.tsb  != null ? Number(r.tsb)  : null,
        acwr: r.acwr != null ? Number(r.acwr) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [healthFitDaily])

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

        {pmfChartData.length > 0 && (
          <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#ced2f0", marginBottom: "12px" }}>
              Fitness · Fatigue · Form (90 days)
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={pmfChartData} margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(1, Math.floor(pmfChartData.length / 12) - 1)} />
                <YAxis yAxisId="pmf" label={{ value: "TSS", angle: -90, position: "insideLeft", offset: 10, fill: "#8fa8d8", style: { textAnchor: "middle" }, fontSize: 11 }} />
                <YAxis yAxisId="acwr" orientation="right" domain={[0, 2]} tickCount={5}
                  label={{ value: "ACWR", angle: 90, position: "insideRight", offset: -10, fill: "#94a3b8", style: { textAnchor: "middle" }, fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [v != null ? Number(v).toFixed(1) : "—", name]} />
                <Legend verticalAlign="top" height={28} />
                <Line yAxisId="pmf" type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#4a9ee8" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="pmf" type="monotone" dataKey="atl" name="Fatigue (ATL)" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="pmf" type="monotone" dataKey="tsb" name="Form (TSB)"    stroke="#4ade80" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="acwr" type="monotone" dataKey="acwr" name="ACWR" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
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
  const cutoffMs = Date.now() - 52 * 7 * 24 * 60 * 60 * 1000
  workouts.forEach(w => {
    const wMs = new Date(w.dateTime || w.date || 0).getTime()
    if (!Number.isFinite(wMs) || wMs < cutoffMs) return
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
function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function stableHash(input) {
  const str = String(input || "")
  let hash = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

function makeSessionId(prefix, payload) {
  return `${prefix}_${stableHash(safeStringify(payload) || String(Date.now()))}`
}

function createInlineImportWorker() {
  const workerSource = `
self.onmessage = async function(event) {
  const data = event && event.data ? event.data : {};
  if (data.type !== 'process') return;

  const appleFile = data.appleFile || null;
  const technogymFile = data.technogymFile || null;

  try {
    self.postMessage({ type: 'progress', stage: 'starting', message: 'Initializing import worker' });
    const apple = appleFile ? parseAppleHealthFile(appleFile) : { workouts: [], rejected: [], diagnostics: { parsed_lines: 0 } };
    self.postMessage({ type: 'progress', stage: 'apple_done', message: 'Apple file parsed', apple_count: apple.workouts.length });
    const technogym = technogymFile ? parseTechnogymFile(technogymFile) : { workouts: [], rejected: [], diagnostics: { candidate_records: 0 } };
    self.postMessage({ type: 'progress', stage: 'technogym_done', message: 'Technogym file parsed', technogym_count: technogym.workouts.length });

    const overlapBundle = findOverlapCandidates(apple.workouts, technogym.workouts);
    self.postMessage({ type: 'progress', stage: 'overlaps_done', message: 'Overlap candidates created', overlap_count: overlapBundle.candidates.length });

    const built = buildImportResult(apple.workouts, technogym.workouts, overlapBundle.candidates, apple.rejected.concat(technogym.rejected));
    built.diagnostics = {
      apple: apple.diagnostics,
      technogym: technogym.diagnostics,
      overlaps: overlapBundle.summary
    };
    built.appleSleep = apple.sleep || [];

    self.postMessage({ type: 'done', result: built });
  } catch (error) {
    self.postMessage({ type: 'error', error: error && error.message ? error.message : String(error) });
  }
};

function normalizeOffset(offset) {
  if (!offset) return '';
  if (/^[+-]\d{2}:\d{2}$/.test(offset)) return offset;
  if (/^[+-]\d{4}$/.test(offset)) return offset.slice(0, 3) + ':' + offset.slice(3);
  return offset;
}

function normalizeDateString(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}:?\d{2}|Z))?$/);
  if (m) {
    const tz = m[3] === 'Z' ? 'Z' : normalizeOffset(m[3] || '');
    return m[1] + 'T' + m[2] + tz;
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function toMs(value) {
  const normalized = normalizeDateString(value);
  if (!normalized) return null;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function minutesBetween(start, end) {
  const s = toMs(start);
  const e = toMs(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return (e - s) / 60000;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getAttr(line, key) {
  const escaped = key.replace(/[.*+?^\${}()|[\]\\]/g, '\\export default function App()');
  const m = line.match(new RegExp(escaped + '="([^"]*)"'));
  return m ? m[1] : null;
}

function mapAppleWorkoutType(rawType) {
  const typeMap = {
    HKWorkoutActivityTypeRunning: 'Running',
    HKWorkoutActivityTypeCycling: 'Cycling',
    HKWorkoutActivityTypeWalking: 'Walking',
    HKWorkoutActivityTypeTraditionalStrengthTraining: 'Traditional Strength Training',
    HKWorkoutActivityTypeFunctionalStrengthTraining: 'Functional Strength Training',
    HKWorkoutActivityTypeCoreTraining: 'Core Training',
    HKWorkoutActivityTypeElliptical: 'Elliptical',
    HKWorkoutActivityTypeRowing: 'Rowing',
    HKWorkoutActivityTypeStairClimbing: 'Stair Climbing',
    HKWorkoutActivityTypeCooldown: 'Cooldown',
    HKWorkoutActivityTypeSwimming: 'Swimming',
    HKWorkoutActivityTypeHiking: 'Hiking',
    HKWorkoutActivityTypeOther: 'Other'
  };
  return typeMap[rawType] || 'Other';
}

function parseAppleHealthFile(file) {
  const reader = new FileReaderSync();
  const chunkSize = 2 * 1024 * 1024;
  let offset = 0;
  let buffer = '';
  let lineCount = 0;

  const workouts = [];
  const rejected = [];
  const dedupe = new Set();
  const statDistance = new Map();
  const swimLaps = new Map();
  const sleepSegments = new Map(); // date → total asleep minutes
  const statTypes = new Set([
    'HKQuantityTypeIdentifierDistanceWalkingRunning',
    'HKQuantityTypeIdentifierDistanceCycling',
    'HKQuantityTypeIdentifierDistanceSwimming'
  ]);

  function processLine(line) {
    lineCount += 1;

    if (line.includes('<WorkoutStatistics')) {
      const type = getAttr(line, 'type');
      const startDate = getAttr(line, 'startDate');
      const sum = num(getAttr(line, 'sum'));
      const unit = getAttr(line, 'unit');
      if (type && startDate && statTypes.has(type) && Number.isFinite(sum)) {
        statDistance.set(startDate, { sum, unit: unit || null });
      }
      return;
    }

    if (line.includes('<Record ') && line.includes('HKCategoryTypeIdentifierSleepAnalysis')) {
      const val = getAttr(line, 'value') || '';
      const isAsleep = val.includes('Asleep'); // Core, Deep, REM, Unspecified — excludes Awake/InBed
      if (isAsleep) {
        const startDate = getAttr(line, 'startDate');
        const endDate = getAttr(line, 'endDate');
        const durMin = minutesBetween(startDate, endDate);
        if (Number.isFinite(durMin) && durMin > 0 && startDate) {
          // Attribute the sleep to the calendar date of the end time (morning of wake)
          const day = String(endDate || startDate).slice(0, 10);
          sleepSegments.set(day, (sleepSegments.get(day) || 0) + durMin);
        }
      }
      return;
    }

    if (line.includes('<Record ') && line.includes('HKQuantityTypeIdentifierDistanceSwimming')) {
      const startDate = getAttr(line, 'startDate');
      const value = num(getAttr(line, 'value'));
      if (startDate && Number.isFinite(value)) {
        const day = String(startDate).slice(0, 10);
        swimLaps.set(day, (swimLaps.get(day) || 0) + value);
      }
      return;
    }

    if (line.includes('<Workout ')) {
      const rawType = getAttr(line, 'workoutActivityType');
      const startDate = getAttr(line, 'startDate');
      const endDate = getAttr(line, 'endDate');
      if (!rawType || !startDate || !endDate) {
        rejected.push({ source: 'AppleHealth', reason: 'Missing required workout dates or type', raw_line: line.slice(0, 400) });
        return;
      }
      const key = startDate + '|' + rawType;
      if (dedupe.has(key)) return;
      dedupe.add(key);

      const durationMin = num(getAttr(line, 'duration')) || minutesBetween(startDate, endDate) || 0;
      const distance = num(getAttr(line, 'totalDistance')) || 0;
      const workout = {
        source: 'AppleHealth',
        raw_type: rawType,
        type: mapAppleWorkoutType(rawType),
        start_date: normalizeDateString(startDate),
        end_date: normalizeDateString(endDate),
        duration_min: durationMin,
        distance: distance,
        distance_unit: getAttr(line, 'totalDistanceUnit') || null,
        calories: num(getAttr(line, 'totalEnergyBurned')) || 0,
        hr: 0,
        notes: '',
        source_name: getAttr(line, 'sourceName') || '',
        raw_start_date: startDate
      };
      workouts.push(workout);
    }
  }

  while (offset < file.size) {
    const chunk = reader.readAsText(file.slice(offset, offset + chunkSize));
    offset += chunkSize;
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (let i = 0; i < lines.length; i += 1) processLine(lines[i]);
    self.postMessage({ type: 'progress', stage: 'apple_parse', message: 'Parsing Apple XML', processed_bytes: Math.min(offset, file.size), total_bytes: file.size, parsed_lines: lineCount });
  }
  if (buffer) processLine(buffer);

  for (let i = 0; i < workouts.length; i += 1) {
    const workout = workouts[i];
    if (!workout.distance) {
      const stat = statDistance.get(workout.raw_start_date);
      if (stat && Number.isFinite(Number(stat.sum))) {
        workout.distance = Number(stat.sum);
        workout.distance_unit = stat.unit || workout.distance_unit;
      }
    }
    if ((!workout.distance || workout.distance === 0) && workout.type === 'Swimming') {
      const day = String(workout.raw_start_date || '').slice(0, 10);
      const yards = swimLaps.get(day);
      if (Number.isFinite(Number(yards)) && yards > 0) {
        workout.distance = Number(yards);
        workout.distance_unit = 'yd';
      }
    }
  }

  workouts.sort(function(a, b) {
    return (toMs(a.start_date) || 0) - (toMs(b.start_date) || 0);
  });

  const sleep = Array.from(sleepSegments.entries()).map(([date, duration_min]) => ({
    source: 'AppleHealth',
    date,
    duration_min: Math.round(duration_min),
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    workouts: workouts.map(function(w) {
      const copy = Object.assign({}, w);
      delete copy.raw_start_date;
      return copy;
    }),
    sleep,
    rejected,
    diagnostics: {
      parsed_lines: lineCount,
      deduplicated_workouts: dedupe.size,
      distance_stats_found: statDistance.size,
      swim_days_found: swimLaps.size,
      sleep_days_found: sleepSegments.size
    }
  };
}

function classifyTechnogym(workout) {
  if (workout.TotalIsoWeight != null || workout.Rm1 != null) return 'Traditional Strength Training';
  if (workout.AvgSpeedRpm != null || workout.AvgRpm != null) return 'Cycling';
  if (workout.AvgRunningCadence != null || workout.RunType != null) return 'Running';
  if (workout.HDistance != null) return 'Cycling';
  const raw = String(workout.activity_type || workout.type || workout.raw_type || '').toLowerCase();
  if (raw.includes('run') || raw.includes('tread')) return 'Running';
  if (raw.includes('bike') || raw.includes('cycl') || raw.includes('spin')) return 'Cycling';
  if (raw.includes('row')) return 'Rowing';
  if (raw.includes('ellip')) return 'Elliptical';
  if (raw.includes('stair')) return 'Stair Climbing';
  if (raw.includes('strength') || raw.includes('weight')) return 'Traditional Strength Training';
  return 'Machine Cardio';
}

function looksLikeTechnogymSession(obj) {
  if (!obj || Array.isArray(obj) || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  if (!keys.length) return false;
  const lower = keys.map(function(k) { return String(k).toLowerCase(); });
  const hasDate = lower.some(function(k) { return k.includes('date') || k.includes('start'); });
  const hasDuration = lower.some(function(k) { return k.includes('duration') || k.includes('time') || k.includes('elapsed'); });
  const hasMetrics = lower.some(function(k) {
    return k.includes('cal') || k.includes('distance') || k.includes('rpm') || k.includes('power') || k.includes('weight') || k.includes('hr');
  });
  return (hasDate && hasDuration) || (hasDate && hasMetrics);
}

function collectTechnogymCandidates(node, acc, depth) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) collectTechnogymCandidates(node[i], acc, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  if (looksLikeTechnogymSession(node)) acc.push(node);

  const values = Object.values(node);
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value && typeof value === 'object') collectTechnogymCandidates(value, acc, depth + 1);
  }
}

function firstValue(obj, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (obj[key] != null && obj[key] !== '') return obj[key];
  }
  return null;
}

function normalizeTechnogymFile(file) {
  const reader = new FileReaderSync();
  const text = reader.readAsText(file);
  const parsed = JSON.parse(text);
  const candidates = [];
  collectTechnogymCandidates(parsed, candidates, 0);

  const workouts = [];
  const rejected = [];
  const seen = new Set();

  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    const startRaw = firstValue(raw, ['start_date', 'startDate', 'StartDate', 'Date', 'date', 'TrainingStartDate', 'WorkoutStartDate']);
    const startDate = normalizeDateString(startRaw);

    let durationSec = num(firstValue(raw, ['duration_sec', 'DurationSeconds', 'durationSeconds', 'ElapsedSeconds', 'MovingTimeSeconds']));
    if (!Number.isFinite(durationSec)) {
      const durationMin = num(firstValue(raw, ['duration_min', 'DurationMinutes', 'duration', 'Duration', 'ElapsedMinutes', 'MovingTimeMinutes']));
      if (Number.isFinite(durationMin)) durationSec = durationMin > 240 ? durationMin : durationMin * 60;
    }
    if (!Number.isFinite(durationSec)) durationSec = null;

    const endRaw = firstValue(raw, ['end_date', 'endDate', 'EndDate', 'WorkoutEndDate']);
    let endDate = normalizeDateString(endRaw);
    if (!endDate && startDate && Number.isFinite(durationSec) && durationSec > 0) {
      endDate = new Date(toMs(startDate) + durationSec * 1000).toISOString();
    }

    const signature = (startDate || 'na') + '|' + (endDate || 'na') + '|' + JSON.stringify(Object.keys(raw).sort());
    if (seen.has(signature)) continue;
    seen.add(signature);

    if (!startDate || !endDate) {
      rejected.push({ source: 'Technogym', reason: 'Missing usable start or end date', raw: raw });
      continue;
    }

    const distanceRaw = firstValue(raw, ['distance', 'Distance', 'HDistance', 'TotalDistance', 'DistanceMeters']);
    const distance = num(distanceRaw);
    const type = classifyTechnogym(raw);

    workouts.push({
      source: 'Technogym',
      raw_type: firstValue(raw, ['activity_type', 'ActivityType', 'type', 'Type', 'discipline']) || type,
      type,
      start_date: startDate,
      end_date: endDate,
      duration_min: minutesBetween(startDate, endDate),
      distance: Number.isFinite(distance) ? distance : null,
      distance_unit: firstValue(raw, ['distance_unit', 'DistanceUnit', 'Unit']) || (Number.isFinite(distance) ? 'm' : null),
      calories: num(firstValue(raw, ['calories', 'Calories', 'Energy', 'TotalCalories'])) || 0,
      hr: num(firstValue(raw, ['hr', 'AvgHeartRate', 'AverageHeartRate'])) || null,
      notes: '',
      power_avg: num(firstValue(raw, ['power_avg', 'AvgPower', 'AveragePower'])),
      level: num(firstValue(raw, ['level', 'Level'])),
      rpm_avg: num(firstValue(raw, ['rpm_avg', 'AvgRpm', 'AvgSpeedRpm'])),
      vo2: num(firstValue(raw, ['vo2', 'VO2', 'EstimatedVO2'])),
      raw: raw
    });
  }

  workouts.sort(function(a, b) {
    return (toMs(a.start_date) || 0) - (toMs(b.start_date) || 0);
  });

  return {
    workouts,
    rejected,
    diagnostics: {
      candidate_records: candidates.length,
      unique_sessions: workouts.length
    }
  };
}

function parseTechnogymFile(file) {
  return normalizeTechnogymFile(file);
}

function isUsefulWorkout(workout) {
  if (!workout || !workout.start_date || !workout.end_date) return false;
  const start = toMs(workout.start_date);
  const end = toMs(workout.end_date);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const durMin = (end - start) / 60000;
  if (durMin < 2) return false;
  if (durMin > 240) return false;
  return true;
}

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, (end - start) / 60000);
}

function typeFamily(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('run')) return 'running';
  if (t.includes('walk')) return 'walking';
  if (t.includes('cycl') || t.includes('bike') || t.includes('spin')) return 'cycling';
  if (t.includes('swim')) return 'swimming';
  if (t.includes('strength') || t.includes('core')) return 'strength';
  if (t.includes('row')) return 'rowing';
  if (t.includes('ellip')) return 'elliptical';
  if (t.includes('stair')) return 'stairs';
  return 'other';
}

function findOverlapCandidates(appleWorkouts, technoWorkouts) {
  const apple = appleWorkouts.filter(isUsefulWorkout);
  const technogym = technoWorkouts.filter(isUsefulWorkout);
  const candidates = [];

  for (let ai = 0; ai < apple.length; ai += 1) {
    const a = apple[ai];
    const aStart = toMs(a.start_date);
    const aEnd = toMs(a.end_date);
    const aDur = minutesBetween(a.start_date, a.end_date);
    for (let ti = 0; ti < technogym.length; ti += 1) {
      const t = technogym[ti];
      const tStart = toMs(t.start_date);
      const tEnd = toMs(t.end_date);
      const tDur = minutesBetween(t.start_date, t.end_date);
      if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || !Number.isFinite(tStart) || !Number.isFinite(tEnd)) continue;
      const overlapMin = overlapMinutes(aStart, aEnd, tStart, tEnd);
      if (overlapMin <= 0) continue;
      const appleOverlapFraction = aDur > 0 ? overlapMin / aDur : 0;
      const technoOverlapFraction = tDur > 0 ? overlapMin / tDur : 0;
      const strong = overlapMin >= 5 && (appleOverlapFraction >= 0.4 || technoOverlapFraction >= 0.4);
      const weak = overlapMin >= 2 && (appleOverlapFraction >= 0.15 || technoOverlapFraction >= 0.15);
      if (!strong && !weak) continue;
      let classification = 'partial_overlap';
      if (appleOverlapFraction >= 0.9 && technoOverlapFraction >= 0.9) classification = 'near_exact';
      else if (technoOverlapFraction >= 0.9) classification = 'technogym_inside_apple';
      else if (appleOverlapFraction >= 0.9) classification = 'apple_inside_technogym';
      candidates.push({
        apple_idx: ai,
        techno_idx: ti,
        confidence: strong ? 'strong' : 'weak',
        classification,
        overlap_min: overlapMin,
        apple_overlap_fraction: appleOverlapFraction,
        techno_overlap_fraction: technoOverlapFraction,
        start_diff_min: Math.abs(aStart - tStart) / 60000,
        end_diff_min: Math.abs(aEnd - tEnd) / 60000
      });
    }
  }

  candidates.sort(function(a, b) {
    if (b.overlap_min !== a.overlap_min) return b.overlap_min - a.overlap_min;
    return a.start_diff_min - b.start_diff_min;
  });

  return {
    candidates,
    summary: {
      candidates: candidates.length,
      strong_candidates: candidates.filter(function(c) { return c.confidence === 'strong'; }).length,
      weak_candidates: candidates.filter(function(c) { return c.confidence === 'weak'; }).length
    }
  };
}

function safeClone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function preferredType(apple, techno) {
  const appleType = String(apple && apple.type || '').trim();
  const technoType = String(techno && techno.type || '').trim();
  const appleFamily = typeFamily(appleType);
  const technoFamily = typeFamily(technoType);
  if (appleFamily && appleFamily !== 'other' && technoFamily && technoFamily !== 'other' && appleFamily !== technoFamily) return appleType || technoType || 'Other';
  if (technoType && technoType !== 'Other' && technoType !== 'Machine Cardio') return technoType;
  if (appleType && appleType !== 'Other') return appleType;
  return technoType || appleType || 'Other';
}

function sessionStart(apple, techno) {
  const vals = [toMs(apple && apple.start_date), toMs(techno && techno.start_date)].filter(Number.isFinite);
  if (!vals.length) return null;
  return new Date(Math.min.apply(null, vals)).toISOString();
}

function sessionEnd(apple, techno) {
  const vals = [toMs(apple && apple.end_date), toMs(techno && techno.end_date)].filter(Number.isFinite);
  if (!vals.length) return null;
  return new Date(Math.max.apply(null, vals)).toISOString();
}

function pickCalories(apple, techno) {
  if (apple && apple.calories != null) return { value: apple.calories, source: 'AppleHealth' };
  if (techno && techno.calories != null) return { value: techno.calories, source: 'Technogym' };
  return { value: null, source: null };
}

function pickHr(apple, techno) {
  if (apple && apple.hr != null) return { value: apple.hr, source: 'AppleHealth' };
  if (techno && techno.hr != null) return { value: techno.hr, source: 'Technogym' };
  return { value: null, source: null };
}

function pickDistance(apple, techno) {
  if (techno && techno.distance != null) return { value: techno.distance, source: 'Technogym', rationale: 'Preferred machine distance', unit: techno.distance_unit || 'm' };
  if (apple && apple.distance != null) return { value: apple.distance, source: 'AppleHealth', rationale: 'Fallback to Apple distance', unit: apple.distance_unit || 'mi' };
  return { value: null, source: null, rationale: null, unit: null };
}

function makeCanonicalSession(prefix, apple, techno, match) {
  const startDate = sessionStart(apple, techno);
  const endDate = sessionEnd(apple, techno);
  return {
    session_id: prefix + '_' + stableHash(JSON.stringify({ prefix: prefix, a: apple && apple.start_date, t: techno && techno.start_date, rel: match && match.classification })),
    match_confidence: match ? match.confidence : 'unmatched',
    relationship: match ? match.classification : null,
    canonical_type: preferredType(apple, techno),
    start_date: startDate,
    end_date: endDate,
    duration_min: minutesBetween(startDate, endDate),
    overlap_summary: match ? {
      overlap_min: match.overlap_min,
      apple_overlap_fraction: match.apple_overlap_fraction,
      techno_overlap_fraction: match.techno_overlap_fraction,
      start_diff_min: match.start_diff_min,
      end_diff_min: match.end_diff_min
    } : null,
    sources: {
      apple: safeClone(apple),
      technogym: safeClone(techno)
    },
    preferred_metrics: {
      hr: pickHr(apple, techno),
      calories: pickCalories(apple, techno),
      distance: pickDistance(apple, techno),
      power_avg: { value: techno && techno.power_avg != null ? techno.power_avg : null, source: techno && techno.power_avg != null ? 'Technogym' : null },
      level: { value: techno && techno.level != null ? techno.level : null, source: techno && techno.level != null ? 'Technogym' : null },
      rpm_avg: { value: techno && techno.rpm_avg != null ? techno.rpm_avg : null, source: techno && techno.rpm_avg != null ? 'Technogym' : null },
      vo2: { value: techno && techno.vo2 != null ? techno.vo2 : null, source: techno && techno.vo2 != null ? 'Technogym' : null, note: techno && techno.vo2 != null ? 'Technogym workout-level VO2 estimate' : null }
    }
  };
}

function distanceDiffPct(apple, techno) {
  const a = Number(apple && apple.distance);
  const t = Number(techno && techno.distance);
  if (!Number.isFinite(a) || !Number.isFinite(t) || a <= 0 || t <= 0) return null;
  return Math.abs(a - t) / Math.max(a, t) * 100;
}

function confidenceScore(match, apple, techno) {
  let score = match.confidence === 'strong' ? 0.75 : 0.45;
  if (match.classification === 'near_exact') score += 0.15;
  if (typeFamily(apple && apple.type) === typeFamily(techno && techno.type)) score += 0.08;
  const diff = distanceDiffPct(apple, techno);
  if (diff == null) score += 0.03;
  else if (diff <= 5) score += 0.08;
  else if (diff >= 15) score -= 0.1;
  if (match.start_diff_min <= 3) score += 0.06;
  return Math.max(0, Math.min(0.99, score));
}

function buildImportResult(appleWorkouts, technoWorkouts, overlapCandidates, rejectedSeed) {
  const apple = appleWorkouts.filter(isUsefulWorkout);
  const technogym = technoWorkouts.filter(isUsefulWorkout);
  const accepted = [];
  const review = [];
  const rejected = Array.isArray(rejectedSeed) ? rejectedSeed.slice() : [];
  const usedApple = new Set();
  const usedTechno = new Set();

  for (let i = 0; i < overlapCandidates.length; i += 1) {
    const match = overlapCandidates[i];
    const appleWorkout = apple[match.apple_idx];
    const technoWorkout = technogym[match.techno_idx];
    if (!appleWorkout || !technoWorkout) continue;
    if (usedApple.has(match.apple_idx) || usedTechno.has(match.techno_idx)) continue;

    const diffPct = distanceDiffPct(appleWorkout, technoWorkout);
    const sameFamily = typeFamily(appleWorkout.type) === typeFamily(technoWorkout.type);
    const safeAuto = match.confidence === 'strong' && match.start_diff_min <= 3 && sameFamily && (diffPct == null || diffPct <= 5);

    if (safeAuto) {
      accepted.push(makeCanonicalSession('linked', appleWorkout, technoWorkout, match));
      usedApple.add(match.apple_idx);
      usedTechno.add(match.techno_idx);
      continue;
    }

    review.push({
      review_id: 'rev_' + stableHash(JSON.stringify(match) + '|' + (appleWorkout.start_date || '') + '|' + (technoWorkout.start_date || '')),
      review_kind: 'candidate_pair',
      suggested_action: sameFamily ? 'same_session' : 'different_sessions',
      confidence: confidenceScore(match, appleWorkout, technoWorkout),
      reasons: buildReasons(match, appleWorkout, technoWorkout),
      comparators: {
        start_diff_min: match.start_diff_min,
        end_diff_min: match.end_diff_min,
        overlap_min: match.overlap_min,
        apple_overlap_fraction: match.apple_overlap_fraction,
        techno_overlap_fraction: match.techno_overlap_fraction,
        distance_diff_pct: diffPct,
        type_equal: sameFamily
      },
      source_a: { source: 'AppleHealth', record: safeClone(appleWorkout), idx: match.apple_idx },
      source_b: { source: 'Technogym', record: safeClone(technoWorkout), idx: match.techno_idx },
      merge_preview: makeCanonicalSession('preview', appleWorkout, technoWorkout, match)
    });
    usedApple.add(match.apple_idx);
    usedTechno.add(match.techno_idx);
  }

  for (let i = 0; i < apple.length; i += 1) {
    if (usedApple.has(i)) continue;
    accepted.push(makeCanonicalSession('apple', apple[i], null, null));
  }

  for (let i = 0; i < technogym.length; i += 1) {
    if (usedTechno.has(i)) continue;
    accepted.push(makeCanonicalSession('techno', null, technogym[i], null));
  }

  accepted.sort(function(a, b) {
    return (toMs(a.start_date) || 0) - (toMs(b.start_date) || 0);
  });

  return {
    accepted: accepted,
    review: review,
    rejected: rejected,
    all_sessions: accepted.slice(),
    generated_at: new Date().toISOString(),
    summary: {
      total: accepted.length,
      accepted: accepted.length,
      review: review.length,
      rejected: rejected.length,
      linked: accepted.filter(function(s) { return s.sources.apple && s.sources.technogym; }).length,
      unmatched_apple: accepted.filter(function(s) { return s.sources.apple && !s.sources.technogym; }).length,
      unmatched_technogym: accepted.filter(function(s) { return !s.sources.apple && s.sources.technogym; }).length
    }
  };
}

function buildReasons(match, apple, techno) {
  const reasons = [];
  if (match.start_diff_min > 3) reasons.push('start times differ by ' + match.start_diff_min.toFixed(1) + ' min');
  if (match.end_diff_min > 3) reasons.push('end times differ by ' + match.end_diff_min.toFixed(1) + ' min');
  const diff = distanceDiffPct(apple, techno);
  if (diff != null && diff > 5) reasons.push('distance differs by ' + diff.toFixed(1) + '%');
  if (typeFamily(apple && apple.type) !== typeFamily(techno && techno.type)) reasons.push('activity type family mismatch');
  if (!reasons.length) reasons.push('manual confirmation requested');
  return reasons;
}

function stableHash(input) {
  var str = String(input || '');
  var hash = 2166136261;
  for (var i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}
`

  const blob = new Blob([workerSource], { type: "text/javascript" })
  return new Worker(URL.createObjectURL(blob))
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE AUTO-DETECTION
// Inspects file content to determine source. Never guesses silently —
// returns "unknown" if confidence is low, which routes to review queue.
// ─────────────────────────────────────────────────────────────────────────────

function detectSourceType(filename, firstChunk) {
  const name = String(filename || "").toLowerCase()
  const chunk = String(firstChunk || "").slice(0, 4000)

  // Apple Health XML — very distinctive opening tag
  if (chunk.includes("<HealthData") || chunk.includes("<Workout ") || chunk.includes("HKWorkoutActivity"))
    return { source: "apple_health", format: "xml", confidence: "high" }

  // Technogym JSON — look for characteristic fields
  if (name.endsWith(".json") || chunk.trimStart().startsWith("{") || chunk.trimStart().startsWith("[")) {
    const lower = chunk.toLowerCase()
    if (lower.includes("avgrpm") || lower.includes("avgsrpeedRpm") || lower.includes("hdistance") ||
        lower.includes("totalIsoWeight") || lower.includes("technogym") || lower.includes("rm1") ||
        lower.includes("avgrunningcadence") || lower.includes("trainingStartDate"))
      return { source: "technogym", format: "json", confidence: "high" }
    // Generic JSON — still might be Technogym with unusual export
    if (lower.includes("workout") || lower.includes("duration") || lower.includes("calories"))
      return { source: "technogym", format: "json", confidence: "medium" }
    return { source: "unknown_json", format: "json", confidence: "low" }
  }

  // CSV sources — inspect header row
  if (chunk.includes(",") || name.endsWith(".csv")) {
    const firstLine = chunk.split(/\r?\n/)[0].toLowerCase()

    // FitnessView CSV — characteristic columns
    if (firstLine.includes("workout type") || firstLine.includes("activity_type") ||
        (firstLine.includes("distance") && firstLine.includes("heart rate") && firstLine.includes("pace")))
      return { source: "fitnessview", format: "csv", confidence: "high" }

    // Cronometer — nutrition export
    if (firstLine.includes("energy (kcal)") || firstLine.includes("protein (g)") ||
        firstLine.includes("food name") || firstLine.includes("cronometer"))
      return { source: "cronometer", format: "csv", confidence: "high" }

    // Sleep Cycle
    if (firstLine.includes("sleep quality") || firstLine.includes("time in bed") ||
        firstLine.includes("wake up") || firstLine.includes("sleep notes") ||
        firstLine.includes("heart rate (bpm)") && firstLine.includes("steps"))
      return { source: "sleep_cycle", format: "csv", confidence: "high" }

    // A&D Heart Track — BP measurements
    if (firstLine.includes("systolic") || firstLine.includes("diastolic") ||
        firstLine.includes("blood pressure") || firstLine.includes("pulse"))
      return { source: "ad_heart_track", format: "csv", confidence: "high" }

    // iHealth — weight or BP
    if (firstLine.includes("ihealth") || (firstLine.includes("weight") && firstLine.includes("bmi")) ||
        (firstLine.includes("weight") && firstLine.includes("body fat")))
      return { source: "ihealth", format: "csv", confidence: "high" }

    // Apple Health CSV (via Health Auto Export app)
    if (firstLine.includes("active energy") || firstLine.includes("heart rate variability") ||
        firstLine.includes("vo2 max") || firstLine.includes("apple watch"))
      return { source: "apple_health_csv", format: "csv", confidence: "high" }

    // LIFT Schedule export (internal)
    if (firstLine.includes("exercise_id") || firstLine.includes("day_of_week") ||
        firstLine.includes("session_id") && firstLine.includes("variant"))
      return { source: "lift_schedule", format: "csv", confidence: "high" }

    // HealthFit — CTL/ATL/TSB export
    if (firstLine.includes("fitness (ctl)") || firstLine.includes("fatigue (atl)") ||
        (firstLine.includes("ctl") && firstLine.includes("atl") && firstLine.includes("tsb")))
      return { source: "healthfit", format: "csv", confidence: "high" }

    // Generic workout CSV — medium confidence, goes to review
    if (firstLine.includes("duration") || firstLine.includes("calories") || firstLine.includes("date"))
      return { source: "generic_workout_csv", format: "csv", confidence: "medium" }

    return { source: "unknown_csv", format: "csv", confidence: "low" }
  }

  return { source: "unknown", format: "unknown", confidence: "low" }
}

// ─────────────────────────────────────────────────────────────────────────────
// FITNESSVIEW CSV PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseFitnessViewCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { workouts: [], rejected: [], nutrition: [] }

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const workouts = []
  const rejected = []

  const col = name => headers.findIndex(h => h.includes(name))
  const iDate     = col("date")
  const iType     = Math.max(col("workout type"), col("activity_type"), col("type"))
  const iDur      = Math.max(col("time"), col("duration"))
  const iDist     = col("distance")
  const iCal      = col("calories")
  const iHR       = Math.max(col("heart rate"), col("avg hr"), col("hr"))
  const iPace     = col("pace")

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    const cells = raw.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    if (cells.length < 3) continue
    // Pre-check: reject records with "day" in duration field — these are
    // background tracking artifacts, not real workout sessions
    const durCellRaw = iDur >= 0 ? cells[iDur] : ""
    if (/day/i.test(durCellRaw)) {
      rejected.push({ source: "FitnessView", reason: "Duration contains 'day' — likely background tracking artifact: " + durCellRaw, raw: raw.slice(0, 200) })
      continue
    }

    const dateRaw = iDate >= 0 ? cells[iDate] : null
    if (!dateRaw) { rejected.push({ source: "FitnessView", reason: "Missing date", raw: raw.slice(0, 200) }); continue }

    const typeRaw = iType >= 0 ? cells[iType] : "Other"
    const durRaw  = iDur >= 0 ? cells[iDur] : null
    const distRaw = iDist >= 0 ? cells[iDist] : null
    const calRaw  = iCal >= 0 ? cells[iCal] : null
    const hrRaw   = iHR >= 0 ? cells[iHR] : null
    const paceRaw = iPace >= 0 ? cells[iPace] : null

    // Parse duration — handles "47min", "1hr 2min", "02:30:00", plain minutes
    let durationMin = null
    if (durRaw) {
      const hrMin = durRaw.match(/(\d+)\s*hr[^\d]*(\d+)\s*min/i)
      const minOnly = durRaw.match(/^(\d+(?:\.\d+)?)\s*min/i)
      const colonFmt = durRaw.match(/^(\d+):(\d+)(?::(\d+))?$/)
      const plainNum = durRaw.match(/^(\d+(?:\.\d+)?)$/)
      if (hrMin) durationMin = parseInt(hrMin[1]) * 60 + parseInt(hrMin[2])
      else if (minOnly) durationMin = parseFloat(minOnly[1])
      else if (colonFmt) durationMin = parseInt(colonFmt[1]) * 60 + parseInt(colonFmt[2]) + (colonFmt[3] ? parseInt(colonFmt[3]) / 60 : 0)
      else if (plainNum) durationMin = parseFloat(plainNum[1])
    }

    // Reject implausible durations (> 8 hours = almost certainly a tracking artifact)
    if (durationMin !== null && durationMin > 480) {
      rejected.push({ source: "FitnessView", reason: `Implausible duration ${Math.round(durationMin)} min — likely background tracking artifact`, raw: raw.slice(0, 200) })
      continue
    }
    // Parse distance — strip units
    let distance = null, distanceUnit = null
    if (distRaw && distRaw !== "0" && distRaw !== "") {
      const dm = distRaw.match(/([\d.]+)\s*(mi|km|m|yd)?/i)
      if (dm) { distance = parseFloat(dm[1]); distanceUnit = (dm[2] || "mi").toLowerCase() }
    }

    // Parse pace — "19m 22s" or "9:30" per mile
    let paceMinPerMi = null
    if (paceRaw) {
      const ps = paceRaw.match(/(\d+)m\s*(\d+)s/)
      const pc = paceRaw.match(/^(\d+):(\d+)$/)
      if (ps) paceMinPerMi = parseInt(ps[1]) + parseInt(ps[2]) / 60
      else if (pc) paceMinPerMi = parseInt(pc[1]) + parseInt(pc[2]) / 60
    }

    const calories = calRaw ? parseFloat(String(calRaw).replace(/,/g, "").replace(/[^\d.]/g, "")) || null : null
    const hr = hrRaw ? parseFloat(hrRaw.replace(/[^\d.]/g, "")) || null : null

    // Normalize date to ISO
    let startDate = null
    try {
      const d = new Date(dateRaw)
      if (!isNaN(d.getTime())) startDate = d.toISOString().slice(0, 10) + "T00:00:00"
    } catch {}
    if (!startDate) { rejected.push({ source: "FitnessView", reason: "Unparseable date: " + dateRaw, raw: raw.slice(0, 200) }); continue }

    workouts.push({
      source: "FitnessView",
      type: typeRaw,
      start_date: startDate,
      end_date: null,
      duration_min: durationMin,
      distance,
      distance_unit: distanceUnit,
      calories,
      hr,
      pace_min_per_mi: paceMinPerMi,
      notes: "",
    })
  }

  return { workouts, rejected, nutrition: [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRONOMETER CSV PARSER  (nutrition records — separate from workouts)
// ─────────────────────────────────────────────────────────────────────────────

function parseCronometerCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { workouts: [], nutrition: [], rejected: [] }

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const nutrition = []
  const rejected = []

  const col = name => headers.findIndex(h => h.includes(name))
  const iDate    = col("date")
  const iFood    = Math.max(col("food name"), col("food"), col("item"))
  const iCal     = Math.max(col("energy (kcal)"), col("calories"), col("energy"))
  const iProtein = Math.max(col("protein (g)"), col("protein"))
  const iCarbs   = Math.max(col("carbs (g)"), col("carbohydrates"), col("carbs"))
  const iFat     = Math.max(col("fat (g)"), col("fat"))
  const iFiber   = Math.max(col("fiber (g)"), col("fiber"))
  const iGroup   = Math.max(col("group"), col("meal"), col("category"))

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    // Handle quoted fields with commas inside
    const cells = []
    let inQ = false, cur = ""
    for (let c of raw) {
      if (c === '"') { inQ = !inQ }
      else if (c === "," && !inQ) { cells.push(cur.trim()); cur = "" }
      else cur += c
    }
    cells.push(cur.trim())

    if (cells.length < 3) continue
    const dateRaw = iDate >= 0 ? cells[iDate] : null
    if (!dateRaw) { rejected.push({ source: "Cronometer", reason: "Missing date", raw: raw.slice(0, 200) }); continue }

    let date = null
    try { const d = new Date(dateRaw); if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10) } catch {}
    if (!date) { rejected.push({ source: "Cronometer", reason: "Bad date: " + dateRaw, raw: raw.slice(0, 200) }); continue }

    const n = v => { const p = parseFloat(v); return isFinite(p) ? p : null }

    nutrition.push({
      source: "Cronometer",
      date,
      food_name: iFood >= 0 ? cells[iFood] : "Unknown",
      meal_group: iGroup >= 0 ? cells[iGroup] : null,
      calories_kcal: n(iCal >= 0 ? cells[iCal] : null),
      protein_g:  n(iProtein >= 0 ? cells[iProtein] : null),
      carbs_g:    n(iCarbs >= 0 ? cells[iCarbs] : null),
      fat_g:      n(iFat >= 0 ? cells[iFat] : null),
      fiber_g:    n(iFiber >= 0 ? cells[iFiber] : null),
    })
  }

  return { workouts: [], nutrition, rejected }
}

// ─────────────────────────────────────────────────────────────────────────────
// SLEEP CYCLE CSV PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseSleepCycleCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { workouts: [], sleep: [], rejected: [] }

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const sleep = []
  const rejected = []

  const col = name => headers.findIndex(h => h.includes(name))
  const iDate    = Math.max(col("date"), col("start"))
  const iQual    = Math.max(col("sleep quality"), col("quality"), col("score"))
  const iDur     = Math.max(col("time in bed"), col("duration"), col("sleep time"))
  const iStart   = Math.max(col("bedtime"), col("sleep start"), col("start time"))
  const iEnd     = Math.max(col("wake up time"), col("wake up"), col("end time"))
  const iHR      = Math.max(col("heart rate"), col("avg hr"))
  const iSteps   = col("steps")
  const iNotes   = Math.max(col("sleep notes"), col("note"))

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    const cells = raw.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    if (cells.length < 2) continue

    const dateRaw = iDate >= 0 ? cells[iDate] : null
    if (!dateRaw) { rejected.push({ source: "SleepCycle", reason: "Missing date", raw: raw.slice(0, 200) }); continue }

    let date = null
    try { const d = new Date(dateRaw); if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10) } catch {}
    if (!date) { rejected.push({ source: "SleepCycle", reason: "Bad date: " + dateRaw, raw: raw.slice(0, 200) }); continue }

    const n = v => { const p = parseFloat(String(v || "").replace(/[^\d.]/g, "")); return isFinite(p) ? p : null }

    // Parse duration — "7:32" or "7h 32m" or plain minutes
    let durationMin = null
    const durRaw = iDur >= 0 ? cells[iDur] : null
    if (durRaw) {
      const hm = durRaw.match(/(\d+):(\d+)/)
      const hms = durRaw.match(/(\d+)h[^\d]*(\d+)m/i)
      if (hm) durationMin = parseInt(hm[1]) * 60 + parseInt(hm[2])
      else if (hms) durationMin = parseInt(hms[1]) * 60 + parseInt(hms[2])
      else durationMin = n(durRaw)
    }

    // Parse quality — "85%" or "0.85" or "85"
    let quality = null
    const qualRaw = iQual >= 0 ? cells[iQual] : null
    if (qualRaw) {
      const qm = qualRaw.match(/([\d.]+)/)
      if (qm) {
        quality = parseFloat(qm[1])
        if (quality > 1 && quality <= 100) quality = quality / 100
      }
    }

    sleep.push({
      source: "SleepCycle",
      date,
      start_time: iStart >= 0 ? cells[iStart] : null,
      end_time: iEnd >= 0 ? cells[iEnd] : null,
      duration_min: durationMin,
      sleep_quality: quality,
      avg_hr_bpm: n(iHR >= 0 ? cells[iHR] : null),
      steps: n(iSteps >= 0 ? cells[iSteps] : null),
      notes: iNotes >= 0 ? cells[iNotes] : null,
    })
  }

  return { workouts: [], sleep, rejected }
}

// ─────────────────────────────────────────────────────────────────────────────
// A&D HEART TRACK PARSER (blood pressure)
// ─────────────────────────────────────────────────────────────────────────────

function parseADHeartTrackCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { workouts: [], biometrics: [], rejected: [] }
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const biometrics = []
  const rejected = []
  const col = name => headers.findIndex(h => h.includes(name))
  const iDate = Math.max(col("date"), col("time"), col("measured"))
  const iSys  = Math.max(col("systolic"), col("sys"), col("upper"))
  const iDia  = Math.max(col("diastolic"), col("dia"), col("lower"))
  const iPulse= Math.max(col("pulse"), col("heart rate"), col("hr"))

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    if (cells.length < 2) continue
    const dateRaw = iDate >= 0 ? cells[iDate] : null
    if (!dateRaw) { rejected.push({ source: "A&D", reason: "Missing date", raw: lines[i].slice(0, 200) }); continue }
    let ts = null
    try { const d = new Date(dateRaw); if (!isNaN(d.getTime())) ts = d.toISOString() } catch {}
    if (!ts) { rejected.push({ source: "A&D", reason: "Bad date", raw: lines[i].slice(0, 200) }); continue }
    const n = v => { const p = parseFloat(v); return isFinite(p) ? p : null }
    const sys = n(iSys >= 0 ? cells[iSys] : null)
    const dia = n(iDia >= 0 ? cells[iDia] : null)
    if (!sys && !dia) { rejected.push({ source: "A&D", reason: "No BP values", raw: lines[i].slice(0, 200) }); continue }
    biometrics.push({ source: "A&D_HeartTrack", timestamp: ts, date: ts.slice(0, 10),
      bp_systolic: sys, bp_diastolic: dia, pulse_bpm: n(iPulse >= 0 ? cells[iPulse] : null) })
  }
  return { workouts: [], biometrics, rejected }
}

// ─────────────────────────────────────────────────────────────────────────────
// iHEALTH PARSER (weight + body fat + BP)
// ─────────────────────────────────────────────────────────────────────────────

function parseIHealthCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { workouts: [], biometrics: [], rejected: [] }
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const biometrics = []
  const rejected = []
  const col = name => headers.findIndex(h => h.includes(name))
  const iDate = Math.max(col("date"), col("time"), col("measurement"))
  const iWeight = Math.max(col("weight"), col("body weight"))
  const iBF = Math.max(col("body fat"), col("fat %"), col("fat percent"))
  const iBMI = col("bmi")
  const iSys = Math.max(col("systolic"), col("sys"))
  const iDia = Math.max(col("diastolic"), col("dia"))
  const iPulse = Math.max(col("pulse"), col("heart rate"))

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    if (cells.length < 2) continue
    const dateRaw = iDate >= 0 ? cells[iDate] : null
    if (!dateRaw) { rejected.push({ source: "iHealth", reason: "Missing date", raw: lines[i].slice(0, 200) }); continue }
    let ts = null
    try { const d = new Date(dateRaw); if (!isNaN(d.getTime())) ts = d.toISOString() } catch {}
    if (!ts) { rejected.push({ source: "iHealth", reason: "Bad date", raw: lines[i].slice(0, 200) }); continue }
    const n = v => { const p = parseFloat(String(v || "").replace(/[^\d.]/g, "")); return isFinite(p) ? p : null }
    const weight = n(iWeight >= 0 ? cells[iWeight] : null)
    const bodyFat = n(iBF >= 0 ? cells[iBF] : null)
    const sys = n(iSys >= 0 ? cells[iSys] : null)
    const dia = n(iDia >= 0 ? cells[iDia] : null)
    if (!weight && !sys && !bodyFat) { rejected.push({ source: "iHealth", reason: "No usable values", raw: lines[i].slice(0, 200) }); continue }
    biometrics.push({ source: "iHealth", timestamp: ts, date: ts.slice(0, 10),
      weight_lb: weight, body_fat_pct: bodyFat, bmi: n(iBMI >= 0 ? cells[iBMI] : null),
      bp_systolic: sys, bp_diastolic: dia, pulse_bpm: n(iPulse >= 0 ? cells[iPulse] : null) })
  }
  return { workouts: [], biometrics, rejected }
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTHFIT CSV PARSER  (CTL/ATL/TSB/ACWR export)
// ─────────────────────────────────────────────────────────────────────────────

function parseHealthFitCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { records: [], rejected: [] }

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const records = []
  const rejected = []

  const col = name => headers.findIndex(h => h.includes(name.toLowerCase()))
  const iISO  = col("iso8601")
  const iDate = iISO >= 0 ? iISO : col("date")
  const iCTL  = col("fitness")    // "Fitness (CTL)"
  const iATL  = col("fatigue")    // "Fatigue (ATL)"
  const iTSB  = col("form")       // "Form (TSB)"
  const iACWR = col("acwr")
  const iTRIMP = col("trimp")
  const iDur  = col("duration")   // "Workout Duration (sec)"

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    const cells = raw.split(",").map(c => c.trim().replace(/^"|"$/g, ""))

    const dateRaw = cells[iDate] || ""
    if (!dateRaw) { rejected.push({ source: "HealthFit", reason: "Missing date", raw: raw.slice(0, 200) }); continue }
    const date = String(dateRaw).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { rejected.push({ source: "HealthFit", reason: "Unparseable date: " + dateRaw, raw: raw.slice(0, 200) }); continue }

    const n = (idx, fallback = null) => {
      if (idx < 0) return fallback
      const v = Number(cells[idx])
      return Number.isFinite(v) ? v : fallback
    }
    records.push({ date, ctl: n(iCTL), atl: n(iATL), tsb: n(iTSB), acwr: n(iACWR), trimp: n(iTRIMP), duration_sec: n(iDur) })
  }

  return { records, rejected }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATED ImportTab — single multi-file drop zone with auto-detection
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_LABELS = {
  apple_health:       { label: "Apple Health XML",      color: "#ef4444" },
  apple_health_csv:   { label: "Apple Health CSV",      color: "#ef4444" },
  technogym:          { label: "Technogym",             color: "#3b82f6" },
  fitnessview:        { label: "FitnessView",           color: "#8b5cf6" },
  cronometer:         { label: "Cronometer",            color: "#22c55e" },
  sleep_cycle:        { label: "Sleep Cycle",           color: "#0ea5e9" },
  ad_heart_track:     { label: "A&D Heart Track",       color: "#f97316" },
  ihealth:            { label: "iHealth",               color: "#14b8a6" },
  healthfit:          { label: "HealthFit CSV",         color: "#f59e0b" },
  lift_schedule:      { label: "LIFT Schedule",         color: "#7F77DD" },
  generic_workout_csv:{ label: "CSV (review needed)",   color: "#d97706" },
  unknown_json:       { label: "JSON (review needed)",  color: "#d97706" },
  unknown_csv:        { label: "Unknown CSV",           color: "#d97706" },
  unknown:            { label: "Unknown",               color: "#888" },
}

function ImportTab({ canonicalSessions, setCanonicalSessions, setHealthFitDaily, setSleepRecords }) {
  const [queuedFiles, setQueuedFiles] = useState([])  // [{file, detected, firstChunk}]
  const [status, setStatus] = useState("Drop files to import")
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [reviewRows, setReviewRows] = useState([])
  const [selectedReviewIds, setSelectedReviewIds] = useState([])
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [nutritionResult, setNutritionResult] = useState([])
  const [sleepResult, setSleepResult] = useState([])
  const [biometricResult, setBiometricResult] = useState([])
  const [healthFitResult, setHealthFitResult] = useState([])

  const worker = useMemo(() => createInlineImportWorker(), [])
  useEffect(() => () => worker.terminate(), [worker])

  // Read first chunk of a file to detect source
  const detectFile = file => new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const chunk = e.target?.result || ""
      const detected = detectSourceType(file.name, chunk)
      resolve({ file, detected, firstChunk: chunk.slice(0, 2000) })
    }
    reader.onerror = () => resolve({ file, detected: { source: "unknown", format: "unknown", confidence: "low" }, firstChunk: "" })
    reader.readAsText(file.slice(0, 8000))
  })

  const addFiles = useCallback(async newFiles => {
    const arr = Array.from(newFiles || [])
    if (!arr.length) return
    const detected = await Promise.all(arr.map(detectFile))
    setQueuedFiles(prev => {
      const existing = new Set(prev.map(q => q.file.name + q.file.size))
      const fresh = detected.filter(d => !existing.has(d.file.name + d.file.size))
      return [...prev, ...fresh]
    })
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer?.files)
  }, [addFiles])

  const onDragOver = e => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)

  const removeFile = idx => setQueuedFiles(prev => prev.filter((_, i) => i !== idx))

  const overrideSource = (idx, newSource) => {
    setQueuedFiles(prev => prev.map((q, i) =>
      i !== idx ? q : { ...q, detected: { ...q.detected, source: newSource, confidence: "manual" } }
    ))
  }

  const onWorkerMessage = useCallback(async event => {
    const payload = event?.data || {}
    if (payload.type === "progress") { setStatus(payload.message || payload.stage || "Working..."); setProgress(payload); return }
    if (payload.type === "error") { setStatus(`Error: ${payload.error}`); setImporting(false); return }
    if (payload.type === "done") {
      const next = payload.result || null
      setResult(next)
      setReviewRows(Array.isArray(next?.review) ? next.review : [])
      setSelectedReviewIds([])
      if (Array.isArray(next?.appleSleep) && next.appleSleep.length) {
        setSleepResult(prev => {
          const byDate = {}
          ;(Array.isArray(prev) ? prev : []).forEach(r => { byDate[r.date] = r })
          next.appleSleep.forEach(r => { byDate[r.date] = r })
          return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
        })
      }
      setStatus("Import analysis complete")
      setImporting(false)
    }
  }, [setSleepResult])
  useEffect(() => { worker.onmessage = onWorkerMessage }, [worker, onWorkerMessage])

  const processFiles = useCallback(async () => {
    if (!queuedFiles.length) { setStatus("Add files first"); return }
    setImporting(true)
    setResult(null)
    setReviewRows([])
    setSelectedReviewIds([])
    setNutritionResult([])
    setSleepResult([])
    setBiometricResult([])
    setHealthFitResult([])
    setStatus("Reading files...")

    let appleFile = null, technogymFile = null
    const allNutrition = [], allSleep = [], allBiometrics = [], allHealthFit = [], allRejected = []

    for (const q of queuedFiles) {
      const src = q.detected.source
      setStatus(`Processing ${q.file.name} (${SOURCE_LABELS[src]?.label || src})...`)

      if (src === "apple_health") { appleFile = q.file; continue }
      if (src === "technogym") { technogymFile = q.file; continue }

      // Read full file for CSV parsers (they run on main thread — small files)
      const text = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = e => res(e.target?.result || "")
        r.onerror = () => rej(new Error("Read failed"))
        r.readAsText(q.file)
      }).catch(() => null)
      if (!text) { allRejected.push({ source: src, reason: "File read failed", file: q.file.name }); continue }

      if (src === "fitnessview" || src === "apple_health_csv") {
        const parsed = parseFitnessViewCSV(text)
        allRejected.push(...(parsed.rejected || []))
        // FitnessView workouts feed into the overlap engine as additional Apple-side records
        if (parsed.workouts.length) {
          if (!appleFile) {
            // Use FitnessView as a synthetic apple source
            const fvSessions = parsed.workouts.map(w => ({
              ...w, source: "FitnessView", raw_type: w.type,
              start_date: w.start_date, end_date: w.end_date || w.start_date,
              calories: w.calories || 0, hr: w.hr || 0, notes: ""
            }))
            setStatus(`FitnessView: ${fvSessions.length} sessions queued`)
            // Store for post-processing — pass alongside apple in worker
            if (!technogymFile) {
              // No XML apple — use FitnessView directly as canonical accepted sessions
              const accepted = fvSessions.map(w => ({
                session_id: makeSessionId("fv", w),
                match_confidence: "single_source",
                relationship: "fitnessview_only",
                canonical_type: w.type,
                start_date: w.start_date,
                end_date: w.end_date,
                duration_min: w.duration_min,
                overlap_summary: null,
                sources: { fitnessview: w, apple: null, technogym: null },
                preferred_metrics: {
                  hr: { value: w.hr || null, source: "FitnessView" },
                  calories: { value: w.calories || null, source: "FitnessView" },
                  distance: { value: w.distance || null, source: "FitnessView", unit: w.distance_unit, rationale: "FitnessView only" },
                  power_avg: { value: null, source: null }, level: { value: null, source: null },
                  rpm_avg: { value: null, source: null }, vo2: { value: null, source: null }
                }
              }))
              setResult({ accepted, all_sessions: accepted, review: [], rejected: allRejected,
                summary: { accepted: accepted.length, review: 0, rejected: allRejected.length, total: accepted.length } })
              setImporting(false)
              setStatus(`FitnessView: ${accepted.length} sessions imported directly`)
              return
            }
          }
        }
        continue
      }

      if (src === "cronometer") {
        const parsed = parseCronometerCSV(text)
        allNutrition.push(...(parsed.nutrition || []))
        allRejected.push(...(parsed.rejected || []))
        setStatus(`Cronometer: ${parsed.nutrition.length} nutrition entries parsed`)
        continue
      }

      if (src === "sleep_cycle") {
        const parsed = parseSleepCycleCSV(text)
        allSleep.push(...(parsed.sleep || []))
        allRejected.push(...(parsed.rejected || []))
        setStatus(`Sleep Cycle: ${parsed.sleep.length} sleep records parsed`)
        continue
      }

      if (src === "ad_heart_track") {
        const parsed = parseADHeartTrackCSV(text)
        allBiometrics.push(...(parsed.biometrics || []))
        allRejected.push(...(parsed.rejected || []))
        setStatus(`A&D Heart Track: ${parsed.biometrics.length} BP readings parsed`)
        continue
      }

      if (src === "ihealth") {
        const parsed = parseIHealthCSV(text)
        allBiometrics.push(...(parsed.biometrics || []))
        allRejected.push(...(parsed.rejected || []))
        setStatus(`iHealth: ${parsed.biometrics.length} measurements parsed`)
        continue
      }

      if (src === "healthfit") {
        const parsed = parseHealthFitCSV(text)
        allHealthFit.push(...(parsed.records || []))
        allRejected.push(...(parsed.rejected || []))
        setStatus(`HealthFit: ${parsed.records.length} daily records parsed`)
        continue
      }

      // Unknown or low-confidence — flag for review, never drop
      allRejected.push({
        source: src, reason: `Auto-detection returned '${src}' (confidence: ${q.detected.confidence}). File held for manual review.`,
        file: q.file.name, firstChunk: q.firstChunk
      })
    }

    // Store secondary results
    if (allNutrition.length) setNutritionResult(allNutrition)
    if (allSleep.length) setSleepResult(allSleep)
    if (allBiometrics.length) setBiometricResult(allBiometrics)
    if (allHealthFit.length) setHealthFitResult(allHealthFit)

    // Send Apple + Technogym to worker for overlap pipeline
    if (appleFile || technogymFile) {
      setStatus("Running overlap pipeline...")
      worker.postMessage({ type: "process", appleFile, technogymFile })
    } else if (allNutrition.length || allSleep.length || allBiometrics.length) {
      setStatus("Non-workout files processed. Nutrition, sleep, and biometric data ready to commit.")
      setImporting(false)
    } else {
      setStatus("No processable files found. Check the detected types below.")
      setImporting(false)
    }
  }, [queuedFiles, worker])

  const toggleReviewSelection = useCallback(id => {
    setSelectedReviewIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const applyBatchAction = useCallback(action => {
    if (!selectedReviewIds.length) return
    const selected = new Set(selectedReviewIds)
    const kept = [], additions = []
    reviewRows.forEach(row => {
      if (!selected.has(row.review_id)) { kept.push(row); return }
      if (action === "same_session") { additions.push(row.merge_preview); return }
      if (action === "different_sessions") {
        if (row.source_a?.record) additions.push(makeSessionFromSingleSource("apple_manual", row.source_a.record, null))
        if (row.source_b?.record) additions.push(makeSessionFromSingleSource("techno_manual", null, row.source_b.record))
        return
      }
      if (action === "ignore_apple") { if (row.source_b?.record) additions.push(makeSessionFromSingleSource("techno_manual", null, row.source_b.record)); return }
      if (action === "ignore_technogym") { if (row.source_a?.record) additions.push(makeSessionFromSingleSource("apple_manual", row.source_a.record, null)); return }
      if (action === "reject") return
      kept.push(row)
    })
    const deduped = dedupeCanonicalSessions([...(result?.accepted || []), ...additions])
    setResult(prev => ({ ...prev, accepted: deduped, all_sessions: deduped, review: kept,
      summary: { ...prev?.summary, total: deduped.length, accepted: deduped.length, review: kept.length } }))
    setReviewRows(kept)
    setSelectedReviewIds([])
  }, [reviewRows, selectedReviewIds, result])

  const commitAll = useCallback(async () => {
    const sessions = Array.isArray(result?.accepted) ? result.accepted : []
    let committed = 0
    setStatus("Committing...")
    try {
      // Commit workout sessions
      if (sessions.length) {
        localStorage.setItem("lift_canonical_sessions", JSON.stringify(sessions))
        setCanonicalSessions(sessions)
        committed += sessions.length
        if (supabase && STORE_USER_ID) {
          const withUser = sessions.map(s => ({ ...s, user_id: STORE_USER_ID }))
          const { error } = await supabase.from("canonical_sessions").upsert(withUser, { onConflict: "session_id" })
          if (error) console.warn("Supabase write failed:", error.message)
        }
      }
      // Commit nutrition to user_kv (feeds Calories tab)
      if (nutritionResult.length && supabase && STORE_USER_ID) {
        const existing = await store.get("ufd-meal-entries") || []
        const merged = [...(Array.isArray(existing) ? existing : []), ...nutritionResult.map(n => ({
          id: makeSessionId("cron", n), date: n.date, meal: n.meal_group || "Other",
          name: n.food_name, calories: n.calories_kcal || 0,
          protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g, fiber_g: n.fiber_g,
          source: "Cronometer"
        }))]
        await store.set("ufd-meal-entries", merged)
        committed += nutritionResult.length
      }
      // Sleep and biometrics — store for future tab integration
      if (sleepResult.length) {
        const existing = JSON.parse(localStorage.getItem("lift_sleep_records") || "[]")
        const byDate = {}
        ;(Array.isArray(existing) ? existing : []).forEach(r => { byDate[r.date] = r })
        sleepResult.forEach(r => { byDate[r.date] = r })
        const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
        localStorage.setItem("lift_sleep_records", JSON.stringify(merged))
        if (setSleepRecords) setSleepRecords(merged)
      }
      if (biometricResult.length) localStorage.setItem("lift_biometric_records", JSON.stringify(biometricResult))

      // HealthFit CTL/ATL/TSB — merge by date into user_kv "healthfit-daily"
      if (healthFitResult.length) {
        const existing = await store.get("healthfit-daily") || []
        const byDate = {}
        ;(Array.isArray(existing) ? existing : []).forEach(r => { byDate[r.date] = r })
        healthFitResult.forEach(r => { byDate[r.date] = r })
        const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
        await store.set("healthfit-daily", merged)
        if (setHealthFitDaily) setHealthFitDaily(merged)
        committed += healthFitResult.length
      }

      setStatus(`Committed ${committed} records.${sleepResult.length ? ` ${sleepResult.length} sleep records saved.` : ""}${biometricResult.length ? ` ${biometricResult.length} biometrics saved.` : ""}${healthFitResult.length ? ` ${healthFitResult.length} HealthFit records saved.` : ""}${reviewRows.length ? ` ${reviewRows.length} still in review.` : ""}`)
    } catch (err) {
      setStatus(`Commit failed: ${err.message || String(err)}`)
    }
  }, [result, nutritionResult, sleepResult, biometricResult, healthFitResult, reviewRows.length, setCanonicalSessions, setHealthFitDaily, setSleepRecords])

  const cs = SOURCE_LABELS
  const s = v => ({ padding: "4px 8px", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer", background: "#1a1b2e", color: "#aaa", fontFamily: "inherit", ...v })

  return (
    <div style={{ padding: "16px", display: "grid", gap: "16px" }}>

      {/* Drop zone */}
      <div style={{ ...cardStyle(), minWidth: 0 }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.14em", color: "#444", textTransform: "uppercase", marginBottom: "8px" }}>Data import</div>
        <div style={{ fontSize: "13px", color: "#888", marginBottom: "14px" }}>
          Drop any export file. Apple Health XML, Technogym JSON, FitnessView, Cronometer, Sleep Cycle, A&D Heart Track, iHealth — all accepted. Source is detected automatically from file contents.
        </div>

        <div
          onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          style={{ border: `2px dashed ${dragOver ? "#4a9ee8" : "#1a1b2e"}`, borderRadius: 12, padding: "28px 20px",
            textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(74,158,232,0.06)" : "transparent",
            transition: "all 0.15s", marginBottom: 14 }}
          onClick={() => document.getElementById("lift-file-input").click()}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⬇</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#ccc" }}>Drop files here</div>
          <div style={{ fontSize: "12px", color: "#555", marginTop: 4 }}>or click to browse — multiple files accepted</div>
          <input id="lift-file-input" type="file" multiple style={{ display: "none" }}
            accept=".xml,.json,.csv,.txt"
            onChange={e => addFiles(e.target.files)} />
        </div>

        {/* Queued files with detection results */}
        {queuedFiles.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#444", textTransform: "uppercase", marginBottom: 8 }}>Queued files</div>
            {queuedFiles.map((q, idx) => {
              const det = q.detected
              const meta = cs[det.source] || { label: det.source, color: "#888" }
              const lowConf = det.confidence === "low"
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  border: `0.5px solid ${lowConf ? "#d97706" : "#1e1e1e"}`, borderRadius: 7, marginBottom: 6,
                  background: lowConf ? "rgba(217,119,6,0.06)" : "#0a0a0a" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#d8d8d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.file.name}</div>
                    <div style={{ fontSize: 11, color: meta.color }}>{meta.label}{det.confidence !== "high" ? ` — ${det.confidence} confidence` : ""}</div>
                  </div>
                  {lowConf && (
                    <select onChange={e => overrideSource(idx, e.target.value)} defaultValue=""
                      style={{ ...s(), border: "0.5px solid #d97706" }}>
                      <option value="" disabled>Override source</option>
                      {Object.entries(cs).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  )}
                  <button onClick={() => removeFile(idx)} style={s({ color: "#666" })}>✕</button>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={processFiles} style={buttonStyle(true)} disabled={importing || !queuedFiles.length}>
            {importing ? "Processing..." : "Process files"}
          </button>
          <button onClick={commitAll} style={buttonStyle(false)}
            disabled={!result?.accepted?.length && !nutritionResult.length && !sleepResult.length && !biometricResult.length}>
            Commit to dashboard
          </button>
          {queuedFiles.length > 0 && <button onClick={() => setQueuedFiles([])} style={s()}>Clear queue</button>}
        </div>

        <div style={{ fontSize: "13px", color: "#888" }}>Status: {status}</div>
        {progress?.processed_bytes && (
          <div style={{ fontSize: "12px", color: "#555", marginTop: 4 }}>
            {Math.round((100 * progress.processed_bytes) / Math.max(1, progress.total_bytes || 1))}% of Apple file parsed ({progress.parsed_lines?.toLocaleString() || 0} lines)
          </div>
        )}
      </div>

      {/* Summary */}
      {(result || nutritionResult.length > 0 || sleepResult.length > 0 || biometricResult.length > 0) && (
        <div style={{ ...cardStyle(), minWidth: 0 }}>
          <div style={{ fontWeight: "bold", marginBottom: 10 }}>Results</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {result && <>
              <SummaryCell label="Sessions accepted" value={result.summary?.accepted ?? 0} />
              <SummaryCell label="Needs review" value={result.summary?.review ?? 0} />
              <SummaryCell label="Rejected" value={result.summary?.rejected ?? 0} />
            </>}
            {nutritionResult.length > 0 && <SummaryCell label="Nutrition entries" value={nutritionResult.length} />}
            {sleepResult.length > 0 && <SummaryCell label="Sleep records" value={sleepResult.length} />}
            {biometricResult.length > 0 && <SummaryCell label="Biometrics" value={biometricResult.length} />}
            <SummaryCell label="In dashboard" value={Array.isArray(canonicalSessions) ? canonicalSessions.length : 0} />
          </div>
        </div>
      )}

      {/* Review queue */}
      {reviewRows.length > 0 && (
        <div style={{ ...cardStyle(), minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: "bold" }}>Review queue ({reviewRows.length})</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: 2 }}>
                These sessions had ambiguous overlaps. Nothing is dropped — resolve each batch then commit.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["same_session","Same session"],["different_sessions","Two sessions"],["ignore_apple","Drop Apple"],["ignore_technogym","Drop Technogym"],["reject","Reject"]].map(([action, label]) => (
                <button key={action} onClick={() => applyBatchAction(action)} style={s({ fontSize: 12, padding: "5px 10px" })}
                  disabled={!selectedReviewIds.length}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1a1b2e", textAlign: "left" }}>
                  {["", "Date", "Apple type", "Technogym type", "Start Δ", "Overlap", "Confidence", "Flag"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", fontWeight: 600, color: "#888", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviewRows.map(row => (
                  <tr key={row.review_id} style={{ borderBottom: "1px solid #111", verticalAlign: "top" }}>
                    <td style={{ padding: "8px 6px" }}><input type="checkbox" checked={selectedReviewIds.includes(row.review_id)} onChange={() => toggleReviewSelection(row.review_id)} /></td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{fmtShortDate(row.source_a?.record?.start_date || row.source_b?.record?.start_date)}</td>
                    <td style={{ padding: "8px 6px" }}>{row.source_a?.record?.type || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{row.source_b?.record?.type || "—"}</td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{isFinite(+row.comparators?.start_diff_min) ? (+row.comparators.start_diff_min).toFixed(1) + " min" : "—"}</td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{isFinite(+row.comparators?.overlap_min) ? (+row.comparators.overlap_min).toFixed(1) + " min" : "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{isFinite(+row.confidence) ? Math.round(100 * +row.confidence) + "%" : "—"}</td>
                    <td style={{ padding: "8px 6px", color: "#d97706", fontSize: 11 }}>{Array.isArray(row.reasons) ? row.reasons[0] : "review"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}



function SummaryCell({ label, value }) {
  return (
    <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "10px", padding: "12px" }}>
      <div style={{ fontSize: "12px", opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function DropInput({ label, file, onFile, accept }) {
  return (
    <label style={{ background: "#07080e", border: "1px dashed #4a9ee8", borderRadius: "12px", padding: "14px", display: "grid", gap: "8px", cursor: "pointer" }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "12px", opacity: 0.74 }}>{file ? file.name : "Click to choose file"}</div>
      <input type="file" accept={accept} style={{ display: "none" }} onChange={e => onFile(e.target.files?.[0] || null)} />
    </label>
  )
}

const thStyle = { padding: "10px 8px", fontWeight: 600, whiteSpace: "nowrap" }

const tdStyle = { padding: "10px 8px" }

function makeSessionFromSingleSource(prefix, appleRecord, technoRecord) {
  return {
    session_id: makeSessionId(prefix, { appleRecord, technoRecord }),
    match_confidence: "manual",
    relationship: null,
    canonical_type: appleRecord?.type || technoRecord?.type || "Other",
    start_date: appleRecord?.start_date || technoRecord?.start_date || null,
    end_date: appleRecord?.end_date || technoRecord?.end_date || null,
    duration_min: Number(appleRecord?.duration_min ?? technoRecord?.duration_min ?? 0) || 0,
    overlap_summary: null,
    sources: {
      apple: appleRecord || null,
      technogym: technoRecord || null
    },
    preferred_metrics: {
      hr: appleRecord?.hr != null ? { value: appleRecord.hr, source: "AppleHealth" } : technoRecord?.hr != null ? { value: technoRecord.hr, source: "Technogym" } : { value: null, source: null },
      calories: appleRecord?.calories != null ? { value: appleRecord.calories, source: "AppleHealth" } : technoRecord?.calories != null ? { value: technoRecord.calories, source: "Technogym" } : { value: null, source: null },
      distance: technoRecord?.distance != null ? { value: technoRecord.distance, source: "Technogym", rationale: "Manual review resolution", unit: technoRecord.distance_unit || "m" } : appleRecord?.distance != null ? { value: appleRecord.distance, source: "AppleHealth", rationale: "Manual review resolution", unit: appleRecord.distance_unit || null } : { value: null, source: null, rationale: null, unit: null },
      power_avg: { value: technoRecord?.power_avg ?? null, source: technoRecord?.power_avg != null ? "Technogym" : null },
      level: { value: technoRecord?.level ?? null, source: technoRecord?.level != null ? "Technogym" : null },
      rpm_avg: { value: technoRecord?.rpm_avg ?? null, source: technoRecord?.rpm_avg != null ? "Technogym" : null },
      vo2: { value: technoRecord?.vo2 ?? null, source: technoRecord?.vo2 != null ? "Technogym" : null, note: technoRecord?.vo2 != null ? "Technogym workout-level VO2 estimate" : null }
    }
  }
}

function dedupeCanonicalSessions(sessions) {
  const seen = new Set()
  return (Array.isArray(sessions) ? sessions : []).filter(session => {
    const key = session?.session_id || makeSessionId("session", session)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")))
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
const [healthFitDaily, setHealthFitDaily] = useState([])
const [sleepRecords, setSleepRecords] = useState(() => { try { return JSON.parse(localStorage.getItem("lift_sleep_records") || "[]") } catch { return [] } })
const [schedLog, setSchedLog] = useState(() => { try { return JSON.parse(localStorage.getItem('wt-log') || '[]') } catch { return [] } })
const [ocItems, setOcItems] = useState(() => { try { return JSON.parse(localStorage.getItem('oc-items') || '[]') } catch { return [] } })
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
const cleaned = raw.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/, '$1T$2$3')
                          .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/, '$1T$2$3$4:$5')
const d = new Date(cleaned)
dateStr = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) + 'T12:00:00' : null
    }

    // For indoor sessions with no GPS distance, derive a duration-based proxy.
    // Cycling is excluded: indoor bike sessions (Apple Watch, no odometer) return 0 from
    // Apple Health and would receive an inflated proxy; set null so mileage charts
    // skip them while session-count and cardioMinutes metrics still accumulate.
    let distance = normalizeDistanceToMiles(w)
    if (distance === 0) {
      const dur = extractDurationMin(w)
      if (dur > 0) {
        if (category === "Cycling") distance = null            // no real distance — exclude from mileage
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

  const sub = supabase.auth.onAuthStateChange(async (evt, sess) => {
    setSession(sess)

    if (evt === "SIGNED_IN" && sess?.user?.id) {
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
      if (Array.isArray(storedMeals) && !session?.user?.id) setMealEntries(storedMeals)
      if (storedPresets && typeof storedPresets === "object") {
        setMealPresets({ ...defaultMealPresets, ...storedPresets })
      }
      setHydrated(true)
    })()
  }, [session])
  useEffect(() => {
  ;(async () => {
    // Load from localStorage first
    const wo = await store.get("ufd-workouts")
    const lg = await store.get("wt-log")
    const ocLocal = await store.get("oc-items")
    const hfLocal = await store.get("healthfit-daily")
    if (Array.isArray(hfLocal)) setHealthFitDaily(hfLocal)
    // Then fetch from Supabase and merge
    if (supabase) {
      try {
        const { data } = await supabase
          .from("user_kv")
          .select("key, value, updated_at")
          .in("key", ["ufd-workouts", "wt-log", "oc-items", "healthfit-daily"])
        if (data) {
          const sbWo = data.find(r => r.key === "ufd-workouts")?.value
          console.log("Supabase user_kv fetch:", { sbWo_count: Array.isArray(sbWo)?sbWo.length:0 })
          // Merge ufd-workouts: union by id, prefer Supabase if newer
          if (Array.isArray(sbWo)) {
            const local = Array.isArray(wo) ? wo : []
            const merged = Object.values(
              [...local, ...sbWo].reduce((acc, w) => {
                if (!acc[w.id] || w.id > acc[w.id].id) acc[w.id] = w
                return acc
              }, {})
            ).sort((a, b) => String(a.dateTime || a.date || "").localeCompare(String(b.dateTime || b.date || "")))
            setStoredWorkouts(merged)
            await store.set("ufd-workouts", merged)
             } else if (Array.isArray(wo)) {
            setStoredWorkouts(wo)
          }
          const sbLg = data.find(r => r.key === "wt-log")?.value
          if (Array.isArray(sbLg)) {
            const local = Array.isArray(lg) ? lg : []
            const merged = Object.values(
              [...local, ...sbLg].reduce((acc, e) => { acc[e.id] = e; return acc }, {})
            ).sort((a, b) => b.id - a.id)
            setSchedLog(merged)
            await store.set("wt-log", merged)
          } else if (Array.isArray(lg)) {
            setSchedLog(lg)
          }
          // Merge oc-items
          const sbOc = data.find(r => r.key === "oc-items")?.value
          if (Array.isArray(sbOc)) {
            const local = Array.isArray(ocLocal) ? ocLocal : []
            const merged = Object.values(
              [...local, ...sbOc].reduce((acc, e) => { acc[e.id] = e; return acc }, {})
            ).sort((a, b) => b.id - a.id)
            setOcItems(merged)
            await store.set("oc-items", merged)
          } else if (Array.isArray(ocLocal)) {
            setOcItems(ocLocal)
          }
          // HealthFit daily records — merge by date, Supabase wins on conflict
          const sbHf = data.find(r => r.key === "healthfit-daily")?.value
          if (Array.isArray(sbHf)) {
            const byDate = {}
            ;(Array.isArray(hfLocal) ? hfLocal : []).forEach(r => { byDate[r.date] = r })
            sbHf.forEach(r => { byDate[r.date] = r })
            const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
            setHealthFitDaily(merged)
            await store.set("healthfit-daily", merged)
          }
        }
      } catch (err) {
        console.warn("Supabase sync fetch failed:", err.message)
        if (Array.isArray(wo)) setStoredWorkouts(wo)
      }
    } else {
      if (Array.isArray(wo)) setStoredWorkouts(wo)
      if (Array.isArray(ocLocal)) setOcItems(ocLocal)
    }
  })()
}, [])

useEffect(() => {
  if (!hydrated) return
  if (!session?.user?.id) return

  ;(async () => {
    try {
      await loadMealsFromSupabase(session.user.id)
    } catch (err) {
      const msg = err?.message || "Unknown sync error"
      console.error("Initial meal load failed:", err)
      // load error, no user message needed
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
async function persistMealEntries(nextEntries, currentUserId) {
  setMealEntries(nextEntries)

  await store.set("ufd-meal-entries", nextEntries)

  // currentUserId passed as parameter
  console.log("persistMealEntries called, userId:", currentUserId)
  if (!currentUserId) {
    console.log("No active session, meals saved locally only.")
    return
  }

  try {
    await syncMealsToSupabase(nextEntries, currentUserId)
  } catch (err) {
    const msg = err?.message || "Unknown sync error"
    console.error("Meal sync failed:", err)
    // load error, no user message needed
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
    await persistMealEntries(nextEntries, session?.user?.id)
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
    await persistMealEntries(nextEntries, session?.user?.id)

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
    await persistMealEntries(nextEntries, session?.user?.id)
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

const readinessScore = useMemo(
  () => computeReadinessDetail(ocItems, sleepRecords, healthFitDaily).score,
  [ocItems, sleepRecords, healthFitDaily]
)

const operationalCapacityData = useMemo(() => {
  const items = Array.isArray(ocItems) ? ocItems : []
  if (!items.length) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const daysBetween = (a, b) =>
    Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))

  const classifyItem = item => {
    if (item.key === "illnessLoad") return "disease"
    if (item.key === "sleepDebt")   return "fatigue"
    return "acute" // tendonStatus, muscleStatus, jointStatus
  }

  const categoryTau = { acute: 28, disease: 10, fatigue: 5 }

  const datedEntries = items
    .map(item => {
      const start = item.startDate ? new Date(item.startDate) : null
      if (!start || Number.isNaN(start.getTime())) return null
      return {
        _start: start,
        _category: classifyItem(item),
        _peakLoss: Math.max(0, Math.min(0.8, (item.initialScore || item.currentScore || 0) / 5))
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

  for (let d = new Date(firstDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const acuteLoss = datedEntries
      .filter(e => e._category === "acute")
      .reduce((sum, e) => {
        const age = daysBetween(d, e._start)
        if (age < 0) return sum
        return sum + e._peakLoss * Math.exp(-age / categoryTau.acute)
      }, 0)

    const diseaseLoss = datedEntries
      .filter(e => e._category === "disease")
      .reduce((sum, e) => {
        const age = daysBetween(d, e._start)
        if (age < 0) return sum
        return sum + e._peakLoss * Math.exp(-age / categoryTau.disease)
      }, 0)

    const fatigueLoss = datedEntries
      .filter(e => e._category === "fatigue")
      .reduce((sum, e) => {
        const age = daysBetween(d, e._start)
        if (age < 0) return sum
        return sum + e._peakLoss * Math.exp(-age / categoryTau.fatigue)
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
}, [ocItems])

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
  <div style={{ fontSize: 11, opacity: 0.4 }}>Build check: Mar 23 2026</div>
  <div style={{ fontSize: "11px", opacity: 0.85, marginBottom: "4px" }}>
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
          background: readinessScore >= 80
            ? "rgba(34,197,94,0.16)"
            : readinessScore >= 60
            ? "rgba(250,204,21,0.16)"
            : "rgba(239,68,68,0.16)"
        }}
      >
        <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Operational</div>
        <div style={{ fontSize: "30px", fontWeight: "bold" }}>{readinessScore}%</div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
          readiness score from OC tab
        </div>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, minmax(0, 1fr))"









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

    <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, minmax(0, 1fr))"








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

    <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, minmax(0, 1fr))"









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
  {(!operationalCapacityData || operationalCapacityData.length === 0) ? (
    <div style={{ fontSize: "12px", color: "#444", textAlign: "center", padding: "40px 0" }}>
      No issues logged — add issues in the Operational Capacity tab to see history.
    </div>
  ) : (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={operationalCapacityData} margin={{ top: 20, right: 20, left: 55, bottom: 35 }}>
        <CartesianGrid stroke="#1a1b2e" />
        <XAxis dataKey="label" label={{ value: "Date", position: "bottom", offset: 10, fill: "#ced2f0" }} />
        <YAxis domain={[0, 100]} label={{ value: "Operational capacity (%)", angle: -90, position: "insideLeft", offset: 15, fill: "#ced2f0", style: { textAnchor: "middle" } }} />
        <Tooltip formatter={(v, n) => {
          const lbl = { operationalPct: "Operational", acuteLossPct: "Acute burden", diseaseLossPct: "Disease burden", fatigueLossPct: "Fatigue burden" }
          return [`${Number(v).toFixed(1)}%`, lbl[n] || n]
        }} />
        <Legend verticalAlign="top" height={36} />
        <Line type="monotone" dataKey="operationalPct" stroke="#e5e7eb" strokeWidth={3} dot={false} name="Operational" />
        <Line type="monotone" dataKey="acuteLossPct"   stroke="#ef4444" strokeWidth={2} dot={false} name="Acute" />
        <Line type="monotone" dataKey="diseaseLossPct" stroke="#f59e0b" strokeWidth={2} dot={false} name="Disease" />
        <Line type="monotone" dataKey="fatigueLossPct" stroke="#a78bfa" strokeWidth={2} dot={false} name="Fatigue" />
      </LineChart>
    </ResponsiveContainer>
  )}
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
    schedLog={schedLog}
    setSchedLog={setSchedLog}
    readinessScore={readinessScore}
    ocItems={ocItems}
  />
)}

{tab === "Training" && (
  <TrainingDashboard
    workouts={operationalWorkouts}
    recentNutrition={recentNutrition}
    healthFitDaily={healthFitDaily}
  />
)}
{tab === "Operational Capacity" && (
  <TabOperationalCapacity
    ocItems={ocItems}
    setOcItems={setOcItems}
    session={session}
    operationalCapacityData={operationalCapacityData}
    healthFitDaily={healthFitDaily}
    sleepRecords={sleepRecords}
  />
)}
{tab === "_InjuryLegacy" && (
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
      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, minmax(0, 1fr))"










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
{tab === "Import" && (
  <ImportTab
    canonicalSessions={canonicalSessions}
    setCanonicalSessions={setCanonicalSessions}
    setHealthFitDaily={setHealthFitDaily}
    setSleepRecords={setSleepRecords}
  />
)}

      
{tab !== "Overview" && tab !== "Body Comp" && tab !== "Calories" && tab !== "Operational Capacity" && tab !== "Forecast" && tab !== "Schedule" && tab !== "Training" && tab !== "Import" && tab !== "Log" && (
  <div>
    <h3>{tab}</h3>
    <div>This tab is next.</div>
  </div>
)}
    </div>
  )
}
