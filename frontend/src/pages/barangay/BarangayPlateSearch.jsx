import { useEffect, useState, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import { vehicles } from '../../services/api'
import PlateBadge from '../../components/PlateBadge'
import RepeatOffenderBadge from '../../components/RepeatOffenderBadge'
import StatusBadge from '../../components/StatusBadge'
import PenaltyTierBadge from '../../components/PenaltyTierBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import useMediaQuery from '../../hooks/useMediaQuery'

const VIOLATION_TYPES = [
  'Parked on Sidewalk', 'Parked on Pedestrian Lane', 'Parked on Yellow Line',
  'Parked in No Parking Zone', 'Double Parking', 'Blocking Driveway or Entrance',
  'Wrong Side Parking', 'Parked at Intersection or Corner',
  'Parked in Front of Fire Hydrant', 'Parked in Bus or Jeepney Stop Zone',
]

const selectStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, color: '#0F1117', background: 'var(--color-surface)', cursor: 'pointer' }

export default function BarangayPlateSearch() {
  const { setPageTitle } = useOutletContext()
  useEffect(() => { setPageTitle('Violation History') }, [setPageTitle])

  const isMobile = useMediaQuery('(max-width: 767px)')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [lastQuery, setLastQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [filterDateFrom,  setFilterDateFrom]  = useState('')
  const [filterDateTo,    setFilterDateTo]    = useState('')
  const [filterBarangay,  setFilterBarangay]  = useState('all')
  const [filterStreet,    setFilterStreet]    = useState('all')
  const [filterViolation, setFilterViolation] = useState('all')

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    setLastQuery(query.trim().toUpperCase())
    setFilterDateFrom(''); setFilterDateTo(''); setFilterBarangay('all'); setFilterStreet('all'); setFilterViolation('all')
    try {
      const data = await vehicles.history(query.trim())
      setResult(data)
    } catch (err) {
      if (err.message !== 'Forbidden' && err.message !== 'Session expired') setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const barangays = useMemo(() => ['all', ...new Set((result?.history ?? []).map(h => h.barangay_name).filter(Boolean))], [result])
  const streets   = useMemo(() => {
    const base = (result?.history ?? []).filter(h => filterBarangay === 'all' || h.barangay_name === filterBarangay)
    return ['all', ...new Set(base.map(h => h.street_name).filter(Boolean))]
  }, [result, filterBarangay])

  const filtered = useMemo(() => {
    let rows = result?.history ?? []
    if (filterDateFrom)       rows = rows.filter(h => h.submitted_at && new Date(h.submitted_at) >= new Date(filterDateFrom))
    if (filterDateTo)         rows = rows.filter(h => h.submitted_at && new Date(h.submitted_at) <= new Date(filterDateTo + 'T23:59:59'))
    if (filterBarangay !== 'all')  rows = rows.filter(h => h.barangay_name  === filterBarangay)
    if (filterStreet   !== 'all')  rows = rows.filter(h => h.street_name    === filterStreet)
    if (filterViolation !== 'all') rows = rows.filter(h => h.violation_type === filterViolation)
    return rows
  }, [result, filterDateFrom, filterDateTo, filterBarangay, filterStreet, filterViolation])

  const hasFilter = filterDateFrom || filterDateTo || filterBarangay !== 'all' || filterStreet !== 'all' || filterViolation !== 'all'

  return (
    <div style={{ maxWidth: 860 }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value.toUpperCase())}
            placeholder="Enter plate number, e.g. ABC 1234"
            style={{
              width: '100%', padding: '10px 12px 10px 38px',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
              fontSize: 14, fontFamily: 'JetBrains Mono, monospace',
              color: '#0F1117', background: 'var(--color-surface)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: '0 24px', borderRadius: 'var(--radius-md)',
            background: 'var(--accent)', color: '#fff',
            border: 'none', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {loading && <LoadingSpinner size={14} color="#fff" />}
          Search
        </button>
      </form>

      {loading && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <LoadingSpinner size={28} />
        </div>
      )}

      {!loading && searched && !result && (
        <div style={{ textAlign: 'center', paddingTop: 40, color: 'var(--color-text-muted)', fontSize: 14 }}>
          No violation history found for {lastQuery}
        </div>
      )}

      {!loading && result && (
        <div>
          {/* Vehicle summary */}
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16,
          }}>
            <PlateBadge plate={result.vehicle?.plate_number} large />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0F1117' }}>
                {result.vehicle?.total_violations ?? 0}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>
                  total violations
                </span>
              </div>
            </div>
            {result.vehicle?.is_repeat_offender && <RepeatOffenderBadge />}
          </div>

          {/* Filter toggle */}
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: hasFilter ? 'var(--accent)' : 'var(--color-surface)',
                color: hasFilter ? '#fff' : '#0F1117',
                border: `1px solid ${hasFilter ? 'var(--accent)' : 'var(--color-border)'}`,
                cursor: 'pointer',
              }}
            >
              <SlidersHorizontal size={14} />
              Filters{hasFilter ? ' (active)' : ''}
            </button>

            {showFilters && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10,
                padding: '14px 16px', background: 'var(--color-surface)',
                border: '1px solid var(--color-border)', borderRadius: 8,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ ...selectStyle, fontFamily: 'Inter, sans-serif' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...selectStyle, fontFamily: 'Inter, sans-serif' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Barangay</label>
                  <select value={filterBarangay} onChange={e => { setFilterBarangay(e.target.value); setFilterStreet('all') }} style={selectStyle}>
                    {barangays.map(b => <option key={b} value={b}>{b === 'all' ? 'All Barangays' : b}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Street</label>
                  <select value={filterStreet} onChange={e => setFilterStreet(e.target.value)} style={selectStyle}>
                    {streets.map(s => <option key={s} value={s}>{s === 'all' ? 'All Streets' : s}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Violation</label>
                  <select value={filterViolation} onChange={e => setFilterViolation(e.target.value)} style={selectStyle}>
                    <option value="all">All Violations</option>
                    {VIOLATION_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                {hasFilter && (
                  <button
                    onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterBarangay('all'); setFilterStreet('all'); setFilterViolation('all') }}
                    style={{ ...selectStyle, alignSelf: 'flex-end' }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {/* History table / cards */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
                No records match the current filters
              </div>
            ) : isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                {filtered.map(h => {
                  const Row = ({ label, children }) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 24 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 13, color: '#0F1117', textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
                    </div>
                  )
                  return (
                    <div key={h.report_id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Row label="Date">{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString('en-PH') : '-'}</Row>
                      <Row label="Barangay">{h.barangay_name ?? '-'}</Row>
                      <Row label="Street">{h.street_name ?? '-'}</Row>
                      <Row label="Violation">{h.violation_type ?? '-'}</Row>
                      <Row label="Status"><StatusBadge status={h.status} /></Row>
                      <Row label="Tier"><PenaltyTierBadge tier_name={h.penalty_tier?.tier_name} /></Row>
                    </div>
                  )
                })}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                    {['Date', 'Barangay', 'Street', 'Violation Type', 'Status', 'Penalty Tier'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h => (
                    <tr key={h.report_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}>
                      <td style={{ padding: '0 12px', fontSize: 13, color: '#0F1117' }}>{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString('en-PH') : '-'}</td>
                      <td style={{ padding: '0 12px', fontSize: 13, color: '#0F1117', fontWeight: 500 }}>{h.barangay_name ?? '-'}</td>
                      <td style={{ padding: '0 12px', fontSize: 13, color: '#0F1117' }}>{h.street_name ?? '-'}</td>
                      <td style={{ padding: '0 12px', fontSize: 13, color: '#0F1117' }}>{h.violation_type ?? '-'}</td>
                      <td style={{ padding: '0 12px' }}><StatusBadge status={h.status} /></td>
                      <td style={{ padding: '0 12px' }}><PenaltyTierBadge tier_name={h.penalty_tier?.tier_name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
