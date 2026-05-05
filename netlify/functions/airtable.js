const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const AT_BASE = `https://api.airtable.com/v0/${BASE_ID}`;

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const table  = params.table;
  const id     = params.id;

  if (!table) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing table parameter' }) };
  }

  const atHeaders = {
    'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    let url, method, body;

    if (event.httpMethod === 'GET') {
      // Fetch all records (handles pagination)
      let records = [], offset = null;
      do {
        url = `${AT_BASE}/${encodeURIComponent(table)}?pageSize=100` + (offset ? `&offset=${offset}` : '');
        const res  = await fetch(url, { headers: atHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`);
        records = records.concat(data.records || []);
        offset  = data.offset || null;
      } while (offset);
      return { statusCode: 200, headers, body: JSON.stringify({ records }) };

    } else if (event.httpMethod === 'POST') {
      url    = `${AT_BASE}/${encodeURIComponent(table)}`;
      method = 'POST';
      body   = event.body;

    } else if (event.httpMethod === 'PATCH') {
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
      url    = `${AT_BASE}/${encodeURIComponent(table)}/${id}`;
      method = 'PATCH';
      body   = event.body;

    } else if (event.httpMethod === 'DELETE') {
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
      url    = `${AT_BASE}/${encodeURIComponent(table)}/${id}`;
      method = 'DELETE';
      body   = undefined;
    }

    const res  = await fetch(url, { method, headers: atHeaders, body });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`);
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
