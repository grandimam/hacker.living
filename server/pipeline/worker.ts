import {getPool} from '../db/connection.ts';
import {CodexLabeler} from '../../scripts/codex-labeler.ts';
import {collectRange} from './collect.ts';
import {labelRun} from './label.ts';
import {enrichRun} from './enrich.ts';
import {runCounts,runEvent,resetIncompleteRun,workflowVersion} from './runs.ts';
import {stages,stageGate,StageYield,type Stage,type StageConfig} from './control.ts';
import {runStagePool,type StageCapacity} from './worker-pool.ts';
import {workerLimits} from './worker-limits.ts';
import {modelCoolingDown,codexRateLimited,noteModelCooldown} from './model-backpressure.ts';
export async function availableWork(runId:string){
 const result=await getPool().query(`SELECT NOT collected AS collect,
 EXISTS(SELECT 1 FROM pipeline_jobs j JOIN pipeline_run_candidates rc ON rc.candidate_id=j.payload->>'candidateId' WHERE rc.run_id=$1 AND j.kind='label_comment' AND ((j.state='queued' AND j.attempts<j.max_attempts) OR (j.state='running' AND (j.locked_until>now() OR j.attempts<j.max_attempts)))) AS label,
 EXISTS(SELECT 1 FROM place_proposals p JOIN labels l ON l.id=p.label_id JOIN pipeline_run_candidates rc ON rc.candidate_id=l.candidate_id WHERE rc.run_id=$1 AND p.state<>'rejected' AND NOT EXISTS(SELECT 1 FROM pipeline_jobs j WHERE j.kind='resolve_place' AND j.dedupe_key='auto:'||$2||':'||p.id::text AND j.state IN ('succeeded','failed'))) AS enrich FROM pipeline_runs WHERE id=$1`,[runId,workflowVersion]);return result.rows[0] as Record<Stage,boolean>;
}
export function chooseStage(config:StageConfig,work:Record<Stage,boolean>,last:Stage|null,requested:Stage|null):Stage|null{
 if(requested&&config[requested]&&work[requested])return requested;
 const start=last===null?0:(stages.indexOf(last)+1)%stages.length;
 for(let i=0;i<stages.length;i++){const stage=stages[(start+i)%stages.length];if(config[stage]&&work[stage])return stage;}return null;
}
export async function executeRun(runId:string){
 const lock=await getPool().connect();let heartbeat:ReturnType<typeof setInterval>|undefined;const models=new Set<CodexLabeler>();let ownsLock=false;
 try{
  ownsLock=(await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',[`hacker.living:run:${runId}`])).rows[0].ok;if(!ownsLock)return false;
  const run=(await lock.query('SELECT * FROM pipeline_runs WHERE id=$1',[runId])).rows[0];if(!run)throw Error('Pipeline run not found');if(run.state==='complete')return true;
  if(['failed','attention'].includes(run.state))await resetIncompleteRun(runId);
  await getPool().query("UPDATE pipeline_jobs SET state='queued',attempts=greatest(attempts-1,0),available_at=now(),worker_id=NULL,lease_token=NULL,locked_until=NULL,updated_at=now() WHERE state='running' AND worker_id=ANY($1::text[])",[[`date-label-${runId}`,`resolver-${runId}`]]);
  heartbeat=setInterval(()=>{void getPool().query('UPDATE pipeline_runs SET heartbeat_at=now() WHERE id=$1',[runId]).catch(error=>console.error('Heartbeat failed:',String(error)));},15000);
  let capacities:StageCapacity=workerLimits(run.summary?.workerLimits),previousActive='',labelTurns=0;
  await runEvent(runId,'workers',`Streaming workers: ${capacities.label} labeling, ${capacities.enrich} research; each saved recommendation advances independently`);
  await runStagePool({capacities,
   read:async()=>{
    const row=(await getPool().query('SELECT stage_config,summary FROM pipeline_runs WHERE id=$1',[runId])).rows[0];capacities=workerLimits(row.summary?.workerLimits);
    await getPool().query('UPDATE pipeline_runs SET requested_stage=NULL WHERE id=$1 AND requested_stage IS NOT NULL',[runId]);
    return {config:row.stage_config,work:await availableWork(runId),capacities};
   },
   perform:async stage=>{
    const guard=stageGate(runId,stage,Infinity,false);let model:CodexLabeler|undefined;
    try{
     await guard();if(stage!=='collect'&&await modelCoolingDown()){await new Promise(resolve=>setTimeout(resolve,5000));return;}
     if(stage==='collect')await collectRange(runId,{from:new Date(run.from_at).toISOString(),to:new Date(Math.min(new Date(run.to_at).getTime(),new Date(run.created_at).getTime())).toISOString()},guard,10);
     else if(stage==='label'){
      const lazy={classify:async(...args:Parameters<CodexLabeler['classify']>)=>{if(!model){model=new CodexLabeler();models.add(model);await model.initialize();}return model.classify(...args);}};
      await labelRun(runId,lazy,guard,1,++labelTurns%4===0);
     }else{model=new CodexLabeler();models.add(model);await model.initialize();await enrichRun(runId,model,guard,1);}
    }catch(error){
     if(error instanceof StageYield)return;
     if(codexRateLimited(error)){await noteModelCooldown('codex',String(error));await runEvent(runId,'cooldown','Codex overloaded; retrying after shared cooldown');return;}
     throw error;
    }finally{if(model){models.delete(model);model.close();}}
   },
   active:async counts=>{
    const key=JSON.stringify({counts,capacities});if(key===previousActive)return;previousActive=key;
    const activeStages=stages.filter(stage=>counts[stage]>0),state=counts.label?'labeling':counts.enrich?'enriching':counts.collect?'collecting':'paused';
    await getPool().query("UPDATE pipeline_runs SET state=$2,last_error=NULL,heartbeat_at=now(),summary=summary||$3::jsonb WHERE id=$1",[runId,state,JSON.stringify({activeStages,workers:counts,capacities})]);
   },
  });
  const summary=await runCounts(runId),latest=(await getPool().query('SELECT collected,stage_config FROM pipeline_runs WHERE id=$1',[runId])).rows[0],work=await availableWork(runId);
  const paused=!latest.collected||stages.some(stage=>work[stage]&&!latest.stage_config[stage]),state=paused?'paused':summary.labeled===summary.comments&&summary.located===summary.proposals?'complete':'attention';
  await getPool().query('UPDATE pipeline_runs SET state=$2,summary=$3,heartbeat_at=now(),updated_at=now() WHERE id=$1',[runId,state,JSON.stringify({...summary,collectionComplete:latest.collected})]);
  await runEvent(runId,state,`${summary.comments} saved comments → ${summary.proposals} recommendations → ${summary.located} located places${!latest.collected?'; collection remains incomplete':''}`,summary);return true;
 }catch(error){if(ownsLock){const message=error instanceof Error?error.message:String(error);await getPool().query("UPDATE pipeline_runs SET state='failed',last_error=$2,updated_at=now() WHERE id=$1",[runId,message]);await runEvent(runId,'failed',message);}throw error;}
 finally{if(heartbeat)clearInterval(heartbeat);for(const model of models)model.close();if(ownsLock)await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[`hacker.living:run:${runId}`]).catch(()=>{});lock.release();}
}
