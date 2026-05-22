import { useEffect, useRef } from 'react'

const SNAPSHOT_KEY = 'lift_metric_snapshot'
const PREV_SNAPSHOT_KEY = 'lift_metric_snapshot_prev'

// Stores current metric values on mount.
// Returns the previous session snapshot for delta comparison.
export function useMetricSnapshot(currentValues) {
  const initialPrev = useRef(() => {
    try {
      const raw = localStorage.getItem(PREV_SNAPSHOT_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })
  const prevSnapshot = initialPrev.current
  useEffect(() => {
    if (!currentValues || typeof currentValues !== 'object') return
    try {
      const existing = localStorage.getItem(SNAPSHOT_KEY)
      if (existing) localStorage.setItem(PREV_SNAPSHOT_KEY, existing)
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(currentValues))
    } catch {}
  }, [])  // runs once on mount only
  return typeof prevSnapshot === 'function' ? prevSnapshot() : prevSnapshot
}
