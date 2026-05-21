const admin = require('firebase-admin');
const path = require('path');
const logger = require('./logger');

let firebaseApp;

// Initializes the Firebase Admin SDK used for Cloud Messaging (push notifications).
// Credentials are loaded from FIREBASE_SERVICE_ACCOUNT_PATH. If the file is missing
// the app still boots — push notifications are simply disabled until it is provided.
const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  const credentialsPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!credentialsPath) {
    logger.warn('FIREBASE_SERVICE_ACCOUNT_PATH not set — push notifications are disabled.');
    return undefined;
  }

  try {
    const serviceAccount = require(path.resolve(credentialsPath));
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    logger.info('Firebase Admin initialized');
  } catch (err) {
    logger.warn(`Firebase not initialized (${err.message}). Push notifications are disabled.`);
  }

  return firebaseApp;
};

const getMessaging = () => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Check FIREBASE_SERVICE_ACCOUNT_PATH in .env');
  }
  return admin.messaging();
};

module.exports = { initFirebase, getMessaging };
