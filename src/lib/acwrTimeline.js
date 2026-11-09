// Calculate acute/chronic ratios before filtering dates for presentation.
// Earlier calendar days remain in the 28-day reference window even when the
// user chooses a shorter chart range.
export function attachAcwrToTimeline(allRows, loadByDate) {
  const rows = Array.isArray(allRows) ? allRows : []
  const prefix = [0]
  rows.forEach(row => {
    const value = Number(loadByDate?.[row.date] ?? 0)
    prefix.push(prefix[prefix.length - 1] + (Number.isFinite(value) && value > 0 ? value : 0))
  })
  return rows.map((row, i) => {
    const acute = (prefix[i + 1] - prefix[Math.max(0, i - 6)]) / 7
    const chronic = (prefix[i + 1] - prefix[Math.max(0, i - 27)]) / 28
    return { ...row, acwr: chronic > 0 ? Math.round(100 * acute / chronic) / 100 : null }
  })
}
