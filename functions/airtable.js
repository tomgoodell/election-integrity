// Cloudflare Pages Function — proxies Airtable API calls server-side so the Airtable
// token is never exposed to the browser, and enforces an authorization policy:
//
//   Public (no auth required):
//     • GET on the public directory tables (Organizations, Categories, CategoryValues, OrgTags)
//     • POST to Pending  (the public "submit an organization" form)
//
//   Admin only — request must send header  X-Admin-Password: <ADMIN_PASSWORD env var>:
//     • GET on Pending  (unapproved submissions — may contain private contact info)
//     • POST to any other table, and ALL PATCH / DELETE  (approvals, edits, list mgmt, deletes)
//
// The admin password lives ONLY in the ADMIN_PASSWORD environment variable (Cloudflare Pages
// settings, and .dev.vars locally) — never in the client. Requests are same-origin (the app is
// served from this same Pages project), so no CORS headers are needed.
//
// A lightweight probe (GET /airtable?auth=1 with the header) lets the admin login screen verify
// the password without hitting Airtable.
//
// EDGE CACHING: anonymous public GETs on the public tables are served from Cloudflare's edge
// cache (Cache API) for PUBLIC_CACHE_TTL seconds, so ordinary visitors don't each trigger an
// Airtable API call — this keeps monthly API usage far under Airtable's plan limits. Admin
// requests (valid X-Admin-Password) always bypass the cache and hit Airtable, so the admin sees
// live data; any admin write also purges that table's cached copy (best-effort, per data center).
// Public visitors therefore see data at most PUBLIC_CACHE_TTL old.

const PUBLIC_READ_TABLES = new Set(['Organizations', 'Categories', 'CategoryValues', 'OrgTags']);
const PUBLIC_CACHE_TTL = 86400; // 24 hours — tune here (shorter = fresher public view, more API calls).
                                // On-demand only: a table is re-fetched from Airtable just once per
                                // this window, and only if someone actually requests it after it expires.
                                // Admins always bypass (live), and admin-panel writes purge the table's
                                // cache immediately (per data center) — so this TTL only bounds how long a
                                // direct-in-Airtable edit (not via the admin panel) can lag for the public.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

  // A stable, same-origin cache key per table (ignores unrelated query params / headers).
  const cacheKeyFor = (t) => new Request(`${url.origin}/airtable?table=${encodeURIComponent(t)}`, { method: 'GET' });

  const isAdmin = () => {
    const supplied = request.headers.get('X-Admin-Password') || '';
    return !!env.ADMIN_PASSWORD && supplied === env.ADMIN_PASSWORD;
  };

  // Admin login probe — no Airtable call, just confirms the password.
  if (url.searchParams.get('auth') === '1') {
    return isAdmin() ? json({ ok: true }) : json({ error: 'Unauthorized' }, 401);
  }

  if (!table) return json({ error: 'Missing table parameter' }, 400);

  // --- Authorization ---------------------------------------------------------
  let permitted;
  if (method === 'GET') {
    permitted = PUBLIC_READ_TABLES.has(table) || isAdmin();
  } else if (method === 'POST') {
    permitted = (table === 'Pending') || isAdmin();
  } else if (method === 'PATCH' || method === 'DELETE') {
    permitted = isAdmin();
  } else {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!permitted) return json({ error: 'Unauthorized' }, 401);

  // --- Proxy to Airtable -----------------------------------------------------
  const AT_BASE = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}`;
  const atHeaders = {
    'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  // Cacheable = anonymous read of a public table. Admin reads bypass the cache (always live).
  const cacheable = method === 'GET' && PUBLIC_READ_TABLES.has(table) && !isAdmin();
  const cache = caches.default;

  try {
    if (method === 'GET') {
      // Try the edge cache first for anonymous public reads.
      if (cacheable) {
        try {
          const hit = await cache.match(cacheKeyFor(table));
          if (hit) return hit;
        } catch (_) { /* Cache API unavailable (e.g. local dev) — fall through to Airtable */ }
      }

      let records = [], offset = null;
      do {
        const atUrl = `${AT_BASE}/${encodeURIComponent(table)}?pageSize=100` + (offset ? `&offset=${offset}` : '');
        const res = await fetch(atUrl, { headers: atHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`);
        records = records.concat(data.records || []);
        offset = data.offset || null;
      } while (offset);

      const body = JSON.stringify({ records });
      if (cacheable) {
        // Store in the edge cache with a TTL, and return the same body.
        const resp = new Response(body, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${PUBLIC_CACHE_TTL}` }
        });
        try { context.waitUntil(cache.put(cacheKeyFor(table), resp.clone())); } catch (_) {}
        return resp;
      }
      // Admin / non-public reads: always fresh, never stored by clients.
      return new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    let atUrl, atOptions;
    if (method === 'POST') {
      atUrl = `${AT_BASE}/${encodeURIComponent(table)}`;
      atOptions = { method: 'POST', headers: atHeaders, body: await request.text() };
    } else if (method === 'PATCH') {
      if (!id) return json({ error: 'Missing id' }, 400);
      atUrl = `${AT_BASE}/${encodeURIComponent(table)}/${id}`;
      atOptions = { method: 'PATCH', headers: atHeaders, body: await request.text() };
    } else { // DELETE
      if (!id) return json({ error: 'Missing id' }, 400);
      atUrl = `${AT_BASE}/${encodeURIComponent(table)}/${id}`;
      atOptions = { method: 'DELETE', headers: atHeaders };
    }

    const res = await fetch(atUrl, atOptions);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`);
    // A write may have changed a public table — drop its cached copy so the change shows up
    // promptly (best-effort; purges only this data center's cache, others expire via the TTL).
    if (PUBLIC_READ_TABLES.has(table)) {
      try { context.waitUntil(cache.delete(cacheKeyFor(table))); } catch (_) {}
    }
    return json(data);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
