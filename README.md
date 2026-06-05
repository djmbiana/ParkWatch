# ParkWatch

OCR-Assisted Citizen Reporting & Cross-Barangay Violation Tracking System for illegal parking enforcement in Malate District, Manila.

Built with Node.js/Express, React + Vite, and MySQL. Integrates Google Cloud Vision API for license plate recognition and Firebase Cloud Messaging for real-time citizen notifications.

> **Status:** Work in progress. Capstone project for De La Salle–College of Saint Benilde (BS Information Systems).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20 LTS, Express.js |
| Frontend | React (Vite build toolchain). Citizen-facing UI is a mobile-responsive web app, not native. |
| Database | MySQL 8.0 |
| OCR | Google Cloud Vision API (TEXT_DETECTION) |
| Notifications | Firebase Cloud Messaging |
| Photo Storage | Google Cloud Storage |
| Hosting (production) | Google Cloud Run, Cloud SQL, asia-southeast1 |
| Containerization | Docker, Docker Compose |
| Auth | JWT (jsonwebtoken) + bcrypt password hashing |

---

## Local Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running before any `docker compose` command)
- [Node.js 20 LTS](https://nodejs.org/) (only needed for generating secrets and running scripts outside containers)
- [Git](https://git-scm.com/) — or [GitHub Desktop](https://desktop.github.com/) if you prefer a GUI
- A code editor — [VS Code](https://code.visualstudio.com/) recommended
- [Postman](https://www.postman.com/downloads/) for API testing
- A Google account with access to the ParkWatch GCP project (ask the team lead for an invite)

### 1. Clone the repository

```bash
git clone https://github.com/djmbiana/ParkWatch.git
cd ParkWatch
```

### 2. Get service-account credentials

Two JSON keys are required to run the backend. Both are gitignored — never commit them.

- `backend/gcp-service-account.json` — for Cloud Vision API and Cloud Storage
- `backend/firebase-service-account.json` — for Firebase Cloud Messaging

See [docs/credentials.md](docs/credentials.md) for how to generate your own keys from the shared GCP project. For sharing existing keys with new teammates, use a secure channel (1Password, Bitwarden) — never email, Discord, or Slack DMs.

### 3. Set up environment files

This project uses **two** `.env` files (this trips most people up — read carefully):

- **`./.env`** at the repo root — read by Docker Compose to provision MySQL
- **`./backend/.env`** — read by the backend at runtime

The `DB_PASSWORD` value must match between the two files, or MySQL will reject the backend's connection.

Create the root `.env`:

```env
DB_NAME=parkwatch
DB_USER=parkwatch_user
DB_PASSWORD=parkwatch_pass
MYSQL_ROOT_PASSWORD=root_pass_change_me
```

Create the backend `.env` from the template:

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in:
- `JWT_SECRET` — generate via `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `GOOGLE_CLOUD_PROJECT_ID=parkwatch-capstone`
- `GCS_BUCKET_NAME=parkwatch-evidence-capstone`
- `FIREBASE_PROJECT_ID=parkwatch-capstone`

Leave the rest as defaults.

### 4. Start the stack

From the repo root:

```bash
docker compose up
```

First boot takes a few minutes (Docker pulls MySQL, installs npm packages, runs schema and seed scripts). Watch for:

parkwatch-backend  | info: Database connected successfully
parkwatch-backend  | info: ParkWatch API running on port 3000 [development]

If the backend crashes with `ECONNREFUSED 3306`, MySQL was still initializing when the backend tried to connect. Run `docker compose restart backend` once and it should pick up.

### 5. Seed test users

In a second terminal:

```bash
docker compose exec backend npm run seed
```

This creates 9 dev accounts (admin, MTPB supervisor, two MTPB officers, two barangay officials, three citizens). All use the password `Malate@2025`. Account details print at the end of the command output.

### 6. Verify

Open `http://localhost:3000/api/v1/health` in your browser. You should see:

```json
{"success": true, "message": "ParkWatch API is running", ...}
```

For API testing, import `docs/postman/ParkWatch.postman_collection.json` into Postman.

---

## Project Structure

ParkWatch/
├── backend/                  # Node.js + Express API
│   ├── src/
│   │   ├── config/           # db.js, firebase.js, logger.js, schema.sql, seed.sql
│   │   ├── controllers/      # Request handlers
│   │   ├── middleware/       # auth.js, errorHandler.js, roleMiddleware.js
│   │   ├── models/           # Table/column constants (TABLE, COLUMNS, ENUMs)
│   │   ├── routes/           # Express route definitions
│   │   └── utils/            # jwt.js and other helpers
│   ├── tests/                # Jest + Supertest
│   ├── .env.example          # Backend env template
│   └── server.js             # Process entry point
├── frontend/                 # React + Vite (WIP). All portals plus the
│                             # mobile-responsive citizen interface live here.
├── docs/
│   ├── credentials.md        # How to generate GCP/Firebase service-account keys
│   └── postman/              # API collection
├── docker-compose.yml        # Local dev orchestration
└── .env.example              # Root env template (Docker variable substitution)

---

## Security & TLS

### Production
All production traffic is encrypted via HTTPS/TLS 1.2+. The Cloud Run service sits behind a Google Cloud load balancer that terminates TLS, so the application never sees plain HTTP traffic in production. This is automatic and requires no team configuration.

### Local development — HTTPS skipped (intentional)
Local development runs on plain HTTP (`http://localhost:3000`). This is a deliberate decision:

- **Production TLS is what matters.** Cloud Run terminates TLS automatically with certificates provisioned by Google. Local self-signed certificates would not resemble production setup anyway.
- **Local HTTPS adds friction without proportional benefit.** Self-signed certificates require each teammate to install a local CA, trust it on their OS, and configure browsers to accept it. This is recurring overhead that doesn't catch real bugs.
- **No HTTP/HTTPS behavior gap.** Application code reads `req.protocol` via `trust proxy: 1` (see `src/app.js`), so production-aware code paths work identically whether the local proxy is plain HTTP or TLS-terminated.
- **The threat model doesn't justify it.** Local dev traffic stays on `localhost` and does not traverse public networks.

If a teammate has a specific reason to enable HTTPS locally (testing an HSTS bug, mirroring production exactly), they can install [mkcert](https://github.com/FiloSottile/mkcert), generate a `localhost` cert, and update `server.js` to use `https.createServer`. This is opt-in only.

### Authentication
- JWT tokens contain `{ id, role, barangay_id }` and expire per `JWT_EXPIRES_IN` (default 7 days)
- Passwords are hashed with bcrypt (10 salt rounds)
- Login responses are timing-equalized — a dummy bcrypt comparison runs even when the email is not found, to prevent account enumeration via response timing
- Generic 401 message ("Invalid email or password") returned for both wrong-password and unknown-email cases

### CORS
- Production: explicit allow-list via `CORS_ORIGINS` env var
- Development: explicit allow-list for `http://localhost:5173` (Vite default)
- See `src/app.js` for the full configuration

---

## Roles

The system has **five** user roles. The frontend uses these exact string values for role checks:

| Role string | Description |
|---|---|
| `citizen` | Self-registered users who submit violation reports |
| `brgy_official` | Verifies submitted reports for their assigned barangay |
| `mtpb_officer` | MTPB enforcement personnel; acknowledges and resolves reports |
| `mtpb_supervisor` | Reviews escalated reports and generates reports |
| `admin` | System administrator (user management, barangay enrollment, etc.) |

Self-registration only creates `citizen` accounts. Staff accounts are provisioned via the seed script or, in production, via an admin endpoint.

---

## Common Commands

```bash
# Start everything (foreground)
docker compose up

# Start in background
docker compose up -d

# Stop everything (data preserved)
docker compose down

# Stop AND wipe the database (nukes seeded data)
docker compose down -v

# See backend logs
docker logs parkwatch-backend --tail 50 -f

# Re-seed test users
docker compose exec backend npm run seed

# Open MySQL prompt
docker compose exec db mysql -u parkwatch_user -pparkwatch_pass parkwatch

# Run backend tests
docker compose exec backend npm test
```

---

## Branching & PR Conventions

Branch names follow `<type>/<short-description>`:

| Prefix | For |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `chore/` | Config, deps, tooling |
| `test/` | Tests |

Commits follow `<type>: <short description>`. One PR per logical change. Branch off `main` (no `develop` branch in use yet).

---

## Team

- Derrick James Biana
- Ryan Alexander Indanan
- Angelo Luis Montenegro
- Cedrick Uy

Capstone adviser: Mr. Bary Reyes
School of Management and Information Technology, De La Salle–College of Saint Benilde