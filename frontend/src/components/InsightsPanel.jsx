// Insights panel — panel revision item 8 ("Provide Insights").
//
// Item 8 was raised separately from item 7 (trend badges), so this answers it
// with something item 7 does not: plain-language findings a supervisor can read
// aloud, including the things a per-card badge can't express — which pipeline
// stage is slowest, how concentrated repeat offenders are, and the cross-
// barangay point that is the whole thesis.
//
// It does NOT re-fetch or recompute anything. The backend already returns
// `stats.trend` (percentage deltas vs the previous equal-length period) and
// `stats.date_range` (with prev_start/prev_end). Reading those directly is what
// keeps the panel's wording consistent with the StatCard badges on the same
// screen — two presentations of one server-computed truth, never a second
// opinion that might disagree.

const MIN_SAMPLE = 5

const fmtMin = (m) => {
  if (m == null) return '-'
  if (m < 60) return `${Math.round(m)} min`
  const h = m / 60
  if (h < 48) return `${h.toFixed(1)} hrs`
  return `${(h / 24).toFixed(1)} days`
}

const dir = (n) => (n > 0 ? 'up' : 'down')
const has = (v) => v != null && !Number.isNaN(v)

// --- Supervisor / Admin -----------------------------------------------------
// Accountable for district throughput, response pressure, and repeat offenders.
export function deriveSupervisorInsights(stats) {
  if (!stats || Object.keys(stats).length === 0) return []
  const t = stats.trend ?? {}
  const out = []

  const submitted = stats.reports_submitted ?? stats.total_submitted ?? 0
  if (submitted < MIN_SAMPLE) {
    return [{
      tone: 'neutral',
      text: `Only ${submitted} ${submitted === 1 ? 'report' : 'reports'} in this period — too few to read a trend from. Widen the period for a meaningful comparison.`,
    }]
  }

  // 1. Volume trend (server-computed).
  if (has(t.reports_submitted) && Math.abs(t.reports_submitted) >= 5) {
    out.push({
      tone: t.reports_submitted > 0 ? 'warning' : 'positive',
      text: `Reports submitted are ${dir(t.reports_submitted)} ${Math.abs(t.reports_submitted)}% versus the previous period.`,
    })
  }

  // 2. Resolution rate trend.
  if (has(t.resolution_rate) && Math.abs(t.resolution_rate) >= 3) {
    out.push({
      tone: t.resolution_rate > 0 ? 'positive' : 'warning',
      text: `Resolution rate is ${dir(t.resolution_rate)} ${Math.abs(t.resolution_rate)}% versus the previous period, now at ${stats.resolution_rate ?? 0}%.`,
    })
  }

  // 3. Slowest pipeline stage — actionable, not just descriptive. Uses absolute
  //    values (not the trend) because "where is the bottleneck" is a snapshot.
  const stages = [
    { name: 'barangay verification', v: stats.avg_verify_time_minutes ?? stats.avg_verify_min },
    { name: 'MTPB acknowledgement', v: stats.avg_acknowledgment_time_minutes ?? stats.avg_mtpb_response_min },
    { name: 'supervisor escalation', v: stats.avg_escalation_min },
  ].filter(s => has(s.v) && s.v > 0)
  if (stages.length) {
    const slow = stages.reduce((a, b) => (b.v > a.v ? b : a))
    out.push({
      tone: 'neutral',
      text: `The slowest stage is ${slow.name}, averaging ${fmtMin(slow.v)}.`,
    })
  }

  // 4. Repeat-offender concentration — the cross-barangay argument, quantified.
  const ro = stats.total_repeat_offenders ?? 0
  if (ro > 0) {
    out.push({
      tone: 'warning',
      text: `${ro} ${ro === 1 ? 'vehicle has' : 'vehicles have'} 2 or more confirmed violations across the district — visible only because barangay records are shared.`,
    })
  }

  // 5. Live backlog pressure (point-in-time, not period-scoped).
  const escalated = stats.escalated_now ?? 0
  const pending = stats.pending_now ?? 0
  if (escalated > 0) {
    out.push({
      tone: 'warning',
      text: `${escalated} ${escalated === 1 ? 'report has' : 'reports have'} escalated past the MTPB response window and need supervisor action now.`,
    })
  } else if (pending > 0) {
    out.push({ tone: 'neutral', text: `${pending} ${pending === 1 ? 'report is' : 'reports are'} awaiting barangay review.` })
  }

  return out
}

// --- Barangay official / captain --------------------------------------------
// Accountable for review speed and review quality in their own barangay.
export function deriveBarangayInsights(stats) {
  if (!stats || Object.keys(stats).length === 0) return []
  const t = stats.trend ?? {}
  const out = []
  const reviewed = (stats.verified ?? 0) + (stats.rejected ?? 0)

  if (reviewed < MIN_SAMPLE && (stats.pending ?? 0) === 0) {
    return [{
      tone: 'neutral',
      text: `Only ${reviewed} ${reviewed === 1 ? 'report' : 'reports'} reviewed in this period — too few to read a trend from. Widen the period for a meaningful comparison.`,
    }]
  }

  // 1. Rejection rate — quality signal.
  if (reviewed >= MIN_SAMPLE) {
    const rejRate = Math.round(((stats.rejected ?? 0) / reviewed) * 100)
    out.push({
      tone: rejRate > 40 ? 'warning' : 'neutral',
      text: rejRate > 40
        ? `${rejRate}% of reviewed reports were declined — a high rate can point to unclear photos or reports filed outside the posted rules.`
        : `${rejRate}% of reviewed reports were declined (${stats.rejected ?? 0} of ${reviewed}).`,
    })
  }

  // 2. Review-speed trend (server-computed).
  if (has(t.avg_review_min) && Math.abs(t.avg_review_min) >= 10) {
    out.push({
      tone: t.avg_review_min > 0 ? 'warning' : 'positive',
      text: `Average review time is ${dir(t.avg_review_min)} ${Math.abs(t.avg_review_min)}% versus the previous period, now ${fmtMin(stats.avg_review_min)}.`,
    })
  } else if (has(stats.avg_review_min) && stats.avg_review_min > 0) {
    out.push({ tone: 'neutral', text: `Average review time is ${fmtMin(stats.avg_review_min)}.` })
  }

  // 3. Backlog — the one thing an official can act on immediately.
  const pending = stats.pending ?? 0
  if (pending > 0) {
    out.push({
      tone: pending > 5 ? 'warning' : 'neutral',
      text: `${pending} ${pending === 1 ? 'report is' : 'reports are'} waiting for your review. Reports only reach MTPB after a barangay official verifies them.`,
    })
  }

  return out
}

const TONES = {
  positive: { dot: 'var(--color-resolved, #059669)' },
  warning:  { dot: '#B45309' },
  neutral:  { dot: 'var(--color-text-muted)' },
}

export default function InsightsPanel({ insights, periodLabel }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      marginBottom: 24,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Insights
        </span>
        {periodLabel && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{periodLabel}</span>
        )}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {insights.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Nothing stands out in this period. Widen the period to compare across more activity.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.map((ins, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 999, marginTop: 6, flexShrink: 0,
                  background: (TONES[ins.tone] ?? TONES.neutral).dot,
                }} />
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
                  {ins.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
