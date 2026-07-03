import { useState, useEffect } from 'react'

/**
 * Returns true while the given media query matches. Used to switch between the
 * desktop table layout and the stacked mobile-card layout on staff pages.
 *
 * Example: const isMobile = useMediaQuery('(max-width: 767px)')
 *
 * SSR-safe: returns false during the (non-existent here, but harmless) server
 * pass, then syncs on mount.
 */
export default function useMediaQuery(query) {
  const getMatch = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false

  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange() // sync immediately in case the query changed between renders
    // addEventListener is the modern API; older Safari used addListener.
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else mql.addListener(onChange)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else mql.removeListener(onChange)
    }
  }, [query])

  return matches
}
