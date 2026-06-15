import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'

export default function DataTable({ columns, data, onRowClick, loading, emptyMessage }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  let rows = data ?? []
  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <LoadingSpinner />
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                  cursor: col.sortable !== false ? 'pointer' : 'default',
                  userSelect: 'none',
                  width: col.width,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {col.label}
                  {col.sortable !== false && (
                    <span style={{ opacity: sortKey === col.key ? 1 : 0.3 }}>
                      {sortKey === col.key && sortDir === 'desc'
                        ? <ChevronDown size={12} />
                        : <ChevronUp size={12} />}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '48px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {emptyMessage ?? 'No data found'}
                </div>
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr
              key={row.id ?? row.report_id ?? row.user_id ?? row.barangay_id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                borderBottom: '1px solid var(--color-border)',
                height: 48,
                cursor: onRowClick ? 'pointer' : 'default',
                background: row._rowBg ?? 'transparent',
                borderLeft: row._rowBorderLeft ?? undefined,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!row._rowBg) e.currentTarget.style.background = 'var(--color-bg)' }}
              onMouseLeave={e => { e.currentTarget.style.background = row._rowBg ?? 'transparent' }}
            >
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '0 12px',
                  fontSize: 13,
                  color: 'var(--color-text-primary)',
                  verticalAlign: 'middle',
                  maxWidth: col.maxWidth,
                }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
