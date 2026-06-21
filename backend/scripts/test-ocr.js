'use strict';

// Connectivity check for Google Cloud Vision (plate OCR).
// Run: node backend/scripts/test-ocr.js   (set TEST_PLATE_IMAGE_URI in .env)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

async function testOCR() {
  const testUri = process.env.TEST_PLATE_IMAGE_URI;
  if (!testUri) {
    console.error('Set TEST_PLATE_IMAGE_URI=gs://your-bucket/test-plate.jpg in .env');
    process.exit(1);
  }
  console.log('Calling GCV TEXT_DETECTION on:', testUri);
  const [result] = await client.textDetection(testUri);
  const detections = result.textAnnotations;

  if (!detections || detections.length === 0) {
    console.error('FAIL: No text detected.');
    process.exit(1);
  }

  console.log('Raw text blocks:');
  detections.forEach((d) => console.log(' -', JSON.stringify(d.description)));

  const platePattern = /^[A-Z]{3} \d{4}$|^[A-Z]{3} \d{2}-\d{4}$/;
  const lines = detections[0].description.split('\n').map((l) => l.trim().toUpperCase());
  const match = lines.find((l) => platePattern.test(l));

  if (match) {
    console.log('PASS: Philippine plate detected:', match);
  } else {
    console.warn('WARN: No PH-format plate found. Image quality issue, not API error.');
    console.warn('Full text:', detections[0].description);
  }
  process.exit(0);
}

testOCR().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
