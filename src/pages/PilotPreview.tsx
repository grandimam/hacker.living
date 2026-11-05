import {ProviderPools} from '../components/ProviderPools';
import {PipelineNav} from '../components/PipelineNav';
import { useEffect, useMemo, useState } from 'react';
import { PipelineRuns } from '../components/PipelineRuns';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ChevronDown, Clock3, Download, GitBranch, LoaderCircle, RefreshCw, Search, Terminal } from 'lucide-react';
import type { PipelinePreviewResponse } from '../../shared/pilot-preview';
import { cn, controlClass, formatDate, textLinkClass } from '../lib';

const bytes = (value:number) => value>=1e9 ? `${(value/1e9).toFixed(2)} GB` : `${(value/1e6).toFixed(1)} MB`;
const time = (value:string) => new Date(value).toLocaleTimeString([], {hour12:false});
const since = (value:string|null) => { if (!value) return 'No activity recorded'; const seconds=Math.max(0,Math.round((Date.now()-Date.parse(value))/1000)); return seconds<60 ? `${seconds}s ago` : seconds<3600 ? `${Math.floor(seconds/60)}m ago` : `${Math.floor(seconds/3600)}h ago`; };

export default function PilotPreview() {
  const [data,setData] = useState<PipelinePreviewResponse | null>(null);
  const [error,setError] = useState('');
  const [refreshing,setRefreshing] = useState(false);
  const [refreshKey,setRefreshKey] = useState(0);
  const [query,setQuery] = useState('');
  const [multiple,setMultiple] = useState(false);
  const [tab,setTab] = useState<'artifacts'|'activity'>('artifacts');
  useEffect(() => {
    document.title='Pipeline — hacker.living';
    let disposed=false, pending=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let controller:AbortController|undefined;
    const poll=async()=>{
      if (disposed || pending || document.visibilityState==='hidden') return;
      pending=true;setRefreshing(true);controller=new AbortController();
      const timeout=setTimeout(()=>controller?.abort(),15_000);
      try {
        const response=await fetch('/api/pipeline/preview',{signal:controller.signal,cache:'no-store'});
        if (!response.ok) throw new Error('Live status is unavailable. Displaying the last received state.');
        const result=await response.json() as PipelinePreviewResponse;
        if (!result.pipeline) throw new Error('Waiting for the development server to load pipeline telemetry.');
        if (!disposed) {setData(result);setError('');}
      } catch(error) { if (!disposed) setError(error instanceof Error && error.name!=='AbortError' ? error.message : 'The status request timed out. Retrying automatically.'); }
      finally { clearTimeout(timeout);pending=false;if(!disposed){setRefreshing(false);if(document.visibilityState==='visible')timer=setTimeout(poll,5000);} }
    };
    const resume=()=>{if(timer)clearTimeout(timer);if(document.visibilityState==='visible')void poll();};
    void poll();document.addEventListener('visibilitychange',resume);
    return()=>{disposed=true;controller?.abort();if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',resume);};
  },[refreshKey]);
  const groups = useMemo(() => data?.groups.filter(p => (!multiple || p.sources.length > 1) && [p.name,p.city,p.country,...p.sources.flatMap(s => [s.author,s.reason])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [],[data,query,multiple]);
  const archive=data?.pipeline.archive;
  const receiving=archive?.state==='active' && !error;
  return <section className="mx-auto max-w-[1250px] py-7 sm:py-10">
    <PipelineNav/><ProviderPools/>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to="/" className={cn(textLinkClass,'gap-1.5 text-[11px] font-normal text-muted')}><ArrowLeft aria-hidden="true" className="size-3.5"/>Back to places</Link>
      <div role="status" className="flex items-center gap-2 font-mono text-[9px] text-muted"><span aria-hidden="true" className={cn('size-1.5 rounded-full',data&&!error?'bg-sage':'bg-muted')}/>{error ? 'Status feed interrupted' : data ? 'Live telemetry · refreshes every 5s' : 'Connecting to pipeline…'}<button onClick={()=>setRefreshKey(key=>key+1)} disabled={refreshing} aria-label="Refresh pipeline status" className={cn(controlClass,'ml-1 rounded p-1 hover:text-ink disabled:opacity-40')}><RefreshCw aria-hidden="true" className={cn('size-3',refreshing&&'motion-safe:animate-spin')}/></button></div>
    </div>
    <div className="mb-7 mt-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.08em] text-muted"><GitBranch aria-hidden="true" className="size-3.5"/>hacker.living / pipeline</p><h1 className="mt-2 font-editorial text-[38px] font-normal leading-tight tracking-[-.025em] sm:text-[46px]">From HN threads to map pins.</h1><p className="mt-2 max-w-[700px] text-xs leading-[1.8] text-muted">Community recommendations, with a traceable path from collection to publication.</p></div>
      {data&&<Link to="/" className={cn(textLinkClass,'gap-1 text-[11px] font-normal')}>Map preview · {data.pipeline.database.research?.located??0} places <ArrowUpRight aria-hidden="true" className="size-3"/></Link>}
    </div>
    <PipelineRuns/>
    {error&&<p role="alert" className="mb-5 border-l-2 border-accent bg-accent-soft px-4 py-3 text-xs leading-relaxed">{error}</p>}
    {!data ? <p role="status" className="border-y border-rule py-16 text-sm text-muted">Reading local pipeline state…</p> : <>
      <details className="border-y border-rule py-4"><summary className={cn(controlClass,'w-fit cursor-pointer text-[11px] text-muted')}>Archive storage · {bytes(archive?.receivedBytes??0)} downloaded</summary>
      <section aria-label="Historical archive backfill" className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2.5"><Download aria-hidden="true" className={cn('size-4',receiving?'text-accent':'text-muted')}/><h2 className="text-sm font-semibold">Historical backfill</h2><span className={cn('inline-flex items-center gap-1.5 font-mono text-[9px]',receiving?'text-accent':archive?.state==='complete'?'text-sage':'text-muted')}>{receiving&&<LoaderCircle aria-hidden="true" className="size-3 motion-safe:animate-spin"/>}{error?'Status stale':archive?.state==='active'?'Receiving files':archive?.state==='complete'?'Download complete':archive?.state==='failed'?'Download needs attention':archive?.state==='idle'?'No recent writes':'Not started'}</span></div><p className="font-mono text-[10px] text-muted">{bytes(archive?.receivedBytes??0)} / {bytes(archive?.expectedBytes??0)} <span className="mx-2 text-rule">·</span>{archive?.completedFiles} / {archive?.totalFiles} months</p></div>
        <progress aria-label="Archive bytes downloaded" value={archive?.receivedBytes??0} max={archive?.expectedBytes||1} className="mt-4 block h-1.5 w-full overflow-hidden rounded-full accent-accent"/>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] leading-relaxed text-muted"><span>open-index/hacker-news → local Parquet archive → <span className="text-ink">{data.pipeline.database.partitions.length?`${data.pipeline.database.partitions.length} month scanned`:'month extraction pending'}</span></span><span>Last file write {since(archive?.lastActivityAt??null)}</span></div>
        {!!archive?.files.length&&<details className="mt-3 text-[10px] text-muted"><summary className={cn(controlClass,'w-fit cursor-pointer hover:text-ink')}>{archive.files.length} partial transfers on disk</summary><div className="mt-2 space-y-1 font-mono">{archive.files.map(file=><p key={file.path} className="flex flex-wrap justify-between gap-2"><span>{file.path}</span><span>{bytes(file.bytes)} / {bytes(file.expectedBytes)}</span></p>)}</div></details>}
      </section></details>
      <p className="mb-5 mt-7 text-[10px] text-muted">Activity and proposals below include all runs.</p>
      <div className="flex items-center justify-between gap-3 border-y border-rule">
        <div role="tablist" aria-label="Pipeline output" className="flex gap-6">{([{id:'artifacts',label:`Place proposals (${data.groups.length})`},{id:'activity',label:'Activity log'}] as const).map(item=><button key={item.id} id={`${item.id}-tab`} role="tab" aria-selected={tab===item.id} aria-controls={`${item.id}-panel`} onClick={()=>setTab(item.id)} className={cn(controlClass,'border-b-2 py-3.5 text-xs',tab===item.id?'border-accent font-medium text-ink':'border-transparent text-muted')}>{item.label}</button>)}</div>
        <span className="hidden items-center gap-1.5 font-mono text-[9px] text-muted sm:flex"><Clock3 aria-hidden="true" className="size-3"/>Observed {time(data.pipeline.observedAt)}</span>
      </div>
      {tab==='activity'?<section id="activity-panel" role="tabpanel" aria-labelledby="activity-tab" className="mt-5 overflow-hidden rounded-md bg-ink text-paper">
        <div className="flex items-center gap-2 border-b border-paper/15 px-4 py-3 font-mono text-[10px] text-paper/60"><Terminal aria-hidden="true" className="size-3.5"/>Recent activity <span className="ml-auto">Database and archive timestamps</span></div>
        <ol className="space-y-3 overflow-x-auto px-4 py-5 font-mono text-[10px] leading-[1.8]">{data.pipeline.activity.map(event=><li key={event.id} className="grid gap-x-4 sm:grid-cols-[145px_65px_minmax(0,1fr)]"><time dateTime={event.at} className="text-paper/45">{new Date(event.at).toLocaleDateString()} {time(event.at)}</time><span className="text-[#b5c7a3]">{event.stage}</span><span>{event.message}</span></li>)}</ol>
        {!data.pipeline.activity.length&&<p className="px-4 py-6 text-xs text-paper/60">No activity recorded yet.</p>}
      </section>:<section id="artifacts-panel" role="tabpanel" aria-labelledby="artifacts-tab">
        <div className="my-5 flex flex-wrap items-center gap-4"><label className="flex min-w-[200px] max-w-[480px] flex-1 items-center gap-2 rounded border border-rule px-3 py-2.5 focus-within:border-accent"><Search aria-hidden="true" className="size-4 text-muted"/><span className="sr-only">Search extracted places or authors</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search extracted places or authors…" className="w-full min-w-0 bg-transparent text-xs outline-none"/></label><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={multiple} onChange={event=>setMultiple(event.target.checked)} className="size-3.5 accent-accent"/>Multiple source comments</label><p aria-live="polite" className="ml-auto text-[10px] text-muted">{groups.length} groups · awaiting resolution</p></div>
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_100px_130px] gap-4 border-b border-rule px-2 pb-2 font-mono text-[9px] uppercase tracking-wider text-muted sm:grid"><span>Extracted name</span><span>Location in source</span><span>HN comments</span><span>Next stage</span></div>
        {groups.map((place,index)=><details open={index===0} key={place.id} className="group border-b border-rule open:bg-[#f2efe7]/60">
          <summary className={cn(controlClass,'grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-4 hover:bg-[#f2efe7]/60 sm:grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_100px_130px] sm:gap-4 [&::-webkit-details-marker]:hidden')}>
            <span className="text-[13px] font-medium">{place.name}</span><span className="col-start-1 row-start-2 text-[11px] text-muted sm:col-auto sm:row-auto">{[place.city,place.country].filter(Boolean).join(', ')||'Not extracted'}</span><span className="hidden text-[11px] text-muted sm:inline">{place.sources.length} {place.sources.length===1?'comment':'comments'}</span><span className="row-span-2 flex items-center justify-end gap-2 text-[10px] text-muted sm:row-span-1 sm:justify-between"><span>Resolve place</span><ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180"/></span>
          </summary>
          <div className="space-y-5 px-4 pb-5 sm:pl-6">{place.sources.map(source=><section key={source.commentId} className="max-w-[750px] border-l-2 border-rule pl-4"><p className="text-xs leading-[1.85]">{source.reason}</p>{source.quote&&<blockquote className="mt-2 font-editorial text-base leading-relaxed">“{source.quote}”</blockquote>}<a href={source.url} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline')}>{source.author||'HN community member'} on HN <ArrowUpRight aria-hidden="true" className="size-3"/></a><p className="mt-1 text-[10px] text-muted">{source.date?formatDate(source.date):'Date unavailable'} · {source.confidence} extraction confidence</p></section>)}</div>
        </details>)}
        {!groups.length&&<p role="status" className="py-10 text-center text-xs text-muted">No matching proposals. Try another search or clear the filter.</p>}
        <details className="mt-6 text-xs"><summary className={cn(controlClass,'w-fit cursor-pointer text-muted')}>Label decisions · all {data.sampled} comments</summary><dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">{Object.entries(data.decisions).map(([decision,count])=><div key={decision} className="flex gap-2"><dt className="capitalize text-muted">{decision.replaceAll('-',' ')}</dt><dd>{count}</dd></div>)}</dl></details>
      </section>}
    </>}
  </section>;
}
