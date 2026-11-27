import { json, sha256, encryptAccessCode, decryptAccessCode } from './_utils.js';

function authorized(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  return !!env.ADMIN_KEY && key.length > 0 && key === env.ADMIN_KEY;
}
function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const s = [...bytes].map(b => (b % 36).toString(36).toUpperCase()).join('');
  return 'RFV-' + s.slice(0, 4) + '-' + s.slice(4);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'Admin authorization required' }, 401);
  const { results = [] } = await env.DB.prepare(`
    SELECT a.id, a.label, a.active, a.created_at, a.device_limit, a.encrypted_code,
      (SELECT COUNT(*) FROM device_activations d WHERE d.code_id=a.id) AS device_count,
      (SELECT COUNT(*) FROM login_attempts l WHERE l.code_id=a.id AND l.status='blocked') AS failed_attempt_count,
      (SELECT COUNT(DISTINCT device_hash) FROM login_attempts l WHERE l.code_id=a.id AND l.status='blocked') AS failed_device_count
    FROM access_codes a ORDER BY a.created_at DESC
  `).all();

  const summary = await env.DB.prepare(`
    SELECT COUNT(*) AS total_codes,
      COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS active_codes
    FROM access_codes
  `).first();

  const special = results.find(c => c.label === 'HSC 27');
  let recentAttempts = [];
  if (special) {
    const attempts = await env.DB.prepare(`
      SELECT device_hash, attempted_at, status FROM login_attempts
      WHERE code_id=? ORDER BY attempted_at DESC LIMIT 10
    `).bind(special.id).all();
    recentAttempts = attempts.results || [];
  }
  const recentAttemptsAll = await env.DB.prepare(`
    SELECT a.label, a.encrypted_code, l.attempted_at, l.status, l.device_hash
    FROM login_attempts l JOIN access_codes a ON a.id=l.code_id
    ORDER BY l.attempted_at DESC LIMIT 100
  `).all();

  const codeKey = env.CODE_ENCRYPTION_KEY || '';
  const reveal = async value => { try { return value ? await decryptAccessCode(value, codeKey) : null; } catch { return null; } };

  return json({
    codes: await Promise.all(results.map(async c => ({ ...c, device_limit: c.label === 'HSC 27' ? null : Number(c.device_limit || 3), code: await reveal(c.encrypted_code), encrypted_code: undefined, remaining_devices: c.label === 'HSC 27' ? null : Math.max(0, Number(c.device_limit || 3) - Number(c.device_count || 0)) }))),
    recent_attempts: await Promise.all((recentAttemptsAll.results || []).map(async a => ({
      label: a.label || '—', code: await reveal(a.encrypted_code), attempted_at: a.attempted_at, status: a.status,
      device: String(a.device_hash || '').slice(0, 10) + '…'
    }))),
    total_codes: summary.total_codes, active_codes: summary.active_codes,
    hsc27: special ? {
      id: special.id, device_count: Number(special.device_count || 0),
      device_limit: null,
      remaining_devices: null,
      failed_device_count: Number(special.failed_device_count || 0),
      failed_attempt_count: Number(special.failed_attempt_count || 0),
      recent_attempts: recentAttempts.map(a => ({ device: a.device_hash.slice(0, 10) + '…', attempted_at: a.attempted_at, status: a.status }))
    } : null
  });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'Admin authorization required' }, 401);
  let body = {};
  try { body = await request.json(); } catch {}
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  if (!env.CODE_ENCRYPTION_KEY || env.CODE_ENCRYPTION_KEY.length < 32) return json({ error: 'Cloudflare CODE_ENCRYPTION_KEY secret is not configured (minimum 32 characters).' }, 503);

  if (body.special === 'hsc27') {
    const codeHash = await sha256('HSC27.FREE');
    const existing = await env.DB.prepare('SELECT id, active FROM access_codes WHERE code_hash=?').bind(codeHash).first();
    if (existing) {
      await env.DB.prepare("UPDATE access_codes SET label='HSC 27', device_limit=0, active=1, encrypted_code=? WHERE id=?").bind(await encryptAccessCode('hsc27.free', env.CODE_ENCRYPTION_KEY), existing.id).run();
      return json({ id: existing.id, code: 'hsc27.free', label: 'HSC 27', active: true, existing: true });
    }
    await env.DB.prepare(
      'INSERT INTO access_codes(id,code_hash,label,active,created_at,device_limit,encrypted_code) VALUES(?,?,?,1,?,0,?)'
    ).bind(id, codeHash, 'HSC 27', createdAt, await encryptAccessCode('hsc27.free', env.CODE_ENCRYPTION_KEY)).run();
    return json({ id, code: 'hsc27.free', label: 'HSC 27', active: true }, 201);
  }

  const label = String(body.label || '').trim().slice(0, 80);
  const code = makeCode();
  await env.DB.prepare(
    'INSERT INTO access_codes(id,code_hash,label,active,created_at,device_limit,encrypted_code) VALUES(?,?,?,1,?,3,?)'
  ).bind(id, await sha256(code), label, createdAt, await encryptAccessCode(code, env.CODE_ENCRYPTION_KEY)).run();
  return json({ id, code, label, active: true }, 201);
}

export async function onRequestPatch({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'Admin authorization required' }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const id = String(body.id || '');
  if (!id) return json({ error: 'Missing id' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE code_id=?').bind(id),
    env.DB.prepare('DELETE FROM device_activations WHERE code_id=?').bind(id)
  ]);
  return json({ ok: true, message: 'Device activations and sessions reset' });
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'Admin authorization required' }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const id = String(body.id || '');
  if (!id) return json({ error: 'Missing id' }, 400);
  await env.DB.prepare('UPDATE access_codes SET active=0 WHERE id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE code_id=?').bind(id).run();
  return json({ ok: true });
}