// Does the gateway expose which backend served a request? A backend id would
// let us prove the cold-miss theory and test pinning directly.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];

const res = await fetch('https://llm-api.net/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: 'deepseek-v4.1-flash',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 4,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true }
  })
});

console.log('status:', res.status);
console.log('\n=== all response headers ===');
for (const [k, v] of res.headers.entries()) console.log(`  ${k}: ${v}`);

// Drain so the connection closes cleanly.
for await (const _ of res.body) void _;
