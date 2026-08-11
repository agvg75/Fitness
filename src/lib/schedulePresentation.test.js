import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { getPlanExerciseIds } from "./scheduleAuthority.js"
import { openPrimarySectionForSelectedDay } from "./schedulePresentation.js"

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

function extractBalanced(source, startIndex, open, close) {
  let depth = 0
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1
    if (source[index] === close) depth -= 1
    if (depth === 0) return source.slice(startIndex, index + 1)
  }
  throw new Error(`Unbalanced ${open}${close}`)
}

async function currentWednesdaySource() {
  const source = await readFile(new URL("../App.jsx", import.meta.url), "utf8")
  const planStart = source.indexOf("const PLAN =")
  const start = source.indexOf("  Wed: {", planStart)
  const end = source.indexOf("  Thu: {", start)
  return source.slice(start, end)
}

test("current Wednesday retains zero conventional sections and exact tendon membership", async () => {
  const source = await currentWednesdaySource()
  assert.equal(/sections:\s*\[/.test(source), false)
  const tendonStart = source.indexOf("tendon: [") + "tendon: ".length
  const tendon = extractBalanced(source, tendonStart, "[", "]")
  const ids = [...tendon.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(ids, WEDNESDAY_TENDON_IDS)
})

test("a tendon-only day opens Tendon Work as its initial primary section", () => {
  const initial = { main: true, tendon: false, cardio: false }
  const selected = openPrimarySectionForSelectedDay(initial, {
    sections: [],
    tendon: WEDNESDAY_TENDON_IDS.map(id => ({ id })),
  })
  assert.equal(selected.tendon, true)
  assert.equal(selected.cardio, false)
})

test("a normal strength day retains existing Main Program presentation state", () => {
  const initial = { main: true, tendon: false, cardio: false }
  const selected = openPrimarySectionForSelectedDay(initial, {
    sections: [{ h: "Main", ex: [{ id: "t1" }] }],
    tendon: [{ id: "tendon_a" }],
  })
  assert.equal(selected, initial)
  assert.deepEqual(selected, { main: true, tendon: false, cardio: false })
})

test("a tendon-only day remains manually collapsible after initial selection", () => {
  const selected = openPrimarySectionForSelectedDay(
    { main: true, tendon: false, cardio: false },
    { sections: [], tendon: [{ id: "tendon_a" }] }
  )
  const manuallyCollapsed = { ...selected, tendon: false }
  assert.equal(manuallyCollapsed.tendon, false)
})

test("presentation state cannot change prescribed membership", () => {
  const planDay = { sections: [], tendon: WEDNESDAY_TENDON_IDS.map(id => ({ id })) }
  const before = JSON.stringify(planDay)
  openPrimarySectionForSelectedDay({ main: true, tendon: false }, planDay)
  assert.equal(JSON.stringify(planDay), before)
  assert.deepEqual(getPlanExerciseIds(planDay), [])
  assert.deepEqual(planDay.tendon.map(item => item.id), WEDNESDAY_TENDON_IDS)
})
