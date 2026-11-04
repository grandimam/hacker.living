import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { Place } from '../types';
import { cn, controlClass } from '../lib';
import { Photo, SaveButton } from './ui';
export function PlaceCard({place,selected=false,distance,search=''}: {place: Place;selected?: boolean;distance?: number;search?: string}) {
  return <article className={cn('relative flex gap-3 border-b border-rule px-3.5 py-[19px] transition-colors hover:bg-[#f0eee5] sm:gap-3.5 lg:px-4',selected&&'bg-accent-soft shadow-[inset_3px_0_#e84b10]')}>
    <Link to={`/places/${place.id}${search}`} tabIndex={-1} aria-hidden="true" className="h-[102px] w-[88px] shrink-0 overflow-hidden rounded-[3px] lg:w-[80px]"><Photo place={place}/></Link>
    <div className="min-w-0 flex-1 pr-3"><p className="font-mono text-[8px] leading-relaxed text-accent">{place.category} <span className="text-muted">· {place.city}</span></p><h2 className="mb-2 mt-1.5 font-editorial text-[25px] leading-[1.02] tracking-[-.3px] lg:text-[24px]"><Link className={cn(controlClass,'hover:text-accent')} to={`/places/${place.id}${search}`}>{place.name}</Link></h2><p className="text-[10px] leading-[1.7] text-muted">{place.description}</p><div className="mt-2.5 flex flex-wrap items-center gap-2 text-[8px]"><a className={cn(controlClass,'inline-flex items-center gap-1 text-accent hover:underline')} href={place.source.url} target="_blank" rel="noopener noreferrer">HN recommendation <ArrowUpRight aria-hidden="true" className="size-2.5"/></a>{distance!==undefined&&<span className="text-muted">{Math.round(distance)} km away</span>}</div></div>
    <SaveButton place={place} className="absolute right-1.5 top-3 size-7 [&_svg]:size-3.5"/>
  </article>;
}
