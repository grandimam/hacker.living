import { useEffect, useRef } from 'react';
import { ArrowUpRight, Share2, X } from 'lucide-react';
import type { Place } from '../types';
import { useApp } from '../context';
import { buttonClass, cn, controlClass, formatDate } from '../lib';
import { ExternalLink, Eyebrow, IconButton, Photo } from './ui';

export function PlaceDetail({place,onClose,autoFocus=true}: {place: Place;onClose: () => void;autoFocus?: boolean}) {
  const {notify}=useApp();const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',handler);if(autoFocus)heading.current?.focus({preventScroll:true});return()=>window.removeEventListener('keydown',handler);},[place.id,onClose,autoFocus]);
  const share=async()=>{const url=`${location.origin}/places/${place.id}`;try{await navigator.clipboard.writeText(url);notify('Place link copied.');}catch{notify(`Share this address: ${url}`);}};
  return <aside aria-label={`About ${place.name}`} className="fixed inset-x-0 bottom-0 z-[1000] max-h-[83dvh] overflow-y-auto overscroll-contain rounded-t-xl border border-rule bg-paper shadow-[0_-5px_40px_#0003] md:absolute md:bottom-auto md:left-auto md:right-4 md:top-[70px] md:z-[600] md:max-h-[calc(100%-105px)] md:w-[calc(100%-32px)] md:rounded-lg md:shadow-[0_6px_25px_#30342026] lg:w-[300px] xl:w-[325px]">
    <div className="relative m-2 h-[190px] overflow-hidden rounded-[5px] bg-[#e9e8db] md:h-[165px]"><Photo place={place} eager/><IconButton onClick={onClose} aria-label="Close place details" className="absolute right-2 top-2 size-7 border-rule bg-paper shadow-sm"><X className="size-4"/></IconButton></div>
    <div className="px-5 pb-4 pt-2"><h2 ref={heading} tabIndex={-1} className="mb-3 font-editorial text-[31px] leading-none tracking-[-.5px] outline-none">{place.name}</h2><p className="text-xs leading-[1.65]">{place.description}</p>
      <section className="mb-4 mt-5"><Eyebrow className="text-[8px] text-ink">Before you go</Eyebrow><p className="mt-1.5 text-[11px] leading-[1.65] text-muted">{place.visitNote}</p></section>
      <a className={cn(buttonClass,'min-h-10 w-full justify-between px-3 text-xs')} href={place.officialUrl} target="_blank" rel="noopener noreferrer">Official website <ArrowUpRight aria-hidden="true" className="size-4"/></a>
      <div className="mt-3 flex items-center justify-between gap-2"><ExternalLink href={place.source.discussionUrl} className="text-[10px] font-normal">Read the HN discussion</ExternalLink><IconButton onClick={share} aria-label={`Copy link to ${place.name}`} className="size-7"><Share2 className="size-3.5"/></IconButton></div>
      <details className="mt-2 border-t border-rule pt-2 text-[10px]"><summary className="cursor-pointer text-muted hover:text-accent">Recommendation context</summary><p className="mt-2 leading-[1.7]">{place.reason}</p><ExternalLink href={place.source.url} className="mb-1 mt-2 text-[9px] font-normal">{place.source.author} · {formatDate(place.source.date)}</ExternalLink>{place.sources?.filter(s=>s.commentId!==place.source.commentId).map(s=><ExternalLink key={s.commentId} href={s.url} className="mb-2 block text-[9px]">Also recommended by {s.author}</ExternalLink>)}</details>
      <p className="mt-3 text-[8px] leading-[1.7] text-muted">Official link checked {formatDate(place.officialCheckedAt)}</p>{place.image&&<a href={place.image.sourceUrl} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'mt-1 inline-block text-[7px] text-muted underline')}>Photo: {place.image.author} · {place.image.license}</a>}
    </div>
  </aside>;
}
