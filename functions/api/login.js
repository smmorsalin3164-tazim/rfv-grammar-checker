import { json, sha256 } from './_utils.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const code = String(body.code || '').trim().toUpperCase();
  const deviceId = String(body.deviceId || '').trim();
  const studentName = String(body.name || '').trim().slice(0, 80);

  if (!/^[A-Z0-9.-]{6,40}$/.test(code)) return json({ error: 'Access Code সঠিক নয়।' }, 400);
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(deviceId)) return json({ error: 'Device ID পাওয়া যায়নি। আবার চেষ্টা করো।' }, 400);

  const codeHash = await sha256(code);
  const row = await env.DB.prepare(
    'SELECT id, label, device_limit FROM access_codes WHERE code_hash=? AND active=1'
  ).bind(codeHash).first();
  if (!row) return json({ error: 'Access Code সঠিক নয় অথবা বাতিল করা হয়েছে।' }, 401);

  const deviceHash = await sha256(deviceId);
  const now = Date.now();
  const isHsc27 = row.label === 'HSC 27';
  const deviceLimit = Number(row.device_limit || 3);
  if (isHsc27) {
    await env.DB.prepare(`
      INSERT INTO device_activations (id, code_id, device_hash, activated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(code_id, device_hash) DO NOTHING
    `).bind(crypto.randomUUID(), row.id, deviceHash, now).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO device_activations (id, code_id, device_hash, activated_at)
      SELECT ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM device_activations WHERE code_id=?) < ?
      ON CONFLICT(code_id, device_hash) DO NOTHING
    `).bind(crypto.randomUUID(), row.id, deviceHash, now, row.id, deviceLimit).run();
  }

  const activation = await env.DB.prepare(
    'SELECT id FROM device_activations WHERE code_id=? AND device_hash=?'
  ).bind(row.id, deviceHash).first();

  if (!activation) {
    await env.DB.prepare(
      "INSERT INTO login_attempts (id, code_id, device_hash, attempted_at, status) VALUES (?, ?, ?, ?, 'blocked')"
    ).bind(crypto.randomUUID(), row.id, deviceHash, now).run();
    const message = row.label === 'HSC 27'
      ? 'সর্বোচ্চ ডিভাইস ইতিমধ্যে ব্যবহার করা হয়ে গেছে।'
      : `এই Access Code-এর সর্বোচ্চ ${deviceLimit}টি Device ব্যবহার হয়ে গেছে। Admin-এর সঙ্গে যোগাযোগ করো।`;
    return json({ error: message }, 403);
  }

  await env.DB.prepare(
    "INSERT INTO login_attempts (id, code_id, device_hash, attempted_at, status, student_name) VALUES (?, ?, ?, ?, 'success', ?)"
  ).bind(crypto.randomUUID(), row.id, deviceHash, now, isHsc27 ? studentName : null).run();

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await sha256(token);
  const expires = now + 30 * 24 * 60 * 60 * 1000;
  await env.DB.prepare('INSERT INTO sessions(token_hash, code_id, expires_at, device_hash) VALUES(?,?,?,?)')
    .bind(tokenHash, row.id, expires, deviceHash).run();
  return json({ token, expiresAt: expires });
}
