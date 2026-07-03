import { useEffect, useRef } from 'react'

// Keeps a page's data fresh without a manual reload: calls `fetchFn` on an
// interval AND immediately whenever the tab regains focus / becomes visible
// (so switching back to the ParkWatch tab shows new reports right away).
export default function useAutoRefresh(fetchFn, intervalMs = 15000) {
  const saved = useRef(fetchFn)
  useEffect(() => { saved.current = fetchFn })

  useEffect(() => {
    const tick = () => { saved.current && saved.current() }
    const id = setInterval(tick, intervalMs)
    const onFocus = () => tick()
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
}
