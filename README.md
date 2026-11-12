# NOOR DRIVE

**NOOR DRIVE** is a personal, stateless, multi-platform cloud storage platform inspired by Google Drive and Dropbox.  
All uploaded files stream directly from memory to your private **Telegram MTProto** vault (**zero local disk storage**), while metadata, folder hierarchies, share links, and audit logs live in **Neon PostgreSQL**.

---

## Architecture

```
┌────────────────────────┐      ┌────────────────────────┐
│   Web App (Next.js)    │      │  Android App (Flutter) │
│  apps/web (PWA Ready)  │      │      apps/mobile       │
└───────────┬────────────┘      └───────────┬────────────┘
            │           HTTPS / REST        │
            └───────────────┬───────────────┘
                            ▼
              ┌───────────────────────────┐
              │   NestJS API (apps/api)   │
              │  • Passcode + JWT + 2FA   │
              │  • Memory Upload Stream   │
              │  • Public Share Engine    │
              └─────┬───────────────┬─────┘
                    │               │
         ┌──────────▼─────┐   ┌─────▼──────────────────┐
         │ Neon PostgreSQL│   │   Telegram MTProto     │
         │  (Metadata,    │   │  (Saved Messages /     │
         │  Folders,Logs) │   │   Private Channel)     │
         └────────────────┘   └────────────────────────┘
```

---

## Features

### Web & Mobile Sync
- **Passcode Lock Screen:** Unlock with `DRIVE_PASSCODE` from `.env`, owner profile avatar, and optional TOTP 2FA (QR code).
- **100% Stateless Telegram Storage:** Zero files saved to local disk — uploads stream in memory straight to Telegram MTProto.
- **Live Upload Progress:** Displays uploaded MB / total MB, transfer speed (`MB/s`), estimated time remaining (ETA), and Telegram sync status.
- **Folder & Drag-and-Drop Uploads:** Upload entire nested folder trees via button or drag-and-drop.
- **Live Card Previews:** Inline thumbnails for images, miniature PDF previews, and live text/Markdown snippets right on Grid cards, plus fullscreen modal previews.
- **Fast Caching & In-App Back:** Cached folder views, 30-second JWT session cache, browser preview caching, browser history sync, and an in-app Back button.
- **Google Drive-Style Sharing (No Passcode Required):**
  - Share any **single file** (opens with direct inline preview + download) or **folder** (`/share/<token>`).
  - **Viewer** permission (view & download) or **Editor** permission (view, download, and upload files from any device without logging in).
  - Configurable expiration (`24h`, `7d`, `30d`, or never) and 1-click **Revoke**.
- **Trash & Recovery:** Soft-delete, restore, permanent delete (removes from both PostgreSQL and Telegram), and Empty Trash.
- **Android App & PWA:** Install directly from browser (**Add to Home Screen**) or download the native Flutter Android `.apk` from the sidebar.

---

## Project Structure

```text
Personal_Drive/
├── apps/
│   ├── api/                 # NestJS backend, Prisma schema, Auth, Drive, Shares, Storage
│   ├── web/                 # Next.js 15 frontend, Tailwind CSS, PWA manifest
│   └── mobile/              # Flutter Android app (Riverpod, GoRouter, Dio)
├── packages/
│   └── shared-types/        # Shared TypeScript DTOs and enums
├── scripts/
│   └── telegram-auth.js     # Interactive Telegram MTProto session string generator
├── .env.example             # Environment variable template
├── render.yaml              # 100% Free Render Blueprint (API + Web)
└── package.json             # npm workspaces root
```

---

## Local Setup (Step by Step)

### 1. Install Dependencies
```bash
git clone <your-repo-url>
cd Personal_Drive
npm install
```

### 2. Create a Free Neon PostgreSQL Database
1. Create a free project at [neon.tech](https://neon.tech).
2. Copy your PostgreSQL connection string (`postgresql://...`).
3. Keep `DATABASE_URL` strictly on the backend (`.env` / Render) — never expose it in frontend code.

### 3. Get Telegram API Credentials & Session String
1. Log in at [my.telegram.org](https://my.telegram.org) → **API development tools**.
2. Create an app (avoid the word "Telegram" in the title; e.g. Title: `Noor Drive`, Short name: `noordrive1`, Platform: `Desktop`).
3. Copy your **`API_ID`** and **`API_HASH`**.
4. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```
5. Add `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` to `.env`, then run:
   ```bash
   node scripts/telegram-auth.js
   ```
6. Enter your phone number (with country code) and the OTP sent to your Telegram app. Copy the printed `TELEGRAM_SESSION_STRING` into `.env`.

### 4. Configure `.env`
```env
DATABASE_URL="postgresql://..."
DRIVE_PASSCODE="12345"
SUPER_ADMIN_EMAIL="admin@noordrive.local"
SUPER_ADMIN_PASSWORD="12345"
JWT_ACCESS_SECRET="your-64-char-random-hex"
JWT_REFRESH_SECRET="your-64-char-random-hex"
DEFAULT_STORAGE_PROVIDER="TELEGRAM_MTPROTO"
TELEGRAM_ENABLED="true"
TELEGRAM_USER_CONSENT="true"
TELEGRAM_API_ID="your_api_id"
TELEGRAM_API_HASH="your_api_hash"
TELEGRAM_SESSION_STRING="your_session_string"
TELEGRAM_TARGET_CHANNEL="me"
CORS_ORIGIN="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
NEXT_PUBLIC_WS_URL="http://localhost:4000"
```

### 5. Push Database Schema & Seed Owner Account
```bash
npm run db:push
npm run db:seed
```

### 6. Start Locally
```bash
npm run dev:api   # Backend API -> http://localhost:4000/api
npm run dev:web   # Web App     -> http://localhost:3000
```

---

## 100% Free Cloud Deployment (Render + Neon)

This repository includes [`render.yaml`](./render.yaml) to deploy **both** the Next.js frontend and NestJS backend together in **one single Free Render service (`noor-cloud`)** via [`scripts/start-combined.js`](./scripts/start-combined.js):

1. Push your repository to GitHub (`.env` is gitignored so your secrets stay private).
2. In [Render Dashboard](https://dashboard.render.com) → **New +** → **Blueprint** → select your repository (`master` branch).
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
3. Fill in the prompted environment variables for **`noor-cloud`**:

| Variable | Value |
| :--- | :--- |
| `DATABASE_URL` | Your Neon PostgreSQL URL |
| `DRIVE_PASSCODE` | Your unlock passcode (e.g. `12345`) |
| `SUPER_ADMIN_PASSWORD` | Same passcode (e.g. `12345`) |
| `TELEGRAM_API_ID` | From `my.telegram.org` |
| `TELEGRAM_API_HASH` | From `my.telegram.org` |
| `TELEGRAM_SESSION_STRING` | Generated by `scripts/telegram-auth.js` |

4. Click **Apply** — your app will be live at `https://noor-cloud.onrender.com`!

---

## Android App (`apps/mobile`)

### Run or Build Release APK
```bash
cd apps/mobile
flutter create .
flutter pub get

# Run in debug mode (pointing to Render or local API):
flutter run --dart-define=API_URL=https://noor-cloud.onrender.com/api

# Build release APK:
flutter build apk --release --dart-define=API_URL=https://noor-cloud.onrender.com/api
```

### Host the APK on Your Website
Copy `build/app/outputs/flutter-apk/app-release.apk` to `apps/web/public/downloads/noor-drive.apk` (or set `NEXT_PUBLIC_ANDROID_APK_URL` to a GitHub Release URL). The **Download Android App** modal in the web sidebar will automatically detect and display the exact APK file size.

---

## Security & Notes

- **Never commit `.env`:** `.gitignore` ignores `.env` and `**/.env`.
- **Telegram Limits:** Standard Telegram accounts support up to **2 GB per file** (4 GB for Telegram Premium) and enforce FloodWait rate limits.
- **Revocable Shares:** Any shared link can be revoked immediately from the Share modal.
