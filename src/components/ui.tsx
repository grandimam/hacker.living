import { useState, type ComponentProps, type ReactNode } from 'react';
import { ArrowUpRight, Bookmark, BookOpen, Building2, Cog, Cpu, FlaskConical, Telescope } from 'lucide-react';
import type { Category, Place } from '../types';
import { cn, controlClass, textLinkClass } from '../lib';
import { useApp } from '../context';

export const categoryIcons = { Museums: Building2, Libraries: BookOpen, Engineering: Cog, Observatories: Telescope, Computing: Cpu, Science: FlaskConical };
export function CategoryIcon({category,className}: {category: Category; className?: string}) { const Icon = categoryIcons[category]; return <Icon aria-hidden="true" className={cn('size-4 shrink-0',className)} strokeWidth={1.5}/>; }
export function Eyebrow({children,className}: {children: ReactNode; className?: string}) { return <p className={cn('font-mono text-[10px] font-medium uppercase leading-relaxed tracking-[.11em] text-accent', className)}>{children}</p>; }
export function IconButton({className,...props}: ComponentProps<'button'>) { return <button type="button" className={cn(controlClass,'inline-flex size-9 shrink-0 items-center justify-center rounded-[3px] border border-transparent transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50',className)} {...props}/>; }
export function SaveButton({place,className}: {place: Place; className?: string}) {
  const {saved,toggleSaved} = useApp(); const active = saved.has(place.id);
  return <IconButton onClick={() => toggleSaved(place.id)} aria-label={`${active ? 'Unsave' : 'Save'} ${place.name}`} aria-pressed={active} className={cn(active && 'text-accent',className)}><Bookmark className={cn('size-4',active && 'fill-accent/15')} strokeWidth={1.5}/></IconButton>;
}
export function Photo({place,className,eager=false}: {place: Place; className?: string; eager?: boolean}) {
  const [failed,setFailed] = useState(false);
  return place.image && !failed ? <img className={cn('size-full object-cover',className)} src={place.image.path} alt={place.image.alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)}/> : <div className={cn('flex size-full flex-col items-center justify-center gap-3 bg-[#e9e8db] text-[#7b856c]',className)}><CategoryIcon category={place.category} className="size-9"/><span className="font-mono text-[8px] uppercase tracking-wider">{place.city}</span></div>;
}
export function ExternalLink({children,className,...props}: ComponentProps<'a'>) { return <a target="_blank" rel="noopener noreferrer" className={cn(textLinkClass,className)} {...props}>{children}<ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0"/></a>; }
export function LiveDot() { return <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-sage"/>; }
