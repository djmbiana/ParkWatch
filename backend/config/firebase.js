const admin = require('firebase-admin');
const path = require('path');

let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  try {
    const credentialsPath = path.resolve(process.env.FIREBASE_CREDENTIALS_PATH);
    const serviceAccount = require(credentialsPath);

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });

    console.log('✅ Firebase Admin initialized');
  } catch (err) {
    console.warn('⚠️  Firebase not initialized (missing credentials):', err.message);
    console.warn('    Push notifications will be disabled until credentials are added.');
  }

  return firebaseApp;
};

const getMessaging = () => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Check FIREBASE_CREDENTIALS_PATH in .env');
  }
  return admin.messaging();
};

module.exports = { initFirebase, getMessaging };
