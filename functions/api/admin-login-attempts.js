import { json, decryptAccessCode, sha256 } from './_utils.js';
function authorized(request, env) { const key=request.headers.get('X-Admin-Key')||''; return !!env.ADMIN_KEY && !!key && key===env.ADMIN_KEY; }
export async function onRequestGet({request,env}) {
 if (!authorized(request,env)) return json({error:'Admin authorization required'},401);
 const u=new URL(request.url); const scope=u.searchParams.get('scope')==='hsc'?'hsc':'all';
 const limit=Math.min(10,Math.max(1,Number(u.searchParams.get('limit')||5))); const offset=Math.max(0,Number(u.searchParams.get('offset')||0));
 const search=String(u.searchParams.get('search')||'').trim().slice(0,100); const where=[]; const binds=[];
 if(scope==='hsc') where.push("a.label = 'HSC 27'"); else { where.push("a.label != 'HSC 27'"); if(search){where.push("(LOWER(COALESCE(a.label,'')) LIKE ? OR a.code_hash = ?)");binds.push('%'+search.toLowerCase()+'%',await sha256(search.toUpperCase()));} }
 const clause=where.length?'WHERE '+where.join(' AND '):'';
 const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM login_attempts l JOIN access_codes a ON a.id=l.code_id '+clause).bind(...binds).first();
 const rows=await env.DB.prepare('SELECT a.label,a.encrypted_code,l.attempted_at,l.status,l.device_hash FROM login_attempts l JOIN access_codes a ON a.id=l.code_id '+clause+' ORDER BY l.attempted_at DESC LIMIT ? OFFSET ?').bind(...binds,limit,offset).all();
 const key=env.CODE_ENCRYPTION_KEY||''; const attempts=await Promise.all((rows.results||[]).map(async a=>{let code=null;try{code=a.encrypted_code?await decryptAccessCode(a.encrypted_code,key):null;}catch{}return {label:a.label||'—',code,attempted_at:a.attempted_at,status:a.status,device:String(a.device_hash||'').slice(0,10)+'…'};}));
 return json({total:Number(count?.total||0),offset,limit,attempts});
}

export async function onRequestDelete({ request, env }) {
 if (!authorized(request, env)) return json({ error: 'Admin authorization required' }, 401);
 let body = {};
 try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
 const scope = body.scope === 'hsc' ? 'hsc' : body.scope === 'all' ? 'all' : '';
 if (!scope) return json({ error: 'Invalid history scope' }, 400);
 const labelCondition = scope === 'hsc' ? "label = 'HSC 27'" : "label != 'HSC 27'";
 const result = await env.DB.prepare(
   'DELETE FROM login_attempts WHERE code_id IN (SELECT id FROM access_codes WHERE ' + labelCondition + ')'
 ).run();
 return json({ ok: true, scope, deleted: Number(result?.meta?.changes || 0) });
}
