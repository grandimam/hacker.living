import {Link} from 'react-router-dom';
import {ArrowDown,ArrowUpRight,Check,Pause,Play} from 'lucide-react';
import type {PipelineRun} from '../../shared/pilot-preview';
import {flowValve,type FlowStage} from '../../shared/pipeline-flow';
import {cn,controlClass} from '../lib';

type Control=(stage:FlowStage,action:'pause'|'resume')=>void;
function Valve({run,stage,busy,onControl}:{run:PipelineRun;stage:'label'|'enrich';busy:boolean;onControl:Control}){
 const valve=flowValve(run,stage);
 const label=stage==='label'?'comments into recommendation discovery':'recommendations into location and link research';
 return <div className="relative flex min-h-[100px] items-center justify-center">
  <span aria-hidden="true" className={cn('absolute inset-y-0 left-1/2 w-px -translate-x-1/2',valve.open?'bg-accent/45':'bg-rule')}/>
  <div className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-paper px-4 py-2">
   <div className="min-w-[105px] text-right"><p className="font-mono text-sm tabular-nums">{valve.waiting?.toLocaleString()}</p><p className="mt-0.5 text-[10px] text-muted">{stage==='label'?'comments waiting':'recommendations waiting'}</p></div>
   <button role="switch" aria-checked={valve.open} aria-label={`Allow ${label}`} disabled={busy} onClick={()=>onControl(stage,valve.open?'pause':'resume')} className={cn(controlClass,'flex min-h-10 items-center gap-2 rounded-full border bg-paper px-4 text-[11px] transition-colors disabled:opacity-50',valve.open?'border-accent/50 text-accent hover:bg-accent-soft':'border-ink/35 text-ink hover:bg-rule/30')}>
    <span aria-hidden="true" className={cn('grid size-5 place-items-center rounded-full',valve.open?'bg-accent text-white':'bg-ink text-paper')}>{valve.open?<Pause className="size-2.5"/>:<Play className="size-2.5"/>}</span>
    {valve.open?'Close valve':'Open valve'}
   </button>
   <span className={cn('flex min-w-[105px] items-center gap-1.5 font-mono text-[9px]',valve.open?'text-sage':'text-muted')}><span aria-hidden="true" className={cn('size-1.5 rounded-full',valve.open?'bg-sage':'bg-muted',valve.open&&valve.active&&'motion-safe:animate-pulse')}/>{valve.status}</span>
  </div>
 </div>;
}
function Band({step,title,value,detail,className,active=false}:{step:string;title:string;value:number;detail:string;className?:string;active?:boolean}){
 return <section aria-label={title} className={cn('relative mx-auto w-full overflow-hidden bg-[#efede4] px-8 py-4 text-center [clip-path:polygon(0_0,100%_0,94%_100%,6%_100%)]',active&&'bg-accent-soft',className)}>
  <p className="font-mono text-[9px] uppercase tracking-[.1em] text-muted">{step} · {title}</p>
  <p className="mt-1.5 font-editorial text-[36px] leading-none tracking-[-.025em] tabular-nums sm:text-[40px]">{value.toLocaleString()}</p>
  <p className="mx-auto mt-2 max-w-md text-[10px] leading-relaxed text-muted">{detail}</p>
 </section>;
}
export function PipelineFunnel({run,busy,onControl}:{run:PipelineRun;busy:boolean;onControl:Control}){
 const intake=flowValve(run,'collect'),located=run.counts.located??run.counts.ready;
 return <div className="mt-6">
  {run.capacities&&<p className="mb-4 text-center font-mono text-[10px] text-muted">{run.workers?.label??0}/{run.capacities.label} labeling workers · {run.workers?.enrich??0}/{run.capacities.enrich} research workers · results stream independently</p>}
  <div className="mb-3 flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted"><span className="font-mono uppercase tracking-wider">HN archive + new comments</span><ArrowDown aria-hidden="true" className="size-3"/>{run.collected?<span className="flex items-center gap-1 text-sage"><Check aria-hidden="true" className="size-3"/>Collection complete</span>:<button role="switch" aria-checked={intake.open} aria-label="Allow collection of new comments" disabled={busy} onClick={()=>onControl('collect',intake.open?'pause':'resume')} className={cn(controlClass,'inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1.5 disabled:opacity-50',intake.open?'border-accent/40 text-accent':'border-rule text-ink')}>{intake.open?<Pause aria-hidden="true" className="size-3"/>:<Play aria-hidden="true" className="size-3"/>}{intake.open?'Close intake':'Open intake'}<span className="text-muted">· {intake.status}</span></button>}</div>
  <Band step="01" title="Collected comments" value={run.counts.comments} detail={run.collected?'Saved in the database.':'Saved in the database · date-range collection is incomplete.'} active={intake.active&&intake.open}/>
  <Valve run={run} stage="label" busy={busy} onControl={onControl}/>
  <Band step="02" title="Place recommendations" value={run.counts.proposals} detail={`${run.counts.labeled.toLocaleString()} comments labeled. Each recommendation keeps its HN source.`} className="sm:w-[82%]" active={flowValve(run,'label').active&&flowValve(run,'label').open}/>
  <Valve run={run} stage="enrich" busy={busy} onControl={onControl}/>
  <Band step="03" title="Locations & links" value={located} detail={`${run.counts.researched.toLocaleString()} researched · coordinates first · images deferred.`} className="sm:w-[64%]" active={flowValve(run,'enrich').active&&flowValve(run,'enrich').open}/>
  <div className="flex flex-col items-center gap-2 py-3"><ArrowDown aria-hidden="true" className="size-4 text-sage"/><Link to="/" className={cn(controlClass,'flex items-center gap-2 rounded-full border border-sage/30 bg-sage/5 px-5 py-2.5 text-xs text-ink')}>{located.toLocaleString()} map {located===1?'location':'locations'} <ArrowUpRight aria-hidden="true" className="size-3"/></Link><p className="text-[9px] text-muted">Research results appear on the map automatically.</p></div>
  <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">Recommendations move into research individually while labeling continues. Close a valve to hold its queue; work already past it can finish.</p>
 </div>;
}
