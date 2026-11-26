import { json, session, decryptAccessCode } from './_utils.js';
export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return json({ error: 'Unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT label, encrypted_code FROM access_codes WHERE id=? AND active=1').bind(s.code_id).first();
  if (!row) return json({ error: 'Access Code পাওয়া যায়নি।' }, 404);
  let code = null;
  try { code = row.encrypted_code ? await decryptAccessCode(row.encrypted_code, env.CODE_ENCRYPTION_KEY) : null; } catch {}
  return json({ label: row.label, code });
}