'use strict';

/**
 * Storage service — uploads evidence photos to Google Cloud Storage
 * (env: GCS_BUCKET_NAME) and returns their public object URLs.
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (see .env.example),
 * which the @google-cloud/storage client picks up automatically.
 */

const { Storage } = require('@google-cloud/storage');

// Lazily constructed so the app (and tests) can be imported without GCP
// credentials present; the client is only created on the first upload.
let storage = null;

const getBucket = () => {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    const err = new Error('GCS_BUCKET_NAME is not configured.');
    err.statusCode = 500;
    throw err;
  }
  if (!storage) storage = new Storage();
  return storage.bucket(bucketName);
};

/**
 * Uploads a buffer to GCS at the given object path.
 *
 * @param {Buffer} buffer       file contents (multer memory storage)
 * @param {string} destination  object path, e.g. photos/12/1718000000000_plate.jpg
 * @param {string} contentType  MIME type, e.g. image/jpeg
 * @returns {Promise<string>}   public URL of the uploaded object
 */
const uploadBuffer = async (buffer, destination, contentType) => {
  const bucket = getBucket();
  const file = bucket.file(destination);

  await file.save(buffer, {
    contentType,
    resumable: false, // single-shot upload; evidence photos are ≤ 10MB
    metadata: { cacheControl: 'private, max-age=0' },
  });

  return `https://storage.googleapis.com/${bucket.name}/${destination}`;
};

module.exports = { uploadBuffer };
