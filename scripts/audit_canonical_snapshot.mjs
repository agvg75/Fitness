// Non-destructive audit of the bundled canonical-session snapshot.
// This is not the signed-in user's live Supabase history.
import fs from "node:fs"
import { dedupeCanonicalSessions } from "../src/lib/canonicalSessions.js"

const path = new URL("../public/data/workout_sessions_canonical.json", import.meta.url)
if (!fs.existsSync(path)) {
  console.warn("[canonical audit] Snapshot absent; skipping non-blocking historical audit")
  process.exit(0)
}
const parsed = JSON.parse(fs.readFileSync(path, "utf8"))
const original = Array.isArray(parsed) ? parsed : parsed?.all_sessions
if (!Array.isArray(original)) throw new Error("Canonical snapshot is not an array")

const input = structuredClone(original)
const deduped = dedupeCanonicalSessions(input)
const ids = new Set(deduped.map(session => session?.session_id).filter(Boolean))
const dropped = original.filter(session => session?.session_id && !ids.has(session.session_id))
const bySource = entries => Object.fromEntries(
  Object.entries(entries.reduce((out, entry) => {
    const key = String(entry?.preferred_metrics?.distance?.source || "unspecified")
    out[key] = (out[key] || 0) + 1
    return out
  }, {})).sort((a,b) => b[1] - a[1])
)

const output = {
  snapshotCount: original.length,
  retainedCount: deduped.length,
  removedCount: original.length - deduped.length,
  removedBySource: bySource(dropped),
  earliest: original.reduce((v,s) => !v || String(s.start_date) < v ? String(s.start_date) : v, null)?.slice(0,10),
  latest: original.reduce((v,s) => !v || String(s.start_date) > v ? String(s.start_date) : v, null)?.slice(0,10),
  source: "bundled GitHub snapshot, not current Supabase"
}
console.log("[canonical audit baseline]", JSON.stringify(output))
// Report only. A change in these counts requires review, not automatic deletion.
// No database writes, no runtime state changes, no deployment block on a changed count.
