import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8083';

async function get(url, opts = {}) {
  const res = await fetch(BASE + url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { res, text, json };
}

function parseSse(buf) {
  const events = [];
  const lines = buf.split('\n');
  let current = null;
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      current = { event: line.slice(7).trim(), data: [] };
      events.push(current);
    } else if (line.startsWith('data: ')) {
      if (!current) {
        current = { event: 'message', data: [] };
        events.push(current);
      }
      current.data.push(line.slice(6));
    }
  }
  return events.map((e) => {
    const raw = e.data.join('\n');
    try { return { event: e.event, json: JSON.parse(raw) }; }
    catch { return { event: e.event, raw }; }
  });
}

async function streamTask(taskId, maxBytes = 4000) {
  const res = await fetch(`${BASE}/api/chat/stream/${encodeURIComponent(taskId)}?offset=0`);
  assert.ok(res.ok, `stream returned ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let done = false;
  let guard = 0;
  while (!done && guard < 1000) {
    const { done: d, value } = await reader.read();
    done = d;
    if (value) buf += decoder.decode(value, { stream: true });
    if (buf.length > maxBytes) break;
    guard++;
  }
  return buf;
}

test('health endpoint responds ok', async () => {
  const { json } = await get('/api/health');
  assert.equal(json.status, 'ok');
});

test('models endpoint aggregates local + cloud models', async () => {
  const { json } = await get('/api/models');
  assert.ok(Array.isArray(json.models));
  const ids = json.models.map((m) => m.id);
  assert.ok(ids.includes('gemini'), 'missing cloud model');
  assert.ok(ids.some((id) => id.startsWith('local:qwen')), 'missing local qwen');
  assert.ok(ids.some((id) => id.startsWith('local:muse')), 'missing local muse');
});

test('send + stream works for local qwen (8080)', async () => {
  const { json } = await get('/api/chat/send', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'قل كلمة: اختبار', chat_id: 'test-qwen', model: 'local:qwen3.8-27b' }),
  });
  assert.equal(json.status, 'queued');
  assert.ok(json.task_id);
  const buf = await streamTask(json.task_id);
  const events = parseSse(buf);
  const done = events.find((e) => e.json?.t === 'done');
  assert.ok(done, 'stream did not emit done event');
  assert.equal(done.json.status, 'completed');
  const tokens = events.filter((e) => e.json?.t === 'token');
  assert.ok(tokens.length > 0, 'no tokens streamed');
});

test('send + stream works for local glimmer (8081)', async () => {
  const { json } = await get('/api/chat/send', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'قل كلمة: جاهز', chat_id: 'test-glimmer', model: 'local:muse-glimmer-30b' }),
  });
  assert.equal(json.status, 'queued');
  assert.ok(json.task_id);
  const buf = await streamTask(json.task_id);
  const events = parseSse(buf);
  const done = events.find((e) => e.json?.t === 'done');
  assert.ok(done, 'stream did not emit done event');
  assert.equal(done.json.status, 'completed');
  const tokens = events.filter((e) => e.json?.t === 'token');
  assert.ok(tokens.length > 0, 'no tokens streamed');
});

test('send + stream works for cloud g4f (gemini)', async () => {
  const { json } = await get('/api/chat/send', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'قل كلمة: سحابة', chat_id: 'test-g4f', model: 'gemini' }),
  });
  assert.equal(json.status, 'queued');
  assert.ok(json.task_id);
  const buf = await streamTask(json.task_id, 6000);
  const events = parseSse(buf);
  const done = events.find((e) => e.json?.t === 'done');
  assert.ok(done, 'stream did not emit done event: ' + buf.slice(0, 300));
  assert.equal(done.json.status, 'completed');
});

test('chat/status returns job status', async () => {
  const { json } = await get('/api/chat/send', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'اختبار سريع', chat_id: 'test-status', model: 'local:qwen3.8-27b' }),
  });
  assert.ok(json.task_id, 'no task_id returned');
  const { json: st } = await get(`/api/chat/status?job_id=${json.task_id}`);
  assert.ok(st.status, 'status missing from response');
  assert.ok(['generating', 'completed', 'failed', 'not_found'].includes(st.status), `unexpected status ${st.status}`);
});

test('image generation endpoint returns valid URL', async () => {
  const { json } = await get('/api/image/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'test image generation' }),
  });
  assert.ok(json.success, 'success flag missing');
  assert.ok(json.url, 'url missing');
  assert.match(json.url, /^https:\/\/image\.pollinations\.ai\/prompt\//, 'invalid URL format');
  assert.ok(json.model, 'model missing');
  assert.ok(json.width, 'width missing');
  assert.ok(json.height, 'height missing');
});

test('image models endpoint returns model list', async () => {
  const { json } = await get('/api/image/models');
  assert.ok(Array.isArray(json.models), 'models not an array');
  assert.ok(json.models.length >= 3, 'expected at least 3 models');
  const ids = json.models.map((m) => m.id);
  assert.ok(ids.includes('flux'), 'missing flux model');
  assert.ok(ids.includes('gptimage'), 'missing gptimage model');
});