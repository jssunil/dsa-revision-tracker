# DSA Tracker v2: customizable plan, LLM verification, progress, revisions, Google Calendar

## Context

Today the plan (60 days, 41 patterns, 150 problems) is hard-coded in `catalog.js`, and `data/progress.json` stores status, notes, solutions and time logs against it. The user wants to shape their own curriculum:

- add LeetCode problems to a concept by URL, with an LLM checking that the problem really trains that pattern
- add their own non-LeetCode problems
- create new concepts and new days, and add days to existing concepts
- see progress bars
- get suggested revision dates for concepts and problems, then accept or change them
- create Google Calendar events for those dates

**Decisions confirmed with the user**
- **Plan storage:** the plan becomes one editable `data/plan.json`, seeded once from `catalog.js`.
- **LLM verification:** runs through a **local Python companion server** that vendors the multi-provider gateway from `C:\sjk\eagv3\capstone\designreview\core\llm_gateway.py`, with API keys in `.env`.
  - On GitHub Pages or a phone, problems are saved as *unverified* and can be verified later from the laptop.
- **Google Calendar:** OAuth is set up from the UI.
  - Settings live in **`data/settings.enc.json` in the repo**, encrypted in the browser: AES-GCM with a key derived from a passphrase (PBKDF2).
  - This works from GitHub Pages and a phone.
  - "Add to Google Calendar" links and `.ics` downloads remain as a no-setup fallback.

---

## 1. Data model

Principles:
- **Stable IDs everywhere.** Display order is separate from identity, so reordering and inserting days never breaks progress.
- **The plan is separate from progress.** The plan says *what* to study; progress records *what you did*.
- **Secrets never go to git in plain text.**

### 1.1 `data/plan.json` (new; replaces `catalog.js` as the source)

```jsonc
{
  "schemaVersion": 2,
  "meta": {
    "title": "DSA Revision Tracker",
    "subtitle": "…",
    "startDate": "2026-09-01",        // optional; gives each day a planned date = startDate + index
    "timeZone": "Asia/Kolkata"
  },
  "phases": [ { "id": "p1", "title": "Foundations I — Arrays, Pointers, Windows, Search" } ],
  "concepts": {                         // keyed by id = slug of the name ("two-pointers-converging")
    "two-pointers-converging": {
      "id": "two-pointers-converging",
      "name": "Two Pointers (Converging)",
      "summary": "Opposite ends walk inward over sorted input.",
      "triggers": ["sorted array", "pair/triplet sum", "palindrome check"],   // recognition cues, also fed to the LLM
      "leetcodeTags": ["Two Pointers", "Array", "Sorting"],
      "source": "builtin" | "custom",
      "createdAt": "2026-09-26T…"
    }
  },
  "days": [                             // ARRAY ORDER = schedule order; "Day N" = index + 1 (computed, not stored)
    {
      "id": "1",                        // built-ins keep "1".."60" so existing progress keys still match; new days get "d-<base36 time>"
      "phaseId": "p1",
      "kind": "new" | "rev" | "mock" | "cap" | "buf" | "custom",
      "title": "Two Pointers (Converging)",
      "conceptIds": ["two-pointers-converging"],   // 0..n (a revision day may have none)
      "problemIds": ["two-sum-ii-input-array-is-sorted", "3sum"],
      "focus": "…", "note": "…",
      "plannedDate": null               // overrides startDate + index
    }
  ],
  "problems": {                         // keyed by id
    "3sum": {
      "id": "3sum", "kind": "leetcode", "slug": "3sum",
      "url": "https://leetcode.com/problems/3sum/",
      "title": "3Sum", "diff": "E" | "M" | "H",
      "conceptIds": ["two-pointers-converging"],   // patterns it trains; [0] = home concept
      "source": "builtin" | "custom", "addedAt": "…",
      "verification": {
        "status": "verified" | "mismatch" | "unverified" | "overridden",
        "fits": true, "confidence": 0.92,
        "suggestedConceptIds": ["two-pointers-converging"],
        "reason": "Sort, then fix one index and converge two pointers…",
        "leetcodeTags": ["Array", "Two Pointers", "Sorting"],
        "provider": "gemini", "model": "gemini-2.5-flash", "at": "…"
      }
    },
    "custom-kth-bucket-merge": {        // id = "custom-" + slug(title), de-duplicated with a suffix
      "id": "custom-kth-bucket-merge", "kind": "custom",
      "title": "K-th bucket merge", "diff": "M",
      "url": null,                      // optional external link (HackerRank, a blog, …)
      "statement": "markdown problem statement with examples and constraints",
      "conceptIds": ["k-way-merge"], "source": "custom", "addedAt": "…",
      "verification": { "status": "unverified" }
    }
  }
}
```

Relationships:
- `problem.conceptIds` records which patterns a problem trains.
- `day.problemIds` records what is scheduled on a day.
- A problem may appear on several days (for example a revision day).
- Deleting a concept or day never deletes progress data. Problems left without a concept show "Assign a concept".

### 1.2 `data/progress.json` (v2, an extension of today's file; existing keys are unchanged)

```jsonc
{
  "schemaVersion": 2, "updatedAt": "…",
  "days": { "<dayId>": { "done": true, "doneAt": "…", "sessions": [ { "start": "…+05:30", "end": "…" } ] } },
  "problems": { "<problemId>": {
      "status": "todo|solved|review", "notes": "md", "links": [], "images": [], "revisedAt": "…",
      "solution": { "lang": "cpp", "path": "problems/<id>/solution.cpp" },
      "history": [ { "at": "…", "event": "solved|reviewed", "outcome": "easy|good|hard" } ]   // NEW, feeds revision scheduling
  } },
  "revisions": {                        // NEW
    "<revId>": {
      "id": "r-…", "target": { "type": "concept" | "problem", "id": "two-pointers-converging" },
      "state": "suggested" | "accepted" | "done" | "skipped",
      "suggestedDate": "2026-10-03", "dueDate": "2026-10-03", "time": "19:00",
      "reason": "Step 2 of the ladder: 7 days after the last review (good)",
      "createdAt": "…", "acceptedAt": "…", "completedAt": "…", "outcome": "easy|good|hard|null",
      "calendar": { "eventId": "…", "calendarId": "primary", "htmlLink": "…", "syncedAt": "…" }
    }
  },
  "srs": { "concept:<id>": { "step": 2, "lastReviewed": "2026-09-26" }, "problem:<id>": { … } }   // NEW
}
```

The `concepts` key is legacy. It is migrated into the concept `.md` files and then removed.

### 1.3 `data/settings.enc.json` (new, encrypted, committed)

```jsonc
{ "v": 1,
  "kdf":    { "name": "PBKDF2", "hash": "SHA-256", "iterations": 310000, "salt": "<b64>" },
  "cipher": { "name": "AES-GCM", "iv": "<b64>" },
  "data":   "<b64 ciphertext>" }
```

The decrypted content looks like this:

```jsonc
{
  "google":   { "clientId": "….apps.googleusercontent.com", "calendarId": "primary",
                "defaultTime": "19:00", "durationMin": 45, "reminderMin": 30, "timeZone": "Asia/Kolkata",
                "colorId": "9", "autoCreateOnAccept": true, "studyDayEvents": false },
  "revision": { "ladderDays": [1, 3, 7, 14, 30, 60], "maxPerDay": 4, "bundleWeakProblems": true },
  "gateway":  { "url": "", "tier": "verify" }       // "" = same origin as the page (the local server)
}
```

- A new IV is generated on every save. The passphrase is kept in `sessionStorage` only.
- A forgotten passphrase can't be recovered. The file only holds preferences and the client ID, so you would simply set it up again.

### 1.4 Browser-only storage (never committed)
`localStorage`: the GitHub token (unchanged), theme, last day, editor mode.

In memory only: the Google access token (about an hour) and the passphrase-derived key (cached in `sessionStorage`).

### 1.5 Local server files
- `.env`: gitignored. Holds `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`), `OPEN_ROUTER_API_KEY`, `OLLAMA_URL`/`OLLAMA_MODEL`, `DSA_PORT` (default 8765).
- `DSA_ENV_FILE=C:\sjk\eagv3\capstone\designreview\.env` reuses that file instead of copying keys.
- `.env.example` is committed with key names only.
- `.gitignore` gets `.env`, `.env.*`, `server/__pycache__/`.

### 1.6 Generated repo files (via `mdgen`)
- `concepts/<conceptId>.md` replaces `concepts/day-NN-*.md`. It contains:
  - the editable notes block (preserved as today)
  - the days that cover the concept
  - a time log summed across those days
  - verification badges
  - the revision history and the next revision date
- `problems/<id>/README.md` keeps its current content. Custom problems also include their statement.
- `concepts/README.md`: the concept index with progress.
- **`schedule.md`** (new): every day with its planned date, done flag, time, concepts, problems and upcoming revisions. This is also where revision and mock days, which have no concept, record their time.

---

## 2. Pages (hash router; one page, several views)

A top navigation bar: **Day · Plan · Concepts · Revisions · Progress · Settings**. A global progress bar sits under the title.

| Route | View | Key actions |
|---|---|---|
| `#day/<id>` (`#day-5` still works) | Today's day view, extended | Day progress bar; planned date; **+ Add problem** (to this day or its concept); revision chips ("next revision 3 Oct"); everything already there (time log, notes, solutions) |
| `#plan` | **Plan editor** | Phases, each with its days (Day #, title, kind, concept chips, problem count, planned date, done, time). Reorder with ↑/↓ (and drag on desktop); edit a day inline (title, kind, phase, focus, date, concepts); **+ Add day** (after this one / at the end of a phase); **+ New concept** wizard (name, summary, triggers, then optionally "create a day for it"); delete with confirm; start date input (planned dates recompute). Phases: add or rename. |
| `#concepts` | Concept library | Search; one card per concept with a progress bar, problem count, verification summary and next revision |
| `#concept/<id>` | **Concept page** | Edit name, summary, triggers and tags; problems grouped as LeetCode or custom, with verification badges (✅ verified 92% · ⚠ better fit: X · ❔ unverified); **Add LeetCode problem**; **Add custom problem**; *Verify all unverified*; days covering the concept; concept notes (the live editor, now per concept); revision timeline and **Schedule revision** |
| Dialog: **Add problem** | Two tabs | **LeetCode:** paste a URL or slug; it's parsed and de-duplicated if already in the plan; target concept and optional day; **Verify** shows a result card: *Fits (92%) with reason*, or *Better fit: Sliding Window* with **[Move to it]** / **[Keep here anyway]**, or *Server offline, saved as unverified*. The title and difficulty come from the verifier and can be edited. **Custom:** title, difficulty, optional link, markdown statement (existing `mdEditor`), concept, day; Verify works here too, judged from the statement. |
| `#revisions` | **Revision planner** | Sections: *Suggestions* (accept / pick date / skip, and **Accept all**), *Overdue*, *Today*, *Upcoming (14 days)*, and a small month grid showing how many revisions fall on each date. Per item: **Done: Easy / Good / Hard** (reschedules the next one), calendar status and buttons (Create/Update event · Add to Google Calendar link · .ics). |
| `#progress` | **Dashboard** | Bars: problems solved, days done, patterns introduced, verified problems, revision adherence (done on time ÷ due). Per-phase and per-concept bar table, time logged per week (small bar chart), streak of days with sessions. |
| `#settings` | **Settings page** (replaces the dialog) | **GitHub** (as today); **Encrypted settings** (create or unlock with a passphrase, change passphrase, lock); **Google Calendar** (step-by-step setup guide, client ID, calendar choice loaded from the API, default time, duration and reminder, auto-create on accept, **Connect / Disconnect / Send test event**); **Revision rules** (ladder, max per day); **LLM gateway** (health check listing each provider with key present ✓/✗, the model, and the session's cost so far) |

---

## 3. Components and algorithms

### 3.1 Code layout (ES modules, no build step; GitHub Pages serves them as-is)
Split today's roughly 1,400-line `app.js` into `js/`:
- **Kept and reused:**
  - `ghApi`/`ghGet`/`ghPut`/`ghCommit`/`treeEntry` go to `js/store.js`
  - `mdEditor`/`renderMarkdown` go to `js/editor.js`
  - the time log, `isoLocal` and `fmtClock` go to `js/timelog.js`
  - the solution field and image field go to `js/fields.js`
- **New:** `js/router.js`, `js/plan.js` (model operations and IDs), `js/srs.js`, `js/crypto.js`, `js/calendar.js`, `js/gateway.js`, and `js/views/{day,plan,concepts,concept,revisions,progress,settings}.js`.
- **`mdgen.js`:** becomes a UMD module over the plan model (it's still shared with Node) and gains `schedule.md` and per-concept pages.
- `catalog.js` stays only as the seed read by the migration.

### 3.2 Save pipeline (generalizes today's `saveNow`/`buildSave`)
- Dirty tracking per file and per entity:
  - `plan`: concepts, days, problems, plus an `order` flag
  - `progress`: problems, days, revisions, srs
  - `settings`: the whole file
- One `ghCommit` per save, as today: read at head, overlay only the dirty entities, write the JSON files, regenerate the affected `.md`, commit atomically, retry when the branch has moved.
- The day order is last-writer-wins, and that is documented.

### 3.3 Migration to v2 (once, idempotent)
Runs automatically on first load when `plan.json` is missing, with a confirmation; `scripts/migrate-v2.mjs` does the same offline.
- **Build `plan.json` from `catalog.js`:**
  - day ids stay "1".."60"
  - concept id = slug of the pattern, for days of kind `new` or `cap`
  - each problem's `conceptIds` = its home day's concept, or `[]` for problems first listed on a revision/buffer day
  - built-ins get `verification.status = "unverified"`, or "builtin" if they come from the curated list
- **Move each notes block** from `concepts/day-NN-*.md` to `concepts/<conceptId>.md` and delete the old files in the same commit.
- **Upgrade `progress.json`:** add `schemaVersion: 2`, `revisions: {}` and `srs: {}`, then seed revision state from existing `solved` problems and `revisedAt` dates, which creates *suggested* revisions.

### 3.4 Verification flow
1. The browser calls `POST {gateway}/api/verify` with:
   - the problem (`{kind, slug}` or `{kind:"custom", title, statement}`)
   - the target concept (name, summary, triggers, tags)
   - all concepts as `[{id, name, summary}]`, so the LLM can suggest a better fit
2. The server prompt asks for **strict JSON**:
   `{known, title, diff, leetcodeTags, fits, confidence, bestConceptIds, reason}`.
   - `known: false` means the model doesn't recognise the slug. Confidence is then capped, the status stays `unverified`, and the reason tells the user to paste the statement as a custom problem.
3. The server parses and validates the JSON with one repair retry, then returns it along with the provider, model and cost.
4. The client maps the result to a status:
   - `fits && confidence ≥ 0.6` → `verified`
   - the model suggests another concept → `mismatch`
   - the user keeps it anyway → `overridden`
   - `/api/health` unreachable → `unverified`, with a "Verify later" queue on the concept page

### 3.5 Revision scheduling (`js/srs.js`, a pure function that is unit-tested)
- **Ladder** (from settings): `[1, 3, 7, 14, 30, 60]` days. Each target has a `step`.
- **Triggers:**
  - problem marked solved → start at step 0
  - problem status "review" counts as outcome *hard*
  - day marked done → concept revision at step 0
  - revision marked done:
    - *easy*: step + 2
    - *good*: step + 1
    - *hard*: step − 1 (min 0), due tomorrow
- **Scheduling:** `due = lastReviewed + ladder[step]`. For load balancing, if a date already has `maxPerDay` open items, move it forward by up to 2 days.
- At most one open revision per target. New ones arrive as *suggested* with a human-readable `reason`.
- Accepting (optionally with a different date or time) makes it *accepted* and, if enabled, creates or updates the calendar event.
- A concept revision's event description lists its weak problems (status *review*) with links.

### 3.6 Encrypted settings (`js/crypto.js`, WebCrypto)
- Encryption: `PBKDF2(passphrase, salt, 310k, SHA-256)`, then an AES-GCM-256 key, used to encrypt and decrypt the JSON. The file is committed through the normal save pipeline.
- The Settings page walks through Create → Unlock → Change passphrase.
- Features that need settings (the calendar) show "Unlock settings" when locked.

### 3.7 Google Calendar (`js/calendar.js`)
- **No setup:** a template link (`calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…`) and an `.ics` download for any revision or day.
- **OAuth**, when a client ID is set:
  - Google Identity Services token client (`accounts.google.com/gsi/client`) with scope `https://www.googleapis.com/auth/calendar.events`, plus `calendar.readonly` only for the calendar picker
  - events are created with `POST/PATCH/DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events`
  - each event carries `extendedProperties.private.dsaRevId`; before inserting, the app searches `privateExtendedProperty=dsaRevId=…`, so a retry never creates a duplicate
  - rescheduling patches the event, and skip or delete removes it
  - `eventId` and `htmlLink` are stored in `progress.revisions[id].calendar`
- **In-UI setup guide** (shown in Settings):
  1. Create a Google Cloud project.
  2. Enable the Calendar API.
  3. Set up the OAuth consent screen (External, Testing; add yourself as a test user).
  4. Create credentials: OAuth client ID of type *Web application*.
  5. Add the authorized JavaScript origins `https://<you>.github.io` and `http://localhost:8765`.
  6. Paste the client ID, then click Connect.
- Optionally (off by default), study days get events from their planned dates.

### 3.8 Local companion server (`server/`)
- `server/serve.py` (`python server/serve.py`):
  - stdlib `ThreadingHTTPServer`, bound to **127.0.0.1**
  - serves the static app (replacing `python -m http.server`)
  - JSON API, same-origin only:
    - `GET /api/health`: providers, whether each key is present, models, ledger
    - `POST /api/verify`
- `server/llm_gateway.py` and `server/economics.py`: **copied** from designreview `core/` with a provenance header (their own convention). Changes in the copy:
  - `load_dotenv` honours `DSA_ENV_FILE` and falls back to the repo's `.env`
  - Gemini's `verify=False` is removed; TLS verification stays on (`SSL_CERT_FILE` is honoured for a corporate CA)
  - `ANTHROPIC_MODEL` from the environment overrides the model in `routing.yaml`
- `server/routing.yaml` adds a `verify` tier with free providers first (`gemini, groq, cerebras, openrouter, anthropic, ollama`) and **current model IDs**. The designreview copy pins the retired `claude-3-5-sonnet-20241022`. Every ID is checked when this is implemented, using the claude-api reference for Anthropic.
- `server/requirements.txt`: httpx, pyyaml, python-dotenv, pytest.

---

## 4. Implementation plan (phases, each shippable and verified before the next)

| # | Phase | Deliverables | Done when |
|---|---|---|---|
| 1 | **Refactor, no behaviour change** | Split into `js/` ES modules; hash router with the top nav; Settings dialog becomes `#settings`; `store.js` generalized to several JSON files and entity-level dirty sets | Every current flow still works (day view, time log, notes, solutions, commit through the mocked GitHub API) |
| 2 | **plan.json + migration + mdgen v2** | `plan.js` model operations and IDs; automatic migration in the app plus `scripts/migrate-v2.mjs`; concept pages keyed by concept; `schedule.md`; `build-docs` updated | Migration of the current repo keeps all notes blocks, progress, sessions and solutions; running it twice changes nothing |
| 3 | **Plan editor + concept pages + custom problems** | `#plan`, `#concepts`, `#concept/<id>`, the Add problem dialog (without verification: saved as unverified) | Can add, reorder and delete days, create a concept with its day, add a LeetCode problem by URL and a custom problem; the generated md reflects the changes |
| 4 | **Local server + verification** | `server/` (copied gateway, verify tier, `/api/health`, `/api/verify`), `.env.example`, `.gitignore`; client `gateway.js` and the result card; *Verify all unverified* | Real calls: a known fitting problem is verified; a problem that belongs elsewhere is flagged mismatch with a suggestion; server offline gives unverified; an unknown slug is handled |
| 5 | **Progress bars + dashboard** | Global bar, day, phase and concept bars, `#progress` | Numbers match hand-computed totals from `progress.json` |
| 6 | **Revisions** | `srs.js`, suggestion generation from the triggers, `#revisions`, accept / reschedule / done with an outcome, revision sections in the md | Unit tests for the ladder, outcomes and load balancing; the UI flow suggest → accept → done → next suggestion |
| 7 | **Encrypted settings** | `crypto.js`, `settings.enc.json`, Settings sections for revision rules and gateway | Encrypt/decrypt round-trip test; wrong passphrase is rejected; works after a reload and on a second device |
| 8 | **Google Calendar** | `calendar.js` (links, `.ics`, GIS OAuth, create / update / delete with de-duplication), setup guide, auto-create on accept | Link and `.ics` open correctly; with the user's client ID: create, reschedule (patch) and skip (delete) show up in Google Calendar; a retry doesn't duplicate |
| 9 | **Docs and polish** | README (server, `.env`, calendar setup, data model), mobile layout check, dark mode | Checked in the browser at phone width and in both themes |

---

## 5. Verification

- **Node unit tests** (`node --test tests/`): `srs.test.mjs` (ladder, outcomes, load balancing), `mdgen.test.mjs` (concept, schedule and problem pages; notes block kept), `migrate.test.mjs` (catalog + current progress → v2, idempotent), `crypto.test.mjs` (WebCrypto round-trip in Node 24).
- **Python tests** (`pytest server/tests`): verify-prompt JSON parsing and repair, with the gateway stubbed; `/api/health` shape; the server binds to localhost only.
- **Browser (Chrome):** as in earlier rounds, the GitHub API is mocked in an iframe, and each commit's tree is checked (paths, plan and progress JSON, generated md). Then one real end-to-end run against the user's repo after they approve.
- **Gateway:** `python server/serve.py`, then verify two known problems (one fits, one doesn't) through the real providers from `.env`, checking that the provider fallback order shows up in `/api/health`'s ledger.
- **Calendar:** the user supplies a client ID; create, patch and delete an event on a test calendar.

## Risks and notes
- LLM knowledge of LeetCode slugs is imperfect. `known:false` and a confidence threshold keep false "verified" results rare, and the user can always override.
- Verification needs the laptop running `serve.py`. Everything else works from GitHub Pages and the phone.
- The GIS token lasts about an hour, and the popup may be blocked. Connect is always a user click, and later token refreshes are silent.
- `plan.json` edits from two devices at once merge per entity. Only the day order is last-writer-wins.
- An OpenRouter key sits in plain text in a comment in designreview's `.env`. It is not copied or used; the user may want to rotate it.
