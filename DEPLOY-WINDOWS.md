# ParkWatch — UAT deploy from a Windows PC (public URL via Cloudflare Tunnel)

Goal: give barangay testers a public **https** link they can open from any phone,
anywhere, served off your Windows PC. No cloud VM, no port-forwarding.

Flow: `phone → https tunnel → your PC → Vite (serves the app + proxies /api) → backend`.
One origin, HTTPS, no CORS. The camera works (the app uses a file/camera picker).

---

## 0. One-time installs on the Windows PC
- **Docker Desktop** (enable the WSL2 backend) — runs the backend + MySQL
- **Node 20** (https://nodejs.org)
- **Git** (to pull the repo) — or just copy the project folder over
- **cloudflared**:  `winget install --id Cloudflare.cloudflared`
  (or download `cloudflared-windows-amd64.exe` from Cloudflare and rename to `cloudflared.exe`)

## 1. Get the project onto the PC
`git clone` the repo (or copy the folder).

**IMPORTANT — copy these two files manually** (they are gitignored, so they do NOT
come with `git clone`, and nothing works without them):
- `backend/.env`                     (DB creds, JWT secret, GCS bucket, rate limits)
- `backend/gcp-service-account.json` (Google OCR + photo upload credentials)

## 2. Start the backend + database (PowerShell, in the repo root)
```powershell
docker compose up -d
docker compose exec backend npm run migrate   # no-op if already migrated
docker compose exec backend npm run seed       # fresh accounts + reference data
```
Check it's up:  open http://localhost:3000/api/health  → should say `"status":"ok"`.

## 3. Build + serve the frontend
```powershell
cd frontend
npm install
npm run build
npm run preview -- --host      # serves the built app on http://localhost:4173
```
Leave this window running.

## 4. Open the public tunnel (new PowerShell window)
```powershell
cloudflared tunnel --url http://localhost:4173
```
It prints a line like:
```
  https://random-words-here.trycloudflare.com
```
**That URL is your UAT link.** Share it with the barangay testers.
Keep this window open for the whole session — if you stop/restart cloudflared,
the URL changes.

## 5. Test it yourself first
Open the tunnel URL on your phone (on cellular, to prove it's really public):
- Citizen flow: submit a report with a photo (camera should open).
- Staff: log in and walk a report through the lifecycle.

---

## Test accounts (password `Test1234!` for all)
| Role | Email |
|------|-------|
| Citizen | (no login — “I'm a Citizen” on the landing page) |
| Barangay Official | `barangay726@test.com`, `barangay727@test.com`, `barangay729@test.com`, `barangay730@test.com`, `barangay762@test.com` (one per partner barangay) |
| MTPB Officer | `officer@test.com` |
| MTPB Supervisor | `supervisor@test.com` |
| Admin | `admin@test.com` |

Partner barangays (Malate, Zone 79, east of Taft) and their streets — coordinates
are OpenStreetMap-verified so the heat map markers land on the real streets:
- **Brgy 726** — A. Estrada, Camachile, Dominga
- **Brgy 727** — Conchu, Consuelo, Fernando
- **Brgy 729** — Leon Guinto, Pablo Ocampo, Sandejas
- **Brgy 730** — Arellano Ave, Bautista, Dian
- **Brgy 762** — Menlo, Donada

The street → barangay split is a best-effort approximation (exact barangay
boundaries aren't published) — have the captains confirm/adjust their own streets
during UAT. For a clean end-to-end demo, have the citizen pick a street and log in
as *that barangay's* official (e.g. **Sandejas Street** → `barangay729@test.com`).

---

## Things that will bite you if you forget
- **Keep the PC awake + plugged in.** Set the power plan to *never sleep*. If it
  sleeps or drops internet, the link dies.
- **The tunnel URL changes** every time `cloudflared` restarts. Start it once,
  share that URL, don't restart it mid-session.
- **Two secret files** (step 1) — the #1 cause of “OCR/upload doesn’t work.”
- **Reset to a clean DB** any time before a session:
  `docker compose down -v && docker compose up -d && docker compose exec backend npm run seed`
- Docker Desktop must be **running** before `docker compose up`.

## If you want a STABLE url (optional, needs a Cloudflare account + a domain)
The quick tunnel above is throwaway (random URL). For a fixed URL:
`cloudflared login`, `cloudflared tunnel create parkwatch`, map a DNS record, and
run `cloudflared tunnel run parkwatch`. Not needed for a single UAT session.
