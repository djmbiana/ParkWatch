import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { adminBarangays } from '../services/api'
import { useToast } from './ToastContext'
import LoadingSpinner from './LoadingSpinner'

// Malate, Manila — default view when a barangay has no pin yet.
const MALATE_CENTER = [14.5665, 120.9955]

// Modal map picker: the admin clicks the map to set a barangay's centroid, which
// drives the barangay-level violation heat map. Human-placed, so it matches the
// real location exactly (no geocoding guesswork).
export default function BarangayLocationPicker({ barangay, onClose, onSaved }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const hasInitial = barangay.latitude != null && barangay.longitude != null
  const [coords, setCoords] = useState(hasInitial ? [Number(barangay.latitude), Number(barangay.longitude)] : null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current).setView(coords ?? MALATE_CENTER, 16)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)

    const place = (latlng) => {
      if (markerRef.current) markerRef.current.remove()
      markerRef.current = L.circleMarker(latlng, {
        radius: 10, color: '#2F7D36', weight: 2, fillColor: '#3DA044', fillOpacity: 0.6,
      }).addTo(map)
      setCoords([latlng.lat, latlng.lng])
    }

    if (coords) place({ lat: coords[0], lng: coords[1] })
    map.on('click', (e) => place(e.latlng))
    setTimeout(() => map.invalidateSize(), 60)

    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    if (!coords) { toast('Click the map to place the pin first.', 'error'); return }
    setSaving(true)
    try {
      await adminBarangays.setLocation(barangay.barangay_id, coords[0], coords[1])
      toast(`${barangay.barangay_name} location saved.`, 'success')
      onSaved()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 640, maxWidth: '92vw', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Set location — {barangay.barangay_name}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 14 }}>
          Click the map at the center of this barangay. This is where its violation blob shows on the heat map.
        </p>
        <div ref={containerRef} style={{ height: 380, width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', zIndex: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {coords ? `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}` : 'No pin placed yet — click the map'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving || !coords}
              style={{ padding: '8px 18px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: coords ? 'pointer' : 'not-allowed', opacity: coords && !saving ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              {saving && <LoadingSpinner size={13} color="#fff" />} Save location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
