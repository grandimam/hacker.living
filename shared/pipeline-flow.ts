import type {PipelineRun} from './pilot-preview';
export type FlowStage='collect'|'label'|'enrich';
export function flowValve(run:PipelineRun,stage:FlowStage){
 const open=run.stage_config[stage];
 const active=!run.stale&&!['failed','complete','attention','paused'].includes(run.state)&&(run.active_stages?run.active_stages.includes(stage):run.state===({collect:'collecting',label:'labeling',enrich:'enriching'} as const)[stage]);
 const waiting=stage==='label'?Math.max(0,run.counts.comments-run.counts.labeled):stage==='enrich'?Math.max(0,run.counts.proposals-run.counts.researched):null;
 const status=!open?(active?'Closing':'Closed'):active?'Flowing':waiting===0?'Waiting for input':'Open';
 return {open,active,waiting,status};
}
