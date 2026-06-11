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

/**
 * Resolves a photo reference to { bucket, objectPath }. Accepts the formats
 * the API hands out or stores:
 *   https://storage.googleapis.com/<bucket>/<path>   (upload endpoint output)
 *   gs://<bucket>/<path>                             (Vision API input)
 *   <path>                                           (bare object path, as stored
 *                                                      in VIOLATION_REPORTS.photo_path)
 * Throws 400 if unparseable, or if the URL points at a foreign bucket while
 * GCS_BUCKET_NAME is configured (citizens must not reference arbitrary buckets).
 */
const parsePhotoRef = (photoRef) => {
  const ref = String(photoRef ?? '').trim();
  const configuredBucket = process.env.GCS_BUCKET_NAME || null;

  let match = ref.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/)
    || ref.match(/^gs:\/\/([^/]+)\/(.+)$/);

  let bucket;
  let objectPath;
  if (match) {
    [, bucket, objectPath] = match;
  } else if (configuredBucket && ref && !ref.includes('://')) {
    bucket = configuredBucket;
    objectPath = ref.replace(/^\/+/, '');
  }

  if (!bucket || !objectPath) {
    const err = new Error('photo_url must be a ParkWatch storage URL (https://storage.googleapis.com/... or gs://...).');
    err.statusCode = 400;
    throw err;
  }
  if (configuredBucket && bucket !== configuredBucket) {
    const err = new Error('photo_url does not belong to the ParkWatch storage bucket.');
    err.statusCode = 400;
    throw err;
  }

  return { bucket, objectPath };
};

/** gs://bucket/path URI for the Vision API (no re-download of the image). */
const toGcsUri = (photoRef) => {
  const { bucket, objectPath } = parsePhotoRef(photoRef);
  return `gs://${bucket}/${objectPath}`;
};

/**
 * V4 presigned read URL (default 15 minutes) for serving evidence photos to
 * authorized clients without making the bucket public.
 */
const getSignedReadUrl = async (objectPath, expiresMinutes = 15) => {
  const bucket = getBucket();
  const [url] = await bucket.file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresMinutes * 60 * 1000,
  });
  return url;
};

module.exports = { uploadBuffer, parsePhotoRef, toGcsUri, getSignedReadUrl };
