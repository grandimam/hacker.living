import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import type {Place} from './types';
import type {DiscoveryPage as CatalogPage} from '../shared/catalog';
const storageKey='hacker.living.saved.v1';
function readSaved(raw:string|null){try{const value:unknown=JSON.parse(raw??'[]');return new Set<string>(Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)):[]);}catch{return new Set<string>();}}
async function requestPage(query:URLSearchParams,signal?:AbortSignal):Promise<CatalogPage>{const response=await fetch(`/api/discoveries?${query}`,{signal});if(!response.ok)throw new Error('The catalog database couldn’t load. Check that the local database is running.');return response.json() as Promise<CatalogPage>;}
type AppState={unlocated:import('../shared/recommendations').Recommendation[];places:Place[];total:number;cities:string[];categories:string[];hasMore:boolean;loadMore:()=>void;refreshing:boolean;saved:Set<string>;toggleSaved:(id:string)=>void;notify:(message:string)=>void;loading:boolean;error:string|null};
const AppContext=createContext<AppState|null>(null);
export function AppProvider({children}:{children:ReactNode}){
 const {pathname,search}=useLocation();
 const [unlocated,setUnlocated]=useState<import('../shared/recommendations').Recommendation[]>([]);
 const [places,setPlaces]=useState<Place[]>([]),[total,setTotal]=useState(0),[cities,setCities]=useState<string[]>([]),[categories,setCategories]=useState<string[]>([]);
 const [saved,setSaved]=useState(()=>{try{return readSaved(localStorage.getItem(storageKey));}catch{return new Set<string>();}});
 const [refreshVersion,setRefreshVersion]=useState(0);
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState(''),[nextOffset,setNextOffset]=useState(0);
 const queryRef=useRef(new URLSearchParams()),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const notify=useCallback((value:string)=>{setMessage(value);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),3500);},[]);
 const savedKey=pathname==='/saved'?[...saved].sort().join(','):'';
 useEffect(()=>{
  const version=++generation.current,abort=new AbortController();
  if(pathname==='/about'||pathname.startsWith('/fonts')||pathname.startsWith('/pipeline'))return()=>abort.abort();
  setRefreshing(true);setError(null);
  const input=new URLSearchParams(search),query=new URLSearchParams({limit:'100'});
  for(const key of ['q','city','category','bounds','lat','lon','radiusKm','sort'])if(input.has(key))query.set(key,input.get(key)!);
  if(pathname==='/saved'){for(const key of [...query.keys()])query.delete(key);query.set('limit','200');query.set('ids',savedKey);}
  queryRef.current=query;
  const slug=pathname.startsWith('/places/')?pathname.split('/')[2]:null;
  async function load(){
   try{
    const page=await requestPage(query,abort.signal);
    if(slug&&!page.places.some(p=>p.id===slug)){
     const response=await fetch(`/api/discoveries/${encodeURIComponent(slug)}`,{signal:abort.signal});
     if(response.ok)page.places.push(await response.json() as Place);
    }
    if(abort.signal.aborted||generation.current!==version)return;
    setUnlocated(page.unlocated);setPlaces(page.places);setTotal(page.total);setCities(page.facets.cities);setCategories(page.facets.categories);setNextOffset(Math.min(page.offset+page.limit,page.total));
   }catch(error){if(!abort.signal.aborted&&generation.current===version)setError(error instanceof Error?error.message:'Unable to load catalog');}
   finally{if(!abort.signal.aborted&&generation.current===version){setLoading(false);setRefreshing(false);}}
  }
  void load();return()=>abort.abort();
 },[pathname,search,savedKey,refreshVersion]);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setRefreshVersion(v=>v+1);},30000);const resume=()=>{if(document.visibilityState==='visible')setRefreshVersion(v=>v+1);};document.addEventListener('visibilitychange',resume);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};},[]);
 const loadMore=()=>{
  if(refreshing||nextOffset>=total)return;
  const version=generation.current,query=new URLSearchParams(queryRef.current);query.set('offset',String(nextOffset));setRefreshing(true);
  void requestPage(query).then(page=>{if(generation.current!==version)return;setPlaces(previous=>[...new Map([...previous,...page.places].map(p=>[p.id,p])).values()]);setNextOffset(page.offset+page.places.length);}).catch(()=>notify('Couldn’t load more places. Try again.')).finally(()=>{if(generation.current===version)setRefreshing(false);});
 };
 useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===storageKey)setSaved(readSaved(event.newValue));};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const toggleSaved=(id:string)=>{const next=new Set(saved);if(next.has(id))next.delete(id);else next.add(id);setSaved(next);try{localStorage.setItem(storageKey,JSON.stringify([...next]));notify(next.has(id)?'Place saved.':'Removed from your saved places.');}catch{notify('Saved for this visit. Browser storage is unavailable.');}};
 return <AppContext.Provider value={{unlocated,places,total,cities,categories,hasMore:nextOffset<total,loadMore,refreshing,saved,toggleSaved,notify,loading,error}}>{children}<div role="status" aria-live="polite" className={`pointer-events-none fixed bottom-7 left-1/2 z-[2000] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded bg-ink px-5 py-3 text-center text-xs text-paper shadow-xl transition-all motion-reduce:transition-none ${message?'translate-y-0 opacity-100':'translate-y-3 opacity-0'}`}>{message}</div></AppContext.Provider>;
}
export function useApp(){const context=useContext(AppContext);if(!context)throw new Error('AppProvider is required');return context;}
