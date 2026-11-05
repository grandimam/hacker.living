import { useEffect, useRef } from 'react';
import { ArrowUpRight, Share2, X } from 'lucide-react';
import type { Place } from '../types';
import { useApp } from '../context';
import { buttonClass, cn, controlClass, formatDate } from '../lib';
import { ExternalLink, IconButton } from './ui';

export function PlaceDetail({place,onClose,autoFocus=true}: {place: Place;onClose: () => void;autoFocus?: boolean}) {
  const {notify}=useApp();const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',handler);if(autoFocus)heading.current?.focus({preventScroll:true});return()=>window.removeEventListener('keydown',handler);},[place.id,onClose,autoFocus]);
  const share=async()=>{const url=`${location.origin}/places/${place.id}`;try{await navigator.clipboard.writeText(url);notify('Place link copied.');}catch{notify(`Share this address: ${url}`);}};
  return <aside aria-label={`About ${place.name}`} className="fixed inset-x-0 bottom-0 z-[1000] max-h-[70dvh] overflow-y-auto overscroll-contain rounded-t-xl border border-rule bg-paper p-5 shadow-[0_-5px_30px_#0002] md:absolute md:bottom-5 md:left-5 md:right-auto md:z-[600] md:max-h-[calc(100%-100px)] md:w-[min(350px,calc(100%-40px))] md:rounded-lg md:shadow-[0_3px_16px_#3034201a]">
    <IconButton onClick={onClose} aria-label="Close place details" className="absolute right-2.5 top-2.5 size-7"><X className="size-4"/></IconButton>
    <p className="mb-2 pr-7 text-[9px] font-semibold uppercase tracking-[.08em] text-muted">Selected place</p>
    <h2 ref={heading} tabIndex={-1} className="pr-3 text-lg font-semibold leading-[1.3] tracking-[-.3px] outline-none">{place.name}</h2>
    <p className="mt-2 text-xs leading-[1.7] text-muted">{place.description}</p>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
      <a className={cn(buttonClass,'min-h-9 px-3 py-2 text-[11px]')} href={place.officialUrl} target="_blank" rel="noopener noreferrer">Plan a visit <ArrowUpRight aria-hidden="true" className="size-3.5"/></a>
      <ExternalLink href={place.source.discussionUrl} className="gap-1 text-[10px] font-normal text-ink">Read the HN discussion</ExternalLink>
    </div>
    <details className="mt-4 border-t border-rule pt-3 text-[11px]">
      <summary className={cn(controlClass,'cursor-pointer text-muted hover:text-accent')}>Before you go &amp; recommendation context</summary>
      <p className="mt-3 leading-[1.7]">{place.visitNote}</p>
      <p className="mt-3 leading-[1.7] text-muted">{place.reason}</p>
      {place.source.quote && <blockquote className="mt-3 border-l-2 border-rule pl-3 leading-[1.7]">“{place.source.quote}”</blockquote>}
      <ExternalLink href={place.source.url} className="mb-1 mt-2 text-[10px] font-normal">{place.source.author} · {formatDate(place.source.date)}</ExternalLink>
      {place.sources?.filter(s=>s.commentId!==place.source.commentId).map(s=><ExternalLink key={s.commentId} href={s.url} className="mt-2 block text-[10px] font-normal">Also recommended by {s.author}</ExternalLink>)}
      <button onClick={share} className={cn(controlClass,'mt-3 flex items-center gap-1.5 text-[10px] text-muted hover:text-accent')}><Share2 aria-hidden="true" className="size-3"/>Copy place link</button>
    </details>
    <p className="mt-3 text-[9px] leading-relaxed text-muted">Official link checked {formatDate(place.officialCheckedAt)}</p>
  </aside>;
}
