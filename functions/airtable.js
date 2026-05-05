export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  if (!table) {
    return new Response(JSON.stringify({ error: 'Missing table parameter' }), { status: 400, headers });
  }

  const AT_BASE = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}`;
  const atHeaders = {
    'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    let atUrl, atOptions;

    if (request.method === 'GET') {
      let records = [], offset = null;
      do {
        atUrl = `${AT_BASE}/${encodeURIComponent(table)}?pageSize=100` + (offset ? `&offset=${offset}` : '');
        const res = await fetch(atUrl, { headers: atHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`);
        records = records.concat(data.records || []);
        offset = data.offset || null;
      } while (offset);
      return new Response(JSON.stringify({ records }), { status: 200, headers });

    } else if (request.method === 'POST') {
      atUrl = `${AT_BASE}/${encodeURIComponent(table)}`;
      atOptions = { method: 'POST', headers: atHeaders, body: await request.text() };

    } else if (request.method === 'PATCH') {
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers });
      atUrl = `${AT_BASE}/${encodeURIComponent(table)}/${id}`;
      atOptions = { method: 'PATCH', headers: atHeaders, body: await request.text() };

    } else if (request.method === 'DELETE') {
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers });
      atUrl = `${AT_BASE}/${encodeURIComponent(table)}/${id}`;
      atOptions = { method: 'DELETE', headers: atHeaders };
    }

    const res = await fetch(atUrl, atOptions);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`);
    return new Response(JSON.stringify(data), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
