import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {ArrowUpRight,Type,Layers,Code2,Terminal,BookOpen,PanelsTopLeft,Paintbrush,Sigma,Ellipsis} from 'lucide-react';
import type {FontsPage,FontFamily} from '../../shared/fonts';
import {fontContexts} from '../../shared/fonts';
import {cn,controlClass,secondaryClass} from '../lib';
import {SourceCount} from '../components/SourceCount';
import {ProcessingMetrics} from '../components/ProcessingMetrics';
const contextIcons={all:Layers,code:Code2,terminal:Terminal,reading:BookOpen,ui:PanelsTopLeft,design:Paintbrush,math:Sigma,other:Ellipsis};
const contexts={all:'All fonts',code:'Code',terminal:'Terminal',reading:'Reading',ui:'Interface',design:'Design',math:'Math',other:'Other'};

export default function Fonts(){
 const [params,setParams]=useSearchParams(),raw=params.get('context')??'all',context=fontContexts.includes(raw as typeof fontContexts[number])?raw:'all';
 const [fonts,setFonts]=useState<FontFamily[]>([]),[total,setTotal]=useState(0),[pages,setPages]=useState(1),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{document.title='Fonts shared on Hacker News — hacker.living';let disposed=false,pending=false;const controller=new AbortController();
  const poll=async()=>{if(pending)return;pending=true;setRefreshing(true);try{
   const data=await Promise.all(Array.from({length:pages},async(_,index)=>{
    const query=new URLSearchParams({limit:'60',offset:String(index*60)});if(context!=='all')query.set('context',context);
    const response=await fetch(`/api/fonts?${query}`,{signal:controller.signal});if(!response.ok)throw Error('Fonts could not load. Try again shortly.');return response.json() as Promise<FontsPage>;
   }));
   if(!disposed){setFonts([...new Map(data.flatMap(p=>p.fonts).map(f=>[f.id,f])).values()]);setTotal(data[0].total);setError('');}
  }catch(error){if(!disposed)setError(error instanceof Error?error.message:String(error));}finally{pending=false;if(!disposed){setLoading(false);setRefreshing(false);}}};
  void poll();const timer=setInterval(()=>{if(document.visibilityState==='visible')void poll();},30000);return()=>{disposed=true;controller.abort();clearInterval(timer);};
 },[context,pages,revision]);
 return <section className="py-5 sm:py-7">
  <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-wider text-accent">From the Hacker News community</p><h1 className="mt-3 font-editorial text-[42px] leading-tight sm:text-[56px]">Fonts people come back to.</h1><p className="mt-4 max-w-2xl text-xs leading-[1.85] text-muted">Typefaces recommended for everyday work. Discover why someone prefers a font, where they use it, and the conversation behind it.</p></div></div>
  <div className="mt-8 grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-7 xl:grid-cols-[200px_minmax(0,1fr)]">
   <aside aria-label="Font filters" className="min-w-0 lg:border-r lg:border-rule lg:pr-5">
    <div className="lg:sticky lg:top-6"><h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[.12em] text-muted">Browse by use</h2>
     <div role="group" aria-label="Font use" className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{Object.entries(contexts).map(([value,label])=>{const Icon=contextIcons[value as keyof typeof contextIcons];return <button key={value} aria-pressed={context===value} onClick={()=>{if(context===value)return;setPages(1);setFonts([]);setLoading(true);const next=new URLSearchParams();if(value!=='all')next.set('context',value);setParams(next,{replace:true});}} className={cn(controlClass,'relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-3 text-left text-xs transition-colors',context===value?'bg-accent-soft font-semibold text-accent before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent':'text-muted hover:bg-ink/5 hover:text-ink')}><Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5}/>{label}</button>;})}</div>
     <p className="mt-5 hidden border-t border-rule pt-4 text-[10px] leading-relaxed text-muted lg:block">Recommendations from individual HN members.</p>
    </div>
   </aside>
   <div className="min-w-0">
  <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 aria-live="polite" className="text-sm font-semibold">{total} {total===1?'typeface':'typefaces'}{context!=='all'&&` for ${contexts[context as keyof typeof contexts].toLocaleLowerCase()}`}</h2><p className="text-[10px] text-muted">Recommendation catalog · font files and licenses await verification</p></div>
  {error&&<div role="alert" className="mb-5 rounded border border-accent/30 bg-accent-soft p-4 text-xs">{error}<button onClick={()=>setRevision(v=>v+1)} className={cn(controlClass,'ml-3 underline')}>Try again</button></div>}
  {loading?<p role="status" className="py-20 text-center font-editorial text-2xl">Gathering typefaces…</p>:<div className="grid gap-4 pb-8 md:grid-cols-2 xl:grid-cols-3">{fonts.map(font=><article key={font.id} className="flex min-w-0 flex-col rounded-md border border-rule bg-white/20 p-6">
   <div className="flex items-center justify-between gap-3 text-muted"><span aria-hidden="true" className="grid size-9 place-items-center rounded-md bg-ink/5 font-editorial text-xl text-ink">Aa</span><SourceCount count={new Set(font.recommendations.map(source=>source.commentId)).size}/></div>
   <h3 className="mt-6 break-words font-brand text-[26px] font-semibold leading-tight tracking-[-.6px]">{font.name}</h3>
   <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1">{[...new Set(font.recommendations.flatMap(r=>r.contexts))].map(use=><span key={use} className="text-[9px] font-semibold uppercase tracking-wide text-muted">{contexts[use as keyof typeof contexts]??use}</span>)}</div>
   <p className="mt-4 text-xs leading-[1.85]">{font.recommendations[0]?.reason}</p>

   {font.recommendations[0]&&<a href={font.recommendations[0].url} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'mt-auto inline-flex w-fit items-center gap-1 pt-5 text-[10px] text-muted hover:text-accent')}>Original HN source<ArrowUpRight aria-hidden="true" className="size-3"/></a>}
  </article>)}</div>}
  {!loading&&!fonts.length&&!error&&<div className="mx-auto max-w-md py-14 text-center"><Type className="mx-auto size-8 text-muted"/><h2 className="mt-5 font-editorial text-3xl">More typefaces on the way.</h2><p className="mt-3 text-xs leading-relaxed text-muted">Explore another category to see recommendations already collected from HN comments.</p></div>}
  {fonts.length<total&&<button disabled={refreshing} onClick={()=>setPages(v=>v+1)} className={cn(secondaryClass,'mb-8')}>{refreshing?'Loading…':`Load more (${fonts.length} of ${total})`}</button>}
   </div>
  </div>
  <ProcessingMetrics/>
  <p className="border-t border-rule py-4 text-[10px] leading-relaxed text-muted">Recommendations belong to individual community members. Names use this site’s typography; verified font specimens will follow.</p>
 </section>;
}
