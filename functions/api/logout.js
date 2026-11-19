import { json, getBearer, sha256 } from './_utils.js';
export async function onRequestPost({request,env}) { const token=getBearer(request); if(token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run(); return json({ok:true}); }
