import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Place } from './types';
import { parseSaved } from '../shared/domain.ts';
const storageKey = 'hacker.living.saved.v1';
type AppState = { places: Place[]; saved: Set<string>; toggleSaved: (id: string) => void; notify: (message: string) => void; loading: boolean; error: string | null };
const AppContext = createContext<AppState | null>(null);
export function AppProvider({children}: {children: ReactNode}) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [saved, setSaved] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((value: string) => { setMessage(value); if(timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMessage(''), 3500); }, []);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/places.json', {signal: abort.signal}).then(response => { if(!response.ok) throw new Error('Unable to load places'); return response.json(); }).then((data: {places: Place[]}) => {
      setPlaces(data.places); let raw = null; try { raw = localStorage.getItem(storageKey); } catch { /* Browsing also works without storage. */ }
      setSaved(parseSaved(raw, new Set(data.places.map(p => p.id)))); setLoading(false);
    }).catch(error => { if (error.name !== 'AbortError') { setError('The collection couldn’t load. Please refresh to try again.'); setLoading(false); } });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if(event.key === storageKey) setSaved(parseSaved(event.newValue, new Set(places.map(p => p.id)))); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [places]);
  useEffect(() => () => { if(timer.current) clearTimeout(timer.current); }, []);
  const toggleSaved = (id: string) => {
    const next = new Set(saved); if(next.has(id)) next.delete(id); else next.add(id);
    setSaved(next);
    try { localStorage.setItem(storageKey, JSON.stringify([...next])); notify(next.has(id) ? 'Saved for your next detour.' : 'Removed from your saved places.'); }
    catch { notify('Saved for this visit. Browser storage is unavailable.'); }
  };
  return <AppContext.Provider value={{places,saved,toggleSaved,notify,loading,error}}>{children}<div role="status" aria-live="polite" className={`pointer-events-none fixed bottom-7 left-1/2 z-[2000] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded bg-ink px-5 py-3 text-center text-xs text-paper shadow-xl transition-all motion-reduce:transition-none ${message ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>{message}</div></AppContext.Provider>;
}
export function useApp() { const context = useContext(AppContext); if(!context) throw new Error('AppProvider is required'); return context; }
