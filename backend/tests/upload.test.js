'use strict';

/**
 * Integration tests for POST /api/upload/photo (and the /api/v1 alias).
 * Google Cloud Storage is mocked — auth, role, and multer middleware run for real.
 */

// Must be set before the modules are required so jwt.verify has a secret.
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';

jest.mock('../src/services/storageService', () => ({
  uploadBuffer: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../src/app');
const storageService = require('../src/services/storageService');

const CITIZEN_ID = 7;
const FAKE_URL = `https://storage.googleapis.com/test-bucket/photos/${CITIZEN_ID}/123_plate.jpg`;

// Minimal valid magic-byte headers (the upload controller validates real
// content, not just the declared MIME type).
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

/** Signs a JWT with the test secret. */
function sign(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const citizenToken = () => sign({ id: CITIZEN_ID, role: 'citizen', barangay_id: null });

beforeEach(() => {
  storageService.uploadBuffer.mockReset();
  storageService.uploadBuffer.mockResolvedValue(FAKE_URL);
});

describe('POST /api/upload/photo', () => {
  it('uploads anonymously (no token) — citizens submit without an account', async () => {
    const res = await request(app)
      .post('/api/upload/photo')
      .attach('photo', JPEG_BYTES, { filename: 'plate.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { photo_url: FAKE_URL } });
    // Anonymous uploads are bucketed under photos/anonymous/.
    const [, destination] = storageService.uploadBuffer.mock.calls[0];
    expect(destination).toMatch(/^photos\/anonymous\/\d+_plate\.jpg$/);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/upload/photo')
      .set('Authorization', `Bearer ${citizenToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no photo/i);
  });

  it('returns 400 for a non-image mimetype', async () => {
    const res = await request(app)
      .post('/api/upload/photo')
      .set('Authorization', `Bearer ${citizenToken()}`)
      .attach('photo', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only jpeg, png, and webp/i);
    expect(storageService.uploadBuffer).not.toHaveBeenCalled();
  });

  it('returns 400 when the file is sent under the wrong field name', async () => {
    const res = await request(app)
      .post('/api/upload/photo')
      .set('Authorization', `Bearer ${citizenToken()}`)
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'plate.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(storageService.uploadBuffer).not.toHaveBeenCalled();
  });

  it('uploads a valid image and returns the GCS URL', async () => {
    const res = await request(app)
      .post('/api/upload/photo')
      .set('Authorization', `Bearer ${citizenToken()}`)
      .attach('photo', JPEG_BYTES, { filename: 'plate photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { photo_url: FAKE_URL } });

    expect(storageService.uploadBuffer).toHaveBeenCalledTimes(1);
    const [buffer, destination, contentType] = storageService.uploadBuffer.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // photos/{userId}/{timestamp}_{originalname}, unsafe chars sanitized
    expect(destination).toMatch(new RegExp(`^photos/${CITIZEN_ID}/\\d+_plate_photo\\.jpg$`));
    expect(contentType).toBe('image/jpeg');
  });

  it('is also reachable at the versioned path /api/v1/upload/photo', async () => {
    const res = await request(app)
      .post('/api/v1/upload/photo')
      .set('Authorization', `Bearer ${citizenToken()}`)
      .attach('photo', PNG_BYTES, { filename: 'plate.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.photo_url).toBe(FAKE_URL);
  });
});
