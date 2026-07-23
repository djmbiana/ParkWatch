import { useState } from 'react'
import { Calendar } from 'lucide-react'

// Controlled date-range picker shared by every dashboard/analytics page.
// value: { range: 'today'|'7d'|'30d'|'60d'|'custom', start_date?, end_date? }
// onChange receives a value shaped for direct use as API query params:
//   preset  -> { range: '7d' }
//   custom  -> { start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD' }
const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d',    label: 'Last 7 Days' },
  { value: '30d',   label: 'Last 30 Days' },
  { value: '60d',   label: 'Last 60 Days' },
  { value: 'custom', label: 'Custom Range...' },
]

const todayStr = () => new Date().toISOString().slice(0, 10)

const fmtShort = (isoDate) => new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

// Turns a backend { start, end, label, preset } date_range into display text —
// "Last 7 Days" for a known preset, or a formatted "Jun 20 - Jul 19, 2026" for
// a custom range. Used next to stat-card groups so every dashboard visibly
// states what period its numbers cover.
export function formatDateRangeLabel(dateRange) {
  if (!dateRange) return ''
  const preset = PRESETS.find(p => p.value === dateRange.preset)
  if (preset) return preset.label
  if (dateRange.start === dateRange.end) return fmtShort(dateRange.start)
  return `${fmtShort(dateRange.start)} - ${fmtShort(dateRange.end)}`
}

const PRESET_COMPARE_LABEL = {
  today: 'vs yesterday',
  '7d':  'vs previous 7 days',
  '30d': 'vs previous 30 days',
  '60d': 'vs previous 60 days',
}

// Describes what a trend percentage (StatCard) was compared against, e.g.
// "vs previous 7 days" for a preset, or an exact "vs Jun 13 - Jun 19" for a
// custom range — backend sends prev_start/prev_end alongside the current
// date_range (see dateRange.js resolveDateRange). Without this, a "▼ 48%"
// badge doesn't say what it's measured against and reads as unexplained.
export function formatCompareLabel(dateRange) {
  if (!dateRange) return ''
  const known = PRESET_COMPARE_LABEL[dateRange.preset]
  if (known) return known
  if (dateRange.prev_start && dateRange.prev_end) {
    return dateRange.prev_start === dateRange.prev_end
      ? `vs ${fmtShort(dateRange.prev_start)}`
      : `vs ${fmtShort(dateRange.prev_start)} - ${fmtShort(dateRange.prev_end)}`
  }
  return 'vs previous period'
}

export default function DateRangeFilter({ value, onChange }) {
  const selected = value?.range ?? '30d'
  const [customStart, setCustomStart] = useState(value?.start_date ?? todayStr())
  const [customEnd, setCustomEnd] = useState(value?.end_date ?? todayStr())

  const handlePresetChange = (e) => {
    const next = e.target.value
    if (next === 'custom') {
      onChange({ range: 'custom', start_date: customStart, end_date: customEnd })
    } else {
      onChange({ range: next })
    }
  }

  const applyCustom = () => {
    if (!customStart || !customEnd) return
    onChange({ range: 'custom', start_date: customStart, end_date: customEnd })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Calendar size={14} style={{ color: 'var(--color-text-muted)' }} />
      <select value={selected} onChange={handlePresetChange}
        style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
        {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {selected === 'custom' && (
        <>
          <input type="date" value={customStart} max={customEnd} onChange={e => setCustomStart(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text-primary)' }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>to</span>
          <input type="date" value={customEnd} min={customStart} max={todayStr()} onChange={e => setCustomEnd(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text-primary)' }} />
          <button onClick={applyCustom}
            style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Apply
          </button>
        </>
      )}
    </div>
  )
}
