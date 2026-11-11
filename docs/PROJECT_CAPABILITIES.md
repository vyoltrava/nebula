Functional and Technical Capabilities of Nebula
This document describes the capabilities found in the repository's source code. It is an inventory of the implementation, not a guarantee that every feature is available in production: that requires a working environment configuration, external services, user permissions, and separate verification of the deployed application.

1. Brief Overview
Nebula (the name trelod is also used in the interface) is a web application for publications and communication. The project includes:

a frontend built on Next.js and React;

an API built on FastAPI with REST and WebSocket;

a web client with PWA capabilities;

Android/iOS shells built on Capacitor;

an Electron client for Windows and a separate Linux variant;

moderation, administration, and community management tools.

Important directories: l_frontend/ — the client; backend/ — the server; mobile/, desktop/, linux/ — platform shells; docs/ — documentation.

2. User Capabilities
2.1 Accounts and Profiles
Registration and login, session refresh and termination.

Two-factor authentication (TOTP), QR login flows, and backup codes.

Switching between multiple accounts in the interface.

User profiles: name, username, description, and profile media.

Subscriptions and follower lists, viewing public keys and the last-read status of a post.

Privacy and profile settings; session and password management.

Role-based and permission-based authorization checks.

Main sources: l_frontend/lib/auth.ts,
l_frontend/lib/AuthProvider.tsx, l_frontend/components/AuthGuard.tsx,
l_frontend/app/login/page.tsx, l_frontend/app/settings/page.tsx,
backend/routers/auth.py, backend/routers/users.py,
backend/routers/permissions.py.

2.2 Publications and Social Feed
A general feed and a subscriptions feed with cursor-based pagination.

Creating text posts and posts with media; the editor supports Markdown formatting. A draft is provided for creating a post.

Replies and post threads, reposts/quotes (Echo), tags, and mentions.

Likes, dislikes, reactions, bookmarks, and a view counter.

Post pages, viewing publications by tag and by user posts.

Search across publications and users; user recommendations.

Link previews and viewing of images, video, and audio.

Video notes and sticker reactions.

Key sources: l_frontend/app/page.tsx,
l_frontend/components/CreatePost.tsx, l_frontend/components/Post.tsx,
l_frontend/app/post/[id]/page.tsx, l_frontend/app/tag/[name]/page.tsx,
l_frontend/app/search/page.tsx,
backend/routers/posts.py, backend/routers/search.py,
backend/recommendations.py.

2.3 Messages and Chats
Private and group chats, a chat list, and search across them.

Chat folders, archiving, pinning, and muting chats.

Messages with text and media, replies, forwarding, editing, and deletion.

Read receipts, reactions, pinned messages, and saved messages.

A sticker set, voice messages, and video notes.

A temporary typing status and live text updates before sending.

Message notifications and unread counters.

Frontend: l_frontend/app/messages/page.tsx,
l_frontend/app/messages/[id]/page.tsx,
l_frontend/components/MessageBubble.tsx. Backend: backend/routers/chats.py,
backend/websocket_manager.py.

2.4 Secure Conversations and Calls
The client contains cryptographic primitives based on X25519 and AES-GCM, key exchange/storage, and encryption of message content.

Secret chats provide client-side encryption of media files and session key state.

Audio and video calls are built on WebRTC; signaling exchange and retrieval of ICE/TURN configuration are tied to the server.

A relayed-call interface is also implemented.

Sources: l_frontend/lib/crypto.ts,
l_frontend/lib/mediaCrypto.ts, l_frontend/lib/secureSessionKeys.ts,
l_frontend/src/hooks/useWebRTC.ts,
l_frontend/components/WebSocketProvider.tsx, backend/routers/calls.py.

The presence of encryption functions in the client is not an independent audit of the protocol or confirmation of end-to-end encryption for every chat type and every sending path. Such claims require a separate audit of the implementation, key management, and server routes.

2.5 Channels and Communities
Channels with subscribers, posts, comments, and reactions.

Channel discovery, subscription, invitations, and join requests.

Polls, pins, management of member roles, and channel moderation.

A suggestions section with categories, discussions, comments, and statuses.

An updates/announcements section with read marking.

Community rules and team pages.

Sources: l_frontend/app/channels/[id]/page.tsx,
l_frontend/app/suggestions/page.tsx, l_frontend/app/updates/page.tsx,
backend/channels.py, backend/routers/suggestions.py,
backend/routers/updates.py, backend/routers/misc.py.

2.6 Additional Communication and Content
Work chats and their related requests/assignments, ratings, and statistics.

Prisme — a separate interface/module for communication and management of secret sessions.

Bot interfaces and administrative bot management.

A catalog and management of sticker sets.

QR scanning and QR functions.

Frontend pages include /messages/work/[id], /prisme, /prisme/[id],
/prism/[id], /bots, /stickers. Related server sources:
backend/work_chats.py, backend/prisma.py, as well as the corresponding
modules connected in backend/main.py.

2.7 Notifications and Feedback
A notification center and a pop-up panel in the navigation.

Web Push with VAPID subscriptions, when keys are configured and the browser supports it.

Warnings, complaints, support requests, and ticket messages.

Bug reports and user suggestions.

Sources: l_frontend/app/notifications/page.tsx,
l_frontend/lib/notifications.ts, backend/routers/notifications.py,
backend/push_service.py, backend/routers/reports.py,
backend/routers/support.py.

3. Administration and Monetization
3.1 Administrative Functions
The interface and API include management tools for:

users, blocks, and warnings;

roles, permissions, badges, and prefixes;

publications, complaints, and moderation;

chats, stickers, themes, and application parameters;

requests/tickets, statistics, and system logs;

backups: creation, viewing, restoration, and deletion in the corresponding administrative interfaces.

Main pages: /admin, /admin/backups,
/admin/badges/system, /admin/chats, /admin/reports, /admin/roles,
/admin/stickers, /admin/tech, /admin/technical, /admin/themes,
/adminnew/billets, /adminnew/payments, /owner-panel.

Backend modules: backend/routers/admin.py, backend/routers/owner.py,
backend/routers/badges.py, backend/routers/billets.py,
backend/routers/permissions.py, backend/routers/themes.py.

3.2 Payments and Paid Features
Server-side payment operations, including creating/verifying payments,
purchase history, and Stripe webhook handling.

A manual provider and management of paid roles/badges.

Premium features, including premium usernames.

Sources: backend/payments.py, backend/payment_providers.py,
backend/routers/premium.py, and the frontend administrative payment pages.
The actual payment methods and availability of features depend on the
provider configuration and server secrets.

4. Technical Architecture
4.1 Frontend
Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4.

Client pages are located in l_frontend/app/; reusable interfaces are in
l_frontend/components/; shared APIs, providers, caches, and functions are
in l_frontend/lib/.

Internationalization: Russian, English, and Ukrainian dictionaries
(l_frontend/lib/i18n/).

Toggleable shells/themes and navigation modes; application providers are
connected in l_frontend/app/layout.tsx.

Vitest is used for frontend tests; project commands are listed in
l_frontend/package.json.

4.2 Backend and API
Python/FastAPI, SQLModel/SQLAlchemy, REST API, and WebSocket.

The entry point used by the production configuration: backend/main.py.
It contains both inline routes and connections of separate modules.

Additional routers are located in backend/routers/; the channels,
payments, Prisme, and work chat modules are also connected in the main
application.

Data schemas are located in backend/models.py; the database connection is
in backend/database.py; migrations are in backend/migrations/.

Configuration is selected via environment variables. The code supports both
SQLite and PostgreSQL; the specific environment determines the database
actually used.

The distribution of routes has changed: backend/main_routers.py contains
the registration of a large set of routers, whereas the actual launch point is
main.py. When changing the API, it is worth checking that a route is connected
in the running application, and not merely declared in a module.

4.3 Authentication and Access Control
Access/refresh tokens, user verification, and account state checks.

Password hashing, 2FA, and session versioning/revocation management.

Server-side role and individual permission checks.

Rate limiting of individual endpoints, CORS, and basic HTTP security
headers on the server.

Key sources: backend/main.py, backend/routers/auth.py,
backend/routers/permissions.py, backend/models.py.
Environment variables and configuration examples: backend/.env.example,
render.yaml.

4.4 Real-Time
The client and server exchange messages via WebSocket.

WebSocket is used for new publications/messages, chat changes,
read receipts, notifications, presence/typing, and calls.

backend/websocket_manager.py contains the connection manager and
broadcasting to users/chats.

The client code handles reconnection and event subscriptions.

Sources: l_frontend/lib/websocket.ts,
l_frontend/components/WebSocketProvider.tsx,
backend/websocket_manager.py, backend/main.py.

4.5 Files, Caches, and Offline
Media upload and delivery: local /uploads and Cloudinary integration
(depending on the operation and configuration).

The PWA Service Worker serves static assets and requests, uses different
caching strategies, and has an offline fallback page.

For mutations marked with the X-Nebula-Queueable header, a Background Sync
queue in IndexedDB is provided. This is not a universal queue for arbitrary
requests/files: request serialization is limited to the supported body
format.

Push subscriptions and browser notifications require permissions and
correct configuration.

Sources: l_frontend/public/sw.js, l_frontend/lib/pwa/,
l_frontend/components/PWARegister.tsx, backend/validators.py,
backend/cloudinary_config.py, backend/push_service.py.

4.6 External Integrations and Observability
Cloudinary — media storage/processing.

Stripe and a manual provider — payment operations.

Redis — individual caching/rate-limiting functions, if configured.

TURN/ICE provider and environment variables — WebRTC connections.

Sentry is enabled with the corresponding configuration; there are also
server logs, an action log, and performance metrics.

The presence of integration code does not mean that credentials are configured
or that the external service is available.

5. Platforms and Distribution
Platform	Implementation in the repository	Notes
Web	Next.js frontend	dev, build, start, and lint commands in l_frontend/package.json.
PWA	Web manifest, Service Worker, push/caching	Support depends on the browser, permissions, and server configuration.
Android	Capacitor + Android Gradle project	Native plugins include icon handling and APK update downloading; installation is confirmed by the user/OS.
iOS	Capacitor + Xcode project	A separate iOS project; access to camera/microphone/photos is governed by native permissions.
Windows	Electron	An NSIS installer and an update check/download mechanism are configured.
Linux	Electron, Arch PKGBUILD, and electron-builder	Build commands and packages should be verified against the configuration, not the general README description.
Platform files: mobile/capacitor.config.ts,
mobile/android/, mobile/ios/, desktop/, linux/,
linux/PKGBUILD.

Deployment
render.yaml describes running the backend on Render.

vercel.json contains the frontend configuration for Vercel.

.github/workflows/lighthouse.yml runs Lighthouse CI; it is not a complete
release workflow for frontend/backend/mobile/Desktop.

Environment variables and the availability of secrets must be configured
separately in the target infrastructure; secrets should not be placed in this
document.

6. Main Frontend Routes
The list reflects the pages in l_frontend/app/ and does not guarantee that
every page is accessible to every type of user.

Section	Routes
Social network	/, /post/[id], /tag/[name], /user/[id], /nebula-user/[username], /search, /bookmarks, /recommendations/[userId]
Communication	/messages, /messages/[id], /messages/work/[id], /channels/[id], /invite/[token]
Community and content	/suggestions, /suggestions/category/[id], /suggestions/thread/[id], /updates, /rules, /team
Additional features	/bots, /stickers, /prism/[id], /prisme, /prisme/[id], /support, /notifications
Account and application	/login, /settings, /nebula-settings, /nebula-profile, /stat, /download
Management	/admin and nested administrative pages, /adminnew, /adminnew/billets, /adminnew/payments, /owner-panel
7. Data Structure and Server Domains
The models in backend/models.py cover accounts and roles, publications and
reactions, chats and messages, notifications, moderation, and logs. The same
data model contains entities for support, badges, suggestions, channels,
work chats, payments, and additional modules. The schema is extended through
Alembic migrations in backend/migrations/versions/.

Key backend modules by subject area:

Area	Files
Main API, launch, auth helpers, and inline routes	backend/main.py, backend/dependencies.py
Users, posts, chats, authorization	backend/routers/users.py, posts.py, chats.py, auth.py
Channels, work chats, and Prisme	backend/channels.py, backend/work_chats.py, backend/prisma.py
Suggestions, notifications, support, reports	backend/routers/suggestions.py, notifications.py, support.py, reports.py
Administration, roles, badges, and tickets	backend/routers/admin.py, permissions.py, badges.py, billets.py
Payments and premium	backend/payments.py, backend/payment_providers.py, backend/routers/premium.py
Infrastructure functions	backend/database.py, websocket_manager.py, push_service.py, validators.py
8. Limitations and Verifiable Discrepancies
This list is derived from source code and configurations, not from
verification of a running production system. Features that depend on TURN,
Cloudinary, Stripe, Redis, VAPID, push permissions, and other services
require configuration.

The separate WebSocket manager stores connections in process memory. In the
reviewed implementation, shared inter-process pub/sub is not confirmed;
horizontal scaling may require a separate event transport.

Offline Sync is limited to specially marked requests and does not mean
full offline operation of chats/publications.

The README describes Linux packages and updates more broadly than is
confirmed by the current scripts/configurations. For a specific artifact,
verify linux/package.json, linux/electron-builder.yml,
linux/scripts/, and linux/PKGBUILD.

The main backend entrypoint is backend/main.py; the presence of a route in
a separate module does not yet prove that it is connected in the current
build. Connections should be verified in backend/main.py.

This document does not confirm the completeness of translations,
performance, readiness for scaling, independent security of cryptography,
or passing of the full test suite.

9. Development and Verification Commands
Frontend
bash
cd l_frontend
npm install
npm run dev
npm run build
npm run lint
npm test
Backend
The local launch command depends on the configured Python environment and the
variables from backend/.env.example. The production Blueprint is in
render.yaml; the database and required external integrations must be
available before launch.

Mobile and desktop
Capacitor scripts are listed in mobile/package.json; the Android and iOS
configurations are in the corresponding subfolders. Desktop commands should be
verified against desktop/package.json and linux/package.json.