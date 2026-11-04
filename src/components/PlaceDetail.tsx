import { useEffect, useRef } from 'react';
import { ArrowUpRight, Check, MapPin, Share2, X } from 'lucide-react';
import type { Place } from '../types';
import { useApp } from '../context';
import { buttonClass, cn, controlClass, formatDate } from '../lib';
import { CategoryIcon, ExternalLink, Eyebrow, IconButton, Photo, SaveButton } from './ui';

export function PlaceDetail({place,onClose}: {place: Place;onClose: () => void}) {
  const {notify}=useApp();const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',handler);heading.current?.focus({preventScroll:true});return()=>window.removeEventListener('keydown',handler);},[place.id,onClose]);
  const share=async()=>{const url=`${location.origin}/places/${place.id}`;try{await navigator.clipboard.writeText(url);notify('Place link copied.');}catch{notify(`Share this address: ${url}`);}};
  return <aside aria-label={`About ${place.name}`} className="fixed inset-x-0 bottom-0 z-[1000] max-h-[83dvh] overflow-y-auto overscroll-contain rounded-t-xl border border-rule bg-paper shadow-[0_-5px_40px_#0003] md:absolute md:bottom-12 md:left-auto md:right-3 md:top-[65px] md:z-[600] md:max-h-none md:w-[calc(100%-24px)] md:rounded-[5px] md:shadow-[0_6px_25px_#30342026] lg:w-[310px] xl:w-[330px]">
    <div className="relative h-[185px] bg-[#e9e8db] md:h-[145px]"><Photo place={place} eager/><IconButton onClick={onClose} aria-label="Close place details" className="absolute right-2.5 top-2.5 size-8 border-rule bg-paper shadow-sm"><X className="size-4"/></IconButton></div>
    <div className="p-5 md:p-[18px]"><div className="flex items-center gap-1.5 font-mono text-[8px] text-accent"><CategoryIcon category={place.category} className="size-3"/>{place.category}<span className="text-muted">· {place.city}</span></div><h2 ref={heading} tabIndex={-1} className="my-3 font-editorial text-[39px] leading-[.99] tracking-[-.7px] outline-none md:text-[35px]">{place.name}</h2><p className="text-xs leading-[1.7] text-muted md:text-[11px]">{place.description}</p>
      <section className="mt-4 border-t border-rule pt-3.5"><Eyebrow className="text-[8px]">Why it made the map</Eyebrow><p className="mt-2 text-xs leading-[1.75] md:text-[11px]">{place.reason}</p>{place.source.quote&&<blockquote className="my-3 border-l-2 border-accent pl-3 font-editorial text-[23px] italic leading-[1.2] md:text-[20px]">“{place.source.quote}”</blockquote>}<a className={cn(controlClass,'mt-3 flex flex-wrap items-center gap-1 font-mono text-[8px] text-accent')} href={place.source.url} target="_blank" rel="noopener noreferrer">{place.source.author} on HN <span className="text-muted">· {formatDate(place.source.date)}</span><ArrowUpRight aria-hidden="true" className="size-2.5"/></a></section>
      <p className="my-4 flex gap-1.5 text-[10px] leading-[1.7] text-muted"><MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0"/>{place.visitNote}</p><ExternalLink href={place.source.discussionUrl} className="flex justify-between border-t border-rule py-3 text-[10px] font-normal">Read the original discussion</ExternalLink>
      {place.sources&&place.sources.filter(s=>s.commentId!==place.source.commentId).map(s=><ExternalLink key={s.commentId} href={s.url} className="mb-2 text-[9px]">Also recommended by {s.author}</ExternalLink>)}
      <div className="mt-1 flex items-center gap-1.5"><a className={cn(buttonClass,'min-h-10 flex-1 px-2 text-[10px]')} href={place.officialUrl} target="_blank" rel="noopener noreferrer">Official website <ArrowUpRight aria-hidden="true" className="size-3.5"/></a><SaveButton place={place} className="h-10 w-8 border-rule"/><IconButton onClick={share} aria-label={`Copy link to ${place.name}`} className="h-10 w-8 border-rule"><Share2 className="size-3.5"/></IconButton></div>
      <p className="mt-3 text-[8px] leading-[1.8] text-sage"><Check aria-hidden="true" className="mr-1 inline size-3"/>Official link checked {formatDate(place.officialCheckedAt)}<br/><span className="pl-4 text-muted">Check current access before travelling.</span></p>{place.image&&<a href={place.image.sourceUrl} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'mt-3 inline-block text-[7px] text-muted underline')}>Photo: {place.image.author} · {place.image.license}</a>}
    </div>
  </aside>;
}
