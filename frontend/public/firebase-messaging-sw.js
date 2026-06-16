/* global importScripts, firebase, self */
// ParkWatch — background FCM handler for the anonymous citizen app (UC-03).
//
// Service workers cannot read Vite (VITE_*) env vars, so the Firebase config
// below must be filled in to match your frontend/.env VITE_FIREBASE_* values.
// Until it is configured, push registration in src/services/fcm.js no-ops, so
// this file stays dormant.

importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "",
  authDomain: "",
  projectId: "",
  messagingSenderId: "",
  appId: "",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "ParkWatch", {
    body: body || "",
    icon: "/favicon.svg",
  });
});
