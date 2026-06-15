import { AlertTriangle } from 'lucide-react'

export default function RepeatOffenderBadge() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 500,
      fontFamily: 'JetBrains Mono, monospace',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: '#DC2626',
      background: '#FEE2E2',
    }}>
      <AlertTriangle size={11} />
      REPEAT
    </span>
  )
}
