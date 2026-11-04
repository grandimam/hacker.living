import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Asterisk, Globe2, List, LocateFixed, Map as MapIcon, Search, X } from 'lucide-react';
import { useApp } from '../context';
import type { Bounds, Coordinates } from '../types';
import { distanceKm, filterPlaces } from '../../shared/domain.mjs';
import { cn, controlClass, buttonClass, secondaryClass, textLinkClass } from '../lib';
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
    <section className="flex flex-col justify-between gap-6 py-7 lg:flex-row lg:items-center lg:gap-9 lg:py-8">
      <div className="shrink-0"><h1 className="font-editorial text-[42px] leading-none tracking-[-1.1px] sm:text-[49px] xl:text-[54px]">Your next good detour.</h1><p className="mt-3 text-xs leading-relaxed text-muted xl:text-sm">Unusual places worth visiting, found in Hacker News discussions.</p></div>
      <div className="flex w-full items-center gap-3 lg:max-w-[610px]">
        <form onSubmit={event => { event.preventDefault(); submitSearch(); }} className="flex min-w-0 flex-1 items-center gap-2 rounded border border-[#b9b7ad] px-3 py-2.5 focus-within:border-accent sm:px-4">
          <button type="submit" aria-label="Search location or place" className={cn(controlClass, 'shrink-0 text-muted hover:text-accent')}><Search className="size-[18px]" strokeWidth={1.5}/></button>
          <label className="sr-only" htmlFor="place-search">Find a city, place, or interest</label>
          <input id="place-search" list="place-cities" className="h-5 w-full min-w-0 bg-transparent text-xs outline-none sm:text-[13px]" placeholder="Find a city, place, or interest…" value={searchInput} onChange={event => setSearchInput(event.target.value)}/>
          {searchInput && <IconButton aria-label="Clear search" className="size-5" onClick={() => { setSearchInput(''); changeFilters({ city: 'all', q: '' }); }}><X className="size-3"/></IconButton>}
          <datalist id="place-cities">{cities.map(city => <option key={city} value={cityLabel(city)}/>)}<option value="Everywhere"/></datalist>
        </form>
        <button disabled={locating} onClick={locate} className={cn(buttonClass, 'min-h-[43px] shrink-0 px-3 text-xs sm:px-4')}><LocateFixed className="size-4"/>{locating ? 'Locating…' : 'Near me'}</button>
      </div>
    </section>

    <section aria-label="Explore places">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-y border-rule py-3.5">
        <div role="group" aria-label="Place category" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">{['all', ...categories].map(c => <button key={c} aria-pressed={category === c} onClick={() => changeFilters({ category: c === 'all' ? '' : c })} className={cn(controlClass, 'shrink-0 whitespace-nowrap rounded-[4px] border border-[#b9b7ad] px-3 py-2 text-[11px] transition-colors hover:border-accent hover:text-accent xl:px-4', category === c && 'border-accent bg-accent font-medium text-white hover:text-white')}>{c === 'all' ? 'All places' : c}</button>)}</div>
        <div className="flex items-center gap-4 sm:gap-5">
          <p aria-live="polite" className="whitespace-nowrap text-[11px] text-muted lg:border-l lg:border-rule lg:pl-5">{filtered.length} {filtered.length === 1 ? 'place' : 'places'}{origin ? ' near you' : region === 'all' ? ' to discover' : ` in ${region}`}</p>
          <div role="group" aria-label="View" className="flex overflow-hidden rounded-[4px] border border-[#b9b7ad]">{[{label:'Map', icon:MapIcon, active:!listOnly}, {label:'List', icon:List, active:listOnly}].map(({label,icon:Icon,active}) => <button key={label} aria-label={label === 'Map' ? 'Map and list' : 'List only'} aria-pressed={active} onClick={() => { if(label === 'List') { close(); setListOnly(true); } else setListOnly(false); }} className={cn(controlClass, 'flex items-center gap-2 px-3 py-2 text-[11px] first:border-r first:border-rule', active && 'bg-accent-soft font-medium text-accent')}><Icon className="size-4" strokeWidth={1.5}/>{label}</button>)}</div>
        </div>
      </div>
      {placeId && !routePlace && <p role="status" className="bg-accent-soft px-4 py-3 text-xs">That place isn’t in this collection yet. Browse the recommendations below.</p>}
      {(origin || bounds || query) && <div className="flex items-center justify-between border-b border-rule py-2.5 text-[10px] text-muted">{origin ? 'Within 100 km of you' : bounds ? 'Searching the visible map' : `Results for “${query}”`}<button className={cn(controlClass, 'text-accent underline')} onClick={reset}>Clear filters ×</button></div>}
      <div className={cn('mt-4 flex flex-col-reverse gap-4 md:grid md:h-[min(800px,calc(100dvh-265px))] md:min-h-[605px] md:grid-cols-[minmax(0,42%)_minmax(0,1fr)] lg:grid-cols-[minmax(0,39%)_minmax(0,1fr)]', listOnly && 'md:block md:h-auto md:min-h-[450px]')}>
        <aside aria-label="Place recommendations" className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 pb-3 pr-2"><h2 className="font-editorial text-[22px] leading-none">A few places you might have missed</h2><label><span className="sr-only">Sort places</span><select value={sort} onChange={e => setSort(e.target.value)} className={cn(controlClass, 'max-w-24 bg-transparent text-[9px] text-muted')}><option value="curated">Curated</option><option value="name">Name A–Z</option><option value="recent">Latest mention</option></select></label></div>
          <div className={cn('min-h-0 flex-1 overscroll-contain md:overflow-y-auto', listOnly && 'grid md:grid-cols-2 md:overflow-visible 2xl:grid-cols-3 [&>article]:border-r [&>article]:border-rule')}>{filtered.length ? filtered.map(p => <PlaceCard key={p.id} place={p} selected={selected?.id === p.id} search={search} distance={origin ? distanceKm(origin,p.coordinates) : undefined}/>) : <div className="col-span-full mx-auto max-w-md px-6 py-14 text-center"><Search className="mx-auto mb-5 size-8 text-accent" strokeWidth={1.2}/><h2 className="font-editorial text-[33px] leading-none">Nothing here just yet.</h2><p className="mb-5 mt-4 text-xs leading-[1.8] text-muted">{origin ? 'This small collection has no places within 100 km of you yet. Explore the whole collection instead.' : 'Try another city, interest, or category. We’re starting small and adding thoughtfully.'}</p><button className={secondaryClass} onClick={reset}>Explore all places</button></div>}</div>
        </aside>
        {!listOnly && <div className="relative isolate h-[380px] overflow-visible rounded-[4px] border border-rule bg-[#e6e8dd] md:h-auto md:min-h-0"><PlacesMap ref={map} places={filtered} selected={selected?.id} fitKey={fitKey} focusSelection={Boolean(placeId)} onSelect={id => navigate(`/places/${id}${search}`)}/><button onClick={() => setBounds(map.current?.bounds() || null)} className={cn(secondaryClass, 'absolute right-3 top-3 z-[500] min-h-8 gap-2 border-[#c3c6b8] px-3 py-2 text-[10px] shadow-sm')}><Search className="size-3.5"/>Search this area</button><button onClick={reset} className={cn(secondaryClass, 'absolute bottom-7 left-3 z-[500] min-h-7 gap-1.5 px-2 py-1.5 text-[8px] shadow-sm')}><Globe2 className="size-3"/>Show all places</button>{selected && <PlaceDetail place={selected} onClose={close} autoFocus={Boolean(placeId)}/>}</div>}
      </div>
    </section>
    <section className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-3 border-t border-rule py-4 text-[10px]"><Asterisk aria-hidden="true" className="size-5 text-accent"/><p>Real recommendations. Original discussions. Official links.</p><Link to="/about" className={cn(textLinkClass, 'ml-auto text-[10px] font-normal')}>How we curate <ArrowUpRight className="size-3"/></Link></section>
  </>;
}
