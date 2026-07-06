import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { reports } from '../services/api'
import LoadingSpinner from './LoadingSpinner'

// Malate, Manila
const CENTER = [14.569, 120.987]

function countColor(count, max) {
  if (max === 0) return '#6B7280'
  const ratio = Math.min(count / max, 1)
  if (ratio < 0.33) return '#059669'
  if (ratio < 0.66) return '#D97706'
  return '#DC2626'
}

function countRadius(count, max) {
  if (max === 0) return 18
  return 18 + Math.round((count / max) * 22)
}

export default function ViolationHeatMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return reports.violationMap()
      .then((rows) => setPoints(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e?.message || 'Could not load the map.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (loading || error || !containerRef.current) return

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, { zoomControl: true }).setView(CENTER, 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current)
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 0)
    }
    const map = mapRef.current

    layersRef.current.forEach((l) => l.remove())
    layersRef.current = []

    if (points.length === 0) return

    const maxCount = Math.max(...points.map((p) => p.violation_count), 1)

    points.forEach((p) => {
      const color = countColor(p.violation_count, maxCount)
      const radius = countRadius(p.violation_count, maxCount)

      const circle = L.circleMarker([p.latitude, p.longitude], {
        radius,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.82,
      }).addTo(map)

      const label = L.marker([p.latitude, p.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div style="text-align:center;pointer-events:none;white-space:nowrap;">
            <div style="font-size:10px;font-weight:700;color:#fff;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,0.8);">${p.barangay_name ?? ''}</div>
            <div style="font-size:13px;font-weight:800;color:#fff;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,0.8);">${p.violation_count}</div>
          </div>`,
          iconSize: [90, 32],
          iconAnchor: [45, 16],
        }),
        interactive: false,
      }).addTo(map)

      circle.bindTooltip(
        `<strong>${p.barangay_name}</strong><br>${p.violation_count} violation${p.violation_count === 1 ? '' : 's'}`,
        { direction: 'top', offset: [0, -radius] }
      )

      layersRef.current.push(circle, label)
    })

    map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [60, 60], maxZoom: 15 })
  }, [loading, error, points])

  useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
  }, [])

  const maxCount = points.length > 0 ? Math.max(...points.map(p => p.violation_count), 1) : 1
  const legendItems = [
    { label: 'Low', color: countColor(0, maxCount) },
    { label: 'Mid', color: countColor(maxCount * 0.5, maxCount) },
    { label: 'High', color: countColor(maxCount, maxCount) },
  ]

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Barangay Violation Density
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!loading && !error && points.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {legendItems.map(({ label, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, border: '1px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={load} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>
      <div ref={containerRef}
        style={{ height: 420, width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', background: '#E8ECF0', zIndex: 0 }} />
      {loading && (
        <div style={{ position: 'absolute', inset: 0, top: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner size={28} />
        </div>
      )}
      {!loading && error && (
        <div style={{ position: 'absolute', inset: 0, top: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-rejected)', fontSize: 13 }}>{error}</div>
      )}
      {!loading && !error && points.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, top: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          No violations to map yet.
        </div>
      )}
    </div>
  )
}
