import {getPool} from '../db/connection.ts';
export function codexRateLimited(error:unknown){const message=String(error);return /codex/i.test(message)&&/rate.?limit|too many requests|429|quota|usage limit|overloaded|capacity/i.test(message);}
export function limitedProvider(error:unknown):'codex'|'pi'|null{
 if(codexRateLimited(error))return 'codex';
 return /\bPi\b/i.test(String(error))&&/rate.?limit|429|quota|overloaded|capacity|auth_unavailable|refresh token|invalid_grant/i.test(String(error))?'pi':null;
}
export async function modelCoolingDown(provider:'codex'|'pi'='codex'){
 const row=(await getPool().query("SELECT (cursor->>'until')::timestamptz>now() AS active FROM pipeline_checkpoints WHERE source=$1",[`${provider}:cooldown`])).rows[0];return row?.active===true;
}
export async function noteModelCooldown(provider:'codex'|'pi',reason:string){
 await getPool().query(`INSERT INTO pipeline_checkpoints(source,cursor) VALUES($1,jsonb_build_object('until',now()+interval '5 minutes','reason',$2::text)) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=now()`,[`${provider}:cooldown`,reason]);
}
