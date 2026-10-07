# The Farewell Album

A responsive personal farewell website: a public colleague album, full-message dialogs, and a password-protected admin page. Add, edit, and delete colleagues, upload portraits, and customize your introduction and signature. Sample notes are clearly labelled and disappear when the first real note is saved.

## Run

Requires Node.js 24 or later. No package installation is needed.

PowerShell:

```powershell
$env:ADMIN_PASSWORD = 'replace-with-a-unique-long-password'
node server.mjs
```

Open http://localhost:3000 and http://localhost:3000/admin. Sign in with the password you set. The password must contain at least 12 characters. Set it in your host's secret environment settings; never commit it.

## Deploy from GitHub

Push this folder to your GitHub repository, then deploy it on a Node-compatible hosting service or container host. Use `node server.mjs` as the start command, set `ADMIN_PASSWORD`, set `COOKIE_SECURE=true`, and attach a persistent disk. Set `DATA_DIR` to the persistent disk's directory. Expose the app through HTTPS. The host can set `PORT`; the default is 3000.

GitHub hosts the source code. GitHub Pages cannot run this app's server, authentication, or database, so use a Node/container host for the working website.

## Data and security

Messages and photos are stored in SQLite under `data/` by default. This directory is excluded from Git. Back up the entire data directory while the server is stopped. A permanent disk is required to preserve content across deployments. Admin sessions last eight hours and expire on restart. Passwords are verified using scrypt; cookies are HttpOnly and SameSite=Strict, with Secure enabled in production. Login attempts are limited. State-changing cross-origin requests are rejected. Photo uploads are restricted to validated JPG, PNG, and WebP content under 3 MB. Text renders without HTML interpretation.

The album is public to anyone with access to its URL. Only the admin can change it. Use a single application instance with the persistent SQLite volume; multiple replicas need a shared database and session store.

## Verify

```powershell
node --test tests/*.test.mjs
```
