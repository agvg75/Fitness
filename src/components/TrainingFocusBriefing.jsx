import { useMemo, useState } from "react"
import { buildTrainingEvents, summarizeRecentTraining, toDateKey } from "../lib/recentTrainingFocus.js"

const DISMISS_KEY = "lift_focus_briefing_dismissed"

const STATUS_COLORS = {
  layoff: "#f87171",
  returning: "#fb923c",
  ramping: "#fb923c",
  reduced: "#facc15",
  building: "#60a5fa",
  steady: "#4ade80",
  no_data: "#9ca3af",
}

const STATE_LABELS = {
  lapsed: "lapsed",
  overdue: "overdue",
  fading: "thinner",
  steady: "steady",
  building: "building",
  new: "new",
}

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
}

// Opening card: what the last month actually looked like, and where to focus.
// Props: canonicalSessions, schedLog, patternOf(exercise), planDaysPerWeek, onOpenSchedule, today
export default function TrainingFocusBriefing({
  canonicalSessions = [], schedLog = [], patternOf = null, planDaysPerWeek = 7, onOpenSchedule = null, today = null,
}) {
  const todayKey = toDateKey(today ?? new Date())
  const [dismissedOn, setDismissedOn] = useState(readDismissed)
  const [showNumbers, setShowNumbers] = useState(false)

  const summary = useMemo(
    () => summarizeRecentTraining(
      buildTrainingEvents({ canonicalSessions, scheduleLog: schedLog, patternOf }),
      { today: todayKey, planDaysPerWeek }
    ),
    [canonicalSessions, schedLog, patternOf, planDaysPerWeek, todayKey]
  )

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, todayKey) } catch { /* storage unavailable: hide for this visit only */ }
    setDismissedOn(todayKey)
  }

  if (dismissedOn === todayKey) return null

  const accent = STATUS_COLORS[summary.status] || "#9ca3af"
  const rows = [...summary.domains, ...summary.patterns.filter(p => p.sessionsRecent + p.sessionsBaseline > 0)]
  const buttonStyle = {
    background: "none", border: "1px solid #2a2b45", borderRadius: 6, color: "#aab", fontSize: 12,
    padding: "6px 10px", cursor: "pointer", fontFamily: "inherit",
  }

  return (
    <div aria-label="Recent training summary" style={{ marginBottom: 14, padding: "14px 16px", background: "#0d0e1a", border: "1px solid #2a2b45", borderLeft: `3px solid ${accent}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#667", marginBottom: 6 }}>
        Where you are
      </div>
      <div style={{ fontSize: 14, color: "#ced2f0", lineHeight: 1.45, marginBottom: 10 }}>{summary.headline}</div>

      <div style={{ fontSize: 12, color: "#8b90b0", marginBottom: 8 }}>
        Counts reflect recorded training days, not verified individual sessions. Suggested changes are informational, not a substitute for current recovery or injury assessment.
      </div>
      {!summary.dataIsStale && summary.recommendedDaysThisWeek != null && (
        <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 8 }}>
          Possible gradual scheduling step: <strong style={{ color: accent }}>{summary.recommendedDaysThisWeek} training days this week</strong> (not a prescribed workload).
        </div>
      )}

      {summary.dataIsStale && (
        <div role="status" style={{ fontSize: 12, color: "#facc15", margin: "8px 0", lineHeight: 1.45 }}>
          Recent records may be incomplete. Confirm your imports before acting on the priorities below.
        </div>
      )}
      {summary.focus.map((item, index) => (
        <div key={item.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid #1a1b2e" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: accent, minWidth: 14 }}>{index + 1}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{item.title}</div>
            <div style={{ fontSize: 12, color: "#8b90b0", lineHeight: 1.45, marginTop: 2 }}>{item.reason}</div>
          </div>
        </div>
      ))}

      {summary.dataIsStale && summary.dataThrough && (
        <div style={{ fontSize: 12, color: "#facc15", marginTop: 8, lineHeight: 1.45 }}>
          Newest record is from {summary.dataThrough} ({summary.dataAgeDays} days ago). If you trained since then, import or log it before trusting this.
        </div>
      )}

      {showNumbers && rows.length > 0 && (
        <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse", fontSize: 12, color: "#aab" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#667" }}>
              <th style={{ fontWeight: 500, padding: "4px 0" }}></th>
              <th style={{ fontWeight: 500 }}>Last month / wk</th>
              <th style={{ fontWeight: 500 }}>Prior 3 months / wk</th>
              <th style={{ fontWeight: 500 }}>Days since</th>
              <th style={{ fontWeight: 500 }}>State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} style={{ borderTop: "1px solid #1a1b2e" }}>
                <td style={{ padding: "4px 0", color: "#ced2f0" }}>{row.label}</td>
                <td>{row.perWeekRecent}</td>
                <td>{row.perWeekBaseline}</td>
                <td>{row.daysSince ?? "n/a"}</td>
                <td>{STATE_LABELS[row.state] || row.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {onOpenSchedule && (
          <button onClick={onOpenSchedule} style={{ ...buttonStyle, color: "#e5e7eb", borderColor: accent }}>
            Open schedule
          </button>
        )}
        {rows.length > 0 && (
          <button onClick={() => setShowNumbers(v => !v)} style={buttonStyle}>
            {showNumbers ? "Hide the numbers" : "Show the numbers"}
          </button>
        )}
        <button onClick={dismiss} style={buttonStyle}>Hide for today</button>
      </div>
    </div>
  )
}
