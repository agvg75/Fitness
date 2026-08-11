import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { CARDIO } from "../scheduleData.js"
import {
  buildPrescribedPlanExercises,
  filterActivePlanFieldOverrides,
  filterRenderableCustomExercises,
  isPlanDayRenderable,
  reorderActivePlanExercises,
} from "./scheduleAuthority.js"

const TUESDAY_IDS = ["t1", "t_abd", "t2a", "t2b", "t_hec", "t6b", "t7", "t8"]
const WEDNESDAY_TENDON_IDS = [
  "tibialis_raise_wed",
  "eccentric_calf_raise_wed",
  "hip_flexor_iso_wed",
  "face_pull_band_wed",
  "tke_band_wed",
  "eccentric_bicep_curl_wed",
  "arm_pump_curl_wed",
  "arm_pump_pushdown_wed",
]

const exercise = (id, name = id) => ({ id, name, def: [{ r: "8", w: "10" }] })
const planDay = ids => ({ sections: [{ h: "Main", ex: ids.map(id => exercise(id)) }] })

function extractBalanced(source, startIndex, open, close) {
  let depth = 0
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1
    if (source[index] === close) depth -= 1
    if (depth === 0) return source.slice(startIndex, index + 1)
  }
  throw new Error(`Unbalanced ${open}${close}`)
}

async function readCurrentPlanDay(day, nextDay) {
  const source = await readFile(new URL("../App.jsx", import.meta.url), "utf8")
  const start = source.indexOf(`  ${day}: {`, source.indexOf("const PLAN ="))
  const end = source.indexOf(`  ${nextDay}: {`, start)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

test("current Tuesday PLAN has exactly the approved August strength IDs", async () => {
  const tuesday = await readCurrentPlanDay("Tue", "Wed")
  const sectionsStart = tuesday.indexOf("sections: [") + "sections: ".length
  const sections = extractBalanced(tuesday, sectionsStart, "[", "]")
  const ids = [...sections.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(ids, TUESDAY_IDS)
})

test("persisted custom Hip Adduction cannot enter prescribed Tuesday", () => {
  const tuesday = planDay(TUESDAY_IDS)
  const prescribed = buildPrescribedPlanExercises(tuesday)
  const customRegistryEntry = { stable_id: "custom_hip_adduction", exercise_name: "Hip Adduction", program_days: ["Tue"] }
  assert.deepEqual(prescribed.map(item => item.id), TUESDAY_IDS)
  assert.equal(prescribed.some(item => item.id === customRegistryEntry.stable_id), false)
})

test("saved ordering reorders active IDs but cannot add a ninth ID", () => {
  const prescribed = buildPrescribedPlanExercises(planDay(TUESDAY_IDS))
  const ordered = reorderActivePlanExercises(prescribed, ["f2", "t8", "t1"])
  assert.deepEqual(ordered.map(item => item.id), ["t8", "t1", "t_abd", "t2a", "t2b", "t_hec", "t6b", "t7"])
})

test("prior-session fields for an absent exercise cannot resurrect it", () => {
  const filtered = filterActivePlanFieldOverrides(planDay(TUESDAY_IDS), {
    t1: { load: "165" },
    f2: { load: "90" },
  })
  assert.deepEqual(filtered, { t1: { load: "165" } })
})

test("legitimate one-off custom work remains separate while canonical cross-day work is hidden", () => {
  const plan = {
    Tue: planDay(TUESDAY_IDS),
    Fri: { sections: [{ h: "Hip Isolation", ex: [exercise("f2", "Hip Adduction")] }] },
  }
  const visible = filterRenderableCustomExercises([
    { id: "custom_carries", n: "Farmer Carries" },
    { id: "custom_hip_adduction", n: "Hip Adduction" },
  ], plan)
  assert.deepEqual(visible.map(item => item.id), ["custom_carries"])
})

test("current Wednesday remains renderable with zero strength and eight tendon entries", async () => {
  const wednesday = await readCurrentPlanDay("Wed", "Thu")
  assert.equal(/sections:\s*\[/.test(wednesday), false)
  const tendonStart = wednesday.indexOf("tendon: [") + "tendon: ".length
  const tendon = extractBalanced(wednesday, tendonStart, "[", "]")
  const tendonIds = [...tendon.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(tendonIds, WEDNESDAY_TENDON_IDS)
  assert.equal(Array.isArray(CARDIO.Wed?.sessions), true)
  assert.equal(CARDIO.Wed.sessions.length, 1)
  assert.equal(isPlanDayRenderable({ sections: [], tendon: tendonIds.map(id => ({ id })) }, CARDIO.Wed), true)
})
