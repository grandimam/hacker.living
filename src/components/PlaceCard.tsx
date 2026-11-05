import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Place } from '../types';
import { cn, controlClass } from '../lib';
import { Photo, SaveButton } from './ui';
import { placeCategory, placeLocation, placeTeaser } from '../place-presentation';

export function PlaceCard({place,selected=false,distance,search='',number}: {place: Place;selected?: boolean;distance?: number;search?: string;number?: number}) {
  const neighborhood = placeLocation(place);
  const location = neighborhood === place.city ? place.city : `${neighborhood}, ${place.city}`;
  return <article className={cn('relative border-b border-rule px-4 py-5 transition-colors hover:bg-[#f0eee5] sm:px-5', selected && 'bg-accent-soft/70 shadow-[inset_3px_0_#e84b10]')}>
    <Link to={`/places/${place.id}${search}`} aria-label={`Explore ${place.name}`} aria-current={selected ? 'true' : undefined} className={cn(controlClass, 'absolute inset-0 z-0 rounded-sm focus-visible:outline-offset-[-3px]')}/>
    <div className="pointer-events-none relative flex gap-4">
      <div className="h-[122px] w-[96px] shrink-0 overflow-hidden rounded-[4px] sm:w-[108px]"><Photo place={place}/></div>
      <div className="min-w-0 flex-1 pr-5">
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.06em] text-muted">{number !== undefined && <span className="font-mono text-xs tracking-normal text-ink">{number}</span>}<span>{placeCategory(place)}</span></div>
        <h2 className="text-[15px] font-semibold leading-[1.35] tracking-[-.25px] sm:text-base">{place.name}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{location}{distance !== undefined && ` · ${Math.round(distance)} km away`}</p>
        <p className="mt-2 text-xs leading-[1.65]">{placeTeaser(place)}</p>
        <div className="mt-2 flex items-center justify-between gap-1">
          <a href={place.source.url} target="_blank" rel="noopener noreferrer" className={cn(controlClass,'pointer-events-auto relative z-10 inline-flex items-center gap-1 text-[10px] leading-relaxed text-muted hover:text-accent sm:text-[11px]')}>Recommended on Hacker News <ArrowUpRight aria-hidden="true" className="size-3 shrink-0"/></a>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted"/>
        </div>
      </div>
    </div>
    <SaveButton place={place} className="absolute right-2 top-4 z-10 size-7 [&_svg]:size-4"/>
  </article>;
}
