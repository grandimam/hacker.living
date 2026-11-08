import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,ArrowUpRight,BookOpen,Clock3,Command,Globe2,Layers,MapPin,Plus} from 'lucide-react';
import type {DiscoveryPage} from '../../shared/catalog';
import type {FontsPage} from '../../shared/fonts';
import type {WebsitesPage} from '../../shared/websites';
import type {Place} from '../types';
import {Photo,SaveButton} from '../components/ui';
import {SourceCount} from '../components/SourceCount';
import {WebsiteCommentsLink} from '../components/WebsiteCommentsLink';
import {cn,controlClass,formatDate} from '../lib';
type Collection='places'|'fonts'|'websites';
type Item={id:string;kind:Collection;name:string;reason:string;date:string;author:string|null;source:string;count:number;href:string;subtitle:string;place?:Place};
const collectionNames={places:'Places',fonts:'Fonts',websites:'Websites'};

function Mountain(){
 const peaks=[[0,155],[55,130],[105,140],[160,105],[205,116],[265,56],[300,75],[335,64],[365,78],[423,28],[465,50],[525,-10],[590,24],[650,5]];
 return <svg aria-hidden="true" viewBox="0 0 650 250" className="pointer-events-none absolute -right-14 bottom-1 hidden h-72 w-[60%] text-accent opacity-65 md:block"><defs><linearGradient id="terrain-fade" x2="0" y2="1"><stop offset="0%" stopColor="white"/><stop offset="95%" stopColor="black"/></linearGradient><mask id="terrain-mask"><rect width="650" height="250" fill="url(#terrain-fade)"/></mask></defs><g mask="url(#terrain-mask)" fill="none" stroke="currentColor" strokeWidth=".65">{Array.from({length:30},(_,i)=><polyline key={i} points={peaks.map(([x,y],p)=>`${x-i*2.7},${y+40+i*3.5+Math.sin(p+i*.3)*i*.8}`).join(' ')}/>)}{Array.from({length:55},(_,i)=>{const x=i*13;return <path key={i} d={`M${x},235 l95,-135 60,130`} opacity=".15"/>;})}</g></svg>;
}
function CollectionArt({kind,place}:{kind:string;place?:Place}){
 if(kind==='places')return place?<Photo place={place}/>:<div className="grid size-full place-items-center bg-[#e5e8dc] text-[#747d63]"><MapPin className="size-12" strokeWidth={1}/></div>;
 if(kind==='fonts')return <div aria-hidden="true" className="flex size-full items-center bg-gradient-to-br from-[#eee8dc] to-[#f7f2e9] px-8 font-editorial text-[92px] leading-none tracking-[-6px]">Aa</div>;
 if(kind==='websites')return <div aria-hidden="true" className="relative size-full overflow-hidden bg-[#ede4d8]"><div className="absolute -right-9 -top-10 size-60 rounded-full bg-gradient-to-br from-orange-400 to-accent"/><div className="absolute -left-12 top-12 h-48 w-96 -rotate-[24deg] rounded-[50%] border-[30px] border-paper/70"/><Globe2 className="absolute bottom-4 right-5 size-10 text-white/80" strokeWidth={1}/></div>;
 if(kind==='books')return <div aria-hidden="true" className="flex size-full items-end justify-end gap-1 bg-[#efe4d6] px-6 pt-4">{['h-16 bg-[#d6c0a5]','h-20 bg-[#aa8b69]','h-24 bg-[#e2cfb5]','h-20 bg-[#4a4d47]','h-28 bg-[#d1ad87]','h-24 bg-[#987254]'].map((c,i)=><div key={i} className={cn('w-7 rounded-t-sm border-l border-white/40 shadow-sm',c)}><span className="mx-auto mt-4 block h-px w-3 bg-white/40"/></div>)}</div>;
 return <div aria-hidden="true" className="flex size-full items-center justify-end gap-3 overflow-hidden bg-[#ece8df] px-6"><div className="mt-16 grid size-28 -rotate-[24deg] place-items-center rounded-2xl border-b-8 border-[#191a19] bg-gradient-to-br from-[#454744] to-[#232522] text-white shadow-xl"><Command className="size-9" strokeWidth={1}/></div><div className="-mt-6 grid size-24 -rotate-[24deg] place-items-center rounded-2xl border-b-8 border-[#191a19] bg-[#363835] text-white shadow-xl"><span className="text-2xl">⌥</span></div></div>;
}
export function Home(){
 const [tab,setTab]=useState<'all'|Collection>('all'),[items,setItems]=useState<Item[]>([]),[totals,setTotals]=useState<Partial<Record<Collection,number>>>({}),[errors,setErrors]=useState<string[]>([]),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{document.title='Worth discovering — hacker.living';let disposed=false,pending=false;const abort=new AbortController();
  const get=async<T,>(url:string):Promise<T>=>{const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw Error('Collection unavailable');return response.json() as Promise<T>;};
  const load=async()=>{if(pending)return;pending=true;
   const results=await Promise.allSettled([get<DiscoveryPage>('/api/discoveries?limit=6&sort=recent'),get<FontsPage>('/api/fonts?limit=6&sort=recent'),get<WebsitesPage>('/api/websites?limit=6&sort=recent')]);if(disposed)return;
   const next:Item[]=[],counts:Partial<Record<Collection,number>>={},failed:string[]=[];
   const [places,fonts,websites]=results;
   if(places.status==='fulfilled'){counts.places=places.value.total;for(const p of places.value.places)next.push({id:p.id,kind:'places',name:p.name,reason:p.reason,date:p.source.date,author:p.source.author,source:p.source.url,count:p.sourceCount??1,href:`/places/${p.id}`,subtitle:p.city,place:p});}else failed.push('Places');
   if(fonts.status==='fulfilled'){counts.fonts=fonts.value.total;for(const f of fonts.value.fonts){const s=f.recommendations[0];if(s)next.push({id:f.id,kind:'fonts',name:f.name,reason:s.reason,date:s.date,author:s.author,source:s.url,count:new Set(f.recommendations.map(r=>r.commentId)).size,href:'/fonts',subtitle:'Typeface'});}}else failed.push('Fonts');
   if(websites.status==='fulfilled'){counts.websites=websites.value.total;for(const w of websites.value.websites){const s=w.recommendations[0];if(s)next.push({id:w.id,kind:'websites',name:w.name,reason:s.reason,date:s.date,author:s.author,source:s.url,count:w.sourceCount,href:`/websites/${w.id}/comments`,subtitle:w.hostname});}}else failed.push('Websites');
   setItems(next.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)));setTotals(counts);setErrors(failed);setLoading(false);pending=false;
  };void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);return()=>{disposed=true;abort.abort();clearInterval(timer);};
 },[revision]);
 const visible=items.filter(i=>tab==='all'||i.kind===tab).slice(0,6),cover=items.find(i=>i.place?.image)?.place;
 const collections=[{id:'places',name:'Places',description:'Museums, libraries, engineering and more.',count:totals.places,href:'/places',unit:'places'},{id:'fonts',name:'Fonts',description:'Typefaces recommended by the community.',count:totals.fonts,href:'/fonts',unit:'typefaces'},{id:'websites',name:'Websites',description:'Websites and blogs admired for their visual design.',count:totals.websites,href:'/websites',unit:'websites'},{id:'books',name:'Books',description:'Books worth reading and recommending.'},{id:'tools',name:'Tools',description:'Useful tools and services shared by the community.'},{id:'more',name:'More',description:'New collections to explore. Hardware, music, and beyond.'}];
 return <div className="mx-auto max-w-[1120px] pb-14">
  <section className="relative overflow-hidden pb-12 pt-12 sm:pb-16 sm:pt-16">
   <Mountain/><div className="relative z-10 max-w-[670px]"><h1 className="font-brand text-[43px] font-semibold leading-[1.07] tracking-[-2px] sm:text-[64px] sm:tracking-[-3px]">Worth discovering.</h1><p className="mt-5 max-w-[530px] text-base leading-relaxed text-ink/75 sm:text-xl">Recommendations found in Hacker News discussions, organized for the curious.</p><div className="mt-7 flex flex-wrap gap-3 sm:gap-5"><a href="#collections" className={cn(controlClass,'inline-flex items-center gap-3 rounded-xl bg-accent px-5 py-3.5 font-medium text-white hover:bg-accent/90')}>Explore collections <ArrowRight className="size-4"/></a><Link to="/about#data-heading" className={cn(controlClass,'inline-flex items-center gap-2 rounded-xl border border-rule px-5 py-3.5 font-medium hover:bg-white')}><BookOpen className="size-4"/> How it works</Link></div></div>
  </section>
  <section id="collections" aria-labelledby="collections-heading" className="scroll-mt-6">
   <div className="mb-5 flex items-center justify-between"><h2 id="collections-heading" className="font-brand text-[28px] font-semibold tracking-[-.8px]">Collections</h2><span className="text-xs text-muted">Curiosity, collected.</span></div>
   <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{collections.map(c=><article key={c.id} className="group relative flex flex-col rounded-[20px] border border-rule/60 p-4 transition-colors hover:border-rule hover:bg-white/30">
    {c.id==='more'?<div className="flex h-[112px] items-start p-1"><div className="grid size-[72px] place-items-center rounded-2xl border border-dashed border-muted/40 text-muted"><Plus className="size-8" strokeWidth={1}/></div></div>:<div className="h-[112px] overflow-hidden rounded-xl"><CollectionArt kind={c.id} place={cover}/></div>}
    <h3 className="mt-3 font-brand text-[23px] font-semibold leading-tight tracking-[-.5px]">{c.href?<Link to={c.href} className={cn(controlClass,"after:absolute after:inset-0 after:rounded-[20px] group-hover:text-accent")}>{c.name}</Link>:c.name}</h3>
    <p className="mb-4 mt-1 max-w-[240px] text-[15px] leading-[1.5] text-ink/75">{c.description}</p>
    <div className="mt-auto flex min-h-7 items-center justify-between text-xs">{c.href?<><span className="flex items-center gap-2 text-ink/75"><Layers className="size-4" strokeWidth={1.5}/>{c.count===undefined?(loading?'Loading…':'Unavailable'):`${c.count.toLocaleString()} ${c.unit}`}</span><ArrowRight className="size-4 text-ink/70"/></>:<span className="inline-flex items-center gap-2 rounded-full bg-ink/[.04] px-3 py-1.5 text-ink/70"><Clock3 className="size-3.5"/>Coming soon</span>}</div>
   </article>)}</div>
  </section>
  <section aria-labelledby="latest-heading" className="mt-12 sm:mt-14">
   <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h2 id="latest-heading" className="font-brand text-[27px] font-semibold tracking-[-.8px]">Latest recommendations</h2><div role="group" aria-label="Recommendation collection" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-rule/50 p-1">{(['all','places','fonts','websites'] as const).map(value=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)} className={cn(controlClass,'rounded-lg px-3 py-2 text-xs',tab===value?'bg-ink text-white shadow-sm':'hover:bg-ink/5')}>{value==='all'?'All':collectionNames[value]}</button>)}</div></div>
   {errors.length>0&&<p role="alert" className="mb-5 rounded-xl bg-accent-soft p-4 text-sm">{errors.join(', ')} could not load. <button className={cn(controlClass,'underline')} onClick={()=>setRevision(v=>v+1)}>Try again</button></p>}
   {loading?<p role="status" className="py-10 text-muted">Gathering recommendations…</p>:visible.length?<div className="divide-y divide-rule/60">{visible.map(item=><article key={`${item.kind}-${item.id}`} className="flex items-start gap-4 py-5 sm:gap-6">
    <Link to={item.href} aria-label={`Explore ${item.name}`} className={cn(controlClass,'hidden h-[112px] w-[185px] shrink-0 overflow-hidden rounded-xl sm:block')}>{item.place?<Photo place={item.place}/>:<CollectionArt kind={item.kind}/>}</Link>
    <div className="min-w-0 flex-1"><p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">{collectionNames[item.kind]}</p><h3 className="font-brand text-lg font-semibold leading-tight tracking-[-.4px] sm:text-xl"><Link to={item.href} className={cn(controlClass,'hover:text-accent')}>{item.name}</Link></h3><p className="mt-2 flex items-center gap-1 text-xs text-ink/80">{item.kind==='places'&&<MapPin className="size-3"/>}{item.subtitle}</p><p className="mt-2 text-sm leading-relaxed text-ink/80">{item.reason}</p><a href={item.source} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'mt-2 inline-block text-[11px] text-muted hover:text-accent')}>Shared by {item.author??'an HN member'} · {formatDate(item.date)}</a></div>
    <div className="flex shrink-0 flex-col items-end gap-3 sm:flex-row sm:items-center"><>{item.kind==='websites'?<WebsiteCommentsLink id={item.id} name={item.name} count={item.count}/>:<a href={item.source} target="_blank" rel="noopener noreferrer" className={controlClass}><SourceCount count={item.count}/></a>}</>{item.place&&<SaveButton place={item.place}/>}<Link to={item.href} aria-label={`Explore ${item.name}`} className={cn(controlClass,'p-1')}><ArrowUpRight className="size-5" strokeWidth={1.5}/></Link></div>
   </article>)}</div>:<div className="rounded-2xl border border-dashed border-rule p-10 text-center"><Globe2 className="mx-auto mb-3 size-7 text-accent"/><h3 className="text-lg font-medium">The next discovery is on its way.</h3><p className="mt-2 text-sm text-muted">Recommendations appear here as saved comments are processed.</p></div>}
   <div className="mt-6 flex flex-wrap justify-center gap-3">{(tab==='all'?['places','fonts','websites'] as const:[tab]).map(kind=><Link key={kind} to={`/${kind}`} className={cn(controlClass,'inline-flex items-center gap-3 rounded-full border border-rule/60 px-5 py-2.5 text-xs hover:bg-white')}>Explore {collectionNames[kind]} <ArrowRight className="size-3.5"/></Link>)}</div>
   <p className="mt-7 text-center text-[11px] leading-relaxed text-muted">Research previews · Recent HN recommendation dates · Source counts are distinct comments, not votes.</p>
  </section>
 </div>;
}
