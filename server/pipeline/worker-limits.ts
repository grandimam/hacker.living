import type {StageCapacity} from './worker-pool.ts';
export function workerLimits(overrides:unknown={},env:NodeJS.ProcessEnv=process.env):StageCapacity{
 const values=(overrides&&typeof overrides==='object'?overrides:{}) as Record<string,unknown>;
 const capacity=(stage:string,name:string,fallback:number)=>{
  const value=Number(values[stage]??env[name]??fallback);
  if(!Number.isInteger(value)||value<1||value>128)throw Error(`${name} must be an integer from 1 to 128`);
  return value;
 };
 return {collect:1,label:capacity('label','PIPELINE_LABEL_WORKERS',8),enrich:capacity('enrich','PIPELINE_RESEARCH_WORKERS',6)};
}
