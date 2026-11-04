import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import type { Bounds, Coordinates, Place } from '../types';
import { cn } from '../lib';

export type MapHandle = { fit: (places: Place[]) => void; bounds: () => Bounds | null; center: (coordinates: Coordinates, zoom?: number) => void };
type Props = { places: Place[]; selected?: string; onSelect: (id: string) => void; preview?: boolean; focusSelection?: boolean; fitKey?: string; className?: string };
const markerPaths = {
  Museums: '<path d="m3 8 9-5 9 5H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18M3 18h18"/>',
  Libraries: '<path d="M12 6v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  Engineering: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  Observatories: '<path d="m5 12 12-7 3 5-12 7-3-5ZM9 18l-4 4m7-6 3 6M15 3l2-1 5 8-2 1"/>',
  Computing: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4M10 10h4v4h-4z"/>',
  Science: '<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10"/>',
};

export const PlacesMap = forwardRef<MapHandle, Props>(function PlacesMap({places,selected,onSelect,preview=false,focusSelection=true,fitKey='',className}, ref) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onSelect);
  const [tileError,setTileError] = useState(false);
  callback.current = onSelect;
  const fit = (items: Place[]) => {
    const current = map.current; if(!current || !items.length) return;
    current.invalidateSize();
    if(items.length === 1) current.setView(items[0].coordinates,13,{animate:false});
    else current.fitBounds(L.latLngBounds(items.map(p => p.coordinates)), {padding:[35,35],maxZoom:13,animate:false});
  };
  useImperativeHandle(ref, () => ({fit,bounds: () => {const b=map.current?.getBounds();return b ? {north:b.getNorth(),south:b.getSouth(),west:b.getWest(),east:b.getEast()} : null;},center:(coordinates,zoom=12) => map.current?.setView(coordinates,zoom,{animate:false})}));
  useEffect(() => {
    if(!container.current) return;
    const current = L.map(container.current,{zoomControl:false,scrollWheelZoom:!preview,dragging:!preview,touchZoom:!preview,doubleClickZoom:!preview,boxZoom:!preview,keyboard:!preview}).setView([51.509,-.10],11);
    current.attributionControl.setPrefix(false);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:1,updateWhenIdle:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(current);
    let failures=0;tiles.on('tileerror',()=>{if(++failures>3)setTileError(true);});tiles.on('tileload',()=>setTileError(false));
    if(!preview)L.control.zoom({position:'bottomright'}).addTo(current);
    markerLayer.current=L.layerGroup().addTo(current);map.current=current;
    const resize=new ResizeObserver(()=>current.invalidateSize());resize.observe(container.current);
    return()=>{resize.disconnect();current.remove();map.current=null;markerLayer.current=null;};
  },[preview]);
  useEffect(()=>{
    const layer=markerLayer.current; if(!layer)return;layer.clearLayers();
    for(const p of places){
      const active=p.id===selected;
      const html=`<span class="${cn('grid size-8 -rotate-45 place-items-center rounded-[50%_50%_50%_0] border-2 border-white bg-accent text-white shadow-md',preview&&'size-6',active&&'scale-125 bg-ink ring-4 ring-accent/20')}"><svg class="${cn('size-4 rotate-45',preview&&'size-3')}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${markerPaths[p.category]}</svg></span>`;
      const tooltip=document.createElement('span');tooltip.textContent=p.name;
      L.marker(p.coordinates,{title:p.name,alt:p.name,riseOnHover:true,zIndexOffset:active?1000:0,icon:L.divIcon({className:'',html,iconSize:[32,40],iconAnchor:[16,36]})}).addTo(layer).bindTooltip(tooltip,{direction:'top',offset:[0,-32]}).on('click',()=>callback.current(p.id));
    }
  },[places,selected,preview]);
  useEffect(()=>{if(!preview)fit(places);},[fitKey,preview]);
  useEffect(()=>{
    const p=places.find(p=>p.id===selected);if(!p||!map.current||preview||!focusSelection)return;
    map.current.setView(p.coordinates,Math.max(12,map.current.getZoom()),{animate:false});
    if(window.innerWidth>900)map.current.panBy([140,0],{animate:false});
  },[selected,places,preview,focusSelection]);
  return <div className={cn('relative size-full min-h-0',className)}><div ref={container} role="region" aria-label={preview?'Map preview of recommended places in London':'Interactive map of recommended places'} className="isolate z-0 size-full bg-[#e6e8dd] [&_.leaflet-tile-pane]:saturate-[.35] [&_.leaflet-tile-pane]:brightness-[1.035] [&_.leaflet-tile-pane]:contrast-[.93] [&_.leaflet-control-attribution]:bg-paper/90! [&_.leaflet-control-attribution]:text-[8px]! [&_.leaflet-control-zoom]:mb-8! [&_.leaflet-control-zoom]:mr-3! [&_.leaflet-control-zoom_a]:bg-paper! [&_.leaflet-control-zoom_a]:text-ink! [&_.leaflet-tooltip]:font-sans [&_.leaflet-tooltip]:text-xs"/>{tileError&&<p role="status" className="absolute bottom-12 left-3 right-3 z-[500] rounded border border-rule bg-paper p-3 text-[10px] shadow">Map tiles are unavailable. All places and sources are still available in the list.</p>}</div>;
});
