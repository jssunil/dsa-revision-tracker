# DSA Revision Tracker

A customizable DSA study plan that runs as a static site on **GitHub Pages**, with **your GitHub repo as the source of truth**: every edit in the browser is committed back to the repo.

- **Your own plan.** Add, reorder and delete days; create concepts (patterns) with a day for them; add LeetCode problems by URL or your own custom problems. The plan starts as a 60-day sprint (41 patterns + LeetCode Top Interview 150).
- **Pattern check.** An LLM confirms that a problem really trains the concept you filed it under, or suggests a better one. It runs through a local multi-provider gateway, with free providers first and API keys kept in `.env`.
- **Per problem:** status, solution code (10 languages), markdown notes with live preview, reference links and handwritten-note images.
- **Per day:** a time log (timer, quick durations, editable sessions, days that cross midnight).
- **Revisions:** suggested on a spaced ladder; you accept or change the date, and Easy / Good / Hard schedules the next one.
- **Google Calendar:** events for accepted revisions (OAuth set up from Settings), or links and `.ics` downloads with no setup.
- **Progress bars** everywhere, plus a dashboard.

Browse the repo on GitHub and it reads like a study notebook: start at [`concepts/README.md`](concepts/README.md) or [`schedule.md`](schedule.md).

Full design (data model, pages, algorithms): [`docs/DESIGN.md`](docs/DESIGN.md).

---

## What lives where

| Path | What | Edited by |
|---|---|---|
| `data/plan.json` | The plan: phases, **concepts**, **days** (ordered), **problems** (LeetCode + custom, with pattern-check results) | the app (Plan, Concepts, Add problem) |
| `data/progress.json` | What you did: problem status/notes/links/images, day done + **time sessions**, **revisions** and their ladder state | the app |
| `data/settings.enc.json` | **Encrypted** settings: Google Calendar (client ID, calendar, default time…), revision rules, gateway | Settings (passphrase) |
| `problems/<id>/solution.<ext>` | Your accepted code | the app, or commit it yourself |
| `problems/<id>/README.md` | Generated: link, difficulty, concepts, days, status, pattern check, statement (custom), notes, images, revisions | generated |
| `concepts/<conceptId>.md` | Generated concept page. The block between `<!-- notes:start -->` and `<!-- notes:end -->` is **yours**: edit it in the app or directly on GitHub | notes block: you · rest: generated |
| `concepts/README.md`, `schedule.md` | Generated indexes: concepts with progress; every day with planned date, time, done; upcoming revisions | generated |
| `problems/<id>/images/`, `concepts/images/` | Pasted/uploaded images | the app |
| `catalog.js` | The original 60-day plan: only the seed for the first migration | — |
| `server/` | Local companion server + LLM gateway (pattern check) | — |

IDs are stable: day ids are `"1"`…`"60"` for the original plan and `d-…` for days you add, so "Day N" is just the current position, and reordering never detaches progress. Custom problems get ids like `custom-merge-k-buckets`.

---

## Quick start

### 1. Put it in a repo and turn on Pages
Create a **public** repo (Pages needs it, and so do image links), then push this folder to it:

```bash
cd dsa-tracker
git init && git add . && git commit -m "DSA revision tracker"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Repo → **Settings → Pages → Deploy from a branch → main / (root)**. The app is at `https://<you>.github.io/<repo>/`.

### 2. Connect the app to the repo
Open the app → **Settings → GitHub repository**: owner, repo, branch, and a **fine-grained token** (GitHub → Settings → Developer settings → Fine-grained tokens → *this repo only* → **Contents: Read and write**). Each browser needs the token once; it stays in that browser's localStorage.

If the repo still has the old format (no `data/plan.json`), a banner offers **Upgrade now**. The upgrade happens in one commit:
- builds `plan.json`
- moves the concept notes blocks from `concepts/day-NN-*.md` to `concepts/<concept>.md`
- adds `schedule.md`
- suggests revisions from what you've already solved or finished

Saving is paused until you upgrade.

### 3. (Optional) Pattern checker — local server
See [Running locally](#running-locally).

### 4. (Optional) Google Calendar
See [Google Calendar](#google-calendar).

---

## Using it

**Day** shows one day at a time. Pick it from the dropdown (grouped by phase, with ✓ and logged time), with ‹ ›, the ←/→ keys, or a `#day/<id>` link. Searching or choosing a status filter lists matching problems across **all** days instead. Each day has:
- a progress bar
- its concepts and their next revision
- a **time log**:
  - **▶ Start/■ Stop timer**: one at a time, shown in the header from any day, and syncs across devices
  - **+15m … +2h**: logs time ending now
  - **+ custom**: a session with start and end pickers; a session past midnight counts for both dates
- the concept notes
- its problems
- **+ Add problem** / **+ Custom problem**

**Plan** is the plan editor:
- Set a **start date**; planned dates follow the day order, and any day can have its own date.
- Reorder days with ↑/↓, edit title, kind, date and concepts inline, and open **Details** for phase, focus and note.
- **+ day after**, **+ Add day**, **+ Phase**, **Delete**.
- **+ New concept** creates a concept and (optionally) a day for it, in the phase and position you pick.

**Concepts** is the concept library. A **concept page** has:
- editable name, summary, *recognise it when…* cues and LeetCode tags
- a progress bar, its days and the time spent
- revision scheduling
- the concept notes
- its problems, with pattern-check badges and **Check all unverified**
- **Move to …** / **Keep here** for problems flagged as a better fit elsewhere, and **Remove from concept**

**Add problem** (dialog):
- **LeetCode:** paste a URL or slug. A problem already in your plan is reused and linked, not duplicated.
- **Custom:** title, difficulty, optional link, and a markdown statement.
- **Check pattern fit** shows one of:
  - ✓ fits (with the reason)
  - ⚠ better fit, with **Move to X** / **Keep here anyway**
  - ? unknown problem
  - offline: the problem is saved as *unverified*, and you can check it later

**Revisions** is fed by these triggers:

| Event | Effect |
|---|---|
| Problem marked **Solved** | Revision suggested |
| Problem marked **Needs review** | Revision tomorrow (counts as *hard*) |
| **Day completed** | Revision suggested for its concepts |

Revisions climb a ladder of gaps: **1, 3, 7, 14, 30, 60 days** by default.
- **Accept** a suggestion, or pick another date or time first. **Accept all** takes every suggestion.
- **Done: Easy** skips a rung, **Good** climbs one, and **Hard** drops one and comes back tomorrow.
- Days that already have *max per day* revisions push new suggestions forward, by up to 2 days.
- A month grid shows the load. Every row has calendar actions.

**Progress** shows:
- problems solved, days done, concepts completed, pattern-checked problems, and revisions done on time
- your current streak
- time per week
- per-phase and per-concept bars

**Settings**:
- GitHub
- encrypted settings (create, unlock or lock, change passphrase)
- Google Calendar
- revision rules
- LLM gateway status
- export / import, regenerate markdown

### Markdown notes
Concept and problem notes use a live editor with **Write / Split / Preview** modes:
- The preview renders tables and highlighted code, and its `- [ ]` checkboxes are clickable.
- Pasting or dropping an image uploads it and inserts `![note](images/…)` at the cursor.
- Double-click the preview to edit.

Concept notes live **in the concept `.md` file**, so you can edit them on GitHub too. If the same block changes on GitHub and in the app at once, both versions are kept with a `<!-- MERGE -->` marker for you to tidy up.

### Sync behaviour
- **One commit per save** (Git Data API). Each save does the following:
  - re-reads `plan.json` / `progress.json` at the branch head
  - overlays only the concepts, days, problems and revisions you changed
  - writes solution files
  - regenerates the affected markdown
- Edits from your phone and laptop merge per entity; only the *day order* is last-writer-wins. If the branch moved during a save, it rebuilds on the new head and retries.
- **Local-only mode** (no token) keeps everything in this browser, including code and notes. **Export** it, connect GitHub, then **Import**, and it's committed as files.

---

## Running locally

```powershell
cd dsa-tracker
pip install -r server/requirements.txt      # httpx, pyyaml, python-dotenv, pytest
$env:DSA_ENV_FILE = "C:\sjk\eagv3\capstone\designreview\.env"   # where your LLM API keys live
python server/serve.py                      # -> http://localhost:8765
```

The server reads API keys from the file in **`DSA_ENV_FILE`** (falling back to a git-ignored `.env` in this folder; key names are in `.env.example`) and prints which file it used. To avoid setting it every time, make it a user environment variable once: `setx DSA_ENV_FILE "C:\sjk\eagv3\capstone\designreview\.env"` (applies to new terminals).

`serve.py` serves the app **and** the pattern checker (`/api/health`, `/api/verify`). It binds to **127.0.0.1** only, rejects non-localhost `Host` headers, and never serves `.env`, dotfiles or `server/`.

**The gateway** (`server/llm_gateway.py`) is vendored from `designreview/core/llm_gateway.py`:
- It tries providers in the `verify` tier order in `server/routing.yaml`: **Gemini → Groq → Cerebras → OpenRouter → Anthropic → Ollama**.
- It skips any provider without a key, cools down one that fails, and retries once per provider.
- It caches identical requests and keeps a cost ledger, which you can see in Settings.
- Model IDs can be overridden from `.env` (`GEMINI_MODEL`, `ANTHROPIC_MODEL`, …).
- TLS verification uses the OS certificate store plus `SSL_CERT_FILE` / `NODE_EXTRA_CA_CERTS`, so it also works behind a corporate TLS-inspecting proxy.
- Set `DSA_USE_OLLAMA=0` if you don't run Ollama.

The pattern check works when you open the app **from this server**. On GitHub Pages or your phone, problems are added as *unverified*. Check them later from the laptop with **Check pattern** or **Check all unverified**.

Other ways to serve it (no pattern checker): `python -m http.server 8765` or `npx serve .`.

**Regenerating markdown** after editing `data/*.json` or `catalog.js` by hand, or after committing a `problems/<id>/solution.<ext>` yourself:

```bash
node scripts/build-docs.js
```

This rewrites every generated `.md` and keeps the concept notes blocks. On an old-format checkout it also runs the v2 migration. Commit and push the result. **Settings → Regenerate markdown** does the same thing through the API.

**Tests**:
```bash
node --test tests/lib.test.js      # plan model, migration, revisions ladder, markdown, encryption
python -m pytest server/tests      # verify prompt/JSON parsing, server security, HTTP API (gateway stubbed)
```

---

## Google Calendar

With no setup, every revision has an **Add to Google Calendar** link (pre-filled) and an **.ics** download.

For real events that **move when you reschedule** and **disappear when you skip**, set up OAuth once (~10 minutes). The same steps are in **Settings → Google Calendar**:

1. [Google Cloud Console](https://console.cloud.google.com/projectcreate) → new project.
2. Enable the **Google Calendar API**.
3. **OAuth consent screen**: External, *Testing*, and add your Google account as a **test user**.
4. **Credentials → OAuth client ID → Web application**. Under **Authorized JavaScript origins**, add `https://<you>.github.io` and `http://localhost:8765`. No redirect URIs are needed.
5. Paste the **client ID** into Settings (it's saved encrypted), then click **Connect** and **Send test event**.

- Turn on *Create the event automatically when I accept* to have accepting a revision add it to your calendar.
- Events carry a private `dsaRevId`, so retries never duplicate them.
- Access tokens stay in memory only; after about an hour the app silently asks Google for a new one.

## Encrypted settings

`data/settings.enc.json` is encrypted in your browser:
- AES-GCM-256, with the key derived from your passphrase (PBKDF2-SHA256, 310k iterations)
- a fresh IV on every save
- the passphrase is never stored; the derived key is kept in `sessionStorage` for the session only

It holds preferences and the Google client ID, and never tokens or API keys. If you forget the passphrase, create new settings.

## Security notes

- **GitHub token:** fine-grained, this repo only, Contents read/write. It's stored only in the browser, and **Clear token** removes it.
- **LLM API keys:** only in `.env` on your machine (git-ignored), and used only by the localhost server.
- The repo is public, so notes, the plan and progress are readable by anyone. Only the settings file is encrypted.
