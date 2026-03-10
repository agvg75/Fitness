import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const applePath = path.join(__dirname, "../public/data/apple_workouts.json");
const technoPath = path.join(__dirname, "../public/data/technogym_workouts.json");
const outputPath = path.join(__dirname, "../public/data/workout_overlaps.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function toMs(s) {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function overlapMs(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function classifyOverlap(a, b, overlap) {
  const aDur = a.end_ms - a.start_ms;
  const bDur = b.end_ms - b.start_ms;

  if (overlap <= 0) return "none";

  const aFrac = overlap / aDur;
  const bFrac = overlap / bDur;

  const startDiffMin = Math.abs(a.start_ms - b.start_ms) / 60000;
  const endDiffMin = Math.abs(a.end_ms - b.end_ms) / 60000;

  if (aFrac > 0.9 && bFrac > 0.9 && startDiffMin < 5 && endDiffMin < 5) {
    return "near_exact";
  }

  if (aFrac > 0.9 && bFrac < 0.9) return "apple_inside_technogym";
  if (bFrac > 0.9 && aFrac < 0.9) return "technogym_inside_apple";

  return "partial_overlap";
}
function isStrongMatch(o) {
  const shorterFrac = Math.max(o.apple_overlap_fraction, o.techno_overlap_fraction)

  return (
    (o.overlap_min >= 5 && shorterFrac >= 0.5) ||
    (o.start_diff_min <= 5 && o.overlap_min >= 2) ||
    (o.end_diff_min <= 5 && o.overlap_min >= 2) ||
    (o.apple_overlap_fraction >= 0.75 && o.overlap_min >= 5) ||
    (o.techno_overlap_fraction >= 0.75 && o.overlap_min >= 5)
  )
}

function isWeakButPossible(o) {
  return (
    o.overlap_min >= 2 &&
    (o.apple_overlap_fraction >= 0.15 || o.techno_overlap_fraction >= 0.15)
  )
}
function isUsefulWorkout(w) {
  if (!w.start_date || !w.end_date) return false

  const start = toMs(w.start_date)
  const end = toMs(w.end_date)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false

  const durMin = (end - start) / 60000

  if (durMin < 0.25) return false
  if (durMin > 240) return false

  return true
}

const appleRaw = readJson(applePath).filter(isUsefulWorkout);
const technoRaw = readJson(technoPath).filter(isUsefulWorkout);

const apple = appleRaw.map((w, i) => ({
  idx: i,
  source: "AppleHealth",
  type: w.type,
  start_date: w.start_date,
  end_date: w.end_date,
  duration_min: w.duration_min,
  start_ms: toMs(w.start_date),
  end_ms: toMs(w.end_date),
}));

const techno = technoRaw.map((w, i) => ({
  idx: i,
  source: "Technogym",
  type: w.type,
  start_date: w.start_date,
  end_date: w.end_date,
  duration_min: w.duration_min,
  start_ms: toMs(w.start_date),
  end_ms: toMs(w.end_date),
}));

const overlaps = [];

for (const t of techno) {
  for (const a of apple) {
    // quick reject if far apart
    if (a.end_ms < t.start_ms || t.end_ms < a.start_ms) continue;

    const ov = overlapMs(a.start_ms, a.end_ms, t.start_ms, t.end_ms);
    if (ov <= 0) continue;

    const aDur = a.end_ms - a.start_ms;
    const tDur = t.end_ms - t.start_ms;

    // Ignore tiny accidental overlaps under 2 minutes and under 20% of shorter session
    const shorter = Math.min(aDur, tDur);
    if (ov < 2 * 60 * 1000 && ov / shorter < 0.2) continue;

    overlaps.push({
      apple_idx: a.idx,
      techno_idx: t.idx,
      apple_type: a.type,
      techno_type: t.type,
      apple_start: a.start_date,
      apple_end: a.end_date,
      techno_start: t.start_date,
      techno_end: t.end_date,
      apple_duration_min: a.duration_min,
      techno_duration_min: t.duration_min,
      overlap_min: ov / 60000,
      apple_overlap_fraction: ov / aDur,
      techno_overlap_fraction: ov / tDur,
      classification: classifyOverlap(a, t, ov),
      start_diff_min: Math.abs(a.start_ms - t.start_ms) / 60000,
      end_diff_min: Math.abs(a.end_ms - t.end_ms) / 60000,
    });
  }
}

// For each Technogym workout, keep the best Apple match by maximum overlap
const bestByTechno = new Map();

for (const o of overlaps) {
  const prev = bestByTechno.get(o.techno_idx);
  if (!prev || o.overlap_min > prev.overlap_min) {
    bestByTechno.set(o.techno_idx, o);
  }
}

const bestMatches = Array.from(bestByTechno.values()).sort((a, b) => {
  return new Date(a.techno_start) - new Date(b.techno_start);
  
});
const strongMatches = bestMatches.filter(isStrongMatch)
const weakMatches = bestMatches.filter(o => !isStrongMatch(o) && isWeakButPossible(o));

const summary = {
  apple_rows: apple.length,
  technogym_rows: techno.length,
  overlap_pairs_found: overlaps.length,
  technogym_rows_with_match: bestMatches.length,
  strong_match_rows: strongMatches.length,
  weak_match_rows: weakMatches.length,
  classifications: {},
};

for (const m of bestMatches) {
  summary.classifications[m.classification] = (summary.classifications[m.classification] || 0) + 1;
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      summary,
      strong_matches: strongMatches,
      weak_matches: weakMatches,
      best_matches: bestMatches,
    },
    null,
    2
  ),
  "utf8"
);

console.log("Overlap summary:");
console.log(summary);
console.log("First 10 strong matches:");
console.log(strongMatches.slice(0, 10));

console.log("First 10 weak matches:");
console.log(weakMatches.slice(0, 10));
