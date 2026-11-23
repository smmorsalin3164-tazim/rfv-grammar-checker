export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });
export async function sha256(value) { const bytes = new TextEncoder().encode(value); const hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function getBearer(request) { const h=request.headers.get('Authorization')||''; return h.startsWith('Bearer ')?h.slice(7):''; }
export async function session(request, env) {
  const token=getBearer(request);
  if(!token) return null;
  const hash=await sha256(token);
  const row=await env.DB.prepare('SELECT s.code_id, s.device_hash, c.label, c.active FROM sessions s JOIN access_codes c ON c.id=s.code_id WHERE s.token_hash=? AND s.expires_at>?').bind(hash,Date.now()).first();
  return row && row.active ? row : null;
}
export function corsHeaders(){ return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Admin-Key','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'}; }
