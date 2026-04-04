import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"

const env = readFileSync(".env", "utf8")
const get = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim()

const supabase = createClient(get("VITE_SUPABASE_URL"), get("VITE_SUPABASE_ANON_KEY"))

const data = JSON.parse(readFileSync("public/data/workout_sessions_canonical.json", "utf8"))
const sessions = data.all_sessions

console.log(`Pushing ${sessions.length} sessions to Supabase...`)

const BATCH = 100
let upserted = 0
for (let i = 0; i < sessions.length; i += BATCH) {
  const batch = sessions.slice(i, i + BATCH)
  const { error } = await supabase.from("workout_sessions").upsert(batch, { onConflict: "session_id" })
  if (error) { console.error("Error at batch", i, error.message); process.exit(1) }
  upserted += batch.length
  console.log(`  ${upserted}/${sessions.length}`)
}

console.log("Done.")
