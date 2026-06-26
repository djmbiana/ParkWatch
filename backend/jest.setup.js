'use strict';

// Load test-only environment BEFORE any module reads process.env.
// override: true is required because the container injects its runtime .env
// (e.g. GCS_BUCKET_NAME=parkwatch-evidence-capstone) into process.env, and
// dotenv will NOT replace already-set vars without it. The tests need the
// fixture bucket (test-bucket) so storageService.parsePhotoRef accepts the
// fixture photo URLs in tests/ocrService.test.js.
require('dotenv').config({ path: '.env.test', override: true });
