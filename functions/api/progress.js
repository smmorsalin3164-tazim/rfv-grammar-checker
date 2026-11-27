import { json, session } from './_utils.js';

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s || !s.profile_id) return json({ error: 'Unauthorized' }, 401);
  const row = await env.DB.prepare(
    'SELECT state_json, updated_at FROM profile_progress WHERE profile_id=?'
  ).bind(s.profile_id).first();
  let progress = null;
  if (row) { try { progress = JSON.parse(row.state_json); } catch { progress = null; } }
  return json({ progress, updatedAt: row?.updated_at || null });
}

export async function onRequestPut({ request, env }) {
  const s = await session(request, env);
  if (!s || !s.profile_id) return json({ error: 'Unauthorized' }, 401);
  let state;
  try { state = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return json({ error: 'Invalid progress' }, 400);

  const safe = {
    currentQuestionId: Math.min(41, Math.max(1, Number(state.currentQuestionId) || 1)),
    inputs: state.inputs && typeof state.inputs === 'object' ? state.inputs : {},
    checked: state.checked && typeof state.checked === 'object' ? state.checked : {},
    ruleErrors: state.ruleErrors && typeof state.ruleErrors === 'object' ? state.ruleErrors : {}
  };
  const serialized = JSON.stringify(safe);
  if (serialized.length > 250000) return json({ error: 'Progress data too large' }, 413);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO profile_progress(profile_id, state_json, updated_at) VALUES(?,?,?)
    ON CONFLICT(profile_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at
  `).bind(s.profile_id, serialized, now).run();
  return json({ ok: true, updatedAt: now });
}
