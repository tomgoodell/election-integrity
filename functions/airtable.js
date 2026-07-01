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

const PUBLIC_READ_TABLES = new Set(['Organizations', 'Categories', 'CategoryValues', 'OrgTags']);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

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

  try {
    if (method === 'GET') {
      let records = [], offset = null;
      do {
        const atUrl = `${AT_BASE}/${encodeURIComponent(table)}?pageSize=100` + (offset ? `&offset=${offset}` : '');
        const res = await fetch(atUrl, { headers: atHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`);
        records = records.concat(data.records || []);
        offset = data.offset || null;
      } while (offset);
      return json({ records });
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
    return json(data);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
