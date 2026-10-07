# The Farewell Album

A responsive personal farewell website: a public colleague album, full-message dialogs, and a password-protected admin page. Add, edit, and delete colleagues, upload portraits, and customize your introduction and signature. Sample notes are clearly labelled and disappear when the first real note is saved.

## Public website on GitHub Pages

The `docs/` version is designed for GitHub Pages, with GitHub-backed admin publishing. The original Node/SQLite version is retained under `public/` and `server.mjs` for optional self-hosting.

- Album: https://rahulmehtaa.github.io/farewell-album/
- Admin: https://rahulmehtaa.github.io/farewell-album/admin.html
- Publishing source: `main` branch, `/docs` folder.

The Pages admin uses a fine-grained GitHub personal access token instead of the Node server password. Create one under GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, select **Only select repositories → farewell-album**, and allow **Contents: Read and write**. Choose an expiry date. Paste the token directly into the admin page; do not send it in chat or commit it. The admin page includes these instructions.

The token stays only in browser-tab memory and is sent only to GitHub's API. Refreshing or closing the page signs you out. Saving creates a commit to `docs/album.json`, which starts a GitHub Pages publication. Public changes usually take a minute or two. Conflicting edits from another tab are rejected to prevent overwrites. Photos are resized in the browser; the album file is limited to 15 MB. Notes and photos are public in the repository. Removing an entry hides it from the album but does not erase previous GitHub commits.

GitHub Pages itself does not run a server or database. This version uses GitHub's repository API for storage and authenticated writes. No paid application host is required.

## Run the optional Node/SQLite version

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
