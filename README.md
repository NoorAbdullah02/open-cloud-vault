# NOOR DRIVE — Personal Multi-Platform Cloud Vault

[![Build Android APK](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-android-apk.yml/badge.svg)](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-android-apk.yml)
[![Build iOS IPA](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-ios-ipa.yml/badge.svg)](https://github.com/NoorAbdullah02/open-cloud-vault/actions/workflows/build-ios-ipa.yml)
[![Latest Release](https://img.shields.io/github/v/release/NoorAbdullah02/open-cloud-vault?color=indigo&label=Android%20APK)](https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![Flutter](https://img.shields.io/badge/Flutter-3.27-blue?logo=flutter)](https://flutter.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-10.4-red?logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-00e599?logo=postgresql)](https://neon.tech/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**NOOR DRIVE** is a private, production-grade, and stateless personal cloud storage platform inspired by Google Drive and Dropbox.  
All uploaded files stream directly through high-speed memory buffers to your private **Telegram MTProto Cloud Vault** (**zero disk usage & unlimited free cloud storage**), while metadata, file version trees, secret vault isolation, folder hierarchies, tokenized public shares, and audit logs live securely in serverless **Neon PostgreSQL**.

---

## 🏛️ System Architecture

```text
┌──────────────────────────────────────────────┐        ┌──────────────────────────────────────────────┐
│          Web Dashboard (Next.js 15)          │        │          Mobile App (Flutter 3.27)           │
│   React 19 • PWA • Tailwind • Lucide • SW   │        │   Android APK • iOS IPA • Biometric • Dio    │
└──────────────────────┬───────────────────────┘        └──────────────────────┬───────────────────────┘
                       │                                                       │
                       │                     HTTPS / REST                      │
                       └───────────────────────────┬───────────────────────────┘
                                                   ▼
                               ┌───────────────────────────────────────┐
                               │           NestJS API Server           │
                               │  • Master Passcode + JWT + TOTP 2FA   │
                               │  • Memory Stream Pipeline             │
                               │  • Secret Vault Isolated Engine       │
                               │  • Canonical Camera Uploads Singleton │
                               │  • File Version Timeline Manager      │
                               │  • In-Place Update & Share Sync       │
                               │  • Batch ZIP Archiver & Downloader    │
                               │  • 30-Day Trash Auto-Purge Worker     │
                               └───────────────┬───────────────┬───────┘
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

## ✨ Core Features & Highlights

### 1. 🔒 Secret Vault / Safe Folder
* **Biometric & PIN Isolation:** Access sensitive documents via Fingerprint/Face ID on mobile (`local_auth`) or 6-digit PIN on web.
* **Strict View Exclusion:** Files and folders in the Secret Vault are quarantined and strictly excluded from root `my-drive`, search listings, and recent views.
* **1-Click Relocation:** Seamlessly move files into the Secret Vault or restore them back to My Drive with context menu actions.
* **Auto-Lock on Idle:** Automatic lock triggers when minimizing the mobile app or after inactivity on the web.

### 2. 📝 In-Drive Live Text & Markdown Editor
* **Split Real-Time Preview:** Live markdown rendering alongside plain text editor with synchronized preview.
* **In-Place Saving:** Edits save directly back to NOOR DRIVE without altering the file ID or breaking public share links.
* **Format Support:** Full syntax support for `.md`, `.txt`, `.json`, `.csv`, `.log`, `.py`, `.js`, `.ts`, `.html`, `.css`, and `.dart`.

### 3. 📸 Canonical Camera Uploads & Gallery Backup
* **Zero Duplication Singleton:** Guaranteed single canonical `Camera Uploads` folder across all devices; multiple duplicate folders are automatically consolidated into one.
* **Android 11–14 MediaStore & SAF Resilient:** Supports direct file paths and memory byte streams (`withData: true`), preventing silent upload skips.
* **1-Tap Cloud Backup:** Back up photos and videos from your phone’s gallery directly into `Camera Uploads` with progress bars and transfer statistics.

### 4. 🕒 File Version History & 1-Click Rollback
* **Non-Destructive Overwrites:** Replacing a file or editing text creates an incremental version record without destroying earlier versions.
* **Version Timeline Modal:** View version numbers, file sizes, creation timestamps, and active status tags.
* **Instant Revert:** Revert any file back to an earlier version with a single click.

### 5. 🔗 Google Drive-Style Public Sharing (2-Month Validity)
* **Default 2-Month (60-Day) Expiry:** Share links default to 60 days of validity so friends and clients can view files long after sharing.
* **Persistent Live Updates:** When a shared file is replaced or edited in-place, the public link automatically serves the latest version without requiring a new URL.
* **Instant Social Sharing:** 1-click direct sharing via WhatsApp, Telegram, Email, or Native system share sheets, with QR code generation for mobile scanning.
* **Folder Collaboration:** Share entire folder trees with `VIEWER` (preview & download) or `EDITOR` (view, download, and upload without logging in) permissions.

### 6. 📄 Cinema-Grade Viewers & Document Lightboxes
* **PDF Viewer:** In-app PDF rendering with zoom, navigation, and direct printing.
* **Office Documents:** Native `.docx` (Word) and `.pptx` (PowerPoint) previewers without requiring third-party software.
* **Custom Video Player:** Cinema-grade HTML5 video player with keyboard shortcuts, speed control (`0.5x` to `2.0x`), full-screen toggle, and format detection.
* **Persistent Audio Player Bar:** Bottom audio dock with playback queue, progress scrubbing, and play/pause controls.
* **Photo Lightbox:** Smooth zoom, pan, 90° rotation, and horizontal/vertical flipping for images.
* **In-App ZIP Explorer:** Explore contents of compressed archives directly in the browser with nested file previews.

### 7. 📦 Batch Operations & Selection ZIP Download
* **Multi-Select (`Ctrl+A`):** Select multiple files and folders across any view using keyboard shortcuts or the dynamic master checkbox.
* **1-Click Batch ZIP Download:** Bundles all selected files and nested folders into a single compressed `noor-drive-selection.zip` archive on the fly.
* **Bulk Trash & Delete:** Move multiple items to Trash or permanently delete them in a single action.

### 8. 🔍 Spotlight Command Palette (`Ctrl+K` / `Cmd+K`)
* Instant global search across all files, folders, and actions.
* Quick shortcuts for uploading, creating folders, locking vault, toggling dark mode, cleaning storage, and downloading mobile apps.

### 9. 🗑️ 30-Day Trash Auto-Purge & Recovery
* Files kept in Trash longer than 30 days are automatically purged from the database and Telegram cloud.
* Dedicated **Empty Trash** and **Purge Expired Now** buttons for immediate storage reclamation.

### 10. 📲 Android System Share Sheet Integration (Direct Gallery & File Uploads)
* **Direct OS Share Target:** Share photos, 4K videos, documents, or APKs from **Gallery**, **Google Photos**, **Files Explorer**, or **WhatsApp** directly to NOOR DRIVE.
* **Instant Ingestion Dialog:** Automatically captures incoming files via native Android `ACTION_SEND` and `ACTION_SEND_MULTIPLE` intent filters, presenting a confirmation bottom sheet with batch progress indicators.
* **Camera Uploads Target:** Incoming shared files upload directly to your canonical `Camera Uploads` cloud folder with real-time progress feedback.

### 11. 📱 Mobile-First Responsive Web UI & Touch Design
* **Dedicated Mobile Bottom Navigation Bar:** High-performance bottom dock for instant navigation across *Files*, *Camera Uploads*, *Photos*, *Vault*, and *More*.
* **Mobile Bottom Sheet Context Menus:** File options (preview, download, share, versions, rename, trash) appear as native-style bottom sheets optimized for one-handed thumb interaction.
* **Safe-Area Inset Support:** CSS variables respect notch, dynamic island, and gesture bars across iOS Safari and Android Chrome (`env(safe-area-inset-bottom)`).
* **Responsive Search & Dynamic Viewport Units:** Fast full-width search input and `100dvh` previews preventing mobile keyboard layout shifts.

### 12. ⚡ High-Capacity Video Upload Engine & Zero-OOM Streaming
* **Zero Out-Of-Memory (OOM) Protection:** Large video files stream directly from disk cache via `MultipartFile.fromFile` without buffering raw bytes into Dalvik RAM.
* **Large Heap Android Support:** Configured with `android:largeHeap="true"` and `android:requestLegacyExternalStorage="true"` for multi-gigabyte video uploads.
* **Throttled Looper UI:** Progress callbacks throttled to 250ms intervals to eliminate frame drops and ensure smooth 60fps responsiveness during intense uploads.

---

## 📱 Mobile App (Android & iOS)

### Android Installation
1. Go to [Latest Release](https://github.com/NoorAbdullah02/open-cloud-vault/releases/latest).
2. Download **`noor-drive.apk`** (v1.0.52+).
3. Open the APK on your Android device to install.
4. Future updates are detected automatically inside the app with a 1-tap in-app updater!

### iOS Support (iPhone & iPad)
* **Option A — Instant PWA (Recommended, 0 Setup):**
  1. Open Safari on your iPhone and navigate to your deployed web URL.
  2. Tap the **Share** button (box with upward arrow) in Safari.
  3. Scroll down and tap **Add to Home Screen**.
  4. NOOR DRIVE installs directly to your home screen as a full-screen, standalone application with offline support!
* **Option B — GitHub Actions Cloud IPA:**
  1. Automated unsigned `.ipa` files are built via `.github/workflows/build-ios-ipa.yml`.
  2. Sideload via AltStore, Sideloadly, or TrollStore.

---

## 🛠️ Repository Layout

```text
Personal_Drive/
├── apps/
│   ├── api/                     # NestJS 10 API Server
│   │   ├── prisma/              # Prisma schema, migrations & seed
│   │   └── src/
│   │       ├── auth/            # Master passcode, JWT tokens, TOTP 2FA
│   │       ├── drive/           # Drive files, folders, camera singleton, zip, cleanup
│   │       ├── shares/          # Tokenized public shares, visitor alerts, APK release
│   │       └── storage/         # Telegram MTProto memory stream engine
│   ├── web/                     # Next.js 15 Frontend
│   │   ├── public/              # Web manifest, icons, sw.js
│   │   └── src/
│   │       ├── app/             # App router (/dashboard, /login, /share/[token])
│   │       └── components/      # Document viewers, audio bar, spotlight, modals
│   └── mobile/                  # Flutter 3.27 Mobile App
│       ├── android/             # Android configuration & permissions
│       ├── ios/                 # iOS Runner & Info.plist
│       └── lib/
│           ├── core/            # Dio API client, token interceptors, secure storage
│           └── features/        # Drive screen, gallery backup, biometric passcode
├── packages/
│   └── shared-types/            # Shared TypeScript contracts & DTOs
├── .github/
│   └── workflows/
│       ├── build-android-apk.yml# Automated APK build & GitHub release
│       └── build-ios-ipa.yml    # Automated iOS IPA build
├── render.yaml                  # Render cloud combined deployment blueprint
└── package.json                 # Monorepo workspaces definition
```

---

## 🌐 API Overview

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/passcode` | Authenticate with master passcode | No |
| `POST` | `/api/auth/refresh` | Refresh access token | No |
| `GET` | `/api/auth/me` | Current user profile & storage quota | Yes |
| `GET` | `/api/drive` | List files and folders with category filters | Yes |
| `GET` | `/api/drive/camera-folder` | Retrieve canonical Camera Uploads folder | Yes |
| `POST` | `/api/drive/folders` | Create a folder (auto-deduplicates Camera Uploads) | Yes |
| `POST` | `/api/drive/upload` | Stream file upload to Telegram MTProto | Yes |
| `POST` | `/api/drive/files/:id/replace` | Replace file in-place (preserves share links) | Yes |
| `PUT` | `/api/drive/files/:id/content` | Update text/code content in-place | Yes |
| `GET` | `/api/drive/files/:id/download` | Download/stream file with range requests | Yes |
| `GET` | `/api/drive/batch/download` | Download selected files & folders as a ZIP | Yes |
| `PATCH`| `/api/drive/:type/:id/trash` | Move file or folder to Trash | Yes |
| `POST` | `/api/drive/bulk` | Bulk move, trash, restore, or delete items | Yes |
| `POST` | `/api/shares` | Create public share link (default 2-month expiry) | Yes |
| `GET` | `/api/shares/app-release` | Fetch latest Android APK release metadata | No |
| `GET` | `/api/shares/public/:token` | View shared file or folder hierarchy | No |
| `GET` | `/api/shares/public/:token/download/:fileId` | Download file from public share link | No |

---

## 💻 Local Development Setup

### 1. Prerequisites
* **Node.js:** v20.x or v22.x LTS
* **npm:** v10.x+
* **PostgreSQL:** Neon Serverless PostgreSQL or local PostgreSQL instance

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/NoorAbdullah02/open-cloud-vault.git
cd open-cloud-vault

# Install all workspace dependencies
npm install
```

### 3. Environment Variables
Create a `.env` file in the project root:
```env
# Database
DATABASE_URL="postgresql://user:password@ep-host.neon.tech/neondb?sslmode=require"

# Server Ports
PORT=3000
API_PORT=4000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:3000"

# Authentication & Passcode
SUPER_ADMIN_EMAIL="admin@noordrive.local"
SUPER_ADMIN_PASSWORD="YourStrongMasterPassword123"
DRIVE_PASSCODE="YourStrongMasterPassword123"
JWT_ACCESS_SECRET="generate-a-strong-32-char-secret-key-here"
JWT_REFRESH_SECRET="generate-another-strong-32-char-secret-key-here"

# Telegram MTProto Cloud Vault
DEFAULT_STORAGE_PROVIDER="TELEGRAM_MTPROTO"
TELEGRAM_ENABLED="true"
TELEGRAM_USER_CONSENT="true"
TELEGRAM_API_ID="your_telegram_api_id"
TELEGRAM_API_HASH="your_telegram_api_hash"
TELEGRAM_SESSION_STRING="your_generated_telegram_session_string"
TELEGRAM_TARGET_CHANNEL="me"

# Frontend URLs
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
```

### 4. Database Push & Running Locally
```bash
# Generate Prisma Client & push schema to Neon DB
npm run db:push

# Seed default admin user & storage providers
npm run db:seed

# Start both NestJS API (port 4000) and Next.js Web (port 3000)
npm run dev:api
npm run dev:web
```

---

## ☁️ Production Deployment

### 1-Click Render Cloud Deployment
The repository includes `render.yaml` configured to build and start both the NestJS API and Next.js frontend concurrently under a single public endpoint:
1. Push your repository to GitHub.
2. In Render, select **New Blueprint Instance** and link your repository.
3. Configure your `DATABASE_URL` and Telegram credentials in the Environment Group.
4. Render automatically compiles the project using `npm run build` and serves traffic through `scripts/start-combined.js`.

---

## 🛡️ Security & Privacy
* **End-to-End Stateless Cloud Streaming:** Uploaded files are streamed through ephemeral server memory directly to Telegram's distributed MTProto servers; no user files reside permanently on the web server disk.
* **Argon2id Passcode Hashing:** Master credentials and PINs are securely hashed using memory-hard Argon2id.
* **XSS & Content Sanitization:** Inline markdown previews strictly escape HTML entities to eliminate script execution risks.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
Copyright © 2026 [Noor Abdullah](https://github.com/NoorAbdullah02). All rights reserved.
