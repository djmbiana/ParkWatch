import { useEffect, useState, useCallback, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { adminAudit } from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'

const ACTION_COLORS = {
  create: { color: '#059669', bg: '#ECFDF5' },
  read:   { color: '#6B7280', bg: '#F3F4F6' },
  update: { color: '#D97706', bg: '#FFFBEB' },
  delete: { color: '#DC2626', bg: '#FEF2F2' },
}

// Matches the module_name values actually seeded in PERMISSIONS (backend/seeds/seed.js).
const MODULES = [
  { value: 'users_mgt',     label: 'User Management' },
  { value: 'brgy_mgt',      label: 'Barangay Mgmt' },
  { value: 'streets_rules', label: 'Streets & Rules' },
  { value: 'penalty',       label: 'Penalty Tiers' },
  { value: 'audit',         label: 'Audit' },
  { value: 'reports',       label: 'Reports' },
]

const SORT_COLUMNS = [
  { key: 'created_at',  label: 'Time' },
  { key: 'user_name',   label: 'User' },
  { key: 'module_name', label: 'Module' },
  { key: 'action_type', label: 'Action' },
]

export default function AdminAuditLog() {
  const { setPageTitle } = useOutletContext()
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]         = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [sortBy, setSortBy]   = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const limit = 50
  const debounceRef = useRef(null)

  useEffect(() => { setPageTitle('Audit Log') }, [setPageTitle])

  // Debounce free-text search so it doesn't re-query on every keystroke.
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(debounceRef.current)
  }, [searchInput])

  const fetchLogs = useCallback((p) => {
    setLoading(true)
    adminAudit.list({
      page: p, limit,
      search: search || undefined,
      module_name: moduleFilter || undefined,
      action_type: actionFilter || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
    })
      .then(data => {
        setLogs(Array.isArray(data) ? data : (data?.logs ?? []))
        setTotal(data?.total ?? 0)
        setPage(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search, moduleFilter, actionFilter, sortBy, sortDir])

  // Any filter/sort/search change resets back to page 1.
  useEffect(() => { fetchLogs(1) }, [fetchLogs])

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(key); setSortDir(key === 'created_at' ? 'desc' : 'asc') }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by user, module, target..."
            style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
        </div>
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)' }}>
          <option value="">All Modules</option>
          {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)' }}>
          <option value="">All Actions</option>
          <option value="create">Create</option>
          <option value="read">Read</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {total.toLocaleString()} total {total === 1 ? 'entry' : 'entries'}. Click a row to see before/after values.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => fetchLogs(page - 1)} disabled={page <= 1 || loading}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 12, cursor: 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
            Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Page {page} of {totalPages}</span>
          <button onClick={() => fetchLogs(page + 1)} disabled={page >= totalPages || loading}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 12, cursor: 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
            Next
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingSpinner size={28} /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                {SORT_COLUMNS.map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {col.label}
                      {sortBy === col.key
                        ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                        : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
                    </span>
                  </th>
                ))}
                {['Group', 'Summary', 'Target', 'IP'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No audit entries match your filters</td></tr>
              ) : logs.map(log => (
                <>
                  <tr key={log.id} onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    style={{ borderBottom: '1px solid var(--color-border)', height: 44, cursor: (log.before_value || log.after_value) ? 'pointer' : 'default' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '0 12px', fontSize: 12 }}>{log.user_name ?? log.user_id ?? '-'}</td>
                    <td style={{ padding: '0 12px', fontSize: 12 }}>{log.module_name}</td>
                    <td style={{ padding: '0 12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', ...(ACTION_COLORS[log.action_type] ?? {}) }}>
                        {log.action_type}
                      </span>
                    </td>
                    <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>{log.group_name ?? '-'}</td>
                    <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-primary)' }}>{log.summary ?? '-'}</td>
                    <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {log.target_table}{log.target_id ? ` #${log.target_id}` : ''}
                    </td>
                    <td style={{ padding: '0 12px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-text-muted)' }}>
                      {log.ip_address ?? '-'}
                    </td>
                  </tr>
                  {expanded === log.id && (log.before_value || log.after_value) && (
                    <tr key={`${log.id}-exp`} style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                      <td colSpan={8} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          {log.before_value && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Before</div>
                              <pre style={{ margin: 0, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 4, padding: '8px 10px', overflowX: 'auto', color: '#7F1D1D' }}>
                                {JSON.stringify(log.before_value, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.after_value && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>After</div>
                              <pre style={{ margin: 0, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 4, padding: '8px 10px', overflowX: 'auto', color: '#064E3B' }}>
                                {JSON.stringify(log.after_value, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
