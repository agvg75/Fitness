import test from "node:test"
import assert from "node:assert/strict"
import {
  buildTrainingEvents,
  normalizeSessionType,
  reentryFactor,
  summarizeRecentTraining,
} from "./recentTrainingFocus.js"

const TODAY = "2026-06-30"

function daysAgo(n) {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function every(domain, ages, extra = {}) {
  return ages.map(age => ({ date: daysAgo(age), domain, ...extra }))
}

function range(from, to, step) {
  const out = []
  for (let i = from; i <= to; i += step) out.push(i)
  return out
}

test("source labels map to one domain and non-training labels are ignored", () => {
  assert.equal(normalizeSessionType("Traditional Strength Training"), "strength")
  assert.equal(normalizeSessionType("Outdoor Running"), "run")
  assert.equal(normalizeSessionType("Indoor Cycling"), "bike")
  assert.equal(normalizeSessionType("Pool Swim"), "swim")
  assert.equal(normalizeSessionType("Cooldown"), null)
  assert.equal(normalizeSessionType(null), null)
})

test("re-entry factor steps down with time away and never rises", () => {
  const factors = [0, 10, 11, 21, 22, 42, 43, 84, 85, 400].map(d => reentryFactor(d))
  assert.deepEqual(factors, [1, 1, 0.9, 0.9, 0.8, 0.8, 0.7, 0.7, 0.6, 0.6])
  assert.equal(reentryFactor(null), 0.6)
})

test("no events yields a fresh-start suggestion instead of the full program", () => {
  const s = summarizeRecentTraining([], { today: TODAY })
  assert.equal(s.status, "no_data")
  assert.equal(s.recommendedDaysThisWeek, null)
  assert.equal(s.focus.length, 1)
  assert.equal(s.focus[0].id, "check-data")
})

test("a layoff recommends a short re-entry week at reduced load", () => {
  const events = every("strength", range(20, 110, 2))
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.status, "layoff")
  assert.equal(s.dataAgeDays, 20)
  assert.equal(s.recommendedDaysThisWeek, 3)
  assert.equal(s.focus[0].id, "reentry")
  assert.match(s.focus[0].reason, /verify that training was logged/i)
})

test("a gap inside the month counts as returning even after one fresh session", () => {
  const events = [...every("strength", [1]), ...every("strength", range(14, 110, 2))]
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.status, "returning")
  assert.equal(s.longestRecentGapDays, 12)
  assert.ok(s.recommendedDaysThisWeek < 7)
})

test("weekly target grows one day from the recent average, not to the plan", () => {
  const events = every("strength", range(1, 110, 3)) // about 2.3 days per week
  const s = summarizeRecentTraining(events, { today: TODAY, planDaysPerWeek: 7 })
  assert.equal(s.status, "steady")
  assert.equal(s.recommendedDaysThisWeek, 3)
  assert.match(s.headline, /schedule lists 7 planned training days/)
})

test("weekly target never exceeds the plan", () => {
  const events = every("strength", range(0, 110, 1))
  const s = summarizeRecentTraining(events, { today: TODAY, planDaysPerWeek: 5 })
  assert.equal(s.recommendedDaysThisWeek, 5)
})

test("a modality that was a habit and stopped is the first focus", () => {
  const events = [
    ...every("strength", range(1, 110, 3)),
    ...every("run", range(30, 110, 4)), // regular, then nothing for 30 days
  ]
  const s = summarizeRecentTraining(events, { today: TODAY })
  const run = s.domains.find(d => d.id === "run")
  assert.equal(run.state, "lapsed")
  assert.equal(run.daysSince, 30)
  assert.equal(s.focus[0].id, "domain:run")
  assert.match(s.focus[0].reason, /adjust duration and load/i)
})

test("something overdue outranks something that only thinned out but was done this week", () => {
  const events = [
    ...every("run", range(1, 110, 4)),
    ...every("strength", range(13, 110, 4)),          // regular, then 13 days without
    ...every("bike", [2]), ...every("bike", range(30, 110, 5)), // thinner, but done 2 days ago
  ]
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.domains.find(d => d.id === "strength").state, "overdue")
  assert.equal(s.domains.find(d => d.id === "bike").state, "fading")
  assert.equal(s.focus[0].id, "domain:strength")
  assert.match(s.focus[0].reason, /adjust duration and load/i)
  assert.equal(s.focus[1].id, "domain:bike")
})

test("a modality tried once long ago is not treated as something to restore", () => {
  const events = [...every("strength", range(1, 110, 3)), ...every("swim", [100])]
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.ok(!s.focus.some(f => f.id === "domain:swim"))
})

test("a sudden jump in frequency is flagged and held", () => {
  const events = [...every("strength", [0, 1, 2, 3, 4, 5]), ...every("strength", range(8, 110, 7))]
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.status, "ramping")
  assert.equal(s.focus[0].id, "hold")
  assert.equal(s.recommendedDaysThisWeek, 2)
})

test("a consistent month with a lopsided split suggests the neglected pattern", () => {
  const ages = range(1, 110, 2)
  const events = [
    ...every("strength", ages),
    ...every("strength", ages, { pattern: "upper_push", sets: 9 }),
    ...every("strength", ages, { pattern: "upper_pull", sets: 6 }),
    ...every("strength", ages, { pattern: "posterior_chain", sets: 2 }),
  ]
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.status, "steady")
  assert.equal(s.focus[0].id, "pattern:posterior_chain")
})

test("a consistent, balanced month says to progress as programmed", () => {
  const events = every("strength", range(1, 110, 2))
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.focus[0].id, "progress")
})

test("future-dated and very old records are ignored", () => {
  const events = [{ date: "2027-01-01", domain: "run" }, { date: "2020-01-01", domain: "run" }]
  assert.equal(summarizeRecentTraining(events, { today: TODAY }).status, "no_data")
})

test("stale data is reported so advice is not mistaken for current", () => {
  const s = summarizeRecentTraining(every("strength", range(7, 110, 2)), { today: TODAY })
  assert.equal(s.dataIsStale, true)
  assert.equal(s.dataThrough, daysAgo(7))
})

test("events are built from canonical sessions and the schedule log without double counting days", () => {
  const events = buildTrainingEvents({
    canonicalSessions: [
      { start_date: `${daysAgo(1)}T12:00:00.000Z`, canonical_type: "Traditional Strength Training", duration_min: 50 },
      { start_date: `${daysAgo(2)}T12:00:00.000Z`, canonical_type: "bike", duration_min: 28 },
      { start_date: `${daysAgo(2)}T13:00:00.000Z`, canonical_type: "Cooldown", duration_min: 5 },
    ],
    scheduleLog: [{
      date: daysAgo(1),
      exercises: [{ exercise_name: "Chest Press", actual: { sets: "3", reps: "10", load: "70" } }],
      cardio: [{ name: "Easy run" }],
    }],
    patternOf: ex => (/press/i.test(ex.exercise_name) ? "upper_push" : null),
  })
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.activeDays.recent, 2)
  assert.equal(s.domains.find(d => d.id === "strength").sessionsRecent, 1)
  assert.equal(s.patterns.find(p => p.id === "upper_push").setsRecent, 3)
  assert.ok(s.domains.some(d => d.id === "run"))
})

test("invalid calendar dates do not contribute training days", () => {
  const s = summarizeRecentTraining([{ date: "2026-02-31", domain: "run" }], { today: TODAY })
  assert.equal(s.status, "no_data")
})

test("excluded canonical sessions and cardio-only schedule exercises do not count as strength", () => {
  const e = buildTrainingEvents({
    canonicalSessions: [{ date: daysAgo(1), canonical_type: "Running", excluded: true }],
    scheduleLog: [{ date: daysAgo(2), exercises: [{ variant: "cardio", exercise_name: "Run" }] }],
  })
  assert.equal(e.length, 0)
})

test("limited program frequency never generates an impossible two-day minimum", () => {
  const s = summarizeRecentTraining(every("strength", range(1, 110, 3)), { today: TODAY, planDaysPerWeek: 1 })
  assert.equal(s.recommendedDaysThisWeek, 1)
})

test("insufficient prior baseline is disclosed", () => {
  const s = summarizeRecentTraining(every("run", [1, 3]), { today: TODAY })
  assert.match(s.headline, /Insufficient historical records/)
})

test("a returning gap exposes an illustrative, not automatic, comeback plan", () => {
  const events = [...every("strength", [1]), ...every("strength", range(17, 110, 2))]
  const s = summarizeRecentTraining(events, { today: TODAY })
  assert.equal(s.status, "returning")
  assert.equal(s.reentryPlan.weeks, 1)
  assert.ok(s.comebacks >= 1)
})
test("a long record gap is labeled stale even if an illustrative ramp is available", () => {
  const s = summarizeRecentTraining(every("strength", range(56, 110, 7)), { today: TODAY })
  assert.equal(s.dataIsStale, true)
  assert.equal(s.reentryPlan.weeks, 4)
})
test("no events give no calculated comeback", () => {
  const s = summarizeRecentTraining([], { today: TODAY })
  assert.equal(s.reentryPlan, null)
  assert.equal(s.comebacks, 0)
})
