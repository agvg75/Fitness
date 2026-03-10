import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const applePath = path.join(__dirname, "../public/data/apple_workouts.json");
const technoPath = path.join(__dirname, "../public/data/technogym_workouts.json");
const overlapsPath = path.join(__dirname, "../public/data/workout_overlaps.json");
const outputPath = path.join(__dirname, "../public/data/workout_sessions_canonical.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function toMs(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function isUsefulWorkout(w) {
  if (!w.start_date || !w.end_date) return false;

  const start = toMs(w.start_date);
  const end = toMs(w.end_date);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;

  const durMin = (end - start) / 60000;

  if (durMin < 0.25) return false;
  if (durMin > 240) return false;

  return true;
}

function minutesBetween(start, end) {
  const s = toMs(start);
  const e = toMs(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return (e - s) / 60000;
}

function safeDurationMin(workout) {
  if (Number.isFinite(Number(workout?.duration_min))) return Number(workout.duration_min);
  return minutesBetween(workout?.start_date, workout?.end_date);
}

function preferredType(apple, techno) {
  const appleType = (apple?.type || "").trim();
  const technoType = (techno?.type || "").trim();

  if (appleType && appleType !== "Other") return appleType;
  if (technoType && technoType !== "Other") return technoType;
  return "Other";
}

function sessionStart(apple, techno) {
  const a = toMs(apple?.start_date);
  const t = toMs(techno?.start_date);
  const vals = [a, t].filter(Number.isFinite);
  if (!vals.length) return null;
  return new Date(Math.min(...vals)).toISOString();
}

function sessionEnd(apple, techno) {
  const a = toMs(apple?.end_date);
  const t = toMs(techno?.end_date);
  const vals = [a, t].filter(Number.isFinite);
  if (!vals.length) return null;
  return new Date(Math.max(...vals)).toISOString();
}

function pickCalories(apple, techno) {
  if (apple?.calories != null) {
    return { value: apple.calories, source: "AppleHealth" };
  }
  if (techno?.calories != null) {
    return { value: techno.calories, source: "Technogym" };
  }
  return { value: null, source: null };
}

function pickHr(apple, techno) {
  if (apple?.hr != null) {
    return { value: apple.hr, source: "AppleHealth" };
  }
  if (techno?.hr != null) {
    return { value: techno.hr, source: "Technogym" };
  }
  return { value: null, source: null };
}

function pickDistance(apple, techno) {
  if (techno?.distance != null) {
    return {
      value: techno.distance,
      source: "Technogym",
      rationale: "Preferred machine distance for machine-linked session"
    };
  }
  if (apple?.distance != null) {
    return {
      value: apple.distance,
      source: "AppleHealth",
      rationale: "Fallback to Apple distance"
    };
  }
  return { value: null, source: null, rationale: null };
}

function sanitizeWorkout(workout) {
  if (!workout) return null;
  return JSON.parse(JSON.stringify(workout));
}

const apple = readJson(applePath).filter(isUsefulWorkout);
const technogym = readJson(technoPath).filter(isUsefulWorkout);
const overlaps = readJson(overlapsPath);

const strongMatches = Array.isArray(overlaps.strong_matches) ? overlaps.strong_matches : [];

const canonicalSessions = [];
const usedAppleIdx = new Set();
const usedTechnoIdx = new Set();

for (const match of strongMatches) {
  const appleWorkout = apple[match.apple_idx];
  const technoWorkout = technogym[match.techno_idx];

  if (!appleWorkout || !technoWorkout) continue;

  const technoDur = safeDurationMin(technoWorkout);
  if (!Number.isFinite(technoDur) || technoDur < 2) continue;

  if (usedAppleIdx.has(match.apple_idx) || usedTechnoIdx.has(match.techno_idx)) {
    continue;
  }

  usedAppleIdx.add(match.apple_idx);
  usedTechnoIdx.add(match.techno_idx);

  const start_date = sessionStart(appleWorkout, technoWorkout);
  const end_date = sessionEnd(appleWorkout, technoWorkout);

  canonicalSessions.push({
    session_id: `sess_${String(canonicalSessions.length + 1).padStart(4, "0")}`,
    match_confidence: "strong",
    relationship: match.classification,
    canonical_type: preferredType(appleWorkout, technoWorkout),
    start_date,
    end_date,
    duration_min: minutesBetween(start_date, end_date),
    overlap_summary: {
      overlap_min: match.overlap_min,
      apple_overlap_fraction: match.apple_overlap_fraction,
      techno_overlap_fraction: match.techno_overlap_fraction,
      start_diff_min: match.start_diff_min,
      end_diff_min: match.end_diff_min
    },
    sources: {
      apple: sanitizeWorkout(appleWorkout),
      technogym: sanitizeWorkout(technoWorkout)
    },
    preferred_metrics: {
      hr: pickHr(appleWorkout, technoWorkout),
      calories: pickCalories(appleWorkout, technoWorkout),
      distance: pickDistance(appleWorkout, technoWorkout),
      power_avg: {
        value: technoWorkout.power_avg ?? null,
        source: technoWorkout.power_avg != null ? "Technogym" : null
      },
      level: {
        value: technoWorkout.level ?? null,
        source: technoWorkout.level != null ? "Technogym" : null
      },
      rpm_avg: {
        value: technoWorkout.rpm_avg ?? null,
        source: technoWorkout.rpm_avg != null ? "Technogym" : null
      },
      vo2: {
        value: technoWorkout.vo2 ?? null,
        source: technoWorkout.vo2 != null ? "Technogym" : null,
        note: "Technogym workout-level VO2 estimate, not equivalent to Apple VO2 max trend"
      }
    }
  });
}

const unmatchedApple = apple
  .map((w, idx) => ({ idx, workout: w }))
  .filter(x => !usedAppleIdx.has(x.idx))
  .map(x => ({
    session_id: `apple_${String(x.idx).padStart(4, "0")}`,
    match_confidence: "unmatched",
    relationship: null,
    canonical_type: (x.workout.type || "Other"),
    start_date: x.workout.start_date || null,
    end_date: x.workout.end_date || null,
    duration_min: safeDurationMin(x.workout),
    overlap_summary: null,
    sources: {
      apple: sanitizeWorkout(x.workout),
      technogym: null
    },
    preferred_metrics: {
      hr: {
        value: x.workout.hr ?? null,
        source: x.workout.hr != null ? "AppleHealth" : null
      },
      calories: {
        value: x.workout.calories ?? null,
        source: x.workout.calories != null ? "AppleHealth" : null
      },
      distance: {
        value: x.workout.distance ?? null,
        source: x.workout.distance != null ? "AppleHealth" : null,
        rationale: x.workout.distance != null ? "Apple-only session" : null
      },
      power_avg: { value: null, source: null },
      level: { value: null, source: null },
      rpm_avg: { value: null, source: null },
      vo2: { value: null, source: null, note: null }
    }
  }));

const unmatchedTechnogym = technogym
  .map((w, idx) => ({ idx, workout: w }))
  .filter(x => !usedTechnoIdx.has(x.idx))
  .filter(x => {
    const d = safeDurationMin(x.workout);
    return Number.isFinite(d) && d >= 2;
  })
  .map(x => ({
    session_id: `techno_${String(x.idx).padStart(4, "0")}`,
    match_confidence: "unmatched",
    relationship: null,
    canonical_type: (x.workout.type || "Other"),
    start_date: x.workout.start_date || null,
    end_date: x.workout.end_date || null,
    duration_min: safeDurationMin(x.workout),
    overlap_summary: null,
    sources: {
      apple: null,
      technogym: sanitizeWorkout(x.workout)
    },
    preferred_metrics: {
      hr: {
        value: x.workout.hr ?? null,
        source: x.workout.hr != null ? "Technogym" : null
      },
      calories: {
        value: x.workout.calories ?? null,
        source: x.workout.calories != null ? "Technogym" : null
      },
      distance: {
        value: x.workout.distance ?? null,
        source: x.workout.distance != null ? "Technogym" : null,
        rationale: x.workout.distance != null ? "Technogym-only machine session" : null
      },
      power_avg: {
        value: x.workout.power_avg ?? null,
        source: x.workout.power_avg != null ? "Technogym" : null
      },
      level: {
        value: x.workout.level ?? null,
        source: x.workout.level != null ? "Technogym" : null
      },
      rpm_avg: {
        value: x.workout.rpm_avg ?? null,
        source: x.workout.rpm_avg != null ? "Technogym" : null
      },
      vo2: {
        value: x.workout.vo2 ?? null,
        source: x.workout.vo2 != null ? "Technogym" : null,
        note: x.workout.vo2 != null ? "Technogym workout-level VO2 estimate" : null
      }
    }
  }));

const allSessions = [...canonicalSessions, ...unmatchedApple, ...unmatchedTechnogym].sort((a, b) => {
  const ta = toMs(a.start_date) ?? 0;
  const tb = toMs(b.start_date) ?? 0;
  return ta - tb;
});

const summary = {
  strong_matches_input: strongMatches.length,
  canonical_linked_sessions: canonicalSessions.length,
  unmatched_apple_sessions: unmatchedApple.length,
  unmatched_technogym_sessions: unmatchedTechnogym.length,
  total_sessions_written: allSessions.length
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      summary,
      linked_sessions: canonicalSessions,
      unmatched_apple: unmatchedApple,
      unmatched_technogym: unmatchedTechnogym,
      all_sessions: allSessions
    },
    null,
    2
  ),
  "utf8"
);

console.log("Canonical session build summary:");
console.log(summary);
console.log("First 5 linked sessions:");
console.log(canonicalSessions.slice(0, 5));