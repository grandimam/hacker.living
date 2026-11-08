import {useEffect,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import {ArrowRight,ArrowUpRight,Globe2,Search,Activity} from 'lucide-react';
import type {Website,WebsitesPage} from '../../shared/websites';
import {WebsiteCommentsLink} from '../components/WebsiteCommentsLink';
import {useWebsiteCollectionView} from '../website-navigation';
import {cn,controlClass} from '../lib';
export default function Websites(){
 const location=useLocation();
 // Each history entry owns its loaded pages and scroll restoration.
 return <WebsiteCollection key={location.key}/>;
}
function WebsiteCollection(){
 const [params,setParams]=useSearchParams(),q=params.get('q')??'',sort=params.get('sort')??'recent';
 const [input,setInput]=useState(q),[websites,setWebsites]=useState<Website[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const {pages,setPages,remember,returnState}=useWebsiteCollectionView(loading);
 useEffect(()=>setInput(q),[q]);
 useEffect(()=>{if(!loading&&location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView();},[loading]);
 useEffect(()=>{document.title='Websites recommended on HN — hacker.living';let disposed=false,pending=false;const abort=new AbortController();
  const load=async()=>{if(pending)return;pending=true;setBusy(true);try{
   const results=await Promise.all(Array.from({length:pages},async(_,i)=>{const query=new URLSearchParams({q,sort,limit:'40',offset:String(i*40)}),response=await fetch(`/api/websites?${query}`,{signal:abort.signal});if(!response.ok)throw Error('Websites could not load. Try again shortly.');return response.json() as Promise<WebsitesPage>;}));
   if(!disposed){setWebsites([...new Map(results.flatMap(p=>p.websites).map(w=>[w.id,w])).values()]);setTotal(results[0].total);setError('');}
  }catch(e){if(!disposed)setError(e instanceof Error?e.message:String(e));}finally{pending=false;if(!disposed){setLoading(false);setBusy(false);}}};
  void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},15000);return()=>{disposed=true;abort.abort();clearInterval(timer);};
 },[q,sort,pages,revision]);
 return <section className="mx-auto max-w-[1120px] py-10 sm:py-14">
  <div className="flex flex-wrap items-start justify-between gap-6"><div><Link to="/#collections" className={cn(controlClass,'text-xs text-muted hover:text-accent')}>Discover / Collections</Link><h1 className="mt-4 font-brand text-[44px] font-semibold leading-tight tracking-[-2px] sm:text-[58px]">A beautiful corner of the web.</h1><p className="mt-4 max-w-xl text-base leading-relaxed text-ink/70">Websites and blogs praised for their visual design by people on Hacker News.</p></div><Link to="/pipeline/websites" className={cn(controlClass,'inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2.5 text-xs hover:bg-white')}><Activity className="size-4"/>View pipeline<ArrowRight className="size-3.5"/></Link></div>
  <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-rule/60 p-3"><form className="flex min-w-0 flex-1 items-center gap-3" onSubmit={e=>{e.preventDefault();setParams({q:input,sort});}}><Search className="ml-2 size-4 shrink-0 text-muted"/><input aria-label="Search websites" maxLength={300} placeholder="Search names or domains…" value={input} onChange={e=>setInput(e.target.value)} className={cn(controlClass,'min-w-0 flex-1 bg-transparent py-2 text-sm outline-none')}/><button className={cn(controlClass,'rounded-lg bg-ink px-4 py-2 text-xs text-white')}>Search</button></form><select aria-label="Sort websites" value={sort} onChange={e=>{setParams({q,sort:e.target.value});}} className={cn(controlClass,'rounded-lg border border-rule/60 bg-paper px-3 py-2 text-xs')}><option value="recent">Latest HN recommendations</option><option value="sources">Most HN sources</option><option value="name">A–Z</option></select></div>
  <div className="mb-5 mt-6 flex flex-wrap items-center justify-between gap-2"><p aria-live="polite" className="text-sm font-medium">{total.toLocaleString()} {total===1?'website':'websites'}</p><span className="text-xs text-muted">Draft collection · Links have not been checked</span></div>
  {error&&<p role="alert" className="mb-5 rounded-xl bg-accent-soft p-4 text-sm">{error} <button className={cn(controlClass,'underline')} onClick={()=>setRevision(v=>v+1)}>Try again</button></p>}
  {loading?<p role="status" className="py-16 text-center text-muted">Gathering websites…</p>:websites.length?<div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">{websites.map(w=><article id={`website-${w.id}`} key={w.id} className="scroll-mt-8 rounded-2xl border border-rule/60 p-6 target:border-accent">
   <div className="flex items-center justify-between gap-3"><div aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><Globe2 className="size-6" strokeWidth={1.3}/></div><WebsiteCommentsLink id={w.id} name={w.name} count={w.sourceCount} state={returnState} onClick={remember}/></div>
   <h2 className="mt-5 break-words font-brand text-[23px] font-semibold leading-tight tracking-[-.5px]"><a href={w.url} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'hover:text-accent')}>{w.name}<ArrowUpRight className="ml-1 inline size-4"/></a></h2><p className="mt-2 break-all text-xs text-muted">{w.hostname}</p><div className="mt-3 flex flex-wrap gap-1.5">{w.recommendations[0]?.appeal.map(a=><span key={a} className="rounded-full bg-ink/5 px-2 py-1 text-[10px] capitalize text-muted">{a.replaceAll('-',' ')}</span>)}</div><p className="mt-4 text-sm leading-relaxed text-ink/80">{w.recommendations[0]?.reason}</p>
  </article>)}</div>:!error&&<div className="rounded-2xl border border-dashed border-rule py-16 text-center"><Globe2 className="mx-auto size-9 text-accent"/><h2 className="mt-5 font-brand text-2xl font-medium">{q?'No websites match that search.':'The first discoveries are on their way.'}</h2><p className="mx-auto mt-3 max-w-md px-5 text-sm leading-relaxed text-muted">{q?'Try a different name or domain.':'We’re extracting recommendations from the comments already saved. New results appear here as they’re processed.'}</p><Link to="/pipeline/websites" className={cn(controlClass,'mt-5 inline-flex items-center gap-2 text-sm text-accent')}>Follow the progress<ArrowRight className="size-4"/></Link></div>}
  {websites.length<total&&<div className="mt-8 text-center"><button disabled={busy} onClick={()=>setPages(v=>v+1)} className={cn(controlClass,'rounded-full border border-rule px-6 py-3 text-sm disabled:opacity-50')}>{busy?'Loading…':`Load more (${websites.length} of ${total})`}</button></div>}
  <p className="mt-9 text-xs leading-relaxed text-muted">Recommendations belong to individual HN members. Descriptions are paraphrases. Open the HN comments to read the source excerpts and attribution. Comment counts measure distinct sources, not votes or community consensus. Websites are extracted from source links and have not been visited or independently verified.</p>
 </section>;
}
