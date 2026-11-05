import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Globe2, List, Map as MapIcon } from 'lucide-react';
import { useApp } from '../context';
import type { Bounds } from '../types';
import { filterPlaces } from '../../shared/domain.ts';
import { cn, controlClass, secondaryClass } from '../lib';
import { PlacesMap, type MapHandle } from '../components/PlacesMap';
import { PlaceCard } from '../components/PlaceCard';
import { ProcessingMetrics } from '../components/ProcessingMetrics';
import { SourceCount } from '../components/SourceCount';
import { PlaceDetail } from '../components/PlaceDetail';

export function Places() {
  const { places, total, hasMore, loadMore, refreshing, unlocated, categories: availableCategories } = useApp();
  const { placeId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort')==='name'?'name':'curated';
  const [listOnly, setListOnly] = useState(() => window.innerWidth < 768);
  const [previewId, setPreviewId] = useState<string | undefined>();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const map = useRef<MapHandle>(null);
  const selectedId = placeId || previewId;
  const routePlace = places.find(p => p.id === placeId);
  const categories = useMemo(() => {
    const order = ['Museums', 'Engineering', 'Libraries', 'Observatories', 'Computing', 'Science'];
    return order.filter(category => availableCategories.includes(category));
  }, [availableCategories]);
  const cities = useMemo(() => [...new Set(places.map(p => p.city))], [places]);
  const query = params.get('q') || '';
  const rawCategory = params.get('category') || 'all';
  const category = categories.includes(rawCategory) ? rawCategory : 'all';
  const rawRegion = params.get('city') || 'all';
  const region = cities.includes(rawRegion) ? rawRegion : 'all';
  const filtered = useMemo(() => filterPlaces(places, { query, category, region, bounds, sort }), [places, query, category, region, bounds, sort]);
  const orderedUnlocated = useMemo(() => [...unlocated].sort((a,b) => (sort==='curated'?(b.sourceCount??1)-(a.sourceCount??1):0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), [unlocated,sort]);
  const selected = filtered.find(p => p.id === selectedId);
  const fitKey = JSON.stringify([query, category, region]);
  const search = params.size ? '?' + params.toString() : '';
  const base = pathname === '/' ? '/' : '/places';

  useEffect(() => {
    document.title = `${routePlace?.name || 'Places recommended by people on Hacker News'} — hacker.living`;
    if (routePlace) setListOnly(false);
  }, [routePlace]);

  const close = useCallback(() => {
    setPreviewId(undefined);
    if (placeId) navigate(`/places${search}`, { replace: true });
  }, [navigate, search, placeId]);

  const changeFilters = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    if (!next.has('city')) next.set('city', region);
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    setPreviewId(undefined); setBounds(null);
    if (placeId) navigate(`/places?${next}`, { replace: true });
    else setParams(next, { replace: true });
  };

  const reset = () => { setPreviewId(undefined); setBounds(null); navigate(`${base}?city=all`, { replace: true }); };

  return <>
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5 sm:py-6">
      <h1 className="max-w-3xl text-xs font-normal leading-[1.85] text-muted">Places recommended by people on Hacker News.</h1>
      <span className="text-[10px] text-muted">Preliminary research</span>
    </div>
    <section aria-label="Explore places">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-rule">
        <div role="group" aria-label="Place category" className="flex min-w-0 basis-full gap-5 overflow-x-auto sm:basis-auto sm:flex-1 sm:gap-6">{['all', ...categories].map(c => <button key={c} aria-pressed={category === c} onClick={() => changeFilters({ category: c === 'all' ? '' : c })} className={cn(controlClass, 'min-h-12 shrink-0 whitespace-nowrap border-b-2 px-0.5 py-3 text-[11px] transition-colors hover:text-ink', category === c ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted')}>{c === 'all' ? 'All places' : c}</button>)}</div>
        <div role="group" aria-label="View" className="mb-3 flex shrink-0 overflow-hidden rounded-md border border-rule sm:mb-0">{[{label:'Map', icon:MapIcon, active:!listOnly}, {label:'List', icon:List, active:listOnly}].map(({label,icon:Icon,active}) => <button key={label} aria-label={label === 'Map' ? 'Map and list' : 'List only'} aria-pressed={active} onClick={() => { if(label === 'List') { close(); setListOnly(true); } else setListOnly(false); }} className={cn(controlClass, 'flex items-center gap-2 px-3 py-2 text-[11px] first:border-r first:border-rule', active && 'bg-ink font-medium text-white')}><Icon className="size-4" strokeWidth={1.5}/>{label}</button>)}</div>
      </div>
      {placeId && !routePlace && <p role="status" className="bg-accent-soft px-4 py-3 text-xs">That place isn’t in this collection yet. Browse the recommendations below.</p>}
      {(bounds || query) && <div className="flex items-center justify-between border-b border-rule py-2.5 text-[10px] text-muted">{bounds ? 'Places in the visible map' : `Results for “${query}”`}<button className={cn(controlClass, 'text-accent underline')} onClick={reset}>Clear filters ×</button></div>}
      <div className={cn('flex flex-col-reverse md:grid md:h-[max(540px,calc(100dvh-285px))] md:grid-cols-[minmax(300px,38%)_minmax(0,1fr)] lg:grid-cols-[minmax(350px,34%)_minmax(0,1fr)]', listOnly && 'md:block md:h-auto md:min-h-[450px]')}>
        <aside aria-label="Place recommendations" className="flex min-h-0 flex-col md:border-r md:border-rule">
          <div className="flex items-start justify-between gap-2 px-4 py-5 sm:px-5"><div><h2 aria-live="polite" className="text-base font-semibold leading-snug tracking-[-.2px]">{filtered.length+unlocated.length} {filtered.length+unlocated.length === 1 ? 'place' : 'places'}{region === 'all' ? '' : ` in ${region}`} </h2><p className="mt-1.5 text-[11px] text-muted">{filtered.length} with map pins{unlocated.length>0&&` · ${unlocated.length} awaiting a location`}.</p></div><label><span className="sr-only">Sort places</span><select value={sort} onChange={e => { const next=new URLSearchParams(params);next.set('sort',e.target.value);setParams(next,{replace:true}); }} className={cn(controlClass, 'max-w-[100px] rounded-[4px] border border-rule bg-transparent px-2 py-1.5 text-[10px]')}><option value="curated">Top</option><option value="name">A–Z</option></select></label></div>
          <div className={cn('min-h-0 flex-1 overscroll-contain md:overflow-y-auto', listOnly && 'grid md:grid-cols-2 md:overflow-visible 2xl:grid-cols-3 [&>article]:border-r [&>article]:border-rule')}>{filtered.length ? filtered.map((p,index) => <PlaceCard number={index+1} key={p.id} place={p} selected={selected?.id === p.id} search={search}/>) : !unlocated.length&&<div className="col-span-full mx-auto max-w-md px-6 py-14 text-center"><MapIcon className="mx-auto mb-5 size-8 text-accent" strokeWidth={1.2}/><h2 className="font-editorial text-[33px] leading-none">Nothing here just yet.</h2><p className="mb-5 mt-4 text-xs leading-[1.8] text-muted">Move the map or choose another category to explore more community recommendations.</p><button className={secondaryClass} onClick={reset}>Explore all places</button></div>}{orderedUnlocated.map(place=><article key={place.id} className="border-t border-rule px-5 py-5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-muted">Location pending · not on the map</span><SourceCount count={place.sourceCount??1}/></div><h3 className="mt-2 text-base font-semibold">{place.name}</h3><p className="mt-2 text-xs leading-relaxed">{place.reason}</p><a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'mt-3 inline-block text-[11px] text-accent')}>Original HN source ↗</a>{place.officialUrl&&<a href={place.officialUrl} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'ml-4 mt-3 inline-block text-[11px] text-accent')}>Website ↗</a>}</article>)}</div>
          {hasMore&&<button disabled={refreshing} onClick={loadMore} className={cn(secondaryClass,'m-4')}>Load more ({places.length} of {total})</button>}

        </aside>
        {!listOnly && <div className="relative isolate h-[400px] border-b border-rule bg-[#e6e8dd] md:h-auto md:min-h-0 md:border-b-0"><PlacesMap ref={map} places={filtered} selected={selected?.id} fitKey={fitKey} fitToResults={!bounds} focusSelection={Boolean(placeId)} onSelect={id => navigate(`/places/${id}${search}`)}/><button onClick={() => setBounds(map.current?.bounds() || null)} className={cn(secondaryClass, 'absolute left-1/2 top-4 z-[500] min-h-8 -translate-x-1/2 gap-2 whitespace-nowrap rounded-[5px] border-[#c3c6b8] px-3 py-2 text-[10px] shadow-sm')}><MapIcon className="size-3.5"/>Show places here</button><button onClick={reset} className={cn(secondaryClass, 'absolute right-3 top-[60px] z-[500] min-h-7 gap-1.5 px-2 py-1.5 text-[9px] shadow-sm')}><Globe2 className="size-3"/>Show all places</button>{selected && <PlaceDetail place={selected} onClose={close} autoFocus={Boolean(placeId)}/>}</div>}
      </div>
    </section>
    <ProcessingMetrics/>

  </>;
}
