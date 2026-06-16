import { citizen } from "./api"

const TOKEN_KEY = "parkwatch_fcm_token"

// Reads Firebase web config from Vite env. Returns null unless every field
// (including the VAPID key) is present — i.e. the feature is opt-in and stays
// disabled until the project is configured.
function readConfig() {
  const env = import.meta.env
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
  const vapidKey = env.VITE_FCM_VAPID_KEY
  if (!vapidKey || Object.values(cfg).some((v) => !v)) return null
  return { cfg, vapidKey }
}

// Best-effort anonymous FCM registration (UC-03). Silently no-ops when:
//   - Firebase env config is absent (feature disabled),
//   - the browser lacks support / service workers,
//   - the citizen denies notifications (UC-03 AF-1 — app continues normally).
// The firebase SDK is loaded via dynamic import, so it becomes a lazy chunk
// that is only fetched once we pass the config + permission checks.
export async function registerForPush() {
  const conf = readConfig()
  if (!conf) return
  if (typeof window === "undefined") return
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return
  if (Notification.permission === "denied") return // AF-1

  try {
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission()
    if (permission !== "granted") return // AF-1: continue without notifications

    const { initializeApp } = await import("firebase/app")
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging")
    if (!(await isSupported())) return

    const app = initializeApp(conf.cfg)
    const messaging = getMessaging(app)
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
    const token = await getToken(messaging, {
      vapidKey: conf.vapidKey,
      serviceWorkerRegistration: swReg,
    })
    if (!token) return

    // Avoid re-posting an unchanged token on every load.
    if (localStorage.getItem(TOKEN_KEY) === token) return
    await citizen.registerToken(token)
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Never surface push errors to the citizen (AF-1).
  }
}
