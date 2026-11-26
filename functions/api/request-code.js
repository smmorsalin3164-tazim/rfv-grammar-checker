import { json, sha256, decryptAccessCode } from './_utils.js';

function deviceIdFrom(value) { return String(value || '').trim(); }
function validDeviceId(value) { return /^[a-zA-Z0-9-]{20,100}$/.test(value); }
async function publicRequest(row, env) {
  let code = null;
  if (row.status === 'approved' && row.access_code_id && env.CODE_ENCRYPTION_KEY) {
    const access = await env.DB.prepare('SELECT encrypted_code FROM access_codes WHERE id=? AND active=1').bind(row.access_code_id).first();
    try { code = access?.encrypted_code ? await decryptAccessCode(access.encrypted_code, env.CODE_ENCRYPTION_KEY) : null; } catch {}
  }
  return { status: row.status, name: row.name, registrationId: row.registration_id, code };
}
export async function onRequestGet({ request, env }) {
  const deviceId = deviceIdFrom(new URL(request.url).searchParams.get('deviceId'));
  if (!validDeviceId(deviceId)) return json({ error: 'Device ID পাওয়া যায়নি।' }, 400);
  const deviceHash = await sha256(deviceId);
  const row = await env.DB.prepare('SELECT * FROM registration_requests WHERE device_hash=?').bind(deviceHash).first();
  return row ? json(await publicRequest(row, env)) : json({ status: 'none' });
}
export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch { return json({ error: 'তথ্য সঠিকভাবে পাওয়া যায়নি।' }, 400); }
  const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const mobileLast5 = String(body.mobileLast5 || '').replace(/\D/g, '');
  const deviceId = deviceIdFrom(body.deviceId);
  if (name.length < 2) return json({ error: 'সঠিক নাম লিখো।' }, 400);
  if (!/^\d{5}$/.test(mobileLast5)) return json({ error: 'মোবাইল নম্বরের শেষ ৫টি সংখ্যা লিখো।' }, 400);
  if (!validDeviceId(deviceId)) return json({ error: 'Device ID পাওয়া যায়নি। আবার চেষ্টা করো।' }, 400);
  const deviceHash = await sha256(deviceId);
  const registrationId = name.replace(/\s+/g, '') + mobileLast5;
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT * FROM registration_requests WHERE device_hash=?').bind(deviceHash).first();
  if (existing && existing.status !== 'rejected') return json(await publicRequest(existing, env));
  if (existing) {
    await env.DB.prepare("UPDATE registration_requests SET name=?, mobile_last5=?, registration_id=?, status='pending', created_at=?, reviewed_at=NULL, access_code_id=NULL WHERE id=?")
      .bind(name, mobileLast5, registrationId, now, existing.id).run();
    return json({ status: 'pending', name, registrationId }, 200);
  }
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO registration_requests(id,name,mobile_last5,registration_id,device_hash,status,created_at) VALUES(?,?,?,?,?,'pending',?)")
      .bind(id, name, mobileLast5, registrationId, deviceHash, now).run();
  } catch (error) {
    console.error('[request-code] request insert failed', String(error?.message || error).slice(0, 160));
    return json({ error: 'আবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করো।' }, 500);
  }
  return json({ status: 'pending', name, registrationId }, 201);
}