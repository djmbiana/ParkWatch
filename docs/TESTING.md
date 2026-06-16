# ParkWatch — Manual Testing Guide

How to run the system end-to-end and verify every connection in the
report lifecycle: **citizen submits → barangay verifies → MTPB acts → citizen
sees the status update**. Covers iPhone and Android for the citizen app.

---

## 1. Prerequisites

- Docker Desktop running (the backend + MySQL run in containers).
- Node 20+ on your Mac (to run the Vite dev server on the host).
- Your Mac and your phone on the **same Wi-Fi network**.
  - If you're on university Wi-Fi with client isolation, use your **phone's
    hotspot** and connect the Mac to it instead.

---

## 2. Start the stack

From the project root:

```bash
# 1. Backend + database (containers)
docker compose up -d

# 2. Apply DB migrations (inside the backend container — DB host "db" only
#    resolves on the Docker network)
docker compose exec backend npm run migrate

# 3. Seed reference data + test accounts
docker compose exec backend npm run seed

# 4. Frontend dev server on the host, exposed to the LAN
cd frontend
npm run dev -- --host
```

Vite prints a **Network** URL, e.g. `http://192.168.1.42:5173`. If you need the
IP directly:

```bash
ipconfig getifaddr en0      # Wi-Fi; try en1 if blank
```

- **Backend** runs at `http://localhost:3000` (hot-reloads on code changes).
- **Frontend** proxies `/api` → `localhost:3000`, so phones only need the Vite URL.
- Health check: `http://localhost:3000/api/v1/health`.

---

## 3. Test accounts

All staff accounts use password **`Test1234!`** (re-seeding resets them).

| Role              | Email                  | Portal           | Notes |
|-------------------|------------------------|------------------|-------|
| Citizen           | *(none)*               | `/citizen`       | Anonymous — **no login** |
| Barangay Official | `barangay@test.com`    | `/barangay`      | Barangay 701; sees the shared queue |
| MTPB Officer      | `officer@test.com`     | `/mtpb/officer`  | Acknowledge / dispatch / resolve |
| MTPB Supervisor   | `supervisor@test.com`  | `/mtpb/supervisor` | Escalations, analytics, officers |
| Admin             | `admin@test.com`       | `/admin`         | Users, barangays, streets, penalties, audit |

Staff log in at `http://<mac-ip>:5173/login` (or `localhost` on the Mac) and are
routed to their portal automatically by role.

---

## 4. Citizen app on a phone

The citizen app is a **mobile web app** — no install, no login. Open it in the
phone browser:

```
http://<mac-ip>:5173/citizen
```

You land directly on the Home screen.

> **Camera note:** the photo step uses a native file input (`capture`), so the
> camera works over plain `http://` on your LAN — **no HTTPS/ngrok needed**.
> (HTTPS is only required later for push notifications, which are off by default.)

### iPhone (Safari)
1. Open **Safari** → `http://<mac-ip>:5173/citizen`.
2. Tap **Report a Violation** → **Tap to capture photo** → allow camera → the
   rear camera opens. Or use **Upload from Gallery**.
3. Continue through the wizard (Section 6).
4. To "install" it: Share → **Add to Home Screen** (optional, for full-screen).

### Android (Chrome)
1. Open **Chrome** → `http://<mac-ip>:5173/citizen`.
2. Chrome may show a "Not secure" label for HTTP — this is expected on LAN and
   does **not** block the file-input camera.
3. Tap **Report a Violation** → **Tap to capture photo** → allow camera, or
   **Upload from Gallery**.
4. Optional install: ⋮ menu → **Add to Home screen**.

If the page won't load on the phone: confirm the IP matches Vite's "Network"
URL, both devices are on the same network, and the Mac firewall isn't blocking
port 5173.

---

## 5. The lifecycle you're verifying

```
Citizen (anonymous)        Barangay official        MTPB officer/supervisor
─────────────────          ─────────────────        ───────────────────────
submit report  ─pending──►  verify (approve) ─verified─►  acknowledge ─► dispatch ─► resolve
                            verify (reject)  ─rejected         │
                                                               └─ supervisor can escalate
        ◄───────────── status updates appear in the citizen's "My Reports" timeline ─────────────
```

Reports route to a **shared cross-barangay queue**: every barangay official sees
all pending reports, each labeled with its barangay. A vehicle's violation count
accumulates **district-wide** (repeat-offender tracking).

---

## 6. End-to-end test (do this in order)

### Step A — Citizen submits (phone, `/citizen`)
1. **Report a Violation** → take/upload a photo of a plate.
2. **Next →** runs OCR. On **Step 2** the **OCR Extracted Plate** field is
   pre-filled with the reading and shows the **accuracy %** below it. Edit it if
   wrong (format `ABC 1234` or `ABC 12-3456`).
3. Pick a **Street** and **Violation Type**.
   - To make the report land in `barangay@test.com`'s view as a Barangay-701
     report, choose **Adriatico Street** or **Remedios Street** (Barangay 701).
     Any street works for the shared queue, though.
4. **Step 3** shows the photo, plate + accuracy, street/violation/barangay, and a
   **penalty preview** (e.g. "1st Offense — ₱900").
5. **Submit Report → "Are you sure?" → Yes, Submit.**
6. **Confirmation** shows `RPT-<id>` and your anonymous alias (`Reporter #XXXX`).
   **Note the RPT number.**

✅ **Check:** **My Reports** tab lists the new report as **Pending**. Open it →
the **status timeline** shows *Submitted* completed, *Verified by Barangay*
in progress.

### Step B — Barangay verifies (`/barangay`, `barangay@test.com`)
1. Log in → **Queue** (Pending Verification).
2. ✅ **Check:** your `RPT-<id>` appears, with a **Barangay** column showing the
   street's barangay, the plate, and OCR confidence. (Set the date filter to
   **All Time** if it's not "today".)
3. Open it → review photo/plate → **Approve** (or Reject with a reason ≥10 chars).

✅ **Check (connection):** back on the phone, refresh **My Reports** → the report
is now **Verified**; the timeline advanced to *Verified by Barangay*.

### Step C — MTPB acts (`/mtpb/officer`, `officer@test.com`)
1. Log in → the **queue** lists verified reports.
2. **Acknowledge** → **Dispatch** → **Resolve** (enter a resolution outcome /
   ticket reference).

✅ **Check (connection):** on the phone, the timeline advances *Acknowledged by
MTPB → Officer Dispatched → Resolved*, and the resolution outcome appears.

### Step D — Supervisor & analytics (`/mtpb/supervisor`, `supervisor@test.com`)
1. **Escalated** — reports an officer escalated show here; resolve/reassign.
2. **Reports / Analytics** — district-wide totals; **Officers** — roster.

### Step E — Admin (`/admin`, `admin@test.com`)
- **Streets / Parking Rules** — toggling a street's rule changes which violation
  types the citizen app offers for that street (Step 2 of the wizard).
- **Penalty Tiers** — changing fines/thresholds changes the citizen penalty
  preview and the assigned penalty.
- **Users / Barangays / Audit** — manage accounts and review the audit log.

---

## 7. Specific logic / connection checks

| What to verify | Where | Expected |
|----------------|-------|----------|
| OCR pre-fills the plate | Citizen Step 2 | Field pre-filled with reading + accuracy % shown |
| Edited plate recorded as manual | Barangay/MTPB report detail | Plate marked "Entered manually" if you changed it |
| Penalty preview = assigned penalty | Citizen Step 3 vs report detail | Same tier/fine |
| Anonymity | Any staff report detail | Reporter shows only `Reporter #XXXX` — never a name |
| Shared cross-barangay queue | `/barangay` queue | All barangays' pending reports, labeled |
| Cross-barangay repeat offender | Submit 2 reports for the same plate on different streets, then **Plate Search** in a portal | `total_violations` = 2; flagged repeat offender; penalty escalates |
| Status timeline sync | Citizen report detail | Each staff action advances the timeline |
| Rejected report | Citizen report detail | Timeline stops at *Rejected* + shows the rejection reason |
| Duplicate guard | Submit same plate+street twice quickly | Second submit returns "a similar report already exists" |
| Anonymous tracking is device-local | **Account** tab → "Clear my local data" | Reports disappear from this device (server keeps them) |

### Quick API sanity checks (optional, from the Mac)
```bash
# Barangay official sees the shared queue
TOKEN=$(curl -s localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"barangay@test.com","password":"Test1234!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -s localhost:3000/api/reports/queue/barangay -H "Authorization: Bearer $TOKEN"

# Penalty preview for a plate
curl -s localhost:3000/api/reports/penalty-preview -H 'Content-Type: application/json' \
  -d '{"plate":"ABC 1234"}'
```

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `getaddrinfo ENOTFOUND db` on migrate | Run migrate **inside** the container: `docker compose exec backend npm run migrate` |
| Phone can't reach the site | Wrong IP, different network, or firewall on port 5173 |
| Citizen Step 2 plate empty | OCR couldn't read it — type it in (expected fallback for bad photos) |
| Photo upload spins forever | Times out after 60s with a retry; check Wi-Fi / GCS credentials |
| Report not in a barangay's queue | It's the **shared** queue now — all officials see all pending reports; check the date filter (set "All Time") |
| Push notifications don't fire | Off by default — needs Firebase env config + HTTPS (see `frontend/.env.example`) |

---

## 9. Reset between test runs

```bash
# Re-seed reference data + accounts (idempotent)
docker compose exec backend npm run seed

# Full DB reset (wipes all reports/data)
docker compose down -v && docker compose up -d
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

On the phone, the **Account → Clear my local data** button resets the citizen's
locally-tracked reports and anonymous ID.
