# ParkWatch Postman Collection

Import `ParkWatch.postman_collection.json` into Postman to test the API.

## Setup

1. Open Postman → Import → drop the JSON file or browse to it
2. Open the collection's **Variables** tab and confirm `base_url` is `http://localhost:3000/api/v1`
3. Make sure the backend is running: `docker compose up`
4. Seed test accounts (one-time): `docker compose exec backend npm run seed`

## Test accounts

All seeded accounts use password: **`Malate@2025`**

| Email | Role | Barangay |
|---|---|---|
| `admin@parkwatch.ph` | admin | — |
| `supervisor@mtpb.gov.ph` | mtpb_supervisor | — |
| `officer1@mtpb.gov.ph` | mtpb_officer | 688 |
| `officer2@mtpb.gov.ph` | mtpb_officer | 695 |
| `official1@brgy688.gov.ph` | brgy_official | 688 |
| `citizen1@gmail.com` | citizen | — |

## How to use

1. Run **POST Login** with one of the test accounts above
   - The token is auto-saved to the `{{token}}` collection variable
2. Run **GET Me** to confirm the token works
3. Subsequent protected requests will use `{{token}}` automatically