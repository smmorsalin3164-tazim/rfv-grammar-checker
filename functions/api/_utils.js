export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });
export async function sha256(value) { const bytes = new TextEncoder().encode(value); const hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function getBearer(request) { const h=request.headers.get('Authorization')||''; return h.startsWith('Bearer ')?h.slice(7):''; }
export async function session(request, env) {
  const token=getBearer(request);
  if(!token) return null;
  const hash=await sha256(token);
  const row=await env.DB.prepare('SELECT s.code_id, s.device_hash, s.profile_id, c.label, c.active FROM sessions s JOIN access_codes c ON c.id=s.code_id WHERE s.token_hash=? AND s.expires_at>?').bind(hash,Date.now()).first();
  return row && row.active ? row : null;
}
export function corsHeaders(){ return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Admin-Key','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'}; }


// Access codes are encrypted at rest; keep CODE_ENCRYPTION_KEY only as a Cloudflare secret.
async function codeCryptoKey(secret) {
  if (!secret || secret.length < 32) throw new Error('CODE_ENCRYPTION_KEY must be at least 32 characters');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
function toBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
export async function encryptAccessCode(code, secret) {
  const key = await codeCryptoKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(code));
  return toBase64(iv) + '.' + toBase64(encrypted);
}
export async function decryptAccessCode(value, secret) {
  if (!value) return null;
  const [ivPart, dataPart] = String(value).split('.');
  if (!ivPart || !dataPart) return null;
  const key = await codeCryptoKey(secret);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivPart) }, key, fromBase64(dataPart));
  return new TextDecoder().decode(plain);
}
