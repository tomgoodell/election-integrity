# Election Integrity Resource Directory — Project Context

A single-page web app: a browsable/filterable directory of election-integrity organizations, with
an interactive network map, a public submission form, and an admin panel. Originally built in a
Claude *desktop* session; substantially reworked in Claude Code (security hardening + data model).
See git history.

- **Live site:** https://election-integrity.pages.dev/ — the app is at the **root `/`**. Cloudflare
  serves `.html` files **extension-less**: `welcome.html`→`/welcome`, `backup.html`→`/backup`,
  `import.html`→`/import`, `add-states.html`→`/add-states`. The `.html` URL (and `/index.html`)
  returns empty — always link/test the extension-less path.
- **Hosting:** Cloudflare Pages, **auto-deploys on push to `main`** (GitHub → Cloudflare build).
  **This repo is public — never commit secrets.**
- **Backend/data:** Airtable, reached **only** through the Cloudflare Pages Function at `/airtable`
  (`functions/airtable.js`); the Airtable token never touches the client.

## Files
- `index.html` — the entire app (HTML + CSS + JS in one file, heavily commented — **keep the
  comments**). No framework: state is module-level variables, rendering is explicit function calls.
  Browse is a **single view** (the old Citizen/Researcher toggle was merged 2026-07): a search box,
  filters (chip buttons for short categories, a dropdown for States), always-on descriptions with
  **Hide-descriptions / Hide-tags** toggles, and an **A–Z** bar.
- `functions/airtable.js` — Pages Function served at `/airtable`. Proxies Airtable, **enforces auth**,
  and **edge-caches public reads** (see "## Caching").
- `welcome.html` — public landing page (`/welcome`); includes the 3-question "quick guide" quiz.
- `ways.html` — plain-language "Ways to help" guide (`/ways`), kept consistent with the Focus-area filter.
- `backup.html` / `import.html` / `add-states.html` — admin/data tools.

**Pages Functions routing:** `functions/airtable.js` is served at `/airtable` (no `functions/` prefix).
Don't "fix" that.

## Security / auth model (important)
The `/airtable` function is **not** an open proxy. It enforces:
- **Public (no auth):** `GET` on the directory tables (Organizations, Categories, CategoryValues,
  OrgTags), and `POST` to **Pending** only (the public submission form).
- **Admin only** — request must send header `X-Admin-Password` equal to the `ADMIN_PASSWORD` env var:
  `GET` on Pending, and **all** POST/PATCH/DELETE elsewhere (approvals, edits, list management, deletes).
- Admin login probe: `GET /airtable?auth=1` (no Airtable call, just validates the header).

Rules:
- **No secrets in the client or in this repo.** The admin password lives only in the `ADMIN_PASSWORD`
  env var (Cloudflare Secret + local `.dev.vars`). It's entered at login, validated server-side, held
  in memory, and sent as `X-Admin-Password` on the four API helpers (`atGet`/`atCreate`/`atUpdate`/`atDelete`).
- All Airtable access goes through the function — never call Airtable directly from client JS.
- `atGet` sends `cache: 'no-store'` on the client fetch, but the **server** edge-caches anonymous public
  reads (24h) while admin reads stay live — see "## Caching".

## Environment variables (Cloudflare Pages → Settings → Variables and secrets)
- `AIRTABLE_TOKEN` — Airtable personal access token (**Secret**).
- `AIRTABLE_BASE_ID` — the Airtable base id (Plaintext; an identifier, not a credential).
- `ADMIN_PASSWORD` — the admin-panel password (**Secret**).

Env-var changes take effect on the next deploy (a push, or Deployments → ⋯ → Retry deployment).

## Data model (Airtable)
Relational, with **plain-text record IDs as foreign keys** (deliberate — not Airtable linked-record fields):
- **Organizations** — approved records (Name, Description, Email, Phone, Website, `State` [free text =
  HQ location], NeedsText, `Declined` [bool], …).
- **Pending** — submitted-but-unapproved orgs (same shape).
- **Categories** — `Name`, `FieldKey`, `SortOrder`, `Active`. Taxonomy reworked 2026-07. **Public
  filters:** `focus` (Focus areas — "What they work on"), `help` (Ways to get involved — "How you can
  help"), `demo` (communities), `state` (States, incl. the special value **`Nationwide`**). `partisan`
  and `geo` (Regions) are still active in Airtable but **hidden** from the public UI (see HIDDEN_CAT_KEYS).
  The old `work`/`phase`/`voter`/`need` categories are retired (hidden).
- **CategoryValues** — options within a category (`CategoryID`, `CategoryName`, `CategoryKey`, `Value`,
  `SortOrder`, `Active`).
- **OrgTags** — join table: `OrgID`, `ValueID`, `TagType` (= the category FieldKey, e.g. `state`, `geo`).

### Filtering model — Browse and the map filter via OrgTags (never the `State` text field)
- **Focus areas** (`focus`) = what the org works on (Voter registration, GOTV, Ballot curing, Poll
  observing, Audits & verification, Litigation, Research, Voter ID assistance, …). In Browse this filter
  renders as labelled **sub-groups** (Helping people vote / Protecting the vote & the count / Legal &
  policy / Information & truth) via `CATEGORY_GROUPS`; a value not listed there falls under a "More" heading.
- **Ways to get involved** (`help`) = how a person plugs in (calling/texting, door knocking, postcards,
  pro-bono legal, translation, data/tech, communications, donating, poll working/observing, general vol).
- **State** (`state`): an org is tagged with specific state(s) **or** the special value **`Nationwide`**
  (`const ALL_STATES = 'Nationwide'`), which counts as present in every state. Selecting a specific state
  matches that state's orgs **plus** Nationwide orgs; the **"Only organizations specific to this state"**
  checkbox (`stateExactOnly`) drops the Nationwide fallback and shows exact-state orgs only. The `State`
  free-text field on Organizations is HQ/label only and is **not** used for filtering.
- **Declined** orgs are hidden from Browse **and** the map (`renderMap` uses
  `mapOrgs = orgs.filter(o => !o.declined)`).
- **`partisan`** (Partisan affiliation) is **hidden** from the public UI (kept only for internal reference).

### Hiding a category from the public UI
`const HIDDEN_CAT_KEYS = ['partisan', 'work', 'phase', 'need', 'voter', 'geo'];` (near the `T_`
table-name constants in `index.html`) hides those FieldKeys from the **public** interface — filter
controls, submission form, and card/modal tags. It's **display-only**: the Airtable data (category,
values, org tags) is untouched, so removing a key fully restores it. (Admin ▸ Manage lists still shows
all categories.) Currently hides Partisan affiliation, Regions (`geo`), and the retired
work/phase/voter/need categories.

### Org data & tags (current state)
- **~56 organizations.** On 2026-07-09/10 every org's tags were **rebuilt from fresh web research**
  (the prior tags were throwaway test data). Full record + rationale: `TAG_REVIEW.md`. New taxonomy
  values added then: focus **`Voter ID assistance`**; communities **`People with disabilities`**,
  **`Immigrants / new citizens`**.
- **Scope:** the directory lists nonprofit and civic organizations that help eligible voters register,
  stay informed, cast a ballot, and have that ballot counted. (Detailed editorial inclusion criteria are
  kept in private project notes, not in this public repo.)
- Bulk tag/org changes are done with one-off scripts that hit Airtable **directly** with the token
  (kept out of the repo) — this **bypasses the function's cache purge** (see "## Caching").

## Caching (public reads)
The `/airtable` function serves **anonymous** GETs of the public tables from Cloudflare's edge cache
(`PUBLIC_CACHE_TTL`, currently 24h) to keep Airtable API usage low. **Admin requests bypass the cache**
(live data; `atGet` adds a cache-buster when logged in). A write **through the function** (admin
POST/PATCH/DELETE) purges the affected table's cached copy, so admin edits show publicly within ~a minute.
- **Gotcha:** one-off bulk scripts that write **directly to Airtable** (with the token) do NOT purge the
  edge cache → the public site can lag up to the TTL. To push such changes live now, make any tag edit +
  Save in the admin panel (purges Organizations + OrgTags), or wait out the TTL. The admin panel itself
  always shows live data. (Local `wrangler` has no such lag — restart it or hard-refresh.)
- **"Save → Server error 500" right after a bulk tag rebuild** = the loaded admin tab holds stale in-memory
  OrgTag IDs (the old records were deleted), so it tries to delete tags that no longer exist. Fix:
  **hard-refresh the admin panel** (Ctrl+F5) to reload current IDs.

## Local development
- Needs Node + `wrangler` (global). From the repo: `wrangler pages dev . --port 8788`, then open
  http://localhost:8788 (it reads the **live** Airtable base). There's a one-click Stream Deck launcher
  in the user's AHK scripts.
- Local env from **`.dev.vars`** (gitignored): `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `ADMIN_PASSWORD`.
- **`.dev.vars` gotcha:** wrangler's dotenv parser treats `#` as a comment, so any value containing `#`
  must be **quoted** — `ADMIN_PASSWORD="…"`. Cloudflare's env storage has no such quirk (enter raw values).
- Windows: running `wrangler` in PowerShell needs `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
  (wrangler is a `.ps1`).

## Deploy
Commit to `main` and `git push` → Cloudflare auto-builds and publishes (~1 min). Verify at the root `/`.

## Readability treatment (directory cards + filters in `index.html`)
2026-07: darkened text / bumped sizes to fix a "light-gray-on-gray, too small" complaint. **Option "C" is
live.** **Option "D" (maximum legibility) is the documented fallback** — to switch, apply the D column below.
Only `index.html` was changed (the `/welcome` + `/ways` pages already use a larger, warmer palette).

| Element (selector) | C — LIVE | D — fallback |
|---|---|---|
| Page ground (`body` background) | `#f7f7f5` | `#fbfbfa` |
| Card (`.card`) border / padding | `#d7d7d1` / `1.15rem 1.4rem` | `#d2d2cc` / `1.2rem 1.45rem` |
| Org name (`.card-name`) | `17px` / `600` / `#141414` | `18px` / `600` / `#111` |
| Location line (`.card-geo`) | `13px` / `#5f5f5f` | `13px` / `#585858` |
| Description (`.card-desc`) | `15px` / `#333` / lh `1.62` | `15.5px` / `#2b2b2b` / lh `1.66` |
| Base tag (`.tag`) size | `11.5px` (semantic tag COLORS unchanged) | `12px` (colors unchanged) |
| Chips (`.chip`) | `14px`, bg `#fff`, border `#c6c6bf`, text `#2b2b2b` | `14px`, bg `#fff`, border `#bdbdb5`, text `#262626` |
| Filter label (`.friendly-filter-group-label`) | `12.5px` / `#222` | `13px` / `#1c1c1a` |
| Filter hint (`… span`) | `13px` / `#565656` | `13px` / `#505050` |
| Sub-group header (`.chip-subgroup-label`) | `11.5px` / `#6a6a6a` | `12px` / `#585858` |

D's essence: near-white ground (gray shading almost gone) + slightly larger text; it trades compactness for
a roomier, longer-scrolling page. Full side-by-side mock kept in chat (artifact "Readability options").

## Conventions
- Keep `index.html`'s inline comments; match its plain-JS, explicit-render style (no framework).
- Never expose the Airtable token or admin password in the client or in committed files.
- One-off bulk data migrations may hit Airtable directly with the token (kept **out** of the repo).
  NOTE: Airtable's raw REST API paginates at 100 records — loop on `offset`. (The `/airtable` function
  already aggregates pages, so client fetches via `atGet` don't need to.)
