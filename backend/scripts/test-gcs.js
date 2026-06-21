'use strict';

// Connectivity check for Google Cloud Storage (evidence bucket).
// Run: node backend/scripts/test-gcs.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Storage } = require('@google-cloud/storage');
const storage = new Storage();

async function testGCS() {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    console.error('FAIL: GCS_BUCKET_NAME not set in .env');
    process.exit(1);
  }
  console.log('Testing GCS bucket:', bucketName);
  const [files] = await storage.bucket(bucketName).getFiles({ maxResults: 1 });
  console.log(`PASS: Bucket "${bucketName}" accessible. Files found: ${files.length}`);
  process.exit(0);
}

testGCS().catch((err) => {
  console.error('FAIL: GCS error:', err.message);
  process.exit(1);
});
