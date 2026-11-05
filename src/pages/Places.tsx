import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Globe2, Info, List, LocateFixed, Map as MapIcon, Search, X } from 'lucide-react';
import { useApp } from '../context';
import type { Bounds, Coordinates } from '../types';
import { distanceKm, filterPlaces } from '../../shared/domain.ts';
import { cn, controlClass, buttonClass, secondaryClass } from '../lib';
import { curatedOrder } from '../place-presentation';
import { IconButton } from '../components/ui';
import { PlacesMap, type MapHandle } from '../components/PlacesMap';
import { PlaceCard } from '../components/PlaceCard';
import { PlaceDetail } from '../components/PlaceDetail';

export function Places() {
  const { places, notify } = useApp();
  const { placeId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState('curated');
  const [listOnly, setListOnly] = useState(() => window.innerWidth < 768);
  const [previewId, setPreviewId] = useState<string | undefined>(() => window.innerWidth >= 1024 ? 'crossness' : undefined);
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [locating, setLocating] = useState(false);
  const map = useRef<MapHandle>(null);
  const mounted = useRef(true);
  const selectedId = placeId || previewId;
  const routePlace = places.find(p => p.id === placeId);
  const orderedPlaces = useMemo(() => curatedOrder(places), [places]);
  const categories = useMemo(() => {
    const order = ['Museums', 'Engineering', 'Libraries', 'Observatories', 'Computing', 'Science'];
    return order.filter(category => places.some(p => p.category === category));
  }, [places]);
  const cities = useMemo(() => [...new Set(places.map(p => p.city))], [places]);
  const query = params.get('q') || '';
  const rawCategory = params.get('category') || 'all';
  const category = categories.includes(rawCategory) ? rawCategory : 'all';
  const rawRegion = params.get('city') || (query ? 'all' : routePlace?.city || 'London');
  const region = cities.includes(rawRegion) ? rawRegion : 'all';
  const cityLabel = (city: string) => city === 'all' ? 'Everywhere' : `${city}, ${places.find(p => p.city === city)?.country || ''}`;
  const [searchInput, setSearchInput] = useState(query || (region === 'all' ? '' : cityLabel(region)));
  const filtered = useMemo(() => filterPlaces(orderedPlaces, { query, category, region, origin, bounds, sort }), [orderedPlaces, query, category, region, origin, bounds, sort]);
  const selected = filtered.find(p => p.id === selectedId);
  const fitKey = JSON.stringify([query, category, region, origin]);
  const search = params.size ? '?' + params.toString() : '';
  const base = pathname === '/' ? '/' : '/places';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setSearchInput(query || (region === 'all' ? '' : cityLabel(region))); }, [query, region]);
  useEffect(() => {
    document.title = `${routePlace?.name || 'Your next good detour'} — hacker.living`;
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
    setPreviewId(undefined); setOrigin(null); setBounds(null);
    if (placeId) navigate(`/places?${next}`, { replace: true });
    else setParams(next, { replace: true });
  };

  const submitSearch = () => {
    const input = searchInput.trim();
    const matchedCity = cities.find(city => input.toLocaleLowerCase() === city.toLocaleLowerCase() || input.toLocaleLowerCase() === cityLabel(city).toLocaleLowerCase());
    changeFilters({ city: matchedCity || 'all', q: matchedCity || !input || input.toLocaleLowerCase() === 'everywhere' ? '' : input });
  };
  const reset = () => { setPreviewId(undefined); setOrigin(null); setBounds(null); navigate(`${base}?city=all`, { replace: true }); };
  const locate = () => {
    if (!navigator.geolocation) { notify('Location is unavailable. Search for your city instead.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (!mounted.current) return;
      const coordinates: Coordinates = [position.coords.latitude, position.coords.longitude];
      setLocating(false); setPreviewId(undefined); setOrigin(coordinates); setBounds(null);
      navigate(`${base}?city=all${category !== 'all' ? '&category=' + category : ''}`, { replace: true });
      if (!filterPlaces(places, { origin: coordinates, radius: 100, category }).length) map.current?.center(coordinates, 9);
    }, error => {
      if (!mounted.current) return;
      setLocating(false);
      notify(error.code === 1 ? 'Location access was declined. You can search for a city instead.' : 'Couldn’t find your location. Search for a city instead.');
    }, { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false });
  };

  return <>
    <section aria-label="Find a place" className="grid gap-5 py-6 sm:py-7 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-8">
      <div className="min-w-0"><h1 className="font-editorial text-[36px] font-normal leading-[1.12] tracking-[-.025em] sm:text-[43px] lg:text-[40px] xl:text-[46px]">Your next good detour.</h1><p className="mt-2 text-xs leading-relaxed text-muted sm:text-[13px]">Unusual places, recommended by people on Hacker News.</p></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:flex-nowrap">
        <form onSubmit={event => { event.preventDefault(); submitSearch(); }} className="contents sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:gap-2.5">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-[5px] sm:basis-auto border border-[#c8c5bb] px-3 py-3 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
            <Search aria-hidden="true" className="size-[17px] shrink-0 text-muted" strokeWidth={1.5}/>
            <label className="sr-only" htmlFor="place-search">Find a city, place, or interest</label>
            <input id="place-search" list="place-cities" className="h-5 w-full min-w-0 bg-transparent text-xs outline-none sm:text-[13px]" placeholder="City, place, or interest…" value={searchInput} onChange={event => setSearchInput(event.target.value)}/>
            {searchInput && <IconButton aria-label="Clear search" className="size-5" onClick={() => { setSearchInput(''); changeFilters({ city: 'all', q: '' }); }}><X className="size-3"/></IconButton>}
            <datalist id="place-cities">{cities.map(city => <option key={city} value={cityLabel(city)}/>)}<option value="Everywhere"/></datalist>
          </div>
          <button type="submit" className={cn(buttonClass,'min-h-[46px] shrink-0 rounded-[5px] px-3 sm:px-4')}>Search</button>
        </form>
        <button disabled={locating} onClick={locate} className={cn(secondaryClass,'min-h-[46px] shrink-0 rounded-[5px] border-[#c8c5bb] px-3 text-xs')}><LocateFixed className="size-4"/>{locating ? 'Locating…' : 'Near me'}</button>
      </div>
    </section>

    <section aria-label="Explore places">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-y border-rule py-3.5">
        <div role="group" aria-label="Place category" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">{['all', ...categories].map(c => <button key={c} aria-pressed={category === c} onClick={() => changeFilters({ category: c === 'all' ? '' : c })} className={cn(controlClass, 'shrink-0 whitespace-nowrap rounded-[5px] border border-[#c8c5bb] px-3 py-2 text-[11px] transition-colors hover:border-ink hover:text-ink xl:px-4', category === c && 'border-ink bg-ink font-medium text-white hover:text-white')}>{c === 'all' ? 'All places' : c}</button>)}</div>
        <div role="group" aria-label="View" className="flex overflow-hidden rounded-[5px] border border-[#c8c5bb]">{[{label:'Map', icon:MapIcon, active:!listOnly}, {label:'List', icon:List, active:listOnly}].map(({label,icon:Icon,active}) => <button key={label} aria-label={label === 'Map' ? 'Map and list' : 'List only'} aria-pressed={active} onClick={() => { if(label === 'List') { close(); setListOnly(true); } else setListOnly(false); }} className={cn(controlClass, 'flex items-center gap-2 px-3 py-2 text-[11px] first:border-r first:border-rule', active && 'bg-ink font-medium text-white')}><Icon className="size-4" strokeWidth={1.5}/>{label}</button>)}</div>
      </div>
      {placeId && !routePlace && <p role="status" className="bg-accent-soft px-4 py-3 text-xs">That place isn’t in this collection yet. Browse the recommendations below.</p>}
      {(origin || bounds || query) && <div className="flex items-center justify-between border-b border-rule py-2.5 text-[10px] text-muted">{origin ? 'Within 100 km of you' : bounds ? 'Searching the visible map' : `Results for “${query}”`}<button className={cn(controlClass, 'text-accent underline')} onClick={reset}>Clear filters ×</button></div>}
      <div className={cn('flex flex-col-reverse md:grid md:h-[max(600px,calc(100dvh-285px))] md:grid-cols-[minmax(300px,38%)_minmax(0,1fr)] lg:grid-cols-[minmax(350px,34%)_minmax(0,1fr)]', listOnly && 'md:block md:h-auto md:min-h-[450px]')}>
        <aside aria-label="Place recommendations" className="flex min-h-0 flex-col md:border-r md:border-rule">
          <div className="flex items-start justify-between gap-2 px-4 py-5 sm:px-5"><div><h2 aria-live="polite" className="text-base font-semibold leading-snug tracking-[-.2px]">{filtered.length} {filtered.length === 1 ? 'place' : 'places'}{origin ? ' near you' : region === 'all' ? ' to discover' : ` in ${region}`}</h2><p className="mt-1.5 text-[11px] text-muted">Select a place to explore.</p></div><label><span className="sr-only">Sort places</span><select value={sort} onChange={e => setSort(e.target.value)} className={cn(controlClass, 'max-w-[100px] rounded-[4px] border border-rule bg-transparent px-2 py-1.5 text-[10px]')}><option value="curated">Curated</option><option value="name">Name A–Z</option><option value="recent">Latest mention</option></select></label></div>
          <div className={cn('min-h-0 flex-1 overscroll-contain md:overflow-y-auto', listOnly && 'grid md:grid-cols-2 md:overflow-visible 2xl:grid-cols-3 [&>article]:border-r [&>article]:border-rule')}>{filtered.length ? filtered.map((p,index) => <PlaceCard number={index+1} key={p.id} place={p} selected={selected?.id === p.id} search={search} distance={origin ? distanceKm(origin,p.coordinates) : undefined}/>) : <div className="col-span-full mx-auto max-w-md px-6 py-14 text-center"><Search className="mx-auto mb-5 size-8 text-accent" strokeWidth={1.2}/><h2 className="font-editorial text-[33px] leading-none">Nothing here just yet.</h2><p className="mb-5 mt-4 text-xs leading-[1.8] text-muted">{origin ? 'This small collection has no places within 100 km of you yet. Explore the whole collection instead.' : 'Try another city, interest, or category. We’re starting small and adding thoughtfully.'}</p><button className={secondaryClass} onClick={reset}>Explore all places</button></div>}</div>
          <p className="flex items-center gap-2 border-t border-rule px-4 py-3 text-[10px] text-muted sm:px-5"><Info aria-hidden="true" className="size-3.5 shrink-0"/>Original discussions. Official links.</p>
        </aside>
        {!listOnly && <div className="relative isolate h-[400px] border-b border-rule bg-[#e6e8dd] md:h-auto md:min-h-0 md:border-b-0"><PlacesMap ref={map} places={filtered} selected={selected?.id} fitKey={fitKey} focusSelection={Boolean(placeId)} onSelect={id => navigate(`/places/${id}${search}`)}/><button onClick={() => setBounds(map.current?.bounds() || null)} className={cn(secondaryClass, 'absolute left-1/2 top-4 z-[500] min-h-8 -translate-x-1/2 gap-2 whitespace-nowrap rounded-[5px] border-[#c3c6b8] px-3 py-2 text-[10px] shadow-sm')}><Search className="size-3.5"/>Search this area</button><button onClick={reset} className={cn(secondaryClass, 'absolute right-3 top-[60px] z-[500] min-h-7 gap-1.5 px-2 py-1.5 text-[9px] shadow-sm')}><Globe2 className="size-3"/>Show all places</button>{selected && <PlaceDetail place={selected} onClose={close} autoFocus={Boolean(placeId)}/>}</div>}
      </div>
    </section>

  </>;
}
