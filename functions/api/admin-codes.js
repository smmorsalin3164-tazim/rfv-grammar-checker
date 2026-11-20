
import { json, sha256 } from './_utils.js';

function authorized(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  return !!env.ADMIN_KEY && key.length > 0 && key === env.ADMIN_KEY;
}

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const s = [...bytes]
    .map(b => (b % 36).toString(36).toUpperCase())
    .join('');

  return 'RFV-' + s.slice(0, 4) + '-' + s.slice(4);
}

// Access Code List এবং Summary
export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ error: 'Admin authorization required' }, 401);
  }

  const { results = [] } = await env.DB.prepare(`
    SELECT
      a.id,
      a.label,
      a.active,
      a.created_at,
      (
        SELECT COUNT(*)
        FROM device_activations d
        WHERE d.code_id = a.id
      ) AS device_count
    FROM access_codes a
    ORDER BY a.created_at DESC
  `).all();

  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_codes,
      COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0)
        AS active_codes
    FROM access_codes
  `).first();

  return json({
    codes: results,
    total_codes: summary.total_codes,
    active_codes: summary.active_codes
  });
}

// নতুন Access Code তৈরি
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) {
    return json({ error: 'Admin authorization required' }, 401);
  }

  let body = {};

  try {
    body = await request.json();
  } catch {}

  const label = String(body.label || '').trim().slice(0, 80);
  const code = makeCode();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO access_codes(id,code_hash,label,active,created_at) VALUES(?,?,?,1,?)'
  ).bind(id, await sha256(code), label, Date.now()).run();

  return json({
    id,
    code,
    label,
    active: true
  }, 201);
}

// Device Reset এবং পুরোনো Session বাতিল
export async function onRequestPatch({ request, env }) {
  if (!authorized(request, env)) {
    return json({ error: 'Admin authorization required' }, 401);
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const id = String(body.id || '');

  if (!id) {
    return json({ error: 'Missing id' }, 400);
  }

  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM sessions WHERE code_id=?'
    ).bind(id),

    env.DB.prepare(
      'DELETE FROM device_activations WHERE code_id=?'
    ).bind(id)
  ]);

  return json({
    ok: true,
    message: 'Device activations and sessions reset'
  });
}

// Access Code বাতিল
export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) {
    return json({ error: 'Admin authorization required' }, 401);
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const id = String(body.id || '');

  if (!id) {
    return json({ error: 'Missing id' }, 400);
  }

  await env.DB.prepare(
    'UPDATE access_codes SET active=0 WHERE id=?'
  ).bind(id).run();

  await env.DB.prepare(
    'DELETE FROM sessions WHERE code_id=?'
  ).bind(id).run();

  return json({ ok: true });
}
