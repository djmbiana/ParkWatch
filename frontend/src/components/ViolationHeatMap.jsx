import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import { reports } from '../services/api'
import LoadingSpinner from './LoadingSpinner'

// Malate, Manila
const CENTER = [14.569, 120.987]

// Street-level violation density heat map (Leaflet + OpenStreetMap, no API key).
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

    // Init the map once.
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView(CENTER, 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current)
      // Leaflet needs a sized container; nudge it after layout settles.
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 0)
    }
    const map = mapRef.current

    // Clear previously-drawn heat + markers.
    layersRef.current.forEach((l) => l.remove())
    layersRef.current = []

    if (points.length === 0) return

    const maxCount = Math.max(...points.map((p) => p.violation_count), 1)
    const heat = L.heatLayer(
      points.map((p) => [p.latitude, p.longitude, p.violation_count / maxCount]),
      { radius: 35, blur: 25, maxZoom: 17 }
    ).addTo(map)
    layersRef.current.push(heat)

    points.forEach((p) => {
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: 5 + Math.min(p.violation_count, 10),
        color: '#DC2626',
        weight: 1,
        fillColor: '#EF4444',
        fillOpacity: 0.5,
      })
        .bindTooltip(`${p.street_name} (${p.barangay_name}) - ${p.violation_count} violation${p.violation_count === 1 ? '' : 's'}`)
        .addTo(map)
      layersRef.current.push(marker)
    })

    map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [40, 40], maxZoom: 16 })
  }, [loading, error, points])

  // Tear down the map on unmount.
  useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
  }, [])

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Street-Level Violation Density Map
        </span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div
        ref={containerRef}
        style={{ height: 420, width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', background: '#E8ECF0', zIndex: 0 }}
      />
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
