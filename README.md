# 🚀 NOOR DRIVE — Personal Multi-Platform Cloud Vault

<div align="center">

[![Live Web App](https://img.shields.io/badge/Live%20Web%20App-noordrive.is--a.dev-4F46E5?style=for-the-badge&logo=cloudflare&logoColor=white)](https://noordrive.is-a.dev)
[![Render Fallback](https://img.shields.io/badge/Render%20Cloud-noor--cloud--vault-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://noor-cloud-vault.onrender.com)
[![Download Android APK](https://img.shields.io/github/v/release/NoorAbdullah02/open-cloud-vault?color=7C3AED&label=Android%20APK&style=for-the-badge&logo=android&logoColor=white)](https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest)

<br/>

[![Build Android APK](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-android-apk.yml/badge.svg)](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-android-apk.yml)
[![Build iOS IPA](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-ios-ipa.yml/badge.svg)](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-ios-ipa.yml)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![Flutter 3.27](https://img.shields.io/badge/Flutter-3.27-02569B?logo=flutter&logoColor=white)](https://flutter.dev/)
[![NestJS 10](https://img.shields.io/badge/NestJS-10.4-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-00e599?logo=postgresql&logoColor=white)](https://neon.tech/)
[![Free Domains Directory](https://img.shields.io/badge/Free%20Domains-PDF%20Guide-2563EB?logo=adobeacrobatreader&logoColor=white)](./docs/FREE_DOMAINS_DIRECTORY.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  <b>A private, high-speed, and stateless multi-platform cloud storage ecosystem inspired by Google Drive and Dropbox.</b><br/>
  Zero disk consumption • High-speed MTProto streaming • Isolated biometric vault • Free custom domain • Serverless PostgreSQL
</p>

</div>

---

## 📌 Quick Access Links
* 🌐 **Live Custom Domain:** [https://noordrive.is-a.dev](https://noordrive.is-a.dev)
* ☁️ **Render Cloud Primary:** [https://noor-cloud-vault.onrender.com](https://noor-cloud-vault.onrender.com)
* 📱 **Download Android App:** [Latest Release APK](https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest/download/noor-drive.apk)
* 📚 **Free Domains & Subdomains Directory:** [FREE_DOMAINS_DIRECTORY.md](./docs/FREE_DOMAINS_DIRECTORY.md) • [Download PDF Guide](./docs/FREE_DOMAINS_DIRECTORY.pdf)

---

## 💡 What Makes NOOR DRIVE Different?

| Feature | Google Drive / Dropbox | Generic Self-Hosted Cloud | 🚀 NOOR DRIVE |
| :--- | :--- | :--- | :--- |
| **Monthly Cost** | \$2 – \$10 / month | \$5 – \$20 / month (VPS) | **100% Free Forever** |
| **Storage Engine** | Proprietary corporate servers | Local hard drive / S3 buckets | **Private Telegram MTProto Cloud Vault** |
| **Server Disk Usage** | High storage footprint | GBs of server disk required | **0 MB (Pure in-memory streaming)** |
| **Secret Vault** | Paid add-on or unavailable | Manual encryption required | **Biometric + PIN isolated quarantine** |
| **Public Sharing** | Strict link limits | Basic raw download links | **Google Drive-style 60-day tokenized shares** |
| **In-App Media Viewers** | Basic image/video previews | External tools required | **PDF, DOCX, PPTX, Video Seek, Audio Bar, ZIP** |
| **Mobile Integration** | Proprietary app | Often web-only | **Native Flutter Android APK + iOS PWA/IPA** |
| **Custom Domain** | Paid enterprise plan | Complex manual Nginx setup | **Automated Free is-a.dev CNAME + SSL** |

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────┐        ┌────────────────────────────────────────────────────────┐
│               Web Dashboard (Next.js 15)               │        │               Mobile App (Flutter 3.27)                │
│    React 19 • PWA • Tailwind CSS • Lucide • SW Cache   │        │     Android APK • iOS IPA • Biometric Auth • Dio       │
└───────────────────────────┬────────────────────────────┘        └───────────────────────────┬────────────────────────────┘
                            │                                                                 │
                            │                         HTTPS / REST / Range                    │
                            └────────────────────────────────┬────────────────────────────────┘
                                                             ▼
                                     ┌──────────────────────────────────────────────┐
                                     │            NestJS 10 API Server              │
                                     │   • Master Passcode + JWT + TOTP 2FA         │
                                     │   • Ephemeral Memory Upload Stream           │
                                     │   • HTTP 206 Partial Content (Range Seeking) │
                                     │   • Secret Vault Quarantine Engine           │
                                     │   • Canonical Camera Uploads Singleton       │
                                     │   • Non-Destructive File Versioning Timeline │
                                     │   • 60-Day Tokenized Public Sharing Engine   │
                                     │   • Brevo Transactional Notification Service │
                                     │   • Dynamic Multi-Domain CORS Controller     │
                                     │   • 30-Day Trash Auto-Purge Cron Worker      │
                                     └──────────────────────┬───────────────────────┘
                                                            │
                                         ┌──────────────────┴──────────────────┐
                              Prisma ORM │                                     │ MTProto Chunk Stream
                                         ▼                                     ▼
                             ┌──────────────────────┐              ┌───────────────────────────┐
                             │   Neon PostgreSQL    │              │   Telegram MTProto Cloud  │
                             │   (Metadata, ACL,    │              │    (Private Cloud Vault,  │
                             │   Versions, Shares)  │              │   Saved Messages Storage) │
                             └──────────────────────┘              └───────────────────────────┘
```

---

## ✨ Features Deep-Dive

### 1. 🔒 Secret Vault / Isolated Safe Folder
* **Biometric & PIN Quarantine:** Protect sensitive documents using Fingerprint/Face ID on mobile (`local_auth`) or a 6-digit cryptographic PIN on the web.
* **Strict Listing Exclusion:** Items placed inside the Secret Vault are quarantined and strictly hidden from root `my-drive`, global search, and recent file feeds.
* **1-Click Relocation:** Move items into the vault or restore them back to My Drive seamlessly.
* **Automatic Idle Lock:** Auto-locks upon minimizing the mobile app or after periods of web inactivity.

### 2. 🎬 Cinema-Grade Media Players & Seeking (HTTP 206 Range)
* **Smooth Video Seeking:** HTTP 206 Partial Content range requests allow instant scrubbing, fast-forwarding, and rewinding across 4K/1080p videos without waiting for the full file to download.
* **Floating Audio Player Dock:** Bottom dock audio player with playlist queue, waveform progress scrubbing, and play/pause controls.
* **Native Document Viewers:** Built-in PDF reader with zoom/page controls, plus native Word (`.docx`) and PowerPoint (`.pptx`) previewers.
* **In-App ZIP Inspector:** Preview file trees inside `.zip` archives directly in the browser with single-file extraction.
* **Photo Lightbox:** Smooth gesture zoom, pan, 90° rotation, and flipping.

### 3. 📸 Canonical Camera Uploads & System Share Sheet
* **Singleton Folder Architecture:** Guarantees a single, unified `Camera Uploads` directory across all connected devices.
* **Android Share Sheet Ingestion:** Select photos, 4K videos, or files in **Gallery**, **Google Photos**, or **WhatsApp**, and tap "Share to NOOR DRIVE" for background uploading.
* **1-Tap Cloud Backup:** Backup entire mobile photo albums with live upload progress (MB/s speed and ETA).

### 4. 🕒 Non-Destructive Version History & Rollback
* **Never Lose Work:** In-place file edits and overwrites automatically increment version numbers while keeping the public share URL unchanged.
* **Timeline Modal:** Review version history with file sizes, timestamps, and active badges.
* **1-Click Rollback:** Instantly restore any previous version.

### 5. 🔗 Google Drive-Style Public Sharing (60-Day Default)
* **Default 2-Month Expiry:** Shared links default to 60 days of validity so clients and friends can access them long after sharing.
* **Viewer & Editor Permissions:** Share single files or nested folders with read-only or collaborative upload permissions.
* **Direct Social Sharing:** 1-click sharing to WhatsApp, Telegram, Email, and dynamic QR Code generation for mobile scanning.

### 6. 📱 Mobile App Dynamic Server Switcher
* **Zero-Recompilation Domain Switching:** Tap the server chip on the mobile lock screen to switch between `https://noordrive.is-a.dev/api` and `https://noor-cloud-vault.onrender.com/api` without rebuilding the APK.

### 7. ⏱️ 24/7 Keep-Alive Automation (Zero Cold Starts)
* GitHub Actions workflow (`.github/workflows/keep-alive.yml`) automatically pings the live Render instances every 10 minutes to prevent the 15-minute free-tier spin-down, eliminating 50-second cold starts.

---

## 📱 Mobile App (Android & iOS)

### 🤖 Android (Native Flutter APK)
1. Download the latest release: **[noor-drive.apk](https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest/download/noor-drive.apk)**.
2. Install the APK on your device.
3. Future updates are detected automatically with the 1-tap in-app updater.

### 🍏 iOS Support (iPhone & iPad)
* **Option A — Instant Progressive Web App (PWA):**
  1. Open Safari on your iPhone and visit [https://noordrive.is-a.dev](https://noordrive.is-a.dev).
  2. Tap the Safari **Share** icon (square with upward arrow).
  3. Scroll down and tap **Add to Home Screen**.
  4. NOOR DRIVE installs as a full-screen, standalone native-like app with offline caching!
* **Option B — Automated Cloud IPA:**
  * Unsigned `.ipa` builds are compiled automatically via `.github/workflows/build-ios-ipa.yml` for sideloading via AltStore, Sideloadly, or TrollStore.

---

## 🛠️ Repository Layout

```text
open-cloud-vault/
├── apps/
│   ├── api/                     # NestJS 10 API Server (TypeScript)
│   │   ├── prisma/              # Prisma schema, migrations & seed script
│   │   └── src/
│   │       ├── auth/            # Master passcode, JWT tokens, TOTP 2FA
│   │       ├── drive/           # Drive files, folders, camera singleton, zip, cleanup
│   │       ├── mail/            # Brevo transactional email notification service
│   │       ├── shares/          # Tokenized public shares, visitor alerts, APK release
│   │       └── storage/         # Telegram MTProto chunk stream engine
│   ├── web/                     # Next.js 15 Web Dashboard (React 19)
│   │   ├── public/              # Web manifest, icons, service worker (sw.js)
│   │   └── src/
│   │       ├── app/             # Next.js App router (/, /login, /share/[token])
│   │       ├── components/      # Video player, audio dock, spotlight, doc viewers
│   │       └── lib/             # API client, upload queue, token management
│   └── mobile/                  # Flutter 3.27 Mobile App
│       ├── android/             # Android native manifest, largeHeap & intent filters
│       ├── ios/                 # iOS Runner & Info.plist
│       └── lib/
│           ├── core/            # Dynamic Dio API client & secure storage
│           └── features/        # Drive screen, biometric unlock, media previewers
├── docs/
│   ├── FREE_DOMAINS_DIRECTORY.md# Complete guide to 100% free domain providers
│   └── FREE_DOMAINS_DIRECTORY.pdf# Professional printable PDF guide
├── packages/
│   └── shared-types/            # Shared TypeScript contracts & DTOs
├── scripts/
│   ├── start-combined.js        # Zero-downtime combined production launcher
│   └── telegram-auth.js         # Interactive Telegram MTProto session string generator
├── .github/
│   └── workflows/
│       ├── build-android-apk.yml# Automated APK build & GitHub release
│       ├── build-ios-ipa.yml    # Automated iOS IPA build
│       └── keep-alive.yml       # 10-minute automated ping to prevent sleep
├── render.yaml                  # Render cloud combined blueprint
└── package.json                 # Monorepo workspaces configuration
```

---

## ⚙️ Environment Variables Reference

| Variable | Description | Required | Example Value |
| :--- | :--- | :---: | :--- |
| `DATABASE_URL` | Neon Serverless PostgreSQL connection string | **Yes** | `postgresql://user:pass@ep-host.neon.tech/neondb?sslmode=require` |
| `DRIVE_PASSCODE` | Master unlock passcode | **Yes** | `12345` |
| `SUPER_ADMIN_EMAIL` | Master owner email address | **Yes** | `sheikhnoorabdullah02@gmail.com` |
| `SUPER_ADMIN_PASSWORD` | Master owner password (used for API auth) | **Yes** | `12345` |
| `SUPER_ADMIN_NAME` | Owner display name | No | `Noor Owner` |
| `ADMIN_NOTIFY_EMAIL` | Email to receive drive activity & security alerts | No | `sheikhnoorabdullah02@gmail.com` |
| `BREVO_API_KEY` | Brevo (Sendinblue) v3 API key for email notifications | No | `xkeysib-...` |
| `JWT_ACCESS_SECRET` | 64-char secret for signing short-lived JWT access tokens | **Yes** | `223d0a04...` |
| `JWT_REFRESH_SECRET` | 64-char secret for signing long-lived JWT refresh tokens | **Yes** | `9c890609...` |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifespan | No | `15m` |
| `JWT_REFRESH_EXPIRES_IN`| Refresh token lifespan | No | `30d` |
| `DEFAULT_STORAGE_PROVIDER`| Primary storage backend | **Yes** | `TELEGRAM_MTPROTO` |
| `TELEGRAM_ENABLED` | Enable Telegram cloud storage | **Yes** | `true` |
| `TELEGRAM_USER_CONSENT` | Explicit user consent flag for Telegram MTProto | **Yes** | `true` |
| `TELEGRAM_API_ID` | Telegram API ID from my.telegram.org | **Yes** | `33448471` |
| `TELEGRAM_API_HASH` | Telegram API Hash from my.telegram.org | **Yes** | `3eaa11c52cabf03482173270e32338f9` |
| `TELEGRAM_SESSION_STRING` | Generated Telegram session string | **Yes** | `1BQANOTEuMTA4...` |
| `TELEGRAM_TARGET_CHANNEL` | Storage destination (`me` for Saved Messages or Channel ID)| **Yes** | `me` |
| `CORS_ORIGIN` | Allowed web origins (comma-separated) | **Yes** | `http://localhost:3000,https://noordrive.is-a.dev` |
| `PORT` | Public combined HTTP server port | No | `3000` |
| `API_PORT` | Internal NestJS API port | No | `4000` |
| `NEXT_PUBLIC_API_URL` | Frontend API URL on localhost | No | `http://localhost:4000/api` |

---

## 💻 Local Setup & Development

### 1. Prerequisites
* **Node.js:** v20.x or v22.x LTS
* **npm:** v10.x+
* **PostgreSQL:** Neon Serverless PostgreSQL account (free at [neon.tech](https://neon.tech))

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/NoorAbdullah02/open-cloud-vault.git
cd open-cloud-vault

# Install workspace dependencies
npm install
```

### 3. Generate Telegram MTProto Session
```bash
# Run the interactive session generator
node scripts/telegram-auth.js
```
Enter your phone number and OTP code. Copy the generated `TELEGRAM_SESSION_STRING` into your `.env`.

### 4. Database Setup & Seeding
```bash
# Push schema to Neon PostgreSQL
npm run db:push

# Seed master owner account and storage providers
npm run db:seed
```

### 5. Running Locally
```bash
# Option A: Start single unified server on port 3000 (Same as Render production)
npm start

# Option B: Run separate watch servers for active development
npm run dev:api   # NestJS API -> http://localhost:4000/api
npm run dev:web   # Next.js Web -> http://localhost:3000
```

---

## ☁️ 100% Free Production Deployment (Render + Neon)

This repository includes [`render.yaml`](./render.yaml) to host both the Next.js frontend and NestJS API in **one single Free Render Web Service (`noor-cloud-vault`)**:

1. Fork or push this repository to your GitHub account.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** → **Blueprint** → Select your repository.
3. Provide your environment variables (`DATABASE_URL`, `DRIVE_PASSCODE`, Telegram credentials, and `BREVO_API_KEY`).
4. Click **Apply** — your drive will be deployed and accessible worldwide!

---

## 🌐 Connecting Your Free Custom Domain (`noordrive.is-a.dev`)

1. Submit a registration Pull Request on [is-a-dev/register](https://github.com/is-a-dev/register) targeting `noor-cloud-vault.onrender.com`.
2. In **Render Dashboard** → Select `noor-cloud-vault` → **Settings** → **Custom Domains**.
3. Add `noordrive.is-a.dev` and save.
4. Once the PR is merged, Render automatically verifies the CNAME challenge and issues a free Let's Encrypt SSL certificate!

---

## 🛡️ Security & Privacy Architecture
* **Ephemeral Memory Streaming:** Uploaded files stream through memory buffers straight to Telegram's MTProto storage — zero user files reside permanently on the web server disk.
* **Argon2id Passcode Encryption:** Master passwords and vault PINs are hashed using memory-hard Argon2id.
* **Non-Interactive Audit Logging:** Important operations (logins, shares, deletions) are recorded in the PostgreSQL audit log.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).  
Copyright © 2026 [Noor Abdullah](https://github.com/NoorAbdullah02). All rights reserved.
