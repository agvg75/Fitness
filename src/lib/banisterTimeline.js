// Compute TSB from a complete daily calendar rather than only session days.
// Preserve LIFT's existing Euler-update equations and (pre-day) TSB definition.
// This changes chronology, not the fitted tau constants or TRIMP estimates.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86400000

const dateMs = key => ISO_DAY.test(String(key || "")) ? Date.parse(key + "T00:00:00Z") : NaN
const round1 = value => Math.round(value * 10) / 10

export function calculateBanisterFromDailyTrimp(dailyTrimp, { tau1, tau2, asOfDate }) {
  if (!(tau1 > 0 && tau2 > 0)) throw new Error("Both Banister time constants must be positive")
  const asOfMs = dateMs(asOfDate)
  if (!Number.isFinite(asOfMs)) throw new Error("asOfDate must be a valid ISO date")

  const entries = Object.entries(dailyTrimp || {})
    .filter(([date, load]) => Number.isFinite(dateMs(date)) && dateMs(date) <= asOfMs &&
      Number.isFinite(Number(load)) && Number(load) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return null

  const loads = Object.fromEntries(entries.map(([date, load]) => [date, Number(load)]))
  let ctl = 0, atl = 0, prevCtl = 0, prevAtl = 0
  for (let time = dateMs(entries[0][0]); time <= asOfMs; time += DAY_MS) {
    const key = new Date(time).toISOString().slice(0, 10)
    prevCtl = ctl
    prevAtl = atl
    const load = loads[key] || 0
    ctl += (load - ctl) / tau1
    atl += (load - atl) / tau2
  }
  const out = {
    ctl: round1(ctl),
    atl: round1(atl),
    tsb: round1(prevCtl - prevAtl),
    dailyTrimp: loads
  }
  out.global = out
  return out
}
