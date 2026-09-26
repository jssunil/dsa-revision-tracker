# DSA Revision Tracker

A single-page app for working through a 60-day DSA sprint — **41 patterns + LeetCode Top Interview 150** — with per-problem **status, notes, worked-example links, and handwritten-note images**. It runs as a static site on **GitHub Pages**, and **your GitHub repo is the source of truth**: edits made in the browser are committed straight back to the repo through the GitHub API.

- **Live reference plan** — `catalog.js` (the 60 days, patterns, and every Top-150 problem mapped to the day whose pattern it trains).
- **Your data** — `data/progress.json` (status/notes/links/image refs per problem, plus day completion). Human-readable, diffable, editable directly on GitHub.
- **Images** — `notes-images/` (screenshots of handwritten notes you paste or upload).

## Why JSON and not SQLite

You asked for SQLite *or* JSON. JSON wins here for one reason: a SQLite file is a binary blob, so it doesn't **diff or merge** in git — which defeats "the repo is the source of truth." `progress.json` is plain text: you can read it on GitHub, see every change in the commit history, edit it by hand, and never get locked into a binary format.

---

## Quick start

### 1. Put it in a repo
Create a **public** repo (public is needed so GitHub Pages serves it and your note-images load), then add these files at the repo root:

```
index.html  styles.css  app.js  catalog.js
data/progress.json
notes-images/.gitkeep
.nojekyll
```

Two ways:

**Web upload:** on the new repo page → *uploading an existing file* → drag all of these in → Commit. (Create the `data/` and `notes-images/` folders by including those paths.)

**Command line:**
```bash
cd dsa-tracker
git init
git add .
git commit -m "DSA revision tracker"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Turn on GitHub Pages
Repo → **Settings** → **Pages** → **Source: Deploy from a branch** → Branch **main** / **/(root)** → Save.
Your app is at `https://<you>.github.io/<repo>/` within a minute.

### 3. Connect the app to the repo (so it can save)
Open the site → **Settings** (top right) → fill in:

- **Owner** — your GitHub username
- **Repository** — the repo name
- **Branch** — `main`
- **Token** — a fine-grained Personal Access Token (below)

**Create the token (60 seconds):**
1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Repository access** → *Only select repositories* → pick this repo.
3. **Permissions** → *Repository permissions* → **Contents** → **Read and write**.
4. Generate, copy the `github_pat_…` value, paste it into the app, **Save & connect**.

That's it. Toggle status, type notes, paste a screenshot of your handwritten notes — each change is committed to `data/progress.json` (or a new file in `notes-images/`) automatically.

---

## How it behaves

- **Source of truth is the repo.** On every save the app re-reads `data/progress.json`, overlays only the fields you changed, and commits — so editing from your laptop and phone doesn't clobber each other.
- **Multi-device.** Add the token once per browser/device. Your data follows the repo, not the browser.
- **Local-only fallback.** With no token it runs entirely in this browser's `localStorage` and shows a banner. **Export / Import** buttons (top right) let you move `progress.json` in and out manually at any time.
- **Offline / GitHub down.** If a save can't reach GitHub it's kept in `localStorage` and the status pill turns amber; it re-syncs on your next successful save.

## Security notes

- The token is stored **only in this browser's localStorage**. It is not sent anywhere except GitHub's API. Use **Clear token** (in Settings) before handing the browser to someone else.
- Scope the token to **this one repo, Contents-only**. Never use a classic token with broad scopes.
- Because Pages needs a public repo, anyone can *read* your notes and images. Don't paste anything private into notes. (If you need it private, host the same files behind auth instead of Pages — the app logic is identical.)

## Editing the plan itself

`catalog.js` is just data. Add a problem to any day, add links, change difficulties, or add whole days — edit and push. The app reads it on load. Your `progress.json` keys are LeetCode slugs, so they stay attached to problems even if you reorder days.

## Files

| File | Role |
|---|---|
| `index.html` | Page shell, header, settings dialog |
| `styles.css` | Styling, light/dark themes |
| `catalog.js` | The 60-day plan + 150 problems (reference data) |
| `app.js` | Rendering, status/notes/links/images, GitHub sync, local fallback |
| `data/progress.json` | **Your data — the source of truth** |
| `notes-images/` | Committed handwritten-note images |
| `.nojekyll` | Tells Pages to serve files as-is |

Companion references: your **DSA Pattern Atlas** (templates + C++ kernels) and the **60-Day Sprint** tracker.
