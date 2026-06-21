# ParkWatch E2E Suite (Playwright)

End-to-end tests for the ParkWatch thesis system test (paper Ch. IV, p.160–165).
They verify the 6 Specific Objectives (SO1–SO6) plus auth, portal, and security
spot checks. **Exit criteria:** all cases PASS, no critical/high defects.

Per the paper, the test environment is **Google Chrome 120+ on desktop AND
mobile** form factors — modelled by two Playwright projects: `Desktop Chrome`
and `Mobile Chrome` (Pixel 5).

## Prerequisites

1. **Backend running** at `http://localhost:3000`:
   ```bash
   cd backend && npm run dev
   ```
   Playwright only auto-starts the **frontend** (Vite). The API is a separate
   process and must be up.

2. **Seeded test accounts** (password `Test1234!`):
   `admin@test.com`, `barangay@test.com`, `officer@test.com`,
   `supervisor@test.com`. The auth/portal/API tests log in as these roles.

3. The frontend dev server starts automatically (`reuseExistingServer` reuses a
   running one).

> Endpoint note: auth lives **only** at `/api/v1/auth/login` (no unversioned
> alias). Most other resources are reachable at both `/api/v1/*` and `/api/*`.

> **Auth rate limit.** The backend throttles `/auth/login` to **20 attempts per
> 15 min per IP** in *all* environments (`authLimiter`). The suite logs in once
> per role and caches the token (`workers: 1`), so a single full run stays well
> under that. If you run the suite **repeatedly** within 15 minutes you may hit
> `429 Too many attempts`; either wait for the window to reset or raise the
> limit for testing by setting `AUTH_RATE_LIMIT_MAX` (e.g. `=500`) in the
> backend `.env` and restarting the API.

## Running

```bash
cd frontend
npm run test:e2e            # all tests, both projects
npm run test:e2e:desktop   # Desktop Chrome only
npm run test:e2e:mobile    # Mobile Chrome (Pixel 5) only
npm run test:e2e:so1       # a single objective (so1..so6)
npm run test:e2e:auth      # auth / portals / security subsets
npm run test:e2e:ui        # interactive UI mode
npm run test:e2e:report    # open the last HTML report
npm run test:e2e:ci        # JUnit XML → playwright-results.xml (Ch. IV table)
```

### OCR accuracy benchmark (SO2)

SO2 needs real Philippine plate photos already in GCS and is env-gated so the
suite stays green without the dataset:

```bash
TEST_PLATE_BENCHMARK=true \
TEST_PLATE_URIS="gs://bucket/p1.jpg,gs://bucket/p2.jpg,..." \   # >= 20
TEST_PLATE_EXPECTED="ABC 1234,XYZ 5678,..." \                   # aligned
npm run test:e2e:so2
```

Optional single-image vars: `TEST_PLATE_IMAGE_URI`, `TEST_BLURRY_PLATE_URI`
(SO2/SEC-03 duplicate detection).

## Layout

```
e2e/
  helpers/
    testData.ts   constants, login path, storage keys, paper message strings
    auth.ts       API login + portal session seeding
    api.ts        report setup/teardown helpers
  tests/
    SO1-citizen-submission.spec.ts   citizen wizard validation (network-mocked)
    SO2-ocr-accuracy.spec.ts         OCR ≥ 94% benchmark (env-gated)
    SO3-cross-barangay.spec.ts       cross-barangay plate history
    SO4-penalty-escalation.spec.ts   penalty-tier configuration
    SO5-escalation-timer.spec.ts     queue + status guard + escalation
    SO6-notifications.spec.ts        NOTIFICATION_LOG / FR-15
    auth.spec.ts                     authN/authZ
    portals.spec.ts                  portal smoke tests (desktop + mobile)
    security.spec.ts                 NFR-08 PII + hardening
```

## Notes on test design

- **SO1** mocks the citizen API (`page.route`) so field validation (disabled
  buttons, plate regex, auto-uppercase, confirmation) is exercised
  deterministically without a real GCS upload or Vision OCR.
- API tests hit the backend at `:3000` directly (not via the Vite proxy).
- Tests that need state which may be absent in a given DB (a pending report, an
  escalated report) **skip gracefully** rather than fail, so absence of seed
  data never produces a false defect.
