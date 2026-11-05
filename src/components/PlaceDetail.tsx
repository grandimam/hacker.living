import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Place } from '../types';
import { formatDate } from '../lib';
import { ExternalLink, IconButton, Photo } from './ui';

export function PlaceDetail({place,onClose,autoFocus=true}: {place: Place;onClose: () => void;autoFocus?: boolean}) {
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',handler);if(autoFocus)heading.current?.focus({preventScroll:true});return()=>window.removeEventListener('keydown',handler);},[place.id,onClose,autoFocus]);
  return <aside aria-label={`About ${place.name}`} className="fixed inset-x-0 bottom-0 z-[1000] max-h-[75dvh] overflow-y-auto overscroll-contain rounded-t-xl border border-rule bg-paper shadow-[0_-5px_30px_#0002] md:absolute md:bottom-5 md:left-5 md:right-auto md:z-[600] md:max-h-[calc(100%-100px)] md:w-[min(350px,calc(100%-40px))] md:rounded-lg md:shadow-[0_3px_16px_#3034201a]">
    <IconButton onClick={onClose} aria-label="Close place details" className="absolute right-2.5 top-2.5 z-10 size-7 rounded-full bg-paper"><X className="size-4"/></IconButton>
    <div className="h-40 overflow-hidden"><Photo place={place}/></div>
    <div className="p-5">
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-[.08em] text-muted">Community recommendation{place.review.status!=='approved'&&' · research preview'}</p>
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold leading-[1.3] tracking-[-.3px] outline-none">{place.name}</h2>
      <p className="mt-1.5 text-[11px] text-muted">{place.city}, {place.country}</p>
      <p className="mt-3 text-xs leading-[1.8]">{place.reason}</p>
      {place.source.quote&&<blockquote className="mt-3 border-l-2 border-rule pl-3 text-xs leading-[1.8]">“{place.source.quote}”</blockquote>}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-rule pt-4">
        {place.officialUrl&&<ExternalLink href={place.officialUrl} className="text-[11px]">Official website</ExternalLink>}
        <ExternalLink href={place.source.url} className="text-[11px] font-normal">{place.source.author} on HN</ExternalLink>
      </div>
      <p className="mt-2 text-[9px] text-muted">HN comment · {formatDate(place.source.date)}</p>
      {place.image&&<p className="mt-3 text-[9px] leading-relaxed text-muted">Photo: {place.image.author} · <a href={place.image.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{place.image.license}</a></p>}
    </div>
  </aside>;
}
