# NOOR DRIVE — Personal Multi-Platform Cloud Vault

[![Build Android APK](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-android-apk.yml/badge.svg)](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-android-apk.yml)
[![Latest Release](https://img.shields.io/github/v/release/NoorAbdullah02/open-cloud-vault?color=indigo&label=Android%20APK)](https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![Flutter](https://img.shields.io/badge/Flutter-3.27-blue?logo=flutter)](https://flutter.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-10.4-red?logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-00e599?logo=postgresql)](https://neon.tech/)

**NOOR DRIVE** is a personal, private, and stateless cloud storage platform inspired by Google Drive and Dropbox.  
All uploaded files stream directly through high-speed memory buffers to your private **Telegram MTProto Cloud Vault** (**zero disk usage & unlimited free cloud storage**), while metadata, file version trees, secret vault isolation, folder hierarchies, share links, and audit logs live securely in **Neon PostgreSQL**.

---

## 🏛️ System Architecture

```text
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│     Web Dashboard (Next.js 15)  │         │   Android App (Flutter 3.27)    │
│    PWA Ready • Responsive • SW  │         │   Biometric Auth • Dio • Offline│
└────────────────┬────────────────┘         └────────────────┬────────────────┘
                 │                                           │
                 │                 HTTPS / REST              │
                 └───────────────────────┬───────────────────┘
                                         ▼
                      ┌─────────────────────────────────────┐
                      │        NestJS API Server            │
                      │  • Passcode + JWT Auth + 2FA        │
                      │  • Memory Stream Pipeline           │
                      │  • Secret Vault Isolated Engine     │
                      │  • File Version Timeline Manager    │
                      │  • Batch ZIP Archiver & Downloader  │
                      │  • 30-Day Trash Auto-Purge Worker   │
                      └──────────────┬───────────────┬──────┘
                                     │               │
                         Prisma ORM  │               │ MTProto Stream
                                     ▼               ▼
                      ┌──────────────────────┐ ┌───────────────────────────┐
                      │   Neon PostgreSQL    │ │   Telegram MTProto Cloud  │
                      │   (Metadata, ACL,    │ │    (Private Cloud Vault,  │
                      │   Versions, Shares)  │ │   Saved Messages Storage) │
                      └──────────────────────┘ └───────────────────────────┘
```

---

## 🌟 Key Features

### 1. 🔒 Secret Vault / Safe Folder
* **Pin & Biometric Isolation:** Accessing sensitive documents requires biometric authentication (Fingerprint / Face ID on mobile via `local_auth`) or a 6-digit Secret PIN on web.
* **Hidden from Standard Views:** Files and folders inside the Secret Vault are strictly excluded from root `my-drive` queries and search listings.
* **1-Click Relocation:** Seamlessly move files into the Secret Vault or restore them back to My Drive with context menu actions.

### 2. 🕒 File Version History & 1-Click Rollback
* **Non-Destructive Overwrites:** Updating a file creates an incremental version record without destroying earlier versions.
* **Version Timeline Modal:** View version numbers, file sizes, creation timestamps, and active status tags.
* **Instant Revert:** Revert any file back to a previous version with a single click.

### 3. 🔍 Advanced Smart Search & Filter Chips
* **1-Tap Category Filters:** Instant horizontal filter pills on Web and native `FilterChip` widgets on Mobile:
  * `All Files` • `PDFs` • `Photos & Images` • `Videos` • `Audio` • `Documents` (`.docx`, `.xlsx`, `.pptx`, `.txt`, `.md`) • `Archives` (`.zip`, `.rar`, `.7z`)
* **Live Debounced Search:** Search across names, extensions, and metadata with 300ms debounce.

### 4. 📦 Batch Selection ZIP Download & Multi-Item Delete
* **Select All / Multi-Select:** Select multiple files and folders across any view using `Ctrl+A` or the dynamic Select All checkbox (`Square` / `MinusSquare` / `CheckSquare`).
* **1-Click Batch ZIP Download:** Downloads all selected files and nested folders bundled into a single compressed `noor-drive-selection.zip` archive.
* **Batch Delete & Restore:** Move multiple items to Trash or permanently delete them simultaneously.

### 5. 🗑️ 30-Day Trash Auto-Purge
* **Automated Cleanup:** Files and folders kept in Trash longer than 30 days are automatically purged from database and Telegram cloud.
* **Manual Purge Action:** Dedicated "Purge Expired Now" button to instantly clean up items older than 30 days, alongside "Empty Trash".

### 6. 📱 Mobile Gallery Backup & Offline Mode
* **Camera Roll Sync:** 1-tap backup from your phone's photo gallery into a dedicated `Camera Uploads` cloud folder.
* **Offline Files Cache:** Save documents and photos directly on device storage to view them anytime without an active internet connection.
* **PWA Service Worker:** Progressive Web App service worker (`sw.js`) caches application assets for zero-network resilience.

### 7. 📄 In-App Document & Media Viewers
* **Native In-App Viewers:** Built-in PDF viewer, Word (`.docx`) viewer, PowerPoint (`.pptx`) viewer, custom HTML5 video player, zoomable photo lightbox, and a persistent global audio player bar.
* **Direct Printing:** Native browser print dialog for PDFs and images without memory bloat or lag.

### 8. 🔗 Google Drive-Style Public Sharing
* **Tokenized Share Links:** Share any single file or nested folder hierarchy (`/share/<token>`).
* **Role Permissions:** Viewer (preview & download) or Editor (view, download, and upload without logging in).
* **QR Codes & Expiration:** Generate QR codes and configure links to expire in 24h, 7d, 30d, or never.

---

## 📱 Mobile App & iOS Support

### Android Installation
1. Go to [Releases](https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest).
2. Download the latest **`noor-drive.apk`**.
3. Open the APK on your Android device and install.

### iOS Support (iPhone & iPad)
You **do not need Xcode installed locally** to run NOOR DRIVE on an iPhone:
* **Option A — Instant PWA (Recommended, 0 Setup):**
  1. Open Safari on your iPhone and visit your deployed web URL.
  2. Tap the **Share** button (box with upward arrow) at the bottom.
  3. Scroll down and tap **Add to Home Screen**.
  4. NOOR DRIVE installs directly to your iOS home screen as a standalone full-screen app with offline caching and native performance!
* **Option B — GitHub Actions Cloud IPA Build:**
  * GitHub Actions provides cloud `macos-14` runners with Xcode pre-installed. The Flutter project can be built into an unsigned `.ipa` for sideloading via AltStore, Sideloadly, or TrollStore.

---

## 🛠️ Project Structure

```text
Personal_Drive/
├── apps/
│   ├── api/                 # NestJS 10 backend
│   │   ├── prisma/          # Prisma schema & migrations
│   │   └── src/
│   │       ├── auth/        # Passcode, JWT strategy, TOTP 2FA
│   │       ├── drive/       # Drive files, folders, vault, versions, zip
│   │       ├── shares/      # Public tokenized share links
│   │       └── storage/     # Telegram MTProto streaming engine
│   ├── web/                 # Next.js 15 frontend
│   │   ├── public/          # App icons, favicon, sw.js
│   │   └── src/
│   │       ├── app/         # Dashboard, login, share pages
│   │       └── components/  # Viewers, audio bar, modals
│   └── mobile/              # Flutter 3.27 Android & iOS app
│       └── lib/
│           └── features/    # DriveScreen, auth, offline manager
├── .github/
│   └── workflows/
│       └── build-android-apk.yml # Automated APK release pipeline
├── package.json             # Root workspaces configuration
└── render.yaml              # Render Cloud deployment blueprint
```

---

## 🚀 Local Development Setup

### 1. Prerequisites
* **Node.js:** v20.x or v22.x
* **npm:** v10.x+
* **PostgreSQL:** Neon Serverless Database or local PostgreSQL

### 2. Clone & Install
```bash
git clone https://github.com/NoorAbdullah02/open-cloud-vault.git
cd open-cloud-vault
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://user:password@host/neondb?sslmode=require"
API_PORT=4000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:3000"

DRIVE_PASSCODE="12345"
SUPER_ADMIN_EMAIL="admin@noordrive.local"
SUPER_ADMIN_PASSWORD="12345"
SUPER_ADMIN_NAME="Noor Owner"
JWT_ACCESS_SECRET="your-access-secret-32-chars-minimum"
JWT_REFRESH_SECRET="your-refresh-secret-32-chars-minimum"

TELEGRAM_ENABLED="true"
TELEGRAM_USER_CONSENT="true"
TELEGRAM_API_ID="your_api_id"
TELEGRAM_API_HASH="your_api_hash"
TELEGRAM_SESSION_STRING="your_session_string"
TELEGRAM_TARGET_CHANNEL="me"

NEXT_PUBLIC_API_URL="http://localhost:4000/api"
NEXT_PUBLIC_WS_URL="http://localhost:4000"
```

### 4. Database Setup & Start
```bash
# Push database schema
npm run db:push

# Run API and Web in development
npm run dev:api
npm run dev:web
```
* Web Dashboard: `http://localhost:3000`
* API Server: `http://localhost:4000/api`

---

## ☁️ Deployment

### Render Blueprint (1-Click)
Deploy both the NestJS API and Next.js Web frontend for free on Render using `render.yaml`:
1. Push your repository to GitHub.
2. In Render, select **New Blueprint Instance** and connect your repository.
3. Add your `DATABASE_URL` and Telegram credentials to the Environment Group.

---

## 📄 License
This project is private and developed for personal cloud vault storage. All rights reserved.
