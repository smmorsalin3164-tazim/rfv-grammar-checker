import { json, sha256 } from './_utils.js';

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const value = [...bytes].map(b => (b % 36).toString(36).toUpperCase()).join('');
  return 'RFV-' + value.slice(0, 4) + '-' + value.slice(4);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'তথ্য সঠিকভাবে পাওয়া যায়নি।' }, 400); }

  const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase();
  if (name.length < 2) return json({ error: 'সঠিক নাম লিখো।' }, 400);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'সঠিক Email Address লিখো।' }, 400);
  }
  if (!env.MAILER_URL || !env.MAILER_SECRET) {
    return json({ error: 'ইমেল পাঠানোর ব্যবস্থা এখনো যুক্ত করা হয়নি। Admin-এর সঙ্গে যোগাযোগ করো।' }, 503);
  }

  const code = makeCode();
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO access_codes(id,code_hash,label,active,created_at,device_limit) VALUES(?,?,?,1,?,3)'
  ).bind(id, await sha256(code), name, now).run();

  try {
    const mailResponse = await fetch(env.MAILER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.MAILER_SECRET,
        to: email,
        name,
        code
      }),
      redirect: 'follow'
    });
    const mailResult = await mailResponse.json();
    if (!mailResponse.ok || mailResult.ok !== true) {
      throw new Error(mailResult.error || 'Email provider rejected the request');
    }
  } catch (error) {
    await env.DB.prepare('DELETE FROM access_codes WHERE id=?').bind(id).run();
    return json({ error: 'ইমেল পাঠানো যায়নি। Email Address ঠিক আছে কি না দেখে আবার চেষ্টা করো।' }, 502);
  }

  // The email address is used only for delivery and is not saved in the database.
  return json({ ok: true, message: 'Access Code sent' }, 200);
}
