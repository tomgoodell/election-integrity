# Backup & Restore — Election Integrity Resource Directory

How to back up and restore the **Airtable data**. (This does not back up code or config — see
"Full disaster recovery" at the bottom for where those live.)

## Back up (do this before any big data change, and ~monthly)

1. Go to **https://election-integrity.pages.dev/backup**
2. Enter the **admin password** (same one as the app's Admin tab).
3. Click **Download backup**. It saves a timestamped `election-directory-backup-YYYY-MM-DD…json`
   containing all five tables: Organizations, OrgTags, Categories, CategoryValues, Pending.
4. **Store the file somewhere safe** — Dropbox/Google Drive/OneDrive is fine. Keep the **last few**
   backups (in case a recent one is bad).

Nothing is modified by a backup. It takes ~10–15 seconds.

> The admin password is required because backup reads the **Pending** table, which is admin-only.
> (Without it, the tool will say the password is missing/incorrect.)

## Restore (rare — this is destructive)

Use only to roll back to a known-good snapshot.

1. **Take a fresh backup first** (so you can undo the undo).
2. Go to **https://election-integrity.pages.dev/backup**, enter the admin password.
3. Under **Restore from backup**, choose a backup `.json` file and click **Restore from backup**.
4. It **deletes all current Organizations, OrgTags, and Pending records and recreates them** from the
   file. It remaps record IDs so tags stay linked to the right orgs. **Categories and CategoryValues
   are left untouched** (their IDs are stable and the backup already references them).
5. When it says **Restore complete**, reload the main app to verify.

⚠️ Restore is a full replace of those three tables — hence "take a fresh backup first."

## What a backup does and doesn't cover

Covers your **data** (the five Airtable tables). It does **not** cover the app itself. For full
disaster recovery you'd also need:

| What | Where it lives | Recover by |
|------|----------------|-----------|
| App code (`index.html`, etc.) | GitHub repo `tomgoodell/election-integrity` | re-clone the repo |
| Backend function | same repo, `functions/airtable.js` | re-clone the repo |
| Airtable token | Cloudflare env var `AIRTABLE_TOKEN` (Secret) | generate a new token at airtable.com/create/tokens, update the env var |
| Airtable base id | Cloudflare env var `AIRTABLE_BASE_ID` | keep a copy in your password manager |
| Admin password | Cloudflare env var `ADMIN_PASSWORD` (Secret) | keep a copy in your password manager |

Keep the base id and both secrets in your **password manager**, not in this repo (it's public).

## Notes

- The tool must be run from the live site (`/backup`) — it talks to the `/airtable` proxy on the
  same domain. You can also run it locally against the live data via `wrangler pages dev` (see CLAUDE.md).
- Superseded: the old browser-console `backup.js`/`restore.js` scripts (they hardcoded a now-revoked
  token and predate the admin-auth model). Don't use them.
