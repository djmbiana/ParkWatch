# Service-Account Credentials

ParkWatch's backend requires two service-account JSON keys to function:

- `backend/gcp-service-account.json` — for Google Cloud Vision API and Cloud Storage
- `backend/firebase-service-account.json` — for Firebase Cloud Messaging

Both files are gitignored and must never be committed.

This document explains how each teammate generates their **own** copies of these keys from the shared GCP project (`parkwatch-capstone`). Generating individual keys is preferred over sharing one — if a teammate leaves, only their key gets revoked, and access for everyone else continues uninterrupted.

---

## Prerequisites

- A Google account with **Editor** (or higher) role on the `parkwatch-capstone` GCP project
- Ask the team lead to grant you access before starting if you have not been added yet

---

## 1. Generate the GCP service-account key

The GCP key authorizes the backend to call the Cloud Vision API and read/write photos in Cloud Storage.

### Step 1 — Open Cloud Shell

1. Go to https://console.cloud.google.com/
2. Sign in with the Google account you've been added with
3. Verify `ParkWatch` is selected in the project dropdown at the top
4. Click the `>_` terminal icon in the top-right header
5. Wait for Cloud Shell to provision (10–20 seconds on first use)

### Step 2 — Verify your access

Run:

```bash
gcloud iam service-accounts list
```

You should see two service accounts:
parkwatch-backend@parkwatch-capstone.iam.gserviceaccount.com
firebase-adminsdk-fbsvc@parkwatch-capstone.iam.gserviceaccount.com

If you get a permission error, the team lead has not granted you access yet.

### Step 3 — Generate a personal JSON key

```bash
gcloud iam service-accounts keys create gcp-service-account.json \
    --iam-account=parkwatch-backend@parkwatch-capstone.iam.gserviceaccount.com
```

You'll see output confirming the key was created.

### Step 4 — Download the key to your local machine

1. In Cloud Shell, click the **⋮ (three-dot menu)** in the top-right of the terminal panel
2. Click **Download**
3. In the path field, type: `gcp-service-account.json`
4. Click **Download** — the file lands in your browser's Downloads folder

### Step 5 — Clean up Cloud Shell

For security, delete the temporary copy in Cloud Shell:

```bash
rm gcp-service-account.json
```

The key still exists in GCP — you only removed Cloud Shell's local copy.

---

## 2. Generate the Firebase service-account key

The Firebase key authorizes the backend to send push notifications via Firebase Cloud Messaging.

### Step 1 — Open Firebase Console

1. Go to https://console.firebase.google.com/
2. Open the `parkwatch-capstone` project (it should appear automatically if you have GCP access)

### Step 2 — Generate the key

1. Click the **⚙️ gear icon** next to "Project Overview" → **Project settings**
2. Click the **Service accounts** tab at the top
3. Scroll to the **Firebase Admin SDK** section
4. Click **Generate new private key**
5. Confirm in the dialog
6. A `.json` file downloads automatically — the name will be something like `parkwatch-capstone-firebase-adminsdk-xxxxx.json`

---

## 3. Place both files in your local repo

In File Explorer (or `mv` from the terminal):

1. Rename the Firebase file to exactly: `firebase-service-account.json`
2. Move both files into `backend/`:

ParkWatch/
└── backend/
├── gcp-service-account.json        # from Cloud Shell
└── firebase-service-account.json   # from Firebase Console


### Verify the files are gitignored

```bash
cd ParkWatch
git status
```

⚠️ Neither file should appear in the output. If either does, **stop** and check `backend/.gitignore` before continuing — both files should already be ignored by the `*-service-account.json` pattern.

---

## Sharing keys with teammates

Don't. Each teammate should generate their own key using the steps above. This way, if anyone leaves the project, the team lead only needs to revoke that person's key — everyone else's continues working.

If sharing is absolutely necessary (e.g., a teammate is stuck and needs to test something quickly), use a secure channel — 1Password, Bitwarden, or a one-time-secret service like https://onetimesecret.com. Never share keys via email, Discord, Slack, or any chat platform.

---

## Revoking a key

If a key is lost, leaked, or a teammate leaves the project, revoke it immediately.

### List existing keys

```bash
gcloud iam service-accounts keys list \
    --iam-account=parkwatch-backend@parkwatch-capstone.iam.gserviceaccount.com
```

This shows each `KEY_ID` and its creation date. Match the ID to the teammate you want to revoke.

### Revoke a specific key

```bash
gcloud iam service-accounts keys delete <KEY_ID> \
    --iam-account=parkwatch-backend@parkwatch-capstone.iam.gserviceaccount.com
```

Other teammates' keys continue working.

---

## Limits

- A GCP service account can hold a maximum of **10 user-managed keys** at any time
- If you hit this, revoke unused keys before generating a new one

For a four-person team, this is plenty of headroom.