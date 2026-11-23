import { json, session } from './_utils.js';

function isDeviceScoped(s) {
  return s.label === 'HSC 27' && !!s.device_hash;
}

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return json({ error: 'Unauthorized' }, 401);

  const deviceScoped = isDeviceScoped(s);
  // HSC 27 reads only this device's progress. Other codes retain shared progress.
  const row = deviceScoped
    ? await env.DB.prepare('SELECT state_json, updated_at FROM device_progress WHERE code_id=? AND device_hash=?').bind(s.code_id, s.device_hash).first()
    : await env.DB.prepare('SELECT state_json, updated_at FROM progress WHERE code_id=?').bind(s.code_id).first();

  let progress = null;
  if (row) { try { progress = JSON.parse(row.state_json); } catch { progress = null; } }
  return json({ progress, updatedAt: row?.updated_at || null });
}

export async function onRequestPut({ request, env }) {
  const s = await session(request, env);
  if (!s) return json({ error: 'Unauthorized' }, 401);

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
  if (isDeviceScoped(s)) {
    await env.DB.prepare(`
      INSERT INTO device_progress(code_id, device_hash, state_json, updated_at)
      VALUES(?,?,?,?)
      ON CONFLICT(code_id, device_hash) DO UPDATE SET
        state_json=excluded.state_json, updated_at=excluded.updated_at
    `).bind(s.code_id, s.device_hash, serialized, now).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO progress(code_id,state_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(code_id) DO UPDATE SET
        state_json=excluded.state_json, updated_at=excluded.updated_at
    `).bind(s.code_id, serialized, now).run();
  }
  return json({ ok: true, updatedAt: now });
}
