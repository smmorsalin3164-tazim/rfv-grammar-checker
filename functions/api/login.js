import { json, sha256, encryptAccessCode } from './_utils.js';

function makeSyncCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map(b => (b % 36).toString(36).toUpperCase()).join('');
  return 'RFVP-' + chars.slice(0, 4) + '-' + chars.slice(4, 8);
}

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    const code = String(body.code || '').trim().toUpperCase();
    const deviceId = String(body.deviceId || '').trim();
    const studentName = String(body.name || '').trim().slice(0, 80);
    if (!/^[A-Z0-9.-]{6,40}$/.test(code)) return json({ error: 'Access Code / Progress Sync Code সঠিক নয়।' }, 400);
    if (!/^[a-zA-Z0-9-]{20,100}$/.test(deviceId)) return json({ error: 'Device ID পাওয়া যায়নি। আবার চেষ্টা করো।' }, 400);
    if (!env.CODE_ENCRYPTION_KEY || env.CODE_ENCRYPTION_KEY.length < 32) return json({ error: 'Server encryption key is not configured.' }, 503);
  
    const deviceHash = await sha256(deviceId);
    const codeHash = await sha256(code);
    const now = Date.now();
  
    let access = await env.DB.prepare(
      'SELECT id, label, device_limit FROM access_codes WHERE code_hash=? AND active=1'
    ).bind(codeHash).first();
    let profile = null;
    let usedSyncCode = false;
  
    if (!access) {
      profile = await env.DB.prepare(`
        SELECT p.id AS profile_id, p.code_id, p.display_name, a.label, a.device_limit, a.active
        FROM progress_profiles p JOIN access_codes a ON a.id=p.code_id
        WHERE p.sync_code_hash=? AND a.active=1
      `).bind(codeHash).first();
      if (!profile) return json({ error: 'Access Code / Progress Sync Code সঠিক নয় অথবা বাতিল করা হয়েছে।' }, 401);
      access = { id: profile.code_id, label: profile.label, device_limit: profile.device_limit };
      usedSyncCode = true;
    }
  
    const isHsc27 = access.label === 'HSC 27';
    const existingDevice = await env.DB.prepare(
      'SELECT dp.profile_id, p.display_name FROM device_profiles dp
      JOIN progress_profiles p ON p.id=dp.profile_id
      WHERE dp.code_id=? AND dp.device_hash=?'
    ).bind(access.id, deviceHash).first();
  
    // A new device must provide a name. A known device can log in with only its code.
    if (!existingDevice && studentName.length < 2) {
      return json({ error: 'প্রথমবার এই Device-এ প্রবেশের জন্য তোমার নাম লিখো।' }, 400);
    }
  
    // Preserve the existing device activation limits. HSC 27 remains unlimited.
    if (isHsc27) {
      await env.DB.prepare(`
        INSERT INTO device_activations (id, code_id, device_hash, activated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(code_id, device_hash) DO NOTHING
      `).bind(crypto.randomUUID(), access.id, deviceHash, now).run();
    } else {
      const limit = Number(access.device_limit || 3);
      await env.DB.prepare(`
        INSERT INTO device_activations (id, code_id, device_hash, activated_at)
        SELECT ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM device_activations WHERE code_id=?) < ?
        ON CONFLICT(code_id, device_hash) DO NOTHING
      `).bind(crypto.randomUUID(), access.id, deviceHash, now, access.id, limit).run();
    }
  
    const activation = await env.DB.prepare(
      'SELECT id FROM device_activations WHERE code_id=? AND device_hash=?'
    ).bind(access.id, deviceHash).first();
    if (!activation) {
      await env.DB.prepare(
        "INSERT INTO login_attempts (id, code_id, device_hash, attempted_at, status, student_name) VALUES (?, ?, ?, ?, 'blocked', ?)"
      ).bind(crypto.randomUUID(), access.id, deviceHash, now, profile.display_name || studentName || null).run();
      const limit = Number(access.device_limit || 3);
      return json({ error: isHsc27 ? 'এই Device-এ প্রবেশ করা যাচ্ছে না। Admin-এর সঙ্গে যোগাযোগ করো।' : `এই Access Code-এর সর্বোচ্চ ${limit}টি Device ব্যবহার হয়ে গেছে। Admin-এর সঙ্গে যোগাযোগ করো।` }, 403);
    }
  
    if (usedSyncCode) {
      // Sync code explicitly attaches this device to the selected profile.
      await env.DB.prepare(`
        INSERT INTO device_profiles(code_id, device_hash, profile_id) VALUES(?,?,?)
        ON CONFLICT(code_id, device_hash) DO UPDATE SET profile_id=excluded.profile_id
      `).bind(access.id, deviceHash, profile.profile_id).run();
      profile = { profile_id: profile.profile_id, display_name: profile.display_name };
    } else if (existingDevice) {
      profile = { profile_id: existingDevice.profile_id, display_name: existingDevice.display_name };
    } else {
      const profileId = crypto.randomUUID();
      const syncCode = makeSyncCode();
      const syncHash = await sha256(syncCode);
      const encryptedSyncCode = await encryptAccessCode(syncCode, env.CODE_ENCRYPTION_KEY);
  
      // The first profile for a general Access Code inherits its old shared progress.
      const profileCount = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM progress_profiles WHERE code_id=?'
      ).bind(access.id).first();
      await env.DB.prepare(`
        INSERT INTO progress_profiles(id, code_id, sync_code_hash, encrypted_sync_code, display_name, created_at)
        VALUES(?,?,?,?,?,?)
      `).bind(profileId, access.id, syncHash, encryptedSyncCode, studentName, now).run();
  
      if (!isHsc27 && Number(profileCount?.n || 0) === 0) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO profile_progress(profile_id, state_json, updated_at)
          SELECT ?, state_json, updated_at FROM progress WHERE code_id=?
        `).bind(profileId, access.id).run();
        await env.DB.prepare('DELETE FROM progress WHERE code_id=?').bind(access.id).run();
      } else if (isHsc27) {
        // Keep each existing HSC 27 device's previously isolated work with that device.
        await env.DB.prepare(`
          INSERT OR IGNORE INTO profile_progress(profile_id, state_json, updated_at)
          SELECT ?, state_json, updated_at FROM device_progress WHERE code_id=? AND device_hash=?
        `).bind(profileId, access.id, deviceHash).run();
      }
  
      await env.DB.prepare(
        'INSERT INTO device_profiles(code_id, device_hash, profile_id) VALUES(?,?,?)'
      ).bind(access.id, deviceHash, profileId).run();
      profile = { profile_id: profileId, display_name: studentName };
    }
  
    await env.DB.prepare(
      "INSERT INTO login_attempts (id, code_id, device_hash, attempted_at, status, student_name) VALUES (?, ?, ?, ?, 'success', ?)"
    ).bind(crypto.randomUUID(), access.id, deviceHash, now, studentName || null).run();
  
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    const tokenHash = await sha256(token);
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    await env.DB.prepare('INSERT INTO sessions(token_hash, code_id, expires_at, device_hash, profile_id) VALUES(?,?,?,?,?)')
      .bind(tokenHash, access.id, expires, deviceHash, profile.profile_id).run();
    return json({ token, expiresAt: expires });
  } catch (error) {
    const diagnostic = String(error?.message || error || 'Unknown login error').slice(0, 300);
    console.error('LOGIN_DIAGNOSTIC_TEMP', error?.stack || diagnostic);
    return json({ error: 'Login service failed.', diagnostic }, 500);
  }
}
