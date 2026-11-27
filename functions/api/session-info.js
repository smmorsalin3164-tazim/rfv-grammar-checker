import { json, session, decryptAccessCode } from './_utils.js';
export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s || !s.profile_id) return json({ error: 'Unauthorized' }, 401);
  const row = await env.DB.prepare(`
    SELECT a.label, a.encrypted_code, p.encrypted_sync_code
    FROM access_codes a JOIN progress_profiles p ON p.id=?
    WHERE a.id=? AND a.active=1
  `).bind(s.profile_id, s.code_id).first();
  if (!row) return json({ error: 'Access Code পাওয়া যায়নি।' }, 404);
  let code = null, syncCode = null;
  try { code = row.encrypted_code ? await decryptAccessCode(row.encrypted_code, env.CODE_ENCRYPTION_KEY) : null; } catch {}
  try { syncCode = row.encrypted_sync_code ? await decryptAccessCode(row.encrypted_sync_code, env.CODE_ENCRYPTION_KEY) : null; } catch {}
  return json({ label: row.label, code, progressSyncCode: syncCode });
}
