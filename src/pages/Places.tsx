import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Globe2, List, LocateFixed, Map as MapIcon, Search, X } from 'lucide-react';
import { useApp } from '../context';
import type { Bounds, Coordinates } from '../types';
import { distanceKm, filterPlaces } from '../../shared/domain.mjs';
import { cn, controlClass, secondaryClass } from '../lib';
import { CategoryIcon, Eyebrow, IconButton, LiveDot } from '../components/ui';
import { PlacesMap, type MapHandle } from '../components/PlacesMap';
import { PlaceCard } from '../components/PlaceCard';
import { PlaceDetail } from '../components/PlaceDetail';

export function Places() {
  const {places,notify}=useApp();const {placeId}=useParams();const navigate=useNavigate();
  const [params,setParams]=useSearchParams();
  const [sort,setSort]=useState('curated');const[listOnly,setListOnly]=useState(false);const[origin,setOrigin]=useState<Coordinates|null>(null);const[bounds,setBounds]=useState<Bounds|null>(null);const[locating,setLocating]=useState(false);
  const map=useRef<MapHandle>(null);const mounted=useRef(true);
  const selected=places.find(p=>p.id===placeId);
  const categories=useMemo(()=>[...new Set(places.map(p=>p.category))],[places]);
  const cities=useMemo(()=>[...new Set(places.map(p=>p.city))],[places]);
  const query=params.get('q')||'';
  const rawCategory=params.get('category')||'all';const category=categories.some(c=>c===rawCategory)?rawCategory:'all';
  const rawRegion=params.get('city')||(query?'all':selected?.city||'London');const region=cities.includes(rawRegion)?rawRegion:'all';
  const filtered=useMemo(()=>filterPlaces(places,{query,category,region,origin,bounds,sort}),[places,query,category,region,origin,bounds,sort]);
  const fitKey=JSON.stringify([query,category,region,origin]);
  const search=params.size?'?'+params.toString():'';
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{document.title=`${selected?.name||'Places worth a detour'} — hacker.living`;if(selected)setListOnly(false);},[selected]);
  const close=useCallback(()=>navigate(`/places${search}`,{replace:true}),[navigate,search]);
  const changeFilters=(changes:Record<string,string>)=>{
    const next=new URLSearchParams(params);if(!next.has('city'))next.set('city',region);
    Object.entries(changes).forEach(([key,value])=>{if(value)next.set(key,value);else next.delete(key);});
    setOrigin(null);setBounds(null);
    if(placeId)navigate(`/places?${next}`,{replace:true});else setParams(next,{replace:true});
  };
  const reset=()=>{setOrigin(null);setBounds(null);navigate('/places?city=all',{replace:true});};
  const locate=()=>{
    if(!navigator.geolocation){notify('Location is unavailable. Search for your city instead.');return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position=>{
      if(!mounted.current)return;
      const coordinates:Coordinates=[position.coords.latitude,position.coords.longitude];setLocating(false);setOrigin(coordinates);setBounds(null);navigate(`/places?city=all${category!=='all'?'&category='+category:''}`,{replace:true});
      if(!filterPlaces(places,{origin:coordinates,radius:100,category}).length)map.current?.center(coordinates,9);
    },error=>{if(!mounted.current)return;setLocating(false);notify(error.code===1?'Location access was declined. You can search for a city instead.':'Couldn’t find your location. Search for a city instead.');},{timeout:10000,maximumAge:300000,enableHighAccuracy:false});
  };
  return <>
    <section className="flex items-center justify-between py-7 lg:pb-7 lg:pt-9"><div><Eyebrow>01 / The places collection</Eyebrow><h1 className="mb-3 mt-2 font-editorial text-[49px] leading-none tracking-[-1.6px] lg:text-[60px]">Worth the detour<span className="text-accent">.</span></h1><p className="text-[11px] text-muted sm:text-xs">Interesting places, recommended by curious people.</p></div><div className="hidden text-right text-[10px] md:block"><span className="mr-1.5"><LiveDot/></span>{places.length} hand-checked places<span className="mt-2 block font-mono text-[8px] text-muted">A small collection. A world to explore.</span></div></section>
    <section aria-label="Explore places" className="mb-3 overflow-hidden rounded-[5px] border border-rule">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-[#fcfbf7] p-3 md:flex-nowrap md:gap-3 md:px-4"><form onSubmit={e=>e.preventDefault()} className="flex flex-[1_1_calc(100%-100px)] items-center gap-2 md:flex-1"><Search aria-hidden="true" className="size-[17px] shrink-0 text-muted" strokeWidth={1.5}/><label className="sr-only" htmlFor="place-search">Search by place, city, or interest</label><input id="place-search" className="h-8 w-full min-w-0 bg-transparent text-[11px] outline-none focus:placeholder:text-accent/60" placeholder="Find a place, city, or curiosity…" value={query} onChange={e=>changeFilters({q:e.target.value})}/>{query&&<IconButton className="size-6" aria-label="Clear search" onClick={()=>changeFilters({q:''})}><X className="size-3.5"/></IconButton>}</form><button disabled={locating} onClick={locate} className={cn(secondaryClass,'min-h-8 whitespace-nowrap px-2.5 py-2 text-[10px]')}><LocateFixed className="size-3.5"/>{locating?'Locating…':'Near me'}</button><label className="mr-auto flex items-center gap-1.5 md:ml-auto md:mr-0 md:border-r md:border-rule md:px-2"><Globe2 aria-hidden="true" className="size-3.5 text-muted"/><span className="sr-only">Location</span><select aria-label="Location" className={cn(controlClass,'max-w-40 bg-transparent py-1 text-[11px]')} value={region} onChange={e=>changeFilters({city:e.target.value})}><option value="all">Everywhere</option>{cities.map(c=><option key={c}>{c}</option>)}</select></label><div role="group" aria-label="View" className="flex gap-0.5"><IconButton aria-label="Map and list" aria-pressed={!listOnly} className={cn('size-8',!listOnly&&'border-rule bg-[#ebeae2]')} onClick={()=>setListOnly(false)}><MapIcon className="size-4"/></IconButton><IconButton aria-label="List only" aria-pressed={listOnly} className={cn('size-8',listOnly&&'border-rule bg-[#ebeae2]')} onClick={()=>{if(selected)close();setListOnly(true);}}><List className="size-4"/></IconButton></div></div>
      <div role="group" aria-label="Place category" className="flex gap-2 overflow-x-auto border-b border-rule px-3 py-3 md:px-4">{['all',...categories].map(c=><button key={c} aria-pressed={category===c} onClick={()=>changeFilters({category:c==='all'?'':c})} className={cn(controlClass,'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-rule px-3 py-1.5 text-[10px] transition-colors hover:border-accent hover:text-accent',category===c&&'border-accent bg-accent text-white hover:text-white')}>{c!=='all'&&<CategoryIcon category={c as typeof categories[number]} className="size-3"/>}{c==='all'?'All places':c}</button>)}</div>
      {placeId&&!selected&&<p role="status" className="bg-accent-soft px-4 py-3 text-xs">That place isn’t in this collection yet. Browse the recommendations below.</p>}
      <div className={cn('flex flex-col-reverse md:grid md:h-[min(760px,calc(100dvh-280px))] md:min-h-[580px] md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[365px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]',listOnly&&'md:block md:h-auto md:min-h-[450px]')}>
        <aside aria-label="Place recommendations" className={cn('flex min-h-0 flex-col bg-paper md:border-r md:border-rule',listOnly&&'md:border-r-0')}><div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3.5 text-[10px]"><span aria-live="polite" className="font-semibold">{filtered.length} {filtered.length===1?'place':'places'}{region==='all'?' to discover':` in ${region}`}</span><label><span className="sr-only">Sort places</span><select value={sort} onChange={e=>setSort(e.target.value)} className={cn(controlClass,'max-w-28 bg-transparent text-[9px] text-muted')}><option value="curated">Curated order</option><option value="name">Name A–Z</option><option value="recent">Latest mention</option></select></label></div>{(origin||bounds)&&<div className="flex items-center justify-between bg-accent-soft px-4 py-2.5 text-[10px]">{origin?'Within 100 km of you':'Searching the visible map'}<button className={cn(controlClass,'text-accent underline')} onClick={()=>{setOrigin(null);setBounds(null);map.current?.fit(filterPlaces(places,{query,category,region}));}}>Clear ×</button></div>}
          <div className={cn('flex-1 overscroll-contain md:overflow-y-auto',listOnly&&'grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3 [&>article]:border-r [&>article]:border-rule')}>{filtered.length?filtered.map(p=><PlaceCard key={p.id} place={p} selected={p.id===placeId} search={search} distance={origin?distanceKm(origin,p.coordinates):undefined}/>):<div className="col-span-full mx-auto max-w-md px-6 py-14 text-center"><Search className="mx-auto mb-5 size-8 text-accent" strokeWidth={1.2}/><h2 className="font-editorial text-[33px] leading-none">Nothing here just yet.</h2><p className="mb-5 mt-4 text-xs leading-[1.8] text-muted">{origin?'This small collection has no places within 100 km of you yet. Explore the whole collection instead.':'Try another city, interest, or category. We’re starting small and adding thoughtfully.'}</p><button className={secondaryClass} onClick={reset}>Explore all places</button></div>}</div>
          <div className="flex items-center gap-1.5 border-t border-rule px-4 py-3 text-[8px] text-muted"><Check className="size-3 text-sage"/>Every place links to a real HN recommendation.</div>
        </aside>
        {!listOnly&&<div className="relative isolate h-[350px] border-b border-rule bg-[#e6e8dd] md:h-auto md:min-h-0 md:border-b-0"><PlacesMap ref={map} places={filtered} selected={placeId} fitKey={fitKey} onSelect={id=>navigate(`/places/${id}${search}`)}/><div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex justify-between gap-2"><button onClick={()=>setBounds(map.current?.bounds()||null)} className={cn(secondaryClass,'pointer-events-auto min-h-8 gap-1.5 border-[#c3c6b8] px-2.5 py-2 text-[9px] shadow-sm')}><Search className="size-3"/>Search this area</button><button onClick={reset} className={cn(secondaryClass,'pointer-events-auto min-h-8 gap-1.5 border-[#c3c6b8] px-2.5 py-2 text-[9px] shadow-sm')}><Globe2 className="size-3"/>Show all</button></div><div className="absolute bottom-4 left-3 z-[500] flex items-center gap-1.5 rounded border border-rule bg-paper/95 px-2.5 py-2 text-[8px]"><LiveDot/>Recommended on Hacker News</div>{selected&&<PlaceDetail place={selected} onClose={close}/>}</div>}
      </div>
    </section>
  </>;
}
