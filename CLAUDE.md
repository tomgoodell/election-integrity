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
- `functions/airtable.js` — Pages Function served at `/airtable`. Proxies Airtable and **enforces auth**.
- `welcome.html` — public landing page (`/welcome`).
- `backup.html` / `import.html` — admin data tools.

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
- `atGet` uses `cache: 'no-store'` so the directory always shows fresh data after edits/backfills.

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
- **Categories** — `Name`, `FieldKey`, `SortOrder`, `Active`. Active FieldKeys: `demo` (Demographic
  focus), `need` (Needs), `state` (States), `phase` (Election phases), `work` (Activities), `geo`
  (Regions), `voter` (Voter reg focus), `partisan` (Partisan affiliation).
- **CategoryValues** — options within a category (`CategoryID`, `CategoryName`, `CategoryKey`, `Value`,
  `SortOrder`, `Active`).
- **OrgTags** — join table: `OrgID`, `ValueID`, `TagType` (= the category FieldKey, e.g. `state`, `geo`).

### Filtering model — both Browse and the map filter via OrgTags (never the `State` text field)
- **Region** (`geo`: Local / State / National / International) encodes an org's **scope**; every org has one.
- **States** (`state`) = an org's **focus state**, only meaningful for state-scope orgs. The `State`
  text field is HQ location only and is **not** used for filtering — the old free-text state matcher
  was removed. National orgs surface via Region = National. (LWV national is tagged with all 50 states;
  that's the tentative pattern for a future "serves all states" scope.)
- **Declined** orgs are hidden from Browse **and** the map (`renderMap` uses
  `mapOrgs = orgs.filter(o => !o.declined)`).

### Hiding a category from the public UI
`const HIDDEN_CAT_KEYS = ['partisan'];` (near the `T_` table-name constants in `index.html`) hides a
category's FieldKey from the **public** interface — filter dropdowns, submission form, and card/modal
tags. It's **display-only**: the Airtable data (category, values, org tags) is untouched, so removing a
key fully restores it. (Admin ▸ Manage lists still shows all categories.) Currently hides Partisan affiliation.

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
