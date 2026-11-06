# Nebula

Nebula вЂ” anonymous social platform (social network + messenger) with end-to-end encryption (E2EE). A single product combining a social feed, encrypted messaging, WebRTC audio/video calls, a suggestions forum, an admin panel, monetization, PWA, and native mobile/desktop wrappers.

---

## Project Structure

| Folder | Purpose |
|---|---|
| `backend/` | FastAPI backend (WebSocket /ws + REST /api/*) |
| `l_frontend/` | Canonical frontend (Next.js 16, App Router, React 19, TypeScript) |
| `desktop/` | Electron desktop app for Windows (NSIS installer, "trelod") |
| `mobile/` | Capacitor mobile project (Android APK, iOS) |

---

## Features

### Social Feed
- Post creation with Markdown editor, images (Cloudinary), tags, drafts, and video notes
- Feed with infinite loading and skeletons; tabs "All / Following"
- Interactions: like/dislike, Echo (repost with comment), repost, bookmark, replies, view counter
- Post pages: /post/[id], /tag/[name], /user/[id]
- Link previews, Markdown with GFM and DOMPurify sanitization
- Search across posts, users, and tags
- Recommended users in the right panel

### Encrypted Messenger
- Personal and group chats with E2E encryption (X25519 + AES, session key per chat)
- Media encrypted client-side before upload to Cloudinary
- WebRTC audio/video calls with TURN/ICE signaling via WebSocket
- Video notes, stickers, message reactions
- 2FA (TOTP, QR codes)
- Registration without email (email optional)

### Community & Moderation
- Suggestions forum with threads, categories, and moderation statuses
- Blog/updates section
- Rules system with versioning
- Reports, warnings, bans, action logging (ActionLog, IPLog, IPBlock)
- Admin panel: users, roles, badges, themes, stickers, reports, statistics, logs, payments

### PWA & Mobile
- Installable as PWA with offline cache, Web Push, service worker
- Custom app icons with 7 themes (PWA and APK mipmaps)
- APK auto-updates from update.json (no GitHub Releases required)
- Android (Capacitor) and iOS native wrappers

### Desktop (Windows)
- Electron app named "trelod" with NSIS installer
- Auto-updates from update.json hosted with the frontend
- Silent background updates

### Monetization
- Payment module for selling roles and badges
- Stripe and manual payment providers
- Admin toggle for paid roles, price, period, features
- User purchase history and subscription management

---

## Technical Stack

### Backend (backend/)
- Python + FastAPI вЂ” ~233 REST endpoints + WebSocket /ws
- SQLModel / SQLAlchemy 2.0 вЂ” 55 database tables, PostgreSQL (production) / SQLite (local), Alembic migrations
- Authentication вЂ” JWT (PyJWT, python-jose), bcrypt + passlib, refresh tokens, 2FA (pyotp)
- WebSocket вЂ” connection manager, chat rooms, call signaling, real-time counters
- Web Push вЂ” pywebpush + py-vapid (VAPID)
- Media вЂ” Cloudinary SDK, Pillow, imageio-ffmpeg (video notes), OG link previews (beautifulsoup4)
- Payments вЂ” payments.py, payment_providers.py (Stripe, manual)
- Monitoring вЂ” Sentry SDK, structlog, performance middleware
- Rate limiting вЂ” slowapi (Redis or in-memory fallback)

### Frontend (l_frontend/)
- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS 4 (@tailwindcss/postcss)
- Cryptography вЂ” @noble/ciphers, @noble/curves, @noble/hashes for client-side E2EE
- UI вЂ” lucide-react, @headlessui/react, react-easy-crop, react-markdown + remark-gfm + rehype-raw, isomorphic-dompurify, next-themes, qrcode.react, html5-qrcode
- PWA вЂ” service worker, manifest, offline page, push notifications, background sync
- i18n вЂ” Russian, Ukrainian, English
- Shells вЂ” Classic, Dock, Orbit navigation modes
- Testing вЂ” Vitest

### Mobile / Desktop
- Capacitor вЂ” Android + iOS builds, native plugins, Gradle
- Electron + electron-builder вЂ” NSIS installer, auto-updates from static CDN
- Deploy вЂ” Render (backend) + Vercel (frontend)

---

## API Overview

### Authentication
- POST /api/register вЂ” user registration (JWT issued)
- POST /api/login вЂ” login (access + refresh tokens)
- POST /api/login/2fa вЂ” two-factor authentication

### Posts
- GET /api/posts вЂ” feed
- POST /api/posts вЂ” create post
- GET /api/posts/following вЂ” following feed
- POST /api/posts/{id}/bookmark вЂ” bookmark/unbookmark
- GET /api/bookmarks вЂ” list bookmarks

### Chats & Messages
- WebSocket /ws вЂ” real-time messaging and call signaling
- REST endpoints for chat management and message history

### Calls (WebRTC)
- GET /api/ice-servers вЂ” TURN/ICE credentials (JWT required)

### Payments
- GET /api/payments/system/status вЂ” payment system status
- POST /api/payments/create вЂ” create payment (Stripe Checkout)
- GET /api/payments/available вЂ” available paid roles for user
- GET /api/payments/my вЂ” purchase history

### Admin
- User management, roles, badges, themes, stickers
- Reports, moderation queue, bans, warnings
- Statistics and action logs

---

## Deployment

### Backend (Render)
1. Connect repository to Render
2. Set build command: pip install -r requirements.txt
3. Set start command: python scripts/run_migrations.py && uvicorn main:app --host 0.0.0.0 --port $PORT
4. Configure environment variables in Render dashboard (SECRET_KEY, DATABASE_URL, CLOUDINARY_*, STRIPE_*, METERED_*, VAPID_*, etc.)

### Frontend (Vercel)
1. Connect l_frontend/ to Vercel
2. Build command: npm run build
3. Set NEXT_PUBLIC_API_URL to your backend URL

### Environment Variables (Backend)
| Variable | Description |
|---|---|
| SECRET_KEY | JWT signing key (required) |
| DATABASE_URL | PostgreSQL or SQLite connection string |
| REDIS_URL | Redis for rate limiting (optional, in-memory fallback) |
| FRONTEND_URL | Frontend URL for redirects |
| CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET | Cloudinary media storage |
| STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET | Stripe payments |
| METERED_API_KEY / METERED_USERNAME / METERED_PASSWORD | TURN credentials for calls |
| VAPID_PRIVATE_PEM / VAPID_PUBLIC_B64 | Web Push VAPID keys |
| SENTRY_DSN | Error monitoring (optional) |

---

## Development

### Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd l_frontend
npm install
npm run dev
```

### Mobile (Android)
```bash
cd mobile
npm install
npx cap open android
```

### Desktop (Windows)
```bash
cd desktop
npm install
npm run dist
```

---

## License

Private project. All rights reserved.

