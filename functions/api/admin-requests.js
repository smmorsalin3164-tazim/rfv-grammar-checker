import { json, sha256, encryptAccessCode, decryptAccessCode } from './_utils.js';
function authorized(request, env) { const key = request.headers.get('X-Admin-Key') || ''; return !!env.ADMIN_KEY && key.length > 0 && key === env.ADMIN_KEY; }
function makeCode() { const bytes = crypto.getRandomValues(new Uint8Array(6)); const s = [...bytes].map(b => (b % 36).toString(36).toUpperCase()).join(''); return 'RFV-' + s.slice(0,4) + '-' + s.slice(4); }
export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'Admin authorization required' }, 401);
  const { results = [] } = await env.DB.prepare('SELECT id,name,mobile_last5,registration_id,status,created_at,reviewed_at FROM registration_requests ORDER BY created_at DESC LIMIT 200').all();
  return json({ requests: results });
}
export async function onRequestPatch({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'Admin authorization required' }, 401);
  let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const id = String(body.id || ''); const action = String(body.action || '').toLowerCase();
  if (!id || !['accept','reject'].includes(action)) return json({ error: 'Invalid request action' }, 400);
  const row = await env.DB.prepare('SELECT * FROM registration_requests WHERE id=?').bind(id).first();
  if (!row) return json({ error: 'Request পাওয়া যায়নি।' }, 404);
  if (row.status === 'approved') {
    const access = await env.DB.prepare('SELECT encrypted_code FROM access_codes WHERE id=?').bind(row.access_code_id).first();
    let code = null; try { code = access?.encrypted_code ? await decryptAccessCode(access.encrypted_code, env.CODE_ENCRYPTION_KEY) : null; } catch {}
    return json({ ok: true, status: 'approved', code, alreadyProcessed: true });
  }
  if (row.status !== 'pending') return json({ error: 'এই Request আর Pending নেই।' }, 409);
  const now = Date.now();
  if (action === 'reject') {
    await env.DB.prepare("UPDATE registration_requests SET status='rejected', reviewed_at=? WHERE id=? AND status='pending'").bind(now, id).run();
    return json({ ok: true, status: 'rejected' });
  }
  if (!env.CODE_ENCRYPTION_KEY || env.CODE_ENCRYPTION_KEY.length < 32) return json({ error: 'CODE_ENCRYPTION_KEY secret configured নেই।' }, 503);
  let code = ''; let accessId = ''; let encrypted = ''; let inserted = false;
  for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
    code = makeCode(); accessId = crypto.randomUUID(); encrypted = await encryptAccessCode(code, env.CODE_ENCRYPTION_KEY);
    try {
      await env.DB.prepare('INSERT INTO access_codes(id,code_hash,label,active,created_at,device_limit,encrypted_code) VALUES(?,?,?,1,?,3,?)')
        .bind(accessId, await sha256(code), row.name, now, encrypted).run(); inserted = true;
    } catch (error) { if (attempt === 3) throw error; }
  }
  await env.DB.prepare("UPDATE registration_requests SET status='approved', access_code_id=?, reviewed_at=? WHERE id=? AND status='pending'").bind(accessId, now, id).run();
  const updated = await env.DB.prepare('SELECT status,access_code_id FROM registration_requests WHERE id=?').bind(id).first();
  if (updated?.status !== 'approved' || updated.access_code_id !== accessId) {
    await env.DB.prepare('UPDATE access_codes SET active=0 WHERE id=?').bind(accessId).run();
    return json({ error: 'Request ইতিমধ্যে অন্যভাবে process হয়েছে। Refresh করো।' }, 409);
  }
  return json({ ok: true, status: 'approved', code });
}