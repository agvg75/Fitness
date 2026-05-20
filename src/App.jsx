import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { PROG, CARDIO } from "./scheduleData.js"
import {
  applyCanonicalSessionMergePolicy, 
  dedupeCanonicalSessions,
  getCanonicalSessionDuplicateKey,
  makeCanonicalSessionFromScheduleLog,
  mergeCanonicalSessionsPreferPrimary, 
  mergeCanonicalSessionsWithScheduleSeeds
} from "./lib/canonicalSessions.js"
import {
  loadBiometricRecords,
  loadCanonicalSessions,
  loadHealthfitDaily,
  loadSleepRecords,
  migrateLocalBiometricRecords,
  migrateLocalCanonicalSessions,
  migrateLocalHealthfitDaily,
  migrateLocalSleepRecords,
  upsertCanonicalSessions,
  upsertBiometricRecords,
  upsertHealthfitDaily,
  upsertSleepRecords
} from "./lib/persistence.js"
import { flagExercisesForOcItems, isMtpSafe, getExerciseProfile, EXERCISE_LIBRARY } from "./lib/exerciseLibrary.js"
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
  ReferenceArea,
  ReferenceLine
} from "recharts"
import { createClient } from "@supabase/supabase-js"
import { generateTrainerReport } from "./exportReport"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const SUPABASE_AUTH_STORAGE_KEY = "sb-rjirurdpluknrwnxlcox-auth-token"
const SIGN_OUT_TIMEOUT_MS = 8000
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        lock: (name, acquireTimeout, fn) => fn()
      }
    })
  : null

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[LIFT] Supabase env vars missing. " +
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file. " +
      "App will run in offline/localStorage-only mode."
    )
  }
}

let STORE_USER_ID = null
const setStoreUser = userId => {
  STORE_USER_ID = userId || null
}

const AUTH_URL_KEYS = [
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "token_type",
  "type",
  "code"
]

function getAuthRedirectContext() {
  if (typeof window === "undefined") {
    return {
      hasAuthParams: false,
      isRecovery: false,
      source: "none",
      type: null,
      hasAccessToken: false,
      hasRefreshToken: false,
      hasCode: false,
      summary: "no-auth-params"
    }
  }

  const url = new URL(window.location.href)
  const searchParams = new URLSearchParams(url.search)
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
  const hashParams = new URLSearchParams(hash)
  const source = AUTH_URL_KEYS.some(key => hashParams.has(key))
    ? "hash"
    : AUTH_URL_KEYS.some(key => searchParams.has(key))
      ? "search"
      : "none"
  const activeParams = source === "hash" ? hashParams : searchParams
  const hasAuthParams = source !== "none"
  const recoveryType = activeParams.get("type") || null
  const hasAccessToken = activeParams.has("access_token")
  const hasRefreshToken = activeParams.has("refresh_token")
  const hasCode = activeParams.has("code")
  const summary = hasAuthParams
    ? `${source}:type=${recoveryType || "none"}:access=${String(hasAccessToken)}:refresh=${String(hasRefreshToken)}:code=${String(hasCode)}`
    : "no-auth-params"

  return {
    hasAuthParams,
    isRecovery: recoveryType === "recovery",
    source,
    type: recoveryType,
    hasAccessToken,
    hasRefreshToken,
    hasCode,
    summary
  }
}

function cleanAuthRedirectUrl() {
  if (typeof window === "undefined") return

  const url = new URL(window.location.href)
  const searchParams = new URLSearchParams(url.search)
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
  const hashParams = new URLSearchParams(hash)

  let changed = false
  AUTH_URL_KEYS.forEach(key => {
    if (searchParams.has(key)) {
      searchParams.delete(key)
      changed = true
    }
    if (hashParams.has(key)) {
      hashParams.delete(key)
      changed = true
    }
  })

  if (!changed) return

  const nextSearch = searchParams.toString()
  const nextHash = hashParams.toString()
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash ? `#${nextHash}` : ""}`
  window.history.replaceState({}, document.title, nextUrl)
}

const SYNC_KEYS = new Set([
  "ufd-meal-entries",
  "ufd-meal-presets",
  "wt-log",
  "wt-sessions",
  "wt-tendon-work",
  "wt-checked-items",
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

// ── Session compartment classifier ───────────────────────────────────────
// Returns the COMPARTMENT_SPLITS key for a canonical session.
// Priority: canonical_type → exercise list analysis → day-of-week → "other"
// Call signature: classifySession(session, config) where config is LIFT_CONFIG.
function classifySession(session, config) {
  if (!session || !config?.COMPARTMENT_SPLITS) return "other"

  const raw = String(
    session.canonical_type || session.type || session.raw_type || ""
  ).toLowerCase()

  // Pure cardio modalities — resolved by type string alone
  if (raw.includes("running") || raw.includes("run"))     return "running"
  if (raw.includes("swimming") || raw.includes("swim"))   return "swimming"
  if (raw.includes("cycling") || raw.includes("cycl") || raw.includes("bike") || raw.includes("spin")) return "cycling"
  if (raw.includes("rowing")  || raw.includes("row"))     return "rowing"
  if (raw.includes("walking") || raw.includes("walk"))    return "walking"

  // Strength sessions — disambiguate by exercise list first, then day
  if (raw.includes("strength") || raw.includes("weight") || raw.includes("traditional")) {
    const exs = Array.isArray(session.exercises) ? session.exercises : []

    // Lower-body indicator exercises
    const lowerKeywords = ["leg press", "leg curl", "leg extension", "hip thrust",
      "hip abduction", "hip adduction", "calf raise", "rdl", "romanian", "squat", "lunge"]
    // Upper-body indicator exercises
    const upperKeywords = ["chest press", "chest-press", "lat pulldown", "cable row",
      "seated row", "bicep curl", "shoulder press", "tricep", "pull-up", "push-up"]

    let lowerHits = 0, upperHits = 0
    exs.forEach(ex => {
      const n = String(ex.exercise_name || ex.name || "").toLowerCase()
      if (lowerKeywords.some(k => n.includes(k))) lowerHits++
      if (upperKeywords.some(k => n.includes(k))) upperHits++
    })

    if (lowerHits > 0 || upperHits > 0) {
      if (lowerHits > 0 && upperHits === 0) return "lower_strength"
      if (upperHits > 0 && lowerHits === 0) return "upper_strength"
      return "mixed_strength"
    }

    // Fallback: day-of-week map from known weekly structure
    // Mon = Chest & Arms (upper), Tue = Legs (lower),
    // Thu = Back & Arms (upper), Fri = Legs + chest (mixed), Sat = Hip/Legs (lower)
    const day = String(session.day || "").slice(0, 3)
    if (day === "Mon" || day === "Thu") return "upper_strength"
    if (day === "Tue")                  return "lower_strength"
    if (day === "Fri")                  return "mixed_strength"
    if (day === "Sat")                  return "lower_cardio"
  }

  return "other"
}

// ── Allocate session TRIMP across compartments ────────────────────────────
// Returns { lower, upper, cardio } TRIMP values summing to total session TRIMP.
function allocateSessionTRIMP(session, trimp, config) {
  const key = classifySession(session, config)
  const splits = config?.COMPARTMENT_SPLITS?.[key] || { lower: 0.20, upper: 0.20, cardio: 0.60 }
  return {
    compartmentKey: key,
    lower:  +(trimp * splits.lower).toFixed(2),
    upper:  +(trimp * splits.upper).toFixed(2),
    cardio: +(trimp * splits.cardio).toFixed(2),
  }
}

if (typeof window !== "undefined") {
  window.classifySession = classifySession
  window.allocateSessionTRIMP = allocateSessionTRIMP
}

function getExerciseHistory(exerciseName, wtSessions) {
  if (!exerciseName || !Array.isArray(wtSessions) || !wtSessions.length) return []
  const lower = exerciseName.toLowerCase()
  const entries = []
  for (const sess of wtSessions) {
    const exs = sess.exercises || []
    const match = exs.find(e => {
      const n = (e.exercise_name || e.name || "").toLowerCase()
      return n.includes(lower) || lower.includes(n.split(" ")[0])
    })
    if (!match) continue
    // extract max numeric weight from sets
    let maxW = null
    const sets = match.sets || (match.actual ? [match.actual] : [])
    for (const s of sets) {
      const w = parseFloat(s.weight ?? s.load ?? s.w ?? 0)
      if (Number.isFinite(w) && w > 0 && (maxW === null || w > maxW)) maxW = w
    }
    if (maxW !== null) entries.push({ date: sess.date || "", weight: maxW })
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date)).slice(-8)
}

const tabs = [
  "Overview",
  "Schedule",
  "Forecast",
  "Capacity",
  "Training",
  "Calories",
  "Composition",
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
    { id: "b1", name: "Cottage cheese bowl + banana + coffee (M-Sa)", calories: 311, protein_g: 20, carbs_g: 48, fat_g: 4, fiber_g: 3 },
    { id: "b2", name: "Sunday pancakes (3) + maple syrup + coffee", calories: 345, protein_g: 9, carbs_g: 72, fat_g: 8, fiber_g: 2 },
    { id: "b3", name: "Greek yogurt + banana + granola + honey", calories: 420, protein_g: 22, carbs_g: 58, fat_g: 8, fiber_g: 4 },
    { id: "b4", name: "Bagel + cream cheese + 2 eggs + ham", calories: 520, protein_g: 30, carbs_g: 42, fat_g: 24, fiber_g: 2 },
    { id: "b5", name: "3 eggs + 4 ham slices", calories: 320, protein_g: 31, carbs_g: 2, fat_g: 20, fiber_g: 0 }
  ],
  Lunch: [
    { id: "l1", name: "Protein bar + 2 yogurts (weekday)", calories: 350, protein_g: 37, carbs_g: 28, fat_g: 9, fiber_g: 2 },
    { id: "l2", name: "Ham/cheese sandwich + corn chips (Saturday)", calories: 585, protein_g: 28, carbs_g: 45, fat_g: 28, fiber_g: 2 },
    { id: "l3", name: "Light sandwich or bagel + eggs (Sunday)", calories: 390, protein_g: 20, carbs_g: 42, fat_g: 10, fiber_g: 2 },
    { id: "l4", name: "Sandwich + yogurt", calories: 500, protein_g: 30, carbs_g: 45, fat_g: 18, fiber_g: 3 },
    { id: "l5", name: "Ham and eggs", calories: 350, protein_g: 32, carbs_g: 3, fat_g: 22, fiber_g: 0 }
  ],
  Dinner: [
    { id: "d1", name: "Lean meat + starch + vegetables + tea", calories: 440, protein_g: 36, carbs_g: 52, fat_g: 8, fiber_g: 5 },
    { id: "d2", name: "Lean meat + starch + vegetables + IPA", calories: 650, protein_g: 36, carbs_g: 67, fat_g: 8, fiber_g: 5 },
    { id: "d3", name: "Fish + vegetables + yogurt", calories: 420, protein_g: 32, carbs_g: 28, fat_g: 16, fiber_g: 5 },
    { id: "d4", name: "Broccoli + peas/carrots + protein", calories: 360, protein_g: 26, carbs_g: 30, fat_g: 12, fiber_g: 6 }
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
  // Append T12:00:00 for bare YYYY-MM-DD strings to prevent UTC-midnight
  // parse from shifting the local calendar date in UTC-negative timezones.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))
    ? `${dateStr}T12:00:00`
    : String(dateStr)
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
const SDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const SMETA = {
  Mon: { label:"Monday",    theme:"Chest & Triceps + Long Bike",  venue:"YMCA", color:"#d97706" },
  Tue: { label:"Tuesday",   theme:"Legs + Swim",                  venue:"YMCA", color:"#d97706" },
  Wed: { label:"Wednesday", theme:"Rest / Recovery",              venue:"—",    color:"#444"    },
  Thu: { label:"Thursday",  theme:"Back & Arms + Run",            venue:"YMCA", color:"#d97706" },
  Fri: { label:"Friday",    theme:"Legs Volume + Hip + Swim",     venue:"YMCA", color:"#d97706" },
  Sat: { label:"Saturday",  theme:"Long Swim",                    venue:"YMCA", color:"#d97706" },
  Sun: { label:"Sunday",    theme:"Long Run",                     venue:"—",    color:"#444"    },
};

const mk = (r, w) => ({ r: String(r), w: String(w) })

const PLAN = {

  // ─── MONDAY: Chest & Triceps + Long Bike ─────────────────────────────────
  Mon: {
    cardio: "Long bike · 45–50 min · Zone 2–3 · Stationary or spin · Do AFTER strength · This is the weekly long bike anchor session",
    warmup: [
      "Arm circles · 30 sec forward then 30 sec backward · full ROM · shoulder joint prep before pressing",
      "Band pull-aparts · 2×15 · light band · scapular retraction · posterior cuff activation",
      "Standing thoracic rotation · 8e slow · hands behind head · open chest toward ceiling",
      "Light push-up · 2×8 · bodyweight · controlled 3 sec down · pec and shoulder activation",
      "Wrist circles · 10 each direction · elbow joint prep before heavy pressing and curls",
    ],
    topNote: "YMCA only — KNR suspended until September. Full 5:00–7:00 window. Sequence: Chest → Pull/Chin-ups → Shoulders → Arms → Core → Tendon. Tendon section is 10 min at end — do not skip even if time is tight.",
    tendon: [
      { id: "eccentric_lateral_raise_mon", name: "Eccentric Lateral Raise", sub: "Light DB · 4 sec lowering", note: "Supraspinatus protocol · 2 sets only · lower is slower · therapeutic not hypertrophy", def: [mk(8,5), mk(8,5)] },
      { id: "eccentric_bicep_curl_mon", name: "Eccentric Biceps Curl", sub: "DB or cable · 4 sec lowering", note: "Elbow flexor tendon protocol · lighter than working weight · slow eccentric only", def: [mk(8,20), mk(8,20)] },
    ],
    sections: [
      { h: "A — CHEST (HEAVY)", ex: [
        { id:"chest_press_machine", name:"Chest Press", sub:"Technogym / machine", def:[mk(6,110),mk(6,110),mk(6,110)], note:"2-0-2 tempo · full ROM · 4–8 rep range" },
        { id:"incline_chest_press", name:"Incline Chest Press", sub:"Smith machine · low angle", def:[mk(6,90),mk(6,90),mk(6,90)], note:"Low incline · shoulder-safe · heavy day" },
        { id:"machine_flys", name:"Machine Flys", sub:"Cable or pec deck", def:[mk(8,30),mk(8,30),mk(8,30)], note:"Full stretch · controlled return · chest isolation" },
      ]},
      { h: "B — PULL (LAT + BICEP BASE)", ex: [
        { id:"pull_down_cable", name:"Pull Down", sub:"Cable straight-arm or heavy lat pulldown", def:[mk(8,160),mk(8,160),mk(8,160)], note:"Lat primary · Monday back volume · arms straight for straight-arm variant" },
        { id:"chinups", name:"Chin-ups", sub:"Bodyweight · full ROM", def:[mk(5,"BW"),mk(5,"BW"),mk(5,"BW")], note:"Controlled descent · 3 sec lowering" },
      ]},
      { h: "C — SHOULDER (HYPERTROPHY · replaces Wed volume)", ex: [
        { id:"lateral_raise", name:"Lateral Raise", sub:"Cable or DB · 3×12–15", def:[mk(12,15),mk(12,15),mk(12,15)], note:"Controlled arc · no shrug" },
        { id:"rear_delt_fly", name:"Rear Delt Fly", sub:"Reverse pec deck or incline DB", def:[mk(12,25),mk(12,25),mk(12,25)], note:"Squeeze at top" },
        { id:"face_pull_er", name:"Face Pull / ER", sub:"Cable rope · neutral grip", def:[mk(15,45),mk(15,45)], note:"External rotation emphasis · shoulder health" },
      ]},
      { h: "D — ARMS", ex: [
        { id:"triceps_pulldown", name:"Triceps Pulldown", sub:"Cable rope or bar", def:[mk(6,45),mk(6,25),mk(6,25)], note:"Elbows fixed · full extension" },
        { id:"triceps_overhead", name:"Triceps Overhead", sub:"Cable or DB · long head stretch", def:[mk(8,30),mk(6,30)], note:"Full overhead extension · 4 sec eccentric" },
        { id:"hammer_curl", name:"Hammer Curls", sub:"DB alternating · brachialis emphasis", def:[mk(5,55),mk(5,55),mk(5,55)], note:"Neutral grip · controlled" },
        { id:"bicep_curl_heavy", name:"Biceps Curl", sub:"DB or BB · supinated", def:[mk(5,40),mk(5,40),mk(5,40)], note:"Full supination at top" },
        { id:"bicep_curl_reverse", name:"Biceps Curl — Reverse", sub:"DB or cable · pronated grip", def:[mk(6,35),mk(6,35),mk(6,35)], note:"Brachioradialis and forearm extensor emphasis" },
        { id:"cable_incline_pushdown", name:"Cable Incline Pushdown", sub:"Standing at angle · high-to-low cable", def:[mk(6,40),mk(6,40),mk(6,40)], note:"Hits sternal head · different angle from machine flys" },
      ]},
      { h: "E — CORE + STABILITY", ex: [
        { id:"pushup_plank_shoulder_touch", name:"Pushup Plank w/ Shoulder Touch", sub:"Bodyweight · anti-rotation", def:[mk("10e","BW"),mk("10e","BW")], note:"Hips level · touch opposite shoulder" },
        { id:"pallof_press", name:"Pallof Press", sub:"Cable · split stance", def:[mk("10e",40),mk("10e",48)], note:"Anti-rotation isometric · exhale on press" },
      ]},
    ],
  },

  // ─── TUESDAY: Legs (Heavy) + Swim ────────────────────────────────────────
  Tue: {
    cardio: "Medium swim · 25–35 min · 600–900 yards · Zone 2 · No backstroke · Pull buoy if toe irritated · Do AFTER strength · No run today: swim covers cardio without MTP or leg fatigue overlap",
    warmup: [
      "Stationary bike 5–10 min · light → moderate · get blood flowing",
      "Standing calf raises 2×8 off plate/step · full stretch at bottom",
      "Bodyweight squat 2×8 · band around knees if form OK",
      "TOE/ANKLE BLOCK — do not skip · MTP protection",
      "Ankle (L) inversion + dorsiflexion 2×10 · band assisted",
      "Towel scrunches (L) 5 sets · intrinsic foot strength",
    ],
    topNote: "YMCA Day — Legs heavy (4–8 rep range). 49hr gap from Tuesday legs to Thursday run preserved. Tendon Work before main program. Toe/ankle block in warm-up is non-optional.",
    tendonWork: [
      "MTP Weight-Bearing Balance · L1: 2×20s each side · Flat floor, eyes open, foot completely flat · Feel ball of foot pressing floor · No toe curling · L3 target: 3×45s + slight heel rise · Advance only after 3 sessions zero MTP irritation next day · Search: single leg balance great toe MTP physical therapy",
      "Eccentric Calf Raise · L1: 2×8 each leg · Off step or plate · Both feet up, one foot down · 3-sec lowering · Bodyweight only · Full heel drop at bottom · L3 target: 3×12 + 10–15 lb DB · Advance: 3 sessions zero Achilles next-day soreness · Search: Alfredson protocol eccentric calf raise Achilles",
      "Tibialis Raise (Shin Raise) · L1: 2×15 · Heels on floor back against wall · Raise toes as high as possible · 1-sec hold at top · Stop if sharp shin pain · L3 target: 3×25 + light ankle weight · Advance: 3 sessions zero shin soreness · Search: tibialis anterior raise wall running injury prevention",
      "Terminal Knee Extension (TKE) · L1: 2×10 each side · Light loop band anchored at knee height behind you · Band in crease of knee · Drive to full extension · 1-sec hold · Small ROM — not a squat · L3 target: 3×15 medium band 3-sec hold · Advance: 3 sessions zero knee irritation · Search: TKE band patellar tendon physical therapy",
      "Single-Leg Balance · L1: 2×20s each side · Eyes open · Flat floor · Knee slightly bent · Arch neutral, toes flat · L3 target: 3×30s eyes closed · Search: single leg balance proprioception ankle rehabilitation",
    ],
    sections: [
      { h: "Glutes / Hips", ex: [
        { id:"t1", name:"Hip Thrust",              sub:"Smith machine",                def:[mk(10,115),mk(8,135),mk(8,165)],             note:"Full hip ext · pause at top · ribs down" },
      ]},
      { h: "Posterior Chain", ex: [
        { id:"t2", name:"Leg Press — Heel Drive",  sub:"Machine · endurance protocol", def:[mk(15,160),mk(15,160),mk(15,160)],           note:"Heels high · controlled · endurance mode" },
        { id:"t3", name:"TB DL / KB RDL",          sub:"KB 50 lb interim",             def:[mk(10,50),mk(10,50),mk(10,50)],              note:"Hinge not squat · flat back" },
      ]},
      { h: "Hip Stability", ex: [
        { id:"t4", name:"Lateral Band Walk",       sub:"Green band · 2 laps (~60 ft)", def:[mk("2 laps","green"),mk("2 laps","green")],   note:"Maintain tension throughout" },
        { id:"t5", name:"Hip Drive Marches",       sub:"Band · replaces leg curl",     def:[mk("10e","band"),mk("10e","band"),mk("10e","band")], note:"Pelvic neutral · don't let hip drop" },
      ]},
      { h: "Quads", ex: [
        { id:"t6", name:"Leg Extension",           sub:"Machine",                      def:[mk(12,80),mk(12,80),mk(12,80)],              note:"Full extension · controlled" },
      ]},
      { h: "Core", ex: [
        { id:"t7", name:"Plank",                   sub:"3×60 sec",                     def:[mk("60s","BW"),mk("60s","BW"),mk("60s","BW")], note:"Neutral spine · breathe" },
        { id:"t8", name:"90/90 Deadbugs",          sub:"2×15 each side",               def:[mk("15e","BW"),mk("15e","BW")],               note:"Back flat · slow · controlled" },
      ]},
    ],
  },

  // ─── WEDNESDAY: Rest / Recovery + Optional Lunch Run ─────────────────────
  Wed: {
    cardio: "Optional lunch run · 1.5–2 miles · Zone 2 · Conversational pace · Spring/Fall only (weather permitting) · Run at lunch not morning · Third weekly run — DROP FIRST if Tuesday legs felt heavy, MTP above 0 this week, or sleep below 5.5 hrs last night · Gap from Tuesday legs (5am) to Wed lunch run (~12pm) is ~31 hours — short of 48hr rule so easy pace is non-negotiable",
    warmup: [],
    cooldown: [
      "POST-RUN STATIC ROUTINE (if lunch run done) · 5 min",
      "Standing hamstring rotation stretch · L then R · 30 sec each",
      "Standing hinge hamstring · hold 30 sec · lower back arch",
      "High lunge with lateral lean · 30 sec each side · hip flexor release",
      "Wide stance rotation · 4 each side",
    ],
    topNote: "Rest day — no gym, no strength, no high intensity cardio. Tendon protocol only: 20 min, at home or work, no equipment needed except one resistance band. Optional: easy 7-mile bike commute on trail counts as active recovery. · If doing the lunch run: 3-min abbreviated pre-run (ankle rotations, leg swings both sides, A-skips — skip knee hugs and side lunges, already covered by tendon protocol). Full 5-min post-run static routine after.",
    tendon: [
      { id:"tibialis_raise_wed", name:"Tibialis Raise", sub:"Wall shin raise · bodyweight", note:"Stand 18 in from wall · lift toes to shin · 3 sec hold · running prehab · no equipment", def:[mk(15,"BW"),mk(15,"BW"),mk(15,"BW")] },
      { id:"eccentric_calf_raise_wed", name:"Eccentric Calf Raise", sub:"Step or curb · bodyweight", note:"Rise on two feet · lower on one · 3 sec eccentric · Achilles and calf protocol", def:[mk(10,"BW"),mk(10,"BW"),mk(10,"BW")] },
      { id:"hip_flexor_iso_wed", name:"Hip Flexor Isometric Hold", sub:"Floor or chair · seated knee raise hold", note:"90° hip flexion · hold 30–45 sec · running prehab · no equipment", def:[mk("30s","BW"),mk("30s","BW")] },
      { id:"face_pull_band_wed", name:"Face Pull / Band Pull-Apart", sub:"Resistance band", note:"Rotator cuff health · ER emphasis · loop band at face height or pull-apart", def:[mk(15,"band"),mk(15,"band"),mk(15,"band")] },
      { id:"tke_band_wed", name:"Terminal Knee Extension", sub:"Resistance band · loop at knee height", note:"Patellar tendon isometric loading · small ROM · 2 sec hold at extension", def:[mk(15,"band"),mk(15,"band")] },
    ],
  },

  // ─── THURSDAY: Back & Arms + Run ─────────────────────────────────────────
  Thu: {
    cardio: "Medium run · 25–35 min · 2–3 miles · Zone 2 · Do AFTER strength · Optional short bike 15–20 min / 4–6 miles if time remains · 49hr gap from Tuesday legs to Thursday run ✓",
    warmup: [
      "Wall slides 8e · pause at top · scapular upward rotation",
      "Scap pushups 2×10 · on wall or bench · protraction/retraction",
      "Face pulls w/ band 2×10 · light band",
      "Pull aparts w/ band 2×10",
    ],
    cooldown: [
      "POST-RUN STATIC ROUTINE · 5 min · do immediately after Thursday run",
      "Standing hamstring rotation stretch · L then R · 30 sec each · hands to floor, straighten one leg, opposite arm to sky",
      "Standing hinge hamstring · both legs · hands to shins, hips back, arch lower back · 30 sec",
      "Lower back extension · standing · hands on hips, push hips forward, chin to chest · 20 sec",
      "Upper back round · clasp hands, push away from chest, round spine, bend knees · 20 sec",
      "High lunge with lateral lean · L foot forward, R hand up and over · 30 sec each side",
      "Wide stance rotation · hips back, alternate reaching one hand to floor, other to sky · 4e",
    ],
    topNote: "YMCA Day — Back and Arms. Mix of heavy (4–8) and volume (8–15) sets. No swim today: arm day swim constraint. Run is buffered 49hr from Tuesday legs. Tendon Work before main program. · Before the run: do 3-min active pre-run routine (ankle rotations, leg swings, forward lunges) as transition from strength to run. After the run: full 5-min post-run static routine.",
    tendonWork: [
      "Eccentric Lateral Raise · L1: 2×8 each arm · 5 lb DB · Raise with BOTH arms together to shoulder height, lower with ONE arm only (4-sec lower) · Reset and repeat · The slow lowering is the entire stimulus — do not rush it · L3 target: 3×12 each arm at 8–10 lb · Advance: 3 sessions zero outer shoulder next-day soreness · Search: eccentric lateral raise supraspinatus rotator cuff rehab",
      "Eccentric Biceps Curl · L1: 2×5 each arm · 15 lb DB (lighter than working weight) · Curl up with BOTH arms, lower with ONE arm (4-sec lower) · Elbow stays at side · This is significantly harder than it looks at slow tempo · L3 target: 3×8 each arm at 25 lb 5-sec lower · Advance: 3 sessions zero elbow/biceps next-day soreness · Search: eccentric biceps curl tendon loading physical therapy",
      "Face Pull (Loaded Tendon Stimulus) · 2×15 · Cable or band · Slow pull and controlled 3-sec return · This is the loaded version not just warm-up activation · Maintain indefinitely — no progression target",
      "Pre-Run Ankle Primer · 2×10 each side · Simple calf raise, bodyweight, flat floor · Activation only before the run · Do not use eccentric protocol here — save that for Tuesday · Skip if calf is acutely tight",
    ],
    sections: [
      { h: "Back Primary", ex: [
        { id:"th1", name:"Cable Row (mid) — Single Arm", sub:"Cable · mid-height · SA",   def:[mk(6,67),mk(6,67),mk(6,67)],              note:"Single-arm · scapula retraction · don't round" },
        { id:"th2", name:"Lat Pulldown",                 sub:"Machine or cable",           def:[mk("6-8",120),mk("6-8",120),mk("6-8",120)], note:"Chest up · elbows to ribs · 2-1-2" },
        { id:"th3", name:"Straight Arm Pulldowns",       sub:"Cable · Wolverines · 40 lb", def:[mk(8,40),mk(8,40),mk(8,40)],               note:"Arms straight · lat isolation" },
        { id:"th4", name:"Inverted Row",                 sub:"TRX or bar · 3–4 sets",      def:[mk(8,"BW"),mk(8,"BW"),mk(8,"BW")],         note:"Full ROM · chest to bar" },
      ]},
      { h: "Biceps", ex: [
        { id:"th5", name:"Biceps Curl",                      sub:"DB or barbell · palms up", def:[mk(5,75),mk(5,75),mk(5,75)],              note:"No sway · full elbow extension · heavy day" },
        { id:"th6", name:"Cable D2 Flexion",                sub:"Cable · unsheathing sword", def:[mk(8,"—"),mk(8,"—"),mk(8,"—")],           note:"Full diagonal ROM · controlled" },
        { id:"th8", name:"Hammer Curl",                     sub:"DB alternating",             def:[mk("10-12","—"),mk("10-12","—")],          note:"Neutral grip · full ROM" },
      ]},
      { h: "Core", ex: [
        { id:"th9", name:"Suitcase Carry", sub:"DB 60 lb · 2 laps each arm (~30 ft/lap)", def:[mk("2 laps",60),mk("2 laps",60)], note:"Upright · no lateral lean · core braced" },
        { id:"th10", name:"Chin-ups", sub:"bodyweight · full ROM",  def:[mk(5,"BW"),mk(5,"BW"),mk(5,"BW")], note:"Dead hang start. Add weight via belt once 3×8 BW is consistent." },
      ]},
    ],
  },

  // ─── FRIDAY: Legs Volume + Hip + Chest (Volume) + Swim ───────────────────
  Fri: {
    cardio: "Short swim · 20–25 min · 400–600 yards · Zone 2 · No backstroke · Pull buoy if toe irritated · Do AFTER strength · NOT a run day — preserves 49hr gap to Sunday long run ✓ Friday 5am legs → Sunday 6am run = 49hr. If MTP signals anything after this session, hold Sunday run distance.",
    warmup: [
      "Cat/Cows 10 slow",
      "Glute Bridges 2×10",
      "Hip CARs 8e slow",
      "Arm circles 2×30 sec each direction",
    ],
    topNote: "YMCA Day — Legs volume (8–15 reps, lighter than Tuesday) + hip/core + second chest frequency. Swim only — no run today. Tendon Work after main program (primer for Sunday).",
    tendonWork: [
      "Tibialis Raise · 2×15 · Wall shin raises · Anterior chain primer for Sunday run · Always stay at Level 1 on Friday regardless of Tuesday progression level · This is activation not loading · Search: tibialis anterior raise wall",
      "Eccentric Calf Raise (Lighter Friday Version) · 2×6 each leg · Bodyweight only · 3-sec lower · ALWAYS keep Friday version at Level 1 regardless of Tuesday level · Purpose is priming Sunday's long run, not adding Achilles stimulus",
      "Hip Flexor Isometric Hold · L1: 2×20s each side · Stand upright, lift one knee to 90°, hold completely still · No load · Feel deep sustained effort at front of hip (not a cramp) · If cramping reduce to 12 sec · L3 target: 3×30s + light ankle weight · Advance: 3 sessions zero hip flexor next-day soreness · Search: hip flexor isometric hold running prehab",
    ],
    sections: [
      { h: "Chest (Volume Day · 2nd Frequency)", ex: [
        { id:"f0", name:"Cable Crossover",    sub:"Low-to-high or mid · 3×12–15",   def:[mk("12-15","—"),mk("12-15","—"),mk("12-15","—")], note:"Full stretch at start · squeeze at top · volume not load · second chest frequency" },
      ]},
      { h: "Hip", ex: [
        { id:"f1", name:"Hip Abduction",           sub:"Abductor machine",             def:[mk(8,120),mk(8,120),mk(8,120)],              note:"Full ROM · controlled return" },
        { id:"f2", name:"Hip Adduction",           sub:"Adductor machine",             def:[mk(8,80),mk(8,80),mk(8,80)],                 note:"Pelvic control throughout" },
        { id:"f3", name:"KB Swing",                sub:"Kettlebell · hip hinge drive", def:[mk(10,25),mk(10,25),mk(10,25)],              note:"Power from glutes · not arms" },
        { id:"f4", name:"Hip Thrust",              sub:"Smith machine · volume load",  def:[mk("10-12","—"),mk("10-12","—"),mk("10-12","—")], note:"Lighter than Tuesday · can sub glute bridge" },
      ]},
      { h: "Posterior Chain", ex: [
        { id:"f5", name:"Romanian Deadlift",       sub:"DB or barbell",                def:[mk("10-12","—"),mk("10-12","—"),mk("10-12","—")], note:"Hinge · flat back · 3-1-2 tempo" },
        { id:"f6", name:"Hamstring Eccentric Curl",sub:"Leg curl · 4s eccentric",      def:[mk("8-10","—"),mk("8-10","—"),mk("8-10","—")], note:"4-second lowering · slow control" },
      ]},
      { h: "Anti-Rotation Core", ex: [
        { id:"f7", name:"Pallof Press",            sub:"Cable · split stance",          def:[mk("8e",30),mk("8e",30),mk("8e",30)],        note:"Brace · press slowly · zero rotation" },
      ]},
      { h: "Shoulder Health", ex: [
        { id:"f8", name:"Shoulder Clock w/ Band",  sub:"Resistance band",              def:[mk("5e","band"),mk("5e","band"),mk("5e","band")], note:"Full range · light load only" },
      ]},
      { h: "Core", ex: [
        { id:"f9", name:"Russian Twists",          sub:"3×30 sec",                     def:[mk("30s","BW"),mk("30s","BW"),mk("30s","BW")], note:"Feet elevated optional · controlled" },
      ]},
    ],
  },

  // ─── SATURDAY: Long Swim ──────────────────────────────────────────────────
  Sat: {
    cardio: "Race day or long run · If racing: treat as primary cardio session, no additional strength · If not racing: long swim 50–60 min · Race weeks shift long run to Saturday",
    warmup: [
      "Arm circles · 30 sec forward then 30 sec backward · shoulder joint prep before pool entry",
      "Cross-body shoulder stretch · 30 sec each side · pull arm across chest · posterior cuff",
      "Band pull-aparts · 2×12 · light band · scapular activation before freestyle",
      "Neck rolls · 5 slow each direction · cervical prep for bilateral breathing rotation",
    ],
    topNote: "Race weeks: Saturday is primary run. Adjust Thursday to easy 2–3 miles only. Sunday becomes full rest. Non-race weeks: long swim as primary Saturday session.",
    tendonWork: [],
    sections: [],
  },

  // ─── SUNDAY: Long Run ─────────────────────────────────────────────────────
  Sun: {
    cardio: "Long run · Zone 2 · Current ceiling 4.0 miles · Next milestone 4.4 · MTP protocol applies · Race weeks: full rest — do not run day after a Saturday race",
    warmup: [
      "PRE-RUN ACTIVE ROUTINE · 5 min · mandatory before every Sunday long run",
      "Ankle rotations · 10 each direction each foot · joint mobility",
      "Ankle rocks · forward/back rocking · 20 reps each foot · Achilles and plantar prep",
      "Leg swings forward/back · 10e · hold wall for balance · hip flexor and hamstring activation",
      "Leg swings side to side · 10e · abductor and adductor activation",
      "Side lunges · 8e · lateral hip mobility · adductor length",
      "Knee hug walk · 8e alternating · hip flexor and glute stretch",
      "Hip open and close · 8e each direction · hip rotator activation",
      "Forward lunges alternating · 8e · quad and hip flexor activation · MTP note: push off gently",
      "A-skips · 20 sec · cadence and dorsiflexion activation · key for 173 spm target",
    ],
    cooldown: [
      "POST-RUN STATIC ROUTINE · 5 min · mandatory after every Sunday long run",
      "Standing hamstring rotation stretch · L then R · 30 sec each · hands to floor, one leg straight, opposite arm to sky",
      "Standing hinge hamstring · both legs · hands to shins, hips back, arch lower back, hold 30 sec",
      "Lower back extension · standing · hands on hips, push hips forward, chin down · 20 sec",
      "Upper back round · clasp hands, push away from chest, round spine, slight knee bend · 20 sec",
      "High lunge with lateral lean · step L foot forward, R hand up and across · 30 sec each side",
      "Wide stance rotation · hips back halfway, alternate reaching one hand to floor and one to sky · 4 each side",
    ],
    topNote: "Non-race weeks: primary long run day. Race weeks: rest and recovery only. The following Tuesday resumes normal schedule.",
    tendonWork: [],
    sections: [],
  },

}


const defaultForDay = d => {
  const o = {}
  ;(PLAN[d]?.sections || []).forEach(s => s.ex.forEach(e => {
    o[e.id] = e.def.map(x => ({ ...x }))
  }))
  return o
}

const DAY_KEYS_BY_JS_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const todayDayKey = () => DAY_KEYS_BY_JS_DAY[new Date().getDay()]
const dayKeyFromScheduleDate = dateValue => {
  const date = String(dateValue || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : DAY_KEYS_BY_JS_DAY[parsed.getDay()]
}

const getScheduleEntryDayDateMismatch = entry => {
  const storedDay = String(entry?.day || "").slice(0, 3)
  const date = String(entry?.date || entry?.logged_at || "").slice(0, 10)
  const dateDay = dayKeyFromScheduleDate(date)
  if (!storedDay || !dateDay || storedDay === dateDay) return null
  return { storedDay, dateDay, date }
}

const getScheduleEntryTrainingType = entry => {
  const cardio = Array.isArray(entry?.cardio) && entry.cardio.some(c =>
    c?.modality || c?.duration || c?.distance || c?.calories || c?.hr || c?.notes
  )
  const strength = Array.isArray(entry?.exercises)
    ? entry.exercises.some(ex => ex?.variant !== "cardio")
    : entry?.data && Object.keys(entry.data).length > 0
  if (cardio && strength) return "both"
  if (cardio) return "cardio"
  if (strength) return "strength"
  return "none"
}

const getScheduleEntryConflictSlot = entry => {
  const venue = String(entry?.venue_label || entry?.venue || "").trim()
  if (venue) return venue
  const storedDay = String(entry?.day || "").slice(0, 3)
  return storedDay || "unslotted"
}

const buildScheduleDayDateMismatchReport = entries => {
  const activeEntries = (Array.isArray(entries) ? entries : []).filter(entry => !entry?.conflict_ignored && entry?.conflict_status !== "ignored")
  const clusters = activeEntries.reduce((acc, entry) => {
    const date = String(entry?.date || entry?.logged_at || "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return acc
    const slot = getScheduleEntryConflictSlot(entry)
    const clusterKey = `${date}__${slot}`
    if (!acc[clusterKey]) acc[clusterKey] = []
    acc[clusterKey].push(entry)
    return acc
  }, {})

  return Object.entries(clusters)
    .map(([clusterKey, clusterEntries]) => {
      if (!Array.isArray(clusterEntries) || clusterEntries.length < 2) return null
      const first = clusterEntries[0]
      const date = String(first?.date || first?.logged_at || "").slice(0, 10)
      const impliedWeekday = dayKeyFromScheduleDate(date)
      const slotLabel = getScheduleEntryConflictSlot(first)
      return {
        clusterKey,
        date,
        impliedWeekday,
        slotLabel,
        records: clusterEntries
          .map(entry => {
            const mismatch = getScheduleEntryDayDateMismatch(entry)
            return {
              id: entry?.id ?? entry?.session_id ?? "unknown",
              storedDay: String(entry?.day || "").slice(0, 3),
              storedDate: date,
              impliedWeekday: mismatch?.dateDay || impliedWeekday,
              loggedAt: entry?.logged_at || "",
              venue: entry?.venue_label || entry?.venue || "",
              trainingType: getScheduleEntryTrainingType(entry),
              isCanonical: Boolean(entry?.conflict_canonical),
              hasMismatch: Boolean(mismatch),
            }
          })
          .sort((a, b) => Number(b.isCanonical) - Number(a.isCanonical) || String(a.loggedAt).localeCompare(String(b.loggedAt)))
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

const mergeScheduleLogEntries = (...logs) => Object.values(
  logs
    .flatMap(log => Array.isArray(log) ? log : [])
    .reduce((acc, entry) => {
      if (entry?.id == null) return acc
      acc[entry.id] = entry
      return acc
    }, {})
).sort((a, b) => b.id - a.id)

const SDAY_TYPES = {
  Mon: ["Running", "Traditional Strength Training"],
  Tue: ["Traditional Strength Training"],
  Wed: ["Running", "Traditional Strength Training"],
  Thu: ["Traditional Strength Training"],
  Fri: ["Swimming", "Functional Strength Training"],
  Sat: ["Running", "Traditional Strength Training"],
  Sun: []
}

const DEFAULT_TENDON_WORK_BY_DAY = {
  Tue: [
    { id: "mtp_balance", name: "MTP Weight-Bearing Balance", sets: "2", reps: "20s each side", load: "BW", notes: "L1 start. Stand on one foot, flat floor, eyes open. Feel ball of foot pressing floor. No toe curling. L3 target: 3×45s + slight heel rise. Search: single leg balance great toe MTP physical therapy" },
    { id: "eccentric_calf_raise", name: "Eccentric Calf Raise", sets: "2", reps: "8 each leg", load: "BW", notes: "L1 start. Off step: both feet up, one foot down, 3-sec lower, full heel drop. L3 target: 3×12 + 10–15 lb DB. Search: Alfredson protocol eccentric calf raise Achilles" },
    { id: "tibialis_raise_dorsiflexion", name: "Tibialis Raise (Shin Raise)", sets: "2", reps: "15", load: "BW", notes: "L1 start. Back against wall, heels on floor, raise toes as high as possible, 1-sec hold at top. Stop if sharp shin pain. L3 target: 3×25 + ankle weight. Search: tibialis anterior raise wall running injury prevention" },
    { id: "tke_patellar", name: "Terminal Knee Extension (TKE)", sets: "2", reps: "10 each side", load: "light band", notes: "L1 start. Anchor band at knee height behind you, band in crease of knee, drive to full extension, 1-sec hold. Small ROM — not a squat. L3 target: 3×15 medium band 3-sec hold. Search: TKE band patellar tendon physical therapy" },
    { id: "single_leg_balance", name: "Single-Leg Balance", sets: "2", reps: "20s each side", load: "BW", notes: "L1 start. Eyes open, flat floor, knee slightly bent, arch neutral, toes flat. L3 target: 3×30s eyes closed. Search: single leg balance proprioception ankle rehabilitation" },
  ],
  Thu: [
    { id: "eccentric_lateral_raise", name: "Eccentric Lateral Raise", sets: "2", reps: "8 each arm", load: "5 lb", notes: "L1 start. RAISE with both arms together to shoulder height, LOWER with one arm only (4-sec lower). The slow lowering is the entire stimulus. L3 target: 3×12 each arm at 8–10 lb. Search: eccentric lateral raise supraspinatus rotator cuff rehab" },
    { id: "eccentric_biceps_curl", name: "Eccentric Biceps Curl", sets: "2", reps: "5 each arm", load: "15 lb", notes: "L1 start. CURL UP with both arms, LOWER with one arm (4-sec lower). 15 lb is lighter than working weight by design. L3 target: 3×8 each arm at 25 lb, 5-sec lower. Search: eccentric biceps curl tendon loading physical therapy" },
    { id: "face_pull_tendon", name: "Face Pull (Tendon Stimulus)", sets: "2", reps: "15", load: "band/cable", notes: "Slow pull and controlled 3-sec return. This is the loaded tendon stimulus version, not just warm-up activation. Maintain indefinitely — no progression target." },
    { id: "pre_run_ankle_primer", name: "Pre-Run Ankle Primer", sets: "2", reps: "10 each side", load: "BW", notes: "Simple calf raise, flat floor. Activation only before the run. Do not use eccentric protocol here — save that for Tuesday. Skip if calf is acutely tight." },
  ],
  Fri: [
    { id: "tibialis_raise_primer", name: "Tibialis Raise (Friday Primer)", sets: "2", reps: "15", load: "BW", notes: "Anterior chain primer for Sunday run. Always stay at Level 1 on Friday regardless of Tuesday progression. This is activation not loading. Search: tibialis anterior raise wall" },
    { id: "eccentric_calf_lighter", name: "Eccentric Calf Raise (Lighter Version)", sets: "2", reps: "6 each leg", load: "BW", notes: "ALWAYS keep Friday version at Level 1 regardless of Tuesday level. Purpose is priming Sunday's long run, not adding Achilles stimulus." },
    { id: "hip_flexor_isometric", name: "Hip Flexor Isometric Hold", sets: "2", reps: "20s each side", load: "BW", notes: "L1 start. Stand upright, lift one knee to 90°, hold completely still. Feel deep sustained effort at front of hip — not a cramp. If cramping reduce to 12 sec. L3 target: 3×30s + light ankle weight. Search: hip flexor isometric hold running prehab" },
  ],
}

const TENDON_EXERCISE_PATTERNS = [
  { id: "standing_calf_raise", match: /standing calf raise|standing calf|single-leg calf raise/i, group: "achilles_calf", capacity: 1.2, load: 0.5 },
  { id: "seated_calf_raise", match: /seated calf raise|bent-knee calf raise|bent knee calf/i, group: "achilles_calf", capacity: 1.15, load: 0.45 },
  { id: "tibialis_raise", match: /tibialis raise|dorsiflexion|ankle.*dorsiflex/i, group: "achilles_calf", capacity: 0.7, load: 0.2 },
  { id: "toe_extensor_intrinsic", match: /toe extensor|foot intrinsic|towel scrunch|toe yoga|intrinsic foot/i, group: "forefoot_toe_extensor", capacity: 0.85, load: 0.25 },
  { id: "lateral_ankle_band", match: /lateral ankle band|ankle band|inversion|eversion/i, group: "achilles_calf", capacity: 0.45, load: 0.15 },
  { id: "leg_press", match: /leg press/i, group: "patellar_knee", capacity: 0.35, load: 0.85 },
]

const TENDON_GROUP_META = {
  combined: {
    label: "Combined",
    color: "#f97316",
    safe: 0.85,
    caution: 1.0,
    overload: 1.15,
  },
  achilles_calf: {
    label: "Achilles / Calf",
    color: "#f59e0b",
    safe: 0.85,
    caution: 1.05,
    overload: 1.2,
  },
  forefoot_toe_extensor: {
    label: "Forefoot / Toe Extensor",
    color: "#fb7185",
    safe: 0.8,
    caution: 1.0,
    overload: 1.15,
  },
  patellar_knee: {
    label: "Patellar / Knee",
    color: "#38bdf8",
    safe: 0.85,
    caution: 1.05,
    overload: 1.2,
  },
}

function getDefaultTendonWork(day) {
  const buildPlanTendonEntry = item => {
    const def = Array.isArray(item?.def) && item.def.length
      ? item.def.map(set => ({ ...set }))
      : [{ r: item?.reps || "", w: item?.load || "" }]
    return {
      ...item,
      sub: item?.sub || "",
      note: item?.note || item?.notes || "",
      def,
      sets: String(def.length || 0),
      reps: def[0]?.r ?? "",
      load: def[0]?.w ?? "",
      notes: item?.notes || item?.note || ""
    }
  }

  const planSource = Array.isArray(PLAN?.[day]?.tendon) ? PLAN[day].tendon : []
  if (planSource.length) {
    return planSource.map(buildPlanTendonEntry)
  }

  const source = DEFAULT_TENDON_WORK_BY_DAY[day] || []
  return source.map(item => buildPlanTendonEntry(item))
}

function normalizeExerciseText(value) {
  return String(value || "").trim().toLowerCase()
}

function classifyTendonExercise(name) {
  const text = normalizeExerciseText(name)
  return TENDON_EXERCISE_PATTERNS.find(pattern => pattern.match.test(text)) || null
}

function formatRxSummary(sets, reps, load) {
  const parts = []
  if (sets) parts.push(String(sets))
  if (reps) parts.push(String(reps))
  const base = parts.length === 2 ? `${parts[0]} x ${parts[1]}` : parts.join(" ")
  if (load !== "" && load != null) {
    return base ? `${base} @ ${load}` : `@ ${load}`
  }
  return base || "No Rx"
}

function resolveEditableField(source, key, fallback = "") {
  if (source && Object.prototype.hasOwnProperty.call(source, key)) {
    return source[key]
  }
  return fallback
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

function ScheduleLogView({ log, expanded, setExpanded, onDelete, onEdit, highlightedId, setEntryRef }) {
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
        const m = SCH_META[entry.day] || SMETA[entry.day] || { color: "#666", venue: "?" }
        const allExercises = entry.exercises || []
        const programExs = allExercises.filter(ex => ex.variant !== "custom")
        const customExs  = allExercises.filter(ex => ex.variant === "custom")
        // fallback: render slug-keyed data from imported entries (e.g. ymca xlsx import)
        const importedExs = (allExercises.length === 0 && entry.data)
          ? Object.keys(entry.data).map(slug => ({
              exercise_id: slug,
              exercise_name: slug.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
              actual: { sets: entry.data[slug].length, reps: entry.data[slug][0]?.r, load: entry.data[slug][0]?.w },
              _sets: entry.data[slug],
              variant: "imported",
            }))
          : []

        const fmtActual = (ex) => {
          const { sets, reps, load } = ex.actual || {}
          if (!sets && !reps && !load) return "—"
          const setsReps = (sets && reps) ? `${sets}x${reps}` : sets ? `${sets} sets` : reps ? `${reps} reps` : ""
          return load ? `${setsReps} @ ${load} lb` : setsReps
        }

        const open = expanded[entry.id]
        const highlighted = String(highlightedId || "") === String(entry.id)

        return (
          <div
            key={entry.id}
            ref={node => setEntryRef?.(entry.id, node)}
            style={{
              background: highlighted ? "#17120a" : "#0e0e0e",
              border: highlighted ? "1px solid #f59e0b" : "1px solid #1a1a1a",
              borderLeft: `3px solid ${highlighted ? "#f59e0b" : m.color}`,
              borderRadius: "8px",
              marginBottom: "10px",
              overflow: "hidden",
              boxShadow: highlighted ? "0 0 0 1px rgba(245, 158, 11, 0.25)" : "none",
              transition: "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
            }}
          >
            <div onClick={() => toggle(entry.id)} style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#d0d0d0" }}>
                  {entry.dayLabel} <span style={{ color: m.color }}>{entry.theme}</span>
                  <span style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", background: entry.venue === "knr" ? "#0d1f38" : "#1e1200", color: entry.venue === "knr" ? "#3b82f6" : "#d97706", padding: "2px 7px", borderRadius: "3px", marginLeft: "8px" }}>{entry.venue_label || entry.venue || m.venue}</span>
                </div>
                <div style={{ fontSize: "10px", color: "#3a3a3a", marginTop: "3px" }}>{fmtDateTime(entry.date)}</div>
              </div>

              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button onClick={e => { e.stopPropagation(); onEdit(entry.id) }} style={{ background: "none", border: "1px solid #222", borderRadius: "4px", color: "#555", fontSize: "10px", padding: "4px 10px", cursor: "pointer" }}>Edit record</button>
                <button onClick={e => { e.stopPropagation(); onDelete(entry.id) }} style={{ background: "none", border: "1px solid #1e1e1e", borderRadius: "4px", color: "#3a3a3a", fontSize: "10px", padding: "4px 10px", cursor: "pointer" }}>Delete</button>
                <span style={{ color: "#333", fontSize: "12px", marginLeft: "4px" }}>{open ? "▴" : "▾"}</span>
              </div>
            </div>

{open && (
  <div style={{ padding: "10px 14px 14px", borderTop: "1px solid #161616" }}>
    {entry.rpe != null && (
      <div style={{ marginBottom: "8px", fontSize: "11px", color: "#667" }}>
        Session RPE: <strong style={{ color: "#ced2f0" }}>{entry.rpe}/10</strong>
        <span style={{ marginLeft: 8, color: "#445" }}>
          {entry.rpe <= 3 ? "Very easy" : entry.rpe <= 5 ? "Moderate" : entry.rpe <= 7 ? "Hard" : entry.rpe <= 9 ? "Very hard" : "Max effort"}
        </span>
      </div>
    )}
    {Array.isArray(entry.cardio) && entry.cardio.filter(c => c.modality || c.duration).map((c, i) => (
      <div key={i} style={{ marginBottom: "6px", padding: "8px 10px", background: "#101622", border: "1px solid #1a2a44", borderRadius: "6px", fontSize: "11px", color: "#9ec5ff" }}>
        <strong style={{ textTransform: "capitalize" }}>{c.modality || "Cardio"}</strong>
        {c.duration && <> , {c.duration} min</>}
        {c.distance && <> , {parseFloat(c.distance).toFixed(2)} mi</>}
        {c.calories && <> , {c.calories} kcal</>}
        {c.hr && <> , {c.hr} bpm avg</>}
        {c.notes && <div style={{ marginTop: "4px", color: "#7f93b8" }}>{c.notes}</div>}
      </div>
    ))}

    {Array.isArray(entry.tendon_work) && entry.tendon_work.length > 0 && (
      <div style={{ marginBottom: 10, padding: "8px 10px", background: "#171108", border: "1px solid #3a2a0d", borderRadius: 6 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f59e0b", fontWeight: 700, marginBottom: 6 }}>
          Tendon Work
        </div>
        {entry.tendon_work.map((item, idx) => (
          <div key={`${item.id || item.name}_${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", fontSize: 11, color: "#f3d28a", borderBottom: idx < entry.tendon_work.length - 1 ? "1px solid #24190a" : "none" }}>
            <span>{item.name}</span>
            <span>{formatRxSummary(item.sets, item.reps, item.load)}</span>
          </div>
        ))}
      </div>
    )}

    {allExercises.length === 0 && <div style={{ fontSize: "12px", color: "#333" }}>No exercise data recorded.</div>}

    {programExs.map(ex => {
      // Prefer per-set data from entry.data when it has multiple sets (Fix 3 writes full _def arrays)
      const setData = entry.data?.[ex.exercise_id]
      const multiSet = Array.isArray(setData) && setData.length > 1
      return (
        <div key={ex.exercise_id} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "3px 0", borderBottom: "1px solid #121212", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#a0a0a0", minWidth: "190px" }}>{ex.exercise_name}</span>
          {multiSet
            ? <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#444" }}>
                {setData.map((s, i) => (
                  <span key={i}>
                    {i > 0 && <span style={{ color: "#2a2a2a" }}> · </span>}
                    <span style={{ color: "#c0c0c0" }}>{s.r}</span>
                    <span style={{ color: "#333" }}>@</span>
                    <span style={{ color: "#888" }}>{s.w}</span>
                  </span>
                ))}
              </span>
            : <span style={{ fontSize: "11px", color: "#888" }}>{fmtActual(ex)}</span>
          }
          {ex.notes && <span style={{ fontSize: "10px", color: "#3a3a3a", fontStyle: "italic" }}>{ex.notes}</span>}
        </div>
      )
    })}

    {programExs.length > 0 && customExs.length > 0 && (
      <div style={{ borderTop: "1px solid #1a1a1a", margin: "6px 0" }} />
    )}

    {customExs.map(ex => (
      <div key={ex.exercise_id} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "3px 0", borderBottom: "1px solid #121212" }}>
        <span style={{ fontSize: "13px", fontWeight: "600", color: "#7a7aaa", minWidth: "190px" }}>
          {ex.exercise_name}
          {ex.notes && <span style={{ fontSize: "10px", color: "#3a3a5a", fontStyle: "italic", marginLeft: 6 }}>{ex.notes}</span>}
          <span style={{ fontSize: "9px", color: "#3a3a5a", marginLeft: 6 }}>custom</span>
        </span>
        <span style={{ fontSize: "11px", color: "#9090c0" }}>{fmtActual(ex)}</span>
      </div>
    ))}
    {importedExs.length > 0 && programExs.length === 0 && customExs.length === 0 && (
      <>
        {importedExs.map(ex => (
          <div key={ex.exercise_id} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "3px 0", borderBottom: "1px solid #121212" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#6a9a6a", minWidth: "190px" }}>
              {ex.exercise_name}
              <span style={{ fontSize: "9px", color: "#3a6a3a", marginLeft: 6 }}>imported</span>
            </span>
            <span style={{ fontSize: "11px", color: "#888" }}>
              {ex._sets.map((s, i) => (
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
      </>
    )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScheduleMismatchDiagnostics({ report, onOpenEntry, onEditEntry, onResolveGroup, expanded = false, onToggle = null }) {
  const groups = Array.isArray(report) ? report : []
  const [resolveOpen, setResolveOpen] = useState({})
  const [resolveDrafts, setResolveDrafts] = useState({})

  useEffect(() => {
    setResolveDrafts(prev => {
      const next = { ...prev }
      groups.forEach(group => {
        if (!next[group.clusterKey]) {
          const canonical = group.records.find(r => r.isCanonical)?.id ?? group.records[0]?.id ?? null
          next[group.clusterKey] = {
            canonicalId: canonical,
            deleteOthers: false,
            reassignDateEnabled: false,
            reassignDate: group.date || ""
          }
        }
      })
      return next
    })
  }, [groups])

  return (
    <div style={{ marginBottom: 12, padding: "10px 12px", background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8 }}>
      <div
        onClick={() => onToggle?.()}
        style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: expanded && groups.length ? 10 : 0, flexWrap: "wrap", cursor: onToggle ? "pointer" : "default" }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#777", fontWeight: 700 }}>
            Schedule day/date diagnostics
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
            Conflict detection and guided resolution for duplicated schedule slots.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: groups.length ? "#f59e0b" : "#22c55e" }}>
            {groups.length} {groups.length === 1 ? "conflict cluster" : "conflict clusters"}
          </div>
          <div style={{ fontSize: 10, color: "#555" }}>{expanded ? "▼" : "▶"}</div>
        </div>
      </div>

      {!expanded ? null : !groups.length ? (
        <div style={{ fontSize: 12, color: "#555" }}>No conflicts found.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {groups.map(group => {
            const draft = resolveDrafts[group.clusterKey] || {}
            const resolveEnabled = Boolean(resolveOpen[group.clusterKey])
            return (
              <div key={group.clusterKey} style={{ border: "1px solid #1a1a1a", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 12px", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid #171717" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>
                      Conflict: multiple records mapped to same session
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                      {group.date} · {group.impliedWeekday || "NA"} · {group.slotLabel || "NA"} · {group.records.length} records
                    </div>
                  </div>
                  <button
                    onClick={() => setResolveOpen(prev => ({ ...prev, [group.clusterKey]: !prev[group.clusterKey] }))}
                    style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: "4px", color: "#aaa", fontSize: "10px", padding: "4px 10px", cursor: "pointer", alignSelf: "flex-start" }}
                  >
                    Resolve
                  </button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, color: "#aaa" }}>
                    <thead>
                      <tr style={{ color: "#555", textAlign: "left", borderBottom: "1px solid #181818" }}>
                        {["Keep", "Entry id", "Stored day", "Stored date", "Date weekday", "Logged at", "Venue", "Type", "Status", "Action"].map(h => (
                          <th key={h} style={{ padding: "5px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.records.map(row => (
                        <tr key={`${group.clusterKey}_${row.id}`} style={{ borderBottom: "1px solid #121212" }}>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                            {resolveEnabled ? (
                              <input
                                type="radio"
                                name={`canonical_${group.clusterKey}`}
                                checked={String(draft.canonicalId) === String(row.id)}
                                onChange={() => setResolveDrafts(prev => ({
                                  ...prev,
                                  [group.clusterKey]: { ...(prev[group.clusterKey] || {}), canonicalId: row.id }
                                }))}
                              />
                            ) : row.isCanonical ? "✓" : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", fontFamily: "'IBM Plex Mono',monospace", color: "#777", whiteSpace: "nowrap" }}>{row.id}</td>
                          <td style={{ padding: "5px 8px", color: row.hasMismatch ? "#f59e0b" : "#aaa", fontWeight: row.hasMismatch ? 700 : 400 }}>{row.storedDay}</td>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{row.storedDate}</td>
                          <td style={{ padding: "5px 8px", color: row.hasMismatch ? "#f59e0b" : "#aaa", fontWeight: row.hasMismatch ? 700 : 400 }}>{row.impliedWeekday}</td>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{row.loggedAt || "NA"}</td>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{row.venue || "NA"}</td>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{row.trainingType}</td>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap", color: row.isCanonical ? "#22c55e" : row.hasMismatch ? "#f59e0b" : "#666" }}>
                            {row.isCanonical ? "Canonical" : row.hasMismatch ? "Day/date mismatch" : "Duplicate"}
                          </td>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                onClick={() => onOpenEntry?.(row.id)}
                                style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: "4px", color: "#aaa", fontSize: "10px", padding: "4px 10px", cursor: "pointer" }}
                              >
                                View
                              </button>
                              <button
                                onClick={() => onEditEntry?.(row.id)}
                                style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: "4px", color: "#aaa", fontSize: "10px", padding: "4px 10px", cursor: "pointer" }}
                              >
                                Edit record
                              </button>
                              <button
                                onClick={() => setResolveOpen(prev => ({ ...prev, [group.clusterKey]: true }))}
                                style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: "4px", color: "#f59e0b", fontSize: "10px", padding: "4px 10px", cursor: "pointer" }}
                              >
                                Resolve
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {resolveEnabled && (
                  <div style={{ padding: "10px 12px", background: "#0d0e1c", borderTop: "1px solid #171717", display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#aaa" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(draft.deleteOthers)}
                          onChange={e => setResolveDrafts(prev => ({
                            ...prev,
                            [group.clusterKey]: { ...(prev[group.clusterKey] || {}), deleteOthers: e.target.checked }
                          }))}
                        />
                        Delete non-canonical records
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#aaa" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(draft.reassignDateEnabled)}
                          onChange={e => setResolveDrafts(prev => ({
                            ...prev,
                            [group.clusterKey]: { ...(prev[group.clusterKey] || {}), reassignDateEnabled: e.target.checked }
                          }))}
                        />
                        Reassign canonical record to different day
                      </label>
                      {draft.reassignDateEnabled && (
                        <input
                          type="date"
                          value={draft.reassignDate || ""}
                          onChange={e => setResolveDrafts(prev => ({
                            ...prev,
                            [group.clusterKey]: { ...(prev[group.clusterKey] || {}), reassignDate: e.target.value }
                          }))}
                          style={{ background: "#07080e", color: "#ced2f0", border: "1px solid #1a1b2e", borderRadius: 6, padding: "6px 8px" }}
                        />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => onResolveGroup?.({
                          clusterKey: group.clusterKey,
                          canonicalId: draft.canonicalId,
                          deleteOthers: Boolean(draft.deleteOthers),
                          reassignDate: draft.reassignDateEnabled ? draft.reassignDate : null
                        })}
                        style={{ background: "#1f3b2e", border: "1px solid #28543d", borderRadius: 6, color: "#d1fae5", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}
                      >
                        Resolve conflict
                      </button>
                      <button
                        onClick={() => setResolveOpen(prev => ({ ...prev, [group.clusterKey]: false }))}
                        style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 6, color: "#aaa", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Operational Capacity constants ───────────────────────────────────────────
const SCORE_LABELS = ["Resolved", "Mild", "Discomfort", "Pain", "Impairment", "Severe"]
const OC_SEVERITY_LABELS = {
  0: "None — no awareness, no restriction",
  1: "Mild — noticeable under load, resolves immediately",
  2: "Moderate — present during activity, gone within an hour",
  3: "Significant — alters technique or pace, lingers post-session",
  4: "Severe — prevents normal training, present at rest",
  5: "Unable — cannot bear load or complete session",
}
const MTP_CURRENT_CEILING = 4.0
const MTP_NEXT_MILESTONE = 4.4
const DEFAULT_TSB_THRESHOLDS = {
  moderate: -7,
  high: -9,
}

const OC_KEY_META = {
  tendonStatus: { label: "Tendon",     halfLifeHours: 168, scope: "regional", color: "#f59e0b" },
  muscleStatus: { label: "Muscle",     halfLifeHours: 72,  scope: "regional", color: "#ef4444" },
  jointStatus:  { label: "Joint",      halfLifeHours: 120, scope: "regional", color: "#3b82f6" },
  sleepDebt:    { label: "Sleep Debt", halfLifeHours: 48,  scope: "global",   color: "#a78bfa" },
  illnessLoad:  { label: "Illness",    halfLifeHours: 72,  scope: "global",   color: "#22c55e" },
}

const DEFAULT_OC_HALF_LIFE_OVERRIDES = {
  "MTP joint": 840,
  toe: 840,
  foot: 672,
}

function resolveOcHalfLifeHours(item, overrides = DEFAULT_OC_HALF_LIFE_OVERRIDES, fallback = 72) {
  const explicitHalfLife = Number(item?.halfLifeHours)
  if (Number.isFinite(explicitHalfLife) && explicitHalfLife > 0) return explicitHalfLife
  const haystack = String(item?.region || item?.label || item?.location || "").toLowerCase()
  const override = Object.entries(overrides || {})
    .find(([key]) => haystack.includes(String(key).toLowerCase()))
    ?.[1]
  if (Number.isFinite(Number(override)) && Number(override) > 0) return Number(override)
  return fallback
}

const OC_BODY_REGIONS = [
  "Tendon System",
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
  "Toe L":       { f: [70, 96],  b: [30, 96]  },
  "Toe R":       { f: [30, 96],  b: [70, 96]  },
}

// Body silhouette images — coordinates in OC_REGION_COORDS are CSS percentages
// (0–100) of the container's width/height, matching the 364×952 PNG dimensions.
function BodySilhouetteImg({ side, onClick = null }) {
  const src = side === "back" ? "/back_body_holo.png" : "/front_body_holo.png"
  return (
    <div
      onClick={onClick}
      style={{ width: "100%", aspectRatio: "364 / 952", position: "relative", overflow: "hidden", borderRadius: 8, cursor: onClick ? "crosshair" : "default" }}
    >
      <img src={src} alt={side + " body"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
    </div>
  )
}// Keep a thin shim so any remaining references compile during transition
function BodySilhouetteSVG() {
  return <BodySilhouetteImg side="front" />
}

function computeReadinessDetail(ocItems, sleepRecords, healthFitDaily, tsbFallback = null) {
  // ── Injury penalty (existing formula) ──────────────────────────
  const active = (ocItems || []).filter(i => i.currentScore > 0)
  const regional = active.filter(i => OC_KEY_META[i.key]?.scope === "regional").map(i => i.currentScore)
  const global   = active.filter(i => OC_KEY_META[i.key]?.scope === "global").map(i => i.currentScore)
  const maxRegional = regional.length ? Math.max(...regional) : 0
  const maxGlobal   = global.length   ? Math.max(...global)   : 0
  const sumAll      = active.reduce((s, i) => s + i.currentScore, 0)
  const injuryPenalty = active.length ? Math.round(maxRegional * 12 + maxGlobal * 10 + sumAll * 1.5) : 0

  // ── Sleep penalty — average of last 7 nights ───────────────────
  const recentSleep = getRecentSleepRecords(sleepRecords, 7)
  const avgSleepHours = recentSleep.length
    ? recentSleep.reduce((s, r) => s + sleepMinutesForReadiness(r), 0) / recentSleep.length / 60
    : null
  const sleepPenalty = avgSleepHours == null ? 0
    : avgSleepHours < 5.5 ? 20
    : avgSleepHours < 6   ? 10
    : 0

  // ── Training load penalty — most recent TSB ────────────────────
  // healthFitDaily takes precedence when fresh (last entry ≤7 days old)
  const sortedHF = (Array.isArray(healthFitDaily) ? healthFitDaily : [])
    .filter(r => r.tsb != null)
    .sort((a, b) => b.date.localeCompare(a.date))
  const latestHFEntry = sortedHF[0] ?? null
  const hfIsStale = !latestHFEntry ||
    (Date.now() - new Date(latestHFEntry.date).getTime()) > 7 * 24 * 3600000
  const latestTsb = (!hfIsStale && latestHFEntry) ? latestHFEntry.tsb
    : tsbFallback ?? (latestHFEntry?.tsb ?? null)
  const tsbPenalty = latestTsb == null ? 0
    : latestTsb < DEFAULT_TSB_THRESHOLDS.high ? 20
    : latestTsb < DEFAULT_TSB_THRESHOLDS.moderate ? 10
    : 0

  const score = Math.max(0, 100 - injuryPenalty - sleepPenalty - tsbPenalty)
  return { score, injuryPenalty, sleepPenalty, tsbPenalty, avgSleepHours, latestTsb, active }
}

function computeReadiness(items) {
  return computeReadinessDetail(items, [], []).score
}

function sleepMinutesForReadiness(record) {
  const raw = Number(record?.duration_min || 0) || 0
  return raw > 24 * 60 ? raw / 60 : raw
}

function getSleepRecordStartInfo(record) {
  const candidates = [record?.start_at, record?.start_time]
  for (const value of candidates) {
    const normalized = normalizeDateString(value)
    if (!normalized) continue
    const ms = Date.parse(normalized)
    if (Number.isFinite(ms)) return { normalized, ms }
  }
  return { normalized: null, ms: NaN }
}

function getSleepRecordEndInfo(record) {
  const candidates = [record?.end_at, record?.end_time]
  for (const value of candidates) {
    const normalized = normalizeDateString(value)
    if (!normalized) continue
    const ms = Date.parse(normalized)
    if (Number.isFinite(ms)) return { normalized, ms }
  }
  return { normalized: null, ms: NaN }
}

function getSleepRecordDate(record) {
  const candidates = [
    record?.date,
    record?.sleep_date,
    record?.end_at,
    record?.end_time,
    record?.start_at,
    record?.start_time,
  ]

  for (const value of candidates) {
    const normalized = normalizeDateString(value)
    if (normalized) return String(normalized).slice(0, 10)
    const plain = String(value || "").slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(plain)) return plain
  }

  return null
}

function mergeAdjacentSleepSegments(records, gapMinutes = 90) {
  const gapMs = gapMinutes * 60000
  const normalized = (Array.isArray(records) ? records : [])
    .map(record => {
      const start = getSleepRecordStartInfo(record)
      const end = getSleepRecordEndInfo(record)
      const durationMin = sleepMinutesForReadiness(record)
      let startNormalized = start.normalized
      let endNormalized = end.normalized
      let startMs = start.ms
      let endMs = end.ms
      // Synthesize timestamps for manual entries that have date + duration
      // but no explicit start/end times. Anchor wake-up to 07:00 on the
      // record date and back-compute start from duration.
      if ((!Number.isFinite(startMs) || !Number.isFinite(endMs)) && durationMin > 0) {
        const dateIso = getSleepRecordDate(record)
        if (dateIso) {
          const wakeMs = new Date(`${dateIso}T07:00:00`).getTime()
          if (Number.isFinite(wakeMs)) {
            endMs = wakeMs
            startMs = wakeMs - durationMin * 60000
            endNormalized = new Date(endMs).toISOString()
            startNormalized = new Date(startMs).toISOString()
          }
        }
      }
      return {
        record,
        startNormalized,
        endNormalized,
        startMs,
        endMs,
        durationMin,
      }
    })
    .filter(row => Number.isFinite(row.startMs) && Number.isFinite(row.endMs) && row.endMs > row.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  const episodes = []

  normalized.forEach(row => {
    const previous = episodes[episodes.length - 1]
    const canMerge =
      previous &&
      row.startMs <= previous.endMs + gapMs

    if (!canMerge) {
      episodes.push({
        startMs: row.startMs,
        endMs: row.endMs,
        start_time: row.startNormalized,
        end_time: row.endNormalized,
        duration_min: row.durationMin,
        records: [row.record],
      })
      return
    }

    previous.endMs = Math.max(previous.endMs, row.endMs)
    previous.end_time = row.endNormalized
    previous.duration_min += row.durationMin
    previous.records.push(row.record)
  })

  return episodes.map((episode, index) => {
    const nightKey = String(episode.start_time || "").slice(0, 10)
    const avgQuality =
      episode.records
        .map(record => Number(record?.sleep_quality))
        .filter(Number.isFinite)
        .reduce((sum, value, _, arr) => sum + value / arr.length, 0)

    return {
      sleep_id: episode.records.length === 1
        ? episode.records[0]?.sleep_id
        : `merged_sleep_${nightKey}_${index}`,
      date: nightKey,
      sleep_date: nightKey,
      start_time: episode.start_time,
      end_time: episode.end_time,
      start_at: episode.start_time,
      end_at: episode.end_time,
      duration_min: episode.duration_min,
      sleep_quality: Number.isFinite(avgQuality) ? avgQuality : null,
      merged_segment_count: episode.records.length,
      merged_segments: episode.records,
      source: episode.records[0]?.source || "SleepCycle",
    }
  })
}

function deduplicateSleepRecords(records) {
  const toMs = v => v ? Date.parse(String(v)) : null
  const deduped = []
  for (const r of records) {
    const rStart = toMs(r.start_at)
    const rEnd = toMs(r.end_at)
    const isDupe = deduped.some(e => {
      if (r.sleep_id && e.sleep_id && r.sleep_id === e.sleep_id) return true
      const eStart = toMs(e.start_at)
      const eEnd = toMs(e.end_at)
      if (rStart && eStart) {
        if (Math.abs(rStart - eStart) <= 5 * 60000) return true
      }
      if (rStart && rEnd && eStart && eEnd) {
        if (Math.min(rEnd, eEnd) > Math.max(rStart, eStart)) return true
      }
      return e.date === r.date &&
        Math.abs((Number(e.duration_min) || 0) - (Number(r.duration_min) || 0)) <= 5
    })
    if (!isDupe) deduped.push(r)
  }
  return deduped
}

function getRecentSleepRecords(records, limit = 7) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600000
  return mergeAdjacentSleepSegments(records)
    .filter(record => {
      const sleepDate = getSleepRecordDate(record)
      if (!sleepDate) return false
      const ts = new Date(sleepDate).getTime()
      return Number.isFinite(ts) && ts >= sevenDaysAgo
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, limit)
}

function buildSleepOverviewModel(records, targetHours = 7.5) {
  const mergedEpisodes = mergeAdjacentSleepSegments(records, 90)
    .slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))

  const mostRecentEpisode = mergedEpisodes.length ? mergedEpisodes[mergedEpisodes.length - 1] : null
  const anchorDate = (() => {
    if (mostRecentEpisode?.date) {
      const date = new Date(`${mostRecentEpisode.date}T12:00:00`)
      if (!Number.isNaN(date.getTime())) return date
    }
    const fallback = new Date()
    fallback.setHours(12, 0, 0, 0)
    fallback.setDate(fallback.getDate() - 1)
    return fallback
  })()

  const byNightKey = new Map(mergedEpisodes.map(episode => [episode.date, episode]))

  const nights = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchorDate)
    date.setDate(date.getDate() - (6 - index))
    const iso = date.toISOString().slice(0, 10)
    const episode = byNightKey.get(iso) || null
    const hours = episode ? sleepMinutesForReadiness(episode) / 60 : null
    const status = hours == null ? "missing" : hours >= targetHours ? "good" : hours >= 6 ? "fair" : "poor"
    return {
      iso,
      dayLabel: date.toLocaleDateString(undefined, { weekday: "short" }),
      episode,
      hours,
      status,
      bg: status === "good"
        ? "rgba(74, 222, 128, 0.22)"
        : status === "fair"
          ? "rgba(251, 191, 36, 0.22)"
          : status === "poor"
            ? "rgba(239, 68, 68, 0.22)"
            : "rgba(71, 85, 105, 0.18)",
      border: status === "good"
        ? "rgba(74, 222, 128, 0.45)"
        : status === "fair"
          ? "rgba(251, 191, 36, 0.45)"
          : status === "poor"
            ? "rgba(239, 68, 68, 0.45)"
            : "rgba(100, 116, 139, 0.32)",
      color: status === "missing"
        ? "#64748b"
        : status === "good"
          ? "#4ade80"
          : status === "fair"
            ? "#fbbf24"
            : "#ef4444"
    }
  })

  const populatedNights = nights.filter(night => night.episode)
  const avgHours = populatedNights.length
    ? populatedNights.reduce((sum, night) => sum + (night.hours || 0), 0) / populatedNights.length
    : null
  const lastNight = mostRecentEpisode
  const lastHours = lastNight ? sleepMinutesForReadiness(lastNight) / 60 : null
  const nightsAtTarget = populatedNights.filter(night => (night.hours || 0) >= targetHours).length
  const readinessImpact = avgHours == null ? 0 : avgHours < 5.5 ? -20 : avgHours < 6 ? -10 : 0

  return {
    targetHours,
    mergedEpisodes,
    mostRecentEpisode,
    nights,
    nightsLogged: populatedNights.length,
    avgHours,
    lastNight,
    lastHours,
    nightsAtTarget,
    readinessImpact
  }
}

function computeOcPredictedScore(item) {
  const hoursElapsed = (Date.now() - new Date(item.startDate).getTime()) / 3600000
  const halfLife = resolveOcHalfLifeHours(item)
  return Math.max(0, (item.initialScore || item.currentScore) * Math.pow(0.5, hoursElapsed / halfLife))
}

function computeOcRecoveryDate(item) {
  const score = item.initialScore || item.currentScore
  if (!score) return null
  const hoursToResolve = resolveOcHalfLifeHours(item) * Math.log2(score / 0.25)
  if (!Number.isFinite(hoursToResolve) || hoursToResolve <= 0) return null
  const recoveryMs = new Date(item.startDate).getTime() + hoursToResolve * 3600000
  const d = new Date(recoveryMs)
  return d < new Date() ? "Soon" : d.toISOString().slice(0, 10)
}

// ─── TabOperationalCapacity ────────────────────────────────────────────────────
function TabOperationalCapacity({ ocItems, setOcItems, session, operationalCapacityData, healthFitDaily, sleepRecords, tsbFallback = null, runSessions = [], canonicalSessions = [] }) {
  const [selectedId, setSelectedId] = useState(null)
  const [addForm, setAddForm] = useState({
    key: "muscleStatus",
    location: "Quad L",
    currentScore: 1,
    halfLifeHours: null,
    note: "",
    isHistorical: false,
    historicalStartDate: "",
    historicalResolvedDate: "",
  })
  const [mtpCheckFormOpen, setMtpCheckFormOpen] = useState(false)
  const [mtpCheckForm, setMtpCheckForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    score: 0,
    note: "",
  })
  const [editingHistoryId, setEditingHistoryId] = useState(null)
  const [historyEditForm, setHistoryEditForm] = useState({
    startDate: "",
    endDate: "",
    peakScore: 1,
    note: "",
  })
  const [capacityInfoOpen, setCapacityInfoOpen] = useState({ tendonPain: false })
  const MTP_LOCATION = "Toe L"
  const MTP_KEY = "jointStatus"

  const selectedItem = ocItems.find(i => i.id === selectedId) || null
  const rd = computeReadinessDetail(ocItems, sleepRecords, healthFitDaily, tsbFallback)
  const readiness = rd.score
  const readinessColor = readiness >= 80 ? "#4ade80" : readiness >= 60 ? "#fbbf24" : readiness >= 40 ? "#f97316" : "#ef4444"
  const active = rd.active
  const mapItems = useMemo(() => {
    const renderableItems = ocItems.filter(i =>
      Number(i.currentScore) > 0 ||
      (i.chronicity === "chronic" && Number(i.currentScore) === 0)
    )
    const sorted = [...renderableItems].sort((a, b) => {
      const aDate = String(a.lastResolvedDate || a.startDate || "")
      const bDate = String(b.lastResolvedDate || b.startDate || "")
      return bDate.localeCompare(aDate)
    })
    const seen = new Set()
    return sorted.filter(item => {
      const key = `${item.key}__${item.location}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [ocItems])
  const maxReg = active.filter(i => OC_KEY_META[i.key]?.scope === "regional").reduce((m, i) => Math.max(m, i.currentScore), 0)
  const maxGlb = active.filter(i => OC_KEY_META[i.key]?.scope === "global").reduce((m, i) => Math.max(m, i.currentScore), 0)
  const getCanonicalLoadForDate = dateValue => {
    const targetDate = String(dateValue || "").slice(0, 10)
    if (!targetDate) return null
    const total = (Array.isArray(canonicalSessions) ? canonicalSessions : []).reduce((sum, session) => {
      const sessionDate = String(session?.start_date || "").slice(0, 10)
      if (sessionDate !== targetDate) return sum
      return sum + Number(session?.trimp || session?.duration_min || 0)
    }, 0)
    return total > 0 ? Number(total.toFixed(2)) : null
  }

  const saveOcItems = async items => {
    await store.set("oc-items", items)
    if (supabase && session?.user?.id) {
      await supabase.from("user_kv").upsert(
        { user_id: session.user.id, key: "oc-items", value: items, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      )
    }
  }

  const tendonControlItem = [...ocItems]
    .filter(item => item.key === "tendonStatus")
    .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")))[0] || null

  const tendonPainTenPoint = Number(
    tendonControlItem?.painScore10 ??
    (Number.isFinite(Number(tendonControlItem?.currentScore))
      ? Number(tendonControlItem.currentScore) * 2
      : 0)
  )

  const updateTendonPain = nextPainValue => {
    const nextPainScore = Math.max(0, Math.min(10, Number(nextPainValue || 0)))
    const nextOcScore = Math.round(nextPainScore / 2)
    const nowIso = new Date().toISOString()

    if (tendonControlItem) {
      const updated = ocItems.map(item => {
        if (item.id !== tendonControlItem.id) return item

        return {
          ...item,
          location: item.location || "Tendon System",
          label: item.label || "Tendon — Tendon System",
          currentScore: nextOcScore,
          initialScore: nextOcScore > Number(item.initialScore || 0)
            ? nextOcScore
            : Number(item.initialScore || nextOcScore),
          startDate: nextOcScore > 0 && Number(item.currentScore || 0) === 0 ? nowIso : item.startDate,
          lastResolvedDate: nextOcScore === 0 ? nowIso : item.lastResolvedDate,
          painScore10: nextPainScore
        }
      })
      setOcItems(updated)
      saveOcItems(updated)
      return
    }

    if (nextOcScore <= 0) return

    const item = {
      id: Date.now(),
      key: "tendonStatus",
      location: "Tendon System",
      label: "Tendon — Tendon System",
      currentScore: nextOcScore,
      initialScore: nextOcScore,
      startDate: nowIso,
      halfLifeHours: OC_KEY_META.tendonStatus.halfLifeHours,
      episodeCount: 0,
      lastResolvedDate: null,
      chronicity: "acute",
      painScore10: nextPainScore
    }

    const updated = [item, ...ocItems]
    setOcItems(updated)
    saveOcItems(updated)
  }

  const addItem = () => {
    if (!addForm.currentScore) return
    const meta = OC_KEY_META[addForm.key] || OC_KEY_META.muscleStatus

    const isHistorical = addForm.isHistorical && addForm.historicalStartDate

    const startDate = isHistorical
      ? new Date(addForm.historicalStartDate).toISOString()
      : new Date().toISOString()

    const resolvedDate = addForm.isHistorical && addForm.historicalResolvedDate
      ? new Date(addForm.historicalResolvedDate).toISOString()
      : null

    const currentScore = isHistorical && resolvedDate ? 0 : Number(addForm.currentScore)

    // Compute chronicity: check existing items for same key+location to
    // determine prior episode count and last resolution interval.
    const sameRegionItems = ocItems.filter(
      i => i.key === addForm.key && i.location === addForm.location
    )
    const priorEpisodeCount = sameRegionItems.reduce(
      (sum, i) => sum + (i.episodeCount || 0) + (Number(i.initialScore || 0) > 0 ? 1 : 0), 0
    )
    const newEpisodeCount = priorEpisodeCount + (Number(addForm.currentScore) > 0 ? 1 : 0)

    const mostRecentResolved = sameRegionItems
      .map(i => i.lastResolvedDate)
      .filter(Boolean)
      .sort()
      .pop()
    const daysSinceLast = mostRecentResolved
      ? (new Date(startDate).getTime() - new Date(mostRecentResolved).getTime()) / 86400000
      : null

    const chronicity =
      newEpisodeCount >= 3 || (daysSinceLast != null && daysSinceLast < 90)
        ? "chronic"
        : "acute"

    const item = {
      id: Date.now(),
      key: addForm.key,
      location: addForm.location,
      label: `${meta.label} — ${addForm.location}`,
      currentScore,
      initialScore: Number(addForm.currentScore),
      startDate,
      halfLifeHours: Number(addForm.halfLifeHours) || meta.halfLifeHours,
      episodeCount: isHistorical && resolvedDate ? 1 : 0,
      lastResolvedDate: resolvedDate,
      chronicity,
      note: addForm.note || "",
      history: isHistorical ? [{
        date: addForm.historicalStartDate,
        score: Number(addForm.currentScore),
        context: "historical episode",
        trimp: null,
        note: addForm.note || ""
      }] : [],
      ...(isHistorical ? { eventType: "historical_entry" } : {}),
    }

    const updated = chronicity === "chronic"
      ? [item, ...ocItems.map(existing =>
          existing.key === addForm.key && existing.location === addForm.location
            ? { ...existing, chronicity: "chronic" }
            : existing
        )]
      : [item, ...ocItems]
    setOcItems(updated)
    saveOcItems(updated)

    // Reset form, preserving key/location for rapid multi-episode entry.
    setAddForm(f => ({
      ...f,
      currentScore: 1,
      halfLifeHours: null,
      note: "",
      isHistorical: false,
      historicalStartDate: "",
      historicalResolvedDate: "",
    }))
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

  const openMtpCheckForm = () => {
    setMtpCheckForm({
      date: new Date().toISOString().slice(0, 10),
      score: 0,
      note: "",
    })
    setMtpCheckFormOpen(true)
  }

  const submitMtpCheck = () => {
    const selectedDate = String(mtpCheckForm.date || "").slice(0, 10)
    if (!selectedDate) return

    const historyEntry = {
      date: selectedDate,
      score: Number(mtpCheckForm.score || 0),
      context: "zero-pain check",
      trimp: getCanonicalLoadForDate(selectedDate),
      note: mtpCheckForm.note || ""
    }

    const matchingItem = [...ocItems]
      .filter(item => item.key === MTP_KEY && String(item.location || "").includes(MTP_LOCATION))
      .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")))[0] || null

    if (matchingItem) {
      const updated = ocItems.map(item => {
        if (item.id !== matchingItem.id) return item
        return {
          ...item,
          currentScore: Number(mtpCheckForm.score || 0),
          initialScore: Math.max(Number(item.initialScore || 0), Number(mtpCheckForm.score || 0)),
          lastCheckedDate: selectedDate,
          history: [...(Array.isArray(item.history) ? item.history : []), historyEntry]
        }
      })
      setOcItems(updated)
      saveOcItems(updated)
      setMtpCheckFormOpen(false)
      return
    }

    const score = Number(mtpCheckForm.score || 0)
    const item = {
      id: Date.now(),
      key: MTP_KEY,
      location: MTP_LOCATION,
      label: `${OC_KEY_META[MTP_KEY]?.label || "Joint"} — ${MTP_LOCATION}`,
      currentScore: score,
      initialScore: score,
      startDate: new Date(`${selectedDate}T12:00:00`).toISOString(),
      halfLifeHours: OC_KEY_META[MTP_KEY]?.halfLifeHours || 120,
      episodeCount: 0,
      lastResolvedDate: score === 0 ? new Date(`${selectedDate}T12:00:00`).toISOString() : null,
      lastCheckedDate: selectedDate,
      chronicity: "acute",
      history: [historyEntry],
      note: mtpCheckForm.note || "",
      eventType: "explicit_zero_check"
    }
    const updated = [item, ...ocItems]
    setOcItems(updated)
    saveOcItems(updated)
    setMtpCheckFormOpen(false)
  }

  const startHistoryEdit = item => {
    setEditingHistoryId(item.id)
    setHistoryEditForm({
      startDate: item.startDate ? String(item.startDate).slice(0, 10) : "",
      endDate: item.lastResolvedDate ? String(item.lastResolvedDate).slice(0, 10) : "",
      peakScore: Number(item.initialScore || 1),
      note: item.note || ""
    })
  }

  const saveHistoryEdit = itemId => {
    const updated = ocItems.map(item => {
      if (item.id !== itemId) return item
      const startDate = historyEditForm.startDate ? new Date(`${historyEditForm.startDate}T12:00:00`).toISOString() : item.startDate
      const lastResolvedDate = historyEditForm.endDate ? new Date(`${historyEditForm.endDate}T12:00:00`).toISOString() : null
      return {
        ...item,
        startDate,
        lastResolvedDate,
        currentScore: lastResolvedDate ? 0 : item.currentScore,
        initialScore: Number(historyEditForm.peakScore || item.initialScore || 1),
        note: historyEditForm.note || ""
      }
    })
    setOcItems(updated)
    saveOcItems(updated)
    setEditingHistoryId(null)
  }

  const infoButton = key => (
    <button
      type="button"
      onClick={() => setCapacityInfoOpen(prev => ({ ...prev, [key]: !prev[key] }))}
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        border: "1px solid #2a2d45",
        background: capacityInfoOpen[key] ? "#252640" : "#0d0e1c",
        color: "#cbd5e1",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        flex: "0 0 auto"
      }}
    >
      {capacityInfoOpen[key] ? "×" : "i"}
    </button>
  )

  const renderSilhouette = side => {
    const ck = side === "front" ? "f" : "b"
    const handleBodyMapClick = (x, y) => {
      const candidates = OC_BODY_REGIONS
        .map(location => {
          const coords = OC_REGION_COORDS[location]?.[ck]
          if (!coords) return null
          const dx = coords[0] - x * 100
          const dy = coords[1] - y * 100
          return { location, distance: Math.hypot(dx, dy) }
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)

      const nearest = candidates[0]
      if (!nearest) {
        return
      }
      setAddForm(prev => ({ ...prev, location: nearest.location }))
      setSelectedId(null)
    }
    return (
      <div style={{ position: "relative" }}>
        <BodySilhouetteImg
          side={side}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = (e.clientX - rect.left) / rect.width
            const y = (e.clientY - rect.top) / rect.height
            handleBodyMapClick(x, y)
          }}
        />
        {mapItems.map(item => {
          const coords = OC_REGION_COORDS[item.location]?.[ck]
          if (!coords) return null
          const meta = OC_KEY_META[item.key] || OC_KEY_META.muscleStatus
          const isChronic = item.chronicity === "chronic" && Number(item.currentScore) === 0
          const sz = isChronic ? 10 : 8 + item.currentScore * 4
          return (
            <div
              key={item.id}
              onClick={e => {
                e.stopPropagation()
                setSelectedId(selectedId === item.id ? null : item.id)
              }}
              title={`${item.location} — ${SCORE_LABELS[item.currentScore]}`}
              style={{
                position: "absolute", left: `${coords[0]}%`, top: `${coords[1]}%`,
                width: sz, height: sz, borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                background: isChronic ? "transparent" : meta.color,
                border: isChronic ? `2px dashed ${meta.color}` : "none",
                opacity: isChronic ? 0.5 : 1,
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

      <div style={{ ...cardStyle(), marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700" }}>Tendon Pain</div>
            {!capacityInfoOpen.tendonPain && (
              <div style={{ fontSize: "11px", color: "#667", marginTop: "2px" }}>
                OC-backed tendon control for readiness and progression gating.
              </div>
            )}
          </div>
          {infoButton("tendonPain")}
        </div>
        {capacityInfoOpen.tendonPain ? (
          <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#cbd5e1" }}>
            This slider updates the tendon operational-capacity state directly. It feeds the tendon gate used by Readiness and Schedule recommendations, and a zero value clears the active tendon burden without showing extra UI by default.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", fontSize: "12px" }}>
              <span style={{ color: "#ced2f0" }}>Current tendon pain</span>
              <span style={{ fontWeight: "700", color: "#f59e0b" }}>{tendonPainTenPoint}/10</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={tendonPainTenPoint}
              onChange={e => updateTendonPain(e.target.value)}
              style={{ width: "100%", accentColor: "#f59e0b" }}
            />
            <div style={{ fontSize: "11px", color: "#667" }}>
              Tendon gate: {rd.active.filter(item => item.key === "tendonStatus").length ? `${Math.max(...rd.active.filter(item => item.key === "tendonStatus").map(item => Number(item.currentScore || 0)))}/5 OC` : "clear"}
            </div>
          </div>
        )}
      </div>

      {/* ── MTP Progression Counter ───────────────────────────────── */}
      {(() => {
        const mtpHistory = [...ocItems]
          .filter(i =>
            (i.location || "").toLowerCase().includes("toe") &&
            i.key === MTP_KEY
          )
          .sort((a, b) => {
            const aDate = String(a.lastResolvedDate || a.startDate || "")
            const bDate = String(b.lastResolvedDate || b.startDate || "")
            return bDate.localeCompare(aDate)
          })
        const mtpItem = mtpHistory[0] || null
        const mtpObservations = mtpHistory
          .flatMap(item => (Array.isArray(item.history) ? item.history : []).map(entry => ({
            ...entry,
            _itemId: item.id
          })))
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        const sortedRuns = [...runSessions]
          .filter(w => w.date)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, 20)

        if (!mtpItem && sortedRuns.length === 0) return null

        const currentScore = mtpItem?.currentScore ?? 0
        const isActive = currentScore > 0
        const chronicity = mtpItem?.chronicity || "acute"
        const lastActiveDate =
          mtpObservations.find(entry => Number(entry.score || 0) > 0)?.date ||
          mtpHistory.find(item => Number(item.currentScore || 0) > 0)?.startDate ||
          null
        const zeroChecks = mtpObservations.filter(entry => {
          if (Number(entry.score || 0) !== 0) return false
          const eventDate = String(entry.date || "")
          return !lastActiveDate || eventDate > String(lastActiveDate)
        })

        let streak = 0
        let recentMax = 0
        if (!isActive) streak = zeroChecks.length
        if (sortedRuns.length > 0) {
          recentMax = Math.max(...sortedRuns.map(run => Number(run.distance || 0) || 0), 0)
        }
        if (isActive && sortedRuns.length > 0) {
          recentMax = sortedRuns[0].distance || 0
        }

        const PROGRESSION_THRESHOLD = 3
        const progressPct = Math.min(100, Math.round((streak / PROGRESSION_THRESHOLD) * 100))
        const currentCeilingMiles = MTP_CURRENT_CEILING
        const nextDistanceMilestone = MTP_NEXT_MILESTONE.toFixed(1)
        const nextDistanceText = `${nextDistanceMilestone} mi`
        const remainingScoreZeroSessions = Math.max(0, PROGRESSION_THRESHOLD - streak)
        const latestZeroCheckDate = zeroChecks[0]?.date || null
        // MTP history to log once observation logging is implemented:
        // 2026-05-03 (approx): 4.0 miles, score 1 from mi 3.2–3.6, resolved before mi 4.0
        // 2026-05-10: Rivian 5K (3.1 miles), score 0 throughout — race context
        // Next planned: 2026-05-13 easy 2 miles, 2026-05-15 or 2026-05-16 first 4.4-mile attempt
        const nextMilestoneDate = (() => {
          if (streak >= PROGRESSION_THRESHOLD) return "Cleared"
          const projected = new Date()
          projected.setHours(12, 0, 0, 0)
          projected.setDate(projected.getDate() + remainingScoreZeroSessions * 7)
          return fmtShortDate(projected.toISOString().slice(0, 10))
        })()
        const barColor = isActive ? "#ef4444" : streak >= PROGRESSION_THRESHOLD ? "#4ade80" : "#fbbf24"

        return (
          <div style={{ ...cardStyle(), marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "2px" }}>
                  MTP Joint Progression
                  {chronicity === "chronic" && <span style={{ marginLeft: "8px", color: "#f59e0b", fontSize: "9px" }}>CHRONIC</span>}
                </div>
                <div style={{ fontSize: "12px", color: "#667" }}>
                  Left MTP · jointStatus · 120h half-life
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {isActive ? (
                  <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: "600" }}>
                    Score {currentScore}/5 — progression paused
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#4ade80", fontWeight: "600" }}>
                    Score 0 — progression tracking
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px", marginBottom: "12px" }}>
              <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Score-0 checks</div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: barColor, lineHeight: 1 }}>{streak}</div>
                <div style={{ fontSize: "10px", color: "#555" }}>of {PROGRESSION_THRESHOLD} needed</div>
              </div>
              <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Current ceiling</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#ced2f0", lineHeight: 1 }}>
                  {currentCeilingMiles.toFixed(1)}
                </div>
                <div style={{ fontSize: "10px", color: "#555" }}>mi</div>
              </div>
              <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Next milestone</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: streak >= PROGRESSION_THRESHOLD ? "#4ade80" : "#667", lineHeight: 1 }}>
                  {nextMilestoneDate || "—"}
                </div>
                <div style={{ fontSize: "10px", color: "#555" }}>target date</div>
              </div>
              <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Latest zero check</div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#ced2f0", lineHeight: 1.3 }}>
                  {latestZeroCheckDate ? fmtShortDate(String(latestZeroCheckDate).slice(0, 10)) : "—"}
                </div>
                <div style={{ fontSize: "10px", color: "#555" }}>
                  {latestZeroCheckDate ? "explicit no-issue event" : "no explicit zero check yet"}
                </div>
              </div>
            </div>

            <div style={{ height: "6px", background: "#1a1b2e", borderRadius: "3px", overflow: "hidden", marginBottom: "6px" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: barColor, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#445" }}>
              {isActive
                ? `Resolve MTP to score 0 before resuming progression. ${sortedRuns.length > 0 ? `Last run: ${fmtShortDate(sortedRuns[0]?.date)}.` : ""}`
                : streak >= PROGRESSION_THRESHOLD
                  ? `Threshold met. Advance from ${currentCeilingMiles.toFixed(1)} mi to ${nextDistanceText} on next run.`
                  : streak > 0
                    ? `${remainingScoreZeroSessions} more explicit score-0 check${remainingScoreZeroSessions === 1 ? "" : "s"} required before advancing to ${nextDistanceText}. Expected by ${nextMilestoneDate}.`
                    : "No explicit score-0 checks logged yet. Missing data does not advance progression."
              }
            </div>
            <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={openMtpCheckForm} style={buttonStyle(true)}>Log zero-pain check</button>
            </div>
            {mtpCheckFormOpen && (
              <div style={{ marginTop: "10px", padding: "10px", background: "#0a0b14", borderRadius: "6px", border: "1px solid #1a1b2e", display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#555" }}>MTP check-in</div>
                <div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Date</div>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={mtpCheckForm.date}
                    onChange={e => setMtpCheckForm(prev => ({ ...prev, date: e.target.value }))}
                    style={{ ...inputStyle(), padding: "6px 10px" }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    Score: {mtpCheckForm.score}/3
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={1}
                    value={mtpCheckForm.score}
                    onChange={e => setMtpCheckForm(prev => ({ ...prev, score: Number(e.target.value) }))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>
                    {OC_SEVERITY_LABELS[Number(mtpCheckForm.score)]}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Note</div>
                  <input
                    type="text"
                    value={mtpCheckForm.note}
                    onChange={e => setMtpCheckForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="e.g. 4 mile run, score rose to 1 then cleared"
                    style={{ ...inputStyle(), padding: "6px 10px" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={submitMtpCheck} style={buttonStyle(true)}>Log check-in</button>
                  <button onClick={() => setMtpCheckFormOpen(false)} style={buttonStyle(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

     {/* ── Two-column: left controls / right silhouettes ─────────── */}
      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 700 ? "1fr" : "1fr 380px", gap: "20px", marginBottom: "16px", alignItems: "start" }}>

        {/* LEFT: Add Issue + Active Issues stacked */}
        <div style={{ display: "grid", gap: "16px" }}>
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
                <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>
                  {OC_SEVERITY_LABELS[Number(addForm.currentScore)]}
                </div>
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
              <div style={{ marginTop: "4px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#666", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={addForm.isHistorical}
                    onChange={e => setAddForm(f => ({ ...f, isHistorical: e.target.checked }))}
                  />
                  Historical episode (past dates)
                </label>
              </div>
              {addForm.isHistorical && (
                <div style={{ display: "grid", gap: "6px", padding: "8px", background: "#0a0b14", borderRadius: "4px", border: "1px solid #1a1b2e" }}>
                  <div style={{ fontSize: "10px", color: "#555", letterSpacing: "0.1em" }}>EPISODE DATES</div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Start date</div>
                    <input
                      type="date"
                      value={addForm.historicalStartDate}
                      max={addForm.historicalResolvedDate || new Date().toISOString().slice(0, 10)}
                      onChange={e => setAddForm(f => ({ ...f, historicalStartDate: e.target.value }))}
                      style={{ ...inputStyle(), padding: "6px 10px" }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>End date (optional)</div>
                    <input
                      type="date"
                      value={addForm.historicalResolvedDate}
                      min={addForm.historicalStartDate || undefined}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={e => setAddForm(f => ({ ...f, historicalResolvedDate: e.target.value }))}
                      style={{ ...inputStyle(), padding: "6px 10px" }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Peak score</div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      value={addForm.currentScore}
                      onChange={e => setAddForm(f => ({ ...f, currentScore: Number(e.target.value) }))}
                      style={{ width: "100%" }}
                    />
                    <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>
                      {OC_SEVERITY_LABELS[Number(addForm.currentScore)]}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Note</div>
                    <input
                      type="text"
                      value={addForm.note}
                      onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="Episode note"
                      style={{ ...inputStyle(), padding: "6px 10px" }}
                    />
                  </div>
                  <div style={{ fontSize: "10px", color: "#444", lineHeight: "1.4" }}>
                    Severity above = peak score at onset. Add an end date to mark the episode resolved.
                  </div>
                </div>
              )}
              {!addForm.isHistorical && (
                <div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Note</div>
                  <input
                    type="text"
                    value={addForm.note}
                    onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Optional note"
                    style={{ ...inputStyle(), padding: "6px 10px" }}
                  />
                </div>
              )}
              <button onClick={addItem} style={{ ...buttonStyle(true), fontSize: "12px" }}>
                {addForm.isHistorical ? "+ Add Historical Episode" : "+ Add Issue"}
              </button>
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
            {ocItems.filter(i => Number(i.currentScore) === 0 && (i.episodeCount > 0 || Number(i.initialScore) > 0)).length > 0 && (
              <div style={{ marginTop: "12px", borderTop: "1px solid #1a1b2e", paddingTop: "10px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#444", marginBottom: "6px" }}>
                  Episode History
                </div>
                {ocItems
                  .filter(i => Number(i.currentScore) === 0 && (i.episodeCount > 0 || Number(i.initialScore) > 0))
                  .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))
                  .map(item => {
                    const meta = OC_KEY_META[item.key] || OC_KEY_META.muscleStatus
                    const startStr = item.startDate ? String(item.startDate).slice(0, 10) : "—"
                    const resolvedStr = item.lastResolvedDate ? String(item.lastResolvedDate).slice(0, 10) : "—"
                    const isEditing = editingHistoryId === item.id
                    const durationDays = item.startDate && item.lastResolvedDate
                      ? Math.round((new Date(item.lastResolvedDate) - new Date(item.startDate)) / 86400000)
                      : null
                    return (
                      <div key={item.id} style={{
                        padding: "6px 8px", marginBottom: "4px", borderRadius: "4px",
                        border: `1px solid ${item.chronicity === "chronic" ? "rgba(239,68,68,0.2)" : "#1a1b2e"}`,
                        background: item.chronicity === "chronic" ? "rgba(239,68,68,0.04)" : "transparent",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", color: meta.color }}>{item.location}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "10px", color: item.chronicity === "chronic" ? "#ef4444" : "#555" }}>
                              {item.chronicity === "chronic" ? "chronic" : "resolved"}
                            </span>
                            <span style={{ fontSize: "11px", color: "#555" }}>peak {item.initialScore}/5</span>
                            <button
                              onClick={() => isEditing ? setEditingHistoryId(null) : startHistoryEdit(item)}
                              style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: "12px", padding: 0 }}
                              title="Edit episode"
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: "10px", color: "#444", marginTop: "2px" }}>
                          {startStr} → {resolvedStr}
                          {durationDays != null ? ` (${durationDays}d)` : ""}
                        </div>
                        {item.note && !isEditing && (
                          <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>{item.note}</div>
                        )}
                        {isEditing && (
                          <div style={{ display: "grid", gap: "6px", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #1a1b2e" }}>
                            <input
                              type="date"
                              value={historyEditForm.startDate}
                              onChange={e => setHistoryEditForm(prev => ({ ...prev, startDate: e.target.value }))}
                              style={{ ...inputStyle(), padding: "6px 10px" }}
                            />
                            <input
                              type="date"
                              value={historyEditForm.endDate}
                              min={historyEditForm.startDate || undefined}
                              onChange={e => setHistoryEditForm(prev => ({ ...prev, endDate: e.target.value }))}
                              style={{ ...inputStyle(), padding: "6px 10px" }}
                            />
                            <div>
                              <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Peak score: {historyEditForm.peakScore}/5</div>
                              <input
                                type="range"
                                min={0}
                                max={5}
                                step={1}
                                value={historyEditForm.peakScore}
                                onChange={e => setHistoryEditForm(prev => ({ ...prev, peakScore: Number(e.target.value) }))}
                                style={{ width: "100%" }}
                              />
                              <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>
                                {OC_SEVERITY_LABELS[Number(historyEditForm.peakScore)]}
                              </div>
                            </div>
                            <input
                              type="text"
                              value={historyEditForm.note}
                              onChange={e => setHistoryEditForm(prev => ({ ...prev, note: e.target.value }))}
                              placeholder="Episode note"
                              style={{ ...inputStyle(), padding: "6px 10px" }}
                            />
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button onClick={() => saveHistoryEdit(item.id)} style={buttonStyle(true)}>Save</button>
                              <button onClick={() => setEditingHistoryId(null)} style={buttonStyle(false)}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Body map silhouettes */}
        <div style={cardStyle()}>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "10px" }}>
            Body Map — tap a region to log
          </div>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", alignItems: "flex-start" }}>
            {["front", "back"].map(side => (
              <div key={side} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>{renderSilhouette(side)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "9px", color: "#444", textAlign: "center", marginTop: "8px" }}>
            ● acute &nbsp; ○ chronic
          </div>
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
          <div style={{ display: "grid", gap: "4px", fontSize: "11px", color: "#667", marginBottom: "12px" }}>
            <span>Location: {selectedItem.location}</span>
            {Number(selectedItem.currentScore || 0) === 0 && (
              <span>Resolved — last active {fmtShortDate(String(selectedItem.lastResolvedDate || selectedItem.startDate || "").slice(0, 10))}</span>
            )}
            <span>Episode count: {selectedItem.episodeCount || 0}</span>
            <span>Peak score: {Math.max(Number(selectedItem.initialScore || 0), Number(selectedItem.currentScore || 0))}/5</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                Score: {selectedItem.currentScore}/5 — {SCORE_LABELS[selectedItem.currentScore]}
              </div>
              <input type="range" min={0} max={5} step={1} value={selectedItem.currentScore}
                onChange={e => updateItem(selectedItem.id, { currentScore: Number(e.target.value) })}
                style={{ width: "100%" }} />
              <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>
                {OC_SEVERITY_LABELS[Number(selectedItem.currentScore)]}
              </div>
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

      {/* ── Operational Capacity current projection chart ─────────── */}
      <div style={{ ...cardStyle(), minWidth: "0" }}>
        <div style={{ fontSize: "12px", fontWeight: "700", marginBottom: "12px" }}>Operational Capacity — History & Projection</div>
        <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>
          History (left of today) + 60-day projection (right of today). Acute = tendon,
          muscle, joint. Disease = illness. Fatigue = sleep debt. Each item decays at its
          own half-life from its start date; resolved items stop contributing at resolution.
          Hover for per-item breakdown.
        </div>
        {(!operationalCapacityData || operationalCapacityData.length === 0) ? (
          <div style={{ fontSize: "12px", color: "#444", textAlign: "center", padding: "40px 0" }}>
            No OC issues recorded — add issues in the Operational Capacity tab to build history.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={operationalCapacityData}
              margin={{ top: 20, right: 20, left: 55, bottom: 35 }}
            >
              <CartesianGrid stroke="#1a1b2e" />
              <XAxis
                dataKey="label"
                label={{ value: "Date", position: "bottom", offset: 10, fill: "#ced2f0" }}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                domain={[0, 100]}
                label={{
                  value: "Operational capacity (%)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 15,
                  fill: "#ced2f0",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  const labelMap = {
                    operationalPct:  "Operational",
                    acuteLossPct:    "Acute burden (tendon/muscle/joint)",
                    diseaseLossPct:  "Disease burden",
                    fatigueLossPct:  "Fatigue / sleep burden",
                  }
                  return (
                    <div style={{ background: "#0d0f1e", border: "1px solid #222", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                      <div style={{ color: "#888", marginBottom: 4 }}>
                        {label}{d?.isPast ? "" : " (projected)"}
                      </div>
                      {payload.map(p => (
                        <div key={p.dataKey} style={{ color: p.stroke || p.fill, marginBottom: 2 }}>
                          {labelMap[p.dataKey] || p.name}: {Number(p.value).toFixed(1)}%
                        </div>
                      ))}
                      {d?.breakdown?.length > 0 && (
                        <div style={{ marginTop: 6, borderTop: "1px solid #222", paddingTop: 6, color: "#666" }}>
                          {d.breakdown.map((b, i) => (
                            <div key={i}>{b.label}: {b.lossPct}%</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              <Legend verticalAlign="top" height={36} />
              <ReferenceLine
                x={fmtShortDate(new Date().toISOString().slice(0, 10))}
                stroke="#444"
                strokeDasharray="4 3"
                label={{ value: "Today", position: "insideTopRight", fill: "#666", fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="operationalPct"
                stroke="#e5e7eb"
                strokeWidth={3}
                dot={false}
                name="Operational"
                strokeDasharray={undefined}
              />
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

function DailyReadinessPanel({ readinessScore, latestHealthFit, ocItems, computedTSB = null, tsbV2Panel = null }) {
  const tsb = latestHealthFit?.tsb ?? tsbV2Panel?.currentOverallTsb ?? computedTSB?.global?.tsb ?? null
  const hasActiveIssue = (ocItems || []).some(i => i.currentScore >= 3)
  let status, color, bg, rationale
  if (readinessScore < 40 || hasActiveIssue) {
    status = "RED"; color = "#ff5252"; bg = "rgba(255,82,82,0.15)"
    rationale = hasActiveIssue
      ? `OC ${readinessScore} · Active issue score ≥3 · Substitute exercises affecting flagged regions`
      : `OC ${readinessScore} · TSB ${tsb != null ? tsb.toFixed(1) : "—"} · Substitute exercises affecting flagged regions`
  } else if (readinessScore < 60 || (tsb != null && tsb < DEFAULT_TSB_THRESHOLDS.high)) {
    status = "ORANGE"; color = "#ff8c42"; bg = "rgba(255,140,66,0.15)"
    rationale = `OC ${readinessScore} · TSB ${tsb != null ? tsb.toFixed(1) : "—"} · Reduce working weight 10–15%, cap at 2 sets on compounds`
  } else if (readinessScore < 80 || (tsb != null && tsb < DEFAULT_TSB_THRESHOLDS.moderate)) {
    status = "YELLOW"; color = "#ffeb3b"; bg = "rgba(255,235,59,0.15)"
    rationale = `OC ${readinessScore} · TSB ${tsb != null ? tsb.toFixed(1) : "—"} · Execute as written, no additions today`
  } else {
    status = "GREEN"; color = "#4caf50"; bg = "rgba(76,175,80,0.15)"
    rationale = `OC ${readinessScore} · TSB ${tsb != null ? tsb.toFixed(1) : "—"} · Good to go — load up or add a set`
  }
  return (
    <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 12, border: `1px solid ${color}`, background: bg, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, color, fontWeight: 700, marginRight: 8 }}>{status}</span>
        <span style={{ fontSize: 12, color: "#aaa" }}>{rationale}</span>
        {tsb == null && computedTSB != null && (
          <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>· TSB {computedTSB.global.tsb} (computed)</span>
        )}
        {tsb == null && computedTSB == null && (
          <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>· Import HealthFit CSV for TSB data</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "#aaa" }}>OC {readinessScore}</span>
        {tsb != null && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "#aaa" }}>TSB {tsb.toFixed(1)}</span>}
        {latestHealthFit?.ctl != null && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "#aaa" }}>CTL {latestHealthFit.ctl.toFixed(1)}</span>}
      </div>
    </div>
  )
}

function RaceHistoryPanel({ results, raceCalendar }) {
  const [selected, setSelected] = React.useState(results[0]?.id || null)
  const race = results.find(r => r.id === selected)

  if (!results.length) return null

  const overallPct = race ? Math.round((1 - race.overall_place / race.overall_total) * 100) : null
  const agPct = race ? Math.round((1 - race.ag_place / race.ag_total) * 100) : null
  const genderPct = race ? Math.round((1 - race.gender_place / race.gender_total) * 100) : null

  const upcoming = (raceCalendar || [])
    .filter(r => r.date > new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)

  return (
    <div style={{ margin: "16px 0", background: "#0a0c10", border: "1px solid #1a2a1a", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", letterSpacing: "0.08em", marginBottom: 12 }}>
        RACE HISTORY — {results.length} COMPLETED
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {results.map(r => (
          <button key={r.id} onClick={() => setSelected(r.id)}
            style={{
              background: selected === r.id ? "#1a3a1a" : "#111",
              border: `1px solid ${selected === r.id ? "#4ade80" : "#222"}`,
              borderRadius: 6, padding: "5px 12px",
              color: selected === r.id ? "#4ade80" : "#666",
              fontSize: 11, cursor: "pointer", fontWeight: selected === r.id ? 700 : 400,
            }}>
            {r.distance_label} · {r.date.slice(0, 7)}
          </button>
        ))}
      </div>

      {race && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#e0e0e0" }}>{race.name}</div>
              <div style={{ fontSize: 11, color: "#555" }}>{race.date} · {race.location}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", fontFamily: "'IBM Plex Mono', monospace" }}>
                {race.official_time}
              </div>
              <div style={{ fontSize: 10, color: "#444" }}>official chip time</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Overall", place: race.overall_place, total: race.overall_total, pct: overallPct },
              { label: "Male", place: race.gender_place, total: race.gender_total, pct: genderPct },
              { label: race.ag_label, place: race.ag_place, total: race.ag_total, pct: agPct },
            ].map(({ label, place, total, pct }) => (
              <div key={label} style={{ background: "#0f1a0f", borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0" }}>
                  {place}<span style={{ fontSize: 10, color: "#444" }}>/{total}</span>
                </div>
                <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, margin: "6px 0 4px" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "#4ade80", borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: "#4ade80" }}>top {100 - pct}%</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "Avg Pace", value: race.official_pace + "/mi" },
              { label: "Best Pace", value: race.best_pace + "/mi" },
              { label: "Avg HR", value: race.avg_hr + " bpm" },
              { label: "Max HR", value: race.max_hr + " bpm" },
              { label: "Avg Power", value: race.avg_power_w + " W" },
              { label: "Cadence", value: race.avg_cadence_spm + " spm" },
              { label: "GCT", value: race.avg_gct_ms + " ms" },
              { label: "VO₂ Est.", value: race.vo2_estimate },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#0f0f14", borderRadius: 5, padding: "6px 8px" }}>
                <div style={{ fontSize: 9, color: "#444", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 11, color: "#a0a0a0", fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>

          {race.notes && (
            <div style={{ fontSize: 10, color: "#3a4a3a", fontStyle: "italic", borderTop: "1px solid #111", paddingTop: 8 }}>
              {race.notes}
            </div>
          )}
        </>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #1a1a1a", paddingTop: 12 }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.08em", marginBottom: 8 }}>UPCOMING</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {upcoming.map(r => (
              <div key={r.date + r.name} style={{ background: "#0f0f14", border: "1px solid #1a1a2a", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ fontSize: 11, color: "#6666aa" }}>{r.name || r.distance}</div>
                <div style={{ fontSize: 10, color: "#333" }}>{r.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TabSchedule ──────────────────────────────────────────────────────────────

// ── Exercise Guide: Free Exercise DB (Unlicense / public domain) ─────────────
let _exDbCache = null
const EX_DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
const EX_IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"

// Manual overrides: SCH_PLAN exercise id => exact DB id (null = force YouTube fallback)
const EX_DB_OVERRIDE = {
  m3:  null,                     // Machine Flys: not in DB
  m7:  "Triceps_Pushdown",       // better match than fuzzy result
  t4:  null,                     // Lateral Band Walk: not in DB
  t5:  null,                     // Hip Drive Marches: not in DB
  t8:  null,                     // 90/90 Deadbugs: not in DB
  th6: null,                     // Cable D2 Flexion: not in DB
  th9: "Farmers_Walk",           // closest available substitute
  f1:  "Hip_Abductions",         // machine hip abduction
  f6:  "Lying_Leg_Curls",        // machine leg curl, correct variant
  f8:  null,                     // Shoulder Clock w/ Band: not in DB
}

async function loadExDb() {
  if (_exDbCache) return _exDbCache
  try {
    const res = await fetch(EX_DB_URL)
    _exDbCache = await res.json()
  } catch { _exDbCache = [] }
  return _exDbCache
}

function normExName(s) {
  return String(s || "").toLowerCase()
    .replace(/barbell|dumbbell|cable|machine|smith|kettlebell|\bkb\b|\bdb\b/g, "")
    .replace(/[-\u2013\u2014\/\(\)]/g, " ")
    .replace(/\s+/g, " ").trim()
}

function findDbExercise(db, name) {
  const n = normExName(name)
  if (!n || !db.length) return null
  const exact = db.find(e => normExName(e.name) === n)
  if (exact) return exact
  const sub = db.find(e => normExName(e.name).includes(n) || n.includes(normExName(e.name)))
  if (sub) return sub
  const words = n.split(" ").filter(w => w.length > 3)
  if (!words.length) return null
  const scored = db
    .map(e => ({ score: words.filter(w => normExName(e.name).includes(w)).length, e }))
    .sort((a, b) => b.score - a.score)
  return scored[0]?.score >= 2 ? scored[0].e : null
}

function ExerciseGuidePanel({ exId, exName, exNote, dbId = null }) {
  const [guideState, setGuideState] = React.useState({ status: "idle", entry: null })

  React.useEffect(() => {
    setGuideState({ status: "loading", entry: null })

    // Priority 1: explicit DB id from picker — no matching needed
    if (dbId) {
      loadExDb().then(db => {
        const match = db.find(e => e.id === dbId)
        setGuideState({ status: match ? "found" : "youtube", entry: match || null })
      })
      return
    }

    // Priority 2: manual override table (SCH_PLAN exercises)
    if (Object.prototype.hasOwnProperty.call(EX_DB_OVERRIDE, exId)) {
      const overrideId = EX_DB_OVERRIDE[exId]
      if (!overrideId) { setGuideState({ status: "youtube", entry: null }); return }
      loadExDb().then(db => {
        const match = db.find(e => e.id === overrideId)
        setGuideState({ status: match ? "found" : "youtube", entry: match || null })
      })
      return
    }

    // Priority 3: fuzzy name match
    loadExDb().then(db => {
      const match = findDbExercise(db, exName)
      setGuideState({ status: match ? "found" : "youtube", entry: match || null })
    })
  }, [exId, exName, dbId])

  const searchMatch = String(exNote || "").match(/Search:\s*(.+)/)
  const ytQuery = searchMatch ? searchMatch[1].trim() : exName
  const panelStyle = { marginTop: 8, paddingTop: 10, borderTop: "1px solid #1a1b2e" }

  if (guideState.status === "loading" || guideState.status === "idle") return (
    <div style={{ ...panelStyle, color: "#444", fontSize: 11 }}>Loading guide...</div>
  )

  if (guideState.status === "youtube") return (
    <div style={panelStyle}>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>No visual guide available in library for this exercise.</div>
      <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`}
        target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 11, color: "#4a9ee8", textDecoration: "underline" }}>
        Search YouTube: {ytQuery}
      </a>
    </div>
  )

  const e = guideState.entry
  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 10, color: "#4a9ee8", fontWeight: 600, marginBottom: 6 }}>{e.name}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {[0, 1].map(i => (
          <img key={i}
            src={`${EX_IMG_BASE}${e.id}/${i}.jpg`}
            alt={`${e.name} step ${i + 1}`}
            style={{ width: "48%", borderRadius: 5, border: "1px solid #1e1e2e", background: "#111", display: "block" }}
            onError={ev => { ev.currentTarget.style.display = "none" }}
          />
        ))}
      </div>
      {(e.primaryMuscles?.length > 0 || e.secondaryMuscles?.length > 0) && (
        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6 }}>
          {(e.primaryMuscles || []).join(", ")}
          {(e.secondaryMuscles || []).length > 0 ? ` \u00b7 secondary: ${e.secondaryMuscles.join(", ")}` : ""}
        </div>
      )}
      <ol style={{ margin: 0, paddingLeft: 14 }}>
        {(e.instructions || []).map((step, i) => (
          <li key={i} style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, lineHeight: 1.5 }}>{step}</li>
        ))}
      </ol>
    </div>
  )
}

function SubstituteDrawer({ flag, onSelectSubstitute, onClose }) {
  const [selectedId, setSelectedId] = React.useState(null)

  if (!flag || !flag.substituteIds?.length) return null

  const selectedProfile = selectedId ? getExerciseProfile(selectedId) : null
  const flaggedProfile = flag.libraryExerciseId
    ? getExerciseProfile(flag.libraryExerciseId)
    : flag.exerciseId
      ? getExerciseProfile(EXERCISE_LIBRARY.find(e => e.scheduleIds?.includes(flag.exerciseId))?.id)
      : null

  return (
    <div style={{
      background: "#0f1020",
      border: "1px solid #2a1a00",
      borderRadius: 8,
      padding: "12px 14px",
      marginTop: 6
    }}>
      <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>
        Suggested substitutes — avoids {flag.ocLocation}
      </div>

      {flaggedProfile && (
        <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>
          Replacing <span style={{ color: "#d4d4d8" }}>{flaggedProfile.name}</span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {flag.substituteIds.map(id => {
          const profile = getExerciseProfile(id)
          if (!profile) return null
          const isSelected = selectedId === id
          return (
            <button
              key={id}
              onClick={() => setSelectedId(isSelected ? null : id)}
              style={{
                background: isSelected ? "#1a2a10" : "#161616",
                border: `1px solid ${isSelected ? "#4ade80" : "#2a2a2a"}`,
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 11,
                color: isSelected ? "#4ade80" : "#aaa",
                cursor: "pointer"
              }}
            >
              {profile.name}
            </button>
          )
        })}
      </div>

      {selectedProfile && (
        <div style={{ background: "#0a0c18", borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
            Load profile: <span style={{ color: "#e0e0e0" }}>{selectedProfile.name}</span>
            {selectedProfile.mtp_safe && (
              <span style={{ marginLeft: 8, color: "#4ade80", fontSize: 10 }}>✓ MTP safe</span>
            )}
          </div>
          {selectedProfile.loads
            .filter(l => l.score >= 2)
            .map((l, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: "#666",
                  padding: "2px 0",
                  borderBottom: "1px solid #111"
                }}
              >
                <span>{l.region} ({l.tissueType.replace("Status", "")})</span>
                <span style={{ color: l.score === 3 ? "#ef4444" : l.score === 2 ? "#f59e0b" : "#666" }}>
                  {"●".repeat(l.score)}{"○".repeat(3 - l.score)}
                </span>
              </div>
            ))}
          {(() => {
            const conflict = selectedProfile.loads.find(
              l => l.region === flag.ocLocation &&
                l.tissueType === flag.ocKey &&
                l.score >= 2
            )
            return conflict
              ? (
                <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>
                  Still loads {flag.ocLocation} at level {conflict.score} — confirm before using
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "#4ade80", marginTop: 6 }}>
                  ✓ Does not load {flag.ocLocation} above threshold
                </div>
              )
          })()}
          <button
            onClick={() => onSelectSubstitute(selectedProfile)}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "8px 0",
              background: "#1a2a10",
              border: "1px solid #4ade80",
              borderRadius: 6,
              color: "#4ade80",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.05em"
            }}
          >
            Log {selectedProfile.name} instead
          </button>
        </div>
      )}

      <button
        onClick={onClose}
        style={{ fontSize: 10, color: "#444", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Dismiss
      </button>
    </div>
  )
}

function TabSchedule({ storedWorkouts, setStoredWorkouts, session, schedLog, setSchedLog, readinessScore, latestHealthFit = null, ocItems = [], computedTSB = null, tsbV2Panel = null, progressionReadiness = "progress", progressionReasons = [], tendonStatus = { painScore: 0, stiffness: false, override: null }, scheduleFeedback = [], sleepRecords = [], setSleepRecords = () => {}, scheduleTarget = null, clearScheduleTarget = () => {} }) {
  const safeScheduleFeedback = Array.isArray(scheduleFeedback) ? scheduleFeedback : []
  const [activeDay, setActiveDay] = useState(todayDayKey())
  const [schedView, setSchedView] = useState("schedule")
  const [expandedLog, setExpandedLog] = useState({})
  const [toast, setToast] = useState(null)
  const [openSections, setOpenSections] = useState(() => {
    const mobile = typeof window !== "undefined" ? window.innerWidth < 768 : true
    return { stretch: false, warmup: false, cooldown: false, tendon: false, main: !mobile, core: false, cardio: false, diagnostics: false }
  })
  const [variants, setVariants] = useState({})
  const [fields, setFields] = useState({})
  const [cardioEntries, setCardioEntries] = useState({}) // { day: [{modality, duration, notes}] }
  const [checkedItems, setCheckedItems] = useState({})   // { "day_section_index": bool }
  const [customItems, setCustomItems] = useState({})     // { "day_stretch": [{n,d}], "day_warmup": [...], "day_core": [...] }
  const [customExercises, setCustomExercises] = useState({}) // { day: [{id,n,sets,reps,load,notes}] }
  const [tendonEntries, setTendonEntries] = useState({}) // { day: [{id,name,sets,reps,load,notes}] }
  const [savedEntries, setSavedEntries] = useState({})   // { day: { ymca: entry|null, knr: entry|null } }
  const [justUndone, setJustUndone] = useState(null)    // "ymca" | "knr" | null
  const [sessionDate, setSessionDate] = useState(todayISO())
  const [pendingVenue, setPendingVenue] = useState(null)   // venue awaiting exercise selection
  const [pendingChecked, setPendingChecked] = useState({}) // { [exercise_id]: bool }
  const [sessionRPE, setSessionRPE] = useState({})         // { day_venue: 1-10 }
  const [inlineItemForm, setInlineItemForm] = useState(null) // { day, section } | null
  const [inlineItemName, setInlineItemName] = useState("")
  const [inlineItemDetail, setInlineItemDetail] = useState("")
  const [sleepInputDate, setSleepInputDate] = useState(todayISO())
  const [sleepEntriesOpen, setSleepEntriesOpen] = useState(false)
  const [sleepInputHours, setSleepInputHours] = useState("")
  const SESSION_DRAFT_KEY = "lift-session-draft-v1"
  const [inlineExForm, setInlineExForm] = useState(null)   // day | null
  const [inlineExName, setInlineExName] = useState("")
  const [exSuggestions, setExSuggestions] = useState([])
  const [showExSuggestions, setShowExSuggestions] = useState(false)
  const [exInputRect, setExInputRect] = useState(null)
  const exInputRef = React.useRef(null)
  const [inlineExDbId, setInlineExDbId] = useState(null)   // DB id when user picks from library
  const [inlineExResults, setInlineExResults] = useState([]) // [{name, dbId, source}]
  const [highlightedLogEntryId, setHighlightedLogEntryId] = useState(null)
  const [showSetTimer, setShowSetTimer] = useState(false)
  const [quickLog, setQuickLog] = useState(false)
  const [expandedCards, setExpandedCards] = useState({})
  const [checkedExIds, setCheckedExIds] = useState(new Set())
  const [substituteDrawerEx, setSubstituteDrawerEx] = useState(null)
  const [guideOpenIds, setGuideOpenIds] = React.useState(new Set())
  const toggleGuide = id => setGuideOpenIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleChecked = id => setCheckedExIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const [isMobileLayout, setIsMobileLayout] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : true)
  const [scheduleInfoOpen, setScheduleInfoOpen] = useState({ tendon: false })
  const logEntryRefs = useRef({})
  const historicalExerciseNames = useMemo(
    () =>
      [...new Set(
        (Array.isArray(schedLog) ? schedLog : [])
          .flatMap(entry => Array.isArray(entry?.exercises) ? entry.exercises : [])
          .map(exercise => exercise?.exercise_name)
          .filter(Boolean)
      )].sort((a, b) => String(a).localeCompare(String(b))),
    [schedLog]
  )

  const SPLIT_DAYS = []
  const isSplitDay = SPLIT_DAYS.includes(activeDay)

  const VENUE_TIMES = { ymca: "05:30", knr: "09:35" }
  const VENUE_LABELS = { ymca: "YMCA (5:30–7:00)", knr: "KNR (9:35–10:45)" }

  const writeLocalScheduleKey = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  }

  const hydrateSessionStore = useCallback((ss) => {
    if (!ss || typeof ss !== "object") return
    const newFields = {}
    const newVariants = {}
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
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return undefined
    const onResize = () => setIsMobileLayout(window.innerWidth < 768)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (!quickLog) setCheckedExIds(new Set())
  }, [quickLog])

  const readScheduleKeyFromSupabase = async key => {
    if (!supabase || !session?.user?.id) return null
    const { data, error } = await supabase
      .from("user_kv")
      .select("value")
      .eq("user_id", session.user.id)
      .eq("key", key)
      .maybeSingle()
    if (error) throw error
    return data?.value ?? null
  }

  const saveScheduleKey = async (key, value) => {
    writeLocalScheduleKey(key, value)
    if (!supabase || !session?.user?.id) return { value, synced: false, reason: "no-auth" }

    try {
      const { data, error } = await supabase.from("user_kv").upsert(
        { user_id: session.user.id, key, value, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      ).select("value").maybeSingle()

      if (error) {
        console.warn(`[LIFT] Supabase sync failed for ${key}:`, error.message)
        return { value, synced: false, reason: error.message }
      }

      const savedValue = data?.value ?? value
      writeLocalScheduleKey(key, savedValue)
      return { value: savedValue, synced: true }
    } catch (networkErr) {
      console.warn(`[LIFT] Network error syncing ${key}:`, networkErr.message)
      return { value, synced: false, reason: networkErr.message }
    }
  }

  const loadScheduleLogForMutation = async fallbackLog => {
    try {
      const remoteLog = await readScheduleKeyFromSupabase("wt-log")
      if (Array.isArray(remoteLog)) return mergeScheduleLogEntries(fallbackLog, remoteLog)
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Failed to refresh wt-log before mutation:", error)
    }
    return Array.isArray(fallbackLog) ? fallbackLog : []
  }

  // ── Load from storage ──────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const lg = await store.get("wt-log")
      const ss = await store.get("wt-sessions")
      const ci = await store.get("wt-custom-items")
      const cx = await store.get("wt-custom-exercises")
      const tw = await store.get("wt-tendon-work")
      const ck = await store.get("wt-checked-items")
      // Fetch wt-log from Supabase and merge with localStorage
      if (supabase && session?.user?.id) {
        try {
          const sbLg = await readScheduleKeyFromSupabase("wt-log")
          if (process.env.NODE_ENV === "development") console.log("wt-log from Supabase:", Array.isArray(sbLg) ? sbLg.length + " entries" : "not array")
          if (Array.isArray(sbLg)) {
            const local = Array.isArray(lg) ? lg : []
            const merged = mergeScheduleLogEntries(local, sbLg)
            setSchedLog(merged)
            writeLocalScheduleKey("wt-log", merged)
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
        hydrateSessionStore(ss)
      }
      if (ci && typeof ci === "object") setCustomItems(ci)
      if (cx && typeof cx === "object") setCustomExercises(cx)
      if (tw && typeof tw === "object") setTendonEntries(tw)
      if (ck && typeof ck === "object") setCheckedItems(ck)
    })()
  }, [session?.user?.id, hydrateSessionStore])

  const showToast = useCallback((msg, duration = 2500) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }, [])

  const setLogEntryRef = useCallback((id, node) => {
    if (node) logEntryRefs.current[id] = node
    else delete logEntryRefs.current[id]
  }, [])

  const switchScheduleDay = useCallback((day) => {
    setActiveDay(day)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }))
  }, [])

  // Apply pre-populated day + date when navigating from a missed-workout alert
  useEffect(() => {
    if (!scheduleTarget) return
    const { day, date } = scheduleTarget
    if (day) switchScheduleDay(day)
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setSessionDate(date)
    clearScheduleTarget()
  }, [scheduleTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  const CARDIO_INJURY_REGIONS = {
    run:  ["Ankle", "Toe", "Knee", "Shin"],
    bike: ["Knee", "Hip", "Glute"],
    swim: ["Shoulder"],
  }
  const CARDIO_LIBRARY_IDS = {
    run: "run",
    bike: "cycling_stationary",
    swim: "swim_freestyle",
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
  const getStructuredExerciseFlags = exerciseId => {
    if (!exerciseId || !Array.isArray(ocItems) || !ocItems.length) return []
    return flagExercisesForOcItems([{ id: exerciseId }], ocItems, currentDayExecutionData)
  }
  const getCardioFlags = modality => {
    const libraryId = CARDIO_LIBRARY_IDS[modality]
    if (!libraryId || !Array.isArray(ocItems) || !ocItems.length) return []
    return flagExercisesForOcItems([{ id: libraryId }], ocItems)
  }
  const getMtpItem = () => ocItems.find(item => item.location === "Toe L" && Number(item.currentScore || 0) > 0) || null
  const renderExerciseFlags = (flags, ex, day) => {
    if (!flags.length) return null
    return (
      <div style={{ marginTop: 4, display: "grid", gap: 4 }}>
        {flags.map((flag, idx) => (
          <div key={`${flag.exerciseId}_${flag.ocLocation}_${idx}`} style={{ fontSize: 11, color: flag.severity === "high" ? "#f97316" : "#f59e0b", display: "grid", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
              <span style={{ flexShrink: 0 }}>●</span>
              <span>
                <span>
                  {flag.ocItemLabel || flag.ocLocation} load {flag.loadScore}/3. {flag.substitutes.length ? `Prefer ${flag.substitutes.join(" or ")}.` : "Modify if symptomatic."}
                </span>
                {flag.modifier && Math.abs(flag.modifier - 1.0) >= 0.15 && (
                  <span style={{ display: "block", fontSize: 10, color: "#888", marginLeft: 6 }}>
                    {flag.modifier > 1.0
                      ? `+${Math.round((flag.modifier - 1.0) * 100)}% load vs reference`
                      : `${Math.round((1.0 - flag.modifier) * 100)}% below reference load`}
                  </span>
                )}
                {flag?.substituteIds?.length > 0 && (
                  <button
                    onClick={() => setSubstituteDrawerEx(
                      substituteDrawerEx?.exId === ex.id ? null : { exId: ex.id, flag }
                    )}
                    style={{
                      fontSize: 10,
                      color: "#f59e0b",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0 0 0 6px",
                      textDecoration: "underline"
                    }}
                  >
                    {substituteDrawerEx?.exId === ex.id ? "hide substitutes" : "see substitutes"}
                  </button>
                )}
              </span>
            </div>
            {substituteDrawerEx?.exId === ex.id && substituteDrawerEx?.flag === flag && (
              <SubstituteDrawer
                flag={substituteDrawerEx.flag}
                onSelectSubstitute={(profile) => {
                  addSubstituteCustomExercise(day, profile, ex.n || ex.name || flag.exerciseName, substituteDrawerEx.flag)
                  setSubstituteDrawerEx(null)
                }}
                onClose={() => setSubstituteDrawerEx(null)}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  const chooseTodayWorkout = (plannedWorkout, currentProgressionReadiness, currentTendonStatus) => {
    const normalizedTendonStatus = {
      painScore: Number(currentTendonStatus?.painScore || 0),
      stiffness: Boolean(currentTendonStatus?.stiffness),
      override: currentTendonStatus?.override || null
    }
    const modality = String(plannedWorkout?.modality || plannedWorkout?.type || "strength").toLowerCase()
    const isRunLike = modality === "run" || modality === "running" || modality === "walk"
    const isCardio = ["run", "running", "walk", "bike", "swim", "row"].includes(modality)
    const reasonText = Array.isArray(progressionReasons) && progressionReasons.length
      ? progressionReasons.join(" · ")
      : "No controller restriction"

    if (currentProgressionReadiness === "deload") {
      if (isRunLike && normalizedTendonStatus.stiffness) {
        return {
          modification: "Swap run for easy bike or full rest",
          reason: reasonText
        }
      }
      if (isRunLike) {
        return {
          modification: "Replace run with easy bike or cut to recovery effort",
          reason: reasonText
        }
      }
      if (isCardio) {
        return {
          modification: "Keep modality but cut duration and keep effort easy",
          reason: reasonText
        }
      }
      return {
        modification: "Keep workout but reduce load 10-15% and trim volume",
        reason: reasonText
      }
    }

    if (currentProgressionReadiness === "hold") {
      if (isRunLike) {
        return {
          modification: "Keep the run, reduce duration or intensity slightly",
          reason: reasonText
        }
      }
      if (isCardio) {
        return {
          modification: "Keep modality, hold progression and stay slightly easier",
          reason: reasonText
        }
      }
      return {
        modification: "Keep workout type, trim one set or reduce load slightly",
        reason: reasonText
      }
    }

    return {
      modification: "As planned",
      reason: reasonText
    }
  }

  // ── Data source: PLAN (primary) with PROG as fallback ─────────────
  const getProgDay = (day) => {
    const schDay = PLAN[day]
    if (schDay) {
      const warmup = (schDay.warmup || []).map(s =>
        typeof s === "string" ? { n: s, d: "" } : { n: s.n || "", d: s.d || "" }
      )
      const cooldown = (schDay.cooldown || []).map(s =>
        typeof s === "string" ? { n: s, d: "" } : { n: s.n || "", d: s.d || "" }
      )
      const exercises = (schDay.sections || []).flatMap(sec =>
        (sec.ex || []).map(ex => {
          const def = ex.def || []
          return {
            id: ex.id,
            n: ex.name,
            fi: null,
            _def: def,
            _sectionH: sec.h,
            variants: {
              machine: {
                n: ex.sub || ex.name,
                sets: String(def.length || 3),
                reps: def[0]?.r ?? "—",
                load: def[0]?.w ?? "—",
                note: ex.note || "",
              },
            },
          }
        })
      )
      return { stretch: [], warmup, cooldown, exercises, core: [], _topNote: schDay.topNote }
    }
    // Fallback to PROG for any day not in PLAN
    return PROG[day] || { stretch: [], warmup: [], cooldown: [], exercises: [], core: [] }
  }
  const getVariant = (exId) => variants[exId] || "machine"

  const getF = (day, exId) => {
    const k = `${day}_${exId}`
    const prog = getProgDay(day)
    const ex = prog.exercises?.find(e => e.id === exId)
    if (!ex) return {}
    const vk = getVariant(exId)
    const rx = ex.variants[vk]
    const existing = fields[k] || {}
    return {
      sets: resolveEditableField(existing, "sets", rx.sets),
      reps: resolveEditableField(existing, "reps", rx.reps),
      load: resolveEditableField(existing, "load", rx.load),
      notes: resolveEditableField(existing, "notes", "")
    }
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
      setFields(prev => ({
        ...prev,
        [k]: {
          sets: v.sets,
          reps: v.reps,
          load: v.load,
          notes: resolveEditableField(prev[k], "notes", "")
        }
      }))
    }
  }

  const isChanged = (day, exId) => {
    const ex = getProgDay(day).exercises?.find(e => e.id === exId)
    if (!ex) return false
    const rx = ex.variants[getVariant(exId)]
    const f = getF(day, exId)
    return f.sets !== rx.sets || f.reps !== rx.reps || f.load !== rx.load
  }

  const currentDayExecutionData = useMemo(() => {
    const executionData = {}
    const dayExercises = getProgDay(activeDay).exercises || []

    dayExercises.forEach(ex => {
      const variantKey = getVariant(ex.id)
      const variant = ex.variants?.[variantKey] || ex.variants?.machine || {}
      const f = getF(activeDay, ex.id)
      const rawSets = resolveEditableField(f, "sets", variant.sets)
      const rawReps = resolveEditableField(f, "reps", variant.reps)
      const rawLoad = resolveEditableField(f, "load", variant.load)
      const defaultSetCount = Array.isArray(ex._def) && ex._def.length ? ex._def.length : 1
      const parsedSetCount = Math.max(1, parseInt(rawSets, 10) || defaultSetCount)

      executionData[ex.id] = Array.from({ length: parsedSetCount }, () => ({
        r: String(rawReps ?? ""),
        w: String(rawLoad ?? ""),
      }))
    })

    return executionData
  }, [activeDay, fields, variants])

  // ── Checked items ──────────────────────────────────────────────────────
  const checkKey = (day, section, idx) => `${day}_${section}_${idx}`
  const getDefaultCheckedState = (section, day) => {
    if (section === "warmup" || section === "stretch" || section === "core") return false
    if (section === "tendon") return false
    if (section === "exercise") return true
    if (section === "cardio") return !CARDIO[day]?.noCardio
    return false
  }
  const isChecked = (day, section, idx) => {
    const key = checkKey(day, section, idx)
    if (Object.prototype.hasOwnProperty.call(checkedItems, key)) return !!checkedItems[key]
    return getDefaultCheckedState(section, day)
  }
  const persistCheckedItems = next => {
    setCheckedItems(next)
    saveScheduleKey("wt-checked-items", next)
  }
  const toggleCheck = (day, section, idx) => {
    const key = checkKey(day, section, idx)
    const next = {
      ...checkedItems,
      [key]: !isChecked(day, section, idx)
    }
    persistCheckedItems(next)
  }

  const getTendonEntries = day => tendonEntries[day]?.length
    ? tendonEntries[day]
    : getDefaultTendonWork(day)

  const syncTendonEntryFromDef = (entry, def) => ({
    ...entry,
    def,
    sets: String(def.length || 0),
    reps: def[0]?.r ?? "",
    load: def[0]?.w ?? "",
  })

  const updateTendonEntryDef = (day, idx, transform) => {
    const entries = getTendonEntries(day).map((entry, entryIdx) => {
      if (entryIdx !== idx) return { ...entry, def: (entry.def || []).map(set => ({ ...set })) }
      const currentDef = Array.isArray(entry.def) && entry.def.length
        ? entry.def.map(set => ({ ...set }))
        : [{ r: entry.reps || "", w: entry.load || "" }]
      const nextDef = transform(currentDef)
      return syncTendonEntryFromDef({ ...entry }, nextDef)
    })
    const next = { ...tendonEntries, [day]: entries }
    setTendonEntries(next)
    saveScheduleKey("wt-tendon-work", next)
  }

  const setTendonEntryField = (day, idx, field, value) => {
    const entries = getTendonEntries(day).map((entry, entryIdx) =>
      entryIdx === idx ? { ...entry, [field]: value } : { ...entry }
    )
    const next = { ...tendonEntries, [day]: entries }
    setTendonEntries(next)
    saveScheduleKey("wt-tendon-work", next)
  }

  const setTendonSetField = (day, entryIdx, setIdx, field, value) => {
    updateTendonEntryDef(day, entryIdx, currentDef =>
      currentDef.map((set, idx) => idx === setIdx ? { ...set, [field]: value } : { ...set })
    )
  }

  const addTendonSet = (day, entryIdx) => {
    updateTendonEntryDef(day, entryIdx, currentDef => [
      ...currentDef,
      { ...(currentDef[currentDef.length - 1] || { r: "", w: "" }) }
    ])
  }

  const removeTendonSet = (day, entryIdx, setIdx) => {
    updateTendonEntryDef(day, entryIdx, currentDef => {
      const nextDef = currentDef.filter((_, idx) => idx !== setIdx)
      return nextDef.length ? nextDef : [{ r: "", w: "" }]
    })
  }

  // ── Custom items (stretch, warmup, core) ───────────────────────────────
  const customKey = (day, section) => `${day}_${section}`
  const getCustomItems = (day, section) => customItems[customKey(day, section)] || []

  const addCustomItem = (day, section) => {
    setInlineItemForm({ day, section })
    setInlineItemName("")
    setInlineItemDetail("")
  }

  const commitCustomItem = () => {
    if (!inlineItemForm || !inlineItemName.trim()) return
    const { day, section } = inlineItemForm
    const updated = { ...customItems, [customKey(day, section)]: [...getCustomItems(day, section), { n: inlineItemName.trim(), d: inlineItemDetail.trim() }] }
    setCustomItems(updated)
    saveScheduleKey("wt-custom-items", updated)
    setInlineItemForm(null)
    setInlineItemName("")
    setInlineItemDetail("")
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
    setInlineExForm(day)
    setInlineExName("")
    setExSuggestions([])
    setShowExSuggestions(false)
    setInlineExDbId(null)
    setInlineExResults([])
    loadExDb()  // pre-warm cache so results are instant when user types
    setTimeout(() => {
      if (exInputRef.current) {
        exInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
        exInputRef.current.focus()
      }
    }, 60)
  }

  const commitCustomExercise = () => {
    if (!inlineExForm || !inlineExName.trim()) return
    const day = inlineExForm
    const newEx = {
      id: `custom_${Date.now()}`,
      n: inlineExName.trim(),
      dbId: inlineExDbId || null,  // stored so guide panel works without fuzzy matching
      sets: "3", reps: "10", load: "", notes: ""
    }
    const updated = { ...customExercises, [day]: [...getCustomExercises(day), newEx] }
    setCustomExercises(updated)
    saveScheduleKey("wt-custom-exercises", updated)
    setInlineExForm(null)
    setInlineExName("")
    setExSuggestions([])
    setShowExSuggestions(false)
    setInlineExDbId(null)
    setInlineExResults([])
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

  const addSubstituteCustomExercise = (day, profile, sourceExerciseName, flag) => {
    if (!day || !profile?.name) return
    const newEx = {
      id: `sub_${Date.now()}`,
      dbId: null,
      n: profile.name,
      sets: "3",
      reps: "10",
      load: "",
      notes: `Substituted for ${sourceExerciseName} — OC flag: ${flag?.ocLocation || "unknown region"}`
    }
    const updated = { ...customExercises, [day]: [...getCustomExercises(day), newEx] }
    setCustomExercises(updated)
    saveScheduleKey("wt-custom-exercises", updated)
  }

  const getLastLoggedExerciseValues = (exerciseName, exerciseId = null) => {
    const lower = String(exerciseName || "").toLowerCase()
    if (!lower || !Array.isArray(schedLog) || !schedLog.length) return null
    for (const sessionEntry of schedLog) {
      const match = (sessionEntry?.exercises || []).find(entry => {
        const entryName = String(entry?.exercise_name || entry?.name || "").toLowerCase()
        if (!entryName) return false
        if (exerciseId && String(entry?.exercise_id || "") === String(exerciseId)) return true
        return entryName === lower || entryName.includes(lower) || lower.includes(entryName.split(" ")[0] || "")
      })
      if (!match) continue
      const actual = match.actual || {}
      return {
        sets: String(actual.sets ?? match.sets ?? match.prescribed?.sets ?? ""),
        reps: String(actual.reps ?? match.reps ?? match.prescribed?.reps ?? ""),
        load: String(actual.load ?? match.load ?? match.prescribed?.load ?? ""),
      }
    }
    return null
  }

  const fillQuickLogExercise = (day, ex, isCustom = false) => {
    const nextValues = getLastLoggedExerciseValues(ex.n || ex.name, ex.id) || (
      isCustom
        ? {
            sets: String(ex.sets ?? "3"),
            reps: String(ex.reps ?? "10"),
            load: String(ex.load ?? ""),
          }
        : (() => {
            const f = getF(day, ex.id)
            return {
              sets: String(f.sets ?? ""),
              reps: String(f.reps ?? ""),
              load: String(f.load ?? ""),
            }
          })()
    )

    if (isCustom) {
      setCustomExF(day, ex.id, "sets", nextValues.sets)
      setCustomExF(day, ex.id, "reps", nextValues.reps)
      setCustomExF(day, ex.id, "load", nextValues.load)
      return
    }

    setFields(prev => {
      const k = `${day}_${ex.id}`
      return {
        ...prev,
        [k]: {
          ...(prev[k] || {}),
          sets: nextValues.sets,
          reps: nextValues.reps,
          load: nextValues.load,
        }
      }
    })
  }

  // ── Cardio entries ─────────────────────────────────────────────────────
  const getCardioEntries = (day) => {
    if (cardioEntries[day]?.length) return cardioEntries[day]
    const cd = CARDIO[day]
    if (cd.noCardio) return []
    const sessions = cd.sessions || []
    if (sessions.length > 0) return sessions.map(s => ({ modality: s.mod, duration: `${s.dMin}-${s.dMax}`, distance: "", calories: "", hr: "", notes: "" }))
    return [{ modality: cd.mod || "run", duration: "", distance: "", calories: "", hr: "", notes: "" }]
  }

  const setCardioEntryF = (day, idx, fKey, val) => {
    setCardioEntries(prev => {
      const arr = [...getCardioEntries(day)]
      arr[idx] = { ...arr[idx], [fKey]: val }
      return { ...prev, [day]: arr }
    })
  }

  const addManualSleepEntry = async (dateStr, hours) => {
    const mins = Math.round(Number(hours) * 60)
    if (!mins || mins < 0 || mins > 960) return
    const record = {
      date: dateStr,
      duration_min: mins,
      source: "manual",
      sleep_quality: null,
      sleep_date: dateStr
    }
    const next = [
      ...(Array.isArray(sleepRecords) ? sleepRecords.filter(r => {
        const d = getSleepRecordDate(r)
        return d !== dateStr && r.date !== dateStr && r.sleep_date !== dateStr
      }) : []),
      record
    ].sort((a, b) => String(getSleepRecordDate(a) || "").localeCompare(String(getSleepRecordDate(b) || "")))
    setSleepRecords(next)
    localStorage.setItem("lift_sleep_records", JSON.stringify(next))
    try {
      if (supabase && session?.user?.id) {
        await upsertSleepRecords(supabase, session.user.id, [record])
      }
    } catch (e) {
      console.warn("Manual sleep upsert failed", e)
    }
    showToast(`Sleep logged: ${hours}h on ${dateStr}`)
  }

  const deleteSleepEntry = async (dateStr) => {
    const next = (Array.isArray(sleepRecords) ? sleepRecords : []).filter(r => {
      const d = getSleepRecordDate(r)
      return d !== dateStr && r.date !== dateStr && r.sleep_date !== dateStr
    })
    setSleepRecords(next)
    localStorage.setItem('lift_sleep_records', JSON.stringify(next))
    try {
      if (supabase && session?.user?.id) {
        await supabase.from('sleep_records').delete().eq('user_id', session.user.id).eq('sleep_date', dateStr)
      }
    } catch (e) { console.warn('Sleep delete failed', e) }
    showToast(`Sleep entry removed for ${dateStr}`)
  }

  const addCardioEntry = (day) => {
    const prescribedMod = CARDIO[day]?.sessions?.[0]?.mod || CARDIO[day]?.mod || "run"
    setCardioEntries(prev => ({
      ...prev,
      [day]: [
        ...getCardioEntries(day),
        { modality: prescribedMod, duration: "", distance: "", calories: "", hr: "", notes: "" }
      ]
    }))
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (!draft || !draft.sessions) return
      const age = Date.now() - (draft.savedAt || 0)
      if (age < 8 * 60 * 60 * 1000) {
        hydrateSessionStore(draft.sessions)
        if (draft.activeDay) setActiveDay(draft.activeDay)
        if (draft.sessionDate) setSessionDate(draft.sessionDate)
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify({
        sessions: buildSessionsStore(), savedAt: Date.now(), activeDay, sessionDate
      }))
    } catch {}
  }, [fields, variants, activeDay, sessionDate])

  // ── Log session ────────────────────────────────────────────────────────
  const logSession = async (venue, checkedIds = null) => {
    const day = activeDay
    const dateDay = dayKeyFromScheduleDate(sessionDate)
    if (dateDay && dateDay !== day) {
      showToast(`Session date is ${dateDay}; switch from ${day} before saving`)
      return
    }
    const prog = getProgDay(day)
    const ts = new Date(`${sessionDate}T${VENUE_TIMES[venue] || "12:00"}:00`).toISOString()

    const exercises = (prog.exercises || []).map(ex => {
      const vk = getVariant(ex.id)
      const rx = ex.variants[vk]
      const f = getF(day, ex.id)
      return {
        exercise_id: ex.id, exercise_name: ex.n, variant: vk, variant_name: rx.n,
        prescribed: { sets: rx.sets, reps: rx.reps, load: rx.load },
        actual: {
          sets: resolveEditableField(f, "sets", rx.sets),
          reps: resolveEditableField(f, "reps", rx.reps),
          load: resolveEditableField(f, "load", rx.load)
        },
        notes: f.notes || "", changed: isChanged(day, ex.id),
      }
    })

    const customExs = getCustomExercises(day).map(e => ({
      exercise_id: e.id, exercise_name: e.n, variant: "custom", variant_name: e.n,
      prescribed: { sets: e.sets, reps: e.reps, load: e.load },
      actual: { sets: e.sets, reps: e.reps, load: e.load },
      notes: e.notes || "", changed: false,
    }))

    const filteredExercises = checkedIds != null ? exercises.filter(ex => checkedIds.has(ex.exercise_id)) : exercises
    const filteredCustomExs = checkedIds != null ? customExs.filter(ex => checkedIds.has(ex.exercise_id)) : customExs
    const completedTendonWork = getTendonEntries(day)
      .filter((_, idx) => isChecked(day, "tendon", idx))
      .map(item => ({ ...item }))

    const checkedStretch = getProgDay(day).stretch?.map((item, i) => ({ ...item, done: isChecked(day, "stretch", i) }))
    const checkedWarmup = getProgDay(day).warmup?.map((item, i) => ({ ...item, done: isChecked(day, "warmup", i) }))

    const completedCardio = getCardioEntries(day).filter((_, i) => isChecked(day, "cardio", i))

    const entry = {
      id: Date.now(),
      session_id: ts.replace(/\D/g, "").slice(0, 17),
      logged_at: ts, date: sessionDate,
      day, dayLabel: SCH_META[day]?.label || SMETA[day]?.label || day,
      venue: venue || "ymca",
      venue_label: VENUE_LABELS[venue] || "",
      program: "Kinesiology (primary)",
      rpe: sessionRPE[`${day}_${venue}`] ?? null,
      exercises: [...filteredExercises, ...filteredCustomExs],
      tendon_work: completedTendonWork,
      cardio: completedCardio,
      stretch_completed: checkedStretch,
      warmup_completed: checkedWarmup,
      source: "LIFT Schedule Tab", apple_watch_sync_pending: true,
      data: Object.fromEntries(filteredExercises.map(ex => {
        // If the program exercise has a full def array (_def), use it as the per-set record
        // so SchLogView can display each set. Fall back to a single {r,w} pair.
        const progEx = prog.exercises?.find(e => e.id === ex.exercise_id)
        const userReps = ex.actual.reps
        const userLoad = ex.actual.load
        const hasUserEntry = (userReps != null && userReps !== "" && userReps !== "—") ||
          (userLoad != null && userLoad !== "" && userLoad !== "—")
        const sets = progEx?._def?.length
          ? progEx._def.map(s => ({
              r: hasUserEntry ? (userReps ?? s.r) : s.r,
              w: hasUserEntry ? (userLoad ?? s.w) : s.w,
            }))
          : [{ r: userReps, w: userLoad }]
        return [ex.exercise_id, sets]
      })),
    }

    const currentLog = await loadScheduleLogForMutation(schedLog)
    const newLog = [entry, ...currentLog.filter(e => e.id !== entry.id)]
    setSchedLog(newLog)
    setSavedEntries(prev => ({ ...prev, [day]: { ...(prev[day] || {}), [venue]: entry } }))

    const logResult = await saveScheduleKey("wt-log", newLog)
    if (Array.isArray(logResult?.value)) setSchedLog(logResult.value)
    await saveScheduleKey("wt-sessions", buildSessionsStore())

    if (logResult?.synced) {
      showToast("Session saved and synced ✓")
    } else {
      showToast("Saved on this device — sync pending. Tap Sync when on wifi.", 5000)
    }

    const allCardio = completedCardio
    if (allCardio.some(c => c.duration)) {
      const summaryEntries = allCardio.filter(c => c.duration).map((c, i) => ({
        id: entry.id + i, date: sessionDate, time: VENUE_TIMES[venue] || "", dateTime: ts,
        type: c.modality === "run" ? "Running" : c.modality === "bike" ? "Cycling" : c.modality === "swim" ? "Swimming" : c.modality === "row" ? "Rowing" : "Other",
        dur: parseInt(c.duration) || 0,
        hr: parseFloat(c.hr) > 0 ? parseFloat(c.hr) : null,
        distance: parseFloat(c.distance) > 0 ? parseFloat(c.distance) : null,
        calories: parseInt(c.calories) > 0 ? parseInt(c.calories) : null,
        notes: `from Schedule , ${SCH_META[day]?.theme || SMETA[day]?.theme || day}${c.notes ? " , " + c.notes : ""}`,
        _scheduleId: entry.id,
      }))
      const existing = await store.get("ufd-workouts") || storedWorkouts
      const merged = dedupeUfdWorkouts([
        ...(Array.isArray(existing) ? existing : []),
        ...summaryEntries,
      ])
      setStoredWorkouts(merged)
      const savedWorkouts = await saveScheduleKey("ufd-workouts", merged)
      if (Array.isArray(savedWorkouts?.value ?? savedWorkouts)) setStoredWorkouts(savedWorkouts?.value ?? savedWorkouts)
    }

    try { localStorage.removeItem(SESSION_DRAFT_KEY) } catch {}
  }

  const undoSession = async (venue) => {
    const day = activeDay
    const entry = savedEntries[day]?.[venue]
    if (!entry) return
    const currentLog = await loadScheduleLogForMutation(schedLog)
    const newLog = currentLog.filter(e => e.id !== entry.id)
    setSchedLog(newLog)
    const existingWorkouts = await store.get("ufd-workouts") || storedWorkouts
    const newWorkouts = (Array.isArray(existingWorkouts) ? existingWorkouts : []).filter(w => w._scheduleId !== entry.id)
    setStoredWorkouts(newWorkouts)
    setSavedEntries(prev => ({ ...prev, [day]: { ...(prev[day] || {}), [venue]: null } }))
    setJustUndone(venue)
    const savedLog = await saveScheduleKey("wt-log", newLog)
    if (Array.isArray(savedLog?.value ?? savedLog)) setSchedLog(savedLog?.value ?? savedLog)
    const savedWorkouts = await saveScheduleKey("ufd-workouts", newWorkouts)
    if (Array.isArray(savedWorkouts?.value ?? savedWorkouts)) setStoredWorkouts(savedWorkouts?.value ?? savedWorkouts)
    setTimeout(() => setJustUndone(null), 4000)
    showToast("Session removed")
  }

  const deleteEntry = async id => {
    const currentLog = await loadScheduleLogForMutation(schedLog)
    const newLog = currentLog.filter(e => e.id !== id)
    setSchedLog(newLog)
    const existingWorkouts = await store.get("ufd-workouts") || storedWorkouts
    const newWorkouts = (Array.isArray(existingWorkouts) ? existingWorkouts : []).filter(w => w._scheduleId !== id)
    const savedLog = await saveScheduleKey("wt-log", newLog)
    if (Array.isArray(savedLog?.value ?? savedLog)) setSchedLog(savedLog?.value ?? savedLog)
    setStoredWorkouts(newWorkouts)
    const savedWorkouts = await saveScheduleKey("ufd-workouts", newWorkouts)
    if (Array.isArray(savedWorkouts?.value ?? savedWorkouts)) setStoredWorkouts(savedWorkouts?.value ?? savedWorkouts)
    showToast("Entry deleted")
  }

  const resolveDiagnosticConflict = useCallback(async ({ clusterKey, canonicalId, deleteOthers = false, reassignDate = null }) => {
    if (!canonicalId) {
      showToast("Select a canonical record first")
      return
    }

    const currentLog = await loadScheduleLogForMutation(schedLog)
    const clusterEntries = currentLog.filter(entry => {
      if (entry?.conflict_ignored || entry?.conflict_status === "ignored") return false
      const date = String(entry?.date || entry?.logged_at || "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
      return `${date}__${getScheduleEntryConflictSlot(entry)}` === clusterKey
    })

    if (clusterEntries.length < 2) {
      showToast("Conflict cluster no longer exists")
      return
    }

    const canonicalEntry = clusterEntries.find(entry => String(entry.id) === String(canonicalId) || String(entry.session_id) === String(canonicalId))
    if (!canonicalEntry) {
      showToast("Canonical record not found")
      return
    }

    const targetDate = reassignDate && /^\d{4}-\d{2}-\d{2}$/.test(reassignDate) ? reassignDate : null
    const targetDay = targetDate ? dayKeyFromScheduleDate(targetDate) : null
    const removedIds = new Set()

    const nextLog = currentLog
      .filter(entry => {
        const inCluster = clusterEntries.some(clusterEntry => clusterEntry.id === entry.id)
        if (!inCluster) return true
        if (!deleteOthers) return true
        const isCanonical = String(entry.id) === String(canonicalEntry.id)
        if (!isCanonical) removedIds.add(entry.id)
        return isCanonical
      })
      .map(entry => {
        if (!clusterEntries.some(clusterEntry => clusterEntry.id === entry.id)) return entry
        const isCanonical = String(entry.id) === String(canonicalEntry.id)
        const updated = {
          ...entry,
          conflict_cluster_key: clusterKey,
          conflict_canonical: isCanonical,
          conflict_ignored: !isCanonical && !deleteOthers,
          conflict_status: isCanonical ? "canonical" : deleteOthers ? "removed" : "ignored",
        }
        if (isCanonical && targetDate) {
          updated.date = targetDate
          if (targetDay) {
            updated.day = targetDay
            updated.dayLabel = SCH_META[targetDay]?.label || SMETA[targetDay]?.label || targetDay
          }
        }
        return updated
      })

    setSchedLog(nextLog)
    const savedLog = await saveScheduleKey("wt-log", nextLog)
    if (Array.isArray(savedLog?.value ?? savedLog)) setSchedLog(savedLog?.value ?? savedLog)

    if (removedIds.size > 0) {
      const existingWorkouts = await store.get("ufd-workouts") || storedWorkouts
      const nextWorkouts = (Array.isArray(existingWorkouts) ? existingWorkouts : []).filter(w => !removedIds.has(w._scheduleId))
      setStoredWorkouts(nextWorkouts)
      const savedWorkouts = await saveScheduleKey("ufd-workouts", nextWorkouts)
      if (Array.isArray(savedWorkouts?.value ?? savedWorkouts)) setStoredWorkouts(savedWorkouts?.value ?? savedWorkouts)
    }

    showToast(deleteOthers ? "Conflict resolved; extra records deleted" : "Conflict resolved; extra records ignored")
  }, [schedLog, storedWorkouts, showToast])

  const editEntry = id => {
    const entry = schedLog.find(e => e.id === id)
    if (!entry) return
    const mismatch = getScheduleEntryDayDateMismatch(entry)
    const entryDate = String(entry.date || entry.logged_at || "").slice(0, 10)
    switchScheduleDay(mismatch?.dateDay || entry.day)
    if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) setSessionDate(entryDate)
    setSchedView("schedule")
    showToast(mismatch
      ? `Existing log mismatch: ${mismatch.date} is ${mismatch.dateDay}, not ${mismatch.storedDay}`
      : `Loaded ${entry.dayLabel} for editing`
    )
  }

  const openDiagnosticEntry = useCallback((id) => {
    const entry = schedLog.find(e => String(e.id) === String(id) || String(e.session_id) === String(id))
    if (!entry) {
      showToast("Log entry not found")
      return
    }
    const mismatch = getScheduleEntryDayDateMismatch(entry)
    const entryDate = String(entry.date || entry.logged_at || "").slice(0, 10)
    const targetDay = mismatch?.dateDay || entry.day

    if (targetDay) setActiveDay(targetDay)
    if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) setSessionDate(entryDate)
    setSchedView("log")
    setExpandedLog(prev => ({ ...prev, [entry.id]: true }))
    setHighlightedLogEntryId(entry.id)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        logEntryRefs.current[entry.id]?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
    })

    setTimeout(() => setHighlightedLogEntryId(current => current === entry.id ? null : current), 1800)
    showToast(`Opened log entry ${entry.id}`)
  }, [schedLog, showToast])

  const toggleSection = k => setOpenSections(prev => ({ ...prev, [k]: !prev[k] }))
 const importRef = useRef(null)

  const exportLog = () => {
    const payload = {
      _meta: { exported: new Date().toISOString(), version: "1.0", entries: schedLog.length },
      log: schedLog,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `workout_log_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast("Exported")
  }

  const importLog = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (!parsed.log || !Array.isArray(parsed.log)) throw new Error("bad format")
        const currentLog = await loadScheduleLogForMutation(schedLog)
        const existingIds = new Set(currentLog.map(e => e.id))
        const newEntries = parsed.log.filter(e => !existingIds.has(e.id))
        const merged = mergeScheduleLogEntries(newEntries, currentLog)
        setSchedLog(merged)
        const savedLog = await saveScheduleKey("wt-log", merged)
        if (Array.isArray(savedLog?.value ?? savedLog)) setSchedLog(savedLog?.value ?? savedLog)
        showToast(`Imported ${newEntries.length} new entries`)
        setSchedView("log")
      } catch (_) {
        showToast("Import failed — check file format")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }
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

  const addBtn = (onClick, day, section) => {
    const isOpen = inlineItemForm?.day === day && inlineItemForm?.section === section
    if (isOpen) return (
      <div style={{ marginTop: 8, padding: "8px", background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: 6 }}>
        <input
          autoFocus
          value={inlineItemName}
          onChange={e => setInlineItemName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitCustomItem(); if (e.key === "Escape") setInlineItemForm(null) }}
          placeholder={`Add item to ${section}...`}
          style={{ ...inputStyle(), marginBottom: 6, fontSize: 12, padding: "6px 8px" }}
        />
        <input
          value={inlineItemDetail}
          onChange={e => setInlineItemDetail(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitCustomItem(); if (e.key === "Escape") setInlineItemForm(null) }}
          placeholder="Description (optional)"
          style={{ ...inputStyle(), marginBottom: 8, fontSize: 12, padding: "6px 8px" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={commitCustomItem}
            style={{ flex: 1, padding: "5px 0", background: "#185FA5", border: "none", borderRadius: 5, color: "#fff", fontSize: 12, cursor: "pointer" }}>
            Add
          </button>
          <button onClick={() => setInlineItemForm(null)}
            style={{ padding: "5px 10px", background: "transparent", border: "0.5px solid #333", borderRadius: 5, color: "#555", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    )
    return (
      <button onClick={onClick}
        style={{ width: "100%", marginTop: 8, padding: "6px", border: "0.5px dashed #333", borderRadius: 5, background: "transparent", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
        + Add item
      </button>
    )
  }

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
          {addBtn(() => addCustomItem(day, section), day, section)}
        </div>
      </div>
    )
  }

  // ── Exercise card ──────────────────────────────────────────────────────
  const exCard = (ex, day, isCustom = false) => {
    const cardKey = `${day}_${ex.id}`
    const vk = isCustom ? "custom" : getVariant(ex.id)
    const v = isCustom ? ex : ex.variants?.[vk]
    const f = isCustom ? ex : getF(day, ex.id)
    const chg = isCustom ? false : isChanged(day, ex.id)
    const includedInLog = isChecked(day, "exercise", ex.id)
    const quickChecked = checkedExIds.has(ex.id)
    const quickExpanded = !!expandedCards[ex.id]
    const collapsed = quickLog ? !quickExpanded : (expandedCards[cardKey] == null ? isMobileLayout : !expandedCards[cardKey])
    const vColors = { machine: "#3b82f6", db: "#22c55e", friendly: "#f97316" }
    const vBgs = { machine: "rgba(59,130,246,0.12)", db: "rgba(34,197,94,0.12)", friendly: "rgba(249,115,22,0.12)" }
    const fl = ex.fi === "toe" ? "Toe-safe" : "Shoulder-safe"
    const _exNameLower = String(ex.n || "").toLowerCase()
    const _isLowerBodyEx = ["leg press","leg curl","leg extension","hip thrust","hip abduction",
      "hip adduction","calf raise","rdl","romanian","squat","lunge"].some(k => _exNameLower.includes(k))
    const _isUpperBodyEx = ["chest press","chest-press","lat pulldown","cable row","seated row",
      "bicep curl","shoulder press","tricep","pull-up","push-up"].some(k => _exNameLower.includes(k))
    const _exCompartmentReadiness = _isLowerBodyEx
      ? (ocConstraintState?.gate?.lowerProgressionReadiness ?? progressionReadiness)
      : _isUpperBodyEx
        ? (ocConstraintState?.gate?.upperProgressionReadiness ?? progressionReadiness)
        : progressionReadiness
    const workoutSuggestion = chooseTodayWorkout(
      { type: "strength", modality: "strength", name: ex.n },
      _exCompartmentReadiness,
      tendonStatus
    )
    const structuredFlags = !isCustom ? getStructuredExerciseFlags(ex.id) : []
    const history = !isCustom ? getExerciseHistory(ex.n, schedLog) : []
    const historySparkline = !isCustom && history.length >= 3 ? (() => {
      const weights = history.map(h => h.weight)
      const minW = Math.min(...weights)
      const maxW = Math.max(...weights)
      const range = maxW - minW || 1
      const pts = weights.map((w, i) => `${(i / (weights.length - 1)) * 78 + 1},${23 - ((w - minW) / range) * 22}`).join(" ")
      const lastW = weights[weights.length - 1]
      const last3Same = weights.slice(-3).every(w => w === lastW)
      const suggested = last3Same && readinessScore >= 70 ? lastW + 5 : readinessScore < 60 ? Math.round(lastW * 0.9) : lastW
      return { pts, suggested }
    })() : null
    const displaySets = resolveEditableField(f, "sets", v?.sets)
    const displayReps = resolveEditableField(f, "reps", v?.reps)
    const displayLoad = resolveEditableField(f, "load", v?.load)
    const displaySummary = `${displaySets || "—"}×${displayReps || "—"} @ ${displayLoad || "—"}`

    const toggleExpanded = () => setExpandedCards(prev => ({ ...prev, [cardKey]: collapsed }))

    const variantControls = !isCustom && Object.keys(ex.variants || {}).length > 1 && ["machine", "db", "friendly"].map(k => {
      if (!ex.variants[k]) return null
      const lbl = k === "machine" ? "Machine" : k === "db" ? "DB" : fl
      const active = vk === k
      return (
        <button
          key={k}
          onClick={() => setVariantFn(day, ex.id, k)}
          style={{ padding: "3px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `0.5px solid ${active ? vColors[k] : "#222"}`, background: active ? vBgs[k] : "transparent", color: active ? vColors[k] : "#444" }}
        >
          {lbl}
        </button>
      )
    })

    const fieldInput = (lbl, fKey, rxVal) => (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>{lbl}</div>
        <input type="text" value={(isCustom ? ex[fKey] : f[fKey]) || ""}
          onChange={e => isCustom ? setCustomExF(day, ex.id, fKey, e.target.value) : setF(day, ex.id, fKey, e.target.value)}
          style={{ width: "100%", padding: "5px 7px", border: `0.5px solid ${!isCustom && (f[fKey] || "") !== rxVal ? "#d97706" : "#252525"}`, borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: !isCustom && (f[fKey] || "") !== rxVal ? "rgba(217,119,6,0.1)" : "#111", fontFamily: "inherit", outline: "none" }} />
        {!isCustom && <div style={{ fontSize: 9, color: "#444" }}>Rx: {rxVal}</div>}
      </div>
    )

    const expandedEditor = (
      <>
        <div style={{ padding: "0 12px 8px", background: "#0a0a0a", borderTop: "1px solid #151515" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 0 6px", flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "#7b8794" }}>{v?.n || null}</div>
            <div style={{ fontSize: 11, color: "#cbd5e1" }}>{formatRxSummary(displaySets, displayReps, displayLoad)}</div>
          </div>
        </div>
        <div style={{ padding: "4px 12px 10px", background: "#0a0a0a", borderTop: "1px solid #1a1a1a" }}>
          {quickLog && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              {variantControls}
              {isCustom && (
                <button onClick={() => removeCustomExercise(day, ex.id)}
                  style={{ padding: "3px 7px", borderRadius: 4, fontSize: 10, cursor: "pointer", border: "0.5px solid #333", background: "transparent", color: "#555" }}>
                  Remove
                </button>
              )}
            </div>
          )}
          {!isCustom && <div style={{ fontSize: 11, color: "#555", padding: "4px 0 6px" }}>{v?.n}</div>}
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
            Suggested modification: <span style={{ color: "#e5e7eb" }}>{workoutSuggestion.modification}</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 6 }}>
            Reason: {workoutSuggestion.reason}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            {fieldInput("Sets", "sets", v?.sets)}
            {fieldInput("Reps", "reps", v?.reps)}
            {fieldInput("Load", "load", v?.load)}
          </div>
          {v?.note && <div style={{ fontSize: 11, color: "#555", lineHeight: 1.4, paddingTop: 5, borderTop: "1px solid #1a1a1a", marginBottom: 4 }}>{v.note}</div>}
          {!isCustom && injuryTag(getInjuryNote(
            ex.fi === "shoulder" ? ["Shoulder"] : ex.fi === "toe" ? ["Toe", "Ankle"] : null
          ))}
          {!isCustom && renderExerciseFlags(structuredFlags, ex, day)}
          <textarea value={(isCustom ? ex.notes : f.notes) || ""}
            onChange={e => isCustom ? setCustomExF(day, ex.id, "notes", e.target.value) : setF(day, ex.id, "notes", e.target.value)}
            placeholder="Session note (optional)" rows={1}
            style={{ width: "100%", marginTop: 4, padding: "4px 7px", border: "0.5px solid #1e1e1e", borderRadius: 5, fontSize: 11, color: "#666", background: "#111", fontFamily: "inherit", resize: "none", outline: "none" }} />
          {guideOpenIds.has(ex.id) && (
            <ExerciseGuidePanel
              exId={ex.id}
              exName={ex.n || ex.name || ""}
              exNote={v?.note || ex.note || ex.notes || ""}
              dbId={ex.dbId || null}
            />
          )}
        </div>
      </>
    )

    return (
      <div key={ex.id} style={{ marginTop: 10, border: `0.5px solid ${chg ? "#d97706" : "#1e1e1e"}`, borderRadius: 7, overflow: "hidden", opacity: includedInLog ? 1 : 0.92, position: quickLog ? "relative" : "static" }}>
        {quickLog ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid #0d0e1c", minHeight: 40, background: checkedExIds?.has(ex.id) ? "rgba(74,158,232,0.06)" : "transparent" }}>
            <input
              type="checkbox"
              checked={quickChecked}
              onChange={() => setCheckedExIds(prev => {
                const next = new Set(prev)
                next.has(ex.id) ? next.delete(ex.id) : next.add(ex.id)
                return next
              })}
              style={{ width: 15, height: 15, cursor: "pointer", flexShrink: 0, accentColor: "#4a9ee8" }}
            />
            <span
              onClick={() => setExpandedCards(prev => ({ ...prev, [ex.id]: !prev[ex.id] }))}
              style={{ flex: 1, fontSize: 12, cursor: "pointer", color: quickChecked ? "#444" : "#d8d8d8", textDecoration: quickChecked ? "line-through" : "none" }}
            >
              {ex.n || ex.name}
            </span>
            <span style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>
              {(v?.sets || ex.def?.[0]?.[0] || "3")}×{(v?.reps || ex.def?.[0]?.[1] || "—")} @ {(v?.load || ex.def?.[0]?.[2] || "—")}
            </span>
            <button
              onClick={() => toggleGuide(ex.id)}
              style={{ fontSize: 10, color: "#3d5a78", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}
            >
              form
            </button>
            {expandedCards[ex.id] && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 100, background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: 6, padding: 10, marginTop: 4 }}>
                {expandedEditor}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={toggleExpanded}
            style={{ padding: "8px 12px 7px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap", background: "#0d0d0d", cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input
                type="checkbox"
                checked={includedInLog}
                onChange={e => {
                  e.stopPropagation()
                  toggleCheck(day, "exercise", ex.id)
                }}
                onClick={e => e.stopPropagation()}
                style={{ accentColor: "#4a9ee8", width: 14, height: 14, cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#d8d8d8" }}>{ex.n}</span>
              {chg && <span style={{ fontSize: 9, fontWeight: 700, color: "#d97706", background: "rgba(217,119,6,0.15)", borderRadius: 3, padding: "1px 5px" }}>modified</span>}
              {isCustom && <span style={{ fontSize: 9, color: "#7F77DD", background: "rgba(127,119,221,0.15)", borderRadius: 3, padding: "1px 5px" }}>custom</span>}
              {!includedInLog && <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", background: "rgba(148,163,184,0.16)", borderRadius: 3, padding: "1px 5px" }}>excluded from log</span>}
              {historySparkline && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <svg width="80" height="24" style={{ verticalAlign: "middle" }}>
                    <polyline points={historySparkline.pts} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
                  </svg>
                  <span style={{ fontSize: 10, color: "#666" }}>Suggested: {historySparkline.suggested} lb</span>
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={e => e.stopPropagation()}>
              {variantControls}
              {isCustom && (
                <button onClick={() => removeCustomExercise(day, ex.id)}
                  style={{ padding: "3px 7px", borderRadius: 4, fontSize: 10, cursor: "pointer", border: "0.5px solid #333", background: "transparent", color: "#555" }}>
                  Remove
                </button>
              )}
              <button
                onClick={() => toggleGuide(ex.id)}
                title="Toggle form guide"
                style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                  cursor: "pointer", marginLeft: 2,
                  border: `0.5px solid ${guideOpenIds.has(ex.id) ? "#3b5a8e" : "#1e2a3a"}`,
                  background: guideOpenIds.has(ex.id) ? "rgba(74,158,232,0.15)" : "transparent",
                  color: guideOpenIds.has(ex.id) ? "#4a9ee8" : "#3d5a78",
                }}
              >
                form
              </button>
              <div style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>{collapsed ? "▸" : "▾"}</div>
            </div>
          </div>
        )}
        {!quickLog && !collapsed && expandedEditor}
      </div>
    )
  }

  // ── Cardio block ───────────────────────────────────────────────────────
  const cardioBlock = (day) => {
    const cd = CARDIO[day]
    if (cd.noCardio) return null
    const prescribedSessions = cd.sessions || []
    const entries = getCardioEntries(day)
    const modColor = { run: "#ef4444", bike: "#d97706", swim: "#0ea5e9", walk: "#22c55e", row: "#8b5cf6" }
    const BUILTIN_MODS = ["run", "bike", "swim", "walk", "row"]
    const modLabel = { run: "Run", bike: "Bike", swim: "Swim", walk: "Walk", row: "Row" }
    const pastMods = [...new Set(
      (Array.isArray(schedLog) ? schedLog : [])
        .flatMap(entry => (Array.isArray(entry.cardio) ? entry.cardio : []).map(c => c.modality))
        .filter(m => m && !BUILTIN_MODS.includes(m))
    )].sort()
    const allMods = [...BUILTIN_MODS, ...pastMods]
    const allModLabels = Object.fromEntries(
      allMods.map(m => [m, modLabel[m] || m.charAt(0).toUpperCase() + m.slice(1)])
    )

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
            {(() => {
              const workoutSuggestion = chooseTodayWorkout(
                { type: "cardio", modality: ps.mod, name: ps.type },
                progressionReadiness,
                tendonStatus
              )
              const cardioFlags = getCardioFlags(ps.mod)
              const mtpItem = getMtpItem()
              const mtpUnsafe = mtpItem && !isMtpSafe(CARDIO_LIBRARY_IDS[ps.mod])
              return (
                <>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                    Suggested modification: <span style={{ color: "#e5e7eb" }}>{workoutSuggestion.modification}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>
                    Reason: {workoutSuggestion.reason}
                  </div>
                  {mtpUnsafe && (
                    <div style={{ fontSize: 11, color: "#f97316", marginBottom: 4, display: "flex", alignItems: "flex-start", gap: 4 }}>
                      <span style={{ flexShrink: 0 }}>●</span>
                      <span>Toe L OC is active ({mtpItem.currentScore}/5). This modality is not MTP-safe; substitute cycling or swimming.</span>
                    </div>
                  )}
                  {renderExerciseFlags(cardioFlags)}
                </>
              )
            })()}
            <div style={{ fontSize: 11, color: "#555" }}>{ps.rationale}</div>
            {ps.cnote && <div style={{ fontSize: 10, color: "#444", marginTop: 3, fontStyle: "italic" }}>{ps.cnote}</div>}
            {injuryTag(getInjuryNote(CARDIO_INJURY_REGIONS[ps.mod]))}
          </div>
        ))}

        <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 3px" }}>Log actual</div>
        <div style={{ fontSize: 10, color: "#444", marginBottom: 6 }}>
          Check the box when done. Change modality via the dropdown. Add extra sessions below.
        </div>
        {entries.map((entry, idx) => {
          const mc = modColor[entry.modality] || "#888"
          const target = prescribedSessions[idx] || cd
          const targetDuration = target?.dMin != null && target?.dMax != null ? `${target.dMin}–${target.dMax} min` : "minutes"
          const targetLabel = [target?.type, target?.intensity].filter(Boolean).join(" · ")
          const cardioChecked = isChecked(day, "cardio", idx)
          return (
            <div key={idx} style={{ marginBottom: 10, padding: "10px 12px", border: `0.5px solid #1e1e1e`, borderRadius: 7, background: "#0a0a0a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={cardioChecked}
                  onChange={() => toggleCheck(day, "cardio", idx)}
                  style={{ accentColor: "#4a9ee8", width: 14, height: 14, cursor: "pointer", flexShrink: 0 }}
                />
                <select value={entry.modality} onChange={e => setCardioEntryF(day, idx, "modality", e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${mc}22`, color: mc, border: `0.5px solid ${mc}`, outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {allMods.map(m => <option key={m} value={m}>{allModLabels[m]}</option>)}
                  <option key="__new__" value="__new__">+ New activity…</option>
                </select>
                {entry.modality === "__new__" && (
                  <input
                    type="text"
                    placeholder="activity name"
                    autoFocus
                    style={{ padding: "3px 7px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                      color: "#e8e8e8", background: "#111", border: "0.5px solid #252525",
                      outline: "none", fontFamily: "inherit", width: 110 }}
                    onBlur={e => {
                      const val = e.target.value.trim().toLowerCase()
                      if (val) setCardioEntryF(day, idx, "modality", val)
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const val = e.target.value.trim().toLowerCase()
                        if (val) setCardioEntryF(day, idx, "modality", val)
                      }
                    }}
                  />
                )}
                <span style={{ fontSize: idx === 0 ? 11 : 10, color: cardioChecked ? "#9ca3af" : idx === 0 ? "#555" : "#444" }}>
                  {cardioChecked ? "Completed" : "Planned"}{targetLabel ? ` · ${targetLabel}` : idx > 0 ? " · Additional session" : " · Cardio"}
                </span>
                {idx > 0 && (
                  <button onClick={() => removeCardioEntry(day, idx)}
                    style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 12 }}>✕</button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Duration (min)</div>
                  <input type="text" value={entry.duration} onChange={e => setCardioEntryF(day, idx, "duration", e.target.value)}
                    placeholder={targetDuration}
                    style={{ width: "100%", padding: "5px 7px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none" }} />
                  <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>Target: {targetDuration}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Distance (mi)</div>
                  <input type="text" inputMode="decimal" value={entry.distance || ""} onChange={e => setCardioEntryF(day, idx, "distance", e.target.value)}
                    placeholder={target?.dist || "miles"}
                    style={{ width: "100%", padding: "5px 7px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Calories (kcal)</div>
                  <input type="text" inputMode="numeric" value={entry.calories || ""} onChange={e => setCardioEntryF(day, idx, "calories", e.target.value)}
                    placeholder="from watch"
                    style={{ width: "100%", padding: "5px 7px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Avg HR (bpm)</div>
                  <input type="text" inputMode="numeric" value={entry.hr || ""} onChange={e => setCardioEntryF(day, idx, "hr", e.target.value)}
                    placeholder="from watch"
                    style={{ width: "100%", padding: "5px 7px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none" }} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Notes</div>
                  <input type="text" value={entry.notes} onChange={e => setCardioEntryF(day, idx, "notes", e.target.value)}
                    placeholder="optional notes"
                    style={{ width: "100%", padding: "5px 7px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none" }} />
                </div>
              </div>
            </div>
          )
        })}
        <button
          onClick={() => addCardioEntry(day)}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "6px",
            border: "0.5px dashed #333",
            borderRadius: 5,
            background: "transparent",
            color: "#4a9ee8",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit"
          }}
        >
          + Add cardio session
        </button>
        {cd.cnote && <div style={{ fontSize: 10, color: "#555", lineHeight: 1.4, marginTop: 8 }}>{cd.cnote}</div>}
      </div>
    )
  }

  const tendonBlock = (day) => {
    const entries = getTendonEntries(day)
    if (!entries.length) {
      return (
        <div style={{ padding: "12px 14px", fontSize: 12, color: "#777" }}>
          No tendon-support work assigned for this day yet.
        </div>
      )
    }

    return (
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#fcd34d", fontWeight: 700 }}>Structural tendon work</div>
          <button
            type="button"
            onClick={() => setScheduleInfoOpen(prev => ({ ...prev, tendon: !prev.tendon }))}
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "1px solid #5a4516",
              background: scheduleInfoOpen.tendon ? "rgba(245,158,11,0.18)" : "transparent",
              color: "#fcd34d",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              flex: "0 0 auto"
            }}
          >
            {scheduleInfoOpen.tendon ? "×" : "i"}
          </button>
        </div>
        {scheduleInfoOpen.tendon && (
          <div style={{ marginBottom: 10, padding: "8px 10px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.24)", borderRadius: 6, fontSize: 11, color: "#fcd34d", lineHeight: 1.5 }}>
            Tendon work counts as structural training. It supports Achilles, forefoot, and knee capacity and should be logged explicitly.
          </div>
        )}
        {entries.map((entry, idx) => {
          const checked = isChecked(day, "tendon", idx)
          return (
            <div key={`${entry.id}_${idx}`} style={{ marginBottom: 10, padding: "10px 12px", border: "0.5px solid #4a3308", borderRadius: 7, background: "linear-gradient(180deg, rgba(36,23,7,0.95) 0%, rgba(10,10,10,0.96) 100%)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCheck(day, "tendon", idx)}
                  style={{ accentColor: "#f59e0b", width: 14, height: 14, cursor: "pointer", flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f8e3a3" }}>{entry.name}</div>
                  <div style={{ fontSize: 10, color: "#8b6d2d", marginTop: 2 }}>
                    {checked ? "Included in session log" : "Planned but not yet included"} · {formatRxSummary(entry.sets, entry.reps, entry.load)}
                  </div>
                </div>
              </div>
              <SchExCard
                ex={entry}
                setData={entry.def || []}
                accent="#f59e0b"
                onUpdate={(setIdx, field, value) => setTendonSetField(day, idx, setIdx, field, value)}
                onAdd={() => addTendonSet(day, idx)}
                onRemove={setIdx => removeTendonSet(day, idx, setIdx)}
              />
            </div>
          )
        })}
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
          <input type="date" value={sessionDate} max={todayISO()} onChange={e => {
            const nextDate = e.target.value
            setSessionDate(nextDate)
            const nextDay = dayKeyFromScheduleDate(nextDate)
            if (nextDay) switchScheduleDay(nextDay)
          }}
            style={{ flex: 1, padding: "5px 8px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 13, fontWeight: 600, color: sessionDate !== todayISO() ? "#d97706" : "#e8e8e8", background: "#111", fontFamily: "inherit", outline: "none", colorScheme: "dark" }} />
          {sessionDate !== todayISO() && (
            <button onClick={() => {
              const today = todayISO()
              setSessionDate(today)
              const todayDay = dayKeyFromScheduleDate(today)
              if (todayDay) switchScheduleDay(todayDay)
            }}
              style={{ padding: "4px 10px", border: "0.5px solid #252525", borderRadius: 5, fontSize: 11, color: "#666", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>Today</button>
          )}
        </div>
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#0a0a12", border: "0.5px solid #1e1e2e", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7F77DD", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Log Sleep
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              value={sleepInputDate}
              onChange={e => setSleepInputDate(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 5, fontSize: 12, background: "#111", border: "0.5px solid #252525", color: "#e8e8e8", fontFamily: "inherit", outline: "none" }}
            />
            <input
              type="number"
              min="0"
              max="16"
              step="0.25"
              placeholder="hours (e.g. 7.5)"
              value={sleepInputHours}
              onChange={e => setSleepInputHours(e.target.value)}
              style={{ width: 130, padding: "5px 8px", borderRadius: 5, fontSize: 12, background: "#111", border: "0.5px solid #252525", color: "#e8e8e8", fontFamily: "inherit", outline: "none" }}
            />
            <button
              onClick={() => {
                if (sleepInputDate && sleepInputHours) {
                  addManualSleepEntry(sleepInputDate, sleepInputHours)
                  setSleepInputHours("")
                }
              }}
              style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#7F77DD22", color: "#7F77DD", border: "0.5px solid #7F77DD", cursor: "pointer", fontFamily: "inherit" }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Recent sleep entries — editable */}
        {(() => {
          const recent = (Array.isArray(sleepRecords) ? sleepRecords : [])
            .filter(r => getSleepRecordDate(r))
            .sort((a, b) => String(getSleepRecordDate(b)).localeCompare(String(getSleepRecordDate(a))))
            .slice(0, 10)
          if (!recent.length) return null
          return (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#0a0a12', border: '0.5px solid #1e1e2e', borderRadius: 8 }}>
              <button
                onClick={() => setSleepEntriesOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: '#7F77DD', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: sleepEntriesOpen ? 8 : 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: '100%' }}
              >
                <span>{sleepEntriesOpen ? '▾' : '▸'}</span>
                <span>Recent sleep entries</span>
              </button>
              {sleepEntriesOpen && recent.map(r => {
                const d = getSleepRecordDate(r)
                const hrs = r.duration_min ? (r.duration_min / 60).toFixed(1) : '?'
                const src = r.source || 'manual'
                return (
                  <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid #1a1b2e' }}>
                    <span style={{ fontSize: 12, color: '#bbb' }}>{d}</span>
                    <span style={{ fontSize: 12, color: '#e8e8e8', fontWeight: 600 }}>{hrs}h</span>
                    <span style={{ fontSize: 10, color: '#555' }}>{src}</span>
                    <button
                      onClick={() => {
                        setSleepInputDate(d)
                        setSleepInputHours(hrs)
                      }}
                      style={{ fontSize: 10, color: '#4a9ee8', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                    >
                      edit
                    </button>
                    <button
                      onClick={() => deleteSleepEntry(d)}
                      style={{ fontSize: 10, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })()}

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
                  {entry.rpe != null && (
                    <div style={{ fontSize: 10, color: "#667", marginTop: 3 }}>
                      RPE {entry.rpe}/10 — {entry.rpe <= 3 ? "Very easy" : entry.rpe <= 5 ? "Moderate" : entry.rpe <= 7 ? "Hard" : entry.rpe <= 9 ? "Very hard" : "Max effort"}
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

          if (pendingVenue === venue) {
            const day = activeDay
            const prog = getProgDay(day)
            const allExs = [
              ...(prog.exercises || []).map(ex => ({ id: ex.id, name: ex.n, venue: ex.venue || null })),
              ...getCustomExercises(day).map(e => ({ id: e.id, name: e.n, venue: null }))
            ]
            const selectedExerciseCount = Object.keys(pendingChecked).filter(id => pendingChecked[id]).length
            const skippedExerciseCount = Math.max(0, allExs.length - selectedExerciseCount)
            const selectedWarmupCount = (prog.warmup || []).filter((_, idx) => isChecked(day, "warmup", idx)).length
            const selectedTendonCount = getTendonEntries(day).filter((_, idx) => isChecked(day, "tendon", idx)).length
            const selectedCardioCount = getCardioEntries(day).filter((_, idx) => isChecked(day, "cardio", idx)).length
            const hasVenueTags = allExs.some(ex => ex.venue != null)
            const ymcaExs = allExs.filter(ex => ex.venue === "YMCA" || ex.venue == null && !hasVenueTags)
            const knrExs  = allExs.filter(ex => ex.venue === "KNR")
            const untagged = allExs.filter(ex => ex.venue == null && hasVenueTags)
            const grouped = hasVenueTags
              ? [
                  ...(ymcaExs.length ? [{ groupLabel: "YMCA (5:30–7:00)", color: "#d97706", items: ymcaExs }] : []),
                  ...(knrExs.length  ? [{ groupLabel: "KNR (9:35–10:45)",  color: "#3b82f6", items: knrExs  }] : []),
                  ...(untagged.length ? [{ groupLabel: "Other", color: "#666", items: untagged }] : []),
                ]
              : [{ groupLabel: null, items: allExs }]
            return (
              <div key={venue} style={{ marginBottom: 10, padding: "14px", border: `0.5px solid ${venue === "knr" ? "#3b82f6" : "#d97706"}`, borderRadius: 8, background: "#0a0a0a" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ced2f0", marginBottom: 10 }}>
                  Logging: {VENUE_LABELS[venue]}
                </div>
                <div style={{ marginBottom: 10, padding: "8px 10px", background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: 6, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
                  Checked items will be included in the log.
                  <div style={{ marginTop: 4, color: "#ced2f0" }}>
                    Strength {selectedExerciseCount} included{skippedExerciseCount ? ` · ${skippedExerciseCount} skipped` : ""} · Warm-up {selectedWarmupCount} · Tendon {selectedTendonCount} · Cardio {selectedCardioCount}
                  </div>
                </div>
                {grouped.map(group => (
                  <div key={group.groupLabel || "all"}>
                    {group.groupLabel && (
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: group.color, marginTop: 8, marginBottom: 4 }}>
                        {group.groupLabel}
                      </div>
                    )}
                    {group.items.map(ex => (
                      <label key={ex.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", fontSize: 13, color: "#ccc" }}>
                        <input
                          type="checkbox"
                          checked={pendingChecked[ex.id] ?? true}
                          onChange={e => setPendingChecked(prev => ({ ...prev, [ex.id]: e.target.checked }))}
                          style={{ accentColor: "#4a9ee8", width: 14, height: 14, cursor: "pointer" }}
                        />
                        {ex.name}
                      </label>
                    ))}
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 0" }}>
                  <div style={{ fontSize: 12, color: "#888", minWidth: 100, flexShrink: 0 }}>
                    Session RPE: <strong style={{ color: "#ced2f0" }}>{sessionRPE[`${activeDay}_${venue}`] ?? "—"}/10</strong>
                  </div>
                  <input type="range" min={1} max={10} step={1}
                    value={sessionRPE[`${activeDay}_${venue}`] ?? 6}
                    onChange={e => setSessionRPE(prev => ({ ...prev, [`${activeDay}_${venue}`]: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: "#4a9ee8" }} />
                  <div style={{ fontSize: 10, color: "#555", minWidth: 80, flexShrink: 0 }}>
                    {(() => {
                      const r = sessionRPE[`${activeDay}_${venue}`] ?? 6
                      return r <= 3 ? "Very easy" : r <= 5 ? "Moderate" : r <= 7 ? "Hard" : r <= 9 ? "Very hard" : "Max effort"
                    })()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => setPendingVenue(null)}
                    style={{ flex: 1, padding: 10, background: "transparent", color: "#888", border: "0.5px solid #333", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  <button onClick={() => {
                    const checkedIds = new Set(Object.keys(pendingChecked).filter(id => pendingChecked[id]))
                    logSession(venue, checkedIds)
                    setPendingVenue(null)
                  }}
                    style={{ flex: 1, padding: 10, background: venue === "knr" ? "#0F6E56" : "#185FA5", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Confirm log
                  </button>
                </div>
              </div>
            )
          }

          return (
            <button key={venue} onClick={() => {
              const day = activeDay
              const prog = getProgDay(day)
              const allExs = [
                ...(prog.exercises || []).map(ex => ({ id: ex.id, venue: ex.venue || null })),
                ...getCustomExercises(day).map(e => ({ id: e.id, venue: null }))
              ]
              const isYmca = venue === "ymca"
              setPendingChecked(Object.fromEntries(allExs.map(ex => [
                ex.id,
                isChecked(day, "exercise", ex.id) && (ex.venue == null || (isYmca ? ex.venue === "YMCA" : ex.venue === "KNR"))
              ])))
              setPendingVenue(venue)
            }}
              style={{ width: "100%", padding: 13, background: venue === "knr" ? "#0F6E56" : "#185FA5", color: "#fff", border: "none", borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
              Log {label}{timeLabel}
            </button>
          )
        })}
      </div>
    )
  }

  const prog = getProgDay(activeDay)
  const meta = SCH_META[activeDay] || SMETA[activeDay] || {}
  const hasMainProgram = (prog.exercises?.length || 0) > 0 || getCustomExercises(activeDay).length > 0 || inlineExForm === activeDay
  const scheduleMismatchReport = useMemo(
    () => buildScheduleDayDateMismatchReport(schedLog),
    [schedLog]
  )

  return (
    <div style={{ color: "#d8d8d8", position: "relative" }}>
      <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importLog} />
      {Array.isArray(scheduleFeedback) && scheduleFeedback.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {safeScheduleFeedback.slice(0, 3).map(message => (
            <div key={message} style={{ padding: "10px 12px", background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.18)", borderLeft: "3px solid #38bdf8", borderRadius: 8, fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>
              {message}
            </div>
          ))}
        </div>
      )}
      <DailyReadinessPanel readinessScore={readinessScore} latestHealthFit={latestHealthFit} ocItems={ocItems} computedTSB={computedTSB} tsbV2Panel={tsbV2Panel} />
      <ScheduleMismatchDiagnostics
        report={scheduleMismatchReport}
        onOpenEntry={openDiagnosticEntry}
        onEditEntry={editEntry}
        onResolveGroup={resolveDiagnosticConflict}
        expanded={openSections.diagnostics}
        onToggle={() => toggleSection("diagnostics")}
      />
      {/* Day navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 3, background: "#0a0a0a", borderRadius: 8, padding: 4, border: "1px solid #1a1a1a", flexWrap: "wrap" }}>
          {SDAYS.map(d => {
            const m = SCH_META[d] || SMETA[d] || {}
            const active = d === activeDay && schedView === "schedule"
            const isSplit = SPLIT_DAYS.includes(d)
            return (
              <button key={d} onClick={() => { switchScheduleDay(d); setSchedView("schedule"); setSavedEntries(prev => ({ ...prev })) }}
                style={{ padding: "6px 12px", border: "none", cursor: "pointer", background: active ? (m.color || "#185FA5") + "22" : "transparent", fontSize: 12, fontWeight: active ? 700 : 500, letterSpacing: "0.06em", textTransform: "uppercase", color: active ? (m.color || "#185FA5") : "#3a3a3a", borderRadius: 6, position: "relative" }}>
                {d}
                {isSplit && <div style={{ fontSize: 7, color: "#7F77DD", marginTop: 1 }}>split</div>}
                {!isSplit && <div style={{ fontSize: 8, opacity: 0.7, marginTop: 1, color: m.venue === "KNR" ? "#3b82f6" : m.venue === "—" ? "#333" : "#d97706" }}>{m.venue}</div>}
              </button>
            )
          })}
        </div>
	<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
	          <button onClick={() => setShowSetTimer(true)} style={buttonStyle(true)}>
	            Set Timer
	          </button>
          <button
            onClick={() => setQuickLog(q => !q)}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              border: `1px solid ${quickLog ? "#4a9ee8" : "#1e2a3a"}`,
              background: quickLog ? "rgba(74,158,232,0.15)" : "transparent",
              color: quickLog ? "#4a9ee8" : "#555", cursor: "pointer"
            }}
          >
            Quick
          </button>
	          <button onClick={() => setSchedView(v => v === "log" ? "schedule" : "log")} style={buttonStyle(false)}>
	            {schedView === "log" ? "◀ Schedule" : `Log (${schedLog.length})`}
          </button>
          <button onClick={exportLog} style={buttonStyle(false)}>Export ↓</button>
          <button onClick={() => importRef.current?.click()} style={buttonStyle(false)}>Import ↑</button>
          {schedView === "log" && (
            <button
              onClick={async () => {
                const result = await saveScheduleKey("wt-log", schedLog)
                showToast(result?.synced ? "Synced ✓" : "Sync failed — check connection")
              }}
              style={buttonStyle(false)}
            >
              Sync to Cloud ↑
            </button>
          )}
        </div>
      </div>

      {schedView === "log" && (
        <ScheduleLogView
          log={schedLog}
          expanded={expandedLog}
          setExpanded={setExpandedLog}
          onDelete={deleteEntry}
          onEdit={editEntry}
          highlightedId={highlightedLogEntryId}
          setEntryRef={setLogEntryRef}
        />
      )}

      {schedView === "schedule" && (
        <>
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
                YMCA 5:00–7:00 am
              </div>
            )}
          </div>

          {/* topNote banner (PLAN) */}
          {prog._topNote && (
            <div style={{ marginBottom: 10, padding: "7px 12px", background: "rgba(59,130,246,0.07)", border: "0.5px solid rgba(59,130,246,0.2)", borderRadius: 6, fontSize: 11, color: "#6a9adf" }}>
              {prog._topNote}
            </div>
          )}

          {/* Stretch */}
          {prog.stretch?.length > 0 && checklistSection(activeDay, "stretch", prog.stretch, "#7F77DD", "Stretch", "~5 min")}

          {/* Warmup */}
          {prog.warmup?.length > 0 && checklistSection(activeDay, "warmup", prog.warmup, "#BA7517", "Warm-up", "")}

          {/* Tendon work */}
          <div style={{ border: "0.5px solid #4a3308", borderRadius: 8, marginBottom: 10, overflow: "hidden", boxShadow: "0 0 0 1px rgba(245,158,11,0.08)" }}>
            {secHdr("tendon", "Tendon Work", "#f59e0b", getTendonEntries(activeDay).length ? `${getTendonEntries(activeDay).filter((_, idx) => isChecked(activeDay, "tendon", idx)).length}/${getTendonEntries(activeDay).length} selected` : "")}
            {openSections.tendon && tendonBlock(activeDay)}
          </div>

          {/* Main program */}
          {hasMainProgram && (
            <div style={{ border: "0.5px solid #1a1a1a", borderRadius: 8, marginBottom: 10, overflow: "visible" }}>
              {secHdr("main", "Main Program", "#185FA5", `${prog.exercises?.filter(ex => isChecked(activeDay, "exercise", ex.id)).length || 0}/${prog.exercises?.length || 0} selected`)}
              {openSections.main && (
                <div style={{ padding: "4px 14px 12px" }}>
                  {prog.exercises?.length > 0
                    ? (() => {
                      let lastSH = null
                      return prog.exercises.map(ex => {
                        const showSH = ex._sectionH && ex._sectionH !== lastSH
                        lastSH = ex._sectionH || lastSH
                        return (
                          <React.Fragment key={ex.id}>
                            {showSH && <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.12em", margin: "10px 0 3px", fontFamily: "'Barlow Condensed',sans-serif" }}>{ex._sectionH}</div>}
                            {exCard(ex, activeDay)}
                          </React.Fragment>
                        )
                      })
                    })()
                    : <div style={{ textAlign: "center", padding: 16, color: "#444", fontSize: 13 }}>Active recovery — no resistance training today.</div>}
                  {getCustomExercises(activeDay).map(ex => exCard(ex, activeDay, true))}
                  {inlineExForm === activeDay ? (
                  <div style={{ marginTop: 8, padding: "8px", background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: 6, position: "static" }}>
                    <input
                      ref={exInputRef}
                      autoFocus
                      value={inlineExName}
                      onChange={e => {
                        const val = e.target.value
                        setInlineExName(val)
                        setInlineExDbId(null)
                        if (exInputRef.current) setExInputRect(exInputRef.current.getBoundingClientRect())
                        if (!val || val.length < 2) {
                          setInlineExResults([])
                          setExSuggestions([])
                          setShowExSuggestions(false)
                          return
                        }
                        const q = val.toLowerCase()
                        const qNorm = normExName(val)
                        // DB matches (from cache — pre-warmed when form opened)
                        const dbMatches = (_exDbCache || [])
                          .filter(ex => {
                            const n = normExName(ex.name)
                            return n.includes(qNorm) ||
                              qNorm.split(" ").filter(w => w.length > 2).some(w => n.includes(w))
                          })
                          .slice(0, 6)
                          .map(ex => ({ name: ex.name, dbId: ex.id, source: "library" }))
                        // Name canonicalization — collapse known variant spellings to a
                        // single representative name so the history list isn't cluttered
                        const CANONICAL_NAMES = {
                          "bicep curls": "Biceps Curl",
                          "bicep curl": "Biceps Curl",
                          "bicep curls (db / bb)": "Biceps Curl",
                          "biceps curl — db/bb palms up": "Biceps Curl",
                          "biceps curl — cable rope neutral": "Biceps Curl",
                          "biceps curl (db/bb)": "Biceps Curl",
                          "bicep curls — cable / rope (neutral grip)": "Biceps Curl — Cable Rope",
                          "hammer curls": "Hammer Curl",
                          "leg curl machine": "Leg Curl",
                          "leg curls": "Leg Curl",
                          "hip thrust bilateral": "Hip Thrust",
                          "romanian deadlift": "Romanian Deadlift",
                          "rdl": "Romanian Deadlift",
                          "lat pull down": "Lat Pulldown",
                          "lateral raises": "Lateral Raise",
                          "face pulls": "Face Pull",
                          "pallof press": "Pallof Press",
                          "russian twist": "Russian Twists",
                        }
                        const canonicalize = n => CANONICAL_NAMES[n.toLowerCase()] || n
                        const histMatches = [...new Map(
                          historicalExerciseNames
                            .filter(n => n.toLowerCase().includes(q))
                            .map(n => [canonicalize(n).toLowerCase(), { name: canonicalize(n), dbId: null, source: "history" }])
                        ).values()].slice(0, 3)
                        const matches = [...dbMatches, ...histMatches].slice(0, 8)
                        setInlineExResults(matches)
                        setExSuggestions(matches)
                        setShowExSuggestions(matches.length > 0)
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          setShowExSuggestions(false)
                          setInlineExResults([])
                          setExSuggestions([])
                          commitCustomExercise()
                        }
                        if (e.key === "Escape") {
                          setShowExSuggestions(false)
                          setInlineExForm(null)
                          setInlineExResults([])
                          setExSuggestions([])
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowExSuggestions(false), 150)}
                      placeholder="Search exercises (e.g. hip thrust, lat pulldown)"
                      style={{ ...inputStyle(), marginBottom: 4, fontSize: 12, padding: "6px 8px", width: "100%", boxSizing: "border-box" }}
                    />
                    {showExSuggestions && exInputRect && exSuggestions.length > 0 && !inlineExDbId && (
                      <div style={{
                        position: "fixed",
                        top: exInputRect.bottom + 2,
                        left: exInputRect.left,
                        width: exInputRect.width,
                        background: "#0d0e1c", border: "1px solid #1e2a3a",
                        borderRadius: 5, zIndex: 99999, maxHeight: 300, overflowY: "auto",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                      }}>
                        {exSuggestions.map((r, i) => (
                          <div key={i}
                            onMouseDown={e => {
                              e.preventDefault()  // keep input focused
                              setInlineExName(r.name)
                              setInlineExDbId(r.dbId)
                              setInlineExResults([])
                              setExSuggestions([])
                              setShowExSuggestions(false)
                            }}
                            style={{
                              padding: "7px 10px", cursor: "pointer", fontSize: 12,
                              borderBottom: i < inlineExResults.length - 1 ? "1px solid #1a1b2e" : "none",
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              background: "transparent"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "#131428"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <span style={{ color: "#d8d8d8", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{r.name}</span>
                            <span style={{ fontSize: 10, color: r.source === "library" ? "#4a9ee8" : "#555", flexShrink: 0, minWidth: 44, textAlign: "right" }}>
                              {r.source}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {inlineExDbId && (
                      <div style={{ fontSize: 10, color: "#4a9ee8", marginBottom: 4, marginTop: 2 }}>
                        Linked to library — form guide will be available
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button onClick={() => { setShowExSuggestions(false); setExSuggestions([]); setInlineExResults([]); commitCustomExercise() }}
                        style={{ flex: 1, padding: "5px 0", background: "#185FA5", border: "none", borderRadius: 5, color: "#fff", fontSize: 12, cursor: "pointer" }}>
                        Add exercise
                      </button>
                      <button onClick={() => { setInlineExForm(null); setShowExSuggestions(false); setExSuggestions([]); setInlineExResults([]) }}
                        style={{ padding: "5px 10px", background: "transparent", border: "0.5px solid #333", borderRadius: 5, color: "#555", fontSize: 12, cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                  ) : (
                    <button onClick={() => addCustomExercise(activeDay)}
                      style={{ width: "100%", marginTop: 8, padding: "6px", border: "0.5px dashed #333", borderRadius: 5, background: "transparent", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      + Add exercise
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Core */}
          {prog.core?.length > 0 && checklistSection(activeDay, "core", prog.core, "#3B6D11", "Core", "~5 min")}

          {/* Cooldown */}
          {prog.cooldown?.length > 0 && checklistSection(activeDay, "cooldown", prog.cooldown, "#6366f1", "Cooldown / Post-Run Stretch", "")}

          {/* Cardio */}
          {!CARDIO[activeDay]?.noCardio && (
            <div style={{ border: "0.5px solid #1a1a1a", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
              {secHdr("cardio", "Cardio", "#993C1D", "")}
              {openSections.cardio && cardioBlock(activeDay)}
            </div>
          )}

	          {logBar()}
	        </>
	      )}

	      {showSetTimer && <GymSetTimerModal onClose={() => setShowSetTimer(false)} />}

	      {toast && (
	        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid #333", color: "#e8e8e8", padding: "8px 20px", borderRadius: 8, fontSize: 13, zIndex: 999, pointerEvents: "none" }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function GymSetTimerModal({ onClose }) {
  const timerMachineStorageKey = "lift_timer_machines"
  const normalizeMachineName = value => String(value || "").trim().replace(/\s+/g, " ")
  const sortMachineNames = names => [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  const mergeMachineNames = names => {
    const byKey = new Map()
    ;(names || []).forEach(name => {
      const normalized = normalizeMachineName(name)
      if (!normalized) return
      const key = normalized.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, normalized)
    })
    return sortMachineNames([...byKey.values()])
  }

  const [machineName, setMachineName] = useState("")
  const [savedMachineNames, setSavedMachineNames] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      return mergeMachineNames(JSON.parse(window.localStorage.getItem(timerMachineStorageKey) || "[]"))
    } catch {
      return []
    }
  })
  const [sets, setSets] = useState(3)
  const [workSec, setWorkSec] = useState(45)
  const [restSec, setRestSec] = useState(60)
  const [showOpposite, setShowOpposite] = useState(false)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [anchorMs, setAnchorMs] = useState(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 390 : window.innerWidth,
    height: typeof window === "undefined" ? 844 : window.innerHeight
  }))
  const panelRef = useRef(null)

  const clampInt = (value, min, max) => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n)) return min
    return Math.max(min, Math.min(max, n))
  }

  const phases = useMemo(() => {
    const count = clampInt(sets, 1, 20)
    const work = clampInt(workSec, 5, 1800)
    const rest = clampInt(restSec, 0, 1800)
    const out = []

    for (let i = 1; i <= count; i += 1) {
      out.push({ kind: "work", label: `Set ${i} of ${count}`, short: `Set ${i}`, duration: work, setNo: i })
      if (i < count && rest > 0) out.push({ kind: "rest", label: `Rest after Set ${i}`, short: "Rest", duration: rest, setNo: i })
    }

    return out
  }, [sets, workSec, restSec])

  const totalSec = phases.reduce((sum, phase) => sum + phase.duration, 0)
  const liveElapsedSec = Math.min(
    totalSec,
    Math.floor((elapsedMs + (running && anchorMs ? nowMs - anchorMs : 0)) / 1000)
  )
  const remainingSec = Math.max(0, totalSec - liveElapsedSec)
  const isComplete = started && remainingSec <= 0

  const phaseState = useMemo(() => {
    let cursor = 0
    for (let i = 0; i < phases.length; i += 1) {
      const phase = phases[i]
      const next = cursor + phase.duration
      if (liveElapsedSec < next || i === phases.length - 1) {
        const elapsedInPhase = Math.max(0, liveElapsedSec - cursor)
        return {
          index: i,
          phase,
          phaseRemaining: Math.max(0, phase.duration - elapsedInPhase),
          phaseElapsed: elapsedInPhase
        }
      }
      cursor = next
    }

    return { index: phases.length - 1, phase: phases[phases.length - 1], phaseRemaining: 0, phaseElapsed: 0 }
  }, [phases, liveElapsedSec])

  useEffect(() => {
    if (!running) return undefined
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (!running || !isComplete) return
    setElapsedMs(totalSec * 1000)
    setRunning(false)
    setAnchorMs(null)
  }, [isComplete, running, totalSec])

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    updateViewport()
    window.addEventListener("resize", updateViewport)
    window.addEventListener("orientationchange", updateViewport)
    return () => {
      window.removeEventListener("resize", updateViewport)
      window.removeEventListener("orientationchange", updateViewport)
    }
  }, [])

  const fmt = seconds => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0))
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${m}:${String(rem).padStart(2, "0")}`
  }

  const requestFullscreen = () => {
    const el = panelRef.current
    if (el?.requestFullscreen && document.fullscreenElement == null) {
      el.requestFullscreen().catch(() => {})
    }
  }

  const startTimer = () => {
    const normalizedMachineName = normalizeMachineName(machineName)
    if (normalizedMachineName) {
      const nextMachineNames = mergeMachineNames([...savedMachineNames, normalizedMachineName])
      setSavedMachineNames(nextMachineNames)
      setMachineName(normalizedMachineName)
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(timerMachineStorageKey, JSON.stringify(nextMachineNames))
        } catch {}
      }
    }
    setStarted(true)
    setRunning(true)
    setElapsedMs(0)
    setAnchorMs(Date.now())
    setNowMs(Date.now())
    requestFullscreen()
  }

  const pauseTimer = () => {
    if (!running) return
    const nextElapsed = Math.min(totalSec * 1000, elapsedMs + (Date.now() - (anchorMs || Date.now())))
    setElapsedMs(nextElapsed)
    setRunning(false)
    setAnchorMs(null)
  }

  const resumeTimer = () => {
    if (isComplete) return
    setRunning(true)
    setAnchorMs(Date.now())
    setNowMs(Date.now())
    requestFullscreen()
  }

  const skipPhase = () => {
    const elapsedBeforeCurrent = phases
      .slice(0, phaseState.index + 1)
      .reduce((sum, phase) => sum + phase.duration, 0)
    setElapsedMs(Math.min(totalSec * 1000, elapsedBeforeCurrent * 1000))
    setAnchorMs(running ? Date.now() : null)
    setNowMs(Date.now())
  }

  const resetTimer = () => {
    setRunning(false)
    setStarted(false)
    setElapsedMs(0)
    setAnchorMs(null)
  }

  const closeTimer = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
    onClose()
  }

  const clearSavedMachines = () => {
    setSavedMachineNames([])
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(timerMachineStorageKey)
      } catch {}
    }
  }

  const phase = phaseState.phase || phases[0]
  const phaseRemaining = isComplete ? 0 : phaseState.phaseRemaining
  const pulse = started && !isComplete && phaseRemaining <= 10
  const sequence = phases.map(p => p.short).join(" → ")

  const fillPct = totalSec > 0 ? Math.min(100, (liveElapsedSec / totalSec) * 100) : 0
  const controlsDisabled = phases.length === 0 || totalSec <= 0
  const panelBg = phase?.kind === "rest" ? "#031711" : "#07111f"
  const accent = phase?.kind === "rest" ? "#22c55e" : "#38bdf8"
  const phaseLabel = isComplete ? "Complete" : phase?.label || "Ready"
  const isLandscape = viewport.width > viewport.height
  const isShort = viewport.height < 640
  const isCompact = isLandscape || isShort
  const isTiny = viewport.height < 440
  const panelGap = isTiny ? 5 : isCompact ? 7 : 12
  const panelPadding = isTiny ? "6px" : isCompact ? "8px" : "14px"
  const headerTitleSize = isCompact ? 15 : 20
  const headerLabelSize = isCompact ? 9 : 11
  const oppositeTimeSize = isTiny ? "clamp(26px, 9vh, 42px)" : isCompact ? "clamp(30px, 10vh, 58px)" : "clamp(40px, 12vw, 88px)"
  const oppositeLabelSize = isCompact ? "clamp(11px, 3vh, 16px)" : "clamp(14px, 4vw, 24px)"
  const timerGap = isTiny ? 5 : isCompact ? 7 : 12
  const timerMinHeight = isTiny ? "150px" : isCompact ? "190px" : "300px"
  const phaseFontSize = isTiny ? "clamp(14px, 4vh, 20px)" : isCompact ? "clamp(15px, 5vh, 26px)" : "clamp(18px, 5vw, 34px)"
  const countdownFontSize = isTiny ? "clamp(58px, 25vh, 108px)" : isCompact ? "clamp(68px, 30vh, 152px)" : "clamp(92px, 24vh, 230px)"
  const metaFontSize = isCompact ? "clamp(12px, 4vh, 18px)" : "clamp(14px, 4vw, 24px)"
  const sequenceFontSize = isCompact ? "clamp(10px, 3vh, 14px)" : "clamp(12px, 3.5vw, 18px)"
  const timelineHeight = isCompact ? 10 : 12
  const timelineActiveHeight = isCompact ? 14 : 18
  const progressHeight = isCompact ? 8 : 12
  const controlPadding = isTiny ? 8 : isCompact ? 10 : 14
  const controlGap = isCompact ? 5 : 8
  const controlFontSize = isCompact ? 12 : 14

  return (
    <div ref={panelRef} style={{
      position: "fixed",
      inset: 0,
      zIndex: 5000,
      background: panelBg,
      color: "#f8fafc",
      padding: panelPadding,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: panelGap,
      overflow: "hidden"
    }}>
      {showOpposite && (
        <div style={{
          transform: "rotate(180deg)",
          textAlign: "center",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 8,
          padding: isCompact ? "3px 8px" : "7px 8px",
          background: "rgba(0,0,0,0.28)",
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: isCompact ? 8 : 12,
          maxHeight: isCompact ? 48 : 108
        }}>
          <div style={{ fontSize: oppositeTimeSize, fontWeight: 900, lineHeight: 0.9 }}>{fmt(remainingSec)}</div>
          <div style={{ fontSize: oppositeLabelSize, fontWeight: 800, color: accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{machineName || "Machine timer"}</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flex: "0 0 auto", minHeight: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: headerLabelSize, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.14em" }}>Machine timer</div>
          <div style={{ fontSize: headerTitleSize, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{machineName || "Unnamed machine"}</div>
        </div>
        <button onClick={closeTimer} style={{ ...buttonStyle(false), color: "#f8fafc", borderColor: "rgba(255,255,255,0.35)", padding: isCompact ? "6px 10px" : undefined }}>Close</button>
      </div>

      {!started && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: isCompact ? 5 : 8, flex: "0 0 auto" }}>
          <input value={machineName} onChange={e => setMachineName(e.target.value)} placeholder="Exercise or machine name" style={{ ...inputStyle(), fontSize: isCompact ? 14 : 16, padding: isCompact ? "7px 9px" : "10px 12px", background: "#020617", color: "#f8fafc" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#cbd5e1" }}>
            <input type="checkbox" checked={showOpposite} onChange={e => setShowOpposite(e.target.checked)} />
            flip
          </label>
          {savedMachineNames.length > 0 && (
            <>
              <select value="" onChange={e => { if (e.target.value) setMachineName(e.target.value) }} style={{ ...inputStyle(), fontSize: isCompact ? 13 : 15, padding: isCompact ? "6px 8px" : "8px 10px", background: "#020617", color: "#f8fafc" }}>
                <option value="">Saved machines</option>
                {savedMachineNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <button onClick={clearSavedMachines} style={{ ...buttonStyle(false), padding: isCompact ? "6px 8px" : "8px 10px", fontSize: isCompact ? 11 : 12, color: "#cbd5e1", borderColor: "rgba(255,255,255,0.25)" }}>Clear</button>
            </>
          )}
          {[
            ["Sets", sets, setSets, 1, 20],
            ["Work sec", workSec, setWorkSec, 5, 1800],
            ["Rest sec", restSec, setRestSec, 0, 1800]
          ].map(([label, value, setter, min, max]) => (
            <label key={label} style={{ display: "grid", gap: isCompact ? 2 : 4, fontSize: isCompact ? 10 : 11, color: "#cbd5e1" }}>
              {label}
              <input type="number" min={min} max={max} value={value} onChange={e => setter(clampInt(e.target.value, min, max))}
                style={{ ...inputStyle(), fontSize: isCompact ? 15 : 18, padding: isCompact ? "6px 8px" : "9px 10px", background: "#020617", color: "#f8fafc" }} />
            </label>
          ))}
        </div>
      )}

      <div style={{ flex: "1 1 auto", minHeight: timerMinHeight, display: "flex", flexDirection: "column", justifyContent: "center", gap: timerGap, textAlign: "center", overflow: "hidden" }}>
        <div style={{ fontSize: phaseFontSize, color: accent, fontWeight: 900, lineHeight: 1.05 }}>{phaseLabel}</div>
        <div style={{
          fontSize: countdownFontSize,
          fontWeight: 900,
          lineHeight: 0.82,
          letterSpacing: 0,
          color: isComplete ? "#22c55e" : "#ffffff",
          opacity: pulse && Math.floor(nowMs / 500) % 2 === 0 ? 0.58 : 1
        }}>
          {fmt(remainingSec)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: isCompact ? 10 : 18, flexWrap: "wrap", color: "#cbd5e1", fontSize: metaFontSize, lineHeight: 1.1 }}>
          <span>Elapsed {fmt(liveElapsedSec)}</span>
          <span>Phase {isComplete ? "0:00" : fmt(phaseRemaining)}</span>
        </div>
        <div style={{ color: "#94a3b8", fontSize: sequenceFontSize, lineHeight: 1.15, whiteSpace: isCompact ? "nowrap" : "normal", overflow: "hidden", textOverflow: "ellipsis" }}>{sequence}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, phases.length)}, minmax(0, 1fr))`, gap: isCompact ? 2 : 3, flex: "0 0 auto" }}>
        {phases.map((p, idx) => {
          const done = idx < phaseState.index || isComplete
          const active = idx === phaseState.index && started && !isComplete
          return (
            <div key={`${p.short}-${idx}`} style={{
              height: active ? timelineActiveHeight : timelineHeight,
              borderRadius: 4,
              background: done ? "#64748b" : p.kind === "rest" ? "#166534" : "#0369a1",
              outline: active ? `2px solid ${accent}` : "none",
              opacity: done ? 0.55 : 1
            }} title={`${p.label}: ${fmt(p.duration)}`} />
          )
        })}
      </div>
      <div style={{ height: progressHeight, background: "rgba(255,255,255,0.16)", borderRadius: 999, overflow: "hidden", flex: "0 0 auto" }}>
        <div style={{ width: `${fillPct}%`, height: "100%", background: accent, transition: "width 0.25s linear" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: controlGap, flex: "0 0 auto" }}>
        {!started || isComplete ? (
          <button disabled={controlsDisabled} onClick={startTimer} style={{ ...buttonStyle(true), padding: controlPadding, fontSize: controlFontSize, opacity: controlsDisabled ? 0.5 : 1 }}>Start</button>
        ) : running ? (
          <button onClick={pauseTimer} style={{ ...buttonStyle(false), padding: controlPadding, fontSize: controlFontSize, color: "#f8fafc", borderColor: "rgba(255,255,255,0.35)" }}>Pause</button>
        ) : (
          <button onClick={resumeTimer} style={{ ...buttonStyle(true), padding: controlPadding, fontSize: controlFontSize }}>Resume</button>
        )}
        <button disabled={!started || isComplete} onClick={skipPhase} style={{ ...buttonStyle(false), padding: controlPadding, fontSize: controlFontSize, color: "#f8fafc", borderColor: "rgba(255,255,255,0.35)", opacity: !started || isComplete ? 0.45 : 1 }}>Skip</button>
        <button onClick={resetTimer} style={{ ...buttonStyle(false), padding: controlPadding, fontSize: controlFontSize, color: "#f8fafc", borderColor: "rgba(255,255,255,0.35)" }}>Reset</button>
        <button onClick={() => setShowOpposite(v => !v)} style={{ ...buttonStyle(false), padding: controlPadding, fontSize: controlFontSize, color: "#f8fafc", borderColor: "rgba(255,255,255,0.35)" }}>Flip</button>
      </div>
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

function TrainingDashboard({ workouts, recentNutrition, healthFitDaily = [], schedLog = [] }) {
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
      const d = new Date(w.dateTime || w.date || w.start_date)
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
      const rawDate = new Date(w.dateTime || w.date || w.start_date)
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
          cardioDistanceEst: 0,
          hasEstimatedDistance: false,
          cardioCalories: 0,
          cardioCaloriesEst: 0,
          hasEstimatedCal: false,
          cardioMinutes: 0,
          strengthSessions: 0,
          totalWorkouts: 0
        }
      }

      grouped[key].totalWorkouts += 1

if (w.category === "Strength") {
  const strengthDate = String(w.date || w.start_date || w.dateTime || "").slice(0, 10)
  const hasValidStrengthDate = /^\d{4}-\d{2}-\d{2}$/.test(strengthDate)
  const strengthSource = String(w.source || "")
  const isScheduleSource = strengthSource === "LIFT Schedule Tab" || strengthSource === "ManualSchedule"
  const hasDuration = w.duration_min != null && w.duration_min !== ""
  const strengthDurationMin = hasDuration ? Number(w.duration_min) : null
  const isValidStrengthSession = hasValidStrengthDate && (
    isScheduleSource ||
    !hasDuration ||
    strengthDurationMin >= 5
  )
  if (rangeMode !== "weekly" || isValidStrengthSession) {
    grouped[key].strengthSessions += 1
  }
} else if (
  ["Running", "Walking", "Cycling", "Swimming", "Elliptical", "Rowing", "Stairs", "Machine Cardio", "Indoor Cycling"].includes(w.category)
) {
  const loggedDist =
    w.category === "Cycling"
      ? getCyclingDistanceMiles(w)
      : getWorkoutDistanceMiles(w)
  const estimatedDist =
    loggedDist > 0
      ? 0
      : (w.category === "Running" || w.category === "Walking") && Number(w.dur || 0) > 0
        ? Number(w.dur) / 10
        : 0
  grouped[key].cardioDistance += loggedDist
  grouped[key].cardioDistanceEst = (grouped[key].cardioDistanceEst || 0) + estimatedDist
  grouped[key].hasEstimatedDistance = grouped[key].hasEstimatedDistance || estimatedDist > 0
  const storedCal = Number.isFinite(Number(w.calories)) && Number(w.calories) > 0
    ? Number(w.calories)
    : null
  const estimatedCal = storedCal == null
    ? estimateCaloriesFromDuration(w.category, Number(w.dur || 0))
    : null
  grouped[key].cardioCalories += storedCal ?? 0
  grouped[key].cardioCaloriesEst = (grouped[key].cardioCaloriesEst || 0) + (estimatedCal ?? 0)
  grouped[key].hasEstimatedCal = grouped[key].hasEstimatedCal || estimatedCal != null
  grouped[key].cardioMinutes += Number(w.dur || 0)
}
    })

    return Object.values(grouped).sort((a, b) => a.bucket.localeCompare(b.bucket))
  }, [filteredWorkouts, rangeMode])

  const totals = useMemo(() => {
    return chartData.reduce(
      (acc, row) => {
        acc.cardioDistance += row.cardioDistance
        acc.cardioDistanceEst = (acc.cardioDistanceEst || 0) + row.cardioDistanceEst
        acc.cardioCalories += row.cardioCalories
        acc.cardioCaloriesEst = (acc.cardioCaloriesEst || 0) + row.cardioCaloriesEst
        acc.cardioMinutes += row.cardioMinutes
        acc.strengthSessions += row.strengthSessions
        acc.totalWorkouts += row.totalWorkouts
        return acc
      },
      {
        cardioDistance: 0,
        cardioDistanceEst: 0,
        cardioCalories: 0,
        cardioCaloriesEst: 0,
        cardioMinutes: 0,
        strengthSessions: 0,
        totalWorkouts: 0
      }
    )
  }, [chartData])

  useEffect(() => {
    if (true) return
    console.log("[LIFT DEBUG] TrainingDashboard counts", {
      workouts: summarizeWorkoutSet(workouts),
      filteredCount: Array.isArray(filteredWorkouts) ? filteredWorkouts.length : 0,
      chartBuckets: Array.isArray(chartData) ? chartData.length : 0,
      totals
    })
  }, [workouts, filteredWorkouts, chartData, totals])

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

  const showLiveStateDebug = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("debugLiveState") === "1"
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    if (!showLiveStateDebug) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = today.toISOString().slice(0, 10)
    const todayRow = chartData.find(row => row.bucket === todayKey) || null
    const todayWorkouts = (Array.isArray(workouts) ? workouts : [])
      .filter(workout => String(workout?.dateTime || workout?.date || workout?.start_date || "").slice(0, 10) === todayKey)
      .map(workout => ({
        type: workout?.type ?? workout?.canonical_type ?? null,
        category: workout?.category ?? null,
        date: workout?.date ?? null,
        dateTime: workout?.dateTime ?? null,
        start_date: workout?.start_date ?? null,
        distance: workout?.distance ?? null,
        distance_unit: workout?.distance_unit ?? workout?.unit ?? null,
        preferred_metrics_distance: workout?.preferred_metrics?.distance ?? null,
        sources_apple_distance: workout?.sources?.apple?.distance ?? null,
        sources_technogym_distance: workout?.sources?.technogym?.distance ?? null,
        dur: workout?.dur ?? workout?.duration_min ?? null,
        normalizedDistanceMiles: workout?.category === "Cycling"
          ? getCyclingDistanceMiles(workout)
          : getWorkoutDistanceMiles(workout)
      }))
    console.log("[LIFT DEBUG] Training dashboard live state", {
      todayKey,
      todayChartDataRow: todayRow,
      todayOperationalWorkouts: todayWorkouts,
    })
  }, [showLiveStateDebug, chartData, workouts])

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
<div style={valueStyle}>{fmt1((totals.cardioDistance || 0) + (totals.cardioDistanceEst || 0))}</div>
{totals.cardioDistanceEst > 0 && (
  <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
    {fmt1(totals.cardioDistanceEst)} estimated
  </div>
)}
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Cardio Calories (kcal)</div>
<div style={valueStyle}>{fmt0((totals.cardioCalories || 0) + (totals.cardioCaloriesEst || 0))}</div>
{totals.cardioCaloriesEst > 0 && (
  <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
    {fmt0(totals.cardioCaloriesEst)} estimated
  </div>
)}
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
<Bar dataKey="cardioDistance" name="Cardio Distance (logged)" fill="#4a9ee8" stackId="dist" />
<Bar dataKey="cardioDistanceEst" name="Cardio Distance (estimated)" fill="#4a9ee8" fillOpacity={0.35} stackId="dist" />
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
              <Bar dataKey="cardioCalories" name="Cardio Calories (logged)" fill="#ff9f6e" stackId="cal" />
              <Bar dataKey="cardioCaloriesEst" name="Cardio Calories (estimated)" fill="#ff9f6e" fillOpacity={0.35} stackId="cal" />
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

        {(() => {
          const EXERCISE_GROUPS = [
            {
              group: "Upper Body — Chest & Shoulders",
              color: "#f97316",
              exercises: [
                { name: "Chest Press",       match: "chest press",      baseline: 110 },
                { name: "Incline Press",      match: "incline",          baseline: 90  },
                { name: "Machine Flys",       match: "fly",              baseline: 30  },
                { name: "Triceps Pulldown",   match: "tricep",           baseline: 25  },
                { name: "Lateral Raise",      match: "lateral raise",    baseline: null },
                { name: "Face Pull",          match: "face pull",        baseline: null },
                { name: "Rear Delt Fly",      match: "rear delt",        baseline: null },
                { name: "Triceps Overhead",   match: "tricep overhead",  baseline: null },
                { name: "Cable Crossover",    match: "crossover",        baseline: null },
                { name: "Pushup Plank",       match: "pushup plank",     baseline: null },
              ]
            },
            {
              group: "Back & Arms",
              color: "#4a9ee8",
              exercises: [
                { name: "Lat Pulldown",       match: "lat pulldown",     baseline: 133 },
                { name: "Cable Row",          match: "cable row",        baseline: 133 },
                { name: "Bicep Curl",         match: "bicep curl",       baseline: 75  },
                { name: "Hammer Curl",        match: "hammer curl",      baseline: null },
                { name: "Inverted Row",       match: "inverted row",     baseline: null },
                { name: "Straight Arm Pulldown", match: "straight arm",  baseline: null },
                { name: "Pull ups",           match: "pull up",          baseline: null },
                { name: "Reverse Biceps",     match: "reverse bicep",    baseline: null },
                { name: "Chin-ups",           match: "chin",             baseline: null },
              ]
            },
            {
              group: "Lower Body",
              color: "#ffd166",
              exercises: [
                { name: "Hip Thrust",         match: "hip thrust",       baseline: null },
                { name: "Leg Press",          match: "leg press",        baseline: 320  },
                { name: "Leg Extension",      match: "leg extension",    baseline: null },
                { name: "Leg Curl",           match: "leg curl",         baseline: 125  },
                { name: "KB RDL",             match: "rdl",              baseline: null },
                { name: "Hip Abduction",      match: "abduction",        baseline: null },
                { name: "Hip Adduction",      match: "adduction",        baseline: null },
              ]
            },
            {
              group: "Tendons & Connective",
              color: "#f59e0b",
              exercises: [
                { name: "Eccentric Calf",     match: "eccentric calf",   baseline: null },
                { name: "Eccentric Lateral",  match: "eccentric lateral",baseline: null },
                { name: "Eccentric Biceps",   match: "eccentric biceps", baseline: null },
                { name: "Pallof Press",       match: "pallof",           baseline: null },
                { name: "Suitcase Carry",     match: "suitcase",         baseline: null },
                { name: "KB Swing",           match: "kb swing",         baseline: null },
                { name: "Shoulder Clock",     match: "shoulder clock",   baseline: null },
                { name: "Tibialis Raise",     match: "tibialis",         baseline: null },
                { name: "Calf Raise",         match: "calf raise",       baseline: null },
                { name: "Russian Twists",     match: "russian twist",    baseline: null },
              ]
            },
            {
              group: "Single-Limb Progressions",
              color: "#a78bfa",
              exercises: [
                { name: "Leg Press — SL",    match: "leg press — sl",    baseline: null },
                { name: "Hip Thrust — SL",   match: "hip thrust — sl",   baseline: null },
                { name: "Leg Curl — SL",     match: "leg curl — sl",     baseline: null },
                { name: "Calf Raise — SL",   match: "calf raise — sl",   baseline: null },
                { name: "Cable Row — SA",    match: "cable row — sa",    baseline: null },
                { name: "Lat Pulldown — SA", match: "lat pulldown — sa", baseline: null },
                { name: "Chest Press — SA",  match: "chest press — sa",  baseline: null },
                { name: "Leg Press SL",      match: "leg press sl",      baseline: null },
                { name: "Cable Row SA",      match: "cable row sa",      baseline: null },
              ]
            },
          ]

          const log = Array.isArray(schedLog) ? schedLog : []
          // Also pull from canonical sessions as a fallback source
          const allSessions = [...log]

          const renderGroup = ({ group, color, exercises }) => {
            const charts = exercises.map(({ name, match, baseline }) => {
              const points = []
              for (const sess of allSessions) {
                const ex = (sess.exercises || []).find(e =>
                  (e.exercise_name || "").toLowerCase().includes(match.toLowerCase())
                )
                if (!ex) continue
                const w = parseFloat(ex.actual?.load ?? ex.load)
                if (!Number.isFinite(w) || w <= 0) continue
                const r = parseFloat(ex.actual?.reps ?? ex.reps)
                // Use e1RM if reps available (Epley: w * (1 + r/30)), cap at 15 reps
                const e1rm = Number.isFinite(r) && r > 0 && r <= 15
                  ? Math.round(w * (1 + r / 30))
                  : w
                points.push({ date: (sess.date || sess.start_date || "").slice(0, 10), weight: e1rm })
              }
              const sorted = points
                .filter(p => p.date)
                .sort((a, b) => a.date.localeCompare(b.date))
              return { name, baseline, data: sorted }
            }).filter(c => {
                if (!c.data.length) return false
                const cutoff = new Date()
                cutoff.setDate(cutoff.getDate() - 90)
                const cutoffStr = cutoff.toISOString().slice(0, 10)
                return c.data.some(p => p.date >= cutoffStr)
              })

            if (!charts.length) return null

            return (
              <div key={group} style={{ background: "#0d0e1c", border: `1px solid ${color}22`, borderRadius: 10, padding: "14px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 10, borderBottom: `1px solid ${color}33`, paddingBottom: 6 }}>
                  {group}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {charts.map(({ name, baseline, data }) => (
                    <div key={name}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#8fa8d8", marginBottom: 3 }}>{name}</div>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                          <CartesianGrid stroke="#1a1b2e" />
                          <XAxis dataKey="date" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 8 }} width={32} />
                          <Tooltip formatter={v => [`${v} lb`, "e1RM"]} labelFormatter={l => l} />
                          <Line type="monotone" dataKey="weight" stroke={color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                          {baseline != null && (
                            <ReferenceLine y={baseline} stroke="#4a9ee8" strokeDasharray="4 2"
                              label={{ value: `B ${baseline}`, position: "insideTopRight", fontSize: 8, fill: "#4a9ee8" }} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          const anyData = EXERCISE_GROUPS.some(g =>
            g.exercises.some(({ match }) =>
              allSessions.some(sess =>
                (sess.exercises || []).some(e =>
                  (e.exercise_name || "").toLowerCase().includes(match.toLowerCase())
                )
              )
            )
          )

          if (!anyData) return (
            <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: 12, padding: 16, color: "#555", fontSize: 12 }}>
              Strength Progression — no logged sessions yet. Log sessions in the Schedule tab to populate these charts.
            </div>
          )

          return (
            <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ced2f0", marginBottom: 14 }}>
                Strength Progression
                <span style={{ fontSize: 10, fontWeight: 400, color: "#555", marginLeft: 8 }}>e1RM where reps logged · raw load otherwise</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {EXERCISE_GROUPS.map(g => renderGroup(g))}
              </div>
            </div>
          )
        })()}

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
function distanceValueToMiles(value, unit, workout) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0

  const u = String(unit || "").toLowerCase()
  if (u === "mi" || u === "mile" || u === "miles") return n
  if (u === "km" || u === "kilometer" || u === "kilometers") return n / 1.60934
  if (u === "m" || u === "meter" || u === "meters") return n / 1609.34
  if (u === "yd" || u === "yard" || u === "yards") return n / 1760
  if (workout?.source === "Technogym" || workout?.sources?.technogym) return n / 1609.34

  return n
}

function getWorkoutDistanceMiles(workout) {
  const explicit = Number(workout?.distanceMiles ?? workout?.distance_miles)
  if (Number.isFinite(explicit) && explicit > 0) return explicit

  const normalized = Number(workout?.distance)
  if (Number.isFinite(normalized) && normalized > 0) return normalized

  const pmDist = workout?.preferred_metrics?.distance
  const pmSource = String(pmDist?.source || "").toLowerCase()
  const pmUnit = pmDist?.unit ||
    (pmSource.includes("technogym")
      ? (workout?.sources?.technogym?.distance_unit || "m")
      : workout?.sources?.apple?.distance_unit)
  const preferredMiles = distanceValueToMiles(pmDist?.value, pmUnit, workout)
  if (preferredMiles > 0) return preferredMiles

  const technogymMiles = distanceValueToMiles(
    workout?.sources?.technogym?.distance,
    workout?.sources?.technogym?.distance_unit || "m",
    workout
  )
  if (technogymMiles > 0) return technogymMiles

const appleMiles = distanceValueToMiles(
    workout?.sources?.apple?.distance,
    workout?.sources?.apple?.distance_unit,
    workout
  )
  if (appleMiles > 0) return appleMiles

  const flatM = Number(workout?.preferred_metrics?.distance_mi)
  if (flatM > 0) return flatM / 1609.34

  return 0
}

// Returns cycling distance in miles.
// Only explicit recorded distance counts; duration-only cycling sessions do not
// get a mileage estimate because many are indoor bike workouts.
function getCyclingDistanceMiles(workout) {
  const explicit = getWorkoutDistanceMiles(workout)
  if (explicit > 0) return explicit
  return 0
}

function parseScheduleDurationMinutes(value) {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return null
  if (/^\d+\s*-\s*\d+$/.test(raw)) return null

  const exact = raw.match(/(\d+(?:\.\d+)?)/)
  if (!exact) return null
  const minutes = Number(exact[1])
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null
}

function parseScheduleDistanceMiles(value, modality = "") {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return null

  const milesMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/)
  if (milesMatch) return Number(milesMatch[1])

  const kmMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometer|kilometers)\b/)
  if (kmMatch) return Number(kmMatch[1]) / 1.60934

  const meterMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b/)
  if (meterMatch && !raw.includes("min")) return Number(meterMatch[1]) / 1609.34

  const yardMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:yd|yds|yrd|yrds|yard|yards)\b/)
  if (yardMatch) return Number(yardMatch[1]) / 1760

  const plain = raw.match(/^(\d+(?:\.\d+)?)$/)
  if (!plain) return null

  const n = Number(plain[1])
  if (!Number.isFinite(n) || n <= 0) return null
  if (String(modality || "").toLowerCase() === "swim" && n > 20) return null
  return n
}

function scoreScheduleWorkoutEvidence(workout) {
  let score = 0
  if (Number(workout?.distanceMiles || 0) > 0) score += 4
  if (Number(workout?.dur || 0) > 0) score += 3
  if (Number(workout?.hr || 0) > 0) score += 1
  if (Number(workout?.calories || 0) > 0) score += 1
  if (String(workout?.notes || "").trim()) score += 0.5
  return score
}

function buildScheduleCardioWorkoutsFromLog(logEntries) {
  const rows = []

  ;(Array.isArray(logEntries) ? logEntries : []).forEach(entry => {
    const cardioEntries = Array.isArray(entry?.cardio) ? entry.cardio : []
    cardioEntries.forEach((cardio, idx) => {
      const modality = String(cardio?.modality || "").toLowerCase()
      const distanceMiles =
        parseScheduleDistanceMiles(cardio?.distance, modality) ??
        parseScheduleDistanceMiles(cardio?.notes, modality)
      const durationMin = parseScheduleDurationMinutes(cardio?.duration)
      const hr = Number(cardio?.hr)
      const calories = Number(cardio?.calories)
      const hasActualEvidence =
        (Number.isFinite(durationMin) && durationMin > 0) ||
        (Number.isFinite(distanceMiles) && distanceMiles > 0) ||
        (Number.isFinite(hr) && hr > 0) ||
        (Number.isFinite(calories) && calories > 0)

      if (!hasActualEvidence) return

      rows.push({
        id: `${entry?.session_id || entry?.id || entry?.date || "schedule"}_${idx}`,
        session_id: entry?.session_id || null,
        _scheduleId: entry?.id ?? entry?.session_id ?? null,
        source: "ManualSchedule",
        date: entry?.date || String(entry?.logged_at || "").slice(0, 10) || null,
        time: "",
        dateTime: entry?.logged_at || (entry?.date ? `${String(entry.date).slice(0, 10)}T12:00:00` : null),
        type:
          modality === "run" ? "Running" :
          modality === "bike" ? "Cycling" :
          modality === "swim" ? "Swimming" :
          modality === "row" ? "Rowing" :
          "Other",
        modality,
        dur: Number.isFinite(durationMin) ? durationMin : 0,
        distance: Number.isFinite(distanceMiles) && distanceMiles > 0 ? distanceMiles : null,
        distanceMiles: Number.isFinite(distanceMiles) && distanceMiles > 0 ? distanceMiles : null,
        distance_miles: Number.isFinite(distanceMiles) && distanceMiles > 0 ? distanceMiles : null,
        hr: Number.isFinite(hr) && hr > 0 ? hr : null,
        calories: Number.isFinite(calories) && calories > 0 ? calories : null,
        notes: cardio?.notes || ""
      })
    })
  })

  const deduped = new Map()
  rows.forEach(row => {
    const key = [
      row.session_id || row._scheduleId || "",
      String(row.date || "").slice(0, 10),
      row.type,
      row.modality
    ].join("|")
    const existing = deduped.get(key)
    if (!existing || scoreScheduleWorkoutEvidence(row) > scoreScheduleWorkoutEvidence(existing)) {
      deduped.set(key, row)
    }
  })

  return [...deduped.values()].sort((a, b) =>
    String(a.dateTime || a.date || "").localeCompare(String(b.dateTime || b.date || ""))
  )
}

// Deduplicates stored schedule workouts. Prefer schedule IDs when present;
// otherwise fall back to date + type + rounded duration to collapse repeat writes.
function dedupeUfdWorkouts(workouts) {
  const map = new Map()

  const score = entry =>
    (entry?.calories != null ? 1 : 0) +
    (entry?.hr != null ? 1 : 0) +
    (Number(entry?.distance) > 0 ? 1 : 0) +
    (Number(entry?.dur) > 0 ? 1 : 0)

  for (const workout of (Array.isArray(workouts) ? workouts : [])) {
    const sid = workout?._scheduleId != null ? String(workout._scheduleId) : null
    const dateStr = String(workout?.dateTime || workout?.date || "").slice(0, 10)
    const durBucket = Math.round(Number(workout?.dur || 0) / 5) * 5
    const key = sid ? `sid:${sid}` : `${dateStr}|${workout?.type || ""}|${durBucket}`
    const existing = map.get(key)
    if (!existing || score(workout) > score(existing)) {
      map.set(key, workout)
    }
  }

  return [...map.values()].sort((a, b) =>
    String(a?.dateTime || a?.date || "").localeCompare(String(b?.dateTime || b?.date || ""))
  )
}

function getWorkoutCategoryForSummary(workout) {
  if (workout?.category) return workout.category

  const rawType = String(workout?.canonical_type || workout?.type || "").toLowerCase()
  const schedule = workout?.sources?.schedule || workout?.schedule || null
  const scheduleExercises = Array.isArray(schedule?.exercises) ? schedule.exercises : []
  const hasStrengthExercises = scheduleExercises.some(ex => String(ex?.variant || "").toLowerCase() !== "cardio")
  const cardioModalities = Array.isArray(schedule?.cardio)
    ? schedule.cardio.map(cardio => String(cardio?.modality || "").toLowerCase())
    : []

if (rawType.includes("traditional strength")) return "Strength"
if (rawType.includes("functional strength")) return "Strength"
if (rawType.includes("core")) return "Strength"
if (hasStrengthExercises) return "Strength"

if (rawType.includes("running")) return "Running"
if (rawType.includes("walking")) return "Walking"
if (rawType.includes("cycling")) return "Cycling"
if (rawType.includes("swimming")) return "Swimming"
if (rawType.includes("elliptical")) return "Elliptical"
if (rawType.includes("rowing")) return "Rowing"
if (rawType.includes("stair")) return "Stairs"

// Explicit mappings for Supabase canonical types
if (rawType === "bike") return "Cycling"
if (rawType === "run") return "Running"

if (cardioModalities.includes("run")) return "Running"
if (cardioModalities.includes("walk")) return "Walking"
if (cardioModalities.includes("bike")) return "Cycling"
if (cardioModalities.includes("swim")) return "Swimming"
if (cardioModalities.includes("row")) return "Rowing"

return "Other"
}

function buildTrainingSummary(workouts) {
  const now = new Date()
  const daysAgo = n => {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d
  }

const last28 = workouts.filter(w => new Date(w.dateTime || w.date || w.start_date) >= daysAgo(28))
  const summary = {
    runningDistance28: 0,
    swimmingDistance28: 0,
    cyclingDistance28: 0,
    cardioMinutes28: 0,
    strengthSessions28: 0,
    totalWorkouts28: 0
  }

  last28.forEach(w => {
    const category = getWorkoutCategoryForSummary(w)
    summary.totalWorkouts28 += 1

    if (category === "Strength") {
      summary.strengthSessions28 += 1
      return
    }

    if (
      ["Running", "Walking", "Cycling", "Swimming", "Elliptical", "Rowing", "Stairs", "Machine Cardio", "Indoor Cycling"].includes(category)
    ) {
      summary.cardioMinutes28 += Number(w.dur || 0)
    }

    if (category === "Running" || category === "Walking") {
      summary.runningDistance28 += getWorkoutDistanceMiles(w)
    } else if (category === "Swimming") {
      summary.swimmingDistance28 += getWorkoutDistanceMiles(w)
    } else if (category === "Cycling") {
      summary.cyclingDistance28 += getCyclingDistanceMiles(w)
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
function linearSlope(data, getValue, halfLifeDays = 14) {
  // Weighted least-squares regression with exponential recency weighting.
  // Recent data points are weighted more heavily (half-life = 14 days by default).
  // Falls back gracefully when data is sparse.
  if (!data || data.length < 2) return 0

  const lastDate = new Date(data[data.length - 1].date)

  let sumW = 0, sumWx = 0, sumWy = 0, sumWxx = 0, sumWxy = 0

  data.forEach((d, i) => {
    const y = getValue(d)
    if (!Number.isFinite(y)) return
    const daysAgo = (lastDate - new Date(d.date)) / 86400000
    const w = Math.exp(-daysAgo / halfLifeDays)
    const x = i  // ordinal index — consistent spacing assumption
    sumW   += w
    sumWx  += w * x
    sumWy  += w * y
    sumWxx += w * x * x
    sumWxy += w * x * y
  })

  if (sumW === 0) return 0

  const denom = sumW * sumWxx - sumWx * sumWx
  if (Math.abs(denom) < 1e-10) return 0

  const slopePerIndex = (sumW * sumWxy - sumWx * sumWy) / denom

  // Convert slope-per-index to slope-per-day.
  // Estimate days-per-index from the actual date span.
  const firstDate = new Date(data[0].date)
  const totalDays = (lastDate - firstDate) / 86400000
  const daysPerIndex = data.length > 1 ? totalDays / (data.length - 1) : 1

  return daysPerIndex > 0 ? slopePerIndex / daysPerIndex : 0
}

function weightedLinearSlope(data, getValue, halfLifeDays = 21) {
  // Exponentially weighted least-squares regression.
  // Recent observations receive higher weight; weight decays with half-life
  // halfLifeDays as you go backward in time.
  // Returns slope in units-per-day.
  if (!data || data.length < 2) return 0

  const pts = data
    .map(d => {
      const x = new Date(d.date).getTime() / 86400000  // days since epoch
      const y = getValue(d)
      return { x, y }
    })
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))

  if (pts.length < 2) return 0

  const lambda = Math.log(2) / halfLifeDays
  const lastX = pts[pts.length - 1].x

  // Weight = exp(-lambda * (lastX - x))  =>  most recent point = 1.0
  const ws = pts.map(p => Math.exp(-lambda * (lastX - p.x)))

  const W   = ws.reduce((s, w) => s + w, 0)
  const Wx  = ws.reduce((s, w, i) => s + w * pts[i].x, 0)
  const Wy  = ws.reduce((s, w, i) => s + w * pts[i].y, 0)
  const Wxx = ws.reduce((s, w, i) => s + w * pts[i].x ** 2, 0)
  const Wxy = ws.reduce((s, w, i) => s + w * pts[i].x * pts[i].y, 0)

  const denom = W * Wxx - Wx * Wx
  if (Math.abs(denom) < 1e-10) return 0

  return (W * Wxy - Wx * Wy) / denom  // lb per day
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
  bmr = null,
  configFatLossMonthly = null
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

  // Weighted regression over last 90 days; recent weeks drive the trend while
  // older data provides stabilizing context.
  const longWeights = weightRows.slice(-90)
  const observedSlope = linearSlope(longWeights, d => d._weight)

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

  // Anchor to configured fat loss rate when observed slope is near zero or positive.
  // GLP-1 water retention can mask real fat loss — the configured rate is more reliable.
  // configured rate is in lb/month; convert to lb/day (negative = loss).
  const configuredDailyLoss = -((1.7) / 30.44)
  // Blend: 55% observed, 45% configured. If observed is positive (gaining), weight configured more.
  const observedWeight = Number.isFinite(blendedSlope) && blendedSlope < 0 ? 0.55 : 0.25
  const configuredWeight = 1 - observedWeight
  blendedSlope = blendedSlope * observedWeight + configuredDailyLoss * configuredWeight

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

  // Cap slope at calibrated DEXA-anchored rate. Observed regression provides
  // direction confirmation only; if it agrees (both negative), use whichever
  // is shallower (less aggressive). If regression is positive (noise), use config.
  const configSlopePerDay = configFatLossMonthly != null
    ? -(configFatLossMonthly / 30.44)
    : null

  const rawBounded = Math.max(-0.2, Math.min(0.1, projectedSlope))

  const boundedSlope = configSlopePerDay != null
    ? (rawBounded < 0
        ? Math.max(configSlopePerDay, rawBounded)
        : configSlopePerDay)
    : rawBounded

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

  const pm = typeof workout?.preferred_metrics === "object" && workout.preferred_metrics !== null
    ? workout.preferred_metrics : {}
  const miles =
    safeNum(workout?.distanceMiles) ||
    safeNum(workout?.miles) ||
    safeNum(workout?.distance_miles) ||
    safeNum(workout?.distance) ||
    (safeNum(pm?.distance_mi) > 0 ? safeNum(pm?.distance_mi) / 1609.34 : 0)

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
  const runs14 = []
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

    if (ageDays <= 14) runs14.push(row)
    if (ageDays <= 28) runs28.push(row)
    if (ageDays <= 84) runs84.push(row)
  })

  const longestRun14 = runs14.reduce((maxMiles, row) => Math.max(maxMiles, safeNum(row.miles)), 0)
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

  const longestRun28 = runs28.reduce((maxMiles, row) => Math.max(maxMiles, safeNum(row.miles)), 0)
  const longestRun84 = runs84.reduce((maxMiles, row) => Math.max(maxMiles, safeNum(row.miles)), 0)
  const weeksWithRuns28 = new Set(
    runs28.map(row => {
      const dt = new Date(row.dt)
      const day = dt.getDay()
      const diff = day === 0 ? -6 : 1 - day
      dt.setDate(dt.getDate() + diff)
      dt.setHours(0, 0, 0, 0)
      return dt.toISOString().slice(0, 10)
    })
  ).size

  return {
    runs14Count: runs14.length,
    runs28Count: runs28.length,
    runs84Count: runs84.length,
    milesPer4Weeks: Math.round(sumMiles28 * 10) / 10,
    milesPer12Weeks: Math.round(sumMiles84 * 10) / 10,
    weeklyRunMiles28: Math.round((sumMiles28 / 4) * 10) / 10,
    weeklyRunMiles84: Math.round((sumMiles84 / 12) * 10) / 10,
    avgPace28: avgPace28 ? Math.round(avgPace28 * 100) / 100 : 0,
    avgPace84: avgPace84 ? Math.round(avgPace84 * 100) / 100 : 0,
    longestRun14: Math.round(longestRun14 * 10) / 10,
    longestRun28: Math.round(longestRun28 * 10) / 10,
    longestRun84: Math.round(longestRun84 * 10) / 10,
    activeWeeks28: weeksWithRuns28,
    runsPerWeek28: Math.round((runs28.length / 4) * 10) / 10
  }
}

function scoreThreshold(value, thresholds, fallback = 0) {
  for (const [minValue, score] of thresholds) {
    if (value >= minValue) return score
  }
  return fallback
}

function buildOcConstraintState({ ocItems, sleepRecords, healthFitDaily, computedTSB, tsbV2Panel, weeklyTrainingBuckets, workouts }) {
  const readiness = computeReadinessDetail(
    ocItems,
    sleepRecords,
    healthFitDaily,
    tsbV2Panel?.currentOverallTsb ?? computedTSB?.global?.tsb ?? computedTSB?.running?.tsb ?? null
  )
  const activeItems = Array.isArray(ocItems)
    ? ocItems.filter(item => Number(item?.currentScore || 0) > 0)
    : []
  const tendonItems = activeItems.filter(item => item.key === "tendonStatus")
  const painScore = tendonItems.length
    ? Math.max(...tendonItems.map(item => Number(item.currentScore || 0)))
    : 0
  const illnessBurden = activeItems
    .filter(item => item.key === "illnessLoad")
    .reduce((sum, item) => sum + Number(item.currentScore || 0), 0)
  const maxOcScore = activeItems.length
    ? Math.max(...activeItems.map(item => Number(item.currentScore || 0)))
    : 0

  const inputs = computeEnduranceInputs(workouts)
  const priorInputs = computeEnduranceInputs(
    workouts,
    (() => {
      const d = new Date()
      d.setDate(d.getDate() - 28)
      return d
    })()
  )

  const recentBuckets = Array.isArray(weeklyTrainingBuckets)
    ? weeklyTrainingBuckets.slice(-4)
    : []
  const latestBucket = recentBuckets[recentBuckets.length - 1] || null
  const priorBuckets = recentBuckets.slice(0, -1)
  const avgBucketValue = key =>
    priorBuckets.length
      ? priorBuckets.reduce((sum, bucket) => sum + Number(bucket?.[key] || 0), 0) / priorBuckets.length
      : 0

  const latestRunMiles = Number(latestBucket?.running || 0)
  const priorRunMilesAvg = avgBucketValue("running")
  const latestCrossMiles = Number(latestBucket?.cycling || 0) + Number(latestBucket?.swimming || 0)
  const priorCrossMilesAvg = avgBucketValue("cycling") + avgBucketValue("swimming")
  const priorLongestRunMiles = Number(priorInputs.longestRun28 || 0)

  const runRamp =
    priorRunMilesAvg > 0
      ? latestRunMiles / priorRunMilesAvg
      : latestRunMiles > 0 ? 1 : 0

  const crossRamp =
    priorCrossMilesAvg > 0
      ? latestCrossMiles / priorCrossMilesAvg
      : latestCrossMiles > 0 ? 1 : 0

  const longestRunRamp =
    priorLongestRunMiles > 0
      ? Number(inputs.longestRun28 || 0) / priorLongestRunMiles
      : Number(inputs.longestRun28 || 0) > 0 ? 1 : 0

  const runningTsb = Number.isFinite(Number(computedTSB?.running?.tsb))
    ? Number(computedTSB.running.tsb)
    : readiness.latestTsb ?? null

  const tendon = {
    painScore,
    stiffness: false,
    override: null
  }

  const systemic = {
    sleepPenalty: readiness.sleepPenalty,
    avgSleepHours: readiness.avgSleepHours,
    illnessBurden,
    injuryPenalty: readiness.injuryPenalty
  }

  const load = {
    tsb: Number.isFinite(Number(runningTsb)) ? Number(runningTsb) : null,
    tsbPenalty: readiness.tsbPenalty,
    runRamp: Number.isFinite(runRamp) ? Number(runRamp.toFixed(2)) : null,
    crossRamp: Number.isFinite(crossRamp) ? Number(crossRamp.toFixed(2)) : null,
    longestRunRamp: Number.isFinite(longestRunRamp) ? Number(longestRunRamp.toFixed(2)) : null,
    upperStrengthTsb: tsbV2Panel?.currentRow?.upperStrengthTsb ?? null,
    lowerStrengthTsb: tsbV2Panel?.currentRow?.lowerStrengthTsb ?? null,
  }

  const severity = { progress: 0, hold: 1, deload: 2 }
  let progressionReadiness = "progress"
  const progressionReasons = []

  const applyState = (nextState, reason) => {
    if (severity[nextState] > severity[progressionReadiness]) {
      progressionReadiness = nextState
    }
    if (reason) progressionReasons.push(reason)
  }

  if (tendon.painScore >= 3) {
    applyState("deload", `Active tendon OC ${tendon.painScore}/5`)
  } else if (tendon.painScore >= 2) {
    applyState("hold", `Active tendon OC ${tendon.painScore}/5`)
  }

  if (maxOcScore >= 4) {
    applyState("deload", `OC issue severity ${maxOcScore}/5`)
  } else if (maxOcScore >= 3) {
    applyState("hold", `OC issue severity ${maxOcScore}/5`)
  }

  if (systemic.sleepPenalty >= 20) {
    applyState("deload", "Sleep penalty high")
  } else if (systemic.sleepPenalty >= 10) {
    applyState("hold", "Sleep penalty active")
  }

  if (systemic.illnessBurden >= 4) {
    applyState("deload", `Illness burden ${systemic.illnessBurden}`)
  } else if (systemic.illnessBurden >= 2) {
    applyState("hold", `Illness burden ${systemic.illnessBurden}`)
  }

  if (Number.isFinite(load.tsb)) {
    if (load.tsb <= -12) {
      applyState("deload", `Running TSB ${load.tsb.toFixed(1)}`)
    } else if (load.tsb <= -5) {
      applyState("hold", `Running TSB ${load.tsb.toFixed(1)}`)
    }
  }

  if (Number(inputs.runsPerWeek28 || 0) < 2 || Number(inputs.activeWeeks28 || 0) < 2) {
    applyState("hold", "Recent run frequency too low to progress")
  }

  if (runRamp > 1.18 || longestRunRamp > 1.2) {
    applyState(
      Number.isFinite(load.tsb) && load.tsb <= -5 ? "deload" : "hold",
      "Run load increased faster than target build rate"
    )
  } else if (runRamp > 1.1) {
    applyState("hold", "Run load already at weekly build cap")
  }

  if (runRamp > 1.05 && crossRamp > 1.05) {
    applyState("hold", "Bike/swim are rising alongside run volume")
  }

  // Compartment-specific gates — use lowerStrengthTsb and upperStrengthTsb
  // Thresholds match the empirical personal dangerous zone calibration (April 2026)
  const evalCompartmentGate = (compartmentTsb) => {
    if (!Number.isFinite(compartmentTsb)) return "progress"
    if (compartmentTsb <= -12) return "deload"
    if (compartmentTsb <= -5)  return "hold"
    return "progress"
  }
  const lowerProgressionReadiness = evalCompartmentGate(load.lowerStrengthTsb)
  const upperProgressionReadiness = evalCompartmentGate(load.upperStrengthTsb)

  return {
    tendon,
    systemic,
    load,
    gate: {
      progressionReadiness,
      progressionReasons,
      lowerProgressionReadiness,
      upperProgressionReadiness,
    }
  }
}

function buildRunningReadinessController({
  workouts,
  ocConstraintState = null,
  mtpCeilingMiles = 4.0
}) {
  const inputs = {
    ...computeEnduranceInputs(workouts),
    mtpCeilingMiles
  }

  const clamp = (value, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, value))
  const recentCompletedRunMiles = Math.max(
    Number(inputs.longestRun14 || 0),
    Number(inputs.longestRun28 || 0) * 0.8,
    Number(inputs.longestRun84 || 0) * 0.6
  )
  const recentLongestRunMiles = Number(inputs.longestRun28 || 0)
  const recentRunVolume = Number(inputs.weeklyRunMiles28 || 0)
  const recentRunFrequency = Number(inputs.runsPerWeek28 || 0)
  const activeWeeks28 = Number(inputs.activeWeeks28 || 0)
  const mtpCeiling = Number(inputs.mtpCeilingMiles ?? 4.0)
  const mtpConstrained = mtpCeiling >= 3.5 && mtpCeiling < 6.2

  const buildCompletionScore = ({ distanceMiles, volumeThresholds, projectedCompletedRunMiles, projectedLongestRunMiles }) => {
    const completedRunMiles = Number.isFinite(Number(projectedCompletedRunMiles))
      ? Number(projectedCompletedRunMiles)
      : recentCompletedRunMiles
    const longestRunMiles = Number.isFinite(Number(projectedLongestRunMiles))
      ? Number(projectedLongestRunMiles)
      : recentLongestRunMiles

    if (completedRunMiles >= distanceMiles) return 100

    const longestRatio = distanceMiles > 0 ? longestRunMiles / distanceMiles : 0
    const longestScore = scoreThreshold(longestRatio, [
      [0.9, 90],
      [0.75, 75],
      [0.6, 55],
      [0.45, 35]
    ], 15)

    const volumeScore = scoreThreshold(recentRunVolume, volumeThresholds, 15)

    const consistencyScore =
      activeWeeks28 >= 4 && recentRunFrequency >= 3 ? 95 :
      activeWeeks28 >= 3 && recentRunFrequency >= 2.5 ? 80 :
      activeWeeks28 >= 3 && recentRunFrequency >= 2 ? 65 :
      activeWeeks28 >= 2 && recentRunFrequency >= 1.5 ? 45 :
      activeWeeks28 >= 1 ? 25 :
      10

    return clamp(Math.round(
      longestScore * 0.65 +
      volumeScore * 0.20 +
      consistencyScore * 0.15
    ))
  }

  const completionReadiness = {
    fiveK: buildCompletionScore({
      distanceMiles: 3.1069,
      volumeThresholds: [
        [9, 95],
        [7, 82],
        [5, 68],
        [3, 50]
      ]
    }),
    tenK: buildCompletionScore({
      distanceMiles: 6.2137,
      volumeThresholds: [
        [18, 95],
        [14, 82],
        [10, 65],
        [7, 48]
      ],
      projectedCompletedRunMiles: mtpConstrained
        ? Math.min(mtpCeiling * 1.1, 6.2137)
        : undefined,
      projectedLongestRunMiles: mtpConstrained
        ? mtpCeiling
        : undefined,
    }),
    half: buildCompletionScore({
      distanceMiles: 13.1094,
      volumeThresholds: [
        [30, 95],
        [24, 82],
        [18, 65],
        [12, 48]
      ]
    })
  }

  const nextEventTargetMiles =
    completionReadiness.fiveK >= 100
      ? completionReadiness.tenK >= 100
        ? 13.1094
        : 6.2137
      : 3.1069

  return {
    completionReadiness,
    progressionReadiness: ocConstraintState?.gate?.progressionReadiness ?? "hold",
    progressionReasons: ocConstraintState?.gate?.progressionReasons ?? [],
    buildCompletionScore,
    signals: {
      recentCompletedRunMiles: Number(recentCompletedRunMiles.toFixed(1)),
      recentLongestRunMiles: Number(recentLongestRunMiles.toFixed(1)),
      nextEventTargetMiles: Number(nextEventTargetMiles.toFixed(1)),
      recentRunVolume: Number(recentRunVolume.toFixed(1)),
      recentRunFrequency: Number(recentRunFrequency.toFixed(1)),
      activeWeeks28
    },
    tendonStatus: ocConstraintState?.tendon ?? { painScore: 0, stiffness: false, override: null }
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

  // Cycling contributes aerobic base, but only partially transfers to running readiness.
  const cyclingEquivMiles = cyclingMilesWeekly * 0.2
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
  const swimScore = Math.min(100, Math.round((swimmingMilesWeekly / 3) * 100))
  const cyclingScore = Math.min(100, Math.round((cyclingMilesWeekly / 60) * 100))
  const baseReadinessRaw =
    aerobicVolumeScore * 0.30 +
    runPaceScore       * 0.20 +
    runVolumeScore     * 0.15 +
    cardioScore        * 0.15 +
    swimScore          * 0.10 +
    cyclingScore       * 0.10

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
  const recentEquiv = inputs.weeklyRunMiles28 + cyclingEquivMiles
  const priorEquiv  = prior28Inputs.weeklyRunMiles28 +
    cyclingEquivMiles

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

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function getLocalIsoDateParts(dateValue) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(12, 0, 0, 0)
  return {
    date,
    iso: date.toISOString().slice(0, 10),
    dayKey: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]
  }
}

function getWeekStartIso(dateValue) {
  const parts = getLocalIsoDateParts(dateValue)
  if (!parts) return null
  const date = new Date(parts.date)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(12, 0, 0, 0)
  return date.toISOString().slice(0, 10)
}

function formatLocalIsoDate(dateValue) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDaysLocalIso(baseDate, days) {
  const date = new Date(baseDate)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + Math.round(days))
  return formatLocalIsoDate(date)
}

function monthsUntilLocalDate(isoDate, fromDate = new Date()) {
  if (!isoDate) return null
  const start = new Date(fromDate)
  start.setHours(12, 0, 0, 0)
  const target = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(target.getTime())) return null
  return Math.max(0, Number((((target.getTime() - start.getTime()) / 86400000) / 30.44).toFixed(1)))
}

function enumerateRecentWeeks(count = 12, endDate = new Date()) {
  const lastWeek = getWeekStartIso(endDate)
  const base = new Date(`${lastWeek}T12:00:00`)
  const weeks = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(base)
    d.setDate(d.getDate() - (i * 7))
    weeks.push(d.toISOString().slice(0, 10))
  }
  return weeks
}

function averageCardioPrescriptionDose(session) {
  if (!session) return 0
  const durationMidpoint = Number(session.dMin || 0) && Number(session.dMax || 0)
    ? (Number(session.dMin) + Number(session.dMax)) / 2
    : Number(session.dMin || session.dMax || 0)
  const distance = parseScheduleDistanceMiles(session.dist, session.mod) || 0
  return Number((durationMidpoint + distance * 6).toFixed(2))
}

function summarizeStrengthDose(exercises) {
  return (Array.isArray(exercises) ? exercises : []).reduce((sum, ex) => {
    const sets = Number.parseFloat(ex?.actual?.sets ?? ex?.sets ?? 0) || 0
    const reps = Number.parseFloat(ex?.actual?.reps ?? ex?.reps ?? 0) || 0
    const load = Number.parseFloat(ex?.actual?.load ?? ex?.load ?? 0) || 0
    const base = sets > 0
      ? sets * Math.max(1, reps || 8) * (1 + load / 100)
      : Math.max(1, reps || 8) * (1 + load / 100)
    return sum + base / 10
  }, 0)
}

function summarizeTendonDose(tendonWork) {
  return (Array.isArray(tendonWork) ? tendonWork : []).reduce((sum, item) => {
    const sets = Number.parseFloat(item?.sets || 0) || 0
    const reps = Number.parseFloat(item?.reps || 0) || 0
    const load = Number.parseFloat(item?.load || 0) || 0
    return sum + ((sets || 2) * Math.max(1, reps || 10) * (1 + load / 120)) / 16
  }, 0)
}

function getTendonGroupKeywords(groupKey) {
  if (groupKey === "achilles_calf") return ["Calf", "Ankle", "Achilles", "Shin"]
  if (groupKey === "forefoot_toe_extensor") return ["Toe", "Forefoot", "Ankle"]
  if (groupKey === "patellar_knee") return ["Knee", "Quad", "Patellar", "Hip"]
  return []
}

function estimateOcBurdenForDate(ocItems, isoDate, keywords = []) {
  const target = new Date(`${isoDate}T12:00:00`).getTime()
  return (Array.isArray(ocItems) ? ocItems : []).reduce((sum, item) => {
    const start = item?.startDate ? new Date(item.startDate).getTime() : NaN
    if (!Number.isFinite(start) || start > target) return sum
    if (keywords.length && !keywords.some(keyword => String(item?.location || "").includes(keyword))) return sum
    const initial = Number(item?.initialScore || item?.currentScore || 0)
    const halfLife = resolveOcHalfLifeHours(item, DEFAULT_OC_HALF_LIFE_OVERRIDES, 96)
    if (initial <= 0 || halfLife <= 0) return sum
    const hours = (target - start) / 3600000
    const score = initial * Math.pow(0.5, hours / halfLife)
    return sum + score
  }, 0)
}

function getRaceDistanceType(race) {
  const miles = Number(race?.dist_mi || 0)
  if (miles >= 12 && miles <= 14) return "half"
  if (miles >= 5.8 && miles <= 6.4) return "tenK"
  if (miles >= 2.8 && miles <= 3.3) return "fiveK"
  if (String(race?.name || "").toLowerCase().includes("tri")) return "olympicTri"
  return miles > 3.3 && miles < 6.2 ? "fiveK" : "other"
}

function passesRaceGeographyPolicy(race, type) {
  const city = String(race?.city || "").toLowerCase()
  const note = String(race?.note || "").toLowerCase()
  const locationText = `${city} ${note}`
  if (type === "fiveK") return city.includes("bloomington") || city.includes("normal")
  if (type === "tenK") {
    return [
      "bloomington", "normal", "peoria", "east peoria", "mclean",
      "mackinaw", "moraine", "tipton", "lake bloomington",
      "pontiac", "lincoln", "morton", "washington"
    ].some(token => locationText.includes(token))
  }
  if (type === "half") {
    return [
      "bloomington", "normal", "peoria", "east peoria", "springfield",
      "champaign", "urbana", "decatur", "mclean", "mackinaw",
      "lincoln", "pontiac", "morton", "washington", "central illinois"
    ].some(token => locationText.includes(token))
  }
  return true
}

function buildAdaptiveTrainingState({
  schedLog,
  operationalWorkouts,
  acwrSeries,
  tsbRows,
  ocItems,
  readinessScore,
  weeklyTrainingBuckets
}) {
  const safeSchedLog = Array.isArray(schedLog) ? schedLog : []
  const safeOperationalWorkouts = Array.isArray(operationalWorkouts) ? operationalWorkouts : []
  const safeAcwrSeries = Array.isArray(acwrSeries) ? acwrSeries : []
  const safeTsbRows = Array.isArray(tsbRows) ? tsbRows : []
  const safeWeeklyTrainingBuckets = Array.isArray(weeklyTrainingBuckets) ? weeklyTrainingBuckets : []
  const weekKeys = enumerateRecentWeeks(12)
  const weekMap = new Map(weekKeys.map(weekStart => [weekStart, {
    weekStart,
    domains: {
      running: { plannedSessions: 0, completedSessions: 0, plannedDose: 0, completedDose: 0, absorbedDose: 0 },
      strength: { plannedSessions: 0, completedSessions: 0, plannedDose: 0, completedDose: 0, absorbedDose: 0 },
      tendon: { plannedSessions: 0, completedSessions: 0, plannedDose: 0, completedDose: 0, absorbedDose: 0 },
      cardio: { plannedSessions: 0, completedSessions: 0, plannedDose: 0, completedDose: 0, absorbedDose: 0 },
    },
    modifiers: { tsb: null, acwr: null, oc: 0 },
    capital: null,
    tendon: null
  }]))

  weekKeys.forEach(weekStart => {
    const start = new Date(`${weekStart}T12:00:00`)
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const dayKey = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]
      const cardioPlan = CARDIO[dayKey]
      const plan = PROG[dayKey] || {}
      const week = weekMap.get(weekStart)
      const cardioSessions = Array.isArray(cardioPlan?.sessions) ? cardioPlan.sessions : []
      cardioSessions.forEach(session => {
        const domain = session.mod === "run" ? "running" : "cardio"
        week.domains[domain].plannedSessions += 1
        week.domains[domain].plannedDose += averageCardioPrescriptionDose(session)
      })
      const planExercises = Array.isArray(plan?.exercises) ? plan.exercises : []
      if (planExercises.length > 0) {
        week.domains.strength.plannedSessions += 1
        week.domains.strength.plannedDose += Math.max(1, planExercises.length * 1.35)
      }
      const tendonPlan = getDefaultTendonWork(dayKey)
      if (tendonPlan.length > 0) {
        week.domains.tendon.plannedSessions += 1
        week.domains.tendon.plannedDose += Math.max(1.5, tendonPlan.length * 1.4)
      }
    }
  })

  safeSchedLog.forEach(entry => {
    const date = String(entry?.date || entry?.logged_at || "").slice(0, 10)
    const weekStart = getWeekStartIso(date)
    const week = weekMap.get(weekStart)
    if (!week) return

    const strengthExercises = (Array.isArray(entry?.exercises) ? entry.exercises : []).filter(ex => ex?.variant !== "cardio")
    if (strengthExercises.length > 0) {
      week.domains.strength.completedSessions += 1
      week.domains.strength.completedDose += summarizeStrengthDose(strengthExercises)
    }

    const tendonWork = Array.isArray(entry?.tendon_work) ? entry.tendon_work : []
    const tendonFromExercises = strengthExercises.filter(ex => classifyTendonExercise(ex?.exercise_name))
    if (tendonWork.length > 0 || tendonFromExercises.length > 0) {
      week.domains.tendon.completedSessions += 1
      week.domains.tendon.completedDose += summarizeTendonDose(tendonWork) + summarizeStrengthDose(tendonFromExercises) * 0.4
    }

    const entryCardio = Array.isArray(entry?.cardio) ? entry.cardio : []
    entryCardio.forEach(cardio => {
      const domain = String(cardio?.modality || "").toLowerCase() === "run" ? "running" : "cardio"
      const distance = parseScheduleDistanceMiles(cardio?.distance, cardio?.modality) || 0
      const duration = parseScheduleDurationMinutes(cardio?.duration) || 0
      week.domains[domain].completedSessions += 1
      week.domains[domain].completedDose += duration + distance * (domain === "running" ? 8 : 5)
    })
  })

  safeOperationalWorkouts.forEach(workout => {
    const date = String(workout?.date || workout?.dateTime || workout?.start_date || "").slice(0, 10)
    const weekStart = getWeekStartIso(date)
    const week = weekMap.get(weekStart)
    if (!week) return
    const category = getWorkoutCategoryForSummary(workout)
    const dur = Number(workout?.dur || workout?.duration_min || 0) || 0
    if (category === "Running") {
      week.domains.running.completedDose += (getWorkoutDistanceMiles(workout) * 8) + dur * 0.35
    } else if (category === "Cycling" || category === "Swimming" || category === "Rowing" || category === "Machine Cardio" || category === "Walking") {
      week.domains.cardio.completedDose += dur + (getWorkoutDistanceMiles(workout) * 3)
    }
  })

  const acwrByWeek = new Map(safeAcwrSeries.map(row => [getWeekStartIso(row.date), row]))
  const tsbByWeek = new Map(safeTsbRows.map(row => [getWeekStartIso(row.date), row]))
  const weeklyRunBuckets = new Map(safeWeeklyTrainingBuckets.map(row => [row.weekStart, row]))

  const capitals = { running: 35, strength: 35, tendon: 22, cardio: 35 }
  const tendonCapacities = {
    achilles_calf: 24,
    forefoot_toe_extensor: 18,
    patellar_knee: 22
  }
  const tendonSeries = {
    combined: [],
    achilles_calf: [],
    forefoot_toe_extensor: [],
    patellar_knee: []
  }

  weekKeys.forEach(weekStart => {
    const week = weekMap.get(weekStart)
    const acwrRaw = acwrByWeek.get(weekStart)?.acwr ?? acwrByWeek.get(weekStart)?.value ?? null
    const tsbRaw = tsbByWeek.get(weekStart)?.overallTsb ?? null
    const acwr = acwrRaw == null ? null : Number(acwrRaw)
    const tsb = tsbRaw == null ? null : Number(tsbRaw)
    const ocRun = estimateOcBurdenForDate(ocItems, weekStart, ["Calf", "Ankle", "Toe", "Knee", "Hip"])
    const ocTendon = estimateOcBurdenForDate(ocItems, weekStart, ["Calf", "Ankle", "Toe", "Knee"])
    week.modifiers = { tsb, acwr, oc: ocRun }

    const tendonPenaltyBase =
      (Number.isFinite(tsb) && tsb < -15 ? 0.14 : Number.isFinite(tsb) && tsb < -8 ? 0.08 : 0) +
      (Number.isFinite(acwr) && acwr > 1.5 ? 0.2 : Number.isFinite(acwr) && acwr > 1.3 ? 0.12 : 0) +
      clampNumber(ocRun / 20, 0, 0.18)

    Object.entries(week.domains).forEach(([domain, stats]) => {
      const tendonSensitive = domain === "running" || domain === "tendon"
      const modifier = clampNumber(
        1
          - (Number.isFinite(tsb) && tsb < DEFAULT_TSB_THRESHOLDS.high ? 0.18 : Number.isFinite(tsb) && tsb < DEFAULT_TSB_THRESHOLDS.moderate ? 0.1 : 0)
          - (Number.isFinite(acwr) && acwr > 1.5 ? 0.2 : Number.isFinite(acwr) && acwr > 1.3 ? 0.12 : 0)
          - clampNumber((domain === "strength" ? estimateOcBurdenForDate(ocItems, weekStart, ["Shoulder", "Back", "Knee", "Hip"]) : ocRun) / 22, 0, 0.16)
          - (tendonSensitive ? clampNumber(ocTendon / 18, 0, 0.12) : 0),
        0.35,
        1.02
      )
      stats.absorbedDose = Number((stats.completedDose * modifier).toFixed(2))
      stats.completedSessions = Math.max(stats.completedSessions, stats.completedDose > 0 ? 1 : 0)
    })

    capitals.running = capitals.running * 0.93 + week.domains.running.absorbedDose * 0.62
    capitals.strength = capitals.strength * 0.94 + week.domains.strength.absorbedDose * 0.5
    capitals.tendon = capitals.tendon * 0.975 + week.domains.tendon.absorbedDose * 0.3
    capitals.cardio = capitals.cardio * 0.94 + week.domains.cardio.absorbedDose * 0.5

    const runBucket = weeklyRunBuckets.get(weekStart) || {}
    const runMiles = Number(runBucket.running || 0)
    const runFreqBonus = runMiles > 0 ? clampNumber(runMiles / 12, 0, 1.5) : 0
    const longRunBonus = runMiles >= 6 ? runMiles * 0.18 : 0
    const quadStrengthDose = week.domains.strength.completedDose * 0.22
    const tendonDose = week.domains.tendon.absorbedDose

    const achillesLoad = runMiles * 1.1 + longRunBonus + runFreqBonus
    const forefootLoad = runMiles * 0.9 + longRunBonus * 0.35 + clampNumber(estimateOcBurdenForDate(ocItems, weekStart, ["Toe"]) / 4, 0, 1.2)
    const patellarLoad = runMiles * 0.55 + quadStrengthDose

    const acwrPenalty = Number.isFinite(acwr) && acwr > 1.5 ? 1.2 : Number.isFinite(acwr) && acwr > 1.3 ? 0.65 : 0
    const tsbPenalty = Number.isFinite(tsb) && tsb < DEFAULT_TSB_THRESHOLDS.high ? 0.9 : Number.isFinite(tsb) && tsb < DEFAULT_TSB_THRESHOLDS.moderate ? 0.45 : 0

    tendonCapacities.achilles_calf = clampNumber(
      tendonCapacities.achilles_calf * 0.97 + (0.03 * achillesLoad) - acwrPenalty - tsbPenalty - clampNumber(estimateOcBurdenForDate(ocItems, weekStart, getTendonGroupKeywords("achilles_calf")) / 8, 0, 0.8),
      8,
      60
    )
    tendonCapacities.forefoot_toe_extensor = clampNumber(
      tendonCapacities.forefoot_toe_extensor * 0.97 + (0.03 * forefootLoad) - acwrPenalty * 0.85 - tsbPenalty * 0.8 - clampNumber(estimateOcBurdenForDate(ocItems, weekStart, getTendonGroupKeywords("forefoot_toe_extensor")) / 7, 0, 0.9),
      6,
      50
    )
    tendonCapacities.patellar_knee = clampNumber(
      tendonCapacities.patellar_knee * 0.97 + (0.03 * patellarLoad) - acwrPenalty * 0.75 - tsbPenalty * 0.6 - clampNumber(estimateOcBurdenForDate(ocItems, weekStart, getTendonGroupKeywords("patellar_knee")) / 8, 0, 0.85),
      7,
      55
    )

    const tendonSnapshot = {
      combined: {
        load: 0,
        capacity: 0,
        risk: 0
      },
      achilles_calf: {
        load: Number(achillesLoad.toFixed(2)),
        capacity: Number(tendonCapacities.achilles_calf.toFixed(2)),
        risk: Number((achillesLoad / Math.max(1, tendonCapacities.achilles_calf)).toFixed(2))
      },
      forefoot_toe_extensor: {
        load: Number(forefootLoad.toFixed(2)),
        capacity: Number(tendonCapacities.forefoot_toe_extensor.toFixed(2)),
        risk: Number((forefootLoad / Math.max(1, tendonCapacities.forefoot_toe_extensor)).toFixed(2))
      },
      patellar_knee: {
        load: Number(patellarLoad.toFixed(2)),
        capacity: Number(tendonCapacities.patellar_knee.toFixed(2)),
        risk: Number((patellarLoad / Math.max(1, tendonCapacities.patellar_knee)).toFixed(2))
      }
    }
    const combinedLoad = achillesLoad + forefootLoad + patellarLoad
    const combinedCapacity =
      tendonCapacities.achilles_calf +
      tendonCapacities.forefoot_toe_extensor +
      tendonCapacities.patellar_knee
    tendonSnapshot.combined = {
      load: Number(combinedLoad.toFixed(2)),
      capacity: Number(combinedCapacity.toFixed(2)),
      risk: Number((combinedLoad / Math.max(1, combinedCapacity)).toFixed(2))
    }
    week.tendon = tendonSnapshot
    week.capital = {
      running: Number(capitals.running.toFixed(1)),
      strength: Number(capitals.strength.toFixed(1)),
      tendon: Number(capitals.tendon.toFixed(1)),
      cardio: Number(capitals.cardio.toFixed(1))
    }
    Object.entries(tendonSnapshot).forEach(([groupKey, snapshot]) => {
      tendonSeries[groupKey].push({
        weekStart,
        label: String(weekStart).slice(5),
        load: snapshot.load,
        capacity: snapshot.capacity,
        risk: snapshot.risk
      })
    })
  })

  const weeklyRows = weekKeys.map(weekStart => ({
    weekStart,
    label: String(weekStart).slice(5),
    ...weekMap.get(weekStart)
  }))
  const latestWeek = weeklyRows[weeklyRows.length - 1] || null
  const averageCompliance = domain => {
    const rows = weeklyRows.slice(-8)
    const completed = rows.reduce((sum, row) => sum + Number(row.domains?.[domain]?.completedDose || 0), 0)
    const planned = rows.reduce((sum, row) => sum + Number(row.domains?.[domain]?.plannedDose || 0), 0)
    return planned > 0 ? Number(clampNumber(completed / planned, 0, 1.2).toFixed(2)) : 0
  }
  const avgAbsorption = domain => {
    const rows = weeklyRows.slice(-6)
    const absorbed = rows.reduce((sum, row) => sum + Number(row.domains?.[domain]?.absorbedDose || 0), 0)
    const completed = rows.reduce((sum, row) => sum + Number(row.domains?.[domain]?.completedDose || 0), 0)
    return completed > 0 ? Number(clampNumber(absorbed / completed, 0, 1.05).toFixed(2)) : 0
  }
  const latestTendonRisk = latestWeek?.tendon || {}
  const maxTendonRisk = Math.max(
    Number(latestTendonRisk?.achilles_calf?.risk || 0),
    Number(latestTendonRisk?.forefoot_toe_extensor?.risk || 0),
    Number(latestTendonRisk?.patellar_knee?.risk || 0)
  )
  const forecastConfidence = clampNumber(
    (
      (Number(readinessScore || 0) * 0.18) +
      (Number(latestWeek?.capital?.running || 0) * 0.32) +
      (averageCompliance("running") * 100 * 0.18) +
      (avgAbsorption("running") * 100 * 0.14) +
      (averageCompliance("tendon") * 100 * 0.18)
    ) / 100,
    0.1,
    0.95
  )

  const feedback = []
  if (averageCompliance("running") >= 0.8 && averageCompliance("tendon") < 0.6) feedback.push("Running compliance is good, but tendon compliance is lagging.")
  if (avgAbsorption("running") < 0.72) feedback.push("Completed dose was high, but absorbability was poor due to fatigue or operational constraints.")
  if (averageCompliance("tendon") >= 0.75 && avgAbsorption("tendon") >= 0.8) feedback.push("Tendon consistency over the last 8 weeks supports progression.")
  if (forecastConfidence < 0.45) feedback.push("Recent inconsistency reduces confidence in projected readiness.")
  if (latestWeek?.modifiers?.acwr > 1.3) feedback.push("Absorbed dose is being discounted by elevated ACWR.")

  const tendonAlerts = []
  if (latestTendonRisk.achilles_calf?.risk >= TENDON_GROUP_META.achilles_calf.overload) tendonAlerts.push("Run load is rising faster than Achilles capacity.")
  if (latestTendonRisk.forefoot_toe_extensor?.risk >= TENDON_GROUP_META.forefoot_toe_extensor.caution && estimateOcBurdenForDate(ocItems, latestWeek?.weekStart, ["Toe"]) > 1.5) tendonAlerts.push("Forefoot risk is elevated. Hold progression and favor tendon-support work.")
  if ((latestWeek?.tendon?.achilles_calf?.risk || 0) > 1 && avgAbsorption("tendon") < 0.7) tendonAlerts.push("Current week counts against tendon readiness, not for it.")

  return {
    weeklyRows: Array.isArray(weeklyRows) ? weeklyRows : [],
    latestWeek,
    complianceScores: {
      running: averageCompliance("running"),
      strength: averageCompliance("strength"),
      tendon: averageCompliance("tendon"),
      cardio: averageCompliance("cardio")
    },
    absorptionScores: {
      running: avgAbsorption("running"),
      strength: avgAbsorption("strength"),
      tendon: avgAbsorption("tendon"),
      cardio: avgAbsorption("cardio")
    },
    capitals: latestWeek?.capital && typeof latestWeek.capital === "object"
      ? latestWeek.capital
      : { running: 0, strength: 0, tendon: 0, cardio: 0 },
    tendonSeries: {
      combined: Array.isArray(tendonSeries.combined) ? tendonSeries.combined : [],
      achilles_calf: Array.isArray(tendonSeries.achilles_calf) ? tendonSeries.achilles_calf : [],
      forefoot_toe_extensor: Array.isArray(tendonSeries.forefoot_toe_extensor) ? tendonSeries.forefoot_toe_extensor : [],
      patellar_knee: Array.isArray(tendonSeries.patellar_knee) ? tendonSeries.patellar_knee : [],
    },
    tendonAlerts: Array.isArray(tendonAlerts) ? tendonAlerts : [],
    feedback: Array.isArray(feedback) ? feedback : [],
    forecastConfidence,
    maxTendonRisk
  }
}
function getInjuryPenalties(ocItems = []) {
  const penalties = { running: 1, swimming: 1, cycling: 1, lifting: 1 }

  const RUN_REGIONS = [
    "Toe L", "Toe R", "Ankle L", "Ankle R", "Knee L", "Knee R",
    "Shin L", "Shin R", "Calf L", "Calf R", "IT Band L", "IT Band R",
    "Hamstring L", "Hamstring R", "Quad L", "Quad R", "Hip L", "Hip R"
  ]
  const SWIM_REGIONS = [
    "Shoulder L", "Shoulder R", "Elbow L", "Elbow R",
    "Wrist L", "Wrist R", "Toe L", "Toe R"
  ]
  const CYCLE_REGIONS = [
    "Knee L", "Knee R", "Hip L", "Hip R",
    "IT Band L", "IT Band R", "Lower Back"
  ]
  const LIFT_REGIONS = [
    "Shoulder L", "Shoulder R", "Elbow L", "Elbow R",
    "Lower Back", "Upper Back", "Wrist L", "Wrist R"
  ]

  const regionMaxScore = (regions) =>
    (Array.isArray(ocItems) ? ocItems : [])
      .filter(i =>
        regions.some(r =>
          (i.location || "").toLowerCase() === r.toLowerCase()
        )
      )
      .reduce((max, i) => Math.max(max, Number(i.currentScore || 0)), 0)

  const toMultiplier = (maxScore) => {
    if (maxScore <= 0) return 1
    if (maxScore === 1) return 0.90
    if (maxScore === 2) return 0.75
    if (maxScore === 3) return 0.55
    return 0.40
  }

  penalties.running = toMultiplier(regionMaxScore(RUN_REGIONS))
  penalties.swimming = toMultiplier(regionMaxScore(SWIM_REGIONS))
  penalties.cycling = toMultiplier(regionMaxScore(CYCLE_REGIONS))
  penalties.lifting = toMultiplier(regionMaxScore(LIFT_REGIONS))

  return penalties
}

// Conservative display-only calorie fallback for cardio logs without energy data.
function estimateCaloriesFromDuration(category, durationMin) {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null
  const rates = {
    Running: 9.2,
    Walking: 4.5,
    Cycling: 5.0,
    Swimming: 7.5,
    Elliptical: 6.0,
    Rowing: 7.0,
    Stairs: 8.0,
    "Machine Cardio": 5.5,
    "Indoor Cycling": 5.0,
  }
  const rate = rates[category]
  if (!rate) return null
  return Math.round(rate * durationMin)
}

function buildWeeklyTrainingBuckets(workouts) {
const buckets = {}
  const cutoffMs = Date.now() - 52 * 7 * 24 * 60 * 60 * 1000
  workouts.forEach(w => {
    const wMs = new Date(w.dateTime || w.date || w.start_date || 0).getTime()
    if (!Number.isFinite(wMs) || wMs < cutoffMs) return
    const key = getWeekStartIso(w.dateTime || w.date || w.start_date)
    if (!key) return

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

const _raw = (w.canonical_type || w.type || "").toLowerCase()
    const wCat = w.category ||
      (_raw.includes("run") ? "Running" :
      _raw.includes("bike") || _raw.includes("cycl") ? "Cycling" :
      _raw.includes("swim") ? "Swimming" :
      _raw.includes("strength") ? "Strength" : "Other")
    if (wCat === "Running") {
      const loggedMiles = getWorkoutDistanceMiles(w)
      if (w.source !== "ManualSchedule") {
        buckets[key].running += loggedMiles
      }
      buckets[key].cardioMinutes += Number(w.dur || 0)
    } else if (wCat === "Swimming") {
      buckets[key].swimming += getWorkoutDistanceMiles(w)
      buckets[key].cardioMinutes += Number(w.dur || 0)
    } else if (wCat === "Cycling") {
      buckets[key].cycling += getCyclingDistanceMiles(w)
      buckets[key].cardioMinutes += Number(w.dur || 0)
    } else if (wCat === "Strength") {
      buckets[key].strength += 1
    } else if (
      ["Elliptical", "Rowing", "Stairs", "Machine Cardio", "Indoor Cycling"].includes(wCat)
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
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw
      .replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, '$1')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  }
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
  const escaped = key.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
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
  return "Indoor Cycling";
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

function normalizeTechnogymPayload(parsed) {
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

function normalizeTechnogymFile(file) {
  const reader = new FileReaderSync();
  const text = reader.readAsText(file);
  const parsed = JSON.parse(text);
  return normalizeTechnogymPayload(parsed);
}

function parseTechnogymText(text) {
  return normalizeTechnogymPayload(JSON.parse(String(text || "")));
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
  if (techno && Number.isFinite(Number(techno.distance)) && Number(techno.distance) > 0) return { value: techno.distance, source: 'Technogym', rationale: 'Preferred machine distance', unit: techno.distance_unit || 'm' };
  if (apple && Number.isFinite(Number(apple.distance)) && Number(apple.distance) > 0) return { value: apple.distance, source: 'AppleHealth', rationale: 'Fallback to Apple distance', unit: apple.distance_unit || 'mi' };
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

  const mergedAccepted = dedupeCanonicalSessions(accepted);

  return {
    accepted: mergedAccepted,
    review: review,
    rejected: rejected,
    all_sessions: mergedAccepted.slice(),
    generated_at: new Date().toISOString(),
    summary: {
      total: mergedAccepted.length,
      accepted: mergedAccepted.length,
      review: review.length,
      rejected: rejected.length,
      linked: mergedAccepted.filter(function(s) { return s.sources.apple && s.sources.technogym; }).length,
      unmatched_apple: mergedAccepted.filter(function(s) { return s.sources.apple && !s.sources.technogym; }).length,
      unmatched_technogym: mergedAccepted.filter(function(s) { return !s.sources.apple && s.sources.technogym; }).length
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

function normalizeOffset(offset) {
  if (!offset) return '';
  if (/^[+-]\d{2}:\d{2}$/.test(offset)) return offset;
  if (/^[+-]\d{4}$/.test(offset)) return offset.slice(0, 3) + ':' + offset.slice(3);
  return offset;
}

function normalizeDateString(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw
      .replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, '$1')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  }
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}:?\d{2}|Z))?$/);
  if (m) {
    const tz = m[3] === 'Z' ? 'Z' : normalizeOffset(m[3] || '');
    return m[1] + 'T' + m[2] + tz;
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function getNewestWorkoutLikeTimestamp(rows) {
  if (!Array.isArray(rows) || !rows.length) return null
  let newest = null
  rows.forEach(row => {
    const raw = row?.dateTime || row?.date || row?.start_date || row?.startDate || null
    const normalized = normalizeDateString(raw)
    const ts = normalized ? Date.parse(normalized) : NaN
    if (Number.isFinite(ts) && (newest == null || ts > newest)) newest = ts
  })
  return newest
}

function getNewestWorkoutLikeDate(rows) {
  const ts = getNewestWorkoutLikeTimestamp(rows)
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null
}

function summarizeWorkoutSet(rows) {
  const list = Array.isArray(rows) ? rows : []
  const typeCounts = {}
  const seenKeys = new Set()
  let duplicateCount = 0

  list.forEach(row => {
    const type = String(row?.category || row?.canonical_type || row?.type || "Other")
    typeCounts[type] = (typeCounts[type] || 0) + 1

    const key = getCanonicalSessionDuplicateKey(row)
    if (seenKeys.has(key)) duplicateCount += 1
    else seenKeys.add(key)
  })

  return {
    count: list.length,
    newestDate: getNewestWorkoutLikeDate(list),
    duplicateCount,
    topTypes: Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }
}

function getWorkoutLikeDateKey(row) {
  const raw = row?.dateTime || row?.date || row?.start_date || row?.startDate || null
  const normalized = normalizeDateString(raw)
  return normalized ? normalized.slice(0, 10) : ""
}

function toMs(value) {
  const normalized = normalizeDateString(value)
  if (!normalized) return null
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

function minutesBetween(start, end) {
  const s = toMs(start)
  const e = toMs(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  return (e - s) / 60000
}

function normalizeTechnogymPayload(parsed) {
  function tgNum(value) {
    if (value == null || value === "") return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function tgFlattenRecord(obj) {
    if (!obj || Array.isArray(obj) || typeof obj !== "object") return obj
    const flat = { ...obj }
    const metricPairs = Array.isArray(obj?.performedData?.pr) ? obj.performedData.pr : []
    for (let i = 0; i < metricPairs.length; i += 1) {
      const pair = metricPairs[i]
      const name = String(pair?.n || "").trim()
      if (!name) continue
      flat[name] = pair?.v
    }
    return flat
  }

  function tgFirstValue(obj, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      if (obj?.[key] != null && obj[key] !== "") return obj[key]
    }
    return null
  }

  function tgClassify(workout) {
    if (workout.TotalIsoWeight != null || workout.Rm1 != null) return "Traditional Strength Training"
    if (workout.AvgSpeedRpm != null || workout.AvgRpm != null) return "Cycling"
    if (workout.AvgRunningCadence != null || workout.RunType != null) return "Running"
    if (workout.HDistance != null) return "Cycling"
    const raw = String(workout.activity_type || workout.type || workout.raw_type || "").toLowerCase()
    if (raw.includes("run") || raw.includes("tread")) return "Running"
    if (raw.includes("bike") || raw.includes("cycl") || raw.includes("spin")) return "Cycling"
    if (raw.includes("row")) return "Rowing"
    if (raw.includes("ellip")) return "Elliptical"
    if (raw.includes("stair")) return "Stair Climbing"
    if (raw.includes("strength") || raw.includes("weight")) return "Traditional Strength Training"
    return "Indoor Cycling"
  }

  function tgLooksLikeSession(obj) {
    if (!obj || Array.isArray(obj) || typeof obj !== "object") return false
    const flat = tgFlattenRecord(obj)
    const keys = Object.keys(flat)
    if (!keys.length) return false
    const lower = keys.map(key => String(key).toLowerCase())
    const hasDate = flat?.on != null || lower.some(key => key.includes("date") || key.includes("start"))
    const hasDuration = lower.some(key => key.includes("duration") || key.includes("time") || key.includes("elapsed"))
    const hasMetrics = lower.some(key =>
      key.includes("cal") || key.includes("distance") || key.includes("rpm") || key.includes("power") || key.includes("weight") || key.includes("hr")
    )
    return (hasDate && hasDuration) || (hasDate && hasMetrics)
  }

  function tgCollectCandidates(node, acc, depth) {
    if (!node || depth > 8) return
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) tgCollectCandidates(node[i], acc, depth + 1)
      return
    }
    if (typeof node !== "object") return
    if (tgLooksLikeSession(node)) acc.push(node)
    const values = Object.values(node)
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i]
      if (value && typeof value === "object") tgCollectCandidates(value, acc, depth + 1)
    }
  }

  const candidates = []
  tgCollectCandidates(parsed, candidates, 0)

  const workouts = []
  const rejected = []
  const seen = new Set()

  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i]
    const flattened = tgFlattenRecord(raw)
    const startRaw = tgFirstValue(flattened, ["on", "start_date", "startDate", "StartDate", "Date", "date", "TrainingStartDate", "WorkoutStartDate"])
    const startDate = normalizeDateString(startRaw)

    let durationSec = tgNum(tgFirstValue(flattened, ["duration_sec", "DurationSeconds", "durationSeconds", "ElapsedSeconds", "MovingTimeSeconds"]))
    if (!Number.isFinite(durationSec)) {
      const durationMin = tgNum(tgFirstValue(flattened, ["duration_min", "DurationMinutes", "duration", "Duration", "ElapsedMinutes", "MovingTimeMinutes"]))
      if (Number.isFinite(durationMin)) durationSec = durationMin > 240 ? durationMin : durationMin * 60
    }
    if (!Number.isFinite(durationSec)) durationSec = null

    const endRaw = tgFirstValue(flattened, ["end_date", "endDate", "EndDate", "WorkoutEndDate"])
    let endDate = normalizeDateString(endRaw)
    if (!endDate && startDate && Number.isFinite(durationSec) && durationSec > 0) {
      endDate = new Date(toMs(startDate) + durationSec * 1000).toISOString()
    }

    const signature = `${startDate || "na"}|${endDate || "na"}|${JSON.stringify(Object.keys(raw).sort())}`
    if (seen.has(signature)) continue
    seen.add(signature)

    if (!startDate || !endDate) {
      rejected.push({ source: "Technogym", reason: "Missing usable start or end date", raw })
      continue
    }

    const distanceRaw = tgFirstValue(flattened, ["distance", "Distance", "HDistance", "TotalDistance", "DistanceMeters"])
    const distance = tgNum(distanceRaw)
    const type = tgClassify(flattened)

    workouts.push({
      source: "Technogym",
      raw_type: tgFirstValue(flattened, ["activity_type", "ActivityType", "type", "Type", "discipline"]) || type,
      type,
      start_date: startDate,
      end_date: endDate,
      duration_min: minutesBetween(startDate, endDate),
      distance: Number.isFinite(distance) ? distance : null,
      distance_unit: tgFirstValue(flattened, ["distance_unit", "DistanceUnit", "Unit"]) || (Number.isFinite(distance) ? "m" : null),
      calories: tgNum(tgFirstValue(flattened, ["calories", "Calories", "Energy", "TotalCalories"])) || 0,
      hr: tgNum(tgFirstValue(flattened, ["hr", "AvgHeartRate", "AverageHeartRate", "AvgHr"])) || null,
      notes: "",
      power_avg: tgNum(tgFirstValue(flattened, ["power_avg", "AvgPower", "AveragePower"])),
      level: tgNum(tgFirstValue(flattened, ["level", "Level"])),
      rpm_avg: tgNum(tgFirstValue(flattened, ["rpm_avg", "AvgRpm", "AvgSpeedRpm"])),
      vo2: tgNum(tgFirstValue(flattened, ["vo2", "VO2", "EstimatedVO2", "Vo2"])),
      raw,
    })
  }

  workouts.sort((a, b) => (toMs(a.start_date) || 0) - (toMs(b.start_date) || 0))

  return {
    workouts,
    rejected,
    diagnostics: {
      candidate_records: candidates.length,
      unique_sessions: workouts.length,
    },
  }
}

function parseTechnogymText(text) {
  return normalizeTechnogymPayload(JSON.parse(String(text || "")))
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
    if (lower.includes('"date"') && lower.includes('"exercises"')) {
      return { source: "knr_json", format: "json", confidence: "high" }
    }
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
  if (chunk.includes(",") || chunk.includes(";") || name.endsWith(".csv")) {
    const firstLine = chunk.split(/\r?\n/)[0].toLowerCase()

    // Sleep Cycle — must check before FitnessView because Sleep Cycle headers
    // contain "type", "time", and "heart rate" which falsely match FitnessView
    if (firstLine.includes("sleep quality") || firstLine.includes("time in bed") ||
        firstLine.includes("wake up") || firstLine.includes("sleep notes") ||
        (firstLine.includes("heart rate (bpm)") && firstLine.includes("steps")))
      return { source: "sleep_cycle", format: "csv", confidence: "high" }

    // HealthFit workout export — "Total Time" column distinguishes it from FitnessView
    if (firstLine.includes("total time") && firstLine.includes("active calories") &&
        firstLine.includes("type"))
      return { source: "healthfit_workout_csv", format: "csv", confidence: "high" }

    // FitnessView / HealthFit workout export — characteristic column combinations.
    // HealthFit exports vary: "Workout Type" vs "Type", "Heart Rate" vs "Avg HR".
    {
      const hasType = firstLine.includes("workout type") || firstLine.includes("activity_type") ||
        (firstLine.includes("type") && !firstLine.includes("fitness") && !firstLine.includes("fatigue"))
      const hasDist = firstLine.includes("distance")
      const hasDur = firstLine.includes("duration") || firstLine.includes("time")
      const hasPace = firstLine.includes("pace")
      const hasHR = firstLine.includes("heart rate") || firstLine.includes("avg hr") ||
        firstLine.includes("average hr")

      if (hasType && hasDur && (hasDist || hasPace || hasHR))
        return { source: "fitnessview", format: "csv", confidence: "high" }

      if (hasDist && hasPace && hasDur)
        return { source: "fitnessview", format: "csv", confidence: "high" }
    }

    // Cronometer — nutrition export
    if (firstLine.includes("energy (kcal)") || firstLine.includes("protein (g)") ||
        firstLine.includes("food name") || firstLine.includes("cronometer"))
      return { source: "cronometer", format: "csv", confidence: "high" }

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
    const hasExplicitTime =
      /T\d{1,2}:\d{2}/.test(String(dateRaw || "")) ||
      /\d{1,2}:\d{2}/.test(String(dateRaw || ""))

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
      if (!isNaN(d.getTime())) {
        const yr = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, "0")
        const dy = String(d.getDate()).padStart(2, "0")
        startDate = hasExplicitTime
          ? normalizeDateString(dateRaw)
          : `${yr}-${mo}-${dy}T00:00:00`
      }
    } catch {}
    if (!startDate) { rejected.push({ source: "FitnessView", reason: "Unparseable date: " + dateRaw, raw: raw.slice(0, 200) }); continue }

    workouts.push({
      source: "FitnessView",
      type: typeRaw,
      start_date: startDate,
      end_date: null,
      timing_precision: hasExplicitTime ? "exact" : "date_only",
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

function dateOnlyFromWorkout(value) {
  return String(value || "").slice(0, 10)
}

function fitnessViewModality(type) {
  const t = String(type || "").toLowerCase()
  if (t.includes("run")) return "run"
  if (t.includes("cycl") || t.includes("bike")) return "bike"
  if (t.includes("swim")) return "swim"
  if (t.includes("walk")) return "walk"
  if (t.includes("row")) return "row"
  if (t.includes("strength")) return "strength"
  return "other"
}

function scheduleWorkoutModality(workout) {
  const t = String(workout?.type || "").toLowerCase()
  if (t.includes("running")) return "run"
  if (t.includes("cycling") || t.includes("bike")) return "bike"
  if (t.includes("swimming")) return "swim"
  if (t.includes("walking")) return "walk"
  if (t.includes("rowing")) return "row"
  if (t.includes("strength")) return "strength"
  return "other"
}

function parseScheduleWorkoutDuration(workout) {
  const value = Number(workout?.dur ?? workout?.duration_min ?? workout?.durationMin ?? 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseScheduleWorkoutDistance(workout) {
  const value = Number(workout?.distance ?? workout?.distance_miles ?? workout?.miles ?? 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

function makeFitnessViewCanonicalSession(workout, scheduleMatch = null) {
  const schedule = scheduleMatch?.schedule || null
  const scheduleId = schedule?._scheduleId || schedule?.id || null
  const sessionId = scheduleId
    ? `schedule_fv_${scheduleId}_${stableHash(`${workout.start_date}|${workout.type}|${workout.duration_min || ""}|${workout.distance || ""}`)}`
    : makeSessionId("fv", workout)
  const hasExactTime = workout?.timing_precision === "exact"
  const startMs = Date.parse(workout.start_date || "")
  const endDate = hasExactTime && Number.isFinite(startMs) && Number(workout.duration_min) > 0
    ? new Date(startMs + Number(workout.duration_min) * 60000).toISOString()
    : workout.end_date || workout.start_date

  return {
    session_id: sessionId,
    match_confidence: schedule ? "high" : "single_source",
    relationship: schedule ? "schedule_fitnessview_linked" : "fitnessview_only",
    canonical_type: workout.type,
    start_date: workout.start_date,
    end_date: endDate,
    duration_min: workout.duration_min,
    overlap_summary: schedule ? {
      matched_by: scheduleMatch.reasons,
      schedule_workout_id: schedule.id || null,
      schedule_id: scheduleId,
      duration_diff_min: scheduleMatch.durationDiffMin,
      distance_diff_mi: scheduleMatch.distanceDiffMi,
    } : null,
    sources: {
      fitnessview: workout,
      schedule_workout: schedule,
      apple: null,
      technogym: null,
    },
    preferred_metrics: {
      hr: { value: workout.hr || null, source: "FitnessView" },
      calories: { value: workout.calories || null, source: "FitnessView" },
      distance: { value: workout.distance || null, source: "FitnessView", unit: workout.distance_unit, rationale: schedule ? "FitnessView linked to Schedule activity" : "FitnessView only" },
      power_avg: { value: null, source: null },
      level: { value: null, source: null },
      rpm_avg: { value: null, source: null },
      vo2: { value: null, source: null },
    }
  }
}

function findScheduleWorkoutMatchForFitnessView(workout, scheduleWorkouts) {
  const date = dateOnlyFromWorkout(workout.start_date)
  const modality = fitnessViewModality(workout.type)
  if (!date || modality === "other") return null

  const candidates = (Array.isArray(scheduleWorkouts) ? scheduleWorkouts : [])
    .filter(schedule => schedule?._scheduleId != null)
    .filter(schedule => dateOnlyFromWorkout(schedule.dateTime || schedule.date) === date)
    .filter(schedule => scheduleWorkoutModality(schedule) === modality)
    .map(schedule => {
      const reasons = ["same day", "compatible modality"]
      let score = 2
      const fvDuration = Number(workout.duration_min || 0) || null
      const scheduleDuration = parseScheduleWorkoutDuration(schedule)
      const durationDiffMin = fvDuration && scheduleDuration ? Math.abs(fvDuration - scheduleDuration) : null
      if (durationDiffMin != null && durationDiffMin <= Math.max(10, scheduleDuration * 0.35)) {
        score += 2
        reasons.push("duration similarity")
      } else if (durationDiffMin != null) {
        score -= 2
      }

      const fvDistance = Number(workout.distance || 0) || null
      const scheduleDistance = parseScheduleWorkoutDistance(schedule)
      const distanceDiffMi = fvDistance && scheduleDistance ? Math.abs(fvDistance - scheduleDistance) : null
      if (distanceDiffMi != null && distanceDiffMi <= Math.max(0.35, scheduleDistance * 0.3)) {
        score += 2
        reasons.push("distance similarity")
      } else if (distanceDiffMi != null) {
        score -= 2
      }

      const fvMs = Date.parse(workout.start_date || "")
      const scheduleMs = Date.parse(schedule.dateTime || "")
      if (
        Number.isFinite(fvMs) &&
        Number.isFinite(scheduleMs) &&
        String(workout.start_date || "").includes("T00:00:00") === false
      ) {
        const diffMin = Math.abs(fvMs - scheduleMs) / 60000
        if (diffMin <= 90) {
          score += 2
          reasons.push("time window")
        } else {
          score -= 3
        }
      }

      return { schedule, score, reasons, durationDiffMin, distanceDiffMi }
    })
    .filter(match => match.score >= 4)
    .sort((a, b) => b.score - a.score)

  if (!candidates.length) return null
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null
  return candidates[0]
}

function makeFitnessViewCanonicalSessions(workouts, scheduleWorkouts) {
  return (Array.isArray(workouts) ? workouts : []).map(workout =>
    makeFitnessViewCanonicalSession(workout, findScheduleWorkoutMatchForFitnessView(workout, scheduleWorkouts))
  )
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

  // Detect delimiter — Sleep Cycle exports use semicolons, most others use commas
  const firstLine = lines[0]
  const delim = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ","
  const splitRow = row => row.split(delim).map(c => c.trim().replace(/^"|"$/g, ""))

  const headers = splitRow(lines[0]).map(h => h.toLowerCase())
  const sleep = []
  const rejected = []

  const col = name => headers.findIndex(h => h.includes(name))
  const iDate    = col("date")
  const iQual    = Math.max(col("sleep quality"), col("quality"), col("score"))
  // Prefer "time asleep" over "time in bed"; Sleep Cycle exports often label these as seconds.
  const iAsleep  = col("time asleep")
  const iInBed   = col("time in bed")
  const iDur     = iAsleep >= 0 ? iAsleep : Math.max(iInBed, col("duration"), col("sleep time"))
  const iStart   = Math.max(col("bedtime"), col("sleep start"), col("start time"), col("start"))
  const iEnd     = Math.max(col("wake up time"), col("wake up"), col("end time"), col("end"))
  const iHR      = Math.max(col("heart rate"), col("avg hr"))
  const iSteps   = col("steps")
  const iNotes   = Math.max(col("sleep notes"), col("note"))
  const durHeader = iDur >= 0 ? headers[iDur] : ""
  const durationIsSeconds = /\(seconds\)/.test(durHeader)

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    const cells = splitRow(raw)
    if (cells.length < 2) continue

    // Use the wake-up (end) time as the canonical sleep date — convention: the night
    // belongs to the date you woke up on. Sessions spanning midnight (e.g., sleep
    // Apr 14 22:14, wake Apr 15 03:19) correctly land on Apr 15, not Apr 14.
    // Fall back to explicit date column, then start time, in that order.
    const endRaw   = iEnd   >= 0 ? cells[iEnd]   : null
    const dateRaw  = endRaw || (iDate >= 0 ? cells[iDate] : null) || (iStart >= 0 ? cells[iStart] : null)
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
      else {
        const rawDuration = n(durRaw)
        durationMin = rawDuration == null ? null : (durationIsSeconds ? rawDuration / 60 : rawDuration)
      }
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
      sleep_id: `sc_${String(dateRaw || "").replace(/\W/g, "").slice(0, 17)}`,
    })
  }

  return { workouts: [], sleep, rejected }
}

function parseHealthFitWorkoutCSV(text) {
  const delimiter = ","
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { records: [], rejected: [] }

  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/\s+/g, "_"))
  const col = key => headers.indexOf(key)

  const typeMap = {
    "outdoor running": "Running", "indoor running": "Running",
    "outdoor cycling": "Cycling", "indoor cycling": "Indoor Cycling",
    "pool swim": "Swimming", "open water swimming": "Swimming",
    "outdoor walking": "Walking", "indoor walking": "Walking",
    "strength training": "Functional Strength Training",
    "traditional strength training": "Traditional Strength Training",
    "hiit": "HIIT", "yoga": "Yoga", "elliptical": "Elliptical",
    "rowing": "Rowing", "stair stepper": "Stairs",
  }

  const parseHMS = val => {
    if (!val) return 0
    const m = String(val).match(/(\d+)h:(\d+)m:(\d+)s/)
    if (!m) return 0
    return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60
  }

  const parseVal = val => {
    if (!val) return null
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ""))
    return Number.isFinite(n) ? n : null
  }

  const parseDate = (dateStr, timeStr) => {
    if (!dateStr) return null
    const d = dateStr.trim()
    const t = (timeStr || "00:00").trim()
    const parts = d.split("/")
    if (parts.length !== 3) return null
    const [m, day, yr] = parts
    const iso = `${yr}-${m.padStart(2, "0")}-${day.padStart(2, "0")}T${t}:00`
    const dt = new Date(iso)
    return Number.isFinite(dt.getTime()) ? dt.toISOString() : null
  }

  const records = []
  const rejected = []

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    const cells = raw.split(delimiter).map(c => c.trim())

    const dateStr = cells[col("date")]
    const timeStr = cells[col("time")]
    const typRaw = (cells[col("type")] || "").toLowerCase()
    const startISO = parseDate(dateStr, timeStr)

    if (!startISO) {
      rejected.push({ row: i, reason: "bad date", raw: raw.slice(0, 100) })
      continue
    }

    const canonical_type = typeMap[typRaw] || "Other"
    const duration_min = parseHMS(cells[col("total_time")])
    const distance_raw = cells[col("distance")]
    const distance_mi = distance_raw ? parseVal(distance_raw) : null
    const calories = parseVal(cells[col("active_calories")])
    const hr_avg = parseVal(cells[col("avg._heart_rate")])
    const hr_max = parseVal(cells[col("max._heart_rate")])
    const trimp = parseVal(cells[col("trimp")])

    records.push({
      session_id: `hf_${startISO.replace(/\D/g, "").slice(0, 17)}`,
      canonical_type,
      start_date: startISO,
      duration_min,
      distance: distance_mi,
      distance_unit: distance_mi != null ? "mi" : null,
      calories,
      hr: hr_avg,
      hr_max,
      trimp,
      source: "healthfit_workout_csv",
      preferred_metrics: {
        ...(calories != null ? { calories: { value: calories, unit: "kcal", source: "healthfit" } } : {}),
        ...(hr_avg != null ? { hr: { value: hr_avg, unit: "bpm", source: "healthfit" } } : {}),
        ...(distance_mi != null ? { distance: { value: distance_mi, unit: "mi", source: "healthfit" } } : {}),
      }
    })
  }

  return { records, rejected }
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
// APPLE HEALTH DAILY METRICS CSV PARSER
// Preserves daily nonworkout aggregates without sending them into workout logic.
// ─────────────────────────────────────────────────────────────────────────────

function parseAppleHealthDailyMetricsCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { workouts: [], biometrics: [], rejected: [] }

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const biometrics = []
  const rejected = []

  const col = name => headers.findIndex(h => h.includes(name.toLowerCase()))
  const exactCol = name => headers.findIndex(h => h === name.toLowerCase())
  const iDate     = col("date")
  const iActive   = col("active energy")
  const iRestingE = col("resting energy")
  const iResting  = exactCol("resting")
  const iHRV      = col("hrv")
  const iSteps    = col("steps")
  const iVo2      = Math.max(col("vo2 max"), col("vo₂ max"))
  const iExercise = col("exercise minutes")
  const iStand    = col("stand hours")

  const n = v => {
    const p = parseFloat(String(v || "").replace(/,/g, "").replace(/[^\d.-]/g, ""))
    return Number.isFinite(p) ? p : null
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    const cells = raw.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    if (cells.length < 2) continue

    const dateRaw = iDate >= 0 ? cells[iDate] : ""
    if (!dateRaw) { rejected.push({ source: "AppleHealthCSV", reason: "Missing date", raw: raw.slice(0, 200) }); continue }

    let date = null
    try {
      const d = new Date(dateRaw)
      if (!Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10)
    } catch {}
    if (!date) { rejected.push({ source: "AppleHealthCSV", reason: "Bad date: " + dateRaw, raw: raw.slice(0, 200) }); continue }

    biometrics.push({
      source: "AppleHealthCSV_DailyMetrics",
      date,
      active_energy_cal: n(iActive >= 0 ? cells[iActive] : null),
      resting_energy_cal: n(iRestingE >= 0 ? cells[iRestingE] : null),
      resting_hr_bpm: n(iResting >= 0 ? cells[iResting] : null),
      hrv: n(iHRV >= 0 ? cells[iHRV] : null),
      steps: n(iSteps >= 0 ? cells[iSteps] : null),
      vo2_max: n(iVo2 >= 0 ? cells[iVo2] : null),
      exercise_minutes: n(iExercise >= 0 ? cells[iExercise] : null),
      stand_hours: n(iStand >= 0 ? cells[iStand] : null),
    })
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
    let date = String(dateRaw).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Try "Mar 18, 2026" or other locale-parseable formats
      const d = new Date(dateRaw)
      if (!Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10)
    }
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
  knr_json:           { label: "KNR JSON",              color: "#4ade80" },
  fitnessview:        { label: "FitnessView",           color: "#8b5cf6" },
  healthfit_workout_csv: { label: "HealthFit Workouts", color: "#f59e0b" },
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

function makeImportFileReviewRow(fileInfo, reason) {
  const src = fileInfo?.detected?.source || "unknown"
  const confidence = fileInfo?.detected?.confidence || "low"
  return {
    review_id: `file_${stableHash(`${fileInfo?.file?.name || "unknown"}|${fileInfo?.file?.size || 0}|${src}|${reason || ""}`)}`,
    review_kind: "file_review",
    confidence,
    source: src,
    file_name: fileInfo?.file?.name || "Unknown file",
    file_size: fileInfo?.file?.size || 0,
    first_chunk: fileInfo?.firstChunk || "",
    reasons: [reason || `File held for manual review (${src}, ${confidence} confidence).`],
  }
}

function ImportTab({ canonicalSessions, setCanonicalSessions, setHealthFitDaily, setSleepRecords, setBiometricRecords, setSchedLog, healthFitDaily, biometricRecords, ocItems }) {
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
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoExtracting, setPhotoExtracting] = useState(false)
  const [photoResult, setPhotoResult] = useState(null)
  const [photoError, setPhotoError] = useState(null)

  const handleExportReport = () => {
    generateTrainerReport({
      healthFitDaily: healthFitDaily || [],
      biometricRecords: biometricRecords || [],
      dexaData: typeof DEXA_REGIONAL !== "undefined" ? DEXA_REGIONAL : [],
      ocItems: ocItems || [],
      snapshotDate: new Date().toISOString().slice(0, 10)
    })
  }

  const worker = useMemo(() => createInlineImportWorker(), [])
  const pendingFileReviewRowsRef = useRef([])
  useEffect(() => () => worker.terminate(), [worker])

  const extractWorkoutFromPhoto = async file => {
    setPhotoExtracting(true)
    setPhotoError(null)
    setPhotoResult(null)

    try {
      if (!ANTHROPIC_API_KEY) {
        setPhotoError("Photo extraction is not configured on this deployment. Add VITE_ANTHROPIC_API_KEY to enable it.")
        return
      }

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(",")[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mediaType = file.type || "image/jpeg"

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 }
              },
              {
                type: "text",
                text: `Extract the workout data from this handwritten KNR session sheet.
Return ONLY a JSON object with this exact structure, no explanation:
{
  "date": "YYYY-MM-DD or MM/DD as written",
  "day": "Mon|Tue|Wed|Thu|Fri|Sat|Sun",
  "workoutType": "Upper|Lower|Combined|Other",
  "venue": "KNR",
  "exercises": [
    {
      "name": "exercise name as written",
      "sets": [
        { "reps": "number or descriptor", "weight": "number or BW or band descriptor" }
      ],
      "hr": "heart rate if noted",
      "rpe": "RPE if noted",
      "notes": "any notes"
    }
  ],
  "coreExercises": [
    {
      "name": "exercise name",
      "sets": "descriptor e.g. 3x8 or 3 sets of 8",
      "weight": "if noted",
      "notes": "any notes"
    }
  ],
  "warmupCompleted": true
}`
              }
            ]
          }]
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error?.message || `Extraction failed (${response.status})`)
      }

      const data = await response.json()
      const text = data?.content?.[0]?.text || ""
      const clean = text.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(clean)
      setPhotoResult(parsed)
    } catch (err) {
      setPhotoError(err?.message || "Extraction failed. Check the image and try again.")
    } finally {
      setPhotoExtracting(false)
    }
  }

  const commitPhotoSession = () => {
    if (!photoResult) return

    const dateStr = (() => {
      const raw = String(photoResult.date || "")
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
      const parts = raw.split("/")
      if (parts.length === 2) {
        const year = new Date().getFullYear()
        const m = String(parts[0]).padStart(2, "0")
        const d = String(parts[1]).padStart(2, "0")
        return `${year}-${m}-${d}`
      }
      return new Date().toISOString().slice(0, 10)
    })()

    const allExercises = [
      ...(photoResult.exercises || []),
      ...(photoResult.coreExercises || []).map(e => ({ ...e, isCore: true }))
    ]

    const entry = {
      id: Date.now(),
      date: dateStr,
      logged_at: new Date().toISOString(),
      day: photoResult.day || "Thu",
      venue: "knr",
      venue_label: "KNR (9:35–10:45)",
      source: "photo_import",
      exercises: allExercises.map((ex, i) => ({
        exercise_id: `photo_${i}`,
        exercise_name: ex.name,
        variant: "machine",
        actual: {
          sets: ex.sets?.length || (ex.sets ? 1 : null),
          reps: ex.sets?.[0]?.reps || ex.sets || null,
          load: ex.sets?.[0]?.weight || ex.weight || null
        },
        sets: ex.sets || [],
        notes: ex.notes || "",
        hr: ex.hr || null,
        rpe: ex.rpe || null,
        isCore: ex.isCore || false
      })),
      data: {},
      cardio: [],
      rpe: null
    }

    const existing = JSON.parse(localStorage.getItem("wt-log") || "[]")
    const updated = [entry, ...existing].sort((a, b) => b.id - a.id)
    localStorage.setItem("wt-log", JSON.stringify(updated))

    if (typeof setSchedLog === "function") setSchedLog(updated)

    setPhotoResult(null)
    setPhotoFile(null)
    setPhotoPreview(null)
    alert(`Session imported for ${dateStr}. Check the Schedule tab to review.`)
  }

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
      const fileReviewRows = Array.isArray(pendingFileReviewRowsRef.current) ? pendingFileReviewRowsRef.current : []
      const mergedReviewRows = [...(Array.isArray(next?.review) ? next.review : []), ...fileReviewRows]
      const nextResult = next ? {
        ...next,
        review: mergedReviewRows,
        summary: {
          ...(next.summary || {}),
          review: mergedReviewRows.length
        }
      } : null
      setResult(nextResult)
      setReviewRows(mergedReviewRows)
      setSelectedReviewIds([])
      pendingFileReviewRowsRef.current = []
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
    pendingFileReviewRowsRef.current = []

    let appleFile = null, technogymFile = null
    const allNutrition = [], allSleep = [], allBiometrics = [], allHealthFit = [], allRejected = [], allKnrSessions = []
    const pendingReviewRows = []

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

      if (src === "fitnessview") {
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
              const scheduleWorkouts = await store.get("ufd-workouts") || []
              const accepted = makeFitnessViewCanonicalSessions(fvSessions, scheduleWorkouts)
              const linkedCount = accepted.filter(session => session.relationship === "schedule_fitnessview_linked").length
              const mergedReviewRows = pendingReviewRows.slice()
              setResult({ accepted, all_sessions: accepted, review: mergedReviewRows, rejected: allRejected,
                summary: { accepted: accepted.length, linked: linkedCount, review: mergedReviewRows.length, rejected: allRejected.length, total: accepted.length } })
              setReviewRows(mergedReviewRows)

              // Persist immediately so mobile tab eviction cannot drop staged sessions.
              try {
                const existingCanonical = supabase && STORE_USER_ID
                  ? await loadCanonicalSessions(supabase, STORE_USER_ID).catch(() => canonicalSessions)
                  : canonicalSessions
                const mergedSessions = dedupeCanonicalSessions([
                  ...(Array.isArray(existingCanonical) ? existingCanonical : []),
                  ...accepted,
                ])
                const policyMerged = mergedSessions.map(applyCanonicalSessionMergePolicy)
                localStorage.setItem("lift_canonical_sessions", JSON.stringify(policyMerged))
                setCanonicalSessions(policyMerged)
                if (supabase && STORE_USER_ID) {
                  await upsertCanonicalSessions(supabase, STORE_USER_ID, policyMerged)
                  const remote = await loadCanonicalSessions(supabase, STORE_USER_ID)
                  localStorage.setItem("lift_canonical_sessions", JSON.stringify(remote))
                  setCanonicalSessions(remote)
                }
                setStatus(`FitnessView: ${accepted.length} sessions committed (${linkedCount} linked to Schedule, ${accepted.length - linkedCount} standalone)`)
              } catch (autoCommitErr) {
                setStatus(`FitnessView: ${accepted.length} sessions staged — auto-commit failed (${autoCommitErr.message}). Tap Commit to dashboard to save.`)
              }

              setImporting(false)
              return
            }
          }
        }
        continue
      }

      if (src === "apple_health_csv") {
        const parsed = parseAppleHealthDailyMetricsCSV(text)
        allBiometrics.push(...(parsed.biometrics || []))
        allRejected.push(...(parsed.rejected || []))
        setStatus(`Apple Health CSV: ${parsed.biometrics.length} daily metric rows parsed`)
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

      if (src === "healthfit_workout_csv") {
        const { records, rejected } = parseHealthFitWorkoutCSV(text)
        allKnrSessions.push(...records)
        allRejected.push(...(rejected || []))
        setStatus(`HealthFit workouts: ${records.length} sessions parsed`)
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

      if (src === "knr_json") {
        try {
          const parsed = parseKnrJsonSessions(text, canonicalSessions)
          allKnrSessions.push(...(parsed.accepted || []))
          allRejected.push(...(parsed.rejected || []))
          setStatus(`KNR JSON: ${(parsed.accepted || []).length} sessions parsed`)
          continue
        } catch (err) {
          setStatus(`Error: ${err?.message || String(err)}`)
          setImporting(false)
          return
        }
      }

      pendingReviewRows.push(makeImportFileReviewRow(
        q,
        `Auto-detection returned '${src}' (${q.detected.confidence} confidence). File held for manual review instead of being rejected.`
      ))
    }

    pendingFileReviewRowsRef.current = pendingReviewRows
    setReviewRows(pendingReviewRows)

    // Store secondary results
    if (allNutrition.length) setNutritionResult(allNutrition)
    if (allSleep.length) setSleepResult(allSleep)
    if (allBiometrics.length) setBiometricResult(allBiometrics)
    if (allHealthFit.length) setHealthFitResult(allHealthFit)

    // Technogym-only imports do not need the generic overlap worker.
    // Parse directly so the UI cannot get stranded waiting on overlap state.
    if (allKnrSessions.length) {
      const accepted = dedupeCanonicalSessions(allKnrSessions)
      const mergedReviewRows = pendingReviewRows.slice()
      setResult({
        accepted,
        all_sessions: accepted,
        review: mergedReviewRows,
        rejected: allRejected,
        generated_at: new Date().toISOString(),
        summary: {
          accepted: accepted.length,
          linked: 0,
          review: mergedReviewRows.length,
          rejected: allRejected.length,
          total: accepted.length
        }
      })
      setReviewRows(mergedReviewRows)
      setSelectedReviewIds([])
      pendingFileReviewRowsRef.current = []
      setStatus(`KNR JSON: ${accepted.length} sessions ready`)
      setImporting(false)
    } else if (technogymFile && !appleFile) {
      const technogymText = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = e => res(e.target?.result || "")
        r.onerror = () => rej(new Error("Read failed"))
        r.readAsText(technogymFile)
      }).catch(() => null)

      if (!technogymText) {
        setStatus("Error: Technogym file read failed")
        setImporting(false)
        return
      }

      try {
        const technogym = parseTechnogymText(technogymText)
        const accepted = (Array.isArray(technogym.workouts) ? technogym.workouts : [])
          .map(workout => makeSessionFromSingleSource("techno", null, workout))
        const built = {
          accepted,
          review: [],
          rejected: Array.isArray(technogym.rejected) ? technogym.rejected.slice() : [],
          all_sessions: accepted.slice(),
          generated_at: new Date().toISOString(),
          summary: {
            total: accepted.length,
            accepted: accepted.length,
            review: 0,
            rejected: Array.isArray(technogym.rejected) ? technogym.rejected.length : 0,
            linked: 0,
            unmatched_apple: 0,
            unmatched_technogym: accepted.length,
          },
        }
        built.diagnostics = {
          apple: { parsed_lines: 0 },
          technogym: technogym.diagnostics,
          overlaps: { total_candidates: 0, strong_candidates: 0, weak_candidates: 0 }
        }
        built.appleSleep = []

        const mergedReviewRows = [...(Array.isArray(built?.review) ? built.review : []), ...pendingReviewRows]
        setResult({
          ...built,
          review: mergedReviewRows,
          summary: {
            ...(built.summary || {}),
            review: mergedReviewRows.length
          }
        })
        setReviewRows(mergedReviewRows)
        setSelectedReviewIds([])
        pendingFileReviewRowsRef.current = []
        setStatus(`Technogym: ${built.accepted?.length || 0} sessions ready`)
      } catch (err) {
        setStatus(`Error: ${err?.message || String(err)}`)
      } finally {
        setImporting(false)
      }
    // Send Apple + Technogym to worker for overlap pipeline
    } else if (appleFile || technogymFile) {
      setStatus("Running overlap pipeline...")
      worker.postMessage({ type: "process", appleFile, technogymFile })
    } else if (allNutrition.length || allSleep.length || allBiometrics.length || allHealthFit.length) {
      setStatus("Small-source files processed. Sleep, daily metrics, biometrics, and nutrition are ready to commit.")
      setImporting(false)
    } else if (pendingReviewRows.length) {
      setStatus("Files held for manual review. Override source if needed, then reprocess.")
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
        const existingCanonical = supabase && STORE_USER_ID
          ? await loadCanonicalSessions(supabase, STORE_USER_ID).catch(() => canonicalSessions)
          : canonicalSessions
        const mergedSessions = dedupeCanonicalSessions([...(Array.isArray(existingCanonical) ? existingCanonical : []), ...sessions])
        const policyMergedSessions = mergedSessions.map(applyCanonicalSessionMergePolicy)
        localStorage.setItem("lift_canonical_sessions", JSON.stringify(policyMergedSessions))
        setCanonicalSessions(policyMergedSessions)
        committed += sessions.length
        if (supabase && STORE_USER_ID) {
          await upsertCanonicalSessions(supabase, STORE_USER_ID, policyMergedSessions)
          const remoteSessions = await loadCanonicalSessions(supabase, STORE_USER_ID)
          localStorage.setItem("lift_canonical_sessions", JSON.stringify(remoteSessions))
          setCanonicalSessions(remoteSessions)
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
      // Small-source imports: local fallback, Supabase tables when signed in
      if (sleepResult.length) {
        const existing = supabase && STORE_USER_ID
          ? await loadSleepRecords(supabase, STORE_USER_ID).catch(() =>
              JSON.parse(localStorage.getItem("lift_sleep_records") || "[]")
            )
          : JSON.parse(localStorage.getItem("lift_sleep_records") || "[]")
        const combined = [
          ...(Array.isArray(existing) ? existing : []),
          ...sleepResult.map(r => ({ ...r, date: getSleepRecordDate(r) || r.date })).filter(r => r.date)
        ]
        const merged = deduplicateSleepRecords(combined)
          .sort((a, b) => (a.start_at || a.date || '').localeCompare(b.start_at || b.date || ''))
        localStorage.setItem("lift_sleep_records", JSON.stringify(merged))
        if (setSleepRecords) setSleepRecords(merged)
        committed += sleepResult.length
        if (supabase && STORE_USER_ID) {
          // Fire-and-forget with timeout — local save already complete above
          const sleepSyncTimeout = new Promise(resolve => setTimeout(resolve, 15000))
          Promise.race([
            upsertSleepRecords(supabase, STORE_USER_ID, merged)
              .then(async () => {
                try {
                  const remoteSleep = await loadSleepRecords(supabase, STORE_USER_ID)
                  if (Array.isArray(remoteSleep) && remoteSleep.length >= merged.length) {
                    localStorage.setItem("lift_sleep_records", JSON.stringify(remoteSleep))
                    if (setSleepRecords) setSleepRecords(remoteSleep)
                  }
                } catch (readBackErr) {
                  console.warn("[LIFT] Sleep read-back after commit failed, using local merge", readBackErr)
                }
              })
              .catch(upsertErr => {
                console.warn("[LIFT] Sleep upsert failed, sleep saved locally only", upsertErr)
              }),
            sleepSyncTimeout.then(() => {
              console.warn("[LIFT] Sleep Supabase sync timed out after 15s, local save is authoritative")
            })
          ])
        }
      }
      if (biometricResult.length) {
        const existing = supabase && STORE_USER_ID
          ? await loadBiometricRecords(supabase, STORE_USER_ID).catch(() =>
              JSON.parse(localStorage.getItem("lift_biometric_records") || "[]")
            )
          : JSON.parse(localStorage.getItem("lift_biometric_records") || "[]")
        const bioKey = r => r.biometric_id || r.id || `${r.source || "bio"}_${r.timestamp || r.date}`
        const byKey = {}
        ;(Array.isArray(existing) ? existing : []).forEach(r => { byKey[bioKey(r)] = r })
        biometricResult.forEach(r => {
          const k = bioKey(r)
          const ex = byKey[k]
          // Source priority: a trainer-entered record for this key is never overwritten by an import
          if (ex && ex.source === "trainer" && r.source !== "trainer") return
          // Date-level protection: if any existing record for this date was trainer-entered, skip import record
          const rDate = (r.timestamp || r.date || "").slice(0, 10)
          const trainerHoldsDate = rDate && Object.values(byKey).some(
            e => (e.timestamp || e.date || "").slice(0, 10) === rDate && e.source === "trainer"
          )
          if (trainerHoldsDate && r.source !== "trainer") return
          byKey[k] = r
        })
        const merged = Object.values(byKey).sort((a, b) => String(a.timestamp || a.date || "").localeCompare(String(b.timestamp || b.date || "")))
        localStorage.setItem("lift_biometric_records", JSON.stringify(merged))
        if (setBiometricRecords) setBiometricRecords(merged)
        committed += biometricResult.length
        if (supabase && STORE_USER_ID) {
          await upsertBiometricRecords(supabase, STORE_USER_ID, merged)
          const remoteBiometrics = await loadBiometricRecords(supabase, STORE_USER_ID)
          localStorage.setItem("lift_biometric_records", JSON.stringify(remoteBiometrics))
          if (setBiometricRecords) setBiometricRecords(remoteBiometrics)
        }
      }

      // HealthFit CTL/ATL/TSB — local fallback, Supabase healthfit_daily when signed in
      if (healthFitResult.length) {
        const existing = await store.get("healthfit-daily") || []
        const byDate = {}
        ;(Array.isArray(existing) ? existing : []).forEach(r => { byDate[r.date] = r })
        healthFitResult.forEach(r => { byDate[r.date] = r })
        const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
        localStorage.setItem("healthfit-daily", JSON.stringify(merged))
        if (setHealthFitDaily) setHealthFitDaily(merged)
        committed += healthFitResult.length
        if (supabase && STORE_USER_ID) {
          await upsertHealthfitDaily(supabase, STORE_USER_ID, merged)
          const remoteHealthFit = await loadHealthfitDaily(supabase, STORE_USER_ID)
          localStorage.setItem("healthfit-daily", JSON.stringify(remoteHealthFit))
          if (setHealthFitDaily) setHealthFitDaily(remoteHealthFit)
        }
      }

      setStatus(`Committed ${committed} records.${sleepResult.length ? ` ${sleepResult.length} sleep records saved.` : ""}${biometricResult.length ? ` ${biometricResult.length} biometrics saved.` : ""}${healthFitResult.length ? ` ${healthFitResult.length} HealthFit records saved.` : ""}${reviewRows.length ? ` ${reviewRows.length} still in review.` : ""}`)
    } catch (err) {
      setStatus(`Commit failed: ${err.message || String(err)}`)
    }
  }, [result, nutritionResult, sleepResult, biometricResult, healthFitResult, reviewRows.length, setCanonicalSessions, setHealthFitDaily, setSleepRecords, setBiometricRecords])

  const cs = SOURCE_LABELS
  const s = v => ({ padding: "4px 8px", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer", background: "#1a1b2e", color: "#aaa", fontFamily: "inherit", ...v })
  const overlapReviewRows = reviewRows.filter(row => row?.review_kind !== "file_review")
  const fileReviewRows = reviewRows.filter(row => row?.review_kind === "file_review")

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
            disabled={!result?.accepted?.length && !nutritionResult.length && !sleepResult.length && !biometricResult.length && !healthFitResult.length}>
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

      <div style={{
        marginTop: 24,
        padding: '18px 20px',
        background: '#0b0d14',
        border: '1px solid #1a1b2e',
        borderRadius: 8,
      }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.14em',
          color: '#444',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Trainer Report Export
        </div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 14, lineHeight: 1.6 }}>
          Generates a self-contained HTML snapshot of your current data — training load,
          body composition, running protocol, schedule, and operational capacity —
          formatted for your trainer. Open in any browser, no login required.
        </div>
        <button
          onClick={handleExportReport}
          style={{
            background: '#0d1a0d',
            border: '1px solid #1a3a1a',
            borderRadius: 6,
            color: '#4a8a4a',
            fontSize: 12,
            letterSpacing: '0.08em',
            padding: '9px 20px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Generate Trainer Report ↓
        </button>
      </div>

      <div style={{ marginTop: 24, padding: "16px", background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: 12 }}>
        <div style={{ fontWeight: "bold", marginBottom: 8, fontSize: 13 }}>
          Import from KNR Sheet Photo
        </div>
        <div style={{ fontSize: 11, color: "#555", marginBottom: 12, lineHeight: 1.6 }}>
          Take a photo of your KNR handwritten session sheet. Claude will read it and create a draft log entry.
        </div>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          id="knr-photo-input"
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            setPhotoFile(file)
            setPhotoResult(null)
            setPhotoError(null)
            const url = URL.createObjectURL(file)
            setPhotoPreview(url)
          }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={() => document.getElementById("knr-photo-input").click()}
            style={{ padding: "8px 16px", background: "#0d1a2e", border: "1px solid #1a3a5a", borderRadius: 8, color: "#4a9ee8", fontSize: 12, cursor: "pointer" }}
          >
            {photoFile ? "Change photo" : "Choose photo"}
          </button>
          {photoFile && !photoExtracting && !photoResult && (
            <button
              onClick={() => extractWorkoutFromPhoto(photoFile)}
              style={{ padding: "8px 16px", background: "#0d2e1a", border: "1px solid #1a5a3a", borderRadius: 8, color: "#4ae880", fontSize: 12, cursor: "pointer" }}
            >
              Extract workout
            </button>
          )}
        </div>

        {photoPreview && (
          <img src={photoPreview} alt="Sheet preview"
            style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, marginBottom: 12, border: "1px solid #1a1b2e", objectFit: "contain" }} />
        )}

        {photoExtracting && (
          <div style={{ fontSize: 12, color: "#4a9ee8", padding: "12px 0" }}>Reading sheet...</div>
        )}

        {photoError && (
          <div style={{ fontSize: 12, color: "#ef4444", padding: "8px", background: "rgba(239,68,68,0.08)", borderRadius: 6, marginBottom: 8 }}>
            {photoError}
          </div>
        )}

        {photoResult && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "#4ade80", marginBottom: 8, fontWeight: 600 }}>
              Extracted: {photoResult.date} · {photoResult.workoutType} · {(photoResult.exercises?.length || 0) + (photoResult.coreExercises?.length || 0)} exercises
            </div>
            <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: 8, padding: 10, marginBottom: 10, maxHeight: 240, overflowY: "auto" }}>
              {[...(photoResult.exercises || []), ...(photoResult.coreExercises || []).map(e => ({ ...e, _core: true }))].map((ex, i) => (
                <div key={i} style={{ fontSize: 11, padding: "4px 0", borderBottom: "1px solid #111", color: "#ccc" }}>
                  <span style={{ color: ex._core ? "#a78bfa" : "#4a9ee8", marginRight: 6 }}>
                    {ex._core ? "◆" : "●"}
                  </span>
                  <strong>{ex.name}</strong>
                  {ex.sets && Array.isArray(ex.sets) && ex.sets.length > 0 && (
                    <span style={{ color: "#777", marginLeft: 8 }}>
                      {ex.sets.map((s, si) => `S${si + 1}: ${s.reps}r @ ${s.weight}`).join(" · ")}
                    </span>
                  )}
                  {ex.sets && typeof ex.sets === "string" && (
                    <span style={{ color: "#777", marginLeft: 8 }}>{ex.sets}</span>
                  )}
                  {ex.hr && <span style={{ color: "#ef4444", marginLeft: 8 }}>HR {ex.hr}</span>}
                  {ex.rpe && <span style={{ color: "#fbbf24", marginLeft: 8 }}>RPE {ex.rpe}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={commitPhotoSession}
                style={{ padding: "8px 18px", background: "#0d2e1a", border: "1px solid #1a5a3a", borderRadius: 8, color: "#4ae880", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
              >
                Add to Schedule Log
              </button>
              <button
                onClick={() => { setPhotoResult(null); setPhotoFile(null); setPhotoPreview(null) }}
                style={{ padding: "8px 14px", background: "transparent", border: "1px solid #222", borderRadius: 8, color: "#555", fontSize: 12, cursor: "pointer" }}
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      {(result || nutritionResult.length > 0 || sleepResult.length > 0 || biometricResult.length > 0 || healthFitResult.length > 0) && (
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
            {healthFitResult.length > 0 && <SummaryCell label="HealthFit daily" value={healthFitResult.length} />}
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
                Ambiguous session overlaps and held files are listed here for manual review. Nothing is dropped automatically.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", opacity: overlapReviewRows.length ? 1 : 0.55 }}>
              {[["same_session","Same session"],["different_sessions","Two sessions"],["ignore_apple","Drop Apple"],["ignore_technogym","Drop Technogym"],["reject","Reject"]].map(([action, label]) => (
                <button key={action} onClick={() => applyBatchAction(action)} style={s({ fontSize: 12, padding: "5px 10px" })}
                  disabled={!selectedReviewIds.length || !overlapReviewRows.length}>{label}</button>
              ))}
            </div>
          </div>
          {overlapReviewRows.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: fileReviewRows.length ? 16 : 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a1b2e", textAlign: "left" }}>
                    {["", "Date", "Apple type", "Technogym type", "Start Δ", "Overlap", "Confidence", "Flag"].map(h => (
                      <th key={h} style={{ padding: "8px 6px", fontWeight: 600, color: "#888", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overlapReviewRows.map(row => (
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
          )}

          {fileReviewRows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: 8 }}>
                Held files. Use the source override in the queued files list and re-run processing.
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a1b2e", textAlign: "left" }}>
                    {["File", "Detected source", "Confidence", "Reason"].map(h => (
                      <th key={h} style={{ padding: "8px 6px", fontWeight: 600, color: "#888", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fileReviewRows.map(row => (
                    <tr key={row.review_id} style={{ borderBottom: "1px solid #111", verticalAlign: "top" }}>
                      <td style={{ padding: "8px 6px" }}>{row.file_name || "—"}</td>
                      <td style={{ padding: "8px 6px" }}>{cs[row.source]?.label || row.source || "Unknown"}</td>
                      <td style={{ padding: "8px 6px", textTransform: "capitalize" }}>{row.confidence || "—"}</td>
                      <td style={{ padding: "8px 6px", color: "#d97706", fontSize: 11 }}>{Array.isArray(row.reasons) ? row.reasons[0] : "review"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
      distance: Number.isFinite(Number(technoRecord?.distance)) && Number(technoRecord.distance) > 0 ? { value: technoRecord.distance, source: "Technogym", rationale: "Manual review resolution", unit: technoRecord.distance_unit || "m" } : Number.isFinite(Number(appleRecord?.distance)) && Number(appleRecord.distance) > 0 ? { value: appleRecord.distance, source: "AppleHealth", rationale: "Manual review resolution", unit: appleRecord.distance_unit || null } : { value: null, source: null, rationale: null, unit: null },
      power_avg: { value: technoRecord?.power_avg ?? null, source: technoRecord?.power_avg != null ? "Technogym" : null },
      level: { value: technoRecord?.level ?? null, source: technoRecord?.level != null ? "Technogym" : null },
      rpm_avg: { value: technoRecord?.rpm_avg ?? null, source: technoRecord?.rpm_avg != null ? "Technogym" : null },
      vo2: { value: technoRecord?.vo2 ?? null, source: technoRecord?.vo2 != null ? "Technogym" : null, note: technoRecord?.vo2 != null ? "Technogym workout-level VO2 estimate" : null }
    }
  }
}

function getKnrSubtypeLabel(value) {
  const raw = String(value || "").trim().toLowerCase()
  if (raw === "upper") return "Upper"
  if (raw === "lower") return "Lower"
  return raw ? raw.replace(/\b\w/g, c => c.toUpperCase()) : "Strength"
}

function getKnrSessionKeyFromCanonical(session) {
  const schedule = session?.sources?.schedule || null
  const venue = String(schedule?.venue || session?.venue || "").toLowerCase()
  const subtype = getKnrSubtypeLabel(schedule?.subtype || schedule?.workoutType || session?.subtype || "")
  const date = String(session?.start_date || session?.date || schedule?.date || "").slice(0, 10)
  if (venue !== "knr" || !date || !subtype) return null
  return `${date}|${subtype.toLowerCase()}`
}

function parseKnrJsonSessions(text, existingSessions = []) {
  const parsed = JSON.parse(String(text || "null"))
  if (!Array.isArray(parsed)) {
    throw new Error("KNR JSON import expects a top-level array.")
  }

  const existingKeys = new Set(
    (Array.isArray(existingSessions) ? existingSessions : [])
      .map(getKnrSessionKeyFromCanonical)
      .filter(Boolean)
  )
  const seenKeys = new Set()
  const accepted = []
  const rejected = []
  const skipped = []

  parsed.forEach((entry, idx) => {
    const date = String(entry?.date || "").slice(0, 10)
    const exercises = Array.isArray(entry?.exercises) ? entry.exercises : []
    const subtype = getKnrSubtypeLabel(entry?.subtype)
    const key = date && subtype ? `${date}|${subtype.toLowerCase()}` : null

    if (!date || !exercises.length) {
      rejected.push({
        source: "KNR JSON",
        reason: "Missing date or exercises",
        index: idx
      })
      return
    }

    if (existingKeys.has(key) || seenKeys.has(key)) {
      skipped.push({
        source: "KNR JSON",
        reason: `Skipped duplicate session for ${date} ${subtype}`,
        index: idx
      })
      return
    }

    seenKeys.add(key)
    const startDate = `${date}T12:00:00`
    const endDate = `${date}T13:00:00`
    const canonicalType = String(entry?.category || "").toLowerCase() === "strength"
      ? "Traditional Strength Training"
      : String(entry?.subtype || entry?.category || "Other")

    accepted.push(applyCanonicalSessionMergePolicy({
      session_id: `knr_${date}_${subtype}`,
      match_confidence: "single_source",
      relationship: "schedule_only",
      canonical_type: canonicalType,
      category: entry?.category || "Strength",
      subtype,
      venue: "knr",
      start_date: startDate,
      end_date: endDate,
      duration_min: 60,
      overlap_summary: null,
      sources: {
        apple: null,
        technogym: null,
        schedule: {
          id: `knr_${date}_${subtype}`,
          date,
          venue: "knr",
          category: entry?.category || "Strength",
          subtype,
          source: "knr_json",
          exercises: exercises.map((exercise, exerciseIdx) => ({
            exercise_id: `knr_${date}_${subtype}_${exerciseIdx}`,
            exercise_name: exercise?.name || `Exercise ${exerciseIdx + 1}`,
            variant: "machine",
            sets: Array.isArray(exercise?.sets) ? exercise.sets.map(set => ({
              reps: set?.reps ?? null,
              weight: set?.weight ?? null
            })) : [],
            actual: {
              sets: Array.isArray(exercise?.sets) ? exercise.sets.length : 0,
              reps: Array.isArray(exercise?.sets) ? exercise.sets[0]?.reps ?? null : null,
              load: Array.isArray(exercise?.sets) ? exercise.sets[0]?.weight ?? null : null
            }
          }))
        }
      },
      preferred_metrics: {
        hr: { value: null, source: null },
        calories: { value: null, source: null },
        distance: { value: null, source: null, rationale: null, unit: null },
        duration: { value: 60, source: "KNR JSON" },
        power_avg: { value: null, source: null },
        level: { value: null, source: null },
        rpm_avg: { value: null, source: null },
        vo2: { value: null, source: null, note: null }
      }
    }))
  })

  return {
    accepted,
    rejected: [...rejected, ...skipped]
  }
}

const SCH_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const _SCHED_V = 2;
const SCH_META = {
    Mon: { label:"Monday",    theme:"Chest & Triceps + Long Bike",  venue:"YMCA", color:"#d97706" },
      Tue: { label:"Tuesday",   theme:"Legs + Swim",                  venue:"YMCA", color:"#d97706" },
        Wed: { label:"Wednesday", theme:"Rest / Recovery",              venue:"—",    color:"#444"    },
          Thu: { label:"Thursday",  theme:"Back & Arms + Run",            venue:"YMCA", color:"#d97706" },
            Fri: { label:"Friday",    theme:"Legs Volume + Hip + Swim",     venue:"YMCA", color:"#d97706" },
              Sat: { label:"Saturday",  theme:"Long Swim",                    venue:"YMCA", color:"#d97706" },
                Sun: { label:"Sunday",    theme:"Long Run",                     venue:"—",    color:"#444"    },
                };
const schDefaultForDay = day => {
  const data = {};
  (PLAN[day]?.sections || []).forEach(sec =>
    sec.ex.forEach(ex => { data[ex.id] = ex.def.map(s => ({...s})); })
  );
  return data;
};
const schTodayKey = () => {
  const d = new Date().getDay();
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d];
};
const schFmtDate = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" })
    + " · " + d.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });
};
function SchBlock({ color, label, children }) {
  return (
    <div style={{ background:"#111", border:"1px solid #1a1a1a", borderLeft:`3px solid ${color}`, borderRadius:8, padding:"11px 14px", marginBottom:12 }}>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:"0.18em", color:"#444", textTransform:"uppercase", marginBottom:7 }}>{label}</div>
      {children}
    </div>
  );
}

function SchWarmupRow({ text }) {
  const [done, setDone] = React.useState(false);
  return (
    <div onClick={() => setDone(v => !v)} style={{ display:"flex", alignItems:"center", gap:9, padding:"4px 0", cursor:"pointer", fontSize:12, color: done ? "#444" : "#888", textDecoration: done ? "line-through" : "none" }}>
      <div style={{ width:14, height:14, border:"1px solid #333", borderRadius:3, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background: done ? "#1e3a1e" : "transparent" }}>
        {done && <span style={{ fontSize:9, color:"#4a8" }}>✓</span>}
      </div>
      {text}
    </div>
  );
}

function SchExCard({ ex, setData, accent, onUpdate, onAdd, onRemove }) {
  const [collapsed, setCollapsed] = React.useState(true);
  return (
    <div style={{ background:"#111", border:"1px solid #1a1a1a", borderRadius:8, marginBottom:7, overflow:"hidden", "--ac": accent }}>
      <div onClick={() => setCollapsed(v => !v)} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"10px 12px 8px", cursor:"pointer" }}>
        <div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:15, fontWeight:700, color:"#e0e0e0" }}>{ex.name}</div>
          <div style={{ fontSize:11, color:"#3a3a3a", marginTop:1 }}>{ex.sub}</div>
        </div>
        <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
          <div style={{ fontSize:11, color:"#444", textAlign:"right", maxWidth:170, fontStyle:"italic", lineHeight:1.35 }}>{ex.note}</div>
          <div style={{ color:"#333", fontSize:12, marginTop:1 }}>{collapsed ? "▸" : "▾"}</div>
        </div>
      </div>
      {!collapsed && (
        <div style={{ padding:"0 12px 10px", borderTop:"1px solid #161616" }}>
          <div style={{ display:"grid", gridTemplateColumns:"26px 1fr 14px 1fr 22px", gap:4, alignItems:"center", paddingTop:8, paddingBottom:4 }}>
            {["SET","REPS","","LOAD",""].map((h,i) => (
              <div key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:"0.14em", color:"#333", textAlign:"center" }}>{h}</div>
            ))}
          </div>
          {setData.map((s, i) => (
            <div key={i} className="sch-set-row" style={{ display:"grid", gridTemplateColumns:"26px 1fr 14px 1fr 22px", gap:4, alignItems:"center", marginBottom:4 }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#3a3a3a", textAlign:"center" }}>S{i+1}</div>
              <input className="sch-rw" type="text" value={s.r} onChange={e => onUpdate(i, "r", e.target.value)} />
              <div style={{ textAlign:"center", fontSize:10, color:"#333" }}>@</div>
              <input className="sch-rw" type="text" value={s.w} onChange={e => onUpdate(i, "w", e.target.value)} />
              <button className="sch-set-del" onClick={() => onRemove(i)} style={{ background:"none", border:"none", color:"#444", cursor:"pointer", fontSize:13, padding:0, visibility: setData.length > 1 ? "visible" : "hidden" }}>×</button>
            </div>
          ))}
          <button onClick={onAdd} style={{ marginTop:4, width:"100%", background:"none", border:"1px dashed #1e1e1e", borderRadius:4, color:"#333", fontSize:10, padding:"4px 0", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"0.08em" }}>+ add set</button>
        </div>
      )}
    </div>
  );
}

function SchLogView({ log, expanded, setExpanded, onDelete, onExport, onImport, onSync }) {
  const toggle = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const BtnBar = () => (
    <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
      <button onClick={onExport} style={{ background:"#0d1a0d", border:"1px solid #1a3a1a", borderRadius:6, color:"#4a8a4a", fontSize:11, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"0.08em", padding:"7px 14px", cursor:"pointer" }}>Export JSON ↓</button>
      <button onClick={onImport} style={{ background:"#0d0d1a", border:"1px solid #1a1a3a", borderRadius:6, color:"#4a4a8a", fontSize:11, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"0.08em", padding:"7px 14px", cursor:"pointer" }}>Import JSON ↑</button>
      {onSync && (
        <button onClick={onSync} style={{ background:"#1a0d0d", border:"1px solid #3a1a1a", borderRadius:6, color:"#8a4a4a", fontSize:11, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"0.08em", padding:"7px 14px", cursor:"pointer" }}>Sync to Cloud ↑</button>
      )}
    </div>
  );
  if (log.length === 0) return (
    <div><BtnBar />
      <div style={{ textAlign:"center", padding:"60px 20px" }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, fontWeight:700, color:"#222" }}>No sessions logged yet</div>
        <div style={{ fontSize:13, color:"#333", marginTop:10 }}>Complete a session and press Log Session to begin.</div>
      </div>
    </div>
  );
  return (
    <div>
      <BtnBar />
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:"0.2em", color:"#333", textTransform:"uppercase", marginBottom:14 }}>
        Session History — {log.length} {log.length === 1 ? "entry" : "entries"}
      </div>
      {log.map(entry => {
        const m = SCH_META[entry.day] || { color:"#666", venue:"?" };
        const open = expanded[entry.id];
        // PATCHED: render plan exercises, then fall back to any imported slugs
        const allEx = [];
        const planIds = new Set();
        (PLAN[entry.day]?.sections || []).forEach(sec =>
          sec.ex.forEach(ex => {
            if (entry.data[ex.id]) { allEx.push({ ex, sets: entry.data[ex.id] }); planIds.add(ex.id); }
          })
        );
        Object.keys(entry.data).forEach(slug => {
          if (!planIds.has(slug)) {
            const label = slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            allEx.push({ ex: { id:slug, name:label, sub:'imported' }, sets: entry.data[slug] });
          }
        });
        return (
          <div key={entry.id} style={{ background:"#0e0e0e", border:"1px solid #1a1a1a", borderLeft:`3px solid ${m.color}`, borderRadius:8, marginBottom:10, overflow:"hidden" }}>
            <div onClick={() => toggle(entry.id)} style={{ padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:15, fontWeight:700, color:"#d0d0d0" }}>
                  {entry.dayLabel}
                  <span style={{ color:m.color, marginLeft:6 }}>{entry.theme}</span>
                  <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.1em", background: m.venue==="KNR" ? "#0d1f38" : "#1e1200", color: m.venue==="KNR" ? "#3b82f6" : "#d97706", padding:"2px 7px", borderRadius:3, marginLeft:8, verticalAlign:"middle" }}>{entry.venue || m.venue}</span>
                </div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#3a3a3a", marginTop:3 }}>{schFmtDate(entry.date)}</div>
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <button onClick={e => { e.stopPropagation(); onDelete(entry.id); }} style={{ background:"none", border:"1px solid #1e1e1e", borderRadius:4, color:"#3a3a3a", fontSize:10, padding:"4px 10px", cursor:"pointer" }}>Delete</button>
                <span style={{ color:"#333", fontSize:12, marginLeft:4 }}>{open ? "▴" : "▾"}</span>
              </div>
            </div>
            {open && (
              <div style={{ padding:"10px 14px 14px", borderTop:"1px solid #161616" }}>
                {allEx.length === 0 && <div style={{ fontSize:12, color:"#333" }}>No exercise data recorded.</div>}
                {allEx.map(({ ex, sets }) => (
                  <div key={ex.id} style={{ display:"flex", alignItems:"baseline", gap:12, padding:"3px 0", borderBottom:"1px solid #121212" }}>
                    <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, fontWeight:600, color: ex.sub==='imported' ? "#6a9a6a" : "#a0a0a0", minWidth:190 }}>
                      {ex.name}
                      {ex.sub==='imported' && <span style={{ fontSize:9, color:"#3a6a3a", marginLeft:5, fontWeight:400 }}>imported</span>}
                    </span>
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#444" }}>
                      {sets.map((s, i) => (
                        <span key={i}>
                          {i > 0 && <span style={{ color:"#2a2a2a" }}> · </span>}
                          <span style={{ color:"#c0c0c0" }}>{s.r}</span>
                          <span style={{ color:"#333" }}>@</span>
                          <span style={{ color:"#888" }}>{s.w}</span>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    if (process.env.NODE_ENV === "development") {
      console.error("[LIFT ErrorBoundary]", error, info)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "40px 32px", minHeight: "100vh",
          background: "#07080e", color: "#ced2f0",
          fontFamily: "Arial, sans-serif"
        }}>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#ef4444", marginBottom: "12px" }}>
            L.I.F.T. — Render Error
          </div>
          <div style={{ fontSize: "13px", color: "#aaa", marginBottom: "20px", lineHeight: 1.6 }}>
            The app encountered an unexpected error. Your data has not been affected.
          </div>
          <pre style={{
            fontSize: "11px", color: "#667", background: "#0d0e1c",
            border: "1px solid #1a1b2e", borderRadius: "8px",
            padding: "14px", whiteSpace: "pre-wrap", marginBottom: "20px",
            maxWidth: "700px"
          }}>
            {this.state.error?.message || "Unknown error"}
            {this.state.info?.componentStack
              ? "\n\nComponent stack:" + this.state.info.componentStack
              : ""}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null, info: null })}
            style={{
              padding: "10px 20px", background: "#4a9ee8", border: "none",
              borderRadius: "8px", color: "#fff", cursor: "pointer",
              fontSize: "13px", fontWeight: "600"
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── DEXA Regional Lean Mass (hardcoded from scan PDFs) ─────────────────────
// All values in grams, directly from Hologic Horizon W reports.
// Update after each scan; regional data is not in dexa_summary.json.
const DEXA_REGIONAL = [
  {
    label: "Aug '25", date: "2025-08-26",
    trunk: 24858, rLeg: 7822, lLeg: 7898, rArm: 3056, lArm: 2782,
    fatPct: 33.9, fatMass: 26728, leanMass: 49785, leanBmc: 52175, totalMass: 78903,
    vatArea: 155, bmd: 1.121,
  },
  {
    label: "Nov '25", date: "2025-11-19",
    trunk: 24537, rLeg: 7637, lLeg: 7967, rArm: 3241, lArm: 2758,
    fatPct: 31.4, fatMass: 23669, leanMass: 49470, leanBmc: 51805, totalMass: 75474,
    vatArea: 120, bmd: 1.110,
  },
  {
    label: "Jan '26", date: "2026-01-14",
    trunk: 24296, rLeg: 7677, lLeg: 7726, rArm: 3053, lArm: 2889,
    fatPct: 29.8, fatMass: 21764, leanMass: 48939, leanBmc: 51308, totalMass: 73072,
    vatArea: 135, bmd: 1.120,
  },
  {
    label: "Apr '26", date: "2026-04-27",
    trunk: 26477, rLeg: 8524, lLeg: 7888, rArm: 3256, lArm: 3031,
    fatPct: 25.4, fatMass: 18722, leanMass: 52484, leanBmc: 54875, totalMass: 73597,
    vatArea: 122, bmd: 1.161,
  },
]
// Baseline (Aug 2025) values for % change calculations
const DEXA_BASE = DEXA_REGIONAL[0]
const dexaRegionalPct = DEXA_REGIONAL.map(s => ({
  label: s.label,
  date:  s.date,
  fatMassPct:  Number((((s.fatMass  - DEXA_BASE.fatMass)  / DEXA_BASE.fatMass)  * 100).toFixed(1)),
  leanMassPct: Number((((s.leanMass - DEXA_BASE.leanMass) / DEXA_BASE.leanMass) * 100).toFixed(1)),
  totalMassPct:Number((((s.totalMass- DEXA_BASE.totalMass)/ DEXA_BASE.totalMass)* 100).toFixed(1)),
  fatPctChg:   Number((s.fatPct - DEXA_BASE.fatPct).toFixed(1)),
  trunkPct:    Number((((s.trunk - DEXA_BASE.trunk) / DEXA_BASE.trunk) * 100).toFixed(1)),
  rLegPct:     Number((((s.rLeg  - DEXA_BASE.rLeg)  / DEXA_BASE.rLeg)  * 100).toFixed(1)),
  lLegPct:     Number((((s.lLeg  - DEXA_BASE.lLeg)  / DEXA_BASE.lLeg)  * 100).toFixed(1)),
  rArmPct:     Number((((s.rArm  - DEXA_BASE.rArm)  / DEXA_BASE.rArm)  * 100).toFixed(1)),
  lArmPct:     Number((((s.lArm  - DEXA_BASE.lArm)  / DEXA_BASE.lArm)  * 100).toFixed(1)),
}))
// ───────────────────────────────────────────────────────────────────────────

// ── LIFT Trainer Panel ─────────────────────────────────────────────────────
const TRAINER_STORAGE_KEY = "lift-trainer-chat"
const TRAINER_SYSTEM_PROMPT = `You are LIFT Trainer, an AI training assistant with full access to Andrés Vidal-Gadea's longitudinal fitness data. Respond with the directness and precision of a sports scientist, not a generic coach. No decorative praise. No hedging. Separate observed data from inference. Quantify uncertainty where relevant.

ABOUT ANDRÉS
Age 50, scientist at an R2 institution in Normal IL. On tirzepatide (GLP-1/GIP, currently 10 mg) since November 2024 for weight loss. Governing training principle: leave every session better than you entered it.

CURRENT BODY COMPOSITION (April 27 2026 DEXA — authoritative ground truth)
Total mass: 162.3 lb (clothed, post-meal). Implied fasted weight: ~158–160 lb.
Body fat: 25.4% | Fat mass: 41.3 lb | Lean mass: 115.8 lb | Lean+BMC: 121.0 lb
Phase 1 cut target: 21% BF (~9.1 lb fat loss remaining at ~1.7 lb/month). Projected completion: mid-September 2026.
Next DEXA: September 2026 (St. Jude 10K context).

PERSONALIZED BANISTER MODEL (fitted, R²=0.887)
tau1 (fitness decay): 27 days — builds and erodes faster than HealthFit default of 42 days.
tau2 (fatigue decay): 18 days — fatigue persists ~2.5x longer than HealthFit default of 7 days.
Dangerous zone: TSB below -7 AND 14-day rolling load above 700 units simultaneously. TSB slope alone is not a risk signal.
TSB thresholds: moderate risk below -7, high risk below -9.
Taper requirement: 3 weeks before any goal half marathon (not 2 weeks).

ACTIVE INJURY PROTOCOL — LEFT MTP JOINT (Morton's Toe)
Current run ceiling: 4.0 miles. Advance by 10% only after 3 consecutive score-0 sessions.
MTP scoring: 0=fine (continue), 1=note and continue, 2=modify session, 3=terminate session immediately.
Pre-run ibuprofen is part of an explicitly recommended twice-daily anti-inflammatory protocol — not a red flag.
The rowing machine causes passive MTP dorsiflexion at the catch regardless of technique and is incompatible with the current protocol until 3 consecutive score-0 sessions are achieved.
Left leg lean mass was flat Aug–Apr while right leg gained 9.0%, confirming chronic unilateral unloading. DEXA in September will test whether left leg closes the gap after MTP resolves.

WEEKLY TRAINING STRUCTURE
Monday: Chest and Arms (YMCA, strength + cardio)
Tuesday: Legs (KNR — kinesiologist-led, not high intensity, cardio can be added)
Wednesday: Rest or easy recovery only (no strength, no structured cardio)
Thursday: Back and Arms (KNR)
Friday: Legs and some chest (KNR)
Saturday: Hip Legs + long run (YMCA, strength + cardio)
Sunday: Long run only, no strength

KNR STRENGTH BASELINES (February 2026 e1RM)
Chest press: 130 lb | Seated cable row: 80 lb | Bicep curl: 30 lb
Leg press: 320 lb | Leg curl: 100 lb | Leg extension: 100 lb

NUTRITION
Protein target: 120–140 g/day in 3–4 doses of 30–40 g. Current intake: ~100 g/day (gap to close).
Calorie targets: BMR 1520, TDEE 2100, fat loss target 1700.

MODALITY ROTATION RULE
Run advances for 3 weeks, then 1 week hold run to advance swim or bike. Prevents additive load creep.

CORE DESIGN RULE
Always suggest a modified alternative rather than rest. Discontinuation is the primary risk to long-term outcomes.

RESPONSE STYLE — MANDATORY
Default response: 2 to 3 sentences maximum. One clear recommendation. No headers. No bullet points. Conversational, like a text from a coach.
After every response, add a blank line then a compact follow-up menu showing only the options relevant to the question. Format exactly like this example:

── A) analysis  R) rationale  E) execution  L) load context ──

Only include options that actually apply. Minimum 2, maximum 4. Always use single letters. When the user types a letter alone, respond to that topic only, same style rules apply, then show the menu again.

PRE-SESSION BRIEFING — triggered by "brief me", "go", "what's today", "today's session", or any equivalent short prompt:
Respond with exactly one paragraph (4 to 6 sentences) covering: (1) what today's schedule prescribes by modality, (2) current TSB and what it means for effort, (3) any active OC flags and their constraint on today, (4) MTP protocol status and current distance ceiling if a run is planned, (5) one concrete recommendation for how to approach the session. No headers. No bullets. Write it as a coach would say it before you walk out the door. End with the menu showing only relevant options for today's session type.

Current session data, active injuries, training load metrics, and upcoming races are provided below in the user context for each message. Use them. Do not make up values that are not provided.

WRITE CAPABILITIES — you have four direct write actions available:
1. MTP score log: when the user reports a toe/MTP score (0–3), say "Logging MTP score X — confirm with Y." Do not say you cannot log data.
2. Body weight log: when the user reports a scale weight (e.g. "158.2 this morning"), say "Logging X lb — confirm with Y." Do not say you cannot log data.
3. Exercise log: when the user says "add X to today" or asks to log an exercise, say "Adding X to today's schedule — confirm with Y." Do not say you cannot log data.
4. Run log: when the user reports completing a run (distance, duration, MTP score, notes), acknowledge all the details and say "Logging your run — confirm with Y." If an MTP score is included, it will also be logged as a check-in. Do not say you cannot log data.

SUBSTITUTION PROTOCOL — when the user reports MTP score 2+ or describes a physical limitation during a session:
- Immediately propose a specific substitute exercise or modality that avoids the affected region.
- Apply these rules: rowing machine is incompatible with active MTP protocol; score 2 = modify but continue; score 3 = terminate session.
- Offer to add the substitute to today's schedule. Say "I can add [substitute] to today — confirm with Y."
- Keep the response under 4 sentences before the menu.

For all other data writes, tell the user you cannot do that yet.`

function assembleTrainerContext({ sessions60, ocItems, tsbData, raceCalendar, liftConfig, mealRecords }) {
  const today = new Date().toISOString().slice(0, 10)
  const tsbLine = tsbData
    ? `TSB: ${tsbData.currentOverallTsb != null ? Number(tsbData.currentOverallTsb).toFixed(1) : "?"}, 14-day load: ${tsbData.currentLoad14 != null ? Number(tsbData.currentLoad14).toFixed(0) : "?"}`
    : "TSB: unavailable"
  const ocLines = (ocItems || []).filter(i => i.currentScore > 0)
    .map(i => `  ${i.location || i.label || "Unknown"}: score ${i.currentScore}/5, ${i.episodeCount || 0} episode(s)`)
    .join("\n") || "  None active"
  const sessionLines = (sessions60 || []).slice(0, 80).map(s => {
    const d = s.start_date?.slice(0, 10) || s.date || "?"
    const type = s.canonical_type || s.type || "?"
    const dur = s.duration_min != null ? `${Math.round(s.duration_min)} min` : "? min"
    const dist = s.distance_mi != null ? ` ${Number(s.distance_mi).toFixed(2)} mi` : ""
    const load = s.load != null ? ` load:${Number(s.load).toFixed(0)}` : ""
    return `  ${d} | ${type} |${dur}${dist}${load}`
  }).join("\n") || "  No sessions loaded"
  const upcomingRaces = (raceCalendar || [])
    .filter(r => r.date >= today)
    .slice(0, 6)
    .map(r => `  ${r.date}: ${r.name} (${r.dist_mi} mi, ${r.city}) — ${r.note}`)
    .join("\n") || "  None"
  // Build today's nutrition summary from meal records
  const todayMeals = (mealRecords || []).filter(m => (m.date || "").slice(0, 10) === today)
  const totalCal  = todayMeals.reduce((s, m) => s + (m.total_calories  || 0), 0)
  const totalProt = todayMeals.reduce((s, m) => s + (m.total_protein_g || 0), 0)
  const totalCarb = todayMeals.reduce((s, m) => s + (m.total_carbs_g   || 0), 0)
  const totalFat  = todayMeals.reduce((s, m) => s + (m.total_fat_g     || 0), 0)
  const mealLines = todayMeals.length
    ? todayMeals.map(m => `  ${m.meal}: ${m.total_calories} cal, ${m.total_protein_g}g prot — ${(m.items||[]).join(", ")}`).join("\n")
    : "  Nothing logged yet today"
  const nutritionSummary = todayMeals.length
    ? `Total: ${totalCal} cal | ${totalProt}g protein | ${totalCarb}g carbs | ${totalFat}g fat`
    : "No meals logged yet today"

  return `=== CURRENT STATE (${today}) ===
${tsbLine}
Risk zone: TSB < -7 AND 14d load > 700

=== ACTIVE OC ISSUES ===
${ocLines}

=== RECENT SESSIONS (last 60 days, newest first) ===
${sessionLines}

=== UPCOMING RACES ===
${upcomingRaces}

=== TODAY'S NUTRITION ===
${mealLines}
${nutritionSummary}
Targets: ${liftConfig?.fat_loss_target ?? 1700} cal/day | ${liftConfig?.protein_target_g ?? 140}g protein/day

=== LIFT CONFIG ===
tau1: ${liftConfig?.tau1 ?? 27}d  tau2: ${liftConfig?.tau2 ?? 18}d
BF%: ${liftConfig?.pct_fat ?? 25.4}% (DEXA ${liftConfig?.dexa_anchor_date ?? "2026-04-27"})
Phase 1 target: 21% BF
Protein target: ${liftConfig?.protein_target_g ?? 140} g/day`
}

const FingerprintIcon = ({ size = 38 }) => {
  const cx = size / 2, cy = size / 2
  const rings = [
    { r: 2.2, dash: "none", opacity: 0.97, color: "#38bdf8" },
    { r: 5.5, dash: `${5.5 * 1.4} ${5.5 * 0.35}`, opacity: 0.88, color: "#38bdf8" },
    { r: 8.5, dash: `${8.5 * 1.35} ${8.5 * 0.32}`, opacity: 0.78, color: "#38bdf8" },
    { r: 11.5, dash: `${11.5 * 1.3} ${11.5 * 0.3}`, opacity: 0.65, color: "#22d3ee" },
    { r: 14.5, dash: `${14.5 * 1.25} ${14.5 * 0.28}`, opacity: 0.50, color: "#22d3ee" },
    { r: 17.0, dash: `${17 * 1.2} ${17 * 0.26}`, opacity: 0.35, color: "#0ea5e9" },
  ]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: "block" }}>
      {rings.map(({ r, dash, opacity, color }, i) =>
        r < 3 ? (
          <circle key={i} cx={cx} cy={cy} r={r} fill={color} opacity={opacity} />
        ) : (
          <circle key={i} cx={cx} cy={cy} r={r}
            stroke={color} strokeWidth={1.25} fill="none"
            opacity={opacity}
            strokeDasharray={dash === "none" ? undefined : dash}
            strokeLinecap="round"
          />
        )
      )}
    </svg>
  )
}

function TrainerPanel({ sessions60, ocItems, tsbData, raceCalendar, liftConfig, onLogMtp, onLogWeight, onLogExercise, onLogRun, onLogMeal, biometricRecords, sleepRecords, mealRecords }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [messages, setMessages] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(TRAINER_STORAGE_KEY) || "[]") } catch { return [] }
  })
  const [inputValue, setInputValue] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const messagesEndRef = React.useRef(null)
  const inputRef = React.useRef(null)
  const [pendingAction, setPendingAction] = React.useState(null)
  // pendingAction shape: { type: "mtp"|"weight"|"exercise"|"run"|"meal", payload: object, preview: string } | null
  const apiKey = typeof ANTHROPIC_API_KEY !== "undefined"
    ? ANTHROPIC_API_KEY
    : (import.meta.env?.VITE_ANTHROPIC_API_KEY || import.meta.env?.ANTHROPIC_API_KEY || null)

  React.useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isOpen])

  React.useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus()
  }, [isOpen])

  // ── Startup greeting: fires once per calendar day when panel opens ─────────
  React.useEffect(() => {
    if (!isOpen) return
    const today = new Date().toISOString().slice(0, 10)
    const greetedKey = `lift-trainer-greeted-${today}`
    if (localStorage.getItem(greetedKey)) return
    localStorage.setItem(greetedKey, "1")

    const missing = []
    // Weight: check biometricRecords for today
    const hasWeightToday = (biometricRecords || []).some(r => (r.date || "").slice(0, 10) === today)
    if (!hasWeightToday) missing.push("weight")
    // Sleep: check sleepRecords for last night
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const hasSleepLastNight = (sleepRecords || []).some(r => {
      const d = r.date || (r.start_at || "").slice(0, 10) || ""
      return d === yesterday || d === today
    })
    if (!hasSleepLastNight) missing.push("sleep")
    // Dinner: check mealRecords for yesterday or today
    const hasDinnerRecent = (mealRecords || []).some(r =>
      r.meal === "dinner" && (r.date === today || r.date === yesterday)
    )
    if (!hasDinnerRecent) missing.push("dinner")

    if (!missing.length) return

    // Build a natural single-message greeting covering all gaps
    const parts = []
    if (missing.includes("weight"))  parts.push("your weight this morning")
    if (missing.includes("sleep"))   parts.push("how many hours you slept")
    if (missing.includes("dinner"))  parts.push("what you had for dinner — I can look up the nutrition")
    const greeting = `Good to see you. A few things not yet logged: ${parts.join(", and ")}. Start with whichever is easiest.`
    const greetMsg = { role: "assistant", content: greeting, ts: Date.now() }
    setMessages(prev => {
      const updated = [...prev, greetMsg]
      try { localStorage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(updated.slice(-60))) } catch {}
      return updated
    })
  }, [isOpen])

  // ── Nutrition lookup via API ───────────────────────────────────────────────
  const fetchMealNutrition = React.useCallback(async (description) => {
    if (!apiKey) return []
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          system: "Return ONLY a JSON array, no markdown, no explanation. Each element must have: name (string), quantity (string), calories (number), protein_g (number), carbs_g (number), fat_g (number), fiber_g (number). Be realistic with portion sizes.",
          messages: [{ role: "user", content: `Estimate nutrition breakdown for this meal: ${description}` }]
        })
      })
      const data = await res.json()
      const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim()
      return JSON.parse(raw)
    } catch { return [] }
  }, [apiKey])

  const saveMessages = (msgs) => {
    setMessages(msgs)
    try { localStorage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(msgs.slice(-60))) } catch {}
  }

  const detectWriteIntent = (userText, assistantText) => {
    const combined = (userText + " " + assistantText).toLowerCase()
    // Combined run log detection — "ran X miles, Y minutes, MTP score Z, [notes]"
    // Handles variations: "ran", "just ran", "finished a run", "completed", "did"
    const runMatch = userText.match(
      /\b(?:ran|run|just\s+ran|finished\s+(?:a\s+)?run|completed\s+(?:a\s+)?run|did\s+(?:a\s+)?run)\b/i
    )
    if (runMatch) {
      const distMatch = userText.match(/(\d+(?:\.\d+)?)\s*(?:mile|miles|mi)\b/i)
      const durMatch  = userText.match(/(\d+)\s*(?:min(?:utes?)?|mins?)\b/i)
      const scoreMatch = userText.match(/\b(?:mtp|toe|joint)\s*(?:score)?[:\s]*([0-3])\b/i)
        || userText.match(/\bscore[:\s]*([0-3])\b/i)
      const notesMatch = userText.match(/,?\s*(felt\s+.+|easy|hard|tough|good|great|solid|slow|fast|painful|ok|okay)[\.,]?/i)

      const dist = distMatch ? parseFloat(distMatch[1]) : null
      const dur  = durMatch  ? parseInt(durMatch[1])    : null
      const score = scoreMatch ? parseInt(scoreMatch[1]) : null
      const notes = notesMatch ? notesMatch[1].trim() : ""

      // Need at least distance or duration to constitute a run log
      if (dist != null || dur != null) {
        const scoreLabels = ["zero pain", "mild discomfort", "moderate pain", "severe pain"]
        const parts = []
        if (dist != null) parts.push(`${dist} mi`)
        if (dur  != null) parts.push(`${dur} min`)
        if (score != null) parts.push(`MTP score ${score}/3 (${scoreLabels[score]})`)
        if (notes) parts.push(`notes: "${notes}"`)

        return {
          type: "run",
          payload: { dist, dur, score, notes },
          preview: `Log run: ${parts.join(", ")}. Type Y to confirm or anything else to cancel.`
        }
      }
    }
    // MTP score detection — user says something like "mtp score 1" or "toe score 2 today"
    const mtpForwardMatch = userText.match(/\b(mtp|toe|joint)\b.*\bscore[:\s]*([0-3])\b/i)
    const mtpReverseMatch = userText.match(/\bscore[:\s]*([0-3])\b.*\b(mtp|toe|joint)\b/i)
    const mtpScoreText = mtpForwardMatch?.[2] || mtpReverseMatch?.[1]
    if (mtpScoreText) {
      const score = parseInt(mtpScoreText)
      if (Number.isFinite(score) && score >= 0 && score <= 3) {
        const labels = ["zero pain", "mild discomfort", "moderate pain", "severe pain"]
        return {
          type: "mtp",
          payload: { score },
          preview: `Log MTP check-in: score ${score}/3 (${labels[score]}) for today. Type Y to confirm or anything else to cancel.`
        }
      }
    }
    // Weight detection — user says something like "158.2 this morning" or "weight 159"
    const weightMatch = userText.match(/\b(\d{2,3}(?:\.\d{1,2})?)\s*(?:lb|lbs|pounds?)?\b/i)
    if (weightMatch && (combined.includes("weight") || combined.includes("weigh") || combined.includes("scale") || combined.includes("morning") || combined.includes("fasted"))) {
      const weight = parseFloat(weightMatch[1])
      if (weight >= 100 && weight <= 400) {
        return {
          type: "weight",
          payload: { weight_lb: weight },
          preview: `Log body weight: ${weight} lb for today. Type Y to confirm or anything else to cancel.`
        }
      }
    }
    // Exercise add detection — "add X to today" or "log X as an exercise"
    const exerciseMatch = userText.match(/\b(?:add|log|include|put)\s+(.+?)\s+(?:to\s+(?:today|my\s+schedule)|as\s+an?\s+exercise)/i)
    if (exerciseMatch) {
      const exerciseName = exerciseMatch[1].trim()
      if (exerciseName.length >= 3 && exerciseName.length <= 60) {
        const day = DAY_KEYS_BY_JS_DAY[new Date().getDay()]
        return {
          type: "exercise",
          payload: { name: exerciseName, day },
          preview: `Add "${exerciseName}" to today's (${day}) custom exercises. Type Y to confirm or anything else to cancel.`
        }
      }
    }

    // Meal detection — preset phrases and dinner/custom descriptions
    const mealKeywords = combined.includes("breakfast") || combined.includes("lunch") ||
      combined.includes("dinner") || combined.includes("supper") ||
      combined.includes("snack") || combined.includes("ate") || combined.includes("had for")
    if (mealKeywords) {
      const presets = liftConfig?.MEAL_PRESETS || {}
      // Preset detection — "usual breakfast", "my usual lunch", etc.
      for (const [key, preset] of Object.entries(presets)) {
        const isUsual = combined.includes(`usual ${key}`) || combined.includes(`my ${key}`) ||
          (combined.includes(key) && (combined.includes("usual") || combined.includes("same") || combined.includes("regular")))
        if (isUsual) {
          const today = new Date().toISOString().slice(0, 10)
          return {
            type: "meal",
            payload: {
              meal_id: `meal_${Date.now()}`,
              id: `meal_${Date.now()}`,
              date: today,
              timestamp: new Date().toISOString(),
              meal: preset.meal,
              items: preset.items.map(name => ({ name, quantity: "1 serving", calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, source: "preset" })),
              total_calories:  preset.total_calories,
              total_protein_g: preset.total_protein_g,
              total_carbs_g:   preset.total_carbs_g,
              total_fat_g:     preset.total_fat_g,
              total_fiber_g:   preset.total_fiber_g,
              source: "trainer",
              _preset: key
            },
            preview: `Log ${preset.label}: ${preset.total_calories} cal, ${preset.total_protein_g}g protein. Type Y to confirm or anything else to cancel.`
          }
        }
      }
      // Custom meal — extract the meal type and description for nutrition lookup
      const mealTypeMatch = userText.match(/\b(breakfast|lunch|dinner|supper|snack)\b/i)
      const mealType = mealTypeMatch ? mealTypeMatch[1].toLowerCase().replace("supper", "dinner") : "meal"
      // Only proceed if there is actual food described (more than just the meal word)
      const stripped = userText.replace(/\b(breakfast|lunch|dinner|supper|snack|had|ate|for|my|usual|i|a)\b/gi, "").trim()
      if (stripped.length >= 5) {
        return {
          type: "meal_lookup",
          payload: { description: userText, mealType },
          preview: `Looking up nutrition for your ${mealType}...`
        }
      }
    }

    return null
  }

  const sendMessage = async () => {
    const text = inputValue.trim()
    if (!text || isLoading) return

    // Undo last trainer write without API call
    if (/^(undo|delete|remove)\s*(last)?\s*(entry|log|weight|mtp)?$/i.test(text)) {
      const lastWrite = [...messages].reverse().find(m => m.role === "assistant" && (m.content.includes("logged.") || m.content.includes("Logged")))
      if (lastWrite && lastWrite.content.includes("weight")) {
        const existing = JSON.parse(localStorage.getItem("lift_biometric_records") || "[]")
        const cleaned = existing.filter(r => r.source !== "trainer")
        localStorage.setItem("lift_biometric_records", JSON.stringify(cleaned))
        const msg = { role: "assistant", content: "Last trainer weight entry removed from local records.", ts: Date.now() }
        saveMessages([...messages, { role: "user", content: text, ts: Date.now() }, msg])
        setInputValue("")
        return
      }
      if (lastWrite && lastWrite.content.includes("MTP")) {
        const msg = { role: "assistant", content: "To remove an MTP entry, go to the OC tab and delete it there. Trainer cannot remove OC items automatically.", ts: Date.date() }
        saveMessages([...messages, { role: "user", content: text, ts: Date.now() }, msg])
        setInputValue("")
        return
      }
      const msg = { role: "assistant", content: "No recent trainer entry found to undo.", ts: Date.now() }
      saveMessages([...messages, { role: "user", content: text, ts: Date.now() }, msg])
      setInputValue("")
      return
    }
    if (!apiKey) {
      saveMessages([...messages, { role: "user", content: text, ts: Date.now() },
        { role: "assistant", content: "VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file and restart the dev server.", ts: Date.now() }])
      setInputValue("")
      return
    }
    const context = assembleTrainerContext({ sessions60, ocItems, tsbData, raceCalendar, liftConfig, mealRecords })
    const userMsg = { role: "user", content: text, ts: Date.now() }
    const updatedMsgs = [...messages, userMsg]
    saveMessages(updatedMsgs)
    setInputValue("")
    setIsLoading(true)
    const apiMessages = updatedMsgs.map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.role === "user" && m === userMsg
        ? `${context}\n\n---\n\nUSER QUESTION: ${text}`
        : m.content
    }))
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: TRAINER_SYSTEM_PROMPT,
          messages: apiMessages,
          stream: true
        })
      })
      if (!res.ok) {
        const err = await res.text()
        saveMessages([...updatedMsgs, { role: "assistant", content: `API error ${res.status}: ${err.slice(0, 200)}`, ts: Date.now() }])
        setIsLoading(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ""
      const streamingMsg = { role: "assistant", content: "", ts: Date.now() }
      const withStreaming = [...updatedMsgs, streamingMsg]
      setMessages(withStreaming)
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "))
        for (const line of lines) {
          const data = line.slice(6)
          if (data === "[DONE]") continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed?.delta?.text || ""
            assistantText += delta
            const updated = withStreaming.map(m => m === streamingMsg ? { ...m, content: assistantText } : m)
            setMessages(updated)
          } catch {}
        }
      }
      const finalMsgs = updatedMsgs.concat({ role: "assistant", content: assistantText, ts: Date.now() })
      saveMessages(finalMsgs)
      // Detect write intent from user message + assistant response
      const intent = detectWriteIntent(text, assistantText)
      if (intent) setPendingAction(intent)
    } catch (err) {
      saveMessages([...updatedMsgs, { role: "assistant", content: `Network error: ${err.message}`, ts: Date.now() }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmAction = async (userInput) => {
    if (!pendingAction) return
    const confirmed = userInput.trim().toUpperCase() === "Y"
    if (confirmed) {
      if (pendingAction.type === "mtp" && onLogMtp) {
        await onLogMtp(pendingAction.payload.score)
        const confirmMsg = { role: "assistant", content: `MTP score ${pendingAction.payload.score} logged.`, ts: Date.now() }
        saveMessages([...messages, confirmMsg])
      } else if (pendingAction.type === "weight" && onLogWeight) {
        await onLogWeight(pendingAction.payload.weight_lb)
        const confirmMsg = { role: "assistant", content: `Body weight ${pendingAction.payload.weight_lb} lb logged.`, ts: Date.now() }
        saveMessages([...messages, confirmMsg])
      } else if (pendingAction.type === "run" && onLogRun) {
        await onLogRun(pendingAction.payload)
        const { dist, dur, score } = pendingAction.payload
        const parts = []
        if (dist != null) parts.push(`${dist} mi`)
        if (dur  != null) parts.push(`${dur} min`)
        const mtpLine = score != null ? ` MTP score ${score} logged.` : ""
        const confirmMsg = {
          role: "assistant",
          content: `Run logged: ${parts.join(", ")}.${mtpLine}\n\n── L) load impact  A) MTP progression update ──`,
          ts: Date.now()
        }
        saveMessages([...messages, confirmMsg])
      } else if (pendingAction.type === "exercise" && onLogExercise) {
        await onLogExercise(pendingAction.payload.name, pendingAction.payload.day)
        const confirmMsg = { role: "assistant", content: `"${pendingAction.payload.name}" added to today's (${pendingAction.payload.day}) schedule.

── A) add sets/reps detail  R) suggest a similar exercise ──`, ts: Date.now() }
        saveMessages([...messages, confirmMsg])
      } else if (pendingAction.type === "meal" && onLogMeal) {
        await onLogMeal(pendingAction.payload)
        const p = pendingAction.payload
        const confirmMsg = { role: "assistant", content: `${p.meal.charAt(0).toUpperCase() + p.meal.slice(1)} logged: ${p.total_calories} cal, ${p.total_protein_g}g protein, ${p.total_carbs_g}g carbs, ${p.total_fat_g}g fat.`, ts: Date.now() }
        saveMessages([...messages, confirmMsg])
      } else if (pendingAction.type === "meal_lookup") {
        // Nutrition lookup — fetch then confirm
        setIsLoading(true)
        const items = await fetchMealNutrition(pendingAction.payload.description)
        setIsLoading(false)
        if (!items.length) {
          saveMessages([...messages, { role: "assistant", content: "Could not look up nutrition for that description. Try being more specific.", ts: Date.now() }])
          setPendingAction(null)
          return
        }
        const today = new Date().toISOString().slice(0, 10)
        const total_calories  = items.reduce((s, i) => s + (i.calories  || 0), 0)
        const total_protein_g = items.reduce((s, i) => s + (i.protein_g || 0), 0)
        const total_carbs_g   = items.reduce((s, i) => s + (i.carbs_g   || 0), 0)
        const total_fat_g     = items.reduce((s, i) => s + (i.fat_g     || 0), 0)
        const total_fiber_g   = items.reduce((s, i) => s + (i.fiber_g   || 0), 0)
        const mealRecord = {
          meal_id: `meal_${Date.now()}`, id: `meal_${Date.now()}`,
          date: today, timestamp: new Date().toISOString(),
          meal: pendingAction.payload.mealType,
          items, total_calories, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g,
          source: "trainer"
        }
        const itemLines = items.map(i => `  ${i.name} (${i.quantity}): ${i.calories} cal, ${i.protein_g}g prot`).join("\n")
        const lookupAction = {
          type: "meal",
          payload: mealRecord,
          preview: `Log ${pendingAction.payload.mealType}:\n${itemLines}\nTotal: ${total_calories} cal, ${total_protein_g}g protein. Type Y to confirm or anything else to cancel.`
        }
        setPendingAction(lookupAction)
        return
      }
    } else {
      const cancelMsg = { role: "assistant", content: "Cancelled. Nothing was written.", ts: Date.now() }
      saveMessages([...messages, cancelMsg])
    }
    setPendingAction(null)
  }

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (pendingAction) {
        handleConfirmAction(inputValue)
        setInputValue("")
      } else {
        sendMessage()
      }
    }
  }

  const clearChat = () => {
    saveMessages([])
  }

  const iconBtn = {
    position: "fixed", top: 20, right: 16, zIndex: 9999,
    width: 44, height: 44, borderRadius: "50%",
    background: "rgba(5, 10, 30, 0.35)",
    border: "1px solid rgba(56, 189, 248, 0.35)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    opacity: 0.65,
    transition: "opacity 0.2s, box-shadow 0.2s",
    boxShadow: "0 0 10px rgba(56,189,248,0.12)"
  }

  const panelStyle = {
    position: "fixed", top: 66, right: 8, left: 8, zIndex: 9998,
    width: "calc(100vw - 16px)",
    maxWidth: 400,
    margin: "0",
    maxHeight: "calc(100dvh - 80px)",
    height: "min(520px, calc(100dvh - 80px))",
    display: "flex", flexDirection: "column",
    background: "rgba(5, 8, 22, 0.88)",
    border: "1px solid rgba(56, 189, 248, 0.22)",
    borderRadius: 16,
    backdropFilter: "blur(22px)",
    WebkitBackdropFilter: "blur(22px)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(56,189,248,0.1)",
    overflow: "hidden",
    boxSizing: "border-box"
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(o => !o)}
        style={iconBtn}
        title="LIFT Trainer"
        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.boxShadow = "0 0 16px rgba(56,189,248,0.35)" }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "0.65"; e.currentTarget.style.boxShadow = "0 0 10px rgba(56,189,248,0.12)" }}
      >
        <FingerprintIcon size={28} />
      </button>

      {isOpen && (
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px", borderBottom: "1px solid rgba(56,189,248,0.12)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FingerprintIcon size={18} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", letterSpacing: "0.08em", textTransform: "uppercase" }}>LIFT Trainer</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={clearChat} title="Clear conversation" style={{ background: "none", border: "none", color: "#334", fontSize: 11, cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>clear</button>
              <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", color: "#445", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 16px", color: "#334", fontSize: 12, lineHeight: 1.6 }}>
                Ask me anything about your training, recovery, load, nutrition, or race build.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "82%", padding: "8px 11px",
                  borderRadius: m.role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                  background: m.role === "user" ? "#185FA5" : "#111827",
                  color: m.role === "user" ? "#e8f4ff" : "#c8d8e8",
                  fontSize: 12.5, lineHeight: 1.55,
                  border: m.role === "user" ? "none" : "1px solid rgba(56,189,248,0.1)",
                  whiteSpace: "pre-wrap", wordBreak: "break-word"
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "8px 14px", borderRadius: "14px 14px 14px 3px", background: "#111827", border: "1px solid rgba(56,189,248,0.1)", display: "flex", gap: 5, alignItems: "center" }}>
                  {[0, 1, 2].map(d => (
                    <div key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: "#38bdf8", opacity: 0.7, animation: `trainerDot 1.2s ease-in-out ${d * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {pendingAction && (
            <div style={{
              margin: "0 10px 6px",
              padding: "8px 12px",
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.35)",
              borderRadius: 8,
              fontSize: 12,
              color: "#fcd34d",
              lineHeight: 1.5
            }}>
              {pendingAction.preview}
            </div>
          )}

          <div style={{ padding: "8px 10px 10px", borderTop: "1px solid rgba(56,189,248,0.1)", flexShrink: 0, display: "flex", gap: 7, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask your trainer..."
              rows={1}
              style={{
                flex: 1, resize: "none", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(56,189,248,0.2)",
                borderRadius: 10, color: "#d0e4f4", fontSize: 16, padding: "7px 10px", fontFamily: "inherit",
                outline: "none", maxHeight: 90, overflowY: "auto", lineHeight: 1.45
              }}
            />
            <button
              onClick={() => { if (pendingAction) { handleConfirmAction(inputValue); setInputValue("") } else { sendMessage() } }}
              disabled={isLoading || !inputValue.trim()}
              style={{
                width: 34, height: 34, borderRadius: "50%", border: "none", cursor: isLoading || !inputValue.trim() ? "default" : "pointer",
                background: isLoading || !inputValue.trim() ? "rgba(56,189,248,0.15)" : "#185FA5",
                color: "#fff", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}
            >↑</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes trainerDot {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </>
  )
}
// ── end TrainerPanel ────────────────────────────────────────────────────────

export default function App() {

  // ── LIFT Calibration Config ─────────────────────────────────────────────
  // Update these after each DEXA scan. All derived constants read from here.
  // Last updated: April 2026 DEXA anchor. Next update: September 2026 scan.
  const LIFT_CONFIG = {
    // Banister model constants — fitted via grid search on 466 days, R²=0.887
    tau1: 27,          // fitness decay (days) — HealthFit default is 42
    tau2: 18,          // fatigue decay (days) — HealthFit default is 7
    tsbModerateRiskThreshold: -7,
    tsbHighRiskThreshold: -9,
    ocHalfLifeOverrides: {
      // Empirical half-lives from actual resolution times (Andrés, 2025-2026)
      // Shoulder: Nov 10 onset, lingered to ~Feb 2026 = ~90 days observed
      "Shoulder R":   1440,   // 60 days — conservative empirical fit
      "Shoulder L":   1440,
      // Left MTP: three episodes, each 4-6 weeks to resolve
      "Toe L":        1008,   // 42 days = 6 weeks — mid-range empirical
      "Toe R":        1008,
      "MTP L":        1008,
      "MTP R":        1008,
      "Foot L":        840,   // 35 days — less specific forefoot issues
      "Foot R":        840,
      foot:            672,
      toe:            1008,
    },

    // Body composition — update after each DEXA scan
    ffm_lb: 115.8,             // lean mass (excl. BMC), April 2026 DEXA
    lean_bmc_lb: 121.0,        // lean + BMC, April 2026 DEXA
    fat_lb: 41.3,              // fat mass, April 2026 DEXA
    pct_fat: 25.4,             // body fat %, April 2026 DEXA
    scale_bias_pp: 0.6,        // DEXA BF% (25.4) minus scale-derived estimate at ~159 lb; update Sep 2026
    protein_target_g: 140,     // g/day — ~2.7 g/kg lean mass
    dexa_anchor_date: "2026-04-27",  // date of last DEXA scan (April 2026)
    next_dexa_date:   "2026-09-19",  // next planned scan — St. Jude 10K context

    // Calorie targets — empirically calibrated, scale-derived, April 2026
    bmr: 1520,
    tdee: 2100,
    fat_loss_target: 1700,
    fat_loss_rate_monthly: 1.7,  // lb/month — no-KNR period Apr-Sep 2026; revert to 1.9 when KNR resumes
    mtp_ceiling_miles: 4.0,  // current MTP protocol ceiling — update when ceiling advances
    mtp_next_milestone_miles: 4.4,  // next planned distance advance

    // Half marathon build
    hm_race_date:    "2026-09-19",
    hm_taper_start:  "2026-08-31",
    hm_peak_mi_week: 9,
    hm_taper_factor: 0.90,
    hm_weekly_build: 1.10,

    // Compartment TRIMP allocation vectors — { lower, upper, cardio }
    // Tune these after 4 to 6 weeks of per-compartment episode data.
    // All three values in each vector must sum to 1.0.
    COMPARTMENT_SPLITS: {
      running:        { lower: 0.25, upper: 0.00, cardio: 0.75 },
      swimming:       { lower: 0.00, upper: 0.30, cardio: 0.70 },
      cycling:        { lower: 0.15, upper: 0.00, cardio: 0.85 },
      rowing:         { lower: 0.20, upper: 0.10, cardio: 0.70 },
      walking:        { lower: 0.15, upper: 0.00, cardio: 0.85 },
      lower_strength: { lower: 0.85, upper: 0.00, cardio: 0.15 },
      upper_strength: { lower: 0.00, upper: 0.85, cardio: 0.15 },
      mixed_strength: { lower: 0.45, upper: 0.35, cardio: 0.20 },
      lower_cardio:   { lower: 0.40, upper: 0.00, cardio: 0.60 },
      upper_cardio:   { lower: 0.00, upper: 0.40, cardio: 0.60 },
      other:          { lower: 0.20, upper: 0.20, cardio: 0.60 },
    },

    // Fixed meal presets — log with "usual breakfast" etc, never re-describe
    MEAL_PRESETS: {
      breakfast: {
        label: "Usual breakfast",
        meal: "breakfast",
        items: ["low-fat cottage cheese 1/2 cup", "banana", "strawberry", "raw honey 1 tsp"],
        total_calories: 228, total_protein_g: 15, total_carbs_g: 38, total_fat_g: 2, total_fiber_g: 3,
      },
      lunch: {
        label: "Usual lunch",
        meal: "lunch",
        items: ["2x Lean & Fit yogurt (80 cal, 14g protein each)", "protein bar (210 cal, 20g protein)"],
        total_calories: 370, total_protein_g: 48, total_carbs_g: 28, total_fat_g: 6, total_fiber_g: 2,
      },
      snack: {
        label: "Usual snack",
        meal: "snack",
        items: ["Muscle Milk (160 cal, 30g protein)"],
        total_calories: 160, total_protein_g: 30, total_carbs_g: 7, total_fat_g: 5, total_fiber_g: 1,
      },
    },
  }
  if (typeof window !== "undefined") window.__liftConfig = LIFT_CONFIG
  // ────────────────────────────────────────────────────────────────────────

  // ── Half Marathon Race Calendar ─────────────────────────────────────────
  const RACE_CALENDAR = [
    { date: "2026-04-11", name: "SOAR Miles of Smiles",        city: "Bloomington",  dist_mi: 3.1,  recommended: true,  note: "First race back. Easy effort, not a time trial." },
    { date: "2026-04-18", name: "Easterseals Community Rally", city: "Tipton Park",  dist_mi: 3.1,  recommended: true,  note: "Second 5K week. Confirm MTP score 0 before." },
    { date: "2026-05-02", name: "Lake Run 7K",                 city: "Lake Bloomington", dist_mi: 4.35, recommended: true,  note: "First race above 5K. Use as long run substitute." },
    { date: "2026-05-03", name: "Unit 5 Foundation 5K",        city: "Normal",       dist_mi: 3.1,  recommended: false, note: "Day after Lake Run — too close. Skip." },
    { date: "2026-05-09", name: "Rivian 5K",                   city: "Normal",       dist_mi: 3.1,  recommended: true,  note: "Easy 5K training run. No racing." },
    { date: "2026-05-17", name: "Donut Run 5K",                city: "Bloomington IL", dist_mi: 3.1, recommended: true,  note: "Race-week option. Use as the primary Saturday run with Sunday full rest." },
    { date: "2026-06-06", name: "Steamboat Classic 4 Mile",    city: "Peoria",       dist_mi: 4.0,  recommended: true,  note: "Choose the 4-mile, not 15K. Use as long run." },
    { date: "2026-06-14", name: "Mackinaw Valley Wine Run",    city: "Mackinaw",     dist_mi: 3.1,  recommended: true,  note: "Easy 5K. Good aerobic session mid-build." },
    { date: "2026-07-04", name: "Park 2 Park",                 city: "Normal",       dist_mi: 5.0,  recommended: true,  note: "Ideal long run substitute at this phase." },
    { date: "2026-07-04", name: "Major Reid Memorial 5K",      city: "Hopedale",     dist_mi: 3.1,  recommended: false, note: "Same day as Park 2 Park — choose one." },
    { date: "2026-07-11", name: "Dog Days 5K",                 city: "Lake Bloomington", dist_mi: 3.1, recommended: true, note: "Easy effort. Watch heat — morning start." },
    { date: "2026-08-02", name: "Dawson Lake Dash",            city: "Moraine View SP", dist_mi: 3.5, recommended: true, note: "Short race in peak build. Run easy, not hard." },
    { date: "2026-08-22", name: "Route 66 (6.6)",              city: "McLean",       dist_mi: 4.1,  recommended: true,  note: "Good 4-mile effort 4 weeks out. No heroics." },
    { date: "2026-09-07", name: "Bridge to Bridge Run",        city: "Peoria",       dist_mi: 4.0,  recommended: true,  note: "Taper window. Easy effort only." },
    { date: "2026-09-19", name: "St. Jude 10K",                city: "Bloomington IL", dist_mi: 6.2, recommended: true,  note: "Primary fall 10K target. Controlled effort, no late-race spike." },
    { date: "2026-10-18", name: "Naperville Half Marathon",    city: "Naperville IL", dist_mi: 13.1, recommended: true,  note: "Half marathon goal race. Finish comfortable and injury-free." },
  ]

  // RACE_RESULTS: completed races with official and Garmin data
  // Add each race after it is run. Official time takes precedence over Garmin time.
  const RACE_RESULTS = [
    {
      id: "rivian_5k_2026",
      name: "Rivian 5K",
      date: "2026-05-10",
      distance_km: 5,
      distance_label: "5K",
      location: "Bloomington, IL",
      official_time: "32:07",
      official_pace: "10:21",
      garmin_time: "34:02",
      avg_speed_mph: 5.58,
      max_speed_mph: 6.69,
      avg_pace: "10:45",
      best_pace: "8:58",
      avg_power_w: 195,
      avg_cadence_spm: 173,
      max_cadence_spm: 193,
      avg_gct_ms: 264,
      flight_time_ms: 83,
      vert_ratio_pct: 9.4,
      avg_hr: 138,
      max_hr: 164,
      vo2_estimate: 42.8,
      calories: 325,
      overall_place: 185,
      overall_total: 505,
      gender_place: 158,
      gender_total: 304,
      ag_place: 6,
      ag_total: 10,
      ag_label: "50-54 Male",
      notes: "Easy effort — MTP protocol, protected toe. Chip time 1:55 faster than Garmin elapsed. Conservative race.",
      mtp_score: 0,
    },
  ]

  // ── ChatGPT Plan: weekly long run targets (week-start Monday → miles) ───
  const HM_PLAN_LONG_RUN = {
    "2026-03-23": 3.5,  "2026-03-30": 4.0,
    "2026-04-06": 3.1,  "2026-04-13": 3.1,
    "2026-04-20": 4.5,  "2026-04-27": 4.35,
    "2026-05-04": 3.1,  "2026-05-11": 3.1,
    "2026-05-18": 5.0,  "2026-05-25": 5.5,
    "2026-06-01": 4.0,  "2026-06-08": 3.1,
    "2026-06-15": 6.0,  "2026-06-22": 6.5,
    "2026-06-29": 5.0,  "2026-07-06": 3.1,
    "2026-07-13": 7.0,  "2026-07-20": 7.5,
    "2026-07-27": 3.5,  "2026-08-03": 8.0,
    "2026-08-10": 8.5,  "2026-08-17": 4.1,
    "2026-08-24": 9.0,  "2026-08-31": 4.0,
    "2026-09-07": 8.0,  "2026-09-14": 4.0,
  }

  const [tab, setTab] = useState("Overview")
  // Pre-populate Schedule tab when navigating from a missed-workout alert
  const [scheduleTarget, setScheduleTarget] = useState(null) // { day, date } | null
  // URD: ISO dates the user has explicitly marked as Unscheduled Recovery Days
  const [urdDays, setUrdDays] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("lift-urd-days") || "[]")) }
    catch { return new Set() }
  })
  const markURD = (iso) => {
    setUrdDays(prev => {
      const next = new Set(prev)
      next.add(iso)
      localStorage.setItem("lift-urd-days", JSON.stringify([...next]))
      return next
    })
  }
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
const [biometricRecords, setBiometricRecords] = useState(() => { try { return JSON.parse(localStorage.getItem("lift_biometric_records") || "[]") } catch { return [] } })
const [mealRecords, setMealRecords] = useState(() => { try { return JSON.parse(localStorage.getItem("lift_meal_records") || "[]") } catch { return [] } })
const [sleepRecords, setSleepRecords] = useState(() => { try { return JSON.parse(localStorage.getItem("lift_sleep_records") || "[]") } catch { return [] } })
const [schedLog, setSchedLog] = useState(() => { try { return JSON.parse(localStorage.getItem('wt-log') || '[]') } catch { return [] } })
const [ocItems, setOcItems] = useState(() => { try { return JSON.parse(localStorage.getItem('oc-items') || '[]') } catch { return [] } })
const [tendonStatus, setTendonStatus] = useState({ painScore: 0, stiffness: false, override: null })
const [selectedTendonGroup, setSelectedTendonGroup] = useState("combined")
const [overviewExplainOpen, setOverviewExplainOpen] = useState({})
const [baseDataLoaded, setBaseDataLoaded] = useState(false)
const [readinessInputsHydrated, setReadinessInputsHydrated] = useState(false)
const [readinessRemoteInputsHydrated, setReadinessRemoteInputsHydrated] = useState(false)
const operationalWorkoutUpdateRef = useRef({ source: "initial", newestDate: null, count: 0 })

const scheduleStrengthCanonicalSeeds = useMemo(() => {
  return (Array.isArray(schedLog) ? schedLog : [])
    .filter(e =>
      (e.exercises || []).some(ex => ex.variant !== "cardio") ||
      (e.data && Object.keys(e.data).length > 0)
    )
    .map(makeCanonicalSessionFromScheduleLog)
}, [schedLog])

const unifiedCanonicalSessions = useMemo(() => {
  return mergeCanonicalSessionsWithScheduleSeeds(canonicalSessions, scheduleStrengthCanonicalSeeds)
}, [canonicalSessions, scheduleStrengthCanonicalSeeds])

const mergedSleepEpisodes = useMemo(() => {
  return mergeAdjacentSleepSegments(sleepRecords, 90)
}, [sleepRecords])

useEffect(() => {
  if (process.env.NODE_ENV !== "development") return
  console.log("[LIFT DEBUG] canonicalSessions state", summarizeWorkoutSet(canonicalSessions))
}, [canonicalSessions])

useEffect(() => {
  if (process.env.NODE_ENV !== "development") return
  console.log("[LIFT DEBUG] unifiedCanonicalSessions", summarizeWorkoutSet(unifiedCanonicalSessions))
}, [unifiedCanonicalSessions])

useEffect(() => {
  if (process.env.NODE_ENV !== "development") return

  const inWindow = record => {
    const start = String(record?.start_at || record?.start_time || "")
    const end = String(record?.end_at || record?.end_time || "")
    return (
      start.slice(0, 10) >= "2026-04-14" && start.slice(0, 10) <= "2026-04-16"
    ) || (
      end.slice(0, 10) >= "2026-04-14" && end.slice(0, 10) <= "2026-04-16"
    ) || (
      String(record?.date || record?.sleep_date || "").slice(0, 10) >= "2026-04-14" &&
      String(record?.date || record?.sleep_date || "").slice(0, 10) <= "2026-04-16"
    )
  }

  console.log("[LIFT DEBUG] raw sleep rows 2026-04-14..2026-04-16",
    (Array.isArray(sleepRecords) ? sleepRecords : [])
      .filter(inWindow)
      .map(record => ({
        sleep_id: record?.sleep_id,
        date: record?.date || record?.sleep_date || null,
        start: record?.start_at || record?.start_time || null,
        end: record?.end_at || record?.end_time || null,
        duration_min: sleepMinutesForReadiness(record),
      }))
  )

  console.log("[LIFT DEBUG] merged sleep episodes 2026-04-14..2026-04-16",
    mergedSleepEpisodes
      .filter(inWindow)
      .map(record => ({
        sleep_id: record?.sleep_id,
        date: record?.date,
        start: record?.start_time,
        end: record?.end_time,
        duration_min: record?.duration_min,
        hours: Number((Number(record?.duration_min || 0) / 60).toFixed(3)),
        merged_segment_count: record?.merged_segment_count,
      }))
  )
}, [sleepRecords, mergedSleepEpisodes])

  const activeWorkouts = useMemo(() => {
    return unifiedCanonicalSessions && unifiedCanonicalSessions.length > 0
      ? unifiedCanonicalSessions
      : workouts
  }, [unifiedCanonicalSessions, workouts])
const fmt0 = n => Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString() : "0"
const fmt1 = n => Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "0.0"

function getTechnogymSource(workout) {
  return workout?.sources?.technogym ||
    (String(workout?.source || "").toLowerCase() === "technogym" ? workout : null)
}

function getMetricValue(workout, key) {
  return workout?.preferred_metrics?.[key]?.value ??
    workout?.sources?.technogym?.[key] ??
    workout?.[key] ??
    null
}

function isTechnogymCyclingSession(workout) {
  const technogym = getTechnogymSource(workout)
  if (!technogym) return false

  const tgType = String(
    technogym?.type ||
    technogym?.raw_type ||
    technogym?.activity_type ||
    ""
  ).toLowerCase()

  if (tgType.includes("cycl") || tgType.includes("bike") || tgType.includes("spin")) return true

  const rpmAvg = getMetricValue(workout, "rpm_avg")
  return rpmAvg !== null && Number.isFinite(Number(rpmAvg))
}

function normalizeWorkoutType(type, workout) {
  const t = String(type || "").toLowerCase()
  const schedule = workout?.sources?.schedule || workout?.schedule || null
  const scheduleExercises = Array.isArray(schedule?.exercises) ? schedule.exercises : []
  const hasStrengthExercises = scheduleExercises.some(ex => String(ex?.variant || "").toLowerCase() !== "cardio")
  const cardioModalities = Array.isArray(schedule?.cardio)
    ? schedule.cardio.map(cardio => String(cardio?.modality || "").toLowerCase())
    : []

  if (t.includes("traditional strength")) return "Strength"
  if (t.includes("functional strength")) return "Strength"
  if (t.includes("core")) return "Strength"
  if (hasStrengthExercises) return "Strength"

  if (t.includes("outdoor run") || t.includes("indoor run") || t.includes("treadmill")) return "Running"
  if (t.includes("trail run")) return "Running"
  if (t.includes("outdoor cycle") || t.includes("indoor cycle") || t === "cycling") return "Cycling"
  if (t.includes("outdoor swim") || t.includes("pool swim") || t === "swimming") return "Swimming"
  if (t.includes("open water")) return "Swimming"

  if (isTechnogymCyclingSession(workout)) return "Cycling"

  if (t.includes("running")) return "Running"
  if (t.includes("walking")) return "Walking"
  if (t.includes("cycling")) return "Cycling"
  if (t.includes("bike")) return "Cycling"
  if (t.includes("swimming")) return "Swimming"
  if (t.includes("elliptical")) return "Elliptical"
  if (t.includes("rowing")) return "Rowing"
  if (t.includes("stair")) return "Stairs"
  if (cardioModalities.includes("run")) return "Running"
  if (cardioModalities.includes("walk")) return "Walking"
  if (cardioModalities.includes("bike")) return "Cycling"
  if (cardioModalities.includes("swim")) return "Swimming"
  if (cardioModalities.includes("row")) return "Rowing"
  if (t === "strength") return "Strength"
  if (t === "run") return "Running"
  if (t === "bike") return "Cycling"
  if (t === "swim") return "Swimming"

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
    if (t === "strength") return "Strength"
      if (t === "running") return "Running"
        if (t === "cycling") return "Cycling"
          if (t === "run") return "Running"
            if (t === "bike") return "Cycling"
              if (t === "swim") return "Swimming"
          if (t === "swimming") return "Swimming"
            if (t === "yoga" || t === "flexibility" || t === "hiit") return "Strength"
              return "Other"
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
  const pmSource = String(pmDist?.source || "").toLowerCase()
  const pmUnit = pmDist?.unit ||
    (pmSource.includes("technogym")
      ? (workout?.sources?.technogym?.distance_unit || "m")
      : pmSource.includes("apple")
      ? workout?.sources?.apple?.distance_unit
      : (workout?.sources?.technogym?.distance_unit || workout?.sources?.apple?.distance_unit || ""))

  const candidates = [
    {
      value: pmDist?.value,
      unit: pmUnit

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
      value: workout?.sources?.technogym?.distance,
      unit: workout?.sources?.technogym?.distance_unit || "m"
    },
    {
      value: workout?.sources?.apple?.distance,
      unit: workout?.sources?.apple?.distance_unit
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
      let result = v
      if (result > 600) result = result / 60
      // Technogym stores duration in seconds rather than minutes for machine sessions.
      // Two-pass correction:
      // Pass 1: if raw value > 180 and no HR, it was seconds — divide by 60.
      // Pass 2: strength sessions with no HR are capped at 90 min (YMCA 5-7 AM window).
      //         Cardio sessions are capped at 180 min (generous for long rides/swims).
      const hasHR = !!(workout?.hr || workout?.preferred_metrics?.hr?.value)
      if (result > 180 && !hasHR) {
        result = result / 60
      }
      const isStrength = ['Strength', 'Functional Strength Training', 'Traditional Strength Training',
        'Core Training', 'CrossFit'].includes(workout?.category || workout?.canonical_type || workout?.type || '')
      if (!hasHR && isStrength && result > 90) {
        result = 90
      }
      if (!hasHR && !isStrength && result > 180) {
        result = 180
      }
      return result
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
    unit === "yd" ||
    unit === "yard" ||
    unit === "yards"
  ) {
    return value / 1760
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
  // Empirically calibrated constants — read from LIFT_CONFIG
  // Update LIFT_CONFIG after each DEXA scan, not here
  const CALIBRATED_BMR = LIFT_CONFIG.bmr
  const CALIBRATED_MAINTENANCE = LIFT_CONFIG.tdee
  const CALIBRATED_FAT_LOSS_TARGET = LIFT_CONFIG.fat_loss_target
  // Fire for weights ≤180 lb (covers 0/"not loaded yet" so target never falls back to formula-derived 2925)
  if (Number(currentWeight) <= 180) {
    const w = Number(currentWeight)
    return {
      estimatedMaintenance: CALIBRATED_MAINTENANCE,
      targetCalories: CALIBRATED_FAT_LOSS_TARGET,
      deficit: CALIBRATED_MAINTENANCE - CALIBRATED_FAT_LOSS_TARGET,
      phase: w > 0 && w <= 145 ? "at_target" : "fat_loss",
      distanceTo150: w > 0 ? Math.round(w - 150) : null,
      distanceTo145: w > 0 ? Math.round(w - 145) : null,
      bmr: CALIBRATED_BMR
    }
  }
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
    distanceTo150: Math.round(distanceTo150),
    distanceTo145: Math.round(distanceTo145)
  }
}

const normalizedActiveWorkouts = useMemo(() => {
  return activeWorkouts.map(w => {
    const rawType = w.canonical_type || w.type || "Other"
    const category = normalizeWorkoutType(rawType, w)

    // Normalize date: canonical sessions use "2026-01-01 15:46:19 -0600" or ISO format
    let dateStr = w.date || null
    if (!dateStr && w.start_date) {
      const cleaned = normalizeDateString(w.start_date)
      const d = cleaned ? new Date(cleaned) : new Date(NaN)
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
      distanceMiles: distance,
      distance_miles: distance,
      calories: w.preferred_metrics?.calories?.value ?? w.calories ?? 0,
      hr: w.preferred_metrics?.hr?.value ?? w.hr ?? null,
      dur: extractDurationMin(w),
      power_avg: getMetricValue(w, "power_avg"),
      rpm_avg: getMetricValue(w, "rpm_avg"),
      level: getMetricValue(w, "level")
    }
  })
}, [activeWorkouts])

useEffect(() => {
  if (process.env.NODE_ENV !== "development") return
  console.log("[LIFT DEBUG] normalizedActiveWorkouts", summarizeWorkoutSet(normalizedActiveWorkouts))
}, [normalizedActiveWorkouts])

function sameDay(a, b) {
  return String(a || "").slice(0, 10) === String(b || "").slice(0, 10)
}
function closeEnough(a, b, tol = 10) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol
}
function getWorkoutScheduleId(workout) {
  return workout?._scheduleId ??
    workout?.sources?.schedule?._scheduleId ??
    workout?.sources?.schedule?.id ??
    workout?.sources?.schedule_workout?._scheduleId ??
    workout?.sources?.schedule_workout?.id ??
    workout?.overlap_summary?.schedule_id ??
    workout?.overlap_summary?.schedule_workout_id ??
    null
}
function isSuspiciousApproximateFitnessViewCardio(workout) {
  const fv = workout?.sources?.fitnessview
  if (!fv) return false

  const sourceKeys = Object.keys(workout?.sources || {}).filter(key => workout?.sources?.[key])
  if (sourceKeys.length !== 1 || sourceKeys[0] !== "fitnessview") return false

  const type = normalizeWorkoutType(workout?.type || workout?.canonical_type || workout?.category, workout)
  if (type !== "Cycling" && type !== "Running" && type !== "Walking" && type !== "Swimming" && type !== "Rowing") {
    return false
  }

  const rawStart = String(fv?.start_date || "")
  const rawEnd = String(fv?.end_date || "")
  const dateOnlyTiming =
    /T00:00:00(?:\.000)?$/.test(rawStart) &&
    (!rawEnd || /T00:00:00(?:\.000)?$/.test(rawEnd))

  const durationMin = Number(workout?.dur ?? workout?.duration_min ?? 0) || 0
  return dateOnlyTiming && durationMin >= 180
}
function getOperationalWorkoutWindow(workout) {
  const startRaw = workout?.start_date || workout?.dateTime || workout?.date || null
  const endRaw = workout?.end_date || workout?.endDate || null
  const normalizedStart = normalizeDateString(startRaw)
  const normalizedEnd = normalizeDateString(endRaw)
  const startMs = normalizedStart ? Date.parse(normalizedStart) : NaN
  const explicitEndMs = normalizedEnd ? Date.parse(normalizedEnd) : NaN
  const durationMin = Number(workout?.dur ?? workout?.duration_min ?? workout?.durationMin ?? extractDurationMin(workout) ?? 0) || 0
  const endMs = Number.isFinite(explicitEndMs)
    ? explicitEndMs
    : (Number.isFinite(startMs) && durationMin > 0 ? startMs + durationMin * 60000 : NaN)

  return { startMs, endMs, durationMin }
}
function getOperationalWorkoutOverlap(imported, manual) {
  const importedWindow = getOperationalWorkoutWindow(imported)
  const manualWindow = getOperationalWorkoutWindow(manual)
  const hasComparableWindows =
    Number.isFinite(importedWindow.startMs) &&
    Number.isFinite(importedWindow.endMs) &&
    Number.isFinite(manualWindow.startMs) &&
    Number.isFinite(manualWindow.endMs)

  if (!hasComparableWindows) return { hasComparableWindows: false }

  const overlapMin = Math.max(0, Math.min(importedWindow.endMs, manualWindow.endMs) - Math.max(importedWindow.startMs, manualWindow.startMs)) / 60000
  const importedFraction = importedWindow.durationMin > 0 ? overlapMin / importedWindow.durationMin : 0
  const manualFraction = manualWindow.durationMin > 0 ? overlapMin / manualWindow.durationMin : 0
  const startDiffMin = Math.abs(importedWindow.startMs - manualWindow.startMs) / 60000

  return { hasComparableWindows, overlapMin, importedFraction, manualFraction, startDiffMin }
}
function areDuplicateOperationalWorkouts(imported, manual) {
  const importedScheduleId = getWorkoutScheduleId(imported)
  const manualScheduleId = getWorkoutScheduleId(manual)

  if (importedScheduleId != null && manualScheduleId != null) {
    return String(importedScheduleId) === String(manualScheduleId)
  }

  const importedDate = String(imported?.dateTime || imported?.date || imported?.start_date || "").slice(0, 10)
  const manualDate = String(manual?.dateTime || manual?.date || manual?.start_date || "").slice(0, 10)
  if (!importedDate || importedDate !== manualDate) return false

  const importedType = normalizeWorkoutType(imported?.type || imported?.canonical_type || imported?.category, imported)
  const manualType = normalizeWorkoutType(manual?.type || manual?.canonical_type || manual?.category, manual)
  if (importedType !== manualType) return false

  if (isSuspiciousApproximateFitnessViewCardio(imported)) {
    const importedCalories = Number(imported?.calories ?? imported?.preferred_metrics?.calories?.value ?? 0)
    const manualCalories = Number(manual?.calories ?? 0)
    const importedDistance = Number(imported?.distance ?? 0)
    const manualDistance = Number(manual?.distance ?? 0)
    const caloriesAligned =
      importedCalories > 0 &&
      manualCalories > 0 &&
      closeEnough(importedCalories, manualCalories, 25)
    const distanceCompatible =
      importedDistance <= 0 || manualDistance <= 0 || closeEnough(importedDistance, manualDistance, 0.15)
    if (caloriesAligned && distanceCompatible) return true
  }

  // Same day + same category + duration within 20% = duplicate
  const sameDay = String(imported?.dateTime || imported?.date || "").slice(0, 10) === String(manual?.dateTime || manual?.date || "").slice(0, 10)
  const sameCategory = (imported?.category || imported?.canonical_type) === (manual?.category || manual?.canonical_type)
  const durA = Number(imported?.dur || 0)
  const durB = Number(manual?.dur || 0)
  const durSimilar = durA > 0 && durB > 0 && Math.abs(durA - durB) / Math.max(durA, durB) < 0.20
  if (sameDay && sameCategory && durSimilar) return true

  const overlap = getOperationalWorkoutOverlap(imported, manual)
  if (overlap.hasComparableWindows) {
    const strongOverlap =
      overlap.overlapMin >= 5 &&
      (overlap.importedFraction >= 0.4 || overlap.manualFraction >= 0.4)
    if (strongOverlap) return true
    if (overlap.overlapMin <= 0 && overlap.startDiffMin > 180) return false
  }

  const importedDuration = Number(imported?.dur ?? imported?.duration_min ?? 0)
  const manualDuration = Number(manual?.dur ?? manual?.duration_min ?? 0)
  if (!Number.isFinite(importedDuration) || !Number.isFinite(manualDuration) || !closeEnough(importedDuration, manualDuration, 15)) return false

  const importedDistance = Number(imported?.distance ?? 0)
  const manualDistance = Number(manual?.distance ?? 0)
  if (importedDistance > 0 && manualDistance > 0) {
    return closeEnough(importedDistance, manualDistance, 0.15)
  }

  return true
}
const normalizedStoredWorkouts = useMemo(() => {
  const scheduleRows = buildScheduleCardioWorkoutsFromLog(schedLog)
  const legacyRows = (Array.isArray(storedWorkouts) ? storedWorkouts : []).map(w => {
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
      distanceMiles: normalizeDistanceToMiles(w),
      distance_miles: normalizeDistanceToMiles(w),
      calories: Number(w.calories || 0),
      hr: w.hr != null ? Number(w.hr) : null,
      dur: extractDurationMin(w)
    }
  })

  const scheduleIds = new Set(
    scheduleRows
      .map(w => String(w._scheduleId || w.session_id || ""))
      .filter(Boolean)
  )

  const legacyOnly = legacyRows.filter(w => {
    const id = String(w._scheduleId || w.session_id || "")
    return !id || !scheduleIds.has(id)
  })

  return [...scheduleRows, ...legacyOnly].sort((a, b) =>
    String(a.dateTime || a.date || "").localeCompare(String(b.dateTime || b.date || ""))
  )
}, [schedLog, storedWorkouts])

const operationalWorkouts = useMemo(() => {
  const imported = Array.isArray(normalizedActiveWorkouts) ? normalizedActiveWorkouts : []
  const manual = Array.isArray(normalizedStoredWorkouts) ? normalizedStoredWorkouts : []
  const manualOnly = manual.filter(manualWorkout =>
    !imported.some(importedWorkout => areDuplicateOperationalWorkouts(importedWorkout, manualWorkout))
  )

  return [...imported, ...manualOnly].sort((a, b) =>
    String(a.dateTime || a.date || "").localeCompare(String(b.dateTime || b.date || ""))
  )
}, [normalizedActiveWorkouts, normalizedStoredWorkouts])
useEffect(() => {
  const recent = (Array.isArray(operationalWorkouts) ? operationalWorkouts : []).filter(w => {
    const raw = w?.dateTime || w?.date || w?.start_date || w?.startDate || null
    const normalized = normalizeDateString(raw)
    const ts = normalized ? Date.parse(normalized) : NaN
    return Number.isFinite(ts) && ts >= Date.now() - 30 * 24 * 3600000
  })
  console.log("operationalWorkouts changed", {
    source: operationalWorkoutUpdateRef.current?.source || "unknown",
    newestDate: getNewestWorkoutLikeDate(operationalWorkouts),
    count: Array.isArray(operationalWorkouts) ? operationalWorkouts.length : 0,
    last30Count: recent.length,
    cycling30Count: recent.filter(w => normalizeWorkoutType(w.type, w) === "Cycling").length,
    canonicalNewestDate: getNewestWorkoutLikeDate(canonicalSessions),
    storedNewestDate: getNewestWorkoutLikeDate(storedWorkouts),
    schedNewestDate: getNewestWorkoutLikeDate(buildScheduleCardioWorkoutsFromLog(schedLog))
  })
  if (process.env.NODE_ENV === "development") {
    console.log("[LIFT DEBUG] operationalWorkouts summary", {
      operational: summarizeWorkoutSet(operationalWorkouts),
      imported: summarizeWorkoutSet(normalizedActiveWorkouts),
      manual: summarizeWorkoutSet(normalizedStoredWorkouts),
    })
  }
}, [operationalWorkouts, canonicalSessions, storedWorkouts, schedLog])


const [session, setSession] = useState(null)
const [email, setEmail] = useState("avidal@ilstu.edu")
const [password, setPassword] = useState("")
const [recoveryPassword, setRecoveryPassword] = useState("")
const [authMsg, setAuthMsg] = useState("")
const [authEvents, setAuthEvents] = useState([])
const [sessionRestoredFromStorage, setSessionRestoredFromStorage] = useState(false)
const [authInitialized, setAuthInitialized] = useState(false)
const [signOutPending, setSignOutPending] = useState(false)
const [authRedirectDebug, setAuthRedirectDebug] = useState(() => getAuthRedirectContext())
const [recoveryStatus, setRecoveryStatus] = useState(() => {
  const redirectContext = getAuthRedirectContext()
  return redirectContext.isRecovery && redirectContext.hasAuthParams ? "verifying" : "inactive"
})
const isRecoveryMode = recoveryStatus !== "inactive"
const isRecoveryModeRef = useRef(isRecoveryMode)
  const [hydrated, setHydrated] = useState(false)

const pushAuthEvent = useCallback((eventName, currentSession, details = "") => {
  const summary = [
    new Date().toISOString(),
    eventName,
    currentSession?.user?.email || "no-user",
    details
  ].filter(Boolean).join(" | ")

  setAuthEvents(prev => [...prev.slice(-7), summary])
}, [])

useEffect(() => {
  isRecoveryModeRef.current = isRecoveryMode
}, [isRecoveryMode])

  const [mealEntries, setMealEntries] = useState([])
  const [mealPresets, setMealPresets] = useState(defaultMealPresets)
  const [dailyTemplate, setDailyTemplate] = useState(() => {
  try {
    const stored = JSON.parse(localStorage.getItem('lift-daily-template') || 'null')
    return stored || { Breakfast: 'b1', Lunch: 'l1', Dinner: 'd1', Snacks: null }
  } catch {
    return { Breakfast: 'b1', Lunch: 'l1', Dinner: 'd1', Snacks: null }
  }
})
const dailyNutritionSummary = useMemo(() => {
  return summarizeDailyNutrition(mealEntries)
}, [mealEntries])
  const templateTotals = useMemo(() => {
  let calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0
  Object.entries(dailyTemplate).forEach(([slot, id]) => {
    if (!id) return
    const preset = (mealPresets[slot] || []).find(p => p.id === id)
    if (!preset) return
    calories  += preset.calories  || 0
    protein_g += preset.protein_g || 0
    carbs_g   += preset.carbs_g   || 0
    fat_g     += preset.fat_g     || 0
  })
  return { calories, protein_g, carbs_g, fat_g }
}, [dailyTemplate, mealPresets])
const [showMealDialog, setShowMealDialog] = useState(false)
const [showAddPreset, setShowAddPreset] = useState(false)
const [newPresetSlot, setNewPresetSlot] = useState("Breakfast")
const [newPreset, setNewPreset] = useState({ name:"", calories:"", protein_g:"", carbs_g:"", fat_g:"" })
  const [mealDate, setMealDate] = useState(todayISO())
  const [mealTab, setMealTab] = useState("Breakfast")
  const [customMealName, setCustomMealName] = useState("")
  const [customMeal, setCustomMeal] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" })
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [rawNutrition, setRawNutrition] = useState({ breakfast: "", lunch: "", dinner: "", snacks: "" })
if (process.env.NODE_ENV === "development") console.log("canonical sessions loaded:", canonicalSessions.length)
useEffect(() => {
  if (process.env.NODE_ENV === "development") console.log(
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

        const bw = await fetch(`${base}data/body_weight.json`)
          .then(r => {
            if (!r.ok) {
              console.warn("[LIFT] body_weight.json fetch failed:", r.status, r.url)
              return []
            }
            return r.json()
          })
          .catch(err => {
            console.warn("[LIFT] body_weight.json fetch threw:", err?.message || err)
            return []
          })
        fetch(`${base}data/weight_daily.json`)
          .then(r => r.ok ? r.json() : [])
          .then(weightSeed => {
            if (!Array.isArray(weightSeed) || !weightSeed.length) return
            setBiometricRecords(prev => {
              if (Array.isArray(prev) && prev.length > 0) return prev
              return weightSeed.filter(r => r.measured_date && r.weight_lb && Number(r.weight_lb) > 140)
            })
          })
          .catch(() => {})
        const dx = await fetch(`${base}data/dexa_summary.json?v=20260427`).then(r => {
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
        const bundledCanonicalSessions = Array.isArray(cs?.all_sessions) ? cs.all_sessions : []
        if (process.env.NODE_ENV === "development") {
          console.log("[LIFT DEBUG] bundled canonical sessions loaded", summarizeWorkoutSet(bundledCanonicalSessions))
        }
        operationalWorkoutUpdateRef.current = {
          source: "bundle:canonicalSessions",
          newestDate: getNewestWorkoutLikeDate(bundledCanonicalSessions),
          count: bundledCanonicalSessions.length
        }
        console.log("Readiness workout source update", operationalWorkoutUpdateRef.current)
        setCanonicalSessions(bundledCanonicalSessions)
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.log(err)
        setError(String(err))
      } finally {
        setBaseDataLoaded(true)
      }
    }

    loadData()
}, [])

useEffect(() => {
  if (!baseDataLoaded) return

  const readLocalImportDiagnostic = key => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return { present: false, count: 0 }
      const parsed = JSON.parse(raw)
      return { present: true, count: Array.isArray(parsed) ? parsed.length : null }
    } catch (err) {
      return { present: true, count: null, error: err?.message || String(err) }
    }
  }

  const migrationSummary = {
    supabaseClientExists: Boolean(supabase),
    signedInUserExists: Boolean(session?.user?.id),
    userId: session?.user?.id || null,
    baseDataLoaded: Boolean(baseDataLoaded),
    localStorage: {
      liftCanonicalSessions: readLocalImportDiagnostic("lift_canonical_sessions"),
      liftSleepRecords: readLocalImportDiagnostic("lift_sleep_records"),
      liftHealthfitDaily: readLocalImportDiagnostic("lift_healthfit_daily"),
      healthfitDaily: readLocalImportDiagnostic("healthfit-daily"),
      liftBiometricRecords: readLocalImportDiagnostic("lift_biometric_records")
    },
    attempts: {
      canonical_sessions: 0,
      sleep_records: 0,
      healthfit_daily: 0,
      biometric_records: 0
    },
    successes: {
      canonical_sessions: 0,
      sleep_records: 0,
      healthfit_daily: 0,
      biometric_records: 0
    },
    failures: {},
    earlyExitReason: null
  }

  console.log("Core imported data migration entered", migrationSummary)

  const earlyExitReasons = []
  if (!supabase) earlyExitReasons.push("Supabase client is missing")
  if (!session?.user?.id) earlyExitReasons.push("signed-in user id is missing")

  if (earlyExitReasons.length) {
    setReadinessRemoteInputsHydrated(true)
    migrationSummary.earlyExitReason = earlyExitReasons.join("; ")
    console.warn("Core imported data migration exiting early", migrationSummary)
    console.log("Core imported data migration final summary", migrationSummary)
    return
  }

  let cancelled = false
  setReadinessRemoteInputsHydrated(false)

  const hydrateTimeoutId = window.setTimeout(() => {
    if (!cancelled) {
      console.warn('[LIFT] Hydration timed out after 15s, forcing hydrated=true')
      setReadinessRemoteInputsHydrated(true)
    }
  }, 15000)

  ;(async () => {
    try {
      const userId = session.user.id
      const storedHealthfitDaily = store?.get ? await store.get("healthfit-daily") : []
      const healthfitDailyStoreCount = Array.isArray(storedHealthfitDaily) ? storedHealthfitDaily.length : 0
      migrationSummary.store = {
        healthfitDaily: {
          present: Array.isArray(storedHealthfitDaily),
          count: healthfitDailyStoreCount
        }
      }

      const runMigration = async (tableName, attemptCount, migrate) => {
        migrationSummary.attempts[tableName] = attemptCount
        console.log("Core imported data migration table attempt", { tableName, attemptCount })
        try {
          const migrated = await migrate()
          migrationSummary.successes[tableName] = Array.isArray(migrated) ? migrated.length : 0
          console.log("Core imported data migration table success", {
            tableName,
            successCount: migrationSummary.successes[tableName]
          })
          return migrated
        } catch (err) {
          migrationSummary.failures[tableName] = err?.message || String(err)
          console.error("Core imported data migration table failure", { tableName, error: err })
          throw err
        }
      }

      // ── READS FIRST: always load from Supabase regardless of migration state ──
      const remoteReadResults = await Promise.allSettled([
        loadCanonicalSessions(supabase, userId),
        loadSleepRecords(supabase, userId),
        loadHealthfitDaily(supabase, userId),
        loadBiometricRecords(supabase, userId)
      ])
      const [
        remoteCanonicalSessions,
        remoteSleepRecords,
        remoteHealthFitDaily,
        remoteBiometricRecords
      ] = remoteReadResults.map(result => (result.status === "fulfilled" ? result.value : []))
      remoteReadResults.forEach((result, index) => {
        if (result.status === "fulfilled") return
        const tableName = ["canonical_sessions", "sleep_records", "healthfit_daily", "biometric_records"][index]
        migrationSummary.failures[`${tableName}_read`] = result.reason?.message || String(result.reason)
        console.error("Core imported data remote read failure", { tableName, error: result.reason })
      })

      if (cancelled) return
      if (remoteCanonicalSessions.length) {
        setCanonicalSessions(currentCanonicalSessions => {
          const currentNewestTs = getNewestWorkoutLikeTimestamp(currentCanonicalSessions)
          const remoteNewestTs = getNewestWorkoutLikeTimestamp(remoteCanonicalSessions)

          if (
            Number.isFinite(currentNewestTs) &&
            Number.isFinite(remoteNewestTs) &&
            remoteNewestTs < currentNewestTs &&
            (Array.isArray(currentCanonicalSessions) ? currentCanonicalSessions.length : 0) >
              remoteCanonicalSessions.length
          ) {
            console.warn("[LIFT] Remote canonical sessions are older than local. Local may have uncommitted imports. Using local until next import commit.", {
              localNewest: getNewestWorkoutLikeDate(currentCanonicalSessions),
              remoteNewest: getNewestWorkoutLikeDate(remoteCanonicalSessions),
              localCount: Array.isArray(currentCanonicalSessions) ? currentCanonicalSessions.length : 0,
              remoteCount: remoteCanonicalSessions.length
            })
            return currentCanonicalSessions
          }

          const merged = mergeCanonicalSessionsPreferPrimary(
            Array.isArray(currentCanonicalSessions) ? currentCanonicalSessions : [],
            remoteCanonicalSessions
          ).map(applyCanonicalSessionMergePolicy)

          operationalWorkoutUpdateRef.current = {
            source: "remote:canonicalSessions",
            newestDate: getNewestWorkoutLikeDate(merged),
            count: merged.length
          }
          console.log("[LIFT] Merged remote canonical sessions", {
            ...operationalWorkoutUpdateRef.current,
            current: summarizeWorkoutSet(currentCanonicalSessions),
            remote: summarizeWorkoutSet(remoteCanonicalSessions),
            merged: summarizeWorkoutSet(merged)
          })
          return merged
        })
      }
      if (remoteSleepRecords.length) {
        setSleepRecords(prev => {
          const combined = [
            ...(Array.isArray(prev) ? prev : []).map(r => ({ ...r, date: getSleepRecordDate(r) || r.date })),
            ...remoteSleepRecords.map(r => ({ ...r, date: getSleepRecordDate(r) || r.date }))
          ].filter(r => r.date)
          return deduplicateSleepRecords(combined)
            .sort((a, b) => (a.start_at || a.date || '').localeCompare(b.start_at || b.date || ''))
        })
      }
      if (remoteHealthFitDaily.length) {
        setHealthFitDaily(prev => {
          const byDate = {}
          ;(Array.isArray(prev) ? prev : []).forEach(r => { if (r.date) byDate[r.date] = r })
          remoteHealthFitDaily.forEach(r => { if (r.date) byDate[r.date] = r })
          return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
        })
      }
      if (remoteBiometricRecords.length) {
        setBiometricRecords(prev => {
          // Key by biometric_id || id so trainer entries (which use biometric_id) are never dropped
          const bioKey = r => r.biometric_id || r.id || `${r.source || "bio"}_${r.timestamp || r.date}`
          const byId = {}
          ;(Array.isArray(prev) ? prev : []).forEach(r => { byId[bioKey(r)] = r })
          remoteBiometricRecords.forEach(r => {
            const k = bioKey(r)
            const existing = byId[k]
            // Source priority: never let a non-trainer entry overwrite a trainer entry for the same key
            if (existing && existing.source === "trainer" && r.source !== "trainer") return
            byId[k] = r
          })
          return Object.values(byId).sort((a, b) =>
            String(a.measured_date || a.date || "").localeCompare(
              String(b.measured_date || b.date || "")
            )
          )
        })
      }

      // ── WRITES IN BACKGROUND: migrate local data to Supabase without blocking ──
      Promise.allSettled([
        runMigration("canonical_sessions", migrationSummary.localStorage.liftCanonicalSessions.count || 0, () =>
          migrateLocalCanonicalSessions(supabase, userId, { removeLocal: false })
        ),
        runMigration("sleep_records", migrationSummary.localStorage.liftSleepRecords.count || 0, () =>
          migrateLocalSleepRecords(supabase, userId, { removeLocal: false })
        ),
        runMigration("healthfit_daily", (migrationSummary.localStorage.healthfitDaily.count || 0) + healthfitDailyStoreCount, () =>
          migrateLocalHealthfitDaily(supabase, userId, store, { removeLocal: false })
        ),
        runMigration("biometric_records", migrationSummary.localStorage.liftBiometricRecords.count || 0, () =>
          migrateLocalBiometricRecords(supabase, userId, { removeLocal: false })
        )
      ]).then(migrationWriteResults => {
        const [mc, ms, mh, mb] = migrationWriteResults.map(r => r.status === "fulfilled" ? r.value : [])
        console.log("Core imported data migration background writes complete", {
          canonicalSessions: mc.length,
          sleepRecords: ms.length,
          healthFitDaily: mh.length,
          biometricRecords: mb.length
        })
      }).catch(err => {
        console.warn("Core imported data migration background writes error", err)
      })
    } catch (err) {
      console.error("Core imported data migration/hydration failed:", err)
      if (process.env.NODE_ENV === "development") console.warn("Core imported data hydration failed:", err)
    } finally {
      window.clearTimeout(hydrateTimeoutId)
      if (!cancelled) setReadinessRemoteInputsHydrated(true)
      console.log("Core imported data migration final summary", migrationSummary)
    }
  })()

  return () => { cancelled = true; window.clearTimeout(hydrateTimeoutId) }
}, [baseDataLoaded, session?.user?.id, supabase])

useEffect(() => {
  if (!supabase) return

  let cancelled = false

  const applyRedirectContext = (reason) => {
    const redirectContext = getAuthRedirectContext()
    setAuthRedirectDebug(redirectContext)
    pushAuthEvent("REDIRECT_PARSE", null, `${reason} | ${redirectContext.summary}`)
    return redirectContext
  }

  ;(async () => {
    try {
      const redirectContext = applyRedirectContext("getSession")
      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return

      const restoredFromStorage = Boolean(data?.session) && !redirectContext.hasAuthParams

      setSession(data?.session ?? null)
      setSessionRestoredFromStorage(restoredFromStorage)
      setAuthInitialized(true)

      if (redirectContext.isRecovery && redirectContext.hasAuthParams) {
        if (data?.session) {
          setRecoveryStatus("ready")
          setAuthMsg("Enter a new password to finish password recovery.")
        } else {
          setRecoveryStatus("expired")
          setAuthMsg("Recovery link expired, request a new one.")
        }
      } else {
        setRecoveryStatus("inactive")
      }

      if (error) {
        pushAuthEvent("GET_SESSION_ERROR", data?.session ?? null, error.message || "Unknown error")
      } else {
        pushAuthEvent(
          "GET_SESSION",
          data?.session ?? null,
          restoredFromStorage ? "restored-from-storage" : "no-stored-session"
        )
      }

      if (data?.session && !redirectContext.isRecovery) {
        cleanAuthRedirectUrl()
      }
    } catch (err) {
      if (cancelled) return
      setAuthInitialized(true)
      const redirectContext = applyRedirectContext("getSession-catch")
      if (redirectContext.isRecovery && redirectContext.hasAuthParams) {
        setRecoveryStatus("expired")
        setAuthMsg("Recovery link expired, request a new one.")
      }
      pushAuthEvent("GET_SESSION_THROWN", null, err?.message || "Unknown error")
    }
  })()

  const sub = supabase.auth.onAuthStateChange(async (evt, sess) => {
    const redirectContext = applyRedirectContext(`auth:${evt}`)

    setSession(sess)
    pushAuthEvent(evt, sess, redirectContext.isRecovery ? `recovery-url | ${redirectContext.summary}` : redirectContext.summary)

    if (evt === "INITIAL_SESSION") {
      setSessionRestoredFromStorage(Boolean(sess) && !redirectContext.hasAuthParams)
      setAuthInitialized(true)
      if (redirectContext.isRecovery && redirectContext.hasAuthParams) {
        setRecoveryStatus(sess ? "ready" : "expired")
        setAuthMsg(sess ? "Enter a new password to finish password recovery." : "Recovery link expired, request a new one.")
      }
    }

    if (evt === "PASSWORD_RECOVERY") {
      setRecoveryStatus("ready")
      setAuthMsg("Enter a new password to finish password recovery.")
    }

    if (evt === "SIGNED_OUT") {
      if (!redirectContext.isRecovery) setRecoveryStatus("inactive")
      setSessionRestoredFromStorage(false)
      setPassword("")
      setRecoveryPassword("")
    }

    if (evt === "SIGNED_IN" && sess?.user?.id) {
      const localMeals = JSON.parse(localStorage.getItem("ufd-meal-entries") || "[]")

      if (localMeals.length > 0 && sess?.user?.id) {
        if (process.env.NODE_ENV === "development") console.log("Migrating local meals to Supabase...")

        try {
          await syncMealsToSupabase(localMeals, sess.user.id)
          // Only remove from localStorage after confirmed Supabase write
          localStorage.removeItem("ufd-meal-entries")
        } catch (mealSyncErr) {
          console.warn("[LIFT] Meal sync to Supabase failed, keeping localStorage copy", mealSyncErr)
          if (process.env.NODE_ENV === "development") console.error("Meal migration failed:", mealSyncErr)
        }
      }

      if (!redirectContext.isRecovery) {
        setRecoveryStatus("inactive")
        cleanAuthRedirectUrl()
      } else {
        setRecoveryStatus("ready")
        setAuthMsg("Enter a new password to finish password recovery.")
      }
    }

    if (evt === "USER_UPDATED" && isRecoveryModeRef.current) {
      setRecoveryStatus("inactive")
      setRecoveryPassword("")
      setPassword("")
      setAuthMsg("Password updated. You can now sign in normally.")
      cleanAuthRedirectUrl()
    }
  })

  return () => {
    cancelled = true
    sub.data.subscription.unsubscribe()
  }
}, [pushAuthEvent])

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
    try {
    // Load from localStorage first
    const wo = await store.get("ufd-workouts")
    const lg = await store.get("wt-log")
    const ocLocal = await store.get("oc-items")
    const hfLocal = await store.get("healthfit-daily")
    const dedupedWorkouts = dedupeUfdWorkouts(wo)
    const ninetyDaysAgo = Date.now() - 90 * 24 * 3600000
    const cleanedOcLocal = (Array.isArray(ocLocal) ? ocLocal : []).filter(item => {
      if ((item.initialScore || item.currentScore || 0) > 0) return true
      const startMs = item.startDate ? new Date(item.startDate).getTime() : 0
      return Number.isFinite(startMs) && startMs >= ninetyDaysAgo
    })
    if (Array.isArray(wo) && dedupedWorkouts.length !== wo.length) {
      await store.set("ufd-workouts", dedupedWorkouts)
      setStoredWorkouts(dedupedWorkouts)
      console.log(`[migration] Removed ${wo.length - dedupedWorkouts.length} duplicate ufd-workouts entries`)
    }
    if (Array.isArray(ocLocal) && cleanedOcLocal.length !== ocLocal.length) {
      await store.set("oc-items", cleanedOcLocal)
      setOcItems(cleanedOcLocal)
      console.log(`[migration] Removed ${ocLocal.length - cleanedOcLocal.length} zero-score OC items`)
    }
    if (Array.isArray(hfLocal)) setHealthFitDaily(hfLocal)
    // Then fetch from Supabase and merge
    if (supabase) {
      try {
        const { data } = await supabase
          .from("user_kv")
          .select("key, value, updated_at")
          .in("key", ["ufd-workouts", "wt-log", "oc-items", "healthfit-daily", "wt-sessions"])
        if (data) {
          const sbWo = data.find(r => r.key === "ufd-workouts")?.value
          if (process.env.NODE_ENV === "development") console.log("Supabase user_kv fetch:", { sbWo_count: Array.isArray(sbWo)?sbWo.length:0 })
          // Merge ufd-workouts: union by id, prefer Supabase if newer
          if (Array.isArray(sbWo)) {
            const local = Array.isArray(dedupedWorkouts) ? dedupedWorkouts : []
            const merged = dedupeUfdWorkouts(Object.values(
              [...local, ...sbWo].reduce((acc, w) => {
                if (!acc[w.id] || w.id > acc[w.id].id) acc[w.id] = w
                return acc
              }, {})
            ))
            operationalWorkoutUpdateRef.current = {
              source: "remote:user_kv:ufd-workouts",
              newestDate: getNewestWorkoutLikeDate(merged),
              count: merged.length
            }
            console.log("Readiness workout source update", operationalWorkoutUpdateRef.current)
            setStoredWorkouts(merged)
            await store.set("ufd-workouts", merged)
             } else if (Array.isArray(dedupedWorkouts)) {
            operationalWorkoutUpdateRef.current = {
              source: "local:ufd-workouts",
              newestDate: getNewestWorkoutLikeDate(dedupedWorkouts),
              count: dedupedWorkouts.length
            }
            console.log("Readiness workout source update", operationalWorkoutUpdateRef.current)
            setStoredWorkouts(dedupedWorkouts)
          }
          const sbLg = data.find(r => r.key === "wt-log")?.value
          if (Array.isArray(sbLg)) {
            const local = Array.isArray(lg) ? lg : []
            const merged = Object.values(
              [...local, ...sbLg].reduce((acc, e) => { acc[e.id] = e; return acc }, {})
            ).sort((a, b) => b.id - a.id)
            operationalWorkoutUpdateRef.current = {
              source: "remote:user_kv:wt-log",
              newestDate: getNewestWorkoutLikeDate(buildScheduleCardioWorkoutsFromLog(merged)),
              count: merged.length
            }
            console.log("Readiness workout source update", operationalWorkoutUpdateRef.current)
            setSchedLog(merged)
            await store.set("wt-log", merged)
          } else if (Array.isArray(lg)) {
            operationalWorkoutUpdateRef.current = {
              source: "local:wt-log",
              newestDate: getNewestWorkoutLikeDate(buildScheduleCardioWorkoutsFromLog(lg)),
              count: lg.length
            }
            console.log("Readiness workout source update", operationalWorkoutUpdateRef.current)
            setSchedLog(lg)
          }
          // Merge oc-items
          const sbOc = data.find(r => r.key === "oc-items")?.value
          if (Array.isArray(sbOc)) {
            const local = cleanedOcLocal
            const merged = Object.values(
              [...local, ...sbOc].reduce((acc, e) => { acc[e.id] = e; return acc }, {})
            )
              .filter(item => {
                if ((item.initialScore || item.currentScore || 0) > 0) return true
                const startMs = item.startDate ? new Date(item.startDate).getTime() : 0
                return Number.isFinite(startMs) && startMs >= ninetyDaysAgo
              })
              .sort((a, b) => b.id - a.id)
            const cleanedOcItems = merged.filter(function(item) {
              // Remove ghost OC entries: zero-severity Toe L joint items created by body map mis-taps
              if (
                item.key === 'jointStatus' &&
                (item.location || '').includes('Toe') &&
                (item.initialScore || 0) === 0 &&
                (item.currentScore || 0) === 0
              ) return false
              return true
            }).map(function(item) {
              // Correct episodeCount for the chronic MTP item (3 known episodes: Dec 2025, Feb 2026, Mar 2026)
              if (
                item.key === 'jointStatus' &&
                item.location === 'Toe L' &&
                (item.initialScore || 0) > 0 &&
                (item.episodeCount || 0) < 3
              ) return Object.assign({}, item, { episodeCount: 3 })
              return item
            })
            setOcItems(cleanedOcItems)
            await store.set("oc-items", cleanedOcItems)
          } else if (Array.isArray(cleanedOcLocal)) {
            setOcItems(cleanedOcLocal)
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
        if (process.env.NODE_ENV === "development") console.warn("Supabase sync fetch failed:", err.message)
        if (Array.isArray(wo)) setStoredWorkouts(wo)
      }
    } else {
      if (Array.isArray(wo)) setStoredWorkouts(wo)
      if (Array.isArray(cleanedOcLocal)) setOcItems(cleanedOcLocal)
    }
    } finally {
      setReadinessInputsHydrated(true)
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
      if (process.env.NODE_ENV === "development") console.error("Initial meal load failed:", err)
      // load error, no user message needed
    }
  })()
}, [hydrated, session?.user?.id])
  const dailyWithBiometrics = useMemo(() => {
    const byDate = {}

    ;(Array.isArray(daily) ? daily : []).forEach(row => {
      if (row?.date) byDate[row.date] = { ...row }
    })

    ;(Array.isArray(biometricRecords) ? biometricRecords : []).forEach(row => {
      const date = String(row?.measured_date || row?.date || row?.measured_at || row?.timestamp || "").slice(0, 10)
      const weight = Number(
        row?.weight_lb ??
        row?.weight_lbs ??
        row?.weight_lbs_mean ??
        row?.weight ??
        row?.["Weight (lb)"] ??
        row?.["Weight (lb, same-day if available)"] ??
        row?.value
      )
      if (!date || !Number.isFinite(weight) || weight <= 0) return

      byDate[date] = {
        ...(byDate[date] || { date }),
        date,
        weight_lb: weight,
        weight_source: row?.source || "biometric_records"
      }
    })

    return Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [daily, biometricRecords])

  const latestWeight = useMemo(() => {
    if (!dailyWithBiometrics.length) return null
    return dailyWithBiometrics[dailyWithBiometrics.length - 1]
  }, [dailyWithBiometrics])

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
  if (!dailyWithBiometrics.length) return []
  if (selectedRangePoints == null) return dailyWithBiometrics
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - selectedRangePoints)
  cutoff.setHours(0, 0, 0, 0)
  return dailyWithBiometrics.filter(row => {
    const d = new Date(String(row.date || "").slice(0, 10) + "T12:00:00")
    return Number.isFinite(d.getTime()) && d >= cutoff
  })
}, [dailyWithBiometrics, selectedRangePoints])

  const mergedDailyWeights = useMemo(() => {
    return [...dailyWithBiometrics].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [dailyWithBiometrics])

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

useEffect(() => {
  const hasWeight = weightSmoothed.some(r => r.weight != null && Number.isFinite(r.weight) && r.weight > 0)
  const hasAvg = weightSmoothed.some(r => r.avg != null && Number.isFinite(r.avg) && r.avg > 0)
  console.log("[LIFT] weight pipeline", {
    dailyRows: daily.length,
    biometricRecordRows: biometricRecords.length,
    dailyWithBiometrics: dailyWithBiometrics.length,
    filteredDaily: filteredDaily.length,
    weightSmoothedRows: weightSmoothed.length,
    hasAnyWeight: hasWeight,
    hasAnyAvg: hasAvg,
    sampleFirst: weightSmoothed[0] ?? null,
    sampleLast: weightSmoothed[weightSmoothed.length - 1] ?? null,
    biometricSampleFirst: biometricRecords[0] ?? null,
  })
}, [daily, biometricRecords, dailyWithBiometrics, filteredDaily, weightSmoothed])

useEffect(() => {
  const cyclingSample = operationalWorkouts.filter(w =>
    (w.category || "").toLowerCase().includes("cycle")
  ).slice(0, 5)

  console.log("operationalWorkouts summary", {
    total: operationalWorkouts.length,
    newest: operationalWorkouts.slice(-1)[0],
    cyclingCount: operationalWorkouts.filter(w =>
      (w.category || "").toLowerCase().includes("cycle")
    ).length,
    cyclingSample,
    weightCount: weightSmoothed?.length || 0
  })
}, [operationalWorkouts, weightSmoothed])

const overviewWeightDomain = useMemo(() => {
  const vals = weightSmoothed
    .map(row => Number(row.weight))
    .filter(v => Number.isFinite(v) && v > 0)

  if (!vals.length) return [140, 190]

  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  let low = Math.floor(minVal) - 3
  let high = Math.ceil(maxVal) + 3
  const minSpan = 18

  if ((high - low) < minSpan) {
    const mid = (high + low) / 2
    low = Math.floor(mid - minSpan / 2)
    high = Math.ceil(mid + minSpan / 2)
  }

  return [low, high]
}, [weightSmoothed])
  const dexaSeries = useMemo(() => {
    return DEXA_REGIONAL.map(s => ({
      date: s.date,
      label: s.label,
      total_lb: Number((s.totalMass / 1000 * 2.20462).toFixed(1)),
      fat_lb: Number((s.fatMass / 1000 * 2.20462).toFixed(1)),
      lean_lb: Number((s.leanMass / 1000 * 2.20462).toFixed(1)),
      lean_bmc_lb: Number((s.leanBmc / 1000 * 2.20462).toFixed(1)),
      pct_fat: s.fatPct
    }))
  }, [])

  const latestDexa = useMemo(() => {
    if (!dexaSeries.length) return null
    return dexaSeries[dexaSeries.length - 1]
  }, [dexaSeries])

  const latestLeanAnchor = useMemo(() => {
    if (!latestDexa) return null
    return latestDexa.lean_lb
  }, [latestDexa])

  const estimatedCurrentBF = useMemo(() => {
    // Primary method: fit weighted linear regression to DEXA pct_fat values
    // and project forward to today. More accurate than lean-mass-constant
    // assumption because it uses the actual fat loss trend across all scans.
    if (dexaSeries.length >= 2) {
      const dexaForRegression = dexaSeries
        .filter(d => d.date && d.pct_fat != null)
        .map(d => ({ date: d.date, val: Number(d.pct_fat) }))
        .filter(d => Number.isFinite(d.val))

      if (dexaForRegression.length >= 2) {
        // Use long half-life (180 days) so all DEXA scans contribute equally —
        // we have only 4 points and cannot afford to discount older ones heavily.
        const slopePerDay = weightedLinearSlope(
          dexaForRegression,
          d => d.val,
          180
        )
        const lastScan = dexaForRegression[dexaForRegression.length - 1]
        const daysSinceLastScan =
          (new Date().getTime() - new Date(lastScan.date).getTime()) / 86400000
        const projected = lastScan.val + slopePerDay * daysSinceLastScan
        if (Number.isFinite(projected) && projected > 5 && projected < 60) {
          return projected
        }
      }
    }

    // Fallback: lean-mass-constant method (original logic)
    if (!latestWeight || latestLeanAnchor == null) return null
    const wt = Number(latestWeight.weight_lb)
    if (!wt || wt <= 0) return null
    return ((wt - latestLeanAnchor) / wt) * 100
  }, [latestWeight, latestLeanAnchor, dexaSeries])

  const vo2Series = useMemo(() => {
    return (Array.isArray(healthFitDaily) ? healthFitDaily : [])
      .filter(r => r.metric_date && r.vo2_max != null && Number(r.vo2_max) > 20)
      .map(r => ({
        date: r.metric_date,
        label: fmtShortDate(r.metric_date),
        vo2: Number(Number(r.vo2_max).toFixed(1))
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [healthFitDaily])

  const mealDerivedDays = useMemo(() => deriveDailyNutrition(mealEntries), [mealEntries])

  const nutritionSeries = useMemo(() => {
    const staticDays = [...nutrition]
      .filter(row => (row.calories ?? row.kcal ?? row.energy_kcal ?? row.Calories) != null
                  || (row.protein_g ?? row.protein) != null)  // skip placeholder rows with all-null macros
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

  const signInWithPassword = async () => {
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

    if (!password) {
      setAuthMsg("Enter your password.")
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: e,
      password
    })

    if (authError) setAuthMsg(`Login failed: ${authError.message}`)
    else {
      setAuthMsg("Signed in.")
      cleanAuthRedirectUrl()
    }
  }

  const sendPasswordRecovery = async () => {
    if (!supabase) {
      setAuthMsg("Supabase env vars are missing.")
      return
    }

    setAuthMsg("")
    const e = String(email || session?.user?.email || "").trim()
    if (!e.includes("@")) {
      setAuthMsg("Enter a valid email.")
      return
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo })

    if (error) setAuthMsg(`Password reset failed: ${error.message}`)
    else setAuthMsg("Password reset email sent.")
  }

  const completePasswordRecovery = async () => {
    if (!supabase) {
      setAuthMsg("Supabase env vars are missing.")
      return
    }

    setAuthMsg("")
    if (!recoveryPassword || recoveryPassword.length < 8) {
      setAuthMsg("Enter a new password with at least 8 characters.")
      return
    }

    const { error } = await supabase.auth.updateUser({ password: recoveryPassword })

    if (error) {
      setAuthMsg(`Password update failed: ${error.message}`)
      return
    }

    setRecoveryPassword("")
    setPassword("")
    setRecoveryStatus("inactive")
    setAuthMsg("Password updated. You can now sign in normally.")
    cleanAuthRedirectUrl()
  }

  const doSignOut = async () => {
    if (!supabase || signOutPending) return
    setSignOutPending(true)
    setAuthMsg("")
    try {
      const { error: authError } = await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("Sign out timed out. Reload and try again.")), SIGN_OUT_TIMEOUT_MS)
        })
      ])
      if (authError) throw authError
      setSession(null)
      setSessionRestoredFromStorage(false)
      setPassword("")
      setRecoveryPassword("")
      setRecoveryStatus("inactive")
      cleanAuthRedirectUrl()
    } catch (err) {
      setAuthMsg(`Sign out failed: ${err?.message || String(err)}`)
    } finally {
      setSignOutPending(false)
    }
  }
async function syncMealsToSupabase(entries, currentUserId) {
  if (!supabase || !currentUserId) return

  const rows = (entries || []).map(m => ({
    id: m.id || crypto.randomUUID(),
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

  if (rows.length === 0) return

  const { error: upsertError } = await supabase
    .from("meals")
    .upsert(rows, { onConflict: "id" })

  if (upsertError) {
    if (process.env.NODE_ENV === "development") console.error("Meal sync upsert error:", upsertError)
    throw upsertError
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
    if (process.env.NODE_ENV === "development") console.error("Meal load error:", error)
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
  if (process.env.NODE_ENV === "development") console.log("persistMealEntries called, userId:", currentUserId)
  if (!currentUserId) {
    if (process.env.NODE_ENV === "development") console.log("No active session, meals saved locally only.")
    return
  }

  try {
    await syncMealsToSupabase(nextEntries, currentUserId)
  } catch (err) {
    const msg = err?.message || "Unknown sync error"
    if (process.env.NODE_ENV === "development") console.error("Meal sync failed:", err)
    // load error, no user message needed
  }
}
  async function persistMealPresets(nextPresets) {
    setMealPresets(nextPresets)
    await store.set("ufd-meal-presets", nextPresets)
  }

  async function addPresetMeal(preset) {
    const entry = {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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

// Sessions from the schedule log dated after the newest canonical session.
// These extend Banister inputs forward without altering canonical history.
const banisterSupplementalSessions = useMemo(() => {
  const newestCanonicalTs = getNewestWorkoutLikeTimestamp(unifiedCanonicalSessions) || 0

  const candidates = (Array.isArray(operationalWorkouts) ? operationalWorkouts : [])
    .filter(workout => {
      const ts = Date.parse(normalizeDateString(workout.dateTime || workout.date || "") || "")
      return Number.isFinite(ts) && ts > newestCanonicalTs && Number(workout.dur || 0) > 0
    })

  // Deduplicate by date + type + duration bucket to suppress cross-session
  // duplicate schedule log entries before feeding TRIMP to the Banister model.
  // _scheduleId-based dedup (dedupeUfdWorkouts) already handles same-session
  // duplicates; this handles identical activities logged in separate sessions.
  const seen = new Map()
  for (const w of candidates) {
    const dateStr = String(w.dateTime || w.date || "").slice(0, 10)
    const durBucket = Math.round(Number(w.dur || 0) / 5) * 5
    const typeKey = String(w.type || w.category || "").toLowerCase()
    const key = `${dateStr}|${typeKey}|${durBucket}`
    if (!seen.has(key)) seen.set(key, w)
  }

  return [...seen.values()].map(workout => ({
      start_date: String(workout.dateTime || workout.date || "").slice(0, 10),
      duration_min: Number(workout.dur || 0),
      avg_hr: 0,
      trimp: null,
    }))
}, [operationalWorkouts, unifiedCanonicalSessions])

// ── Banister TSB from unified canonical sessions ──────────────────────────
// tau1=27 (fitness/CTL), tau2=18 (fatigue/ATL), TRIMP-based
const computedTSBFromSessions = useMemo(() => {
  const tau1 = LIFT_CONFIG.tau1, tau2 = LIFT_CONFIG.tau2
  const allBanisterSessions = [
    ...(Array.isArray(unifiedCanonicalSessions) ? unifiedCanonicalSessions : []),
    ...banisterSupplementalSessions,
  ]
  const raw = allBanisterSessions.map(s => {
    const durMin = s.dur_min || s.duration_min ||
      (Number(s.duration_sec) > 0 ? s.duration_sec / 60 : 0)
    const avgHr = Number(s.avg_hr) || 0
    const trimp = s.trimp != null
      ? Number(s.trimp)
      : durMin * (avgHr > 0 ? (avgHr / 180) * 1.2 : 0.5)
    return { date: (s.start_date || s.dateTime || s.date || "").slice(0, 10), trimp }
  })
  // Sum TRIMP by calendar date
  const dailyTrimp = {}
  raw.forEach(({ date, trimp }) => {
    if (!date || !Number.isFinite(trimp) || trimp <= 0) return
    dailyTrimp[date] = (dailyTrimp[date] || 0) + trimp
  })
  const days = Object.keys(dailyTrimp).sort()
  if (!days.length) return null
  let ctl = 0, atl = 0, prevCtl = 0, prevAtl = 0
  let prev = days[0]
  days.forEach(d => {
    const gap = Math.max(0, Math.round((new Date(d) - new Date(prev)) / 86400000))
    // Fill zero-TRIMP days between sessions
    for (let i = 0; i < gap - 1; i++) {
      prevCtl = ctl; prevAtl = atl
      ctl = ctl + (0 - ctl) / tau1
      atl = atl + (0 - atl) / tau2
    }
    prevCtl = ctl; prevAtl = atl
    const t = dailyTrimp[d] || 0
    ctl = ctl + (t - ctl) / tau1
    atl = atl + (t - atl) / tau2
    prev = d
  })
  // TSB(t) = CTL(t-1) - ATL(t-1) per Banister definition
  const tsb = +(prevCtl - prevAtl).toFixed(1)
  const out = { ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb }
  out.global = out
  return out
}, [banisterSupplementalSessions, unifiedCanonicalSessions])

const acwrSeries = useMemo(() => {
  const sessions = [
    ...(Array.isArray(unifiedCanonicalSessions) ? unifiedCanonicalSessions : []),
    ...banisterSupplementalSessions,
  ]
  if (!sessions.length) return []

  const dailyTrimp = {}
  sessions.forEach(s => {
    const date = (s.start_date || s.dateTime || s.date || "").slice(0, 10)
    if (!date) return
    const dur = Number(s.dur_min || s.duration_min || (Number(s.duration_sec) > 0 ? s.duration_sec / 60 : 0))
    const hr  = Number(s.avg_hr) || 0
    const trimp = s.trimp != null
      ? Number(s.trimp)
      : dur * (hr > 0 ? (hr / 180) * 1.2 : 0.5)
    if (Number.isFinite(trimp) && trimp > 0)
      dailyTrimp[date] = (dailyTrimp[date] || 0) + trimp
  })

  const sessionDates = Object.keys(dailyTrimp).sort()
  if (!sessionDates.length) return []

  const sessionDateSet = new Set(sessionDates)
  const firstDate = new Date(`${sessionDates[0]}T12:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const rows = []
  const minChronicActiveDays = 6
  const minChronicSpanDays = 14
  const maxSparseGapDays = 10

  const getWindowSessionOffsets = (current, days) => {
    const offsets = []
    for (let j = 0; j < days; j++) {
      const dd = new Date(current)
      dd.setDate(dd.getDate() - j)
      const dk = dd.toISOString().slice(0, 10)
      if (sessionDateSet.has(dk)) offsets.push(j)
    }
    return offsets
  }

  const getLargestGapFromOffsets = offsets => {
    if (offsets.length <= 1) return 0
    let largestGap = 0
    for (let i = 1; i < offsets.length; i++) {
      largestGap = Math.max(largestGap, offsets[i] - offsets[i - 1] - 1)
    }
    return largestGap
  }

  for (let d = new Date(firstDate); d <= today; d.setDate(d.getDate() + 1)) {
    const current = new Date(d)
    const key = d.toISOString().slice(0, 10)
    let atl = 0, ctl = 0, atlCount = 0, ctlCount = 0
    for (let j = 0; j < 28; j++) {
      const dd = new Date(current)
      dd.setDate(dd.getDate() - j)
      const dk = dd.toISOString().slice(0, 10)
      const t = dailyTrimp[dk] || 0
      if (j < 7)  { atl += t; atlCount++ }
      ctl += t; ctlCount++
    }
    atl = atlCount > 0 ? atl / atlCount : 0
    ctl = ctlCount > 0 ? ctl / ctlCount : 0

    const acuteOffsets = getWindowSessionOffsets(current, 7)
    const chronicOffsets = getWindowSessionOffsets(current, 28)
    const chronicActiveDays = chronicOffsets.length
    const chronicSpanDays = chronicOffsets.length > 1 ? chronicOffsets[chronicOffsets.length - 1] - chronicOffsets[0] : 0
    const largestChronicGap = getLargestGapFromOffsets(chronicOffsets)
    const daysSinceLastSession = chronicOffsets.length ? chronicOffsets[0] : Number.POSITIVE_INFINITY

    const hasChronicCoverage =
      chronicActiveDays >= minChronicActiveDays &&
      chronicSpanDays >= minChronicSpanDays &&
      largestChronicGap <= maxSparseGapDays

    const hasEnoughAcuteCoverage =
      acuteOffsets.length >= 2 ||
      (acuteOffsets.length === 1 && hasChronicCoverage && daysSinceLastSession <= 7) ||
      (acuteOffsets.length === 0 && hasChronicCoverage && daysSinceLastSession <= 7)

    const hasSufficientData = hasChronicCoverage && hasEnoughAcuteCoverage
    const acwr = hasSufficientData && ctl > 0 ? Number((atl / ctl).toFixed(3)) : null

    rows.push({
      date:  key,
      label: fmtShortDate(key),
      atl:   Number(atl.toFixed(1)),
      ctl:   Number(ctl.toFixed(1)),
      acwr,
      hasSufficientData
    })
  }

  return rows
}, [banisterSupplementalSessions, unifiedCanonicalSessions])

const trainingSummary = useMemo(() => {
  return buildTrainingSummary(operationalWorkouts)
}, [operationalWorkouts])

const weeklyTrainingBuckets = useMemo(() => {
  return buildWeeklyTrainingBuckets(operationalWorkouts)
}, [operationalWorkouts])
useEffect(() => {
  if (process.env.NODE_ENV === "development") console.log("LIFT ingestion check")
  if (process.env.NODE_ENV === "development") console.log("operationalWorkouts count:", operationalWorkouts?.length ?? 0)
  if (process.env.NODE_ENV === "development") console.log("trainingSummary:", trainingSummary)
  if (process.env.NODE_ENV === "development") console.log("weeklyTrainingBuckets last 6:", weeklyTrainingBuckets?.slice?.(-6) ?? [])
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

  // Normalize against ALL-TIME max so short windows don't compress the scale
  const maxLoadAllTime = Math.max(
    ...weeklyTrainingBuckets.map(w =>
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
    cardioMin: w.cardioMinutes ?? 0,
    trainingLoadPct: Math.round(((
      (w.running || 0) +
      (w.swimming || 0) +
      (w.cycling || 0) * 0.4 +
      (w.strength || 0) * 2 +
      (w.cardioMinutes || 0) * 0.08
    ) / maxLoadAllTime) * 100),
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
const vo2SourceSummary = useMemo(() => {
  const records = Array.isArray(biometricRecords) ? biometricRecords : []
  const byDateDesc = (a, b) => String(b?.date || b?.measured_date || b?.timestamp || "").localeCompare(String(a?.date || a?.measured_date || a?.timestamp || ""))
  const normalizeRow = (row, sourceLabel) => {
    const value = Number(
      row?.vo2_max ??
      row?.vo2 ??
      row?.value
    )
    if (!Number.isFinite(value) || value <= 0) return null
    return {
      value: Number(value.toFixed(1)),
      date: String(row?.date || row?.measured_date || row?.measured_at || row?.timestamp || "").slice(0, 10) || null,
      source: sourceLabel
    }
  }

  const labLike = records
    .filter(row => /knr|lab/i.test(String(row?.source || "")))
    .sort(byDateDesc)
    .map(row => normalizeRow(row, /knr/i.test(String(row?.source || "")) ? "Lab / KNR" : "Lab"))
    .find(Boolean) || null

  const apple = records
    .filter(row => /apple/i.test(String(row?.source || "")))
    .sort(byDateDesc)
    .map(row => normalizeRow(row, "Apple"))
    .find(Boolean) || null

  const proxy = vo2ProxySummary?.latestSmoothed != null
    ? {
        value: Number(vo2ProxySummary.latestSmoothed.toFixed(1)),
        date: vo2ProxySmoothed[vo2ProxySmoothed.length - 1]?.date || null,
        source: "LIFT proxy"
      }
    : null

  return { labLike, apple, proxy }
}, [biometricRecords, vo2ProxySummary, vo2ProxySmoothed])

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

  if (process.env.NODE_ENV === "development") console.log("VO2 proxy check")
  if (process.env.NODE_ENV === "development") console.log("operationalWorkouts count:", operationalWorkouts?.length ?? 0)
  if (process.env.NODE_ENV === "development") console.log("run-like count:", runLike.length)
  if (process.env.NODE_ENV === "development") console.log("run-like with distance+dur count:", runLikeWithDistance.length)
  if (process.env.NODE_ENV === "development") console.log("vo2ProxyData count:", vo2ProxyData?.length ?? 0)
  if (process.env.NODE_ENV === "development") console.log("vo2ProxySummary:", vo2ProxySummary)
  if (process.env.NODE_ENV === "development") console.log("vo2ProxyData first 5:", vo2ProxyData?.slice?.(0, 5) ?? [])
  if (process.env.NODE_ENV === "development") console.log("vo2ProxySmoothed last 5:", vo2ProxySmoothed?.slice?.(-5) ?? [])
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

  if (process.env.NODE_ENV === "development") console.log("VO2 run distance audit summary:", {
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

  if (process.env.NODE_ENV === "development") console.log("VO2 run distance audit first 10:", runDistanceAudit.slice(0, 10))
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
  // Anchor to the most recent known weight in priority order:
  // 1. Latest biometric record (trainer entry or import)
  // 2. Latest weight from dailyWithBiometrics
  // 3. LIFT_CONFIG DEXA anchor (April 2026)
  const sortedBio = [...(biometricRecords || [])].sort((a, b) =>
    String(b.timestamp || b.date || "").localeCompare(String(a.timestamp || a.date || ""))
  )
  const latestBioWeight = sortedBio.find(r => Number(r.weight_lb) > 100)?.weight_lb
  const latestDailyWeight = [...(dailyWithBiometrics || [])]
    .reverse()
    .find(r => Number(r.weight_lb || r.weight) > 100)
  const dailyWeight = latestDailyWeight
    ? Number(latestDailyWeight.weight_lb || latestDailyWeight.weight)
    : null

  const anchorWeight = Number(latestBioWeight) > 100
    ? Number(latestBioWeight)
    : dailyWeight ?? LIFT_CONFIG.total_mass_lb ?? 162.3

  const lossRateMonthly = LIFT_CONFIG.fat_loss_rate_monthly ?? 1.7
  const slopePerDay = -(lossRateMonthly / 30.44)
  const phase1Target = 150
  const finalTarget = 145

  const projectW = days => Math.max(finalTarget, anchorWeight + slopePerDay * days)
  const etaDays = (target) => {
    if (anchorWeight <= target) return null
    const d = new Date()
    d.setDate(d.getDate() + Math.ceil((anchorWeight - target) / lossRateMonthly * 30.44))
    return d.toISOString().slice(0, 10)
  }

  return {
    currentWeight: anchorWeight,
    phase1TargetWeight: phase1Target,
    finalTargetWeight: finalTarget,
    estimatedMaintenance: null,
    avgLoggedCalories: 0,
    loggingCoverage: 0,
    observedSlope: slopePerDay,
    energyBalanceSlope: slopePerDay,
    blendedSlope: slopePerDay,
    weight1m:  projectW(30),
    weight3m:  projectW(90),
    weight6m:  projectW(180),
    weight12m: projectW(365),
    eta150: etaDays(phase1Target),
    eta145: etaDays(finalTarget)
  }
}, [biometricRecords, dailyWithBiometrics, LIFT_CONFIG])

const injuryPenalties = useMemo(() => {
  return getInjuryPenalties(ocItems)
}, [ocItems])
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
  () => computeReadinessDetail(ocItems, sleepRecords, healthFitDaily, computedTSBFromSessions?.tsb ?? null).score,
  [ocItems, sleepRecords, healthFitDaily, computedTSBFromSessions]
)

const latestHealthFit = useMemo(() => {
  const arr = Array.isArray(healthFitDaily) ? healthFitDaily : []
  return arr.filter(r => r.tsb != null || r.ctl != null || r.atl != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}, [healthFitDaily])
const latestReadinessTsb = useMemo(() => {
  const sortedHF = (Array.isArray(healthFitDaily) ? healthFitDaily : [])
    .filter(r => r.date && r.tsb != null)
    .sort((a, b) => b.date.localeCompare(a.date))
  const latest = sortedHF[0] ?? null
  if (latest) {
    const ageDays = (Date.now() - new Date(latest.date).getTime()) / 86400000
    if (ageDays <= 7) return Number(latest.tsb)
  }
  return computedTSBFromSessions?.tsb ?? null
}, [healthFitDaily, computedTSBFromSessions])

const computedTSB = useMemo(() => {
  if (!unifiedCanonicalSessions?.length) return null;
  const INTENSITY = {
    Running: 1.0, Cycling: 0.55, "Indoor Cycling": 0.6,
    Swimming: 1.1, "Traditional Strength Training": 0.7,
    "Functional Strength Training": 0.65, Walking: 0.3
  };
  const dailyLoad = { all: {}, Running: {}, Cycling: {}, Swimming: {} };
  unifiedCanonicalSessions.forEach(s => {
    const d = (s.start_date || s.dateTime || "").slice(0, 10);
    if (!d) return;
    const dur = s.duration_min || (s.duration_sec / 60) || 0;
    const type = s.canonical_type || s.type || "";
    const load = dur * (INTENSITY[type] ?? 0.5);
    ["all", ...(["Running","Cycling","Swimming"].includes(type) ? [type] : [])].forEach(k => {
      dailyLoad[k][d] = (dailyLoad[k][d] || 0) + load;
    });
  });
  const calcTSB = (loadMap) => {
    const days = Object.keys(loadMap).sort();
    if (!days.length) return { ctl: 0, atl: 0, tsb: 0 };
    let ctl = 0, atl = 0;
    const eCtl = Math.exp(-1 / LIFT_CONFIG.tau1), eAtl = Math.exp(-1 / LIFT_CONFIG.tau2);
    let prev = days[0];
    days.forEach(d => {
      const gap = (new Date(d) - new Date(prev)) / 86400000;
      for (let i = 0; i < gap - 1; i++) { ctl = ctl * eCtl; atl = atl * eAtl; }
      ctl = ctl * eCtl + (loadMap[d] || 0) * (1 - eCtl);
      atl = atl * eAtl + (loadMap[d] || 0) * (1 - eAtl);
      prev = d;
    });
    return { ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1) };
  };
  return {
    global: calcTSB(dailyLoad.all),
    running: calcTSB(dailyLoad.Running),
    cycling: calcTSB(dailyLoad.Cycling),
    swimming: calcTSB(dailyLoad.Swimming),
  };
}, [unifiedCanonicalSessions])

const tsbV2Panel = useMemo(() => {
  const tau1 = LIFT_CONFIG.tau1, tau2 = LIFT_CONFIG.tau2, lookbackDays = selectedRangePoints ?? 90, warmupDays = 42
  const now = new Date(); now.setHours(0,0,0,0)
  const start = new Date(now); start.setDate(start.getDate() - (lookbackDays + warmupDays - 1))
  const dayKeys = []
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1))
    dayKeys.push(d.toISOString().slice(0,10))
  const mkL = () => ({ overall:0, running:0, cycling:0, swimming:0, strength:0, upperStrength:0, lowerStrength:0, anyWorkout:false })
  const dailyLoads = Object.fromEntries(dayKeys.map(k => [k, mkL()]))
  const wkts = Array.isArray(operationalWorkouts) ? operationalWorkouts : []
  function isPlausibleSession(w) {
    const dur = Number(w.dur || w.duration_min || 0)
    if (dur <= 0) return true
    const type = String(w.canonical_type || w.type || w.category || '').toLowerCase()

    // Absolute caps by activity category regardless of source count.
    // FitnessView date-only rows expand to 336-400 min; Technogym strength = 240 min artifact.
    // These caps are well above any real session Andrés would do.
    if (type.includes('swim') || type.includes('pool')) return dur <= 150
    if (type.includes('cycl') || type.includes('bike') || type.includes('indoor')) return dur <= 180
    if (type.includes('run')) return dur <= 240
    if (type.includes('walk')) return dur <= 150
    if (type.includes('strength') || type.includes('functional') ||
        type.includes('traditional') || type.includes('weight') ||
        type.includes('resistance')) return dur <= 150
    const sources = Object.keys(w.sources || {})
    if (dur > 240 && sources.length === 1) return false
    return true
  }
  // Before the daily-load loop, deduplicate operational workouts so that the same
  // session imported from multiple sources (Apple, Technogym, FitnessView) is only
  // counted once per type per day. Keep the session with the most sources; break
  // ties by keeping the longest duration.
  const dedupedForTsb = (() => {
    const byDayType = {}
    for (const w of wkts) {
      if (!isPlausibleSession(w)) continue
      const day = String(w.dateTime || w.date || w.start_date || '').slice(0, 10)
      if (!day) continue
      const rawType = String(w.canonical_type || w.type || w.category || 'other').toLowerCase()
      const normType = rawType.includes('swim') || rawType.includes('pool') ? 'swimming'
        : rawType.includes('cycl') || rawType.includes('bike') ? 'cycling'
        : rawType.includes('run') ? 'running'
        : rawType.includes('walk') ? 'walking'
        : (rawType.includes('strength') || rawType.includes('functional') ||
           rawType.includes('traditional') || rawType.includes('weight') ||
           rawType.includes('resistance')) ? 'strength'
        : rawType
      const key = `${day}__${normType}`
      const existing = byDayType[key]
      if (!existing) {
        byDayType[key] = w
        continue
      }
      const existingSources = Object.keys(existing.sources || {}).length
      const newSources = Object.keys(w.sources || {}).length
      const existingDur = Number(existing.dur || existing.duration_min || 0)
      const newDur = Number(w.dur || w.duration_min || 0)
      if (newSources > existingSources || (newSources === existingSources && newDur > existingDur)) {
        byDayType[key] = w
      }
    }
    return Object.values(byDayType)
  })()
  dedupedForTsb.forEach(w => {
    const date = getWorkoutLikeDateKey(w)
    if (!dailyLoads[date]) return
    const cat = normalizeWorkoutType(w.type, w)
    const dur = Number(w.duration_min ?? w.dur ?? 0) || 0
    const hr = Number(w.preferred_metrics?.hr?.value ?? w.hr ?? 0) || 0
    const load = Math.max(0, dur * (hr > 0 ? Math.max(0.75, Math.min(1.35, hr/145)) : 1))
    if (load <= 0) return
    dailyLoads[date].anyWorkout = true
    dailyLoads[date].overall += load
    if (cat === 'Running' || cat === 'Walking') dailyLoads[date].running += load
    if (cat === 'Cycling') dailyLoads[date].cycling += load
    if (cat === 'Swimming') dailyLoads[date].swimming += load
    if (cat === 'Strength') {
      dailyLoads[date].strength += load
      // Classify upper vs lower by day-of-week (exercise lists not available on operationalWorkouts)
      // Mon = Chest & Arms (upper), Thu = Back & Arms (upper)
      // Tue = Legs (lower), Sat = Hip/Legs (lower)
      // Fri = Legs + Chest (mixed, split evenly)
      // All other days default to overall strength only
      const dow = new Date(date + 'T12:00:00').getDay() // 0=Sun,1=Mon,2=Tue,4=Thu,5=Fri,6=Sat
      if (dow === 1 || dow === 4) dailyLoads[date].upperStrength += load          // Mon, Thu
      else if (dow === 2 || dow === 6) dailyLoads[date].lowerStrength += load     // Tue, Sat
      else if (dow === 5) {                                                         // Fri mixed
        dailyLoads[date].upperStrength += load * 0.5
        dailyLoads[date].lowerStrength += load * 0.5
      }
    }
  })
  const acute = {overall:0,running:0,cycling:0,swimming:0,strength:0,upperStrength:0,lowerStrength:0}
  const chronic = {overall:0,running:0,cycling:0,swimming:0,strength:0,upperStrength:0,lowerStrength:0}
  const aA = 1 - Math.exp(-1/tau2), aC = 1 - Math.exp(-1/tau1)

  const allRows = dayKeys.map(date => {
    const load = dailyLoads[date]
    const row = { date }
    ;['overall','running','cycling','swimming','strength','upperStrength','lowerStrength'].forEach(k => {
      acute[k] += aA * (load[k] - acute[k])
      chronic[k] += aC * (load[k] - chronic[k])
      row[`${k}Tsb`] = Number((chronic[k] - acute[k]).toFixed(2))
    })
    row.dailyLoad = Number((load.overall || 0).toFixed(2))
    row.strengthLoad = Number((load.strength || 0).toFixed(2))
    row.hasAnyWorkout = Boolean(load.anyWorkout)
    return row
  })
  let rollingLoad14 = 0
  allRows.forEach((row, index) => {
    rollingLoad14 += Number(row.dailyLoad || 0)
    if (index >= 14) rollingLoad14 -= Number(allRows[index - 14]?.dailyLoad || 0)
    row.rollingLoad14 = Number(rollingLoad14.toFixed(2))
    row.load14Alert = row.rollingLoad14 > 700 && Number(row.overallTsb) < LIFT_CONFIG.tsbModerateRiskThreshold
  })
  const canonicalSessions = dedupedForTsb
  const acwrByDate = {}
  canonicalSessions.forEach(session => {
    const d = (session.start_date || "").slice(0, 10)
    if (!d) return
    const load = Number(session.trimp || session.duration_min || 0)
    acwrByDate[d] = (acwrByDate[d] || 0) + load
  })
  let rows = allRows.slice(-lookbackDays).map(r => ({ ...r, label: String(r.date).slice(5) }))
  rows = rows.map((pt, i) => {
    const slice28 = rows.slice(Math.max(0, i - 27), i + 1)
    const slice7  = rows.slice(Math.max(0, i - 6),  i + 1)
    const chronic = slice28.reduce((s, p) => s + (acwrByDate[p.date] || 0), 0) / 28
    const acute   = slice7.reduce((s,  p) => s + (acwrByDate[p.date] || 0), 0) / 7
    const acwr    = chronic > 0 ? Number((acute / chronic).toFixed(2)) : null
    return { ...pt, acwr }
  })
  const sVals = rows.map(r => r.strengthLoad).filter(v => Number.isFinite(v))
  const sMin = sVals.length ? Math.min(...sVals) : 0
  const sMax = sVals.length ? Math.max(...sVals) : 1
  rows.forEach(r => {
    r.strengthNorm = sMax > sMin ? Number((((r.strengthLoad-sMin)/(sMax-sMin))*100).toFixed(1)) : 0
    r.strengthNormDisplay = !r.hasAnyWorkout && r.strengthLoad === 0 ? null : r.strengthNorm
    r.strengthZeroMarker = r.hasAnyWorkout && r.strengthLoad === 0 ? 4 : null
  })
  const cur = rows[rows.length-1] || {}
  const tsbNow = cur.overallTsb ?? 0
  const riskFromOC = readinessScore != null
    ? (readinessScore >= 75 ? 'green' : readinessScore >= 50 ? 'yellow' : readinessScore >= 25 ? 'orange' : 'red')
    : null
  const risk = riskFromOC ?? (
    tsbNow < LIFT_CONFIG.tsbHighRiskThreshold ? 'red'
      : tsbNow < LIFT_CONFIG.tsbModerateRiskThreshold ? 'orange'
      : tsbNow < 0 ? 'yellow'
      : 'green'
  )
  const tsbVals = rows.flatMap(r => [
    r.overallTsb,
    r.runningTsb,
    r.cyclingTsb,
    r.swimmingTsb,
    r.strengthTsb
  ]).filter(v => Number.isFinite(v))
  const rawMin = tsbVals.length ? Math.min(...tsbVals) : -15
  const rawMax = tsbVals.length ? Math.max(...tsbVals) : 10
  const minSpan = selectedRangePoints == null || selectedRangePoints >= 365 ? 24 : 16
  let domLow = Math.floor(Math.min(rawMin - 3, -2))
  let domHigh = Math.ceil(Math.max(rawMax + 3, 5))
  if (domHigh - domLow < minSpan) {
    const midpoint = (domHigh + domLow) / 2
    domLow = Math.floor(midpoint - minSpan / 2)
    domHigh = Math.ceil(midpoint + minSpan / 2)
  }
  const tsbDomain = [domLow, domHigh]
  return {
    rows,
    alerts: [],
    readinessRiskLabel: risk,
    readinessDetail: { score: readinessScore ?? Math.round(50 + tsbNow) },
    currentOverallTsb: tsbNow,
    currentLoad14: cur.rollingLoad14 ?? 0,
    currentLoad14Alert: Boolean(cur.load14Alert),
    currentRow: cur,
    tsbDomain
  }
}, [operationalWorkouts, schedLog, ocItems, readinessScore, selectedRangePoints])

const ocConstraintState = useMemo(() => {
  return buildOcConstraintState({
    ocItems,
    sleepRecords,
    healthFitDaily,
    computedTSB,
    tsbV2Panel,
    weeklyTrainingBuckets,
    workouts: operationalWorkouts
  })
}, [ocItems, sleepRecords, healthFitDaily, computedTSB, tsbV2Panel, weeklyTrainingBuckets, operationalWorkouts])

const adaptiveTrainingState = useMemo(() => {
  return buildAdaptiveTrainingState({
    schedLog,
    operationalWorkouts,
    acwrSeries,
    tsbRows: tsbV2Panel?.rows || [],
    ocItems,
    readinessScore,
    weeklyTrainingBuckets
  })
}, [schedLog, operationalWorkouts, acwrSeries, tsbV2Panel, ocItems, readinessScore, weeklyTrainingBuckets])

const operationalCapacityData = useMemo(() => {
  const items = Array.isArray(ocItems) ? ocItems : []

  // Include items with a valid startDate and a nonzero initialScore.
  // Resolved items (currentScore 0) are included so their historical arc shows.
  const PEAK_LOSS_BY_SCORE = [0, 0.15, 0.25, 0.40, 0.60, 0.80]

  const classifyItem = item => {
    if (item.key === "illnessLoad") return "disease"
    if (item.key === "sleepDebt")   return "fatigue"
    return "acute"
  }

  const datedEntries = items
    .map(item => {
      const start = item.startDate ? new Date(item.startDate) : null
      if (!start || Number.isNaN(start.getTime())) return null
      const initScore = item.initialScore || item.currentScore || 0
      if (initScore <= 0) return null
      const halfLifeHours = resolveOcHalfLifeHours(
        item,
        LIFT_CONFIG.ocHalfLifeOverrides,
        Number(OC_KEY_META[item.key]?.halfLifeHours || 72)
      )
      const peakLoss = PEAK_LOSS_BY_SCORE[Math.min(5, Math.max(0, Math.round(initScore)))] ?? 0.40

      // resolvedAt: the date this episode was closed (score dropped to 0).
      // After this date the item contributes zero loss, regardless of the decay curve.
      const resolvedAt = item.lastResolvedDate ? new Date(item.lastResolvedDate) : null

      return {
        _start: start,
        _category: classifyItem(item),
        _label: OC_KEY_META[item.key]?.label || item.key,
        _halfLifeHours: halfLifeHours,
        _peakLoss: peakLoss,
        _episodeCount: item.episodeCount || 0,
        _resolvedAt: resolvedAt,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a._start - b._start)

  if (!datedEntries.length) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Lookback: start from the earliest item startDate, capped at 365 days ago.
  const maxLookback = new Date(today)
  maxLookback.setDate(maxLookback.getDate() - 365)
  const earliest = datedEntries.reduce(
    (min, e) => (e._start < min ? e._start : min),
    today
  )
  const windowStart = earliest > maxLookback ? earliest : maxLookback

  // Forward window: 60 days from today.
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 60)

  const todayIso = today.toISOString().slice(0, 10)
  const series = []

  for (
    let d = new Date(windowStart);
    d <= endDate;
    d.setDate(d.getDate() + 1)
  ) {
    const dIso = d.toISOString().slice(0, 10)
    const isPast = dIso <= todayIso  // true for historical days including today

    const computeLoss = category =>
      datedEntries
        .filter(e => e._category === category)
        .reduce((sum, e) => {
          // Item hasn't started yet on this day.
          if (d < e._start) return sum

          // Item was resolved before this day: contributes zero.
          if (e._resolvedAt && d > e._resolvedAt) return sum

          const ageHours = (d.getTime() - e._start.getTime()) / 3600000
          const residualFloor = e._episodeCount >= 3 ? 0.10 : e._episodeCount >= 2 ? 0.05 : 0.0
          const decayingPortion = (e._peakLoss - residualFloor) * Math.pow(0.5, ageHours / e._halfLifeHours)
          return sum + residualFloor + decayingPortion
        }, 0)

    const acuteLoss   = computeLoss("acute")
    const diseaseLoss = computeLoss("disease")
    const fatigueLoss = computeLoss("fatigue")

    const totalMultiplier =
      Math.max(0, 1 - acuteLoss) *
      Math.max(0, 1 - diseaseLoss) *
      Math.max(0, 1 - fatigueLoss)

    const breakdown = datedEntries
      .map(e => {
        if (d < e._start) return null
        if (e._resolvedAt && d > e._resolvedAt) return null
        const ageHours = (d.getTime() - e._start.getTime()) / 3600000
        const loss = e._peakLoss * Math.pow(0.5, ageHours / e._halfLifeHours)
        if (loss < 0.005) return null
        return { label: e._label, lossPct: Number((loss * 100).toFixed(1)) }
      })
      .filter(Boolean)

    series.push({
      date: dIso,
      label: fmtShortDate(dIso),
      isPast,
      acuteLossPct:   Number((acuteLoss   * 100).toFixed(1)),
      diseaseLossPct: Number((diseaseLoss * 100).toFixed(1)),
      fatigueLossPct: Number((fatigueLoss * 100).toFixed(1)),
      operationalPct: Number((totalMultiplier * 100).toFixed(1)),
      breakdown,
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

  // Current estimated BF (today, from regression)
  const currentPt =
    estimatedCurrentBF != null
      ? [{
          date: new Date().toISOString().slice(0, 10),
          label: "Now (est.)",
          dexaBF: null,
          estimatedBF: Number(estimatedCurrentBF.toFixed(1))
        }]
      : []

  // Projected DEXA point: project forward to next planned DEXA date using
  // the same regression slope that drives estimatedCurrentBF.
  const nextDexaDate = LIFT_CONFIG.next_dexa_date  // "2026-09-19"
  const projectedDexaPt = (() => {
    if (!estimatedCurrentBF || !nextDexaDate) return []
    const lastScan = dexaSeries
      .filter(d => d.date && d.pct_fat != null)
      .map(d => ({ date: d.date, val: Number(d.pct_fat) }))
      .filter(d => Number.isFinite(d.val))
      .at(-1)
    if (!lastScan) return []

    // Use LIFT_CONFIG.fat_loss_rate_monthly for forward projection rather than
    // the historical regression slope. The regression slope includes the Jan-Apr
    // KNR period where lean mass gained rapidly, making it too optimistic for the
    // no-KNR Apr-Sep window. This rate should be updated in LIFT_CONFIG when KNR
    // resumes in September.
    const fatLossPerDay = LIFT_CONFIG.fat_loss_rate_monthly / 30.44
    const slopePerDay = -(fatLossPerDay * LIFT_CONFIG.lean_bmc_lb) /
      Math.pow(LIFT_CONFIG.fat_lb + LIFT_CONFIG.lean_bmc_lb, 2)

    const daysToNext = (new Date(nextDexaDate).getTime() - new Date(lastScan.date).getTime()) / 86400000
    const projected = lastScan.val + slopePerDay * daysToNext
    if (!Number.isFinite(projected) || projected < 5 || projected > 60) return []
    return [{
      date: nextDexaDate,
      label: fmtShortDate(nextDexaDate) + " (proj.)",
      dexaBF: null,
      estimatedBF: Number(projected.toFixed(1))
    }]
  })()

  const merged = [...dexaPts, ...currentPt, ...projectedDexaPt]
    .filter(row => row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return merged
}, [dexaSeries, estimatedCurrentBF])

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
const runningReadiness = useMemo(() => {
  return buildRunningReadinessController({
    workouts: operationalWorkouts,
    ocConstraintState,
    mtpCeilingMiles: LIFT_CONFIG.mtp_ceiling_miles ?? 4.0
  })
}, [operationalWorkouts, ocConstraintState])
const displayedTendonStatus = ocConstraintState?.tendon ?? tendonStatus
const ocProgressionReadiness = ocConstraintState?.gate?.progressionReadiness ?? "progress"
const ocProgressionReasons = ocConstraintState?.gate?.progressionReasons ?? []
const currentOcReadiness = Number.isFinite(Number(readinessScore)) ? Number(readinessScore) : null
function getPlannedLongRunAtMonth(hmPlanLongRun, monthsFromNow) {
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + Math.round(monthsFromNow * 30.44))
  const targetMs = targetDate.getTime()

  const keys = Object.keys(hmPlanLongRun).sort()
  if (!keys.length) return null

  const lastKey = keys[keys.length - 1]
  const lastDate = new Date(lastKey)

  // More than 3 weeks past the end of the plan means the race is over.
  // Return null so the chart holds at its peak rather than dropping
  // to the last taper entry.
  if (targetMs > lastDate.getTime() + 21 * 86400000) return null

  // Within the plan window, return the MAXIMUM long run within a ±3-week
  // window around the target date. This prevents the projection from
  // landing on alternating race-week entries (3.1 mi) that sit between
  // peak training weeks and making the curve look flat for months 1-3.
  const windowMs = 21 * 86400000
  let best = null
  for (const k of keys) {
    const diff = Math.abs(new Date(k).getTime() - targetMs)
    if (diff <= windowMs) {
      const val = hmPlanLongRun[k]
      if (best === null || val > best) best = val
    }
  }

  // If nothing found in the window, fall back to nearest entry
  if (best === null) {
    let closestDiff = Infinity
    for (const k of keys) {
      const diff = Math.abs(new Date(k).getTime() - targetMs)
      if (diff < closestDiff) { closestDiff = diff; best = hmPlanLongRun[k] }
    }
  }

  return best
}
const readinessProjectionData = useMemo(() => {
  if (!adaptiveTrainingState?.latestWeek || !runningReadiness) return []

  const latestWeek = adaptiveTrainingState.latestWeek
  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v))
  const mtpCeiling = 4.0
  const mtpNextMilestone = mtpCeiling * 1.1
  const mtpConstrained = mtpCeiling >= 3.5 && mtpCeiling < 6.2
  const buildProjectedCompletionScore = ({ distanceMiles, volumeThresholds, projectedCompletedRunMiles, projectedLongestRunMiles }) => {
    const completedRunMiles = Number.isFinite(Number(projectedCompletedRunMiles))
      ? Number(projectedCompletedRunMiles)
      : Number(runningReadiness.signals?.recentCompletedRunMiles || 0)
    const longestRunMiles = Number.isFinite(Number(projectedLongestRunMiles))
      ? Number(projectedLongestRunMiles)
      : Number(runningReadiness.signals?.recentLongestRunMiles || 0)

    if (completedRunMiles >= distanceMiles) return 100

    const longestRatio = distanceMiles > 0 ? longestRunMiles / distanceMiles : 0
    const longestScore =
      longestRatio >= 0.9 ? 90 :
      longestRatio >= 0.75 ? 75 :
      longestRatio >= 0.6 ? 55 :
      longestRatio >= 0.45 ? 35 :
      15
    const recentRunVolume = Number(runningReadiness.signals?.recentRunVolume || runningReadiness.signals?.weeklyRunMiles28 || 0)
    const volumeScore =
      recentRunVolume >= 18 ? 95 :
      recentRunVolume >= 14 ? 82 :
      recentRunVolume >= 10 ? 65 :
      recentRunVolume >= 7 ? 48 :
      15
    const recentRunFrequency = Number(runningReadiness.signals?.recentRunFrequency || 0)
    const activeWeeks28 = Number(runningReadiness.signals?.activeWeeks28 || 0)
    const consistencyScore =
      activeWeeks28 >= 4 && recentRunFrequency >= 3 ? 95 :
      activeWeeks28 >= 3 && recentRunFrequency >= 2.5 ? 80 :
      activeWeeks28 >= 3 && recentRunFrequency >= 2 ? 65 :
      activeWeeks28 >= 2 && recentRunFrequency >= 1.5 ? 45 :
      activeWeeks28 >= 1 ? 25 :
      10

    return clamp(Math.round(
      longestScore * 0.65 +
      volumeScore * 0.20 +
      consistencyScore * 0.15
    ))
  }
  const acwrPenalty = latestWeek.modifiers?.acwr > 1.5 ? 16 : latestWeek.modifiers?.acwr > 1.3 ? 9 : 0
  const tsbPenalty = latestWeek.modifiers?.tsb < LIFT_CONFIG.tsbHighRiskThreshold ? 14 : latestWeek.modifiers?.tsb < LIFT_CONFIG.tsbModerateRiskThreshold ? 7 : 0
  const ocPenalty = clampNumber((latestWeek.modifiers?.oc || 0) * 2.2, 0, 18)
  const tendonPenalty = clampNumber((adaptiveTrainingState.maxTendonRisk || 0) > 1 ? ((adaptiveTrainingState.maxTendonRisk - 1) * 18) : 0, 0, 18)
  const absorbPenalty = clampNumber((1 - (adaptiveTrainingState.absorptionScores?.running || 0.7)) * 22, 0, 15)
  const effectiveProgress = clampNumber(
    ((latestWeek.capital?.running || 0) * 0.34) +
    ((latestWeek.capital?.cardio || 0) * 0.1) +
    ((adaptiveTrainingState.complianceScores?.running || 0) * 28) -
    acwrPenalty - tsbPenalty - ocPenalty - tendonPenalty - absorbPenalty,
    0,
    100
  )
  const runSpecificNow = clampNumber(
    (runningReadiness.completionReadiness?.fiveK || 0) * 0.28 +
    (runningReadiness.completionReadiness?.tenK || 0) * 0.18 +
    effectiveProgress * 0.32 +
    ((adaptiveTrainingState.capitals?.tendon || 0) * 0.12) +
    ((adaptiveTrainingState.absorptionScores?.running || 0) * 100 * 0.1),
    0,
    100
  )
  // Long-term structural gain rate — not affected by temporary OC state.
  // This is what the 6–12 month projection should reflect once the MTP resolves.
  const monthlyGainLongTerm = clampNumber(
    ((adaptiveTrainingState.complianceScores?.running || 0.6) * 4.5) +
    ((adaptiveTrainingState.absorptionScores?.running || 0.65) * 3.5) +
    ((adaptiveTrainingState.complianceScores?.tendon || 0.5) * 2.5) -
    (adaptiveTrainingState.maxTendonRisk > 1 ? (adaptiveTrainingState.maxTendonRisk - 1) * 5 : 0) -
    (latestWeek.modifiers?.acwr > 1.3 ? 2.5 : 0),
    -4,
    6
  )
  // Near-term adjustment reflects current OC gate — blends out over ~2.5 months.
  const monthlyGainNearTerm =
    ocProgressionReadiness === "deload" ? -3.5 :
    ocProgressionReadiness === "hold" ? -0.75 :
    monthlyGainLongTerm

  const series = []
  for (let month = 0; month <= 12; month += 1) {
    const plannedLR = month === 0 ? runningReadiness.signals?.recentLongestRunMiles : getPlannedLongRunAtMonth(HM_PLAN_LONG_RUN, month)
    const projectedTenKCompletedMiles = month === 0 && mtpConstrained
      ? Math.min(mtpNextMilestone, 6.2137)
      : undefined
    const projectedTenKLongestMiles = month === 0 && mtpConstrained
      ? mtpCeiling
      : undefined
    const projectedTenKCompletion = month === 0
      ? buildProjectedCompletionScore({
        distanceMiles: 6.2137,
        volumeThresholds: [
          [18, 95],
          [14, 82],
          [10, 65],
          [7, 48]
        ],
        projectedCompletedRunMiles: projectedTenKCompletedMiles,
        projectedLongestRunMiles: projectedTenKLongestMiles,
      })
      : null
    // Blend from near-term (current OC state) toward long-term (structural) over 2.5 months.
    // Deload/hold is a temporary signal; it should not suppress the 12-month projection permanently.
    const blendFactor = month <= 1 ? 1 : Math.max(0, 1 - (month - 1) / 2.5)
    const blendedMonthlyGain = monthlyGainNearTerm * blendFactor + monthlyGainLongTerm * (1 - blendFactor)
    const monthGain = blendedMonthlyGain * (1 - Math.exp(-month / 3.5)) * 4
    const baseReadiness = clampNumber(runSpecificNow + monthGain, 0, 100)
    const lrBonus = plannedLR != null ? Math.min(18, plannedLR * 1.5) : 0
    const tendonCap = adaptiveTrainingState.capitals?.tendon || 0
    const eventBase = clampNumber(baseReadiness + (tendonCap * 0.08) + lrBonus * 0.25, 0, 100)
    const fiveK = clampNumber(eventBase + 10, 0, 100)
    const tenK = clampNumber(
      month === 0 && Number.isFinite(projectedTenKCompletion)
        ? Math.max(eventBase + (plannedLR >= 5 ? 6 : 0), projectedTenKCompletion)
        : eventBase + (plannedLR >= 5 ? 6 : 0),
      0,
      100
    )
    const half = clampNumber(eventBase - 10 + (plannedLR >= 8 ? 12 : plannedLR >= 6 ? 6 : 0), 0, 100)
    const swimReadiness = clampNumber((adaptiveTrainingState.capitals?.cardio || 0) * 0.75, 0, 100)
    const bikeReadiness = clampNumber(((adaptiveTrainingState.capitals?.cardio || 0) * 0.85) + ((adaptiveTrainingState.complianceScores?.cardio || 0) * 20), 0, 100)
    const runReadiness = clampNumber(baseReadiness, 0, 100)
    const triConfidence = clampNumber(Math.min(swimReadiness, bikeReadiness, runReadiness) / 100, 0.1, adaptiveTrainingState.forecastConfidence || 0.8)
    const triWeightedSum = (swimReadiness * 0.28) + (bikeReadiness * 0.32) + (runReadiness * 0.4)
    const tri = clampNumber((0.6 * Math.min(swimReadiness, bikeReadiness, runReadiness)) + (0.4 * triWeightedSum * triConfidence), 0, 100)
    series.push({
      month,
      label: month === 0 ? "Now" : `${month}M`,
      baseReadiness: Number(baseReadiness.toFixed(1)),
      fiveK: Number(fiveK.toFixed(1)),
      tenK: Number(tenK.toFixed(1)),
      half: Number(half.toFixed(1)),
      tri: Number(tri.toFixed(1)),
      swimReadiness: Number(swimReadiness.toFixed(1)),
      bikeReadiness: Number(bikeReadiness.toFixed(1)),
      runReadiness: Number(runReadiness.toFixed(1)),
      confidence: Number((adaptiveTrainingState.forecastConfidence || 0.4).toFixed(2)),
      triConfidence: Number(triConfidence.toFixed(2)),
      effectiveProgress: Number(effectiveProgress.toFixed(1))
    })
  }

  return series
}, [adaptiveTrainingState, runningReadiness, ocProgressionReadiness])
const forecastReadinessCards = useMemo(() => {
  const byMonth = new Map(readinessProjectionData.map(row => [row.month, row.baseReadiness]))
  return [
    { label: "Now", value: byMonth.get(0) ?? enduranceForecast.readinessNow },
    { label: "1 month", value: byMonth.get(1) ?? enduranceForecast.readiness1m },
    { label: "3 months", value: byMonth.get(3) ?? enduranceForecast.readiness3m },
    { label: "6 months", value: byMonth.get(6) ?? enduranceForecast.readiness6m },
    { label: "12 months", value: byMonth.get(12) ?? enduranceForecast.readiness12m }
  ]
}, [readinessProjectionData, enduranceForecast])
const readinessChartsReady =
  baseDataLoaded &&
  readinessInputsHydrated &&
  readinessRemoteInputsHydrated
const showDeveloperPanels = false
const showAuthDebug = useMemo(() => {
  try {
    return new URLSearchParams(window.location.search).get("debugAuth") === "1"
  } catch {
    return false
  }
}, [])
const showLiveStateDebug = useMemo(() => {
  try {
    return new URLSearchParams(window.location.search).get("debugLiveState") === "1"
  } catch {
    return false
  }
}, [])
const readinessDebugData = useMemo(() => {
  const now = Date.now()
  const cutoff = now - 30 * 24 * 3600000
  const workouts = Array.isArray(operationalWorkouts) ? operationalWorkouts : []
  const recentWorkouts = workouts.filter(w => {
    const rawDate = w?.dateTime || w?.date || w?.start_date || null
    const ts = rawDate ? new Date(rawDate).getTime() : NaN
    return Number.isFinite(ts) && ts >= cutoff
  })
  const recentCyclingCount = recentWorkouts.filter(w => normalizeWorkoutType(w.type, w) === "Cycling").length
  return {
    operationalWorkoutsTotal: workouts.length,
    operationalWorkoutsLast30d: recentWorkouts.length,
    cyclingWorkoutsLast30d: recentCyclingCount,
    normalizedActiveWorkouts: Array.isArray(normalizedActiveWorkouts) ? normalizedActiveWorkouts.length : 0,
    normalizedStoredWorkouts: Array.isArray(normalizedStoredWorkouts) ? normalizedStoredWorkouts.length : 0,
    computedTsb: computedTSBFromSessions?.tsb ?? null,
    healthFitTsb: latestHealthFit?.tsb ?? null,
    readinessTsbUsed: latestReadinessTsb,
    readinessInputsHydrated,
    readinessRemoteInputsHydrated,
    readinessChartsReady,
    latestOperationalWorkouts: workouts.slice(-5).reverse().map(w => ({
      date: String(w?.dateTime || w?.date || w?.start_date || "").slice(0, 10) || "—",
      category: normalizeWorkoutType(w.type, w) || "Other"
    }))
  }
}, [
  operationalWorkouts,
  normalizedActiveWorkouts,
  normalizedStoredWorkouts,
  computedTSBFromSessions,
  latestHealthFit,
  latestReadinessTsb,
  readinessInputsHydrated,
  readinessRemoteInputsHydrated,
  readinessChartsReady
])
const liveStateDebugData = useMemo(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = today.toISOString().slice(0, 10)
  const weekStart = new Date(today)
  const day = weekStart.getDay()
  const diff = day === 0 ? -6 : 1 - day
  weekStart.setDate(weekStart.getDate() + diff)
  weekStart.setHours(0, 0, 0, 0)
  const currentWeekKey = weekStart.toISOString().slice(0, 10)

  const recentSleep = (Array.isArray(sleepRecords) ? sleepRecords : [])
    .map(record => {
      const sleepDate = getSleepRecordDate(record)
      return sleepDate ? { ...record, date: sleepDate } : null
    })
    .filter(Boolean)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 10)

  const todaysOperationalWorkouts = (Array.isArray(operationalWorkouts) ? operationalWorkouts : [])
    .filter(workout => getWorkoutLikeDateKey(workout) === todayKey)
    .map(workout => ({
      type: workout?.type ?? workout?.canonical_type ?? null,
      category: workout?.category ?? null,
      date: workout?.date ?? null,
      dateTime: workout?.dateTime ?? null,
      start_date: workout?.start_date ?? null,
      distance: workout?.distance ?? null,
      distance_unit: workout?.distance_unit ?? workout?.unit ?? null,
      preferred_metrics_distance: workout?.preferred_metrics?.distance ?? null,
      sources_apple_distance: workout?.sources?.apple?.distance ?? null,
      sources_technogym_distance: workout?.sources?.technogym?.distance ?? null,
      dur: workout?.dur ?? workout?.duration_min ?? null,
    }))

  const todayTsbRow =
    tsbV2Panel?.rows?.find(row => row.date === todayKey) ||
    tsbV2Panel?.rows?.[tsbV2Panel.rows.length - 1] ||
    null

  return {
    todayKey,
    sleepRecordsLength: Array.isArray(sleepRecords) ? sleepRecords.length : 0,
    recentSleepRecords: recentSleep,
    todaysOperationalWorkouts,
    currentWeekTrainingBucket:
      weeklyTrainingBuckets?.find(bucket => bucket.weekStart === currentWeekKey) ||
      weeklyTrainingBuckets?.[weeklyTrainingBuckets.length - 1] ||
      null,
    todayTsbRow,
  }
}, [sleepRecords, operationalWorkouts, weeklyTrainingBuckets, tsbV2Panel])
useEffect(() => {
  if (!showLiveStateDebug) return
  console.log("[LIFT DEBUG] Live app state", liveStateDebugData)
}, [showLiveStateDebug, liveStateDebugData])
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
    thresholdDate: (() => {
      const month = findReadyMonth(d.key)
      if (month == null) return null
      return addDaysLocalIso(new Date(), month * 30.44)
    })(),
    targetPct
  }))
}, [readinessProjectionData])
const targetableRaces = useMemo(() => {
  const safeEventReadinessMarkers = Array.isArray(eventReadinessMarkers) ? eventReadinessMarkers : []
  const safeRaceCalendar = Array.isArray(RACE_CALENDAR) ? RACE_CALENDAR : []
  const thresholds = Object.fromEntries(safeEventReadinessMarkers.map(marker => [marker.key, marker.thresholdDate]))
  const ranked = safeRaceCalendar
    .map(race => {
      const type = getRaceDistanceType(race)
      const thresholdDate =
        type === "fiveK" ? thresholds.fiveK :
        type === "tenK" ? thresholds.tenK :
        type === "half" ? thresholds.half :
        null
      if (!thresholdDate) return null
      if (!passesRaceGeographyPolicy(race, type)) return null
      if (race.date < thresholdDate) return null
      const thresholdMs = new Date(`${thresholdDate}T12:00:00`).getTime()
      const raceMs = new Date(`${race.date}T12:00:00`).getTime()
      const bufferDays = Math.round((raceMs - thresholdMs) / 86400000)
      return {
        ...race,
        type,
        thresholdDate,
        bufferDays
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.bufferDays - b.bufferDays) || String(a.date).localeCompare(String(b.date)))
  return ranked
}, [eventReadinessMarkers])
const targetableRaceMarkers = useMemo(() => {
  const safeTargetableRaces = Array.isArray(targetableRaces) ? targetableRaces : []
  return safeTargetableRaces.slice(0, 8).map(race => {
    const month = monthsUntilLocalDate(race.date)
    return { ...race, month }
  })
}, [targetableRaces])
const readinessConfidenceSummary = useMemo(() => {
  const latest = readinessProjectionData?.[0] || readinessProjectionData?.[readinessProjectionData.length - 1] || null
  return {
    readinessConfidence: Number((adaptiveTrainingState?.forecastConfidence || 0).toFixed(2)),
    recommendationConfidence: Number(clampNumber((adaptiveTrainingState?.forecastConfidence || 0) * (adaptiveTrainingState?.complianceScores?.running || 0), 0, 1).toFixed(2)),
    triConfidence: Number((latest?.triConfidence || 0).toFixed(2))
  }
}, [adaptiveTrainingState, readinessProjectionData])
const safeAdaptiveFeedback = Array.isArray(adaptiveTrainingState?.feedback) ? adaptiveTrainingState.feedback : []
const safeTendonAlerts = Array.isArray(adaptiveTrainingState?.tendonAlerts) ? adaptiveTrainingState.tendonAlerts : []
const safeWeeklyRows = Array.isArray(adaptiveTrainingState?.weeklyRows) ? adaptiveTrainingState.weeklyRows : []
const safeTendonSeries = Array.isArray(adaptiveTrainingState?.tendonSeries?.[selectedTendonGroup]) ? adaptiveTrainingState.tendonSeries[selectedTendonGroup] : []
const safeEventReadinessMarkers = Array.isArray(eventReadinessMarkers) ? eventReadinessMarkers : []
const safeTargetableRaces = Array.isArray(targetableRaces) ? targetableRaces : []
const safeTargetableRaceMarkers = Array.isArray(targetableRaceMarkers) ? targetableRaceMarkers : []
const currentTendonSnapshot = adaptiveTrainingState?.latestWeek?.tendon?.[selectedTendonGroup] || null
const tendonPlotCeiling = useMemo(() => {
  const values = safeTendonSeries.flatMap(row => [Number(row?.capacity), Number(row?.load)])
    .filter(Number.isFinite)
  return values.length ? Math.max(...values) * 1.15 : 1.5
}, [safeTendonSeries])
const complianceOverviewRows = useMemo(() => {
  const recentRows = safeWeeklyRows.slice(-8)
  return ["running", "tendon", "strength", "cardio"].map(domain => {
    const planned = recentRows.reduce((sum, row) => sum + Number(row.domains?.[domain]?.plannedDose || 0), 0)
    const completed = recentRows.reduce((sum, row) => sum + Number(row.domains?.[domain]?.completedDose || 0), 0)
    const absorbed = recentRows.reduce((sum, row) => sum + Number(row.domains?.[domain]?.absorbedDose || 0), 0)
    const compliance = Number(adaptiveTrainingState?.complianceScores?.[domain] || 0)
    const absorption = Number(adaptiveTrainingState?.absorptionScores?.[domain] || 0)
    return {
      domain,
      planned: Math.round(planned),
      completed: Math.round(completed),
      absorbed: Math.round(absorbed),
      compliancePct: Math.round(compliance * 100),
      absorptionPct: Math.round(absorption * 100)
    }
  })
}, [safeWeeklyRows, adaptiveTrainingState])
const complianceValueFontSize = useMemo(() => {
  const values = complianceOverviewRows.flatMap(row => [
    row.planned,
    row.completed,
    row.absorbed,
    `${row.compliancePct} / ${row.absorptionPct}`
  ]).map(value => String(value))
  const longestValueLength = values.reduce((max, value) => Math.max(max, value.length), 1)
  const isCompactViewport = typeof window !== "undefined" ? window.innerWidth < 768 : true
  const maxFont = isCompactViewport ? 18 : 22
  const minFont = isCompactViewport ? 11 : 13
  const penaltyPerChar = isCompactViewport ? 1.25 : 1.5

  return Math.max(minFont, Math.min(maxFont, maxFont - Math.max(0, longestValueLength - 3) * penaltyPerChar))
}, [complianceOverviewRows])
const trainingCapitalChartData = useMemo(() => {
  return safeWeeklyRows.slice(-12).map(row => ({
    label: row.label,
    runCapital: row.capital?.running || 0,
    tendonCapital: row.capital?.tendon || 0,
    strengthCapital: row.capital?.strength || 0,
    cardioCapital: row.capital?.cardio || 0,
  }))
}, [safeWeeklyRows])
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

  // Bridge point: last known smoothed weight plotted at today so the
  // projected line starts exactly where the actual line ends.
  const lastActual = actuals.length ? actuals[actuals.length - 1] : null
  const bridgeWeight = lastActual?.actual ?? bodyForecast.currentWeight
  const bridge = {
    label: fmtShortDate(today.toISOString().slice(0, 10)),
    actual: null,
    forecast: Number(bridgeWeight.toFixed(1)),
    phase1: bodyForecast.phase1TargetWeight,
    target: bodyForecast.finalTargetWeight
  }

  const projected = [
    bridge,
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
  const now = new Date()
  const days = selectedRangePoints ?? 90
  const actualByDate = {}
  filteredNutrition.forEach(r => { const d = String(r.date || '').slice(0,10); if (d) actualByDate[d] = r })
  const rows = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0,10)
    const actual = actualByDate[dateStr]
    if (actual) {
      rows.push({ ...actual, label: dateStr.slice(5), target: calorieTarget.targetCalories, isTemplate: false })
    } else if (templateTotals.calories > 0) {
      rows.push({ date: dateStr, label: dateStr.slice(5), calories: templateTotals.calories,
        protein_g: templateTotals.protein_g, carbs_g: templateTotals.carbs_g, fat_g: templateTotals.fat_g,
        target: calorieTarget.targetCalories, isTemplate: true })
    }
  }
  return rows
}, [filteredNutrition, calorieTarget, templateTotals, selectedRangePoints])
const overviewCaloriesDomain = useMemo(() => {
  const vals = calorieChartData
    .flatMap(row => [Number(row.calories), Number(row.target), Number(row.calories_7d)])
    .filter(v => Number.isFinite(v) && v > 0)

  if (!vals.length) return [1200, 3000]

  const upper = Math.max(3000, Math.ceil(Math.max(...vals) / 250) * 250)
  return [1200, upper]
}, [calorieChartData])

const tsbOverviewData = useMemo(() => {
  const arr = Array.isArray(healthFitDaily) ? healthFitDaily : []
  const filtered = selectedRangePoints == null ? arr : arr.filter(r => {
    if (!r.date) return false
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - selectedRangePoints)
    cutoff.setHours(0, 0, 0, 0)
    return new Date(r.date + "T12:00:00") >= cutoff
  })
  return filtered
    .filter(r => r.ctl != null || r.atl != null || r.tsb != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({
      label: String(r.date).slice(5),
      ctl:  r.ctl  != null ? Number(r.ctl)  : null,
      atl:  r.atl  != null ? Number(r.atl)  : null,
      tsb:  r.tsb  != null ? Number(r.tsb)  : null,
    }))
}, [healthFitDaily, selectedRangePoints])
const acwrOverviewData = useMemo(() => {
  const arr = Array.isArray(acwrSeries) ? acwrSeries : []
  if (selectedRangePoints == null) return arr

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - selectedRangePoints)
  cutoff.setHours(0, 0, 0, 0)

  return arr.filter(row => row.date && new Date(`${row.date}T12:00:00`) >= cutoff)
}, [acwrSeries, selectedRangePoints])
const acwrOverviewDomain = useMemo(() => {
  const vals = acwrOverviewData
    .map(row => Number(row?.acwr))
    .filter(Number.isFinite)

  if (!vals.length) return [0, 2]

  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  const lower = Math.max(0, Math.floor((Math.min(0.8, minVal) - 0.1) * 10) / 10)
  const upper = Math.max(1.6, Math.ceil((maxVal + 0.15) * 10) / 10)
  return [lower, upper]
}, [acwrOverviewData])
const toggleOverviewExplain = (key) => {
  setOverviewExplainOpen(prev => ({ ...prev, [key]: !prev[key] }))
}
const isOverviewExplainOpen = (key) => Boolean(overviewExplainOpen[key])
const renderOverviewExplainBody = (config) => (
  <div style={{ display: "grid", gap: 8, fontSize: 12, lineHeight: 1.5, color: "#cbd5e1" }}>
    <div><span style={{ color: "#94a3b8" }}>Shows:</span> {config.shows}</div>
    <div><span style={{ color: "#94a3b8" }}>Derived:</span> {config.derived}</div>
    <div><span style={{ color: "#94a3b8" }}>Interpret:</span> {config.interpret}</div>
    <div><span style={{ color: "#94a3b8" }}>Action:</span> {config.action}</div>
  </div>
)
const overviewExplainButton = (key) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation()
      toggleOverviewExplain(key)
    }}
    aria-label={isOverviewExplainOpen(key) ? "Show chart" : "Show explanation"}
    style={{
      width: 22,
      height: 22,
      borderRadius: 999,
      border: "1px solid #2a2d45",
      background: isOverviewExplainOpen(key) ? "#252640" : "#0d0e1c",
      color: "#cbd5e1",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      flex: "0 0 auto"
    }}
  >
    {isOverviewExplainOpen(key) ? "×" : "i"}
  </button>
)
  const trainerLogMtp = React.useCallback(async (score) => {
    const nowIso = new Date().toISOString()
    const MTP_KEY = "jointStatus"
    const MTP_LOCATION = "Toe L"
    const existingMtp = ocItems.find(i => i.key === MTP_KEY && (i.location || "").toLowerCase().includes("toe"))
    let updated
    if (score === 0) {
      // Explicit zero check — same shape as logMtpZeroCheck in TabOperationalCapacity
      const item = {
        id: Date.now(),
        key: MTP_KEY,
        location: MTP_LOCATION,
        label: `Joint — ${MTP_LOCATION}`,
        currentScore: 0,
        initialScore: 0,
        startDate: nowIso,
        halfLifeHours: LIFT_CONFIG.ocHalfLifeOverrides?.["MTP joint"] || 840,
        episodeCount: existingMtp ? (existingMtp.episodeCount || 0) : 0,
        lastResolvedDate: nowIso,
        chronicity: existingMtp?.chronicity || "acute",
        eventType: "explicit_zero_check"
      }
      updated = [item, ...ocItems.filter(i => !(i.key === MTP_KEY && (i.location || "").toLowerCase().includes("toe")))]
    } else {
      // Non-zero score — add or update existing MTP item
      if (existingMtp) {
        updated = ocItems.map(i =>
          i.key === MTP_KEY && (i.location || "").toLowerCase().includes("toe")
            ? { ...i, currentScore: score, startDate: nowIso }
            : i
        )
      } else {
        const item = {
          id: Date.now(),
          key: MTP_KEY,
          location: MTP_LOCATION,
          label: `Joint — ${MTP_LOCATION}`,
          currentScore: score,
          initialScore: score,
          startDate: nowIso,
          halfLifeHours: LIFT_CONFIG.ocHalfLifeOverrides?.["MTP joint"] || 840,
          episodeCount: 0,
          lastResolvedDate: null,
          chronicity: "acute"
        }
        updated = [item, ...ocItems]
      }
    }
    setOcItems(updated)
    try {
      await store.set("oc-items", updated)
      if (supabase && session?.user?.id) {
        await supabase.from("user_kv").upsert(
          { user_id: session.user.id, key: "oc-items", value: updated, updated_at: nowIso },
          { onConflict: "user_id,key" }
        )
      }
    } catch (e) {
      console.warn("[Trainer] MTP save error", e)
    }
  }, [ocItems, setOcItems, session, supabase, LIFT_CONFIG])

  const trainerLogWeight = React.useCallback(async (weight_lb) => {
    const nowIso = new Date().toISOString()
    const today = nowIso.slice(0, 10)
    const entry = {
      biometric_id: `trainer_weight_${Date.now()}`,
      id: `trainer_weight_${Date.now()}`,
      source: "trainer",
      timestamp: nowIso,
      date: today,
      weight_lb,
      body_fat_pct: null,
      bmi: null
    }
    const existing = JSON.parse(localStorage.getItem("lift_biometric_records") || "[]")
    const merged = [...existing.filter(r => r.date !== today || r.source !== "trainer"), entry]
      .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")))
    localStorage.setItem("lift_biometric_records", JSON.stringify(merged))
    setBiometricRecords(merged)
    try {
      if (supabase && session?.user?.id) {
        await upsertBiometricRecords(supabase, session.user.id, merged)
        // Also write to user_kv so cross-device hydration picks it up
        await supabase.from("user_kv").upsert(
          { user_id: session.user.id, key: "lift_biometric_records", value: merged, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        )
      }
    } catch (e) {
      console.warn("[Trainer] Weight save error", e)
    }
  }, [setBiometricRecords, session, supabase])

  const trainerLogMeal = React.useCallback(async (mealRecord) => {
    const existing = JSON.parse(localStorage.getItem("lift_meal_records") || "[]")
    const merged = [...existing.filter(r => r.meal_id !== mealRecord.meal_id), mealRecord]
      .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")))
    localStorage.setItem("lift_meal_records", JSON.stringify(merged))
    setMealRecords(merged)
    try {
      if (supabase && session?.user?.id) {
        await supabase.from("user_kv").upsert(
          { user_id: session.user.id, key: "lift_meal_records", value: merged, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        )
      }
    } catch (e) { console.warn("[Trainer] Meal save error", e) }
  }, [setMealRecords, session, supabase])

  const trainerLogExercise = React.useCallback(async (exerciseName, day) => {
    const newEx = {
      id: `custom_${Date.now()}`,
      n: exerciseName.trim(),
      sets: "3",
      reps: "10",
      load: "",
      notes: "Added by LIFT Trainer"
    }
    try {
      const existing = await store.get("wt-custom-exercises") || {}
      const dayExercises = Array.isArray(existing[day]) ? existing[day] : []
      const updated = { ...existing, [day]: [...dayExercises, newEx] }
      await store.set("wt-custom-exercises", updated)
      if (supabase && session?.user?.id) {
        await supabase.from("user_kv").upsert(
          { user_id: session.user.id, key: "wt-custom-exercises", value: updated, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        )
      }
    } catch (e) {
      console.warn("[Trainer] Exercise log error", e)
    }
  }, [session, supabase])

  const trainerLogRun = React.useCallback(async ({ dist, dur, score, notes }) => {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10)
    const day = DAY_KEYS_BY_JS_DAY[today.getDay()]

    // Build a minimal cardio-only schedule log entry for today
    const cardioEntry = {
      modality: "run",
      duration: dur != null ? String(dur) : "",
      distance: dist != null ? String(dist) : "",
      calories: "",
      hr: "",
      notes: notes || ""
    }

    const logEntry = {
      id: `trainer_run_${Date.now()}`,
      session_id: `trainer_${Date.now()}`,
      logged_at: today.toISOString(),
      date: dateStr,
      day,
      dayLabel: day,
      venue: "trainer",
      venue_label: "Logged via Trainer",
      program: "Trainer",
      rpe: null,
      exercises: [],
      tendon_work: [],
      cardio: [cardioEntry],
      stretch_completed: false,
      warmup_completed: false,
      source: "LIFT Trainer"
    }

    try {
      // Append to wt-log without displacing any existing manual entry for today
      const existing = await store.get("wt-log") || []
      const safeExisting = Array.isArray(existing) ? existing : []
      const updated = [logEntry, ...safeExisting.filter(e => e.id !== logEntry.id)]
      await store.set("wt-log", updated)
      if (supabase && session?.user?.id) {
        await supabase.from("user_kv").upsert(
          { user_id: session.user.id, key: "wt-log", value: updated, updated_at: today.toISOString() },
          { onConflict: "user_id,key" }
        )
      }
    } catch (e) {
      console.warn("[Trainer] Run log error", e)
    }

    // If MTP score was included, also write OC check-in
    if (score != null && Number.isFinite(score) && score >= 0 && score <= 3) {
      await trainerLogMtp(score)
    }
  }, [trainerLogMtp, session, supabase])

const trainerSessions60 = React.useMemo(() => {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60); cutoff.setHours(0,0,0,0)
  return (canonicalSessions || [])
    .filter(s => { const d = new Date(s.start_date || s.date || ""); return !isNaN(d) && d >= cutoff })
    .sort((a, b) => (b.start_date || b.date || "").localeCompare(a.start_date || a.date || ""))
}, [canonicalSessions])

return (
  <>
  <ErrorBoundary>
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
  <div style={{ fontSize: 11, opacity: 0.4 }}>Build check: Apr 29 2026</div>
  <div style={{ fontSize: "11px", opacity: 0.85, marginBottom: "4px" }}>
    Longitudinal Integrated Fitness Tracker
  </div>
  {!hydrated && <div style={{ fontSize: "12px", opacity: 0.8 }}>Loading synced data...</div>}
</div>

        <div style={{ ...cardStyle(), minWidth: "0", flex: "1 1 280px", maxWidth: "420px" }}>
          <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Sync</div>
          {recoveryStatus === "ready" ? (
            <>
              <div style={{ fontSize: "14px", marginBottom: "10px" }}>
                {session ? (
                  <>
                    Signed in as <span style={{ color: "#4a9ee8" }}>{session.user.email}</span>
                  </>
                ) : (
                  "Complete password recovery"
                )}
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    fontSize: "12px",
                    color: "#fcd34d",
                    lineHeight: 1.5
                  }}
                >
                  Password recovery detected. Set a new password to complete recovery.
                </div>
                <input
                  type="password"
                  value={recoveryPassword}
                  onChange={e => setRecoveryPassword(e.target.value)}
                  placeholder="new password"
                  autoComplete="new-password"
                  style={inputStyle()}
                />
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={completePasswordRecovery} style={buttonStyle(true)}>Set new password</button>
                  {session && (
                    <button
                      onClick={doSignOut}
                      disabled={signOutPending}
                      style={signOutPending ? { ...buttonStyle(false), opacity: 0.6, cursor: "default" } : buttonStyle(false)}
                    >
                      {signOutPending ? "Signing out..." : "Sign out"}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : recoveryStatus === "expired" ? (
            <>
              {session && (
                <div style={{ fontSize: "14px", marginBottom: "10px" }}>
                  Signed in as <span style={{ color: "#4a9ee8" }}>{session.user.email}</span>
                </div>
              )}
              <div style={{ display: "grid", gap: "8px" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    fontSize: "12px",
                    color: "#fca5a5",
                    lineHeight: 1.5
                  }}
                >
                  Recovery link expired, request a new one.
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={sendPasswordRecovery} style={buttonStyle(true)}>Request new recovery link</button>
                </div>
              </div>
            </>
          ) : session ? (
            <>
              <div style={{ fontSize: "14px", marginBottom: "10px" }}>
                Signed in as <span style={{ color: "#4a9ee8" }}>{session.user.email}</span>
              </div>
              <button
                onClick={doSignOut}
                disabled={signOutPending}
                style={signOutPending ? { ...buttonStyle(false), opacity: 0.6, cursor: "default" } : buttonStyle(false)}
              >
                {signOutPending ? "Signing out..." : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: "13px", opacity: 0.8, marginBottom: "8px" }}>
                Sign in with email and password to keep sync stable across phone, desktop, and Home Screen launches.
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {isRecoveryMode && (
                  <div style={{ padding: "10px 12px", borderRadius: 8, background: recoveryStatus === "expired" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", border: recoveryStatus === "expired" ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(245,158,11,0.3)", fontSize: "12px", color: recoveryStatus === "expired" ? "#fca5a5" : "#fcd34d", lineHeight: 1.5 }}>
                    {recoveryStatus === "ready"
                      ? "Password recovery detected. Set a new password to complete recovery."
                      : recoveryStatus === "expired"
                        ? "Recovery link expired, request a new one."
                        : "Checking recovery link..."}
                  </div>
                )}
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email"
                  autoComplete="email"
                  inputMode="email"
                  style={inputStyle()}
                />
                {!isRecoveryMode && (
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="password"
                    autoComplete="current-password"
                    style={inputStyle()}
                  />
                )}
                {recoveryStatus === "ready" && (
                  <>
                    <input
                      type="password"
                      value={recoveryPassword}
                      onChange={e => setRecoveryPassword(e.target.value)}
                      placeholder="new password"
                      autoComplete="new-password"
                      style={inputStyle()}
                    />
                  </>
                )}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {recoveryStatus === "ready" ? (
                    <button onClick={completePasswordRecovery} style={buttonStyle(true)}>Set new password</button>
                  ) : recoveryStatus === "expired" ? (
                    <button onClick={sendPasswordRecovery} style={buttonStyle(true)}>Request new recovery link</button>
                  ) : recoveryStatus === "verifying" ? (
                    <button disabled style={{ ...buttonStyle(false), opacity: 0.6, cursor: "default" }}>Checking link</button>
                  ) : (
                    <>
                      <button onClick={signInWithPassword} style={buttonStyle(true)}>Sign in</button>
                      <button onClick={sendPasswordRecovery} style={buttonStyle(false)}>Reset password</button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {authMsg && <div style={{ marginTop: "8px", fontSize: "12px", color: "#ffd166" }}>{authMsg}</div>}
          {!supabase && <div style={{ marginTop: "8px", fontSize: "12px", color: "#ff8a8a" }}>Supabase env vars not found. Sync is disabled.</div>}
          {showAuthDebug && (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #1a1b2e", fontSize: "11px", lineHeight: 1.5 }}>
              <div style={{ opacity: 0.7, marginBottom: "6px" }}>Auth Debug</div>
              <div>session exists: {String(Boolean(session))}</div>
              <div>current user email: {session?.user?.email || "none"}</div>
              <div>restored from storage on load: {String(sessionRestoredFromStorage)}</div>
              <div>auth initialized: {String(authInitialized)}</div>
              <div>recovery mode: {String(isRecoveryMode)}</div>
              <div>recovery status: {recoveryStatus}</div>
              <div>redirect parse: {authRedirectDebug.summary}</div>
              <div style={{ marginTop: "6px", opacity: 0.7 }}>auth events</div>
              <div style={{ display: "grid", gap: "4px", marginTop: "4px", maxHeight: "100px", overflowY: "auto" }}>
                {authEvents.length ? authEvents.slice().reverse().map(eventLine => (
                  <div key={eventLine} style={{ fontFamily: "monospace", fontSize: "10px", opacity: 0.85 }}>
                    {eventLine}
                  </div>
                )) : (
                  <div style={{ opacity: 0.6 }}>No auth events yet.</div>
                )}
              </div>
            </div>
          )}
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
    {(() => {
      const rd = computeReadinessDetail(ocItems, sleepRecords, healthFitDaily, computedTSBFromSessions?.tsb ?? null)
      const latestAcwr = acwrSeries.length ? acwrSeries[acwrSeries.length - 1]?.acwr ?? null : null
      const tsbNow = tsbV2Panel?.currentOverallTsb ?? computedTSBFromSessions?.tsb ?? computedTSB?.global?.tsb ?? null
      const mtpItem = ocItems.find(i => (i.location || "").toLowerCase().includes("toe"))

      let message = ""
      let color = "#4ade80"

      if (rd.score < 60) {
        message = `Readiness is low (${rd.score}/100). `
        if (rd.injuryPenalty > 0) message += `Active injury penalty: ${rd.injuryPenalty} pts. `
        if (rd.sleepPenalty > 0) message += `Sleep deficit penalty: ${rd.sleepPenalty} pts. `
        if (rd.tsbPenalty > 0) message += `Fatigue penalty: ${rd.tsbPenalty} pts. `
        message += "Consider substituting today's session with easy aerobic work."
        color = "#ef4444"
      } else if (latestAcwr != null && latestAcwr > 1.3) {
        message = `ACWR is ${latestAcwr.toFixed(2)} — workload is rising faster than your fitness base can absorb. Avoid adding volume this week.`
        color = latestAcwr > 1.5 ? "#ef4444" : "#f97316"
      } else if (tsbNow != null && tsbNow < LIFT_CONFIG.tsbHighRiskThreshold) {
        message = `TSB is ${tsbNow.toFixed(1)} — acute fatigue is high. Today's priority is recovery, not load.`
        color = "#f97316"
      } else if (mtpItem && mtpItem.currentScore >= 1) {
        message = `MTP score is ${mtpItem.currentScore}. Run progression is paused until 3 consecutive score-0 sessions are logged.`
        color = "#fbbf24"
      } else if (tsbNow != null && tsbNow > 10) {
        message = `Form is positive (TSB ${tsbNow.toFixed(1)}). Good window for a quality session or long run.`
        color = "#4ade80"
      } else {
        message = `Readiness is ${rd.score}/100. Proceed with scheduled session at controlled effort.`
        color = "#4ade80"
      }

      return (
        <div style={{
          padding: "12px 16px",
          marginBottom: 16,
          background: `${color}14`,
          border: `1px solid ${color}44`,
          borderLeft: `4px solid ${color}`,
          borderRadius: 8,
          fontSize: 13,
          color: "#e0e0e0",
          lineHeight: 1.6
        }}>
          {message}
        </div>
      )
    })()}

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
        <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>Tendon Risk Today</div>
        <div style={{ fontSize: "30px", fontWeight: "bold", color: (() => {
          const risk = adaptiveTrainingState?.latestWeek?.tendon?.[selectedTendonGroup]?.risk || 0
          const meta = TENDON_GROUP_META[selectedTendonGroup]
          return risk >= meta.overload ? "#ef4444" : risk >= meta.caution ? "#f59e0b" : "#4ade80"
        })() }}>
          {adaptiveTrainingState?.latestWeek?.tendon?.[selectedTendonGroup]?.risk != null
            ? `${adaptiveTrainingState.latestWeek.tendon[selectedTendonGroup].risk.toFixed(2)}x`
            : "NA"}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>
          {TENDON_GROUP_META[selectedTendonGroup]?.label || "Selected tendon group"} · capacity {adaptiveTrainingState?.latestWeek?.tendon?.[selectedTendonGroup]?.capacity?.toFixed?.(1) ?? "NA"}
        </div>
      </div>

<div
  style={{ ...cardStyle(), minWidth: 0, cursor: "pointer" }}
  onClick={() => toggleOverviewExplain("vo2")}
>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
    <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>VO₂ Sources</div>
    {overviewExplainButton("vo2")}
  </div>
  {isOverviewExplainOpen("vo2") ? (
    renderOverviewExplainBody({
      shows: "The current LIFT aerobic proxy, with compact references to the latest KNR, Apple, and proxy values.",
      derived: "KNR and Apple lines come from stored biometric records. The proxy comes from recent run pace and duration smoothing.",
      interpret: "Treat KNR or lab values as anchors, Apple as a device estimate, and the LIFT value as an internal training proxy rather than an interchangeable VO2 max reading.",
      action: "If the proxy drifts away from KNR or Apple, use it for trend direction only and refresh the anchor with a newer device or test value."
    })
  ) : (
    <>
      <div style={{ fontSize: "30px", fontWeight: "bold" }}>
        {vo2ProxySummary?.latestSmoothed != null ? f1(vo2ProxySummary.latestSmoothed) : "NA"}
      </div>
      <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        LIFT aerobic proxy from recent run pace and duration.
      </div>
      <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {`KNR ${vo2SourceSummary?.labLike?.value != null ? f1(vo2SourceSummary.labLike.value) : "NA"} | Apple ${vo2SourceSummary?.apple?.value != null ? f1(vo2SourceSummary.apple.value) : "NA"} | Proxy ${vo2SourceSummary?.proxy?.value != null ? f1(vo2SourceSummary.proxy.value) : "NA"}`}
      </div>
    </>
  )}
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

    {/* ── Sleep Quality Panel ───────────────────────────────────── */}
    {(() => {
      const TARGET_HOURS = 7.5
      const sleepOverviewModel = buildSleepOverviewModel(sleepRecords, TARGET_HOURS)

      if (sleepOverviewModel.nightsLogged === 0) return null

      const { nights, avgHours, lastNight, lastHours, nightsLogged, nightsAtTarget, readinessImpact } = sleepOverviewModel
      const avgPct = Math.min(100, Math.round((avgHours / TARGET_HOURS) * 100))
      const avgColor = avgHours >= 7 ? "#4ade80" : avgHours >= 6 ? "#fbbf24" : "#ef4444"
      const lastColor = lastHours == null ? "#667" : lastHours >= 7 ? "#4ade80" : lastHours >= 6 ? "#fbbf24" : "#ef4444"

      if (import.meta.env.DEV) {
        console.log("[LIFT DEBUG] sleep widget render cards", {
          avgHours: avgHours == null ? null : Number(avgHours.toFixed(3)),
          nightsLogged,
          lastNight: lastNight ? {
            date: lastNight.date,
            hours: lastHours == null ? null : Number(lastHours.toFixed(3))
          } : null,
          nightsAtTarget,
          readinessImpact
        })
        console.log("[LIFT DEBUG] nightly sleep display values", nights.map(night => ({
          date: night.iso,
          hours: night.hours == null ? null : Number(night.hours.toFixed(3)),
          status: night.status
        })))
        console.log("[LIFT DEBUG] selected last night", lastNight ? {
          date: lastNight.date,
          start: lastNight.start_at || lastNight.start_time || null,
          end: lastNight.end_at || lastNight.end_time || null,
          hours: Number((sleepMinutesForReadiness(lastNight) / 60).toFixed(3))
        } : null)
      }

      return (
        <div style={{ ...cardStyle(), marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: "bold" }}>Sleep (last 7 nights)</div>
            <div style={{ fontSize: "11px", color: "#555" }}>target 7.5h · {nightsLogged} nights logged</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px", marginBottom: "10px" }}>
            <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>7-day avg</div>
              <div style={{ fontSize: "26px", fontWeight: "800", color: avgColor, lineHeight: 1 }}>{avgHours.toFixed(1)}</div>
              <div style={{ fontSize: "10px", color: "#555" }}>hours</div>
            </div>
            <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Last night</div>
              <div style={{ fontSize: "26px", fontWeight: "800", color: lastColor, lineHeight: 1 }}>
                {lastHours != null ? lastHours.toFixed(1) : "—"}
              </div>
              <div style={{ fontSize: "10px", color: "#555" }}>{lastNight?.date ? fmtShortDate(lastNight.date) : ""}</div>
            </div>
            <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Nights at target</div>
              <div style={{ fontSize: "26px", fontWeight: "800", color: "#ced2f0", lineHeight: 1 }}>
                {nightsAtTarget}
              </div>
              <div style={{ fontSize: "10px", color: "#555" }}>of 7</div>
            </div>
            <div style={{ background: "#07080e", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Readiness impact</div>
              <div style={{ fontSize: "26px", fontWeight: "800", color: readinessImpact <= -20 ? "#ef4444" : readinessImpact < 0 ? "#fbbf24" : "#4ade80", lineHeight: 1 }}>
                {readinessImpact}
              </div>
              <div style={{ fontSize: "10px", color: "#555" }}>pts penalty</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
            {nights.map(night => (
              <div key={night.iso} style={{ display: "grid", gap: "4px" }}>
                <div
                  title={night.hours != null ? `${fmtShortDate(night.iso)}: ${night.hours.toFixed(1)}h` : `${fmtShortDate(night.iso)}: no entry`}
                  style={{
                    height: "42px",
                    borderRadius: "8px",
                    background: night.bg,
                    border: `1px solid ${night.border}`,
                    color: night.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: "700"
                  }}
                >
                  {night.hours != null ? night.hours.toFixed(1) : "—"}
                </div>
                <div style={{ fontSize: "10px", color: "#667", textAlign: "center" }}>{night.dayLabel}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "10px", color: "#445", marginTop: "6px" }}>
            {readinessImpact === 0
              ? "Sleep adequate. No penalty applied to readiness."
              : readinessImpact === -10
              ? "Sleep marginally low. 10-point readiness penalty active."
              : "Sleep significantly low. 20-point readiness penalty active. Prioritize recovery."}
          </div>
        </div>
      )
    })()}

    {/* ── Missed Session Alert Banner ──────────────────────────── */}
    {(() => {
      const today = new Date()
      const todayISO8601 = today.toISOString().slice(0, 10)
      const todayDow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][today.getDay()]

      // Training days with expected activity (exclude pure recovery days)
      const TRAINING_DAYS = {
        Mon: { label: "Monday", theme: "Upper Push + Bike", tolerance: 2 },
        Tue: { label: "Tuesday", theme: "KNR Legs + Swim", tolerance: 1 },
        Wed: { label: "Wednesday", theme: "Swim + Row", tolerance: 2 },
        Thu: { label: "Thursday", theme: "KNR Upper + Bike", tolerance: 1 },
        Fri: { label: "Friday", theme: "Hips / Core + Long Bike", tolerance: 2 },
        Sat: { label: "Saturday", theme: "Long Run", tolerance: 1 },
      }

      // Build a set of logged dates from schedLog
      const loggedDates = new Set(
        (Array.isArray(schedLog) ? schedLog : []).map(e => String(e.date || "").slice(0, 10))
      )
      // Also include dates from operationalWorkouts (Apple Health imports)
      ;(Array.isArray(operationalWorkouts) ? operationalWorkouts : []).forEach(w => {
        const d = String(w.date || w.dateTime || "").slice(0, 10)
        if (d) loggedDates.add(d)
      })

      // Check the last 8 days for missed training days
      const alerts = []
      const toLocalISO = (date) => {
        const yr = date.getFullYear()
        const mo = String(date.getMonth() + 1).padStart(2, "0")
        const dy = String(date.getDate()).padStart(2, "0")
        return `${yr}-${mo}-${dy}`
      }
      for (let daysBack = 1; daysBack <= 8; daysBack++) {
        const d = new Date(today)
        d.setDate(d.getDate() - daysBack)
        const iso = toLocalISO(d)              // local date — no UTC shift
        const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]
        const meta = TRAINING_DAYS[dow]
        if (!meta) continue
        if (loggedDates.has(iso) || urdDays.has(iso)) continue
        // Only alert if past the tolerance window
        if (daysBack <= meta.tolerance) continue
        alerts.push({ iso, dow, label: meta.label, theme: meta.theme, daysBack })
      }

      // Find the most recent logged session
      const allLogDates = [...loggedDates].sort((a, b) => b.localeCompare(a))
      const lastLogDate = allLogDates[0] || null
      const daysSinceLog = lastLogDate
        ? Math.round((today - new Date(lastLogDate + "T12:00:00")) / 86400000)
        : null

      // Gap alert: 6+ days with no log at all
      const gapAlert = daysSinceLog != null && daysSinceLog >= 6

      if (alerts.length === 0 && !gapAlert) return null

      return (
        <div style={{ marginBottom: "16px", display: "grid", gap: "8px" }}>
          {gapAlert && (
            <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", borderLeft: "3px solid #ef4444", borderRadius: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#ef4444", marginBottom: "4px" }}>
                No session logged in {daysSinceLog} days
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af", lineHeight: 1.5 }}>
                Last activity: {lastLogDate ? fmtShortDate(lastLogDate + "T12:00:00") : "unknown"}.
                A multi-day gap increases discontinuation risk and compresses your September half marathon build window.
                Any session counts — even a 20-min easy bike.
              </div>
            </div>
          )}
          {!gapAlert && alerts.slice(0, 3).map(a => (
            <div key={a.iso} style={{ padding: "10px 16px", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)", borderLeft: "3px solid #f97316", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#f97316" }}>
                  {a.label} ({fmtShortDate(a.iso + "T12:00:00")}) not logged
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                  Planned: {a.theme} · {a.daysBack} day{a.daysBack !== 1 ? "s" : ""} ago
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    setScheduleTarget({ day: a.dow, date: a.iso })
                    setTab("Schedule")
                  }}
                  style={{ fontSize: "11px", padding: "5px 12px", background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.35)", borderRadius: "6px", color: "#f97316", cursor: "pointer" }}
                >
                  Log now
                </button>
                <button
                  onClick={() => markURD(a.iso)}
                  title="Unscheduled Recovery Day — mark this session as intentionally skipped"
                  style={{ fontSize: "11px", padding: "5px 12px", background: "rgba(100,100,120,0.15)", border: "1px solid rgba(100,100,120,0.35)", borderRadius: "6px", color: "#9ca3af", cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  URD
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    })()}

    <div style={{ ...cardStyle(), minWidth: 0, marginBottom: 16 }}>
{(() => {
  const panel = tsbV2Panel || { rows: [], readinessDetail: { score: "NA" } }
  const isLongWindow = rangeKey === "1Y" || rangeKey === "ALL"
  const modalityStrokeWidth = isLongWindow ? 1.2 : 1.8
  const tsbNumberStyle = value => ({
    color: !Number.isFinite(value) ? "#94a3b8" : value >= 0 ? "#4ade80" : value < LIFT_CONFIG.tsbModerateRiskThreshold ? "#ef4444" : "#fbbf24",
    fontWeight: 600
  })
  const tooltipStyle = {
    backgroundColor: "rgba(248, 250, 252, 0.96)",
    border: "1px solid rgba(148, 163, 184, 0.4)",
    borderRadius: 8,
    color: "#0f172a"
  }
  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap", marginBottom:10 }}>
        <div>
          <div style={{ fontWeight:"bold", minHeight:"20px" }}>Training Readiness</div>
          <div style={{ fontSize:11, color:"#667", marginTop:2 }}>TSB by modality across the selected window. Positive values suggest usable freshness; negative values suggest accumulating fatigue.</div>
        </div>
        <div style={{ fontSize:"10px", color:"#445", textAlign:"right", lineHeight:1.5 }}>
          tau1={LIFT_CONFIG.tau1}d (fitness) · tau2={LIFT_CONFIG.tau2}d (fatigue) · DEXA anchor {LIFT_CONFIG.dexa_anchor_date}
        </div>
      </div>
      {(() => {
        const tsb = panel.currentOverallTsb ?? 0
        let borderColor = "#4ade80"
        let msg = ""
        if (tsb < LIFT_CONFIG.tsbHighRiskThreshold) { borderColor = "#ef4444"; msg = "Acute fatigue. Substitute today's session with recovery swim or complete rest." }
        else if (tsb < LIFT_CONFIG.tsbModerateRiskThreshold) { borderColor = "#fb923c"; msg = "Moderate fatigue. Reduce intensity; replace run with easy bike or swim." }
        else if (tsb > 10) { borderColor = "#4ade80"; msg = "Form is positive. Good window for quality work or long run." }
        else { borderColor = "#facc15"; msg = "Neutral form. Proceed with scheduled session at controlled effort." }
        return (
          <div style={{ borderLeft:`3px solid ${borderColor}`, paddingLeft:9, fontSize:11, color:"#ccc", lineHeight:1.5, marginBottom:10 }}>
            {msg}
          </div>
        )
      })()}
      {readinessChartsReady && panel.rows.length > 0 ? (
        <>
          <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
            {[
              ["Overall", "#e5e7eb"],
              ["Run", "#ef4444"],
              ["Cycle", "#22d3ee"],
              ["Swim", "#a78bfa"],
              ["Strength", "#ffd166"]
            ].map(([label, color]) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#999" }}>
                <div style={{ width:14, height:2, background:color, borderRadius:999, opacity:0.95 }} />
                <span style={{ color }}>{label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={panel.rows} margin={{ top:8, right:14, left:12, bottom:14 }}>
              <CartesianGrid stroke="#1a1b2e" />
              <XAxis dataKey="label" tick={{ fontSize:10 }} interval={Math.max(1, Math.floor((panel.rows.length || 1) / (isLongWindow ? 10 : 12)) - 1)} />
              <YAxis domain={[dataMin => Math.min(Math.floor(dataMin - 3), -5), dataMax => Math.max(Math.ceil(dataMax + 3), 5)]} tick={{ fontSize:10 }} width={30} tickFormatter={value => Number(value).toFixed(0)} />
              <YAxis
                yAxisId="acwr"
                orientation="right"
                domain={[0, 2.5]}
                tick={{ fontSize: 10 }}
                tickFormatter={v => v.toFixed(1)}
                label={{ value: "ACWR", angle: 90, position: "insideRight", offset: 10, fontSize: 10 }}
              />
              <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
              <ReferenceLine yAxisId="acwr" y={1.5} stroke="#ef4444" strokeDasharray="3 2" strokeOpacity={0.5} />
              <ReferenceLine yAxisId="acwr" y={0.8} stroke="#3b82f6" strokeDasharray="3 2" strokeOpacity={0.5} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#0f172a' }} formatter={(v, n) => [Number(v).toFixed(2), n]} />
              <Line type="monotone" dataKey="overallTsb" name="Overall TSB" stroke="#e5e7eb" strokeWidth={isLongWindow ? 2 : 2.2} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="runningTsb" name="Running TSB" stroke="#ef4444" strokeWidth={modalityStrokeWidth} strokeOpacity={isLongWindow ? 0.78 : 1} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="cyclingTsb" name="Cycling TSB" stroke="#22d3ee" strokeWidth={modalityStrokeWidth} strokeOpacity={isLongWindow ? 0.78 : 1} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="swimmingTsb" name="Swimming TSB" stroke="#a78bfa" strokeWidth={modalityStrokeWidth} strokeOpacity={isLongWindow ? 0.78 : 1} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="strengthTsb" name="Strength TSB" stroke="#ffd166" strokeWidth={modalityStrokeWidth} strokeOpacity={isLongWindow ? 0.78 : 1} dot={false} connectNulls strokeDasharray="4 2" isAnimationActive={false} />
              <Line type="monotone" dataKey="upperStrengthTsb" name="Upper Strength TSB" stroke="#f97316" strokeWidth={1.2} strokeOpacity={isLongWindow ? 0.6 : 0.75} dot={false} connectNulls strokeDasharray="2 3" isAnimationActive={false} />
              <Line type="monotone" dataKey="lowerStrengthTsb" name="Lower Strength TSB" stroke="#4ade80" strokeWidth={1.2} strokeOpacity={isLongWindow ? 0.6 : 0.75} dot={false} connectNulls strokeDasharray="2 3" isAnimationActive={false} />
              <Line
                yAxisId="acwr"
                type="monotone"
                dataKey="acwr"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                name="ACWR"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:11, color:"#94a3b8", marginTop:8 }}>
            {[
              ["Overall", panel.currentRow?.overallTsb],
              ["Run", panel.currentRow?.runningTsb],
              ["Cycle", panel.currentRow?.cyclingTsb],
              ["Swim", panel.currentRow?.swimmingTsb],
              ["Strength", panel.currentRow?.strengthTsb],
              ["Str·Upper", panel.currentRow?.upperStrengthTsb],
              ["Str·Lower", panel.currentRow?.lowerStrengthTsb]
            ].map(([label, value]) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span>{label}:</span>
                <span style={tsbNumberStyle(Number(value))}>
                  {Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—"}
                </span>
              </div>
            ))}
          </div>
          {panel.currentLoad14Alert ? (
            <div style={{ borderLeft:"3px solid #fb923c", paddingLeft:9, fontSize:11, color:"#ccc", lineHeight:1.5, marginTop:10 }}>
              14-day load above 700 with TSB below -7. Moderate injury risk. Reduce intensity today.
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ color:"#666", fontSize:12, padding:"20px 0" }}>
          {readinessChartsReady
            ? `CTL ${computedTSB?.global?.ctl?.toFixed(1) ?? "—"} · ATL ${computedTSB?.global?.atl?.toFixed(1) ?? "—"} · TSB ${computedTSB?.global?.tsb?.toFixed(1) ?? "—"} (computed from workouts)`
            : "Loading readiness chart..."}
        </div>
      )}
      <div style={{ marginTop:10 }}>
        <div
          style={{ border: "1px solid #1a1b2e", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}
          onClick={() => toggleOverviewExplain("strengthLoad")}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight:"bold", fontSize:12 }}>Weekly Strength Load, relative</div>
              {!isOverviewExplainOpen("strengthLoad") && (
                <div style={{ fontSize:11, color:"#667", marginTop:2 }}>Normalized to the heaviest logged strength day in this selected window.</div>
              )}
            </div>
            {overviewExplainButton("strengthLoad")}
          </div>
          {isOverviewExplainOpen("strengthLoad") ? (
            renderOverviewExplainBody({
              shows: "Relative strength loading across the selected window, scaled from light to heavy days.",
              derived: "Each day's logged strength load is normalized against the highest strength-load day in the current time range. Blank gaps mean no workout data; low baseline ticks mean a workout was logged with zero strength load.",
              interpret: "Higher bars show comparatively heavier strength stress inside this window, not absolute tonnage. A flat pattern means strength is not progressing materially.",
              action: "Use this to decide whether strength support is being maintained. If bars disappear or stay tiny, add or restore purposeful strength sessions."
            })
          ) : (
            <ResponsiveContainer width="100%" height={72}>
              <BarChart data={panel.rows} margin={{ top:0, right:4, left:2, bottom:0 }} barCategoryGap="2%" barGap={1}>
                <XAxis dataKey="label" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip formatter={(value, name) => {
                  if (name === "Zero logged strength") return ["0", "Zero logged strength"]
                  return [`${Number(value).toFixed(0)}`, "Relative strength load"]
                }} />
                <Bar dataKey="strengthNormDisplay" name="Relative strength load" fill="#e2e8f0" fillOpacity={0.82} radius={[2, 2, 0, 0]} maxBarSize={10} />
                <Bar dataKey="strengthZeroMarker" name="Zero logged strength" fill="#94a3b8" fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={10} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  )
})()}
</div>

    <div
      style={{ ...cardStyle(), minWidth: 0, marginBottom: 16, cursor: "pointer" }}
      onClick={() => toggleOverviewExplain("acwr")}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap", marginBottom:10 }}>
        <div>
          <div style={{ fontWeight:"bold" }}>Acute:Chronic Workload Ratio (ACWR)</div>
          {!isOverviewExplainOpen("acwr") && (
            <div style={{ fontSize:11, color:"#667", marginTop:2 }}>ATL 7-day average divided by CTL 28-day average across the selected time window.</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize:10, color:"#445" }}>{rangeOptions.find(r => r.key === rangeKey)?.label ?? rangeKey}</div>
          {overviewExplainButton("acwr")}
        </div>
      </div>
      {isOverviewExplainOpen("acwr") ? (
        renderOverviewExplainBody({
          shows: "How fast recent workload is rising compared with the last month of work.",
          derived: "ACWR uses a 7-day rolling load divided by a 28-day rolling load from the full session series, then filters to the selected Overview window.",
          interpret: "Values near 1.0 mean current work matches your base. Above about 1.3 means load is climbing faster than the base can absorb; below 0.8 usually reflects a deload or undertraining period.",
          action: "If ACWR is elevated, avoid adding more volume this week. If it is very low, rebuild steadily instead of jumping straight back to previous mileage."
        })
      ) : (
        <>
          {(() => {
            const latest = acwrOverviewData.length ? acwrOverviewData[acwrOverviewData.length - 1] : null
            const acwrVal = latest?.acwr ?? null
            const acwrColor = latest && !latest.hasSufficientData ? "#64748b" : acwrVal == null ? "#555"
              : acwrVal > 1.5 ? "#ef4444"
              : acwrVal > 1.3 ? "#f97316"
              : acwrVal > 0.8 ? "#4ade80"
              : "#fbbf24"
            const acwrLabel = latest && !latest.hasSufficientData ? "Insufficient recent data for an honest ACWR"
              : acwrVal == null ? "No data"
              : acwrVal > 1.5 ? "High risk — load spike detected"
              : acwrVal > 1.3 ? "Caution — approaching overreach zone"
              : acwrVal > 0.8 ? "Optimal training zone"
              : "Low — undertraining or deload"
            return (
              <div style={{ borderLeft:`3px solid ${acwrColor}`, paddingLeft:9, fontSize:11, color:"#ccc", lineHeight:1.5, marginBottom:12 }}>
                {acwrVal != null && <span style={{ fontSize:20, fontWeight:800, color:acwrColor, marginRight:8 }}>{acwrVal.toFixed(2)}</span>}
                {acwrLabel}
              </div>
            )
          })()}
          {acwrOverviewData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={acwrOverviewData} margin={{ top:8, right:10, left:2, bottom:8 }}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" tick={{ fontSize:9 }} interval="preserveStartEnd" minTickGap={20} />
                <YAxis domain={acwrOverviewDomain} tick={{ fontSize:10 }} width={24} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(248, 250, 252, 0.96)",
                    border: "1px solid rgba(148, 163, 184, 0.4)",
                    borderRadius: 8,
                    color: "#0f172a"
                  }}
                  formatter={(v, n, item) => {
                    if (!Number.isFinite(Number(v))) return ["Insufficient data", n]
                    return [Number(v).toFixed(2), n]
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload
                    if (row && row.hasSufficientData === false) {
                      return `${label} · insufficient data`
                    }
                    return label
                  }}
                />
                <ReferenceArea y1={1.3} y2={1.5} fill="rgba(249,115,22,0.10)" />
                <ReferenceArea y1={1.5} y2={Math.max(2.5, acwrOverviewDomain[1])} fill="rgba(239,68,68,0.10)" />
                <ReferenceLine y={1.3} stroke="#f97316" strokeDasharray="4 3" />
                <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="4 3" />
                <Line dataKey="acwr" stroke="#fbbf24" strokeWidth={2} dot={false} name="ACWR" connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color:"#555", fontSize:12, padding:"20px 0" }}>No session data available for ACWR computation.</div>
          )}
          <div style={{ fontSize:10, color:"#445", marginTop:6, lineHeight:1.6 }}>
            Below 0.8 usually reflects deload or undertraining. Around 0.8 to 1.3 is the usable zone. Above 1.3 is caution, and above 1.5 is a load-spike warning.
          </div>
        </>
      )}
    </div>

    <div style={{ ...cardStyle(), minWidth:"0", marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap", marginBottom:10 }}>
        <div>
          <div style={{ fontWeight:"bold", marginBottom:"4px", minHeight:"20px" }}>Performance Readiness</div>
          <div style={{ fontSize:11, color:"#667" }}>Completion-readiness projection by event type. Threshold markers and race markers stay distinct, with race names rotated vertically above their own dashed lines.</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Readiness confidence {(readinessConfidenceSummary.readinessConfidence * 100).toFixed(0)}%</div>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Recommendation confidence {(readinessConfidenceSummary.recommendationConfidence * 100).toFixed(0)}%</div>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Tri confidence {(readinessConfidenceSummary.triConfidence * 100).toFixed(0)}%</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
        {[
          ["5K", "#ef4444"],
          ["10K", "#22c55e"],
          ["Half marathon", "#facc15"],
          ["Olympic triathlon", "#a78bfa"]
        ].map(([label, color]) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#999" }}>
            <div style={{ width:14, height:2, background:color, borderRadius:999 }} />
            <span style={{ color }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#94a3b8" }}>
          <div style={{ width:14, height:2, background:"#94a3b8", borderRadius:999, opacity:0.9 }} />
          <span>Race marker</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#64748b" }}>
          <div style={{ width:14, height:2, background:"#64748b", borderRadius:999, opacity:0.8 }} />
          <span>Threshold marker</span>
        </div>
      </div>
      <div style={{ marginBottom:"6px", position:"relative" }}>
        {readinessChartsReady ? (
          <div style={{ position:"relative" }}>
            <ResponsiveContainer width="100%" height={290}>
              <LineChart data={readinessProjectionData} margin={{ top:20, right:14, left:window.innerWidth < 768 ? 8 : 12, bottom:18 }}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis type="number" dataKey="month" domain={[0, readinessProjectionMaxMonth]} allowDecimals={false} tickCount={Math.min(readinessProjectionMaxMonth + 1, 8)} tick={{ fontSize:10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize:10 }} width={30} />
                <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} labelFormatter={value => `${value} months`} />
                <Line type="monotone" dataKey="fiveK" stroke="#ef4444" strokeWidth={2} dot={false} name="5K" isAnimationActive={false} />
                <Line type="monotone" dataKey="tenK" stroke="#22c55e" strokeWidth={2} dot={false} name="10K" isAnimationActive={false} />
                <Line type="monotone" dataKey="half" stroke="#facc15" strokeWidth={2} dot={false} name="Half marathon" isAnimationActive={false} />
                <Line type="monotone" dataKey="tri" stroke="#a78bfa" strokeWidth={3} dot={false} name="Olympic triathlon" isAnimationActive={false} />
                {safeEventReadinessMarkers.filter(marker => marker.month != null).map(marker => (
                  <ReferenceLine key={marker.key} x={marker.month} stroke={marker.color} strokeDasharray="6 4" strokeOpacity={0.55} />
                ))}
                {safeTargetableRaceMarkers.map((race, index) => (
                  <ReferenceLine
                    key={`${race.name}_${race.date}`}
                    x={race.month}
                    stroke="#94a3b8"
                    strokeDasharray="2 4"
                    strokeWidth={1.5}
                    label={{
                      value: race.name,
                      angle: -90,
                      position: "insideBottomLeft",
                      fill: "#94a3b8",
                      fontSize: window.innerWidth < 768 ? 8 : 9,
                      offset: 4 + ((index % 2) * 10)
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ color:"#666", fontSize:12, padding:"40px 0", textAlign:"center" }}>Loading readiness chart...</div>
        )}
      </div>
      {!safeTargetableRaces.length && (
        <div style={{ fontSize:12, color:"#666" }}>
          No currently targetable local races after the projected readiness thresholds.
        </div>
      )}
    </div>

    <div style={{ display:"grid", gridTemplateColumns: window.innerWidth < 1024 ? "1fr" : "1.05fr 0.95fr", gap:16, marginBottom:20, alignItems:"stretch" }}>
      <div
        style={{ ...cardStyle(), minWidth:0, height:"100%", display:"grid", gridTemplateRows:"auto auto 1fr auto", cursor:"pointer" }}
        onClick={() => toggleOverviewExplain("compliance")}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6 }}>
          <div>
            <div style={{ fontWeight:"bold" }}>Compliance and Adaptation</div>
            {!isOverviewExplainOpen("compliance") && (
              <div style={{ fontSize:11, color:"#667", marginTop:2 }}>Compact 8-week rollup of plan, completion, absorption, and compliance by domain.</div>
            )}
          </div>
          {overviewExplainButton("compliance")}
        </div>
        {isOverviewExplainOpen("compliance") ? (
          <div style={{ marginTop: 4 }}>
            {renderOverviewExplainBody({
              shows: "The last eight weeks of planned work, completed work, absorbed work, and compact compliance by domain.",
              derived: "Each row sums weekly domain doses, then pairs the total with model-level compliance and absorption percentages.",
              interpret: "Large gaps between PLAN and COMP mean execution is slipping. Large gaps between COMP and ABS mean work is being done but not fully absorbed.",
              action: "Use this table to decide which domain needs either better consistency or a lower, more absorbable dose."
            })}
          </div>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns: window.innerWidth < 768 ? "60px repeat(4, minmax(0, 1fr))" : "72px repeat(4, minmax(0, 1fr))", gap:6, marginBottom:6 }}>
              <div />
              {["PLAN", "COMP", "ABS", "%COMP"].map(label => (
                <div key={label} style={{ fontSize:10, color:"#667", fontWeight:800, letterSpacing:"0.08em", textAlign:"center", padding:"0 2px" }}>{label}</div>
              ))}
            </div>
            <div style={{ display:"grid", gap:6, alignContent:"stretch" }}>
              {complianceOverviewRows.map(row => (
                <div key={row.domain} style={{ display:"grid", gridTemplateColumns: window.innerWidth < 768 ? "60px repeat(4, minmax(0, 1fr))" : "72px repeat(4, minmax(0, 1fr))", gap:6, alignItems:"stretch" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-start", fontSize:11, fontWeight:800, color:"#cbd5e1", padding:"0 2px", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                    {row.domain === "running" ? "Running" : row.domain === "tendon" ? "Tendon" : row.domain === "strength" ? "Strength" : "Cardio"}
                  </div>
                  {[
                    row.planned,
                    row.completed,
                    row.absorbed,
                    `${row.compliancePct} / ${row.absorptionPct}`
                  ].map((value, idx) => (
                    <div key={`${row.domain}_${idx}`} style={{ background:"#07080e", border:"1px solid #1a1b2e", borderRadius:6, padding:"8px 6px", minHeight:56, display:"flex", alignItems:"center", justifyContent:"center", textAlign:"center" }}>
                      <div style={{ fontSize: complianceValueFontSize, fontWeight:700, lineHeight:0.95, width:"100%", whiteSpace:"nowrap" }}>{value}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ marginTop:10, display:"grid", gap:6, alignSelf:"end" }}>
          {safeAdaptiveFeedback.slice(0, 3).map(message => (
            <div key={message} style={{ fontSize:12, color:"#cbd5e1", lineHeight:1.45, padding:"8px 10px", background:"#0d0e1c", border:"1px solid #1a1b2e", borderRadius:6 }}>
              {message}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gap:16, height:"100%", gridTemplateRows:"auto 1fr" }}>
        <div
          style={{ ...cardStyle(), minWidth:0, cursor:"pointer" }}
          onClick={() => toggleOverviewExplain("capital")}
        >
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:4 }}>
            <div>
              <div style={{ fontWeight:"bold" }}>Training Capital Trend</div>
              {!isOverviewExplainOpen("capital") && (
                <div style={{ fontSize:11, color:"#667", marginTop:2 }}>Capital (AU). Slow-moving adaptive support signal, not acute load.</div>
              )}
            </div>
            {overviewExplainButton("capital")}
          </div>
          {isOverviewExplainOpen("capital") ? (
            renderOverviewExplainBody({
              shows: "Longer-horizon support across running, tendon, strength, and cardio rather than short-term fatigue.",
              derived: "Each line comes from the adaptive training state and reflects slower-moving support capital accumulated from recent absorbed work.",
              interpret: "Rising lines mean that domain has a deeper base to support future progression. Falling lines mean support is decaying even if acute fatigue is low.",
              action: "Use this to decide which support system needs maintenance before you push race-specific work harder."
            })
          ) : (
            trainingCapitalChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={92}>
                <LineChart data={trainingCapitalChartData} margin={{ top:6, right:8, left:2, bottom:8 }}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} width={24} />
                  <Tooltip formatter={(value, name) => [Number(value).toFixed(1), name]} />
                  <Line type="monotone" dataKey="runCapital" stroke="#ef4444" dot={false} name="Run capital" />
                  <Line type="monotone" dataKey="tendonCapital" stroke="#f59e0b" dot={false} name="Tendon capital" />
                  <Line type="monotone" dataKey="strengthCapital" stroke="#38bdf8" dot={false} name="Strength capital" />
                  <Line type="monotone" dataKey="cardioCapital" stroke="#22c55e" dot={false} name="Cardio capital" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ color:"#666", fontSize:12, padding:"24px 0" }}>No training capital trend available yet.</div>
            )
          )}
        </div>

        <div
          style={{ ...cardStyle(), minWidth:0, cursor:"pointer" }}
          onClick={() => toggleOverviewExplain("tendon")}
        >
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:8 }}>
            <div>
              <div style={{ fontWeight:"bold" }}>Tendon Capacity</div>
              {!isOverviewExplainOpen("tendon") && (
                <div style={{ fontSize:11, color:"#667", marginTop:2 }}>Combined is the default modeled tendon view. Use the dropdown for drill-down.</div>
              )}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <select
                value={selectedTendonGroup}
                onChange={e => {
                  e.stopPropagation()
                  setSelectedTendonGroup(e.target.value)
                }}
                onClick={e => e.stopPropagation()}
                style={{ background:"#0d0e1c", color:"#ced2f0", border:"1px solid #1a1b2e", borderRadius:6, padding:"6px 8px", fontSize:12 }}
              >
                {Object.entries(TENDON_GROUP_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
              {overviewExplainButton("tendon")}
            </div>
          </div>
          {isOverviewExplainOpen("tendon") ? (
            renderOverviewExplainBody({
              shows: "Modeled tendon load and capacity for the combined view or for the selected tendon system.",
              derived: "White line is modeled load, orange area is modeled capacity, and risk is the ratio of load divided by capacity.",
              interpret: "A risk of 1.0x means load equals modeled tolerance. Higher than 1.0x means tendon demand is catching or exceeding current capacity.",
              action: "If risk is elevated, hold run progression and maintain tendon work. If risk stays below target, continue steady tendon and run buildup."
            })
          ) : safeTendonSeries.length ? (
            <>
              <ResponsiveContainer width="100%" height={196}>
                <ComposedChart data={safeTendonSeries} margin={{ top:8, right:12, left:2, bottom:8 }}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} width={24} />
                  <Tooltip formatter={(value, name) => [Number(value).toFixed(2), name]} />
                  <ReferenceArea y1={0} y2={TENDON_GROUP_META[selectedTendonGroup].safe * (currentTendonSnapshot?.capacity || 1)} fill="rgba(34,197,94,0.08)" />
                  <ReferenceArea y1={TENDON_GROUP_META[selectedTendonGroup].safe * (currentTendonSnapshot?.capacity || 1)} y2={TENDON_GROUP_META[selectedTendonGroup].caution * (currentTendonSnapshot?.capacity || 1)} fill="rgba(245,158,11,0.08)" />
                  <ReferenceArea y1={TENDON_GROUP_META[selectedTendonGroup].caution * (currentTendonSnapshot?.capacity || 1)} y2={tendonPlotCeiling} fill="rgba(239,68,68,0.08)" />
                  <Area type="monotone" dataKey="capacity" fill="rgba(249,115,22,0.18)" stroke="#f97316" strokeWidth={2} name="Capacity" />
                  <Line type="monotone" dataKey="load" stroke="#f8fafc" strokeWidth={2} dot={false} name="Load" />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))", gap:10, marginTop:10 }}>
                <div style={{ background:"#07080e", border:"1px solid #1a1b2e", borderRadius:8, padding:10 }}>
                  <div style={{ fontSize:10, color:"#667" }}>Current risk</div>
                  <div style={{ fontSize:24, fontWeight:800 }}>{currentTendonSnapshot?.risk?.toFixed?.(2) ?? "NA"}x</div>
                </div>
                <div style={{ background:"#07080e", border:"1px solid #1a1b2e", borderRadius:8, padding:10 }}>
                  <div style={{ fontSize:10, color:"#667" }}>4-week trajectory</div>
                  <div style={{ fontSize:13, lineHeight:1.45, color:"#ced2f0" }}>
                    {(() => {
                      const last4 = safeTendonSeries.slice(-4)
                      const avgRisk = last4.length ? last4.reduce((sum, row) => sum + Number(row?.risk || 0), 0) / last4.length : null
                      return Number.isFinite(avgRisk) ? `${avgRisk.toFixed(2)}x if current pattern holds` : "Not enough data"
                    })()}
                  </div>
                </div>
                <div style={{ background:"#07080e", border:"1px solid #1a1b2e", borderRadius:8, padding:10 }}>
                  <div style={{ fontSize:10, color:"#667" }}>12-week trajectory</div>
                  <div style={{ fontSize:13, lineHeight:1.45, color:"#ced2f0" }}>
                    {(() => {
                      if (!currentTendonSnapshot) return "Not enough data"
                      const risk = clampNumber(currentTendonSnapshot.risk - ((adaptiveTrainingState.complianceScores?.tendon || 0) * 0.12), 0, 2)
                      return `${risk.toFixed(2)}x if tendon work and run pattern stay similar`
                    })()}
                  </div>
                </div>
              </div>
              <div style={{ fontSize:12, color:"#cbd5e1", marginTop:10 }}>
                {(() => {
                  const risk = Number(currentTendonSnapshot?.risk || 0)
                  if (!Number.isFinite(risk) || risk <= 0) return "Tendon status is still calibrating. Keep logging tendon work consistently."
                  if (risk >= TENDON_GROUP_META[selectedTendonGroup].caution) return "Hold run progression and maintain tendon work until risk settles back below the caution range."
                  if (risk < 0.85) return "Tendon load is below target, continue steady buildup with consistent tendon work."
                  return "Maintain the current progression and keep tendon work steady while this load remains absorbable."
                })()}
              </div>
              {safeTendonAlerts.length > 0 && (
                <div style={{ marginTop:10, display:"grid", gap:6 }}>
                  {safeTendonAlerts.map(alert => (
                    <div key={alert} style={{ padding:"9px 10px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderLeft:"3px solid #ef4444", borderRadius:6, fontSize:12, color:"#fca5a5" }}>
                      {alert}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ color:"#666", fontSize:12, padding:"28px 0" }}>No tendon trend available yet.</div>
          )}
        </div>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "16px", marginBottom: "20px", alignItems: "start" }}>
      <div style={{ ...cardStyle(), minWidth: "0" }}>
        <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Weight Trend, actual and 7 day average ({rangeOptions.find(r => r.key === rangeKey)?.label ?? rangeKey})</div>
        <div style={{ fontSize: 11, color: "#667", marginBottom: 10 }}>Daily scale weight and 7-day smoothing.</div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
  data={weightSmoothed}
  margin={{ top: 8, right: 14, left: 10, bottom: 18 }}
>
            <CartesianGrid stroke="#1a1b2e" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis
              domain={overviewWeightDomain}
              tick={{ fontSize: 10 }}
              width={38}
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

      <div style={{ ...cardStyle(), minWidth: "0" }}>
        <div style={{ fontWeight: "bold", marginBottom: "6px" }}>
          Training Load
        </div>
        {/* Icon legend */}
        <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
          {[
            { label:'Run mi',  color:'#ef4444', icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444"><path d="M13.5 5.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM9.9 8.4l-3.4 3.5 1.4 1.4 2.3-2.4.9 2.1-2.5 2.5V20h2v-4l2.4-2.3 2.1 5.3H17l-3.1-7.8L16 9h-2.4l-2 2-1.5-3.5-.2.9z"/></svg> },
            { label:'Swim mi', color:'#22c55e', icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="#22c55e"><path d="M2 15.5C3.5 17 5 17 6.5 15.5S9.5 14 11 15.5 13.5 17 15 15.5 17.5 14 19 15.5 21.5 17 23 15.5V13c-1.5 1.5-3 1.5-4.5 0S16 11.5 14.5 13 12 14.5 10.5 13 8 11.5 6.5 13 4 14.5 2.5 13V15.5zM11.5 3a1.5 1.5 0 101.5 1.5A1.5 1.5 0 0011.5 3z"/></svg> },
            { label:'Cycle mi',color:'#facc15', icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15"><path d="M15.5 5.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM5 12.5A4.5 4.5 0 109.5 17 4.5 4.5 0 005 12.5zm14 0a4.5 4.5 0 10-4.5 4.5 4.5 4.5 0 004.5-4.5zM12 9.8l-1.5 2.7H14l-1.5-2.7z"/></svg> },
            { label:'Strength',color:'#a78bfa', dash:true, icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="#a78bfa"><path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z"/></svg> },
            { label:'Load %',  color:'#6b7280', area:true },
          ].map(({ label, color, icon, dash, area }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#999' }}>
              {area ? <div style={{ width:13, height:8, background:color, opacity:0.4, borderRadius:2 }}/> : icon}
              <span style={{ color }}>{label}{dash ? ' - -' : ''}</span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
  data={trainingLoadChartData}
  margin={{ top: 8, right: 14, left: 10, bottom: 18 }}
>
            <CartesianGrid stroke="#1a1b2e" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis
              yAxisId="distance"
              orientation="left"
              domain={[0, trainingLoadDistanceMax]}
              tick={{ fontSize: 10 }}
              width={34}
            />
            <YAxis
              yAxisId="loadpct"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              width={30}
              allowDecimals={false}
            />
            <Tooltip formatter={(v, name) => {
              if (name === "Normalized training load") return [Math.round(v) + "%", name]
              if (name === "Strength sessions") return [Math.round(v), name]
              return [Number(v).toFixed(1) + " mi", name]
            }} />
            <Legend verticalAlign="top" height={0} content={() => null} />

            <Area
              yAxisId="loadpct"
              type="monotone"
              dataKey="trainingLoadPct"
              stroke="none"
              fill="#6b7280"
              fillOpacity={0.22}
              name="Normalized training load"
            />

            <Line
              yAxisId="distance"
              type="monotone"
              dataKey="running"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              name="Run miles"
            />

            <Line
              yAxisId="distance"
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
              yAxisId="distance"
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
</div>

    <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "16px", marginBottom: "20px", alignItems: "start" }}>
<div style={{ ...cardStyle(), minWidth: "0" }}>
  <div style={{ fontWeight: "bold", marginBottom: "12px", minHeight: "20px" }}>
    Body Composition
  </div>
  <div style={{ fontSize: 11, color: "#667", marginBottom: 10 }}>DEXA anchor vs current estimated body-fat trend.</div>

  <ResponsiveContainer width="100%" height={300}>
    <LineChart
      data={bodyCompositionOverviewData}
      margin={{ top: 8, right: 14, left: 10, bottom: 18 }}
    >
      <CartesianGrid stroke="#1a1b2e" />
      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
      <YAxis
        domain={bodyCompositionOverviewDomain}
        tick={{ fontSize: 10 }}
        width={34}
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
        <div style={{ fontWeight: "bold", marginBottom: "6px" }}>Calories Trend ({rangeOptions.find(r => r.key === rangeKey)?.label ?? rangeKey})</div>
        <div style={{ fontSize: 11, color: "#667", marginBottom: 10 }}>Daily intake, target, and 7-day average. Moved lower so readiness and load decisions lead the page.</div>
        {calorieChartData.length === 0 ? (
          <div style={{ color: "#555", padding: "40px 0", textAlign: "center", fontSize: 12 }}>No nutrition data logged for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={calorieChartData} margin={{ top: 8, right: 14, left: 10, bottom: 18 }}>
              <CartesianGrid stroke="#1a1b2e" />
              <XAxis dataKey="label" interval="preserveStartEnd" tickCount={6} tick={{ fontSize: 10 }} />
              <YAxis domain={overviewCaloriesDomain} tick={{ fontSize: 10 }} width={36} />
              <Tooltip />
              <Line type="monotone" dataKey="calories" stroke="#4acfe8" strokeWidth={2} dot={false} name="Calories" />
              <Line type="monotone" dataKey="target" stroke="#ffd166" strokeDasharray="6 6" dot={false} name="Target" />
              <Line type="monotone" dataKey="calories_7d" stroke="#ffffff" strokeWidth={2} dot={false} name="7 day avg" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
    <div style={{ ...cardStyle(), minWidth: "0", marginBottom: "20px" }}>
      <div style={{ fontWeight: "bold", marginBottom: "12px", minHeight: "20px" }}>
        Operational Capacity — History & Projection
      </div>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>
        History + 60-day projection. Dashed line marks today.
      </div>
      {(!operationalCapacityData || operationalCapacityData.length === 0) ? (
        <div style={{ fontSize: "12px", color: "#444", textAlign: "center", padding: "40px 0" }}>
          No OC issues recorded — add issues in the Operational Capacity tab to build history.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart
            data={operationalCapacityData}
            margin={{ top: 8, right: 14, left: 10, bottom: 18 }}
          >
            <CartesianGrid stroke="#1a1b2e" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={34} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]?.payload
                const labelMap = {
                  operationalPct:  "Operational",
                  acuteLossPct:    "Acute",
                  diseaseLossPct:  "Disease",
                  fatigueLossPct:  "Fatigue",
                }
                return (
                  <div style={{ background: "#0d0f1e", border: "1px solid #222", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                    <div style={{ color: "#888", marginBottom: 4 }}>
                      {label}{d?.isPast ? "" : " (projected)"}
                    </div>
                    {payload.map(p => (
                      <div key={p.dataKey} style={{ color: p.stroke || p.fill, marginBottom: 2 }}>
                        {labelMap[p.dataKey] || p.name}: {Number(p.value).toFixed(1)}%
                      </div>
                    ))}
                    {d?.breakdown?.length > 0 && (
                      <div style={{ marginTop: 6, borderTop: "1px solid #222", paddingTop: 6, color: "#666" }}>
                        {d.breakdown.map((b, i) => (
                          <div key={i}>{b.label}: {b.lossPct}%</div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }}
            />
            <ReferenceLine
              x={fmtShortDate(new Date().toISOString().slice(0, 10))}
              stroke="#444"
              strokeDasharray="4 3"
              label={{ value: "Today", position: "insideTopRight", fill: "#666", fontSize: 10 }}
            />
            <Line type="monotone" dataKey="operationalPct" stroke="#e5e7eb" strokeWidth={2} dot={false} name="Operational" />
            <Line type="monotone" dataKey="acuteLossPct"   stroke="#ef4444" strokeWidth={1.5} dot={false} name="Acute" />
            <Line type="monotone" dataKey="diseaseLossPct" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Disease" />
            <Line type="monotone" dataKey="fatigueLossPct" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="Fatigue" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
)}
      {tab === "Composition" && (
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

            {/* DEXA bias correction card */}
            {(() => {
              const SCALE_BIAS_PP = LIFT_CONFIG.scale_bias_pp
              const currentScaleWeight = weightSmoothed.length
                ? weightSmoothed[weightSmoothed.length - 1].avg
                : null
              const latestLean = latestDexa?.lean_lb ?? latestLeanAnchor
              const correctedBF = (currentScaleWeight != null && latestLean != null && currentScaleWeight > 0)
                ? ((currentScaleWeight - latestLean) / currentScaleWeight) * 100 + SCALE_BIAS_PP
                : null
              const rawScaleBF = (currentScaleWeight != null && latestLean != null && currentScaleWeight > 0)
                ? ((currentScaleWeight - latestLean) / currentScaleWeight) * 100
                : null
              return (
                <div style={{ ...cardStyle(), borderColor: "#2a1f00" }}>
                  <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "4px" }}>Scale-Corrected BF%</div>
                  <div style={{ fontSize: "30px", fontWeight: "bold", color: "#ffd166" }}>
                    {correctedBF != null ? `${f1(correctedBF)}%` : "NA"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#667", marginTop: "6px", lineHeight: 1.5 }}>
                    Raw scale estimate: {rawScaleBF != null ? `${f1(rawScaleBF)}%` : "NA"}
                    <br />
                    +{SCALE_BIAS_PP} pp DEXA correction applied
                  </div>
                  <div style={{ fontSize: "10px", color: "#445", marginTop: "4px" }}>
                    Bias quantified vs Apr 2026 DEXA anchor. Update after Sep 2026 scan.
                  </div>
                </div>
              )
            })()}
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

          {/* ── DEXA % Change from Baseline ─────────────────────────────── */}
          <div style={{ ...cardStyle(), marginBottom: "16px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Body Composition — % Change from Baseline (Aug 2025)</div>
            <div style={{ fontSize: 11, color: "#667", marginBottom: 10 }}>
              Fat mass (red) · Lean mass (teal) · Total mass (gray, dashed) · Body fat % (amber).
              Baseline = Aug 26, 2025 scan.
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dexaRegionalPct} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                <Tooltip formatter={(v, name) => [`${v > 0 ? "+" : ""}${v}%`, name]} />
                <Legend verticalAlign="top" height={32} />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="fatMassPct"   name="Fat mass"    stroke="#C0392B" strokeWidth={2.5} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="leanMassPct"  name="Lean mass"   stroke="#1D9E75" strokeWidth={2.5} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="totalMassPct" name="Total mass"  stroke="#888780" strokeWidth={1.8} strokeDasharray="5 3" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="fatPctChg"    name="Body fat pp" stroke="#BA7517" strokeWidth={2.5} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── DEXA Regional Lean Mass % Change ────────────────────────── */}
          <div style={{ ...cardStyle(), marginBottom: "16px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Regional Lean Mass — % Change from Baseline</div>
            <div style={{ fontSize: 11, color: "#667", marginBottom: 10 }}>
              Left leg (amber) flat across all scans — consistent with left MTP unloading throughout the training period.
              Right leg and trunk drove the Apr '26 lean mass gain.
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dexaRegionalPct} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                <Tooltip formatter={(v, name) => [`${v > 0 ? "+" : ""}${v}%`, name]} />
                <Legend verticalAlign="top" height={32} />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="trunkPct" name="Trunk"  stroke="#7F77DD" strokeWidth={2} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="rLegPct"  name="R leg"  stroke="#D85A30" strokeWidth={2} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="lLegPct"  name="L leg"  stroke="#BA7517" strokeWidth={2} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="rArmPct"  name="R arm"  stroke="#1D9E75" strokeWidth={2} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="lArmPct"  name="L arm"  stroke="#378ADD" strokeWidth={2} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── VAT and BMD ─────────────────────────────────────────────── */}
          <div style={{ ...cardStyle(), marginBottom: "16px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>VAT Area and Bone Mineral Density</div>
            <div style={{ fontSize: 11, color: "#667", marginBottom: 10 }}>
              VAT area (cm², left axis) — lower-risk threshold ≈ 100 cm². BMD (g/cm², right axis) — T-score 0.0 in Apr '26.
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={DEXA_REGIONAL} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1a1b2e" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="vat" domain={[90, 170]} tickFormatter={v => `${v}`}
                  label={{ value: "VAT cm²", angle: -90, position: "insideLeft", fill: "#C0392B", fontSize: 11 }} />
                <YAxis yAxisId="bmd" orientation="right" domain={[1.08, 1.20]} tickFormatter={v => v.toFixed(3)}
                  label={{ value: "BMD g/cm²", angle: 90, position: "insideRight", fill: "#378ADD", fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="top" height={32} />
                <ReferenceLine yAxisId="vat" y={100} stroke="#C0392B" strokeDasharray="4 2" label={{ value: "100 cm²", fill: "#C0392B", fontSize: 10 }} />
                <Line yAxisId="vat" type="monotone" dataKey="vatArea" name="VAT area (cm²)" stroke="#C0392B" strokeWidth={2.5} dot={{ r: 5 }} />
                <Line yAxisId="bmd" type="monotone" dataKey="bmd"     name="BMD (g/cm²)"   stroke="#378ADD" strokeWidth={2.5} dot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {vo2Series.length >= 2 && (
            <div style={{ marginTop: 24, background: '#0d0f1e', border: '1px solid #1a1b2e', borderRadius: 8, padding: '18px 20px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6, fontSize: 13 }}>
                VO₂ Max Trend
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
                Apple Watch aerobic estimate. Useful for within-person trend tracking; modality bias may apply (swimming underestimates).
                Current: <span style={{ color: '#4ade80', fontWeight: 600 }}>{vo2Series[vo2Series.length - 1]?.vo2}</span> ml/kg/min
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={vo2Series} margin={{ top: 8, right: 20, left: 0, bottom: 18 }}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10 }}
                    width={34}
                    label={{ value: 'ml/kg/min', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div style={{ background: '#0d0f1e', border: '1px solid #222', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                          <div style={{ color: '#888', marginBottom: 4 }}>{label}</div>
                          <div style={{ color: '#4ade80' }}>VO₂ max: {payload[0]?.value} ml/kg/min</div>
                        </div>
                      )
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="vo2"
                    stroke="#4ade80"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#4ade80' }}
                    activeDot={{ r: 7 }}
                    name="VO₂ Max"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

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

          {/* Daily Template */}
          <div style={{ ...cardStyle(), marginBottom: "16px", maxWidth: "1000px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontWeight: "bold" }}>Daily Template</div>
                <button onClick={() => setShowAddPreset(s => !s)} style={{ ...buttonStyle(false), fontSize:10, padding:"3px 8px" }}>+ Add to presets</button>
              </div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {templateTotals.calories > 0
                  ? `${templateTotals.calories} kcal / ${templateTotals.protein_g}g protein default. Fills chart on unlogged days.`
                  : "Set defaults below. Chart fills these automatically on unlogged days."}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "10px" }}>
              {["Breakfast", "Lunch", "Dinner", "Snacks"].map(slot => {
                const activeId = dailyTemplate[slot]
                const active = activeId ? (mealPresets[slot] || []).find(p => p.id === activeId) : null
                return (
                  <div key={slot} style={{ background: "#14152a", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "10px" }}>
                    <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{slot}</div>
                    <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 2, minHeight: 16 }}>{active ? active.name : "None"}</div>
                    <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 8 }}>
                      {active ? `${active.calories} kcal · ${active.protein_g}g prot` : "Not set"}
                    </div>
                    <select
                      value={activeId || ""}
                      onChange={e => {
                        const next = { ...dailyTemplate, [slot]: e.target.value || null }
                        setDailyTemplate(next)
                        try { localStorage.setItem('lift-daily-template', JSON.stringify(next)) } catch {}
                      }}
                      style={{ background: "#07080e", color: "#ced2f0", border: "1px solid #1a1b2e", borderRadius: "6px", padding: "4px 6px", width: "100%", fontSize: 11 }}
                    >
                      <option value="">None</option>
                      {(mealPresets[slot] || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.calories} kcal)</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
{showAddPreset && (
  <div style={{ marginTop:12, background:"#14152a", border:"1px solid #1a1b2e", borderRadius:8, padding:10 }}>
    <div style={{ fontSize:11, fontWeight:"bold", marginBottom:8 }}>Add meal to presets</div>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
      <select value={newPresetSlot} onChange={e => setNewPresetSlot(e.target.value)}
        style={{ background:"#07080e", color:"#ced2f0", border:"1px solid #1a1b2e", borderRadius:6, padding:"4px 6px", fontSize:11 }}>
        {["Breakfast","Lunch","Dinner","Snacks"].map(s => <option key={s}>{s}</option>)}
      </select>
      <input placeholder="Meal name" value={newPreset.name}
        onChange={e => setNewPreset(p => ({...p, name:e.target.value}))} style={{...inputStyle(), fontSize:11, padding:"4px 8px"}} />
      <input placeholder="Calories" value={newPreset.calories}
        onChange={e => setNewPreset(p => ({...p, calories:e.target.value}))} style={{...inputStyle(), fontSize:11, padding:"4px 8px"}} />
      <input placeholder="Protein g" value={newPreset.protein_g}
        onChange={e => setNewPreset(p => ({...p, protein_g:e.target.value}))} style={{...inputStyle(), fontSize:11, padding:"4px 8px"}} />
      <input placeholder="Carbs g" value={newPreset.carbs_g}
        onChange={e => setNewPreset(p => ({...p, carbs_g:e.target.value}))} style={{...inputStyle(), fontSize:11, padding:"4px 8px"}} />
      <input placeholder="Fat g" value={newPreset.fat_g}
        onChange={e => setNewPreset(p => ({...p, fat_g:e.target.value}))} style={{...inputStyle(), fontSize:11, padding:"4px 8px"}} />
    </div>
    <button style={buttonStyle(true)} onClick={() => {
      if (!newPreset.name || !newPreset.calories) return
      const id = newPresetSlot.slice(0,1).toLowerCase() + Date.now()
      const entry = { id, name: newPreset.name, calories: Number(newPreset.calories),
        protein_g: Number(newPreset.protein_g||0), carbs_g: Number(newPreset.carbs_g||0), fat_g: Number(newPreset.fat_g||0) }
      const next = { ...mealPresets, [newPresetSlot]: [...(mealPresets[newPresetSlot]||[]), entry] }
      setMealPresets(next)
      store.set("ufd-meal-presets", next).catch(() => {})
      setNewPreset({ name:"", calories:"", protein_g:"", carbs_g:"", fat_g:"" })
      setShowAddPreset(false)
    }}>Save to {newPresetSlot} presets</button>
  </div>
)}
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

          <div style={{ ...cardStyle(), maxWidth: "1000px", marginBottom: "16px" }}>
            {(() => {
              const PROTEIN_TARGET = LIFT_CONFIG.protein_target_g
              const todayProtein = todayMeals.reduce((s, r) => s + toNum(r.protein_g), 0)
              const todayCalories = todayMeals.reduce((s, r) => s + toNum(r.calories), 0)
              const proteinPct = Math.min(100, Math.round((todayProtein / PROTEIN_TARGET) * 100))
              const remaining = Math.max(0, PROTEIN_TARGET - todayProtein)
              const barColor = proteinPct >= 100 ? "#4ade80" : proteinPct >= 70 ? "#fbbf24" : "#ef4444"
              const calTarget = calorieTarget?.targetCalories || 1700
              const calPct = Math.min(100, Math.round((todayCalories / calTarget) * 100))
              const calBarColor = calPct > 110 ? "#ef4444" : calPct >= 90 ? "#4ade80" : calPct >= 60 ? "#fbbf24" : "#667"
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontWeight: "bold" }}>Today ({mealDate})</div>
                    <div style={{ fontSize: "11px", color: "#555" }}>
                      FFM {LIFT_CONFIG.ffm_lb} lb · target {(LIFT_CONFIG.protein_target_g / (LIFT_CONFIG.ffm_lb / 2.20462)).toFixed(1)} g/kg lean mass · Phase 1 cut
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                        <div style={{ fontSize: "12px", color: "#888" }}>Protein</div>
                        <div style={{ fontSize: "20px", fontWeight: "800", color: barColor }}>
                          {Math.round(todayProtein)}
                          <span style={{ fontSize: "12px", fontWeight: "400", color: "#555" }}> / {PROTEIN_TARGET} g</span>
                        </div>
                      </div>
                      <div style={{ height: "6px", background: "#1a1b2e", borderRadius: "3px", overflow: "hidden", marginBottom: "4px" }}>
                        <div style={{ height: "100%", width: `${proteinPct}%`, background: barColor, transition: "width 0.4s" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#445" }}>
                        {proteinPct >= 100 ? "Target met." : `${Math.round(remaining)} g remaining.`}
                        {remaining > 0 && remaining <= 40 && " Close — one more protein source."}
                        {remaining > 40 && remaining <= 80 && " One more high-protein meal recommended."}
                        {remaining > 80 && " Significantly below target — prioritize protein at next two meals."}
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                        <div style={{ fontSize: "12px", color: "#888" }}>Calories</div>
                        <div style={{ fontSize: "20px", fontWeight: "800", color: calBarColor }}>
                          {Math.round(todayCalories)}
                          <span style={{ fontSize: "12px", fontWeight: "400", color: "#555" }}> / {Math.round(calTarget)}</span>
                        </div>
                      </div>
                      <div style={{ height: "6px", background: "#1a1b2e", borderRadius: "3px", overflow: "hidden", marginBottom: "4px" }}>
                        <div style={{ height: "100%", width: `${calPct}%`, background: calBarColor, transition: "width 0.4s" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#445" }}>
                        {calPct > 110 ? `${Math.round(todayCalories - calTarget)} kcal over target.`
                          : calPct >= 90 ? "On track."
                          : `${Math.round(calTarget - todayCalories)} kcal remaining.`}
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

          <div style={{ ...cardStyle(), maxWidth: "1000px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Meal Log ({mealDate})</div>
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
    latestHealthFit={latestHealthFit}
    ocItems={ocItems}
    computedTSB={computedTSBFromSessions ?? computedTSB}
    tsbV2Panel={tsbV2Panel}
    progressionReadiness={ocConstraintState?.gate?.progressionReadiness ?? "hold"}
    progressionReasons={ocConstraintState?.gate?.progressionReasons ?? []}
    tendonStatus={ocConstraintState?.tendon ?? { painScore: 0, stiffness: false, override: null }}
    scheduleFeedback={Array.isArray(adaptiveTrainingState?.feedback) ? adaptiveTrainingState.feedback : []}
    sleepRecords={sleepRecords}
    setSleepRecords={setSleepRecords}
    scheduleTarget={scheduleTarget}
    clearScheduleTarget={() => setScheduleTarget(null)}
  />
)}

{tab === "Training" && (
  <TrainingDashboard
    workouts={operationalWorkouts}
    recentNutrition={recentNutrition}
    healthFitDaily={healthFitDaily}
    schedLog={schedLog}
  />
)}
{tab === "Capacity" && (
  <TabOperationalCapacity
    ocItems={ocItems}
    setOcItems={setOcItems}
    session={session}
    operationalCapacityData={operationalCapacityData}
    healthFitDaily={healthFitDaily}
    sleepRecords={sleepRecords}
    tsbFallback={tsbV2Panel?.currentOverallTsb ?? computedTSBFromSessions?.tsb ?? null}
    runSessions={operationalWorkouts.filter(w => w.category === "Running" && w.distance > 0)}
    canonicalSessions={unifiedCanonicalSessions}
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            Composite: aerobic volume (multi-modal) · running pace · cardio consistency
          </div>
          {showDeveloperPanels && overviewExplainButton("readinessDebug")}
        </div>
      </div>
      <div
        onClick={() => toggleOverviewExplain("readinessSummary")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            toggleOverviewExplain("readinessSummary")
          }
        }}
        aria-expanded={isOverviewExplainOpen("readinessSummary")}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "6px",
          marginBottom: "14px",
          cursor: "pointer",
          userSelect: "none"
        }}
      >
        {[
          { shortLabel: "Now", value: forecastReadinessCards[0]?.value ?? "—" },
          { shortLabel: "1M", value: forecastReadinessCards[1]?.value ?? "—" },
          { shortLabel: "3M", value: forecastReadinessCards[2]?.value ?? "—" },
          { shortLabel: "6M", value: forecastReadinessCards[3]?.value ?? "—" },
          { shortLabel: "12M", value: forecastReadinessCards[4]?.value ?? "—" }
        ].map(({ shortLabel, value }) => (
          <div
            key={shortLabel}
            style={{
              minWidth: 0,
              background: "#0d0e1c",
              border: "1px solid #1a1b2e",
              borderRadius: "8px",
              padding: "6px 4px 7px",
              textAlign: "center",
              boxShadow: isOverviewExplainOpen("readinessSummary") ? "0 0 0 1px rgba(74,158,232,0.25)" : "none"
            }}
          >
            <div
              style={{
                fontSize: "clamp(9px, 2vw, 11px)",
                lineHeight: 1,
                opacity: 0.62,
                marginBottom: "5px",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap"
              }}
            >
              {shortLabel}
            </div>
            <div
              style={{
                fontSize: "clamp(16px, 4vw, 22px)",
                fontWeight: "700",
                lineHeight: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "clip",
                color: value >= 60 ? "#4ade80" : value >= 35 ? "#ffd166" : "#ff8a8a"
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      {isOverviewExplainOpen("readinessSummary") && (
        <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "12px", marginBottom: "14px" }}>
          {renderOverviewExplainBody({
            shows: "Five compact readiness checkpoints: current, 1 month, 3 months, 6 months, and 12 months.",
            derived: "Scores come from the endurance projection model using recent aerobic volume, running pace, cardio consistency, and the current readiness base.",
            interpret: "Higher values imply a stronger base for steady endurance work. Projections assume you keep training patterns broadly similar rather than making abrupt jumps.",
            action: "Use the ribbon as a fast planning snapshot. Use the chart below to inspect the projection curve and race-specific readiness lines in more detail."
          })}
        </div>
      )}
      {showDeveloperPanels && isOverviewExplainOpen("readinessDebug") && (
        <div style={{ background: "#0d0e1c", border: "1px solid #1a1b2e", borderRadius: "8px", padding: "12px", marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Readiness Debug</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", fontSize: "12px" }}>
            <div>operationalWorkouts total: {readinessDebugData.operationalWorkoutsTotal}</div>
            <div>operationalWorkouts last 30d: {readinessDebugData.operationalWorkoutsLast30d}</div>
            <div>cycling workouts last 30d: {readinessDebugData.cyclingWorkoutsLast30d}</div>
            <div>normalizedActiveWorkouts: {readinessDebugData.normalizedActiveWorkouts}</div>
            <div>normalizedStoredWorkouts: {readinessDebugData.normalizedStoredWorkouts}</div>
            <div>computedTSBFromSessions.tsb: {readinessDebugData.computedTsb ?? "—"}</div>
            <div>latest HealthFit TSB: {readinessDebugData.healthFitTsb ?? "—"}</div>
            <div>TSB used by readiness: {readinessDebugData.readinessTsbUsed ?? "—"}</div>
            <div>readinessInputsHydrated: {String(readinessDebugData.readinessInputsHydrated)}</div>
            <div>readinessRemoteInputsHydrated: {String(readinessDebugData.readinessRemoteInputsHydrated)}</div>
            <div>readinessChartsReady: {String(readinessDebugData.readinessChartsReady)}</div>
          </div>
          <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "10px" }}>
            Latest 5 operational workouts: {readinessDebugData.latestOperationalWorkouts.length
              ? readinessDebugData.latestOperationalWorkouts.map(w => `${w.date} ${w.category}`).join(" · ")
              : "none"}
          </div>
        </div>
      )}
      {readinessChartsReady ? (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={readinessProjectionData} margin={{ top: 10, right: 20, left: 55, bottom: 20 }}>
          <CartesianGrid stroke="#1a1b2e" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} label={{ value: "Readiness score", angle: -90, position: "insideLeft", offset: 15, fill: "#ced2f0", style: { textAnchor: "middle" } }} />
          <Tooltip />
          <Legend verticalAlign="top" height={28} />
          <Line type="monotone" dataKey="baseReadiness" name="Readiness"      stroke="#4a9ee8" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="fiveK"         name="5K readiness"   stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="tenK"          name="10K readiness"  stroke="#22c55e" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="half"          name="Half readiness" stroke="#facc15" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      ) : (
        <div style={{ color:'#666', fontSize:12, padding:'40px 0', textAlign:'center' }}>Loading readiness chart...</div>
      )}
      <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "8px" }}>
        Running: {enduranceForecast.weeklyRunMiles28} mi/week · longest {runningReadiness?.signals?.recentLongestRunMiles ?? "NA"} mi · frequency {runningReadiness?.signals?.recentRunFrequency ?? "NA"}/week · progression {runningReadiness?.progressionReadiness ?? "hold"} · pace {enduranceForecast.avgPace28 || "NA"} min/mi · cardio {Math.round(enduranceForecast.cardioMinutesWeekly)} min/week · run modifier {((enduranceForecast.runPenalty ?? 1) * 100).toFixed(0)}%
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
      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "16px" }}>

        {/* ── Running Volume with half marathon build curve ── */}
        {(() => {
          const color = "#ef4444"
          const eta = `ETA 20 mi/wk: ${trainingForecast.eta20Run || "not on trend"} · ETA 30 mi/wk: ${trainingForecast.eta30Run || "not on trend"}`

          // Build planned curve from HM_PLAN_LONG_RUN (ChatGPT plan, week-start keyed)
          // Maps each week's Monday ISO date → planned long run miles
          const RACE_DATE = new Date(LIFT_CONFIG.hm_race_date)

          // Convert HM_PLAN_LONG_RUN week keys to chart labels
          const planByLabel = {}
          Object.entries(HM_PLAN_LONG_RUN).forEach(([weekKey, mi]) => {
            const d = new Date(weekKey + "T12:00:00")
            if (d <= RACE_DATE) {
              const label = formatBucketLabel(d, "monthly")
              planByLabel[label] = Number(mi.toFixed(2))
            }
          })

          const data = runningForecastChart.map(pt => ({
            ...pt,
            plan: planByLabel[pt.label] ?? null
          }))

          // Find the September race week label
          const sepLabel = Object.keys(planByLabel).find(l => l.endsWith("/09")) ||
            formatBucketLabel(new Date("2026-09-19"), "monthly")

          return (
            <div style={{ ...cardStyle(), gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: "10px" }}>
                <div style={{ fontWeight: "bold", fontSize: "13px" }}>Running Volume (mi/week)</div>
                <div style={{ fontSize: "11px", color: "#667", textAlign: "right" }}>
                  ChatGPT build plan · peak 9 mi long run · taper Aug 31 · St. Jude 9/19/26
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data} margin={{ top: 5, right: 10, left: 40, bottom: 15 }}>
                  <CartesianGrid stroke="#1a1b2e" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, "dataMax + 3"]} />
                  <Tooltip formatter={(v, n) => [
                    v != null ? Number(v).toFixed(2) : "—",
                    n === "actual" ? "Actual" : n === "forecast" ? "Projected" : "HM Plan"
                  ]} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: "11px" }} />
                  <ReferenceLine y={9} stroke="#ffd166" strokeDasharray="4 3"
                    label={{ value: "Plan peak", fill: "#ffd166", fontSize: 10, position: "insideTopRight" }} />
                  {sepLabel && (
                    <ReferenceLine x={sepLabel} stroke="#4ade80" strokeDasharray="4 3"
                      label={{ value: "Race", fill: "#4ade80", fontSize: 10, position: "insideTopLeft" }} />
                  )}
                  <Bar  dataKey="actual"   name="Actual"    fill={color} opacity={0.7} />
                  <Line dataKey="forecast" name="Projected" stroke={color} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} connectNulls={false} />
                  <Line dataKey="plan"     name="HM Plan"   stroke="#ffd166" strokeWidth={1.5} strokeDasharray="3 2" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "6px" }}>{eta}</div>
            </div>
          )
        })()}

        {/* ── Remaining modality charts ── */}
        {[
          { title: "Cycling Volume (mi/week)",     data: cyclingForecastChart,  color: "#4acfe8", eta: `ETA 25 mi/wk: ${trainingForecast.eta25Bike || "not on trend"} · ETA 50 mi/wk: ${trainingForecast.eta50Bike || "not on trend"}` },
          { title: "Swimming Volume (mi/week)",    data: swimmingForecastChart, color: "#a78bfa", eta: `ETA 2 mi/wk: ${trainingForecast.eta2Swim || "not on trend"} · ETA 5 mi/wk: ${trainingForecast.eta5Swim || "not on trend"}` },
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

    <RaceHistoryPanel results={RACE_RESULTS} raceCalendar={RACE_CALENDAR} />

    {/* ── Race Calendar ─────────────────────────────────────────── */}
    {(() => {
      const today = new Date()
      const upcoming = RACE_CALENDAR.filter(r => new Date(r.date + "T12:00:00") >= today)

      // Current long run capacity: max distance of runs in last 6 weeks
      const sixWeeksAgo = new Date(today)
      sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42)
      const recentRuns = operationalWorkouts.filter(w =>
        (w.category === "Running" || w.type === "Running") &&
        w.distance > 0 &&
        new Date(String(w.date || w.dateTime || "").slice(0, 10) + "T12:00:00") >= sixWeeksAgo
      )
      const currentLongRun = recentRuns.length
        ? Math.max(...recentRuns.map(w => w.distance || 0))
        : 3.0

      // Projected long run at a future date using HM_PLAN_LONG_RUN
      const getProjectedLongRun = (raceDateStr) => {
        const raceDate = new Date(raceDateStr + "T12:00:00")
        // Find the Monday of race week
        const dayOfWeek = raceDate.getDay()
        const daysToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        const weekStart = new Date(raceDate)
        weekStart.setDate(weekStart.getDate() + daysToMon)
        const weekKey = weekStart.toISOString().slice(0, 10)
        return HM_PLAN_LONG_RUN[weekKey] ?? null
      }

      const assess = (race) => {
        const projected = getProjectedLongRun(race.date)
        const capacity = projected ?? currentLongRun
        const ratio = race.dist_mi / capacity
        if (!race.recommended) return { color: "#667", label: "Skip", bg: "rgba(100,100,100,0.08)", border: "#333" }
        if (ratio <= 0.85) return { color: "#4ade80", label: "Ready", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.3)" }
        if (ratio <= 1.05) return { color: "#fbbf24", label: "On target", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.3)" }
        if (ratio <= 1.25) return { color: "#f97316", label: "Stretch", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.3)" }
        return { color: "#ef4444", label: "Too soon", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)" }
      }

      const weeksBetween = (dateStr) =>
        Math.round((new Date(dateStr + "T12:00:00") - today) / (7 * 86400000))

      return (
        <div style={{ ...cardStyle(), marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <div style={{ fontWeight: "bold" }}>Race Calendar — St. Jude Half Marathon Build</div>
            <div style={{ fontSize: "11px", color: "#555" }}>
              Current long run capacity: <strong style={{ color: "#ced2f0" }}>{currentLongRun.toFixed(2)} mi</strong>
            </div>
          </div>

          {upcoming.length === 0 && (
            <div style={{ fontSize: 12, color: "#445", padding: "16px 0" }}>No upcoming races.</div>
          )}

          <div style={{ display: "grid", gap: "8px" }}>
            {upcoming.map(race => {
              const a = assess(race)
              const projected = getProjectedLongRun(race.date)
              const weeksOut = weeksBetween(race.date)
              const isGoalRace = race.dist_mi >= 13
              return (
                <div key={race.date + race.name} style={{
                  padding: "10px 14px",
                  background: a.bg,
                  border: `1px solid ${a.border}`,
                  borderLeft: `3px solid ${a.color}`,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  flexWrap: "wrap"
                }}>
                  <div style={{ minWidth: 60, textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "#555" }}>
                      {new Date(race.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div style={{ fontSize: 11, color: "#667" }}>{weeksOut}w</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isGoalRace ? "#ffd166" : "#e0e0e0" }}>
                        {race.name} {isGoalRace ? "★" : ""}
                      </span>
                      <span style={{ fontSize: 10, color: "#555" }}>{race.city}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#667" }}>{race.note}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: a.color }}>{a.label}</div>
                    <div style={{ fontSize: 10, color: "#555" }}>
                      {race.dist_mi.toFixed(1)} mi
                      {projected != null ? ` · plan ${projected.toFixed(1)} mi` : ""}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 12, fontSize: "10px", color: "#445", lineHeight: 1.6 }}>
            Ready = race distance ≤ 85% of planned long run · On target = within 5% · Stretch = up to 25% above · Skip = not recommended
          </div>
        </div>
      )
    })()}

  </div>
)}
{tab === "Import" && (
  <ImportTab
    canonicalSessions={canonicalSessions}
    setCanonicalSessions={setCanonicalSessions}
    setHealthFitDaily={setHealthFitDaily}
    setSleepRecords={setSleepRecords}
    setBiometricRecords={setBiometricRecords}
    setSchedLog={setSchedLog}
    healthFitDaily={healthFitDaily}
    biometricRecords={biometricRecords}
    ocItems={ocItems}
  />
)}

      
{tab !== "Overview" && tab !== "Composition" && tab !== "Calories" && tab !== "Capacity" && tab !== "Forecast" && tab !== "Schedule" && tab !== "Training" && tab !== "Import" && tab !== "Log" && (
  <div>
    <h3>{tab}</h3>
    <div>This tab is next.</div>
  </div>
)}
    </div>
  </ErrorBoundary>
  <TrainerPanel
    sessions60={trainerSessions60}
    ocItems={ocItems}
    tsbData={tsbV2Panel}
    raceCalendar={RACE_CALENDAR}
    liftConfig={LIFT_CONFIG}
    onLogMtp={trainerLogMtp}
    onLogWeight={trainerLogWeight}
    onLogExercise={trainerLogExercise}
    onLogRun={trainerLogRun}
    onLogMeal={trainerLogMeal}
    biometricRecords={biometricRecords}
    sleepRecords={sleepRecords}
    mealRecords={mealRecords}
  />
  </>
  )
}
