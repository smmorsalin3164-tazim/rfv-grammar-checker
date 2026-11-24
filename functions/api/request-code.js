import { json, sha256, encryptAccessCode } from './_utils.js';

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const value = [...bytes].map(b => (b % 36).toString(36).toUpperCase()).join('');
  return 'RFV-' + value.slice(0, 4) + '-' + value.slice(4);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'তথ্য সঠিকভাবে পাওয়া যায়নি।' }, 400); }

  const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (name.length < 2) return json({ error: 'সঠিক নাম লিখো।' }, 400);

  if (!env.CODE_ENCRYPTION_KEY || env.CODE_ENCRYPTION_KEY.length < 32) {
    return json({ error: 'Access Code নিরাপদে সংরক্ষণের ব্যবস্থা এখনো প্রস্তুত নয়। Admin-এর সঙ্গে যোগাযোগ করো।' }, 503);
  }

  const code = makeCode();
  const encryptedCode = await encryptAccessCode(code, env.CODE_ENCRYPTION_KEY);
  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await env.DB.prepare(
      'INSERT INTO access_codes(id,code_hash,label,active,created_at,device_limit,encrypted_code) VALUES(?,?,?,1,?,3,?)'
    ).bind(id, await sha256(code), name, now, encryptedCode).run();
  } catch (error) {
    console.error('[request-code] database insert failed', String(error && error.message || error).slice(0, 160));
    return json({ error: 'Access Code সংরক্ষণ করা যায়নি। আবার চেষ্টা করো।' }, 500);
  }

  return json({ ok: true, code }, 201);
}
