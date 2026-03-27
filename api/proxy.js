// GOT Engine — Universal AI Proxy
// Receives: { provider, apiKey, model, system, user, maxTokens, baseUrl }
// Returns:  { text } or { error }
// The API key is used once and never stored.

const https = require('https');
const http  = require('http');

function post(urlStr, headers, body) {
  return new Promise(function(resolve, reject) {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = mod.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers)
    }, function(res) {
      let raw = '';
      res.on('data', function(c){ raw += c; });
      res.on('end', function(){
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function extractText(provider, body) {
  try {
    if (provider === 'anthropic') return body.content.find(b => b.type === 'text').text;
    if (provider === 'gemini')    return body.candidates[0].content.parts[0].text;
    if (provider === 'ollama')    return body.message.content;
    return body.choices[0].message.content; // openai-compat
  } catch(e) { return null; }
}

module.exports = async function handler(req, res) {
  // CORS — allow any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'POST only' }); return; }

  let body;
  try {
    if (typeof req.body === 'object') body = req.body;
    else {
      const raw = await new Promise(function(resolve) {
        let d = ''; req.on('data', function(c){ d += c; }); req.on('end', function(){ resolve(d); });
      });
      body = JSON.parse(raw);
    }
  } catch(e) { res.status(400).json({ error: 'Invalid JSON' }); return; }

  const { provider, apiKey: clientKey, model, system, user, maxTokens, baseUrl, isJson } = body;
  if (!provider || !user) { res.status(400).json({ error: 'Missing provider or user' }); return; }
  // Use client-supplied key; fall back to server env vars so the hosted demo works without user entering a key
  const apiKey = clientKey || (provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) || '';

  try {
    let result;
    const mt = maxTokens || 2000;

    if (provider === 'anthropic') {
      result = await post('https://api.anthropic.com/v1/messages',
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        { model: model || 'claude-3-5-sonnet-latest', max_tokens: mt, system, messages: [{ role: 'user', content: user }] }
      );
    }
    else if (provider === 'gemini') {
      const mname = model || 'gemini-2.5-pro';
      const gcfg = isJson
        ? { maxOutputTokens: 8192, temperature: 0.1, response_mime_type: 'application/json' }
        : { maxOutputTokens: mt, temperature: 0.4 };
      result = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${mname}:generateContent?key=${apiKey}`,
        {},
        { system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: user }] }], generationConfig: gcfg }
      );
    }
    else if (provider === 'ollama') {
      const host = (baseUrl || 'http://localhost:11434').replace(/\/$/, '');
      result = await post(host + '/api/chat', {},
        { model: model || 'llama3.3', stream: false, options: { num_predict: mt },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
      );
    }
    else {
      // OpenAI-compatible: openai, groq, mistral, deepseek, qwen, custom
      const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      result = await post(base + '/chat/completions',
        { 'Authorization': 'Bearer ' + apiKey },
        { model: model || 'gpt-4o', max_tokens: mt, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
      );
    }

    if (result.status !== 200) {
      const msg = typeof result.body === 'object' ? JSON.stringify(result.body) : result.body;
      res.status(result.status).json({ error: msg });
      return;
    }

    const text = extractText(provider, result.body);
    if (!text) { res.status(500).json({ error: 'No text in response', raw: result.body }); return; }
    res.status(200).json({ text });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
