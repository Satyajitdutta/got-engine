// Pithonix GOT — Tavily Live Intelligence Proxy
// Accepts: { query: string }
// Returns: { results: [{title, url, content}] }
// Gracefully returns empty results if TAVILY_API_KEY not set (never breaks GOT)

import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body;
  try {
    if (typeof req.body === 'object') body = req.body;
    else {
      const raw = await new Promise((resolve) => {
        let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d));
      });
      body = JSON.parse(raw);
    }
  } catch(e) { res.status(400).json({ error: 'Invalid JSON' }); return; }

  const apiKey = process.env.TAVILY_API_KEY || '';
  // Graceful degradation — GOT still works without Tavily key, just no live intel
  if (!apiKey) { res.status(200).json({ results: [], degraded: true }); return; }

  const query = (body.query || '').trim().slice(0, 400);
  if (!query) { res.status(400).json({ error: 'query required' }); return; }

  const requestBody = JSON.stringify({
    api_key: apiKey,
    query: query,
    search_depth: 'basic',
    include_answer: false,
    include_raw_content: false,
    max_results: 5
  });

  return new Promise((resolve) => {
    const tavilyReq = https.request({
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (tavilyRes) => {
      let raw = '';
      tavilyRes.on('data', c => raw += c);
      tavilyRes.on('end', () => {
        try {
          const data = JSON.parse(raw);
          const results = (data.results || []).slice(0, 5).map(r => ({
            title: (r.title || '').slice(0, 120),
            url: r.url || '',
            content: (r.content || '').slice(0, 300),
            score: r.score || 0
          }));
          res.status(200).json({ results });
        } catch(e) {
          res.status(200).json({ results: [] });
        }
        resolve();
      });
    });
    tavilyReq.on('error', () => { res.status(200).json({ results: [] }); resolve(); });
    tavilyReq.write(requestBody);
    tavilyReq.end();
  });
}
