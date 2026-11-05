import type {Pool} from 'pg';
import {getPool,transaction} from '../db/connection.ts';
export const stages=['collect','label','enrich'] as const;
export type Stage=typeof stages[number];
export type StageConfig=Record<Stage,boolean>;
export class StageYield extends Error{}
export function stageEnabled(config:StageConfig,stage:Stage,requested:Stage|null){return config[stage]&&(requested===null||requested===stage);}
/** Check only between atomic units. An in-flight batch is committed before pausing. */
export function stageGate(runId:string,stage:Stage,maxUnits:number,respectRequested=true){
 let units=0;
 return async()=>{
  if(units>=maxUnits)throw new StageYield('Stage quantum complete');
  const row=(await getPool().query('SELECT stage_config,requested_stage FROM pipeline_runs WHERE id=$1',[runId])).rows[0];
  if(!row||!stageEnabled(row.stage_config,stage,respectRequested?row.requested_stage:null))throw new StageYield('Stage paused or another stage requested');
  units++;
 };
}
export async function changeStage(runId:string,stage:Stage,action:'pause'|'resume'|'advance',pool:Pool=getPool()){
 if(!stages.includes(stage)||!['pause','resume','advance'].includes(action))throw Error('Invalid stage control');
 if(action==='advance'&&stage==='enrich')throw Error('Research is the last stage');
 return transaction(async c=>{
  const run=(await c.query('SELECT * FROM pipeline_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0];if(!run)throw Error('Run not found');
  const config:StageConfig={...run.stage_config};let requested:Stage|null=run.requested_stage;
  if(action==='pause'){config[stage]=false;if(requested===stage)requested=null;}
  else if(action==='resume'){config[stage]=true;requested=stage;}
  else{config[stage]=false;const next=stages[stages.indexOf(stage)+1];config[next]=true;requested=next;}
  await c.query('UPDATE pipeline_runs SET stage_config=$2,requested_stage=$3,updated_at=now() WHERE id=$1',[runId,JSON.stringify(config),requested]);
  await c.query("INSERT INTO pipeline_events(run_id,stage,message,details) VALUES($1,'control',$2,$3)",[runId,`${stage}: ${action}${action==='advance'?`; continue with ${requested} using saved data`:''}`,JSON.stringify({stage,action,config,requested})]);
  return {id:runId,stage_config:config,requested_stage:requested};
 },pool);
}
