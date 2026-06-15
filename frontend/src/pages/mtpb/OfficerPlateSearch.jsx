import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Search } from 'lucide-react'
import { vehicles } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import PlateBadge from '../../components/PlateBadge'
import RepeatOffenderBadge from '../../components/RepeatOffenderBadge'
import StatusBadge from '../../components/StatusBadge'
import PenaltyTierBadge from '../../components/PenaltyTierBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function OfficerPlateSearch() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [lastQuery, setLastQuery] = useState('')

  useEffect(() => { setPageTitle('Violation History') }, [setPageTitle])

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    setLastQuery(query.trim().toUpperCase())
    try {
      const data = await vehicles.history(query.trim())
      setResult(data)
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
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
              color: 'var(--color-text-primary)', background: 'var(--color-surface)',
              outline: 'none',
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

      {loading && <div style={{ textAlign: 'center', paddingTop: 40 }}><LoadingSpinner size={28} /></div>}
      {!loading && searched && !result && (
        <div style={{ textAlign: 'center', paddingTop: 40, color: 'var(--color-text-muted)', fontSize: 14 }}>
          No violation history found for {lastQuery}
        </div>
      )}
      {!loading && result && (
        <div>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <PlateBadge plate={result.vehicle?.plate_number} large />
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {result.vehicle?.total_violations ?? 0}
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>total violations</span>
            </div>
            {result.vehicle?.is_repeat_offender && <RepeatOffenderBadge />}
          </div>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                  {['Date', 'Barangay', 'Street', 'Violation Type', 'Status', 'Penalty Tier'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!result.history?.length ? (
                  <tr><td colSpan={6} style={{ padding: '32px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No records found</td></tr>
                ) : result.history.map(h => (
                  <tr key={h.report_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}>
                    <td style={{ padding: '0 12px', fontSize: 13 }}>{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString('en-PH') : '—'}</td>
                    <td style={{ padding: '0 12px', fontSize: 13 }}>{h.barangay_name ?? '—'}</td>
                    <td style={{ padding: '0 12px', fontSize: 13 }}>{h.street_name ?? '—'}</td>
                    <td style={{ padding: '0 12px', fontSize: 13 }}>{h.violation_type ?? '—'}</td>
                    <td style={{ padding: '0 12px' }}><StatusBadge status={h.status} /></td>
                    <td style={{ padding: '0 12px' }}><PenaltyTierBadge tier_name={h.penalty_tier?.tier_name} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
