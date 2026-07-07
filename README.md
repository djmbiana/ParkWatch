# ParkWatch

**OCR-Assisted Citizen Reporting and Cross-Barangay Parking Violation Tracking System**

A capstone project for the BS Information Systems program at De La Salle–College of Saint Benilde. ParkWatch enables residents of Malate, Manila to anonymously report illegal parking via a mobile web app. Reports are routed through a chain of barangay officials, MTPB enforcement officers, and supervisors — with real-time notifications at every step.

**Live Demo:** [https://parkwatch-capstone.web.app](https://parkwatch-capstone.web.app)

**GitHub Repository:** [https://github.com/djmbiana/ParkWatch](https://github.com/djmbiana/ParkWatch)

---

## Key Features

- **Anonymous citizen reporting** — no account required; reports are tracked via a per-submission access token stored in the browser
- **OCR license plate recognition** — Google Cloud Vision API extracts plate numbers from uploaded photos; citizens confirm or correct the reading
- **Duplicate detection** — flags if the same plate has already been reported on the same street recently; citizens can add corroborating photos
- **Four-tier enforcement pipeline** — Pending → Verified → Acknowledged → Dispatched → Resolved, with escalation to supervisor if deadlines are missed
- **Penalty tier system** — Warning / Ticket / Clamp / Impound tiers based on repeat-offense history
- **Cross-barangay plate search** — officers and supervisors can look up a plate's full violation history across all partner barangays
- **Real-time push notifications** — Firebase Cloud Messaging notifies citizens at each status change
- **Role-based access control** — group-based permission matrix; five staff roles each with scoped views and actions
- **Anonymous appeal flow** — citizens can contest a declined report; barangay officials render a verdict
- **Responsive staff portals** — Barangay, MTPB Officer, MTPB Supervisor, and Admin portals all work on mobile

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20 LTS, Express.js |
| Frontend | React 18 + Vite |
| Database | MySQL 8.0 |
| OCR | Google Cloud Vision API (TEXT_DETECTION) |
| Push Notifications | Firebase Cloud Messaging |
| Photo Storage | Google Cloud Storage |
| Frontend Hosting | Firebase Hosting |
| Backend Hosting | Docker / Cloud Run (asia-southeast1) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Testing | Jest + Supertest (backend), Playwright (E2E) |

---

## Partner Barangays (UAT)

Malate District, Manila: Barangay 726, 727, 729, 730, 762

---

## Local Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (must be running before any `docker compose` command)
- [Node.js 20 LTS](https://nodejs.org/) (for generating secrets and running scripts outside containers)
- [Git](https://git-scm.com/)
- A Google account with access to the ParkWatch GCP project

### 1. Clone

```bash
git clone https://github.com/djmbiana/ParkWatch.git
cd ParkWatch
```

### 2. Service-account credentials

Two JSON key files are required. Both are gitignored — never commit them.

- `backend/gcp-service-account.json` — for Cloud Vision API and Cloud Storage
- `backend/firebase-service-account.json` — for Firebase Cloud Messaging

See [docs/credentials.md](docs/credentials.md) for how to generate keys from the shared GCP project.

### 3. Environment files

This project uses **two** `.env` files:

- **`./.env`** — read by Docker Compose to provision MySQL
- **`./backend/.env`** — read by the backend at runtime

The `DB_PASSWORD` value must match in both files.

Root `.env`:

```env
DB_NAME=parkwatch
DB_USER=parkwatch_user
DB_PASSWORD=parkwatch_pass
MYSQL_ROOT_PASSWORD=root_pass_change_me
```

Backend `.env` (copy from template, then fill in secrets):

```bash
cd backend && cp .env.example .env
```

Required values in `backend/.env`:
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `GOOGLE_CLOUD_PROJECT_ID=parkwatch-capstone`
- `GCS_BUCKET_NAME=parkwatch-evidence-capstone`
- `FIREBASE_PROJECT_ID=parkwatch-capstone`

### 4. Start

```bash
docker compose up
```

First boot takes a few minutes. Watch for:

```
parkwatch-backend  | info: Database connected successfully
parkwatch-backend  | info: ParkWatch API running on port 3000 [development]
```

### 5. Seed test accounts

```bash
docker compose exec backend npm run seed
```

Creates staff accounts for all five roles. Credentials print at the end of the command output.

### 6. Verify

`http://localhost:3000/api/v1/health` should return `{"success": true, ...}`.

Import `docs/postman/ParkWatch.postman_collection.json` into Postman for the full API reference.

---

## Project Structure

```
ParkWatch/
├── backend/                  # Node.js + Express API
│   ├── src/
│   │   ├── controllers/      # Request handlers
│   │   ├── middleware/       # auth, RBAC, status guards
│   │   ├── routes/           # Express route definitions
│   │   └── services/         # Notification, OCR helpers
│   ├── migrations/           # Ordered SQL migrations (001–035)
│   ├── tests/                # Jest + Supertest
│   └── .env.example
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── citizen/      # Anonymous mobile reporting wizard
│   │   │   ├── barangay/     # Barangay official portal
│   │   │   ├── mtpb/         # Officer + Supervisor portals
│   │   │   └── admin/        # Admin portal
│   │   └── components/
│   └── e2e/                  # Playwright E2E tests (role-based, FR-01–FR-20)
├── docs/
│   ├── credentials.md
│   └── postman/
├── docker-compose.yml
└── .env.example
```

---

## Roles

| Role | Description |
|---|---|
| Citizen | Submits reports anonymously via mobile web app; tracks status via access token |
| Barangay Official | Verifies or declines submitted reports for their assigned barangay |
| MTPB Officer | Acknowledges, dispatches, and resolves verified reports |
| MTPB Supervisor | Handles escalated reports; configures SLA timers; generates enforcement reports |
| Admin | User management, barangay enrollment, parking rules, penalty tiers |

---

## Common Commands

```bash
# Start the full stack (foreground)
docker compose up

# Start in background
docker compose up -d

# Stop (data preserved)
docker compose down

# Stop and wipe the database
docker compose down -v

# View backend logs
docker logs parkwatch-backend --tail 50 -f

# Re-seed test accounts
docker compose exec backend npm run seed

# Run backend unit + integration tests
docker compose exec backend npm test

# Run migrations manually
docker compose exec backend npm run migrate

# Open MySQL prompt
docker compose exec db mysql -u parkwatch_user -pparkwatch_pass parkwatch
```

---

## Team

| Name | Role |
|---|---|
| Derrick James Biana | Lead Developer |
| Ryan Alexander Indanan | Developer |
| Angelo Luis Montenegro | Developer |
| Cedrick Uy | Developer |

**School of Management and Information Technology, De La Salle–College of Saint Benilde**
**Academic Year 2025–2026**
