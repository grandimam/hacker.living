import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { Place } from '../types';
import { cn, controlClass } from '../lib';
import { Photo, SaveButton } from './ui';
import { placeCategory, placeLocation, placeTeaser } from '../place-presentation';
export function PlaceCard({place,selected=false,distance,search=''}: {place: Place;selected?: boolean;distance?: number;search?: string}) {
  return <article className={cn('relative flex gap-4 border-b border-rule py-5 pr-4 transition-colors hover:bg-[#f0eee5] lg:gap-5',selected&&'bg-accent-soft shadow-[inset_3px_0_#e84b10]')}>
    <Link to={`/places/${place.id}${search}`} tabIndex={-1} aria-hidden="true" className="ml-3 h-[146px] w-[105px] shrink-0 overflow-hidden rounded-[4px] sm:ml-4 lg:h-[160px] lg:w-[125px] xl:h-[175px] xl:w-[150px]"><Photo place={place}/></Link>
    <div className="min-w-0 flex-1 pr-3"><h2 className="mb-2 pr-3 font-editorial text-[26px] leading-[1.02] tracking-[-.25px] xl:text-[29px]"><Link className={cn(controlClass,'hover:text-accent')} to={`/places/${place.id}${search}`}>{place.name}</Link></h2><p className="mb-2.5 font-mono text-[8px] uppercase leading-relaxed tracking-[.05em] text-muted">{placeCategory(place)} · {placeLocation(place)}</p><p className="text-[11px] leading-[1.6] xl:text-xs">{placeTeaser(place)}</p>
      {(selected||place.id==='crossness')&&place.source.quote?<div className="mt-3"><blockquote className="relative pl-4 font-[Georgia,serif] text-[11px] italic leading-[1.5]"><span aria-hidden="true" className="absolute -left-0.5 -top-1 text-[27px] not-italic text-accent">“</span>“{place.source.quote}”</blockquote><a className={cn(controlClass,'mt-1 inline-flex items-center gap-1 pl-4 font-mono text-[8px] hover:text-accent')} href={place.source.url} target="_blank" rel="noopener noreferrer">{place.source.author} on HN · {new Date(place.source.date).getUTCFullYear()}<ArrowUpRight aria-hidden="true" className="size-2.5"/></a></div>:<a className={cn(controlClass,'mt-3 inline-flex items-center gap-1 text-[10px] text-accent underline underline-offset-2 xl:text-[11px]')} href={place.source.url} target="_blank" rel="noopener noreferrer">Why HN recommends it <ArrowUpRight aria-hidden="true" className="size-3"/></a>}
      {distance!==undefined&&<p className="mt-2 text-[9px] text-muted">{Math.round(distance)} km away</p>}
    </div>
    <SaveButton place={place} className="absolute right-1 top-3.5 size-7 [&_svg]:size-4"/>
  </article>;
}
